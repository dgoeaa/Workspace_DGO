#!/usr/bin/env node
/**
 * The single register of every flow and every list, in the shape the tenant list will hold.
 *
 *   npm run registry:seed
 *   npm run registry:seed -- --check
 *
 * WHY THIS EXISTS
 *
 * There is no single register of the estate's flows, and GOV-06 measures the reason precisely:
 * 77 exported definitions keyed by a 36-character Power Automate flow GUID, a register of 51
 * workflows keyed by a 32-hex Logic Apps workflow id, and ZERO exported definitions carrying an
 * id the register knows. Joining on normalised display name matches 13. Four instruments count
 * "all flows" and return 51, 76, 77 and 118, because they count different things.
 *
 * GOV-06's stated resolution is not another document: "Record both identifiers in one place.
 * DGO_HTTPFlowRegistry is designed to do exactly this — FlowId alongside RegistryKey, written
 * once at registration." Its WorkflowId column was amended into the specification on 2026-09-10
 * for exactly this purpose.
 *
 * The provisioner that creates those seven lists is complete and has been for some time —
 * `npm run governance:registryprovisioner` emits 7 lists, 102 columns, 42 indexed, 7 unique,
 * nothing deferred. What has never existed is the register's CONTENT: the rows. So the lists
 * could be stood up in the tenant tomorrow and would be empty, and the question "what flows does
 * this estate have" would still have four answers.
 *
 * This builds the rows, from the five instruments that already hold the pieces. It gathers
 * nothing: every value is read from a file in this repository or is left out.
 *
 * WHAT IT REFUSES TO DO, AND WHY THAT IS THE POINT
 *
 * DGO_HTTPFlowRegistry has 36 columns. Twelve of them are runtime observations — TotalExecutions,
 * LastSeenUtc, AverageDurationMs, IsCompliant — and six are institutional judgements:
 * TechnicalOwnerEmail, BusinessOwnerEmail, SupportEmail, SystemName, BusinessProcess,
 * Criticality. Nothing in this repository knows any of them.
 *
 * Filling them would be the exact defect the flow-truth review raises three times against the
 * package that was built to write this registry: C2 records `RunStatus` as the literal
 * "Succeeded", C3 records `DurationMilliseconds` as the literal `0`, and C4 is titled "Three more
 * values are guesses recorded as facts". A seed that invents an owner email is worse than an
 * empty column, because it reads as knowledge.
 *
 * So every column is classified — `seeded`, `atWriteTime`, or `requiresDecision` — and the ones
 * that need a person are listed, counted, and left empty. That count is the real cost of standing
 * this register up, and it is invisible until someone tries.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const SPEC = 'docs/reference/http-flow-registry-spec.json';
const DEFMAP = 'docs/reference/flow-definition-map.json';
const LISTMAP = 'docs/reference/flow-list-map.json';
const TRIGGERS = 'docs/reference/flow-trigger-auth.json';
const REGISTER = 'docs/reference/endpoint-register.json';
const LISTINDEX = 'docs/reference/sharepoint-list-index.json';
const TARGET = 'docs/reference/FLOW_REGISTRY_SEED.json';

const spec = read(SPEC);
const defmap = read(DEFMAP);
const listmap = read(LISTMAP);
const triggers = read(TRIGGERS);
const register = read(REGISTER);
const listIndex = read(LISTINDEX);

/* ------------------------------------------------------------------ *
 * Column classification — stated once, checked against the contract
 * ------------------------------------------------------------------ */

/* A column this repository can fill from what it holds. */
const SEEDED = new Set([
  'RegistryKey', 'FlowId', 'WorkflowId', 'FlowName', 'EnvironmentId', 'EnvironmentName',
  'HttpMethod', 'AuthenticationMode', 'DataClassification', 'LifecycleStatus',
  'DefinitionVersion', 'DefinitionFingerprint', 'RequestSchemaJson', 'FlowDescription',
  'EndpointRedacted', 'EndpointFingerprint', 'RecordVersion',
]);

/* A column only the registration write can set truthfully: a counter that starts at zero when the
   row is created, or a timestamp of the write itself. Seeding these from here would be recording
   a clock this process does not have. */
const AT_WRITE_TIME = new Set([
  'LastRegisteredUtc', 'TotalExecutions', 'SuccessfulExecutions', 'FailedExecutions',
  'ConsecutiveFailures', 'AverageDurationMs', 'IsCompliant',
]);

