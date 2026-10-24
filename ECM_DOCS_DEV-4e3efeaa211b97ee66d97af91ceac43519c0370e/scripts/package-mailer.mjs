#!/usr/bin/env node
// Build the DGO Correspondence Mailer's self-contained deployment package.
//
//   node scripts/package-mailer.mjs            write releases/dgo-correspondence-mailer-<version>.zip
//   node scripts/package-mailer.mjs --check    exit 1 if the committed zip differs from a fresh build
//   node scripts/package-mailer.mjs --out DIR  also unpack the package into DIR
//
// WHAT "SELF-CONTAINED" MEANS HERE
//
// The zip depends on nothing in this repository. It carries the app (web/), the seven flow
// import packages, a static server, a mock of the flows and an integrity checker, all
// standard-library Node with no install step. The mock normally imports its limits from
// build-mailer-flows.mjs; the packaged copy has them written in, so it cannot drift from the
// flows it ships beside and needs no generator. tests/mailer.e2e.mjs runs its full journey
// against an unpacked copy of this zip to prove it.
//
// WHAT IT NEVER CONTAINS
//
// A config.local.js, or any other file holding a signed trigger URL. The package is built from
// mailer/ with config.local.js excluded by name, and the build refuses any file carrying a
// sig= signature.
//
// DETERMINISM
//
// --check compares bytes, so the build must not depend on the machine: text files are
// normalised to LF (and .cmd files to CRLF, which cmd.exe needs) whatever the checkout's line
// endings, files are ordered by path, and scripts/lib/zip-writer.mjs stamps one fixed time.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildZip } from './lib/zip-writer.mjs';
import { openZip } from './lib/zip-reader.mjs';
import { MAILER, LIST_SCHEMA, FLOWS } from './build-mailer-flows.mjs';
import { SEED_DIRECTORY } from '../mailer/js/seed-directory.js';
import { toCsv } from '../mailer/js/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAILER_DIR = path.join(ROOT, 'mailer');
const PKG_SRC = path.join(ROOT, 'scripts', 'mailer-package');
export const VERSION = fs.readFileSync(path.join(MAILER_DIR, 'VERSION'), 'utf8').trim();
export const NAME = 'dgo-correspondence-mailer';
export const ZIP_PATH = path.join(ROOT, 'releases', `${NAME}-${VERSION}.zip`);
const TOP = `${NAME}-${VERSION}`;

const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.md', '.json', '.csv', '.sh', '.cmd', '.txt', '']);
const EXCLUDE = new Set(['config.local.js', '.DS_Store', 'Thumbs.db']);
const SIGNATURE = /sig=[A-Za-z0-9_-]{20,}/;

/** Same columns, same order as the Directory screen's CSV export, so it imports as-is. */
const DIRECTORY_COLUMNS = ['key', 'institution', 'addressee', 'salutation', 'email', 'cc', 'website', 'verification', 'category', 'active', 'notes', 'sortOrder'];

function normalise(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT.has(ext)) return buf;
  let s = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (ext === '.cmd') s = s.replace(/\n/g, '\r\n');
  return Buffer.from(s, 'utf8');
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (EXCLUDE.has(d.name) || d.name.startsWith('.')) return [];
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? walk(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  });
}

function packagedMock() {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'mailer-mock-flows.mjs'), 'utf8').replace(/\r\n?/g, '\n');
  const line = "import { MAILER, LIST_SCHEMA } from './build-mailer-flows.mjs';";
  if (!src.includes(line)) throw new Error(`scripts/mailer-mock-flows.mjs no longer imports its limits with:\n  ${line}\nUpdate packagedMock() to match.`);
  const inline = [
    '// Written in by scripts/package-mailer.mjs from build-mailer-flows.mjs — the same values the',
    '// packaged flows carry in their Compose_Config, so the mock refuses what the flows refuse.',
    `const MAILER = ${JSON.stringify(MAILER, null, 2)};`,
    `const LIST_SCHEMA = ${JSON.stringify(LIST_SCHEMA.map((l) => ({ title: l.title, fields: l.fields.map((f) => ({ name: f.name })) })), null, 2)};`,
  ].join('\n');
  return Buffer.from(src.replace(line, inline), 'utf8');
}

