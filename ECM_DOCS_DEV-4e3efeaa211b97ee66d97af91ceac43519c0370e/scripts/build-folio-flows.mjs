#!/usr/bin/env node
// Every flow the folio uses, in one JSON: docs/folio-Master-Flows-and-Endpoints/reference/folio-flows-in-use.json
//
//   node scripts/build-folio-flows.mjs           write it
//   node scripts/build-folio-flows.mjs --check   exit 1 if what is committed is stale
//
// Which flows: the 46 the usage analysis (docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json) marks
// used, plus the 6 the folio names that the tenant export does not carry. Each used flow carries
// the analysis record as written, joined by its dashed flow id to the estate register row
// (docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json): identifiers, contract keys, endpoint shape, the held
// definition file, and every SharePoint list it touches. Nothing is typed in by hand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTION_TYPES, buildLiveFlow, connectionData } from './lib/folio-flows-live-flow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json';
const REG = 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json';
const OUT = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints', 'reference', 'folio-flows-in-use.json');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const usage = read(USAGE);
const reg = read(REG);
const byGuid = new Map();
for (const r of reg.flows) for (const id of [r.flowGuid, ...(r.otherFlowGuids || [])]) if (id) byGuid.set(id.toLowerCase(), r);

const flows = usage.used.map((u) => {
  const r = byGuid.get(u.flow_guid.toLowerCase());
  if (!r) throw new Error(`${u.flow_name} (${u.flow_guid}) has no estate-register row`);
  return {
    name: u.flow_name.trim(),
    flowGuid: u.flow_guid,
    workflowId: r.workflowId,
    otherFlowGuids: r.otherFlowGuids,
    aliases: r.names.map((n) => n.trim()).filter((n, i, a) => n !== u.flow_name.trim() && a.indexOf(n) === i),
    state: u.state,
    primaryRole: u.primary_role,
    allRoles: u.all_roles.split('; '),
    platforms: u.platforms,
    evidence: u.evidence,
    trigger: u.trigger,
    method: r.method,
    routingSegment: r.routingSegment,
    endpointShape: r.endpointShape,
    contractKeys: r.contractKeys,
    connectors: u.connectors,
    actionCount: u.action_count,
    actionTypes: u.action_types,
    created: u.created,
    modified: u.modified,
    owner: u.owner_relation,
    managed: u.managed,
    failureAlerts: u.failure_alerts,
    definitionHeld: r.definitionHeld,
    definitionFiles: r.definitionFiles.map((d) => d.path),
    listsTouched: r.listsTouched.map((l) => ({ action: l.path, operation: l.operation, site: l.siteUrl, list: l.listTitle, listGuid: l.listGuid, dynamic: l.dynamic })),
    conflicts: r.conflicts,
    openInDesigner: `https://make.powerautomate.com/environments/${usage.source.environment}/flows/${u.flow_guid}/details`,
  };
});

const doc = {
  schema: 'folio-flows-in-use/v1',
  generatedBy: 'scripts/build-folio-flows.mjs',
  sources: { usageAnalysis: USAGE, tenantExport: usage.source.export, estateRegister: REG },
  environment: usage.source.environment,
  totals: { used: flows.length, byRole: usage.totals.usedByRole, namedButNotExported: usage.namedButNotExported.length, definitionHeld: flows.filter((f) => f.definitionHeld).length },
  flows,
  namedButNotExported: usage.namedButNotExported,
};
const text = JSON.stringify(doc, null, 2) + '\n';

/* Power Automate input: a flat array, every field always present with one type (no null), so a
   Compose holding it feeds Parse JSON with the schema below and Apply to each without a failure. */