/* A column that needs a person. Not unknown — unknowABLE from a repository. */
const REQUIRES_DECISION = new Set([
  'SystemName', 'BusinessProcess', 'TechnicalOwnerEmail', 'BusinessOwnerEmail', 'SupportEmail',
  'Criticality', 'ResponseContractJson', 'ComplianceIssues',
  'LastSeenUtc', 'LastSuccessfulCallUtc', 'LastFailureUtc', 'LastAuditUtc',
]);

const registryColumns = spec.fields.filter((f) => f.listTitle === 'DGO_HTTPFlowRegistry')
  .map((f) => f.internalName);

/* Every column must be classified exactly once. A column added to the specification and not
   classified here would otherwise be silently absent from every row. */
const unclassified = registryColumns.filter(
  (c) => !SEEDED.has(c) && !AT_WRITE_TIME.has(c) && !REQUIRES_DECISION.has(c));
const overclassified = registryColumns.filter(
  (c) => [SEEDED, AT_WRITE_TIME, REQUIRES_DECISION].filter((s) => s.has(c)).length > 1);
if (unclassified.length || overclassified.length) {
  console.error('\n  ✖  The registry columns and this generator disagree.\n');
  if (unclassified.length) console.error(`     unclassified: ${unclassified.join(', ')}`);
  if (overclassified.length) console.error(`     classified twice: ${overclassified.join(', ')}`);
  console.error(`\n     Classify them in ${'scripts/build-flow-registry-seed.mjs'}.\n`);
  process.exit(2);
}

/* ------------------------------------------------------------------ *
 * The union of the two identifier spaces
 * ------------------------------------------------------------------ */

const fingerprint = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/* Trigger posture, keyed by the flow GUID the export carries. */
const triggerByGuid = new Map((triggers.flows || []).map((f) => [f.internalName, f]));

/* Everything the list sweep read for a definition file, keyed by its file name. */
const sweepByFile = new Map((listmap.flows || [])
  .map((f) => [String(f.file || '').split('/').pop(), f]));

/* Register records, keyed by workflow id. */
const registerByWorkflow = new Map((register.complete_flow_registry || [])
  .map((w) => [w.workflow_id, w]));

const rows = [];
const seen = new Map();
/* THE CORPORA OFFER 115 RECORDS AND THE ESTATE HAS 109 FLOWS, AND THE DIFFERENCE IS NOT AN ERROR.
   Four flow GUIDs each carry TWO exported definitions under different display names —
   CG_Support_Endpoint and Portal_ECM_DOCS_SUPPORT are one flow renamed in place, which is what
   ITEM-35 established. One register workflow id appears in two records. One matched flow serves
   two register workflow ids and so is offered twice. One flow is one row, so those six collapse.
   But a silent collapse is an undercount that reads like a count, so each merge is recorded with
   both names and both files, and the totals reconcile: offered − merged = rows. */
const merges = [];
/* Counted as records are offered, not as a sum of the three input arrays: one matched entry with
   two register workflow ids offers two records, so 13 + 64 + 37 is not the number that has to
   reconcile against 109 + merges. Stating the wrong denominator is how a count stops checking. */
let offered = 0;

/* RegistryKey is the list's unique key, so it must be stable across runs and derivable from the
   row alone. It is built from whichever identifier the row actually has, never from a counter —
   a key that depends on iteration order changes when a file is added. */
const keyFor = (flowId, workflowId, name) =>
  `DGO:${flowId || workflowId || fingerprint(name)}`;

function push(row) {
  offered += 1;
  const existing = seen.get(row.RegistryKey);
  if (!existing) {
    seen.set(row.RegistryKey, row);
    row._alsoKnownAs = [];
    row._definitionFiles = row._definitionFile ? [row._definitionFile] : [];
    rows.push(row);
    return;
  }
  /* Same flow, second record. Keep every name and file, and take any identifier or design-time
     value the first record did not have — a rename does not make the earlier export less true. */
  if (row.FlowName && row.FlowName !== existing.FlowName
    && !existing._alsoKnownAs.includes(row.FlowName)) existing._alsoKnownAs.push(row.FlowName);
  if (row._definitionFile && !existing._definitionFiles.includes(row._definitionFile)) {
    existing._definitionFiles.push(row._definitionFile);
  }
  for (const k of ['FlowId', 'WorkflowId', 'HttpMethod', 'AuthenticationMode',
    'RequestSchemaJson', 'EndpointRedacted', 'EndpointFingerprint',
    'DefinitionVersion', 'DefinitionFingerprint']) {
    if (existing[k] === null && row[k] !== null) existing[k] = row[k];
  }
  for (const k of row._servesContractKeys || []) {
    if (!existing._servesContractKeys.includes(k)) existing._servesContractKeys.push(k);
  }
  merges.push({
    registryKey: row.RegistryKey,
    keptAs: existing.FlowName,
    mergedIn: row.FlowName,
    files: existing._definitionFiles,
    reason: row.FlowId && existing.FlowId === row.FlowId
      ? 'two exported definitions carry the same flow GUID — one flow, renamed in place'
      : 'the register records the same workflow id twice',
  });
}

