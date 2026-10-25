/**
 * The Overview (essentials plan UX-303, docs/architecture/ESSENTIALS_MAP.md §7.2, §7.15): what is waiting, at a glance.
 *
 * Command Center and Statistics each counted the work their own way, and a figure led nowhere. Here every figure is the
 * count of a filter on the Inbox (core/inbox-view.js) or of a view of Tasks (core/task-views.js), computed by that same
 * list, and opens that list so filtered. Incoming by intake is the Inbox's source counts; the attention list is the work
 * owed soonest: overdue first, then at risk, then not yet acknowledged. Pure: tests call it with a state object.
 */
import { inboxList } from './inbox-view.js';
import { taskList } from './task-views.js';
import { SourceViews, SourceViewAll } from '../config/source-views.config.js';
import { isOverdue, isAtRisk, isFinished } from './work-measures.js';
import { isAcknowledged } from './record-view.js';

/** Each figure: what it counts, and the list it opens (`to`: the route and the filter state that list reads). */
export const FIGURES = Object.freeze([
  { id: 'open', label: 'Open records', list: 'inbox', filter: { status: 'open', source: SourceViewAll } },
  { id: 'unassigned', label: 'Unassigned', list: 'inbox', filter: { status: 'unassigned', source: SourceViewAll } },
  { id: 'overdue', label: 'Overdue tasks', list: 'tasks', filter: { view: 'overdue' } },
  { id: 'at-risk', label: 'Due within a day', list: 'tasks', filter: { view: 'at-risk' } },
  { id: 'awaiting-decision', label: 'Awaiting decision', list: 'tasks', filter: { view: 'awaiting-decision' } },
  { id: 'responded', label: 'Responded, not closed', list: 'inbox', filter: { status: 'responded', source: SourceViewAll } },
]);

export function overview(state = {}, { now = Date.now(), attention = 8 } = {}) {
  const inbox = inboxList(state, { status: 'open' });
  const tasks = taskList(state, { view: 'team', now });
  const figures = FIGURES.map((f) => ({ ...f, value: f.list === 'inbox' ? inbox.statusCounts[f.filter.status] : tasks.counts[f.filter.view] }));
  const intakes = SourceViews.filter((s) => s.id !== SourceViewAll).map((s) => ({ id: s.id, label: s.label, value: inbox.sourceCounts[s.id], filter: { status: 'open', source: s.id } }));
  const why = (t) => isOverdue(t, now) ? 'Overdue' : isAtRisk(t, now) ? 'Due within a day' : 'Not yet acknowledged';
  const rank = (t) => isOverdue(t, now) ? 0 : isAtRisk(t, now) ? 1 : 2;
  const owed = (state.tracking || []).filter((t) => !isFinished(t) && (isOverdue(t, now) || isAtRisk(t, now) || !isAcknowledged(t)));
  const due = (t) => Date.parse(t.due || t.dueDate || '') || Infinity;
  const list = owed.sort((a, b) => rank(a) - rank(b) || due(a) - due(b)).slice(0, attention).map((t) => ({ key: String(t.id), title: t.title || 'Task', referenceId: t.referenceId || '', owner: t.assignedTo || 'Unassigned', due: t.due || '', why: why(t) }));
  return { figures, intakes, attention: list, attentionTotal: owed.length, tasksTotal: tasks.counts.team };
}
