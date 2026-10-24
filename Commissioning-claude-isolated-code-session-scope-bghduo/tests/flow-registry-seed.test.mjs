#!/usr/bin/env node
/**
 * THE SEED MUST COUNT, AND MUST NOT KNOW WHAT IT CANNOT KNOW.
 *
 * docs/reference/FLOW_REGISTRY_SEED.json is the estate's single register of flows: one row per
 * flow, in DGO_HTTPFlowRegistry column shape, carrying both identifier spaces so that the join
 * GOV-06 measures as impossible becomes a column. Two things can go wrong with a document like
 * that, and they pull in opposite directions.
 *
 *   IT CAN UNDERCOUNT. The two corpora offer 115 records describing 109 flows — four flow GUIDs
 *   carry two exported definitions each under different names, one register workflow id is
 *   recorded twice, and one matched flow serves two workflow ids. Collapsing those is correct.
 *   Collapsing them SILENTLY is the failure this whole baseline was corrected for: a number that
 *   went down for a good reason is indistinguishable from a number that went down by accident.
 *   So the arithmetic has to close in public — offered − merged = rows — and every merge has to
 *   name both sides.
 *
 *   IT CAN OVERCLAIM. Twelve of the thirty-six columns need a person: who owns this flow, how
 *   critical it is, when it was last seen. A generator that writes a plausible owner email
 *   produces a register that reads as knowledge and is fiction — which is exactly what the
 *   flow-truth review raises as C2, C3 and C4 against the package built to write this list.
 *   Four of those twelve are REQUIRED, so the register cannot be written until somebody supplies
 *   them, and that fact must survive in the document rather than being smoothed away.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nFlow registry seed — the single register, and what it refuses to claim\n');

const TARGET = 'docs/reference/FLOW_REGISTRY_SEED.json';

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-flow-registry-seed.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run registry:seed is current', out.trim().split('\n').slice(-2).join(' '));
}

if (!existsSync(join(ROOT, TARGET))) {
  console.log(`\n❌ ${TARGET} does not exist — run npm run registry:seed\n`);
  process.exit(1);
}

const seed = read(TARGET);
const spec = read('docs/reference/http-flow-registry-spec.json');
const defmap = read('docs/reference/flow-definition-map.json');
const rows = seed.registryRows;

/* ------------------------------------------------------------------ *
 * 1 · the arithmetic closes in public
 * ------------------------------------------------------------------ */

{
  ok(seed.totals.recordsOffered - seed.totals.mergedDuplicateRecords === rows.length,
    `offered − merged = rows (${seed.totals.recordsOffered} − ${seed.totals.mergedDuplicateRecords} = ${rows.length})`);
  ok(seed.totals.reconciles === true, 'the document asserts its own reconciliation');
  ok(seed.totals.registryRows === rows.length, 'the stated row count matches the rows');

  /* Every record the two corpora hold must reach a row. A flow that reached none would be a flow
     the single register does not know, which defeats the document. */
  const flowIds = new Set(rows.map((r) => r.FlowId).filter(Boolean));
  const workflowIds = new Set(rows.map((r) => r.WorkflowId).filter(Boolean));

  const exportsMissing = [...defmap.matched, ...defmap.unmatchedExports]
    .filter((e) => !flowIds.has(e.internalName)).map((e) => e.name);
  ok(exportsMissing.length === 0,
    `every exported definition reaches a row (${defmap.matched.length + defmap.unmatchedExports.length} definitions)`,
    exportsMissing.slice(0, 5).join(', '));

  const registerMissing = defmap.unexportedRegisterWorkflows
    .filter((w) => !workflowIds.has(w.workflowId)).map((w) => w.workflowId);
  ok(registerMissing.length === 0,
    `every register workflow reaches a row (${defmap.unexportedRegisterWorkflows.length} unexported + matched)`,
    registerMissing.slice(0, 5).join(', '));

  /* A merge must name both sides and say why. A merge list of ids nobody can check is the silent
     collapse wearing a receipt. */
  const thin = (seed.mergedRecords || []).filter((m) => !m.keptAs || !m.mergedIn || !m.reason);
  ok(thin.length === 0,
    `every merge names both records and its reason (${(seed.mergedRecords || []).length} merges)`,
    thin.map((m) => m.registryKey).join(', '));

  /* And a merged row must keep the name it absorbed, or the rename is lost. */
  const lostNames = (seed.mergedRecords || []).filter((m) => {
    const row = rows.find((r) => r.RegistryKey === m.registryKey);
    return row && m.mergedIn !== row.FlowName && !(row._alsoKnownAs || []).includes(m.mergedIn);
  });
  ok(lostNames.length === 0, 'a merged row carries the name it absorbed',
    lostNames.map((m) => m.mergedIn).join(', '));
}

/* ------------------------------------------------------------------ *
 * 2 · identity is recorded, never guessed
 * ------------------------------------------------------------------ */

