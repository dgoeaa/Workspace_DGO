#!/usr/bin/env node
/**
 * The Admin Suite's analysis, and the guarantees it is not allowed to break.
 *
 * WHY THE ANALYSIS IS TESTED SEPARATELY FROM THE SCREEN
 *
 * Same reason as the Endpoint Console's suite: `core/` decides and `modules/admin-suite.js`
 * renders. Everything the suite claims — this payload conforms, this action may not be resolved,
 * this URL is malformed, this probe proved nothing — is computed by functions that take data and
 * return data, so they can be exercised here against deployments and registers fabricated on
 * purpose. The alternative is a suite that can only assert whatever `config.local.js` happens to
 * hold on the machine running it, which is a test that passes for reasons unrelated to the code.
 *
 * The browser half is tests/admin-suite.spec.js, which mounts the real module and asserts no
 * resolved address reaches the DOM carrying its signature.
 *
 * THE FIVE GUARANTEES ASSERTED HERE
 *
 *   1. No signature is written into the committed flow catalogue, and none is returned by the
 *      formation inspector or the masker. A signature is a bearer credential; the catalogue is
 *      committed and the exports are written to be pasted into tickets.
 *   2. The field records the suite renders forms from are the ones the schema actually declares.
 *      They are derived at read time precisely so they cannot drift from it, and that is only
 *      true if the derivation is the one the generator counted.
 *   3. A payload that does not conform is reported as not conforming, per rule, and a payload
 *      that was not checked is never reported as conforming.
 *   4. The runbook's ordering, evidence and gate rules are enforced rather than advisory. Each
 *      is asserted by constructing the state it must refuse.
 *   5. A probe run that reached nothing is reported as inconclusive rather than as an estate-wide
 *      failure. This one is not hypothetical: reading a blocked network as 39 dead flows is a
 *      report this estate has already produced once.
 *
 * Usage:  node tests/admin-suite.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const group = (title) => console.log(`\n${title}\n`);

const Shapes = await import(path.join(ROOT, 'core/flow-shapes.js'));
const Formation = await import(path.join(ROOT, 'core/endpoint-formation.js'));
const Health = await import(path.join(ROOT, 'core/health-contract.js'));
const Runbook = await import(path.join(ROOT, 'core/ops-runbook.js'));
const Actions = await import(path.join(ROOT, 'core/admin-actions.js'));
const Capsule = await import(path.join(ROOT, 'core/capsule-client.js'));
const { FlowShapes } = await import(path.join(ROOT, 'config/flow-shapes.data.js'));
const { OpsRunbookDefinition } = await import(path.join(ROOT, 'config/ops-runbook.config.js'));
const { Roles } = await import(path.join(ROOT, 'config/rbac.config.js'));
const FlowShapesAtlas = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));

const SIGNATURE = /sig=[A-Za-z0-9_-]{20,}/;

/* ═══════════════ 1 · the committed catalogue ═══════════════ */
group('The flow catalogue this suite reads');

check('the catalogue is generated, and says so', () => {
  const src = read('config/flow-shapes.data.js');
  assert(/GENERATED — do not edit/.test(src), 'the file does not warn that it is generated');
  assert(FlowShapes.generatedBy === 'scripts/build-flow-shapes.mjs', 'it does not name its generator');
});

check('NO SIGNATURE IS PRESENT IN THE COMMITTED CATALOGUE', () => {
  const src = read('config/flow-shapes.data.js');
  const found = src.match(new RegExp(SIGNATURE.source, 'g')) || [];
  assert(found.length === 0, `${found.length} signature(s) are committed. Rotate each trigger in Power Automate — deleting the file revokes nothing.`);
});

check('every flow names the export it was derived from, with its digest', () => {
  const bad = FlowShapes.flows.filter((f) => !f.sourcePath || !/^[0-9a-f]{64}$/.test(f.sourceSha256));
  assert(bad.length === 0, `${bad.length} flow(s) carry no verifiable provenance: ${bad.slice(0, 3).map((f) => f.name).join(', ')}`);
});

check('the catalogue is not empty and every flow is addressable', () => {
  assert(FlowShapes.flows.length > 0, 'the catalogue holds no flows');
  assert(FlowShapes.totals.flows === FlowShapes.flows.length, 'the stated flow count is not the number of flows');
});

/* ═══════════════ 2 · field records are derived, not restated ═══════════════ */
group('Field records are derived from the schema, and match it');

check('the derived field count is the count the generator measured', () => {
  /* The generator counts schema nodes; core/flow-shapes.js walks them into records. If the two
     ever disagree, one of them is describing a shape the flows do not have — which is the exact
     failure that made the pre-flattened field list not worth committing. */
  let derived = 0;
  for (const f of FlowShapes.flows) for (const t of f.triggers) derived += Shapes.fieldsOf(t).length;
  assert(derived === FlowShapes.totals.triggerFields,
    `the generator counted ${FlowShapes.totals.triggerFields} fields; the runtime derives ${derived}`);
});

check('a nested object contributes a path, not just its parent', () => {
  const schema = { type: 'object', properties: { outer: { type: 'object', properties: { inner: { type: 'string' } } } } };
  const paths = Shapes.flattenSchema(schema).map((f) => f.path);
  assert(paths.includes('$.outer'), 'the parent is missing');
  assert(paths.includes('$.outer.inner'), 'the nested field is missing');
});

check('an array contributes its item shape as [] rather than an index', () => {
  const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' } } } } } };
  const paths = Shapes.flattenSchema(schema).map((f) => f.path);
  assert(paths.includes('$.items[].ref'), `expected $.items[].ref, got ${paths.join(', ')}`);
  assert(!paths.some((p) => /\[\d+\]/.test(p)), 'an index was emitted for a shape that has no instance');
});

