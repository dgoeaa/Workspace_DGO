#!/usr/bin/env node
/**
 * A page that renders a dated report says so on its face.
 *
 * WHY THIS EXISTS
 *
 * `docs/folio-Master-Flows-and-Endpoints/contracts/` holds two browsable pages built from the same 2026-08-08/09
 * live-probe harvest. One of them, DOCUMENT_PORTAL_FLOWS.html, has carried "Superseded,
 * 2026-08-15." in its header band all along. The other, flow-alignment-console.html, carried no
 * date and no standing at all — while `docs/README.md` described it as a tool for comparing the
 * documented contract against the live response, in the present tense.
 *
 * An operator opening it was therefore told they were looking at a live comparison, and given a
 * report scored against transcripts captured on a day in August, against a portal contract that was
 * rewritten a week later. One of a pair was marked and the other was missed, which is how this
 * estate's defects have looked all week: a correct document and a stale one beside it, with nothing
 * checking that both say what they are.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not judge whether a report is still right, and it must not: the alignment console's 20
 * internal-platform rows still stand against a current specification, and only its 6 portal rows
 * are stale. A rule that marked the whole page superseded would be as wrong as marking none of it.
 * What is asserted is narrower and checkable — the page states the date of the evidence it renders,
 * and states what standing that evidence now has.
 *
 * Usage:  node tests/dated-reports.test.mjs
 * Exit:   0 = every dated report page declares itself, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/* Visible text only. A date in a CSS comment is not a statement to a reader. */
const visible = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/**
 * Pages built from evidence captured on a date, with the data file each one renders.
 *
 * `standing` is what the page must still tell a reader about that evidence. It is a pattern rather
 * than a sentence so the wording stays the page's own — a test that dictates prose is a test
 * rewriting the document to suit itself.
 */
const REPORTS = [
  {
    page: 'docs/folio-Master-Flows-and-Endpoints/contracts/flow-alignment-console.html',
    renders: 'docs/folio-Master-Flows-and-Endpoints/contracts/ALIGNMENT_REPORT.json',
    standing: /report,? not a live check|reads nothing now|portal rows are stale/i,
    whatItMustSay: 'that it is a report rather than a live check, and which of its rows are stale',
  },
  {
    page: 'docs/folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.html',
    renders: 'docs/folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.json',
    standing: /supersed/i,
    whatItMustSay: 'that it has been superseded',
  },
];

console.log('\nDated reports — each page says what it is and when its evidence was taken\n');

for (const r of REPORTS) {
  const name = path.basename(r.page);

  check(`${name} — it renders a data file that states its own date`, () => {
    const data = JSON.parse(read(r.renders));
    const when = data.generatedAt || data.capturedUtc || data.date;
    assert(when, `${r.renders} states no generatedAt, so nothing can check the page against it`);
    assert(/^\d{4}-\d{2}-\d{2}/.test(when), `${r.renders} states "${when}", which is not a date`);
  });

  check(`${name} — the date of its evidence is visible to a reader`, () => {
    const data = JSON.parse(read(r.renders));
    const when = (data.generatedAt || data.capturedUtc || data.date).slice(0, 10);
    const year = when.slice(0, 4);
    const text = visible(read(r.page));
    /* Either the exact date, or the year of it — a page may reasonably cite the capture date of
       its transcripts rather than the generation date of the file it renders, and those differ. */
    assert(text.includes(when) || new RegExp(`${year}[-‑]\\d{2}[-‑]\\d{2}`).test(text),
      `nothing on the page carries a ${year} date. It renders ${path.basename(r.renders)}, `
      + `generated ${when}, and a reader has no way to know how old what they are reading is.`);
  });

  check(`${name} — it states the standing of that evidence`, () => {
    const text = visible(read(r.page));
    assert(r.standing.test(text),
      `the page does not say ${r.whatItMustSay}. Without it, `
      + 'a reader takes a dated report for a current one.');
  });
}

check('docs/README.md does not describe either report in the present tense', () => {
  const readme = read('docs/README.md');
  for (const r of REPORTS) {
    const line = readme.split('\n').find((l) => l.includes(path.basename(r.page)));
    assert(line, `docs/README.md no longer indexes ${path.basename(r.page)}`);
    assert(/\d{4}-\d{2}-\d{2}|supersed|not a live check|record/i.test(line),
      `the index entry for ${path.basename(r.page)} gives no date and no standing, so the index `
      + 'presents a dated report as a working tool. That is how this was missed.');
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error('Failures:\n');
  for (const f of failures) console.error(`  ✖  ${f}\n`);
  process.exit(1);
}
