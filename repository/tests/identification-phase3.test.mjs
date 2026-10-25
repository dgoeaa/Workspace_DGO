/**
 * Identification Phase 3 packages (npm run idphase3), checked as a whole and run end to end.
 *
 *   1. every function is proven in this tenant: the independent baseline (contracts/deployed), the
 *      conformance package the tenant runs, or the Phase 2 claim test that passed the exit run
 *   2. every outputs()/body()/actions() names an action of the package
 *   3. every SharePoint write names a column of its list (portal-field-spec.json plus the Phase 1
 *      identity columns), a Choice column as item/<col>/Value, and every required column on a create
 *   4. the package run in the strict simulator against an in-memory SharePoint that keeps the counter's
 *      ETag rule (a stale IF-MATCH is refused with 412) and the counter's enforce-unique Title
 */
import { readFileSync, readdirSync } from 'node:fs';
import { parse, expressionsIn, functionsIn, Simulator } from '../scripts/lib/wdl-sim.mjs';
import { runAfterReach } from './lib/run-after-reach.mjs';
import { findFlowArtifact } from '../scripts/lib/flow-artifact-name.mjs';
import { conformancePackages } from '../scripts/build-identification-conformance.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages';
const PKG = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Submission_Endpoint', 'paste.json'));
const SUP = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Support_Endpoint', 'paste.json'));
const STA = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Status_Check_Endpoint', 'paste.json'));
const WRB = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Writeback_Endpoint', 'paste.json'));
const UPL = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Upload_Endpoint', 'paste.json'));
const NOT = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Registry_Status_Notifier', 'paste.json'));
const SWP = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Daily_Sweep', 'paste.json'));
const SCN = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'IP_SCAN_INTAKE', 'paste.json'));
const VER = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Verification_Endpoint', 'paste.json'));
const VEC = J(await findFlowArtifact(`${DIR}/identification-phase3`, 'CG_Portal_Verification_Confirmation_Endpoint', 'paste.json'));
const SPEC = J('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json');
const PROV = J('docs/reference/identification/provisioning/identity-provisioning.json');

console.log('\nIdentification Phase 3 packages\n');

/* Variables each flow declares above its pasted scope. Only IP_SCAN_INTAKE's root scope sets variables. */
const VARS_ABOVE = { SCAN_INTAKE: ['varStatusCode', 'varData', 'varErrors', 'varRequestId', 'varStartTicks', 'varReceivedAtUtc', 'varCompletedAtUtc', 'varDurationMs', 'varAction'] };

/* 1–3, for every package */
function staticChecks(PKG, label) {
  console.log(`\n  ${label}: actions, expressions and columns\n`);
/* 1. functions */
const fnsOf = (doc, into) => { for (const e of expressionsIn(doc)) { try { functionsIn(parse(e), into); } catch { /* not an expression */ } } return into; };
const proven = new Set();
for (const f of readdirSync('docs/folio-Master-Flows-and-Endpoints/contracts/deployed')) {
  const t = readFileSync(`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/${f}`, 'utf8');
  if (t.includes('a0000000-0000-4000-8000-')) continue;
  try { fnsOf(JSON.parse(t), proven); } catch { /* not JSON */ }
}
for (const p of Object.values(conformancePackages)) fnsOf(p, proven);
fnsOf(J(`${DIR}/identification-phase2/Scope_Phase2_ClaimTest_Flow.paste.json`), proven);
/* Functions proven by flows retired on 2026-10-05: their definitions are held at the commit the record names. */
for (const fn of Object.keys(JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/tenant-function-proof.json', 'utf8')).functions)) proven.add(fn);
/* Every expression must parse: a stray quote (caller's inside '…') breaks the step at run time, and the function check
   above skips what it cannot parse. */
const unparsed = [];
for (const e of expressionsIn(PKG)) { try { parse(e); } catch (err) { unparsed.push(`${String(e).slice(0, 90)} — ${err.message}`); } }
ok(!unparsed.length, `${label}: every expression parses`, unparsed.slice(0, 3).join(' | '));
const used = fnsOf(PKG, new Set());
const unproven = [...used].filter((f) => !proven.has(f));
ok(!unproven.length, `${label}: every function the package uses (${used.size}) is proven in the tenant`, unproven.join(', '));

/* 2. references */
const acts = [];
const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
  acts.push({ name: n, a }); walk(a.actions); if (a.else) walk(a.else.actions);
  for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
} };
walk(PKG.serializedValue.actions);
const declared = new Set(acts.map((x) => x.name));
const badRef = [];
const s = JSON.stringify(PKG.serializedValue);
for (const m of s.matchAll(/(?:outputs|body|actions|result)\('([^']+)'\)/g)) if (!declared.has(m[1])) badRef.push(m[1]);
for (const x of acts) for (const r of Object.keys(x.a.runAfter || {})) if (!declared.has(r)) badRef.push(`${x.name} runAfter ${r}`);
ok(!badRef.length, `${label}: every action reference and runAfter names an action (${acts.length} actions)`, [...new Set(badRef)].join(', '));
/* The designer refuses a step nested deeper than 8 levels (IP_SCAN_INTAKE paste, 5 October 2026: "nested at level '9'
   which exceeds the maximum nesting limit of '8'"); the conformance SUBMISSION runs live at 8. Level 1 = a step directly
   in the pasted root scope. */
let deepest = 0, deepName = '';
const depth = (o, d) => { for (const [n, a] of Object.entries(o || {})) {
  if (d > deepest) { deepest = d; deepName = n; }
  for (const k of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions].filter(Boolean)) depth(k, d + 1);
} };
depth(PKG.serializedValue.actions, 1);
ok(deepest <= 8, `${label}: no step is nested deeper than the designer's limit of 8 (deepest: ${deepest}, ${deepName})`);
/* The designer refuses, at save, a step that reads an action not on its runAfter path (IP_SCAN_INTAKE, 5 October 2026). */
const unreachable = runAfterReach(PKG.serializedValue.actions);
ok(!unreachable.length, `${label}: every step reads only actions on its runAfter path`, unreachable.join('; '));
/* A pasted scope cannot declare a variable (B1); it may set one the flow declares above it, as IP_SCAN_INTAKE does. */
const declaredVars = new Set(VARS_ABOVE[label] || []);
ok(!acts.some((x) => ['InitializeVariable', 'Until', 'Query'].includes(x.a.type) || (['SetVariable', 'AppendToArrayVariable', 'IncrementVariable'].includes(x.a.type) && !declaredVars.has(x.a.inputs?.name))),
  `${label}: no variable declared, no Until, no Filter array; only variables declared above the scope are set (B1)`);

/* 3. SharePoint columns */
const lists = new Map(SPEC.lists.map((l) => {
  const cols = new Map(l.fields.map((f) => [f.internalName, f]));
  cols.set('Title', { fieldType: 'Text' }); cols.set('ID', { fieldType: 'Counter' });
  return [String(l.listGuid).toLowerCase(), { ...l, cols }];
}));
for (const p of PROV.lists) {
  const l = lists.get(String(p.listGuid).toLowerCase()); if (!l) continue;
  for (const c of p.addColumns) l.cols.set(c.name, { internalName: c.name, fieldType: c.type, choices: c.choices });
}
/* Lists outside the portal field spec (the governance lists IP_SCAN_INTAKE uses): required columns from the Phase 1
   tenant list check, allowed columns = the Phase 1 identity columns plus what the captured live flow already writes there. */
const CHECKED = J('docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json').lists;
const SCANCAP = J('docs/folio-Master-Flows-and-Endpoints/captures/IP_SCAN_INTAKE__5504d7f9-cc96-470c-be79-217582faf415.json').Definition.actions;
for (const c of CHECKED) {
  const g = String(c.listGuid).toLowerCase(); if (lists.has(g)) continue;
  const cols = new Map([['Title', { fieldType: 'Text' }], ['ID', { fieldType: 'Counter' }]]);
  for (const r of String(c.requiredColumns || '').split(',').map((x) => x.trim()).filter(Boolean)) cols.set(r, { internalName: r, fieldType: 'Text', required: true });
  const prov = PROV.lists.find((l) => String(l.listGuid).toLowerCase() === g);
  for (const a of prov?.addColumns || []) cols.set(a.name, { internalName: a.name, fieldType: a.type, choices: a.choices });
  const live = (o) => { for (const a of Object.values(o || {})) {
    if (a.type === 'OpenApiConnection' && String(a.inputs?.parameters?.table).toLowerCase() === g) for (const k of Object.keys(a.inputs.parameters).filter((k) => k.startsWith('item/'))) {
      const [, col, sub] = k.split('/'); const f = cols.get(col) || { internalName: col }; f.fieldType = sub === 'Value' ? 'Choice' : (f.fieldType === 'Choice' ? 'Choice' : f.fieldType || 'Text'); cols.set(col, f);
    }
    live(a.actions); live(a.else?.actions); for (const x of Object.values(a.cases || {})) live(x.actions);
  } };
  live(SCANCAP);
  lists.set(g, { listTitle: c.list, cols });
}
const spErr = []; let writes = 0;
for (const x of acts) {
  if (x.a.type !== 'OpenApiConnection' || !/^shared_sharepointonline/.test(x.a.inputs.host.connection)) continue;
  const p = x.a.inputs.parameters, op = x.a.inputs.host.operationId;
  if (op === 'HttpRequest' || op === 'CreateFile') continue; // CreateFile writes a library file, not list columns // kit calls: addressed through Flow Configuration, checked by test:idkit and run below
  const l = lists.get(String(p.table).toLowerCase());
  if (!l) { if (op !== 'GetItems' && op !== 'GetItem') spErr.push(`${x.name}: list ${p.table} not in the field spec`); continue; }
  for (const k of Object.keys(p).filter((k) => k.startsWith('item/'))) {
    writes++; const [, col, sub] = k.split('/'); const f = l.cols.get(col);
    if (!f) spErr.push(`${x.name}: ${col} is not a column of ${l.listTitle}`);
    else if ((f.fieldType === 'Choice') !== (sub === 'Value')) spErr.push(`${x.name}: ${k} does not match ${f.fieldType}`);
    else if (f.fieldType === 'Choice' && f.choices && typeof p[k] === 'string' && !p[k].startsWith('@') && !f.choices.includes(p[k])) spErr.push(`${x.name}: ${p[k]} is not a choice of ${col}`);
  }
  if (op === 'PostItem') for (const [n, f] of l.cols) if (f.required && !(`item/${n}` in p) && !(`item/${n}/Value` in p)) spErr.push(`${x.name}: omits required ${n}`);
}
ok(!spErr.length, `${label}: every SharePoint write (${writes} columns) names a column of its list, Phase 1 columns included`, spErr.join('; '));

}

