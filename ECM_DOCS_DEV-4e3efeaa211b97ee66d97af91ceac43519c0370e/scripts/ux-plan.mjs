#!/usr/bin/env node
/**
 * The Workspace essentials plan: status board, generated plan document and its check.
 *
 * docs/architecture/ESSENTIALS_PLAN.json is the record. This prints where each phase stands,
 * writes docs/architecture/ESSENTIALS_PLAN.md from it, and checks that the record is consistent:
 * every dependency exists, no item is ready while a dependency is unfinished, and nothing is
 * closed without evidence.
 *
 *   node scripts/ux-plan.mjs            # print the status board
 *   node scripts/ux-plan.mjs --write    # write ESSENTIALS_PLAN.md
 *   node scripts/ux-plan.mjs --check    # fail if the record is inconsistent or the document stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'docs/architecture/ESSENTIALS_PLAN.json';
const OUT = 'docs/architecture/ESSENTIALS_PLAN.md';
const plan = JSON.parse(readFileSync(join(ROOT, SRC), 'utf8'));
const items = plan.items;
const byId = new Map(items.map((i) => [i.id, i]));
const CLOSED = new Set(['DONE', 'DROPPED']);
const STATUSES = Object.keys(plan.statuses);

/* ---------------------------------------------------------------- consistency */
function problems() {
  const out = [];
  const seen = new Set();
  const phases = new Set(plan.phases.map((p) => p.id));
  for (const i of items) {
    if (seen.has(i.id)) out.push(`${i.id}: duplicate id`);
    seen.add(i.id);
    if (!STATUSES.includes(i.status)) out.push(`${i.id}: unknown status ${i.status}`);
    if (!phases.has(i.phase)) out.push(`${i.id}: unknown phase ${i.phase}`);
    for (const k of ['title', 'owner', 'description', 'resolutionCriteria']) if (!i[k]) out.push(`${i.id}: no ${k}`);
    const deps = i.dependencies || [];
    for (const d of deps) if (!byId.has(d)) out.push(`${i.id}: depends on unknown item ${d}`);
    const unfinished = deps.filter((d) => byId.has(d) && byId.get(d).status !== 'DONE');
    if (unfinished.length && ['OPEN', 'IN_PROGRESS', 'DONE'].includes(i.status)) {
      out.push(`${i.id}: is ${i.status} while ${unfinished.join(', ')} ${unfinished.length > 1 ? 'are' : 'is'} not DONE`);
    }
    if (!unfinished.length && i.status === 'BLOCKED') out.push(`${i.id}: is BLOCKED but every dependency is DONE; mark it OPEN`);
    if (CLOSED.has(i.status) && (!i.evidence || !i.closedUtc)) out.push(`${i.id}: is ${i.status} without evidence and closedUtc`);
  }
  return out;
}

/* ---------------------------------------------------------------- the board */
const count = (list, s) => list.filter((i) => i.status === s).length;
const ready = items.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');

function board() {
  const rows = plan.phases.map((p) => {
    const list = items.filter((i) => i.phase === p.id);
    const done = list.filter((i) => CLOSED.has(i.status)).length;
    return `  ${p.id}  ${p.title.padEnd(34)} ${String(done).padStart(2)}/${String(list.length).padEnd(2)} done   `
      + `${count(list, 'IN_PROGRESS')} in progress · ${count(list, 'OPEN')} ready · ${count(list, 'BLOCKED')} blocked`;
  });
  const done = items.filter((i) => CLOSED.has(i.status)).length;
  return [
    `${plan.title}`,
    '',
    ...rows,
    '  ' + '─'.repeat(78),
    `      ${'All phases'.padEnd(34)} ${String(done).padStart(2)}/${items.length} done`,
    '',
    'Ready to act on now:',
    ...(ready.length ? ready.map((i) => `  ${i.id.padEnd(7)} ${i.status === 'IN_PROGRESS' ? '[in progress] ' : ''}${i.title}  (${i.owner})`) : ['  nothing; every remaining item is blocked']),
  ].join('\n');
}

/* ---------------------------------------------------------------- the document */
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const link = (id) => `[${id}](#${id.toLowerCase()})`;

