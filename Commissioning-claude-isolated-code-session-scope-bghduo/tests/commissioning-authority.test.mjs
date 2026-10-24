#!/usr/bin/env node
/**
 * One commissioning path, named in every document that looks like one.
 *
 * WHY THIS SUITE EXISTS
 *
 * A forensic pass over this baseline found **fifteen documents carrying commissioning command
 * sequences**, prescribing divergent ones, with no two agreeing on how many endpoints exist:
 * "22 of 24" in one, "17 of 24" in another, 25 in fact. Five of them recommended
 * `npm run recover`, which is retired and exits 2 because it wires a superseded estate — a
 * config that looks complete and answers 401 on every call. The most obviously-named of them,
 * `COMMISSIONING_WALKTHROUGH.md` at the repository root, is a historical audit of a different
 * tree and instructed `npm run recover` at its step 3.1 while stating elsewhere that the command
 * crashes.
 *
 * No single document was wrong in a way a reader could detect from inside it. The defect was
 * that there were fifteen, and an operator's first act — opening the one whose name matched
 * what they wanted to do — decided whether they commissioned the estate or a dead one.
 *
 * So the rule this suite enforces is not "documentation must be correct", which no test can
 * check. It is narrower and mechanical:
 *
 *   1. Exactly one document is the commissioning path, and it exists.
 *   2. Any OTHER document carrying a commissioning command sequence names it, early, where a
 *      reader sees it before following anything.
 *   3. No document presents the retired `npm run recover` as a step to run.
 *
 * A new document may still be added. It simply cannot become a twelfth silent alternative:
 * either it points at the authority, or this suite fails and says which line to add.
 *
 * Usage:  node tests/commissioning-authority.test.mjs
 * Exit:   0 = the estate has one commissioning path, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AUTHORITY = 'docs/deployment/CLEAR-THE-LAST-BLOCKER.md';
const AUTHORITY_TERMUX = 'docs/deployment/CLEAR-THE-LAST-BLOCKER-TERMUX.md';

/* The two authority documents, and the packaging note that only mentions `setup` in passing as
   an input to `npm run package`, are exempt from having to point at the authority. Everything
   else that reads like a commissioning path must. */
const EXEMPT = new Set([AUTHORITY, AUTHORITY_TERMUX]);

/* The commands that make a document read as a commissioning path. `npm run commission` alone is
   not enough — it is a gate anyone may run, and reporting readiness is not prescribing a
   sequence. Two or more distinct wiring commands is. */
const WIRING = [
  /npm run values:template/,
  /npm run values:sign/,
  /npm run check:values/,
  /npm run setup\b[^\n]*--values/,
  /npm run recover/,
];

/* How far into a document counts as "before a reader follows anything". Generous: a pointer
   below this is a footnote, not a signpost. */
const HEAD_LINES = 40;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── gather every markdown document that prescribes wiring ────────────────────────────── */

function markdownFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      /* Archived and audit material records what was done at a point in time; it is evidence,
         not instruction, and rewriting it to point at a document that did not exist then would
         make it evidence of something that never happened. */
      if (/(^|\/)(node_modules|\.git|archive|audits|forensic|test-results|playwright-report)$/.test(rel)) continue;
      markdownFiles(rel, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(rel);
    }
  }
  return acc;
}

const docs = ['docs', '.'].flatMap((d) => (d === '.'
  ? fs.readdirSync(ROOT).filter((f) => f.endsWith('.md'))
  : markdownFiles(d)));

const prescriptive = [];
for (const rel of docs) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hits = WIRING.filter((re) => re.test(text)).length;
  if (hits >= 2) prescriptive.push({ rel, text });
}

console.log(`\nOne commissioning path — ${prescriptive.length} document(s) prescribe wiring\n`);

check('the authority exists, on both surfaces', () => {
  for (const f of [AUTHORITY, AUTHORITY_TERMUX]) {
    assert(fs.existsSync(path.join(ROOT, f)), `${f} is missing — it is the commissioning path`);
  }
});

