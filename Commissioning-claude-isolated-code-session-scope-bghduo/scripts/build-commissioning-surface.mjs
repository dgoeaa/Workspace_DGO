#!/usr/bin/env node
/**
 * The commissioning surface — what this baseline still needs, out of everything it holds.
 *
 *   npm run surface           # write docs/deployment/COMMISSIONING_SURFACE.md
 *   npm run surface -- --check
 *
 * WHY THIS EXISTS
 *
 * This repository tracks over 1,700 files and most of a hundred megabytes. Almost none of it is
 * what the remaining work touches. An agent or an operator handed the baseline has no way to
 * tell the difference by looking: a superseded audit and a live procedure are both markdown in
 * a docs directory, and the superseded one is often the longer and more confident of the two.
 * That is the burden — not the bytes, but the absence of a boundary, which costs a reader their
 * judgement about what is current before it costs them any disk.
 *
 * So the boundary is drawn here, and it is DERIVED rather than declared: the active surface is
 * the set of files and commands the register's OPEN items actually cite. An item closes, its
 * evidence stops being active, and this document says so on the next run. Nothing has to be
 * remembered, which is the only kind of index that survives.
 *
 * THREE STANDINGS, AND THE RULE FOR EACH
 *
 *   ACTIVE    An open item cites it. Read it as current; act on it.
 *   RETAINED  Evidence and record. True about its own date, not about today. Never edited to
 *             agree with the present — an audit rewritten when it becomes inconvenient is not a
 *             record, and the estate has already decided this for docs/audits/ and for the
 *             foundational corpus under decision D5.
 *   RETIRED   Superseded. A command that refuses to run, or a document whose instruction has
 *             been overtaken. Kept because deleting it loses the reasoning; not to be acted on.
 *
 * Nothing is deleted by this. The baseline keeps its evidence — that is the point of a baseline.
 * What changes is that a reader can now tell, without reading, which of the three they hold.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TARGET = 'docs/deployment/COMMISSIONING_SURFACE.md';
const CHECK = process.argv.includes('--check');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const reg = JSON.parse(read('docs/deployment/PRODUCTION_READINESS_REGISTER.json'));
const pkg = JSON.parse(read('package.json'));
/* DISCHARGED_UNTRACKABLE counts as closed: done, evidenced once, and unverifiable from
   this repository because the proof is a credential or a git-ignored file. See
   statusVocabulary in the register. */
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const open = reg.items.filter((i) => !CLOSED.has(i.status));

/* ------------------------------------------------------------------ *
 * The tree, as git sees it
 * ------------------------------------------------------------------ */

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);

const bytesOf = (paths) => paths.reduce((n, p) => {
  try { return n + statSync(join(ROOT, p)).size; } catch { return n; }
}, 0);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/* ------------------------------------------------------------------ *
 * ACTIVE — derived from what the open items cite
 * ------------------------------------------------------------------ */

/* Trailing punctuation is stripped: the register writes paths inside sentences, and
   `endpoint-register.json.` is the same file as `endpoint-register.json`. */
const PATH_RE = /\b(?:docs|scripts|tests|config|core|modules|tools|document-portal|styles|shared)\/[A-Za-z0-9_./-]+/g;
const CMD_RE = /npm run [a-zA-Z:]+/g;

const citedBy = new Map();   // path → Set of item ids
const commands = new Map();  // command → Set of item ids

function harvest(node, id) {
  if (typeof node === 'string') {
    for (const m of node.match(PATH_RE) || []) {
      const p = m.replace(/[.,;:]+$/, '');
      if (!existsSync(join(ROOT, p))) continue;
      if (!citedBy.has(p)) citedBy.set(p, new Set());
      citedBy.get(p).add(id);
    }
    for (const m of node.match(CMD_RE) || []) {
      const c = m.trim();
      if (!pkg.scripts[c.replace('npm run ', '')]) continue;
      if (!commands.has(c)) commands.set(c, new Set());
      commands.get(c).add(id);
    }
  } else if (Array.isArray(node)) node.forEach((n) => harvest(n, id));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => harvest(n, id));
}
for (const it of open) harvest(it, it.id);

/* The register and the documents generated from it are active whether or not an item happens to
   name them: they are how the work is read. Stated rather than derived, because a document that
   describes the surface has to include itself. */
