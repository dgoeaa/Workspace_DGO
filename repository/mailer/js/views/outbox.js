import { esc, fmtDateTime, toCsv, download } from '../util.js';
import { toast, confirmDialog, statusBadge, badge, empty } from '../ui.js';
import { tally } from '../campaign.js';
import { op } from '../api.js';
import { Reports } from '../reports.js';
import { Sender } from '../sender.js';
import { duplicateLetter } from '../letters.js';
import { letterLog } from '../logcheck.js';

let serverLog = null; // { campaignId, items, error, at }

/* A real message's id is exactly <mailing id>-<recipient key>; a test send's is
   <mailing id>-TEST-<random>. A recipient whose key merely contains "TEST" is not a test. */
const isTestSend = (i) => Boolean(i.messageId) && i.messageId !== `${i.campaignId}-${i.recipientKey}` && /-TEST-[^-]+$/.test(i.messageId);

export async function render(app, params) {
  const [id] = params;
  return id ? detail(app, id) : list(app);
}

function list(app) {
  const cs = app.state.campaigns;
  const wired = Boolean(app.state.settings.endpoints?.MAIL_LOG);
  const html = `
    <section class="page-head"><div><h1>Outbox &amp; log</h1>
      <p class="lede">Every mailing made in this browser${wired ? ', and the shared send log in SharePoint' : ''}.</p></div>
      <div class="actions"><button class="btn" data-log ${wired ? '' : 'disabled title="Wire MAIL_LOG first"'}>Load recent log entries</button></div></section>
    ${cs.length ? `<section class="panel"><div class="table-wrap"><table class="table">
      <thead><tr><th>Mailing</th><th>Status</th><th>Progress</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${cs.map((c) => { const t = tally(c); return `<tr>
        <td><a href="#/outbox/${esc(c.id)}">${esc(c.name)}</a><div class="small muted"><code>${esc(c.id)}</code></div></td>
        <td>${badge(c.status, c.status === 'done' ? 'ok' : c.status === 'partial' ? 'warn' : c.status === 'sending' ? 'info' : 'neutral')}</td>
        <td>${t.sent}/${t.total} sent${t.failed ? ` · <span class="bad-text">${t.failed} failed</span>` : ''}${t.simulated ? ` · ${t.simulated} simulated` : ''}</td>
        <td class="small muted">${esc(fmtDateTime(c.updatedAt))}</td>
        <td class="row-actions"><a class="btn btn-sm" href="#/compose/${esc(c.id)}">Open</a><button class="btn btn-sm" data-dup="${esc(c.id)}">Duplicate</button><button class="btn btn-sm btn-ghost" data-del="${esc(c.id)}" aria-label="Delete">✕</button></td>
      </tr>`; }).join('')}</tbody></table></div></section>`
      : empty('No mailings yet', 'Start one and it appears here.', '<a class="btn btn-primary" href="#/compose">New mailing</a>')}
    ${logPanel(null)}`;
  return { title: 'Outbox', html, bind: (root) => bindCommon(app, root, null) };
}

