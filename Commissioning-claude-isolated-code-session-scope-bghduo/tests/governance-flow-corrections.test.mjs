#!/usr/bin/env node
/**
 * The corrected governance flows answer their callers, and the retirement is guarded.
 *
 * WHY THESE ASSERTIONS AND NOT "IT HAS A RESPONSE ACTION"
 *
 * `05 - GOV - Retire HTTP Flow` as deployed HAS a Response action. It is called `Reply`, it
 * parses, and it never runs: it sits after a scope whose every branch ends in a Terminate. A
 * check for the presence of a Response would have called that flow correct. So every assertion
 * here is about REACHABILITY — a Response must sit before its Terminate in the same branch,
 * with the Terminate rewired to run after it — and about the four execution paths of the
 * retirement guard returning distinguishable, deterministic answers.
 *
 * Usage:  node tests/governance-flow-corrections.test.mjs
 * Exit:   0 = the corrections hold, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs/deployment/governance/flows');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const corrections = fs.readdirSync(DIR).filter((f) => f.endsWith('.corrected.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));

/** Walk every action container, yielding [containerActions, name, action]. */
function* walk(actions) {
  for (const [name, a] of Object.entries(actions || {})) {
    yield [actions, name, a];
    if (a.actions) yield* walk(a.actions);
    if (a.else?.actions) yield* walk(a.else.actions);
  }
}

console.log(`\nGovernance flow corrections — ${corrections.length} flow(s)\n`);

check('all four HTTP governance flows have a corrected definition', () => {
  assert(corrections.length === 4, `${corrections.length} correction(s) present; expected 4`);
  for (const id of ['02', '03', '05', '07']) {
    assert(corrections.some((c) => c.flow.startsWith(id)), `no correction for flow ${id}`);
  }
});

/* ── GOV-04 ───────────────────────────────────────────────────────────────────────────── */

check('every Terminate is preceded by a Response in the same branch', () => {
  const bare = [];
  for (const c of corrections) {
    for (const [siblings, name, a] of walk(c.definition.actions)) {
      if (a.type !== 'Terminate') continue;
      const after = Object.keys(a.runAfter || {});
      const responder = after.find((dep) => siblings[dep]?.type === 'Response');
      if (!responder) bare.push(`${c.flow}: ${name} runs after ${after.join(', ') || '(nothing)'} — no Response among them`);
    }
  }
  assert(bare.length === 0, `${bare.length} Terminate(s) still answer nothing:\n      ${bare.join('\n      ')}`);
});

check('no Response is stranded behind an action that always terminates', () => {
  /* The `Reply` defect, asserted directly: a Response whose transitive runAfter chain passes
     through something that ends the run can never execute, however well-formed it is. */
  const alwaysTerminates = (a) => {
    if (!a) return false;
    if (a.type === 'Terminate') return true;
    if (a.type === 'If') {
      return Object.values(a.actions || {}).some(alwaysTerminates)
        && Object.values(a.else?.actions || {}).some(alwaysTerminates);
    }
    if (a.type === 'Scope') return Object.values(a.actions || {}).some(alwaysTerminates);
    return false;
  };
  const stranded = [];
  for (const c of corrections) {
    for (const [siblings, name, a] of walk(c.definition.actions)) {
      if (a.type !== 'Response') continue;
      const unreachable = (n, seen = new Set()) => {
        if (seen.has(n)) return false;
        seen.add(n);
        return Object.keys(siblings[n]?.runAfter || {})
          .some((dep) => alwaysTerminates(siblings[dep]) || unreachable(dep, seen));
      };
      if (unreachable(name)) stranded.push(`${c.flow}: ${name}`);
    }
  }
  assert(stranded.length === 0, `${stranded.length} unreachable Response action(s):\n      ${stranded.join('\n      ')}`);
});

