// Correspondence Mailer (Office of the Director-General/CEO, NITDA) — application shell, state and router.
//
// Hash routes:  #/  (Letters: drafts, sending, recently sent)
//               #/letter/<id>        the one-page composer: who, what, attachments, check and send
//               #/sent[/<id>]        what was sent, per addressee, with the log check
//               #/addressees         the shared directory
//               #/settings[/<tab>]   general, templates, operators' connection, activity
// Earlier routes still open their pages: #/compose[/<id>[/<step>]] (the step-by-step wizard),
// #/outbox, #/directory, #/templates, #/flows, #/activity and #/overview.

import { Store } from './store.js';
import { loadSettings, saveSettings, isLive } from './settings.js';
import { SEED_DIRECTORY } from './seed-directory.js';
import { SEED_TEMPLATES } from './seed-templates.js';
import { LETTERHEAD_TEMPLATES } from './letterhead.js';
import { Sender } from './sender.js';
import { offerPendingRestore } from './export.js';
import { Session, signOut } from './session.js';
import { Sync, SHARED_FIELDS, stampEdits } from './sync.js';
import { Reports } from './reports.js';
import * as SignIn from './views/signin.js';
import { esc } from './util.js';
import { toast } from './ui.js';

import * as Home from './views/home.js';
import * as Letter from './views/letter.js';
import * as Sent from './views/sent.js';
import * as Hub from './views/hub.js';
import * as Dashboard from './views/dashboard.js';
import * as Directory from './views/directory.js';
import * as Templates from './views/templates.js';
import * as Compose from './views/compose.js';
import * as Outbox from './views/outbox.js';
import * as Flows from './views/flows.js';
import * as Activity from './views/activity.js';

const ROUTES = {
  '': Home,
  letter: Letter,
  sent: Sent,
  addressees: Directory,
  settings: Hub,
  overview: Dashboard,
  directory: Directory,
  templates: Templates,
  compose: Compose,
  outbox: Outbox,
  flows: Flows,
  activity: Activity,
};

/* Pages reached from Settings keep Settings highlighted; the older pages map to their new home. */
const NAV_OF = { letter: '', compose: '', overview: '', outbox: 'sent', directory: 'addressees', templates: 'settings', flows: 'settings', activity: 'settings' };

const NAV = [
  ['', 'Letters', '✉'],
  ['sent', 'Sent', '✓'],
  ['addressees', 'Addressees', '☰'],
  ['settings', 'Settings', '⚙'],
];

const clone = (v) => JSON.parse(JSON.stringify(v));

