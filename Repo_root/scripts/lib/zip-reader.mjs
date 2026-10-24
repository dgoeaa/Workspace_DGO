/**
 * A minimal, dependency-free ZIP reader — enough to scan archive members for text.
 *
 * WHY THIS EXISTS
 *
 * `tests/check-secrets.mjs` scans inside tracked archives, because an archive is not opaque:
 * it is text in a container, and `ECM_DOCS_DEV.zip` was found to hold 31 distinct signatures
 * across 18 of its 837 members, nine of which appeared in no commit and no tracked text file.
 * Skipping archives meant no audit could have found them.
 *
 * It did that by shelling out to `unzip`, and refused to report green when `unzip` was absent —
 * correctly, because a control that cannot run must say so. But `unzip` is not on a Windows
 * PATH by default, so on the most common developer platform the ratchet reported all 13 tracked
 * archives unscannable, exited 1, and `npm run commission` raised it as a blocker worded
 * identically to a real credential leak. A security control that is permanently red on Windows
 * is not a control; it is noise that teaches people to ignore it.
 *
 * So the control now runs everywhere. ZIP is a simple enough format to read directly, and the
 * only decompression it needs — DEFLATE — is in Node's own `zlib`. No dependency is added.
 *
 * WHAT IT SUPPORTS, AND WHAT IT REFUSES
 *
 * Store (method 0) and deflate (method 8), which is every member of every archive this
 * repository tracks and effectively every member of any .docx, .xlsx, .pptx or .zip produced by
 * ordinary tooling. Anything else — an encrypted entry, an unusual compression method, a
 * truncated archive — is reported as unreadable rather than skipped, so the caller can still
 * refuse to report green. That distinction is the whole point of the original design and is
 * preserved exactly.
 *
 * ZIP64 is handled for the central-directory locator, so a large archive is read rather than
 * mis-parsed.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;         // end of central directory
const EOCD64_LOC_SIG = 0x07064b50;   // zip64 end of central directory locator
const EOCD64_SIG = 0x06064b50;       // zip64 end of central directory
const CEN_SIG = 0x02014b50;          // central directory file header
const LOC_SIG = 0x04034b50;          // local file header

/**
 * Find the end-of-central-directory record.
 *
 * It sits at the end of the file, after a comment of up to 65535 bytes, so it has to be found
 * by scanning backwards for its signature rather than read at a fixed offset.
 */
function findEocd(buf) {
  const max = Math.min(buf.length, 0xffff + 22);
  for (let i = buf.length - 22; i >= buf.length - max && i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * Read every member's name, offset and compression method from the central directory.
 *
 * The central directory is authoritative: local headers may carry zeroed sizes when a data
 * descriptor follows, so sizes are taken from here and never from the local header.
 */
function readCentralDirectory(buf) {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('not a zip archive: no end-of-central-directory record');

  let entries = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  /* ZIP64. When either field is saturated the real values live in the ZIP64 record, which the
     locator immediately before the EOCD points at. Reading the saturated values instead would
     walk the parse straight off the end of a large archive. */
  if (entries === 0xffff || cdOffset === 0xffffffff) {
    const locOffset = eocd - 20;
    if (locOffset >= 0 && buf.readUInt32LE(locOffset) === EOCD64_LOC_SIG) {
      const eocd64 = Number(buf.readBigUInt64LE(locOffset + 8));
      if (buf.readUInt32LE(eocd64) !== EOCD64_SIG) throw new Error('zip64 record missing');
      entries = Number(buf.readBigUInt64LE(eocd64 + 32));
      cdOffset = Number(buf.readBigUInt64LE(eocd64 + 48));
    }
  }

  const members = [];
  let p = cdOffset;
  for (let i = 0; i < entries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    members.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return members;
}

/** Decompress one member, located through its local header. */
function readMember(buf, member) {
  const p = member.localOffset;
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new Error(`bad local header for ${member.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + member.compressedSize);

  if (member.method === 0) return raw;                       // stored
  if (member.method === 8) return zlib.inflateRawSync(raw);  // deflate
  throw new Error(`unsupported compression method ${member.method} for ${member.name}`);
}

/**
 * List and read an archive's members.
 *
 * Returns `{ members }` where each member carries a `read()`. Throws for an archive that cannot
 * be parsed at all, so a caller that must not report green on an unreadable control can catch
 * and record it — which is exactly what check-secrets.mjs does.
 */
export function openZip(absPath) {
  const buf = fs.readFileSync(absPath);
  const members = readCentralDirectory(buf);
  return {
    members: members.map((m) => ({
      name: m.name,
      isDirectory: m.name.endsWith('/'),
      read: () => readMember(buf, m),
    })),
  };
}
