#!/usr/bin/env node
/**
 * THE MASTER REGISTER MUST STAY A READING, NOT A COMPOSITION.
 *
 * `npm run master` enumerates all 87 open items with what each one needs to close. The danger in a
 * document like that is not drift — `--check` catches drift — it is PLAUSIBILITY: a generator that
 * fills an absent field with a sensible-sounding sentence produces a document that reads better
 * than the estate deserves, and the reader cannot tell which half is real.
 *
 * That failure has a history here. Two thirds of these items come from sources that state no
 * closure criterion, and the instinct is to write one. The moment that happens, the estate's
 * biggest measured bookkeeping gap — 56 of 87 items with nothing that says what would close them —
 * stops being visible, and the document that was supposed to surface it conceals it instead.
 *
 * WHAT THIS CHECKS
 *
 *   1. Every open item in every declared source appears, once, and the totals agree with
 *      `npm run outstanding`. Two commands, one library, no second opinion.
 *   2. Every item carries all six dimensions the register promises, either read or explicitly
 *      marked as not established.
 *   3. No field is invented: a value present in the register must be present in the source.
 *   4. Topology is derived only from stated relations, the graph is consistent in both directions,
 *      and every prerequisite resolves to a real item or is reported as unresolved.
 *   5. The rule that distinguishes a real ordering constraint from prose that merely mentions
 *      another item still rejects what it claims to reject.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAll } from '../scripts/lib/outstanding-sources.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nMaster register — a reading of five sources, not a composition\n');

const MD = 'docs/deployment/MASTER_REGISTER.md';
const JSON_PATH = 'docs/deployment/MASTER_REGISTER.json';

/* ------------------------------------------------------------------ *
 * 0 · it is current
 * ------------------------------------------------------------------ */

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-master-register.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run master is current', out.trim().split('\n').slice(-2).join(' '));
}

if (!existsSync(join(ROOT, JSON_PATH))) {
  console.log(`\n❌ ${JSON_PATH} does not exist — run npm run master\n`);
  process.exit(1);
}

const reg = JSON.parse(read(JSON_PATH));
const md = read(MD);
const { results } = readAll(ROOT);
const sourceOpen = results.flatMap((r) => r.open);

/* ------------------------------------------------------------------ *
 * 1 · it enumerates every open item, once, and agrees with the rollup
 * ------------------------------------------------------------------ */