staticChecks(PKG, 'SUBMISSION');
staticChecks(SUP, 'SUPPORT');
staticChecks(STA, 'STATUS');
staticChecks(WRB, 'WRITEBACK');
staticChecks(UPL, 'UPLOAD');
staticChecks(NOT, 'NOTIFIER');
staticChecks(SWP, 'SWEEP');
staticChecks(SCN, 'SCAN_INTAKE');
staticChecks(VER, 'VERIFY');
staticChecks(VEC, 'VERIFY_CONFIRM');

/* 4. run it */
console.log('\n  simulated runs\n');
const NOW = '2026-10-04T16:00:00.000Z';
const L = { RATE: 'd6b97198-489c-4bd7-8647-1133c55efdf9', SEQ: 'd95409a4-2b48-4d34-9f60-da5d27db862d', REG: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667', TL: '5b486a5e-0ce7-46d7-a159-d84c77f3d1fd', TICK: 'd777f3cd-0696-426e-8096-ffc860e7c0d4', CFG: '9bc168c3-06e5-4d58-982b-0df06205fd35', TEL: '726c210d-09d5-45d9-952d-7a506b644b13', ATT: 'ecf2ba9b-968f-4fbc-ac9c-7b5e36d5099e', LIB: 'f553959f-d55b-4591-aa87-d61fb6f9eda9', AUDIT: 'be0c7af1-b21d-4efe-8c30-53fc55598d95', DIR: '3d591f5b-3f2f-409c-983a-a77b5c174834', ROLES: 'f675598b-271d-4200-8d75-2597aad4057f', PROOF: 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9', SUP: 'b984645b-8e3a-457f-a305-b95650fd3f23', LINKS: 'c3875803-8a9c-42d6-86b9-85e3f0ca5eef' };
const CONFIG = [
  { Title: 'ALLOWED_ORIGIN_PORTAL', ConfigValue: 'https://internal-platform.rf.gd' },
  ...PROV.flowConfiguration.rows.map((r) => ({ Title: r.Title, ConfigValue: r.Title === 'DATASET_RECORD_LINKS_LIST_ID' ? L.LINKS : r.ConfigValue })),
];
function sharepoint(seed, { claimHook, failRegistryCreate, failLinks } = {}) {
  const db = structuredClone(seed); let id = 1000;
  for (const t of [L.SEQ, L.REG, L.PROOF]) for (const r of db[t] || []) { r['odata.etag'] = r['odata.etag'] || '"1"'; r['@odata.etag'] = r['odata.etag']; }
  /* 'or' binds looser than 'and', as in OData; no filter here mixes them inside one clause. */
  const match = (row, f) => !f || f.split(/\s+or\s+/i).some((g) => g.split(/\s+and\s+/i).every((c) => {
    let m = /^startswith\((\w+),'(.*)'\)$/.exec(c.trim()); if (m) return String(row[m[1]] ?? '').startsWith(m[2]);
    m = /^(\w+) eq '(.*)'$/.exec(c.trim()); if (m) return String(row[m[1]] ?? '') === m[2].replace(/''/g, "'");
    m = /^(\w+) eq (\d+)$/.exec(c.trim()); if (m) return Number(row[m[1]] ?? 0) === Number(m[2]);
    m = /^(\w+) ge '(.*)'$/.exec(c.trim()); if (m) return String(row[m[1]] ?? '') >= m[2];
    throw new Error(`filter not modelled: ${c}`);
  }));
  const fields = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('item/')).map(([k, v]) => { const [, c, s2] = k.split('/'); return [c, s2 ? { Value: v } : v]; }));
  const calls = [];
  const http = (p) => {
    const method = p['parameters/method'], uri = decodeURIComponent(p['parameters/uri']), h = p['parameters/headers'] || {};
    let body = p['parameters/body']; if (typeof body === 'string') body = JSON.parse(body);
    calls.push({ method, uri, headers: h, body });
    if (/getbytitle\('Flow Configuration'\)/.test(uri)) {
      const titles = [...uri.matchAll(/Title eq '([^']+)'/g)].map((m) => m[1]);
      return { body: { value: CONFIG.filter((r) => titles.includes(r.Title)) } };
    }
    const lm = /lists\(guid'([0-9a-f-]+)'\)\/items(?:\((\d+)\))?(?:\?(.*))?$/.exec(uri);
    if (!lm) throw new Error(`uri not modelled: ${uri}`);
    const [, table, itemId, query] = lm; db[table] = db[table] || [];
    if (method === 'GET' && itemId) {
      const row = db[table].find((r) => String(r.ID) === itemId);
      return row ? { body: { ...row } } : { ok: false, statusCode: 404 };
    }
    if (method === 'GET') {
      const qs = Object.fromEntries((query || '').split('&').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
      let rows = db[table].filter((r) => match(r, qs.$filter));
      if (qs.$orderby) { const [col, dir] = qs.$orderby.split(' '); rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1)); }
      if (qs.$top) rows = rows.slice(0, Number(qs.$top));
      return { body: { value: rows.map((r) => ({ ...r })) } };
    }
    if (method === 'POST' && itemId && h['X-HTTP-Method'] === 'MERGE') {
      const row = db[table].find((r) => String(r.ID) === itemId);
      if (!row) return { ok: false, statusCode: 404 };
      if (claimHook) claimHook(row, db, table);
      if (h['IF-MATCH'] !== row['odata.etag']) return { ok: false, statusCode: 412, message: 'The request ETag value does not match the object\'s ETag value.' };
      Object.assign(row, body); row['odata.etag'] = `"${Number(String(row['odata.etag']).replace(/"/g, '')) + 1}"`; row['@odata.etag'] = row['odata.etag'];
      return { statusCode: 204, body: null };
    }
    if (method === 'POST' && !itemId) {
      if (table === L.SEQ && db[table].some((r) => r.Title === body.Title)) return { ok: false, statusCode: 400, message: 'duplicate values were found in the following field(s) in the list: [Title]' };
      if (table === L.REG && db[table].some((r) => r.ReferenceId === body.ReferenceId)) return { ok: false, statusCode: 400, message: 'duplicate ReferenceId' };
      if (table === L.LINKS && failLinks) return { ok: false, statusCode: 500, message: 'simulated link write failure' };
      if (table === L.LINKS && db[table].some((r) => r.LinkMatchKey === body.LinkMatchKey)) return { ok: false, statusCode: 400, message: 'duplicate LinkMatchKey' };
      const row = { ID: ++id, ...body, 'odata.etag': '"1"' }; db[table].push(row); return { statusCode: 201, body: row };
    }
    throw new Error(`call not modelled: ${method} ${uri}`);
  };
  const connectors = {
    /* A read is a snapshot, as the service returns it: a later write does not change what an earlier step read. */
    'shared_sharepointonline.GetItems': (p) => ({ body: { value: structuredClone((db[p.table] || []).filter((r) => match(r, p.$filter)).slice(0, p.$top || 100)) } }),
    'shared_sharepointonline.PostItem': (p) => {
      if (p.table === L.REG && failRegistryCreate) return { ok: false, statusCode: 400, message: 'simulated register write failure' };
      const row = { ID: ++id, ...fields(p) }; (db[p.table] = db[p.table] || []).push(row); return { body: row };
    },
    'shared_sharepointonline.PatchItem': (p) => { const r = (db[p.table] || []).find((x) => String(x.ID) === String(p.id)); if (!r) return { ok: false, statusCode: 404 }; Object.assign(r, fields(p)); return { body: r }; },
    'shared_sharepointonline.HttpRequest': http,
    'shared_office365.SendEmailV2': () => ({ body: null }),
    'shared_sharepointonline.GetItemChanges': () => ({ body: { ColumnHasChanged: { Status: true, StatusLabel: false } } }),
    'shared_sharepointonline.CreateFile': (p) => {
      (db.files = db.files || []).push({ folder: p.folderPath, name: p.name });
      const row = { ID: ++id, FileLeafRef: p.name, 'odata.etag': '"1"' };
      if (p.folderPath === '/NITDA_Central_Registry') (db[L.LIB] = db[L.LIB] || []).push(row);
      return { body: { Path: `${p.folderPath}/${p.name}`, ItemId: row.ID } };
    },
    'shared_sharepointonline.GetItem': (p) => ({ body: (db[p.table] || []).find((x) => String(x.ID) === String(p.id)) || {} }),
    'shared_flowmanagement.GetFlow': () => ({ body: { name: 'flow', properties: { displayName: 'IP_SCAN_INTAKE', definition: {} } } }),
  };
  /* A flow may name its connections with a suffix (shared_sharepointonline-1); the calls are the same. */
  for (const [k, v] of Object.entries({ ...connectors })) connectors[k.replace('.', '-1.')] = v;
  return { db, calls, connectors };
}
const GOOD = { subject: 'Clearance for the national payments upgrade', category: 'Application', senderEmail: 'Someone@Example.org', description: 'Test', eventDate: '2026-10-01',
  attachments: [{ name: 'Scan 1.jpg', size: 168867, sha256: 'AB'.repeat(32) }] };
