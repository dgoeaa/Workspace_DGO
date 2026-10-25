#!/usr/bin/env node
/**
 * Repository hygiene: the ECM-Platform-Folio content rules, enforced here.
 *
 * The folio (dgoeaa/ECM-Platform-Folio, 2026-09-30) was a cleaned copy of this repository with
 * a Python validator. Its rules now live here instead, so there is one source and one gate.
 * See docs/audits/folio-cleanup-2026-09-30/ for the clean-up it recorded.
 *
 * Rules, over tracked files only:
 *   1. No temporary or backup files (.bak .tmp .temp .old .orig ~).
 *   2. No runtime output under run-records/, response-samples/, endpoint-runs/, runtime-output/.
 *   3. No file over 1 MB unless listed in docs/governance/approved-large-files.json.
 *   4. No exact duplicates (same SHA-256, non-empty).
 *   5. The governance records exist: OWNERS.yaml, docs/governance/evidence-register.yaml.
 *
 * Rules 2 and 4 already have violations, recorded in tests/repo-hygiene-baseline.json. It is a
 * ratchet: a NEW violation fails, and a baseline entry that no longer occurs fails too, so the
 * baseline only shrinks. After removing violations, rewrite it with:
 *   node tests/repo-hygiene.test.mjs --write-baseline
 *
 * Run: node tests/repo-hygiene.test.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from '../scripts/lib/tracked-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const BASELINE = 'tests/repo-hygiene-baseline.json';
const LARGE_FILES = 'docs/governance/approved-large-files.json';
const LIMIT = 1024 * 1024;

const tracked = trackedFiles({ root: ROOT, what: 'files to check repository hygiene' });
const missing = tracked.filter(f => !existsSync(f));
const files = tracked.filter(f => existsSync(f));

const temporary = files.filter(f => /(\.bak|\.tmp|\.temp|\.old|\.orig|~)$/i.test(f));
const runtime = files.filter(f => /(^|\/)(run-records|response-samples|endpoint-runs|runtime-output)\//.test(f)).sort();

const byHash = new Map();
for (const f of files) {
  const data = readFileSync(f);
  if (!data.length) continue;
  const h = createHash('sha256').update(data).digest('hex');
  byHash.set(h, [...(byHash.get(h) || []), f]);
}
const duplicates = [...byHash.values()].filter(g => g.length > 1).map(g => g.sort().join(' | ')).sort();

if (process.argv.includes('--write-baseline')) {
  if (missing.length) throw new Error('Refusing to rewrite the baseline while tracked files are missing.');
  writeFileSync(BASELINE, JSON.stringify({ runtime, duplicates }, null, 2) + '\n');
  console.log(`Wrote ${BASELINE}: ${runtime.length} runtime files, ${duplicates.length} duplicate groups.`);
  process.exit(0);
}

let passed = 0, failed = 0;
const t = (label, problems) => {
  if (!problems.length) { passed++; console.log(`  ✅ ${label}`); return; }
  failed++;
  console.log(`  ❌ ${label}`);
  for (const p of problems) console.log(`       ${p}`);
};
const ratchet = (current, recorded, what) => [
  ...current.filter(x => !recorded.includes(x)).map(x => `new ${what}: ${x}`),
  ...recorded.filter(x => !current.includes(x)).map(x => `stale entry; review removal or recovery before editing ${BASELINE}: ${x}`),
];

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const approved = JSON.parse(readFileSync(LARGE_FILES, 'utf8')).approved_large_files.map(e => e.path);

console.log('Repository hygiene');
t('tracked files present on disk', missing);
t('no temporary or backup files', temporary);
t('no new runtime output in the tree', ratchet(runtime, baseline.runtime, 'runtime file'));
t('no new exact duplicates', ratchet(duplicates, baseline.duplicates, 'duplicate group'));
t(`files over 1 MB are listed in ${LARGE_FILES}`, [
  ...files.filter(f => statSync(f).size > LIMIT && !approved.includes(f)).map(f => `not approved: ${f}`),
  ...approved.filter(p => !files.includes(p)).map(p => `listed but not tracked: ${p}`),
]);
t('governance records present',
  ['OWNERS.yaml', 'docs/governance/evidence-register.yaml', LARGE_FILES]
    .filter(f => !tracked.includes(f) || !existsSync(f)).map(f => `missing or not tracked: ${f}`));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