const ALWAYS_ACTIVE = [
  'docs/deployment/PRODUCTION_READINESS_REGISTER.json',
  'docs/deployment/ACTION_PLAN.md',
  'docs/deployment/EXECUTION_RUNBOOK.md',
  'docs/deployment/IMPLEMENTATION_WALKTHROUGH.md',
  'docs/deployment/COMMISSIONING.md',
  /* The document that declares itself the only entry document, and the cover letter for an export.
     Both were missing from this list while two retired briefs were on it. */
  'docs/deployment/HOW-TO-USE-THIS-BUNDLE.md',
  'docs/deployment/HANDOVER_BRIEF.md',
  TARGET,
  'README.md',
];
for (const p of ALWAYS_ACTIVE) {
  /* TARGET is exempt from the existence check: this generator is about to write it, and gating
     on whether it already exists made the first run and the second produce different documents —
     so `npm run surface` immediately followed by `npm run test:surface` failed. A document that
     lists itself has to list itself whether or not it is there yet. */
  if (p !== TARGET && !existsSync(join(ROOT, p))) continue;
  if (!citedBy.has(p)) citedBy.set(p, new Set(['(entry point)']));
}

const activePaths = [...citedBy.keys()].sort();

/* ------------------------------------------------------------------ *
 * RETAINED — record and evidence, by the rule that governs each
 * ------------------------------------------------------------------ */

const RETAINED = [
  ['docs/reference/foundational/', 'The pre-rotation flow estate, verbatim, by decision D5. Its 43 signed trigger URLs are superseded — 0 appear in the tenant endpoint register. **The commissioning directive withholds this tree from the commissioning agent**, because an agent reading it derives the wrong answer with confidence.'],
  ['docs/reference/flow-contracts/', 'Flow exports and probe transcripts. They say what the tenant said on the day they were taken.'],
  ['docs/reference/provisioning/', 'The provisioned state, printed out of the packages — as 133 markdown pages and as a console over the same model. Generated by `npm run provisioning` AND `npm run provisioningconsole`; running only the first leaves the console stale.'],
  ['docs/audits/', 'Audits, kept unedited. An audit rewritten when it becomes inconvenient is not a record.'],
  ['docs/forensic/', 'A forensic snapshot of one commit, deliberately not rewritten by later reorganisation.'],
  ['docs/handoff/', 'The mobile-shell workstream, written against a lineage not in this history.'],
  ['docs/process/', 'Generated from one discovery run — `npm run process:discover`.'],
  ['docs/deployment/sharepoint/evidence/', 'Tenant readings, by date.'],
];

/* ------------------------------------------------------------------ *
 * RETIRED — what refuses to run, and what is superseded on instruction
 * ------------------------------------------------------------------ */

const RETIRED = [
  ['`npm run recover` / `npm run setup -- --recover`', 'Refuses to run. It wires from the pre-rotation corpus: the signatures are revoked and all 25 endpoint keys now point at different workflows, so the configuration it builds looks complete and answers 401 on every call. Use `npm run values:template`.'],
  ['`npm run commission -- --posture development`', 'Refuses to run. The posture was wired by `--recover` and went with it. It also required a narrower endpoint set than either live posture, so it cleared more easily — for an estate that could not exist.'],
  ['`npm run test:pendingplan`', 'Out of the chain as `test:pendingplan:retired`. It asserts what `--recover` would restore, and `--recover` is retired, so the gate tests a path that cannot execute.'],
  ['`COMMISSIONING_WALKTHROUGH.md` (root)', 'A reading of a 679-file snapshot of `main` at `63d79ee`. Its findings apply to this tree; its counts do not, and its rotation steps are discharged by `ITEM-22`.'],
  ['`OPERATOR_WALKTHROUGH.md`', 'Hand-written and verified at `8a793d9` on 2026-08-31. Ten of the 28 items it names have closed since. The generated three are current; this one records the keystrokes.'],
  ['`OPEN_ITEMS.md`', 'Where the findings were first written and worked. The register carries their status now; this file is held to it by `npm run test:closure`.'],
];

/* ------------------------------------------------------------------ *
 * Compose
 * ------------------------------------------------------------------ */

const byStatus = {};
for (const i of reg.items) byStatus[i.status] = (byStatus[i.status] || 0) + 1;

const retainedPaths = tracked.filter((p) => RETAINED.some(([prefix]) => p.startsWith(prefix)));
const activeSet = new Set(activePaths);
const otherPaths = tracked.filter((p) => !activeSet.has(p) && !retainedPaths.includes(p));