function detail(app, id) {
  const c = app.state.campaigns.find((x) => x.id === id);
  if (!c) return { title: 'Outbox', html: empty('Mailing not found', '', '<a class="btn" href="#/outbox">Back</a>') };
  const t = tally(c);
  const wired = Boolean(app.state.settings.endpoints?.MAIL_LOG);
  const byKey = new Map(app.state.directory.map((r) => [r.key, r]));
  const html = `
    <section class="page-head"><div><h1>${esc(c.name)}</h1>
      <p class="lede"><code>${esc(c.id)}</code> · ${t.sent}/${t.total} sent${t.failed ? ` · ${t.failed} failed` : ''}${t.simulated ? ` · ${t.simulated} simulated` : ''}</p></div>
      <div class="actions"><a class="btn" href="#/compose/${esc(c.id)}/send">Send / retry</a><button class="btn" data-export>Export CSV</button>
      <button class="btn" data-log ${wired ? '' : 'disabled title="Wire MAIL_LOG first"'}>Check against the SharePoint log</button></div></section>
    <section class="panel"><div class="table-wrap"><table class="table">
      <thead><tr><th>Recipient</th><th>Status</th><th>When</th><th>Detail</th></tr></thead>
      <tbody>${c.recipients.map((k) => { const r = c.results?.[k] || {}; return `<tr>
        <td><strong>${esc(k)}</strong><div class="small muted">${esc(byKey.get(k)?.institution || '')}</div></td>
        <td>${statusBadge(r.status || 'pending')}</td><td class="small muted">${esc(fmtDateTime(r.at))}</td>
        <td class="small">${r.error ? `<span class="bad-text">${esc(r.error)}</span>` : ''}${r.logItemId ? ` log #${esc(r.logItemId)}` : ''}${r.runId ? ` · run ${esc(r.runId)}` : ''}</td></tr>`; }).join('')}</tbody>
    </table></div>
    ${(c.tests || []).length ? `<h3>Test sends</h3><ul class="plain">${c.tests.map((x) => `<li>${statusBadge(x.status)} ${esc(x.key)} → ${esc(x.to)} <span class="muted">${esc(fmtDateTime(x.at))}</span>${x.error ? ` <span class="bad-text">${esc(x.error)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    </section>
    ${logPanel(c.id)}`;
  const bind = (root) => {
    bindCommon(app, root, c.id);
    root.querySelector('[data-export]').addEventListener('click', () => {
      const rows = c.recipients.map((k) => ({ key: k, institution: byKey.get(k)?.institution || '', status: c.results?.[k]?.status || 'pending', at: c.results?.[k]?.at || '', error: c.results?.[k]?.error || '', messageId: `${c.id}-${k}`, logItemId: c.results?.[k]?.logItemId ?? '' }));
      download(`${c.id}-results.csv`, toCsv(rows, Object.keys(rows[0] || { key: '' })), 'text/csv');
    });
  };
  return { title: c.name, html, bind };
}

function logPanel(campaignId) {
  if (!serverLog || serverLog.campaignId !== campaignId) return '';
  if (serverLog.error) return `<section class="panel"><h2>SharePoint log</h2><p class="bad-text">${esc(serverLog.error)}</p></section>`;
  return `<section class="panel"><h2>SharePoint log <span class="muted small">${serverLog.items.length} entr${serverLog.items.length === 1 ? 'y' : 'ies'} · loaded ${esc(fmtDateTime(serverLog.at))}</span></h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Message</th><th>Status</th><th>Sent</th><th>To</th><th>Operator</th></tr></thead>
    <tbody>${serverLog.items.map((i) => `<tr><td><strong>${esc(i.recipientKey || '')}</strong> <span class="small muted">${esc(i.institution || '')}</span><div class="small"><code>${esc(i.messageId)}</code></div><div class="small">${esc(i.subject || '')}</div></td>
      <td>${statusBadge(String(i.status || '').toLowerCase())}${i.error ? `<div class="small bad-text">${esc(i.error)}</div>` : ''}</td>
      <td class="small muted">${esc(fmtDateTime(i.sentAt || i.created))}</td><td class="small">${esc(i.to || '')}</td><td class="small">${esc(i.operatorEmail || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No entries.</td></tr>'}</tbody></table></div></section>`;
}

function bindCommon(app, root, campaignId) {
  root.querySelector('[data-log]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const c = campaignId ? app.state.campaigns.find((x) => x.id === campaignId) : null;
    const report = Reports.begin(app, 'log-check', c ? c.name : 'Recent log entries', { List: 'DGOMailLog', Scope: c ? `This mailing (${c.id})` : 'Latest 200 entries, all mailings' });
    try {
      const items = c ? await letterLog(app.state.settings, c) : ((await op(app.state.settings, 'MAIL_LOG', 'list', { top: 200 }))?.items || []);
      serverLog = { campaignId, items, at: new Date().toISOString() };
      /* Reconcile: the log is the record of what went. A local "failed" the log calls Sent was
         a lost answer, not a lost message. */
      if (c) {
        let fixed = 0;
        const byKey = new Map();
        for (const i of serverLog.items) if (i.recipientKey && !isTestSend(i)) byKey.set(i.recipientKey, byKey.get(i.recipientKey) || i);
        for (const k of c.recipients) {
          const i = byKey.get(k);
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
        for (const i of serverLog.items.filter(isTestSend)) report.add(`Test: ${i.to}`, i.status === 'Sent' ? 'ok' : 'warn', `Log: ${i.status} ${i.sentAt || ''} (entry #${i.logItemId}).`);
        if (fixed) await app.saveCampaign(c);
        await report.finish(fixed ? `${fixed} message(s) the log records as Sent were marked Sent here.` : '');
      } else {
        for (const i of serverLog.items) report.add(`${i.recipientKey || '—'} — ${i.institution || ''}`, i.status === 'Sent' ? 'ok' : i.status === 'Failed' ? 'fail' : 'warn', `${i.status} ${i.sentAt || i.created || ''} to ${i.to || '—'}. ${i.subject || ''}${i.error ? `\n${i.error}` : ''}`);
        await report.finish('', { show: false });
      }
    } catch (err) {
      serverLog = { campaignId, items: [], error: err.message, at: new Date().toISOString() };
      report.add('DGOMailLog', 'fail', err.message);
      await report.finish();
    }
    app.render();
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del) {
      if (Sender.run?.campaignId === b.dataset.del && Sender.busy()) { toast('That mailing is being sent.', 'bad'); return; }
      if (!(await confirmDialog('Delete mailing', 'Delete this mailing from this browser? The SharePoint log is not affected.', { submit: 'Delete', danger: true }))) return;
      await app.deleteCampaign(b.dataset.del);
      app.render();
    }
    if (b.dataset.dup) {
      const src = app.state.campaigns.find((x) => x.id === b.dataset.dup);
      /* The same copy as Letters makes: a new letter, never shared yet, with no numbers issued. */
      const copy = await duplicateLetter(app, src);
      app.navigate(`#/compose/${copy.id}/letter`);
    }
  });
}