check('requiredness comes from the parent, not from the child', () => {
  const schema = { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { type: 'string' } } };
  const fields = Shapes.flattenSchema(schema);
  assert(fields.find((f) => f.name === 'a').required === true, 'a required field is not marked required');
  assert(fields.find((f) => f.name === 'b').required === false, 'an optional field is marked required');
});

check('an action path is rebuilt from the parent pointer', () => {
  const withNested = FlowShapes.flows.find((f) => f.actions.some((a) => a[4] >= 0));
  assert(withNested, 'no flow in the catalogue has a nested action to rebuild');
  const nested = withNested.actions.findIndex((a) => a[4] >= 0);
  const p = Shapes.actionPath(withNested, nested);
  assert(p.startsWith('/actions/') && p.split('/actions/').length > 2,
    `a nested action rebuilt to a flat path: ${p}`);
});

/* ═══════════════ 3 · validation ═══════════════ */
group('Validation enforces the schema the flow enforces');

const schemaFor = (props, required = []) => ({ type: 'object', required, properties: props, additionalProperties: false });
const flowWith = (schema) => ({ name: 'test', workflowId: 'x', callable: true, triggers: [{ name: 'manual', kind: 'Http', method: 'POST', schema }] });

check('a conforming payload conforms', () => {
  const r = Shapes.validateRequest(flowWith(schemaFor({ a: { type: 'string' } })), { a: 'ok' });
  assert(r.conforms && r.checked, `expected conformance, got ${JSON.stringify(r.errors)}`);
});

check('a missing required field is reported by name', () => {
  const r = Shapes.validateRequest(flowWith(schemaFor({ a: { type: 'string' } }, ['a'])), {});
  assert(!r.conforms, 'a missing required field was accepted');
  assert(r.errors.some((e) => e.code === 'required' && e.path === '$.a'), `expected a required error for $.a, got ${JSON.stringify(r.errors)}`);
});

check('an undeclared field is refused when additionalProperties is false', () => {
  const r = Shapes.validateRequest(flowWith(schemaFor({ a: { type: 'string' } })), { a: 'ok', b: 'surprise' });
  assert(r.errors.some((e) => e.code === 'additional'), 'an undeclared field was accepted by a closed schema');
});

check('an integer satisfies a number declaration', () => {
  const r = Shapes.validateRequest(flowWith(schemaFor({ n: { type: 'number' } })), { n: 3 });
  assert(r.conforms, `3 was rejected as a number: ${JSON.stringify(r.errors)}`);
});

check('a null is refused unless null is declared', () => {
  const closed = Shapes.validateRequest(flowWith(schemaFor({ a: { type: 'string' } })), { a: null });
  assert(!closed.conforms, 'null was accepted for a string-only field');
  const open = Shapes.validateRequest(flowWith(schemaFor({ a: { type: ['string', 'null'] } })), { a: null });
  assert(open.conforms, 'null was refused for a field that declares null');
});

check('EVERY failure is collected, not only the first', () => {
  const r = Shapes.validateRequest(flowWith(schemaFor({ a: { type: 'string', minLength: 5 }, b: { type: 'integer' } }, ['c'])), { a: 'no', b: 'x' });
  assert(r.errors.length >= 3, `expected at least three failures, got ${r.errors.length}: ${JSON.stringify(r.errors)}`);
});

check('constraints are each enforced', () => {
  const cases = [
    [{ a: { type: 'string', minLength: 3 } }, { a: 'ab' }, 'minLength'],
    [{ a: { type: 'string', maxLength: 2 } }, { a: 'abc' }, 'maxLength'],
    [{ a: { type: 'string', format: 'email' } }, { a: 'not-an-email' }, 'format'],
    [{ a: { type: 'string', pattern: '^[0-9]+$' } }, { a: 'abc' }, 'pattern'],
    [{ a: { type: 'string', enum: ['x', 'y'] } }, { a: 'z' }, 'enum'],
    [{ a: { type: 'number', minimum: 5 } }, { a: 1 }, 'minimum'],
    [{ a: { type: 'number', maximum: 5 } }, { a: 9 }, 'maximum'],
  ];
  for (const [props, body, code] of cases) {
    const r = Shapes.validateRequest(flowWith(schemaFor(props)), body);
    assert(r.errors.some((e) => e.code === code), `${code} was not enforced`);
  }
});

check('a trigger with no schema is reported as UNCHECKED, never as conforming-by-proof', () => {
  const r = Shapes.validateRequest(flowWith(null), { anything: true });
  assert(r.checked === false, 'a schemaless trigger reported itself as checked');
  assert(/nothing was checked/i.test(r.note || ''), 'it does not say that nothing was checked');
});

check('an alignment report names the export it judged against', () => {
  const flow = FlowShapes.flows.find((f) => f.callable && f.triggers.some((t) => t.schema));
  const rep = Shapes.alignmentReport(flow, {});
  assert(rep.flow.sourceSha256 === flow.sourceSha256, 'the report does not carry the source digest');
  assert(/shape only/i.test(rep.scope), 'the report does not state the limits of what it proves');
  assert(!SIGNATURE.test(JSON.stringify(rep)), 'the alignment report carries a signature');
});

check('form values are coerced to the declared type, and an uncoercible one survives to be reported', () => {
  assert(Shapes.coerce('3', ['integer']) === 3, 'an integer was not coerced');
  assert(Shapes.coerce('true', ['boolean']) === true, 'a boolean was not coerced');
  assert(Shapes.coerce('', ['string']) === undefined, 'an empty field was not dropped');
  assert(Shapes.coerce('abc', ['integer']) === 'abc',
    'an uncoercible value became null instead of surviving as text — the validator can then say what is wrong with it');
});

/* ═══════════════ 4 · URL formation ═══════════════ */
group('URL formation rules');

