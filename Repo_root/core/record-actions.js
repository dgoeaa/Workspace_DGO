/**
 * The actions of the record page (essentials plan UX-202), each performed as the screen that owns it performs it today.
 *
 * Every action runs under its existing owner and audit name (config/action-ownership.config.js) through
 * executeOwnedAction, and sends the same server write that screen sends (core/server-writes.js). Nothing new reaches
 * the server: the record page is one more place to start an action, not a second implementation of what it records.
 * Each resolves to { ok, message } for the page to report; a refusal or a device-only record says so.
 *
 * Intake's triage lived inside modules/correspondence.js; it is here now and Intake calls it, so the record page and
 * Intake record a decision on a document the same way. Recording a dispatch is core/dispatch-actions.js, shared with
 * the Dispatch screen in the same way (UX-203).
 */
import { State } from './state.js';
import { executeOwnedAction } from './governed-actions.js';
import { attempt, Payloads, recordDecision, isServerKey } from './server-writes.js';
import { updateTaskState, setCorrespondenceStatus, enrichCorrespondence } from './enterprise-domain.js';
import { submitAcknowledgement } from './acknowledgement-service.js';
import { send as sendStaffNotice, StaffNotices } from './staff-notice-service.js';
import { CorrespondenceEmailService as Mail } from './correspondence-email-service.js';
import { ArchiveService } from './archive.js';
import { Entities } from './entity-store.js';
import { applyFlag, flagPayload, flagSpec, hasFlag } from './document-flags.js';
import { WriteManager } from './write-manager.js';
import { PendingQueue } from './pending-queue.js';

const refOf = (x) => String(x?.referenceId || x?.ref || x?.id || '');
const email = () => State.get().profile?.email || '';

/**
 * A decision on a document: recorded on the server first (recordDecision), then patched into this device's copy.
 * `surface` names the deciding screen ('correspondence' for Intake and the record page's triage, 'executive' for a
 * DG/CEO decision); `decidedBy` is shown on the record.
 */
export async function applyDocumentStatus(record, status, { extra = {}, surface = 'correspondence', decisionSurface = surface === 'executive' ? 'executive' : 'correspondence', decidedBy = 'Intake', module = 'correspondence', title = decisionSurface === 'executive' ? 'DG/CEO decision' : 'Intake decision' } = {}) {
  const dec = await recordDecision(record, status, { surface: decisionSurface });
  if (!dec.ok) return dec;
  const st = State.get();
  const rows = st.correspondence?.length ? st.correspondence : (st.activities || []).map((a) => enrichCorrespondence(a));
  const res = setCorrespondenceStatus({ ...st, correspondence: rows }, record.id, status, email(), { surface, extra: { ...extra, deviceOnly: dec.deviceOnly || record.deviceOnly || false, decidedBy: status === 'Pending' ? '' : decidedBy } });
  if (!res) return dec;
  const docs = record.recordType !== 'REC' && dec.recorded.includes("the document's state") ? { activities: (st.activities || []).map((a) => String(a.id) === String(record.id) ? { ...a, status: status === 'Pending' ? 'Not Treated' : 'Treated' } : a) } : {};
  const approvals = dec.recorded.includes('the decision') && ['Accepted', 'Declined', 'Archived', 'Delegated'].includes(status) ? { approvals: [...(st.approvals || []), { id: `decision-${record.id}-${Date.now()}`, parentKey: record.recordType === 'REC' ? `REC:${record.entityKey}` : (record.entityKey ? `OPS:${record.entityKey}` : `OPS-ID:${record.sourceId}`), referenceId: record.referenceId || '', title: `${title}: ${record.subject || ''}`, status: status.toLowerCase(), ts: new Date().toISOString() }] } : {};
  State.patch({ ...res.patch, ...docs, ...approvals }, { module, action: 'tracker:update', ref: refOf(record) });
  return dec;
}

/** Triage from the record page: Intake's triage, under Intake's owner and audit name. */
export const triage = (doc, status) => executeOwnedAction('correspondence', 'triage', () => applyDocumentStatus(doc, status, { surface: 'record' }), { ref: refOf(doc) });

