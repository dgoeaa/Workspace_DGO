/**
 * Tasks, the one task track (essentials plan UX-302, core/task-views.js).
 *
 * Every task is reachable from one list, and every view the replaced screens listed is a filter on it, counted from the
 * same tasks: Mine, Team, Not yet acknowledged, Overdue, At risk, Escalated, Awaiting decision and Ready to close. Overdue
 * and at risk are core/work-measures.js's, so SLA risk and Tasks cannot disagree.
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } };

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nTasks: one track, every view a filter on it\n');

const { TASK_VIEWS, taskList, taskState } = await import('../core/task-views.js');
const { isAtRisk, isOverdue } = await import('../core/work-measures.js');
const { readFileSync } = await import('node:fs');

const NOW = Date.parse('2026-10-22T09:00:00Z');
const ME = 'me@nitda.gov.ng';
const state = {
  profile: { email: ME },
  correspondence: [{ id: 'd1', referenceId: 'REF-1', subject: 'Answered and finished' }, { id: 'd2', referenceId: 'REF-2', subject: 'Awaiting the DG' }],
  tracking: [
    { id: 't1', referenceId: 'REF-1', title: 'Finished, answered', assignedTo: ME, status: 'Completed', acknowledged: true, due: '2026-10-20' },
    { id: 't2', referenceId: 'REF-2', title: 'Waiting on approval', assignedTo: 'other@nitda.gov.ng', status: 'In Progress', acknowledged: true, due: '2026-10-30' },
    { id: 't3', referenceId: 'REF-3', title: 'Overdue, not acknowledged', assignedTo: ME, status: 'Not Started', due: '2026-10-21' },
    { id: 't4', referenceId: 'REF-4', title: 'Due tomorrow morning', assignedTo: 'other@nitda.gov.ng', status: 'In Progress', acknowledged: true, due: '2026-10-23T08:00:00Z' },
    { id: 't5', referenceId: 'REF-5', title: 'Escalated by the escalation log', assignedTo: ME, status: 'In Progress', acknowledged: true, due: '2026-11-15' },
    { id: 't6', referenceId: 'REF-6', title: 'Finished, not answered', assignedTo: ME, status: 'Completed', acknowledged: true },
  ],
  approvals: [{ id: 'a1', referenceId: 'REF-2', title: 'Approve the response', status: 'pending' }],
  escalations: [{ id: 'e1', taskId: 't5', level: 1 }],
  correspondenceEmails: [{ id: 'm1', referenceId: 'REF-1', status: 'sent' }],
};
const ids = (view, q = '') => taskList(state, { view, q, now: NOW }).rows.map((t) => t.id).sort().join(',');

ok(TASK_VIEWS.map((v) => v.id).join() === 'mine,team,unacknowledged,overdue,at-risk,escalated,awaiting-decision,ready-to-close', 'the eight views, in order');
ok(ids('team') === 't1,t2,t3,t4,t5,t6', 'Team is every task: each one is reachable from this one list');
ok(ids('mine') === 't1,t3,t5,t6', 'Mine is the officer\'s own tasks');
ok(ids('unacknowledged') === 't3', 'Not yet acknowledged: an open task nobody has acknowledged');
ok(ids('overdue') === 't3', 'Overdue: past due and not finished (a finished task past its date is not overdue)');
ok(ids('at-risk') === 't4', 'At risk: due within a day and not yet overdue');
ok(ids('escalated') === 't5', 'Escalated: by the escalation log as well as by the task');
ok(ids('awaiting-decision') === 't2', 'Awaiting decision: an open task whose record has a pending approval');
ok(ids('ready-to-close') === 't1', 'Ready to close: finished, its record answered, not archived');
ok(taskList({ ...state, archives: [{ ref: 'REF-1' }] }, { view: 'ready-to-close', now: NOW }).rows.length === 0, 'an archived record is no longer ready to close');

const { counts, rows } = taskList(state, { view: 'nonsense', now: NOW });
ok(TASK_VIEWS.every((v) => counts[v.id] === taskList(state, { view: v.id, now: NOW }).rows.length), 'every view carries its own count, and the count is its rows');
ok(rows.map((t) => t.id).join() === taskList(state, { view: 'mine', now: NOW }).rows.map((t) => t.id).join(), 'an unknown view opens Mine');
ok(ids('team', 'escalation log') === 't5' && ids('team', 'REF-2') === 't2', 'search narrows a view by title or reference');
ok(taskList(state, { view: 'team', now: NOW }).rows[0].id === 't3', 'overdue work is listed first');

ok(state.tracking.every((t) => !(isAtRisk(t, NOW) && isOverdue(t, NOW))), 'no task is both at risk and overdue');
ok(taskState(state.tracking[2], NOW) === 'Overdue' && taskState(state.tracking[3], NOW) === 'Due within a day', 'a row says where its task stands');

/* SLA risk's Due soon is the same measure. */
const ft = readFileSync(new URL('../modules/fasttrack.js', import.meta.url), 'utf8');
ok(/isAtRisk\(t,now\)\?'Due soon'/.test(ft) && !/86400000/.test(ft), "SLA risk's Due soon is core/work-measures.js isAtRisk, not its own arithmetic");
const tasksJs = readFileSync(new URL('../modules/tasks.js', import.meta.url), 'utf8');
ok(!/executeOwnedAction|Payloads|attempt\(/.test(tasksJs), 'the list changes nothing: every action is on the record page');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
