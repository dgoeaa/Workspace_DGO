// Operation reports. Every operation that talks to the flows (sending, test sends, dry runs,
// health checks, provisioning, SharePoint push and pull, reading the log) writes one.
//
// A notice that fades after a few seconds is not a record: an operator who looked away has no
// way to know what happened to message 17 of 24. So each operation builds a report as it runs —
// one line per item, with its outcome and detail — and when it finishes the report opens and
// stays open until closed. It is also kept (the latest 200) on the Activity page, and can be
// downloaded as CSV or JSON for the file.

import { Store } from './store.js';
import { esc, uid, fmtDateTime, toCsv, download } from './util.js';
import { modal, badge } from './ui.js';

const KEY = 'reports';
const KEEP = 200;

export const OUTCOME = Object.freeze({
  ok: ['Done', 'ok'],
  warn: ['Warning', 'warn'],
  fail: ['Failed', 'bad'],
  skip: ['Skipped', 'neutral'],
  info: ['Info', 'info'],
});

export const KIND_LABEL = Object.freeze({
  send: 'Send mailing',
  test: 'Test send',
  dryrun: 'Dry run',
  health: 'Flow checks',
  provision: 'Provision SharePoint',
  'directory-push': 'Directory → SharePoint',
  'directory-pull': 'SharePoint → Directory',
  'directory-import': 'Directory CSV import',
  'directory-delete': 'Directory delete',
  'templates-push': 'Templates → SharePoint',
  'templates-pull': 'SharePoint → Templates',
  'templates-delete': 'Template delete',
  'log-check': 'Check against the log',
  restore: 'Restore',
  export: 'Export everything',
  sync: 'Shared data',
  operators: 'Operator access',
  setup: 'Automatic setup',
});

export class Report {
  constructor(kind, title, context = {}, operator = '') {
    this.id = uid('rpt');
    this.kind = kind;
    this.title = title;
    this.context = context;
    this.operator = operator;
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.status = 'running';
    this.note = '';
    this.items = [];
  }

  /** One line of the report. */
  add(label, outcome, detail = '', extra = {}) {
    this.items.push({ at: new Date().toISOString(), label: String(label), outcome, detail: String(detail ?? ''), ...extra });
    return this;
  }

  counts() {
    const c = { ok: 0, warn: 0, fail: 0, skip: 0, info: 0, total: this.items.length };
    for (const i of this.items) c[i.outcome] = (c[i.outcome] || 0) + 1;
    return c;
  }

  /** Close the report, save it, and (by default) open it. */
  async finish(note = '', { show = true } = {}) {
    this.finishedAt = new Date().toISOString();
    this.note = note;
    const c = this.counts();
    this.status = c.fail && (c.ok || c.info) ? 'partial' : c.fail ? 'failed' : c.warn ? 'warnings' : 'succeeded';
    await Reports.save(this);
    if (show) Reports.show(this);
    return this;
  }
}

const STATUS = {
  succeeded: ['Succeeded', 'ok'],
  warnings: ['Succeeded with warnings', 'warn'],
  partial: ['Partly failed', 'bad'],
  failed: ['Failed', 'bad'],
  running: ['Running', 'info'],
};

const duration = (r) => {
  if (!r.finishedAt) return '';
  const ms = new Date(r.finishedAt) - new Date(r.startedAt);
  return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
};