const BASE = { [L.CFG]: CONFIG.map((r, i) => ({ ID: i + 1, ...r })) };
const NITDA = (n) => ({ ID: 7, Title: 'NITDA-2026', Year: '2026', Prefix: 'NITDA', CurrentSequence: n });
function run(seed, body, opts = {}) {
  const pkg = opts.pkg || PKG;
  const sp = sharepoint(seed, opts);
  const sim = new Simulator({
    variables: opts.variables || {},
    connectors: sp.connectors, clock: () => NOW, rand: opts.rand,
    workflow: opts.workflow || { name: 'de9ef13b-ae4c-42b0-9afa-20e71a180759', run: { name: 'RUN-1' }, tags: { flowDisplayName: 'CG_Submission_Endpoint' } },
    trigger: { outputs: { body, method: opts.method || 'POST', queries: {}, headers: { Origin: 'https://internal-platform.rf.gd', 'X-Forwarded-For': '102.91.135.94', ...(opts.headers || {}) } } },
  });
  sim.declare(pkg).run(pkg);
  return { sim, db: sp.db, calls: sp.calls, r: sim.response || {} };
}
const reg = (db) => db[L.REG] || [];
/* The simulator does not implement xml()/xpath(). The notification scope reads its switches with them, after the
   reply has been sent; the tenant runs them (they are in the proven set above). That one gap is tolerated, nothing else. */
