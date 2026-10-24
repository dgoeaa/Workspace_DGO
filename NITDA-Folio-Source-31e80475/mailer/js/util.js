// Small helpers shared by every view. No DOM access at import time, so the pure parts
// (escaping, ids, dates, CSV) are importable from Node for tests/mailer.test.mjs.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for HTML text or a quoted attribute. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** A short random id. crypto.randomUUID where available; the fallback is only for old engines. */
export function uid(prefix = '') {
  const c = globalThis.crypto;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${raw}` : raw;
}

/** A short id safe to embed in a messageId and an OData literal: [a-z0-9]. */
export const shortId = () => uid().replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase();

const ORD = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Nigerian official correspondence style: "25th September, 2026". */
export function letterDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const day = dt.getDate();
  return `${day}${ORD(day)} ${MONTHS[dt.getMonth()]}, ${dt.getFullYear()}`;
}

export const isoDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export const fmtDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Split an address list typed by a person: commas, semicolons, whitespace, newlines. */
export const splitAddresses = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[;,\s]+/))
  .map((s) => String(s).trim()).filter(Boolean);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(String(v ?? '').trim());

/**
 * Mirror of the send flow's allowlist, so a recipient the flow would refuse is caught before
 * anything is transmitted. The flow is the control; this is the courtesy.
 */
export function domainAllowed(address, { suffixes = [], domains = [] } = {}) {
  const at = String(address ?? '').trim().toLowerCase().split('@');
  if (at.length !== 2 || !at[1].includes('.')) return false;
  const domain = at[1];
  if (domains.map((d) => d.toLowerCase()).includes(domain)) return true;
  const labels = domain.split('.');
  const registrable = labels.slice(Math.max(0, labels.length - 2)).join('.');
  return suffixes.map((s) => s.toLowerCase()).includes(registrable);
}

/* ---------------- CSV ---------------- */

export function toCsv(rows, columns) {
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
    /* A cell starting = + - @ (or a tab or return) is a formula to Excel: shared directory text
       must never run as one. It is written with a leading apostrophe, which parseCsv removes. */
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const [head, ...body] = nonEmpty;
  /* toCsv writes a leading apostrophe before = + - @ so Excel shows the text; it is removed here. */
  const value = (v) => { const t = (v ?? '').trim(); return /^'[=+\-@\t\r]/.test(t) ? t.slice(1) : t; };
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), value(r[i])])));
}

/** Tokens of a filename or key, for matching a per-recipient attachment to its addressee. */
export const tokens = (s) => String(s ?? '').toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Does this filename name this recipient key? The key's tokens must appear consecutively in
 * the filename's tokens — so "NPF-NCCC_Letter.pdf" matches NPF-NCCC and not NPF-ICT, and
 * "Personnel.pdf" does not match SON.
 */
export function fileMatchesKey(fileName, key) {
  const f = tokens(fileName);
  const k = tokens(key);
  if (!k.length) return false;
  for (let i = 0; i + k.length <= f.length; i++) {
    if (k.every((t, j) => f[i + j] === t)) return true;
  }
  /* Also accept the key glued together: "NPFNCCC_letter.pdf". */
  const glued = k.join('');
  return k.length > 1 && f.includes(glued);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function download(name, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Read a File as base64 (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error || new Error(`Could not read ${file.name}`));
    r.onload = () => {
      const s = String(r.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.readAsDataURL(file);
  });
}

/** Characters of base64 → bytes of file. */
export const b64Bytes = (b64) => Math.floor((String(b64 || '').length * 3) / 4) - (String(b64 || '').endsWith('==') ? 2 : String(b64 || '').endsWith('=') ? 1 : 0);
