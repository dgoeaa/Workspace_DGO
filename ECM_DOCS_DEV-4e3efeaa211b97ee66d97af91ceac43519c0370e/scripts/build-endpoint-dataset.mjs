#!/usr/bin/env node
/**
 * The endpoint surface, as data.
 *
 * WHY THIS EXISTS
 * `docs/folio-Master-Flows-and-Endpoints/provisioning/` is 60 markdown pages, written to be read. Nothing in this
 * repository could be *queried*: to answer "which endpoints accept a POST with no declared
 * schema", or "which ones write to the registry list", somebody had to open pages and count.
 * This emits one JSON document holding the endpoint surface and nothing else, so that
 * question is a filter rather than a reading exercise.
 *
 * SCOPE — ENDPOINTS ONLY, AND THE BOUNDARY IS STATED
 * An endpoint here is something a caller can invoke over HTTP. That means:
 *   - the 26 endpoint KEYS the two applications declare, which is the demand side, and
 *   - the flows carrying a `Request` trigger, which is the supply side.
 * A flow with a connector-event trigger is not an endpoint and is excluded by name in
 * `meta.excluded`, not silently dropped. Action-level configuration is deliberately absent:
 * it is on the provisioning pages, verbatim, and repeating it here would make this a second
 * copy of the estate rather than a view of its surface.
 *
 * NORMALISED, NOT DUPLICATED
 * `endpoints[]` are contract keys; `flows[]` are the definitions behind them; a key points at
 * a flow by `id`. Several keys share one flow — that is the estate's actual shape — and a
 * denormalised file would state each shared flow's schema four times and let the copies drift.
 *
 * EVERY VALUE IS READ FROM A PACKAGE. Where a package does not declare something the field is
 * `null` and a sibling `*Declared` boolean says so, because "the export says All" and "the
 * export does not say" are different facts about who may invoke a trigger.
 *
 * Usage:
 *   node scripts/build-endpoint-dataset.mjs           write the dataset
 *   node scripts/build-endpoint-dataset.mjs --check   fail if it has drifted
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { walk } from './lib/flow-definition-reader.mjs';
import { readPackage, schemaRows, connectorOf, redactDeep } from './lib/provisioning-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
/* NOT under docs/folio-Master-Flows-and-Endpoints/provisioning/. That directory is owned end-to-end by
   scripts/build-provisioning-reference.mjs, which deletes anything in it that it did not
   write — correctly, because an orphaned page there reads as current. A second generator
   writing into the same tree had its output silently removed on the next build. This sits
   with the other reference registers instead. */
const OUT = 'docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json';
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const repoPath = (abs) => relative(ROOT, abs).split(sep).join('/');

const listIndex = read('docs/reference/sharepoint-list-index.json');
const register = read('docs/folio-Master-Flows-and-Endpoints/registers/internal-flow-register.json');
const portalIds = read('docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json');
const internalIds = read('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json');
const standard = read('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/flow-standard.json');
const wiring = read('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-wiring.json');
const { EndpointContracts } = await import(new URL('../config/endpoints.config.js', import.meta.url));
const mailerCatalogue = read('mailer/flows/flows.catalogue.json');

const listsByGuid = new Map(
  Object.entries(listIndex.lists || {}).map(([g, l]) => [g.toLowerCase(), l]),
);

/* Estate is cited, never guessed from a name — the same two registers the provisioning
   reference uses, so the two documents cannot disagree about which platform a flow serves. */
const PORTAL_NAMES = new Map();
for (const f of standard.portalFlows || []) PORTAL_NAMES.set(f, 'flow-standard.json#portalFlows');
for (const e of portalIds.endpoints || []) {
  if (e.flow && !PORTAL_NAMES.has(e.flow)) PORTAL_NAMES.set(e.flow, `portal-endpoint-workflow-ids.json (${e.key})`);
}
const PORTAL_INTERNAL_NAMES = new Map(
  (portalIds.endpoints || []).filter((e) => e.internalName).map((e) => [e.internalName, e.key]),
);

