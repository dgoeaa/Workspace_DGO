/**
 * Identification Phase 5 packages (npm run idphase5): the P5-1 survey and the P5-2 keys-first backfill.
 *
 *   1. the designer's limits and the kit's rules: every expression parses, every function is proven in the tenant,
 *      every reference names an action on its runAfter path, no variable, Until or Filter array, nesting ≤ 8
 *   2. the survey run in the strict simulator: what it counts, that it reads every page and writes nothing
 *   3. keys first run in the simulator: every unkeyed row of a keys-first list keyed once, by system update, the working copy
 *      untouched, a re-run writes nothing, a refused field fails the run visibly
 */
import { readFileSync, readdirSync } from 'node:fs';
import { conformancePackages } from '../scripts/build-identification-conformance.mjs';
import { parse, expressionsIn, functionsIn, Simulator } from '../scripts/lib/wdl-sim.mjs';
import { sharepoint } from './lib/identification-sharepoint.mjs';
import { runAfterReach } from './lib/run-after-reach.mjs';
import { findFlowArtifact } from '../scripts/lib/flow-artifact-name.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages';
const SURVEY = J(await findFlowArtifact(`${DIR}/identification-phase5`, 'ID_Phase5_Survey', 'paste.json'));
const KEYS = J(await findFlowArtifact(`${DIR}/identification-phase5`, 'ID_Phase5_Keys', 'paste.json'));
const PROV = J('docs/reference/identification/provisioning/identity-provisioning.json');
const CHECKED = J(`${DIR}/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json`).lists;
console.log('\nIdentification Phase 5 packages\n');

