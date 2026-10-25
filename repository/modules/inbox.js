/**
 * Inbox (essentials plan UX-301, docs/architecture/ESSENTIALS_MAP.md §7.3-7.6): every incoming record, one list.
 *
 * Replaces To triage, Counter deposit, Routed, the Assignment Desk and Bulk assignment. The list is core/inbox-view.js:
 * the four intakes of config/entry-points.config.js in one list, filtered by source, by where a record stands, by
 * category and to the records with a physical file (owner decision UX-D2), each filter counted. No row carries an action:
 * a record's row opens its record page, where triage, assignment and every other action are (shared/record-page.js); a
 * message not yet registered opens its registration (Intake's own, modules/correspondence.js registerEmail) and then its
 * record. Two things act on more than one record, and sit above the list: Register a document, one form for the Counter /
 * scan and Internal intakes (Counter deposit's deposit, and Log New Memo's registration), and Assign selected, Bulk
 * assignment's form for the rows ticked. Behind the essential screens' switch, drawn at Intake's address.
 */
import { hydrateGovernance } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { esc, toast, fmtDate, emptyFor, loadFlags, badge } from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { debouncedInput } from '../core/ui-interactions.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { requestSync } from '../core/data-loader.js';
import { canCurrentUserAccess } from '../core/current-user.js';
import { INBOX_STATUSES, inboxList } from '../core/inbox-view.js';
import { SourceViews, sourceView } from '../config/source-views.config.js';
import { entryPoint } from '../config/entry-points.config.js';
import { openRecordPage, essentialHead, linkedRecordNotice, bindLinkedRecordNotice } from '../shared/record-page.js';

const DEFAULTS = { source: 'all', status: 'open', category: '', files: false, q: '', panel: '', registerAs: 'scan-counter', selected: [] };
const U = () => UIState.get('inbox', DEFAULTS);
const set = (patch) => UIState.set('inbox', patch);
const may = (r) => { try { return canCurrentUserAccess(r); } catch { return false; } };

export async function mount(el) {
  hydrateGovernance();
  render(el);
  const redraw = () => { if (!el.isConnected) return off(); if (!document.querySelector('[data-record-page]') && !U().panel) render(el); };
  const off = () => { removeEventListener('dgo:record-page-closed', redraw); removeEventListener('dgo:data-loaded', redraw); };
  addEventListener('dgo:record-page-closed', redraw); addEventListener('dgo:data-loaded', redraw);
  openPortalLink(); addEventListener('dgo:data-loaded', openPortalLink, { once: true });
}

/* A Portal Registry alert links to its submission (`?portal=<reference>`); with the Inbox it opens that record's page,
   where its public status is set. Once opened, the link is spent. */
function openPortalLink() {
  const ctx = State.get().deepLinkContext || {};
  if (ctx.action !== 'open-portal-submission' || ctx.openedAt) return;
  const ref = String(ctx.portalRef || '').trim();
  if (/^all$/i.test(ref) || !ref) { set({ source: SourceViews.find((s) => s.entryPoint === 'public-portal')?.id || 'all', status: 'open' }); }
  else if (!openRecordPage(ref)) return;
  State.patch({ deepLinkContext: { ...ctx, openedAt: new Date().toISOString() } }, { module: 'correspondence', action: 'open-linked', event: 'audit:deeplink-opened', ref });
}

