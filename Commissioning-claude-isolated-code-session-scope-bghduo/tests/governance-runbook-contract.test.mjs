#!/usr/bin/env node
/**
 * The governance runbook's internal contract.
 *
 * WHY THIS EXISTS
 *
 * GOVERNANCE-TENANT-RUNBOOK.md opens by saying every GUID and count in it is read from its sources, so it
 * "cannot quote a stale one". That was true of the GUIDs and false of everything else. What
 * `npm run test:governancerunbook` checked was that the file matched its generator — not that the
 * generator said anything coherent. So the document shipped, under that header, with:
 *
 *   · a step that told the operator to exercise four flows against lists the next step deferred,
 *     including the consumer registry — without which the retirement guard cannot answer 409 at
 *     all, so its own blocked-path test would have reported 200 and read like a pass;
 *   · a completion checklist whose rows 4 and 5 could not both be satisfied;
 *   · a blocked-path test calling flow 07 with `source`, a field that flow does not read, so the
 *     consumer row it was supposed to create was never created;
 *   · a register side that did not add up — 51 − 13 = 38, reported as 37 — because 13 exported
 *     names match 14 register rows and the table had no row to say so;
 *   · an exit criterion of 77 for a measure bounded above by 51.
 *
 * Every one of those is a property of the numbers and the payloads, not of the prose. This file
 * asserts the properties. It is deliberately about the CONTRACT the document has to satisfy, so
 * a future edit that reintroduces one of these fails here rather than in the tenant.
 *
 * Usage:  node tests/governance-runbook-contract.test.mjs
 * Exit:   0 = every property holds, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisioningScope, CONFIG_LIST } from '../scripts/lib/registry-provisioning-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const spec = J('docs/reference/http-flow-registry-spec.json');
const map = J('docs/reference/flow-definition-map.json');
const registry = J('docs/reference/governance-list-registry.json');
const correctedDir = path.join(ROOT, 'docs/deployment/governance/flows');
const corrections = fs.readdirSync(correctedDir)
  .filter((f) => f.endsWith('.corrected.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(correctedDir, f), 'utf8')));
const runbook = fs.readFileSync(path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md'), 'utf8');

console.log('\nThe runbook reconciles with its own sources\n');

check('the export side of the definition map adds up', () => {
  const { exportedDefinitions, matchedByName, unmatchedExports } = map.totals;
  assert(exportedDefinitions - matchedByName === unmatchedExports,
    `${exportedDefinitions} − ${matchedByName} ≠ ${unmatchedExports}`);
});

check('the register side adds up once ambiguous matches are counted as rows', () => {
  const rows = map.matched.reduce((n, m) => n + m.registerWorkflowIds.length, 0);
  assert(map.totals.registerWorkflows - rows === map.totals.unexportedRegisterWorkflows,
    `${map.totals.registerWorkflows} − ${rows} ≠ ${map.totals.unexportedRegisterWorkflows}`);
  assert(rows >= map.totals.matchedByName,
    'matched register rows cannot be fewer than the exports that matched them');
});

check('the runbook shows the matched-row count, not only the matched-name count', () => {
  const rows = map.matched.reduce((n, m) => n + m.registerWorkflowIds.length, 0);
  if (rows === map.totals.matchedByName) return; // nothing to disambiguate
  assert(runbook.includes(`| Register rows those matches cover | ${rows} |`),
    'the Step 6 table omits the matched-row count, so its register side cannot be reconciled by a reader');
});

check('GOV-06 does not close on a target the measure cannot reach', () => {
  const ceiling = Math.min(map.totals.registerWorkflows, map.totals.exportsWithHttpTrigger);
  if (ceiling >= map.totals.exportedDefinitions) return; // the bound no longer bites
  assert(!new RegExp(`idOverlap\`? reaches ${map.totals.exportedDefinitions}`).test(runbook),
    `the runbook closes GOV-06 at ${map.totals.exportedDefinitions}, but idOverlap is bounded above by ${ceiling}`);
  assert(runbook.includes(`bounded above by ${ceiling}`),
    'the runbook does not state the ceiling, so a reader cannot tell the target is unreachable');
});

console.log('\nStep 5 provisions what Step 5.4 exercises\n');

const scope = provisioningScope({ spec, corrections });

check('every list a corrected flow reads or writes is in scope', () => {
  const missing = scope.required.filter((t) => !scope.provisionNow.includes(t));
  assert(missing.length === 0, `deferred but written to: ${missing.join(', ')}`);
});

check('the configuration list is in scope even though nothing writes to it', () => {
  assert(scope.provisionNow.includes(CONFIG_LIST), `${CONFIG_LIST} is not provisioned`);
});

check('nothing deferred is also required', () => {
  const both = scope.deferred.filter((t) => scope.required.includes(t));
  assert(both.length === 0, `${both.join(', ')} is both deferred and required`);
});

check('the scope follows the definitions rather than a hand-kept list', () => {
  /* A flow that starts touching a deferred list must move the scope on the next build. */
  const candidate = scope.specLists.find((t) => !scope.required.includes(t) && t !== CONFIG_LIST);
  if (!candidate) return; // everything is already required
  const synthetic = { definition: { actions: { Probe: { inputs: { uri: `getByTitle('${candidate}')` } } } } };
  const widened = provisioningScope({ spec, corrections: [...corrections, synthetic] });
  assert(widened.provisionNow.includes(candidate),
    `${candidate} stayed deferred after a flow started writing to it`);
});