export const Reports = {
  /** Start a report. `app` supplies the operator. */
  begin(app, kind, title, context = {}) {
    return new Report(kind, title, context, app?.state?.settings?.operator?.email || '');
  },

  async list() { return Store.get(KEY, []); },

  /** Set by app.js: also keep each finished report in SharePoint, for every device. */
  onSave: null,

  async save(r) {
    const all = (await Store.get(KEY, [])).filter((x) => x.id !== r.id);
    const copy = JSON.parse(JSON.stringify(r));
    all.unshift(copy);
    await Store.set(KEY, all.slice(0, KEEP));
    if (Reports.onSave) Promise.resolve(Reports.onSave(copy)).catch(() => {});
  },

  async clear() { await Store.set(KEY, []); },
  /** Open a saved report by its id (from a notice's "View report"). */
  async showById(id) { const r = (await this.list()).find((x) => x.id === id); if (r) this.show(r); return Boolean(r); },

  statusBadge(r) { const [l, k] = STATUS[r.status] || [r.status, 'neutral']; return badge(l, k); },

  countsText(r) {
    const c = (r.counts ? r.counts() : countsOf(r));
    return [c.ok && `${c.ok} done`, c.fail && `${c.fail} failed`, c.warn && `${c.warn} warning${c.warn > 1 ? 's' : ''}`, c.skip && `${c.skip} skipped`, c.info && `${c.info} info`]
      .filter(Boolean).join(' · ') || 'no items';
  },

  csv(r) {
    const head = [
      { label: 'Report', outcome: '', detail: `${KIND_LABEL[r.kind] || r.kind}: ${r.title}` },
      { label: 'Status', outcome: '', detail: (STATUS[r.status] || [r.status])[0] },
      { label: 'Started', outcome: '', detail: r.startedAt },
      { label: 'Finished', outcome: '', detail: r.finishedAt || '' },
      { label: 'Operator', outcome: '', detail: r.operator },
      ...Object.entries(r.context || {}).map(([k, v]) => ({ label: k, outcome: '', detail: String(v) })),
      ...(r.note ? [{ label: 'Note', outcome: '', detail: r.note }] : []),
      { label: '', outcome: '', detail: '' },
    ];
    const rows = r.items.map((i) => ({ ...i, outcome: (OUTCOME[i.outcome] || [i.outcome])[0] }));
    return toCsv([...head, ...rows], ['label', 'outcome', 'detail', 'at']);
  },

  downloadCsv(r) { download(`${r.kind}-${r.startedAt.slice(0, 19).replace(/[:T]/g, '-')}.csv`, this.csv(r), 'text/csv'); },
  downloadJson(r) { download(`${r.kind}-${r.startedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(r, null, 2), 'application/json'); },

  /** The report, in a dialog that stays open until closed. */
  show(r) {
    const counts = Reports.countsText(r);
    const body = `
      <div class="report-head">
        ${Reports.statusBadge(r)} <span class="muted small">${esc(counts)}</span>
      </div>
      <dl class="meta">
        <dt>Operation</dt><dd>${esc(KIND_LABEL[r.kind] || r.kind)}</dd>
        <dt>Started</dt><dd>${esc(fmtDateTime(r.startedAt))}</dd>
        <dt>Took</dt><dd>${esc(duration(r) || '—')}</dd>
        ${r.operator ? `<dt>Operator</dt><dd>${esc(r.operator)}</dd>` : ''}
        ${Object.entries(r.context || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl>
      ${r.note ? `<div class="callout">${esc(r.note)}</div>` : ''}
      <div class="table-wrap report-table"><table class="table">
        <thead><tr><th>#</th><th>Item</th><th>Result</th><th>Detail</th></tr></thead>
        <tbody>${r.items.map((i, n) => {
          const [label, kind] = OUTCOME[i.outcome] || [i.outcome, 'neutral'];
          return `<tr><td class="muted small">${n + 1}</td><td>${esc(i.label)}</td><td>${badge(label, kind)}</td><td class="small">${esc(i.detail).replace(/\n/g, '<br>')}</td></tr>`;
        }).join('') || '<tr><td colspan="4" class="muted">Nothing to report.</td></tr>'}</tbody>
      </table></div>
      <div class="toolbar report-actions">
        <button type="button" class="btn" data-rpt-csv>Download CSV</button>
        <button type="button" class="btn" data-rpt-json>Download JSON</button>
        <a class="btn btn-ghost" href="#/activity" data-rpt-activity>All reports</a>
      </div>`;
    return modal({
      title: `${KIND_LABEL[r.kind] || r.kind}: ${r.title}`,
      body,
      submit: '',
      cancel: 'Close',
      wide: true,
      onOpen: (dlg) => {
        dlg.querySelector('[data-rpt-csv]').addEventListener('click', () => Reports.downloadCsv(r));
        dlg.querySelector('[data-rpt-json]').addEventListener('click', () => Reports.downloadJson(r));
        dlg.querySelector('[data-rpt-activity]').addEventListener('click', () => dlg.close());
      },
    });
  },
};

function countsOf(r) {
  const c = { ok: 0, warn: 0, fail: 0, skip: 0, info: 0, total: (r.items || []).length };
  for (const i of r.items || []) c[i.outcome] = (c[i.outcome] || 0) + 1;
  return c;
}

/** Rehydrate a stored report so it has its methods back. */
export function asReport(stored) {
  return Object.assign(Object.create(Report.prototype), stored);
}