const notifyOnly = new Set(['Compose_Notify_Config_Xml', 'Compose_Notify_Config']);
const realErrors = (sim) => sim.templateErrors.filter((t) => !(notifyOnly.has(t.action) && /unknown function xml\(\)|xpath|Compose_Notify_Config_Xml/.test(t.message)));
{
  const { sim, db, r } = run({ ...BASE, [L.SEQ]: [NITDA(41), { ID: 8, Title: 'ZTST-2026', Year: '2026', Prefix: 'ZTST', CurrentSequence: 20 }] }, GOOD);
  ok(realErrors(sim).length === 0, 'the live case runs with no template error (outside the simulator\'s xml() gap)', JSON.stringify(realErrors(sim)).slice(0, 400));
  ok(r.statusCode === 200 && r.body?.referenceId === 'NITDA-2026-00042' && r.body?.requestId, 'the next NITDA number is issued from the NITDA row (NITDA-2026-00042), with a requestId', JSON.stringify(r.body));
  const row = reg(db)[0] || {};
  ok(row.ReferenceId === 'NITDA-2026-00042' && row.EntityKey && row.IdState?.Value === 'ACTIVE' && row.Rev === 1 && row.Direction?.Value === 'In',
    'the register row carries EntityKey, IdState ACTIVE, Rev 1 and Direction In', JSON.stringify(row));
  ok(row.CorrelationId === r.body.requestId && row.CreatedByRequest === r.body.requestId && row.AttachmentHashSet === 'abababababab' && !('LocalId' in row),
    'CorrelationId and CreatedByRequest are the Request ID; AttachmentHashSet is written; LocalId is not', JSON.stringify(row));
  const ev = (db[L.TL] || [])[0] || {};
  ok(ev.RootRef === 'NITDA-2026-00042' && ev.SubjectKey === `REC:${row.EntityKey}` && ev.RootKey === ev.SubjectKey && ev.Action === 'RECEIVED' && ev.Process === 'INTAKE' && ev.EntityKey && ev.EntityKey !== row.EntityKey,
    'the RECEIVED event names the record by REC:<key> and its reference, under its own Entity Key', JSON.stringify(ev));
  const seq = db[L.SEQ].find((x) => x.Prefix === 'NITDA');
  ok(seq.CurrentSequence === 42 && seq.LastReferenceId === 'NITDA-2026-00042' && db[L.SEQ].find((x) => x.Prefix === 'ZTST').CurrentSequence === 20, 'the NITDA counter advances; the ZTST row is untouched');
  const tel = (db[L.TEL] || [])[0] || {};
  ok(tel.RequestId === r.body.requestId && tel.RegistryKey === 'DGO:de9ef13b-ae4c-42b0-9afa-20e71a180759' && tel.ContractKey === 'SUBMISSION', 'telemetry is keyed by the Request ID and the Flow Registry Key', JSON.stringify(tel));
  ok((db[L.TICK] || []).length === 1 && r.body.uploads?.[0]?.name === 'Scan 1.jpg', 'one upload ticket, returned as { ticket, name }');
}
{
  const { r, db } = run({ ...BASE }, GOOD);
  const seq = (db[L.SEQ] || [])[0] || {};
  ok(r.statusCode === 200 && r.body?.referenceId === 'NITDA-2026-00001' && seq.Title === 'NITDA-2026' && seq.Prefix === 'NITDA' && seq.CurrentSequence === 1,
    'the first submission of a year creates NITDA-2026 already holding 1 and issues NITDA-2026-00001', JSON.stringify(r.body));
}
/* The live failure of 5 October 2026 (request 09e119f8-…): no NITDA/2026 counter was found, the claim created one at 1
   and issued NITDA-2026-00001, which Portal Registry already held, and the record write was refused as a duplicate. */
{
  const held = [1, 7, 12].map((n, i) => ({ ID: 500 + i, Title: `NITDA-2026-${String(n).padStart(5, '0')}`, ReferenceId: `NITDA-2026-${String(n).padStart(5, '0')}` }));
  const { r, db } = run({ ...BASE, [L.REG]: held }, GOOD);
  const seq = (db[L.SEQ] || [])[0] || {};
  ok(r.statusCode === 200 && r.body?.referenceId === 'NITDA-2026-00013' && seq.CurrentSequence === 13 && seq.LastReferenceId === 'NITDA-2026-00013',
    'with no counter row but NITDA-2026-00012 already in the register, the new counter starts above it and NITDA-2026-00013 is issued', JSON.stringify(r.body));
  const { r: r2, db: db2 } = run({ ...BASE, [L.SEQ]: [NITDA(0)], [L.REG]: held }, GOOD);
  ok(r2.statusCode === 200 && r2.body?.referenceId === 'NITDA-2026-00013' && db2[L.SEQ][0].CurrentSequence === 13,
    'a counter row behind the register (CurrentSequence 0) is overtaken: NITDA-2026-00013 is issued, not a duplicate', JSON.stringify(r2.body));
  const { r: r3 } = run({ ...BASE, [L.SEQ]: [NITDA(41)], [L.REG]: held }, GOOD);
  ok(r3.body?.referenceId === 'NITDA-2026-00042', 'a counter ahead of the register still decides (NITDA-2026-00042)', JSON.stringify(r3.body));
}
{
  let raced = 0;
  const hook = (row) => { if (raced++ === 0) { row.CurrentSequence = 50; row['odata.etag'] = '"9"'; } };
  const { r, sim } = run({ ...BASE, [L.SEQ]: [NITDA(41)] }, GOOD, { claimHook: hook });
  const waits = [...sim.records?.values?.() || []].length;
  ok(r.statusCode === 200 && r.body?.referenceId === 'NITDA-2026-00051', 'a claim that loses the ETag race re-reads and takes the next free number (NITDA-2026-00051)', JSON.stringify(r.body) + waits);
}
{
  const hook = (row) => { row['odata.etag'] = `"x${Math.random()}"`; };
  const { r, db, calls } = run({ ...BASE, [L.SEQ]: [NITDA(41)] }, GOOD, { claimHook: hook });
  ok(r.statusCode === 503 && r.body?.code === 'RETRY_LATER' && !reg(db).length && db[L.SEQ][0].CurrentSequence === 41, 'when all 10 attempts lose, the reply is 503 RETRY_LATER and nothing is written', JSON.stringify(r.body));
  ok(calls.filter((c) => c.headers['X-HTTP-Method'] === 'MERGE').length === 10, 'exactly 10 claim attempts are made');
}
{
  const { r, db, calls } = run({ ...BASE, [L.SEQ]: [NITDA(41)] }, GOOD, { failRegistryCreate: true });
  const v = calls.find((c) => c.method === 'POST' && c.uri.includes(L.REG));
  const row = reg(db)[0] || {};
  ok(r.statusCode === 500 && v && row.ReferenceId === 'NITDA-2026-00042' && row.Title === 'VOID' && row.Status === 'void' && row.IdState === 'VOID' && row.VoidReason === 'RECORD_WRITE_FAILED' && row.SenderEmail === 'someone@example.org',
    'a failed register write leaves a VOID row for the claimed number (Q2 columns) and answers 500', JSON.stringify({ status: r.statusCode, row }));
}
{
  const prior = { ID: 3, ReferenceId: 'NITDA-2026-00003', SenderEmail: 'someone@example.org', Subject: GOOD.subject, AttachmentCount: 2, SubmittedAtUtc: '2026-10-04T10:00:00Z', EventDate: '2026-10-01T00:00:00Z', AttachmentHashSet: 'cdcdcdcdcdcd,abababababab' };
  const two = { ...GOOD, attachments: [{ name: 'a.pdf', size: 1, sha256: 'ab'.repeat(32) }, { name: 'b.pdf', size: 1, sha256: 'cd'.repeat(32) }] };
  const seed = { ...BASE, [L.SEQ]: [NITDA(9)], [L.REG]: [prior], [L.TICK]: [{ ID: 5, Title: 'tok-open', SubmissionRef: 'NITDA-2026-00003', DeclaredName: 'a.pdf', Redeemed: false }] };
  const same = run(seed, two);
  ok(same.r.statusCode === 200 && same.r.body?.referenceId === 'NITDA-2026-00003' && same.r.body?.replayed === true && same.db[L.SEQ][0].CurrentSequence === 9 && same.db[L.REG].length === 1,
    'T3: the same content within 24 hours, files in another order, returns NITDA-2026-00003 and issues nothing', JSON.stringify(same.r.body));
  const other = run(seed, { ...two, attachments: [two.attachments[0], { name: 'c.pdf', size: 1, sha256: 'ef'.repeat(32) }] });
  ok(other.r.body?.referenceId === 'NITDA-2026-00010', 'a different file is a new submission (NITDA-2026-00010)', JSON.stringify(other.r.body));
  const otherDay = run(seed, { ...two, eventDate: '2026-10-02' });
  ok(otherDay.r.body?.referenceId === 'NITDA-2026-00010', 'a different event date is a new submission');
  const legacy = run({ ...seed, [L.REG]: [{ ...prior, AttachmentHashSet: undefined }] }, two);
  ok(legacy.r.body?.referenceId === 'NITDA-2026-00010', 'a row written before Phase 3 (no AttachmentHashSet) is not taken for a duplicate');
}
{
  const { r, db } = run({ ...BASE, [L.SEQ]: [NITDA(41)] }, { ...GOOD, requestId: 'client-request-1', ref: 'NITDA-2026-99999', localId: 'NITDA-XXXXXXXXX' });
  const row = reg(db)[0] || {}; const tel = (db[L.TEL] || [])[0] || {};
  ok(r.body?.referenceId === 'NITDA-2026-00042' && r.body.requestId !== 'client-request-1' && !('LocalId' in row) && tel.ClientCorrelationId === 'client-request-1',
    'T4: the client requestId, ref and localId are ignored; the requestId is kept only as ClientCorrelationId', JSON.stringify({ body: r.body, tel: tel.ClientCorrelationId }));
}
{
  const { r, db } = run({ ...BASE, [L.SEQ]: [NITDA(41)] }, { ...GOOD, subject: '' });
  ok(r.statusCode === 400 && !reg(db).length && db[L.SEQ][0].CurrentSequence === 41, 'a missing subject is refused with 400; no number is claimed');
}

