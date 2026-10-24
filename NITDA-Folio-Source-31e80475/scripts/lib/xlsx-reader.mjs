/**
 * Minimal .xlsx reader — enough of the format to extract a documentation workbook, and no more.
 *
 * WHY THIS EXISTS RATHER THAN A DEPENDENCY
 * `package.json` carries no runtime dependencies, and every generated reference in this tree is
 * rebuilt by `npm test` with `--check`. A workbook extraction that could only be reproduced by
 * installing a parser would be a transcription in practice: nobody would re-run it, and the
 * committed JSON would drift from its source with nothing to say so. An .xlsx is a ZIP of XML,
 * `node:zlib` inflates it, and the subset a documentation workbook uses is small.
 *
 * WHAT IT SUPPORTS
 *   Shared strings (plain and rich-text runs), inline strings, numbers, booleans, cached formula
 *   results, and error cells. Sheets come back in workbook order with cells as string, number,
 *   boolean or null.
 *
 * WHAT IT DOES NOT
 *   Dates are returned as the raw serial number, because deciding a styled number is a date needs
 *   the number-format table and guessing wrong silently corrupts a value. ZIP64 archives and
 *   stored-not-deflated entries throw rather than return something plausible. Callers that need
 *   either should say so at the point they need it.
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/* ------------------------------------------------------------------------ zip */

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;

/**
 * Every entry of a ZIP archive, by name, as a Buffer.
 *
 * The central directory is the authority on what the archive holds; the local header is read
 * only for its two length fields, because they are the ones that place the compressed bytes and
 * they are allowed to differ from the central copy.
 */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP archive: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  const cdirOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdirOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by this reader');
  }

  const entries = new Map();
  let p = cdirOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CDIR_SIG) throw new Error(`corrupt central directory at byte ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    if (method === 0) entries.set(name, Buffer.from(raw));
    else if (method === 8) entries.set(name, inflateRawSync(raw));
    else throw new Error(`unsupported compression method ${method} for ${name}`);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/* ------------------------------------------------------------------------ xml */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the five XML entities plus numeric character references. */
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return body in ENTITIES ? ENTITIES[body] : whole;
  });
}

/** The value of one attribute of an opening tag, or null. */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag)
    || new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`).exec(tag);
  return m ? decode(m[1]) : null;
}

/**
 * Concatenated text of every `<t>` element in a fragment — one per rich-text run.
 *
 * The empty-element alternative is tried FIRST and the general one forbids a trailing slash.
 * The other order looks equivalent and is not: `[^>]*` happily eats the `/` of `<t … />`, so the
 * empty element matches as an opening tag and the scan for `</t>` runs on into the next element,
 * stealing its text. See the same rule in `parseSheet`.
 */
function textOf(xml) {
  let out = '';
  const re = /<t(?:\s[^>]*?)?\/>|<t(?:\s[^>]*?)?>([\s\S]*?)<\/t>/g;
  for (let m; (m = re.exec(xml));) out += m[1] === undefined ? '' : decode(m[1]);
  return out;
}

/* ---------------------------------------------------------------- spreadsheet */

/** `BC` -> 55. Column letters are base-26 with no zero. */
function columnIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n;
}

function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si(?:\s[^>]*?)?\/>|<si(?:\s[^>]*?)?>([\s\S]*?)<\/si>/g;
  for (let m; (m = re.exec(xml));) out.push(m[1] === undefined ? '' : textOf(m[1]));
  return out;
}

/**
 * One worksheet as a dense array of rows.
 *
 * Rows and columns the sheet skips are materialised as nulls, so `rows[3][0]` is A4 whether or
 * not the file bothered to store it. Blank cells stay null rather than becoming empty strings:
 * a documentation workbook distinguishes "not applicable" from "", and flattening the two loses
 * the distinction irrecoverably.
 */
function parseSheet(xml, strings) {
  const dimension = attr(/<dimension\b[^>]*>/.exec(xml)?.[0] || '', 'ref');
  const rows = [];
  let maxColumn = 0;

  /* Empty-element form first, and the general form forbids the trailing slash.
     `<c\b([^>]*)>` matches `<c r="I37" s="5" />` as well — `[^>]*` eats the slash — and the scan
     for `</c>` then runs on into the following cell and returns ITS value for this one. That is
     how a blank cell came back holding the next column's number, silently and only on the rows
     that had one. Both element types below are written in this order for that reason. */
  const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
  for (let rm; (rm = rowRe.exec(xml));) {
    const rowAttrs = rm[1] === undefined ? rm[2] : rm[1];
    const body = rm[3] === undefined ? '' : rm[3];
    const rowNumber = Number(attr(`<row ${rowAttrs}>`, 'r') || rows.length + 1);
    const cells = [];

    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    for (let cm; (cm = cellRe.exec(body));) {
      const cellAttrs = cm[1] === undefined ? cm[2] : cm[1];
      const inner = cm[3] === undefined ? '' : cm[3];
      const tag = `<c ${cellAttrs}>`;
      const ref = attr(tag, 'r');
      const type = attr(tag, 't') || 'n';
      const at = ref ? columnIndex(ref) - 1 : cells.length;

      let value = null;
      if (type === 'inlineStr') {
        value = textOf(inner);
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        const raw = v ? decode(v[1]) : null;
        if (raw === null || raw === '') value = null;
        else if (type === 's') value = strings[Number(raw)] ?? null;
        else if (type === 'b') value = raw === '1';
        else if (type === 'str' || type === 'e') value = raw;
        else value = Number(raw);
      }

      while (cells.length < at) cells.push(null);
      cells[at] = value;
    }

    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
    if (cells.length > maxColumn) maxColumn = cells.length;
  }

  for (const r of rows) while (r.length < maxColumn) r.push(null);
  return { dimension, rows, maxRow: rows.length, maxColumn };
}

/**
 * Read a workbook from disk.
 *
 * @param {string} path absolute path to a .xlsx file
 * @returns {{sheetNames: string[], sheets: Record<string, {name: string, dimension: string|null,
 *            rows: Array<Array<string|number|boolean|null>>, maxRow: number, maxColumn: number}>}}
 */
export function readWorkbook(path) {
  const files = unzip(readFileSync(path));
  const get = (name) => (files.has(name) ? files.get(name).toString('utf8') : null);

  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new Error(`${path} has no xl/workbook.xml — not an .xlsx workbook`);

  /* r:id -> part name. Sheet order lives in workbook.xml; the path each sheet resolves to lives
     in the relationships part, and neither can be inferred from the other. */
  const rels = new Map();
  const relsXml = get('xl/_rels/workbook.xml.rels') || '';
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, ''));
  }

  const strings = sharedStrings(get('xl/sharedStrings.xml'));
  const sheetNames = [];
  const sheets = {};

  for (const m of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
    const part = rels.get(rid);
    const xml = part ? get(`xl/${part}`) : null;
    if (!name || !xml) continue;
    sheetNames.push(name);
    sheets[name] = { name, ...parseSheet(xml, strings) };
  }

  return { sheetNames, sheets };
}
