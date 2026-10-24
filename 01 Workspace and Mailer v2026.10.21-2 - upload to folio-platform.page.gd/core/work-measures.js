/* F-9 (module rationalisation): "Overdue" was counted three ways. Command Center and the DG/CEO hub counted a Closed task
   past its due date as overdue, Activities did not and read a copy that drifted, and FastTrack had its own measure. This is
   the one definition every screen uses: a task is overdue when its due date has passed and it is not finished. */
export const FINISHED_TASK_STATES = Object.freeze(['Completed', 'Closed', 'Cancelled']);
const dueOf = (t) => t?.due || t?.dueDate || '';
export function isFinished(t) { return FINISHED_TASK_STATES.includes(String(t?.status || '')) || /complete|closed|cancel/i.test(String(t?.status || '')); }
export function isOverdue(t, now = Date.now()) { const d = Date.parse(dueOf(t)); return Number.isFinite(d) && d < now && !isFinished(t); }
