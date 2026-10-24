#!/usr/bin/env node
/**
 * A PROPOSAL MUST STAY A PROPOSAL.
 *
 * docs/reference/REGISTRY_DECISIONS.md proposes values for two of the four REQUIRED registry
 * columns, so the agency ratifies rather than authors. The single thing that makes that safe is
 * that a proposal never becomes a value: it lives in this sheet, marked, with the rule that
 * produced it, and NOT in docs/reference/FLOW_REGISTRY_SEED.json.
 *
 * The moment a proposal leaks into the seed it stops being a proposal and starts being a fact
 * nobody decided — which is the failure this estate has now paid for three times: C2, C3 and C4 of
 * the flow-truth review, and a "21 of 25" this session wrote into four register items on no
 * evidence at all. So the leak is what is tested, in both directions.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nRegistry decisions — a proposal must stay a proposal\n');

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-registry-decisions.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run registry:decisions is current', out.trim().split('\n').slice(-2).join(' '));
}

const TARGET = 'docs/reference/REGISTRY_DECISIONS.json';
if (!existsSync(join(ROOT, TARGET))) {
  console.log(`\n❌ ${TARGET} does not exist — run npm run registry:decisions\n`);
  process.exit(1);
}

const sheet = read(TARGET);
const seed = read('docs/reference/FLOW_REGISTRY_SEED.json');
const COLS = sheet.columns.map((c) => c.column);

/* ------------------------------------------------------------------ *
 * 1 · it covers the seed, exactly
 * ------------------------------------------------------------------ */

{
  ok(sheet.decisions.length === seed.registryRows.length,
    `every registry row has a decision row (${sheet.decisions.length} of ${seed.registryRows.length})`);

  const seedKeys = new Set(seed.registryRows.map((r) => r.RegistryKey));
  const stray = sheet.decisions.filter((d) => !seedKeys.has(d.RegistryKey));
  ok(stray.length === 0, 'no decision row names a flow the seed does not hold',
    stray.slice(0, 4).map((d) => d.FlowName).join(', '));

  /* The four columns here must be exactly the four the seed declares as required-and-human. */
  const seedRequired = seed.columnClassification.requiresDecisionAndIsRequired || [];
  ok(COLS.length === seedRequired.length && COLS.every((c) => seedRequired.includes(c)),
    `the sheet covers exactly the ${seedRequired.length} required columns the seed names`,
    `sheet: ${COLS.join(', ')} | seed: ${seedRequired.join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * 2 · nothing leaks into the seed
 * ------------------------------------------------------------------ */

{
  const leaked = [];
  for (const r of seed.registryRows) {
    for (const c of COLS) {
      if (r[c] !== undefined && r[c] !== null && r[c] !== '') leaked.push(`${r.FlowName}.${c}`);
    }
  }
  ok(leaked.length === 0,
    'not one proposal has become a value in the seed',
    leaked.slice(0, 5).join(', '));

  /* And the seed still refuses to carry them at all — if that assertion were ever relaxed, this
     document would have quietly become the register. */
  ok((seed.columnClassification.requiresDecision || []).length > 0,
    'the seed still classifies these columns as needing a person');
}

/* ------------------------------------------------------------------ *
 * 3 · every proposal states the rule that produced it
 * ------------------------------------------------------------------ */

{
  const unreasoned = [];
  for (const d of sheet.decisions) {
    for (const c of COLS) {
      const p = d.proposals[c];
      if (!p) { unreasoned.push(`${d.FlowName}.${c} — absent`); continue; }
      if (!p.status) unreasoned.push(`${d.FlowName}.${c} — no status`);
      if (!p.because) unreasoned.push(`${d.FlowName}.${c} — no reason`);
    }
  }
  ok(unreasoned.length === 0, 'every cell states its status and its reason',
    unreasoned.slice(0, 5).join(', '));

  /* A proposal is only made for a column the sheet declares proposable. Proposing an owner email
     would be the whole failure. */
  const notProposable = sheet.columns.filter((c) => !c.proposable).map((c) => c.column);
  const overreach = [];
  for (const d of sheet.decisions) {
    for (const c of notProposable) if (d.proposals[c].proposed !== null) overreach.push(`${d.FlowName}.${c}`);
  }
  ok(overreach.length === 0,
    `nothing is proposed for the ${notProposable.length} columns declared not proposable (${notProposable.join(', ')})`,
    overreach.slice(0, 4).join(', '));

  /* Every proposed value must come from a declared rule, so a value cannot appear by accident. */
  const systemValues = new Set(sheet.rules.SystemName.map((r) => r.value));
  const critValues = new Set(sheet.rules.Criticality.map((r) => r.value).filter(Boolean));
  const off = [];
  for (const d of sheet.decisions) {
    const s = d.proposals.SystemName.proposed;
    if (s && !systemValues.has(s)) off.push(`SystemName=${s}`);
    const c = d.proposals.Criticality.proposed;
    if (c && !critValues.has(c)) off.push(`Criticality=${c}`);
  }
  ok(off.length === 0, 'every proposed value is one a declared rule can produce',
    [...new Set(off)].join(', '));
}

/* ------------------------------------------------------------------ *
 * 4 · the arithmetic the sheet leads with
 * ------------------------------------------------------------------ */

{
  const t = sheet.totals;
  ok(t.blanks === t.rows * t.columns, `blanks = rows × columns (${t.rows} × ${t.columns} = ${t.blanks})`);

  const ratify = sheet.decisions.reduce((n, d) =>
    n + COLS.filter((c) => d.proposals[c].proposed !== null).length, 0);
  ok(t.toRatify === ratify, `the ratify count matches the cells (${t.toRatify})`);

  /* The headline claim — that it is not 436 — has to add up, or it is a nicer number rather than
     a truer one. */
  ok(t.toRatify + t.toAuthor + t.toObserve === t.blanks,
    `ratify + author + observe = blanks (${t.toRatify} + ${t.toAuthor} + ${t.toObserve} = ${t.blanks})`);

  ok(t.needsPerson.TechnicalOwnerEmail === t.rows,
    'every row still needs an owner — the column nothing can propose');
  ok(t.toObserve === t.rows,
    'LastSeenUtc is counted as an observation on every row, not as a decision');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