/* ── read the captured flows ─────────────────────────────────────────────────────────── */

const captured = [];
for (const abs of walk(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed'))) {
  const pkg = readPackage(abs, repoPath(abs));
  if (pkg) captured.push(pkg);
}
captured.sort((a, b) => byteCompare(String(a.displayName), String(b.displayName)));

const isEndpoint = (p) => p.trigger?.type === 'Request';

/** Stable, unique per capture: the export filename without its extension. */
const captureId = (p) => p.file.split('/').pop().replace(/\.json$/, '');

/* Which internal names are carried by more than one capture, and which capture of each is the
   later one. Stated as data because it is an estate fact an operator has to resolve, not a
   quirk of this file. */
const sharedInternalNames = new Map();
const latestByInternalName = new Map();
{
  const byName = new Map();
  for (const p of captured.filter(isEndpoint)) {
    if (!byName.has(p.internalName)) byName.set(p.internalName, []);
    byName.get(p.internalName).push(p);
  }
  for (const [name, list] of byName) {
    /* Byte comparison. An ISO-8601 timestamp sorts correctly as a plain string, and a
       locale-aware sort would make this file's contents depend on the machine that built it —
       which `--check` would then report as drift for everyone else. tests/governance.test.mjs
       enforces that across every generator, by scanning their source for the call by name. */
    const latest = [...list].sort((a, b) => byteCompare(String(b.exportedAtUtc), String(a.exportedAtUtc)))[0];
    latestByInternalName.set(name, captureId(latest));
    if (list.length > 1) sharedInternalNames.set(name, list.map(captureId));
  }
}
const excluded = captured.filter((p) => !isEndpoint(p)).map((p) => ({
  displayName: p.displayName,
  internalName: p.internalName,
  triggerType: p.trigger?.type ?? null,
  reason: 'the trigger is a connector event, not an HTTP request — nothing invokes it at a URL',
}));

/* ── the two identifier schemes, and where each comes from ────────────────────────────
 * A flow has two ids and they are not interchangeable:
 *   flowId      the dashed GUID Power Automate names the flow by. It is what the maker
 *               portal URL carries, and every export records it as workflow_identity
 *               .internal_name — so it is available for all of them, from the package.
 *   workflowId  the 32-hex id the SIGNED TRIGGER URL addresses. NO PACKAGE CARRIES IT.
 *               Every export in this tree records workflow_identity.full_resource_id as
 *               null, and the only literal 32-hex ids anywhere in the definitions belong to
 *               OTHER flows being called. It is therefore joined from the two registers, and
 *               where no register names the flow it stays null rather than being guessed.
 * Both are recorded per flow with the source of the join stated, because an operator opening
 * the maker portal needs the first and an operator tracing a trigger URL needs the second. */
const workflowIdByDefinition = new Map();
const workflowIdByInternalName = new Map();
for (const c of register.contractKeys || []) {
  if (!c.workflowId) continue;
  for (const d of c.definitions || []) {
    workflowIdByDefinition.set(d, { workflowId: c.workflowId, source: `internal-flow-register.json (${c.key})` });
  }
}
for (const e of portalIds.endpoints || []) {
  if (e.internalName && e.workflowId) {
    workflowIdByInternalName.set(e.internalName, { workflowId: e.workflowId, source: `portal-endpoint-workflow-ids.json (${e.key})` });
  }
}
const workflowIdFor = (pkg) => workflowIdByDefinition.get(pkg.file)
  || workflowIdByInternalName.get(pkg.internalName)
  || null;

/* Constructed, not read: the maker portal addresses a flow as
   .../environments/<environmentName>/flows/<flowId>/details. Both halves are verbatim from
   the package; the URL around them is this generator's construction and is named so. */
const makerUrlFor = (pkg) => (pkg.environmentName && pkg.internalName
  ? `https://make.powerautomate.com/environments/${pkg.environmentName}/flows/${pkg.internalName}/details`
  : null);

/* ── per-flow endpoint surface ───────────────────────────────────────────────────────── */

const nullIfEmpty = (v) => (v === undefined || v === null
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  || (Array.isArray(v) && v.length === 0) ? null : redactDeep(v));

function surfaceOf(pkg) {
  const t = pkg.trigger;
  const acts = pkg.actions;

  const responses = acts.filter((a) => a.type === 'Response').map((a) => ({
    action: a.path,
    statusCode: a.inputs?.statusCode === undefined ? null : redactDeep(a.inputs.statusCode),
    statusCodeIsExpression: typeof a.inputs?.statusCode === 'string' && /^@/.test(a.inputs.statusCode),
    headers: nullIfEmpty(a.inputs?.headers),
    body: Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? redactDeep(a.inputs.body) : null,
    bodyDeclared: Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body'),
    schema: nullIfEmpty(a.inputs?.schema),
    runAfter: a.runAfter.map((e) => ({ after: e.after, statuses: e.statuses })),
  }));

  const terminations = acts.filter((a) => a.type === 'Terminate').map((a) => ({
    action: a.path,
    runStatus: a.inputs?.runStatus ?? null,
    errorCode: a.inputs?.runError?.code ?? null,
    errorMessage: a.inputs?.runError?.message ?? null,
  }));

  const catchEdges = acts.filter((a) => a.isCatch).map((a) => ({
    action: a.path,
    type: a.type,
    runAfter: a.runAfter.map((e) => ({ after: e.after, statuses: e.statuses })),
  }));

  const retryPolicies = acts
    .filter((a) => a.runtimeConfiguration?.retryPolicy)
    .map((a) => ({ action: a.path, retryPolicy: redactDeep(a.runtimeConfiguration.retryPolicy) }));

  const connections = new Map();
  for (const a of acts) {
    const c = connectorOf(a);
    if (!c || !(c.connectionName || c.apiId)) continue;
    const k = `${c.connectionName || ''}|${c.apiId || ''}`;
    if (!connections.has(k)) {
      connections.set(k, { connectionName: c.connectionName ?? null, apiId: c.apiId ?? null, operations: {} });
    }
    const op = c.operationId || a.type;
    const e = connections.get(k);
    e.operations[op] = (e.operations[op] || 0) + 1;
  }

  const sharePointOperations = [];
  for (const a of acts) {
    const c = connectorOf(a);
    if (!/sharepointonline/i.test(`${c?.apiId || ''} ${c?.connectionName || ''}`)) continue;
    const p = a.inputs?.parameters || {};
    const tbl = typeof p.table === 'string' ? p.table : null;
    const hit = tbl ? listsByGuid.get(tbl.toLowerCase()) : null;
    sharePointOperations.push({
      action: a.path,
      operationId: c.operationId ?? null,
      connectionName: c.connectionName ?? null,
      site: p.dataset ?? null,
      list: tbl,
      listResolvesTo: hit ? { title: hit.title, site: hit.site } : null,
      listChosenAtRunTime: typeof tbl === 'string' && /@/.test(tbl),
    });
  }

  const outboundHttp = acts.filter((a) => a.type === 'Http' || a.type === 'HttpWebhook').map((a) => ({
    action: a.path,
    method: a.inputs?.method ?? null,
    uri: a.inputs?.uri === undefined ? null : redactDeep(a.inputs.uri),
    host: typeof a.inputs?.uri === 'string' ? (a.inputs.uri.match(/^https?:\/\/([^/]+)/) || [])[1] ?? null : null,
    headers: nullIfEmpty(a.inputs?.headers),
    bodyDeclared: Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body'),
    authentication: nullIfEmpty(a.inputs?.authentication),
    retryPolicy: nullIfEmpty(a.runtimeConfiguration?.retryPolicy),
  }));

  const variables = [];
  for (const a of acts.filter((x) => x.type === 'InitializeVariable')) {
    for (const v of a.inputs?.variables || []) {
      variables.push({
        name: v?.name ?? null,
        type: v?.type ?? null,
        initialValue: Object.prototype.hasOwnProperty.call(v || {}, 'value') ? redactDeep(v.value) : null,
        initialValueDeclared: Object.prototype.hasOwnProperty.call(v || {}, 'value'),
        declaredBy: a.path,
      });
    }
  }

  const schema = t?.schema ?? null;
  const rows = schema ? schemaRows(schema, '', Array.isArray(schema.required) ? schema.required : []) : [];

  return {
    /* The export FILE is the only unique handle. Two captures in this estate share one
       internal name — CG_Upload_Endpoint and ECM_DOCS_INTAKE are both
       df7ddff1-9275-4f23-acf6-e169525f4e2f — and they are not the same definition: 61 actions
       against 13, one Response against two, captured five days apart. Keying on internal name
       silently collapsed them and made one flow's responses read as the other's. */
    id: captureId(pkg),
    identifiers: {
      flowId: pkg.internalName,
      flowIdSource: pkg.internalName ? 'the export — workflow_identity.internal_name' : null,
      workflowId: workflowIdFor(pkg)?.workflowId ?? null,
      workflowIdSource: workflowIdFor(pkg)?.source ?? null,
      workflowIdInPackage: false,
      environmentName: pkg.environmentName,
      captureId: captureId(pkg),
      flowMakerUrl: makerUrlFor(pkg),
      flowMakerUrlIsConstructed: true,
    },
    internalName: pkg.internalName,
    internalNameSharedWith: sharedInternalNames.get(pkg.internalName)
      ? sharedInternalNames.get(pkg.internalName).filter((x) => x !== captureId(pkg)) : [],
    isLatestCaptureOfInternalName: latestByInternalName.get(pkg.internalName) === captureId(pkg),
    displayName: pkg.displayName,
    workflowId: workflowIdFor(pkg)?.workflowId ?? null,
    estate: PORTAL_NAMES.has(pkg.displayName) || PORTAL_INTERNAL_NAMES.has(pkg.internalName) ? 'portal' : 'internal',
    estateBasis: PORTAL_NAMES.get(pkg.displayName)
      ?? (PORTAL_INTERNAL_NAMES.has(pkg.internalName)
        ? `portal-endpoint-workflow-ids.json (${PORTAL_INTERNAL_NAMES.get(pkg.internalName)})`
        : 'no portal register names this flow'),
    source: {
      package: pkg.file,
      exportedAtUtc: pkg.exportedAtUtc,
      exportedBy: pkg.exportedBy,
      environment: pkg.environmentName,
    },
    trigger: {
      name: t.name,
      type: t.type,
      kind: t.kind ?? null,
      method: t.method ?? null,
      methodDeclared: t.method !== null && t.method !== undefined,
      relativePath: t.relativePath ?? null,
      triggerAuthenticationType: t.triggerAuthenticationType === undefined ? null : t.triggerAuthenticationType,
      triggerAuthenticationTypeDeclared: t.triggerAuthenticationType !== undefined,
      operationOptions: t.operationOptions ?? null,
      conditions: nullIfEmpty(t.conditions),
      splitOn: t.splitOn ?? null,
      declaredHeaders: nullIfEmpty(t.headers),
      declaredQueries: nullIfEmpty(t.queries),
    },
    request: {
      schemaDeclared: Boolean(schema),
      schema: schema ? redactDeep(schema) : null,
      required: schema && Array.isArray(schema.required) ? schema.required : [],
      additionalProperties: schema && Object.prototype.hasOwnProperty.call(schema, 'additionalProperties')
        ? schema.additionalProperties : null,
      properties: rows.map((r) => ({
        path: r.path,
        type: r.type,
        required: r.required,
        format: r.format,
        enum: r.enum,
        default: r.default === undefined ? null : redactDeep(r.default),
        minLength: r.minLength,
        maxLength: r.maxLength,
        pattern: r.pattern,
        description: r.description,
      })),
    },
    responses,
    terminations,
    errorHandling: { catchEdges, retryPolicies },
    connections: [...connections.values()].sort((a, b) => byteCompare(String(a.connectionName), String(b.connectionName))),
    sharePointOperations,
    outboundHttp,
    variables,
    actionCount: acts.length,
  };
}

const flows = captured.filter(isEndpoint).map(surfaceOf);
const flowsByInternalName = new Map();
for (const f of flows) {
  if (!flowsByInternalName.has(f.internalName)) flowsByInternalName.set(f.internalName, []);
  flowsByInternalName.get(f.internalName).push(f);
}

/* ── the demand side: contract keys the applications declare ─────────────────────────── */

const byDisplayName = new Map(flows.map((f) => [f.displayName, f]));
const definitionToFlow = new Map();
for (const f of flows) definitionToFlow.set(f.source.package, f);

/** definition file -> contract keys, from the register */
const keysByFile = new Map();
for (const c of register.contractKeys || []) {
  for (const d of c.definitions || []) {
    if (!keysByFile.has(d)) keysByFile.set(d, []);
    keysByFile.get(d).push(c);
  }
}

/* An endpoint names its flows by IDENTIFIER, not by capture filename. A reader of
   endpoints[] should not have to cross-reference flows[] to learn which flow in Power
   Automate answers a key — that was the defect in the first cut of this file. */
const flowRef = (f) => ({
  captureId: f.id,
  flowId: f.identifiers.flowId,
  workflowId: f.identifiers.workflowId,
  workflowIdSource: f.identifiers.workflowIdSource,
  displayName: f.displayName,
  flowMakerUrl: f.identifiers.flowMakerUrl,
});

const endpoints = [];

for (const [key, c] of Object.entries(EndpointContracts)) {
  const reg = (register.contractKeys || []).find((r) => r.key === key) || null;
  const ids = internalIds.internal?.[key] || null;
  const resolved = (reg?.definitions || [])
    .map((d) => definitionToFlow.get(d))
    .filter(Boolean);
  endpoints.push({
    key,
    platform: 'internal',
    declaredBy: 'config/endpoints.config.js#EndpointContracts',
    contract: {
      method: c.method ?? null,
      action: c.action ?? null,
      access: c.readOnly ? 'read-only' : (c.write ? 'write' : null),
      timeoutMs: c.timeoutMs ?? null,
      timeoutDeclared: c.timeoutMs !== undefined,
      sourceKey: c.sourceKey ?? null,
      routeKeys: Array.isArray(c.routeKeys) ? c.routeKeys : null,
    },
    workflowId: ids?.workflowId ?? reg?.workflowId ?? null,
    workflowIdSource: ids?.workflowId ? 'endpoint-workflow-ids.json' : (reg?.workflowId ? 'internal-flow-register.json' : null),
    physicalFlow: reg?.physicalFlow ?? null,
    flowLabel: reg?.flowLabel ?? null,
    flows: resolved.map(flowRef),
    flowsResolved: resolved.length,
    url: 'not recorded — a signed trigger URL is a bearer credential and is supplied at deploy time from a git-ignored config',
  });
}

for (const e of portalIds.endpoints || []) {
  const w = (wiring.endpoints || []).find((x) => x.endpoint === e.key) || null;
  const matched = e.internalName ? (flowsByInternalName.get(e.internalName) || []) : [];
  endpoints.push({
    key: e.key,
    platform: 'portal',
    declaredBy: 'document-portal/config.example.js#PF_CONFIG.endpoints',
    contract: {
      method: null,
      action: null,
      access: null,
      timeoutMs: null,
      timeoutDeclared: false,
      sourceKey: null,
      routeKeys: null,
    },
    purpose: w?.purpose ?? null,
    endpointFlowName: e.flow ?? null,
    internalName: e.internalName ?? null,
    workflowId: e.workflowId ?? null,
    workflowIdSource: e.workflowId ? 'portal-endpoint-workflow-ids.json' : null,
    note: e.note ?? null,
    requiredListOperations: (w?.requiredOperations || []).map((o) => ({
      list: o.list, site: o.site, listGuid: o.listGuid, operation: o.operation,
    })),
    flows: matched.map(flowRef),
    flowsResolved: matched.length,
    url: 'not recorded — a signed trigger URL is a bearer credential and is supplied at deploy time from a git-ignored config',
  });
}

/* The Correspondence Mailer's seven endpoints, from the endpoint register's mailer section. Held in
   their own array, not endpoints[]: endpoints[] are Folio's contract keys, and the identification
   catalogue, the workbook and the consoles read them as such. The Mailer's definitions are generated
   under mailer/flows/, not captured into contracts/deployed, so each row names its definition file. */
const mailerEndpoints = Object.entries(internalIds.mailer || {}).map(([key, m]) => {
  const c = (mailerCatalogue.flows || []).find((f) => f.endpointKey === key) || null;
  return {
    key,
    platform: 'mailer',
    declaredBy: 'mailer/config.local.example.js#DGO_MAILER_CONFIG_LOCAL.endpoints',
    flow: m.flow,
    flowId: m.flowId ?? null,
    workflowId: m.workflowId ?? null,
    workflowIdSource: m.workflowId ? 'endpoint-workflow-ids.json (mailer)' : null,
    method: m.method ?? null,
    triggerAuthentication: m.triggerAuthentication ?? null,
    operations: c?.operations ?? [],
    definition: c?.definition ? `mailer/flows/${c.definition}` : null,
    url: 'not recorded — a signed trigger URL is a bearer credential; the Mailer package writes it into mailer.html at deploy time',
  };
});

const claimed = new Set(endpoints.flatMap((e) => e.flows.map((f) => f.captureId)));
const unclaimed = flows.filter((f) => !claimed.has(f.id)).map((f) => ({
  id: f.id,
  flowId: f.identifiers.flowId,
  workflowId: f.identifiers.workflowId,
  displayName: f.displayName,
  estate: f.estate,
  method: f.trigger.method,
  flowMakerUrl: f.identifiers.flowMakerUrl,
}));

/* ── index ───────────────────────────────────────────────────────────────────────────────
   A caller holding an id should not have to scan for the row carrying it. Power Automate is
   the case that forces this: its expression language has no filter, so reaching one row of
   flows[] without an index costs a Filter array ACTION per lookup, scanning every row, on
   every run. With an index it is one expression and no action at all.

   Every value here is a list of ZERO-BASED POSITIONS in the array its key prefix names —
   endpointsBy... index endpoints[], flowsBy... index flows[]. Positions, never copies: an
   index that repeated the rows would be a second statement of the same facts, free to drift
   from the first, which is the defect this whole estate is being cleaned of.

   Every entry is a LIST, including the keys that happen to select one row today. Three of
   these are genuinely many-to-one in this estate: one flowId is carried by two differing
   captures, and one workflowId is named by six flows. An index that returned a bare row for
   the common case would hand a caller the first of six and never say the other five exist.
   A uniform list makes the caller write first() once and see the ambiguity when it is real. */
const positions = (rows, keysOf) => {
  const map = new Map();
  rows.forEach((row, i) => {
    for (const k of keysOf(row)) {
      if (k === null || k === undefined || k === '') continue;
      const key = String(k);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(i);
    }
  });
  return Object.fromEntries([...map.entries()]
    .sort((a, b) => byteCompare(a[0], b[0]))
    .map(([k, v]) => [k, [...v].sort((a, b) => a - b)]));
};

const index = {
  note: 'Every value is a list of zero-based positions in the array its key prefix names: '
    + 'endpointsBy... index endpoints[], mailerEndpointsBy... index mailerEndpoints[], flowsBy... index flows[]. No row is repeated here. '
    + 'Lists rather than bare positions everywhere, because several of these keys select more '
    + 'than one row in this estate and a caller must be able to see that.',
  endpointsByKey: positions(endpoints, (e) => [e.key]),
  endpointsByPlatform: positions(endpoints, (e) => [e.platform]),
  endpointsByWorkflowId: positions(endpoints, (e) => [e.workflowId]),
  mailerEndpointsByKey: positions(mailerEndpoints, (e) => [e.key]),
  flowsByCaptureId: positions(flows, (f) => [f.id]),
  flowsByFlowId: positions(flows, (f) => [f.identifiers.flowId]),
  flowsByWorkflowId: positions(flows, (f) => [f.identifiers.workflowId]),
  flowsByDisplayName: positions(flows, (f) => [f.displayName]),
  flowsByEstate: positions(flows, (f) => [f.estate]),
  flowsByTriggerMethod: positions(flows, (f) => [f.trigger.method]),
  flowsByConnector: positions(flows, (f) => f.connections.map((c) => c.connectionName)),
  flowsBySharePointList: positions(flows, (f) => f.sharePointOperations.map((o) => o.list)),
};

/* ── emit ────────────────────────────────────────────────────────────────────────────── */

const commit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
})();