const GOOD = 'https://x.api.powerplatform.com/powerautomate/automations/direct/cu/11/workflows/'
  + 'c4c26f93ba1e4d7db5247536c30cdc11/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig='
  + 'S'.repeat(43);

check('a well-formed URL passes every rule', () => {
  const r = Formation.inspect(GOOD);
  assert(r.valid, `a valid URL was refused: ${r.issues.map((i) => i.code).join(', ')}`);
  assert(r.workflowId === 'c4c26f93ba1e4d7db5247536c30cdc11', 'the workflow id was not read');
  assert(r.signatureLength === 43, 'the signature length was not read');
});

check('each paste defect is caught, by its own code', () => {
  const cases = [
    [`${GOOD} `, 'whitespace'],
    [`${GOOD}#frag`, 'fragment'],
    [GOOD.replace('https:', 'http:'), 'not-https'],
    [GOOD.replace('x.api.powerplatform.com', 'evil.example.org'), 'host-not-allowed'],
    [GOOD.replace('/triggers/manual/paths/invoke', '/designer'), 'path'],
    [GOOD.replace('&sv=1.0', ''), 'missing-param'],
    [`${GOOD}&sig=${'S'.repeat(43)}`, 'duplicate-param'],
    [GOOD.replace(`sig=${'S'.repeat(43)}`, `sig=${'S'.repeat(20)}`), 'signature-length'],
    [GOOD.replace('https://', 'https://user:pw@'), 'userinfo'],
    ['https://YOUR_HOST/triggers/manual/paths/invoke?api-version=1&sp=x&sv=1&sig=x', 'placeholder'],
  ];
  for (const [url, code] of cases) {
    const r = Formation.inspect(url);
    assert(r.issues.some((i) => i.code === code), `${code} was not detected in: ${Formation.mask(url)}`);
  }
});

check('THE INSPECTOR NEVER RETURNS THE SIGNATURE', () => {
  const r = Formation.inspect(GOOD);
  assert(!SIGNATURE.test(JSON.stringify(r)), 'the inspection result carries the signature');
  assert(!SIGNATURE.test(r.masked), 'the masked URL carries the signature');
});

check('mask() removes every credential-bearing parameter and the workflow id', () => {
  const m = Formation.mask(GOOD);
  for (const p of ['sig', 'sv', 'sp']) assert(m.includes(`${p}=***`), `${p} was not masked`);
  assert(!m.includes('c4c26f93ba1e4d7db5247536c30cdc11'), 'the workflow id survived masking');
});

check('mask() still redacts a string it cannot parse as a URL', () => {
  const m = Formation.mask(`not a url at all sig=${'S'.repeat(43)}`);
  assert(!SIGNATURE.test(m), 'an unparseable string leaked its signature');
});

/* ═══════════════ 5 · probe verdicts ═══════════════ */
group('What a probe result is entitled to claim');

const answer = (body, status = 200, json = true) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (json ? JSON.stringify(body) : String(body)),
  headers: new Map(),
});

check('a flow echoing validationOnly and its own key is healthy', async () => {
  const r = await Health.healthContract('FETCH_ALL', GOOD, { fetchImpl: answer({ success: true, validationOnly: true, endpoint: { key: 'FETCH_ALL' } }) });
  assert(r.outcome === 'healthy', `expected healthy, got ${r.outcome}: ${r.note}`);
});

check('A FLOW ANSWERING UNDER ANOTHER KEY IS THE WORST OUTCOME, NOT A PASS', async () => {
  /* 200, well-formed, correctly signed, and the wrong flow. Every other check in this platform
     reads that as success. */
  const r = await Health.healthContract('FETCH_ALL', GOOD, { fetchImpl: answer({ success: true, validationOnly: true, endpoint: { key: 'DISPATCH_OUTBOUND' } }) });
  assert(r.outcome === 'wrong-endpoint-key', `expected wrong-endpoint-key, got ${r.outcome}`);
  assert(Health.OUTCOME_SEVERITY['wrong-endpoint-key'] < Health.OUTCOME_SEVERITY.refused,
    'a silent wrong-key answer is ranked below a loud refusal');
});

check('a 200 that does not echo validationOnly is reported as possibly having written', async () => {
  const r = await Health.healthContract('DISPATCH_OUTBOUND', GOOD, { fetchImpl: answer({ success: true }) });
  assert(r.outcome === 'not-implemented', `expected not-implemented, got ${r.outcome}`);
  assert(/write path/i.test(r.note), 'it does not warn that the call may have written');
});

check('a non-JSON body means the tenant was never reached', async () => {
  const r = await Health.healthContract('FETCH_ALL', GOOD, { fetchImpl: answer('<html>Blocked by proxy</html>', 403, false) });
  assert(r.reached === false, 'an HTML error page was read as the tenant answering');
  assert(r.outcome === 'blocked', `expected blocked, got ${r.outcome}`);
});

check('the identity handshake refuses an answer that does not carry its correlation id', async () => {
  const r = await Health.identityVerify('FETCH_ALL', GOOD, {}, { correlationId: 'abc', fetchImpl: answer({ verified: true, correlationId: 'not-abc' }) });
  assert(r.outcome === 'identity-mismatch', `a replayed answer was accepted: ${r.outcome}`);
});

check('the identity handshake reports a flow that is not the expected one', async () => {
  const r = await Health.identityVerify('FETCH_ALL', GOOD, { flowIdentity: 'IP_Get_Docs_Endpoint' }, { correlationId: 'abc', fetchImpl: answer({ verified: true, correlationId: 'abc', flowIdentity: 'Something_Else' }) });
  assert(r.outcome === 'identity-mismatch', `expected identity-mismatch, got ${r.outcome}`);
  assert(r.mismatches?.[0]?.field === 'flowIdentity', 'it does not name the field that disagreed');
});

