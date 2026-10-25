/**
 * The quick conformance stage (IDENTIFICATION_SYSTEM.md §13), built in memory by build-identification-conformance.mjs.
 * The identification release (packages/identification-phase3/) is built from it; the stage itself is not kept as
 * packages (owner direction, 2026-10-21: the branch holds only the latest version of every package).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseFlowArtifactName } from '../scripts/lib/flow-artifact-name.mjs';
import { conformancePackages } from '../scripts/build-identification-conformance.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };

const FLOWS = ['CG_Submission_Endpoint', 'CG_Upload_Endpoint', 'CG_Portal_Status_Check_Endpoint', 'CG_Portal_Verification_Endpoint',
  'CG_Portal_Verification_Confirmation_Endpoint', 'CG_Portal_Support_Endpoint', 'CG_Portal_Writeback_Endpoint',
  'CG_Registry_Status_Notifier', 'CG_Portal_Daily_Sweep', 'AUTO_SCHEDULED_SWEEP', 'IP_Dynamic_Global_Actions_Endpoint'];
const children = (a) => [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions].filter(Boolean);
function* walk(acts) { for (const [n, a] of Object.entries(acts || {})) { yield [n, a]; for (const c of children(a)) yield* walk(c); } }
/* Packages are named <KEY>__<flow>__<flow id>__<root scope>.paste.json (catalogue namingConventions.flowArtifactFile). */
const fileOf = (f) => Object.keys(conformancePackages).find((x) => parseFlowArtifactName(x)?.flow === f);
const load = (f) => structuredClone(conformancePackages[fileOf(f)]);
const actions = (f) => Object.fromEntries(walk(load(f).serializedValue.actions));

ok('the stage holds exactly the eleven flows, and none of it is kept as packages in the branch', () => {
  assert.deepEqual(Object.keys(conformancePackages).map((x) => parseFlowArtifactName(x)?.flow).sort(), [...FLOWS].sort());
  assert.ok(!existsSync(new URL('docs/folio-Master-Flows-and-Endpoints/packages/identification-conformance', root)), 'an older package set is back in the branch');
  assert.ok(!existsSync(new URL('docs/folio-Master-Flows-and-Endpoints/surfaces/portal/delivered', root)), 'the delivered builds are back as packages');
});

ok('every file is a designer clipboard node with no variables, no Filter array, no Until', () => {
  for (const f of FLOWS) {
    const p = load(f);
    assert.deepEqual(Object.keys(p), ['nodeId', 'serializedValue', 'allConnectionData', 'staticResults', 'isScopeNode', 'mslaNode'], f);
    const text = JSON.stringify(p);
    assert.ok(!text.includes('variables('), `${f} reads a variable`);
    assert.ok(!text.includes('"authentication"'), `${f} still carries authentication`);
    for (const [n, a] of walk(p.serializedValue.actions)) {
      assert.ok(!['InitializeVariable', 'SetVariable', 'AppendToArrayVariable', 'Query', 'Until'].includes(a.type), `${f}: ${n} is ${a.type}`);
      if (a.type === 'OpenApiConnection') {
        assert.deepEqual(Object.keys(a.inputs.host).sort(), ['apiId', 'connection', 'operationId'], `${f}: ${n} host`);
        assert.ok(p.allConnectionData[n], `${f}: ${n} has no connection entry`);
      }
    }
  }
});

ok('S8 / ID-19: every flow mints its Request ID and adopts no client value', () => {
  for (const f of FLOWS) {
    assert.equal(actions(f).Compose_Request_Context.inputs.requestId, '@guid()', f);
    assert.ok(!/triggerBody\(\)\?\['requestId'\],guid\(\)/.test(JSON.stringify(load(f))), `${f} still adopts the client's requestId`);
  }
  for (const f of ['CG_Submission_Endpoint', 'CG_Portal_Status_Check_Endpoint', 'CG_Portal_Support_Endpoint']) {
    const c = actions(f).Compose_Request_Context.inputs.clientCorrelationId;
    assert.match(c, /^@take\(.*,64\)$/, `${f}: clientCorrelationId must be empty-safe`);
    assert.ok(!c.includes('substring('), `${f}: substring() throws on an empty client value`);
  }
});

