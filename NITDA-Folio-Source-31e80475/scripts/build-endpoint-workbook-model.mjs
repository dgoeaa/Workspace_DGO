#!/usr/bin/env node
/**
 * Everything the packages hold about the endpoint estate, flattened into sheet-shaped rows.
 *
 * This is HALF of the workbook build. It reads the packages and emits one JSON model; the
 * renderer (scripts/render_endpoint_workbook.py) turns that model into a formatted .xlsx. The
 * split is deliberate — extraction belongs with the other readers in this repository, which
 * already know how an export is shaped, and formatting belongs where the spreadsheet library
 * is. Neither half has to understand the other's problem.
 *
 * NOTHING IS FILTERED, SUMMARISED OR TRUNCATED.
 *   - Every captured flow appears, including the one whose trigger is a connector event rather
 *     than an HTTP request. It is not an endpoint, so it is marked `isEndpoint=FALSE` in a
 *     column rather than dropped: an excluded row cannot be audited, a flagged one can.
 *   - Every action of every flow appears with its configured inputs serialised verbatim.
 *   - A value longer than a cell can hold is SPLIT across continuation columns, never cut. The
 *     row says how many parts it was split into, so a reader can tell a whole value from a
 *     part. Excel's limit is 32,767 characters per cell and one value here exceeds it.
 *   - Where a package does not declare something, the cell reads "(not declared)" rather than
 *     being left blank, because a blank cell and an absent property are indistinguishable in a
 *     spreadsheet and they mean different things.
 *
 * Usage: node scripts/build-endpoint-workbook-model.mjs [outfile]
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { walk } from './lib/flow-definition-reader.mjs';
import { readPackage, schemaRows, connectorOf, redactDeep } from './lib/provisioning-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTFILE = process.argv[2] || join(ROOT, 'dist', 'endpoint-workbook-model.json');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const repoPath = (abs) => relative(ROOT, abs).split(sep).join('/');

const dataset = read('docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json');
const listIndex = read('docs/reference/sharepoint-list-index.json');
const listsByGuid = new Map(Object.entries(listIndex.lists || {}).map(([g, l]) => [g.toLowerCase(), l]));

/* A spreadsheet cannot distinguish an empty cell from an absent property, and this workbook is
   meant to be read as a statement of what is configured. So absence is written out. */
const NOT_DECLARED = '(not declared)';
const NONE = '(none)';
const val = (v) => {
  if (v === undefined) return NOT_DECLARED;
  if (v === null) return 'null';
  if (v === '') return '(empty string)';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(redactDeep(v), null, 2);
};
const json = (v) => (v === undefined ? NOT_DECLARED : JSON.stringify(redactDeep(v), null, 2));
const isEmpty = (v) => v === undefined || v === null
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  || (Array.isArray(v) && v.length === 0);

