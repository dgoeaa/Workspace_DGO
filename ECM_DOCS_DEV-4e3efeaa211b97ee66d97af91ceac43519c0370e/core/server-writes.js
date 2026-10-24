import { State } from './state.js';
import { WriteManager } from './write-manager.js';
import { RoleRouteAccess, canonicalRole } from '../config/rbac.config.js';
import { getCurrentUser } from './current-user.js';
import { isServerKey, Payloads } from './server-payloads.js';
export * from './server-payloads.js';

/* ─── Server writes ──────────────────────────────────────────────────────────────────────
 * Every change a Folio screen records on the server, built in the shape the Dynamic Actions
 * package the tenant runs accepts (packages/identification-phase4/DYNAMIC_ACTIONS…paste.json,
 * per registers/identification-paste-ledger.json).
 *
 * Module rationalisation, F-16 and F-17 (docs/architecture/MODULE_RATIONALISATION.md): the screens
 * sent operations the flow does not know (`transition`, `route`, `appendMinute`, `update_status`,
 * `delete_record`) and records nested under `data`, where the flow reads `entityType`, `title` and
 * `entityKey` at the top level. 14 of 15 writes were refused, and many actions sent nothing at all.
 * Every write now goes through one of the builders below, and tests/server-writes.test.mjs runs each
 * one through the strict simulator against the running package. No flow package changed.
 *
 * What the running package records, and where:
 *   a task's status, priority, comment and due date   update-task        Global Tracking Queue
 *   a document's Treated / Not Treated state          transition-status  DGO DIGITAL OPS
 *   a minute (comment) on a task                      upsert-record MIN  Task_Comments
 *   an approval, or a decision on a document          upsert-record APR  Approvals
 *   a brief, meeting, project or reminder             upsert-record BRF, MTG, PRJ, RMD
 *   a new incoming record                             register           Intake Register
 *   a registry file, and each move of it              open-file, move-file
 *   anything else worth keeping                       logauditevent      DGO_AuditLog
 */

/* ─── What a role may write ───────────────────────────────────────────────────────────────
 * The flow checks the caller's DGO_RolePermissions routes before it writes (Compose_Dynamic_Required_Route):
 * transition-status needs `correspondence`, APR needs `approvals`, BRF/MTG/PRJ their own screen, MIN and RMD
 * `orchestrator`, open-file and move-file `registry`. This mirror of that rule lets a screen choose the write
 * the server will accept rather than send one it will refuse. */
const ROUTE_FOR = Object.freeze({ 'transition-status': 'correspondence', register: 'correspondence', 'open-file': 'registry', 'move-file': 'registry', BRF: 'briefs', MTG: 'meetings', PRJ: 'projects', APR: 'approvals', MIN: 'orchestrator', RMD: 'orchestrator' });
export function roleMayWrite(payload, role = canonicalRole(getCurrentUser(State.get())?.role || 'viewer')) {
  const route = ROUTE_FOR[payload.entityType] || ROUTE_FOR[payload.operation] || '';
  if (!route) return true;
  const xs = RoleRouteAccess[role] || [];
  return xs.includes('*') || xs.includes(route);
}

/* ─── Sending ─────────────────────────────────────────────────────────────────────────── */
/** Why a write could not be sent, in a sentence for the officer. */
export function refusalMessage(error) {
  const status = Number(error?.status || 0);
  if (error?.notOnServer) return 'This record exists only on this device, so the server has nothing to change.';
  if (/is not configured/.test(String(error?.message || ''))) return 'This workspace has no address for the server, so nothing was sent or saved. Ask IT to configure it.';
  if (status === 403) return 'The server refused it: your role does not allow this change.';
  if (status === 404) return 'The server has no record matching this one, so nothing was changed.';
  if (status === 409) return 'The record changed on the server while you were working. Refresh, then try again.';
  if (status >= 400 && status < 500) return 'The server did not accept it, so nothing was changed.';
  return 'The server could not be reached. The change is held and will be sent again when the connection returns.';
}

/**
 * Send one server write. Resolves with the flow's data; rejects with an error that carries `status`
 * and `refused` (a 4xx: sending it again cannot succeed, so it is not queued; core/data-client.js).
 */