const dataset = {
  $schema: 'dgo-endpoint-dataset/v1',
  meta: {
    purpose: 'The HTTP endpoint surface of both platforms, as queryable data. Endpoints only: '
      + 'trigger, request contract, responses, error handling, and the resources each touches. '
      + 'Action-level configuration is not here — it is printed verbatim, per action, on the '
      + 'provisioning pages under docs/folio-Master-Flows-and-Endpoints/provisioning/flows/.',
    generatedBy: 'scripts/build-endpoint-dataset.mjs',
    /* The repository HEAD when this file was last WRITTEN — necessarily the commit before the
       one carrying it, since the file is written first. It is a provenance stamp, not a
       checksum, and the staleness check compares everything except this. */
    commit,
    capture: {
      source: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/',
      exportedBy: 'scripts/export-power-automate-flows.ps1',
      capturedOn: [...new Set(captured.map((p) => (p.exportedAtUtc || '').slice(0, 10)).filter(Boolean))].sort(),
      limit: 'The export uses the maker cmdlet Get-Flow, which returns only flows the exporting '
        + 'account owns or co-owns. A flow owned solely by another person is absent from this '
        + 'dataset and nothing here would know. These figures describe what the export found, '
        + 'not what the environment contains. Obtain an administrative inventory (Get-AdminFlow) '
        + 'before treating any count here as complete.',
    },
    conventions: {
      nullMeansNotDeclared: 'A null field means the package does not declare the value. Where the '
        + 'distinction matters a sibling boolean (…Declared) states it explicitly, because an '
        + 'absent authentication posture and a posture of "All" are different facts.',
      normalisation: 'endpoints[] are contract keys; flows[] are the definitions behind them, '
        + 'referenced by id. Several keys share one flow, so a key may name a flow another key '
        + 'also names.',
      credentials: 'No trigger URL appears in this file. A signed URL is a bearer credential; the '
        + 'workflow id it addresses is not, and is what is recorded.',
      identifiers: 'A flow carries two ids and they are not interchangeable. flowId is the '
        + 'dashed GUID Power Automate names the flow by — it is what the maker portal URL '
        + 'carries, every export records it, and all flows here have one. workflowId is the '
        + '32-hex id a SIGNED TRIGGER URL addresses; NO PACKAGE IN THIS TREE CARRIES IT '
        + '(every export records full_resource_id as null), so it is joined from the two '
        + 'registers and left null where no register names the flow. Never treat one as the '
        + 'other. captureId is neither — it is this dataset\'s own row key, the export '
        + 'filename, needed because one flowId is carried by two differing captures.',
      lookup: 'index at the foot of this file maps an id to the POSITION of the row holding '
        + 'it, so a consumer with no filtering of its own — a Power Automate expression, for '
        + 'one — reaches a row directly instead of scanning. Values are lists of zero-based '
        + 'positions into the array the key prefix names; the rows themselves are never '
        + 'repeated there. See docs/folio-Master-Flows-and-Endpoints/reference/ENDPOINTS_JSON_IN_POWER_AUTOMATE.md.',
      makerUrl: 'flowMakerUrl is CONSTRUCTED by this generator from environmentName and flowId, '
        + 'both verbatim from the package. It is not a value read from anything, and it is '
        + 'flagged flowMakerUrlIsConstructed on every row that carries one.',
    },
    totals: {
      endpointKeys: endpoints.length,
      endpointKeysInternal: endpoints.filter((e) => e.platform === 'internal').length,
      endpointKeysPortal: endpoints.filter((e) => e.platform === 'portal').length,
      mailerEndpointKeys: mailerEndpoints.length,
      httpTriggeredFlows: flows.length,
      flowsClaimedByAKey: claimed.size,
      flowsClaimedByNoKey: unclaimed.length,
      flowsDeclaringNoRequestSchema: flows.filter((f) => !f.request.schemaDeclared).length,
      flowsWithNoRecordedAuthentication: flows.filter((f) => !f.trigger.triggerAuthenticationTypeDeclared).length,
      flowsRecordingTenantAuthentication: flows.filter((f) => f.trigger.triggerAuthenticationType === 'Tenant').length,
      flowsRecordingAllAuthentication: flows.filter((f) => f.trigger.triggerAuthenticationType === 'All').length,
      flowsWithNoCatchEdge: flows.filter((f) => f.errorHandling.catchEdges.length === 0).length,
      flowsCarryingAFlowId: flows.filter((f) => f.identifiers.flowId).length,
      flowsWithWorkflowIdResolved: flows.filter((f) => f.identifiers.workflowId).length,
      flowsWithWorkflowIdUnresolved: flows.filter((f) => !f.identifiers.workflowId).length,
    },
    excluded,
    internalNameCollisions: [...sharedInternalNames.entries()].map(([internalName, captures]) => ({
      internalName,
      captures: captures.map((id) => {
        const f = flows.find((x) => x.id === id);
        return {
          id,
          displayName: f.displayName,
          exportedAtUtc: f.source.exportedAtUtc,
          actionCount: f.actionCount,
          responses: f.responses.length,
          isLatestCapture: f.isLatestCaptureOfInternalName,
        };
      }),
      note: 'More than one capture carries this internal name, and the captures differ. They are '
        + 'held separately here rather than merged; the later one is flagged. Which is current in '
        + 'the environment can only be settled against the tenant.',
    })),
  },
  endpoints,
  mailerEndpoints,
  flows,
  unclaimedFlows: unclaimed,
  index,
};