let md = `# The commissioning surface

**Generated by \`npm run surface\` from
[\`PRODUCTION_READINESS_REGISTER.json\`](./PRODUCTION_READINESS_REGISTER.json).** Do not edit by
hand — \`npm run test:surface\` fails on drift.

> **The one commissioning path is
> [\`CLEAR-THE-LAST-BLOCKER.md\`](./CLEAR-THE-LAST-BLOCKER.md)** (on a phone,
> [\`CLEAR-THE-LAST-BLOCKER-TERMUX.md\`](./CLEAR-THE-LAST-BLOCKER-TERMUX.md)). If you are here to
> execute, go there. This document tells you what to READ and what to disregard; it is not a
> route through the work.

What the remaining work touches, out of everything this baseline holds. The active list is
**derived**, not declared: it is the files and commands the register's open items actually cite.
Close an item and its evidence leaves this list on the next run.

## The shape of it

| | Files | Bytes | |
|---|---:|---:|---|
| **Active** | ${activePaths.length} | ${mb(bytesOf(activePaths))} | cited by an open item, or an entry point |
| **Retained** | ${retainedPaths.length} | ${mb(bytesOf(retainedPaths))} | evidence and record — true about its own date |
| Everything else | ${otherPaths.length} | ${mb(bytesOf(otherPaths))} | the two applications, their tooling, and their suites |
| **Tracked** | **${tracked.length}** | **${mb(bytesOf(tracked))}** | |

**${activePaths.length} of ${tracked.length} tracked files** are what the ${open.length} open
items point at. The rest is not clutter to be deleted — it is the evidence a baseline exists to
keep — but none of it should be read as a statement about today.

## How to read anything in this repository

| Standing | Rule |
|---|---|
| **Active** | Current. Act on it. |
| **Retained** | True about its own date. Never edited to agree with the present. |
| **Retired** | Superseded. Kept for the reasoning; not to be acted on. |

Where a document and a command disagree, **the command governs**.

---

## Where the estate stands

Register version ${reg.registerVersion}, ${reg.items.length} items —
**${reg.items.filter((i) => CLOSED.has(i.status)).length} closed, ${open.length} open**.

| Status | Items |
|---|---:|
${Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => `| ${CLOSED.has(s) ? `**${s}**` : s} | ${n} |`).join('\n')}

Read [\`ACTION_PLAN.md\`](./ACTION_PLAN.md) for the open items in the order that unblocks the
most. Run \`npm run commission\` for the gate's own reading, and \`npm run readiness\` for the
register's.

---

## Active — commands

The ${commands.size} npm commands the open items name.

| Command | Named by |
|---|---|
${[...commands.entries()].sort().map(([c, ids]) => `| \`${c}\` | ${[...ids].sort().join(', ')} |`).join('\n')}

---

## Active — files

| Path | Cited by |
|---|---|
${activePaths.map((p) => `| [\`${p}\`](${'../../' + p}) | ${[...citedBy.get(p)].sort().join(', ')} |`).join('\n')}

---

## Retained — evidence and record

Read as a statement about its own date, never about today.

| Tree | Files | Bytes | What it is |
|---|---:|---:|---|
${RETAINED.map(([prefix, why]) => {
  const fs_ = tracked.filter((p) => p.startsWith(prefix));
  return `| \`${prefix}\` | ${fs_.length} | ${mb(bytesOf(fs_))} | ${why} |`;
}).join('\n')}

---

## Retired — not to be acted on

| | Why |
|---|---|
${RETIRED.map(([what, why]) => `| ${what} | ${why} |`).join('\n')}

---

## What holds this together

| Gate | Holds |
|---|---|
| \`npm run test:closure\` | no document presents a closed item as open, and no retired command is prescribed |
| \`npm run test:readiness\` | the register is complete, internally consistent, and no older than its newest evidence |
| \`npm run test:actions\` · \`test:runbook\` · \`test:walkthrough\` | the three generated documents against the register |
| \`npm run test:surface\` | this document against the register |
`;

const abs = join(ROOT, TARGET);
if (CHECK) {
  const previous = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (previous === md) {
    console.log(`\n  ✅ ${TARGET} matches the register.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${TARGET} has drifted from the register.`);
  console.error('     Run: npm run surface\n');
  process.exit(1);
}

writeFileSync(abs, md);
console.log(`\nCommissioning surface\n`);
console.log(`  wrote ${TARGET}`);
console.log(`  active    ${String(activePaths.length).padStart(5)} file(s)  ${mb(bytesOf(activePaths)).padStart(8)}  · ${commands.size} command(s)`);
console.log(`  retained  ${String(retainedPaths.length).padStart(5)} file(s)  ${mb(bytesOf(retainedPaths)).padStart(8)}`);
console.log(`  other     ${String(otherPaths.length).padStart(5)} file(s)  ${mb(bytesOf(otherPaths)).padStart(8)}`);
console.log(`  tracked   ${String(tracked.length).padStart(5)} file(s)  ${mb(bytesOf(tracked)).padStart(8)}`);
console.log(`\n  ${open.length} open item(s) across ${reg.items.length} in the register.\n`);