check('the HTTP status matches the run status it answers for', () => {
  const wrong = [];
  for (const c of corrections) {
    for (const [siblings, name, a] of walk(c.definition.actions)) {
      if (a.type !== 'Terminate') continue;
      const responder = Object.keys(a.runAfter || {}).find((d) => siblings[d]?.type === 'Response');
      const status = siblings[responder]?.inputs?.statusCode;
      const run = a.inputs?.runStatus;
      if (run === 'Succeeded' && status !== 200) wrong.push(`${c.flow}: ${name} succeeds but answers ${status}`);
      if (run === 'Failed' && (status < 400 || status > 599)) wrong.push(`${c.flow}: ${name} fails but answers ${status}`);
    }
  }
  assert(wrong.length === 0, `${wrong.length} mismatch(es):\n      ${wrong.join('\n      ')}`);
});

check('every Response carries a deterministic, machine-readable body', () => {
  const thin = [];
  for (const c of corrections) {
    for (const [, name, a] of walk(c.definition.actions)) {
      if (a.type !== 'Response') continue;
      const b = a.inputs?.body;
      if (!b || typeof b !== 'object') { thin.push(`${c.flow}.${name}: no object body`); continue; }
      for (const key of ['outcome', 'status', 'flow', 'runId']) {
        if (!(key in b)) thin.push(`${c.flow}.${name}: body has no \`${key}\``);
      }
      if (a.inputs?.headers?.['Content-Type'] !== 'application/json') {
        thin.push(`${c.flow}.${name}: not declared application/json`);
      }
    }
  }
  assert(thin.length === 0, `${thin.length} problem(s):\n      ${thin.join('\n      ')}`);
});

check('each outcome value is distinguishable — a caller can branch on it', () => {
  for (const c of corrections) {
    const outcomes = [];
    for (const [, , a] of walk(c.definition.actions)) {
      if (a.type === 'Response') outcomes.push(a.inputs?.body?.outcome);
    }
    assert(outcomes.length >= 2, `${c.flow}: only ${outcomes.length} response(s)`);
    assert(outcomes.includes('succeeded'), `${c.flow}: no success outcome`);
    assert(outcomes.some((o) => o !== 'succeeded'), `${c.flow}: no failure outcome`);
    assert(new Set(outcomes).size === outcomes.length || new Set(outcomes).size >= 2,
      `${c.flow}: outcomes are not distinguishable — ${outcomes.join(', ')}`);
  }
});

/* ── GOV-05 ───────────────────────────────────────────────────────────────────────────── */

const retire = corrections.find((c) => /Retire HTTP Flow/.test(c.flow));
const scopeMain = () => retire.definition.actions
  .Scope_05_GOV_Retire_HTTP_Flow_COMPLETE_UPDATED.actions.Scope_Main.actions;

check('the retirement counts active consumers and dependencies before any write', () => {
  const A = scopeMain();
  for (const n of ['Count_Active_Consumers', 'Count_Active_Dependencies', 'Compose_Active_Counts']) {
    assert(A[n], `${n} is missing`);
  }
  /* Both counts must be GETs. A count that writes is not a count. */
  for (const n of ['Count_Active_Consumers', 'Count_Active_Dependencies']) {
    assert(A[n].inputs?.parameters?.['parameters/method'] === 'GET',
      `${n} is not a GET — it must not write`);
  }
  /* And nothing that writes may run before the gate. */
  const gate = A.If_Safe_To_Retire;
  assert(gate, 'If_Safe_To_Retire is missing');
  const beforeGate = Object.entries(A).filter(([n]) => n !== 'If_Safe_To_Retire');
  const writesBefore = beforeGate.filter(([, a]) =>
    ['POST', 'PATCH', 'MERGE', 'DELETE'].includes(String(a.inputs?.parameters?.['parameters/method']).toUpperCase()));
  assert(writesBefore.length === 0,
    `${writesBefore.length} write(s) run before the guard: ${writesBefore.map(([n]) => n).join(', ')}`);
});

