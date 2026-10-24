/**
 * Identification Phase 4 packages (npm run idphase4), checked as a whole and run end to end.
 *
 *   1. every function is proven in this tenant: the independent baseline (contracts/deployed), the conformance
 *      package, the Phase 2 claim test, or the captured flow itself, which runs live
 *   2. every outputs()/body()/actions() and runAfter names an action of the package
 *   3. the designer's limits: no variable declared inside the pasted scope, only variables the flow declares above it
 *      are set, and no step nested deeper than 8 levels
 *   4. every SharePoint write names a column of its list, a Choice column as item/<col>/Value, every required column on
 *      a create (portal field spec, the Phase 1 tenant list check and provisioning, and what the live flow already writes)
 *   5. the package run in the strict simulator against tests/lib/identification-sharepoint.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { parse, expressionsIn, functionsIn, Simulator } from '../scripts/lib/wdl-sim.mjs';
import { sharepoint, declaredVariables } from './lib/identification-sharepoint.mjs';
import { runAfterReach } from './lib/run-after-reach.mjs';
import { findFlowArtifact, parseFlowArtifactName } from '../scripts/lib/flow-artifact-name.mjs';
import { conformancePackages } from '../scripts/build-identification-conformance.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages';
const CAPS = 'docs/folio-Master-Flows-and-Endpoints/captures';
const capture = (prefix) => J(`${CAPS}/${readdirSync(CAPS).find((f) => f.startsWith(`${prefix}__`))}`);
const SPEC = J('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json');
const PROV = J('docs/reference/identification/provisioning/identity-provisioning.json');
const CHECKED = J(`${DIR}/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json`).lists;
/* The internal proof ledger (ITEM-64): DGO_SessionProofs once its list id is recorded, else the shared ledger. */
const PROOF = J('docs/reference/internal-proof-ledger.json');
const PROOF_LIST = PROOF.listId || 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9';

console.log('\nIdentification Phase 4 packages\n');

const fnsOf = (doc, into) => { for (const e of expressionsIn(doc)) { try { functionsIn(parse(e), into); } catch { /* not an expression */ } } return into; };
const baseline = new Set();
for (const f of readdirSync('docs/folio-Master-Flows-and-Endpoints/contracts/deployed')) {
  const t = readFileSync(`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/${f}`, 'utf8');
  if (t.includes('a0000000-0000-4000-8000-')) continue;
  try { fnsOf(JSON.parse(t), baseline); } catch { /* not JSON */ }
}
for (const p of Object.values(conformancePackages)) fnsOf(p, baseline);
fnsOf(J(`${DIR}/identification-phase2/Scope_Phase2_ClaimTest_Flow.paste.json`), baseline);
/* Functions proven by flows retired on 2026-10-05: their definitions are held at the commit the record names. */
for (const fn of Object.keys(JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/tenant-function-proof.json', 'utf8')).functions)) baseline.add(fn);

function walkActs(o, d, cb) { for (const [n, a] of Object.entries(o || {})) { cb(n, a, d); for (const k of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions].filter(Boolean)) walkActs(k, d + 1, cb); } }

/* prior: steps of the target flow that run before the pasted scope and that it may read (they must exist in the capture). */
function staticChecks(PKG, CAP, label, columnSources = [CAP], prior = []) {
  console.log(`\n  ${label}: actions, expressions, limits and columns\n`);
  /* Every expression must parse: a stray quote (caller's inside '…') breaks the step at run time, and the function check
     above skips what it cannot parse. */
  const unparsed = [];
  for (const e of expressionsIn(PKG)) { try { parse(e); } catch (err) { unparsed.push(`${String(e).slice(0, 90)} — ${err.message}`); } }
  ok(!unparsed.length, `${label}: every expression parses`, unparsed.slice(0, 3).join(' | '));
  const proven = fnsOf(CAP.Definition, new Set(baseline));
  const used = fnsOf(PKG, new Set());
  const unproven = [...used].filter((f) => !proven.has(f));
  ok(!unproven.length, `${label}: every function the package uses (${used.size}) is proven in the tenant`, unproven.join(', '));

  const acts = []; let deepest = 0, deepName = '';
  walkActs(PKG.serializedValue.actions, 1, (n, a, d) => { acts.push({ name: n, a }); if (d > deepest) { deepest = d; deepName = n; } });
  const capNames = new Set(); walkActs(CAP.Definition.actions, 1, (n) => capNames.add(n));
  for (const p of prior) if (!capNames.has(p)) throw new Error(`${label}: prior step ${p} is not in the capture`);
  const declared = new Set([...acts.map((x) => x.name), ...prior]);
  const bad = [];
  for (const m of JSON.stringify(PKG.serializedValue).matchAll(/(?:outputs|body|actions|result)\('([^']+)'\)/g)) if (!declared.has(m[1])) bad.push(m[1]);
  for (const x of acts) for (const r of Object.keys(x.a.runAfter || {})) if (!declared.has(r)) bad.push(`${x.name} runAfter ${r}`);
  ok(!bad.length, `${label}: every action reference and runAfter names an action (${acts.length} actions)`, [...new Set(bad)].join(', '));

  const vars = new Set(Object.keys(declaredVariables(CAP)));
  const wrongVar = acts.filter((x) => ['InitializeVariable', 'Until', 'Query'].includes(x.a.type) || (['SetVariable', 'AppendToArrayVariable', 'IncrementVariable'].includes(x.a.type) && !vars.has(x.a.inputs?.name)));
  ok(!wrongVar.length, `${label}: no variable declared, no Until, no Filter array; only the flow's own variables are set (B1)`, wrongVar.map((x) => x.name).join(', '));
  ok(deepest <= 8, `${label}: no step is nested deeper than the designer's limit of 8 (deepest: ${deepest}, ${deepName})`);
  const unreachable = runAfterReach(PKG.serializedValue.actions);
  ok(!unreachable.length, `${label}: every step reads only actions on its runAfter path (the designer's save rule)`, unreachable.join('; '));

  const lists = new Map(SPEC.lists.map((l) => [String(l.listGuid).toLowerCase(), { title: l.listTitle, cols: new Map(l.fields.map((f) => [f.internalName, f])) }]));
  for (const c of CHECKED) {
    const g = String(c.listGuid).toLowerCase();
    if (!lists.has(g)) lists.set(g, { title: c.list, cols: new Map() });
    /* The list check names required columns but not their types; a capture's writes, or the spec, give the type. */
    for (const r of String(c.requiredColumns || '').split(',').map((x) => x.trim()).filter(Boolean)) if (!lists.get(g).cols.has(r)) lists.get(g).cols.set(r, { internalName: r, fieldType: null, required: true });
  }
  if (PROOF.listId) lists.set(PROOF.listId.toLowerCase(), { title: PROOF.listToProvision.title, cols: new Map(PROOF.listToProvision.columns.map((c) => [c.internalName, { internalName: c.internalName, fieldType: c.type, required: c.required }])) });
  for (const p of PROV.lists) {
    const l = lists.get(String(p.listGuid).toLowerCase()); if (!l) continue;
    for (const c of p.addColumns) l.cols.set(c.name, { internalName: c.name, fieldType: c.type, choices: c.choices });
  }
  /* Live column reads of the lists, committed as evidence (Microsoft Graph, read only). */
  for (const f of readdirSync('docs/folio-Master-Flows-and-Endpoints/evidence').filter((n) => /-list-columns\.json$/.test(n))) {
    for (const ev of J(`docs/folio-Master-Flows-and-Endpoints/evidence/${f}`).lists) {
      const l = lists.get(String(ev.listGuid).toLowerCase()); if (!l) continue;
      for (const c of ev.columns) if (!l.cols.has(c.internalName)) l.cols.set(c.internalName, { internalName: c.internalName, fieldType: c.type === 'choice' ? 'Choice' : 'Text', choices: c.choices, required: c.required });
    }
  }
  for (const src of columnSources) walkActs(src.Definition.actions, 1, (n, a) => {
    const t = String(a.inputs?.parameters?.table || '').toLowerCase(); const l = lists.get(t);
    if (a.type !== 'OpenApiConnection' || !l) return;
    for (const k of Object.keys(a.inputs.parameters).filter((k) => k.startsWith('item/'))) { const [, col, sub] = k.split('/'); const f = l.cols.get(col); if (!f) l.cols.set(col, { internalName: col, fieldType: sub === 'Value' ? 'Choice' : 'Text' }); else if (f.fieldType === null) f.fieldType = sub === 'Value' ? 'Choice' : 'Text'; }
  });
  const err = []; let writes = 0;
  for (const x of acts) {
    if (x.a.type !== 'OpenApiConnection' || !/^shared_sharepointonline/.test(x.a.inputs.host.connection)) continue;
    const p = x.a.inputs.parameters, op = x.a.inputs.host.operationId;
    if (!['PostItem', 'PatchItem'].includes(op)) continue;
    const l = lists.get(String(p.table).toLowerCase());
    if (!l) { err.push(`${x.name}: list ${p.table} unknown`); continue; }
    for (const k of Object.keys(p).filter((k) => k.startsWith('item/'))) {
      writes++; const [, col, sub] = k.split('/'); const f = l.cols.get(col);
      if (col === 'Title') continue;
      if (!f) err.push(`${x.name}: ${col} is not a column of ${l.title}`);
      else if (f.fieldType !== null && (f.fieldType === 'Choice') !== (sub === 'Value')) err.push(`${x.name}: ${k} does not match ${f.fieldType}`);
      else if (f.choices && typeof p[k] === 'string' && !p[k].startsWith('@') && !f.choices.includes(p[k])) err.push(`${x.name}: ${p[k]} is not a choice of ${col}`);
    }
    if (op === 'PostItem') for (const [n, f] of l.cols) if (f.required && n !== 'Title' && !(`item/${n}` in p) && !(`item/${n}/Value` in p)) err.push(`${x.name}: omits required ${n}`);
  }
  ok(!err.length, `${label}: every SharePoint write (${writes} columns) names a column of its list`, err.join('; '));
}

/* ---------------------------------------------------------------- Single_Task_Assignment */
const NOW = '2026-10-05T09:00:00.000Z';
const L = { SEQ: 'd95409a4-2b48-4d34-9f60-da5d27db862d', GTQ: 'ee82725a-c408-45e2-a8e8-facf7a092047', DOCS: '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3', DEPTS: '8aab9c4e-2f7a-4f69-9b36-6d3f2f1b6f7e' };
const CONFIG = PROV.flowConfiguration.rows.map((r) => ({ Title: r.Title, ConfigValue: r.ConfigValue }));
const SA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'Single_Task_Assignment', 'paste.json'));
const SACAP = capture('Single_Task_Assignment');
staticChecks(SA, SACAP, 'SINGLE_ASSIGNMENT');

console.log('\n  SINGLE_ASSIGNMENT simulated runs\n');
const KEY = '45e40654-7a58-4301-a99c-99c31ced8cd2';
const DOC = { ID: 312, Title: 'Letter from FMoF', Description: 'Budget call circular', Created: '2026-10-01T08:00:00Z', EntityKey: KEY, ReferenceId: 'NITDA-2026-00011', BodyExtract: 'AI body text', TextExtraxt: 'AI full text' };
/* The request exactly as Folio's Assignment Desk builds it (core/assignment-payload.js), so the test sends what the client sends. */
const { buildSingleAssignmentPayload } = await import('../core/assignment-payload.js');
const ASK = { ...buildSingleAssignmentPayload({
  activity: { id: 312, title: 'Letter from FMoF', description: 'Budget call circular' },
  form: { type: 'newassignment', category: 'Administration', categoryCode: 'ADM', subcategory: 'Human Resources', subcategoryCode: 'HRM', dsu: 'HRM', assignedTo: 'officer@nitda.gov.ng', priority: 'high', startDate: '2026-10-05', ack: '2026-10-06', due: '2026-10-12', comments: 'Please review.', copy: '' },
  actor: { email: 'registry@nitda.gov.ng' },
}), userEmail: 'registry@nitda.gov.ng' };
function runSA(seed, body = ASK, opts = {}) {
  const sp = sharepoint(seed, { config: CONFIG, lenientFilters: Object.values(L).filter((t) => t !== L.SEQ), ...opts });
  /* GetItem ignores the view parameter the capture passes; the mock answers by ID. */
  const sim = new Simulator({
    variables: declaredVariables(SACAP), connectors: { ...sp.connectors, ...(opts.extra || {}) }, clock: () => NOW,
    workflow: { name: '3caf9458-8d95-4740-a01b-6803dad97d34', run: { name: 'RUN-SA' }, tags: { flowDisplayName: 'Single_Task_Assignment' } },
    trigger: { outputs: { body, method: 'POST', queries: {}, headers: opts.headers || {} } },
  });
  sim.declare(SA).run(SA);
  return { sim, db: sp.db, calls: sp.calls, r: sim.response || {} };
}
const failedSteps = (sim) => sim.templateErrors.map((t) => `${t.action}: ${t.message}`);
{
  const { sim, db, r } = runSA({ [L.DOCS]: [DOC], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 416 }] });
  const task = (db[L.GTQ] || [])[0] || {}; const doc = db[L.DOCS][0];
  ok(failedSteps(sim).length === 0, 'the run has no template error', failedSteps(sim).join(' | ').slice(0, 600));
  ok(task.TaskRef === 'TASK-2026-00417' && task.EntityKey && task.IdState?.Value === 'ACTIVE' && task.Rev === 1 && task.TaskTypeChoice?.Value === 'Standard Task' && task.GTQGrouping === 'GTQGrouping',
    'T7 (one task): the task gets TASK-2026-00417, its Entity Key, IdState, Rev and the task type in one create', JSON.stringify(task).slice(0, 500));
  ok(task.ParentKey === `REC:${KEY}` && task.RootKey === task.ParentKey && task.RootRef === 'NITDA-2026-00011', 'the task names its record: ParentKey and RootKey REC:<key>, RootRef NITDA-2026-00011');
  ok(task.CorrelationId && task.CorrelationId === task.CreatedByRequest && r.body && JSON.stringify(r.body).includes(task.CorrelationId), 'the run mints a Request ID, stores it on the task and returns it', JSON.stringify(r.body).slice(0, 300));
  ok(doc.BodyExtract === 'AI body text' && doc.TextExtraxt === 'AI full text' && doc.AssignmentStatus?.Value === 'Processed', 'C-1: the document keeps its AI extraction when it is assigned', JSON.stringify(doc).slice(0, 300));
  const mail = (db.mail || [])[0] || {};
  ok(JSON.stringify(mail).includes('TASK-2026-00417') && !/\d{8}-312-ADM-HRM-/.test(JSON.stringify(mail)), 'the officer\'s e-mail shows TASK-2026-00417, not the composite reference', JSON.stringify(mail).slice(0, 200));
  ok(db[L.SEQ][0].CurrentSequence === 417, 'the TASK counter advances on its own row');
}
/* ITEM-66: every send writes an outbox receipt; a failed send still fails its scope. */
{
  const RECEIPTS = '88a81ca1-319a-45f5-8409-f91a24538ffa';
  const seed = () => ({ [L.DOCS]: [structuredClone(DOC)], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 416 }] });
  const sent = runSA(seed());
  const rec = (sent.db[RECEIPTS] || [])[0] || {};
  const mailTo = (sent.db.mail || [])[0]?.['emailMessage/To'];
  ok(rec.Status === 'sent' && rec.Attempts === 1 && rec.RecipientEmail === mailTo && rec.Reference === 'RUN-SA' && /^an-email-v2-main-5:Single_Task_Assignment:RUN-SA$/.test(rec.Title || ''),
    'ITEM-66: the officer\'s e-mail writes a receipt: sent, its recipient, the run as reference', JSON.stringify(rec));
  ok(!Object.keys(rec).some((k) => /body/i.test(k)) && !JSON.stringify(rec).includes('TASK-2026-00417'), 'ITEM-66: the receipt carries no message body', JSON.stringify(rec));
  const fail = () => ({ ok: false, statusCode: 500, message: 'mailbox unavailable' });
  const extra = {}; for (const c of ['shared_office365', 'shared_office365-1', 'shared_office365-2', 'shared_office365_1']) extra[`${c}.SendEmailV2`] = fail;
  const down = runSA(seed(), ASK, { extra });
  const frec = (down.db[RECEIPTS] || [])[0] || {};
  const outcome = [...down.sim.global.entries()].find(([n]) => /^Compose_.+_Outcome$/.test(n))?.[1];
  ok(frec.Status === 'failed' && frec.LastError, 'ITEM-66: a failed send writes a failed receipt with the error', JSON.stringify(frec));
  ok(outcome?.status === 'Failed', 'ITEM-66: the outcome step fails when the send failed, so the scope ends as it did before the receipt', JSON.stringify(outcome?.status));
}
{
  const { db } = runSA({ [L.DOCS]: [DOC] });
  const row = (db[L.SEQ] || [])[0] || {};
  ok(row.Title === 'TASK-2026' && row.CurrentSequence === 1 && (db[L.GTQ] || [])[0]?.TaskRef === 'TASK-2026-00001', 'the first task of a year creates TASK-2026 and issues TASK-2026-00001');
}
{
  const { db } = runSA({ [L.DOCS]: [{ ...DOC, EntityKey: undefined, ReferenceId: undefined }], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 9 }] });
  const task = (db[L.GTQ] || [])[0] || {};
  ok(task.TaskRef === 'TASK-2026-00010' && task.ParentKey === '' && task.RootRef === '', 'a document the backfill has not reached: the task is created with its own keys and an empty ParentKey');
}
{
  const { db, r } = runSA({ [L.DOCS]: [DOC], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 9 }] }, ASK, { claimHook: (row, db2, table) => { if (table === L.SEQ) row['odata.etag'] = `"t${Math.random()}"`; } });
  ok(!(db[L.GTQ] || []).length && db[L.SEQ][0].CurrentSequence === 9 && JSON.stringify(r.body || {}).length > 0, 'when no TASK number can be claimed no task is created and the run reports the failure', JSON.stringify(r.body).slice(0, 300));
}

