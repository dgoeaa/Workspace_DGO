// A deterministic ZIP writer, standard library only.
//
// WHY THIS EXISTS
//
// scripts/build-mailer-flows.mjs emits Power Automate import packages, and a package is a ZIP.
// Those packages are committed, and `--check` holds them byte-for-byte against what the
// generator would write now. A ZIP normally carries the wall-clock time of every member, so two
// builds of identical content differ and the check could never pass. Every member here is
// stamped with one fixed DOS timestamp and written in the order given, so the same input always
// produces the same bytes.
//
// It writes deflate (method 8) members with no data descriptor, no extra fields and no zip64 —
// the plain shape Power Automate's "Import package (legacy)" reads, and the shape
// scripts/lib/zip-reader.mjs parses.

import zlib from 'node:zlib';

/* 2026-01-01 00:00:00 in MS-DOS date/time format. Any fixed value works; this one is merely
   recognisable when an archive tool lists the members. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/**
 * Build a ZIP archive in memory.
 * @param {{name: string, data: string|Buffer, executable?: boolean}[]} entries  members, in archive order.
 *        `executable` records Unix mode 0755 so a shell script unpacks runnable; members without
 *        it are written exactly as before (no host OS, no attributes).
 * @returns {Buffer}
 */
export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data, executable = false } of entries) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(raw) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 names
    local.writeUInt16LE(8, 8);             // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(executable ? 0x0314 : 20, 4); // version made by (0x03xx = Unix, for the mode below)
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk
    central.writeUInt16LE(0, 36);          // internal attrs
    central.writeUInt32LE(executable ? ((0o100755 << 16) >>> 0) : 0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}
