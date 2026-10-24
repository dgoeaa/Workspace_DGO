/**
 * One record, whole (essentials plan UX-202, docs/architecture/ESSENTIALS_MAP.md §8.1).
 *
 * The record page shows a document, the tasks raised on it, and everything that has happened to it in one timeline:
 * received, decided, assigned, acknowledged, started, minuted, approved, escalated, completed, replied, dispatched, archived,
 * and the official file's custody.
 * Today each of those lives on a different screen. This assembles them from the collections the screens already read,
 * joined the way the screens join them (the record's reference), and touches nothing. It is pure: tests call it with a
 * state object.
 */
import { relatedTasks } from './data-selectors.js';
import { allDocuments } from './record-search.js';

const txt = (v) => String(v ?? '').trim();
const when = (...xs) => xs.map(txt).find((x) => x && !Number.isNaN(new Date(x).getTime())) || '';
const same = (a, b) => txt(a) && txt(a).toLowerCase() === txt(b).toLowerCase();

/** The document a key names, or the document of the task it names. Accepts a reference, a record or task id, or a key. */
export function findRecord(state, key) {
  const k = txt(key);
  if (!k) return null;
  /* Every document on the device, whichever register holds it (core/record-search.js allDocuments). */
  const docs = allDocuments(state);
  const named = (d) => [d.referenceId, d.id, d.entityKey, d.sourceId].some((v) => same(v, k));
  const doc = docs.find(named);
  if (doc) return { doc, focusTaskId: '' };
  const task = (state.tracking || []).find((t) => [t.id, t.referenceId, t.entityKey, t.sourceId, t.taskRef].some((v) => same(v, k)));
  if (!task) return null;
  const parent = docs.find((d) => same(d.referenceId, task.referenceId));
  /* A task whose document has not loaded is still a record: it is shown on its own, under its own reference. */
  return { doc: parent || { id: task.referenceId || task.id, referenceId: task.referenceId || '', subject: task.title, description: task.description, taskOnly: true }, focusTaskId: String(task.id) };
}

/* A task's `ack` is the date its acknowledgement is due (the Assignment Desk's field), not the time it was given; whether
   it has been acknowledged is a status, read as core/acknowledgement-service.js reads it. */
export const isAcknowledged = (t) => !!(t?.acknowledged || /^acknowledged$/i.test(txt(t?.assignedToAcknowledgementStatus || t?.acknowledgementStatus || t?.ackStatus)));
const OPEN = (t) => !/complete|closed|cancel/i.test(txt(t?.status));

/** Where the record stands, as the page's stage bar draws it. `response` is responseOf()'s result. */
export function stageOf(doc, tasks, approvals = [], response = {}) {
  const closed = !!response.archived || /archiv|closed/i.test(txt(doc?.status)) || !!txt(doc?.closedAt);
  const anyTask = tasks.length > 0;
  const acked = anyTask && tasks.some(isAcknowledged);
  const started = tasks.some((t) => /progress|complete/i.test(txt(t.status)) || txt(t.startDate));
  const pending = approvals.some((a) => /pending|requested/i.test(txt(a.status)));
  const steps = [
    ['received', 'Received', true],
    ['triaged', 'Triaged', !/^(received|pending|)$/i.test(txt(doc?.status)) || anyTask],
    ['assigned', 'Assigned', anyTask],
    ['progress', 'In progress', acked || started],
    ['decision', 'Decision', pending ? 'current' : approvals.some((a) => /approv|accept|declin|reject|delegat/i.test(txt(a.status)))],
    ['responded', 'Responded', !!response.responded || closed],
    ['closed', 'Closed', closed],
  ];
  return steps.map(([id, label, state]) => ({ id, label, state: state === 'current' ? 'current' : state ? 'done' : 'todo' }));
}

/**
 * How the record has been answered (essentials plan UX-203): the replies written on it (the Correspondence Email Desk's
 * letters under its reference), the dispatches of its tasks, and whether it is archived. A response is recorded once a
 * reply has been sent or a task has been dispatched, or marked as needing none; only then is Close & archive offered.
 */