{
  const registered = reg.items.map((i) => i.id);
  const expected = sourceOpen.map((e) => e.id);

  const missing = expected.filter((id) => !registered.includes(id));
  ok(missing.length === 0, `every open item in every source is enumerated (${expected.length})`,
    missing.length ? `absent: ${missing.join(', ')}` : '');

  const extra = registered.filter((id) => !expected.includes(id));
  ok(extra.length === 0, 'nothing is enumerated that no source holds open', extra.join(', '));

  const dupes = registered.filter((id, n) => registered.indexOf(id) !== n);
  ok(dupes.length === 0, 'no item is enumerated twice', dupes.join(', '));

  ok(reg.totals.open === expected.length,
    `the stated total matches the enumeration (${reg.totals.open})`,
    `totals.open=${reg.totals.open}, enumerated=${expected.length}`);

  /* The rollup and the master register read the same five files through the same library. If they
     disagree about how many items exist, one of them has a bug — which is the whole reason the
     readers were made shared rather than copied. */
  let rollup = '';
  try {
    rollup = execFileSync(process.execPath, [join(ROOT, 'scripts/build-outstanding-rollup.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { rollup = `${e.stdout || ''}${e.stderr || ''}`; }
  const stated = Number((/(\d+)\s+outstanding across/.exec(rollup) || [])[1]);
  ok(stated === reg.totals.open,
    `npm run outstanding and npm run master agree on the total (${stated})`,
    `outstanding says ${stated}, master says ${reg.totals.open}`);
}

/* ------------------------------------------------------------------ *
 * 2 · every item carries all six dimensions, read or explicitly absent
 * ------------------------------------------------------------------ */

{
  /* The six the document promises: what it is, why it is, current state, actions/steps/inputs,
     what decisively closes it, execution topology. A field may be null — that is a legitimate
     reading of a source that states nothing — but the KEY must exist, and the rendered document
     must say so in words rather than leaving a blank cell. */
  const DIMENSIONS = ['what', 'why', 'state', 'actions', 'trigger', 'topology'];
  const incomplete = reg.items.filter((i) => DIMENSIONS.some((d) => !(d in i)));
  ok(incomplete.length === 0, `every item carries all six dimensions (${DIMENSIONS.join(', ')})`,
    incomplete.map((i) => i.id).join(', '));

  /* State and topology are the two that must never be absent: one is read from the source or from
     the position its preamble states for every entry, the other is derived. */
  const noState = reg.items.filter((i) => !i.state);
  ok(noState.length === 0, 'every item states where it stands', noState.map((i) => i.id).join(', '));

  const VALID = ['SEQUENCE-DEPENDENT', 'INDEPENDENT', 'PARALLEL-EXECUTION-NEUTRAL'];
  const badTopology = reg.items.filter((i) => !VALID.includes(i.topology));
  ok(badTopology.length === 0, 'every item carries one of the three topologies',
    badTopology.map((i) => `${i.id}=${i.topology}`).join(', '));

  const noBasis = reg.items.filter((i) => !i.basis || i.basis.length < 20);
  ok(noBasis.length === 0, 'every topology verdict states the basis it rests on',
    noBasis.map((i) => i.id).join(', '));

  /* An item with no stated closure criterion must say what would establish one — otherwise the
     absence reads as an oversight rather than a property of the source. */
  const silentGap = reg.items.filter((i) => !i.triggerEstablished && !i.wouldEstablish);
  ok(silentGap.length === 0,
    `every item lacking a closure criterion names what would establish one (${reg.items.filter((i) => !i.triggerEstablished).length} lack one)`,
    silentGap.map((i) => i.id).join(', '));

  ok(/not established by the source/.test(md),
    'the document states an absent criterion in words rather than leaving it blank');
}

/* ------------------------------------------------------------------ *
 * 3 · nothing is invented
 * ------------------------------------------------------------------ */

{
  const bySourceId = new Map(sourceOpen.map((e) => [e.id, e]));

  /* Every field the register presents as read must be identical to what the library read. A
     generator that rephrases, summarises or completes a source field would fail here — which is
     the point: the register's value is that it is quotable back to the document it came from. */
  const READ = ['what', 'why', 'trigger', 'owner', 'severity', 'category', 'validation'];
  const drifted = [];
  for (const i of reg.items) {
    const e = bySourceId.get(i.id);
    if (!e) continue;
    for (const f of READ) if ((i[f] ?? null) !== (e[f] ?? null)) drifted.push(`${i.id}.${f}`);
    if (JSON.stringify(i.actions) !== JSON.stringify(e.actions || [])) drifted.push(`${i.id}.actions`);
    if (JSON.stringify(i.inputs) !== JSON.stringify(e.inputs || [])) drifted.push(`${i.id}.inputs`);
  }
  ok(drifted.length === 0, 'every read field is exactly what its source states',
    drifted.slice(0, 12).join(', '));

  /* A closure criterion may only be claimed where something actually supplies one. That used to
     be two sources — the readiness register and the governance position — and the rule was written
     as those two names. It is now three: the flow-truth review states none per finding, but
     docs/audits/flow-truth-coverage.json declares, per finding, the assertion that answers it or
     what would. Naming the sources here was the wrong shape: the permission belongs to the
     declaration, so the test reads it rather than carrying a list that goes stale the next time a
     source gains a criterion. */
  const declared = JSON.parse(read('docs/deployment/OUTSTANDING_SOURCES.json'));
  const CAN_STATE = new Set(declared.sources
    .filter((s) => s.counted !== false && (s.reader === 'json-items' || s.reader === 'json-open-closed' || s.supersededBy))
    .map((s) => s.id));
  const invented = reg.items.filter((i) => i.triggerEstablished && !CAN_STATE.has(i.source));
  ok(invented.length === 0,
    `only a source that states a closure criterion, or declares where one comes from, carries one (${[...CAN_STATE].join(', ')})`,
    invented.map((i) => `${i.id} (${i.source})`).join(', '));
}

/* ------------------------------------------------------------------ *
 * 4 · the graph is consistent, and resolves
 * ------------------------------------------------------------------ */

{
  const byId = new Map(reg.items.map((i) => [i.id, i]));

  /* If A waits on B, then B must record A as waiting on it. A one-way edge means one of the two
     rows was composed rather than derived. */
  const asymmetric = [];
  for (const i of reg.items) {
    for (const b of i.blockedBy) {
      const other = byId.get(b);
      if (other && !other.blocking.includes(i.id)) asymmetric.push(`${i.id} waits on ${b}, ${b} does not record it`);
    }
    for (const b of i.blocking) {
      const other = byId.get(b);
      if (other && !other.blockedBy.includes(i.id)) asymmetric.push(`${b} is said to wait on ${i.id}, ${b} does not record it`);
    }
  }
  ok(asymmetric.length === 0, 'the dependency graph agrees with itself in both directions',
    asymmetric.slice(0, 6).join('; '));

  /* An item that waits on something open, or that something open waits on, cannot be free. */
  const misfiled = reg.items.filter((i) =>
    (i.blockedBy.length || i.blocking.length) && i.topology !== 'SEQUENCE-DEPENDENT');
  ok(misfiled.length === 0, 'nothing with an open predecessor or successor is filed as free',
    misfiled.map((i) => `${i.id}=${i.topology}`).join(', '));

  /* And the converse: PARALLEL-EXECUTION-NEUTRAL must mean exactly what the document says it
     means — no stated relation in either direction, and no ordering sentence. */
  const overclaimed = reg.items.filter((i) => i.topology === 'PARALLEL-EXECUTION-NEUTRAL'
    && (i.blockedBy.length || i.blocking.length || i.releasedBy.length));
  ok(overclaimed.length === 0, 'nothing filed as parallel-neutral carries a stated relation',
    overclaimed.map((i) => i.id).join(', '));

  /* blockedBy and blocking name OPEN items, so every one of them must be enumerated here. */
  const dangling = reg.items.flatMap((i) =>
    [...i.blockedBy, ...i.blocking].filter((d) => !byId.has(d)).map((d) => `${i.id} → ${d}`));
  ok(dangling.length === 0, 'every open predecessor and successor is itself enumerated',
    dangling.slice(0, 8).join(', '));

  /* releasedBy names items that have CLOSED, which is why they are not enumerated — the register
     lists open work. Each must nonetheless be a real row in a real source, or the claim "it has
     closed" is being made about nothing. */
  const closedIds = new Set(results.flatMap((r) => r.closed).map((e) => e.id));
  const phantom = reg.items.flatMap((i) =>
    i.releasedBy.filter((d) => !closedIds.has(d)).map((d) => `${i.id} → ${d}`));
  ok(phantom.length === 0,
    'every discharged prerequisite is a real closed row, not an id nothing holds',
    phantom.slice(0, 8).join(', '));

  /* Unresolved references are REPORTED, never dropped. A prerequisite naming something no counted
     source holds is either a sixth register or a stale citation, and both matter. */

  ok(Array.isArray(reg.unresolvedReferences),
    `unresolved prerequisite references are reported rather than dropped (${reg.unresolvedReferences.length})`);
  if (reg.unresolvedReferences.length) {
    ok(/could not resolve/i.test(md), 'the document surfaces them for a reader');
  }
}

/* ------------------------------------------------------------------ *
 * 5 · the ordering rule still rejects what it claims to reject
 * ------------------------------------------------------------------ */

{
  /* MUTATION, IN THE IDIOM THE REST OF THIS SUITE USES.
   *
   * The first version of the ordering rule matched the bare phrase `depends on`, and fired on C5's
   * "the one field a consecutive-failures alert depends on can never exceed the value this run
   * wrote" — a sentence about a column, filed as a constraint on sequence. The first version of
   * the range rule let a range's second end be a bare number, and read `ITEM-9 — 39 of 77 flows`
   * as ITEM-9 through ITEM-39: one prose dash, thirty-one invented dependencies.
   *
   * Both are fixed. These two assertions are what stop them coming back, by putting the exact
   * sentences that broke each rule through it again. */
  const { readers } = await import('../scripts/lib/outstanding-sources.mjs');
  const probe = (text) => readers['markdown-headings'](
    { headingPattern: '^###\\s+([BSC]\\d+)\\s+·\\s+(.+)$', allOpen: true, allOpenBecause: 'probe' },
    text)[0];

  const descriptive = probe('### C5 · A column\n\nThe one field a "consecutive failures" alert '
    + 'depends on can never exceed the value this run wrote.\n');
  ok(descriptive && !descriptive.ordering,
    'prose that merely mentions a dependency is not read as a constraint on order',
    `read: ${descriptive && descriptive.ordering}`);

  const real = probe('### C6 · A real one\n\nIt cannot be pasted until the two lists are provisioned.\n');
  ok(real && real.ordering, 'a sentence that does constrain order is still read as one');

  const falseRange = probe('### B1 · A prose dash\n\nSee C1 — 9 of 77 flows have no stated purpose.\n');
  ok(falseRange && !falseRange.deps.includes('C5'),
    'a prose dash between an id and a number is not read as a range',
    `read deps: ${falseRange && falseRange.deps.join(', ')}`);

  const realRange = probe('### S1 · A real range\n\nThe package does not save (C1–C4).\n');
  ok(realRange && ['C1', 'C2', 'C3', 'C4'].every((d) => realRange.deps.includes(d)),
    'a written range is expanded into every member, not just its two ends',
    `read deps: ${realRange && realRange.deps.join(', ')}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
