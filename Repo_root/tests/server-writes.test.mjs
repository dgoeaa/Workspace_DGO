/**
 * Every server write a Folio screen makes, run through the strict simulator against the Dynamic Actions package the
 * tenant runs (registers/identification-paste-ledger.json). Module rationalisation F-16: 14 of the 15 writes the
 * screens sent were refused at the flow's gate. The payloads here come from core/server-payloads.js, the builders the
 * screens now use, so this test sends exactly what the client sends, wrapped as core/data-client.js wraps it.
 *
 * It also proves the refusals the screens rely on: a role the server does not allow is answered 403, and a write the
 * flow cannot accept is a 4xx, which core/data-client.js shows and does not queue (F-22).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Simulator } from '../scripts/lib/wdl-sim.mjs';
import { sharepoint, declaredVariables } from './lib/identification-sharepoint.mjs';
import { findFlowArtifact } from '../scripts/lib/flow-artifact-name.mjs';
import { Payloads, documentKey, progressFor, taskStatusFromProgress } from '../core/server-payloads.js';
import { RoleRouteAccess } from '../config/rbac.config.js';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages';
const CAPS = 'docs/folio-Master-Flows-and-Endpoints/captures';
const LEDGER = J('docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json');
const PROV = J('docs/reference/identification/provisioning/identity-provisioning.json');
const P1L = J(`${DIR}/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json`).lists;
const NOW = '2026-10-20T09:00:00.000Z';

console.log('\nServer writes against the running Dynamic Actions package\n');

const DA_FILE = await findFlowArtifact(`${DIR}/identification-phase4`, 'IP_Dynamic_Global_Actions_Endpoint', 'paste.json');
const running = (LEDGER.entries || LEDGER.packages || LEDGER.ledger || []).find?.((e) => String(e.file || '').startsWith('DYNAMIC_ACTIONS__'));
ok(!running || DA_FILE.endsWith(running.file), 'the package tested is the one the paste ledger says the tenant runs', `${DA_FILE} vs ${running?.file}`);
const DA = J(DA_FILE);
const DACAP = J(`${CAPS}/${readdirSync(CAPS).find((f) => f.startsWith('IP_Dynamic_Global_Actions_Endpoint__'))}`);

const CONFIG = PROV.flowConfiguration.rows.map((r) => ({ Title: r.Title, ConfigValue: r.ConfigValue })).map((r) => {
  const m = /^DATASET_(.+)_(SITE_URL|LIST_ID)$/.exec(r.Title); if (!m) return r;
  const l = PROV.lists.find((x) => x.datasetKey === m[1]); if (!l || l.listGuid) return r;
  const hit = P1L.find((x) => x.list === l.title); return hit ? { ...r, ConfigValue: m[2] === 'LIST_ID' ? hit.listGuid : `https://nitdanigeria.sharepoint.com/sites/${hit.site}` } : r;
});
/* DGO_TaskReminders (release 38) is bound in Flow Configuration after the provisioning record was written. */
CONFIG.push({ Title: 'DATASET_REMINDERS_SITE_URL', ConfigValue: 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING' }, { Title: 'DATASET_REMINDERS_LIST_ID', ConfigValue: 'a0d0c0e0-0000-4000-8000-0000000000ad' });
const G = (key) => CONFIG.find((r) => r.Title === `DATASET_${key}_LIST_ID`)?.ConfigValue;
const T = { REG: G('INTAKE_REGISTER'), MIN: G('MINUTES'), BRF: G('BRIEFS'), MTG: G('MEETINGS'), PRJ: G('PROJECTS'), APR: G('APPROVALS'), RMD: G('REMINDERS'), FILES: G('REGISTRY_FILES'), MOVES: G('FILE_MOVEMENTS'), TASKS: G('TASK_QUEUE'), OPS: G('OPS_WORKING_REGISTER'), SEQ: G('SEQUENCE_COUNTERS'), MAP: G('IDENTITY_MAP'),
  AUDIT: 'be0c7af1-b21d-4efe-8c30-53fc55598d95', DIRU: '3d591f5b-3f2f-409c-983a-a77b5c174834', ROLES: 'f675598b-271d-4200-8d75-2597aad4057f' };
const GTQ = 'ee82725a-c408-45e2-a8e8-facf7a092047', OPS = '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3';
const KT = '1ccccccc-0000-4000-8000-00000000000c', KO = '1ddddddd-0000-4000-8000-00000000000d', KB = '1bbbbbbb-0000-4000-8000-00000000000b';

/* The directory and role table hold Folio's own roles, with the routes config/rbac.config.js gives each. */
const ROLE_IDS = ['operator', 'director', 'executive', 'viewer'];
const SEED = {
  [T.DIRU]: ROLE_IDS.map((r, i) => ({ ID: i + 1, Email: `${r}@nitda.gov.ng`, Status: 'active', Role: r, UserId: `e1fa0000-0000-4000-8000-00000000000${i + 1}` })),
  [T.ROLES]: ROLE_IDS.map((r, i) => ({ ID: i + 1, RoleId: r, Active: 1, AllowedRoutesJson: JSON.stringify(RoleRouteAccess[r]) })),
  [T.SEQ]: [{ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: 19 }],
  [T.REG]: [{ ID: 12, Title: 'NITDA-2026-00012', ReferenceId: 'NITDA-2026-00012', EntityKey: KB, IdState: 'ACTIVE', Rev: 2 }],
  [GTQ]: [{ ID: 9, Title: 'Review', EntityKey: KT, TaskRef: 'TASK-2026-00421', RefIDD: 'NITDA-2026-00012', AssignedTo: 'viewer@nitda.gov.ng', Progress: { Value: 'Not started' }, Priority: { Value: 'Medium' }, Rev: 1 }],
  [OPS]: [{ ID: 22001, Title: 'Old letter', RefIDD: 'ACT-22001', EntityKey: KO, ReferenceId: 'NITDA-2025-00900', Status: { Value: 'Not Treated' }, IdState: { Value: 'ACTIVE' } }],
};
const COLS = (key, extra = []) => new Set([...(PROV.lists.find((x) => x.datasetKey === key)?.addColumns || []).map((c) => c.name), ...extra]);
const COLUMNS = { [T.MIN]: COLS('MINUTES', ['Description', 'RefIDD']), [T.APR]: COLS('APPROVALS'), [T.BRF]: COLS('BRIEFS'), [T.FILES]: COLS('REGISTRY_FILES'), [T.MOVES]: COLS('FILE_MOVEMENTS'), [T.REG]: COLS('INTAKE_REGISTER', ['ReferenceId', 'Status', 'SenderEmail']) };
const lenient = Object.values(T).concat([GTQ, OPS]).filter(Boolean);

let state = structuredClone(SEED), n = 0;
/* Wrapped exactly as core/data-client.js sends it: { action:'dynamicGlobalAction', payload:{ operation, ref, …, idempotencyKey,
   clientRequestHash } } (core/write-manager.js puts operation and ref first, then the payload, then the key). */
function send(payload, as = 'operator') {
  const key = `${'0'.repeat(56)}${String(++n).padStart(8, '0')}`;
  const body = { action: 'dynamicGlobalAction', payload: { operation: payload.operation, ref: payload.ref || '', ...payload, idempotencyKey: key, clientRequestHash: key }, userEmail: `${as}@nitda.gov.ng`, requestId: `req-${n}` };
  const sp = sharepoint(state, { config: CONFIG, lenientFilters: lenient, columns: COLUMNS });
  const sim = new Simulator({ variables: declaredVariables(DACAP), connectors: sp.connectors, clock: () => NOW,
    workflow: { name: '31c0aaf0-ddbb-478c-9a98-bc013265c4c7', run: { name: `RUN-SW-${n}` }, tags: { flowDisplayName: 'IP_Dynamic_Global_Actions_Endpoint' } },
    trigger: { startTime: NOW, outputs: { body, method: 'POST', queries: {}, headers: { Origin: 'https://folio.example' } } } });
  sim.declare(DA).run(DA);
  state = structuredClone(sp.db);
  const errs = sim.templateErrors.map((t) => `${t.action}: ${t.message}`).filter((m) => !/unknown function xml\(\)/.test(m));
  return { status: sim.response?.statusCode, d: sim.response?.body?.data || {}, errs, db: sp.db };
}
const show = (x) => `${x.status} ${JSON.stringify(x.d).slice(0, 220)} ${x.errs.join(' | ').slice(0, 200)}`;

/* ── tasks ─────────────────────────────────────────────────────────────── */
const task = { id: '9', sourceId: 9, referenceId: 'NITDA-2026-00012', entityKey: KT, assignedTo: 'viewer@nitda.gov.ng' };
ok(progressFor('Completed') === 'Completed' && progressFor('In Progress') === 'In progress' && progressFor('Not Started') === 'Not started' && progressFor('Acknowledged') === 'In progress' && progressFor('Escalated') === 'Blocked',
  'Folio task states map onto the Global Tracking Queue Progress choices');
ok(taskStatusFromProgress('In progress') === 'In Progress' && taskStatusFromProgress({}) === 'Not Started', 'Progress reads back into Folio states');
let x = send(Payloads.taskUpdate(task, { status: 'Completed' }));
ok(x.status === 200 && x.db[GTQ][0].Progress?.Value === 'Completed', 'My Work · Mark Completed: update-task by item ID is accepted and the task is Completed (F-3, F-17)', show(x));
x = send(Payloads.taskUpdate(task, { status: 'In Progress', priority: 'urgent', comments: 'Started on the draft' }), 'viewer');
ok(x.status === 200 && x.db[GTQ][0].Progress?.Value === 'In progress' && x.db[GTQ][0].Priority?.Value === 'Critical', 'Activities · Update work state: the assignee updates their own task, priority and comment (F-3)', show(x));
x = send(Payloads.taskUpdate({ ...task, sourceId: 'local-uuid' }, { status: 'Completed' }));
ok(!Payloads.taskUpdate({ ...task, sourceId: 'local-uuid' }, {}).docId, 'a task made only on this device has no item ID, so core/server-writes.js does not send it');

/* ── minutes (comments) ────────────────────────────────────────────────── */
x = send(Payloads.minute(task, { text: 'Please include the budget annex.' }));
const minute = (x.db[T.MIN] || []).find((r) => r.Description === 'Please include the budget annex.');
ok(x.status === 200 && minute && minute.ParentKey === `TSK:${KT}` && minute.RefIDD === 'NITDA-2026-00012', 'Comments · add: a minute on the task is accepted and written to Task_Comments, which FETCH_ALL returns as comments (F-17)', show(x));

/* ── approvals and decisions ───────────────────────────────────────────── */
x = send(Payloads.record('APR', { title: 'Travel to Lagos', decision: 'Pending', ref: 'APR-1' }), 'director');
const aprKey = x.d.entityKey;
ok(x.status === 200 && /^[0-9a-f-]{36}$/.test(aprKey || '') && (x.db[T.APR] || []).some((r) => r.EntityKey === aprKey && r.Decision === 'Pending'), 'Review & Approval · new request: an APR record is created Pending (F-17)', show(x));
x = send(Payloads.record('APR', { entityKey: aprKey, title: 'Travel to Lagos', decision: 'Approved' }), 'director');
ok(x.status === 200 && (x.db[T.APR] || []).find((r) => r.EntityKey === aprKey)?.Decision === 'Approved' && (x.db[T.APR] || []).find((r) => r.EntityKey === aprKey)?.Title === 'Travel to Lagos', 'Review & Approval · approve: the decision is recorded on the server before it is e-mailed (F-18)', show(x));
const doc = { id: '22001', sourceId: 22001, entityKey: KO, referenceId: 'NITDA-2025-00900', subject: 'Old letter' };
ok(documentKey(doc) === `OPS:${KO}` && documentKey({ sourceId: 22001 }) === 'OPS-ID:22001' && documentKey({ sourceId: 'x' }) === '', 'a decision names its document as OPS:<key>, or OPS-ID:<item ID>');
x = send(Payloads.decision(doc, { decision: 'Delegated', surface: 'executive' }), 'executive');
const dec = (x.db[T.APR] || []).find((r) => r.ParentKey === `OPS:${KO}`);
ok(x.status === 200 && dec?.Decision === 'Delegated' && /^DG\/CEO decision: Old letter/.test(dec?.Title || ''), 'DG/CEO · delegate: the decision is an APR record on the document, which says which screen decided it (F-4, F-18)', show(x));
x = send(Payloads.decision(doc, { decision: 'Accepted', surface: 'correspondence' }), 'operator');
ok(x.status === 403, 'the registry operator has no approvals route, so the server refuses their decision record (403); Intake records their decision as the document\'s state instead', show(x));

/* ── documents ─────────────────────────────────────────────────────────── */
x = send(Payloads.documentState(doc, { treated: true }));
ok(x.status === 200 && x.db[OPS][0].Status?.Value === 'Treated', 'Intake · Mark Accepted / Archive: the document is set Treated with transition-status (F-5)', show(x));
x = send(Payloads.documentState(doc, { treated: false }), 'executive');
ok(x.status === 403 && x.db[OPS][0].Status?.Value === 'Treated', 'a role without the correspondence route is refused (403) and the document is unchanged', show(x));
x = send(Payloads.event('decision:accepted', { ref: 'NITDA-2025-00900', module: 'correspondence' }), 'executive');
ok(x.status === 200, 'logauditevent records any decision in DGO_AuditLog, whatever the role', show(x));

/* ── new records ───────────────────────────────────────────────────────── */
x = send(Payloads.register({ subject: 'Letter from the Ministry', channel: 'internal', senderEmail: 'ps@fmcide.gov.ng' }));
ok(x.status === 200 && /^NITDA-2026-\d{5}$/.test(x.d.referenceId || '') && (x.db[T.REG] || []).some((r) => r.Subject === 'Letter from the Ministry' && r.Channel === 'internal'), 'Intake · Log New Memo: register issues the reference and writes the Intake Register (F-16)', show(x));
x = send(Payloads.register({ subject: 'Scanned letter', channel: 'scan' }));
ok(x.status === 200 && x.d.referenceId, 'Scan Intake: register with channel scan', show(x));
for (const [type, title, as] of [['BRF', 'Brief for the Minister', 'executive'], ['MTG', 'Board meeting', 'executive'], ['PRJ', 'Records digitisation', 'director']]) {
  x = send(Payloads.record(type, { title }), as);
  const key = x.d.entityKey;
  ok(x.status === 200 && /^[0-9a-f-]{36}$/.test(key || ''), `${type} create: the record is accepted at the top level of the payload (F-16)`, show(x));
  x = send(Payloads.record(type, { entityKey: key, title: `${title} (revised)` }), as);
  ok(x.status === 200, `${type} update by entityKey is accepted`, show(x));
}
x = send(Payloads.record('RMD', { title: 'Draft the policy note', ref: 'NITDA-2026-00012', assignedTo: 'viewer@nitda.gov.ng', dueAt: '2026-10-27T07:00:00.000Z', text: 'Agreed at: Board meeting' }));
ok(x.status === 200 && (x.db[T.RMD] || []).some((r) => r.AssignedTo === 'viewer@nitda.gov.ng' && r.ReminderStatus === 'scheduled' && r.DueAtUtc === '2026-10-27T07:00:00.000Z'), 'My Work reminder and meeting actions: a reminder (RMD) for the owner, which the sweep e-mails when due', show(x));

/* ── registry files ────────────────────────────────────────────────────── */
x = send(Payloads.openFile({ title: 'NITDA-2026-00012 · Letter from FMoF' }));
const fileKey = x.d.entityKey;
ok(x.status === 200 && /^FILE-2026-\d{5}$/.test(x.d.fileRef || '') && /^[0-9a-f-]{36}$/.test(fileKey || ''), 'Registry · register file: open-file issues the file number (F-24)', show(x));
x = send(Payloads.moveFile({ entityKey: fileKey }, { toOrgKey: 'DSU-ICT', movementAction: 'FOR_ACTION', reason: 'Please treat' }));
ok(x.status === 200 && (x.db[T.FILES] || []).find((r) => r.EntityKey === fileKey)?.CurrentHolder === 'DSU-ICT' && (x.db[T.MOVES] || []).some((r) => r.ToOrgKey === 'DSU-ICT'), 'Registry · route file: move-file changes the holder and records the movement (F-16, F-24)', show(x));

/* ── what the screens used to send ─────────────────────────────────────── */
for (const [label, p] of [['transition', { operation: 'transition', ref: 'NITDA-2026-00012', status: 'In Progress' }], ['route', { operation: 'route', ref: 'NITDA-2026-00012' }], ['appendMinute', { operation: 'appendminute', ref: 'NITDA-2026-00012' }], ['update_status', { operation: 'update-status', ref: 'NITDA-2026-00012' }], ['delete_record', { operation: 'delete-record', ref: 'NITDA-2026-00012' }], ['full_sync', { operation: 'full-sync' }]]) {
  x = send(p);
  ok(x.status === 400 && x.d.code === 'UNKNOWN_OPERATION', `the old ${label} is still refused 400 by the running flow, which is why no screen sends it now`, show(x));
}

/* ── the operation-name check (Phase 0, step 11) ─────────────────────────
   Every discriminator the client sends to Dynamic Actions (docs/…/dynamic-operations.json, derived from the code by
   scripts/derive-dynamic-operations.mjs) must be one the running package implements or recognises. This is the check
   that would have caught F-3 and F-5. The activity-* steps go to IP_Activity_Lifecycle_Endpoint, their own flow. */
{
  const kindExpr = JSON.stringify(DA).match(/"Compose_Dynamic_Kind"[\s\S]*?"inputs":\s*"(@if\(contains\(createArray\([^"]*)"/)?.[1] || '';
  const lists = [...kindExpr.matchAll(/createArray\(([^)]*)\)/g)].map((m) => m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')));
  const known = new Set(lists.flat());
  const alias = (op) => { const x = String(op).toLowerCase().replace(/_/g, '-'); return ({ 'transition-status': 'transitionstatus', 'log-audit-event': 'logauditevent', 'flag-document': 'update', 'archive-reference': 'archivereference', 'dispatch-outbound': 'dispatchoutbound' })[x] || x; };
  ok(lists.length === 2 && known.has('update-task') && known.has('upsert-record'), 'the running package\'s implemented and recognised operations are read from Compose_Dynamic_Kind', JSON.stringify(lists));
  const derived = J('docs/folio-Master-Flows-and-Endpoints/deployment/internal/dynamic-operations.json').operations;
  const direct = derived.filter((o) => o.sources.some((x) => !x.endsWith('.js')) || o.note?.includes('direct invoke'));
  ok(!direct.length, 'no screen calls invoke(\'DYNAMIC_ACTIONS\') directly; every write goes through core/server-writes.js or WriteManager', direct.map((o) => `${o.operation} (${o.sources.join(', ')})`).join('; '));
  const unknown = derived.filter((o) => !o.operation.startsWith('activity-') && !known.has(alias(o.operation)) && !known.has(o.operation.replace(/-/g, '')));
  ok(!unknown.length, `every operation the client sends to Dynamic Actions (${derived.length}) is one the running package knows`, unknown.map((o) => `${o.operation} (${o.sources.join(', ')})`).join('; '));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