const text = `${JSON.stringify(dataset, null, 2)}\n`;
const abs = join(ROOT, OUT);
const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null;

/* meta.commit is a BUILD STAMP, and a build stamp can never equal the commit that contains it:
   the file is written before the commit exists, so the moment it is committed a fresh run
   computes a different HEAD and byte comparison calls the file stale. That is not drift — the
   packages have not moved — and it made `--check` fail on every commit after the one that
   regenerated. So the comparison is over the content, with the stamp set aside on both sides.
   Everything else, including every value read from a package, is still compared byte for byte. */
const withoutStamp = (json) => {
  try {
    const o = JSON.parse(json);
    if (o?.meta) o.meta.commit = null;
    return `${JSON.stringify(o, null, 2)}\n`;
  } catch { return json; }
};

if (now === text) {
  console.log(check ? '\n✅ the endpoint dataset matches the packages\n' : '\n  unchanged\n');
  process.exit(0);
}
if (now !== null && withoutStamp(now) === withoutStamp(text)) {
  const stamped = JSON.parse(now).meta.commit;
  if (check) {
    console.log('\n✅ the endpoint dataset matches the packages'
      + `\n   (its build stamp names ${String(stamped).slice(0, 7)}, the commit it was written at; `
      + 'nothing else differs)\n');
    process.exit(0);
  }
  writeFileSync(abs, text);
  console.log(`\n  restamped ${OUT} — no content changed\n`);
  process.exit(0);
}
if (check) {
  console.error(`\n❌ ${OUT} is stale — run: npm run endpoints\n`);
  process.exit(1);
}
writeFileSync(abs, text);
console.log(`\n  wrote ${OUT} — ${endpoints.length} endpoint keys, ${flows.length} HTTP-triggered flows, `
  + `${unclaimed.length} claimed by no key, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB\n`);
