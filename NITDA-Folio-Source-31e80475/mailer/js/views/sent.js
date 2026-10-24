// Sent: every letter that has gone (or partly gone), and for one letter, what happened to each
// addressee, checked against the shared send log when the log is connected.

import { esc, fmtDateTime, toCsv, download } from '../util.js';
import { toast, confirmDialog, statusBadge, empty } from '../ui.js';
import { tally, referenceFor } from '../campaign.js';
import { op } from '../api.js';
import { Reports } from '../reports.js';
import { Sender } from '../sender.js';
import { letterLog } from '../logcheck.js';
import { duplicateLetter, typeLabel, ago } from '../letters.js';

/* A real message's id is exactly <letter id>-<addressee key>; a test send's is
   <letter id>-TEST-<random>. An addressee whose key merely contains "TEST" is not a test. */
const isTestSend = (i) => Boolean(i.messageId) && i.messageId !== `${i.campaignId}-${i.recipientKey}` && /-TEST-[^-]+$/.test(i.messageId);

/* A letter is known by its name, which follows its title until someone renames it. */
const title = (c) => c.name || c.fields?.LetterTitle || c.subject;
const hasGone = (c) => c.status === 'done' || c.status === 'sending' || (c.status === 'partial' && tally(c).sent > 0);

let filter = { q: '', show: 'all' };
let checked = {}; // campaignId -> { at, entries, error }

export async function render(app, params) {
  const [id] = params;
  return id ? detail(app, id) : list(app);
}

function list(app) {
  const cs = app.state.campaigns.filter(hasGone)
    .sort((a, b) => String(b.lastRunAt || b.updatedAt).localeCompare(String(a.lastRunAt || a.updatedAt)));
  const q = filter.q.toLowerCase();
  const shown = cs.filter((c) => {
    const t = tally(c);
    if (filter.show === 'failed' && !t.failed) return false;
    if (filter.show === 'complete' && (t.failed || t.sent < t.total)) return false;
    return !q || `${title(c)} ${c.name} ${typeLabel(app, c)}`.toLowerCase().includes(q);
  });
  const row = (c) => {
    const t = tally(c);
    const pct = t.total ? Math.round((t.sent / t.total) * 100) : 0;
    const kind = t.failed ? 'bad' : t.sent === t.total ? 'ok' : 'todo';
    return `<li class="letter-card sent-card">
      <a class="letter-card-main" href="#/sent/${esc(c.id)}">
        <span class="letter-kind">${esc(typeLabel(app, c))}</span>
        <strong class="letter-title">${esc(title(c))}</strong>
        <span class="letter-meta">${esc(ago(c.lastRunAt || c.updatedAt))} · ${t.total} addressee${t.total === 1 ? '' : 's'}</span>
        <span class="state state-${kind}">${t.sent} of ${t.total} sent${t.failed ? ` · ${t.failed} failed` : ''}</span>
        <span class="progress progress-thin" aria-hidden="true"><span style="width:${pct}%"></span></span>
      </a>
      <div class="letter-card-actions">
        <a class="btn btn-sm" href="#/sent/${esc(c.id)}">Details</a>
        ${t.failed || t.sent < t.total ? `<a class="btn btn-sm btn-primary" href="#/letter/${esc(c.id)}/send">Send the rest</a>` : ''}
      </div>
    </li>`;
  };
  const html = `
    <section class="page-head"><div><h1>Sent</h1>
      <p class="lede">Every letter that has gone out, and to whom. Open one to see each addressee and check it against the send log.</p></div></section>
    ${cs.length ? `
    <div class="to-tools">
      <input class="input grow" type="search" placeholder="Search sent letters" aria-label="Search sent letters" value="${esc(filter.q)}" data-q>
      <div class="seg" role="group" aria-label="Show">
        ${[['all', 'All'], ['failed', 'With failures'], ['complete', 'Complete']].map(([k, l]) => `<button class="btn btn-sm${filter.show === k ? ' is-on' : ''}" aria-pressed="${filter.show === k}" data-show="${k}">${l}</button>`).join('')}
      </div>
    </div>
    <div data-region="list">${shown.length ? `<ul class="plain letter-list">${shown.map(row).join('')}</ul>` : '<p class="muted pad">No sent letters match.</p>'}</div>`
    : empty('Nothing sent yet', 'Letters appear here once they have gone.', '<a class="btn btn-primary" href="#/">Go to Letters</a>')}`;
  const bind = (root) => {
    root.querySelector('[data-q]')?.addEventListener('input', (e) => {
      filter.q = e.target.value;
      clearTimeout(bind.t);
      bind.t = setTimeout(() => app.render({ keepScroll: true }).then?.(() => {
        const i = document.querySelector('[data-q]');
        if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      }), 200);
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-show]');
      if (b) { filter.show = b.dataset.show; app.render({ keepScroll: true }); }
    });
  };
  return { title: 'Sent', html, bind };
}