const s = (v) => (v === null || v === undefined ? '' : String(v));
const paRows = flows.map((f) => ({
  Name: s(f.name), FlowGuid: f.flowGuid, WorkflowId: s(f.workflowId), Aliases: f.aliases.join('; '),
  State: s(f.state), PrimaryRole: s(f.primaryRole), AllRoles: f.allRoles.join('; '), Platforms: s(f.platforms),
  Trigger: s(f.trigger), Method: s(f.method), RoutingSegment: s(f.routingSegment), ContractKeys: f.contractKeys.join('; '),
  Connectors: s(f.connectors), ActionCount: Number(f.actionCount) || 0, Created: s(f.created), Modified: s(f.modified),
  Owner: s(f.owner), Managed: !!f.managed, FailureAlerts: !!f.failureAlerts, DefinitionHeld: !!f.definitionHeld,
  DefinitionFile: f.definitionFiles.join('; '), ListsTouchedCount: f.listsTouched.length,
  ListsTouched: f.listsTouched.map((l) => ({ Action: l.action, Operation: s(l.operation), Site: s(l.site), List: s(l.list), ListGuid: s(l.listGuid), Dynamic: !!l.dynamic })),
  Evidence: s(f.evidence), OpenInDesigner: s(f.openInDesigner),
}));
const typeOf = (v) => (typeof v === 'boolean' ? 'boolean' : Number.isInteger(v) ? 'integer' : typeof v === 'string' ? 'string' : Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const listItem = { type: 'object', properties: Object.fromEntries(['Action', 'Operation', 'Site', 'List', 'ListGuid'].map((k) => [k, { type: 'string' }]).concat([['Dynamic', { type: 'boolean' }]])) };
const paSchema = { type: 'array', items: { type: 'object', properties: Object.fromEntries(Object.entries(paRows[0]).map(([k, v]) => [k, k === 'ListsTouched' ? { type: 'array', items: listItem } : { type: typeOf(v) }])), required: Object.keys(paRows[0]) } };
/* Every value of every row has its schema type (null included), or Parse JSON fails the run. */
for (const r of paRows) {
  for (const [k, p] of Object.entries(paSchema.items.properties)) if (typeOf(r[k]) !== p.type) throw new Error(`${r.Name}.${k} is ${typeOf(r[k])}, schema says ${p.type}`);
  for (const l of r.ListsTouched) for (const [k, p] of Object.entries(listItem.properties)) if (typeOf(l[k]) !== p.type) throw new Error(`${r.Name}.ListsTouched.${k} is ${typeOf(l[k])}, schema says ${p.type}`);
}
const PA = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints', 'reference', 'folio-flows-in-use.power-automate.json');
const PAS = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints', 'reference', 'folio-flows-in-use.power-automate.schema.json');
/* The same data as a flow, in the designer's clipboard shape, two pastes as for the deep-link flows:
   1 a scope holding the Initialize variable actions (move them out to the top level after pasting),
   2 a scope holding every other action. The actions are built in scripts/lib/folio-flows-live-flow.mjs. */
const paste = (nodeId, actions) => ({ nodeId, serializedValue: { type: 'Scope', actions, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true });
const brand = read('docs/reference/correspondence-email-templates/templates.json').brand;
/* ── what the folio's platforms call now ──
   Workspace and Document Portal: the 25 contract keys of the endpoint register's current_configuration
   (the tenant's own export), grouped by workflow; candidates for the tenant flow behind each come
   from flow-identity-crosswalk.json, and the flow settles which is live by callback URL.
   Correspondence Mailer: the seven DGO_MAIL_* flows of mailer/js/settings.js. Estate Console and Flow
   Workbench: the eight GOV registry flows. Background automation: the four carriers. Those three come
   from the usage analysis, which ties each to the platform's own configuration. */
const REGISTER = read('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json');
const CROSSWALK = read('docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json');
const usageByGuid = new Map(usage.used.map((u) => [u.flow_guid.toLowerCase(), u]));
const byWorkflow = new Map();
for (const c of REGISTER.current_configuration) {
  const w = byWorkflow.get(c.workflow_id) || { keys: [], c };
  w.keys.push(c.key);
  byWorkflow.set(c.workflow_id, w);
}
/* Identities the flows settled about themselves, which the crosswalk's catalogue candidates miss.
   EMAIL_RELATED_TASK: the run record of "Web - Email Task Created" (now IP_Create_Email_Assignment,
   3f2f649b…) declares workflow a942d230…; the crosswalk offers only 2fbb5485…, the intended
   IP_Create_Email_Assignment_Endpoint, which the tenant no longer holds. Settled in
   docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/INTERNAL_OPS_COVERAGE.md ("What the definitions say about themselves"). */
const SETTLED = { a942d230337c4ddfa9a386e92bbd048b: ['3f2f649b-55af-48e0-9a1e-43135e11a4b0'] };
const inUse = [];
for (const [workflowId, { keys, c }] of byWorkflow) {
  const candidates = [...new Set([...(SETTLED[workflowId] || []), ...CROSSWALK.keys.filter((k) => k.applicationWorkflowId === workflowId).flatMap((k) => (k.candidates || []).map((x) => x.tenantFlowId))])];
  if (!candidates.length) throw new Error(`${c.flow_name} (${workflowId}): no candidate tenant flow in flow-identity-crosswalk.json`);
  const known = candidates.map((g) => usageByGuid.get(g.toLowerCase())).find(Boolean);
  const platform = keys.every((k) => k.startsWith('PF_')) ? 'NITDA Document Portal' : 'Folio Workspace';
  inUse.push({ Name: c.flow_name.trim(), Platform: platform, PrimaryRole: platform, ContractKeys: keys.join('; '), WorkflowId: workflowId,
    ConfiguredUrl: c.sanitized_endpoint_url.replace(/sig=<CREDENTIAL_REMOVED>/, 'sig=<redacted>'), Candidates: candidates,
    State: known ? known.state : '', Modified: known ? known.modified : '' });
}
const ROLE_PLATFORM = { 'Mailer platform': 'Correspondence Mailer', 'Governance spine': 'Estate Console / Flow Workbench', 'Background / notification carrier': 'Background automation' };
for (const u of usage.used.filter((x) => ROLE_PLATFORM[x.primary_role])) {
  inUse.push({ Name: u.flow_name.trim(), Platform: ROLE_PLATFORM[u.primary_role], PrimaryRole: ROLE_PLATFORM[u.primary_role], ContractKeys: '', WorkflowId: '', ConfiguredUrl: '',
    Candidates: [u.flow_guid], State: u.state || '', Modified: u.modified || '' });
}
const htmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const template = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'folio-flows-report.template.html'), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in brand)) throw new Error(`report template: no brand value for {{${k}}}`);
  return htmlEsc(brand[k]);
});
if (!template.includes('"__REPORT_DATA__"')) throw new Error('report template: the "__REPORT_DATA__" placeholder is missing');
const flow = buildLiveFlow({ template, rows: inUse, brand, environment: usage.source.environment, sources: { ...doc.sources, endpointRegister: 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json', crosswalk: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json', mailer: 'mailer/js/settings.js' } });
/* ActionCount in the live flow counts action "type" values; prove it equals a full walk of every held export. */
const actionCountHigh = [];
const DEPLOYED = path.join(ROOT, 'docs', 'folio-Master-Flows-and-Endpoints', 'contracts', 'deployed');
for (const f of fs.readdirSync(DEPLOYED)) {
  const def = JSON.parse(fs.readFileSync(path.join(DEPLOYED, f), 'utf8')).definition;
  let walked = 0;
  const walk = (o) => { for (const a of Object.values(o || {})) { walked++; walk(a.actions); walk(a.else?.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); walk(a.default?.actions); } };
  walk(def.actions);
  const text = JSON.stringify(def.actions);
  const counted = ACTION_TYPES.reduce((n, t) => n + text.split(`"type":"${t}"`).length - 1, 0);
  /* Exact, except where a flow carries action definitions as data in its inputs: then it reads high. */
  if (counted < walked) throw new Error(`ActionCount would read ${counted} for ${f}, a full walk finds ${walked}`);
  if (counted !== walked) actionCountHigh.push(`${f.split('__')[0]} (+${counted - walked})`);
}
if (actionCountHigh.length > 3) throw new Error(`ActionCount reads high for ${actionCountHigh.length} exports, more than the 3 known: ${actionCountHigh.join(', ')}`);
const vars = paste('Scope_Initialize_Variables', flow.vars);
const body = { ...paste('Scope_Flow_Body', flow.body), allConnectionData: connectionData(flow.body) };
const README = `# Folio Flow Estate — Live Report (Power Automate)

<!-- GENERATED by scripts/build-folio-flows.mjs — do not edit. Regenerate: npm run folioflows -->

Reads every flow the folio uses **live from the tenant** on each run, compares it with the 2026-09-26 baseline,
reads the folio's governance lists, and produces a branded HTML report, a PDF, a complete JSON and three CSVs.
It files them all in SharePoint and emails the report with every file attached.

## Deploy

1. Create an **instant cloud flow** with the trigger **Manually trigger a flow**. To run it on a schedule
   instead, use **Recurrence**; the email then goes to \`dgsRegistry@nitda.gov.ng\`.
2. Under the trigger, paste **\`1-variables.designer-paste.json\`**. Drag its ${Object.keys(flow.vars).length} variables out of
   \`Scope_Initialize_Variables\` to the top level, in the same order, then delete the empty scope.
3. After the last variable, paste **\`2-body.designer-paste.json\`** (scope \`Scope_Flow_Body\`, ${Object.keys(flow.body).length} top-level actions).
4. Connections come filled in (\`allConnectionData\` in the body file: the tenant's Office 365 Outlook, SharePoint and OneDrive for Business connections already bound on this flow, and the Power Automate Management connection DGO_ENDPOINT_INVENTORY uses). If the designer shows an action as not connected, pick the connection there:

| Connector | Actions | Account it needs |
|---|---|---|
| Power Automate Management | Get_Live_Flow, List_Live_Flow_Owners | An account that can see the folio's flows (their owner, or co-owner). A flow it cannot see is reported as *not readable* with the connector's message. |
| SharePoint | Get_Governance_*, Create_Record_* | Read on DGO_ECM_GOVERNANCE's three DGO_HTTPFlow* lists; write to its Shared Documents. |
| OneDrive for Business | Create_HTML_in_OneDrive, Convert_Report_to_PDF | Any OneDrive. Used only to make the PDF; if it fails, everything else is still filed and sent. |
| Office 365 Outlook | Send_an_email_Folio_Flow_Estate | The sending mailbox. |

5. Save and run.

## Every run produces

| Output | Where |
|---|---|
| Interactive report: navigation sidebar, search, platform and status filters, sortable table, dashboard charts, expandable per-flow details with definition viewer, copy, download and print | Attached; filed |
| Printable report (agency letterhead) | Attached; filed; the PDF is made from it |
| Email body: headline figures, changes, not readable | Email |
| PDF of the report | Attached; filed (when OneDrive conversion succeeds) |
| Complete JSON: metadata, totals, by platform, every in-use flow with its full live definition, triggers and connection references, changes, not readable, lists touched, governance rows, the in-use configuration | Attached; filed |
| One file per flow or endpoint: \`flows/<name>__<flow id>.json\`, its complete record (configuration, live properties, redacted callback URL, triggers, connection references, full definition; for one not readable, its configuration and the reason) | Filed |
| Full signed callback URLs, **restricted**: \`…-CONFIDENTIAL-Callback-URLs_….json\` | Filed only, never emailed (a callback URL's signature is its credential). The report and JSON show each URL with the signature removed. |
| CSV: flows, lists touched, changes and not-readable | Attached; filed |

Filed in **DGO_ECM_GOVERNANCE › Shared Documents › Folio Flow Estate Reports › <yyyy-MM-dd_HHmm>**.

## What is read live, and the limits

- **Per flow** (Power Automate Management GetFlow, ListFlowOwners, as DGO_ENDPOINT_INVENTORY uses them):
  name, state, created, modified, trigger type and method, action count, connectors, SharePoint sites and
  lists in the definition, owners and their roles, failure alerts. Compared with the baseline: state
  changed, modified since.
- **Action count** counts action definitions in the live definition. It equals a full walk for 84 of the 87
  held exports; 3 carry action definitions as data in their inputs and read high (${actionCountHigh.join(', ')}).
- **Governance lists** are read whole (no column is assumed). A flow is *in the registry* when its flow ID
  appears in DGO_HTTPFlowRegistry's rows; ledger and exception figures count mentions of the ID.
- **Which flows**: only what the folio's platforms call now (${inUse.length}): the ${byWorkflow.size} workflows behind the endpoint
  register's ${REGISTER.current_configuration.length} configured contract keys (Workspace, Document Portal), the Mailer's 7 flows, the 8 GOV
  registry flows (Estate Console, Flow Workbench) and the 4 background carriers. Where the crosswalk offers more than
  one tenant flow for an endpoint, the run picks the one whose live callback URL carries the configured workflow ID.
`;
const PF = path.join(ROOT, 'docs', 'folio-Master-Flows-and-Endpoints', 'patches', 'folio-flows-in-use');
const outs = [[path.join(PF, 'README.md'), README], [path.join(PF, '1-variables.designer-paste.json'), JSON.stringify(vars, null, 2) + '\n'], [path.join(PF, '2-body.designer-paste.json'), JSON.stringify(body, null, 2) + '\n'], [OUT, text], [PA, JSON.stringify(paRows, null, 2) + '\n'], [PAS, JSON.stringify(paSchema, null, 2) + '\n']];

if (process.argv.includes('--check')) {
  const stale = outs.filter(([p, t]) => !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== t).map(([p]) => path.relative(ROOT, p));
  if (stale.length) { console.error(`stale: ${stale.join(', ')}. Run: npm run folioflows`); process.exit(1); }
  console.log(`folio-flows-in-use.json matches: ${flows.length} flows`);
} else {
  fs.mkdirSync(PF, { recursive: true });
  for (const [p, t] of outs) fs.writeFileSync(p, t);
  console.log(`wrote docs/folio-Master-Flows-and-Endpoints/reference/folio-flows-in-use.json: ${flows.length} used flows, ${doc.totals.definitionHeld} with definitions held, ${doc.totals.namedButNotExported} named but not exported`);
}