check('more than one document prescribes wiring, which is why this rule exists', () => {
  assert(prescriptive.length > 1,
    'only one document prescribes wiring; if that is now true by construction this suite is '
    + 'obsolete, but check that the search did not simply stop matching');
});

check('every prescriptive document names the authority, before its instructions', () => {
  const silent = prescriptive
    .filter(({ rel }) => !EXEMPT.has(rel.replace(/\\/g, '/')))
    .filter(({ text }) => !text.split('\n').slice(0, HEAD_LINES).join('\n').includes('CLEAR-THE-LAST-BLOCKER'))
    .map(({ rel }) => rel);
  assert(silent.length === 0,
    `${silent.length} document(s) prescribe commissioning commands without naming the one `
    + `authoritative path in their first ${HEAD_LINES} lines:\n      ${silent.join('\n      ')}\n`
    + `      Add a pointer to ${AUTHORITY} near the top, or make the document stop prescribing commands.`);
});

check('no document presents the retired --recover as a step to run', () => {
  const offenders = [];
  for (const rel of docs) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = text.split('\n');
    /* A document that opens by telling the reader to run nothing in it has already discharged
       this obligation for every line it contains, and repeating the retirement beside each
       mention would bury the mentions that are the document's actual evidence. Anything else
       must state the retirement within sight of the mention. */
    const disclaimed = /DO NOT COMMISSION FROM THIS DOCUMENT/i.test(lines.slice(0, HEAD_LINES).join('\n'));
    if (disclaimed) continue;
    for (const [i, line] of lines.entries()) {
      if (!/npm run recover|--recover/.test(line)) continue;
      const window = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
      if (!/retired|refuses|exits 2|superseded/i.test(window)) {
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert(offenders.length === 0,
    `${offenders.length} mention(s) of the retired recover path read as instructions:\n      `
    + offenders.join('\n      '));
});

check('a document that disclaims itself says so where a reader cannot miss it', () => {
  /* The exemption above is only safe if the disclaimer is real. COMMISSIONING_WALKTHROUGH.md is
     the one document that carries it, and it earns it: it has the most obvious filename in the
     repository and is a historical audit of a tree that no longer exists. */
  const rel = 'COMMISSIONING_WALKTHROUGH.md';
  const head = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').slice(0, HEAD_LINES).join('\n');
  assert(/DO NOT COMMISSION FROM THIS DOCUMENT/i.test(head),
    `${rel} prescribes the retired recover path and no longer disclaims itself — restore the banner`);
  assert(head.includes('CLEAR-THE-LAST-BLOCKER'),
    `${rel} disclaims itself without naming where to go instead`);
});

check('no agent-engagement brief is reintroduced', () => {
  /* Three documents briefed, directed and handed over to an independent commissioning agent.
     No such agent was engaged: the audit and the remediation were carried out against this
     baseline, and what remains is tenant-side execution, not a scope for an engagement.

     They used to be kept as history behind a retirement banner. They are now DELETED, and this
     check is the same guard in its stronger form. A live-reading engagement brief is how a
     second, divergent commissioning effort starts, and a reader who opens one cannot tell from
     inside it that the work is done. The banner depended on someone reading it; absence does
     not. */
  const GONE = [
    'docs/deployment/AGENT_HANDOVER.md',
    'docs/deployment/AGENT_COMMISSIONING_DIRECTIVE.md',
    'docs/deployment/COMMISSIONING_AGENT_BRIEF.md',
  ];
  const back = GONE.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  assert(back.length === 0,
    `${back.length} agent-engagement document(s) have been restored:\n      ${back.join('\n      ')}\n`
    + `      The engagement they scope did not happen and is not going to. The commissioning path\n`
    + `      is ${AUTHORITY}; the tenant work is in the governance runbook.`);
});

check('the authority states the estate\'s actual size', () => {
  const text = fs.readFileSync(path.join(ROOT, AUTHORITY), 'utf8');
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json'), 'utf8'));
  assert(text.includes(String(ids.totals.keys)),
    `${AUTHORITY} never states the key count (${ids.totals.keys}), so a reader cannot tell when it is short`);
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