function detail(app, id) {
  const c = app.state.campaigns.find((x) => x.id === id);
  if (!c) return { title: 'Sent', html: empty('Letter not found', 'It may have been deleted on another device.', '<a class="btn" href="#/sent">Back to Sent</a>') };
  const t = tally(c);
  const wired = Boolean(app.state.settings.endpoints?.MAIL_LOG);
  const byKey = new Map(app.state.directory.map((r) => [r.key, r]));
  const log = checked[c.id];
  const logByKey = new Map();
  for (const i of log?.entries || []) if (i.recipientKey && !isTestSend(i)) logByKey.set(i.recipientKey, logByKey.get(i.recipientKey) || i);
  const pct = t.total ? Math.round((t.sent / t.total) * 100) : 0;
  const running = Sender.busy() && Sender.run?.campaignId === c.id;

  const rows = c.recipients.map((k, idx) => {
    const r = c.results?.[k] || {};
    const d = byKey.get(k);
    const e = logByKey.get(k);
    const logCell = !log ? '' : e ? `<span class="state state-${e.status === 'Sent' ? 'ok' : e.status === 'Failed' ? 'bad' : 'todo'}">Log: ${esc(e.status)}</span>` : '<span class="muted small">Not in the log</span>';
    return `<tr data-row="${esc(k)}">
      <td><strong>${esc(d?.institution || k)}</strong><div class="small muted">${esc(k)}${d?.email ? ` · ${esc(d.email)}` : ''}</div></td>
      <td data-label="Status">${statusBadge(r.status || 'pending')}${r.reconciled ? ' <span class="small muted" title="Corrected from the send log">✓ log</span>' : ''}</td>
      <td class="small" data-label="Reference"><code>${esc(c.results?.[k]?.reference || referenceFor(c, k, idx) || '')}</code></td>
      <td class="small muted" data-label="When">${esc(fmtDateTime(r.at))}</td>
      <td class="small" data-label="Detail">${r.error ? `<span class="bad-text">${esc(r.error)}</span>` : ''}${log ? ` ${logCell}` : ''}</td>
    </tr>`;
  }).join('');

  const html = `
    <nav class="crumbs small"><a href="#/sent">← Sent</a></nav>
    <section class="page-head"><div>
      <span class="letter-kind">${esc(typeLabel(app, c))}</span>
      <h1>${esc(title(c))}</h1>
      <p class="lede">${t.sent} of ${t.total} sent${t.failed ? ` · <span class="bad-text">${t.failed} failed</span>` : ''}${t.simulated ? ` · ${t.simulated} practice` : ''} · last sent ${esc(ago(c.lastRunAt || c.updatedAt))}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>
    </div>
    <div class="actions">
      ${t.failed || t.sent < t.total ? `<a class="btn btn-primary" href="#/letter/${esc(c.id)}/send">${t.failed ? 'Retry the failed' : 'Send the rest'}</a>` : ''}
      <button class="btn" data-log ${wired ? '' : 'disabled title="The send log is not connected"'}>${log ? 'Check again' : 'Check against the send log'}</button>
      <button class="btn" data-export>Download CSV</button>
      <button class="btn" data-dup>Send again as a new letter</button>
      <button class="btn btn-ghost" data-del>Delete</button>
    </div></section>
    ${running ? '<div class="callout callout-info" aria-live="polite">This letter is being sent now. <a href="#/letter/' + esc(c.id) + '/send">Watch progress</a></div>' : ''}
    ${log?.error ? `<div class="callout callout-warn"><strong>The send log could not be read.</strong> ${esc(log.error)}</div>` : ''}
    ${log && !log.error ? `<div class="callout callout-info">Checked against the send log ${esc(ago(log.at))}: ${log.entries.length} entr${log.entries.length === 1 ? 'y' : 'ies'}${log.fixed ? `, ${log.fixed} corrected to Sent` : ''}.${log.reportId ? ' <button class="linklike" data-report>Full check</button>' : ''}</div>` : ''}
    <section class="panel">
      <div class="to-tools"><input class="input grow" type="search" placeholder="Find an addressee" aria-label="Find an addressee" data-find>
        <span class="muted small" data-found>${c.recipients.length} addressee${c.recipients.length === 1 ? '' : 's'}</span></div>
      <div class="table-wrap"><table class="table table-stack">
      <thead><tr><th>Addressee</th><th>Status</th><th>Reference</th><th>When</th><th>Detail</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      ${(c.tests || []).length ? `<h3>Test emails</h3><ul class="plain">${c.tests.map((x) => `<li>${statusBadge(x.status)} ${esc(x.key)} → ${esc(x.to)} <span class="muted small">${esc(fmtDateTime(x.at))}</span>${x.error ? ` <span class="bad-text">${esc(x.error)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    </section>`;

  const bind = (root) => {
    root.querySelector('[data-find]')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      let n = 0;
      root.querySelectorAll('tr[data-row]').forEach((tr) => { const on = !q || tr.textContent.toLowerCase().includes(q); tr.hidden = !on; if (on) n++; });
      root.querySelector('[data-found]').textContent = q ? `${n} of ${c.recipients.length} shown` : `${c.recipients.length} addressee${c.recipients.length === 1 ? '' : 's'}`;
    });
    root.querySelector('[data-report]')?.addEventListener('click', () => Reports.showById(log.reportId));
    root.querySelector('[data-export]').addEventListener('click', () => {
      const out = c.recipients.map((k, idx) => ({
        key: k, institution: byKey.get(k)?.institution || '', email: byKey.get(k)?.email || '', reference: c.results?.[k]?.reference || referenceFor(c, k, idx) || '', // the reference the letter carried
        status: c.results?.[k]?.status || 'pending', at: c.results?.[k]?.at || '', error: c.results?.[k]?.error || '',
        messageId: `${c.id}-${k}`, logStatus: logByKey.get(k)?.status || '', logItemId: c.results?.[k]?.logItemId ?? '',
      }));
      download(`${c.id}-results.csv`, toCsv(out, Object.keys(out[0] || { key: '' })), 'text/csv');
      toast('CSV downloaded.', 'ok', 3000);
    });
    root.querySelector('[data-dup]').addEventListener('click', async () => {
      const copy = await duplicateLetter(app, c);
      toast('Copied as a new draft. Change what you need, then send.', 'ok', 5000);
      app.navigate(`#/letter/${copy.id}`);
    });
    root.querySelector('[data-del]').addEventListener('click', async () => {
      if (running) { toast('This letter is being sent. Stop the send first.', 'bad'); return; }
      if (!(await confirmDialog('Delete this letter?', `"${title(c)}" will be removed from this list on every device. The send log keeps its record of what was sent.`, { submit: 'Delete', danger: true }))) return;
      await app.deleteCampaign(c.id);
      toast('Letter deleted.', 'ok', 4000);
      app.navigate('#/sent');
    });
    root.querySelector('[data-log]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.innerHTML = '<span class="spinner" aria-hidden="true"></span> Checking…';
      const report = Reports.begin(app, 'log-check', c.name, { List: 'DGOMailLog', Scope: `This letter (${c.id})` });
      try {
        const entries = await letterLog(app.state.settings, c);
        const map = new Map();
        for (const i of entries) if (i.recipientKey && !isTestSend(i)) map.set(i.recipientKey, map.get(i.recipientKey) || i);
        let fixed = 0;
        for (const k of c.recipients) {
          const i = map.get(k);
          const local = c.results?.[k]?.status || 'pending';
          if (!i) { report.add(k, local === 'sent' ? 'warn' : 'info', `No log entry. Here: ${local}.${local === 'sent' ? ' The flow answered Sent but the log row is missing; check the flow run.' : ''}`); continue; }
          if (i.status === 'Sent' && !['sent', 'duplicate'].includes(local)) {
            c.results[k] = { ...(c.results[k] || {}), status: 'sent', at: i.sentAt, logItemId: i.logItemId, error: undefined, reconciled: true };
            fixed++;
            report.add(k, 'ok', `Log: Sent ${i.sentAt || ''} (entry #${i.logItemId}). Was "${local}" here; corrected to Sent.`);
          } else if (i.status === 'Sent') report.add(k, 'ok', `Log: Sent ${i.sentAt || ''} to ${i.to} (entry #${i.logItemId}).`);
          else if (i.status === 'Failed') report.add(k, 'fail', `Log: Failed. ${i.error || ''} (entry #${i.logItemId})`);
          else report.add(k, 'warn', `Log: ${i.status} (entry #${i.logItemId}). The send was cut off before the flow recorded the outcome. Check the Sent Items of the sending mailbox before retrying.`);
        }
        for (const i of entries.filter(isTestSend)) report.add(`Test: ${i.to}`, i.status === 'Sent' ? 'ok' : 'warn', `Log: ${i.status} ${i.sentAt || ''} (entry #${i.logItemId}).`);
        if (fixed) await app.saveCampaign(c);
        await report.finish(fixed ? `${fixed} message(s) the log records as Sent were marked Sent here.` : '', { show: false });
        checked[c.id] = { at: new Date().toISOString(), entries, fixed, reportId: report.id };
        toast(fixed ? `Checked. ${fixed} corrected to Sent from the log.` : 'Checked against the send log.', 'ok', 5000);
      } catch (err) {
        report.add('DGOMailLog', 'fail', err.message);
        await report.finish('', { show: false });
        checked[c.id] = { at: new Date().toISOString(), entries: [], error: err.message, reportId: report.id };
        toast('The send log could not be read.', 'bad', 8000, { action: { label: 'Details', run: () => Reports.showById(report.id) } });
      }
      app.render({ keepScroll: true });
    });
  };
  return { title: title(c), html, bind };
}