/* ---------------------------------------------------------------- SUPPORT */
console.log('\n  SUPPORT\n');
{
  const SW = { name: '4873c936-a2be-4726-8e69-426edb8f70e6', run: { name: 'RUN-S' }, tags: { flowDisplayName: 'CG_Portal_Support_Endpoint' } };
  const ASK = { name: 'Amina Bello', email: 'Amina@Example.org', topic: 'Problem with a submission', message: 'My upload failed twice and I need help with it.' };
  const RECKEY = '45e40654-7a58-4301-a99c-99c31ced8cd2';
  const SEED = { ...BASE, [L.REG]: [
    { ID: 11, ReferenceId: 'NITDA-2026-00011', EntityKey: RECKEY, SenderEmail: 'amina@example.org' },
    { ID: 3, ReferenceId: 'NITDA-2026-00003', SenderEmail: 'amina@example.org' },
  ] };
  let n = 0; const spread = (lo, hi) => lo + ((n++ * 7) % (hi - lo));
  const sup = (body, opts = {}) => run(SEED, body, { pkg: SUP, workflow: SW, rand: spread, ...opts });
  const links = (db) => db[L.LINKS] || [];

  const plain = sup(ASK);
  const row = (plain.db[L.SUP] || [])[0] || {};
  ok(realErrors(plain.sim).length === 0 && plain.r.statusCode === 200 && /^CASE-[A-HJ-NP-Z2-9]{6}$/.test(plain.r.body?.caseRef || '') && plain.r.body.requestId,
    'T5: a case gets CASE-XXXXXX from the unambiguous alphabet, with a requestId', JSON.stringify(plain.r.body) + JSON.stringify(realErrors(plain.sim)).slice(0, 300));
  ok(row.CaseRef === plain.r.body.caseRef && row.Title === row.CaseRef && row.EntityKey && row.IdState?.Value === 'ACTIVE' && row.Rev === 1 && row.CorrelationId === plain.r.body.requestId,
    'the case row carries EntityKey, CaseRef, IdState ACTIVE, Rev 1 and the Request ID', JSON.stringify(row));
  ok(!links(plain.db).length, 'no reference named, no link written');

  const about = sup({ ...ASK, aboutReference: 'nitda-2026-00011' });
  const l = links(about.db)[0] || {}; const crow = (about.db[L.SUP] || [])[0] || {};
  ok(about.r.statusCode === 200 && l.FromKey === `CAS:${crow.EntityKey}` && l.ToKey === `REC:${RECKEY}` && l.LinkType === 'ABOUT' && l.LinkMatchKey === `${l.FromKey}|ABOUT|${l.ToKey}` && l.IdState === 'ACTIVE' && crow.AboutReference === 'NITDA-2026-00011',
    'T5: naming NITDA-2026-00011 writes one ABOUT link CAS → REC and keeps AboutReference', JSON.stringify(l));

  const legacy = sup({ ...ASK, aboutReference: 'NITDA-2026-00003' });
  ok(legacy.r.statusCode === 200 && !links(legacy.db).length && (legacy.db[L.SUP] || [])[0]?.AboutReference === 'NITDA-2026-00003',
    'a record written before Phase 3 (no Entity Key) gets AboutReference only, no link');

  const failed = sup({ ...ASK, aboutReference: 'NITDA-2026-00011' }, { failLinks: true });
  ok(failed.r.statusCode === 200 && (failed.db[L.SUP] || []).length === 1, 'a failed link write still answers 200 with the case created');

  const all = (lo) => lo; // every candidate is CASE-AAAAAA
  const taken = run({ ...SEED, [L.SUP]: [{ ID: 1, Title: 'CASE-AAAAAA', CaseRef: 'CASE-AAAAAA' }] }, ASK, { pkg: SUP, workflow: SW, rand: all });
  ok(taken.r.statusCode === 503 && taken.r.body?.code === 'RETRY_LATER' && (taken.db[L.SUP] || []).length === 1,
    'when every candidate is taken the reply is 503 RETRY_LATER and no duplicate is written', JSON.stringify(taken.r.body));

  /* 5 October 2026: one case resent 24 times in a minute by the portal outbox. */
  const opened = { ID: 2, Title: 'CASE-K7M2PQ', CaseRef: 'CASE-K7M2PQ', Email: 'amina@example.org', Topic: ASK.topic, Message: ASK.message, SubmittedAtUtc: '2026-10-04T15:40:00Z' };
  const repeat = run({ ...SEED, [L.SUP]: [opened] }, ASK, { pkg: SUP, workflow: SW, rand: spread });
  ok(realErrors(repeat.sim).length === 0 && repeat.r.statusCode === 200 && repeat.r.body?.caseRef === 'CASE-K7M2PQ' && repeat.r.body?.replayed === true && repeat.db[L.SUP].length === 1,
    'the same case again within the hour returns CASE-K7M2PQ (replayed) and opens no second case', JSON.stringify(repeat.r.body) + JSON.stringify(realErrors(repeat.sim)).slice(0, 300));
  /* The e-mails are chosen by the outcome's event (Switch_Notification_Event); the simulator stops at xml() before it. */
  const event = (x) => x.sim.global.get('Compose_Outcome')?.outputs?.event;
  ok(event(plain) === 'support_created' && event(repeat) === 'none', 'a repeat raises no notification event, so no helpdesk alert or acknowledgement (a new case raises support_created)', `${event(plain)} / ${event(repeat)}`);
  const other = run({ ...SEED, [L.SUP]: [{ ...opened, Message: 'A different question about my upload.' }] }, ASK, { pkg: SUP, workflow: SW, rand: spread });
  ok(other.r.statusCode === 200 && other.r.body?.caseRef !== 'CASE-K7M2PQ' && !other.r.body?.replayed && other.db[L.SUP].length === 2, 'a different message from the same address opens a new case');
  const old = run({ ...SEED, [L.SUP]: [{ ...opened, SubmittedAtUtc: '2026-10-04T14:30:00Z' }] }, ASK, { pkg: SUP, workflow: SW, rand: spread });
  ok(old.r.statusCode === 200 && old.r.body?.caseRef !== 'CASE-K7M2PQ' && old.db[L.SUP].length === 2, 'the same message more than an hour later opens a new case');

  const client = sup({ ...ASK, ref: 'CASE-ZZZZZZ', caseRef: 'CASE-ZZZZZZ', requestId: 'client-2' });
  ok(client.r.body?.caseRef !== 'CASE-ZZZZZZ' && client.r.body?.requestId !== 'client-2', 'T4: a client ref, caseRef or requestId is ignored');
}

