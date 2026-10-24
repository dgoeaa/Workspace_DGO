import { normalizePriority } from '../config/priority.config.js';

/* The payload builders behind core/server-writes.js, kept free of browser state so tests/server-writes.test.mjs can
   run each one through the strict simulator against the Dynamic Actions package the tenant runs. */
const KEY36 = /^[0-9a-f-]{36}$/i;
export const isServerKey = (k) => KEY36.test(String(k || ''));
/** The SharePoint item ID of a fetched row, or '' for a record that exists only on this device. */
export const serverId = (r) => { const v = String(r?.sourceId ?? ''); return /^\d+$/.test(v) ? v : ''; };

/* Global Tracking Queue: Progress is a Choice column (evidence/2026-10-10-list-columns.json). */
export const TASK_PROGRESS = Object.freeze(['Not started', 'In progress', 'Completed', 'Blocked', 'Behind']);
export function progressFor(status) {
  const x = String(status || '').trim().toLowerCase();
  if (!x) return '';
  if (/^not started|^new$|^pending$|^assigned$/.test(x)) return 'Not started';
  if (/complete|closed|done|cancel/.test(x)) return 'Completed';
  if (/block|escalat/.test(x)) return 'Blocked';
  if (/behind|overdue/.test(x)) return 'Behind';
  return 'In progress';
}
/** The task's status as the server's Progress column states it, read back into Folio's vocabulary. */
export function taskStatusFromProgress(progress) {
  const x = String(progress || '').toLowerCase();
  if (x.includes('complete')) return 'Completed';
  if (x.includes('block')) return 'Blocked';
  if (x.includes('behind')) return 'Behind';
  if (x.includes('progress')) return 'In Progress';
  return 'Not Started';
}
const SERVER_PRIORITY = Object.freeze({ urgent: 'Critical', high: 'High', normal: 'Medium', low: 'Low' });
export const serverPriority = (p) => SERVER_PRIORITY[normalizePriority(p)] || '';

/** The key a decision record (APR) carries to name the document it decides: REC:<key> for an Intake Register record.
 *  DGO DIGITAL OPS has no qualified type of its own, so its documents are named OPS:<entityKey>, or OPS-ID:<item ID>
 *  before one is set. */
export const documentKey = (doc) => (doc?.recordType === 'REC' && isServerKey(doc?.entityKey) ? `REC:${String(doc.entityKey).toLowerCase()}` : isServerKey(doc?.entityKey) ? `OPS:${String(doc.entityKey).toLowerCase()}` : serverId(doc) ? `OPS-ID:${serverId(doc)}` : '');

/* ─── Payload builders (pure: tests run each through the simulator) ───────────────────── */
export const Payloads = Object.freeze({
  taskUpdate(task, { status, priority, comments, dueDate } = {}) {
    const p = { operation: 'update-task', action: 'update_task', docId: serverId(task), ref: String(task?.referenceId || '') };
    const progress = status === undefined ? '' : progressFor(status);
    if (progress) p.progress = progress;
    if (priority !== undefined && serverPriority(priority)) p.priority = serverPriority(priority);
    if (comments) p.comments = String(comments);
    if (dueDate) p.dueDate = String(dueDate);
    return p;
  },
  documentState(doc, { treated }) {
    return { operation: 'transition-status', action: treated ? 'mark_treated' : 'mark_not_treated', docId: serverId(doc), ref: String(doc?.referenceId || ''), status: treated ? 'Treated' : 'Not Treated' };
  },
  minute(task, { text }) {
    return { operation: 'upsert-record', entityType: 'MIN', action: 'add_minute', ref: String(task?.referenceId || ''), text: String(text || ''), parentKey: `TSK:${String(task?.entityKey || '').toLowerCase()}` };
  },
  record(entityType, { entityKey = '', title = '', decision = '', ref = '', parentKey = '', text = '', localKey = '', assignedTo = '', dueAt = '' } = {}) {
    const p = { operation: 'upsert-record', entityType, action: 'upsert_record', title: String(title || '').slice(0, 255) };
    if (isServerKey(entityKey)) p.entityKey = String(entityKey).toLowerCase();
    for (const [k, v] of Object.entries({ decision, ref, parentKey, text, localKey, assignedTo, dueAt })) if (v) p[k] = String(v);
    return p;
  },
  decision(doc, { decision, surface, title }) {
    return Payloads.record('APR', { title: title || `${surface === 'executive' ? 'DG/CEO decision' : 'Intake decision'}: ${doc?.subject || doc?.title || doc?.referenceId || ''}`, decision, ref: doc?.referenceId || '', parentKey: documentKey(doc) });
  },
  register({ subject, channel = 'internal', senderEmail = '' }) {
    const p = { operation: 'register', action: 'register', subject: String(subject || '').slice(0, 255), channel };
    if (senderEmail && /@/.test(senderEmail)) p.senderEmail = String(senderEmail).trim();
    return p;
  },
  openFile({ title, toOrgKey = '', legacyNumber = '' }) {
    const p = { operation: 'open-file', action: 'open_file', title: String(title || '').slice(0, 255) };
    if (toOrgKey) p.toOrgKey = String(toOrgKey);
    if (legacyNumber) p.legacyNumber = String(legacyNumber);
    return p;
  },
  moveFile(file, { toOrgKey, movementAction = 'MOVED', reason = '' }) {
    const p = { operation: 'move-file', action: 'move_file', target: `REG:${String(file?.entityKey || '').toLowerCase()}`, toOrgKey: String(toOrgKey || ''), movementAction: String(movementAction) };
    if (reason) p.reason = String(reason).slice(0, 1000);
    return p;
  },
  event(action, { ref = '', module = '', source = 'folio' } = {}) {
    return { operation: 'logauditevent', action: String(action), ref: String(ref || ''), module: String(module || ''), source };
  },
});