/** Every file in the package, as { path inside the package: Buffer }, ordered by path. */
export function packageFiles() {
  const files = {};
  for (const rel of walk(MAILER_DIR)) {
    if (rel === 'VERSION') { files['web/VERSION'] = Buffer.from(`${VERSION}\n`); continue; } // the app reads it to stamp its exports
    files[`web/${rel}`] = fs.readFileSync(path.join(MAILER_DIR, rel));
    if (rel.startsWith('flows/')) files[rel] = files[`web/${rel}`];
  }
  files['tools/serve.mjs'] = fs.readFileSync(path.join(PKG_SRC, 'serve.mjs'));
  files['tools/verify-package.mjs'] = fs.readFileSync(path.join(PKG_SRC, 'verify-package.mjs'));
  files['tools/setup.mjs'] = fs.readFileSync(path.join(PKG_SRC, 'setup.mjs'));
  files['tools/bundle.mjs'] = fs.readFileSync(path.join(PKG_SRC, 'bundle.mjs'));
  files['tools/flow-package.mjs'] = fs.readFileSync(path.join(PKG_SRC, 'flow-package.mjs'));
  files['tools/zip-writer.mjs'] = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'zip-writer.mjs'));
  files['tools/mock-flows.mjs'] = packagedMock();
  for (const f of ['README.md', 'start.cmd', 'start.sh', 'start-demo.cmd', 'start-demo.sh', 'setup.cmd', 'setup.sh']) files[f] = fs.readFileSync(path.join(PKG_SRC, f));
  /* The go-live walkthrough is written as a page body (it is also published as a web page,
     which supplies its own document shell); here it gets one, so it opens straight from disk. */
  files['GO-LIVE.html'] = Buffer.from(`<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${fs.readFileSync(path.join(PKG_SRC, 'GO-LIVE.html'), 'utf8')}\n</body>\n</html>\n`, 'utf8');
  const rows = SEED_DIRECTORY.map((r) => ({ ...r, cc: (r.cc || []).join('; '), active: String(r.active !== false) }));
  files['data/directory.csv'] = Buffer.from(`${toCsv(rows, DIRECTORY_COLUMNS)}\n`, 'utf8');
  files.VERSION = Buffer.from(`${VERSION}\n`);

  const out = {};
  for (const rel of Object.keys(files).sort()) {
    const buf = normalise(rel, files[rel]);
    if (!rel.endsWith('.zip') && SIGNATURE.test(buf.toString('utf8'))) throw new Error(`${rel} carries a signed trigger URL — refusing to package it.`);
    out[rel] = buf;
  }

  const manifest = {
    name: 'DGO Correspondence Mailer',
    package: NAME,
    version: VERSION,
    contractVersion: MAILER.contractVersion,
    requires: 'Node.js 18+ only to run tools/ locally; the web/ folder is static and needs no runtime.',
    flows: FLOWS.map((f) => ({ name: f.name, endpointKey: f.key, package: `flows/packages/${f.name}.zip`, trigger: 'HTTP request', operations: f.operations })),
    sharePointLists: LIST_SCHEMA.map((l) => l.title),
    files: Object.entries(out).map(([p, b]) => ({ path: p, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') })),
  };
  out['PACKAGE_MANIFEST.json'] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return out;
}

const EXECUTABLE = new Set(['start.sh', 'start-demo.sh', 'setup.sh']);

/** The zip of the package; pass the files when they are already built. */
export function buildPackage(files = packageFiles()) {
  return buildZip(Object.keys(files).sort().map((rel) => ({ name: `${TOP}/${rel}`, data: files[rel], executable: EXECUTABLE.has(rel) })));
}

/** Unpack a built package into a directory (used by the e2e test and by --out). */
export function unpack(zipPath, dir) {
  for (const m of openZip(zipPath).members) {
    if (m.isDirectory) continue;
    const abs = path.join(dir, m.name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, m.read());
    if (/\.sh$/.test(m.name)) fs.chmodSync(abs, 0o755);
  }
  return path.join(dir, TOP);
}

function main() {
  const files = packageFiles();
  const zip = buildPackage(files);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(ZIP_PATH) ? fs.readFileSync(ZIP_PATH) : null;
    if (!current || !current.equals(zip)) {
      console.log(`  ❌ ${path.relative(ROOT, ZIP_PATH)} is stale — run: npm run mailer:package`);
      process.exit(1);
    }
    console.log(`  ✅ ${path.relative(ROOT, ZIP_PATH)} matches a fresh build (${(zip.length / 1024).toFixed(0)} KB)`);
    return;
  }
  fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true });
  fs.writeFileSync(ZIP_PATH, zip);
  console.log(`  wrote ${path.relative(ROOT, ZIP_PATH)} (${(zip.length / 1024).toFixed(0)} KB, ${Object.keys(files).length} files)`);
  const i = process.argv.indexOf('--out');
  if (i > 0) console.log(`  unpacked to ${unpack(ZIP_PATH, path.resolve(process.argv[i + 1]))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
