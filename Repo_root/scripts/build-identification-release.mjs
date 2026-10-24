#!/usr/bin/env node
/**
 * Cut a release of the identification packages (owner rule, 2026-10-06): the packages are frozen at the release, and
 * the operator pastes a release once. tests/identification-release.test.mjs fails when a package's fingerprint differs
 * from the release, so a rebuild that changes what a flow does cannot reach the operator unannounced: either the change
 * is reverted, or a new release is cut with its reason.
 *
 * A new release is cut only for a defect found in the tenant, or an owner decision that Flow Configuration cannot meet.
 * Changes waiting for a release are batched; one release, one paste session.
 *
 *   npm run idrelease -- --reason "why"       # freeze the current packages as the next release
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageFingerprint } from './lib/package-fingerprint.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REL = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json';
const DIRS = ['identification-phase3', 'identification-phase4'];
const i = process.argv.indexOf('--reason');
const reason = i > 0 ? process.argv[i + 1] : null;
if (!reason) { console.error('a release needs a reason: npm run idrelease -- --reason "…"'); process.exit(2); }

export const current = () => Object.fromEntries(DIRS.flatMap((d) => readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages', d))
  .filter((f) => f.endsWith('.paste.json')).sort()
  .map((f) => [`${d}/${f}`, packageFingerprint(JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages', d, f), 'utf8')))])));

const prev = existsSync(join(ROOT, REL)) ? JSON.parse(readFileSync(join(ROOT, REL), 'utf8')) : { release: 0, history: [] };
const packages = current();
const changed = Object.keys(packages).filter((f) => prev.packages?.[f] !== packages[f]);
const release = prev.release + 1;
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, REL), `${JSON.stringify({
  schema: 'dgo-identification-release/v1',
  rule: 'The identification packages are frozen at this release. A package whose fingerprint differs from it fails npm run test:idrelease. A new release is cut (npm run idrelease -- --reason "…") only for a defect found in the tenant or an owner decision that Flow Configuration cannot meet; changes wait and are released together.',
  release, date: today, reason, changed,
  packages,
  history: [...(prev.history || []), { release, date: today, reason, changed: changed.length }],
}, null, 2)}\n`);
/* A package the release no longer holds (the legacy library intake's, retired with release 31) has no paste to record:
   its paste-ledger entry goes with it, and the release says which went. What a released flow runs is untouched. */
const LEDGER = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json';
const held = new Set(Object.keys(packages).map((f) => f.split('/')[1]));
const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER), 'utf8'));
const dropped = ledger.entries.filter((e) => !held.has(e.file)).map((e) => e.file);
if (dropped.length) {
  writeFileSync(join(ROOT, LEDGER), `${JSON.stringify({ ...ledger, entries: ledger.entries.filter((e) => held.has(e.file)) }, null, 2)}\n`);
  const r = JSON.parse(readFileSync(join(ROOT, REL), 'utf8'));
  r.retired = dropped; r.history[r.history.length - 1].retired = dropped;
  writeFileSync(join(ROOT, REL), `${JSON.stringify(r, null, 2)}\n`);
}
console.log(`identification release ${release}: ${Object.keys(packages).length} packages frozen, ${changed.length} changed since release ${prev.release}${dropped.length ? `; paste-ledger entries of packages no longer released removed: ${dropped.join(', ')}` : ''}`);