/** A DG/CEO decision: the DG/CEO hub's decision, under its owner and audit name; a delegation e-mails the delegate. */
export async function decide(doc, decision, { delegate = '' } = {}) {
  const action = { Accepted: 'executive-approve', Declined: 'executive-return', Delegated: 'executive-escalate' }[decision];
  if (!action) return { ok: false, message: 'That is not a decision the DG/CEO records.' };
  return executeOwnedAction('executive', action, async () => {
    const dec = await applyDocumentStatus(doc, decision, { surface: 'executive', decidedBy: 'DG/CEO', module: 'executive' });
    if (!dec.ok) return dec;
    const notice = decision === 'Delegated' && delegate ? await sendStaffNotice(StaffNotices.delegation(doc, delegate)) : null;
    return { ...dec, notice };
  }, { ref: refOf(doc) });
}

/** Acknowledge receipt of a task: the acknowledgement queue's own submission. */
export const acknowledge = (task) => executeOwnedAction('acknowledgment', 'acknowledge', async () => {
  const r = await submitAcknowledgement(task, { source: 'record' });
  return { ok: true, queued: r?.status === 'queued', message: r?.status === 'queued' ? 'Acknowledgement recorded on this device; it reaches the server when the connection returns.' : 'Acknowledgement recorded and sent to the server.' };
}, { ref: refOf(task) });

/** Start work on, or complete, a task: My Work's update, written to the task on the server first. */
export function setTaskStatus(task, status) {
  const action = /complete/i.test(status) ? 'complete-action' : 'start-work';
  return executeOwnedAction('orchestrator', action, async () => {
    const w = await attempt(Payloads.taskUpdate(task, { status }), { module: 'orchestrator', ref: refOf(task) });
    if (!w.ok) return w;
    const r = updateTaskState(State.get(), task.id, { status, ...(action === 'start-work' ? { startDate: task.startDate || new Date().toISOString() } : { completedAt: new Date().toISOString() }) }, email(), { surface: 'record' });
    if (r) State.patch(r.patch, { module: 'orchestrator', action: action === 'start-work' ? 'task:start' : 'task:complete', ref: refOf(task) });
    return { ok: true, message: action === 'start-work' ? 'Work started, recorded on the server.' : 'Task completed, recorded on the server.' };
  }, { ref: refOf(task) });
}

/** A minute on the record: written to the task's Task_Comments on the server, as Comments writes it; e-mailed to the
 *  officer working the task when it is someone else. A record with no task on the server keeps it on this device. */
export const addMinute = (doc, task, text) => executeOwnedAction('comments', 'add-comment', async () => {
  const referenceId = doc?.referenceId || task?.referenceId || '';
  const onServer = task && isServerKey(task.entityKey);
  let id = crypto.randomUUID();
  if (onServer) { const w = await attempt(Payloads.minute(task, { text }), { module: 'comments', ref: referenceId }); if (!w.ok) return w; id = w.data?.entityKey || id; }
  const st = State.get();
  State.patch({ comments: [...(st.comments || []), { id, referenceId, body: text, author: st.profile.email, ts: new Date().toISOString(), type: 'comment', deviceOnly: !onServer }] }, { module: 'comments', action: 'comment:add', ref: referenceId });
  const assignee = String(task?.assignedTo || '');
  const notice = task && assignee && assignee.toLowerCase() !== String(st.profile.email || '').toLowerCase() ? await sendStaffNotice(StaffNotices.comment(task, text)) : null;
  return { ok: true, deviceOnly: !onServer, notice, message: onServer ? 'Minute recorded on the server.' : 'Minute kept on this device only: this record has no task on the server to hold it.' };
}, { ref: refOf(doc || task) });

/** Remind the assignee to acknowledge: the acknowledgement queue's reminder e-mail. */
export const remind = (task) => executeOwnedAction('acknowledgment', 'remind-assignee', async () => {
  const r = await sendStaffNotice(StaffNotices.ackReminder(task));
  return { ok: !!r?.sent || !!r?.queued, message: r?.message || 'Reminder not sent.' };
}, { ref: refOf(task) });

/** Escalate a task: SLA risk's escalation, the task's priority set to urgent on the server, then the owner e-mailed. */
export const escalate = (task, reason = 'Escalated from the record page') => executeOwnedAction('fasttrack', 'escalate-priority', async () => {
  const level = (+task.escalationLevel || 0) + 1;
  const w = await attempt(Payloads.taskUpdate(task, { priority: 'urgent', comments: `Escalated to level ${level}: ${reason}` }), { module: 'fasttrack', ref: refOf(task) });
  if (!w.ok) return w;
  const st = State.get();
  State.patch({ tracking: (st.tracking || []).map((x) => x.id === task.id ? { ...x, escalationLevel: level, priority: 'urgent' } : x), escalations: [{ id: crypto.randomUUID(), taskId: task.id, referenceId: refOf(task), level, reason, status: 'Open', createdAt: new Date().toISOString() }, ...(st.escalations || [])] }, { module: 'fasttrack', action: 'escalate-priority', ref: refOf(task) });
  const notice = await sendStaffNotice(StaffNotices.escalation(task, level, reason));
  return { ok: true, notice, message: `Escalated to level ${level}, recorded on the server.` };
}, { ref: refOf(task) });