export const App = {
  state: {
    settings: null,
    directory: [],
    templates: [],
    campaigns: [],
    fileIndex: {},
    persistent: true,
    sync: null,
  },

  /** Sign-in is required whenever the sign-in flow is configured (always, once deployed). */
  needsSignIn() { return Boolean(this.state.settings?.endpoints?.MAIL_AUTH) && !Session.active(); },

  /** After a successful sign-in: who is operating comes from the session; then catch up. */
  async afterSignIn() {
    const who = Session.get();
    await this.saveSettings({ ...this.state.settings, operator: { name: who.name || this.state.settings.operator?.name || '', email: who.email } });
    this.renderShell();
    await this.render();
    await this.syncNow();
  },

  /** Bring this browser up to date with SharePoint; with report:true, show what happened. */
  /* The outcome is a quiet chip in the top bar ("Up to date" or what failed) and a report kept on
     the Activity page; it no longer opens over the page. */
  async syncNow({ report = false } = {}) {
    if (!Sync.on(this)) return null;
    this.state.syncing = true;
    this.renderStatus();
    const r = Reports.begin(this, 'sync', 'Shared data from SharePoint', { 'Signed in as': Session.get()?.email || '' });
    let out = null;
    try { out = await Sync.pullAll(this); } finally { this.state.syncing = false; }
    if (out) {
      r.add('Directory', out.directory ? 'ok' : 'info', out.directory ? `${out.directory} entries from DGOMailDirectory` : 'The SharePoint list is empty; kept what is here');
      r.add('Templates', out.templates ? 'ok' : 'info', out.templates ? `${out.templates} template(s) from DGOMailTemplates` : 'The SharePoint list is empty; kept what is here');
      r.add('Mailings', 'ok', `${out.mailings} from SharePoint${out.uploadedMailings ? `; ${out.uploadedMailings} that were only in this browser are now shared` : ''}`);
      r.add('Attached files', 'ok', `${out.files} known from SharePoint${out.uploadedFiles ? `; ${out.uploadedFiles} that were only in this browser are now shared` : ''}`);
      r.add('Activity reports', 'ok', `${out.reports} from SharePoint`);
      r.add('Signatory and sending rules', 'ok', out.settings ? 'The shared ones from SharePoint' : 'None were shared yet; the ones in this browser are now shared');
      for (const e of out.errors) r.add('Not loaded', 'fail', e);
      await r.finish(out.errors.length ? 'Some shared data could not be loaded; what is here is kept. Each failed line says why.' : 'This browser now shows the same mailings, files and history as every other device.', { show: report });
      this.state.lastSync = { at: new Date().toISOString(), ok: !out.errors.length, errors: out.errors, reportId: r.id, items: r.items.map((i) => i.label) };
      if (out.errors.length) toast('Some shared data could not be loaded. What is on this device is kept.', 'warn', 12000, { action: { label: 'Details', run: () => Reports.showById(r.id) } });
    }
    this.renderStatus();
    /* Show what arrived, without moving the page, and never under someone who is typing. */
    const typing = document.activeElement?.closest?.('#view') && document.activeElement.matches('input, textarea, select, [contenteditable]');
    if (!typing) await this.render({ keepScroll: true });
    return out;
  },

  async init() {
    this.state.persistent = await Store.persistent();
    this.state.settings = await loadSettings();
    this.state.directory = await Store.get('directory', null) ?? clone(SEED_DIRECTORY);
    /* The six Agency letterhead templates are defined by the internal platform and always come
       from code, never from storage — so a browser with templates saved before they existed
       still gets them, and nobody can end up with a stale copy. */
    const stored = (await Store.get('templates', null) ?? clone(SEED_TEMPLATES)).filter((t) => t.kind !== 'letterhead');
    this.state.templates = [...LETTERHEAD_TEMPLATES, ...stored];
    this.state.campaigns = await Store.get('campaigns', []);
    this.state.fileIndex = await Store.fileIndex();
    /* A batch interrupted by a reload leaves messages marked "sending". Nobody knows whether
       those went; say so rather than showing a spinner that will never stop. */
    let interrupted = 0;
    for (const c of this.state.campaigns) {
      for (const [k, r] of Object.entries(c.results || {})) {
        if (r.status === 'sending') { c.results[k] = { ...r, status: 'failed', error: 'Interrupted — the page closed mid-send. Check the log before retrying; a retry will not send twice if the first attempt was logged as Sent.' }; interrupted++; }
      }
      if (c.status === 'sending') c.status = 'partial';
    }
    if (interrupted) { await Store.set('campaigns', this.state.campaigns); }
    Sender.on(() => this.renderStatus());
    /* A signed letter kept only in SharePoint needs a session to fetch: when the session has
       ended, that is said (SIGN_IN_REQUIRED, so the send pauses for sign-in), rather than
       reported as a file that exists nowhere. */
    Sender.fetchFile = async (id) => {
      if (Sync.on(this)) return Sync.fileContent(this, id);
      const local = await Store.getFile(id);
      if (local) return local;
      if (this.state.settings?.endpoints?.MAIL_DATA && this.state.fileIndex?.[id]?.shared) throw new Error('SIGN_IN_REQUIRED: this signed letter is kept in SharePoint; sign in again to fetch it.');
      return null;
    };
    Sender.beforeSend = () => Sync.flush(this);
    Reports.onSave = (r) => Sync.saveReport(this, r);
    window.addEventListener('hashchange', () => this.render());
    window.addEventListener('dgo-mailer:sign-in-required', (e) => {
      if (!Session.active()) return;
      /* Only a refusal of the CURRENT session ends it: an answer to a call made with an older
         token (before signing in again) is ignored. */
      if (e.detail?.token !== Session.token()) return;
      Session.clear();
      SignIn.reset('Your session has ended (signed out, expired, or switched off by an admin). Sign in again to carry on; nothing you did is lost.');
      this.renderShell();
      this.render();
    });
    this.renderShell();
    await this.render();
    if (await offerPendingRestore(this)) await this.render();
    if (Session.active()) this.syncNow();
    if (interrupted) toast(`${interrupted} message(s) were mid-send when the page closed. They are marked failed — check the log before retrying.`, 'warn', 9000);
  },

  /* ---------- persistence ---------- */

  /* An entry changed here is stamped and marked unshared (dirty) and shared in the background;
     a pull passes fromServer, which takes the list as SharePoint gave it. */
  async saveDirectory(list, { fromServer = false } = {}) {
    const { list: next, changed } = fromServer ? { list, changed: [] } : stampEdits(this.state.directory, list);
    this.state.directory = [...next].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.key.localeCompare(b.key));
    await Store.set('directory', this.state.directory);
    if (changed.length) Sync.queueDirectory(this, changed);
  },
  async saveTemplates(list, { fromServer = false } = {}) {
    const own = list.filter((t) => t.kind !== 'letterhead');
    const { list: editable, changed } = fromServer ? { list: own, changed: [] } : stampEdits(this.state.templates.filter((t) => t.kind !== 'letterhead'), own);
    this.state.templates = [...LETTERHEAD_TEMPLATES, ...editable];
    await Store.set('templates', editable);
    if (changed.length) Sync.queueTemplates(this, changed);
  },
  async saveCampaign(c) {
    c.updatedAt = new Date().toISOString();
    const i = this.state.campaigns.findIndex((x) => x.id === c.id);
    if (i >= 0) this.state.campaigns[i] = c; else this.state.campaigns.unshift(c);
    await Store.set('campaigns', this.state.campaigns);
    Sync.queueMailing(this, c);
    return c;
  },
  async deleteCampaign(id) {
    this.state.campaigns = this.state.campaigns.filter((c) => c.id !== id);
    await Store.set('campaigns', this.state.campaigns);
    await Sync.deleteMailing(this, id);
  },
  async signOut() {
    await Sync.flush(this);
    await signOut(this.state.settings);
    SignIn.reset('You are signed out.');
    this.renderShell();
    await this.render();
  },
  async saveSettings(next, { fromServer = false } = {}) {
    /* A change to the office's shared settings (signatory, sending rules) made here is stamped,
       so a pull keeps it over an older shared copy until it has been shared. */
    const prev = this.state.settings || {};
    if (!fromServer && SHARED_FIELDS.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]))) {
      next = { ...next, sharedDirty: true, sharedChangedAt: new Date().toISOString() };
    }
    this.state.settings = await saveSettings(next);
    this.renderStatus();
    return this.state.settings;
  },
  async refreshFiles() {
    this.state.fileIndex = await Store.fileIndex();
  },

  /* ---------- rendering ---------- */

  route() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
    return { name: parts[0] || '', params: parts.slice(1) };
  },

  navigate(hash) {
    if (location.hash === hash) this.render(); else location.hash = hash;
  },

  renderShell() {
    document.getElementById('app').innerHTML = `
      <a class="skip" href="#view">Skip to content</a>
      <header class="topbar">
        <button class="icon-btn nav-toggle" aria-label="Menu" aria-expanded="false" aria-controls="sidenav">☰</button>
        <div class="brand">
          <img class="brand-logo bk-logo--on-dark" src="brand/nitda-lockup-digital-white.png" alt="National Information Technology Development Agency" width="544" height="254">
          <img class="brand-logo bk-logo--on-light" src="brand/nitda-lockup-digital-colour.png" alt="National Information Technology Development Agency" width="572" height="260">
          ${document.getElementById('dgo-sub-tpl')?.innerHTML || ''}
          <div><div class="brand-name">Correspondence Mailer</div>
          <div class="brand-sub">Office of the Director-General/CEO · NITDA</div></div>
        </div>
        <div class="topbar-status" id="topbar-status"></div>
      </header>
      <div class="layout">
        <nav id="sidenav" class="sidenav" aria-label="Main">
          ${NAV.map(([r, label, icon]) => `<a href="#/${r}" data-route="${r}"><span aria-hidden="true" class="nav-ico">${icon}</span><span class="nav-label">${esc(label)}</span></a>`).join('')}
          <div class="nav-foot" id="nav-foot"></div>
        </nav>
        <main id="view" tabindex="-1"></main>
      </div>`;
    const toggle = document.querySelector('.nav-toggle');
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.getElementById('sidenav').addEventListener('click', (e) => {
      if (e.target.closest('a')) document.body.classList.remove('nav-open');
    });
    /* The bar lifts once the view has scrolled under it. */
    const main = document.getElementById('view');
    const bar = document.querySelector('.topbar');
    main.addEventListener('scroll', () => bar.toggleAttribute('data-scrolled', main.scrollTop > 4), { passive: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        document.body.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
      }
    });
    this.renderStatus();
  },

  renderStatus() {
    const s = this.state.settings;
    const el = document.getElementById('topbar-status');
    if (!el || !s) return;
    const live = isLive(s);
    const run = Sender.run;
    const sending = Sender.busy()
      ? `<a class="pill pill-info" href="#/letter/${esc(run.campaignId)}/send">${run.mode === 'dryrun' ? 'Checking' : 'Sending'} ${run.index}/${run.total}${run.waitingForSignIn ? ' (paused: sign in, then Resume)' : run.paused ? ' (paused)' : ''}</a>` : '';
    el.innerHTML = `${sending}
      <span class="pill ${live ? 'pill-ok' : 'pill-warn'}" title="${live ? 'Sending is connected: letters are really emailed.' : 'Sending is not connected: letters are built and previewed but never emailed.'}">${live ? 'Live' : 'Practice mode'}</span>
      ${Session.active() ? `<span class="pill pill-neutral" title="Signed in${Session.get().role === 'admin' ? ' (admin)' : ''}">${esc(Session.get().email)}</span><button class="pill pill-neutral pill-btn" data-signout type="button">Sign out</button>`
        : s.operator?.email ? `<span class="pill pill-neutral" title="Operator">${esc(s.operator.email)}</span>` : '<a class="pill pill-warn" href="#/settings">Set operator</a>'}
      ${this.state.syncing ? '<span class="pill pill-neutral" data-sync="busy" aria-live="polite">Syncing…</span>'
        : this.state.sync && !this.state.sync.ok ? `<button type="button" class="pill pill-warn pill-btn" data-sync="warn" title="${esc(this.state.sync.error)}">⚠ ${esc(this.state.sync.what)}</button>`
        : this.state.lastSync ? `<span class="pill pill-neutral sync-ok" data-sync="ok" title="Shared data loaded ${esc(new Date(this.state.lastSync.at).toLocaleTimeString())}">✓ Up to date</span>` : ''}`;
    el.querySelector('[data-signout]')?.addEventListener('click', () => this.signOut());
    el.querySelector('[data-sync="warn"]')?.addEventListener('click', () => {
      const w = this.state.sync;
      toast(`${w.what}. ${w.error || ''} What is on this device is kept; it is shared again at the next change or sign-in.`, 'warn', 20000, { action: { label: 'Try again now', run: () => this.syncNow() } });
    });
    const foot = document.getElementById('nav-foot');
    if (foot) foot.innerHTML = this.state.persistent ? '' : '<p class="warn-text">This browser refused storage. Work is kept only until the page closes.</p>';
  },

  async render({ keepScroll = false } = {}) {
    /* Only the latest render may draw: a page that took longer to prepare (Settings reads the
       operator list) and finishes after the operator has moved on is discarded, not drawn over
       the newer page. */
    const seq = (this.renderSeq = (this.renderSeq || 0) + 1);
    const scrollY = window.scrollY;
    const { name, params } = this.route();
    const gated = this.needsSignIn();
    document.body.classList.toggle('signed-out', gated);
    const view = gated ? SignIn : ROUTES[name] || Home;
    const navName = name in NAV_OF ? NAV_OF[name] : ROUTES[name] ? name : '';
    const root = document.getElementById('view');
    /* The page being left stops its timers and listeners (and saves anything pending). */
    try { this.leaving?.(); } catch (e) { console.error(e); }
    this.leaving = null;
    try {
      const out = await view.render(this, params);
      if (seq !== this.renderSeq) { try { out.cleanup?.(); } catch (e) { console.error(e); } return; }
      document.querySelectorAll('#sidenav a').forEach((a) => {
        const on = a.dataset.route === navName;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      this.leaving = out.cleanup || null;
      /* A fresh container per render. Views bind delegated listeners to the element they are
         given; binding them to <main> itself, which outlives every render, stacks one more
         handler per visit — one click then opens as many dialogs as there have been renders. */
      const host = document.createElement('div');
      host.className = 'view-root';
      host.innerHTML = out.html;
      root.replaceChildren(host);
      out.bind?.(host);
      document.title = `${out.title || 'Mailer'} · Correspondence Mailer · NITDA`;
    } catch (e) {
      console.error(e);
      if (seq !== this.renderSeq) return;
      root.innerHTML = `<section class="panel"><h1>Something went wrong</h1><p>${esc(e.message || e)}</p><p><a href="#/">Back to Letters</a></p></section>`;
    }
    if (keepScroll) { window.scrollTo(0, scrollY); return; }
    root.focus({ preventScroll: true });
    /* The view scrolls inside <main>, not the window, so a new page starts at its own top. */
    root.scrollTo({ top: 0, behavior: 'instant' });
  },
};

App.init().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<p style="padding:24px">The mailer could not start: ${esc(e.message || e)}</p>`;
});

window.DGO_MAILER = App;
