/**
 * The one task track (essentials plan UX-302, docs/architecture/ESSENTIALS_MAP.md E-3, §7.7-7.13).
 *
 * A task was listed in five places: My Work (Mine, Team, Overdue, Escalated), Acknowledge (not yet acknowledged), SLA risk
 * (breached, due soon), the Approvals and DG/CEO inboxes (awaiting a decision) and Archive's close list (ready to close).
 * Here each of those is a view of one list, defined once, counted from the same tasks, and opened on the record page.
 * Overdue and at risk are core/work-measures.js's; acknowledgement is core/record-view.js's reading of it; a record is
 * answered as responseOf() says. Pure: tests call it with a state object.
 */
import { isOverdue, isAtRisk, isFinished } from './work-measures.js';
import { isAcknowledged, responseOf } from './record-view.js';

const txt = (v) => String(v ?? '').trim();
const low = (v) => txt(v).toLowerCase();
const PENDING_APPROVAL = /^(pending|requested|draft)$/i;

/** The record each task belongs to, read once per list: its pending approvals and how it has been answered. */
function context(state) {
  const pending = new Set((state.approvals || []).filter((a) => PENDING_APPROVAL.test(txt(a.status) || 'pending')).map((a) => low(a.referenceId || a.ref)).filter(Boolean));
  const docs = [...(state.correspondence || []), ...(state.activities || [])];
  const answered = new Map();
  const answeredFor = (t) => {
    const ref = low(t.referenceId);
    if (!ref) return { responded: false, archived: false };
    if (!answered.has(ref)) {
      const doc = docs.find((d) => low(d.referenceId) === ref) || { referenceId: t.referenceId };
      const tasks = (state.tracking || []).filter((x) => low(x.referenceId) === ref);
      answered.set(ref, responseOf(state, doc, tasks));
    }
    return answered.get(ref);
  };
  const escalated = new Set((state.escalations || []).map((e) => txt(e.taskId)).filter(Boolean));
  return { pending, answeredFor, escalated, me: low(state.profile?.email) };
}

/** The views, in the order the screen shows them. Each is a test on one task. */
export const TASK_VIEWS = Object.freeze([
  { id: 'mine', label: 'Mine', test: (t, c) => !!c.me && low(t.assignedTo) === c.me },
  { id: 'team', label: 'Team', test: () => true },
  { id: 'unacknowledged', label: 'Not yet acknowledged', test: (t) => !isFinished(t) && !isAcknowledged(t) },
  { id: 'overdue', label: 'Overdue', test: (t, c, now) => isOverdue(t, now) },
  { id: 'at-risk', label: 'At risk', test: (t, c, now) => isAtRisk(t, now) },
  { id: 'escalated', label: 'Escalated', test: (t, c) => (+t.escalationLevel || 0) > 0 || /escalat|block/i.test(txt(t.status)) || c.escalated.has(txt(t.id)) },
  { id: 'awaiting-decision', label: 'Awaiting decision', test: (t, c) => !isFinished(t) && c.pending.has(low(t.referenceId)) },
  { id: 'ready-to-close', label: 'Ready to close', test: (t, c) => { if (!isFinished(t) || c.pending.has(low(t.referenceId))) return false; const r = c.answeredFor(t); return r.responded && !r.archived; } },
]);
export const viewOf = (id) => TASK_VIEWS.find((v) => v.id === id) || TASK_VIEWS[0];

const matches = (t, q) => !q || [t.title, t.referenceId, t.assignedTo, t.assignedToDsu, t.status, t.priority].some((v) => low(v).includes(q));

/**
 * One view of the track, searched, with every view's count. Rows are the tasks themselves, overdue first and then by
 * due date, so the list reads in the order the work is owed.
 */
export function taskList(state = {}, { view = 'mine', q = '', now = Date.now() } = {}) {
  const c = context(state), tasks = state.tracking || [], query = low(q);
  const counts = Object.fromEntries(TASK_VIEWS.map((v) => [v.id, tasks.filter((t) => v.test(t, c, now)).length]));
  const v = viewOf(view);
  const due = (t) => { const d = Date.parse(t.due || t.dueDate || ''); return Number.isFinite(d) ? d : Infinity; };
  const rows = tasks.filter((t) => v.test(t, c, now) && matches(t, query))
    .sort((a, b) => (isOverdue(b, now) - isOverdue(a, now)) || (due(a) - due(b)));
  return { view: v.id, rows, counts };
}

/** What a row says about where the task stands, in the words the views use. */
export function taskState(t, now = Date.now()) {
  if (isFinished(t)) return txt(t.status) || 'Completed';
  if (isOverdue(t, now)) return 'Overdue';
  if (isAtRisk(t, now)) return 'Due within a day';
  if (!isAcknowledged(t)) return 'Not yet acknowledged';
  return txt(t.status) || 'Not started';
}