function documentText() {
  const done = items.filter((i) => CLOSED.has(i.status)).length;
  const L = [];
  L.push(`# ${plan.title}`, '');
  L.push('**Status:** the execution and tracking plan for Workspace interface work. It carries no commissioning step;');
  L.push('those live in [`RUNBOOK.md`](../deployment/RUNBOOK.md).', '');
  L.push(`> Generated from [\`ESSENTIALS_PLAN.json\`](ESSENTIALS_PLAN.json) by \`npm run ux:plan -- --write\`. Do not edit by hand:`);
  L.push('> change an item\'s status in the JSON, then regenerate. `npm run ux:plan` prints the board; `npm run outstanding` counts');
  L.push('> the open items with every other register.', '');
  L.push(`It carries out [\`ESSENTIALS_MAP.md\`](ESSENTIALS_MAP.md) and [\`LAYOUT_REVIEW.md\`](LAYOUT_REVIEW.md).`, '');
  L.push(`**${done} of ${items.length} items done.**`, '');
  L.push('## Where each phase stands', '');
  L.push('| Phase | Goal | Done | In progress | Ready | Blocked |', '|---|---|---|---|---|---|');
  for (const p of plan.phases) {
    const list = items.filter((i) => i.phase === p.id);
    L.push(`| **${p.id} ${esc(p.title)}** | ${esc(p.goal)} | ${list.filter((i) => CLOSED.has(i.status)).length}/${list.length} | ${count(list, 'IN_PROGRESS')} | ${count(list, 'OPEN')} | ${count(list, 'BLOCKED')} |`);
  }
  L.push('', '## Ready to act on now', '');
  if (ready.length) for (const i of ready) L.push(`- ${link(i.id)} ${esc(i.title)} · **${esc(i.owner)}**${i.status === 'IN_PROGRESS' ? ' · in progress' : ''}`);
  else L.push('Nothing: every remaining item is blocked.');
  L.push('', '## Order of work', '');
  L.push('```');
  L.push('P0 owner decisions ──┬─ UX-D0 ──► P1 quick wins (UX-101…109) ──► UX-110 measure ─────────────────┐');
  L.push('                     ├─ UX-D1 ──► P2 UX-201 intakes, UX-202 record page ──► P3 Inbox, Tasks,    │');
  L.push('                     │                      │                                Overview, Search ─┤');
  L.push('                     ├─ UX-D2, UX-D4 ───────┴► UX-203 closing actions, UX-204 custody ─────────┤');
  L.push('                     └─ UX-D3, D5, D6, D7 ──────────────────────────► P4 cut-over, decommission ─┴► P5 measure, accept');
  L.push('```', '');
  L.push('## Targets', '');
  L.push('| Measure | Today | Target | Measured | Source |', '|---|---|---|---|---|');
  for (const t of plan.targets) L.push(`| ${esc(t.measure)} | ${t.baseline} | ${t.target} | ${t.measured ?? '—'} | ${esc(t.source)} |`);
  L.push('', '## Items', '');
  for (const p of plan.phases) {
    L.push(`### ${p.id} · ${p.title}`, '', p.goal, '');
    L.push('| Item | Owner | Status | Depends on |', '|---|---|---|---|');
    for (const i of items.filter((x) => x.phase === p.id)) {
      L.push(`| ${link(i.id)} ${esc(i.title)} | ${esc(i.owner)} | ${i.status} | ${(i.dependencies || []).join(', ') || '—'} |`);
    }
    L.push('');
    for (const i of items.filter((x) => x.phase === p.id)) {
      L.push(`#### ${i.id}`, '');
      L.push(`**${esc(i.title)}** · ${i.owner} · ${i.status}${i.findings?.length ? ` · from ${i.findings.join('; ')}` : ''}`, '');
      L.push(i.description, '');
      if (i.steps?.length) { L.push('Steps:', ''); for (const s of i.steps) L.push(`1. ${s}`); L.push(''); }
      L.push(`**Done when:** ${i.resolutionCriteria}`, '');
      if (i.validation?.length) L.push(`**Checked by:** ${i.validation.map((v) => `\`${v}\``).join(', ')}`, '');
      if (i.progress) L.push(`**Progress:** ${i.progress}`, '');
      if (i.evidence) L.push(`**Evidence:** ${i.evidence}${i.closedUtc ? ` (${i.closedUtc})` : ''}`, '');
    }
  }
  L.push('## Rules', '');
  for (const r of plan.rules) L.push(`- ${r}`);
  L.push('');
  return L.join('\n');
}

/* ---------------------------------------------------------------- main */
const issues = problems();
if (process.argv.includes('--check')) {
  const want = documentText();
  const have = existsSync(join(ROOT, OUT)) ? readFileSync(join(ROOT, OUT), 'utf8') : '';
  if (want !== have) issues.push(`${OUT} is stale. Run: npm run ux:plan -- --write`);
  if (issues.length) { console.error(`❌ essentials plan:\n  ${issues.join('\n  ')}`); process.exit(1); }
  console.log(`✅ essentials plan consistent (${items.length} items) and ${OUT} current`);
} else if (process.argv.includes('--write')) {
  if (issues.length) { console.error(`❌ essentials plan:\n  ${issues.join('\n  ')}`); process.exit(1); }
  writeFileSync(join(ROOT, OUT), documentText());
  console.log(`wrote ${OUT}`);
} else {
  console.log(board());
  if (issues.length) { console.error(`\n❌ ${issues.length} problem(s):\n  ${issues.join('\n  ')}`); process.exit(1); }
}