/* ---------------------------------------------------------------- STATUS and WRITEBACK */
console.log('\n  STATUS and WRITEBACK\n');
{
  const KEY = '45e40654-7a58-4301-a99c-99c31ced8cd2';
  const REGROWS = [
    { ID: 21, Title: 'NITDA-2026-00217', ReferenceId: 'NITDA-2026-00217', EntityKey: KEY, CorrelationId: 'corr-origin-1', SenderEmail: 'a@b.org', Status: { Value: 'review' }, StatusLabel: 'Under review', Subject: 'New', IdState: { Value: 'ACTIVE' }, Rev: 1 },
    { ID: 22, Title: 'NITDA-2026-217', ReferenceId: 'NITDA-2026-217', SenderEmail: 'a@b.org', Status: { Value: 'received' }, Subject: 'Legacy ticks' },
    { ID: 23, Title: 'NITDA-2026-00009', ReferenceId: 'NITDA-2026-00009', LocalId: 'NITDA-7HB88677T', SenderEmail: 'a@b.org', Status: { Value: 'received' }, Subject: 'Receipt' },
    { ID: 24, Title: 'VOID', ReferenceId: 'NITDA-2026-00218', SenderEmail: 'a@b.org', Status: { Value: 'void' }, IdState: { Value: 'VOID' }, VoidReason: 'RECORD_WRITE_FAILED' },
  ];
  const SEED = { ...BASE, [L.REG]: REGROWS };
  const st = (referenceId, email = 'a@b.org') => run(SEED, { referenceId, email }, { pkg: STA, workflow: { name: '60042a2e-dadb-4ad8-a672-38b4132d299f', run: { name: 'RUN-T' }, tags: {} } });
  const a = st('NITDA-2026-00217'), b = st('NITDA-2026-217'), t = st('nitda-7hb88677t');
  ok(realErrors(a.sim).length === 0 && a.r.statusCode === 200 && a.r.body?.record?.referenceId === 'NITDA-2026-00217' && a.r.body.requestId, 'STATUS answers the registry reference, with a requestId', JSON.stringify(a.r.body).slice(0, 300) + JSON.stringify(realErrors(a.sim)).slice(0, 300));
  ok(b.r.body?.record?.referenceId === 'NITDA-2026-217' && b.r.body?.record?.subject === 'Legacy ticks', 'T6: NITDA-2026-217 finds only its own (legacy) record, never NITDA-2026-00217', JSON.stringify(b.r.body).slice(0, 200));
  ok(t.r.body?.record?.referenceId === 'NITDA-2026-00009', 'a portal tracking ID from an older receipt still resolves');
  ok(st('NITDA-2026-00218').r.statusCode === 404, 'a VOID row answers the uniform 404');
  ok(st('NITDA-2026-00217', 'other@b.org').r.statusCode === 404, 'another sender email answers the uniform 404');

  const PROOF = { ID: 5, Title: 'proof-1', Consumed: 0, Purpose: 'portal-verification', ExpiresAtUtc: '2026-10-04T17:00:00Z', Email: 'a@b.org' };
  const WSEED = { ...SEED, [L.PROOF]: [PROOF] };
  const WF = { name: 'bde13d27-73b3-4e1a-9687-eb289b039c7a', run: { name: 'RUN-W' }, tags: {} };
  const wb = (body, opts = {}) => run(WSEED, { verification: 'proof-1', action: 'note', body: 'Please see the attached letter.', ...body }, { pkg: WRB, workflow: WF, ...opts });
  const n = wb({ referenceId: 'NITDA-2026-00217' });
  const row = n.db[L.REG].find((x) => x.ID === 21); const ev = (n.db[L.TL] || [])[0] || {};
  ok(realErrors(n.sim).length === 0 && n.r.statusCode === 200 && n.r.body?.requestId, 'WRITEBACK answers 200 with a requestId', JSON.stringify(n.r.body) + JSON.stringify(realErrors(n.sim)).slice(0, 400));
  ok(row.Rev === 2 && row.UpdatedAtUtc === NOW && row.Status === 'review', 'B9: the register row is changed through IF-MATCH with Rev + 1 (1 → 2), and only the listed columns move', JSON.stringify(row));
  ok(ev.Action === 'NOTE_ADDED' && ev.RevAfter === 2 && ev.RootRef === 'NITDA-2026-00217' && ev.SubjectKey === `REC:${KEY}` && ev.CorrelationId === 'corr-origin-1' && ev.ContractKey === 'WRITEBACK' && ev.EntityKey,
    'the event carries Action, RevAfter, RootRef, REC:<key> and the record\'s CorrelationId', JSON.stringify(ev));

  const legacy = wb({ referenceId: 'NITDA-2026-217', action: 'withdraw', body: '' });
  const lrow = legacy.db[L.REG].find((x) => x.ID === 22); const lev = (legacy.db[L.TL] || [])[0] || {};
  ok(legacy.r.statusCode === 200 && lrow.Rev === 1 && lrow.Status === 'withdrawn' && lev.Action === 'WITHDRAWN' && lev.SubjectKey === '' && lev.CorrelationId === legacy.r.body.requestId,
    'a record written before Phase 3 is withdrawn with Rev 1, an empty SubjectKey and the flow\'s Request ID as CorrelationId', JSON.stringify({ lrow, lev }));

  const busy = wb({ referenceId: 'NITDA-2026-00217' }, { claimHook: (r, db, table) => { if (table === L.REG) { r['odata.etag'] = `"z${Math.random()}"`; } } });
  ok(busy.r.statusCode === 503 && busy.r.body?.code === 'RETRY_LATER' && !(busy.db[L.TL] || []).length && busy.db[L.REG].find((x) => x.ID === 21).Rev === 1,
    'when every guarded attempt loses, the reply is 503 RETRY_LATER and no event is written', JSON.stringify(busy.r.body));
  ok(wb({ referenceId: 'NITDA-2026-00218' }).r.statusCode === 404, 'WRITEBACK treats a VOID row as no record (404)');
}

/* ---------------------------------------------------------------- UPLOAD */
console.log('\n  UPLOAD\n');
{
  const KEY = '45e40654-7a58-4301-a99c-99c31ced8cd2';
  const SEED = { ...BASE,
    [L.REG]: [
      { ID: 42, ReferenceId: 'NITDA-2026-00042', EntityKey: KEY, CorrelationId: 'corr-origin-42', SenderEmail: 'a@b.org' },
      { ID: 9, ReferenceId: 'NITDA-2026-00009', SenderEmail: 'a@b.org' },
    ],
    [L.TICK]: [
      { ID: 1, Title: 'tok-new', SubmissionRef: 'NITDA-2026-00042', DeclaredName: 'Scan 1.jpg', StoredName: 'nitda_2026_00042_9ffb0890_scan_1.jpg', DeclaredSizeBytes: 12, ExpiresAtUtc: '2026-10-04T17:00:00Z', Redeemed: false },
      { ID: 2, Title: 'tok-old', SubmissionRef: 'NITDA-2026-00009', DeclaredName: 'a.pdf', StoredName: 'NITDA-2026-00009-a.pdf', DeclaredSizeBytes: 12, ExpiresAtUtc: '2026-10-04T17:00:00Z', Redeemed: false },
    ] };
  const up = (ticket) => run(SEED, { $content: 'aGVsbG8gd29ybGQh', '$content-type': 'image/jpeg' }, { pkg: UPL, headers: { 'X-Upload-Ticket': ticket, 'Content-Length': '12' }, workflow: { name: 'df82e331-b800-4a8d-996e-d2b2ca846c77', run: { name: 'RUN-U' }, tags: {} } });
  const a = up('tok-new'); const att = (a.db[L.ATT] || [])[0] || {}; const tel = (a.db[L.TEL] || [])[0] || {};
  ok(realErrors(a.sim).length === 0 && a.r.statusCode === 200 && a.r.body?.stored === true && a.r.body.requestId, 'UPLOAD stores the file and answers 200 with a requestId', JSON.stringify(a.r.body) + JSON.stringify(realErrors(a.sim)).slice(0, 400));
  ok(/^9ffb0890-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(att.EntityKey || '') && att.ParentKey === `REC:${KEY}` && att.RootKey === att.ParentKey && att.RootRef === 'NITDA-2026-00042' && att.IdState?.Value === 'ACTIVE' && att.Rev === 1,
    '§8.3: the attachment\'s Entity Key begins with the 8 hex of its stored name; ParentKey and RootKey are REC:<key>', JSON.stringify(att));
  ok(tel.CorrelationId === 'corr-origin-42' && tel.RequestId === a.r.body.requestId, 'ID-20: telemetry carries the record\'s CorrelationId (server state) and the flow\'s own Request ID', JSON.stringify(tel));
  const b = up('tok-old'); const att2 = (b.db[L.ATT] || [])[0] || {};
  ok(b.r.statusCode === 200 && /^[0-9a-f]{8}-/.test(att2.EntityKey || '') && att2.ParentKey === '' && att2.RootRef === 'NITDA-2026-00009',
    'a ticket and record from before Phase 3: a fresh Entity Key, RootRef kept, ParentKey empty until the backfill', JSON.stringify(att2));
}