check('the cascade runs only when both counts are zero, or force is true', () => {
  const gate = scopeMain().If_Safe_To_Retire;
  const expr = JSON.stringify(gate.expression);
  assert(/activeConsumers/.test(expr) && /activeDependencies/.test(expr),
    'the gate does not test both counts');
  assert(/force/.test(expr), 'the gate does not honour the force flag');
  assert(gate.expression.or?.length === 2, 'the gate is not "both zero OR forced"');
});

check('the cascade actions sit inside the guarded branch, not outside it', () => {
  const A = scopeMain();
  const inside = Object.keys(A.If_Safe_To_Retire.actions || {});
  for (const n of ['Retire_Consumers', 'Retire_Dependencies', 'Retire_Registry', 'Close_Contracts']) {
    assert(!A[n], `${n} is still outside the guard — it would run on a blocked retirement`);
    assert(inside.includes(n), `${n} is not inside the guarded branch`);
  }
});

check('the blocked path answers 409 with both counts and a remedy, then fails', () => {
  const blocked = scopeMain().If_Safe_To_Retire.else.actions;
  const r = blocked.Respond_Retirement_Blocked;
  assert(r, 'the blocked branch has no Response');
  assert(r.inputs.statusCode === 409, `blocked answers ${r.inputs.statusCode}, expected 409`);
  for (const key of ['activeConsumers', 'activeDependencies', 'reason', 'remedy']) {
    assert(key in r.inputs.body, `the blocked response omits \`${key}\``);
  }
  const t = blocked.Terminate_Retirement_Blocked;
  assert(t?.inputs?.runStatus === 'Failed', 'the blocked branch does not terminate Failed');
  assert(Object.keys(t.runAfter || {}).includes('Respond_Retirement_Blocked'),
    'the blocked Terminate does not run after its Response — the caller would get nothing');
});

check('a forced retirement is recorded where it can be read afterwards', () => {
  const inside = scopeMain().If_Safe_To_Retire.actions;
  const rec = inside.Record_Forced_Retirement;
  assert(rec, 'nothing records that a retirement was forced');
  const s = JSON.stringify(rec.inputs);
  assert(/force/.test(s), 'the record does not carry the force flag');
  assert(/activeConsumers/.test(s) && /activeDependencies/.test(s),
    'the record does not carry the counts at the moment of retirement');
});

check('the four execution paths are distinct and each returns exactly one status', () => {
  /* blocked · invalid input · registry not found · retired (safe or forced share this path). */
  const A = scopeMain();
  const statuses = new Map();
  for (const [siblings, name, a] of walk(retire.definition.actions)) {
    if (a.type !== 'Response') continue;
    statuses.set(name, a.inputs.statusCode);
    /* Exactly one status: a Response cannot answer twice. */
    assert(typeof a.inputs.statusCode === 'number', `${name} has a non-numeric status`);
  }
  const codes = [...statuses.values()];
  for (const expected of [400, 404, 409, 200]) {
    assert(codes.includes(expected),
      `no path answers ${expected} — paths present: ${[...statuses].map(([n, c]) => `${n}=${c}`).join(', ')}`);
  }
  assert(A.If_Safe_To_Retire.else.actions.Respond_Retirement_Blocked.inputs.statusCode === 409,
    'the blocked path is not the 409');
});

check('the unreachable `Reply` is gone', () => {
  assert(!retire.definition.actions.Reply,
    '`Reply` is still present — it ran after a scope that always terminates and never executed');
});

check('`force` is declared on the trigger, not an undocumented magic field', () => {
  const trigger = Object.values(retire.definition.triggers).find((t) => t.kind === 'Http');
  const force = trigger.inputs?.schema?.properties?.force;
  assert(force, 'the trigger schema does not declare `force`');
  assert(force.type === 'boolean', `\`force\` is declared ${force.type}, expected boolean`);
  assert(!(trigger.inputs.schema.required || []).includes('force'),
    '`force` is required — it must default to absent, which means "do not force"');
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