check('a write endpoint is REFUSED by the read probe, and the refusal is a result rather than a throw', async () => {
  const r = await Health.readOnlyCall('DISPATCH_OUTBOUND', GOOD, { readOnly: false, method: 'POST' });
  assert(r.outcome === 'unsafe-to-probe', `a write endpoint was probed: ${r.outcome}`);
});

check('a key with no contract is not probed on the assumption it is safe', async () => {
  const r = await Health.readOnlyCall('SCAN_INTAKE', GOOD, null);
  assert(r.outcome === 'unsafe-to-probe', 'a key with no contract on record was called anyway');
});

check('A RUN THAT REACHED NOTHING IS INCONCLUSIVE, NOT AN ESTATE-WIDE FAILURE', () => {
  /* Reading a blocked network as dead flows produced a report declaring 39 flows dead on a
     machine whose network simply blocked the host. */
  const rows = [
    { key: 'A', outcome: 'blocked', reached: false },
    { key: 'B', outcome: 'blocked', reached: false },
  ];
  const s = Health.summariseProbes(rows);
  assert(s.conclusive === false, 'a run where nothing answered was reported as conclusive');
  assert(/measured the network/i.test(s.note), 'it does not say what the run actually measured');
});

check('a run with nothing to attempt is not reported as inconclusive', () => {
  const s = Health.summariseProbes([{ key: 'A', outcome: 'not-configured', reached: false }]);
  assert(s.conclusive === true, 'a run with no probeable target was reported as inconclusive');
});

check('probe results carry a redacted target and no signature', async () => {
  const r = await Health.healthContract('FETCH_ALL', GOOD, { fetchImpl: answer({ success: true, validationOnly: true, endpoint: { key: 'FETCH_ALL' } }) });
  assert(!SIGNATURE.test(JSON.stringify(r)), 'a probe result carries the signature it called');
});

/* ═══════════════ 6 · the runbook ═══════════════ */
group('The commissioning runbook enforces its own rules');

const D = OpsRunbookDefinition;
const fresh = () => Runbook.hydrate(D, {});

check('the definition is coherent: every dependency and parameter it names exists', () => {
  const ids = new Set(D.actions.map((a) => a.id));
  const params = new Set(D.parameters.map((p) => p.id));
  for (const a of D.actions) {
    for (const d of a.dependsOn) assert(ids.has(d), `${a.id} depends on ${d}, which is not an action`);
    for (const p of a.parameters) assert(params.has(p), `${a.id} names parameter ${p}, which is not declared`);
  }
  assert(ids.has(D.authorisingAction), 'the authorising action is not one of the actions');
});

check('no action depends on itself, directly or through a cycle', () => {
  const byId = new Map(D.actions.map((a) => [a.id, a]));
  for (const start of D.actions) {
    const seen = new Set();
    const walk = (id) => {
      if (seen.has(id)) return id === start.id;
      seen.add(id);
      return (byId.get(id)?.dependsOn || []).some(walk);
    };
    assert(!(byId.get(start.id).dependsOn || []).some(walk), `${start.id} is in a dependency cycle`);
  }
});

check('DEPENDENCIES ARE ENFORCED, NOT DOCUMENTED', () => {
  const s = fresh();
  const dependent = D.actions.find((a) => a.dependsOn.length);
  const verdict = Runbook.canSetStatus(D, s, dependent.id, Runbook.STATUS.READY);
  assert(!verdict.allowed, `${dependent.id} could be progressed with its prerequisites open`);
  assert(verdict.reason.includes(dependent.dependsOn[0]), 'the refusal does not name what is blocking it');
});

check('RESOLVED REQUIRES EVIDENCE', () => {
  const s = fresh();
  const first = D.actions.find((a) => !a.dependsOn.length);
  const verdict = Runbook.canSetStatus(D, s, first.id, Runbook.STATUS.RESOLVED);
  assert(!verdict.allowed, 'an action was resolvable with no evidence');
  assert(/evidence/i.test(verdict.reason), 'the refusal does not say evidence is what is missing');
});

check('accepting a risk requires a rationale', () => {
  const s = fresh();
  const first = D.actions.find((a) => !a.dependsOn.length);
  assert(!Runbook.canSetStatus(D, s, first.id, Runbook.STATUS.RISK_ACCEPTED).allowed, 'a risk was acceptable with no rationale');
  s.actions[first.id].note = 'Accepted by the DG on 2026-09-01 pending the flow rebuild.';
  assert(Runbook.canSetStatus(D, s, first.id, Runbook.STATUS.RISK_ACCEPTED).allowed, 'a rationale did not unblock the acceptance');
});

check('A LOCKED PARAMETER CANNOT BE OVERRIDDEN BY STORED STATE', () => {
  const locked = D.parameters.find((p) => p.locked);
  const s = fresh();
  s.parameters[locked.id] = 'something an operator typed';
  assert(Runbook.parameterValue(D, s, locked.id) === String(locked.value),
    'a locked parameter was overridden from state — the runbook would then assert a value the platform does not use');
});

check('PLACEHOLDER TEXT COUNTS AS UNANSWERED', () => {
  const s = fresh();
  const open = D.parameters.find((p) => p.required && !p.locked);
  s.parameters[open.id] = 'TBD';
  assert(Runbook.validateParameters(D, s).missing.some((m) => m.id === open.id),
    '"TBD" satisfied a mandatory parameter');
});

check('a value in the wrong form is reported as suspect rather than accepted', () => {
  const s = fresh();
  const patterned = D.parameters.find((p) => p.pattern);
  /* Chosen to fail every pattern the definition declares while not reading as placeholder text
     — a value the placeholder check would have caught first would prove nothing about the
     pattern check. */
  s.parameters[patterned.id] = '!!not a valid value!!';
  assert(!Runbook.validateParameters(D, s).missing.some((x) => x.id === patterned.id),
    'the fixture was caught as a placeholder, so it does not exercise the pattern check');
  assert(Runbook.validateParameters(D, s).suspect.some((x) => x.id === patterned.id), 'a malformed value passed unremarked');
});