function controls(u, l) {
  const sources = SourceViews.map((s) => `<option value="${esc(s.id)}"${s.id === l.source ? ' selected' : ''}>${esc(s.short)} (${l.sourceCounts[s.id] ?? 0})</option>`).join('');
  const statuses = INBOX_STATUSES.map((x) => `<option value="${x.id}"${x.id === l.status ? ' selected' : ''}>${esc(x.label)} (${l.statusCounts[x.id]})</option>`).join('');
  const cats = `<option value="">All</option>${l.categories.map((c) => `<option${c === u.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
  return `<div class="cc-controlbar essential-bar"><div class="cc-controls" role="group" aria-label="Filter the Inbox">
    <input data-q type="search" aria-label="Search the Inbox" placeholder="Search by reference, sender or subject" value="${esc(u.q)}">
    <label class="cc-filter"><span>Source</span><select data-inbox-source aria-label="Source">${sources}</select></label>
    <label class="cc-filter"><span>Status</span><select data-inbox-status aria-label="Where it stands">${statuses}</select></label>
    <label class="cc-filter"><span>Category</span><select data-inbox-category aria-label="Category">${cats}</select></label>
    <button type="button" class="chip dgo-chip${u.files ? ' active' : ''}" aria-pressed="${!!u.files}" data-inbox-files>Physical files (${l.fileCount})</button>
    ${may('correspondence') || may('scan-intake') ? `<button type="button" class="btn" data-inbox-register>Register a document</button>` : ''}
  </div></div>`;
}

function selectionBar(u) {
  const n = u.selected.length;
  if (!n) return '';
  return `<div class="cc-controlbar" role="region" aria-label="Selected records"><div class="cc-controls"><span class="meta" data-inbox-selected-count>${n} selected</span>${may('bulk-assignment') ? '<button type="button" class="btn" data-inbox-assign>Assign selected</button>' : ''}<button type="button" class="btn ghost" data-inbox-clear-selection>Clear selection</button></div></div>`;
}

/* Register a document: the source is chosen in the form, then the form is that intake's own. */
function registerPanel(u) {
  const arms = [['scan-counter', may('scan-intake')], ['internal-origination', may('correspondence')]].filter(([, ok]) => ok).map(([id]) => entryPoint(id));
  const as = arms.find((a) => a.id === u.registerAs) || arms[0];
  return `<section class="panel" aria-labelledby="inbox-register"><h2 id="inbox-register">Register a document</h2>
    <div class="form-row" role="radiogroup" aria-label="How it came in">${arms.map((a) => `<label class="cc-filter"><input type="radio" name="inbox-register-as" value="${esc(a.id)}"${a.id === as?.id ? ' checked' : ''} data-inbox-register-as> ${esc(a.short)}</label>`).join('')}<button type="button" class="btn ghost" data-inbox-panel-close>Close</button></div>
    <p class="meta">${esc(as?.purpose || '')}</p><div data-inbox-register-host data-register-as="${esc(as?.id || '')}"></div></section>`;
}

function render(el) {
  const s = State.get(), u = U();
  const l = inboxList(s, u);
  const known = new Set(l.rows.map((r) => r.activityId).filter(Boolean));
  if (u.selected.some((id) => !known.has(id))) set({ selected: u.selected.filter((id) => known.has(id)) });
  const cur = U(), picked = new Set(cur.selected), canPick = may('bulk-assignment');
  const shown = capRows(l.rows, RenderBudget.tableRows);
  const row = (r) => {
    const open = r.kind === 'message'
      ? `<button type="button" class="row-open" data-open-message="${esc(r.emailId)}">${esc(r.title)}</button>`
      : `<button type="button" class="row-open" data-open-record="${esc(r.key)}">${esc(r.title)}</button>`;
    const tick = canPick ? `<td>${r.activityId ? `<input type="checkbox" data-inbox-pick="${esc(r.activityId)}" aria-label="Select ${esc(r.title)}"${picked.has(r.activityId) ? ' checked' : ''}>` : ''}</td>` : '';
    return `<tr class="row-link" data-inbox-row="${esc(r.key || 'email:' + r.emailId)}">${tick}<td>${open}${r.key ? `<div class="meta">${esc(r.key)}</div>` : ''}</td><td>${esc(r.from || '—')}</td><td>${esc(sourceView(r.source).short)}</td><td>${esc(r.received ? fmtDate(r.received) : '—')}</td><td>${r.kind === 'message' ? badge('Not registered', 'warn') : esc(r.stageLabel)}${r.hasFile ? ` ${badge('Physical file')}` : ''}</td></tr>`;
  };
  const list = l.rows.length
    ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table" data-inbox-list><thead><tr>${canPick ? '<th aria-label="Select"></th>' : ''}<th>Record</th><th>From</th><th>Source</th><th>Received</th><th>Where it stands</th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>${l.rows.length > shown.length ? `<p class="meta">Showing the first ${shown.length} of ${l.rows.length}. Search or filter to narrow the list.</p>` : ''}`
    : emptyFor({ filtered: l.total > 0, ...loadFlags(s.runtime), noun: 'records' });
  el.innerHTML = `<div class="workspace">${essentialHead('Inbox')}${linkedRecordNotice()}${controls(cur, l)}${selectionBar(cur)}
    ${cur.panel === 'register' ? registerPanel(cur) : ''}
    ${cur.panel === 'assign' && cur.selected.length ? `<section class="panel" aria-labelledby="inbox-assign"><h2 id="inbox-assign">Assign selected (${cur.selected.length})</h2><div class="form-row"><button type="button" class="btn ghost" data-inbox-panel-close>Close</button></div><div data-inbox-assign-host></div></section>` : ''}
    <section class="panel">${list}</section></div>`;
  bind(el, cur);
}

function bind(el, u) {
  bindLinkedRecordNotice(el, () => render(el));
  const redraw = (patch) => { set(patch); render(el); };
  debouncedInput(el.querySelector('[data-q]'), (v) => redraw({ q: v }), { refind: () => el.querySelector('[data-q]') });
  el.querySelector('[data-inbox-source]')?.addEventListener('change', (e) => redraw({ source: e.target.value }));
  el.querySelector('[data-inbox-category]')?.addEventListener('change', (e) => redraw({ category: e.target.value }));
  el.querySelector('[data-inbox-status]')?.addEventListener('change', (e) => { redraw({ status: e.target.value }); el.querySelector('[data-inbox-status]')?.focus(); });
  el.querySelector('[data-inbox-files]')?.addEventListener('click', () => { redraw({ files: !u.files }); el.querySelector('[data-inbox-files]')?.focus(); });
  el.querySelectorAll('[data-clear-filters]').forEach((b) => b.addEventListener('click', () => redraw({ source: 'all', status: 'all', category: '', files: false, q: '' })));
  el.querySelectorAll('[data-retry-load]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await requestSync({ source: 'inbox', mode: 'refresh' }); } catch { /* the loader has said what failed */ } render(el); }));
  /* Rows: the title opens; the rest of the row opens too, except the tick box. */
  el.querySelectorAll('[data-inbox-row]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('button, input, a')) return; tr.querySelector('[data-open-record], [data-open-message]')?.click(); }));
  el.querySelectorAll('[data-open-message]').forEach((b) => b.addEventListener('click', async () => {
    if (!may('correspondence')) return toast('Your role cannot register messages.', 'error');
    const { registerEmail } = await import('./correspondence.js');
    const out = await registerEmail(b.dataset.openMessage);
    if (!out) return;
    if (!out.ok) return toast(out.message, 'error');
    toast(`E-mail registered as ${out.ref}`, 'success');
    render(el);
    openRecordPage(out.ref);
  }));
  el.querySelectorAll('[data-inbox-pick]').forEach((c) => c.addEventListener('change', () => { const id = c.dataset.inboxPick, sel = new Set(U().selected); c.checked ? sel.add(id) : sel.delete(id); redraw({ selected: [...sel], panel: U().panel === 'assign' && !sel.size ? '' : U().panel }); el.querySelector(`[data-inbox-pick="${CSS.escape(id)}"]`)?.focus(); }));
  el.querySelector('[data-inbox-clear-selection]')?.addEventListener('click', () => redraw({ selected: [], panel: u.panel === 'assign' ? '' : u.panel }));
  el.querySelectorAll('[data-inbox-panel-close]').forEach((b) => b.addEventListener('click', () => redraw({ panel: '' })));
  el.querySelector('[data-inbox-register]')?.addEventListener('click', () => { redraw({ panel: u.panel === 'register' ? '' : 'register' }); el.querySelector('[data-inbox-register-as]:checked')?.focus(); });
  el.querySelectorAll('[data-inbox-register-as]').forEach((r) => r.addEventListener('change', () => { redraw({ registerAs: r.value }); el.querySelector('[data-inbox-register-as]:checked')?.focus(); }));
  el.querySelector('[data-inbox-assign]')?.addEventListener('click', () => { redraw({ panel: 'assign' }); el.querySelector('[data-inbox-assign-host] select, [data-inbox-assign-host] input')?.focus(); });

  const reg = el.querySelector('[data-inbox-register-host]');
  if (reg) {
    if (reg.dataset.registerAs === 'internal-origination') {
      import('./correspondence.js').then((m) => m.mountRegisterInternal(reg, { after: (ref) => { redraw({ panel: '' }); openRecordPage(ref); }, onCancel: () => redraw({ panel: '' }) }));
    } else {
      import('./scan-intake.js').then((m) => m.mountEmbedded(reg));
    }
  }
  const assign = el.querySelector('[data-inbox-assign-host]');
  if (assign) import('./bulk-assignment.js').then((m) => m.mountEmbedded(assign, { ids: u.selected }));
}