/** Request approval on the record: Approvals' request, an APR record on the server, then the approver e-mailed. */
export const requestApproval = (doc, { title, approverEmail = '', summary = '' }) => executeOwnedAction('approvals', 'create-approval', async () => {
  const st = State.get();
  const rec = { id: crypto.randomUUID(), ref: refOf(doc), referenceId: refOf(doc), title: String(title || '').trim() || `Approval: ${doc?.subject || refOf(doc)}`, from: st.profile.name, fromEmail: st.profile.email || '', approverEmail: String(approverEmail).trim(), summary, ts: new Date().toISOString(), createdAt: new Date().toISOString(), status: 'pending' };
  const w = await attempt(Payloads.record('APR', { title: rec.title, decision: 'Pending', ref: rec.ref }), { module: 'approvals', ref: rec.ref });
  if (!w.ok) return w;
  rec.id = w.data.entityKey || rec.id; rec.entityKey = w.data.entityKey || '';
  State.patch({ approvals: [rec, ...(State.get().approvals || [])] }, { module: 'approvals', action: 'approval:create', ref: rec.ref });
  const notice = await sendStaffNotice(StaffNotices.approvalRequest(rec));
  return { ok: true, notice, message: 'Approval request recorded on the server.' };
}, { ref: refOf(doc) });

/**
 * Decide a pending approval request: Review & Approval's own decision (essentials plan UX-401, which moved it onto the
 * record). The APR row is written on the server first, then kept here with its minute, whether it was signed and who
 * decided it, and the decision is e-mailed to the officer who raised it (RN-018). A request made before requests were
 * recorded on the server is decided on this device and says so. A rejection needs a minute; the caller checks.
 */
export const decideApproval = (a, kind, { minute = '', signed = false } = {}) => executeOwnedAction('approvals', kind === 'approve' ? 'approve' : 'reject', async () => {
  const decidedStatus = kind === 'approve' ? 'approved' : 'rejected', onServer = isServerKey(a?.entityKey), ref = a.ref || a.referenceId || a.id;
  if (onServer) {
    const w = await attempt(Payloads.record('APR', { entityKey: a.entityKey, title: a.title, decision: kind === 'approve' ? 'Approved' : 'Rejected' }), { module: 'approvals', ref });
    if (!w.ok) return w;
  }
  const st = State.get();
  State.patch({ approvals: (st.approvals || []).map((x) => x.id === a.id ? { ...x, status: decidedStatus, minute, signed, decidedBy: st.profile.email, decidedAt: new Date().toISOString(), deviceOnly: !onServer } : x) }, { module: 'approvals', action: kind === 'approve' ? 'approval:approve' : 'approval:reject', ref });
  const notice = await sendStaffNotice(StaffNotices.approvalDecision(a, decidedStatus, minute));
  return { ok: true, onServer, notice, message: `${kind === 'approve' ? 'Request approved' : 'Request rejected'}, ${onServer ? 'recorded on the server' : 'recorded on this device only: this request never reached the server'}.` };
}, { ref: a.ref || a.referenceId || a.id });

/**
 * Mark or lift a flag on a document (core/document-flags.js): Lookup's flagging, moved onto the record by the cut-over
 * (UX-401) and run under its owner, Activities. The mark is kept here first and sent after; a flag is a marker, so a
 * call that cannot reach the server is held and sent later rather than losing the mark.
 */
export const toggleFlag = (doc, code) => executeOwnedAction('activities', 'flag-document', async () => {
  const spec = flagSpec(code); if (!spec) return { ok: false, message: `Unknown flag: ${code}` };
  const st = State.get(), actor = st.profile?.email || '', remove = hasFlag(doc, spec.code);
  const result = applyFlag(doc, spec.code, { actor, remove });
  if (!result.changed) return { ok: true, message: `Already marked ${spec.label}` };
  const payload = flagPayload(doc, spec.code, { actor, remove }), ref = doc.referenceId || String(doc.id);
  const mark = (xs) => (xs || []).map((x) => String(x.id) === String(doc.id) || (doc.referenceId && x.referenceId === doc.referenceId) ? { ...x, flags: result.flags } : x);
  State.patch({ activities: mark(st.activities), correspondence: mark(st.correspondence) }, { module: 'activities', action: 'flag-document', ref });
  let held = false;
  try { await WriteManager.backend({ module: 'activities', action: 'flag-document', endpoint: 'DYNAMIC_ACTIONS', payload, ref }); }
  catch (e) { if (!e?.normalized) PendingQueue.enqueue({ key: 'DYNAMIC_ACTIONS', payload, ref, error: e.message, operation: 'flag-document' }); held = true; }
  return { ok: true, held, message: held ? 'The mark is saved here; it goes to the server when the connection is back.' : (remove ? `${spec.label} lifted` : `Marked ${spec.label}`) };
}, { ref: doc.referenceId || String(doc.id) });

