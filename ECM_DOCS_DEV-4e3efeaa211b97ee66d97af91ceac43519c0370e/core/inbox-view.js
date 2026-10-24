/**
 * The Inbox (essentials plan UX-301, docs/architecture/ESSENTIALS_MAP.md §7.3-7.6): every incoming record, one list.
 *
 * Intake's To triage, Counter deposit, Routed (Activities), the Assignment Desk and Bulk assignment each listed some of
 * the incoming records. Here they are one list over the four intakes of config/entry-points.config.js: every document
 * loaded on the device (the register and Activities, joined by reference, core/record-search.js allDocuments) and every
 * e-mail not yet registered (core/intake-list.js). A record's source is the intake it came through
 * (core/source-views.js inferSourceId); where it stands is the record page's stage bar (core/record-view.js stageOf);
 * whether it has a physical file is Registry's file register (owner decision UX-D2). Pure: tests call it with a state.
 */
import { allDocuments } from './record-search.js';
import { unregisteredEmails } from './intake-list.js';
import { stageOf, filesOf } from './record-view.js';
import { inferSourceId } from './source-views.js';
import { SourceViews, SourceViewAll } from '../config/source-views.config.js';

const txt = (v) => String(v ?? '').trim();
const low = (v) => txt(v).toLowerCase();

/** Where a record stands, as the Inbox filters it. Each is a test on one row. */
export const INBOX_STATUSES = Object.freeze([
  { id: 'open', label: 'Open', test: (r) => !r.closed },
  { id: 'to-triage', label: 'To triage', test: (r) => !r.closed && r.stage === 'received' },
  { id: 'unassigned', label: 'Unassigned', test: (r) => r.kind === 'record' && !r.closed && r.tasks === 0 },
  { id: 'in-progress', label: 'In progress', test: (r) => !r.closed && r.tasks > 0 && !r.responded },
  { id: 'responded', label: 'Responded', test: (r) => !r.closed && r.responded },
  { id: 'closed', label: 'Closed', test: (r) => r.closed },
  { id: 'all', label: 'All', test: () => true },
]);
export const inboxStatus = (id) => INBOX_STATUSES.find((s) => s.id === id) || INBOX_STATUSES[0];

/* The stage bar's furthest step reached, as one word for the row. */
const STAGE_LABEL = { received: 'Received', triaged: 'Triaged', assigned: 'Assigned', progress: 'In progress', decision: 'Awaiting decision', responded: 'Responded', closed: 'Closed' };

/**
 * Every incoming record as one row. Joins are indexed by reference once, so the list stays quick at the register's size;
 * what a row says about the record (answered, archived, its stage) is what the record page says (tests hold them equal).
 */
export function inboxRows(state = {}) {
  const docs = allDocuments(state);
  const byRef = (xs, keyOf) => { const m = new Map(); for (const x of xs || []) { const k = low(keyOf(x)); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const tasksBy = byRef(state.tracking, (t) => t.referenceId);
  const approvalsBy = byRef(state.approvals, (a) => a.referenceId || a.ref);
  const repliesBy = byRef((state.correspondenceEmails || []).filter((m) => m.sourceKind !== 'dispatch-record' && m.status !== 'archived'), (m) => m.referenceId);
  const archived = new Set((state.archives || []).map((a) => low(a?.ref)).filter(Boolean));
  const dispatches = state.dispatches || [];
  /* Bulk assignment assigns records it holds as activities, by their id; a row says which activity it is, if any. */
  const activityBy = new Map((state.activities || []).map((a) => [low(a.referenceId) || low(a.id), txt(a.id)]));
  const rows = docs.map((d) => {
    const ref = low(d.referenceId), tasks = tasksBy.get(ref) || [], taskIds = new Set(tasks.map((t) => txt(t.id)));
    const sent = (repliesBy.get(ref) || []).some((m) => m.status === 'sent');
    const disp = dispatches.some((x) => (taskIds.has(txt(x.taskId)) || (ref && low(x.referenceId) === ref)) && ['dispatched', 'no-dispatch', 'closed'].includes(x.status));
    const response = { archived: !!(ref && archived.has(ref)), responded: sent || disp };
    const stages = stageOf(d, tasks, approvalsBy.get(ref) || [], response);
    const reached = [...stages].reverse().find((s) => s.state !== 'todo') || stages[0];
    const closed = stages.find((s) => s.id === 'closed').state === 'done';
    return {
      kind: 'record', key: txt(d.referenceId || d.id), title: txt(d.subject || d.title) || txt(d.referenceId) || 'Record',
      from: txt(d.sender || d.senderEmail || d.fromAddress), received: txt(d.receivedAt || d.createdAt || d.created),
      source: inferSourceId(d), category: txt(d.category), priority: txt(d.priority), stage: reached.id, stageLabel: STAGE_LABEL[reached.id] || reached.label,
      tasks: tasks.length, responded: response.responded || closed, closed, hasFile: filesOf(state, d).length > 0, activityId: activityBy.get(ref || low(d.id)) || '', doc: d,
    };
  });
  const messages = unregisteredEmails(state).map((e) => ({
    kind: 'message', key: '', emailId: txt(e.id), title: txt(e.subject) || '(No subject)', from: txt(e.fromName || e.fromAddress),
    received: txt(e.receivedDateTime), source: SourceViews.find((s) => s.entryPoint === 'email')?.id || 'customer-service-emails',
    category: '', priority: e.importance === 'high' ? 'high' : 'normal', stage: 'received', stageLabel: 'Not registered',
    tasks: 0, responded: false, closed: false, hasFile: false, activityId: '', email: e,
  }));
  return [...messages, ...rows].sort((a, b) => (Date.parse(b.received) || 0) - (Date.parse(a.received) || 0));
}

const matches = (r, q) => !q || [r.title, r.key, r.from, r.category, r.doc?.senderEmail, r.email?.fromAddress].some((v) => low(v).includes(q));

/**
 * The list as filtered: by source (an intake, or all), by status, by category, to physical files only, and by search.
 * Counts are given for every source and every status, each within the other filters, so a count is what its filter shows.
 */
export function inboxList(state = {}, { source = SourceViewAll, status = 'open', category = '', files = false, q = '' } = {}) {
  const all = inboxRows(state), query = low(q), st = inboxStatus(status);
  const base = all.filter((r) => (!category || r.category === category) && (!files || r.hasFile) && matches(r, query));
  const bySource = (r, s) => s === SourceViewAll || r.source === s;
  const sourceCounts = Object.fromEntries(SourceViews.map((s) => [s.id, base.filter((r) => st.test(r) && bySource(r, s.id)).length]));
  const statusCounts = Object.fromEntries(INBOX_STATUSES.map((x) => [x.id, base.filter((r) => x.test(r) && bySource(r, source)).length]));
  const fileCount = all.filter((r) => r.hasFile && st.test(r) && bySource(r, source) && (!category || r.category === category) && matches(r, query)).length;
  const rows = base.filter((r) => st.test(r) && bySource(r, source));
  const categories = [...new Set(all.map((r) => r.category).filter(Boolean))].sort();
  return { rows, status: st.id, source, sourceCounts, statusCounts, fileCount, categories, total: all.length };
}