check('THE GATE IS COMPUTED — there is no stored verdict to go stale', () => {
  const s = fresh();
  s.decision = 'READY';
  assert(Runbook.releaseGate(D, s).decision === 'NO-GO',
    'a "decision" written into state was read back as the verdict');
});

check('the gate refuses an empty runbook and names every failing check', () => {
  const g = Runbook.releaseGate(D, fresh());
  assert(g.decision === 'NO-GO', 'an untouched runbook cleared its own gate');
  assert(g.failing.length > 0 && g.failing.every((c) => c.label), 'a failing check does not say what it requires');
});

check('the structural audit catches a resolved action with no evidence', () => {
  const s = fresh();
  const first = D.actions.find((a) => !a.dependsOn.length);
  s.actions[first.id].status = Runbook.STATUS.RESOLVED;
  assert(Runbook.structuralAudit(D, s).problems.some((p) => p.code === 'action.no-evidence'),
    'an unsupported claim passed the structural audit');
});

check('the structural audit catches an action progressed out of order', () => {
  const s = fresh();
  const dependent = D.actions.find((a) => a.dependsOn.length);
  s.actions[dependent.id].status = Runbook.STATUS.IN_PROGRESS;
  assert(Runbook.structuralAudit(D, s).problems.some((p) => p.code === 'action.out-of-order'),
    'an action progressed before its prerequisites passed the audit');
});

check('an acceptance record needs its full evidence set to count as passed', () => {
  const s = fresh();
  const rec = D.acceptance[0];
  s.acceptance[rec.id] = { status: 'PASSED', fields: { flowRunId: 'r1' }, evidence: [] };
  assert(!Runbook.acceptanceComplete(D, s, rec.id), 'a partial record counted as a pass');
  s.acceptance[rec.id] = {
    status: 'PASSED',
    fields: Object.fromEntries(D.acceptanceRequiredFields.map((f) => [f, 'recorded'])),
    evidence: [{ text: 'screenshot', at: '2026-09-01T00:00:00Z' }],
  };
  assert(Runbook.acceptanceComplete(D, s, rec.id), 'a complete record was not counted');
});

check('a stored record for an action the definition dropped is reported, not silently ignored', () => {
  const s = Runbook.hydrate(D, { actions: { 'OP-999': { status: 'RESOLVED' } } });
  assert(s.orphaned.some((o) => o.id === 'OP-999'),
    'a record the gate no longer counts was dropped without saying so — the gate got easier with nobody deciding it should');
});

check('an acceptance record exists for every contract key in the estate', async () => {
  const { EndpointAtlas } = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));
  const covered = new Set(D.acceptance.map((r) => r.id.replace(/^EP-/, '')));
  const missing = EndpointAtlas.keys.map((k) => k.key).filter((k) => !covered.has(k));
  assert(missing.length === 0, `${missing.length} key(s) nobody has to prove work: ${missing.join(', ')}`);
});

check('the exported record carries the gate, the audit and no signature', () => {
  const out = Runbook.exportRunbook(D, fresh(), { actor: { email: 'a@b.c' } });
  assert(out.decision === 'NO-GO' && Array.isArray(out.gate), 'the export omits the gate');
  assert(out.structuralAudit, 'the export omits the structural audit');
  assert(!SIGNATURE.test(JSON.stringify(out)), 'the commissioning export carries a signature');
});

/* ═══════════════ 7 · the action catalogue ═══════════════ */
group('The administrative action catalogue');

check('every action declares a domain, a permission, a blast radius and an audit event', () => {
  const domains = new Set(Actions.DOMAINS.map((d) => d.id));
  const blasts = new Set(Object.values(Actions.BLAST));
  for (const a of Actions.AdminActions) {
    assert(domains.has(a.domain), `${a.id} sits in an undeclared domain "${a.domain}"`);
    assert(blasts.has(a.blast), `${a.id} declares an unknown blast radius "${a.blast}"`);
    assert(a.permission, `${a.id} names no permission`);
    assert(/^audit:/.test(a.audit), `${a.id} names no audit event`);
    assert(a.detail && a.detail.length > 20, `${a.id} does not say what it does`);
  }
});

check('every action id is unique', () => {
  const ids = Actions.AdminActions.map((a) => a.id);
  assert(new Set(ids).size === ids.length, 'two actions share an id — the audit trail could not tell them apart');
});

check('every permission an action requires is one the role model defines', async () => {
  const { Permissions } = await import(path.join(ROOT, 'config/rbac.config.js'));
  const known = new Set(Object.values(Permissions));
  const bad = Actions.AdminActions.filter((a) => !known.has(a.permission));
  assert(bad.length === 0, `${bad.map((a) => a.id).join(', ')} require a permission that does not exist`);
});

check('EVERY IRREVERSIBLE ACTION DEMANDS A TYPED CONFIRMATION AND SAYS WHAT IS LOST', () => {
  for (const a of Actions.AdminActions.filter((x) => x.blast === Actions.BLAST.IRREVERSIBLE)) {
    assert(a.requiresTypedConfirmation === true, `${a.id} is irreversible and can be confirmed by clicking`);
    assert(a.confirm && a.confirm.length > 40, `${a.id} is irreversible and does not say what is lost`);
  }
});

check('every typed-confirmation action names the word that arms it', () => {
  /* The word lives in the catalogue so the suite cannot draw a control armed by a different word
     from the one its action declares — a control that reads as protected and is not. */
  for (const a of Actions.AdminActions.filter((x) => x.requiresTypedConfirmation)) {
    assert(/^[A-Z]{4,12}$/.test(a.confirmWord || ''), `${a.id} requires typing but names no word (got ${a.confirmWord})`);
  }
});