/* Design-time truth only. Anything this cannot read, it omits. */
function baseRow({ flowId, workflowId, name, file, servesKeys, identitySource }) {
  const trig = flowId ? triggerByGuid.get(flowId) : null;
  const sweep = file ? sweepByFile.get(file) : null;
  const reg = workflowId ? registerByWorkflow.get(workflowId) : null;
  const endpoints = (reg?.endpoints || []);

  return {
    RegistryKey: keyFor(flowId, workflowId, name),
    FlowId: flowId || null,
    WorkflowId: workflowId || null,
    FlowName: name,
    EnvironmentId: spec.registry?.targetSite ? null : null,
    EnvironmentName: null,
    HttpMethod: trig?.method || (endpoints.length ? 'POST' : null),
    AuthenticationMode: trig?.triggerAuthenticationType || null,
    DataClassification: null,
    LifecycleStatus: workflowId && flowId ? 'Registered'
      : flowId ? 'ExportedOnly' : 'RegisterOnly',
    DefinitionVersion: sweep?.contentHash ? `sha:${sweep.contentHash}` : null,
    DefinitionFingerprint: sweep?.contentHash || (file ? null : null),
    RequestSchemaJson: trig?.requestSchema ? JSON.stringify(trig.requestSchema) : null,
    FlowDescription: null,
    EndpointRedacted: endpoints.length
      ? String(endpoints[0].sanitized_url || '').replace(/sig=[^&]*/i, 'sig=<REDACTED>') : null,
    EndpointFingerprint: endpoints.length && endpoints[0].sanitized_url
      ? fingerprint(String(endpoints[0].sanitized_url).replace(/sig=[^&]*/i, '')) : null,
    RecordVersion: 1,

    /* Provenance, not a registry column — carried so a reader can check every row. */
    _identity: identitySource,
    _servesContractKeys: servesKeys || [],
    _definitionFile: file || null,
    _actions: sweep?.actions ?? null,
  };
}

/* 1 · the 13 that both corpora name — the only rows that carry both identifiers today */
for (const m of defmap.matched || []) {
  for (const wf of m.registerWorkflowIds || [null]) {
    push(baseRow({
      flowId: m.internalName, workflowId: wf, name: m.name, file: m.file,
      servesKeys: m.servesKeys,
      identitySource: m.ambiguous ? 'name-join (ambiguous — name reused)' : 'name-join',
    }));
  }
}

/* 2 · the 64 exported definitions the register does not name */
for (const e of defmap.unmatchedExports || []) {
  push(baseRow({
    flowId: e.internalName, workflowId: null, name: e.name, file: e.file,
    servesKeys: [], identitySource: 'export only — no register record',
  }));
}

/* 3 · the 37 register workflows for which no definition is held */
for (const w of defmap.unexportedRegisterWorkflows || []) {
  push(baseRow({
    flowId: null, workflowId: w.workflowId, name: (w.names || [])[0] || w.workflowId,
    file: null, servesKeys: w.servesKeys,
    identitySource: 'register only — no exported definition',
  }));
}

/* ------------------------------------------------------------------ *
 * Dependency rows — the flow-to-list edges, which is the other half of the question
 * ------------------------------------------------------------------ */

/* The sweep records every SharePoint action in every definition it read. A flow that touches a
   list three times is one dependency, not three, so edges are distinct per (flow, list). */
const byRegistryKey = new Map();
for (const r of rows) if (r._definitionFile) byRegistryKey.set(r._definitionFile, r.RegistryKey);

const dependencies = [];
const depSeen = new Set();
const listsSeen = new Map();

/* A LIST REFERENCED BY TITLE CAN STILL EXIST, AND CONFLATING THE TWO CASES MATTERS.
   Resolving GUIDs alone left DGO_EndpointRegistry reported as unresolved — a governance list that
   is provisioned, carries a GUID, and happens to be named by title in one definition. That is a
   different fact from DGO_HTTPFlowRegistry, which resolves to nothing because it does not exist.
   One is an addressing weakness worth fixing in a flow; the other is Step 5 work. So titles are
   resolved too, against the tenant index and the governance list registry, and the row records
   WHICH way it resolved. */