/* ── read every capture ──────────────────────────────────────────────────────────────── */
const captured = [];
for (const abs of walk(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed'))) {
  const pkg = readPackage(abs, repoPath(abs));
  if (pkg) captured.push(pkg);
}
captured.sort((a, b) => byteCompare(String(a.displayName), String(b.displayName)));

const captureId = (p) => p.file.split('/').pop().replace(/\.json$/, '');
const isEndpoint = (p) => p.trigger?.type === 'Request';
const dsById = new Map((dataset.flows || []).map((f) => [f.id, f]));

/* ── sheets ──────────────────────────────────────────────────────────────────────────── */
const sheets = [];
const add = (name, title, note, columns, rows) => sheets.push({ name, title, note, columns, rows });

/* 02 — endpoint register */
add('02 Endpoint Register',
  'Endpoint register — every key the two applications declare',
  'One row per endpoint contract key. The demand side: what the shipped software calls. '
  + 'A key resolving to more than one captured flow produces one row per flow, so no resolution is hidden.',
  ['Endpoint key', 'Platform', 'Declared by', 'Purpose', 'Contract method', 'Contract action verb',
   'Access', 'Timeout (ms)', 'Timeout declared', 'Source key', 'Route keys (multiplexed operations)',
   'Route key count', 'Workflow ID (trigger URL)', 'Workflow ID source', 'Physical flow', 'Flow label',
   'Endpoint flow name', 'Internal name', 'Register note', 'Flows resolved',
   'Flow ID (maker portal)', 'Flow display name', 'Flow workflow ID', 'Flow workflow ID source',
   'Flow maker URL (constructed)', 'Capture ID', 'Required list operations', 'Trigger URL'],
  (dataset.endpoints || []).flatMap((e) => {
    const base = [
      e.key, e.platform, e.declaredBy, val(e.purpose),
      val(e.contract?.method), val(e.contract?.action), val(e.contract?.access),
      val(e.contract?.timeoutMs), e.contract?.timeoutDeclared ? 'TRUE' : 'FALSE',
      val(e.contract?.sourceKey),
      e.contract?.routeKeys ? e.contract.routeKeys.join(', ') : NONE,
      e.contract?.routeKeys ? e.contract.routeKeys.length : 0,
      val(e.workflowId), val(e.workflowIdSource), val(e.physicalFlow), val(e.flowLabel),
      val(e.endpointFlowName), val(e.internalName), val(e.note), e.flowsResolved,
    ];
    const ops = (e.requiredListOperations || []).map((o) => `${o.operation}: ${o.list} (${o.site}) ${o.listGuid}`).join('\n') || NONE;
    if (!e.flows.length) return [[...base, NONE, NONE, NONE, NONE, NONE, NONE, ops, e.url]];
    return e.flows.map((r) => [...base,
      val(r.flowId), val(r.displayName), val(r.workflowId), val(r.workflowIdSource),
      val(r.flowMakerUrl), val(r.captureId), ops, e.url]);
  }));

/* 03 — flows */
add('03 Flows',
  'Flows — every definition captured from the environment',
  'One row per capture. isEndpoint marks whether the trigger is an HTTP request; the single '
  + 'connector-event flow is retained and flagged rather than removed.',
  ['Capture ID', 'Display name', 'Flow ID (maker portal)', 'Workflow ID (trigger URL)',
   'Workflow ID source', 'Workflow ID in package', 'Is endpoint', 'Estate', 'Estate basis',
   'Environment', 'Exported at (UTC)', 'Exported by', 'Source package', 'Package bytes',
   'Package SHA-256', 'Definition $schema', 'contentVersion', 'Definition description',
   'Flow ID shared with', 'Latest capture of this flow ID', 'Trigger name', 'Trigger type',
   'Trigger kind', 'Method', 'Authentication posture', 'Posture declared', 'Request schema declared',
   'Schema property count', 'Action count', 'Response count', 'Termination count', 'Catch edge count',
   'Connection count', 'SharePoint call count', 'Outbound HTTP count', 'Variable count',
   'Maker URL (constructed)'],
  captured.map((p) => {
    const ds = dsById.get(captureId(p));
    const t = p.trigger;
    const abs = join(ROOT, p.file);
    const bytes = statSync(abs).size;
    const sha = createHash('sha256').update(readFileSync(abs)).digest('hex');
    const rows = t?.schema ? schemaRows(t.schema, '', Array.isArray(t.schema.required) ? t.schema.required : []) : [];
    return [
      captureId(p), p.displayName, val(p.internalName),
      ds ? val(ds.identifiers.workflowId) : NOT_DECLARED,
      ds ? val(ds.identifiers.workflowIdSource) : NOT_DECLARED,
      'FALSE',
      isEndpoint(p) ? 'TRUE' : 'FALSE',
      ds ? ds.estate : (isEndpoint(p) ? 'internal' : 'internal'),
      ds ? ds.estateBasis : 'not an endpoint — no portal register names it',
      val(p.environmentName), val(p.exportedAtUtc), val(p.exportedBy), p.file, bytes, sha,
      val(p.schemaUri), val(p.contentVersion), val(p.definitionDescription),
      ds && ds.internalNameSharedWith.length ? ds.internalNameSharedWith.join('\n') : NONE,
      ds ? (ds.isLatestCaptureOfInternalName ? 'TRUE' : 'FALSE') : NOT_DECLARED,
      t ? val(t.name) : NOT_DECLARED, t ? val(t.type) : NOT_DECLARED, t ? val(t.kind) : NOT_DECLARED,
      t ? val(t.method) : NOT_DECLARED,
      t ? (t.triggerAuthenticationType === undefined ? '(absent from the export)' : val(t.triggerAuthenticationType)) : NOT_DECLARED,
      t ? (t.triggerAuthenticationType !== undefined ? 'TRUE' : 'FALSE') : 'FALSE',
      t?.schema ? 'TRUE' : 'FALSE', rows.length,
      p.actions.length,
      p.actions.filter((a) => a.type === 'Response').length,
      p.actions.filter((a) => a.type === 'Terminate').length,
      p.actions.filter((a) => a.isCatch).length,
      new Set(p.actions.map((a) => connectorOf(a)?.connectionName).filter(Boolean)).size,
      p.actions.filter((a) => /sharepointonline/i.test(`${connectorOf(a)?.apiId || ''}${connectorOf(a)?.connectionName || ''}`)).length,
      p.actions.filter((a) => a.type === 'Http' || a.type === 'HttpWebhook').length,
      p.actions.filter((a) => a.type === 'InitializeVariable').reduce((n, a) => n + (a.inputs?.variables || []).length, 0),
      ds ? val(ds.identifiers.flowMakerUrl) : NOT_DECLARED,
    ];
  }));

/* 04 — trigger detail */
add('04 Trigger Detail',
  'Trigger detail — the invocation surface of every flow, field by field',
  'Every property the trigger declares. An absent authentication posture is written as '
  + '"(absent from the export)" and is NOT the same as a posture of "All".',
  ['Capture ID', 'Display name', 'Is endpoint', 'Trigger name', 'type', 'kind', 'method',
   'relativePath', 'triggerAuthenticationType', 'Posture declared', 'operationOptions',
   'conditions', 'splitOn', 'correlation', 'recurrence', 'evaluatedRecurrence',
   'runtimeConfiguration', 'Declared request headers', 'Declared query parameters',
   'Trigger description', 'Trigger metadata'],
  captured.filter((p) => p.trigger).map((p) => {
    const t = p.trigger;
    return [captureId(p), p.displayName, isEndpoint(p) ? 'TRUE' : 'FALSE',
      val(t.name), val(t.type), val(t.kind), val(t.method), val(t.relativePath),
      t.triggerAuthenticationType === undefined ? '(absent from the export)' : val(t.triggerAuthenticationType),
      t.triggerAuthenticationType !== undefined ? 'TRUE' : 'FALSE',
      val(t.operationOptions), isEmpty(t.conditions) ? NOT_DECLARED : json(t.conditions),
      val(t.splitOn), isEmpty(t.correlation) ? NOT_DECLARED : json(t.correlation),
      isEmpty(t.recurrence) ? NOT_DECLARED : json(t.recurrence),
      isEmpty(t.evaluatedRecurrence) ? NOT_DECLARED : json(t.evaluatedRecurrence),
      isEmpty(t.runtimeConfiguration) ? NOT_DECLARED : json(t.runtimeConfiguration),
      isEmpty(t.headers) ? NOT_DECLARED : json(t.headers),
      isEmpty(t.queries) ? NOT_DECLARED : json(t.queries),
      val(t.description), isEmpty(t.metadata) ? NOT_DECLARED : json(t.metadata)];
  }));

/* 05 — request properties */
add('05 Request Properties',
  'Request payload — every property every trigger declares, at every depth',
  'Nested properties are addressed by dotted path; an array element is marked []. '
  + '"Required" is resolved against the PARENT object\'s required list, which is where JSON Schema puts it.',
  ['Capture ID', 'Display name', 'Property path', 'Depth', 'Declared type', 'Required',
   'Format', 'Enum values', 'Default', 'minLength', 'maxLength', 'Pattern', 'Description',
   'additionalProperties (this level)'],
  captured.filter((p) => p.trigger?.schema).flatMap((p) => {
    const s = p.trigger.schema;
    return schemaRows(s, '', Array.isArray(s.required) ? s.required : []).map((r) => [
      captureId(p), p.displayName, r.path, r.path.split('.').length,
      r.type === null ? NOT_DECLARED : r.type,
      r.required ? 'TRUE' : 'FALSE',
      r.format === null ? NOT_DECLARED : r.format,
      r.enum ? JSON.stringify(r.enum) : NOT_DECLARED,
      r.default === undefined ? NOT_DECLARED : val(r.default),
      r.minLength === null ? NOT_DECLARED : r.minLength,
      r.maxLength === null ? NOT_DECLARED : r.maxLength,
      r.pattern === null ? NOT_DECLARED : r.pattern,
      r.description === null ? NOT_DECLARED : r.description,
      r.additionalProperties === undefined ? NOT_DECLARED : val(r.additionalProperties)]);
  }));

/* 06 — request schemas, verbatim */
add('06 Request Schemas',
  'Request schemas — verbatim, as each trigger declares them',
  'The complete JSON Schema of every trigger that declares one, byte for byte. '
  + 'Flows with no schema accept any JSON body and validate nothing at the boundary; they are listed with the reason.',
  ['Capture ID', 'Display name', 'Schema declared', 'Root $schema', 'Root type', 'Root title',
   'Root required', 'Root additionalProperties', 'Schema (verbatim JSON)'],
  captured.filter((p) => p.trigger).map((p) => {
    const s = p.trigger.schema;
    if (!s) return [captureId(p), p.displayName, 'FALSE', NOT_DECLARED, NOT_DECLARED, NOT_DECLARED,
      NOT_DECLARED, NOT_DECLARED, 'The trigger declares no schema: any JSON body is accepted and nothing is validated at the boundary.'];
    return [captureId(p), p.displayName, 'TRUE', val(s.$schema), val(s.type), val(s.title),
      Array.isArray(s.required) ? (s.required.join(', ') || '(empty — nothing is mandatory)') : NOT_DECLARED,
      Object.prototype.hasOwnProperty.call(s, 'additionalProperties') ? val(s.additionalProperties) : NOT_DECLARED,
      json(s)];
  }));

/* 07 — responses */
add('07 Responses',
  'Responses — every reply an endpoint returns, with status, headers and body verbatim',
  'A status code that begins with @ is an expression evaluated at run time, so the flow has no fixed code. '
  + 'Headers and body are printed exactly as configured.',
  ['Capture ID', 'Display name', 'Action path', 'Action name', 'Status code', 'Status is expression',
   'Runs after', 'On statuses', 'Headers (verbatim)', 'Header count', 'Body declared',
   'Body (verbatim)', 'Response schema (verbatim)', 'operationOptions'],
  captured.flatMap((p) => p.actions.filter((a) => a.type === 'Response').map((a) => [
    captureId(p), p.displayName, a.path, a.name,
    a.inputs?.statusCode === undefined ? NOT_DECLARED : val(a.inputs.statusCode),
    typeof a.inputs?.statusCode === 'string' && /^@/.test(a.inputs.statusCode) ? 'TRUE' : 'FALSE',
    a.runAfter.length ? a.runAfter.map((e) => e.after).join(', ') : '(first in its scope)',
    a.runAfter.length ? a.runAfter.map((e) => e.statuses.join('/')).join(' | ') : NONE,
    isEmpty(a.inputs?.headers) ? NONE : json(a.inputs.headers),
    a.inputs?.headers && typeof a.inputs.headers === 'object' ? Object.keys(a.inputs.headers).length : 0,
    Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? 'TRUE' : 'FALSE',
    Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? json(a.inputs.body) : NOT_DECLARED,
    isEmpty(a.inputs?.schema) ? NOT_DECLARED : json(a.inputs.schema),
    val(a.operationOptions)])));

/* 08 — terminations */
add('08 Terminations',
  'Terminations — every action that ends a run deliberately',
  'A Terminate action stops the run with the status and error it declares.',
  ['Capture ID', 'Display name', 'Action path', 'runStatus', 'Error code', 'Error message',
   'Runs after', 'On statuses'],
  captured.flatMap((p) => p.actions.filter((a) => a.type === 'Terminate').map((a) => [
    captureId(p), p.displayName, a.path, val(a.inputs?.runStatus),
    val(a.inputs?.runError?.code), val(a.inputs?.runError?.message),
    a.runAfter.length ? a.runAfter.map((e) => e.after).join(', ') : '(first in its scope)',
    a.runAfter.length ? a.runAfter.map((e) => e.statuses.join('/')).join(' | ') : NONE])));

/* 09 — error handling */
add('09 Error Handling',
  'Error handling — every action wired to run on something other than success',
  'An action that runs after Failed, Skipped or TimedOut is a catch path, whatever it is named. '
  + 'A flow with no rows here has no catch path at all: every dependency is a success edge.',
  ['Capture ID', 'Display name', 'Action path', 'Action type', 'Runs after', 'On statuses',
   'Catches Failed', 'Catches Skipped', 'Catches TimedOut'],
  captured.flatMap((p) => p.actions.filter((a) => a.isCatch).map((a) => {
    const st = a.runAfter.flatMap((e) => e.statuses.map(String));
    return [captureId(p), p.displayName, a.path, val(a.type),
      a.runAfter.map((e) => e.after).join(', '),
      a.runAfter.map((e) => e.statuses.join('/')).join(' | '),
      st.includes('Failed') ? 'TRUE' : 'FALSE',
      st.includes('Skipped') ? 'TRUE' : 'FALSE',
      st.includes('TimedOut') ? 'TRUE' : 'FALSE'];
  })));

/* 10 — runtime configuration */
add('10 Runtime Configuration',
  'Runtime configuration — retry, secure data, operation options, tracked properties, loop limits',
  'Only actions that set one of these appear. Every other action runs on the platform defaults.',
  ['Capture ID', 'Display name', 'Action path', 'Action type', 'runtimeConfiguration (verbatim)',
   'Retry policy', 'Secure data', 'Pagination policy', 'operationOptions', 'trackedProperties (verbatim)', 'limit'],
  captured.flatMap((p) => p.actions
    .filter((a) => !isEmpty(a.runtimeConfiguration) || a.operationOptions || !isEmpty(a.trackedProperties) || a.limit)
    .map((a) => [captureId(p), p.displayName, a.path, val(a.type),
      isEmpty(a.runtimeConfiguration) ? NOT_DECLARED : json(a.runtimeConfiguration),
      isEmpty(a.runtimeConfiguration?.retryPolicy) ? NOT_DECLARED : json(a.runtimeConfiguration.retryPolicy),
      isEmpty(a.runtimeConfiguration?.secureData) ? NOT_DECLARED : json(a.runtimeConfiguration.secureData),
      isEmpty(a.runtimeConfiguration?.paginationPolicy) ? NOT_DECLARED : json(a.runtimeConfiguration.paginationPolicy),
      val(a.operationOptions),
      isEmpty(a.trackedProperties) ? NOT_DECLARED : json(a.trackedProperties),
      val(a.limit)])));

/* 11 — connections */
add('11 Connections',
  'Connections — every connector binding each flow uses',
  'Read from each action\'s inputs.host. Two connections to the same connector count separately, '
  + 'because they are separate bindings with separate credentials.',
  ['Capture ID', 'Display name', 'Connection name', 'API ID', 'Connection reference name',
   'Operations used', 'Call count'],
  captured.flatMap((p) => {
    const m = new Map();
    for (const a of p.actions) {
      const c = connectorOf(a);
      if (!c || !(c.connectionName || c.apiId)) continue;
      const k = `${c.connectionName || ''}|${c.apiId || ''}`;
      if (!m.has(k)) m.set(k, { ...c, ops: new Map(), n: 0 });
      const e = m.get(k);
      const op = c.operationId || a.type;
      e.ops.set(op, (e.ops.get(op) || 0) + 1);
      e.n++;
    }
    return [...m.values()].map((c) => [captureId(p), p.displayName,
      val(c.connectionName), val(c.apiId), val(c.connectionReferenceName),
      [...c.ops.entries()].sort().map(([o, n]) => `${o} × ${n}`).join('\n'), c.n]);
  }));

/* 12 — SharePoint operations */
add('12 SharePoint Operations',
  'SharePoint operations — every list call, with the list resolved',
  'The table parameter is printed as configured; the resolved columns come from the list index. '
  + 'A table chosen by an expression has no static answer and says so.',
  ['Capture ID', 'Display name', 'Action path', 'Operation ID', 'Connection name',
   'Site (dataset)', 'List (table)', 'Resolved list title', 'Resolved site', 'Chosen at run time',
   'All parameters (verbatim)'],
  captured.flatMap((p) => p.actions.filter((a) => {
    const c = connectorOf(a);
    return /sharepointonline/i.test(`${c?.apiId || ''}${c?.connectionName || ''}`);
  }).map((a) => {
    const c = connectorOf(a);
    const par = a.inputs?.parameters || {};
    const tbl = typeof par.table === 'string' ? par.table : null;
    const hit = tbl ? listsByGuid.get(tbl.toLowerCase()) : null;
    return [captureId(p), p.displayName, a.path, val(c?.operationId), val(c?.connectionName),
      val(par.dataset), val(par.table),
      hit ? hit.title : (tbl && /@/.test(tbl) ? '(chosen at run time)' : '(not in the list index)'),
      hit ? hit.site : NOT_DECLARED,
      tbl && /@/.test(tbl) ? 'TRUE' : 'FALSE',
      json(par)];
  })));

/* 13 — outbound HTTP */
add('13 Outbound HTTP',
  'Outbound HTTP — every call leaving the platform',
  'Raw HTTP actions, with method, URI, headers and body as configured.',
  ['Capture ID', 'Display name', 'Action path', 'Method', 'URI', 'Host', 'Headers (verbatim)',
   'Queries (verbatim)', 'Body declared', 'Body (verbatim)', 'Authentication', 'Retry policy'],
  captured.flatMap((p) => p.actions.filter((a) => a.type === 'Http' || a.type === 'HttpWebhook').map((a) => [
    captureId(p), p.displayName, a.path, val(a.inputs?.method), val(a.inputs?.uri),
    typeof a.inputs?.uri === 'string' ? ((a.inputs.uri.match(/^https?:\/\/([^/]+)/) || [])[1] ?? '(expression)') : NOT_DECLARED,
    isEmpty(a.inputs?.headers) ? NOT_DECLARED : json(a.inputs.headers),
    isEmpty(a.inputs?.queries) ? NOT_DECLARED : json(a.inputs.queries),
    Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? 'TRUE' : 'FALSE',
    Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? json(a.inputs.body) : NOT_DECLARED,
    isEmpty(a.inputs?.authentication) ? NOT_DECLARED : json(a.inputs.authentication),
    isEmpty(a.runtimeConfiguration?.retryPolicy) ? NOT_DECLARED : json(a.runtimeConfiguration.retryPolicy)])));

/* 14 — variables */
add('14 Variables',
  'Variables — every variable declared, and every write to it',
  'Initialise rows carry the declared type and initial value. Write rows carry the expression or literal assigned.',
  ['Capture ID', 'Display name', 'Operation', 'Action path', 'Variable name', 'Declared type',
   'Value (verbatim)'],
  captured.flatMap((p) => p.actions.flatMap((a) => {
    if (a.type === 'InitializeVariable') {
      return (a.inputs?.variables || []).map((v) => [captureId(p), p.displayName, 'Initialize', a.path,
        val(v?.name), val(v?.type),
        Object.prototype.hasOwnProperty.call(v || {}, 'value') ? val(v.value) : '(no initial value)']);
    }
    if (['SetVariable', 'AppendToStringVariable', 'AppendToArrayVariable', 'IncrementVariable', 'DecrementVariable'].includes(a.type)) {
      return [[captureId(p), p.displayName, a.type, a.path, val(a.inputs?.name), NOT_DECLARED,
        Object.prototype.hasOwnProperty.call(a.inputs || {}, 'value') ? val(a.inputs.value) : NOT_DECLARED]];
    }
    return [];
  })));

/* 15 — the action register: every action, every configured input, verbatim */
add('15 Action Register',
  'Action register — every action of every flow, with its configured inputs verbatim',
  'The complete action graph. "Runs after" and "On statuses" together are the dependency: an action '
  + 'running after anything but Succeeded is error handling. Inputs are serialised exactly as configured; '
  + 'a value too long for one cell continues in the next column and the part count says so.',
  ['Capture ID', 'Display name', 'Action path', 'Action name', 'Depth', 'Type', 'Kind',
   'Description', 'Runs after', 'On statuses', 'Is catch path', 'Is first in scope',
   'Connector', 'Operation ID', 'Inputs (verbatim)', 'Expression (verbatim)', 'Foreach (verbatim)',
   'runtimeConfiguration', 'trackedProperties', 'operationOptions', 'limit', 'Metadata'],
  captured.flatMap((p) => p.actions.map((a) => {
    const c = connectorOf(a);
    return [captureId(p), p.displayName, a.path, a.name, a.depth, val(a.type), val(a.kind),
      val(a.description),
      a.runAfter.length ? a.runAfter.map((e) => e.after).join(', ') : '(first in its scope)',
      a.runAfter.length ? a.runAfter.map((e) => e.statuses.join('/')).join(' | ') : NONE,
      a.isCatch ? 'TRUE' : 'FALSE', a.isFirst ? 'TRUE' : 'FALSE',
      val(c?.connectionName ?? c?.apiId), val(c?.operationId),
      a.inputs === undefined ? '(this action declares no inputs)' : json(a.inputs),
      a.expression === undefined ? NOT_DECLARED : json(a.expression),
      a.foreach === undefined ? NOT_DECLARED : json(a.foreach),
      isEmpty(a.runtimeConfiguration) ? NOT_DECLARED : json(a.runtimeConfiguration),
      isEmpty(a.trackedProperties) ? NOT_DECLARED : json(a.trackedProperties),
      val(a.operationOptions), val(a.limit),
      isEmpty(a.metadata) ? NOT_DECLARED : json(a.metadata)];
  })));

/* 16 — definition parameters */
add('16 Definition Parameters',
  'Definition parameters — the $connections and $authentication each definition declares',
  'These are the workflow-level parameters, distinct from the trigger request payload.',
  ['Capture ID', 'Display name', 'Parameter', 'Type', 'Default value (verbatim)'],
  captured.flatMap((p) => Object.entries(p.parameters || {}).map(([n, d]) => [
    captureId(p), p.displayName, n, val(d?.type),
    Object.prototype.hasOwnProperty.call(d || {}, 'defaultValue') ? json(d.defaultValue) : NOT_DECLARED])));

/* 17 — unclaimed */
add('17 Unclaimed Flows',
  'Unclaimed flows — captured, HTTP-triggered, and named by no endpoint key',
  'These exist in the environment. Nothing in the repository claims to need them. That is a statement '
  + 'about the registers, not a verdict on the flows: a flow here may be live work nobody wrote down, '
  + 'a superseded copy, or an experiment.',
  ['Capture ID', 'Display name', 'Flow ID', 'Workflow ID', 'Estate', 'Method', 'Maker URL (constructed)'],
  (dataset.unclaimedFlows || []).map((u) => [u.id, u.displayName, val(u.flowId), val(u.workflowId),
    u.estate, val(u.method), val(u.flowMakerUrl)]));

/* 18 — boundary */
add('18 Boundary & Conflicts',
  'Boundary and conflicts — what is not an endpoint, and where two captures disagree',
  'Recorded so that the workbook\'s edges are stated rather than assumed.',
  ['Category', 'Subject', 'Detail', 'Note'],
  [
    ...(dataset.meta?.excluded || []).map((e) => ['Not an endpoint', e.displayName,
      `trigger type: ${e.triggerType} · flow ID ${e.internalName}`, e.reason]),
    ...(dataset.meta?.internalNameCollisions || []).flatMap((c) => c.captures.map((cap) => [
      'Flow ID carried by two captures', c.internalName,
      `${cap.displayName} — exported ${cap.exportedAtUtc}, ${cap.actionCount} actions, ${cap.responses} response(s)`,
      `${cap.isLatestCapture ? 'LATER capture. ' : 'Earlier capture. '}${c.note}`])),
  ]);

/* ── model ───────────────────────────────────────────────────────────────────────────── */
const commit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
})();

writeFileSync(OUTFILE, JSON.stringify({
  generatedBy: 'scripts/build-endpoint-workbook-model.mjs',
  commit,
  dataset: { schema: dataset.$schema, capture: dataset.meta?.capture, totals: dataset.meta?.totals },
  conventions: dataset.meta?.conventions,
  sheets,
}, null, 1));

const cells = sheets.reduce((n, s) => n + s.rows.length * s.columns.length, 0);
console.log(`\n  wrote ${relative(ROOT, OUTFILE)} — ${sheets.length} sheets, `
  + `${sheets.reduce((n, s) => n + s.rows.length, 0)} rows, ${cells} cells\n`);
for (const s of sheets) console.log(`    ${String(s.rows.length).padStart(5)} rows × ${String(s.columns.length).padStart(2)} cols   ${s.name}`);
console.log('');
