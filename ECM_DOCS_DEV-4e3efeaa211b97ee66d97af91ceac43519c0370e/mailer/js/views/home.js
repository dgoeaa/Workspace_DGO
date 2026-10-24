// Letters: the first page. Start a letter, pick up a draft, watch a send in progress, and see
// what went recently. Everything else is one tap away in the menu.

import { esc } from '../util.js';
import { confirmDialog, toast } from '../ui.js';
import { tally } from '../campaign.js';
import { Sender } from '../sender.js';
import { createLetter, duplicateLetter, readiness, typeLabel, ago, LETTER_TYPES } from '../letters.js';
import { isLive } from '../settings.js';

let unsubscribe = null;

export async function render(app) {
  unsubscribe?.();
  unsubscribe = null;
  const all = app.state.campaigns;
  const run = Sender.busy() ? Sender.run : null;
  const drafts = all.filter((c) => c.status === 'draft' || (c.status === 'partial' && tally(c).sent === 0));
  const unfinished = all.filter((c) => c.status === 'partial' && tally(c).sent > 0);
  const sent = all.filter((c) => c.status === 'done' || (c.status === 'partial' && tally(c).sent > 0) || c.status === 'sending')
    .sort((a, b) => String(b.lastRunAt || b.updatedAt).localeCompare(String(a.lastRunAt || a.updatedAt)));
  const live = isLive(app.state.settings);
  const ready = app.state.directory.filter((r) => r.email && r.active !== false).length;
  const sentThisMonth = all.reduce((n, c) => n + Object.values(c.results || {}).filter((r) => ['sent', 'duplicate'].includes(r.status) && String(r.at || '').slice(0, 7) === new Date().toISOString().slice(0, 7)).length, 0);

  const draftCard = (c) => {
    const r = readiness(app, c);
    const todo = r.checks.filter((x) => !x.ok);
    return `<article class="letter-card" data-id="${esc(c.id)}">
      <a class="letter-card-main" href="#/letter/${esc(c.id)}">
        <span class="letter-kind">${esc(typeLabel(app, c))}</span>
        <strong class="letter-title">${esc(c.name || c.fields?.LetterTitle || c.subject)}</strong>
        <span class="letter-meta">${c.recipients.length} addressee${c.recipients.length === 1 ? '' : 's'} · ${r.lettered} letter${r.lettered === 1 ? '' : 's'} attached · edited ${esc(ago(c.updatedAt))}</span>
        ${r.ready ? '<span class="state state-ok">Ready to send</span>' : `<span class="state state-todo">${todo.length} thing${todo.length === 1 ? '' : 's'} to finish: ${esc(todo[0]?.text || '')}</span>`}
      </a>
      <div class="letter-card-actions">
        <a class="btn btn-sm btn-primary" href="#/letter/${esc(c.id)}">Continue</a>
        <button class="btn btn-sm" data-dup="${esc(c.id)}">Duplicate</button>
        <button class="btn btn-sm btn-ghost" data-del="${esc(c.id)}" aria-label="Delete draft ${esc(c.name)}">Delete</button>
      </div>
    </article>`;
  };

  const sentRow = (c) => {
    const t = tally(c);
    const kind = t.failed ? 'bad' : t.sent === t.total ? 'ok' : 'warn';
    return `<li><a class="sent-row" href="#/sent/${esc(c.id)}">
      <span class="sent-row-title">${esc(c.name || c.fields?.LetterTitle || c.subject)}</span>
      <span class="state state-${kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'todo'}">${t.sent} of ${t.total} sent${t.failed ? ` · ${t.failed} failed` : ''}</span>
      <span class="muted small">${esc(ago(c.lastRunAt || c.updatedAt))}</span></a></li>`;
  };

  const running = run ? all.find((c) => c.id === run.campaignId) : null;
  const html = `
    <section class="home-hero">
      <div>
        <h1>Letters</h1>
        <p class="lede">Write a letter once. Each addressee gets their own copy by email, with their own signed letter attached.</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" data-new>✉ New letter</button>
      </div>
    </section>

    ${live ? '' : '<div class="callout callout-warn"><strong>Practice mode.</strong> Sending is not connected, so nothing is emailed. Everything else works. An administrator connects it in Settings → Connection.</div>'}

    ${running ? `<section class="panel panel-live" aria-live="polite">
      <div class="row-between"><h2>${run.mode === 'dryrun' ? 'Checking' : 'Sending'}: ${esc(running.name || running.fields?.LetterTitle)}</h2><a class="btn btn-sm" href="#/letter/${esc(running.id)}">Open</a></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${run.index}"><div style="width:${run.total ? Math.round((run.index / run.total) * 100) : 0}%"></div></div>
      <p class="small muted">${run.starting ? 'Preparing the attachments. Nothing has been sent yet.' : `${run.index} of ${run.total} done${run.current ? ` · now: ${esc(run.current)}` : ''}${run.paused ? ' · paused' : ''}`}</p>
    </section>` : ''}

    <div class="home-grid">
      <section class="home-main">
        <div class="section-head"><h2>Drafts</h2>${drafts.length ? `<span class="muted small">${drafts.length}</span>` : ''}</div>
        ${drafts.length ? `<div class="letter-list">${drafts.map(draftCard).join('')}</div>` : `
          <div class="empty empty-start">
            <h3>No drafts</h3>
            <p>Start a letter. Choose the addressees, write the message, add the signed letters, then send.</p>
            <div class="type-pills">${LETTER_TYPES.slice(0, 4).map((t) => `<button class="btn btn-sm" data-new="${esc(t.key)}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}</div>
          </div>`}
        ${unfinished.length ? `<div class="section-head"><h2>Not finished</h2><span class="muted small">Some letters went, some did not</span></div>
          <div class="letter-list">${unfinished.map(draftCard).join('')}</div>` : ''}
      </section>
      <aside class="home-side">
        <section class="panel">
          <div class="section-head"><h2>Recently sent</h2><a class="small" href="#/sent">All sent</a></div>
          ${sent.length ? `<ul class="plain sent-list">${sent.slice(0, 6).map(sentRow).join('')}</ul>` : '<p class="muted">Nothing sent yet.</p>'}
        </section>
        <section class="panel mini-stats">
          <div><strong>${sentThisMonth}</strong><span>emails sent this month</span></div>
          <div><strong>${ready}</strong><span>addressees with an email address</span></div>
          <a class="small" href="#/addressees">Manage addressees</a>
        </section>
      </aside>
    </div>`;

  const bind = (root) => {
    if (run) {
      let pending = false;
      unsubscribe = Sender.on(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; if (location.hash === '' || location.hash === '#/' || location.hash === '#') app.render({ keepScroll: true }); });
      });
    }
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.new !== undefined) {
        b.disabled = true;
        const c = await createLetter(app, b.dataset.new || undefined);
        app.navigate(`#/letter/${c.id}`);
      }
      if (b.dataset.dup) {
        const src = app.state.campaigns.find((x) => x.id === b.dataset.dup);
        const copy = await duplicateLetter(app, src);
        toast('Copied as a new draft.', 'ok', 4000);
        app.navigate(`#/letter/${copy.id}`);
      }
      if (b.dataset.del) {
        const c = app.state.campaigns.find((x) => x.id === b.dataset.del);
        if (Sender.busy() && Sender.run?.campaignId === c.id) { toast('This letter is being sent. Stop the send first.', 'bad'); return; }
        if (!(await confirmDialog('Delete this draft?', `"${c.fields?.LetterTitle || c.name}" will be deleted on every device. Letters already sent stay in the send log.`, { submit: 'Delete', danger: true }))) return;
        const card = b.closest('.letter-card');
        card?.classList.add('removing');
        await app.deleteCampaign(c.id);
        toast('Draft deleted.', 'ok', 4000);
        app.render({ keepScroll: true });
      }
    });
  };
  return { title: 'Letters', html, bind, cleanup: () => { unsubscribe?.(); unsubscribe = null; } };
}