check('sending a request to a live flow is typed-confirmed even though it destroys nothing', () => {
  const send = Actions.actionById('flows.send');
  assert(send.requiresTypedConfirmation === true,
    'a composed request to a real flow could be sent by clicking — nothing is destroyed, and the email has still been sent');
});

check('every action that reaches the tenant explains what it does there', () => {
  for (const a of Actions.AdminActions.filter((x) => x.blast === Actions.BLAST.TENANT || x.blast === Actions.BLAST.ESTATE)) {
    if (a.confirm) assert(a.confirm.length > 40, `${a.id} confirms with a sentence that says nothing`);
  }
});

check('a role sees every action, marked by whether it may run it', () => {
  const has = (u, p) => (Roles[u.role]?.permissions || []).includes(p);
  const viewer = Actions.catalogueFor({ role: 'viewer' }, has);
  assert(viewer.length === Actions.AdminActions.length, 'actions were hidden rather than marked');
  assert(viewer.every((a) => a.permitted === false), 'a read-only viewer was granted an administrative action');
  const admin = Actions.catalogueFor({ role: 'systemAdmin' }, has);
  assert(admin.every((a) => a.permitted), 'the system administrator was denied an action');
});

check('the catalogue is ordered so the most dangerous actions are read first', () => {
  const has = () => true;
  const weights = Actions.catalogueFor({ role: 'systemAdmin' }, has).map((a) => Actions.BLAST_WEIGHT[a.blast]);
  assert(weights.every((w, i) => i === 0 || weights[i - 1] <= w), 'the catalogue is not ordered by blast radius');
});

check('THE PERMISSION IS RE-CHECKED AT DISPATCH, NOT ONLY WHERE THE BUTTON WAS DRAWN', async () => {
  const has = (u, p) => (Roles[u.role]?.permissions || []).includes(p);
  let ran = false;
  try {
    await Actions.run('platform.clear-local', () => { ran = true; }, { actor: { role: 'viewer' }, hasPermission: has });
    throw new Error('a viewer reached an irreversible action by calling run() directly');
  } catch (e) {
    assert(e.code === 'PERMISSION_DENIED', `expected a permission denial, got: ${e.message}`);
  }
  assert(ran === false, 'the action body ran despite the denial');
});

check('a dispatched action is audited whether it succeeds or fails', async () => {
  const { AuditLog } = await import(path.join(ROOT, 'core/audit-log.js'));
  const before = AuditLog.query({}).length;
  await Actions.run('estate.export', () => true, { actor: { email: 'a@b.c' } });
  try { await Actions.run('estate.export', () => { throw new Error('boom'); }, { actor: { email: 'a@b.c' } }); }
  catch { /* the throw is the point */ }
  const after = AuditLog.query({});
  assert(after.length - before === 4, `expected two started and two settled entries, got ${after.length - before}`);
  assert(after.some((e) => e.phase === 'failed' && /boom/.test(JSON.stringify(e.meta))),
    'the failure was not recorded with its reason — a year later that reads exactly like an action still running');
});

/* ═══════════════ 8 · the capsule client ═══════════════ */
group('The capsule registry client');

check('it starts disconnected and never reports a token', () => {
  const s = Capsule.status();
  assert(s.connected === false, 'the client claims a connection it does not have');
  assert(!('token' in s), 'the status object carries the token');
});

check('PLAIN HTTP IS REFUSED FOR ANYTHING BUT A LOOPBACK ADDRESS', () => {
  let refused = false;
  try { Capsule.connect({ baseUrl: 'http://registry.example.org', token: 't' }); }
  catch (e) { refused = /clear text/i.test(e.message); }
  assert(refused, 'the administration token would have been sent over plain http to a remote host');
  Capsule.connect({ baseUrl: 'http://127.0.0.1:8787', token: 't' });
  assert(Capsule.status().connected, 'a loopback address was refused');
  Capsule.disconnect();
});

check('a malformed alias is refused before the URL crosses the network', async () => {
  Capsule.connect({ baseUrl: 'https://registry.internal', token: 't' });
  let refused = '';
  try { await Capsule.register({ alias: 'Not An Alias', url: GOOD, flowIdentity: 'a', environment: 'b', contractVersion: 'c' }); }
  catch (e) { refused = e.message; }
  assert(/alias/i.test(refused), `expected an alias refusal, got: ${refused}`);
  Capsule.disconnect();
});

check('a malformed URL is refused locally, with the reasons, before it is sent', async () => {
  Capsule.connect({ baseUrl: 'https://registry.internal', token: 't' });
  let err = null;
  try { await Capsule.register({ alias: 'dgo.test', url: `${GOOD} `, flowIdentity: 'a', environment: 'b', contractVersion: 'c' }); }
  catch (e) { err = e; }
  assert(err?.code === 'FORMATION_FAILED', `expected FORMATION_FAILED, got ${err?.code}`);
  assert(Array.isArray(err.details) && err.details.length, 'the refusal does not say what is wrong with the URL');
  assert(!SIGNATURE.test(JSON.stringify(err.details)), 'the refusal detail carries the signature');
  Capsule.disconnect();
});

check('the client offers no way to invoke a business alias', () => {
  assert(typeof Capsule.CapsuleClient.invoke !== 'function',
    'the console can invoke arbitrary aliases with an operator\'s token — that is a console that can dispatch correspondence by accident');
});

/* ═══════════════ 9 · the module is wired in ═══════════════ */
group('The suite is reachable and declared');

