import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, table, toast, confirmAction, mdBack, mdSwitch, resetDetailScroll, emptyFor, loadFlags, actionPreview } from '../core/ui.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { updateTaskState } from '../core/enterprise-domain.js';
import { priorityLabel } from '../config/priority.config.js';
import { exportCsv } from '../core/report-export-service.js';
import { debouncedInput } from '../core/ui-interactions.js';
import { dynamicActionContract } from '../config/dynamic-actions.config.js';
import { UIState } from '../core/ui-state.js';
import { requestSync } from '../core/data-loader.js';
import { Payloads, attempt } from '../core/server-writes.js';
import { canCurrentUserAccess } from '../core/current-user.js';
import { isOverdue } from '../core/work-measures.js';
import { chips } from '../core/ui.js';
export async function mount(el){hydrateGovernance();render(el); }
/* F-8: the header said "the tasks assigned to you" and the list showed every task this device had loaded. It now opens on
   the officer's own tasks; Team, Overdue and Escalated are the other views (the scopes Activities' work queue offered). */
const mine = (s, t) => String(t.assignedTo || '').trim().toLowerCase() === String(s.profile?.email || '').trim().toLowerCase();
const SCOPES = Object.freeze({ mine: (s, t) => mine(s, t), team: () => true, overdue: (s, t) => isOverdue(t), escalated: (s, t) => (+t.escalationLevel || 0) > 0 || /escalat|block/i.test(String(t.status || '')) });
function rows(s, q, scope = 'mine') { const inScope = SCOPES[scope] || SCOPES.mine; return s.tracking.filter(t => inScope(s, t)).filter(t => !q || [t.title, t.referenceId, t.assignedTo, t.status].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))); }
function exportList(list) {
  exportCsv(list, [{key:'referenceId',label:'referenceId'},{key:'title',label:'title'},{key:'assignedTo',label:'assignedTo'},{key:'priority',label:'priority'},{key:'status',label:'status'}], 'orchestrator.csv');
}
function render(el) {
  const s = State.get(); const u = UIState.get('orchestrator', { q: '', selected: null, md: 'list', scope: 'mine' }); const list = rows(s, u.q, u.scope || 'mine'); const sel = list.find(t => t.id === u.selected) || null;
  /* I-13 — table()'s built-in fallback says "No records / Nothing to show for the current
     filter" whatever the reason, so an empty search box and an unreachable registry read the
     same and neither offers anything to do. emptyFor() separates the three causes and each
     one carries its own action; the table is only rendered when there is something in it. */
  const listBody = list.length
    ? table([
        { key: 'referenceId', label: 'Reference' }, { key: 'title', label: 'Title' }, { key: 'assignedTo', label: 'Assigned To' },
        { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }], capRows(list, RenderBudget.tableRows), r => `data-id="${esc(r.id)}" class="row-link ${sel && sel.id === r.id ? 'row-active' : ''}"`)
    : emptyFor({ filtered: !!u.q, ...loadFlags(s.runtime), noun: 'tasks', createLabel: 'Open Assignment Desk', createAttr: 'data-open-assignment' });
  el.innerHTML = `<div class="workspace">${head('My Work', 'The tasks assigned to you and the people they are routed to.')}
    <div class="toolbar">${chips([{ value: 'mine', label: `Mine (${rows(s, '', 'mine').length})` }, { value: 'team', label: `Team (${rows(s, '', 'team').length})` }, { value: 'overdue', label: `Overdue (${rows(s, '', 'overdue').length})` }, { value: 'escalated', label: `Escalated (${rows(s, '', 'escalated').length})` }], u.scope || 'mine', 'data-scope')}<input data-q type="search" aria-label="Search your tasks" placeholder="Search tasks" value="${esc(u.q)}"><div><button class="btn ghost" data-export>Export to spreadsheet</button></div></div>
    <div class="split" ${mdSwitch(sel?u.md:'list')}><div class="panel">${listBody}</div>
    <div class="detail-col panel-stack">${sel ? detail(sel) : '<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No task selected</h2><p>Choose a task from the list to read it, complete it or set a reminder.</p></div></section>'}</div></div></div>`;
  debouncedInput(el.querySelector('[data-q]'),value=>{UIState.set('orchestrator',{q:value});render(el)},{refind:()=>el.querySelector('[data-q]')})
  el.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { UIState.set('orchestrator', { scope: b.dataset.scope, selected: null }); render(el); });
  el.querySelector('[data-export]').onclick = () => list.length ? exportList(list) : toast('There is nothing in this list to export', 'error');
  /* The three arms of the I-13 contract, wired. Without these the buttons emptyFor() renders
     are decoration. */
  el.querySelectorAll('[data-clear-filters]').forEach(b => b.onclick = () => { UIState.set('orchestrator', { q: '' }); render(el); });
  el.querySelectorAll('[data-retry-load]').forEach(b => b.onclick = async () => {
    try { await requestSync({ source: 'orchestrator', mode: 'refresh' }); toast('Tasks refreshed from the server', 'success'); }
    catch { toast('The server could not be reached — nothing was refreshed', 'error'); }
    render(el);
  });
  el.querySelectorAll('[data-open-assignment]').forEach(b => b.onclick = () => { location.hash = '#/single-assignment'; });
  el.querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { UIState.set('orchestrator', { selected: tr.dataset.id, md: 'detail' }); render(el); resetDetailScroll(el); });
  el.querySelector('[data-md-back]')?.addEventListener('click', () => { UIState.set('orchestrator', { md: 'list' }); render(el); });
  /* start-work was declared and never used (F-3): it is the step between acknowledging a task and completing it, and it
     sets the task In progress on the server. */
  const start = el.querySelector('[data-start-work]'); if (start) start.onclick = async () => {
    let out; try { out = await executeOwnedAction('orchestrator', 'start-work', async () => {
      const w = await attempt(Payloads.taskUpdate(sel, { status: 'In Progress' }), { module: 'orchestrator', ref: sel.referenceId || sel.id });
      if (!w.ok) return w;
      const r = updateTaskState(State.get(), sel.id, { status: 'In Progress' }, s.profile.email, { surface: 'orchestrator' });
      if (r) State.patch(r.patch, { module: 'orchestrator', action: 'task:start', ref: sel.referenceId || sel.id });
      return { ok: true };
    }, { ref: sel.referenceId || sel.id }); } catch { return render(el); }
    toast(out.ok ? 'Work started, recorded on the server' : out.message, out.ok ? 'success' : 'error'); render(el);
  };
  const upd = el.querySelector('[data-mark-done]'); if (upd) upd.onclick = async () => {
    if (!await confirmAction({ title: 'Mark this task completed', body: `<p><b>${esc(sel.title)}</b></p>` })) return;
    /* F-3, F-17: completion was a change to this device's copy only, and the next refresh set the task back to In
       Progress. It is now written to the task on the server (update-task, as Lookup's update already was) first. */
    let out; try { out = await executeOwnedAction('orchestrator', 'complete-action', async () => {
      const w = await attempt(Payloads.taskUpdate(sel, { status: 'Completed' }), { module: 'orchestrator', ref: sel.referenceId || sel.id });
      if (!w.ok) return w;
      const r = updateTaskState(State.get(), sel.id, { status: 'Completed' }, s.profile.email, { surface: 'orchestrator' });
      if (r) State.patch(r.patch, { module: 'orchestrator', action: 'task:complete', ref: sel.referenceId || sel.id });
      return { ok: true };
    }, { ref: sel.referenceId || sel.id }); } catch { return render(el); }
    toast(out.ok ? 'Task marked completed, recorded on the server' : out.message, out.ok ? 'success' : 'error'); render(el);
  };
  const openComments = el.querySelector('[data-open-comments]'); if (openComments) openComments.onclick = () => { State.patch({ selectedId: sel.referenceId }); location.hash = '#/comments'; };
  const setRem = el.querySelector('[data-set-reminder]'); if (setRem) setRem.onclick = async () => {
    const contract = dynamicActionContract('setReminder'); if (!contract) return;
    const dueAt = el.querySelector('[data-reminder-due]')?.value || '';
    if (contract.required.includes('dueAt') && !dueAt) { toast('A reminder date is required', 'error'); return; }
    /* RN-035: the reminder is written to DGO_TaskReminders (DYNAMIC_ACTIONS upsert-record RMD) and AUTO_SCHEDULED_SWEEP e-mails
       the assignee once it falls due. A date alone means 08:00 West Africa Time that day. */
    const assignedTo = String(sel.assignedTo || sel.AssignedTo || '').trim();
    if (!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(assignedTo)) { toast('This task has no assignee e-mail address, so no reminder can be sent', 'error'); return; }
    const dueIso = new Date(/T/.test(dueAt) ? dueAt : `${dueAt}T08:00:00+01:00`).toISOString();
    if (Number.isNaN(Date.parse(dueIso)) || Date.parse(dueIso) <= Date.now()) { toast('Choose a reminder time in the future', 'error'); return; }
    const payload = { operation: contract.operation, entityType: contract.entityType, action: 'setReminder', ref: sel.referenceId || sel.id, title: sel.title || sel.referenceId || 'Task reminder', assignedTo, dueAt: dueIso, parentKey: sel.entityKey ? `TSK:${sel.entityKey}` : '' };
    /* I-07 — this dialog used to end in a raw JSON dump of the request. actionPreview() is the
       platform's readable label→value summary and keeps the machine-readable form behind its
       "Technical payload" disclosure, which is where the audit asks diagnostics to live. */
    if (!await confirmAction({ title: 'Set a reminder for this task', body: `<p><b>${esc(sel.title)}</b></p>${actionPreview({ Task: sel.title, Reference: sel.referenceId || sel.id, 'Remind on': dueAt }, { payload })}` })) return;
    /* The reminder is written to the server first; it is shown here only once the sweep has a row to send from. */
    let out; try { out = await executeOwnedAction('orchestrator', 'set-reminder', async () => {
      const w = await attempt(Payloads.record('RMD', { title: payload.title, ref: payload.ref, assignedTo, dueAt: dueIso, parentKey: payload.parentKey }), { module: 'orchestrator', ref: payload.ref });
      if (!w.ok) return w;
      const st = State.get();
      State.patch({
        tracking: st.tracking.map(x => x.id === sel.id ? { ...x, reminderAt: dueAt } : x),
        notifications: [{ id: w.data?.entityKey || crypto.randomUUID(), at: new Date().toISOString(), taskId: sel.id, referenceId: sel.referenceId || '', title: `Reminder: ${sel.title}`, dueAt, assignedTo: sel.assignedTo || '' }, ...(st.notifications || [])]
      }, { module: 'orchestrator', action: 'setReminder', ref: sel.referenceId || sel.id });
      return { ok: true };
    }, { ref: sel.referenceId || sel.id }); } catch { return render(el); }
    toast(out.ok ? contract.successMessage : out.message, out.ok ? 'success' : 'error');
    render(el);
  };
}
function detail(t) {
  return `${mdBack('Back to tasks')}<section class="panel"><div class="eyebrow panel-eyebrow">Task Record</div><div class="meta">${esc(t.referenceId || '—')}</div><h2>${esc(t.title)}</h2>
    <p class="meta">Assigned to: ${esc(t.assignedTo || 'Unassigned')} · Priority: ${esc(priorityLabel(t.priority))} · Status: ${esc(t.status)}</p></section>
    <section class="panel"><div class="eyebrow panel-eyebrow">Task Actions</div><div class="form-row">${/^(not started|new|pending|assigned|acknowledged)$/i.test(String(t.status || '')) ? '<button class="btn ghost" data-start-work>Start work</button>' : ''}${t.status !== 'Completed' ? '<button class="btn" data-mark-done>Mark Completed</button>' : ''}${canCurrentUserAccess('acknowledgment') ? '<a class="btn ghost" href="#/acknowledgment">Open Acknowledgment Queue</a>' : ''}${canCurrentUserAccess('comments') ? '<button class="btn ghost" data-open-comments>Open Comments</button>' : ''}</div></section>
    <section class="panel"><div class="eyebrow panel-eyebrow">Reminder</div><div class="form-row" data-reminder-row>${t.reminderAt ? `<span class="pill">Reminder: ${esc(t.reminderAt)}</span>` : ''}<label class="sr-reminder">Reminder date<input type="date" data-reminder-due aria-label="Reminder date" value="${esc(t.reminderAt || '')}"></label><button class="btn ghost" data-set-reminder>Set reminder</button></div></section>`;
}
