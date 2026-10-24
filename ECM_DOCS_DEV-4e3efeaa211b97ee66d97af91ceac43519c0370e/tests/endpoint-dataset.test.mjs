#!/usr/bin/env node
/**
 * The endpoint dataset says what the packages say.
 *
 * `--check` on the generator proves the file matches a fresh run, which is a staleness test
 * and not the claim that matters: a generator that quietly dropped a field, or defaulted an
 * absent one, would pass it every time because it agrees with itself. These assertions go
 * back to the packages and to the two applications' own configuration.
 *
 * The distinction this suite exists to protect is `triggerAuthenticationType`. An export that
 * carries no value and an export that carries "All" are different facts about who may invoke
 * an endpoint, and a dataset that renders both as "All" would be worse than no dataset.
 *
 * Run: node tests/endpoint-dataset.test.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { walk } from '../scripts/lib/flow-definition-reader.mjs';
import { readPackage } from '../scripts/lib/provisioning-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = 'docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json';

let failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${label}`); return; }
  failed++;
  console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`);
};
const section = (s) => console.log(`\n${s}`);

console.log('\nEndpoint dataset');

section('It exists and parses');
ok('the dataset is present', existsSync(join(ROOT, OUT)));
if (!existsSync(join(ROOT, OUT))) {
  console.log('\n❌ nothing to check — run: npm run endpoints\n');
  process.exit(1);
}
const d = JSON.parse(readFileSync(join(ROOT, OUT), 'utf8'));
ok('it declares its schema', d.$schema === 'dgo-endpoint-dataset/v1', d.$schema);

/* ── the captured packages, read independently ─────────────────────────────────────────── */
const captured = [];
for (const abs of walk(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed'))) {
  const pkg = readPackage(abs, relative(ROOT, abs).split(sep).join('/'));
  if (pkg) captured.push(pkg);
}
const httpFlows = captured.filter((p) => p.trigger?.type === 'Request');
/* Keyed by CAPTURE, not by internal name. One internal name in this estate is carried by two
   different captures; keying on it silently reads one flow's fields off the other, which is
   exactly the defect that made this assertion fail the first time it was written. */
const captureId = (p) => p.file.split('/').pop().replace(/\.json$/, '');

section('Every HTTP-triggered flow is present, and nothing else is');
ok(`flows[] holds every Request-triggered capture (${httpFlows.length})`,
  d.flows.length === httpFlows.length, `dataset ${d.flows.length}, packages ${httpFlows.length}`);
const ids = new Set(d.flows.map((f) => f.id));
ok('every captured HTTP flow appears, one row per capture',
  httpFlows.every((p) => ids.has(captureId(p))),
  httpFlows.filter((p) => !ids.has(captureId(p))).map((p) => p.displayName).join(', '));
ok('no non-HTTP flow leaked in', d.flows.every((f) => f.trigger.type === 'Request'));
ok('every excluded flow is named with a reason',
  captured.length - httpFlows.length === d.meta.excluded.length
  && d.meta.excluded.every((e) => e.reason && e.displayName),
  `${d.meta.excluded.length} excluded, ${captured.length - httpFlows.length} expected`);
ok('ids are unique', ids.size === d.flows.length);

section('The trigger surface matches the package, field by field');
const byId = new Map(d.flows.map((f) => [f.id, f]));
const wrong = [];
for (const p of httpFlows) {
  const f = byId.get(captureId(p));
  if (!f) continue;
  const t = p.trigger;
  const declared = t.triggerAuthenticationType !== undefined;
  if (f.trigger.triggerAuthenticationTypeDeclared !== declared) wrong.push(`${p.displayName}: declared flag`);
  if (declared && f.trigger.triggerAuthenticationType !== t.triggerAuthenticationType) wrong.push(`${p.displayName}: posture value`);
  if (!declared && f.trigger.triggerAuthenticationType !== null) wrong.push(`${p.displayName}: absent posture not null`);
  if ((f.trigger.method ?? null) !== (t.method ?? null)) wrong.push(`${p.displayName}: method`);
  if (f.request.schemaDeclared !== Boolean(t.schema)) wrong.push(`${p.displayName}: schemaDeclared`);
  if (t.schema && JSON.stringify(f.request.schema) !== JSON.stringify(t.schema)) wrong.push(`${p.displayName}: schema not verbatim`);
}
ok('method, posture and request schema are carried verbatim', wrong.length === 0, wrong.slice(0, 5).join('\n       '));

/* An absent posture must never be rendered as a value. This is the whole point of the file. */
const absent = httpFlows.filter((p) => p.trigger.triggerAuthenticationType === undefined);
ok(`an absent authentication posture stays null and is flagged (${absent.length} flows)`,
  absent.every((p) => {
    const f = byId.get(captureId(p));
    return f && f.trigger.triggerAuthenticationType === null && f.trigger.triggerAuthenticationTypeDeclared === false;
  }));

section('Responses and error handling are complete');
const respWrong = [];
for (const p of httpFlows) {
  const f = byId.get(captureId(p));
  if (!f) continue;
  const pkgResponses = p.actions.filter((a) => a.type === 'Response');
  if (f.responses.length !== pkgResponses.length) respWrong.push(`${p.displayName}: ${f.responses.length} vs ${pkgResponses.length}`);
  const pkgCatches = p.actions.filter((a) => a.isCatch);
  if (f.errorHandling.catchEdges.length !== pkgCatches.length) respWrong.push(`${p.displayName}: catch edges`);
}
ok('every Response action and every catch edge is represented', respWrong.length === 0,
  respWrong.slice(0, 5).join('\n       '));

section('A shared internal name is surfaced, not merged');
const shared = new Map();
for (const p of httpFlows) {
  if (!shared.has(p.internalName)) shared.set(p.internalName, []);
  shared.get(p.internalName).push(p);
}
const collisions = [...shared.entries()].filter(([, l]) => l.length > 1);
ok(`meta reports every internal name carried by more than one capture (${collisions.length})`,
  (d.meta.internalNameCollisions || []).length === collisions.length);
ok('each colliding capture is held separately, and exactly one is flagged as the later',
  (d.meta.internalNameCollisions || []).every((c) => {
    const rows = d.flows.filter((f) => f.internalName === c.internalName);
    return rows.length === c.captures.length
      && rows.filter((f) => f.isLatestCaptureOfInternalName).length === 1;
  }));

section('Both platforms declare their keys, and the dataset carries all of them');
const { EndpointContracts } = await import(new URL('../config/endpoints.config.js', import.meta.url));
const portalIds = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json'), 'utf8'));
const internalKeys = d.endpoints.filter((e) => e.platform === 'internal').map((e) => e.key);
const portalKeys = d.endpoints.filter((e) => e.platform === 'portal').map((e) => e.key);
ok(`every internal contract key is present (${Object.keys(EndpointContracts).length})`,
  Object.keys(EndpointContracts).every((k) => internalKeys.includes(k)),
  Object.keys(EndpointContracts).filter((k) => !internalKeys.includes(k)).join(', '));
ok(`every portal endpoint key is present (${(portalIds.endpoints || []).length})`,
  (portalIds.endpoints || []).every((e) => portalKeys.includes(e.key)));
ok('every key referencing a flow references one that exists',
  d.endpoints.every((e) => e.flows.every((r) => ids.has(r.captureId))),
  d.endpoints.filter((e) => e.flows.some((r) => !ids.has(r.captureId))).map((e) => e.key).join(', '));
ok('every endpoint states the flow id of each flow it names, not just a filename',
  d.endpoints.every((e) => e.flows.every((r) => typeof r.flowId === 'string' && r.flowId.length > 0)),
  d.endpoints.filter((e) => e.flows.some((r) => !r.flowId)).map((e) => e.key).join(', '));
ok('an endpoint\'s flow reference agrees with the flow row it points at',
  d.endpoints.every((e) => e.flows.every((r) => {
    const f = byId.get(r.captureId);
    return f && f.identifiers.flowId === r.flowId && f.identifiers.workflowId === r.workflowId;
  })));
ok('the contract each internal key sends is carried verbatim',
  Object.entries(EndpointContracts).every(([k, c]) => {
    const e = d.endpoints.find((x) => x.key === k && x.platform === 'internal');
    return e && e.contract.method === c.method && e.contract.action === c.action;
  }));

section('Both identifier schemes are carried, and neither is invented');
/* flowId comes from the package; workflowId does not exist in any package here and is joined.
   The failure to guard against is a null workflowId being filled with a flowId, or with the
   id of a different flow — either would send someone to the wrong trigger URL. */
ok(`every flow carries the flow id its export records (${httpFlows.length})`,
  httpFlows.every((p) => {
    const f = byId.get(captureId(p));
    return f && f.identifiers.flowId === p.internalName;
  }));
ok('no workflowId is present without naming the register it came from',
  d.flows.every((f) => (f.identifiers.workflowId === null) === (f.identifiers.workflowIdSource === null)));
ok('no workflowId equals a flowId — the two schemes are never conflated',
  d.flows.every((f) => f.identifiers.workflowId === null || f.identifiers.workflowId !== f.identifiers.flowId));
ok('every resolved workflowId is 32 hex characters',
  d.flows.every((f) => f.identifiers.workflowId === null || /^[a-f0-9]{32}$/.test(f.identifiers.workflowId)),
  d.flows.filter((f) => f.identifiers.workflowId && !/^[a-f0-9]{32}$/.test(f.identifiers.workflowId)).map((f) => f.displayName).join(', '));
ok('the dataset states that no package carries a workflowId',
  d.flows.every((f) => f.identifiers.workflowIdInPackage === false)
  && /NO PACKAGE IN THIS TREE CARRIES IT/.test(d.meta.conventions.identifiers));
ok('a constructed maker URL is flagged as constructed, and contains its own flow id',
  d.flows.every((f) => f.identifiers.flowMakerUrl === null
    || (f.identifiers.flowMakerUrlIsConstructed === true
        && f.identifiers.flowMakerUrl.includes(f.identifiers.flowId))));

section('The totals are arithmetic, not assertions');
const t = d.meta.totals;
ok('endpointKeys equals the rows in endpoints[]', t.endpointKeys === d.endpoints.length);
ok('httpTriggeredFlows equals the rows in flows[]', t.httpTriggeredFlows === d.flows.length);
ok('claimed + unclaimed equals the flow count',
  t.flowsClaimedByAKey + t.flowsClaimedByNoKey === d.flows.length,
  `${t.flowsClaimedByAKey} + ${t.flowsClaimedByNoKey} ≠ ${d.flows.length}`);
ok('unclaimedFlows[] matches its own total', d.unclaimedFlows.length === t.flowsClaimedByNoKey);
ok('the workflow-id totals sum to the flow count',
  t.flowsWithWorkflowIdResolved + t.flowsWithWorkflowIdUnresolved === d.flows.length,
  `${t.flowsWithWorkflowIdResolved} + ${t.flowsWithWorkflowIdUnresolved} ≠ ${d.flows.length}`);
ok('every flow carries a flow id', t.flowsCarryingAFlowId === d.flows.length,
  `${t.flowsCarryingAFlowId} of ${d.flows.length}`);
ok('the posture totals sum to the flow count',
  t.flowsWithNoRecordedAuthentication + t.flowsRecordingTenantAuthentication
  + t.flowsRecordingAllAuthentication === d.flows.length,
  `${t.flowsWithNoRecordedAuthentication} + ${t.flowsRecordingTenantAuthentication} + ${t.flowsRecordingAllAuthentication} ≠ ${d.flows.length}`);

section('No credential travels in it');
const raw = readFileSync(join(ROOT, OUT), 'utf8');
ok('no signed trigger URL appears', !/sig=[A-Za-z0-9_-]{20,}/.test(raw));
ok('no endpoint carries a URL field with a real URL',
  d.endpoints.every((e) => typeof e.url === 'string' && !/^https?:/.test(e.url)));

section('The capture limit is stated rather than assumed');
ok('meta names the export tool and its Get-Flow limit',
  /Get-Flow/.test(d.meta.capture.limit) && /owns or co-owns/.test(d.meta.capture.limit));
ok('meta records the capture dates', Array.isArray(d.meta.capture.capturedOn) && d.meta.capture.capturedOn.length > 0,
  JSON.stringify(d.meta.capture.capturedOn));

section('The lookup index points at rows, and points at all of them');
/* The index earns its place only if a caller can trust it blindly. Two ways it could lie:
   name a position that holds a different row, or list one of the rows a key selects and
   quietly drop the rest. The second is the dangerous one — six flows share a workflowId, and
   an index returning the first would read as an answer. Both are re-derived here from the
   rows themselves rather than from the generator. */
const ix = d.index || {};
const INDEXES = {
  endpointsByKey: [d.endpoints, (e) => [e.key]],
  endpointsByPlatform: [d.endpoints, (e) => [e.platform]],
  endpointsByWorkflowId: [d.endpoints, (e) => [e.workflowId]],
  mailerEndpointsByKey: [d.mailerEndpoints, (e) => [e.key]],
  flowsByCaptureId: [d.flows, (f) => [f.id]],
  flowsByFlowId: [d.flows, (f) => [f.identifiers.flowId]],
  flowsByWorkflowId: [d.flows, (f) => [f.identifiers.workflowId]],
  flowsByDisplayName: [d.flows, (f) => [f.displayName]],
  flowsByEstate: [d.flows, (f) => [f.estate]],
  flowsByTriggerMethod: [d.flows, (f) => [f.trigger.method]],
  flowsByConnector: [d.flows, (f) => f.connections.map((c) => c.connectionName)],
  flowsBySharePointList: [d.flows, (f) => f.sharePointOperations.map((o) => o.list)],
};
ok(`every documented index is present (${Object.keys(INDEXES).length})`,
  Object.keys(INDEXES).every((k) => ix[k] && typeof ix[k] === 'object'),
  Object.keys(INDEXES).filter((k) => !ix[k]).join(', '));
ok('the index carries nothing but these and its own note',
  Object.keys(ix).every((k) => k === 'note' || k in INDEXES),
  Object.keys(ix).filter((k) => k !== 'note' && !(k in INDEXES)).join(', '));

const idxWrong = [];
for (const [name, [rows, keysOf]] of Object.entries(INDEXES)) {
  const built = ix[name];
  if (!built) continue;
  /* Re-derive the whole index from the rows, then compare it whole. Comparing the two maps
     catches a missing key, a surplus key, a short list and a wrong position in one pass. */
  const expect = new Map();
  rows.forEach((row, i) => {
    for (const k of keysOf(row)) {
      if (k === null || k === undefined || k === '') continue;
      if (!expect.has(String(k))) expect.set(String(k), []);
      expect.get(String(k)).push(i);
    }
  });
  for (const [k, want] of expect) {
    const got = built[k];
    if (!Array.isArray(got)) { idxWrong.push(`${name}["${k}"] missing`); continue; }
    const uniq = [...new Set(want)];
    if (got.length !== uniq.length || got.some((p, n) => p !== uniq[n])) {
      idxWrong.push(`${name}["${k}"] = [${got}], rows say [${uniq}]`);
    }
  }
  for (const k of Object.keys(built)) if (!expect.has(k)) idxWrong.push(`${name}["${k}"] indexes nothing`);
  /* A position must resolve, and the row it resolves to must carry the key that led there. */
  for (const [k, ps] of Object.entries(built)) {
    for (const p of ps) {
      if (!Number.isInteger(p) || p < 0 || p >= rows.length) { idxWrong.push(`${name}["${k}"] position ${p} out of range`); continue; }
      if (!keysOf(rows[p]).map(String).includes(k)) idxWrong.push(`${name}["${k}"] -> row ${p}, which does not carry it`);
    }
  }
  const keys = Object.keys(built);
  if (keys.some((k, n) => n > 0 && !(keys[n - 1] < k))) idxWrong.push(`${name} keys are not in byte order`);
}
ok('every index resolves to the rows that carry the key, all of them, and no others',
  idxWrong.length === 0, idxWrong.slice(0, 6).join('\n       '));
ok('a key selecting several rows lists every one of them',
  (ix.flowsByWorkflowId?.['818ec4053f1e4f0b87845114241d8b74'] || []).length
    === d.flows.filter((f) => f.identifiers.workflowId === '818ec4053f1e4f0b87845114241d8b74').length);
ok('every endpoint and every flow is reachable by its own identity',
  Object.values(ix.endpointsByKey || {}).flat().length === d.endpoints.length
  && Object.values(ix.flowsByCaptureId || {}).flat().length === d.flows.length);
ok('the index holds positions only — no row is copied into it',
  Object.entries(ix).every(([k, v]) => k === 'note'
    || Object.values(v).every((l) => Array.isArray(l) && l.every((n) => Number.isInteger(n)))));
ok('meta says the index exists and what its values mean',
  /zero-based positions/.test(d.meta.conventions.lookup || ''));

section('It is current');
let fresh = true, out = '';
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-endpoint-dataset.mjs'), '--check'], { stdio: 'pipe' });
} catch (err) { fresh = false; out = String(err.stderr || err.stdout || err.message).trim(); }
ok('the dataset matches a fresh run of the generator', fresh, out);

console.log(failed ? `\n❌ ${failed} failed\n` : '\n✅ all passed\n');
process.exit(failed ? 1 : 0);
