import { Session } from '../session.js';
import { esc, fmtDateTime } from '../util.js';
import { isLive, ENDPOINT_KEYS } from '../settings.js';
import { tally } from '../campaign.js';
import { badge } from '../ui.js';
import { Reports, KIND_LABEL } from '../reports.js';

export async function render(app) {
  const { settings, directory, templates, campaigns } = app.state;
  const live = isLive(settings);
  const wired = ENDPOINT_KEYS.filter((e) => settings.endpoints?.[e.key]).length;
  const active = directory.filter((r) => r.active !== false && r.email);
  const noEmail = directory.filter((r) => !r.email);
  const caution = directory.filter((r) => r.caution && r.email);
  const recent = campaigns.slice(0, 6);
  const activity = (await Reports.list()).slice(0, 6);

  const steps = [
    [wired === ENDPOINT_KEYS.length, `All ${ENDPOINT_KEYS.length} flows wired (automatic setup does this)`, '#/flows'],
    [Session.active(), 'Signed in with a mailed code', '#/settings'],
    [Boolean(settings.operator?.email && settings.sender?.name), 'Fill in the signatory profile', '#/settings'],
    [Boolean(settings.endpoints?.MAIL_PROVISION), 'Provision the SharePoint lists (Flows & setup → Provision)', '#/flows'],
    [campaigns.some((c) => Object.values(c.results || {}).some((r) => r.status === 'sent')), 'Send a first live message', '#/compose'],
  ];

  const html = `
    <section class="page-head">
      <div><h1>Dashboard</h1>
      <p class="lede">Personalised official correspondence to government institutions, sent through Power Automate — one tailored email, with its own attachments, per addressee.</p></div>
      <a class="btn btn-primary" href="#/compose">✉ New mailing</a>
    </section>

    ${live ? '' : `<div class="callout callout-warn"><strong>Practice mode.</strong> Sending is not connected, so nothing is emailed. Everything else works — build, preview and rehearse a mailing, then wire the flows in <a href="#/flows">Flows &amp; setup</a>.</div>`}

    <div class="stats">
      <div class="stat"><div class="stat-num">${active.length}</div><div class="stat-label">addressees ready</div><div class="stat-sub">${directory.length} in directory${noEmail.length ? ` · ${noEmail.length} without a verified address` : ''}</div></div>
      <div class="stat"><div class="stat-num">${templates.length}</div><div class="stat-label">letter templates</div></div>
      <div class="stat"><div class="stat-num">${campaigns.length}</div><div class="stat-label">mailings</div><div class="stat-sub">${campaigns.filter((c) => c.status === 'draft').length} draft</div></div>
      <div class="stat"><div class="stat-num">${wired}/${ENDPOINT_KEYS.length}</div><div class="stat-label">flows wired</div><div class="stat-sub">${live ? 'sending is live' : 'simulation'}</div></div>
    </div>

    <div class="grid-2">
      <section class="panel">
        <h2>Recent mailings</h2>
        ${recent.length ? `<table class="table"><thead><tr><th>Mailing</th><th>Progress</th><th>Updated</th></tr></thead><tbody>
          ${recent.map((c) => {
            const t = tally(c);
            return `<tr><td><a href="#/${c.status === 'draft' ? 'compose' : 'outbox'}/${esc(c.id)}">${esc(c.name)}</a></td>
              <td>${badge(`${t.sent} sent`, t.sent ? 'ok' : 'neutral')} ${t.failed ? badge(`${t.failed} failed`, 'bad') : ''} ${t.simulated ? badge(`${t.simulated} simulated`, 'info') : ''} <span class="muted">of ${t.total}</span></td>
              <td class="muted">${esc(fmtDateTime(c.updatedAt))}</td></tr>`;
          }).join('')}</tbody></table>`
          : '<p class="muted">No mailings yet. Start one with <a href="#/compose">New mailing</a>.</p>'}
      </section>

      <section class="panel">
        <h2>Recent activity</h2>
        ${activity.length ? `<table class="table"><tbody>${activity.map((r) => `<tr><td><strong>${esc(KIND_LABEL[r.kind] || r.kind)}</strong><div class="small muted">${esc(r.title)}</div></td><td>${Reports.statusBadge(r)}<div class="small muted">${esc(Reports.countsText(r))}</div></td><td class="small muted">${esc(fmtDateTime(r.startedAt))}</td></tr>`).join('')}</tbody></table>
          <p><a href="#/activity">All reports →</a></p>` : '<p class="muted">Nothing yet. Every operation will be reported here and on the Activity page.</p>'}
      </section>

      <section class="panel">
        <h2>Go-live checklist</h2>
        <ol class="checklist">
          ${steps.map(([ok, text, href]) => `<li class="${ok ? 'done' : ''}"><span class="tick" aria-hidden="true">${ok ? '✓' : ''}</span><a href="${href}">${esc(text)}</a><span class="sr-only">${ok ? ' (done)' : ' (to do)'}</span></li>`).join('')}
        </ol>
        ${caution.length ? `<h3>Addresses with a caution in the guide</h3><ul class="plain">${caution.map((r) => `<li><strong>${esc(r.key)}</strong> — ${esc(r.notes || r.verification)}</li>`).join('')}</ul>` : ''}
        ${noEmail.length ? `<h3>No verified address</h3><ul class="plain">${noEmail.map((r) => `<li><strong>${esc(r.key)}</strong> — ${esc(r.institution)}. ${esc(r.verification)}.</li>`).join('')}</ul>` : ''}
      </section>
    </div>`;

  return { title: 'Dashboard', html };
}