/* ---------------------------------------------------------------- BULK_ASSIGNMENT */
const BA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'BULK_OPS_DATA_RETRIEVAL_HTTP', 'paste.json'));
const BACAP = capture('BULK_OPS_DATA_RETRIEVAL_HTTP');
/* The task and document columns are the ones the Single_Task_Assignment capture writes; the target flow wrote none. */
staticChecks(BA, BACAP, 'BULK_ASSIGNMENT', [BACAP, SACAP]);
{
  /* The flow's telemetry scope, which stays, reads these steps of the scope it follows. */
  const names = new Set(); walkActs(BA.serializedValue.actions, 1, (n) => names.add(n));
  const reads = [...JSON.stringify(BACAP.Definition.actions.Scope_Flow_Data_Capture).matchAll(/(?:outputs|body|actions)\('([^']+)'\)/g)].map((m) => m[1]);
  const outside = new Set(Object.keys(BACAP.Definition.actions.Scope_Flow_Data_Capture.actions));
  const missing = reads.filter((r) => !outside.has(r) && r !== 'Scope_Global' && !names.has(r));
  ok(!missing.length, 'BULK_ASSIGNMENT: every step the flow\'s telemetry scope reads (Compose__Standard_Response_Revised, Response) is in the new scope', missing.join(', '));
  const conns = Object.values(BA.allConnectionData).map((c) => c.referenceKey);
  ok(conns.length && conns.every((k) => ['shared_sharepointonline', 'shared_office365'].includes(k)), 'BULK_ASSIGNMENT: every connector step uses a connection key the target flow already has');
}

console.log('\n  BULK_ASSIGNMENT simulated runs\n');
const CFGL = '9bc168c3-06e5-4d58-982b-0df06205fd35';
const { buildBulkAssignmentPayload } = await import('../core/assignment-payload.js');
const FORM = { category: 'Administration', categoryCode: 'ADM', subcategory: 'Human Resources', subcategoryCode: 'HRM', dsu: 'HRM', assignedTo: 'officer@nitda.gov.ng', priority: 'high', startDate: '2026-10-05', ack: '2026-10-06', due: '2026-10-12', comments: 'Please review these.', copy: 'deputy@nitda.gov.ng' };
const BULK = (ids, form = FORM) => buildBulkAssignmentPayload({ ids, form, actor: { email: 'registry@nitda.gov.ng' }, otpVerified: ids.length > 5 });
const DOCS3 = [312, 313, 314].map((id, i) => ({ ...DOC, ID: id, Title: `Letter ${id}`, EntityKey: i === 2 ? undefined : `${KEY.slice(0, -1)}${i}`, ReferenceId: `NITDA-2026-0001${i}` }));
const SEQ = (n) => [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: n }];
function runBA(seed, body, opts = {}) {
  const sp = sharepoint({ [CFGL]: [{ ID: 1, Title: 'ALLOWED_ORIGIN_FOLIO', ConfigValue: 'https://folio.example' }], ...seed }, { config: CONFIG, lenientFilters: Object.values(L).filter((t) => t !== L.SEQ), ...opts });
  const sim = new Simulator({
    variables: declaredVariables(BACAP), connectors: sp.connectors, clock: () => NOW,
    workflow: { name: '5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06', run: { name: 'RUN-BA' }, tags: { flowDisplayName: 'BULK_OPS_DATA_RETRIEVAL_HTTP' } },
    trigger: { outputs: { body, method: 'POST', queries: {}, headers: { Origin: 'https://folio.example', ...(opts.headers || {}) } } },
  });
  sim.declare(BA).run(BA);
  return { sim, db: sp.db, calls: sp.calls, r: sim.response || {} };
}
const merges = (calls) => calls.filter((c) => c.method === 'POST' && c.headers?.['X-HTTP-Method'] === 'MERGE' && c.uri.includes(L.SEQ)).length;
{
  const { sim, db, r, calls } = runBA({ [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(416) }, BULK(['312', '313', '314']));
  const tasks = db[L.GTQ] || [];
  ok(failedSteps(sim).length === 0, 'the run has no template error', failedSteps(sim).join(' | ').slice(0, 600));
  const refs = (r.body?.data?.tasks || []).map((t) => `${t.id}:${t.taskRef}`).join(',');
  ok(r.statusCode === 202 && refs === '312:TASK-2026-00417,313:TASK-2026-00418,314:TASK-2026-00419' && r.headers?.['Access-Control-Allow-Origin'] === 'https://folio.example' && r.body?.request?.requestId,
    'the reply is 202 with each document\'s claimed TASK reference, the allowed origin and a requestId', `${r.statusCode} ${refs} ${JSON.stringify(r.headers)}`);
  ok(merges(calls) === 1 && db[L.SEQ][0].CurrentSequence === 419, 'T7: one claim takes three numbers; the TASK counter moves from 416 to 419', `${merges(calls)} claims, counter ${db[L.SEQ][0].CurrentSequence}`);
  ok(tasks.length === 3 && tasks.map((t) => t.TaskRef).join() === 'TASK-2026-00417,TASK-2026-00418,TASK-2026-00419' && new Set(tasks.map((t) => t.EntityKey)).size === 3
    && tasks.every((t) => t.AssignedTo === 'officer@nitda.gov.ng' && t.IdState?.Value === 'ACTIVE' && t.Rev === 1 && t.CorrelationId === r.body.request.requestId && t.Priority?.Value === 'High' && t.Classification === 'Administration'),
    'three tasks, one per document, each with its TaskRef, its own Entity Key, the assignee, IdState, Rev, priority, category and the Request ID', JSON.stringify(tasks.map((t) => [t.TaskRef, t.AssignedTo, t.Priority, t.RefIDD])).slice(0, 400));
  ok(tasks[0].ParentKey === `REC:${DOCS3[0].EntityKey}` && tasks[0].RefIDD === 312 && tasks[2].ParentKey === '' && tasks.map((t) => t.Title).join() === 'Letter 312,Letter 313,Letter 314',
    'each task names its own document (ParentKey REC:<key> where the document has one, its ID and title)');
  ok(db[L.DOCS].every((d) => d.AssignmentStatus?.Value === 'Processed' && d.BodyExtract === 'AI body text' && d.TextExtraxt === 'AI full text'), 'C-1: every document is marked Processed and keeps its AI extraction');
  const mail = db.mail || [];
  ok(mail.length === 3 && ['TASK-2026-00417', 'TASK-2026-00418', 'TASK-2026-00419'].every((ref, i) => JSON.stringify(mail[i]).includes(ref)), 'the officer gets three notifications, one per task, each naming its reference', `${mail.length} e-mails`);
}
{
  const { db, r } = runBA({ [L.DOCS]: structuredClone(DOCS3.slice(0, 2)), [L.SEQ]: SEQ(20) }, BULK(['312', '999', '313']));
  const tasks = db[L.GTQ] || []; const mail = db.mail || [];
  const alert = mail.find((m) => /not completed/.test(m['emailMessage/Subject'] || ''));
  ok(r.statusCode === 202 && tasks.map((t) => t.TaskRef).join() === 'TASK-2026-00021,TASK-2026-00023', 'a document that cannot be read does not stop the batch: the other two are assigned with their own numbers', tasks.map((t) => t.TaskRef).join());
  ok(alert && alert['emailMessage/To'] === 'registry@nitda.gov.ng' && alert['emailMessage/Body'].includes('999') && alert['emailMessage/Body'].includes('TASK-2026-00022'),
    'the requester gets one e-mail naming the document that was not assigned and its unused reference', JSON.stringify(alert || mail.map((m) => m['emailMessage/Subject'])).slice(0, 300));
}
for (const [why, body] of [['no document IDs', BULK([])], ['51 document IDs', BULK(Array.from({ length: 51 }, (_, i) => String(i + 1)))], ['no assignee', BULK(['312'], { ...FORM, assignedTo: '' })], ['no category', BULK(['312'], { ...FORM, category: '' })]]) {
  const { db, r, calls } = runBA({ [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(5) }, body);
  ok(r.statusCode === 400 && r.body?.data?.error === 'invalid_request' && !(db[L.GTQ] || []).length && merges(calls) === 0, `${why}: 400, nothing claimed or created`, `${r.statusCode} ${JSON.stringify(r.body?.data)}`);
}
{
  const { db, r } = runBA({ [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(9) }, BULK(['312', '313']), { claimHook: (row, db2, table) => { if (table === L.SEQ) row['odata.etag'] = `"t${Math.random()}"`; } });
  ok(r.statusCode === 503 && r.body?.data?.code === 'RETRY_LATER' && !(db[L.GTQ] || []).length && db[L.SEQ][0].CurrentSequence === 9, 'when no TASK numbers can be claimed the reply is 503 RETRY_LATER and nothing is created', `${r.statusCode} ${JSON.stringify(r.body?.data)}`);
}

/* ---------------------------------------------------------------- FETCH_ALL */
const FA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_FETCH_ALL_BOOTSTRAP', 'paste.json'));
const FACAP = capture('IP_FETCH_ALL_BOOTSTRAP');
staticChecks(FA, FACAP, 'FETCH_ALL');
console.log('\n  FETCH_ALL simulated runs\n');
{
  const LISTS = { BRIEFS: 'e73a701a-fbcd-4d1d-b800-9fe26d12b2b6', MEETINGS: '6987151e-f4a7-4cff-9d4b-57f92383ef0b', PROJECTS: '38cf8739-4a63-48fb-9351-7373b797db7c', APPROVALS: '5bcb98f3-3a86-408b-aa91-a75165b8246e', REGISTRY_FILES: '98e85c69-d72a-4e8b-b1b2-1809fec74786', INTAKE_REGISTER: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667' };
  /* Flow Configuration as Phase 1 left it, with the new lists' IDs from the Phase 1 list check. */
  const cfg = CONFIG.map((r) => { const m = /^DATASET_(.+)_LIST_ID$/.exec(r.Title); return m && LISTS[m[1]] ? { ...r, ConfigValue: LISTS[m[1]] } : r; });
  const seed = {
    [L.DOCS]: [{ ID: 312, Title: 'Letter', EntityKey: KEY, ReferenceId: 'NITDA-2026-00011', IdState: { Value: 'ACTIVE' }, Status: { Value: 'Treated' } }],
    [L.GTQ]: [{ ID: 9, Title: 'Letter', TaskRef: 'TASK-2026-00417', EntityKey: 'aaaaaaaa-0000-4000-8000-000000000001', ParentKey: `REC:${KEY}`, RootKey: `REC:${KEY}`, RootRef: 'NITDA-2026-00011', IdState: { Value: 'ACTIVE' }, Rev: 2 }],
    '1932d687-e77a-4929-9047-a1f544c68a0b': [{ ID: 4, Title: 'Minute', Description: 'Seen', EntityKey: 'bbbbbbbb-0000-4000-8000-000000000002', ParentKey: 'TSK:aaaaaaaa-0000-4000-8000-000000000001', AuthorKey: 'USR:1' }],
    [LISTS.INTAKE_REGISTER]: [{ ID: 1, Title: 'NITDA-2026-00011', ReferenceId: 'NITDA-2026-00011', EntityKey: KEY, Subject: 'Budget call', Channel: 'portal', Status: 'received', IdState: 'ACTIVE', Rev: 1 }],
    [LISTS.APPROVALS]: [{ ID: 1, Title: 'Approve the budget memo', EntityKey: 'cccccccc-0000-4000-8000-000000000003', Decision: 'Approved', RootRef: 'NITDA-2026-00011', IdState: 'ACTIVE', Rev: 1 }],
    '3d591f5b-3f2f-409c-983a-a77b5c174834': [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: 'operator' }],
    'f675598b-271d-4200-8d75-2597aad4057f': [{ ID: 1, RoleId: 'operator', Active: 1, AllowedRoutesJson: '["*"]' }],
    [LISTS.REGISTRY_FILES]: [{ ID: 1, Title: 'HR policy file', EntityKey: 'dddddddd-0000-4000-8000-000000000004', RegistryFileRef: 'FILE-2026-00001', CurrentHolder: 'ORG:HRM', IdState: 'ACTIVE', Rev: 3 }],
  };
  const runFA = (config, extra = {}, headers = {}) => {
    const sp = sharepoint({ ...seed, ...extra }, { config, lenientFilters: Object.keys(seed).concat(Object.values(LISTS), ['3d591f5b-3f2f-409c-983a-a77b5c174834', 'f675598b-271d-4200-8d75-2597aad4057f', 'f64c8b65-c921-46e9-8814-a8cef61f6016', '8aab9c4e-001f-4e32-862c-8a50e750f04e', '9bc168c3-06e5-4d58-982b-0df06205fd35']) });
    const sim = new Simulator({ variables: { ...declaredVariables(FACAP), varRequestId: 'client-supplied' }, connectors: sp.connectors, clock: () => NOW,
      workflow: { name: 'b79e6707-df4d-4ae7-8a65-738aa45e9a73', run: { name: 'RUN-FA' }, tags: { flowDisplayName: 'IP_FETCH_ALL_BOOTSTRAP' } },
      trigger: { startTime: NOW, outputs: { body: { action: 'fetchAll', requestId: 'client-supplied', userEmail: 'officer@nitda.gov.ng' }, method: 'POST', queries: {}, headers } } });
    sim.declare(FA).run(FA);
    return { sim, r: sim.response || {} };
  };
  const { sim, r } = runFA(cfg);
  const d = r.body?.data || {};
  ok(failedSteps(sim).length === 0 && r.statusCode === 200, 'the read runs with no template error and answers 200', `${r.statusCode} ${failedSteps(sim).join(' | ').slice(0, 400)}`);
  ok(r.body?.request?.requestId && r.body.request.requestId !== 'client-supplied', 'S8: the reply\'s requestId is the flow\'s own, not the one the client sent', r.body?.request?.requestId);
  ok(d.docs?.[0]?.EntityKey === KEY && d.docs[0].ReferenceId === 'NITDA-2026-00011' && d.docs[0].IdState === 'ACTIVE' && d.docs[0].Title === 'Letter', 'documents carry EntityKey, ReferenceId and IdState beside their existing fields');
  ok(d.tasks?.[0]?.TaskRef === 'TASK-2026-00417' && d.tasks[0].ParentKey === `REC:${KEY}` && d.tasks[0].Rev === 2, 'tasks carry TaskRef, ParentKey and Rev');
  ok(d.comments?.[0]?.ParentKey === 'TSK:aaaaaaaa-0000-4000-8000-000000000001' && d.comments[0].AuthorKey === 'USR:1', 'comments carry ParentKey and AuthorKey');
  ok(d.register?.[0]?.referenceId === 'NITDA-2026-00011' && d.register[0].entityKey === KEY && d.approvals?.[0]?.status === 'approved' && d.approvals[0].id === 'cccccccc-0000-4000-8000-000000000003' && d.files?.[0]?.fileRef === 'FILE-2026-00001'
    && Array.isArray(d.briefs) && Array.isArray(d.meetings) && Array.isArray(d.projects), 'register, briefs, meetings, projects, approvals (in Folio\'s shape) and files are returned', JSON.stringify({ register: d.register, approvals: d.approvals, files: d.files }).slice(0, 400));
  const none = runFA(CONFIG.filter((x) => !/^DATASET_(BRIEFS|MEETINGS|PROJECTS|APPROVALS|REGISTRY_FILES)_/.test(x.Title)));
  const d2 = none.r.body?.data || {};
  ok(none.r.statusCode === 200 && d2.docs?.length === 1 && d2.briefs?.length === 0 && d2.files?.length === 0 && d2.register?.length === 1, 'a list whose binding is not configured comes back empty; the rest of the read is unaffected', `${none.r.statusCode} ${JSON.stringify({ briefs: d2.briefs, files: d2.files })}`);
  /* G-04 with IDENTITY_PROOF_REQUIRED set (see the G-04 block below for the seed's meaning). */
  const GOV = { '9bc168c3-06e5-4d58-982b-0df06205fd35': [{ ID: 90, Title: 'IDENTITY_PROOF_REQUIRED', ConfigValue: 'true' }],
    [PROOF_LIST]: [{ ID: 1, Title: 'tok-officer', Consumed: 0, Purpose: 'internal-session', Email: 'officer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' }],
    '3d591f5b-3f2f-409c-983a-a77b5c174834': [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: { Value: 'operator' } }],
    'f675598b-271d-4200-8d75-2597aad4057f': [{ ID: 1, RoleId: 'operator', Active: 1, AllowedRoutesJson: '["*"]' }] };
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const fa0 = runFA(CONFIG, GOV);
  ok(fa0.r.statusCode === 401, 'FETCH_ALL: with the switch on and no proof, the unknown-caller answer (401)', `${fa0.r.statusCode}`);
  const fa1 = runFA(CONFIG, GOV, bearer('tok-officer'));
  ok(fa1.r.statusCode === 200 && Array.isArray(fa1.r.body?.data?.docs), 'FETCH_ALL: with a valid proof the read runs, the caller\'s Role read from the choice', `${fa1.r.statusCode}`);
  /* ITEM-90 (owner approval 2026-10-08): every active directory user is admitted, and receives the slice their role allows. */
  {
    const COMMENTS = '1932d687-e77a-4929-9047-a1f544c68a0b', DIRL = '3d591f5b-3f2f-409c-983a-a77b5c174834';
    const scoped = { ...seed,
      [L.DOCS]: [...seed[L.DOCS], { ID: 313, Title: 'My letter', RefIDD: '313', Status: { Value: 'Not Treated' } }, { ID: 314, Title: 'Someone else\'s letter', RefIDD: '314', Status: { Value: 'Not Treated' } }],
      [L.GTQ]: [...seed[L.GTQ], { ID: 20, Title: 'Mine', RefIDD: '313', AssignedTo: 'viewer@nitda.gov.ng', GDSUROUT: 'eGD' }, { ID: 21, Title: 'Theirs', RefIDD: '314', AssignedTo: 'other@nitda.gov.ng', GDSUROUT: 'eGD' }],
      [COMMENTS]: [...seed[COMMENTS], { ID: 5, Title: 'On mine', RefIDD: '313' }, { ID: 6, Title: 'On theirs', RefIDD: '314' }],
      [DIRL]: [...seed[DIRL], { ID: 2, Email: 'viewer@nitda.gov.ng', Status: 'active', Role: { Value: 'viewer' }, Persona: { Value: 'general' }, Directorate: 'eGD', FullName: 'A Viewer' },
        { ID: 3, Email: 'director@nitda.gov.ng', Status: 'active', Role: { Value: 'director' }, Persona: { Value: 'general' }, Directorate: 'eGD', FullName: 'A Director' }],
      /* The registry inbox (ITEM-74), as Get emails (V3) returns it. */
      inbox: [{ id: 'AAMkAGI2-1', subject: 'Invitation to the forum', from: 'Sender@Example.org', receivedDateTime: '2026-10-05T08:00:00Z', bodyPreview: 'Dear DG,', hasAttachments: true, importance: 'normal', conversationId: 'c1', internetMessageId: '<a1@example.org>', toRecipients: 'dgsregistry@nitda.gov.ng;dg@nitda.gov.ng' }] };
    const strictLists = [L.DOCS, L.GTQ, COMMENTS];
    const runAs = (who) => {
      const sp = sharepoint(scoped, { config: cfg, lenientFilters: Object.keys(scoped).filter((k) => !strictLists.includes(k)).concat(Object.values(LISTS), ['f675598b-271d-4200-8d75-2597aad4057f', 'f64c8b65-c921-46e9-8814-a8cef61f6016', '8aab9c4e-001f-4e32-862c-8a50e750f04e', '9bc168c3-06e5-4d58-982b-0df06205fd35']) });
      const sim = new Simulator({ variables: { ...declaredVariables(FACAP), varRequestId: 'x' }, connectors: sp.connectors, clock: () => NOW,
        workflow: { name: 'b79e6707-df4d-4ae7-8a65-738aa45e9a73', run: { name: 'RUN-FA-S' }, tags: { flowDisplayName: 'IP_FETCH_ALL_BOOTSTRAP' } },
        trigger: { startTime: NOW, outputs: { body: { action: 'fetchAll', userEmail: who }, method: 'POST', queries: {}, headers: {} } } });
      sim.declare(FA).run(FA);
      return { sim, r: sim.response || {}, d: sim.response?.body?.data || {} };
    };
    const v = runAs('viewer@nitda.gov.ng');
    ok(failedSteps(v.sim).length === 0 && v.r.statusCode === 200, 'ITEM-90: a viewer is admitted (200), not refused', `${v.r.statusCode} ${failedSteps(v.sim).join(' | ').slice(0, 300)}`);
    ok(JSON.stringify((v.d.tasks || []).map((t) => t.ID)) === '[20]' && JSON.stringify((v.d.docs || []).map((x) => x.ID)) === '[313]' && JSON.stringify((v.d.comments || []).map((x) => x.ID)) === '[5]',
      'ITEM-90: a viewer receives only the task assigned to them, its document and that document\'s comment', JSON.stringify({ t: (v.d.tasks || []).map((t) => t.ID), d: (v.d.docs || []).map((x) => x.ID), c: (v.d.comments || []).map((x) => x.ID) }));
    const others = (v.d.users || []).filter((u) => u.Email && u.Email !== 'viewer@nitda.gov.ng');
    ok((v.d.users || []).length >= 3 && !others.length && (v.d.users || []).some((u) => u.Email === 'viewer@nitda.gov.ng'), 'ITEM-90: a viewer sees the directory without other people\'s addresses, and keeps their own', JSON.stringify((v.d.users || []).map((u) => u.Email)));
    ok(!(v.d.register || []).length && !(v.d.files || []).length && !(v.d.approvals || []).length && !(v.d.briefs || []).length, 'ITEM-90: a viewer receives no portal submissions, registry files, approvals or briefs');
    const dir = runAs('director@nitda.gov.ng');
    ok(dir.r.statusCode === 200 && (dir.d.approvals || []).length === 1 && !(dir.d.register || []).length, 'ITEM-90: a director is admitted, receives approvals, and not the registry\'s submissions', JSON.stringify({ a: (dir.d.approvals || []).length, r: (dir.d.register || []).length }));
    /* ITEM-91 (built 2026-10-18): a director also receives every task routed to their directorate (GDSUROUT eGD here), with its
       document, and not tasks routed elsewhere. */
    ok(JSON.stringify((dir.d.tasks || []).map((t) => t.ID).sort()) === '[20,21]' && JSON.stringify((dir.d.docs || []).map((x) => x.ID).sort()) === '[313,314]',
      'ITEM-91: a director receives the tasks routed to their directorate and their documents', JSON.stringify({ t: (dir.d.tasks || []).map((t) => t.ID), d: (dir.d.docs || []).map((x) => x.ID) }));
    const op = runAs('officer@nitda.gov.ng');
    ok(op.r.statusCode === 200 && (op.d.tasks || []).length === 3 && (op.d.docs || []).length === 3 && (op.d.register || []).length === 1 && (op.d.users || []).every((u) => u.Email), 'ITEM-90: the operator (the registry role) receives everything, addresses included', JSON.stringify({ t: (op.d.tasks || []).length, d: (op.d.docs || []).length, r: (op.d.register || []).length }));
    ok((op.d.tasks || []).find((t) => t.ID === 20)?.RoutedDsu === 'eGD', 'ITEM-90: tasks carry RoutedDsu from GDSUROUT');
    const em = (op.d.emails || [])[0] || {};
    ok((op.d.emails || []).length === 1 && em.id === 'AAMkAGI2-1' && em.fromAddress === 'sender@example.org' && em.internetMessageId === '<a1@example.org>' && em.toRecipients?.length === 2 && !('body' in em),
      'ITEM-74: the registry tier receives the registry inbox (id, sender, internetMessageId, recipients; no body), so a task can be raised from an e-mail', JSON.stringify(op.d.emails).slice(0, 300));
    ok(!(v.d.emails || []).length && !(dir.d.emails || []).length, 'ITEM-74: a viewer and a director receive no registry e-mail');
    const stranger = runAs('stranger@nitda.gov.ng');
    ok(stranger.r.statusCode === 401, 'ITEM-90: someone not in the directory is still refused (401)', String(stranger.r.statusCode));
  }
  /* Tenant defect (8 October 2026): the run record stored the proof from X-DGO-Proof in clear. */
  for (const h of ['X-DGO-Proof', 'x-dgo-proof']) {
    const fp = runFA(CONFIG, GOV, { [h]: 'Bearer tok-officer' });
    const red = JSON.stringify(fp.sim.global.get('Compose_Redacted_Headers')?.outputs ?? null);
    ok(fp.r.statusCode === 200 && red && red !== 'null' && !red.includes('tok-officer') && red.includes('***REDACTED***'), `FETCH_ALL: the proof sent as ${h} is accepted and never reaches the run record's headers`, `${fp.r.statusCode} ${String(red).slice(0, 200)}`);
  }

}

/* ---------------------------------------------------------------- DYNAMIC_ACTIONS */
const DA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Dynamic_Global_Actions_Endpoint', 'paste.json'));
const UA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_User_Admin_Endpoint', 'paste.json'));
const DACAP = capture('IP_Dynamic_Global_Actions_Endpoint');
staticChecks(DA, DACAP, 'DYNAMIC_ACTIONS');
console.log('\n  DYNAMIC_ACTIONS simulated runs\n');
{
  const P1L = J(`${DIR}/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json`).lists;
  const byTitle = (t) => P1L.find((x) => x.list === t);
  /* Flow Configuration with the Phase 1 lists' addresses (README "Flow Configuration for the new lists"). */
  const CFGD = CONFIG.map((r) => {
    const m = /^DATASET_(.+)_(SITE_URL|LIST_ID)$/.exec(r.Title); if (!m) return r;
    const l = PROV.lists.find((x) => x.datasetKey === m[1]); if (!l || l.listGuid) return r;
    const hit = byTitle(l.title); return { ...r, ConfigValue: m[2] === 'LIST_ID' ? hit.listGuid : `https://nitdanigeria.sharepoint.com/sites/${hit.site}` };
  });
  const G = (key) => CFGD.find((r) => r.Title === `DATASET_${key}_LIST_ID`).ConfigValue;
  const T = { REG: G('INTAKE_REGISTER'), MAP: G('IDENTITY_MAP'), MIN: G('MINUTES'), BRF: G('BRIEFS'), APR: G('APPROVALS'), FILES: G('REGISTRY_FILES'), MOVES: G('FILE_MOVEMENTS'), LINKS: G('RECORD_LINKS'), TASKS: G('TASK_QUEUE'), ATT: G('ATTACHMENTS'), OPS: G('OPS_WORKING_REGISTER'), SEQ: G('SEQUENCE_COUNTERS'), AUDIT: 'be0c7af1-b21d-4efe-8c30-53fc55598d95', DIRU: '3d591f5b-3f2f-409c-983a-a77b5c174834', ROLES: 'f675598b-271d-4200-8d75-2597aad4057f' };
  /* The columns each list written by HTTP has: Title, the Phase 1 identity columns, and the business columns the live flows write. */
  const cols = (key, extra = []) => new Set([...(PROV.lists.find((x) => x.datasetKey === key)?.addColumns || []).map((c) => c.name), ...extra]);
  const COLUMNS = {
    [T.MAP]: cols('IDENTITY_MAP'), [T.MIN]: cols('MINUTES', ['Description', 'RefIDD']), [T.BRF]: cols('BRIEFS'), [T.APR]: cols('APPROVALS'),
    [T.FILES]: cols('REGISTRY_FILES'), [T.MOVES]: cols('FILE_MOVEMENTS'), [T.LINKS]: cols('RECORD_LINKS'), [T.TASKS]: cols('TASK_QUEUE'), [T.ATT]: cols('ATTACHMENTS'),
    [T.OPS]: cols('OPS_WORKING_REGISTER'), [T.REG]: cols('INTAKE_REGISTER', ['ReferenceId', 'Status', 'SenderEmail']),
  };
  const KA = '1aaaaaaa-0000-4000-8000-00000000000a', KB = '1bbbbbbb-0000-4000-8000-00000000000b', KT = '1ccccccc-0000-4000-8000-00000000000c', KO = '1ddddddd-0000-4000-8000-00000000000d';
  const SEED = {
    [T.DIRU]: [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: 'registrar', UserId: 'e1fa0000-0000-4000-8000-000000000001' }, { ID: 2, Email: 'manager@nitda.gov.ng', Status: 'active', Role: 'registrymanager', UserId: 'e1fa0000-0000-4000-8000-000000000002' }],
    [T.ROLES]: [{ ID: 1, RoleId: 'registrar', Active: 1, AllowedRoutesJson: '["correspondence","registry","briefs","approvals","orchestrator"]' }, { ID: 2, RoleId: 'registrymanager', Active: 1, AllowedRoutesJson: '["registry","registry-merge"]' }],
    [T.SEQ]: [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 19 }],
    [T.REG]: [{ ID: 12, Title: 'NITDA-2026-00012', ReferenceId: 'NITDA-2026-00012', EntityKey: KB, IdState: 'ACTIVE', Rev: 2 }, { ID: 19, Title: 'NITDA-2026-00019', ReferenceId: 'NITDA-2026-00019', EntityKey: KA, IdState: 'ACTIVE', Rev: 1 }],
    [T.ATT]: [{ ID: 3, Title: 'scan.pdf', EntityKey: '1eeeeeee-0000-4000-8000-000000000003', ParentKey: `REC:${KA}`, RootKey: `REC:${KA}`, RootRef: 'NITDA-2026-00019', Rev: 1 }],
    [T.TASKS]: [{ ID: 9, Title: 'Review', EntityKey: KT, TaskRef: 'TASK-2026-00421', ParentKey: `REC:${KB}`, RootKey: `REC:${KB}`, RootRef: 'NITDA-2026-00012', RefIDD: 312, Rev: 1 },
      { ID: 10, Title: 'Duplicate task', EntityKey: '1fffffff-0000-4000-8000-000000000010', TaskRef: 'TASK-2026-00430', ParentKey: `REC:${KA}`, RootKey: `REC:${KA}`, RootRef: 'NITDA-2026-00019', Rev: 1 }],
    [T.OPS]: [{ ID: 22001, Title: 'Old letter', EntityKey: KO, ReferenceId: 'NITDA-2025-00900', IdState: { Value: 'ACTIVE' } }],
  };
  const lenient = [T.DIRU, T.ROLES, T.AUDIT, T.REG, T.ATT, T.TASKS, T.OPS, T.MAP, T.MIN, T.BRF, T.APR, T.FILES, T.MOVES, T.LINKS];
  let state = SEED; let n = 0;
  const runDA = (body, { as = 'officer@nitda.gov.ng', keep = true, opts = {}, headers = {} } = {}) => {
    const key = body.clientRequestHash || `${'0'.repeat(56)}${String(++n).padStart(8, '0')}`;
    const sp = sharepoint(state, { config: CFGD, lenientFilters: lenient, columns: COLUMNS, ...opts });
    const sim = new Simulator({ variables: declaredVariables(DACAP), connectors: sp.connectors, clock: () => NOW,
      workflow: { name: '31c0aaf0-ddbb-478c-9a98-bc013265c4c7', run: { name: `RUN-DA-${n}` }, tags: { flowDisplayName: 'IP_Dynamic_Global_Actions_Endpoint' } },
      trigger: { startTime: NOW, outputs: { body: { userEmail: as, idempotencyKey: key, clientRequestHash: key, ...body }, method: 'POST', queries: {}, headers: { 'X-Correlation-ID': 'client-corr-1', Origin: 'https://folio.example', ...headers } } } });
    sim.declare(DA).run(DA);
    if (keep) state = structuredClone(sp.db);
    return { sim, db: sp.db, r: sim.response || {}, d: sim.response?.body?.data || {}, key };
  };
  /* IP_User_Admin_Endpoint (ITEM-25, owner approval 2026-10-08): the same gate and prelude, with only user-admin. */
  const runUA = (body, { as = 'officer@nitda.gov.ng', keep = true, opts = {} } = {}) => {
    const key = `${'0'.repeat(56)}${String(++n).padStart(8, '0')}`;
    const sp = sharepoint(state, { config: CFGD, lenientFilters: lenient, columns: COLUMNS, ...opts });
    const sim = new Simulator({ variables: declaredVariables(DACAP), connectors: sp.connectors, clock: () => NOW,
      workflow: { name: 'e3e5c825-55ba-447e-88c1-96b7e89fd013', run: { name: `RUN-UA-${n}` }, tags: { flowDisplayName: 'IP_User_Admin_Endpoint' } },
      trigger: { startTime: NOW, outputs: { body: { userEmail: as, idempotencyKey: key, clientRequestHash: key, ...body }, method: 'POST', queries: {}, headers: { Origin: 'https://folio.example' } } } });
    sim.declare(UA).run(UA);
    if (keep) state = structuredClone(sp.db);
    return { sim, db: sp.db, r: sim.response || {}, d: sim.response?.body?.data || {}, key };
  };
  /* The simulator has no xml(); the notification scope reads its switches with it after the reply (the tenant runs it). */
  const clean = (x) => failedSteps(x.sim).filter((m) => !/^Compose_Notify_Config_Xml: unknown function xml\(\)/.test(m)).length === 0;
  const live = runDA({ operation: 'logauditevent', action: 'viewed', ref: 'NITDA-2026-00012' });
  ok(clean(live) && live.r.statusCode === 200 && live.r.body?.request?.requestId && live.r.body.request.requestId !== 'client-corr-1', 'a live operation (logauditevent) still works, and the requestId is the flow\'s own, not the client\'s X-Correlation-ID', `${live.r.statusCode} ${failedSteps(live.sim).filter((m) => !m.includes('xml()')).join(' | ').slice(0, 300)}`);

  /* Gap found 2026-10-10: a task's own assignee may update it whatever their role; nobody else gains anything. */
  {
    const GTQ = 'ee82725a-c408-45e2-a8e8-facf7a092047';
    const saved = state;
    state = structuredClone(state);
    state[T.DIRU] = [...state[T.DIRU], { ID: 90, Email: 'viewer@nitda.gov.ng', Status: 'active', Role: 'viewer', UserId: 'e1fa0000-0000-4000-8000-000000000090' }];
    state[T.ROLES] = [...state[T.ROLES], { ID: 90, RoleId: 'viewer', Active: 1, AllowedRoutesJson: '["home","response-tracking","reports","statistics","lookup"]' }];
    state[GTQ] = [{ ID: 701, Title: 'Viewer task', AssignedTo: 'viewer@nitda.gov.ng', Progress: { Value: 'Not started' }, Priority: { Value: 'Normal' }, Rev: 1 },
      { ID: 702, Title: 'Someone else\'s task', AssignedTo: 'other@nitda.gov.ng', Progress: { Value: 'Not started' }, Priority: { Value: 'Normal' }, Rev: 1 }];
    lenient.push(GTQ);
    const prog = (db, id) => { const r = (db[GTQ] || []).find((x) => x.ID === id) || {}; return r.Progress?.Value || r.Progress; };
    const own = runDA({ operation: 'update-task', docId: '701', ref: 'TASK-701', progress: 'In progress' }, { as: 'viewer@nitda.gov.ng' });
    ok(own.r.statusCode === 200 && prog(own.db, 701) === 'In progress', 'a Read-only Viewer can update a task assigned to them (no My Work route needed)', `${own.r.statusCode} ${prog(own.db, 701)} ${failedSteps(own.sim).join(' | ').slice(0, 200)}`);
    const other = runDA({ operation: 'update-task', docId: '702', ref: 'TASK-702', progress: 'Completed' }, { as: 'viewer@nitda.gov.ng' });
    ok(other.r.statusCode === 403 && prog(other.db, 702) === 'Not started' && other.d.code === 'NOT_PERMITTED', 'a Read-only Viewer is refused 403 on someone else\'s task, and it is not changed', `${other.r.statusCode} ${prog(other.db, 702)} ${JSON.stringify(other.d).slice(0, 160)}`);
    const off = runDA({ operation: 'update-task', docId: '702', ref: 'TASK-702', progress: 'In progress' }, { as: 'officer@nitda.gov.ng' });
    ok(off.r.statusCode === 200 && prog(off.db, 702) === 'In progress', 'a role with the My Work route still updates any task, as before', `${off.r.statusCode} ${prog(off.db, 702)}`);
    state = saved;
  }

  /* ITEM-25 (owner decision 2026-10-10): the Canvas Activities shortcuts, in Folio's three steps. */
  {
    const AL = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Activity_Lifecycle_Endpoint', 'paste.json'));
    staticChecks(AL, DACAP, 'ACTIVITY_LIFECYCLE');
    const runAL = (body, { as = 'officer@nitda.gov.ng', keep = true, opts = {} } = {}) => {
      const key = `${'0'.repeat(56)}${String(++n).padStart(8, '0')}`;
      const sp = sharepoint(state, { config: CFGD, lenientFilters: lenient, columns: COLUMNS, ...opts });
      const sim = new Simulator({ variables: declaredVariables(DACAP), connectors: sp.connectors, clock: () => NOW,
        workflow: { name: 'b4db02d8-02a0-4bc9-b9d3-06e2aae2448c', run: { name: `RUN-AL-${n}` }, tags: { flowDisplayName: 'IP_Activity_Lifecycle_Endpoint' } },
        trigger: { startTime: NOW, outputs: { body: { userEmail: as, idempotencyKey: key, clientRequestHash: key, ...body }, method: 'POST', queries: {}, headers: { Origin: 'https://folio.example' } } } });
      sim.declare(AL).run(AL);
      if (keep) state = structuredClone(sp.db);
      return { sim, db: sp.db, r: sim.response || {}, d: sim.response?.body?.data || {}, key };
    };
    const other = runAL({ operation: 'register', subject: 'x' }, { keep: false });
    ok(other.r.statusCode === 400, 'ITEM-25: IP_Activity_Lifecycle_Endpoint refuses any other operation as unknown (400)', String(other.r.statusCode));
    const GTQ = 'ee82725a-c408-45e2-a8e8-facf7a092047', OPS = '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3';
    const saved = state;
    state = structuredClone(state);
    state[OPS] = [...(state[OPS] || []).filter((x) => x.ID !== 4242), { ID: 4242, Title: 'SIWES placement letter', RefIDD: 'ACT-4242', AttachmentLink: 'https://example.org/a.pdf', Status: { Value: 'Not Treated' }, AssignmentStatus: { Value: 'Pending' }, ReferenceId: 'NITDA-2026-04242' }];
    state[GTQ] = [...(state[GTQ] || [])];
    /* The registrar here stands for the Operator, whose route list (config/rbac.config.js) includes activities. */
    state[T.ROLES] = state[T.ROLES].map((r) => r.RoleId === 'registrar' ? { ...r, AllowedRoutesJson: '["correspondence","registry","briefs","approvals","orchestrator","activities"]' } : r);
    for (const t of [GTQ, OPS]) if (!lenient.includes(t)) lenient.push(t);
    const step = (type, s, extra = {}) => runAL({ operation: `activity-${type}:${s}`, activityId: 4242, ref: 'NITDA-2026-04242', ...extra });
    const c1 = step('siwes', 'create-queue-record', { queueRecord: { Title: 'forged by the client', AssignedTo: 'attacker@example.com' } });
    const q = (c1.db[GTQ] || []).find((x) => String(x.ID) === String(c1.d.ID)) || {};
    ok(clean(c1) && c1.r.statusCode === 200 && c1.d.recognised === true && q.NVERSE === 'DGOFASTTRACK' && q.Classification === 'Internships (SIWES)' && q.Title === 'SIWES placement letter' && q.AssignedTo === 'dgs@NITDA.gov.ng' && String(q.RefIDD) === '4242',
      'ITEM-25: create-queue-record writes the DGOFASTTRACK queue row from the activity itself (not the request) and answers its ID', `${c1.r.statusCode} ${JSON.stringify(c1.d).slice(0, 200)} ${JSON.stringify(q).slice(0, 200)} ${failedSteps(c1.sim).join(' | ').slice(0, 300)}`);
    const again = runAL({ operation: 'activity-siwes:create-queue-record', activityId: 4242, ref: 'NITDA-2026-04242' });
    ok(again.r.statusCode === 200, 'ITEM-25: another create for the same activity is a new request (Folio sends a fresh idempotency key per attempt)', String(again.r.statusCode));
    const c2 = step('siwes', 'set-reference-id', { queueRecordId: c1.d.ID, Reference_ID: 'forged' });
    const q2 = (c2.db[GTQ] || []).find((x) => String(x.ID) === String(c1.d.ID)) || {};
    ok(clean(c2) && c2.r.statusCode === 200 && /^\d{8}-4242-INT-SIWES-\d+$/.test(q2.Reference_ID || '') && q2.Reference_ID === c2.d.Reference_ID && q2.Reference_ID.endsWith(`-${c1.d.ID}`),
      'ITEM-25: set-reference-id computes yyyyMMdd-<activity>-INT-SIWES-<queue ID> itself and writes it', `${c2.r.statusCode} ${q2.Reference_ID} ${JSON.stringify(c2.d).slice(0, 160)} ${failedSteps(c2.sim).join(' | ').slice(0, 300)}`);
    const wrong = step('archive', 'set-reference-id', { queueRecordId: c1.d.ID });
    ok(wrong.r.statusCode === 409 && wrong.d.code === 'QUEUE_RECORD_MISMATCH', 'ITEM-25: a queue record of another category (or activity) is refused 409', `${wrong.r.statusCode} ${JSON.stringify(wrong.d).slice(0, 160)}`);
    const c3 = step('siwes', 'update-activity', { patch: { status: 'Treated' } });
    const a = (c3.db[OPS] || []).find((x) => x.ID === 4242) || {};
    ok(clean(c3) && c3.r.statusCode === 200 && (a.Status?.Value || a.Status) === 'Treated' && (a.AssignmentStatus?.Value || a.AssignmentStatus) === 'Processed' && a.AssignedTo === 'dgs@NITDA.gov.ng' && a.Category0 === 'Internships (SIWES)',
      'ITEM-25: update-activity marks the activity Treated / Processed, assigned to the DGS office, in the category', `${c3.r.statusCode} ${JSON.stringify(a).slice(0, 240)} ${failedSteps(c3.sim).join(' | ').slice(0, 300)}`);
    const none = step('nysc', 'update-activity', { activityId: 999999 });
    ok(none.r.statusCode === 404, 'ITEM-25: an activity that does not exist answers 404', String(none.r.statusCode));
    const bad = runAL({ operation: 'activity-archive:create-queue-record', activityId: 'abc', ref: 'x' });
    ok(bad.r.statusCode === 400, 'ITEM-25: an activityId that is not an item ID is refused 400 before anything is read', String(bad.r.statusCode));
    const before = JSON.stringify((state[OPS] || []).find((x) => x.ID === 4242));
    state[T.ROLES] = state[T.ROLES].map((r) => r.RoleId === 'registrar' ? { ...r, AllowedRoutesJson: '["correspondence","registry"]' } : r);
    const noRoute = runAL({ operation: 'activity-archive:update-activity', activityId: 4242, ref: 'x' });
    ok(noRoute.r.statusCode === 403 && JSON.stringify((noRoute.db[OPS] || []).find((x) => x.ID === 4242)) === before, 'ITEM-25: a role without the activities route is refused 403 and the activity is not changed', `${noRoute.r.statusCode}`);
    state[T.ROLES] = state[T.ROLES].map((r) => r.RoleId === 'registrar' ? { ...r, AllowedRoutesJson: '["correspondence","registry","briefs","approvals","orchestrator","activities"]' } : r);
    for (const t of ['archive', 'nysc']) { const x = step(t, 'create-queue-record'); const row = (x.db[GTQ] || []).filter((r) => String(r.ID) === String(x.d.ID)).pop() || {}; /* each simulated run restarts its item IDs */ ok(x.r.statusCode === 200 && row.Classification === { archive: 'Archived', nysc: 'Internships (NYSC)' }[t], `ITEM-25: activity-${t} routes to its category`, `${x.r.statusCode} ${row.Classification}`); }
    state = saved;
  }

  /* ITEM-25: the activity lifecycle steps belong to IP_Activity_Lifecycle_Endpoint (DYNAMIC_ACTIONS is at the 500-action
     limit); here they are refused as unknown, never 501. */
  {
    const x = runDA({ operation: 'activity-siwes:create-queue-record', activityId: 4242, ref: 'x' });
    ok(x.r.statusCode === 400 && x.d.code === 'UNKNOWN_OPERATION', 'ITEM-25: DYNAMIC_ACTIONS refuses an activity lifecycle step as unknown (400), not 501', `${x.r.statusCode} ${x.d.code}`);
  }
  /* T8: register an e-mail with its internetMessageId */
  /* ITEM-25 (owner decision 2026-10-08): dispatch, dispatchoutbound and archivereference are served by transitionstatus. */
  {
    const DOPS = '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3';
    const saved = state;
    state = structuredClone(state);
    state[DOPS] = [{ ID: 501, Title: 'Letter to dispatch', RefIDD: 'NITDA-2026-00501', Status: { Value: 'Not Treated' }, IdState: { Value: 'ACTIVE' } },
      { ID: 502, Title: 'Letter to archive', RefIDD: 'NITDA-2026-00502', Status: { Value: 'Treated' }, IdState: { Value: 'ACTIVE' } }];
    state[T.ROLES] = state[T.ROLES].map((r) => r.RoleId === 'registrar' ? { ...r, AllowedRoutesJson: '["correspondence","registry","briefs","approvals","orchestrator","dispatch","archive"]' } : r);
    lenient.push(DOPS);
    const dsp = runDA({ operation: 'dispatchOutbound', ref: 'NITDA-2026-00501', channel: 'email', recipients: ['x@example.org'] });
    const doc1 = (dsp.db[DOPS] || []).find((x) => x.ID === 501) || {};
    ok(clean(dsp) && dsp.r.statusCode === 200 && (doc1.Status?.Value || doc1.Status) === 'Treated' && (doc1.IdState?.Value || doc1.IdState) === 'ACTIVE',
      'ITEM-25: dispatchOutbound no longer answers 501: it records the document as Treated and leaves its IdState', `${dsp.r.statusCode} ${JSON.stringify(doc1).slice(0, 200)} ${failedSteps(dsp.sim).join(' | ').slice(0, 200)}`);
    const audit = (dsp.db[T.AUDIT] || []).slice(-1)[0] || {};
    ok(/dispatchoutbound/.test(JSON.stringify(audit)), 'ITEM-25: the audit row names the dispatch it came from', JSON.stringify(audit).slice(0, 300));
    const arc = runDA({ operation: 'archiveReference', ref: 'NITDA-2026-00502' });
    const doc2 = (arc.db[DOPS] || []).find((x) => x.ID === 502) || {};
    ok(clean(arc) && arc.r.statusCode === 200 && (doc2.IdState?.Value || doc2.IdState) === 'ARCHIVED' && (doc2.Status?.Value || doc2.Status) === 'Treated',
      'ITEM-25: archiveReference sets IdState ARCHIVED, even on an already treated document', `${arc.r.statusCode} ${JSON.stringify(doc2).slice(0, 200)} ${failedSteps(arc.sim).join(' | ').slice(0, 200)}`);
    const plain = runDA({ operation: 'transitionstatus', ref: 'NITDA-2026-00501', status: 'Not Treated' });
    const doc3 = (plain.db[DOPS] || []).find((x) => x.ID === 501) || {};
    ok(plain.r.statusCode === 200 && (doc3.Status?.Value || doc3.Status) === 'Not Treated' && (doc3.IdState?.Value || doc3.IdState) === 'ACTIVE', 'a plain transitionstatus still writes the status it names and never touches IdState', `${plain.r.statusCode} ${JSON.stringify(doc3).slice(0, 160)}`);
    state[T.ROLES] = saved[T.ROLES];
    const denied = runDA({ operation: 'dispatch', ref: 'NITDA-2026-00501' }, { keep: false });
    ok(denied.r.statusCode === 403, 'ITEM-25: a role without the dispatch route is refused (403)', String(denied.r.statusCode));
    state = saved;
  }
  /* ITEM-25 user-admin (needs assessment 2026-10-08): Folio's User Administration screen reaches DGO_UserDirectory. */
  {
    const saved = state, savedCols = COLUMNS[T.DIRU];
    state = structuredClone(state);
    COLUMNS[T.DIRU] = new Set(['Title', 'UserId', 'FullName', 'Email', 'Directorate', 'Department', 'Unit', 'JobTitle', 'Phone', 'Role', 'Persona', 'Status', 'AccessScope', 'PilotCohort', 'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'DisabledReason', 'EntityKey', 'IdState', 'CreatedByRequest', 'Rev']);
    state[T.ROLES] = [...state[T.ROLES].map((r) => r.RoleId === 'registrar' ? { ...r, AllowedRoutesJson: '["correspondence","registry","briefs","approvals","orchestrator","user-admin"]' } : r),
      { ID: 9, RoleId: 'systemadmin', Active: 1, AllowedRoutesJson: '["*"]' }];
    state[T.DIRU] = [...state[T.DIRU], { ID: 3, Title: 'root@nitda.gov.ng', Email: 'root@nitda.gov.ng', Status: 'active', Role: 'systemAdmin', UserId: 'e1fa0000-0000-4000-8000-000000000003', Rev: 1 },
      { ID: 4, Title: 'staff@nitda.gov.ng', Email: 'staff@nitda.gov.ng', FullName: 'A Staff', Directorate: 'DGO', Status: 'active', Role: 'viewer', Persona: 'general', UserId: 'e1fa0000-0000-4000-8000-000000000004', Rev: 1 }];
    const ua = (action, user, opts) => runUA({ operation: `user-admin:${action}`, module: 'user-admin', user }, opts);
    const newUser = { fullName: 'New Officer', email: 'New.Officer@nitda.gov.ng', directorate: 'DGO', department: 'Registry', role: 'operator', status: 'active', accessScope: ['Registry'] };
    const c1 = ua('create-user', newUser);
    const row = (c1.db[T.DIRU] || []).find((x) => x.Email === 'new.officer@nitda.gov.ng') || {};
    ok(clean(c1) && c1.r.statusCode === 200 && c1.d.created === true && row.Role === 'operator' && row.Persona === 'registry' && row.Status === 'active' && /^[0-9a-f-]{36}$/.test(row.UserId || '') && row.Rev === 1 && row.IdState === 'ACTIVE' && row.CreatedBy === 'officer@nitda.gov.ng',
      'user-admin: create-user writes the directory row (role, persona from the role, status, UserId, Rev 1, IdState ACTIVE, created by the officer)', `${c1.r.statusCode} ${JSON.stringify(row).slice(0, 300)} ${failedSteps(c1.sim).join(' | ').slice(0, 200)}`);
    const audit = (c1.db[T.AUDIT] || []).slice(-1)[0] || {};
    ok(audit.Event === 'user:create-user' && audit.ActorEmail === 'officer@nitda.gov.ng', 'user-admin: the change is audited as user:create-user with the officer as actor', JSON.stringify(audit).slice(0, 200));
    ok(ua('create-user', newUser, { keep: false }).r.statusCode === 409, 'user-admin: creating an address already in the directory is refused (409)');
    const c2 = ua('assign-role', { ...newUser, role: 'director' });
    const row2 = (c2.db[T.DIRU] || []).find((x) => x.Email === 'new.officer@nitda.gov.ng') || {};
    ok(clean(c2) && c2.r.statusCode === 200 && row2.Role === 'director' && row2.Rev === 2 && row2.UpdatedBy === 'officer@nitda.gov.ng' && c2.d.previousRole === 'operator', 'user-admin: assign-role changes the role by Guarded Update (Rev 2) and reports the previous role', `${c2.r.statusCode} ${JSON.stringify(row2).slice(0, 240)}`);
    const c3 = ua('disable-user', { email: 'new.officer@nitda.gov.ng', disabledReason: 'Left the agency' });
    const row3 = (c3.db[T.DIRU] || []).find((x) => x.Email === 'new.officer@nitda.gov.ng') || {};
    ok(c3.r.statusCode === 200 && row3.Status === 'disabled' && row3.DisabledReason === 'Left the agency' && row3.Role === 'director', 'user-admin: disable-user sets Status disabled with the reason and keeps the role', `${c3.r.statusCode} ${JSON.stringify(row3).slice(0, 240)}`);
    ok(ua('update-user', { ...newUser, email: 'nobody@nitda.gov.ng' }, { keep: false }).r.statusCode === 404, 'user-admin: changing someone not in the directory answers 404');
    ok(ua('assign-role', { email: 'staff@nitda.gov.ng', fullName: 'A Staff', directorate: 'DGO', role: 'systemAdmin' }, { keep: false }).r.statusCode === 403, 'user-admin: only a systemAdmin grants systemAdmin (403 for a user administrator)');
    ok(ua('disable-user', { email: 'root@nitda.gov.ng' }, { keep: false }).r.statusCode === 403, 'user-admin: only a systemAdmin changes a systemAdmin (403)');
    ok(ua('assign-role', { email: 'staff@nitda.gov.ng', role: 'superuser' }, { keep: false }).r.statusCode === 400, 'user-admin: a role that is not one of the directory\'s choices is refused (400)');
    ok(ua('create-user', { ...newUser, email: 'third@nitda.gov.ng', role: 'systemAdmin' }, { as: 'root@nitda.gov.ng', keep: false }).r.statusCode === 200, 'user-admin: a systemAdmin may grant systemAdmin');
    state[T.ROLES] = saved[T.ROLES];
    ok(ua('update-user', { ...newUser, email: 'staff@nitda.gov.ng' }, { keep: false }).r.statusCode === 403, 'user-admin: a role without the user-admin route is refused (403)');
    const viaDynamic = runDA({ operation: 'user-admin:create-user', module: 'user-admin', user: newUser }, { keep: false });
    ok(viaDynamic.r.statusCode === 400, 'user-admin sent to DYNAMIC_ACTIONS is refused as unknown (400): IP_User_Admin_Endpoint serves it', String(viaDynamic.r.statusCode));
    state = saved; COLUMNS[T.DIRU] = savedCols;
  }
  const reg = runDA({ operation: 'register', subject: 'Request for data centre audit', channel: 'email', senderEmail: 'Sender@Example.org', locatorKind: 'exo_internet_message_id', locatorContainer: 'Registry@nitda.gov.ng', locatorValue: '<CAF1234@mail.example.org>' });
  const row = state[T.REG].find((x) => x.ReferenceId === reg.d.referenceId) || {};
  const loc = (state[T.MAP] || [])[0] || {};
  ok(clean(reg) && reg.r.statusCode === 200 && reg.d.referenceId === 'NITDA-2026-00020' && /^REC:[0-9a-f-]{36}$/.test(reg.d.qualifiedKey), 'register issues the next NITDA number (NITDA-2026-00020) and a REC key', `${reg.r.statusCode} ${JSON.stringify(reg.d)} ${failedSteps(reg.sim).join(' | ').slice(0, 400)}`);
  ok(row.EntityKey === reg.d.entityKey && row.Channel === 'email' && row.SenderEmail === 'sender@example.org' && row.IdState?.Value === 'ACTIVE' && row.Rev === 1 && row.ClientRequestHash === reg.key && row.CorrelationId === reg.r.body.request.requestId, 'the Portal Registry row carries the record\'s identity, channel, sender, ClientRequestHash and the Request ID', JSON.stringify(row).slice(0, 300));
  ok(loc.EntryKind === 'LOCATOR' && loc.Kind === 'EXO_INTERNET_MESSAGE_ID' && loc.System === 'exchange' && loc.Container === 'Registry@nitda.gov.ng' && loc.EntityRef === reg.d.qualifiedKey && loc.MatchKey === 'LOCATOR|EXO_INTERNET_MESSAGE_ID|registry@nitda.gov.ng|<CAF1234@mail.example.org>' && loc.Environment === 'prd' && reg.d.locatorWritten === true, 'T8: the internetMessageId is a LOCATOR entry in DGO_IdentityMap pointing at the record', JSON.stringify(loc).slice(0, 300));
  const audit = state[T.AUDIT].find((x) => x.AuditId === `dynamic-global-actions:idem:${reg.key}`) || {};
  ok(audit.Action === 'REGISTERED' && audit.SubjectKey === reg.d.qualifiedKey && audit.Process === 'INTAKE' && audit.ActorKey === 'USR:e1fa0000-0000-4000-8000-000000000001' && JSON.parse(audit.MetaJson).result.referenceId === 'NITDA-2026-00020', 'the audit event REGISTERED names the record, the actor and the process, and holds the result');

  const internal = runDA({ operation: 'register', subject: 'Minute of the directors\' meeting', locatorKind: 'EXO_INTERNET_MESSAGE_ID', locatorContainer: 'registry@nitda.gov.ng', locatorValue: '<CAF1234@mail.example.org>' });
  ok(internal.r.statusCode === 200 && state[T.REG].find((x) => x.ReferenceId === internal.d.referenceId)?.Channel === 'internal' && state[T.MAP].filter((x) => x.EntryKind === 'LOCATOR').length === 1 && internal.d.locatorWritten === true,
    'a record registered with no channel is internal; a locator whose MatchKey is already held is not written twice', JSON.stringify(internal.d));
  const failedReg = runDA({ operation: 'register', subject: 'Write refused', locatorKind: 'EXO_INTERNET_MESSAGE_ID', locatorContainer: 'registry@nitda.gov.ng', locatorValue: '<refused@mail.example.org>' }, { keep: false, opts: { failCreate: { '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667': true } } });
  ok(failedReg.r.statusCode === 500 && !(failedReg.db[T.MAP] || []).some((x) => x.Value === '<refused@mail.example.org>'), 'a register whose record is refused answers 500 and writes no locator for it', `${failedReg.r.statusCode} ${JSON.stringify(failedReg.d)}`);
  /* T11: the same request replayed */
  const before = JSON.stringify(state[T.REG]);
  const again = runDA({ operation: 'register', subject: 'Request for data centre audit', channel: 'email', clientRequestHash: reg.key });
  ok(again.r.statusCode === 200 && again.d.referenceId === 'NITDA-2026-00020' && again.d.replayed === true && JSON.stringify(state[T.REG]) === before && state[T.SEQ][0].CurrentSequence === 21, 'T11: a replay returns the first result (NITDA-2026-00020, replayed) and writes nothing', JSON.stringify(again.d));
  /* ITEM-81 (from the hardened scope): the same idempotency key on a different operation is a conflict, not a replay. */
  const filesBefore = JSON.stringify(state[T.FILES] || []);
  const clash = runDA({ operation: 'open_file', title: 'Another request on a used key', clientRequestHash: reg.key });
  ok(clash.r.statusCode === 409 && clash.d.code === 'IDEMPOTENCY_CONFLICT' && JSON.stringify(state[T.FILES] || []) === filesBefore && JSON.stringify(state[T.REG]) === before,
    'ITEM-81: an idempotency key already used for another operation answers 409 IDEMPOTENCY_CONFLICT and writes nothing', `${clash.r.statusCode} ${JSON.stringify(clash.d)}`);
  const long = runDA({ operation: 'register', subject: 'x'.repeat(300) }, { keep: false });
  ok(long.r.statusCode === 400 && /exceed the permitted length/.test(JSON.stringify(long.r.body)), 'ITEM-81: a value longer than its column is refused with 400 before anything is written', `${long.r.statusCode} ${JSON.stringify(long.r.body).slice(0, 200)}`);

  /* minutes and records */
  const min = runDA({ operation: 'upsert_record', entityType: 'MIN', parentKey: `TSK:${KT}`, text: 'Procurement to confirm the budget line.', localKey: 'TSK-local-77' });
  const mrow = (state[T.MIN] || [])[0] || {};
  ok(clean(min) && min.r.statusCode === 200 && mrow.ParentKey === `TSK:${KT}` && mrow.RootKey === `REC:${KB}` && mrow.RootRef === 'NITDA-2026-00012' && mrow.Description === 'Procurement to confirm the budget line.' && mrow.AuthorKey === 'USR:e1fa0000-0000-4000-8000-000000000001' && mrow.EntityKey === min.d.entityKey,
    'a minute is written under its task, with the task\'s record as RootKey and RootRef and the caller as author', `${min.r.statusCode} ${JSON.stringify(mrow).slice(0, 300)} ${failedSteps(min.sim).join(' | ').slice(0, 300)}`);
  ok((state[T.MAP] || []).some((x) => x.Kind === 'FOLIO_LOCAL_KEY' && x.Value === 'TSK-local-77' && x.EntityRef === `MIN:${min.d.entityKey}` && x.MatchKey === 'ALIAS|FOLIO_LOCAL_KEY||TSK-local-77' && x.System === 'runtime'), 'Folio\'s local key becomes a FOLIO_LOCAL_KEY alias of the minute');
  const noTask = runDA({ operation: 'upsert_record', entityType: 'MIN', parentKey: 'TSK:99999999-0000-4000-8000-000000000099', text: 'Orphan' });
  ok(noTask.r.statusCode === 404 && noTask.d.code === 'TASK_NOT_FOUND', 'a minute for an unknown task is 404 and nothing is written');
  const brf = runDA({ operation: 'upsert_record', entityType: 'BRF', title: 'Brief on cloud policy' });
  const brow = (state[T.BRF] || [])[0] || {};
  ok(clean(brf) && brf.r.statusCode === 200 && brow.Title === 'Brief on cloud policy' && brow.IdState === 'ACTIVE' && brow.Rev === 1 && brow.CorrelationId, 'a brief is created with its identity columns', `${brf.r.statusCode} ${JSON.stringify(brow)}`);
  const brf2 = runDA({ operation: 'upsert_record', entityType: 'BRF', entityKey: brf.d.entityKey, title: 'Brief on cloud policy (revised)' });
  ok(brf2.r.statusCode === 200 && state[T.BRF][0].Title === 'Brief on cloud policy (revised)' && state[T.BRF][0].Rev === 2 && brf2.d.revAfter === 2, 'changing it by entityKey is a Guarded Update: Title changed, Rev 2', `${brf2.r.statusCode} ${JSON.stringify(brf2.d)} ${failedSteps(brf2.sim).join(' | ').slice(0, 300)}`);
  const brf3 = runDA({ operation: 'upsert_record', entityType: 'BRF', entityKey: brf.d.entityKey, title: 'Brief whose write is not confirmed' }, { keep: false, opts: { failMerge: { [T.BRF]: true } } });
  ok(brf3.r.statusCode === 503 && brf3.d.code === 'OUTCOME_UNKNOWN', 'ITEM-81: a write the registry does not confirm (service failure, not a changed row) answers 503 OUTCOME_UNKNOWN, retry with the same key', `${brf3.r.statusCode} ${JSON.stringify(brf3.d)}`);
  const apr = runDA({ operation: 'upsert_record', entityType: 'APR', title: 'Approve the audit', parentKey: reg.d.qualifiedKey });
  ok(apr.r.statusCode === 200 && state[T.APR][0].Decision === 'Pending' && state[T.APR][0].ParentKey === reg.d.qualifiedKey, 'an approval starts Pending under its record', JSON.stringify(state[T.APR]?.[0]));

  /* T12: open a file, file a record in it, move it twice */
  const file = runDA({ operation: 'open_file', title: 'Data centre audits 2026', toOrgKey: 'ORG:REGISTRY', legacyNumber: 'DGO/2026/000417' });
  const frow = (state[T.FILES] || [])[0] || {};
  ok(clean(file) && file.r.statusCode === 200 && file.d.fileRef === 'FILE-2026-00001' && frow.RegistryFileRef === 'FILE-2026-00001' && frow.CurrentHolder === 'ORG:REGISTRY' && state[T.SEQ].some((x) => x.Title === 'FILE-2026' && x.CurrentSequence === 1),
    'T12: open_file issues FILE-2026-00001 from its own counter and records the holder', `${file.r.statusCode} ${JSON.stringify(file.d)} ${failedSteps(file.sim).join(' | ').slice(0, 300)}`);
  ok((state[T.MOVES] || []).some((x) => x.Action === 'OPENED' && x.SubjectKey === file.d.qualifiedKey) && (state[T.MAP] || []).some((x) => x.Kind === 'LEGACY_REGISTRY_FILE_NO' && x.Value === 'DGO/2026/000417'), 'the opening is a movement, and the old DGO/2026/000417 number becomes an alias');
  const filed = runDA({ operation: 'link', fromKey: reg.d.qualifiedKey, toKey: file.d.qualifiedKey, linkType: 'filed_in' });
  const lrow = (state[T.LINKS] || []).find((x) => x.LinkType === 'FILED_IN') || {};
  ok(filed.r.statusCode === 200 && lrow.FromKey === reg.d.qualifiedKey && lrow.ToKey === file.d.qualifiedKey && lrow.LinkMatchKey === `${reg.d.qualifiedKey}|FILED_IN|${file.d.qualifiedKey}`, 'T12: one FILED_IN link from the record to the file', JSON.stringify(lrow));
  const filedAgain = runDA({ operation: 'link', fromKey: reg.d.qualifiedKey, toKey: file.d.qualifiedKey, linkType: 'FILED_IN' });
  ok(filedAgain.d.existing === true && state[T.LINKS].filter((x) => x.LinkType === 'FILED_IN').length === 1, 'the same link sent again is returned, not written twice');
  const m1 = runDA({ operation: 'move_file', target: file.d.qualifiedKey, toOrgKey: 'ORG:PROCUREMENT' });
  const m2 = runDA({ operation: 'move_file', target: `spo:${T.FILES}/${frow.ID}`, toOrgKey: 'ORG:LEGAL', movementAction: 'FOR_OPINION' });
  const moves = (state[T.MOVES] || []).filter((x) => x.Action === 'MOVED');
  ok(clean(m1) && m1.r.statusCode === 200 && m2.r.statusCode === 200 && moves.length === 2 && moves.every((x) => x.SubjectKey === file.d.qualifiedKey && x.RootRef === 'FILE-2026-00001')
    && moves[0].FromOrgKey === 'ORG:REGISTRY' && moves[0].ToOrgKey === 'ORG:PROCUREMENT' && moves[1].FromOrgKey === 'ORG:PROCUREMENT' && moves[1].MovementAction === 'FOR_OPINION' && state[T.FILES][0].CurrentHolder === 'ORG:LEGAL' && state[T.FILES][0].Rev === 3,
    'T12: two MOVED events with the file\'s key, holder before and after; the second addressed by its spo: locator; the file at Rev 3', `${m1.r.statusCode}/${m2.r.statusCode} ${JSON.stringify(moves).slice(0, 400)} ${failedSteps(m2.sim).join(' | ').slice(0, 300)}`);

  /* void and reparent */
  const v = runDA({ operation: 'void', target: `REC:${KO}`, reason: 'Entered twice' });
  ok(clean(v) && v.r.statusCode === 200 && state[T.OPS][0].IdState === 'VOID' && !('Rev' in state[T.OPS][0]) && v.d.reference === 'NITDA-2025-00900', 'void reaches a record still only in DGO DIGITAL OPS and sets IdState VOID without a Rev the list does not have', `${v.r.statusCode} ${JSON.stringify(state[T.OPS][0])} ${failedSteps(v.sim).join(' | ').slice(0, 300)}`);
  const v2 = runDA({ operation: 'void', target: `REC:${KO}`, reason: 'Again' });
  ok(v2.r.statusCode === 200 && v2.d.changed === false, 'voiding it again answers unchanged');
  const rp = runDA({ operation: 'reparent', target: `TSK:${KT}`, parentKey: reg.d.qualifiedKey });
  ok(clean(rp) && rp.r.statusCode === 200 && state[T.TASKS][0].ParentKey === reg.d.qualifiedKey && state[T.TASKS][0].RootKey === reg.d.qualifiedKey && rp.d.parentBefore === `REC:${KB}`, 'reparent moves the task under the new record (ParentKey and RootKey)', `${rp.r.statusCode} ${JSON.stringify(rp.d)}`);

  /* T9: merge 00019 into 00012 */
  const denied = runDA({ operation: 'merge', target: `REC:${KA}`, survivor: `REC:${KB}` });
  ok(denied.r.statusCode === 403 && state[T.REG].find((x) => x.EntityKey === KA).IdState === 'ACTIVE', 'merge is refused (403) for a role without registry-merge');
  const mg = runDA({ operation: 'merge', target: `REC:${KA}`, survivor: `REC:${KB}` }, { as: 'manager@nitda.gov.ng' });
  const a = state[T.REG].find((x) => x.EntityKey === KA);
  ok(clean(mg) && mg.r.statusCode === 200 && a.IdState === 'MERGED' && a.SupersededBy === `REC:${KB}` && a.Rev === 2, 'T9: the absorbed record is MERGED, SupersededBy the survivor, Rev 2', `${mg.r.statusCode} ${JSON.stringify(mg.d)} ${failedSteps(mg.sim).join(' | ').slice(0, 400)}`);
  ok(state[T.ATT][0].ParentKey === `REC:${KB}` && state[T.ATT][0].RootRef === 'NITDA-2026-00012' && state[T.TASKS].find((x) => x.ID === 10).RootKey === `REC:${KB}` && mg.d.attachmentsMoved === 1 && mg.d.tasksMoved === 1, 'T9: its attachment and task are re-parented to the survivor');
  ok(state[T.LINKS].some((x) => x.LinkType === 'MERGED_INTO' && x.FromKey === `REC:${KA}` && x.ToKey === `REC:${KB}`) && state[T.AUDIT].filter((x) => x.Action === 'MERGED').map((x) => x.SubjectKey).sort().join() === [`REC:${KA}`, `REC:${KB}`].sort().join()
    && state[T.AUDIT].filter((x) => x.Action === 'REPARENTED' && x.RootKey === `REC:${KB}`).length >= 2, 'T9: LNK MERGED_INTO, MERGED events on both records and a REPARENTED event per child');
  const mg2 = runDA({ operation: 'merge', target: `REC:${KA}`, survivor: `REC:${KB}` }, { as: 'manager@nitda.gov.ng' });
  ok(mg2.r.statusCode === 409, 'a record already merged cannot be merged again (409)');

  /* the gate */
  for (const [why, body, code] of [
    ['a bare item ID as target', { operation: 'void', target: '22001', reason: 'x' }, 400],
    ['an unknown entity type', { operation: 'upsert_record', entityType: 'XYZ', title: 'x' }, 400],
    ['an unknown link type', { operation: 'link', fromKey: `REC:${KA}`, toKey: `REC:${KB}`, linkType: 'LIKES' }, 400],
    ['a merge of a record into itself', { operation: 'merge', target: `REC:${KB}`, survivor: `REC:${KB}` }, 400],
    ['a target nobody has', { operation: 'void', target: 'REC:99999999-0000-4000-8000-000000000099', reason: 'x' }, 404],
    ['a channel that is not a catalogue code', { operation: 'register', subject: 'x', channel: 'folio' }, 400],
    ['a locator kind clients may not write', { operation: 'register', subject: 'x', locatorKind: 'EXO_GRAPH_MESSAGE_ID', locatorContainer: 'registry@nitda.gov.ng', locatorValue: 'AAMkAGI2ZjM1NzQ0LWE3AAA=' }, 400],
    ['a locator without its container', { operation: 'register', subject: 'x', locatorKind: 'SPO_ITEM', locatorValue: '12907' }, 400],
    ['an internetMessageId not written <id@host>', { operation: 'register', subject: 'x', locatorKind: 'EXO_INTERNET_MESSAGE_ID', locatorContainer: 'registry@nitda.gov.ng', locatorValue: 'CAF1234@mail' }, 400],
  ]) {
    const x = runDA(body, { as: body.operation === 'merge' ? 'manager@nitda.gov.ng' : 'officer@nitda.gov.ng', keep: false });
    ok(x.r.statusCode === code, `${why}: ${code}`, `${x.r.statusCode} ${JSON.stringify(x.d).slice(0, 200)}`);
  }
  const stranger = runDA({ operation: 'register', subject: 'x' }, { as: 'nobody@example.org', keep: false });
  /* G-04: with IDENTITY_PROOF_REQUIRED set, the body's userEmail names nobody; the proof names the caller. */
  const proofOn = { [T.AUDIT]: state[T.AUDIT], '9bc168c3-06e5-4d58-982b-0df06205fd35': [{ ID: 90, Title: 'IDENTITY_PROOF_REQUIRED', ConfigValue: 'true' }],
    [PROOF_LIST]: [{ ID: 1, Title: 'tok-officer', Consumed: 0, Purpose: 'internal-session', Email: 'officer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' }] };
  const savedState = state; state = { ...state, ...proofOn };
  const pf0 = runDA({ operation: 'upsert_record', entityType: 'BRF', title: 'Forged' }, { as: 'officer@nitda.gov.ng', keep: false });
  ok(pf0.r.statusCode === 401 && !state[T.BRF].some((x) => x.Title === 'Forged'), 'DYNAMIC_ACTIONS: with the switch on, a request naming a real user but carrying no proof is refused (401)', `${pf0.r.statusCode}`);
  const pf1 = runDA({ operation: 'upsert_record', entityType: 'BRF', title: 'Proven brief' }, { as: 'nobody@example.org', keep: false, headers: { Authorization: 'Bearer tok-officer' } });
  const pfAudit = (pf1.db[T.AUDIT] || []).find((x) => x.Action === 'CREATED' && x.SubjectKey === pf1.d.qualifiedKey) || {};
  ok(pf1.r.statusCode === 200 && pfAudit.ActorEmail === 'officer@nitda.gov.ng' && pfAudit.ActorKey === 'USR:e1fa0000-0000-4000-8000-000000000001', 'DYNAMIC_ACTIONS: with a valid proof the caller is the proof\'s user, whatever userEmail the body names', `${pf1.r.statusCode} ${pfAudit.ActorEmail}`);
  state = savedState;
  ok(stranger.r.statusCode === 401, 'a caller who is not an active directory user is refused (401)');
}

/* ---------------------------------------------------------------- LIBRARY INTAKE */
const LIBCAP = capture('_DGSO_INCOMING_AI_PROCESSING');
/* ITEM-80: the legacy flow rebuilt in Folio_Incoming_Correspondence_Scan_Processing_Flow. The legacy flow's own two
   packages were removed with release 31 (2026-10-18; the flow was turned off on 2026-10-16); its references and identity
   scopes are simulated where they now run, inside the scan processing package. */
const SCANF = readdirSync(`${DIR}/identification-phase4`).find((f) => parseFlowArtifactName(f)?.flow === 'Folio_Incoming_Correspondence_Scan_Processing_Flow');
ok(!!SCANF, 'ITEM-80: the scan processing package exists');
ok(!readdirSync(`${DIR}/identification-phase4`).some((f) => parseFlowArtifactName(f)?.flow === 'DGSO_INCOMING_AI_PROCESSING'), 'the legacy DGSO INCOMING AI PROCESSING packages are not released');
const SCANPKG = J(`${DIR}/identification-phase4/${SCANF}`);
const scopeOf = (n) => ({ nodeId: n, serializedValue: { ...SCANPKG.serializedValue.actions[n], runAfter: {} }, allConnectionData: SCANPKG.allConnectionData, staticResults: {}, isScopeNode: true });
const LREF = scopeOf('Scope_References');
const LID = scopeOf('Scope_Library_Identity');
if (SCANF) {
  const SC = SCANPKG;
  staticChecks(SC, LIBCAP, 'SCAN_PROCESSING', [LIBCAP, SACAP]);
  const t = JSON.stringify(SC.serializedValue);
  const A = SC.serializedValue.actions;
  ok(!/triggerOutputs\(\)/.test(t), 'SCAN_PROCESSING: nothing reads the old trigger (triggerOutputs); the file comes from triggerBody() and Get_Trigger_Document_Content');
  ok(!/AIza[0-9A-Za-z_-]{30,}/.test(t), 'SCAN_PROCESSING: no AI service key is written in the flow');
  ok(!/FLM_|Scope_Flow_Definition_Email|shared_flowmanagement/.test(t), 'SCAN_PROCESSING: the flow does not mail its own definition');
  ok(!/shared_(onedriveforbusiness|sharepointonline)_\d/.test(t), 'SCAN_PROCESSING: one OneDrive and one SharePoint connection, no second account');
  ok(!/CREATE_COPY_OF_TRIGGER_DOCUMENT|Move_or_rename_a_file|Documente Volume II/.test(t), 'SCAN_PROCESSING: no copy into another person\'s OneDrive');
  const firsts = Object.entries(A).filter(([, a]) => !a.runAfter || !Object.keys(a.runAfter).length).map(([n]) => n);
  ok(firsts.length === 1 && firsts[0] === 'Get_Trigger_Document_Content', 'SCAN_PROCESSING: the document content is read before anything else', firsts.join(', '));
  ok(A.Scope_Library_Identity?.runAfter?.Preliminaries_and_Backup && A.Scope_Processing?.runAfter?.Scope_Library_Identity, 'SCAN_PROCESSING: the record is registered after the DGO DIGITAL OPS row and before processing');
  ok(Object.values(A).every((a) => a.type !== 'InitializeVariable'), 'SCAN_PROCESSING: variable declarations stay outside the scope');
  ok(/'GEMINI_API_KEY'/.test(t), 'SCAN_PROCESSING: the AI key is read from Flow Configuration');
}
console.log('\n  LIBRARY INTAKE simulated runs\n');
{
  ok(!/AIza[0-9A-Za-z_-]{30,}/.test(JSON.stringify(LREF)), 'no AI service key is written in the references scope');
  const cfgRows = [{ ID: 1, Title: 'GEMINI_API_KEY', ConfigValue: 'key-one' }, { ID: 2, Title: 'GEMINI_API_KEY_2', ConfigValue: 'key-two' }, { ID: 3, Title: 'NOTIFY_REGISTRY_TO', ConfigValue: 'Registry@nitda.gov.ng' }];
  const runRefs = (rows) => {
    const sp = sharepoint({ '9bc168c3-06e5-4d58-982b-0df06205fd35': rows }, { lenientFilters: ['9bc168c3-06e5-4d58-982b-0df06205fd35'] });
    const sim = new Simulator({ variables: declaredVariables(LIBCAP), connectors: sp.connectors, clock: () => NOW, workflow: { name: 'b6d92bae-591e-fa1e-52eb-b350cad988a7', run: { name: 'RUN-L' } }, trigger: { startTime: NOW, outputs: { body: 'binary', headers: {} } } });
    sim.declare(LREF).run(LREF);
    return sim;
  };
  const r1 = runRefs(cfgRows);
  ok(failedSteps(r1).length === 0 && r1.global.get('Compose_API_Key')?.outputs === 'key-one' && r1.global.get('Compose_API_Key_2')?.outputs === 'key-two', 'the AI keys come from Flow Configuration: GEMINI_API_KEY and GEMINI_API_KEY_2', failedSteps(r1).join(' | '));
  const r2 = runRefs(cfgRows.filter((r) => r.Title !== 'GEMINI_API_KEY_2'));
  ok(r2.global.get('Compose_API_Key_2')?.outputs === 'key-one', 'without GEMINI_API_KEY_2 the second key is GEMINI_API_KEY');

  const LT = { REG: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667', SEQ: 'd95409a4-2b48-4d34-9f60-da5d27db862d', OPS: '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3', MAP: 'b25086d4-15da-493a-b45e-a8d068dc6220' };
  const lcfg = CONFIG.map((r) => (r.Title === 'DATASET_IDENTITY_MAP_LIST_ID' ? { ...r, ConfigValue: LT.MAP } : r.Title === 'DATASET_IDENTITY_MAP_SITE_URL' ? { ...r, ConfigValue: 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE' } : r));
  const PRIOR = { Get_Trigger_Document_Metadata: { status: 'Succeeded', outputs: { statusCode: 200, body: { Name: 'Letter from NCC.pdf', Id: '01ABCDEF' } } }, CREATE_MAIN_ITEM_IN_DDOPS: { status: 'Succeeded', outputs: { statusCode: 201, body: { ID: 22109, Title: 'Letter from NCC.pdf' } } } };
  const runId = (seed, opts = {}) => {
    const sp = sharepoint({ '9bc168c3-06e5-4d58-982b-0df06205fd35': cfgRows, [LT.OPS]: [{ ID: 22109, Title: 'Letter from NCC.pdf' }], ...seed }, { config: lcfg, lenientFilters: ['9bc168c3-06e5-4d58-982b-0df06205fd35', LT.MAP, LT.REG], columns: { [LT.OPS]: new Set(['EntityKey', 'ReferenceId', 'IdState']) }, ...opts });
    const sim = new Simulator({ variables: declaredVariables(LIBCAP), connectors: sp.connectors, clock: () => NOW, prior: PRIOR, workflow: { name: 'b6d92bae-591e-fa1e-52eb-b350cad988a7', run: { name: 'RUN-L2' } }, trigger: { startTime: NOW, outputs: { body: 'binary', headers: {} } } });
    sim.declare(LID).run(LID);
    return { sim, db: sp.db };
  };
  const { sim, db } = runId({ [LT.SEQ]: [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 21 }] });
  const rec = (db[LT.REG] || [])[0] || {}; const opsRow = db[LT.OPS][0]; const loc = (db[LT.MAP] || [])[0] || {};
  ok(failedSteps(sim).length === 0 && sim.global.get('Scope_Library_Identity')?.status === 'Succeeded', 'the identity scope runs with no template error and ends Succeeded', failedSteps(sim).join(' | ').slice(0, 400));
  ok(rec.ReferenceId === 'NITDA-2026-00022' && rec.Channel === 'library' && rec.Subject === 'Letter from NCC.pdf' && rec.SenderEmail === 'registry@nitda.gov.ng' && rec.IdState?.Value === 'ACTIVE' && rec.SourceLocator === `spo:${LT.OPS}/22109`,
    'S7: the document is registered in Portal Registry as NITDA-2026-00022, channel library, with its DGO DIGITAL OPS row as source', JSON.stringify(rec).slice(0, 400));
  ok(opsRow.EntityKey === rec.EntityKey && opsRow.ReferenceId === 'NITDA-2026-00022' && opsRow.IdState === 'ACTIVE' && !('Rev' in opsRow), 'the DGO DIGITAL OPS row carries the record\'s EntityKey, ReferenceId and IdState (no Rev: the list has none)', JSON.stringify(opsRow));
  ok(loc.Kind === 'SPO_ITEM' && loc.EntryKind === 'LOCATOR' && loc.Value === '22109' && loc.MatchKey === `LOCATOR|SPO_ITEM|${LT.OPS}|22109` && loc.EntityRef === `REC:${rec.EntityKey}`, 'the row is the record\'s SPO_ITEM locator in DGO_IdentityMap', JSON.stringify(loc).slice(0, 300));
  const noNum = runId({ [LT.SEQ]: [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 21 }] }, { claimHook: (row, d, t) => { if (t === LT.SEQ) row['odata.etag'] = `"x${Math.random()}"`; } });
  ok(noNum.sim.global.get('Scope_Library_Identity')?.status === 'Succeeded' && !(noNum.db[LT.REG] || []).length && !noNum.db[LT.OPS][0].EntityKey, 'when no number can be claimed nothing is written and the scope still ends Succeeded, so the AI processing runs');
  const noRec = runId({ [LT.SEQ]: [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 21 }] }, { failCreate: { [LT.REG]: true } });
  ok(noRec.sim.global.get('Scope_Library_Identity')?.status === 'Succeeded' && !noRec.db[LT.OPS][0].EntityKey && !(noRec.db[LT.MAP] || []).length && noRec.sim.global.get('Create_Void_Library')?.status,
    'when the register row cannot be written the number goes to a VOID row, the DGO DIGITAL OPS row gets no key and no locator is written; the scope still ends Succeeded', `scope ${noRec.sim.global.get('Scope_Library_Identity')?.status} void ${noRec.sim.global.get('Create_Void_Library')?.status} map ${(noRec.db[LT.MAP] || []).length}`);
}

/* ---------------------------------------------------------------- G-04: caller from the sign-in proof */
console.log('\n  G-04 caller identity (IDENTITY_PROOF_REQUIRED)\n');
{
  const CFGT = '9bc168c3-06e5-4d58-982b-0df06205fd35', LEDGER = PROOF_LIST, DIRU = '3d591f5b-3f2f-409c-983a-a77b5c174834', ROLES = 'f675598b-271d-4200-8d75-2597aad4057f';
  const ON = [{ ID: 90, Title: 'IDENTITY_PROOF_REQUIRED', ConfigValue: 'true' }];
  const LEDGER_ROWS = [{ ID: 1, Title: 'tok-officer', Consumed: 0, Purpose: 'internal-session', Email: 'Officer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' },
    { ID: 2, Title: 'tok-expired', Consumed: 0, Purpose: 'internal-session', Email: 'officer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T08:00:00Z' },
    { ID: 3, Title: 'tok-viewer', Consumed: 0, Purpose: 'internal-session', Email: 'viewer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' }];
  /* Role is a Choice column: the connector returns it as an object. */
  const DIR_ROWS = [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: { Value: 'operator' }, UserId: 'e1fa0000-0000-4000-8000-000000000001' }, { ID: 2, Email: 'viewer@nitda.gov.ng', Status: 'active', Role: { Value: 'viewer' }, UserId: 'e1fa0000-0000-4000-8000-000000000003' }];
  const ROLE_ROWS = [{ ID: 1, RoleId: 'operator', Active: 1, AllowedRoutesJson: '["single-assignment","bulk-assignment","correspondence","registry","orchestrator","activities"]', PermissionsJson: '["user:view"]' }, { ID: 2, RoleId: 'viewer', Active: 1, AllowedRoutesJson: '["home"]', PermissionsJson: '[]' }];
  const GOV = { [CFGT]: ON, [LEDGER]: LEDGER_ROWS, [DIRU]: DIR_ROWS, [ROLES]: ROLE_ROWS };
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const forged = { ...ASK, userEmail: 'dg@nitda.gov.ng' };
  const seedSA = () => ({ ...GOV, [L.DOCS]: [structuredClone(DOC)], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 500 }] });
  const lf = { lenientFilters: [L.DOCS, L.GTQ, L.DEPTS, CFGT, DIRU, ROLES] };
  const sa0 = runSA(seedSA(), forged, { ...lf });
  ok(sa0.r.statusCode === 401 && !(sa0.db[L.GTQ] || []).length && sa0.db[L.SEQ][0].CurrentSequence === 500, 'SINGLE: with the switch on and no proof, 401 and nothing claimed or written', `${sa0.r.statusCode}`);
  const sa1 = runSA(seedSA(), forged, { ...lf, headers: bearer('tok-officer') });
  ok(sa1.r.statusCode === 200 && sa1.db[L.GTQ]?.[0]?.AssignedBy === 'officer@nitda.gov.ng', 'SINGLE: a valid proof is the caller (AssignedBy the proof\'s address), whatever userEmail the body names', `${sa1.r.statusCode} ${sa1.db[L.GTQ]?.[0]?.AssignedBy}`);
  const sa2 = runSA(seedSA(), forged, { ...lf, headers: bearer('tok-expired') });
  ok(sa2.r.statusCode === 401 && !(sa2.db[L.GTQ] || []).length, 'SINGLE: an expired proof is no proof (401)');
  const sa3 = runSA(seedSA(), forged, { ...lf, headers: bearer('tok-viewer') });
  ok(sa3.r.statusCode === 403 && !(sa3.db[L.GTQ] || []).length && JSON.stringify(sa3.r.body).includes('does not allow assignments'), 'SINGLE: a role without single-assignment is refused (403), its Role read from the choice', `${sa3.r.statusCode}`);
  const saOff = runSA({ [L.DOCS]: [structuredClone(DOC)], [L.SEQ]: [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 500 }] }, forged);
  ok(saOff.r.statusCode === 200 && saOff.db[L.GTQ]?.[0]?.AssignedBy === 'dg@nitda.gov.ng', 'SINGLE: with the switch off the flow answers as today (the body\'s userEmail)');

  const ba0 = runBA({ ...GOV, [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(30) }, BULK(['312']));
  ok(ba0.r.statusCode === 401 && ba0.r.body?.data?.error === 'unauthenticated' && !(ba0.db[L.GTQ] || []).length && ba0.db[L.SEQ][0].CurrentSequence === 30, 'BULK: with the switch on and no proof, 401 and no number claimed', `${ba0.r.statusCode} ${JSON.stringify(ba0.r.body?.data)}`);
  const ba1 = runBA({ ...GOV, [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(30) }, { ...BULK(['312', '313']), requestedBy: 'dg@nitda.gov.ng' }, { headers: bearer('tok-officer') });
  ok(ba1.r.statusCode === 202 && ba1.r.body?.request?.requestedBy === 'officer@nitda.gov.ng' && ba1.db[L.GTQ].every((t) => t.AssignedBy === 'officer@nitda.gov.ng'), 'BULK: with a valid proof the batch runs and its requester is the proof\'s address, not requestedBy', `${ba1.r.statusCode} ${ba1.r.body?.request?.requestedBy}`);
  const ba2 = runBA({ ...GOV, [L.DOCS]: structuredClone(DOCS3), [L.SEQ]: SEQ(30) }, BULK(['312']), { headers: bearer('tok-viewer') });
  ok(ba2.r.statusCode === 403 && ba2.r.body?.data?.error === 'forbidden', 'BULK: a role without bulk-assignment is refused (403)');

}

/* ---------------------------------------------------------------- EMAIL_RELATED_TASK */
{
  const { openZip } = await import('../scripts/lib/zip-reader.mjs');
  const EXP = readdirSync('docs/folio-Master-Flows-and-Endpoints/exports').find((f) => parseFlowArtifactName(f)?.flow === 'IP_Create_Task_for_received_Email_Endpoint');
  const def = JSON.parse(openZip(`docs/folio-Master-Flows-and-Endpoints/exports/${EXP}`).members.find((m) => /definition\.json$/.test(m.name) && m.name.includes('/flows/')).read().toString('utf8'));
  const EMCAP = { Definition: def.properties.definition };
  const EM = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Create__Task__for_received_Email_Endpoint', 'paste.json'));
  staticChecks(EM, EMCAP, 'EMAIL_RELATED_TASK', [EMCAP, SACAP]);
  /* The flow's own copies (its export and the 3f2f649b deployed definition) prove nothing about a function: a function only
     this flow uses (it called type(), which is not a workflow expression function) must be proven by another flow. */
  {
    const others = new Set();
    for (const f of readdirSync('docs/folio-Master-Flows-and-Endpoints/contracts/deployed')) {
      if (f.includes('3f2f649b') || f.includes('ab1a3555')) continue;
      const t = readFileSync(`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/${f}`, 'utf8');
      if (t.includes('a0000000-0000-4000-8000-')) continue;
      try { fnsOf(JSON.parse(t), others); } catch { /* not JSON */ }
    }
    for (const p of Object.values(conformancePackages)) fnsOf(p, others);
    fnsOf(J(`${DIR}/identification-phase2/Scope_Phase2_ClaimTest_Flow.paste.json`), others);
    for (const [fn, files] of Object.entries(JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/tenant-function-proof.json', 'utf8')).functions)) if (files.some((f) => !f.includes('3f2f649b'))) others.add(fn);
    const own = [...fnsOf(EM, new Set())].filter((f) => !others.has(f));
    ok(!own.length, 'EMAIL_RELATED_TASK: every function is proven by a flow other than this one', own.join(', '));
  }
  console.log('\n  EMAIL_RELATED_TASK simulated runs\n');
  const MIRROR = '22c4e38d-5040-4e0f-aa47-dd3aa3f28abf';
  const T = { REG: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667', MAP: 'b25086d4-15da-493a-b45e-a8d068dc6220' };
  const ecfg = CONFIG.map((r) => (r.Title === 'DATASET_IDENTITY_MAP_LIST_ID' ? { ...r, ConfigValue: T.MAP } : r));
  const IMID = '<CAF3x9QmT2b@mail.example.ng>';
  const MSG = { id: 'AAMkAGI2-msg-1', subject: 'Request for budget data', webLink: 'https://outlook.office.com/mail/id/AAMkAGI2', receivedDateTime: '2026-10-04T10:00:00Z', from: 'sender@fmof.gov.ng', internetMessageId: IMID, bodyPreview: 'Please send the figures.' };
  /* The request exactly as Folio sends it: core/assignment-payload.js buildEmailTaskPayload, wrapped by core/write-manager.js and core/data-client.js. */
  const { buildEmailTaskPayload } = await import('../core/assignment-payload.js');
  const ep = buildEmailTaskPayload({ email: { id: MSG.id, subject: MSG.subject, fromAddress: MSG.from, receivedDateTime: MSG.receivedDateTime, webLink: MSG.webLink },
    form: { title: 'Send the budget figures', assignedTo: 'officer@nitda.gov.ng', category: 'Finance', categoryCode: 'FIN', subcategory: 'Budget', subcategoryCode: 'BUD', priority: 'high', due: '2026-10-12', comments: 'Reply by Friday.', copy: 'cc@nitda.gov.ng' },
    actor: { email: 'registry@nitda.gov.ng' }, referenceId: '20261005-AAMkAGI2-FIN-BUD' });
  const HASH = 'a'.repeat(64);
  const BODY = { action: 'emailtotaskassignment', payload: { operation: 'create-task-from-email', ref: ep.referenceId, ...ep, idempotencyKey: HASH, clientRequestHash: HASH }, userEmail: 'registry@nitda.gov.ng', requestId: 'client-chosen-id', timestamp: NOW };
  const runEM = (seed, body = BODY, opts = {}) => {
    const sp = sharepoint(seed, { config: ecfg, lenientFilters: [L.GTQ, MIRROR, L.DEPTS, T.REG, '9bc168c3-06e5-4d58-982b-0df06205fd35', '3d591f5b-3f2f-409c-983a-a77b5c174834', 'f675598b-271d-4200-8d75-2597aad4057f', ...Object.keys(seed).filter((k) => ![L.SEQ, T.MAP].includes(k))], ...opts });
    const connectors = { ...sp.connectors };
    for (const k of ['shared_office365', 'shared_office365-1', 'shared_office365-2']) connectors[`${k}.GetEmailV2`] = (p) => (p.messageId === MSG.id ? { body: structuredClone(MSG) } : { ok: false, statusCode: 404 });
    const sim = new Simulator({ variables: declaredVariables(EMCAP), connectors, clock: () => NOW,
      workflow: { name: 'ab1a3555-7fce-4bfe-a193-b8b84654b0a4', run: { name: 'RUN-EM' }, tags: { flowDisplayName: 'IP_Create__Task__for_received_Email_Endpoint' } },
      trigger: { outputs: { body, method: 'POST', queries: {}, headers: opts.headers || {} } } });
    sim.declare(EM).run(EM);
    return { sim, db: sp.db, r: sim.response || {} };
  };
  const SEQ416 = () => [{ ID: 7, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 416 }];
  {
    const { sim, db, r } = runEM({ [L.SEQ]: SEQ416() });
    const task = (db[L.GTQ] || [])[0] || {};
    ok(failedSteps(sim).length === 0, 'EMAIL: the run has no template error', failedSteps(sim).join(' | ').slice(0, 600));
    ok(r.statusCode === 200 && (db[L.GTQ] || []).length === 1 && !(db[MIRROR] || []).length, 'EMAIL: Folio\'s request (payload.email, flat task fields) creates one task, in Global Tracking Queue and not in DEV_OPS', `${r.statusCode} gtq ${(db[L.GTQ] || []).length} mirror ${(db[MIRROR] || []).length}`);
    ok(task.Title === 'Send the budget figures' && task.AssignedTo === 'officer@nitda.gov.ng' && task.Priority?.Value === 'High' && task.Classification === 'Finance' && task.ActivityTrackingID === MSG.id && task.OData__x0033_rdAssigned === 'cc@nitda.gov.ng',
      'EMAIL: the task carries Folio\'s title, assignee, priority (High), category, copy list and the e-mail\'s id', JSON.stringify(task).slice(0, 600));
    ok(task.TaskRef === 'TASK-2026-00417' && task.Reference_ID === 'TASK-2026-00417' && task.EntityKey && task.IdState?.Value === 'ACTIVE' && task.Rev === 1 && task.TaskTypeChoice?.Value === 'Standard Task' && task.ClientRequestHash === HASH,
      'EMAIL: TASK-2026-00417 in TaskRef and Reference_ID, with EntityKey, IdState, Rev, task type and ClientRequestHash in the one create', JSON.stringify(task).slice(0, 600));
    ok(task.ParentKey === '' && task.RootRef === '', 'EMAIL: an e-mail no one has registered gives the task no parent');
    ok(task.AssignedBy === 'registry@nitda.gov.ng' && task.CorrelationId && task.CorrelationId !== 'client-chosen-id' && r.body?.request?.requestId === task.CorrelationId && r.body?.data?.taskRef === 'TASK-2026-00417',
      'EMAIL: the run mints its own Request ID, stores it on the task and returns it with data.taskRef', JSON.stringify(r.body?.request).slice(0, 300));
    const mails = JSON.stringify(db.mail || []);
    ok(mails.includes('TASK-2026-00417') && !mails.includes('-EML-') && !mails.includes(`TASK-${task.ID}`), 'EMAIL: the officer\'s e-mail and its acknowledgement link show TASK-2026-00417, not the composite or TASK-<item ID>');
    ok(db[L.SEQ][0].CurrentSequence === 417, 'EMAIL: the TASK counter advances on its own row');
    /* ITEM-50 / ITEM-52 (owner decision, 2026-10-06) */
    const sent = db.mail || [];
    ok(sent.length >= 1 && sent.every((m) => m['emailMessage/To'] === 'officer@nitda.gov.ng' && m['emailMessage/Cc'] === 'cc@nitda.gov.ng'),
      'EMAIL: the task notifications go to the assigned officer, with the copy list in Cc (ITEM-50)', JSON.stringify(sent.map((m) => [m['emailMessage/To'], m['emailMessage/Cc']])));
    ok(!JSON.stringify(EM).includes('hkani@') && !sent.some((m) => /Diagnostics|NITDA AUDIT/.test(String(m['emailMessage/Subject']))),
      'EMAIL: no send to a fixed person, no diagnostics mail and no audit mail (ITEM-52)');
    ok(sent.length === 1, 'EMAIL: one task sends its officer one notice, not two (tenant defect 2026-10-12)', String(sent.length));
  }
  {
    const KEY = 'f84fcbc6-9dcf-4a95-8ffd-b238b4267974';
    const { db } = runEM({ [L.SEQ]: SEQ416(), [T.MAP]: [{ ID: 3, EntryKind: 'LOCATOR', Kind: 'EXO_INTERNET_MESSAGE_ID', Value: IMID, EntityRef: `REC:${KEY}`, IdState: { Value: 'ACTIVE' } }], [T.REG]: [{ ID: 12, EntityKey: KEY, ReferenceId: 'NITDA-2026-00012' }] });
    const task = (db[L.GTQ] || [])[0] || {};
    ok(task.ParentKey === `REC:${KEY}` && task.RootKey === task.ParentKey && task.RootRef === 'NITDA-2026-00012', 'EMAIL: a registered e-mail (its EXO_INTERNET_MESSAGE_ID locator in DGO_IdentityMap) makes the task a child of its record, RootRef NITDA-2026-00012', JSON.stringify(task).slice(0, 300));
    ok(!(db[T.MAP] || []).some((x) => String(x.EntityRef).startsWith('TSK:')), 'EMAIL: no map entry is written for the task');
  }
  {
    const { db, r } = runEM({ [L.SEQ]: SEQ416() }, BODY, { claimHook: (row, d, t) => { if (t === L.SEQ) row['odata.etag'] = `"x${Math.random()}"`; } });
    ok(!(db[L.GTQ] || []).length && db[L.SEQ][0].CurrentSequence === 416 && r.statusCode >= 400, 'EMAIL: when no TASK number can be claimed no task is created and the reply is a failure', `${r.statusCode}`);
  }
  {
    const { db, r } = runEM({ [L.SEQ]: SEQ416() }, { ...BODY, payload: { ...BODY.payload, email: {}, sourceEmailId: '' } });
    ok(r.statusCode === 400 && !(db[L.GTQ] || []).length && db[L.SEQ][0].CurrentSequence === 416, 'EMAIL: a request without an e-mail id is refused (400) before any number is claimed');
  }
  {
    const legacy = { action: 'emailtotaskassignment', userEmail: 'registry@nitda.gov.ng', Email: { id: MSG.id }, NewActivityTask: { Title: 'Legacy shape', AssignedTo: 'officer@nitda.gov.ng', Priority: 'Normal', Status: 'New', Category: 'Admin' } };
    const { db, r } = runEM({ [L.SEQ]: SEQ416() }, legacy);
    ok(r.statusCode === 200 && db[L.GTQ]?.[0]?.Title === 'Legacy shape' && db[L.GTQ][0].TaskRef === 'TASK-2026-00417', 'EMAIL: the top-level form the flow was built for still works', `${r.statusCode}`);
  }
  {
    const GOVE = { '9bc168c3-06e5-4d58-982b-0df06205fd35': [{ ID: 90, Title: 'IDENTITY_PROOF_REQUIRED', ConfigValue: 'true' }] };
    const { db, r } = runEM({ ...GOVE, [L.SEQ]: SEQ416() });
    ok(r.statusCode === 401 && !(db[L.GTQ] || []).length && db[L.SEQ][0].CurrentSequence === 416, 'EMAIL: with IDENTITY_PROOF_REQUIRED and no proof, 401 and nothing claimed or written', `${r.statusCode}`);
  }
}

/* ---------------------------------------------------------------- OTP_VERIFY: the proof mint (G-04) */
const OT = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_OTP_VERIFY', 'paste.json'));
const OTCAP = capture('IP_OTP_VERIFY');
staticChecks(OT, OTCAP, 'OTP_VERIFY');
console.log('\n  OTP_VERIFY simulated runs\n');
{
  const OTP = '9421d473-8906-43b7-a41f-a213046683c1', DIRU = '3d591f5b-3f2f-409c-983a-a77b5c174834', LEDGER = PROOF_LIST;
  const code = (email) => ({ [OTP]: [{ ID: 5, Title: email, OTP_Code: '123456', Is_Verified: 0, Attempts: 0, Expires_At: '2026-10-05T09:05:00Z' }] });
  const officer = { [DIRU]: [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', FullName: 'An Officer', Role: { Value: 'operator' }, AccessScope: 'department' }] };
  const runOT = (seed, body) => {
    const sp = sharepoint(seed, { config: CONFIG, lenientFilters: ['9bc168c3-06e5-4d58-982b-0df06205fd35'] });
    const sim = new Simulator({ variables: declaredVariables(OTCAP), connectors: sp.connectors, clock: () => NOW,
      workflow: { name: '4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61', run: { name: 'RUN-OT' }, tags: { flowDisplayName: 'IP_OTP_VERIFY' } },
      trigger: { startTime: NOW, outputs: { body, method: 'POST', queries: {}, headers: {} } } });
    sim.declare(OT).run(OT);
    return { sim, r: sim.response || {}, db: sp.db };
  };
  const ask = { action: 'verify', identifier: 'officer@nitda.gov.ng', otp_code: '123456' };
  {
    const { sim, r, db } = runOT({ ...code('officer@nitda.gov.ng'), ...officer }, ask);
    const d = r.body?.data || {};
    const row = (db[LEDGER] || [])[0] || {};
    ok(failedSteps(sim).length === 0 && r.statusCode === 200, 'OTP_VERIFY: a correct code from an active directory user runs with no template error and answers 200', `${r.statusCode} ${failedSteps(sim).join(' | ').slice(0, 300)}`);
    ok(typeof d === 'object' && d.ok === true && /^[0-9a-f-]{36}$/.test(d.token || ''), 'OTP_VERIFY: the reply\'s data is an object carrying the minted token (core/otp-identity.js reads data.token)', JSON.stringify(d).slice(0, 300));
    ok(row.Title === d.token && row.Purpose === 'internal-session' && row.Consumed === false && row.Email === 'officer@nitda.gov.ng', 'OTP_VERIFY: the proof ledger holds the token, Purpose internal-session, unconsumed, for the directory address', JSON.stringify(row).slice(0, 300));
    ok(d.expiresAt === row.ExpiresAtUtc && Date.parse(d.expiresAt) - Date.parse(NOW) === 4 * 3600 * 1000, 'OTP_VERIFY: the reply and the ledger row carry one expiry, 4 hours ahead (AUTHENTICATION_CONTRACT.md §2a)', `${d.expiresAt} / ${row.ExpiresAtUtc}`);
    ok(d.claims?.role === 'operator' && d.claims.roles?.[0] === 'operator' && d.claims.email === 'officer@nitda.gov.ng' && d.claims.name === 'An Officer', 'OTP_VERIFY: the claims are the directory row\'s, its Role read from the choice', JSON.stringify(d.claims));
    ok(db[OTP][0].Is_Verified === true, 'OTP_VERIFY: the code is burned on its first successful use');
  }
  {
    const { r, db } = runOT(code('visitor@example.com'), { ...ask, identifier: 'visitor@example.com' });
    ok(r.statusCode === 401 && r.body?.data?.reason === 'NOT_A_DIRECTORY_USER' && !(db[LEDGER] || []).length, 'OTP_VERIFY: a correct code from an address that is not an active directory user gets 401 and no proof', `${r.statusCode} ${JSON.stringify(r.body?.data)}`);
  }
  {
    const { r, db } = runOT({ ...code('officer@nitda.gov.ng'), ...officer }, { ...ask, otp_code: '000000' });
    ok(r.statusCode >= 400 && !(db[LEDGER] || []).length && typeof r.body?.data === 'object', 'OTP_VERIFY: a wrong code mints nothing and still answers with an object', `${r.statusCode} ${JSON.stringify(r.body?.data).slice(0, 200)}`);
  }
  {
    /* Tenant defect (8 October 2026): with no code issued for the address, Update_item_Attempts had no row to count against
       and the flow answered 500. It answers as a wrong code does, writes nothing, and says nothing about the address. */
    const none = runOT({ ...officer }, { ...ask, identifier: 'nobody@nitda.gov.ng', otp_code: '000000' });
    const wrong = runOT({ ...code('officer@nitda.gov.ng'), ...officer }, { ...ask, otp_code: '000000' });
    ok(failedSteps(none.sim).length === 0 && none.r.statusCode === wrong.r.statusCode && none.r.statusCode >= 400 && none.r.statusCode < 500 && !(none.db[LEDGER] || []).length,
      'OTP_VERIFY: an address with no code issued answers as a wrong code does (no 500, nothing written)', `${none.r.statusCode} vs ${wrong.r.statusCode} ${failedSteps(none.sim).join(' | ').slice(0, 200)}`);
    const capped = runOT({ [OTP]: [{ ID: 5, Title: 'officer@nitda.gov.ng', OTP_Code: '123456', Is_Verified: 0, Attempts: 5, Expires_At: '2026-10-05T09:05:00Z' }], ...officer }, { ...ask, otp_code: '000000' });
    ok(capped.r.statusCode === 429, 'OTP_VERIFY: the sixth guess against an issued code answers 429', String(capped.r.statusCode));
  }
}

/* ---------------------------------------------------------------- OTP_GENERATE: codes only for directory users */
console.log('\n  OTP_GENERATE simulated runs\n');
{
  const OG = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_OTP_GENERATE', 'paste.json'));
  const OTP = '9421d473-8906-43b7-a41f-a213046683c1', DIRU = '3d591f5b-3f2f-409c-983a-a77b5c174834';
  const officer = { [DIRU]: [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', FullName: 'An Officer', Role: { Value: 'operator' } },
    { ID: 2, Email: 'gone@nitda.gov.ng', Status: 'disabled', FullName: 'Gone', Role: { Value: 'viewer' } }] };
  const runOG = (identifier) => {
    const sp = sharepoint({ ...officer }, { config: CONFIG, lenientFilters: ['9bc168c3-06e5-4d58-982b-0df06205fd35'] });
    const sim = new Simulator({ variables: declaredVariables(OTCAP), connectors: sp.connectors, clock: () => NOW,
      workflow: { name: 'e5632336-641f-4b9b-bd93-99185b5eb975', run: { name: 'RUN-OG' }, tags: { flowDisplayName: 'IP_OTP_GENERATE' } },
      trigger: { startTime: NOW, outputs: { body: { action: 'generate', identifier }, method: 'POST', queries: {}, headers: {} } } });
    sim.declare(OG).run(OG);
    return { sim, r: sim.response || {}, db: sp.db };
  };
  const known = runOG('Officer@nitda.gov.ng');
  ok(failedSteps(known.sim).length === 0 && known.r.statusCode === 200 && (known.db[OTP] || []).length === 1 && (known.db.mail || []).length === 1,
    'OTP_GENERATE: an active directory user gets a code row and one e-mail, and 200', `${known.r.statusCode} rows ${(known.db[OTP] || []).length} mail ${(known.db.mail || []).length} ${failedSteps(known.sim).join(' | ').slice(0, 300)}`);
  for (const who of ['visitor@example.com', 'gone@nitda.gov.ng', '']) {
    const x = runOG(who);
    ok(failedSteps(x.sim).length === 0 && !(x.db[OTP] || []).length && !(x.db.mail || []).length && x.r.statusCode === known.r.statusCode,
      `OTP_GENERATE: ${who || 'an empty address'} gets no code and no e-mail, and the same status as a user`, `${x.r.statusCode} rows ${(x.db[OTP] || []).length} mail ${(x.db.mail || []).length} ${failedSteps(x.sim).join(' | ').slice(0, 300)}`);
    const strip = (d) => JSON.stringify({ ...d, request_id: undefined });
    ok(strip(x.r.body?.data) === strip(known.r.body?.data), `OTP_GENERATE: the reply to ${who || 'an empty address'} is the reply a user gets`, `${strip(x.r.body?.data)} vs ${strip(known.r.body?.data)}`);
  }
}

/* ---------------------------------------------------------------- ITEM-76: the remaining internal endpoints */
console.log('\n  REFERENCE_DATA, GET_DOCS, FETCH_EMAIL_ATTACHMENTS, EMAIL and AI (G-04, ITEM-76)\n');
{
  const CFGT = '9bc168c3-06e5-4d58-982b-0df06205fd35', LEDGER = PROOF_LIST, DIRU = '3d591f5b-3f2f-409c-983a-a77b5c174834', ROLES = 'f675598b-271d-4200-8d75-2597aad4057f';
  const CATS = 'f64c8b65-c921-46e9-8814-a8cef61f6016', DEPS = '8aab9c4e-001f-4e32-862c-8a50e750f04e', TEL = '726c210d-09d5-45d9-952d-7a506b644b13', RECEIPTS = '88a81ca1-319a-45f5-8409-f91a24538ffa';
  const ON = [{ ID: 90, Title: 'IDENTITY_PROOF_REQUIRED', ConfigValue: 'true' }];
  const LEDGER_ROWS = [{ ID: 1, Title: 'tok-officer', Consumed: 0, Purpose: 'internal-session', Email: 'officer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' },
    { ID: 2, Title: 'tok-viewer', Consumed: 0, Purpose: 'internal-session', Email: 'viewer@nitda.gov.ng', ExpiresAtUtc: '2026-10-05T12:00:00Z' }];
  const DIR_ROWS = [
    { ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: { Value: 'operator' }, Persona: { Value: 'Registry' }, FullName: 'An Officer', UserId: 'u1', Directorate: 'DGO', Department: 'Registry', AccessScope: 'agency', PilotCohort: 'A' },
    { ID: 2, Email: 'viewer@nitda.gov.ng', Status: 'active', Role: { Value: 'viewer' }, Persona: 'Staff', FullName: 'A Viewer', UserId: 'u2', Directorate: 'DGO', Department: 'HR', AccessScope: 'self', PilotCohort: 'B' }];
  const ROLE_ROWS = [{ ID: 1, RoleId: 'operator', Active: 1, AllowedRoutesJson: '["registry"]', PermissionsJson: '["user:view"]' }, { ID: 2, RoleId: 'viewer', Active: 1, AllowedRoutesJson: '["home"]', PermissionsJson: '[]' }];
  const REF = { [CATS]: [{ ID: 1, Title: 'Budget', field_1: 'BUD', field_2: 'Annual', field_3: 'ANN', field_4: 'FIN', field_14: 'High', field_9: '5' }],
    [DEPS]: [{ ID: 1, Title: 'Finance', field_1: 'FIN', field_2: 'fin@nitda.gov.ng', field_3: 'head.fin@nitda.gov.ng', field_6: 'Director' }] };
  const bearer = (t) => ({ Authorization: `Bearer ${t}` });
  const lenient = [CFGT, DIRU, ROLES, CATS, DEPS, TEL, RECEIPTS, L.DOCS];
  const run = (PKG, CAP, flow, { seed = {}, body = {}, headers = {}, extra = {} } = {}) => {
    const sp = sharepoint(seed, { config: CONFIG, lenientFilters: lenient });
    const sim = new Simulator({ variables: { ...declaredVariables(CAP), varRequestId: 'client-supplied' }, connectors: { ...sp.connectors, ...extra }, clock: () => NOW,
      workflow: { name: flow, run: { name: `RUN-${flow.slice(0, 4)}` }, tags: { flowDisplayName: flow } },
      trigger: { startTime: NOW, outputs: { body, method: 'POST', queries: {}, headers } } });
    sim.declare(PKG).run(PKG);
    return { sim, r: sim.response || {}, db: sp.db };
  };
  const GOV = { [CFGT]: ON, [LEDGER]: LEDGER_ROWS, [DIRU]: DIR_ROWS, [ROLES]: ROLE_ROWS };
  const OPEN = { [DIRU]: DIR_ROWS, [ROLES]: ROLE_ROWS };
  const status = (r) => r.statusCode ?? r.body?.status?.http;
  const dataOf = (r) => r.body?.data || {};

  /* REFERENCE_DATA */
  const RD = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Reference_Data_Endpoint', 'paste.json'));
  const RDCAP = capture('IP_Reference_Data_Endpoint');
  staticChecks(RD, RDCAP, 'REFERENCE_DATA');
  const rd = (seed, body, headers) => run(RD, RDCAP, 'IP_Reference_Data_Endpoint', { seed: { ...REF, ...seed }, body: { action: 'lookups', ...body }, headers });
  {
    const a = rd(OPEN, { userEmail: 'officer@nitda.gov.ng' });
    const d = dataOf(a.r);
    ok(failedSteps(a.sim).length === 0 && status(a.r) === 200, 'REFERENCE_DATA: the read runs with no template error and answers 200', `${status(a.r)} ${failedSteps(a.sim).join(' | ').slice(0, 300)}`);
    ok(JSON.stringify(a.r.body || {}).includes(a.sim.variables?.varRequestId || '§') && a.sim.variables?.varRequestId !== 'client-supplied', 'REFERENCE_DATA: the run\'s requestId is its own, not the one the client sent', a.sim.variables?.varRequestId);
    const v = (d.users || []).find((u) => u.Email === 'viewer@nitda.gov.ng') || {};
    ok(v.Role === 'viewer' && v.Persona === 'Staff' && v.Status === 'active' && v.AccessScope === 'self', 'REFERENCE_DATA: a holder of user:view gets every row in full, Role, Persona and Status as text', JSON.stringify(v));
    ok(d.departments?.[0]?.DSU_KEY === 'FIN' && d.departments[0].DSU_HeadEmail === 'head.fin@nitda.gov.ng' && d.categories?.[0]?.['Category Code'] === 'BUD' && d.categories[0].DSU_KEY === 'FIN', 'REFERENCE_DATA: departments and categories are read by their field_N internal names', JSON.stringify({ dep: d.departments?.[0], cat: d.categories?.[0] }).slice(0, 300));
    ok(d.limits?.users === 5000, 'REFERENCE_DATA: the directory is read to 5,000 rows', JSON.stringify(d.limits));
  }
  {
    const b = rd(OPEN, { userEmail: 'viewer@nitda.gov.ng' });
    const users = dataOf(b.r).users || [];
    const self = users.find((u) => u.Email === 'viewer@nitda.gov.ng') || {}, other = users.find((u) => u.Email === 'officer@nitda.gov.ng') || {};
    ok(status(b.r) === 200 && users.length === 2 && other.FullName === 'An Officer' && other.Department === 'Registry' && other.Role === null && other.AccessScope === null && other.PilotCohort === null,
      'REFERENCE_DATA: without user:view every user is listed by name, e-mail, directorate and department, with Role and the rest null', JSON.stringify(other));
    ok(self.Role === 'viewer' && self.AccessScope === 'self', 'REFERENCE_DATA: the caller\'s own row is served in full', JSON.stringify(self));
  }
  {
    const anon = rd(OPEN, {});
    ok(status(anon.r) === 200, 'REFERENCE_DATA: with the switch off the flow answers as today, even with no caller (the gate it had was hard-coded to pass)', `${status(anon.r)}`);
    const anonUsers = dataOf(anon.r).users || [];
    ok(anonUsers.length === 2 && anonUsers.every((u) => u.Role === null), 'REFERENCE_DATA: and a caller with no user:view gets no roles', JSON.stringify(anonUsers).slice(0, 200));
    const c0 = rd(GOV, { userEmail: 'officer@nitda.gov.ng' });
    ok(status(c0.r) === 401 && !dataOf(c0.r).users, 'REFERENCE_DATA: with the switch on and no proof, 401 and no directory, whatever userEmail the body names', `${status(c0.r)} ${JSON.stringify(dataOf(c0.r)).slice(0, 200)}`);
    const c1 = rd(GOV, { userEmail: 'viewer@nitda.gov.ng' }, bearer('tok-officer'));
    ok(status(c1.r) === 200 && (dataOf(c1.r).users || []).every((u) => u.Role !== null), 'REFERENCE_DATA: with a valid proof the caller is the proof\'s address (an operator\'s full directory), not the body\'s', `${status(c1.r)}`);
  }

  /* GET_DOCS */
  const GD = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Get_Docs_Endpoint', 'paste.json'));
  const GDCAP = capture('IP_Get_Docs_Endpoint');
  staticChecks(GD, GDCAP, 'GET_DOCS');
  {
    const docs = { [L.DOCS]: [{ ID: 312, Title: 'Letter', RefIDD: 'NITDA-2026-00011', Status: { Value: 'Treated' } }] };
    const g0 = run(GD, GDCAP, 'IP_Get_Docs_Endpoint', { seed: { ...OPEN, ...docs }, body: { action: 'getDocs', userEmail: 'officer@nitda.gov.ng' } });
    ok(failedSteps(g0.sim).length === 0 && status(g0.r) === 200 && dataOf(g0.r).docs?.[0]?.RefIDD === 'NITDA-2026-00011', 'GET_DOCS: with the switch off the read runs as today', `${status(g0.r)} ${failedSteps(g0.sim).join(' | ').slice(0, 300)}`);
    const g1 = run(GD, GDCAP, 'IP_Get_Docs_Endpoint', { seed: { ...GOV, ...docs }, body: { action: 'getDocs', userEmail: 'officer@nitda.gov.ng' } });
    ok(status(g1.r) === 401 && !dataOf(g1.r).docs, 'GET_DOCS: with the switch on and no proof, 401 and no documents', `${status(g1.r)} ${JSON.stringify(dataOf(g1.r)).slice(0, 200)}`);
    const g2 = run(GD, GDCAP, 'IP_Get_Docs_Endpoint', { seed: { ...GOV, ...docs }, body: { action: 'getDocs' }, headers: bearer('tok-viewer') });
    ok(status(g2.r) === 200 && dataOf(g2.r).docs?.length === 1, 'GET_DOCS: with a valid proof the documents load', `${status(g2.r)}`);
  }

  /* FETCH_EMAIL_ATTACHMENTS */
  const EA = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Retrieve_Email_Attachment_Endpoint', 'paste.json'));
  const EACAP = capture('IP_Retrieve_Email_Attachment_Endpoint');
  staticChecks(EA, EACAP, 'FETCH_EMAIL_ATTACHMENTS');
  {
    let reads = 0;
    const getEmail = () => { reads++; return { body: { id: 'm1', attachments: [{ id: 'a1' }] } }; };
    const getAttachment = () => ({ body: { name: 'memo.pdf', contentBytes: 'JVBERi0=', contentType: 'application/pdf' } });
    const mail = {};
    for (const c of ['shared_office365', 'shared_office365-1', 'shared_office365-2']) Object.assign(mail, { [`${c}.GetEmailV2`]: getEmail, [`${c}.GetAttachment_V2`]: getAttachment });
    const e0 = run(EA, EACAP, 'IP_Retrieve_Email_Attachment_Endpoint', { seed: OPEN, body: { emailId: 'm1', userEmail: 'officer@nitda.gov.ng' }, extra: mail });
    ok(failedSteps(e0.sim).length === 0 && status(e0.r) === 200 && reads === 1, 'FETCH_EMAIL_ATTACHMENTS: with the switch off the attachments are read as today', `${status(e0.r)} ${failedSteps(e0.sim).join(' | ').slice(0, 300)}`);
    reads = 0;
    const e1 = run(EA, EACAP, 'IP_Retrieve_Email_Attachment_Endpoint', { seed: GOV, body: { emailId: 'm1', userEmail: 'officer@nitda.gov.ng' }, extra: mail });
    ok(status(e1.r) === 401 && reads === 0, 'FETCH_EMAIL_ATTACHMENTS: with the switch on and no proof, 401 and no message read', `${status(e1.r)} reads=${reads}`);
    const e2 = run(EA, EACAP, 'IP_Retrieve_Email_Attachment_Endpoint', { seed: GOV, body: { emailId: 'm1' }, headers: bearer('tok-officer'), extra: mail });
    ok(status(e2.r) === 200 && reads === 1, 'FETCH_EMAIL_ATTACHMENTS: with a valid proof the attachments are read', `${status(e2.r)} reads=${reads}`);
    ok(Object.values(EA.allConnectionData).filter((c) => /sharepointonline/.test(c.connectionReference.api.id)).every((c) => c.connectionReference.connectionName === '3f1943c5955a4cb8b301e8f22f2b590d'), 'FETCH_EMAIL_ATTACHMENTS: the new SharePoint steps bind the tenant\'s SharePoint connection');
  }

  /* EMAIL */
  const SE = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_SEND_EMAIL', 'paste.json'));
  const SECAP = capture('IP_SEND_EMAIL');
  staticChecks(SE, SECAP, 'EMAIL');
  {
    const msg = { action: 'dispatchEmail', payload: { email: { to: 'citizen@example.com', subject: 'Your letter', html: '<p>Received.</p>' } } };
    const s0 = run(SE, SECAP, 'IP_SEND_EMAIL', { seed: OPEN, body: { ...msg, userEmail: 'officer@nitda.gov.ng' } });
    ok(failedSteps(s0.sim).length === 0 && status(s0.r) === 200 && (s0.db.mail || []).length === 1, 'EMAIL: with the switch off the message is sent as today', `${status(s0.r)} ${failedSteps(s0.sim).join(' | ').slice(0, 300)}`);
    ok(s0.sim.variables?.varRequestId !== 'client-supplied', 'EMAIL: the run\'s requestId is its own, not the one the client sent');
    const s1 = run(SE, SECAP, 'IP_SEND_EMAIL', { seed: GOV, body: { ...msg, userEmail: 'officer@nitda.gov.ng' } });
    ok(status(s1.r) === 401 && !(s1.db.mail || []).length, 'EMAIL: with the switch on and no proof, 401 and nothing sent', `${status(s1.r)}`);
    const s2 = run(SE, SECAP, 'IP_SEND_EMAIL', { seed: GOV, body: msg, headers: bearer('tok-officer') });
    ok(status(s2.r) === 200 && (s2.db.mail || []).length === 1, 'EMAIL: with a valid proof the message is sent', `${status(s2.r)}`);
  }

  /* AI */
  const AI = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'AI_Document_Processing', 'paste.json'));
  const AICAP = capture('AI_Document_Processing');
  staticChecks(AI, AICAP, 'AI');
  {
    const a0 = run(AI, AICAP, 'AI_Document_Processing', { seed: OPEN, body: { userEmail: 'officer@nitda.gov.ng' } });
    ok(failedSteps(a0.sim).length === 0 && !a0.sim.response && !a0.sim.terminated, 'AI: with the switch off the gate does nothing and the run goes on', `${JSON.stringify(a0.sim.response)} ${failedSteps(a0.sim).join(' | ')}`);
    const a1 = run(AI, AICAP, 'AI_Document_Processing', { seed: GOV, body: { userEmail: 'officer@nitda.gov.ng' } });
    ok(status(a1.r) === 401 && a1.r.body?.status?.code === 'UNAUTHENTICATED', 'AI: with the switch on and no proof, 401 and the run stops', `${status(a1.r)}`);
    const a2 = run(AI, AICAP, 'AI_Document_Processing', { seed: GOV, body: {}, headers: bearer('tok-viewer') });
    ok(!a2.sim.response, 'AI: with a valid proof the gate passes', JSON.stringify(a2.sim.response));
    const key = run(AI, AICAP, 'AI_Document_Processing', { seed: { ...GOV, [CFGT]: [...ON, { ID: 91, Title: 'OPENROUTER_API_KEY', ConfigValue: ' or-test-key ' }] }, body: {}, headers: bearer('tok-viewer') });
    ok(key.sim.global.get('Compose_OpenRouter_Authorization')?.outputs === 'Bearer or-test-key', 'AI: the OpenRouter Authorization value is composed from Flow Configuration (ITEM-75)', JSON.stringify(key.sim.global.get('Compose_OpenRouter_Authorization')?.outputs));
    ok(!/sk-or-v1-/.test(JSON.stringify(AI)), 'AI: the package holds no OpenRouter key');
  }
}


/* ITEM-66: every mail send in every package writes an outbox receipt, followed by the outcome step that keeps a failed
   send failing its scope. */
{
  const dir = `${DIR}/identification-phase4`;
  const missing = [];
  let sends = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.paste.json'))) {
    const visit = (o) => { for (const [n, a] of Object.entries(o || {})) {
      if (/SendEmail/.test(a.inputs?.host?.operationId || '')) {
        sends++;
        const r = Object.entries(o).find(([, b]) => b.runAfter?.[n] && b.inputs?.parameters?.table === '88a81ca1-319a-45f5-8409-f91a24538ffa');
        if (!r) missing.push(`${f}: ${n}`);
        else if (/^Create_.+_Receipt$/.test(r[0]) && !o[`Compose_${n}_Outcome`]) missing.push(`${f}: ${n} has no outcome step`);
      }
      visit(a.actions); if (a.else) visit(a.else.actions); for (const c of Object.values(a.cases || {})) visit(c.actions); if (a.default) visit(a.default.actions);
    } };
    visit(J(`${dir}/${f}`).serializedValue.actions);
  }
  ok(sends > 0 && !missing.length, `ITEM-66: every mail send in the Phase 4 packages (${sends}) writes an outbox receipt`, missing.join('; '));
}
{
  /* Tenant defects found on TASK-2026-00002 (2026-10-10). */
  const sa = J(`${DIR}/identification-phase4/SINGLE_ASSIGNMENT__Single_Task_Assignment__3caf9458.paste.json`);
  const s = JSON.stringify(sa);
  const greet = (() => { let hit = null; const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'Compose_AssignedToTitle_Value' && v && v.type) hit = v; walk(v); } }; walk(sa); return hit; })();
  ok(greet && !String(greet.inputs).startsWith('@coalesce(') && String(greet.inputs).includes("empty(trim(string(coalesce(outputs('Compose_MatchedDepartmentValue')"), 'e-mail greeting: an empty department match falls through to the next name, never "Dear ,"');
  ok(s.includes("'Standard Response Window'") && !/'Restricted Executive Dispatch','Standard Official Review'\)\)/.test(s), 'e-mail: Response Priority no longer repeats Handling Status on normal tasks');
  for (const f of ['FETCH_ALL__IP_FETCH_ALL_BOOTSTRAP__b79e6707', 'GET_DOCS__IP_Get_Docs_Endpoint__28f6e62a', 'REFERENCE_DATA__IP_Reference_Data_Endpoint__9a4dea8e']) {
    const r = readFileSync(`${DIR}/identification-phase4/${f}.paste.json`, 'utf8');
    ok(!r.includes('Send_Telemetry_Email') && !/body_sent(?!_bytes)/.test(r) && r.includes('body_sent_bytes'), `ITEM-52: ${f.split('__')[0]} keeps its telemetry row but e-mails no run record and stores the reply's size, not the reply`);
  }
  ok(s.includes("uriComponent(string(coalesce(outputs('Compose_ReferenceID')") && !s.includes("'?ref=', uriComponent(concat('TASK-', string(coalesce(outputs('Get_item_Task')?['body/ID'], 0))))"), 'e-mail: the Support Access link carries the Task Reference the e-mail shows');
}