export async function send(payload, { module, ref = '' } = {}) {
  if (payload.operation === 'update-task' && !payload.docId) throw Object.assign(new Error('task not on the server'), { notOnServer: true, refused: true });
  if (payload.operation === 'transition-status' && !payload.docId && !payload.ref) throw Object.assign(new Error('document not on the server'), { notOnServer: true, refused: true });
  if (payload.entityType === 'MIN' && !isServerKey(String(payload.parentKey).slice(4))) throw Object.assign(new Error('task has no server key'), { notOnServer: true, refused: true });
  if (payload.operation === 'move-file' && !isServerKey(String(payload.target).slice(4))) throw Object.assign(new Error('file not on the server'), { notOnServer: true, refused: true });
  const res = await WriteManager.backend({ module, action: payload.operation, endpoint: 'DYNAMIC_ACTIONS', payload, ref: ref || payload.ref || '' });
  const data = res?.data?.data ?? res?.data ?? {};
  return data;
}

/** A server write that must not stop the screen: it resolves to { ok, data } or { ok:false, message }. */
export async function attempt(payload, opts = {}) {
  try { return { ok: true, data: await send(payload, opts) }; }
  catch (error) { return { ok: false, error, message: refusalMessage(error), queued: !error?.refused && !error?.notOnServer && !/is not configured/.test(String(error?.message || '')) }; }
}

/* ─── Decisions on a document (F-4, F-5, F-18) ────────────────────────────────────────────
 * Intake and the DG/CEO hub set the same decisions, and now record them the same way, on the server, before anything
 * is e-mailed:
 *   - the document's Treated / Not Treated state (transition-status), where the role may write correspondence;
 *   - an APR decision record naming the document (Accepted, Declined, Delegated, Archived), where the role may write
 *     approvals. Its title says which screen decided it, which is what the record lacked (F-4);
 *   - otherwise an audit event in DGO_AuditLog, which every role may write.
 * A record that exists only on this device has nothing on the server to change; the caller is told so. */
const DECISION_VALUE = Object.freeze({ Accepted: 'Accepted', Declined: 'Declined', Delegated: 'Delegated', Archived: 'Archived' });
export async function recordDecision(record, status, { surface = 'correspondence', module = surface } = {}) {
  const onServer = !!serverIdOf(record) || isServerKey(record?.entityKey);
  if (!onServer) return { ok: true, deviceOnly: true, recorded: [], message: 'Saved on this device only: this record has not reached the server, so there is nothing there to change.' };
  const ref = record.referenceId || String(record.id || '');
  const writes = [];
  if (record.recordType !== 'REC' && serverIdOf(record)) {
    const state = Payloads.documentState(record, { treated: status !== 'Pending' });
    if (roleMayWrite(state)) writes.push(['the document\'s state', state]);
  }
  if (DECISION_VALUE[status]) {
    const apr = Payloads.decision(record, { decision: DECISION_VALUE[status], surface });
    if (roleMayWrite(apr)) writes.push(['the decision', apr]);
  }
  if (!writes.some(([what]) => what === 'the decision')) writes.push(['the decision', Payloads.event(`decision:${String(status).toLowerCase()}`, { ref, module })]);
  const recorded = [];
  for (const [what, payload] of writes) {
    const r = await attempt(payload, { module, ref });
    if (!r.ok) return { ok: false, recorded, message: recorded.length ? `${refusalMessage(r.error)} (${recorded.join(' and ')} ${recorded.length === 1 ? 'was' : 'were'} recorded.)` : r.message, queued: r.queued };
    recorded.push(what);
  }
  return { ok: true, recorded, message: 'Recorded on the server.' };
}
const serverIdOf = (r) => (/^\d+$/.test(String(r?.sourceId ?? '')) ? String(r.sourceId) : '');

/* ─── Briefs, meetings and projects (F-16) ────────────────────────────────────────────────
 * The server holds each as a register row (BRF, MTG, PRJ) with its title and identity; FETCH_ALL returns them and
 * core/data-loader.js merges them by key with what this device knows (status, dates, attendees, owner). A record is
 * created on the server first and takes the key the server issues; a change of status is recorded as an audit event
 * against that key, because the running package has no status column for these lists. */
export async function saveRegisterRecord(type, record, { module, title = record?.title || record?.name || '', status = '' } = {}) {
  const ref = record?.entityKey || record?.id || '';
  if (!isServerKey(record?.entityKey)) {
    if (record?.id && !record?.creating) return { ok: true, deviceOnly: true, message: 'Saved on this device only: this record has not reached the server.' };
    const w = await attempt(Payloads.record(type, { title }), { module, ref });
    if (!w.ok) return w;
    return { ok: true, entityKey: w.data.entityKey, created: true };
  }
  const w = await attempt(Payloads.record(type, { entityKey: record.entityKey, title }), { module, ref });
  if (!w.ok) return w;
  if (status) { const e = await attempt(Payloads.event(`${type.toLowerCase()}:${String(status).toLowerCase()}`, { ref: record.entityKey, module }), { module, ref }); if (!e.ok) return e; }
  return { ok: true, entityKey: record.entityKey };
}