/* ---------------------------------------------------------------- NOTIFIER and SWEEP */
console.log('\n  NOTIFIER and SWEEP\n');
{
  const row = { ID: 42, ReferenceId: 'NITDA-2026-00042', CorrelationId: 'corr-origin-42', SenderEmail: 'a@b.org', Subject: 'S', Status: { Value: 'review' }, StatusLabel: 'Under review' };
  const n = run({ ...BASE }, row, { pkg: NOT, workflow: { name: 'notifier-flow-id', run: { name: 'RUN-N' }, tags: {} } });
  const tel = (n.db[L.TEL] || [])[0] || {};
  ok(tel.CorrelationId === 'corr-origin-42' && tel.RequestId && tel.RequestId !== tel.CorrelationId && tel.RegistryKey === 'DGO:notifier-flow-id' && !('ContractKey' in tel),
    'NOTIFIER: telemetry carries the register row\'s CorrelationId, its own Request ID and its Flow Registry Key', JSON.stringify(tel) + JSON.stringify(realErrors(n.sim)).slice(0, 300));
  const w = run({ ...BASE }, {}, { pkg: SWP, workflow: { name: 'sweep-flow-id', run: { name: 'RUN-SW' }, tags: {} } });
  const t2 = (w.db[L.TEL] || [])[0] || {};
  ok(t2.RequestId && t2.CorrelationId === t2.RequestId && t2.RegistryKey === 'DGO:sweep-flow-id', 'SWEEP: telemetry carries its own Request ID as CorrelationId and its Flow Registry Key', JSON.stringify(t2) + JSON.stringify(realErrors(w.sim)).slice(0, 300));
}

