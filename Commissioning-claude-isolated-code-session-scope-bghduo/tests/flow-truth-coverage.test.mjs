#!/usr/bin/env node
/**
 * WHICH FLOW-TRUTH FINDINGS THE REBUILD ACTUALLY ANSWERS, PROVEN RATHER THAN CLAIMED.
 *
 * docs/deployment/OUTSTANDING_SOURCES.json has counted all 29 findings of the flow-truth review
 * open since 2026-09-14, for a stated reason: "tests/flow-truth-persistence.test.mjs names this
 * review — but that suite asserts no finding by id, so nothing establishes which." The suite has
 * 51 assertions and cited zero finding ids, so the estate held 29 items with no closure criterion
 * next to a passing suite that answered most of them.
 *
 * docs/audits/flow-truth-coverage.json now declares the mapping. A declaration is only worth
 * having if it cannot drift from either document it spans, so this checks both edges:
 *
 *   · every finding in the REVIEW appears in the declaration, so a finding cannot be dropped;
 *   · every assertion the declaration cites exists in the SUITE, so coverage cannot be claimed
 *     against an assertion that was renamed or deleted;
 *   · every uncovered finding says why and what would cover it, so "not covered" stays a
 *     position rather than a shrug.
 *
 * The review itself is never edited — it is a record, and docs/audits/ is exempt from every claim
 * gate in this estate for that reason. This spans it from outside.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nFlow-truth coverage — which findings the rebuild answers\n');

const cov = JSON.parse(read('docs/audits/flow-truth-coverage.json'));
const review = read(cov.review);
const suite = read(cov.suite);

/* ------------------------------------------------------------------ *
 * 1 · every finding in the review is declared
 * ------------------------------------------------------------------ */

/* The same pattern OUTSTANDING_SOURCES.json reads the review with, including its range head:
   `### C11–C12 · …` is two findings under one heading, and counting it once under-reports. */
const HEAD = /^###\s+([BSC]\d+(?:\s*[–—-]\s*[BSC]?\d+)?)\s+·\s+(.+)$/gm;
const reviewIds = [];
for (const m of review.matchAll(HEAD)) {
  const range = /^([A-Za-z]*)(\d+)\s*[–—-]\s*([A-Za-z]*)(\d+)$/.exec(m[1]);
  if (range && Number(range[4]) > Number(range[2])) {
    for (let n = Number(range[2]); n <= Number(range[4]); n++) reviewIds.push(`${range[1]}${n}`);
  } else reviewIds.push(m[1]);
}

const declared = cov.findings.map((f) => f.id);

{
  ok(reviewIds.length > 0, `the review parses (${reviewIds.length} findings)`);

  const missing = reviewIds.filter((id) => !declared.includes(id));
  ok(missing.length === 0, `every finding in the review is declared (${reviewIds.length})`,
    `undeclared: ${missing.join(', ')}`);

  const extra = declared.filter((id) => !reviewIds.includes(id));
  ok(extra.length === 0, 'the declaration invents no finding the review does not make', extra.join(', '));

  const dupes = declared.filter((id, i) => declared.indexOf(id) !== i);
  ok(dupes.length === 0, 'no finding is declared twice', dupes.join(', '));

  /* The count has to match what npm run outstanding counts, or two instruments disagree about
     the same document. */
  ok(reviewIds.length === 29,
    `the review still holds the 29 findings the rollup counts (${reviewIds.length})`);
}

/* ------------------------------------------------------------------ *
 * 2 · every cited assertion exists in the suite
 * ------------------------------------------------------------------ */

{
  const dangling = [];
  for (const f of cov.findings) {
    if (!f.covered) continue;
    for (const label of f.via || []) {
      /* Some assertion labels are built in a loop from a column name or a library name, so the
         declaration may cite a pattern the literal label is generated from. Either must be
         findable in the suite source — a citation that matches nothing is a claim about an
         assertion that is not there. */
      const needle = suite.includes(label) ? label : (f.viaPattern && suite.includes(f.viaPattern) ? f.viaPattern : null);
      if (!needle) dangling.push(`${f.id} → "${label}"`);
    }
  }
  ok(dangling.length === 0,
    'every assertion the declaration cites exists in the suite',
    dangling.slice(0, 5).join('; '));

  const uncited = cov.findings.filter((f) => f.covered && !(f.via || []).length);
  ok(uncited.length === 0, 'no finding is called covered without citing an assertion',
    uncited.map((f) => f.id).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3 · "not covered" is a position, not a shrug
 * ------------------------------------------------------------------ */

{
  const open = cov.findings.filter((f) => !f.covered);
  const thin = open.filter((f) => !f.why || f.why.length < 40 || !f.whatWouldCoverIt);
  ok(thin.length === 0,
    `every uncovered finding states why and what would cover it (${open.length} uncovered)`,
    thin.map((f) => f.id).join(', '));

  /* An indirect claim must say so. C6 is held by a design gate rather than by this suite, and
     recording that as a plain "covered" would overstate what this suite proves. */
  const indirect = cov.findings.filter((f) => f.indirect);
  ok(indirect.every((f) => f.note && f.note.length > 40),
    'every indirect coverage claim explains what actually holds it',
    indirect.filter((f) => !f.note).map((f) => f.id).join(', '));
}

/* ------------------------------------------------------------------ *
 * 4 · the suite the declaration rests on actually passes
 * ------------------------------------------------------------------ */

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'tests/flow-truth-persistence.test.mjs')],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0,
    'the suite this coverage rests on passes — a red suite establishes nothing',
    out.trim().split('\n').slice(-2).join(' '));

  const covered = cov.findings.filter((f) => f.covered).length;
  console.log(`\n  ${String(covered).padStart(4)}  of ${cov.findings.length} findings are answered by an assertion`);
  console.log(`  ${String(cov.findings.length - covered).padStart(4)}  are not, and say what would cover them:`);
  console.log(`        ${cov.findings.filter((f) => !f.covered).map((f) => f.id).join(', ')}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