{
  const unkeyed = rows.filter((r) => !r.RegistryKey);
  ok(unkeyed.length === 0, 'every row carries the list\'s unique key');

  const keys = rows.map((r) => r.RegistryKey);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  ok(dupes.length === 0, 'RegistryKey is unique across the register', [...new Set(dupes)].join(', '));

  const idless = rows.filter((r) => !r.FlowId && !r.WorkflowId);
  ok(idless.length === 0, 'every row carries at least one real identifier',
    idless.map((r) => r.FlowName).join(', '));

  /* The whole point of the register: the rows that carry both. It must equal the name-join the
     reconciler reports, because those are the only 13 anything can join today. */
  const both = rows.filter((r) => r.FlowId && r.WorkflowId).length;
  ok(both === seed.totals.carryingBothIdentifiers, 'the stated both-identifier count matches the rows');
  ok(both === defmap.matched.length,
    `the rows carrying both identifiers are exactly the name-join (${both} = ${defmap.matched.length})`,
    'a row carrying both without a join behind it would be an invented link');

  /* An identifier that does not look like its identifier space is a value from somewhere else. */
  const badFlow = rows.filter((r) => r.FlowId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.FlowId));
  ok(badFlow.length === 0, 'every FlowId is a 36-character dashed GUID', badFlow.slice(0, 3).map((r) => r.FlowId).join(', '));
  const badWf = rows.filter((r) => r.WorkflowId && !/^[0-9a-f]{32}$/i.test(r.WorkflowId));
  ok(badWf.length === 0, 'every WorkflowId is 32 hex characters', badWf.slice(0, 3).map((r) => r.WorkflowId).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3 · it does not know what it cannot know
 * ------------------------------------------------------------------ */

{
  const cls = seed.columnClassification;
  const columns = spec.fields.filter((f) => f.listTitle === 'DGO_HTTPFlowRegistry').map((f) => f.internalName);

  const classified = new Set([...cls.seeded, ...cls.atWriteTime, ...cls.requiresDecision]);
  const missing = columns.filter((c) => !classified.has(c));
  ok(missing.length === 0, `every registry column is classified (${columns.length} columns)`, missing.join(', '));

  /* NOT ONE ROW MAY CARRY A VALUE IN A COLUMN THAT NEEDS A PERSON.
     This is the assertion that stops the register becoming fiction. */
  const invented = [];
  for (const r of rows) {
    for (const c of cls.requiresDecision) {
      if (r[c] !== undefined && r[c] !== null && r[c] !== '') invented.push(`${r.FlowName}.${c}=${r[c]}`);
    }
  }
  ok(invented.length === 0,
    `no row carries a value in the ${cls.requiresDecision.length} columns that need a person`,
    invented.slice(0, 5).join(', '));

  /* Same for the counters and clocks the write owns. */
  const preWritten = [];
  for (const r of rows) {
    for (const c of cls.atWriteTime) {
      if (r[c] !== undefined && r[c] !== null) preWritten.push(`${r.FlowName}.${c}`);
    }
  }
  ok(preWritten.length === 0,
    `no row pre-writes the ${cls.atWriteTime.length} columns the registration write owns`,
    preWritten.slice(0, 5).join(', '));

  /* And the document must say plainly that four REQUIRED columns block the write. Losing this
     makes the register look ready when it is not. */
  const requiredBlockers = cls.requiresDecisionAndIsRequired || [];
  const actuallyRequired = cls.requiresDecision.filter((c) => spec.fields.some(
    (f) => f.listTitle === 'DGO_HTTPFlowRegistry' && f.internalName === c && f.required === 'Yes'));
  ok(requiredBlockers.length === actuallyRequired.length && requiredBlockers.length > 0,
    `the document names the ${actuallyRequired.length} required columns that block the write`,
    `document says ${requiredBlockers.length}, contract says ${actuallyRequired.length}`);
  ok(seed.totals.requiredColumnsNeedingADecision === actuallyRequired.length,
    'and counts them consistently');
}

/* ------------------------------------------------------------------ *
 * 4 · the list side
 * ------------------------------------------------------------------ */

{
  const lists = seed.lists || [];
  ok(lists.length > 0, `the register carries the lists too (${lists.length})`);

  /* A dependency must point at a row that exists, or the edge is dangling. */
  const keys = new Set(rows.map((r) => r.RegistryKey));
  const dangling = (seed.dependencyRows || []).filter((d) => !keys.has(d.RegistryKey));
  ok(dangling.length === 0, `every dependency names a registry row (${(seed.dependencyRows || []).length} edges)`,
    dangling.slice(0, 4).map((d) => d.RegistryKey).join(', '));

  /* Existence is read, not assumed: a list that resolves to nothing must say so, and the seven
     registry lists are the clearest case — they are what Step 5 creates. */
  const absent = lists.filter((l) => !l.exists).map((l) => l.listTitle);
  const registryLists = spec.lists.map((l) => l.listTitle);
  const registryAbsent = registryLists.filter((t) => absent.includes(t));
  ok(registryAbsent.length === registryLists.filter((t) => lists.some((l) => l.listTitle === t)).length,
    'every HTTP registry list a flow references is reported as not existing',
    `absent: ${registryAbsent.length}`);

  ok(lists.every((l) => typeof l.exists === 'boolean'),
    'every list states whether it exists, rather than leaving it unsaid');
  ok(lists.filter((l) => l.exists).every((l) => l.resolvedVia === 'guid' || l.resolvedVia === 'title'),
    'every list that exists records how it resolved — by GUID or by title');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
