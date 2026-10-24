#!/usr/bin/env node
/**
 * The patch engine — does an insert leave the flow in sequence, or in parallel?
 *
 * Logic Apps orders by `runAfter`, not position. An action added without repairing the chain
 * produces a flow that saves, runs, and is wrong: the new action executes alongside the one it
 * was meant to follow. That is the exact failure the designer also allows, so the engine that
 * replaces the designer has to be held to a higher standard than "it did not throw".
 *
 * Run: node tests/flow-patch.test.mjs
 */

import assert from 'node:assert/strict';
import {
  resolveContainer, firstOf, insertAfter, insertFirst,
  replaceParameters, repointSwitch, addCase, setComposeKey, collect, validate,
} from '../scripts/lib/flow-patch.mjs';

let passed = 0, failed = 0;
const t = (label, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${label}`); }
  catch (e) { failed++; console.log(`  ❌ ${label}\n       ${e.message}`); }
};
const section = (s) => console.log(`\n${s}`);

/** A chain A -> B -> C, plus a Switch with one case and an If with an else. */
const fixture = () => ({
  actions: {
    A: { type: 'Compose', inputs: 1, runAfter: {} },
    B: { type: 'Compose', inputs: 2, runAfter: { A: ['Succeeded'] } },
    C: { type: 'Compose', inputs: 3, runAfter: { B: ['Succeeded'] } },
    Sw: {
      type: 'Switch', expression: "@triggerBody()?['action']", runAfter: { C: ['Succeeded'] },
      cases: { Case_One: { case: 'one', actions: { P: { type: 'Compose', runAfter: {} } } } },
      default: { actions: { D: { type: 'Compose', runAfter: {} } } },
    },
    If1: {
      type: 'If', runAfter: { Sw: ['Succeeded'] },
      actions: { Y: { type: 'Compose', runAfter: {} } },
      else: { actions: { N: { type: 'Compose', runAfter: {} } } },
    },
    Item: {
      type: 'OpenApiConnection',
      inputs: { host: { operationId: 'PostItem' }, parameters: { dataset: 'old', table: 'old' } },
      runAfter: { If1: ['Succeeded'] },
    },
    Rec: { type: 'Compose', inputs: { request: { method: 'GET' } }, runAfter: { Item: ['Succeeded'] } },
  },
});

section('Paths');

t('a nested path resolves through cases and else branches', () => {
  const d = fixture();
  assert.ok(resolveContainer(d, 'Sw/case:Case_One').P);
  assert.ok(resolveContainer(d, 'If1/else').N);
  assert.ok(resolveContainer(d, 'Sw/default').D);
  assert.ok(resolveContainer(d, '').A);
});

t('a path that does not exist is named, not guessed at', () => {
  const d = fixture();
  assert.throws(() => resolveContainer(d, 'Sw/case:Nope'), /no case Nope/);
  assert.throws(() => resolveContainer(d, 'Missing'), /no action Missing/);
});

section('Insertion keeps the flow in sequence');

t('insertAfter takes over the successor, so the chain stays a chain', () => {
  const d = fixture();
  insertAfter(d.actions, 'X', { type: 'Compose' }, 'A');
  assert.deepEqual(Object.keys(d.actions.X.runAfter), ['A']);
  assert.deepEqual(Object.keys(d.actions.B.runAfter), ['X'], 'B must now follow X, not A');
  assert.equal(validate(d).length, 0);
});

t('and the successor is not left running in parallel', () => {
  /* The bug this whole file exists for: without the hand-off, B and X both follow A and the
     flow is valid, saves, runs, and does the wrong thing. */
  const d = fixture();
  insertAfter(d.actions, 'X', { type: 'Compose' }, 'A');
  const followingA = Object.entries(d.actions)
    .filter(([, a]) => Object.keys(a.runAfter || {}).includes('A')).map(([n]) => n);
  assert.deepEqual(followingA, ['X'], 'exactly one action may follow A');
});

t('insertFirst pushes the old first action behind it', () => {
  const d = fixture();
  insertFirst(d.actions, 'Z', { type: 'Compose' });
  assert.equal(firstOf(d.actions), 'Z');
  assert.deepEqual(Object.keys(d.actions.A.runAfter), ['Z']);
  assert.equal(validate(d).length, 0);
});

t('insertFirst works in an empty branch', () => {
  const d = fixture();
  const empty = {};
  insertFirst(empty, 'Only', { type: 'Compose' });
  assert.deepEqual(Object.keys(empty.Only.runAfter), []);
  assert.equal(validate({ actions: empty }).length, 0);
  assert.ok(d);
});

t('a duplicate name is refused rather than silently overwriting', () => {
  const d = fixture();
  assert.throws(() => insertAfter(d.actions, 'B', { type: 'Compose' }, 'A'), /already exists/);
  assert.throws(() => insertFirst(d.actions, 'A', { type: 'Compose' }), /already exists/);
});

t('inserting after an action in another container is refused', () => {
  const d = fixture();
  assert.throws(() => insertAfter(d.actions, 'X', { type: 'Compose' }, 'P'), /not in this container/);
});

t('non-default run-after states are preserved', () => {
  const d = fixture();
  insertAfter(d.actions, 'Catch', { type: 'Scope' }, 'C', ['Failed', 'Skipped', 'TimedOut']);
  assert.deepEqual(d.actions.Catch.runAfter.C, ['Failed', 'Skipped', 'TimedOut']);
});

section('Edits to existing actions');

t('parameters are replaced without disturbing wiring', () => {
  const d = fixture();
  const before = JSON.stringify(d.actions.Item.runAfter);
  replaceParameters(d, 'Item', { dataset: 'new-site', table: 'new-guid', 'item/Title': 'x' });
  assert.deepEqual(d.actions.Item.inputs.parameters, { dataset: 'new-site', table: 'new-guid', 'item/Title': 'x' });
  assert.equal(d.actions.Item.inputs.host.operationId, 'PostItem', 'the connector must survive');
  assert.equal(JSON.stringify(d.actions.Item.runAfter), before);
});

t('a Switch can be repointed and given a case', () => {
  const d = fixture();
  repointSwitch(d, 'Sw', "@outputs('Compose_Switch_Key')");
  addCase(d, 'Sw', 'Case_Rate_Limited', 'rate-limited', { S: { type: 'SetVariable', runAfter: {} } });
  assert.equal(d.actions.Sw.expression, "@outputs('Compose_Switch_Key')");
  assert.equal(d.actions.Sw.cases.Case_Rate_Limited.case, 'rate-limited');
  assert.ok(d.actions.Sw.cases.Case_One, 'the existing case must survive');
  assert.equal(validate(d).length, 0);
});

t('a duplicate case is refused', () => {
  const d = fixture();
  assert.throws(() => addCase(d, 'Sw', 'Case_One', 'one', {}), /already exists/);
});

t('a key can be added inside a Compose without rewriting the rest', () => {
  const d = fixture();
  setComposeKey(d, 'Rec', 'request', 'headers_redacted', "@outputs('Compose_Redacted_Headers')");
  assert.equal(d.actions.Rec.inputs.request.method, 'GET', 'existing keys survive');
  assert.equal(d.actions.Rec.inputs.request.headers_redacted, "@outputs('Compose_Redacted_Headers')");
});

section('Validation catches what a save would not');

t('a runAfter naming a non-sibling is reported', () => {
  const d = fixture();
  d.actions.C.runAfter = { P: ['Succeeded'] };
  assert.match(validate(d).join('\n'), /C runs after P, which is not a sibling/);
});

t('two actions starting in parallel are reported', () => {
  const d = fixture();
  d.actions.C.runAfter = {};
  assert.match(validate(d).join('\n'), /start in parallel/);
});

t('a container with no entry point is reported', () => {
  const d = { actions: { A: { type: 'Compose', runAfter: { B: ['Succeeded'] } }, B: { type: 'Compose', runAfter: { A: ['Succeeded'] } } } };
  assert.match(validate(d).join('\n'), /cannot start/);
});

t('a clean fixture validates clean', () => {
  assert.deepEqual(validate(fixture()), []);
});

t('collect reaches every action, at the path it sits at', () => {
  const paths = collect(fixture()).map((a) => a.path);
  for (const p of ['A', 'Sw', 'Sw/case:Case_One/P', 'Sw/default/D', 'If1/Y', 'If1/else/N', 'Item']) {
    assert.ok(paths.includes(p), `${p} was not collected`);
  }
});

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