/* ─── Responding and closing (essentials plan UX-203) ──────────────────────────────────── */

/** The Correspondence Email Desk's source for a document: the reply is written against it, as the desk writes one. */
const replySource = (doc) => Mail.sourceCorrespondences().find((x) => x.kind === 'correspondence' && String(x.id) === String(doc.id))
  || { kind: 'correspondence', id: doc.id, referenceId: doc.referenceId || '', subject: doc.subject || '', recipientName: doc.sender || '', recipientEmail: doc.senderEmail || '', classification: doc.confidentiality || 'Official', attachmentLinks: [], source: doc };

/**
 * Reply on the record (UX-D4: Reply answers a record; the Mailer handles mass mailings only). The draft is the Email
 * Desk's own (saveDraft); `send` then sends it as the desk sends it (sendDraft), which records the Email dispatch.
 * A letter that cannot go out stays in the outbox, held, and goes when the connection returns.
 */
export async function reply(doc, draft, { send = false } = {}) {
  const d = { templateId: 'official-correspondence', ...draft, referenceId: doc.referenceId || '', sourceKind: 'correspondence', sourceId: doc.id };
  const errors = Mail.validate(d);
  if (errors.length) return { ok: false, message: errors.join('; ') };
  const row = await executeOwnedAction('correspondence-email', 'create-correspondence-email-draft', () => Mail.saveDraft(d, replySource(doc)), { ref: refOf(doc) });
  if (!send) return { ok: true, row, message: 'Reply saved as a draft. It has not been sent.' };
  return sendReply(row);
}

/** Send a reply already written on the record: a draft, or one held because it could not go out. */
export async function sendReply(row) {
  try {
    await executeOwnedAction('correspondence-email', 'send-correspondence-email', () => Mail.sendDraft(row), { ref: row.referenceId, notify: false });
    return { ok: true, message: `Reply sent to ${row.recipientEmail}. A copy is in the sent register.` };
  } catch {
    return { ok: false, held: true, message: 'The reply could not be sent just now. It stays in the outbox and goes when the connection is back.' };
  }
}

/** What still stands between the record and its closure, read from the closure gate on this device's current records. */
export function closureCheck(doc) {
  Entities.hydrateFromState(State.get());
  const c = Entities.canClose(doc.referenceId || '');
  const open = [c.openTasks?.length && `${c.openTasks.length} open task(s)`, c.openApprovals?.length && `${c.openApprovals.length} pending approval(s)`, c.openDispatches?.length && `${c.openDispatches.length} dispatch(es) not yet recorded`].filter(Boolean);
  return { ok: !!c.ok, unknown: !!c.unknownReference, open };
}

/** Close the record for good: Archive's own closure, under its owner and audit name, sealing its evidence bundle. */
export async function closeAndArchive(doc, summary = 'Closed and ready for archive') {
  const ref = doc.referenceId || '';
  if (!ref) return { ok: false, message: 'This record has no reference, so it cannot be archived.' };
  const check = closureCheck(doc);
  if (!check.ok) return { ok: false, message: check.unknown ? `${ref} is not in the register, so there is nothing to close.` : `${ref} cannot be closed yet: ${check.open.join(', ')}. Nothing was changed.` };
  try {
    await executeOwnedAction('archive', 'archive-reference', () => ArchiveService.archiveReference(ref, State.get().profile || {}, { closureSummary: String(summary || '').trim() || 'Closed and ready for archive' }), { ref, notify: false });
    return { ok: true, message: `${ref} is closed and its evidence is kept.` };
  } catch (err) {
    return { ok: false, message: err?.details?.reason === 'UNKNOWN_REFERENCE' ? `${ref} is not in the register, so there is nothing to close.` : `${ref} cannot be closed yet: work on it is still open. Nothing was changed.` };
  }
}