/* ---------------------------------------------------------------- AUTO_SCHEDULED_SWEEP: one digest per person */
console.log('\n  AUTO_SCHEDULED_SWEEP simulated runs (owner direction 2026-10-10)\n');
{
  const SW = J(await findFlowArtifact(`${DIR}/identification-phase4`, 'AUTO_SCHEDULED_SWEEP', 'paste.json'));
  const SWCAP = capture('AUTO_SCHEDULED_SWEEP');
  const GTQ = 'ee82725a-c408-45e2-a8e8-facf7a092047', RECEIPTS = '88a81ca1-319a-45f5-8409-f91a24538ffa', CFGT = '9bc168c3-06e5-4d58-982b-0df06205fd35', CASES = 'b984645b-8e3a-457f-a305-b95650fd3f23';
  const past = '2026-10-01T09:00:00Z';
  const task = (ID, to, extra = {}) => ({ ID, Title: `Task ${ID}`, TaskRef: `TASK-2026-00${ID}`, AssignedTo: to, Progress: { Value: 'Not started' }, Acknowledge_x0020_Task: { Value: 'Not Acknowledged' }, Acknowledgement_x0020_Due_x0020_: past, DueDate: past, ...extra });
  const seed = (cfg = []) => ({ [GTQ]: [task(101, 'ada@nitda.gov.ng'), task(102, 'ada@nitda.gov.ng'), task(103, 'Ada@nitda.gov.ng ', { Acknowledge_x0020_Task: { Value: 'Acknowledged' } }),
      task(104, 'bola@nitda.gov.ng'), task(105, 'bola@nitda.gov.ng', { Progress: { Value: 'Completed' } }), task(106, 'not an address')],
    [CFGT]: [{ ID: 1, Title: 'NOTIFY_OPS_TO', ConfigValue: 'dgsregistry@nitda.gov.ng' }, ...cfg], [RECEIPTS]: [], [CASES]: [] });
  /* The service's xml() and xpath() over the one shape the sweep uses: {"r":{"i":[{k,v,…}]}} and /r/i[k="…" or k="…"]. */
  const xmlFns = {
    xml: ([o]) => ({ __xml: o }),
    xpath: ([x, path]) => {
      const items = [].concat(x?.__xml?.r?.i || []);
      const keys = [...String(path).matchAll(/k="([^"]*)"/g)].map((m) => m[1]);
      const hit = items.filter((i) => keys.includes(String(i.k)));
      if (String(path).startsWith('count(')) return hit.length;
      const field = (/\]\/(\w+)\)$/.exec(String(path)) || [])[1];
      return hit.length && field ? String(hit[0][field] ?? '') : '';
    },
  };
  class SweepSim extends Simulator { get fns() { return { ...super.fns, ...xmlFns }; } }
  const runSW = (state) => {
    const sp = sharepoint(state, { config: CONFIG, lenientFilters: [GTQ, RECEIPTS, CFGT, CASES] });
    const sim = new SweepSim({ variables: declaredVariables(SWCAP), connectors: sp.connectors, clock: () => NOW,
      workflow: { name: '8c19b45c-4174-4d2f-9429-ffd08dd1a5ae', run: { name: 'RUN-SW' }, tags: { flowDisplayName: 'AUTO_SCHEDULED_SWEEP' } },
      trigger: { startTime: NOW, outputs: {} } });
    sim.declare(SW).run(SW);
    return { sim, db: sp.db, mail: sp.db.mail || [] };
  };
  const first = runSW(seed());
  const digests = first.mail.filter((m) => /task\(s\) need your attention/.test(m['emailMessage/Subject']));
  ok(digests.length === 2, 'sweep: one digest per person (ada: two open tasks, bola: one), not one e-mail per task', `${digests.length} digests; ${failedSteps(first.sim).join(' | ').slice(0, 300)}`);
  ok(digests.every((m) => m['emailMessage/To'] === 'dgsregistry@nitda.gov.ng'), 'sweep: before commissioning every digest goes to the registry (NOTIFY_SWEEP_RECIPIENTS is not staff)', digests.map((m) => m['emailMessage/To']).join(', '));
  const ada = digests.find((m) => /ada@nitda\.gov\.ng/.test(m['emailMessage/Subject'])) || {};
  ok(/TASK-2026-00101/.test(ada['emailMessage/Body']) && /TASK-2026-00102/.test(ada['emailMessage/Body']) && !/TASK-2026-00104/.test(ada['emailMessage/Body']) && /[Cc]ommissioning/.test(ada['emailMessage/Body']) && /[Tt]his digest is for ada@nitda.gov.ng/.test(ada['emailMessage/Body']),
    'sweep: a digest lists all of that person\'s open tasks, only theirs, and names them while it goes to the registry', String(ada['emailMessage/Subject']));
  ok(!first.mail.some((m) => /TASK-2026-00105|not an address/.test(JSON.stringify(m))), 'sweep: a completed task and an invalid address are left out');
  const rc = (first.db[RECEIPTS] || []).filter((r) => r.MessageType === 'task-digest');
  ok(rc.length === 2 && rc.every((r) => r.Status === 'sent' && /^task-digest:(ada|bola)@nitda\.gov\.ng:2026-10-05$/.test(r.Title)), 'sweep: one task-digest receipt per person per day', JSON.stringify(rc.map((r) => r.Title)));
  const sentBefore = first.mail.length;
  const again = runSW(structuredClone(first.db));
  const newMail = (again.mail || []).slice(sentBefore);
  ok(!newMail.some((m) => /need your attention/.test(m['emailMessage/Subject'])), 'sweep: a second run the same day sends no digest', String(newMail.length));
  const live = runSW(seed([{ ID: 2, Title: 'NOTIFY_SWEEP_RECIPIENTS', ConfigValue: 'staff' }]));
  const liveTo = live.mail.filter((m) => /need your attention/.test(m['emailMessage/Subject'])).map((m) => m['emailMessage/To']).sort();
  ok(JSON.stringify(liveTo) === JSON.stringify(['ada@nitda.gov.ng', 'bola@nitda.gov.ng']), 'sweep: with NOTIFY_SWEEP_RECIPIENTS staff, each person receives their own digest', liveTo.join(', '));
}
/* ---------------------------------------------------------------- FAILURE_WATCH (owner decision 2026-10-18) */
console.log('\n  FAILURE_WATCH simulated runs\n');
{
  const WF = readdirSync(`${DIR}/identification-phase4`).find((f) => parseFlowArtifactName(f)?.flow === 'Folio_Failure_Watch');
  ok(!!WF, 'the Folio_Failure_Watch package exists');
  const W = J(`${DIR}/identification-phase4/${WF}`);
  const CFGT = '9bc168c3-06e5-4d58-982b-0df06205fd35', RCT = '88a81ca1-319a-45f5-8409-f91a24538ffa';
  const R = (id, type, flow, to) => ({ ID: id, Title: `${type}:${flow}:run${id}`, MessageType: type, RecipientEmail: to, Reference: `run${id}`, Status: 'failed', Attempts: 1, LastError: 'Mailbox unavailable', Created: '2026-10-05T08:30:00Z' });
  const rows = [R(1, 'status-approved', 'CG_Registry_Status_Notifier', 'citizen@example.com'), R(2, 'report-delivery', 'IP_SEND_EMAIL', 'officer@nitda.gov.ng'), R(3, 'an-email-v2', 'IP_OTP_GENERATE', 'officer@nitda.gov.ng'), R(4, 'brand-new-type', 'Some_Flow', 'x@nitda.gov.ng')];
  /* The service's xml() and xpath() over the shape the watch reads: {"r":{"i":[{k,v,id}]}} and /r/i[k="…"]/v or /id. */
  const xmlFns = { xml: ([o]) => ({ __xml: o }), xpath: ([x, path]) => { const items = [].concat(x?.__xml?.r?.i || []); const k = (/k="([^"]*)"/.exec(String(path)) || [])[1]; const hit = items.find((i) => String(i.k) === k); const field = (/\]\/(\w+)\)$/.exec(String(path)) || [])[1]; return hit && field ? String(hit[field] ?? '') : ''; } };
  class WatchSim extends Simulator { get fns() { return { ...super.fns, ...xmlFns }; } }
  const run = (cfg, receipts, at = NOW) => {
    const sp = sharepoint({ [CFGT]: cfg, [RCT]: receipts }, { lenientFilters: [CFGT, RCT] });
    const sim = new WatchSim({ variables: {}, connectors: sp.connectors, clock: () => at, workflow: { name: 'watch', run: { name: 'RUN-W' }, tags: { flowDisplayName: 'Folio_Failure_Watch' } }, trigger: { startTime: at, outputs: {} } });
    sim.run(W);
    return { sim, db: sp.db };
  };
  const a = run([], rows);
  const mail = a.db.mail || [];
  ok(failedSteps(a.sim).length === 0, 'the watch runs with no template error', failedSteps(a.sim).join(' | ').slice(0, 400));
  ok(mail.length === 1 && mail[0]['emailMessage/To'] === 'dgsregistry@nitda.gov.ng', 'one report goes to the registry by default', JSON.stringify(mail.map((m) => m['emailMessage/To'])));
  const body = String(mail[0]?.['emailMessage/Body'] || '');
  ok(body.includes('run1') && body.includes('run4') && !body.includes('run2') && !body.includes('run3'), 'it lists the citizen outcome and the unplaced type, not the staff notice or the sign-in code');
  ok(body.includes('c***@example.com') && !body.includes('citizen@example.com'), 'the recipient is masked');
  const cur = a.db[CFGT].find((r) => r.Title === 'NOTIFY_FAILURE_WATCH_CURSOR'), hl = a.db[CFGT].find((r) => r.Title === 'NOTIFY_FAILURE_HEALTH');
  ok(cur && cur.ConfigValue === 'utc:2026-10-05T09:00:00Z', 'the cursor row is created at the run start, stored as utc:<ISO> so the list cannot reformat it', JSON.stringify(cur));
  const h = hl ? JSON.parse(hl.ConfigValue) : {};
  ok(h.open?.citizen === 1 && h.open?.staff === 1 && h.open?.codes === 1 && h.open?.unclassified === 1 && h.openTotal === 4 && h.connectionBroken === false, 'the health row counts the open failures per group', hl?.ConfigValue);
  ok((a.db[RCT] || []).some((r) => r.MessageType === 'failure-watch' && r.Status === 'sent'), 'the report writes its own receipt');
  const off = run([{ ID: 1, Title: 'NOTIFY_FAILURE_WATCH_ENABLED', ConfigValue: 'false' }], rows);
  ok(!(off.db.mail || []).length && off.db[CFGT].some((r) => r.Title === 'NOTIFY_FAILURE_HEALTH'), 'switched off, nothing is reported but the health row is still written');
  const none = run([], rows.filter((r) => r.MessageType === 'report-delivery'));
  ok(!(none.db.mail || []).length, 'a staff-notice failure alone is registered and counted, not reported');
  const burst = run([{ ID: 1, Title: 'NOTIFY_FAILURE_BURST', ConfigValue: '3' }], rows.filter((r) => r.ID !== 1 && r.ID !== 4).concat([R(5, 'task-digest', 'AUTO_SCHEDULED_SWEEP', 'a@nitda.gov.ng')]));
  const bm = burst.db.mail || [];
  ok(bm.length === 1 && /mail connection may be broken/.test(bm[0]['emailMessage/Subject']), 'a burst of failures is reported as a broken mail connection, whatever their group', JSON.stringify(bm.map((m) => m['emailMessage/Subject'])));
  const groups = run([{ ID: 1, Title: 'NOTIFY_FAILURE_REPORT_GROUPS', ConfigValue: 'citizen,staff' }], rows);
  ok(String(groups.db.mail?.[0]?.['emailMessage/Body'] || '').includes('run2'), 'NOTIFY_FAILURE_REPORT_GROUPS adds a group without a release');
  const summary = run([], rows, '2026-10-05T06:10:00.000Z');
  ok(/still open/.test(summary.db.mail?.[0]?.['emailMessage/Subject'] || ''), 'the 07:00 run (West Africa Time) sends the summary of open failures', summary.db.mail?.[0]?.['emailMessage/Subject']);
}
console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
