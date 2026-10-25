/**
 * Tasks (essentials plan UX-302, docs/architecture/ESSENTIALS_MAP.md §8.1): every task, one track.
 *
 * Replaces My Work, Acknowledge, Monitoring, SLA risk, the Approvals and DG/CEO inboxes and the Close & archive list.
 * Each of their lists is a view here (core/task-views.js), counted from the same tasks. The list only filters and opens:
 * a row opens its task's record page, where every action on it is (shared/record-page.js). Behind the essential screens'
 * switch, drawn at My Work's address.
 */
import { hydrateGovernance } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { esc, chips, emptyFor, loadFlags, fmtDate } from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { debouncedInput } from '../core/ui-interactions.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { requestSync } from '../core/data-loader.js';
import { TASK_VIEWS, taskList, taskState } from '../core/task-views.js';
import { openRecordPage, essentialHead, linkedRecordNotice, bindLinkedRecordNotice } from '../shared/record-page.js';

const U = () => UIState.get('tasks', { view: 'mine', q: '' });

export async function mount(el) {
  hydrateGovernance(); render(el);
  /* Redrawn when a record page opened from here closes, or new data arrives, while this list is still the one shown. */
  const redraw = () => { if (!el.isConnected) return off(); if (!document.querySelector('[data-record-page]')) render(el); };
  const off = () => { removeEventListener('dgo:record-page-closed', redraw); removeEventListener('dgo:data-loaded', redraw); };
  addEventListener('dgo:record-page-closed', redraw); addEventListener('dgo:data-loaded', redraw);
}

function render(el) {
  const s = State.get(), u = U(), now = Date.now();
  const { view, rows, counts } = taskList(s, { view: u.view, q: u.q, now });
  const shown = capRows(rows, RenderBudget.tableRows);
  const body = rows.length
    ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table" data-task-list><thead><tr><th>Task</th><th>Reference</th><th>Owner</th><th>Due</th><th>Where it stands</th></tr></thead><tbody>${shown.map((t) => `<tr class="row-link" data-task-row="${esc(t.id)}"><td><button type="button" class="row-open" data-open-record="${esc(t.id)}">${esc(t.title || 'Task')}</button></td><td>${esc(t.referenceId || '—')}</td><td>${esc([t.assignedTo, t.assignedToDsu].filter(Boolean).join(', ') || 'Unassigned')}</td><td>${esc(t.due ? fmtDate(t.due) : '—')}</td><td>${esc(taskState(t, now))}</td></tr>`).join('')}</tbody></table></div>${rows.length > shown.length ? `<p class="meta">Showing the first ${shown.length} of ${rows.length}. Search to narrow the list.</p>` : ''}`
    : emptyFor({ filtered: (s.tracking || []).length > 0, ...loadFlags(s.runtime), noun: 'tasks' });
  el.innerHTML = `<div class="workspace">${essentialHead('Tasks')}${linkedRecordNotice()}
    <div class="cc-controlbar essential-bar"><div class="cc-controls">${chips(TASK_VIEWS.map((v) => ({ value: v.id, label: `${v.label} (${counts[v.id]})` })), view, 'data-task-view')}<input data-q type="search" aria-label="Search tasks" placeholder="Search tasks" value="${esc(u.q)}"></div></div>
    <section class="panel">${body}</section></div>`;
  bindLinkedRecordNotice(el, () => render(el));
  el.querySelectorAll('[data-task-view]').forEach((b) => b.addEventListener('click', () => { UIState.set('tasks', { view: b.dataset.taskView }); render(el); el.querySelector(`[data-task-view="${CSS.escape(b.dataset.taskView)}"]`)?.focus(); }));
  debouncedInput(el.querySelector('[data-q]'), (v) => { UIState.set('tasks', { q: v }); render(el); }, { refind: () => el.querySelector('[data-q]') });
  /* The whole row opens the record; its title is the button a keyboard reaches. */
  el.querySelectorAll('[data-task-row]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('[data-open-record]')) openRecordPage(tr.dataset.taskRow); }));
  el.querySelectorAll('[data-clear-filters]').forEach((b) => b.addEventListener('click', () => { UIState.set('tasks', { q: '', view: 'team' }); render(el); }));
  el.querySelectorAll('[data-retry-load]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await requestSync({ source: 'tasks', mode: 'refresh' }); } catch { /* the loader has said what failed */ } render(el); }));
}