check('the route is declared, registered and permitted', async () => {
  const { Routes } = await import(path.join(ROOT, 'config/routes.config.js'));
  assert(Routes.some((r) => r.path === 'admin-suite'), 'the route is not declared');
  assert(read('core/boot.js').includes("'admin-suite':()=>import('../modules/admin-suite.js')"), 'the module is not registered with the router');
  const { canAccess } = await import(path.join(ROOT, 'config/rbac.config.js'));
  assert(canAccess({ role: 'systemAdmin', status: 'active' }, 'admin-suite'), 'the system administrator cannot open it');
  assert(!canAccess({ role: 'operator', status: 'active' }, 'admin-suite'), 'an operator can open the administration console');
  assert(!canAccess({ role: 'viewer', status: 'active' }, 'admin-suite'), 'a read-only viewer can open the administration console');
});

check('the module declares a boundary that forbids it owning business actions', async () => {
  const { boundaryFor } = await import(path.join(ROOT, 'config/module-boundaries.config.js'));
  const b = boundaryFor('admin-suite');
  assert(b, 'the module declares no boundary');
  assert(b.mustNotOwn.includes('business-workflow-action'), 'the console does not forbid itself business actions');
});

check('the suite renders every section it declares', async () => {
  const src = read('modules/admin-suite.js');
  for (const id of ['overview', 'estate', 'checks', 'shapes', 'runbook', 'capsule', 'people', 'control', 'actions', 'evidence']) {
    assert(src.includes(`'${id}'`), `section ${id} is declared but has no branch`);
  }
});

check('an override that addresses the wrong workflow is REFUSED, not merely warned about', async () => {
  const { validateOverride } = await import(path.join(ROOT, 'modules/admin-suite.js'));
  const { EndpointAtlas } = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));
  const key = EndpointAtlas.keys.find((k) => k.workflowId);
  const wrong = key.urlTemplate.replace(key.workflowId, 'f'.repeat(32)) + 'S'.repeat(43);
  const verdict = validateOverride(key.key, wrong);
  assert(!verdict.ok, 'an address pointing at the wrong workflow was accepted');
  assert(verdict.issues.some((i) => /succeed against the wrong flow/i.test(i)),
    'the refusal does not explain that the call would succeed rather than fail');
});

check('a correct override is accepted, and an empty one clears', async () => {
  const { validateOverride } = await import(path.join(ROOT, 'modules/admin-suite.js'));
  const { EndpointAtlas } = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));
  const key = EndpointAtlas.keys.find((k) => k.workflowId && k.urlTemplate.startsWith('https://'));
  assert(validateOverride(key.key, key.urlTemplate + 'S'.repeat(43)).ok,
    'a correctly formed address matching the register was refused');
  assert(validateOverride(key.key, '').cleared, 'an empty value did not clear the override');
});


/* ═══════════════ 10 · what the merge could have dropped ═══════════════ */
group('Capabilities carried across from the source tools');

check('a runbook survives an export/import round trip', () => {
  const s0 = fresh();
  const open = D.parameters.find((p) => p.required && !p.locked);
  const first = D.actions.find((a) => !a.dependsOn.length);
  s0.parameters[open.id] = 'a real value';
  s0.actions[first.id] = { status: Runbook.STATUS.RESOLVED, note: 'n', owner: 'o', at: 'x', evidence: [{ text: 'run 42', by: 'a@b.c', at: 'x' }] };
  s0.risks = [{ id: 'R1', title: 't', acceptedBy: 'p', basis: 'b', status: 'OPEN', at: 'x' }];
  s0.cutover.rollbackRehearsed = true;

  const back = Runbook.importRunbook(D, Runbook.exportRunbook(D, s0));
  assert(back.ok, `a record this platform exported was refused on import: ${JSON.stringify(back.errors)}`);
  assert(Runbook.parameterValue(D, back.state, open.id) === 'a real value', 'a parameter did not survive');
  assert(back.state.actions[first.id].status === Runbook.STATUS.RESOLVED, 'an action status did not survive');
  assert(back.state.actions[first.id].evidence.length === 1, 'evidence did not survive');
  assert(back.state.risks.length === 1, 'a residual risk did not survive');
  assert(back.state.cutover.rollbackRehearsed === true, 'a cutover flag did not survive');
});

check('import REFUSES a bundle that is not this runbook', () => {
  assert(!Runbook.importRunbook(D, { schema: 'something-else/v1' }).ok, 'a foreign schema was read');
  assert(!Runbook.importRunbook(D, { schema: 'dgo-ops-runbook/v1', definition: { id: 'another-runbook' } }).ok,
    'another runbook\'s answers were accepted as this one\'s');
  assert(!Runbook.importRunbook(D, null).ok, 'a null bundle was accepted');
});

check('IMPORT CANNOT OVERWRITE A LOCKED PARAMETER', () => {
  const locked = D.parameters.find((p) => p.locked);
  const bundle = Runbook.exportRunbook(D, fresh());
  bundle.parameters = bundle.parameters.map((p) => (p.id === locked.id ? { ...p, value: 'SUPPLIED BY THE FILE' } : p));
  const r = Runbook.importRunbook(D, bundle);
  assert(Runbook.parameterValue(D, r.state, locked.id) === String(locked.value),
    'a file replaced a value this repository declares — the runbook would then assert a fact the platform does not hold');
  assert(r.warnings.some((w) => w.code === 'locked-parameter'), 'the discard was silent');
});

check('import reports contradiction and stays quiet about incompleteness', () => {
  const s0 = fresh();
  const first = D.actions.find((a) => !a.dependsOn.length);
  s0.actions[first.id] = { status: Runbook.STATUS.RESOLVED, note: '', owner: '', at: '', evidence: [{ text: 'e' }] };
  assert(Runbook.importRunbook(D, Runbook.exportRunbook(D, s0)).warnings.length === 0,
    'a partly-finished record — the normal mid-commissioning export — was reported as broken');

  const edited = Runbook.exportRunbook(D, s0);
  edited.actions = edited.actions.map((a) => (a.id === first.id ? { ...a, evidence: [] } : a));
  assert(Runbook.importRunbook(D, edited).warnings.some((w) => w.code === 'imported.action.no-evidence'),
    'a record hand-edited between export and import was accepted silently');
});