/* ---------------------------------------------------------------- static */
const fnsOf = (doc, into) => { for (const e of expressionsIn(doc)) { try { functionsIn(parse(e), into); } catch { /* not an expression */ } } return into; };
const baseline = new Set();
for (const f of readdirSync('docs/folio-Master-Flows-and-Endpoints/contracts/deployed')) {
  const t = readFileSync(`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/${f}`, 'utf8');
  if (t.includes('a0000000-0000-4000-8000-')) continue;
  try { fnsOf(JSON.parse(t), baseline); } catch { /* not JSON */ }
}
for (const p of Object.values(conformancePackages)) fnsOf(p, baseline);
for (const f of readdirSync(`${DIR}/identification-phase1`)) if (f.endsWith('.json')) fnsOf(J(`${DIR}/identification-phase1/${f}`), baseline);
fnsOf(J(`${DIR}/identification-phase2/Scope_Phase2_ClaimTest_Flow.paste.json`), baseline);
/* Functions proven by flows retired on 2026-10-05: their definitions are held at the commit the record names. */
for (const fn of Object.keys(JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/tenant-function-proof.json', 'utf8')).functions)) baseline.add(fn);
const walk = (o, d, cb) => { for (const [n, a] of Object.entries(o || {})) { cb(n, a, d); walk(a.actions, d + 1, cb); if (a.else) walk(a.else.actions, d + 1, cb); } };
for (const [label, PKG] of [['SURVEY', SURVEY], ['KEYS', KEYS]]) {
  const unparsed = [];
  for (const e of expressionsIn(PKG)) { try { parse(e); } catch (err) { unparsed.push(`${String(e).slice(0, 80)} — ${err.message}`); } }
  ok(!unparsed.length, `${label}: every expression parses`, unparsed.slice(0, 3).join(' | '));
  const used = fnsOf(PKG, new Set());
  const unproven = [...used].filter((f) => !baseline.has(f));
  ok(!unproven.length, `${label}: every function it uses (${used.size}) is proven in the tenant`, unproven.join(', '));
  const acts = []; let deepest = 0;
  walk(PKG.serializedValue.actions, 1, (n, a, d) => { acts.push([n, a]); deepest = Math.max(deepest, d); });
  const names = new Set(acts.map(([n]) => n));
  const bad = [];
  for (const m of JSON.stringify(PKG.serializedValue).matchAll(/(?:outputs|body|actions|items)\('([A-Za-z0-9_]+)'\)/g)) if (!names.has(m[1])) bad.push(m[1]);
  for (const [n, a] of acts) for (const r of Object.keys(a.runAfter || {})) if (!names.has(r)) bad.push(`${n} runAfter ${r}`);
  ok(!bad.length, `${label}: every reference and runAfter names an action (${acts.length} actions)`, [...new Set(bad)].join(', '));
  const banned = acts.filter(([, a]) => ['InitializeVariable', 'SetVariable', 'AppendToArrayVariable', 'IncrementVariable', 'Until', 'Query'].includes(a.type));
  ok(!banned.length, `${label}: no variable, no Until, no Filter array (B1)`, banned.map(([n]) => n).join(', '));
  ok(deepest <= 8, `${label}: nested no deeper than 8 (deepest ${deepest})`);
  const unreachable = runAfterReach(PKG.serializedValue.actions);
  ok(!unreachable.length, `${label}: every step reads only actions on its runAfter path`, unreachable.join('; '));
  const literalLists = JSON.stringify(PKG).match(/lists\(guid'[0-9a-f-]{36}'\)/g) || [];
  ok(!literalLists.length, `${label}: no list is addressed by a hard-coded GUID; every list comes from Flow Configuration`, literalLists.join(', '));
  const conn = Object.keys(PKG.allConnectionData).length, http = acts.filter(([, a]) => a.type === 'OpenApiConnection').length;
  ok(conn === http, `${label}: every connector step has its connection data (${http})`);
}
{
  const writes = []; walk(SURVEY.serializedValue.actions, 1, (n, a) => { if (a.type === 'OpenApiConnection' && a.inputs.host.operationId === 'HttpRequest' && a.inputs.parameters['parameters/method'] !== 'GET') writes.push(n); });
  ok(!writes.length, 'SURVEY: every SharePoint call is a GET', writes.join(', '));
  const sel = JSON.stringify(SURVEY).match(/\$select=[^&"]+/g) || [];
  const personal = sel.filter((s) => /SenderEmail|SenderName|Email|Name,|Message|Description|Subject/.test(s));
  ok(!personal.length, 'SURVEY: it selects no personal field (names, e-mail addresses, message text)', personal.join(' | '));
}

/* ---------------------------------------------------------------- the lists */
const NOW = '2026-10-06T09:00:00.000Z';
const L = Object.fromEntries(PROV.lists.map((l) => [l.datasetKey, (l.listGuid || CHECKED.find((c) => c.list === l.title)?.listGuid || '').toLowerCase()]));
const CONFIG = PROV.flowConfiguration.rows.map((r) => {
  const m = /^DATASET_(.+)_LIST_ID$/.exec(r.Title);
  return { Title: r.Title, ConfigValue: m && L[m[1]] ? L[m[1]] : r.ConfigValue };
});
const run = (PKG, seed, opts = {}) => {
  const sp = sharepoint(seed, { config: CONFIG, ...opts });
  const sim = new Simulator({ variables: {}, connectors: sp.connectors, clock: () => NOW,
    workflow: { name: 'flow-p5', run: { name: 'RUN-P5' } },
    trigger: { outputs: { body: {}, headers: { 'x-ms-user-email': 'owner@nitda.gov.ng' } } } });
  sim.declare(PKG).run(PKG);
  return { sim, db: sp.db, calls: sp.calls };
};
const errors = (sim) => sim.templateErrors.map((t) => `${t.action}: ${t.message}`);
const K = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* Global Tracking Queue across two pages (IDs past 5,000), keyed and unkeyed, with legacy identifiers. */
const GTQ = [
  { ID: 1, Created: '2024-03-01T10:00:00Z', Reference_ID: ' 20240301-11-ADM-HRM-1 ', RefIDD: '311', ParentTaskId: null, ActivityTrackingID: '' },
  { ID: 2, Created: '2024-07-01T10:00:00Z', Reference_ID: '20240701-12-ADM-HRM-2', RefIDD: 'AAMkAGI2THVSAAA='.padEnd(150, 'x'), ParentTaskId: 1, ActivityTrackingID: 'AAMk-1' },
  { ID: 3, Created: '2025-01-05T10:00:00Z', Reference_ID: '', RefIDD: '', ParentTaskId: 0, ActivityTrackingID: '' },
  { ID: 4, Created: '2026-10-05T10:00:00Z', EntityKey: K(4), TaskRef: 'TASK-2026-00417', IdState: 'ACTIVE', Rev: 1 },
  { ID: 5004, Created: '2025-12-31T23:00:00Z', Reference_ID: '20251231-9-FIN-BUD-5004', RefIDD: '9' },
  { ID: 9999, Created: '2026-02-02T10:00:00Z' },
];
const OPS = [{ ID: 10, Created: '2023-05-01T00:00:00Z', ReferenceId: '' }, { ID: 22109, Created: '2026-10-05T00:00:00Z', ReferenceId: 'NITDA-2026-00022', EntityKey: K(22109) }];
const MIRROR = [{ ID: 7, Created: '2025-02-01T00:00:00Z', TaskRef: '' }];
const REG = [
  { ID: 1, Created: '2026-09-01T00:00:00Z', ReferenceId: 'NITDA-2026-123', LocalId: 'NITDA-ABCDEFGHJ', Channel: 'portal', Status: 'received', SenderEmail: 'citizen@example.com' },
  { ID: 2, Created: '2026-09-02T00:00:00Z', ReferenceId: 'NITDA-2026-123', LocalId: '', Channel: 'portal', Status: 'received', SenderEmail: 'other@example.com' },
  { ID: 3, Created: '2026-10-04T00:00:00Z', ReferenceId: 'NITDA-2026-00017', EntityKey: K(30), Channel: 'portal', Status: 'received' },
];
const COUNTERS = [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 17 }, { ID: 8, Title: 'TASK-2026', Prefix: 'TASK', Year: '2026', CurrentSequence: 417 }];
const MINUTES = [{ ID: 2, Created: '2025-06-01T00:00:00Z' }, { ID: 6001, Created: '2025-06-02T00:00:00Z' }];
const seed = () => ({ [L.TASK_QUEUE]: structuredClone(GTQ), [L.OPS_WORKING_REGISTER]: structuredClone(OPS), [L.TASK_QUEUE_MIRROR]: structuredClone(MIRROR),
  [L.INTAKE_REGISTER]: structuredClone(REG), [L.SEQUENCE_COUNTERS]: structuredClone(COUNTERS), [L.MINUTES]: structuredClone(MINUTES),
  [L.SUPPORT_CASES]: [{ ID: 1, Created: '2026-08-01T00:00:00Z', Title: 'CASE-20260801-ABC123', CaseRef: '', AboutReference: 'NITDA-2026-123' }] });

/* ---------------------------------------------------------------- P5-1 survey */
console.log('\n  P5-1 survey simulated run\n');
{
  const { sim, db, calls } = run(SURVEY, seed());
  ok(!errors(sim).length, 'the survey runs with no template error', errors(sim).join(' | ').slice(0, 500));
  ok(calls.every((c) => c.method === 'GET'), 'it sends only GET requests');
  const mail = (db.mail || [])[0] || {};
  const att = mail['emailMessage/Attachments']?.[0];
  const report = att ? JSON.parse(Buffer.from(att.ContentBytes, 'base64').toString('utf8')) : {};
  ok(mail['emailMessage/To'] === 'owner@nitda.gov.ng' && att?.Name === 'p5-1-survey.json' && String(mail['emailMessage/Body']).includes('<table>'), 'it e-mails the person who ran it a table and p5-1-survey.json');
  const ds = Object.fromEntries((report.datasets || []).map((d) => [d.dataset, d]));
  ok((report.datasets || []).length === 13, 'it reports every list it measures (13; not the DEV_OPS test list)', `${(report.datasets || []).length}`);
  const t = ds.TASK_QUEUE || {};
  ok(t.rows === 6 && t.maxId === 9999 && t.covered === true && t.withoutEntityKey === 5, 'Global Tracking Queue: every page read (IDs to 9,999), 6 rows, 5 without an Entity Key', JSON.stringify(t).slice(0, 300));
  const y = Object.fromEntries((t.byYear || []).map((r) => [r.year, r]));
  ok(y[2024]?.rows === 2 && y[2025]?.rows === 2 && y[2026]?.rows === 2 && y[2024]?.withoutReference === 2 && y[2026]?.withoutReference === 1 && t.withoutReference === 5,
    'rows per year of creation, and per year the rows still without a TaskRef (what §12.3 3 claims)', JSON.stringify(t.byYear?.filter((r) => r.rows)));
  ok(JSON.stringify(t.legacy) === JSON.stringify({ referenceIdComposite: 3, refIddItemId: 2, refIddMessageId: 1, parentTask: 1, activityTrackingId: 1 }), 'the legacy identifiers: Reference_ID composites, RefIDD item IDs and message IDs, ParentTask, ActivityTrackingID', JSON.stringify(t.legacy));
  ok(ds.OPS_WORKING_REGISTER?.rows === 2 && ds.OPS_WORKING_REGISTER.maxId === 22109 && ds.OPS_WORKING_REGISTER.withoutReference === 1 && ds.OPS_WORKING_REGISTER.keysFirst === false, 'DGO DIGITAL OPS: read past ID 22,108; one row without a ReferenceId; not a keys-first list', JSON.stringify(ds.OPS_WORKING_REGISTER).slice(0, 200));
  ok(ds.MINUTES?.covered === false && ds.MINUTES.maxId === 6001 && ds.MINUTES.rows === 1, 'a list whose highest ID lies beyond the pages read is reported as not all read', JSON.stringify(ds.MINUTES).slice(0, 200));
  const intake = report.intake?.INTAKE_REGISTER || [];
  ok(intake.length === 3 && intake.filter((r) => r.ReferenceId === 'NITDA-2026-123').length === 2 && intake.every((r) => !('SenderEmail' in r)) && intake[2].hasEntityKey === true,
    'Portal Registry row by row: the reference shapes from which duplicates are counted (B4), no sender address', JSON.stringify(intake).slice(0, 300));
  ok((report.counters || []).length === 2 && report.counters.some((c) => c.Title === 'TASK-2026' && c.CurrentSequence === 417), 'every counter row');
  ok(report.intake?.SUPPORT_CASES?.[0]?.Title === 'CASE-20260801-ABC123', 'Portal Support Cases row by row (the interim CASE-YYYYMMDD-XXXXXX references)');
  ok(JSON.stringify(db[L.TASK_QUEUE]) === JSON.stringify(seed()[L.TASK_QUEUE].map((r) => ({ ...r, 'odata.etag': '"1"', '@odata.etag': '"1"' }))), 'nothing changed in any list');
}
{
  const { sim, db } = run(SURVEY, seed(), { lenientFilters: [] });
  const s = { ...seed() }; delete s[L.TASK_QUEUE];
  const r2 = run(SURVEY, s, {});
  ok((r2.db.mail || []).length === 1, 'a list that cannot be read does not stop the survey: the report is still sent');
  void sim; void db;
}

/* ---------------------------------------------------------------- P5-2 keys first */
console.log('\n  P5-2 keys first simulated runs\n');
const many = () => Array.from({ length: 250 }, (_, i) => ({ ID: 100 + i, Created: '2023-01-01T00:00:00Z' }));
{
  const s = seed(); s[L.TASK_QUEUE].push(...many());
  const { sim, db, calls } = run(KEYS, s);
  ok(!errors(sim).length, 'keys first runs with no template error', errors(sim).join(' | ').slice(0, 500));
  const gtq = db[L.TASK_QUEUE];
  const newKeys = gtq.filter((r) => r.ID !== 4).map((r) => r.EntityKey);
  ok(gtq.every((r) => /^[0-9a-f-]{36}$/.test(r.EntityKey || '')) && new Set(newKeys).size === newKeys.length, `Global Tracking Queue: every row has an Entity Key, each its own (${gtq.length} rows, both pages)`);
  ok(gtq.filter((r) => r.ID !== 4).every((r) => r.IdState === 'ACTIVE' && r.Rev === 1), 'each keyed row has IdState ACTIVE and Rev 1');
  ok(gtq.find((r) => r.ID === 4).EntityKey === K(4) && gtq.find((r) => r.ID === 4).TaskRef === 'TASK-2026-00417', 'a row that had a key keeps it');
  ok(gtq.every((r) => r['odata.etag'] === '"1"'), 'by system update: no row\'s version changed');
  const batches = calls.filter((c) => c.uri === '_api/$batch');
  const gtqBatches = batches.filter((c) => (c.batch || 0) > 0 && String(c.body || '').includes(L.TASK_QUEUE));
  ok(Math.max(...batches.map((c) => c.batch || 0)) <= 100 && gtqBatches.length === 4, `at most 100 rows a batch: 255 unkeyed task rows in ${gtqBatches.length} batches (3 on the first page, 1 on the second)`, batches.map((c) => c.batch).join(','));
  ok(db[L.OPS_WORKING_REGISTER].find((r) => r.ID === 10).EntityKey === undefined, 'DGO DIGITAL OPS is not touched: a working copy takes its register row\'s key');
  ok(db[L.TASK_QUEUE_MIRROR][0].EntityKey === undefined && !calls.some((c) => String(c.uri).includes(L.TASK_QUEUE_MIRROR) || String(c.body || '').includes(L.TASK_QUEUE_MIRROR)), 'DEV_OPS_Global_Tracking_Queue, a test list, is neither read nor written');
  ok(db[L.INTAKE_REGISTER].filter((r) => r.ID !== 3).every((r) => r.EntityKey && r.Rev === 1) && db[L.INTAKE_REGISTER][2].EntityKey === K(30), 'Portal Registry: unkeyed rows keyed, the keyed one unchanged');
  ok(db[L.MINUTES].find((r) => r.ID === 6001).EntityKey, 'the pages follow the highest ID, so a row past ID 5,000 on a small list is keyed too');
  const mail = (db.mail || [])[0] || {};
  const rep = JSON.parse(Buffer.from(mail['emailMessage/Attachments'][0].ContentBytes, 'base64').toString('utf8'));
  ok(rep.lists.length === 10 && rep.lists.every((l) => l.outcome === 'Succeeded'), 'the report lists the 10 keys-first lists, each Succeeded', JSON.stringify(rep.lists.map((l) => `${l.dataset}:${l.outcome}`)));
  /* Re-run: nothing left to key, nothing written. */
  const again = run(KEYS, db);
  ok(!again.calls.some((c) => c.uri === '_api/$batch' && (c.batch || 0) > 0) && JSON.stringify(again.db[L.TASK_QUEUE].map((r) => r.EntityKey)) === JSON.stringify(gtq.map((r) => r.EntityKey)), 'a second run finds nothing to key and writes nothing');
}
{
  /* A list missing a column: SharePoint refuses that field; the batch check fails and the report says so. */
  const cols = { [L.TASK_QUEUE]: new Set(['EntityKey', 'IdState']) };
  const { db } = run(KEYS, seed(), { columns: cols });
  const rep = JSON.parse(Buffer.from(db.mail[0]['emailMessage/Attachments'][0].ContentBytes, 'base64').toString('utf8'));
  ok(rep.lists.find((l) => l.dataset === 'TASK_QUEUE').outcome === 'Failed' && rep.lists.find((l) => l.dataset === 'INTAKE_REGISTER').outcome === 'Succeeded', 'a refused field fails that list\'s run (outcome Failed) and the other lists still run', JSON.stringify(rep.lists.map((l) => `${l.dataset}:${l.outcome}`)));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
