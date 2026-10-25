#!/usr/bin/env node
/**
 * One number for how much is left.
 *
 *   npm run outstanding
 *   npm run outstanding -- --check      # fail if the written document has drifted
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-14 the estate recorded unfinished work in five places and nothing could total them.
 * `npm run readiness` knew about 48 items. `npm run commission` knew about those plus the ten open
 * governance findings. The notification workstream's own P-01…P-17, the nine findings of the
 * notification assessment and the twenty-nine of the flow-truth review were counted by nothing at
 * all — and two of those twenty-nine are security findings.
 *
 * So the question a person actually asks — how much is left — had five different answers depending
 * on which command they happened to run, and each answer read as if it were the whole picture.
 * That is the same failure this repository has already fixed twice at a smaller scale: a number
 * that is true of one document being read as true of the estate.
 *
 * WHAT THIS IS NOT
 *
 * Not a merge. Each source keeps its own shape, lifecycle and owner, and the reasons are in
 * OUTSTANDING_SOURCES.json beside each entry. An audit in particular is a RECORD — it is never
 * edited to agree with the present, which is exactly why its findings cannot be closed in place
 * and must be counted from outside.
 *
 * WHAT MAKES IT STAY TRUE
 *
 * The declaration is data, and tests/outstanding-sources.test.mjs fails when a register-shaped
 * document appears under docs/ without being declared. A sixth place to hide work has to be
 * declared before it can exist.
 *
 * The readers live in scripts/lib/outstanding-sources.mjs, shared with the outstanding-sources guard. Two
 * commands reading the same five files by two copies of the same patterns is how the copies drift
 * and the totals quietly stop agreeing.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAll, actorOf, SOURCES_PATH as SOURCES } from './lib/outstanding-sources.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* A JSON total, not a second prose plan. Until 2026-09-24 this wrote OUTSTANDING.md, 249 lines
   of tables listing the items PLAN.md already lists — and the estate now keeps exactly one plan.
   What the command is FOR survives unchanged and is in no other document: the readiness register
   is one of five counted sources, and this is the only thing that totals them. So the total is
   recorded where a command can read it and a diff can show it moving, and PLAN.md stays the only
   prose listing of what to do next. */
const TARGET = 'docs/deployment/outstanding-rollup.json';
const CHECK = process.argv.includes('--check');

/* Declared and deliberately not counted: a document that restates a counted source, or a record
   whose live findings have been taken up elsewhere. They are listed in the output, not hidden —
   a judgement on the record can be disagreed with; a silent exemption cannot. */
const { results, problems, uncounted } = readAll(ROOT);

if (problems.length) {
  console.error('\n  ✖  Outstanding rollup could not read every declared source:\n');
  for (const p of problems) console.error(`     ${p}`);
  console.error(`\n     Sources are declared in ${SOURCES}.\n`);
  process.exit(2);
}

const totalOpen = results.reduce((n, r) => n + r.open.length, 0);
const totalAll = results.reduce((n, r) => n + r.entries.length, 0);
const totalClosed = totalAll - totalOpen;

/* ------------------------------------------------------------------ *
 * Who can act — read from the sources that name an owner
 * ------------------------------------------------------------------ */

const byActor = new Map();
for (const r of results) {
  for (const e of r.open) {
    const a = actorOf(e.owner);
    if (!byActor.has(a)) byActor.set(a, []);
    byActor.get(a).push(`${e.id} (${r.src.id})`);
  }
}

/* ------------------------------------------------------------------ *
 * Compose
 * ------------------------------------------------------------------ */

const pad = (s, n) => String(s).padStart(n);

const rollup = {
  generatedFrom: SOURCES,
  rule: 'Every source declared in OUTSTANDING_SOURCES.json is read and totalled here. A source '
    + 'whose pattern stops matching reports zero, which is the most dangerous number this estate '
    + 'can print, so the generator exits 2 rather than reporting it.',
  whatThisDoesNotTellYou: 'It counts items, and items are not equal. One agency decision can gate '
    + 'more than ten provisioning steps, and the flow-truth review\'s twenty-nine findings are '
    + 'against a single package. Read docs/deployment/PLAN.md for what to do next, in the order '
    + 'that unblocks the most; this exists to stop work hiding, not to prioritise it. It also '
    + 'cannot tell you that a finding in a record has been overtaken: audits are never edited to '
    + 'agree with the present, so their findings stay counted until a tracked source supersedes '
    + 'them — the honest default, and occasionally an overcount.',
  totals: {
    sourcesCounted: results.length,
    open: totalOpen,
    closed: totalClosed,
    declaredNotCounted: uncounted.length,
  },
  byActor: Object.fromEntries([...byActor.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([actor, ids]) => [actor, { open: ids.length, items: ids }])),
  sources: results.map((r) => ({
    id: r.src.id,
    title: r.src.title,
    path: r.src.path,
    authority: r.src.authority,
    open: r.open.length,
    closed: r.closed.length,
    items: r.entries.map((e) => ({ id: e.id, title: e.title || null, status: e.status, open: e.open })),
  })),
  declaredNotCounted: uncounted.map((u) => ({ path: u.path, why: u.notCountedBecause })),
};

const md = JSON.stringify(rollup, null, 2) + '\n';

const abs = join(ROOT, TARGET);
if (CHECK) {
  const previous = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (previous === md) {
    console.log(`\n  ✅ ${TARGET} matches its sources — ${totalOpen} outstanding across ${results.length}.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${TARGET} has drifted from its sources.`);
  console.error('     Run: npm run outstanding\n');
  process.exit(1);
}

writeFileSync(abs, md);
console.log('\nOutstanding across every declared source\n');
for (const r of results) {
  console.log(`  ${pad(r.open.length, 4)} open   ${pad(r.closed.length, 3)} closed   ${r.src.id}`);
}
console.log(`  ${'─'.repeat(46)}`);
console.log(`  ${pad(totalOpen, 4)} OPEN   ${pad(totalClosed, 3)} closed   across ${results.length} sources\n`);
console.log('  by who can act:');
for (const [a, ids] of [...byActor.entries()].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`  ${pad(ids.length, 4)}  ${a}`);
}
console.log(`\n  wrote ${TARGET}\n`);
