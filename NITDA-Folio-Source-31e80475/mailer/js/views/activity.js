// Activity: every operation's report, newest first. Open one to see it line by line, or download
// it. Reports are kept in this browser (the latest 200) and shared through SharePoint; a sent
// message's durable record is the SharePoint send log, which Outbox & log reads.

import { esc, fmtDateTime, toCsv, download } from '../util.js';
import { confirmDialog, empty, toast } from '../ui.js';
import { Reports, KIND_LABEL, asReport } from '../reports.js';
import { Sync } from '../sync.js';

let kindFilter = '';

export async function render(app) {
  const all = await Reports.list();
  const rows = all.filter((r) => !kindFilter || r.kind === kindFilter);
  const kinds = [...new Set(all.map((r) => r.kind))];

  const html = `
    <section class="page-head"><div><h1>Activity</h1>
      <p class="lede">A report of every operation: sends, test sends, dry runs, flow checks, provisioning, SharePoint push and pull, and log checks. Open any report for its line-by-line results.</p></div>
      <div class="actions">
        <button class="btn" data-export ${all.length ? '' : 'disabled'}>Download summary CSV</button>
        <button class="btn btn-ghost" data-clear ${all.length ? '' : 'disabled'}>Clear history</button>
      </div></section>
    ${all.length ? `
    <div class="toolbar">
      <select class="input" data-kind aria-label="Show operations of type">
        <option value="">All operations (${all.length})</option>
        ${kinds.map((k) => `<option value="${esc(k)}" ${k === kindFilter ? 'selected' : ''}>${esc(KIND_LABEL[k] || k)} (${all.filter((r) => r.kind === k).length})</option>`).join('')}
      </select>
    </div>
    <section class="panel"><div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Operation</th><th>Result</th><th>Items</th><th>By</th><th><span class="sr-only">Open</span></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="small">${esc(fmtDateTime(r.startedAt))}</td>
        <td><strong>${esc(KIND_LABEL[r.kind] || r.kind)}</strong><div class="small muted">${esc(r.title)}</div></td>
        <td>${Reports.statusBadge(r)}</td>
        <td class="small">${esc(Reports.countsText(r))}</td>
        <td class="small muted">${esc(r.operator || '')}</td>
        <td class="row-actions"><button class="btn btn-sm" data-open="${esc(r.id)}">Open</button></td>
      </tr>`).join('')}</tbody>
    </table></div></section>`
    : empty('No activity yet', 'Every send, test, dry run, flow check and SharePoint operation will be reported here.')}`;

  const bind = (root) => {
    root.querySelector('[data-kind]')?.addEventListener('change', (e) => { kindFilter = e.target.value; app.render(); });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.open) {
        const r = all.find((x) => x.id === b.dataset.open);
        if (r) Reports.show(asReport(r));
      }
      if (b.dataset.export !== undefined) {
        const summary = all.map((r) => ({
          started: r.startedAt, finished: r.finishedAt || '', operation: KIND_LABEL[r.kind] || r.kind, title: r.title,
          result: r.status, items: (r.items || []).length, summary: Reports.countsText(r), operator: r.operator || '', note: r.note || '',
        }));
        download(`dgo-mailer-activity-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(summary, Object.keys(summary[0])), 'text/csv');
      }
      if (b.dataset.clear !== undefined) {
        const shared = Sync.on(app);
        if (!(await confirmDialog('Clear history', shared
          ? 'Delete every report, here and in SharePoint, so no device shows them again? Mailings, their results and the SharePoint send log are not affected.'
          : 'Delete every report from this browser? Mailings, their results and the SharePoint log are not affected.', { submit: 'Clear', danger: true }))) return;
        const ids = all.map((r) => r.id);
        await Reports.clear();
        app.render();
        const left = await Sync.clearReports(app, ids);
        if (left) toast(`${left} report(s) are still in SharePoint; they will be deleted at the next sync and will not come back meanwhile.`, 'warn', 9000);
      }
    });
  };
  return { title: 'Activity', html, bind };
}