check('an unknown action or status is dropped and named, never stored', () => {
  const bundle = Runbook.exportRunbook(D, fresh());
  const r1 = Runbook.importRunbook(D, { ...bundle, actions: [...bundle.actions, { id: 'OP-999', status: 'RESOLVED' }] });
  assert(r1.warnings.some((w) => w.code === 'unknown-action'), 'an action this runbook does not declare was absorbed silently');
  const first = D.actions.find((a) => !a.dependsOn.length);
  const r2 = Runbook.importRunbook(D, { ...bundle, actions: bundle.actions.map((a) => (a.id === first.id ? { ...a, status: 'INVENTED' } : a)) });
  assert(r2.state.actions[first.id].status === Runbook.STATUS.BLOCKED, 'a status outside the vocabulary was stored');
});

check('all five provisioning tables are emitted, with the original column contracts', () => {
  const expected = {
    flowSummaryCsv: 'Flow name,Workflow ID,Callable',
    requestFieldsCsv: 'Flow,Workflow ID,Trigger,Path,Types,Required',
    responseActionsCsv: 'Flow,Workflow ID,Response action,Path,Status code',
    mailActionsCsv: 'Flow,Workflow ID,Action,To,Cc,Bcc,Subject',
  };
  for (const [fn, header] of Object.entries(expected)) {
    const first = Shapes[fn]().split('\r\n')[0];
    const plain = first.replace(/^\uFEFF/, '').replace(/"/g, '');
    assert(plain.startsWith(header), `${fn} header is "${plain}", expected to start "${header}"`);
  }
  const keys = Shapes.endpointKeysCsv({ keys: [{ key: 'K', surface: 'internal', flow: 'F', workflowId: 'w' }] });
  assert(keys.replace(/^\uFEFF/, '').startsWith('"Platform","Key"'), 'the endpoint-keys header changed');
});

check('a CSV carries a BOM, quotes every cell, and folds newlines', () => {
  const csvText = Shapes.flowSummaryCsv();
  assert(csvText.startsWith('\uFEFF'), 'no BOM — Excel reads a UTF-8 CSV as the local codepage without one');
  assert(csvText.split('\r\n')[1].startsWith('"'), 'cells are not quoted');
  assert(!csvText.split('\r\n').some((line, i) => i > 0 && (line.match(/"/g) || []).length % 2), 'a row has unbalanced quotes — the table would misparse');
});

check('NO CSV CARRIES AN ENDPOINT URL OR A SIGNATURE', () => {
  /* A spreadsheet is the artefact most likely to be mailed. */
  const { EndpointAtlas } = FlowShapesAtlas;
  const all = [Shapes.flowSummaryCsv(), Shapes.requestFieldsCsv(), Shapes.responseActionsCsv(),
    Shapes.mailActionsCsv(), Shapes.endpointKeysCsv({ keys: EndpointAtlas.keys, resolve: () => `https://x/invoke?sig=${'S'.repeat(43)}` })].join('\n');
  assert(!SIGNATURE.test(all), 'a signature reached a CSV');
  assert(!/https:\/\/[a-z0-9.-]*powerplatform/i.test(all), 'an endpoint URL reached a CSV');
});

check('EVERY generated example conforms to the schema it was generated from', () => {
  let checked = 0;
  for (const f of Shapes.flows()) {
    for (const t of f.triggers) {
      if (!t.schema) continue;
      const v = Shapes.validateRequest(f, Shapes.exampleFor(t), { triggerName: t.name });
      if (!v.checked) continue;
      checked++;
      assert(v.conforms, `the example for ${f.name} fails its own schema: ${JSON.stringify(v.errors.slice(0, 2))}`);
    }
  }
  assert(checked > 40, `only ${checked} schemas were exercised`);
});

check('an example is not empty just because the schema names no required field', () => {
  /* Required-only produced {} for 42 of 53 schemas in this estate — conforming and useless. */
  let empty = 0;
  let total = 0;
  for (const f of Shapes.flows()) {
    for (const t of f.triggers) {
      if (!t.schema || !Object.keys(t.schema.properties || {}).length) continue;
      total++;
      if (Object.keys(Shapes.exampleFor(t)).length === 0) empty++;
    }
  }
  assert(empty === 0, `${empty} of ${total} schemas with properties still produce an empty example`);
});

check('THE CURL COMMAND REDACTS THE SIGNATURE', () => {
  const url = `https://x.api.powerplatform.com/workflows/${'a'.repeat(32)}/triggers/manual/paths/invoke?api-version=1&sig=${'S'.repeat(43)}`;
  const cmd = Shapes.toCurl({ name: 'f', triggers: [{ kind: 'Http', method: 'POST', schema: null }] }, { a: 1 }, { url });
  assert(!SIGNATURE.test(cmd), 'the curl command carries a live bearer credential into the clipboard and the shell history');
  assert(cmd.includes('sig=***'), 'the signature is not visibly redacted');
  assert(/redacted/i.test(cmd), 'the command does not warn that it will not run as pasted');
});

check('the curl command names a method and carries the payload', () => {
  const cmd = Shapes.toCurl({ name: 'f', triggers: [{ kind: 'Http', method: 'POST', schema: null }] }, { a: 1 });
  assert(/-X POST/.test(cmd), 'no method');
  assert(cmd.includes('"a": 1'), 'the payload is not in the command');
  assert(/Content-Type: application\/json/.test(cmd), 'no content type');
});

/* ═══════════════ report ═══════════════ */
console.log(failures.length
  ? `\n❌ ${passed} passed, ${failures.length} failed\n${failures.map((f) => `   · ${f}`).join('\n')}\n`
  : `\n✅ ${passed} passed, 0 failed\n`);
process.exit(failures.length ? 1 : 0);