const byTitle = new Map();
for (const [guid, l] of Object.entries(listIndex.lists || {})) {
  if (l?.title && !byTitle.has(l.title)) byTitle.set(l.title, { ...l, listGuid: guid });
}
const govRegistry = existsSync(join(ROOT, 'docs/reference/governance-list-registry.json'))
  ? read('docs/reference/governance-list-registry.json') : { lists: [] };
for (const l of govRegistry.lists || []) {
  if (!byTitle.has(l.listTitle)) {
    byTitle.set(l.listTitle, {
      title: l.listTitle, listGuid: l.listGuid,
      site: String(l.targetSite || '').split('/sites/')[1] || null, adopted: true,
    });
  }
}

for (const f of listmap.flows || []) {
  const file = String(f.file || '').split('/').pop();
  const rk = byRegistryKey.get(file);
  for (const ref of f.references || []) {
    const identifier = ref.listGuid || ref.listTitle;
    if (!identifier) continue;
    const byGuid = ref.listGuid ? listIndex.lists?.[ref.listGuid] : null;
    const resolved = byGuid || (ref.listTitle ? byTitle.get(ref.listTitle) : null) || null;
    const resolvedVia = byGuid ? 'guid' : (resolved ? 'title' : null);
    const title = ref.listTitle || resolved?.title || identifier;

    if (!listsSeen.has(title)) {
      listsSeen.set(title, {
        listTitle: title,
        listGuid: ref.listGuid || resolved?.listGuid || null,
        site: resolved?.site || (ref.siteUrl ? String(ref.siteUrl).split('/sites/')[1] : null),
        adopted: resolved?.adopted ?? null,
        exists: Boolean(resolved),
        resolvedVia,
        /* Addressed by title with no GUID anywhere in the reference: the weakness B2 raises
           against the flow-truth package, found here in the deployed estate. */
        addressedByTitleOnly: !ref.listGuid,
        touchedBy: new Set(),
      });
    }
    listsSeen.get(title).touchedBy.add(rk || file);

    if (!rk) continue;
    const dk = `${rk}::${title}`;
    if (depSeen.has(dk)) continue;
    depSeen.add(dk);
    dependencies.push({
      DependencyKey: `DEP:${fingerprint(dk)}`,
      RegistryKey: rk,
      Direction: 'Downstream',
      DependencyType: 'SharePointList',
      DependencyIdentifier: ref.listGuid || title,
      DependencyEndpointRedacted: ref.siteUrl || null,
      IsCritical: null,
      LifecycleStatus: resolved ? 'Resolved' : 'Unresolved',
      LastConfirmedUtc: null,
      _listTitle: title,
      _resolvedFromTenantIndex: Boolean(resolved), _resolvedVia: resolvedVia,
    });
  }
}

const lists = [...listsSeen.values()]
  .map((l) => ({ ...l, touchedBy: [...l.touchedBy].length }))
  .sort((a, b) => b.touchedBy - a.touchedBy);

/* ------------------------------------------------------------------ *
 * What the rows cannot say
 * ------------------------------------------------------------------ */

const emptyPerColumn = {};
for (const c of registryColumns) {
  if (!SEEDED.has(c)) continue;
  emptyPerColumn[c] = rows.filter((r) => r[c] === null || r[c] === undefined).length;
}

const byIdentity = rows.reduce((m, r) => { m[r._identity] = (m[r._identity] || 0) + 1; return m; }, {});
const bothIds = rows.filter((r) => r.FlowId && r.WorkflowId).length;

/* The columns that need a person AND that the list refuses to accept empty. These are the rows'
   real blocker: the register cannot be written at all until somebody supplies them. */
const REQUIRED_DECISION_COLUMNS = [...REQUIRES_DECISION].filter((c) => spec.fields.some(
  (f) => f.listTitle === 'DGO_HTTPFlowRegistry' && f.internalName === c && f.required === 'Yes')).sort();