ok('Submission: WAT year, Prefix filter, attribute duplicate query, no ticket in file names, 503 RETRY_LATER', () => {
  const a = actions('CG_Submission_Endpoint');
  assert.equal(a.Compose_Submission_Year.inputs, "@formatDateTime(convertFromUtc(utcNow(),'W. Central Africa Standard Time'),'yyyy')");
  for (const n of ['Get_Sequence_Counter', 'Get_Sequence_Counter_Current_1', 'Get_Sequence_Counter_Current_2', 'Get_Sequence_Counter_Current_3']) {
    assert.match(a[n].inputs.parameters.$filter, /Prefix eq ''NITDA''/, n);
  }
  const dup = a.Get_Existing_Submission.inputs.parameters.$filter;
  assert.ok(!dup.includes('LocalId'), 'duplicate check still reads localId');
  assert.match(dup, /SenderEmail eq .*Subject eq .*AttachmentCount eq .*SubmittedAtUtc ge/);
  assert.ok(!JSON.stringify(a.Compose_Ticket_Stored_Name).includes('Compose_Ticket_Token'), 'file name still uses the upload ticket');
  assert.equal(a.Compose_Result_Submission_409.inputs.status, 503);
  assert.equal(a.Compose_Result_Submission_409.inputs.data.code, 'RETRY_LATER');
});

ok('Support: CASE-XXXXXX from the unambiguous alphabet with rand(), five draws, client ref ignored', () => {
  const a = actions('CG_Portal_Support_Endpoint');
  assert.equal(a.Compose_Support_Client_Ref.inputs, "@trim(' ')");
  const m = a.Compose_Support_Minted_Ref.inputs;
  assert.equal((m.match(/concat\('CASE-'/g) || []).length, 5);
  assert.equal((m.match(/substring\('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',rand\(0,32\),1\)/g) || []).length, 30);
  assert.ok(!/yyyyMMdd/.test(JSON.stringify(load('CG_Portal_Support_Endpoint'))), 'the dated CASE format is still issued');
  assert.equal(a.Get_Existing_Case.inputs.parameters.$top, 5);
});

ok('failure alerts render even when Compose_Request_Context failed', () => {
  for (const f of FLOWS) {
    const t = JSON.stringify(load(f));
    assert.ok(!t.includes("convertFromUtc(outputs('Compose_Request_Context')?['receivedAtUtc']"), `${f}: alert time has no fallback`);
    assert.ok(t.includes("convertFromUtc(coalesce(outputs('Compose_Request_Context')?['receivedAtUtc'],utcNow())"), f);
  }
});

ok('no substring can run past the end of an empty or short value', () => {
  for (const f of FLOWS) {
    const t = JSON.stringify(load(f));
    assert.ok(!/,0,min\((length\(|\d+,length\()/.test(t), `${f}: substring(X,0,min(length(X),N)) remains; use take(X,N)`);
  }
  assert.ok(!JSON.stringify(load('IP_Dynamic_Global_Actions_Endpoint')).includes('substring('), 'DYNAMIC_ACTIONS still slices the target');
});

ok('Verification draws its code with rand(100000,1000000)', () => {
  assert.equal(actions('CG_Portal_Verification_Endpoint').Compose_Verify_Code.inputs, '@string(rand(100000,1000000))');
});

ok('S5 / V10: Status and Writeback match a reference exactly', () => {
  for (const f of ['CG_Portal_Status_Check_Endpoint', 'CG_Portal_Writeback_Endpoint']) {
    const q = actions(f).Get_Submission_By_Reference.inputs.parameters.$filter;
    assert.ok(!q.includes('Ref_Padded'), `${f} still matches the padded variant`);
    assert.match(q, /concat\('ReferenceId eq '''/);
  }
});

ok('DYNAMIC_ACTIONS: root scope only, targets by spo: locator or item ID, never RefIDD', () => {
  const p = load('IP_Dynamic_Global_Actions_Endpoint');
  assert.equal(p.nodeId, 'Scope_Dynamic_Flow');
  assert.ok(!JSON.stringify(p).includes('REBUILT'), 'the dead REBUILT scope is in the package');
  const a = actions('IP_Dynamic_Global_Actions_Endpoint');
  for (const n of ['Get_Dynamic_Document', 'Get_Dynamic_Status_Document', 'Get_Dynamic_Task']) {
    const q = a[n].inputs.parameters.$filter;
    assert.ok(!q.includes('RefIDD'), `${n} still locates by RefIDD`);
    assert.match(q, /'spo:'/, n);
  }
  assert.match(a.Compose_Dynamic_Invalid.inputs, /TARGET_UNRESOLVED/);
});

ok('the captured evidence and delivered sources are untouched', () => {
  assert.match(read('docs/folio-Master-Flows-and-Endpoints/captures/CG_Submission_Endpoint__de9ef13b-ae4c-42b0-9afa-20e71a180759.json'), /formatDateTime\(utcNow\(\),'yyyy'\)/);
  assert.match(read('docs/folio-Master-Flows-and-Endpoints/captures/build-sources/CG_Portal_Status_Check_Endpoint.build-source.json'), /Ref_Padded/);
});

console.log(`identification-conformance: ${passed} assertions passed`);