export function responseOf(state, doc, tasks) {
  const ref = txt(doc?.referenceId), taskIds = new Set(tasks.map((t) => txt(t.id)));
  const replies = (state.correspondenceEmails || []).filter((m) => ref && same(m.referenceId, ref) && m.sourceKind !== 'dispatch-record' && m.status !== 'archived');
  const dispatches = (state.dispatches || []).filter((d) => taskIds.has(txt(d.taskId)) || (ref && same(d.referenceId, ref)));
  const archived = !!(ref && (state.archives || []).some((a) => same(a?.ref, ref)));
  const responded = replies.some((m) => m.status === 'sent') || dispatches.some((d) => ['dispatched', 'no-dispatch', 'closed'].includes(d.status));
  return { replies, dispatches, archived, responded };
}

/** The official files opened for the record (Registry's file register), joined by the record's id or reference. */
export const filesOf = (state, doc) => (state.registryFiles || []).filter((f) => (txt(doc?.id) && txt(f.correspondenceId) === txt(doc.id)) || (txt(doc?.referenceId) && same(f.referenceId, doc.referenceId)));

/** Everything that has happened to the record, oldest first. */
export function timelineOf(state, doc, tasks) {
  const ref = txt(doc?.referenceId);
  const ids = new Set([ref, txt(doc?.id), ...tasks.flatMap((t) => [txt(t.id), txt(t.referenceId)])].filter(Boolean));
  const mine = (x) => ids.has(txt(x.referenceId)) || ids.has(txt(x.ref)) || ids.has(txt(x.taskId));
  const ev = [];
  const add = (at, kind, title, body = '', who = '') => { if (at) ev.push({ at, kind, title, body, who }); };
  if (!doc?.taskOnly) add(when(doc?.receivedAt, doc?.createdAt, doc?.created), 'received', `Received${txt(doc?.channel) ? ` · ${txt(doc.channel)}` : ''}`, txt(doc?.sender) ? `From ${txt(doc.sender)}` : '');
  for (const t of tasks) {
    const to = [txt(t.assignedTo), txt(t.assignedToDsu)].filter(Boolean).join(', ');
    add(when(t.created, t.startDate), 'assigned', `Assigned: ${txt(t.title) || 'task'}`, [to && `To ${to}`, txt(t.supportingDsu) && `supported by ${txt(t.supportingDsu)}`, txt(t.due) && `due ${txt(t.due).slice(0, 10)}`].filter(Boolean).join(', '));
    if (isAcknowledged(t)) add(when(t.ackedAt, t.acknowledgedAt, t.updatedAt), 'acknowledged', 'Acknowledged', txt(t.title), txt(t.assignedTo));
    if (/complete/i.test(txt(t.status))) add(when(t.completedAt, t.updatedAt, t.due), 'completed', 'Task completed', txt(t.title), txt(t.assignedTo));
  }
  for (const c of state.comments || []) if (mine(c)) add(when(c.ts, c.createdAt), 'minute', 'Minute', txt(c.body), txt(c.author) || txt(c.editorEmail));
  for (const a of state.approvals || []) {
    if (!mine(a) && !(txt(a.parentKey) && [doc?.entityKey, doc?.sourceId].some((k) => txt(k) && txt(a.parentKey).toLowerCase().endsWith(txt(k).toLowerCase())))) continue;
    /* A decision on the document (Intake's or the DG/CEO's) is recorded as an APR row too; it is a decision, not a request. */
    const isDecision = /decision:/i.test(txt(a.title));
    if (!isDecision) add(when(a.createdAt, a.ts), 'approval', `Approval requested: ${txt(a.title)}`, txt(a.approver || a.approverEmail) ? `From ${txt(a.approver || a.approverEmail)}` : '', txt(a.requestedBy || a.fromEmail));
    if (/approv|reject|declin|accept|delegat|archiv/i.test(txt(a.status))) add(when(a.decidedAt, a.ts), 'decision', isDecision ? `${txt(a.status).replace(/^./, (c) => c.toUpperCase())}: ${txt(a.title).replace(/:.*$/, '')}` : `${txt(a.status).replace(/^./, (c) => c.toUpperCase())}: ${txt(a.title)}`, txt(a.notes), txt(a.approver));
  }
  /* A decision the role could only log (no APR written) still shows: the document's own status and who set it. */
  if (txt(doc?.decidedBy) && txt(doc?.status) && !(state.approvals || []).some((a) => /decision:/i.test(txt(a.title)) && (mine(a) || txt(a.title).includes(txt(doc.subject))))) {
    add(when(doc?.updatedAt), 'decision', `${txt(doc.status)}, decided by ${txt(doc.decidedBy)}`);
  }
  for (const e of state.escalations || []) if (mine(e)) add(when(e.createdAt), 'escalated', `Escalated to level ${txt(e.level) || '1'}`, txt(e.reason));
  /* File custody (UX-204): the official file opened for the record, each hand-over and receipt, and its closure. */
  for (const f of filesOf(state, doc)) {
    const no = txt(f.registryNumber || f.fileRef) || 'without a number';
    add(when(f.registeredAt, f.createdAt), 'custody', `File opened: ${no}`, txt(f.currentHolder) && !(state.fileMovements || []).some((m) => m.registryFileId === f.id) ? `Held by ${txt(f.currentHolder)}` : '', txt(f.registeredBy));
    for (const m of (state.fileMovements || []).filter((x) => x.registryFileId === f.id)) {
      add(when(m.releasedAt, m.createdAt), 'custody', `File sent to ${txt(m.to)}${txt(m.action) ? ` · ${txt(m.action).replace(/_/g, ' ').toLowerCase()}` : ''}`, txt(m.minute), txt(m.createdBy || m.from));
      if (txt(m.receivedAt)) add(m.receivedAt, 'custody', `File received by ${txt(m.to)}`, '', txt(m.receivedBy));
    }
    if (txt(f.closedAt)) add(f.closedAt, 'custody', `File closed: ${no}`);
  }
  const replies = (state.correspondenceEmails || []).filter((m) => ref && same(m.referenceId, ref) && m.sourceKind !== 'dispatch-record');
  for (const m of replies) {
    if (m.status === 'sent') add(when(m.sentAt, m.updatedAt), 'replied', `Reply sent: ${txt(m.subjectLine || m.subject)}`, txt(m.recipientEmail) && `To ${txt(m.recipientEmail)}`, txt(m.sentBy));
    else if (m.status === 'queued') add(when(m.queuedAt, m.updatedAt, m.createdAt), 'replied', `Reply held, not yet sent: ${txt(m.subjectLine || m.subject)}`, txt(m.lastError));
    else if (m.status === 'draft') add(when(m.createdAt, m.updatedAt), 'replied', `Reply drafted: ${txt(m.subjectLine || m.subject)}`, txt(m.recipientEmail) && `To ${txt(m.recipientEmail)}`, txt(m.createdBy));
  }
  const drawn = new Set(replies.map((m) => txt(m.id)));
  for (const d of state.dispatches || []) {
    if (!mine(d) || (txt(d.correspondenceEmailId) && drawn.has(txt(d.correspondenceEmailId)))) continue;
    if (d.status === 'no-dispatch') add(when(d.at, d.createdAt), 'dispatched', 'No dispatch needed', txt(d.reason), txt(d.by));
    else add(when(d.dispatchedAt, d.createdAt, d.at), 'dispatched', `Dispatched${txt(d.channel || d.method) ? ` by ${txt(d.channel || d.method)}` : ''}`, txt(d.recipient) && `To ${txt(d.recipient)}`, txt(d.by));
    if (d.status === 'closed' && txt(d.receiptAt)) add(d.receiptAt, 'dispatched', 'Receipt confirmed', txt(d.title), txt(d.receiptBy));
  }
  for (const a of state.archives || []) if (mine(a)) add(when(a.archivedAt, a.createdAt, a.at), 'closed', 'Closed and archived', txt(a.summary || a.closureReason));
  return ev.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/** The record page's whole model: the document, its tasks, the stage it has reached and its timeline. */
export function recordView(state, key) {
  const found = findRecord(state, key);
  if (!found) return null;
  const { doc, focusTaskId } = found;
  const tasks = doc.taskOnly ? (state.tracking || []).filter((t) => String(t.id) === focusTaskId) : relatedTasks(doc, state);
  const approvals = (state.approvals || []).filter((a) => same(a.referenceId || a.ref, doc.referenceId));
  const focus = tasks.find((t) => String(t.id) === focusTaskId) || tasks.find(OPEN) || tasks[0] || null;
  const response = responseOf(state, doc, tasks);
  const files = doc.taskOnly ? [] : filesOf(state, doc).map((f) => ({ file: f, moves: (state.fileMovements || []).filter((m) => m.registryFileId === f.id).sort((a, b) => String(b.releasedAt || '').localeCompare(String(a.releasedAt || ''))) }));
  return { doc, tasks, task: focus, approvals, response, files, stages: stageOf(doc, tasks, approvals, response), timeline: timelineOf(state, doc, tasks) };
}