const seed = {
  schema: 'dgo-flow-registry-seed/v1',
  generatedBy: 'npm run registry:seed',
  purpose: 'Every flow the estate knows, in one row each, in DGO_HTTPFlowRegistry column shape — the single register GOV-06 names as its own resolution. Plus the flow-to-list edges, in DGO_HTTPFlowDependencies shape. Generated from instruments already in this repository; nothing is gathered and nothing is invented.',
  targetSite: spec.registry?.targetSite || null,
  targetLists: { registry: 'DGO_HTTPFlowRegistry', dependencies: 'DGO_HTTPFlowDependencies' },
  derivedFrom: [DEFMAP, LISTMAP, TRIGGERS, REGISTER, LISTINDEX, SPEC],

  standing: {
    listsProvisioned: false,
    listsProvisionedNote: 'The seven lists do not exist. npm run governance:registryprovisioner emits the browser provisioner that creates them — 7 lists, 102 columns, 0 deferred — and it has never been run against the tenant. These rows are what goes in once it has.',
  },

  columnClassification: {
    note: 'Every DGO_HTTPFlowRegistry column is in exactly one class, and the generator refuses to run if the specification gains a column this list does not name.',
    seeded: [...SEEDED].filter((c) => registryColumns.includes(c)).sort(),
    atWriteTime: [...AT_WRITE_TIME].filter((c) => registryColumns.includes(c)).sort(),
    requiresDecision: [...REQUIRES_DECISION].filter((c) => registryColumns.includes(c)).sort(),
    requiresDecisionAndIsRequired: REQUIRED_DECISION_COLUMNS,
    whyNotFilled: 'A column in atWriteTime is a counter or a clock this process does not have. A column in requiresDecision needs an institution: nothing in a repository knows who owns a flow, how critical it is, or when it was last seen. Filling either would be the defect the flow-truth review raises as C2, C3 and C4 — values recorded as facts that are guesses.',
  },

  totals: {
    registryRows: rows.length,
    carryingBothIdentifiers: bothIds,
    carryingFlowIdOnly: rows.filter((r) => r.FlowId && !r.WorkflowId).length,
    carryingWorkflowIdOnly: rows.filter((r) => !r.FlowId && r.WorkflowId).length,
    byIdentitySource: byIdentity,
    dependencyRows: dependencies.length,
    distinctLists: lists.length,
    listsThatExist: lists.filter((l) => l.exists).length,
    /* The union of the two corpora before merging, and what merging removed — stated so the
       distinct count can be checked rather than taken. */
    recordsOffered: offered,
    mergedDuplicateRecords: merges.length,
    reconciles: offered - merges.length === rows.length,
    requiredColumnsNeedingADecision: REQUIRED_DECISION_COLUMNS.length,
  },
  /* Each merge, with both names — an undercount that reads like a count is the failure this
     whole baseline was corrected for. */
  mergedRecords: merges,

  emptySeededColumns: emptyPerColumn,
  registryRows: rows,
  dependencyRows: dependencies,
  lists,
};

const text = `${JSON.stringify(seed, null, 2)}\n`;
const abs = join(ROOT, TARGET);

if (CHECK) {
  const previous = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (previous === text) {
    console.log(`\n  ✅ ${TARGET} matches its sources — ${rows.length} registry rows, ${dependencies.length} dependencies.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${TARGET} has drifted from its sources.`);
  console.error('     Run: npm run registry:seed\n');
  process.exit(1);
}

writeFileSync(abs, text);

const pad = (n) => String(n).padStart(4);
console.log('\nFlow registry seed — the single register, as rows\n');
console.log(`  wrote ${TARGET}`);
console.log(`\n  ${pad(rows.length)}  registry rows (every flow the estate knows, once)`);
console.log(`  ${pad(bothIds)}  carry BOTH identifiers — the join GOV-06 asks for`);
for (const [k, n] of Object.entries(byIdentity)) console.log(`  ${pad(n)}  ${k}`);
if (merges.length) {
  console.log(`\n  ${pad(merges.length)}  duplicate record(s) merged — ${offered} records describe ${rows.length} flows:`);
  for (const m of merges) console.log(`        ${m.keptAs}  ←  ${m.mergedIn}`);
}
console.log(`\n  ${pad(dependencies.length)}  flow → list dependency rows across ${lists.length} lists`);
console.log(`  ${pad(lists.filter((l) => l.exists).length)}  of those lists exist; ${lists.filter((l) => !l.exists).length} resolve to nothing`);
console.log(`  ${pad(lists.filter((l) => l.addressedByTitleOnly).length)}  are addressed by title with no GUID — the weakness that produced GOV-02`);
console.log(`\n  ${pad(REQUIRED_DECISION_COLUMNS.length)}  REQUIRED columns nothing here can fill — the register cannot be written until`);
console.log('        a person supplies them, on every row:');
console.log(`        ${REQUIRED_DECISION_COLUMNS.join(', ')}`);
console.log(`\n  ${pad(seed.columnClassification.requiresDecision.length - REQUIRED_DECISION_COLUMNS.length)}  further columns need a person but are optional:`);
console.log(`        ${seed.columnClassification.requiresDecision.filter((c) => !REQUIRED_DECISION_COLUMNS.includes(c)).join(', ')}`);
console.log('');