check('the runbook provisions every list it later tells the operator to write to', () => {
  for (const t of scope.required) {
    assert(runbook.includes(`| \`${t}\` |`), `${t} is exercised but absent from the Step 5 table`);
  }
});

console.log('\nThe path tests can produce the outcomes they claim\n');

/* Anchor on the bash comments, not on the words. Section 4.3 also says "PATH 3" — in prose, to
   explain why the test does not belong there — and a loose match starts the slice at that
   sentence and runs through the flow 02 examples above it. */
const path3Block = () => {
  const m = /^# PATH 3 —[\s\S]*?^# PATH 4 —/m.exec(runbook);
  assert(m, "PATH 3's command block is not in the runbook");
  return m[0];
};

check('the blocked path gives flow 07 the key flow 05 counts consumers by', () => {
  /* Flow 05 counts DGO_HTTPFlowConsumerRegistry rows by RegistryKey, and composes that key as
     <environmentId>|<flowId> from the retirement request. If the runbook hands flow 07 anything
     else, the consumer row is invisible to the guard and PATH 3 answers 200. */
  const body = path3Block();
  const reg = /flow 02 trigger URL[\s\S]*?"flowId":"([^"]+)"[\s\S]*?"environmentId":"([^"]+)"/.exec(body);
  assert(reg, 'PATH 3 does not register a flow through 02');
  const [, flowId, envId] = reg;
  const expected = `${envId}|${flowId}`;
  assert(body.includes(`"registryKey":"${expected}"`),
    `flow 07 is not given registryKey ${expected}; the consumer row would not be counted`);
  assert(body.includes(`"flowId":"${flowId}"`), 'PATH 3 retires a different flow from the one it registered');
});

check('the flow 07 payload carries every field that flow rejects a request without', () => {
  const flow07 = corrections.find((c) => c.flow.startsWith('07'));
  assert(flow07, 'no corrected flow 07');
  let message = '';
  const walk = (o, name) => {
    if (!o || typeof o !== 'object') return;
    if (o.type === 'Response' && name === 'Respond_Invalid_Input') message = String(o.inputs?.body?.message ?? '');
    for (const [k, v] of Object.entries(o)) if (k !== 'inputs') walk(v, k);
  };
  walk(flow07.definition.actions, 'root');
  assert(message, 'flow 07 has no invalid-input message to read its required fields from');
  const required = message.split(' are required')[0].split(/,| and /).map((w) => w.trim()).filter(Boolean);
  const named = required.filter((w) => /^[a-z][A-Za-z]+$/.test(w));
  assert(named.length, `no field names parsed from: ${message}`);
  const block = path3Block();
  for (const field of named) {
    assert(block.includes(`"${field}"`), `PATH 3's flow 07 call omits ${field}, which flow 07 rejects the request without`);
  }
});

console.log('\nThe document does not contradict itself\n');

check('the checklist row that expects a 409 is the row that provisions the consumer list', () => {
  const rows = runbook.split('\n').filter((l) => /^\| \d \| /.test(l));
  const with409 = rows.filter((l) => l.includes('409'));
  assert(with409.length === 1, `${with409.length} checklist rows mention a 409; exactly one should`);
  assert(/Provision registry lists/.test(with409[0]),
    'the 409 is expected by a step that does not provision the consumer registry');
});

check('no two numbered subsections share a number', () => {
  const nums = runbook.split('\n').map((l) => /^### (\d+\.\d+[a-z]?) /.exec(l)?.[1]).filter(Boolean);
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
  assert(dupes.length === 0, `duplicate subsection number(s): ${[...new Set(dupes)].join(', ')}`);
});

check('the flow GUID column is not labelled with the other identifier space', () => {
  assert(!/Workflow GUID/i.test(runbook),
    'a 36-character FlowId is labelled "Workflow GUID"; a WorkflowId is 32 hex characters');
});

check('the keep and retire sets stay disjoint, and every duplicate resolves to a kept list', () => {
  const keep = new Set(registry.lists.map((l) => l.listGuid));
  const collide = registry.retire.filter((r) => keep.has(r.listGuid));
  assert(collide.length === 0, `${collide.length} retirement target(s) are also in the keep set`);
  const dangling = registry.retire.filter((r) => !keep.has(r.supersededBy));
  assert(dangling.length === 0, `${dangling.length} duplicate(s) are superseded by a GUID not being kept`);
});

check('Step 1 has a procedure this estate can actually run', () => {
  assert(runbook.includes('scripts/backup-governance-lists.browser.js'),
    'the mandatory first gate names no browser procedure, and PnP interactive sign-in is ruled out here');
  assert(fs.existsSync(path.join(ROOT, 'scripts/backup-governance-lists.browser.js')),
    'the runbook names a backup script that does not exist');
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