/* ---------------------------------------------------------------- SCAN_INTAKE */
console.log('\n  SCAN_INTAKE\n');
{
  const VARS = { varStatusCode: 500, varData: {}, varErrors: [], varRequestId: 'rid-scan-1', varStartTicks: 0, varReceivedAtUtc: NOW, varCompletedAtUtc: '', varDurationMs: 0, varAction: {} };
  const SHA = 'ab'.repeat(32);
  const SEED = { ...BASE,
    [L.CFG]: [...BASE[L.CFG], { ID: 900, Title: 'NOTIFY_REGISTRY_TO', ConfigValue: 'DGSRegistry@nitda.gov.ng' }],
    /* Role is a Choice column: the connector returns it as an object (tenant, 8 October 2026: read as text it matched no RoleId). */
    [L.DIR]: [{ ID: 1, Email: 'officer@nitda.gov.ng', Status: 'active', Role: { '@odata.type': '#Microsoft.Azure.Connectors.SharePoint.SPListExpandedReference', Id: 3, Value: 'registry' }, Persona: 'Registry officer' }],
    [L.ROLES]: [{ ID: 1, Title: 'registry', RoleId: 'registry', Active: 1, AllowedRoutesJson: '["*"]', PermissionsJson: '[]' }],
    [L.SEQ]: [NITDA(41)],
    /* The caller is the address of the sign-in proof Folio sends (G-04; owner decision 2026-10-08, trigger open to anyone). */
    ['444102d6-2c29-45cf-8b59-52774d7c4dd4']: [{ ID: 7, Title: 'scan-proof-1', Consumed: 0, Purpose: 'internal-session', ExpiresAtUtc: '2026-10-04T17:00:00Z', Email: 'Officer@nitda.gov.ng' },
      { ID: 8, Title: 'scan-proof-old', Consumed: 0, Purpose: 'internal-session', ExpiresAtUtc: '2026-10-04T15:00:00Z', Email: 'officer@nitda.gov.ng' }] };
  const HDR = { 'X-DGO-Filename': encodeURIComponent('Letter from FMoF.pdf'), 'X-DGO-Sha256': SHA, 'X-DGO-Size': '12', 'X-DGO-Proof': 'Bearer scan-proof-1' };
  const sc = (seed = SEED, opts = {}) => run(seed, { '$content-type': 'application/pdf', $content: 'aGVsbG8gd29ybGQh' }, { pkg: SCN, method: 'PUT', headers: HDR, variables: VARS, workflow: { name: '5504d7f9-cc96-470c-be79-217582faf415', run: { name: 'RUN-SC' }, tags: {} }, ...opts });
  const a = sc();
  const row = (a.db[L.REG] || [])[0] || {}; const file = (a.db[L.LIB] || [])[0] || {}; const audit = (a.db[L.AUDIT] || [])[0] || {};
  ok(realErrors(a.sim).length === 0 && a.r.statusCode === 200 && a.r.body?.referenceId === 'NITDA-2026-00042' && a.r.body.stored === true && a.r.body.depositedBy === 'officer@nitda.gov.ng',
    'a deposit answers 200 with referenceId, stored and depositedBy at the top level, as Folio reads them', JSON.stringify(a.r.body).slice(0, 400) + JSON.stringify(realErrors(a.sim)).slice(0, 400));
  ok(row.ReferenceId === 'NITDA-2026-00042' && row.Channel === 'scan' && row.SenderEmail === 'dgsregistry@nitda.gov.ng' && row.EntityKey && row.IdState?.Value === 'ACTIVE' && row.Rev === 1 && row.Direction?.Value === 'In' && row.AttachmentHashSet === 'abababababab' && row.Subject === 'Letter from FMoF.pdf',
    'S7: the scan has a register row: Channel scan, SenderEmail = the registry mailbox, identity columns', JSON.stringify(row));
  const frag = String(file.EntityKey || '').slice(0, 8);
  ok(/^nitda_2026_00042_[0-9a-f]{8}_Letter from FMoF\.pdf$/.test(file.FileLeafRef || '') && file.FileLeafRef.includes(`_${frag}_`) && file.ParentKey === `REC:${row.EntityKey}` && file.RootRef === 'NITDA-2026-00042' && file.Rev === 1,
    '§8.3 / §10.2: the stored name carries the first 8 hex of the file\'s Entity Key; the library item carries ParentKey REC:<key>, RootRef and Rev 1', JSON.stringify(file));
  ok(audit.RootRef === 'NITDA-2026-00042' && audit.SubjectKey === `REC:${row.EntityKey}` && audit.ContractKey === 'SCAN_INTAKE' && audit.ActorEmail === 'officer@nitda.gov.ng', 'the audit event carries the record\'s key and reference, and the officer', JSON.stringify(audit).slice(0, 300));
  ok(a.db[L.SEQ][0].CurrentSequence === 42, 'T2: the scan takes the next number on the NITDA counter SUBMISSION uses');

  const busy = sc(SEED, { claimHook: (r, db, table) => { if (table === L.SEQ) r['odata.etag'] = `"q${Math.random()}"`; } });
  ok(busy.r.statusCode === 503 && busy.r.body?.data?.error === 'RETRY_LATER' && !(busy.db[L.REG] || []).length && !(busy.db[L.LIB] || []).length, 'when every claim attempt loses: 503 RETRY_LATER, no record, no file', JSON.stringify(busy.r.body).slice(0, 300));
  const voided = sc(SEED, { failRegistryCreate: true });
  const v = (voided.db[L.REG] || [])[0] || {};
  ok(voided.r.statusCode === 500 && v.Title === 'VOID' && v.ReferenceId === 'NITDA-2026-00042' && v.SenderEmail === 'dgsregistry@nitda.gov.ng' && v.CreatedByRequest === 'rid-scan-1' && !(voided.db[L.LIB] || []).length,
    'a failed register write leaves a VOID row for the number, stores no file and answers 500', JSON.stringify({ s: voided.r.statusCode, v }));
  const stranger = sc(SEED, { headers: { ...HDR, 'X-DGO-Proof': 'Bearer not-a-proof' } });
  ok(stranger.r.statusCode === 401 || stranger.r.statusCode === 403, 'an unknown caller is refused and nothing is claimed', String(stranger.r.statusCode));
  /* The trigger is open to anyone, so a header naming a staff address must not be believed (the tenant trigger used to set it). */
  const { 'X-DGO-Proof': _drop, ...noProof } = HDR;
  const spoofed = sc(SEED, { headers: { ...noProof, 'x-ms-client-principal-name': 'officer@nitda.gov.ng' } });
  ok(spoofed.r.statusCode === 401 && !(spoofed.db[L.REG] || []).length, 'a caller with no sign-in proof is refused even when a header names a staff address; nothing is claimed', String(spoofed.r.statusCode));
  const expired = sc(SEED, { headers: { ...HDR, 'X-DGO-Proof': 'Bearer scan-proof-old' } });
  ok(expired.r.statusCode === 401, 'an expired sign-in proof is refused', String(expired.r.statusCode));
  const legacy = sc(SEED, { headers: { ...noProof, Authorization: 'Bearer scan-proof-1' } });
  ok(legacy.r.statusCode === 200, 'a Folio build that still sends the proof as Authorization is read as before', String(legacy.r.statusCode));

  /* D1 / ITEM-6: the staff status write-back on the intake flow. */
  const WB_HDR = { 'X-DGO-Proof': 'Bearer scan-proof-1', 'X-DGO-Action': 'writeback', 'Content-Type': 'application/json' };
  const WSEED2 = { ...SEED, [L.REG]: [{ ID: 18, Title: 'Bridging the digital divide', EntityKey: 'E86AA35A-752E-4571-8F1F-5FA639CB193B', ReferenceId: 'NITDA-2026-00018', SenderEmail: 'citizen@example.org', Status: { Value: 'received' }, StatusLabel: 'Received', ActionRequired: false }] };
  const wbs = (body, seed = WSEED2, headers = WB_HDR) => run(seed, body, { pkg: SCN, method: 'PUT', headers, variables: VARS, workflow: { name: '5504d7f9-cc96-470c-be79-217582faf415', run: { name: 'RUN-WB' }, tags: {} } });
  const w1 = wbs({ referenceId: 'nitda-2026-00018', status: 'review', note: 'Assigned to the Legal desk.' });
  const reg1 = (w1.db[L.REG] || [])[0] || {}; const tl1 = (w1.db[L.TL] || []).slice(-1)[0] || {};
  ok(w1.r.statusCode === 200 && w1.r.body?.referenceId === 'NITDA-2026-00018' && w1.r.body?.data?.status === 'review' && w1.r.body?.data?.updatedBy === 'officer@nitda.gov.ng',
    'D1: an officer sets a portal submission\'s status: 200 with the reference, the status and the officer', JSON.stringify(w1.r.body).slice(0, 300));
  ok((reg1.Status?.Value || reg1.Status) === 'review' && reg1.StatusLabel === 'Under review.' && reg1.ActionRequired === false && reg1.UpdatedAtUtc && reg1.AcknowledgedAtUtc && !reg1.ClosedAtUtc,
    'D1: the Portal Registry row gets the status, its label, UpdatedAtUtc and AcknowledgedAtUtc on its first move past received', JSON.stringify(reg1).slice(0, 400));
  ok(tl1.SubmissionRef === 'NITDA-2026-00018' && tl1.Status === 'review' && tl1.Actor === 'officer@nitda.gov.ng' && tl1.Note === 'Assigned to the Legal desk.' && tl1.Action === 'STATUS_SET',
    'D1: a Portal Status Timeline row records the change with the officer as actor', JSON.stringify(tl1).slice(0, 300));
  ok(/^[0-9a-f-]{36}$/.test(tl1.EntityKey || '') && tl1.RootKey === 'REC:e86aa35a-752e-4571-8f1f-5fa639cb193b' && tl1.SubjectKey === tl1.RootKey,
    '§10.2: the timeline row carries its own Entity Key and names the submission by its Qualified Key, as the RECEIVED row does', JSON.stringify(tl1).slice(0, 400));
  ok(!(w1.db[L.LIB] || []).length && (w1.db[L.SEQ][0].CurrentSequence === 41), 'a write-back stores no file and claims no number');
  const w2 = wbs({ referenceId: 'NITDA-2026-00018', status: 'approved' });
  const reg2 = (w2.db[L.REG] || [])[0] || {};
  ok(w2.r.statusCode === 200 && reg2.ClosedAtUtc && reg2.StatusLabel === 'Approved.', 'approved or declined closes the submission (ClosedAtUtc)', JSON.stringify(reg2).slice(0, 300));
  const w3 = wbs({ referenceId: 'NITDA-2026-00018', status: 'action-required', label: 'Please send the signed letter.' });
  const reg3 = (w3.db[L.REG] || [])[0] || {};
  ok(w3.r.statusCode === 200 && reg3.ActionRequired === true && reg3.StatusLabel === 'Please send the signed letter.', 'action-required sets ActionRequired and keeps the officer\'s own label', JSON.stringify(reg3).slice(0, 300));
  ok(wbs({ referenceId: 'NITDA-2026-00018', status: 'withdrawn' }).r.statusCode === 400, 'withdrawn is the citizen\'s, not a staff status: 400');
  ok(wbs({ referenceId: '', status: 'review' }).r.statusCode === 400, 'a write-back without a reference is refused: 400');
  ok(wbs({ referenceId: 'NITDA-2026-99999', status: 'review' }).r.statusCode === 404, 'an unknown reference answers 404');
  const anon = wbs({ referenceId: 'NITDA-2026-00018', status: 'review' }, WSEED2, { 'X-DGO-Action': 'writeback', 'x-ms-client-principal-name': 'officer@nitda.gov.ng' });
  ok(anon.r.statusCode === 401 && ((anon.db[L.REG] || [])[0]?.Status?.Value || (anon.db[L.REG] || [])[0]?.Status) === 'received', 'a write-back without a sign-in proof is refused (401), even naming a staff address, and changes nothing');
  const narrow = { ...WSEED2, [L.ROLES]: [{ ID: 1, Title: 'registry', RoleId: 'registry', Active: 1, AllowedRoutesJson: '["intake"]', PermissionsJson: '["membership"]' }] };
  ok(wbs({ referenceId: 'NITDA-2026-00018', status: 'review' }, narrow).r.statusCode === 403, 'a role without the correspondence route is refused: 403');
  const dep = sc(WSEED2);
  ok(dep.r.statusCode === 200 && dep.r.body?.referenceId === 'NITDA-2026-00042', 'a request without the writeback header is still a deposit');
}


/* ITEM-66: every mail send in every package writes an outbox receipt, followed by the outcome step that keeps a failed
   send failing its scope. */
{
  const dir = `${DIR}/identification-phase3`;
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
  ok(sends > 0 && !missing.length, `ITEM-66: every mail send in the Phase 3 packages (${sends}) writes an outbox receipt`, missing.join('; '));
}
console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
