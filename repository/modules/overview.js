/**
 * Overview (essentials plan UX-303, docs/architecture/ESSENTIALS_MAP.md §8.1): figures, incoming by intake, what needs
 * attention, and Reports.
 *
 * Replaces Command Center, Statistics and Reports. Every figure is a link to the list it counts (core/overview.js):
 * Inbox figures open the Inbox at Intake's address with that filter, task figures open Tasks at My Work's address with
 * that view. The attention list opens each task's record page. Reports is Reports' own two named reports and its one
 * email action (modules/reports.js, drawn here), and the one Export to spreadsheet is the register as the Inbox lists it.
 * Behind the essential screens' switch, drawn at the Command Center's address.
 */
import { hydrateGovernance } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { esc, toast, fmtDate } from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { Router } from '../core/router.js';
import { canCurrentUserAccess } from '../core/current-user.js';
import { exportCsv } from '../core/report-export-service.js';
import { overview } from '../core/overview.js';
import { inboxRows } from '../core/inbox-view.js';
import { sourceView } from '../config/source-views.config.js';
import { essentialHead, linkedRecordNotice, bindLinkedRecordNotice } from '../shared/record-page.js';
import { welcomeLine } from './home.js';

/* The list a figure opens, at the address that draws it while the essential screens are on. */
const ROUTE = { inbox: 'correspondence', tasks: 'orchestrator' };
const may = (r) => { try { return canCurrentUserAccess(r); } catch { return false; } };
function openList(list, filter) {
  UIState.set(list, list === 'inbox' ? { status: 'open', source: 'all', category: '', files: false, q: '', ...filter } : { q: '', ...filter });
  Router.go(ROUTE[list]);
}

export async function mount(el) {
  hydrateGovernance(); render(el);
  const redraw = () => { if (!el.isConnected) return off(); if (!document.querySelector('[data-record-page]')) render(el); };
  const off = () => { removeEventListener('dgo:record-page-closed', redraw); removeEventListener('dgo:data-loaded', redraw); };
  addEventListener('dgo:record-page-closed', redraw); addEventListener('dgo:data-loaded', redraw);
}

function render(el) {
  const s = State.get(), o = overview(s);
  const fig = (f, attrs) => `<button type="button" class="kpi dgo-metric overview-figure" ${attrs}><small class="dgo-metric__label">${esc(f.label)}</small><b class="dgo-metric__value">${esc(f.value)}</b></button>`;
  const figures = o.figures.filter((f) => may(ROUTE[f.list])).map((f) => fig(f, `data-figure="${esc(f.id)}"`)).join('');
  const intakes = may('correspondence') ? `<section class="panel" aria-labelledby="ov-intakes"><h2 id="ov-intakes">Incoming by intake</h2><div class="kpis dgo-dashboard__metrics">${o.intakes.map((i) => fig(i, `data-intake="${esc(i.id)}" title="${esc(sourceView(i.id).purpose)}"`)).join('')}</div></section>` : '';
  const attention = may('orchestrator') ? `<section class="panel" aria-labelledby="ov-attention"><h2 id="ov-attention">Needs attention${o.attentionTotal > o.attention.length ? ` (${o.attention.length} of ${o.attentionTotal})` : ''}</h2>
    ${o.attention.length ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table"><thead><tr><th>Task</th><th>Reference</th><th>Owner</th><th>Due</th><th>Why</th></tr></thead><tbody>${o.attention.map((t) => `<tr class="row-link" data-attention-row="${esc(t.key)}"><td><button type="button" class="row-open" data-open-record="${esc(t.key)}">${esc(t.title)}</button></td><td>${esc(t.referenceId || '—')}</td><td>${esc(t.owner)}</td><td>${esc(t.due ? fmtDate(t.due) : '—')}</td><td>${esc(t.why)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="meta">Nothing is overdue, due within a day or waiting to be acknowledged.</p>'}</section>` : '';
  const reports = may('reports') ? '<section class="panel" data-overview-reports></section>' : '';
  el.innerHTML = `<div class="workspace">${essentialHead('Overview')}${linkedRecordNotice()}
    <p class="meta">${esc(welcomeLine(s))}</p>
    <section class="panel" aria-label="Figures"><div class="kpis dgo-dashboard__metrics" data-strip>${figures}</div>${may('reports') ? '<div class="form-row"><button type="button" class="btn ghost" data-export>Export to spreadsheet</button></div>' : ''}</section>
    ${intakes}${attention}${reports}</div>`;
  bindLinkedRecordNotice(el, () => render(el));
  el.querySelectorAll('[data-figure]').forEach((b) => b.addEventListener('click', () => { const f = o.figures.find((x) => x.id === b.dataset.figure); openList(f.list, f.filter); }));
  el.querySelectorAll('[data-intake]').forEach((b) => b.addEventListener('click', () => { const i = o.intakes.find((x) => x.id === b.dataset.intake); openList('inbox', i.filter); }));
  el.querySelector('[data-export]')?.addEventListener('click', () => {
    const rows = inboxRows(State.get()).map((r) => ({ reference: r.key || 'Not registered', subject: r.title, from: r.from, intake: sourceView(r.source).label, received: fmtDate(r.received), stands: r.stageLabel, tasks: r.tasks, physicalFile: r.hasFile ? 'Yes' : 'No' }));
    if (!rows.length) return toast('There is nothing to export: no record has loaded on this device', 'error');
    exportCsv(rows, ['reference', 'subject', 'from', 'intake', 'received', 'stands', 'tasks', 'physicalFile'].map((k) => ({ key: k, label: k })), 'register.csv');
  });
  const host = el.querySelector('[data-overview-reports]');
  if (host) import('./reports.js').then((m) => m.mountEmbedded(host)).catch(() => { host.innerHTML = '<p class="meta">Reports could not be drawn.</p>'; });
}
