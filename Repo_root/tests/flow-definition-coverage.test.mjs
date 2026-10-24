#!/usr/bin/env node
/**
 * Does every contract key resolve to an exported flow definition?
 *
 * WHY THIS EXISTS
 *
 * `scripts/reconcile-flow-definitions.mjs` already joins the two corpora and writes
 * `docs/folio-Master-Flows-and-Endpoints/registers/flow-definition-map.json`. Its `--check` mode asserts one thing: that the
 * committed map has not drifted from a fresh run. It does not assert anything about what the map
 * SAYS. So the map can report `in register, not exported 37` on every run, for months, and the
 * build stays green — the number is printed, read by nobody, and nothing gets worse when it grows.
 *
 * That is the difference between a report and a gate. This file is the gate.
 *
 * WHAT IT MEASURES, AND WHAT IT CANNOT
 *
 * The map's own `idOverlapNote` states the limit, and it is severe:
 *
 *     Zero exported definitions carry an id the register knows. The join is therefore by name
 *     and is evidence rather than proof: two flows may share a name, and a rename breaks the
 *     link silently.
 *
 * So a key resolving here means "an exported definition carries a name the register recognises
 * for the workflow serving this key". It does not mean the definition is the flow the platform
 * calls. A key NOT resolving means this repository holds no definition it can tie to that key —
 * a gap in the corpus, not evidence the flow is absent from the tenant. Neither direction is
 * proof, and this test states that rather than implying more than the join can carry.
 *
 * This is GOV-06. The remedy is already designed and not yet provisioned: a registry row
 * carrying both identifiers — `DGO_HTTPFlowRegistry.WorkflowId` alongside the dashed flow GUID —
 * which would replace the name join with a real one. See `tests/flow-definition-coverage-baseline.json`.
 *
 * THE RATCHET
 *
 * 18 of 25 keys do not resolve today. Failing on all 18 would mean a permanently red build,
 * which is how a gate gets deleted. So the baseline records the accepted state and may only
 * shrink: a key that starts resolving must be removed from the baseline in the same commit, and
 * a key that stops resolving fails. Same for the two join artefacts the map already shows — an
 * ambiguous match, and two cases of one definition claimed by two keys.
 *
 * Run: node tests/flow-definition-coverage.test.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const MAP = 'docs/folio-Master-Flows-and-Endpoints/registers/flow-definition-map.json';
const BASELINE = 'tests/flow-definition-coverage-baseline.json';

const map = read(MAP);
const baseline = read(BASELINE);

const failures = [];
let passed = 0;
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── what the map says ────────────────────────────────────────────────────────────────── */

/** key -> exported definitions whose register workflow serves it */
const resolved = new Map();
for (const row of map.matched) {
  for (const key of row.servesKeys || []) {
    if (!resolved.has(key)) resolved.set(key, []);
    resolved.get(key).push(row.name);
  }
}

/** key -> register workflow names that serve it but have no export */
const unresolved = new Map();
for (const row of map.unexportedRegisterWorkflows) {
  for (const key of row.servesKeys || []) {
    if (!unresolved.has(key)) unresolved.set(key, []);
    unresolved.get(key).push(...(row.names || []));
  }
}

const allKeys = new Set([...resolved.keys(), ...unresolved.keys()]);
const baselinedKeys = new Set(baseline.unresolvedKeys.map((r) => r.key));

console.log('\nFlow definition coverage (GOV-06)\n');

/* ── 1. the map still describes the estate the baseline was measured against ───────────── */

check('every contract key the register serves appears in the map', () => {
  assert(allKeys.size === map.totals.contractKeys,
    `the map reports ${map.totals.contractKeys} contract keys but ${allKeys.size} appear in `
    + `matched/unexportedRegisterWorkflows. The map's shape has changed; re-read it before `
    + `trusting this test.`);
});

/* ── 2. the ratchet: unresolved keys ───────────────────────────────────────────────────── */

check('no contract key has lost its definition', () => {
  const lost = [...unresolved.keys()].filter((k) => !baselinedKeys.has(k) && !resolved.has(k));
  assert(!lost.length,
    `${lost.length} contract key(s) no longer resolve to an exported definition and are not `
    + `baselined:\n      ${lost.join('\n      ')}\n`
    + `      Usually a rename on one side of a display-name join. Find the cause before `
    + `recording the loss — see ${BASELINE}.`);
});

check('the baseline has no key that now resolves', () => {
  const stale = baseline.unresolvedKeys
    .map((r) => r.key)
    .filter((k) => resolved.has(k));
  assert(!stale.length,
    `${stale.length} baselined key(s) now resolve to an exported definition and must be removed `
    + `from ${BASELINE} in this commit:\n      ${stale.join('\n      ')}\n`
    + `      A baseline that keeps rows it no longer needs stops being a measure of progress.`);
});

/* ── 3. the ratchet: join artefacts ────────────────────────────────────────────────────── */

check('no new ambiguous match', () => {
  const known = new Set(baseline.ambiguousDefinitions.map((r) => r.name));
  const now = map.matched.filter((r) => r.ambiguous).map((r) => r.name);
  const added = now.filter((n) => !known.has(n));
  assert(!added.length,
    `${added.length} exported definition(s) newly match the register ambiguously — the display `
    + `name is reused, so which file the register means is undetermined:\n      ${added.join('\n      ')}`);
});

check('the baseline lists no ambiguity that has been resolved', () => {
  const now = new Set(map.matched.filter((r) => r.ambiguous).map((r) => r.name));
  const stale = baseline.ambiguousDefinitions.map((r) => r.name).filter((n) => !now.has(n));
  assert(!stale.length,
    `${stale.length} baselined ambiguity(ies) no longer apply and must be removed from ${BASELINE}:\n`
    + `      ${stale.join('\n      ')}`);
});

check('no new definition is claimed by more than one contract key', () => {
  const known = new Set(baseline.sharedDefinitions.map((r) => r.definition));
  const byDefinition = new Map();
  for (const [key, names] of resolved) {
    for (const n of names) {
      if (!byDefinition.has(n)) byDefinition.set(n, []);
      byDefinition.get(n).push(key);
    }
  }
  const added = [...byDefinition.entries()]
    .filter(([n, keys]) => keys.length > 1 && !known.has(n))
    .map(([n, keys]) => `${n} <- ${keys.sort().join(', ')}`);
  assert(!added.length,
    `${added.length} exported definition(s) are newly claimed by more than one contract key. `
    + `Either one flow serves both, or the name join has collapsed two flows into one row:\n`
    + `      ${added.join('\n      ')}`);
});

/* ── report ────────────────────────────────────────────────────────────────────────────── */

const resolvedCount = [...allKeys].filter((k) => resolved.has(k)).length;

console.log('');
console.log(`  contract keys              ${allKeys.size}`);
console.log(`  resolve to a definition    ${resolvedCount}`);
console.log(`  baselined as unresolved    ${baseline.unresolvedKeys.length}`);
console.log(`  definitions shared by keys ${baseline.sharedDefinitions.length} (baselined)`);
console.log('');
console.log('  The join is by display name and is evidence, not proof — a resolved key is not');
console.log('  the same claim as "this file is the flow the platform calls". See GOV-06.');

if (failures.length) {
  console.error(`\n❌ ${passed} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log(`\n✅ ${passed} passed, 0 failed\n`);
