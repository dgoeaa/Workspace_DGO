#!/usr/bin/env node
// Check this unpacked release against its own manifest. Node 18+, no dependencies.
//
//   node scripts/verify-release.mjs
//
// Every file listed in RELEASE_MANIFEST.json must be present with the recorded SHA-256, and no
// file outside the manifest may carry a signed trigger URL. The three endpoint configuration
// files are where an operator wires the platforms, so a difference there is reported, not failed.
// Exit 0 = intact. Exit 1 = something differs, named.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE = /sig=[A-Za-z0-9_%-]{20,}/;
const MANIFEST = 'RELEASE_MANIFEST.json';
/* sw.js too: wiring renames the Portal's cache after the new endpoint set (./folio wire). */
const WIRED = new Set(['runtime/config/config.local.js', 'document-portal/config.local.js', 'document-portal/sw.js', 'mailer/web/config.local.js']);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? walk(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  });
}

const manifest = JSON.parse(fs.readFileSync(path.join(TOP, MANIFEST), 'utf8'));
const listed = new Map(manifest.files.map((f) => [f.path, f]));
const problems = [];
const notes = [];

for (const [rel, f] of listed) {
  const abs = path.join(TOP, rel);
  if (!fs.existsSync(abs)) { problems.push(`missing    ${rel}`); continue; }
  if (crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex') !== f.sha256) {
    (WIRED.has(rel) ? notes : problems).push(`altered    ${rel}`);
  }
}
for (const rel of walk(TOP)) {
  if (rel === MANIFEST || listed.has(rel)) continue;
  if (WIRED.has(rel)) { notes.push(`added      ${rel}`); continue; }
  problems.push(`unlisted   ${rel}`);
  if (!rel.endsWith('.zip') && SIGNATURE.test(fs.readFileSync(path.join(TOP, rel), 'latin1'))) problems.push(`signature  ${rel}`);
}

console.log(`${manifest.name} ${manifest.version}: ${listed.size} files, ${manifest.platforms.length} platforms.`);
for (const n of notes) console.log(`  note  ${n} — expected once endpoints are wired`);
if (!problems.length) { console.log('  intact.'); process.exit(0); }
for (const p of problems) console.log(`  ✖  ${p}`);
process.exit(1);
