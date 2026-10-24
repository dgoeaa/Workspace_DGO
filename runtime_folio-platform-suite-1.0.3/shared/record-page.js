/**
 * The record page (essentials plan UX-202, docs/architecture/ESSENTIALS_MAP.md §8.1).
 *
 * One page for one record: the document, the task raised on it, one timeline of everything that has happened to it,
 * and the actions that change it, offered only where the record's stage and the officer's role allow them. It is drawn
 * over the work area, so the list it was opened from is still there when it closes.
 *
 * Any control carrying data-open-record opens it, and a notification link that names a task or a reference opens it once
 * the record has loaded. Since the cut-over (UX-401) it is the only place a record is acted on.
 *
 * UX-203: the cycle closes here too. Reply writes and sends the Correspondence Email Desk's letter against the record,
 * Record dispatch records the hand-over of a completed task (core/dispatch-actions.js, shared with Dispatch), and Close &
 * archive seals the record through Archive's closure gate, offered only once a response is recorded.
 *
 * UX-204 (owner decision UX-D2): the record's physical file is a panel on it. File custody shows the official file, who
 * holds it and how it moved, and opens, routes, receives and closes it through Registry's own actions
 * (core/registry-actions.js, shared with Registry).
 */
import { State } from '../core/state.js';
import { esc, badge, toast, confirmAction, fmtDateTime } from '../core/ui.js';
import { recordView, isAcknowledged } from '../core/record-view.js';
import * as Actions from '../core/record-actions.js';
import { canCurrentUserAccess } from '../core/current-user.js';
import { priorityLabel } from '../config/priority.config.js';
import { sourceBadge } from '../core/source-views.js';
import { canActorAcknowledge, resolveAcknowledgementActor } from '../core/acknowledgement-service.js';
import { DISPATCH_CHANNELS, dispatchOf, dispatchProblem, recordDispatch, noDispatch, closeDispatch } from '../core/dispatch-actions.js';
import { CorrespondenceEmailService as Mail } from '../core/correspondence-email-service.js';
import { openFile, routeFile, receiveFile, closeFile } from '../core/registry-actions.js';
import { setPortalStatus, portalStatusConfigured, PORTAL_STAFF_STATUSES } from '../core/portal-status-service.js';
import { DocumentFlags, hasFlag, flagsOf, flagLabel } from '../core/document-flags.js';
import { aiProposal, aiUnavailable, isAiUsable, humanProposal, compareProposals } from '../core/intake-triage.js';
import { invokeData } from '../core/api.js';

/* Essentials plan UX-401 (cut-over): the record page is how a record is opened, everywhere. It was behind a per-device
   switch while the screens it replaces were still in use; those screens now redirect to the essential ones. */
export const isRecordPageOn = () => true;
export const isEssentialsOn = () => true;
/* The essential screens' heading. */
export const essentialHead = (name) => `<header class="dgo-page-head"><h1 class="dgo-page-head__title">${esc(name)}</h1></header>`;

let openKey = '', offState = null, returnFocus = null, assigning = false, form = '', ai = null;
const host = () => document.querySelector('.dgo-workarea');
const page = () => document.querySelector('[data-record-page]');

export function openRecordPage(key) {
  if (!key) return false;
  const v = recordView(State.get(), key);
  if (!v) { toast('That record has not loaded on this device yet.', 'error'); return false; }
  openKey = String(key); returnFocus = document.activeElement; assigning = false; form = ''; ai = null;
  let el = page();
  if (!el) { el = document.createElement('section'); el.classList.add('dgo-record-page'); el.dataset.recordPage = ''; el.setAttribute('role', 'region'); el.tabIndex = -1; host()?.appendChild(el); document.addEventListener('keydown', onKey); }
  draw();
  /* While a form is open (Assign, Reply, Record dispatch, Close & archive) the page is not redrawn, so a sync cannot wipe
     what is being filled in. */
  offState?.(); offState = State.on(() => { if (page() && !assigning && !form) draw(); });
  el.querySelector('h1')?.focus();
  return true;
}
/* Escape closes the page wherever focus is, unless a dialog is open over it (the dialog takes its own Escape). */
function onKey(e) { if (e.key === 'Escape' && page() && !document.querySelector('[data-dialog]')) closeRecordPage(); }
export function closeRecordPage() {
  document.removeEventListener('keydown', onKey);
  const key = openKey;
  offState?.(); offState = null; openKey = ''; assigning = false; form = '';
  const was = !!page(); page()?.remove();
  /* A list behind the page (Tasks, Inbox, Overview) redraws on this, so what was done on the record shows on its row; focus
     then goes back to that row's control, which the redraw has replaced. */
  if (was) dispatchEvent(new Event('dgo:record-page-closed'));
  const back = returnFocus?.isConnected ? returnFocus : (key && document.querySelector(`[data-open-record="${CSS.escape(key)}"]`));
  try { back?.focus?.(); } catch { /* the opener has gone */ }
  returnFocus = null;
}

/* ─── Drawing ───────────────────────────────────────────────────────────────────────────── */
const TRIAGE = ['Pending', 'In Treatment', 'Accepted', 'Declined', 'Archived'];
const may = (route) => { try { return canCurrentUserAccess(route); } catch { return false; } };
const people = () => (State.get().users || []).filter((u) => u.email).map((u) => `<option value="${esc(u.email)}">${esc(u.fullName || u.name || u.email)}</option>`).join('');
const fieldRow = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;

function actionsFor(v) {
  const t = v.task, open = t && !/complete|closed|cancel/i.test(String(t.status || ''));
  const acked = t && isAcknowledged(t), started = t && /progress/i.test(String(t.status || ''));
  /* Only the officer the task is assigned to may acknowledge it (core/acknowledgement-service.js), as on Acknowledge. */
  const mayAck = t && !acked && may('acknowledgment') && canActorAcknowledge(t, resolveAcknowledgementActor()).allowed;
  const btn = (act, label, primary = false) => `<button type="button" class="btn${primary ? '' : ' ghost'}" data-record-act="${act}">${esc(label)}</button>`;
  const groups = [];
  const triage = !v.doc.taskOnly && may('correspondence') ? `<label class="cc-filter"><span>Status</span><select data-record-triage aria-label="Triage status">${TRIAGE.map((s) => `<option${s === v.doc.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>${btn('triage', 'Triage')}` : '';
  const assign = !v.doc.taskOnly && may('single-assignment') ? btn('assign', v.tasks.length ? 'Assign another task' : 'Assign') : '';
  /* D2: an AI classification is advisory. It is asked for, never consulted by default, and shown beside the decision, which
     only the officer records (Intake's triage did the same; essentials plan UX-401 moved it here). */
  const aiAsk = triage ? `<button type="button" class="btn ghost" data-ai-triage>${ai && !ai.busy ? 'Ask the AI again' : 'Ask the AI for a suggestion'}</button>` : '';
  if (triage || assign) groups.push(['Triage and assign', triage + assign + aiAsk + aiPanel(v)]);
  const work = [
    mayAck ? btn('acknowledge', 'Acknowledge receipt', true) : '',
    t && acked && open && !started && may('orchestrator') ? btn('start', 'Start work', true) : '',
    t && started && may('orchestrator') ? btn('complete', 'Mark done', true) : '',
    t && !acked && may('acknowledgment') ? btn('remind', 'Send reminder') : '',
    t && open && may('fasttrack') ? btn('escalate', 'Escalate') : '',
  ].join('');
  if (work) groups.push(['Work', work]);
  const decide = [
    may('approvals') ? `<label class="cc-filter"><span>Approver</span><select data-record-approver aria-label="Approver"><option value="">Choose…</option>${people()}</select></label>${btn('request-approval', 'Request approval')}` : '',
    !v.doc.taskOnly && may('executive') ? `${btn('approve', 'Approve')}${btn('decline', 'Decline')}<label class="cc-filter"><span>Delegate to</span><select data-record-delegate aria-label="Delegate to"><option value="">Choose…</option>${people()}</select></label>${btn('delegate', 'Delegate')}` : '',
  ].join('');
  if (decide) groups.push(['Decide', decide]);
  /* A pending approval request on this record is answered here: Review & Approval's decision (essentials plan UX-401). */
  const pendingAps = may('approvals') ? (v.approvals || []).filter((a) => /^pending$/i.test(String(a.status || 'pending'))) : [];
  if (pendingAps.length) groups.push(['Approval requests', pendingAps.map((a) => `<fieldset class="record-page__approval" data-approval="${esc(a.id)}"><legend>${esc(a.title)}</legend><p class="meta">From ${esc(a.from || a.fromEmail || '—')}${a.approverEmail ? ` · for ${esc(a.approverEmail)}` : ''}</p><label>Minute<textarea rows="2" data-approval-minute placeholder="Required to reject"></textarea></label><label class="check-inline"><input type="checkbox" data-approval-sign> Digitally sign this decision</label><div class="form-row"><button type="button" class="btn" data-approval-act="approve">Approve request</button><button type="button" class="btn ghost" data-approval-act="reject">Reject request</button></div></fieldset>`).join('')]);
  /* Flags (core/document-flags.js): Lookup's marks, which say what a document is already marked with. */
  if (!v.doc.taskOnly && (may('activities') || may('lookup'))) groups.push(['Marks', DocumentFlags.map((f) => { const on = hasFlag(v.doc, f.code); return `<button type="button" class="btn ${on ? (f.tone || '') : 'ghost'}" data-record-flag="${esc(f.code)}" aria-pressed="${on}" title="${esc(on ? `Lift ${f.label}` : f.description)}">${on ? '⚑ ' : ''}${esc(f.label)}</button>`; }).join('')]);
  const r = v.response || {}, held = (r.replies || []).find((m) => m.status === 'draft' || m.status === 'queued');
  const disp = t ? dispatchOf(t).status : '';
  const close = r.archived ? '<p class="meta">Closed and archived.</p>' : [
    !v.doc.taskOnly && may('correspondence-email') ? btn('reply', 'Reply') : '',
    held && may('correspondence-email') ? btn('send-reply', held.status === 'queued' ? 'Send held reply' : 'Send draft reply') : '',
    t && /complete/i.test(String(t.status || '')) && !disp && may('dispatch') ? btn('dispatch', 'Record dispatch') : '',
    t && (disp === 'dispatched' || disp === 'no-dispatch') && may('dispatch') ? btn('confirm-receipt', 'Confirm receipt') : '',
    r.responded && !v.doc.taskOnly && may('archive') ? btn('close', 'Close & archive', true) : '',
  ].join('');
  if (close) groups.push(['Respond and close', close]);
  return groups.map(([title, body]) => `<div class="record-page__group"><h3>${esc(title)}</h3><div class="form-row">${body}</div></div>`).join('')
    || '<p class="meta">Your role has nothing to change on this record at this stage.</p>';
}

function aiPanel(v) {
  if (!ai) return '';
  const head = '<div class="eyebrow panel-eyebrow">AI suggestion · advisory</div>';
  if (ai.busy) return `<div class="ai-spine" data-ai-panel>${head}<p class="meta">Analysing…</p></div>`;
  if (!isAiUsable(ai.p)) return `<div class="ai-spine" data-ai-panel>${head}<p class="meta">Unavailable${ai.p?.reason ? `: ${esc(ai.p.reason)}` : ''}. <b>Triage continues without it.</b></p></div>`;
  const cmp = compareProposals(humanProposal({ category: v.doc.category, priority: v.doc.priority }, { by: 'record' }), ai.p);
  const rows = Object.entries(ai.p.fields).map(([k, x]) => `<div class="action-row"><span>${esc(k)}</span><b>${esc(x)}</b>${cmp.differ.includes(k) ? ' <span class="pill warn">differs</span>' : cmp.agree.includes(k) ? ' <span class="pill ok">agrees</span>' : ''}</div>`).join('');
  const conf = ai.p.confidence == null ? 'not scored' : `${Math.round(ai.p.confidence * 100)}%`;
  return `<div class="ai-spine" data-ai-panel>${head}<p class="meta">Confidence: <b>${esc(conf)}</b>${ai.p.rationale ? ` · ${esc(ai.p.rationale)}` : ''}</p>${rows}<p class="meta">It changes nothing. The record changes only when you triage it.</p></div>`;
}

function draw() {
  const el = page(); if (!el) return;
  /* State changes redraw the page (a sync, an action's result). What the officer is typing, and where focus is, survive it. */
  const draft = el.querySelector('#rp-minute')?.value || '', hadFocus = el.contains(document.activeElement), focusId = document.activeElement?.id || '';
  const apDrafts = Object.fromEntries([...el.querySelectorAll('[data-approval]')].map((x) => [x.dataset.approval, x.querySelector('[data-approval-minute]')?.value || '']));
  const v = recordView(State.get(), openKey);
  if (!v) { el.innerHTML = `<div class="record-page__bar"><button type="button" class="btn ghost" data-record-close>Back</button></div><div class="empty dgo-empty"><h2 class="dgo-empty__title">This record is no longer on this device</h2></div>`; bind(el, null); return; }
  const d = v.doc, t = v.task;
  el.setAttribute('aria-label', `Record ${d.referenceId || d.id}`);
  el.innerHTML = `
    <div class="record-page__bar"><button type="button" class="btn ghost" data-record-close>Back</button><span class="meta">${esc(d.referenceId || d.id || '')}</span></div>
    <header class="record-page__head">
      <h1 tabindex="-1">${esc(d.subject || d.title || d.referenceId || 'Record')}</h1>
      <div class="status-strip">${d.taskOnly ? '' : sourceBadge(d)} ${d.category ? badge(d.category) : ''} ${d.priority ? badge(priorityLabel(d.priority)) : ''} ${d.status ? badge(d.status) : ''}${d.taskOnly ? '' : flagsOf(d).map((f) => ` <span class="chip">⚑ ${esc(flagLabel(f.flag))}</span>`).join('')}</div>
      <ol class="record-page__stages" aria-label="Where this record is">${v.stages.map((s) => `<li data-state="${s.state}"${s.state === 'current' ? ' aria-current="step"' : ''}>${esc(s.label)}</li>`).join('')}</ol>
    </header>
    <div class="record-page__body">
      <div class="record-page__main">
        <section class="panel" aria-labelledby="rp-doc"><h2 id="rp-doc">The document</h2>
          ${d.taskOnly ? '<p class="meta">The document this task belongs to has not loaded on this device.</p>' : `<dl class="detail-grid">${fieldRow('Reference', d.referenceId || d.id)}${fieldRow('From', d.sender || d.senderEmail)}${fieldRow('Received', fmtDateTime(d.receivedAt || d.createdAt || ''))}${fieldRow('Assigned', d.assignedTo)}</dl>`}
          ${d.description ? `<p>${esc(d.description)}</p>` : ''}
          ${d.attachmentLink ? `<p><a href="${esc(d.attachmentLink)}" target="_blank" rel="noreferrer">Open the original document</a></p>` : ''}
        </section>
        <section class="panel" aria-labelledby="rp-task"><h2 id="rp-task">${v.tasks.length > 1 ? `Tasks (${v.tasks.length})` : 'The task'}</h2>
          ${v.tasks.length ? v.tasks.map((x) => `<dl class="detail-grid"${x === t && v.tasks.length > 1 ? ' data-focus' : ''}>${fieldRow('Task', x.title)}${fieldRow('Owner', [x.assignedTo, x.assignedToDsu].filter(Boolean).join(', '))}${fieldRow('Due', String(x.due || '').slice(0, 10))}${isAcknowledged(x) ? '' : fieldRow('Acknowledge by', String(x.ack || '').slice(0, 10))}${fieldRow('Status', `${x.status || 'Not started'}${isAcknowledged(x) ? '' : ' · not yet acknowledged'}`)}</dl>`).join('') : '<p class="meta">No task has been raised on this record yet.</p>'}
        </section>
        ${portalPanel(v)}
        ${custodyPanel(v)}
        ${assigning ? '<section class="panel" aria-labelledby="rp-assign"><h2 id="rp-assign">Assign</h2><div data-record-assign-host></div></section>' : ''}
        ${formPanel(v)}
        <section class="panel" aria-labelledby="rp-tl"><h2 id="rp-tl">Timeline</h2>
          ${v.timeline.length ? `<ol class="record-page__timeline">${v.timeline.map((e) => `<li><time datetime="${esc(e.at)}">${esc(fmtDateTime(e.at))}</time><div><b>${esc(e.title)}</b>${e.who ? ` <span class="meta">· ${esc(e.who)}</span>` : ''}${e.body ? `<p>${esc(e.body)}</p>` : ''}</div></li>`).join('')}</ol>` : '<p class="meta">Nothing has been recorded on this record yet.</p>'}
          ${may('comments') ? `<form class="record-page__minute" data-record-minute><label for="rp-minute">Add a minute or comment</label><textarea id="rp-minute" name="text" rows="3" placeholder="It is added to this timeline${t ? ' and the officer working the task is told' : ''}."></textarea><div class="form-row"><button type="submit" class="btn">Add minute</button></div></form>` : ''}
        </section>
      </div>
      <aside class="panel record-page__actions" aria-labelledby="rp-act"><h2 id="rp-act">Actions</h2>${actionsFor(v)}</aside>
    </div>`;
  bind(el, v);
  const ta = el.querySelector('#rp-minute'); if (ta && draft) ta.value = draft;
  el.querySelectorAll('[data-approval]').forEach((x) => { const t = x.querySelector('[data-approval-minute]'); if (t && apDrafts[x.dataset.approval]) t.value = apDrafts[x.dataset.approval]; });
  if (hadFocus) (focusId && el.querySelector('#' + CSS.escape(focusId)) || el.querySelector('h1'))?.focus();
}

/* Public status (essentials plan UX-301): a record that came in through the Portal shows the status its submitter sees when
   they track the reference, and sets it as Intake's Portal submissions did (core/portal-status-service.js). */
const portalRowOf = (d) => (State.get().portalRegister || []).find((r) => d.referenceId && String(r.referenceId).toLowerCase() === String(d.referenceId).toLowerCase() && /portal/i.test(String(r.entryPoint || r.channel || 'portal')));
function portalPanel(v) {
  const r = !v.doc.taskOnly && portalRowOf(v.doc);
  if (!r) return '';
  const label = (x) => (PORTAL_STAFF_STATUSES.find((o) => o.value === x) || { label: x === 'withdrawn' ? 'Withdrawn by the submitter' : x }).label;
  const can = may('correspondence') && r.status !== 'withdrawn', on = portalStatusConfigured();
  return `<section class="panel" aria-labelledby="rp-portal"><h2 id="rp-portal">Public status</h2>
    <dl class="detail-grid">${fieldRow('The submitter sees', r.statusLabel || label(r.status))}${fieldRow('Submitted by', r.senderEmail)}</dl>
    ${can ? `${on ? '' : '<p class="meta" role="note">Status updates are unavailable: this deployment has no SCAN_INTAKE address configured.</p>'}<form class="grid" data-portal-form>
      <label>New status<select name="status">${PORTAL_STAFF_STATUSES.map((o) => `<option value="${esc(o.value)}"${o.value === r.status ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
      <label class="wide">Note to the submitter (optional)<input name="note" maxlength="4000"></label>
      <div class="wide"><div class="form-row"><button type="submit" class="btn"${on ? '' : ' disabled'}>Set status</button></div></div>
    </form>` : ''}</section>`;
}

/* File custody (UX-204): the official file, its holder and its movements, changed through Registry's actions. Routing
   opens a form here (`form` 'route:<file id>'); the other changes are one confirmation each. */
const FILE_ACTIONS = ['FOR_ACTION', 'FOR_ATTENTION', 'FOR_REVIEW', 'FOR_DG_ATTENTION', 'COMPLY', 'FILE'];
function custodyPanel(v) {
  if (v.doc.taskOnly) return '';
  const can = may('registry'), s = State.get();
  const body = v.files.length ? v.files.map(({ file: f, moves }) => {
    const pending = moves.find((m) => m.status === 'Routed'), isClosed = /closed|archived/i.test(String(f.status || ''));
    const routing = form === `route:${f.id}`;
    return `<dl class="detail-grid">${fieldRow('File', f.registryNumber || f.fileRef || 'Not yet numbered')}${fieldRow('Held by', f.currentHolder)}${fieldRow('Status', pending ? `${f.status} · awaiting receipt by ${pending.to}` : f.status)}${fieldRow('Last movement', moves[0] ? `${moves[0].from} → ${moves[0].to}, ${fmtDateTime(moves[0].releasedAt || '')}` : 'None since it was opened')}</dl>
      ${can && !isClosed && !routing ? `<div class="form-row"><button type="button" class="btn ghost" data-file-route="${esc(f.id)}">Route file</button>${pending ? `<button type="button" class="btn ghost" data-file-receive="${esc(f.id)}">Record receipt</button>` : ''}<button type="button" class="btn ghost" data-file-close="${esc(f.id)}">Close file</button></div>` : ''}
      ${routing ? `<form class="grid" data-file-route-form="${esc(f.id)}">
        <label>Send to<input name="to" list="rp-file-dest" required placeholder="Department or officer"></label>
        <datalist id="rp-file-dest">${(s.departments || []).map((d) => `<option value="${esc(d.title || d.dsuKey)}">${esc(d.email || '')}</option>`).join('')}${(s.users || []).slice(0, 300).map((u) => `<option value="${esc(u.email)}">${esc(u.fullName || '')}</option>`).join('')}</datalist>
        <label>Action<select name="action">${FILE_ACTIONS.map((a) => `<option value="${a}">${esc(a.replace(/_/g, ' ').toLowerCase())}</option>`).join('')}</select></label>
        <label class="wide">Official minute<textarea name="minute" rows="3" required></textarea></label>
        <div class="wide"><div class="form-row"><button type="submit" class="btn">Record minute and route</button><button type="button" class="btn ghost" data-record-form-cancel>Cancel</button></div></div>
      </form>` : ''}`;
  }).join('') : `<p class="meta">No official file has been opened for this record.</p>${can ? '<div class="form-row"><button type="button" class="btn ghost" data-file-open>Open a file</button></div>' : ''}`;
  return `<section class="panel" aria-labelledby="rp-file"><h2 id="rp-file">File custody</h2>${body}</section>`;
}

/* The Reply, Record dispatch and Close & archive forms. Only one is open at a time. */
function formPanel(v) {
  const d = v.doc, t = v.task;
  const actions = (label, extra = '') => `<div class="form-row"><button type="submit" class="btn">${esc(label)}</button>${extra}<button type="button" class="btn ghost" data-record-form-cancel>Cancel</button></div>`;
  if (form === 'reply') return `<section class="panel" aria-labelledby="rp-reply"><h2 id="rp-reply">Reply</h2>
    <form class="grid" data-record-reply>
      <label>To<input name="recipientEmail" type="email" required value="${esc(d.senderEmail || '')}"></label>
      <label>Recipient name<input name="recipientName" value="${esc(d.sender || '')}"></label>
      <label class="wide">Subject<input name="subject" required value="${esc(d.subject || '')}"></label>
      <label>Template<select name="templateId">${Mail.templateOptions()}</select></label>
      <label>Classification<select name="classification"><option>Official</option><option>Confidential</option><option>Restricted</option></select></label>
      <label>Priority<select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label>
      <label class="wide">Message<textarea name="body" rows="6" required placeholder="The text of the reply"></textarea></label>
      <div class="wide">${actions('Send reply', '<button type="button" class="btn ghost" data-record-reply-draft>Save draft</button>')}</div>
    </form></section>`;
  if (form === 'dispatch' && t) return `<section class="panel" aria-labelledby="rp-dispatch"><h2 id="rp-dispatch">Record dispatch</h2>
    <form class="grid" data-record-dispatch>
      <label>Channel<select name="channel">${DISPATCH_CHANNELS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label>Recipient<input name="recipient" value="${esc(d.senderEmail || d.sender || '')}" placeholder="Recipient name or address"></label>
      <label class="wide">Approved response (sent as the letter when the channel is Email)<textarea name="message" rows="4"></textarea></label>
      <label class="wide">Or, if nothing needs to be sent, why<input name="reason" placeholder="The reason no dispatch is needed"></label>
      <div class="wide">${actions('Record dispatch', '<button type="button" class="btn ghost" data-record-no-dispatch>No dispatch needed</button>')}</div>
    </form></section>`;
  if (form === 'close') {
    const c = Actions.closureCheck(d);
    return `<section class="panel" aria-labelledby="rp-close"><h2 id="rp-close">Close &amp; archive</h2>
    ${c.ok ? '<p class="meta">Archiving is permanent. The record and its evidence are sealed and can no longer be edited; reopening later creates a new reference derived from this one.</p>' : `<p class="meta">This record cannot be closed yet: ${esc(c.unknown ? 'it is not in the register' : c.open.join(', '))}.</p>`}
    <form class="grid" data-record-close-form>
      <label class="wide">Why it is being closed<textarea name="summary" rows="3">Closed and ready for archive.</textarea></label>
      <div class="wide"><div class="form-row"><button type="submit" class="btn"${c.ok ? '' : ' disabled'}>Close &amp; archive</button><button type="button" class="btn ghost" data-record-form-cancel>Cancel</button></div></div>
    </form></section>`;
  }
  return '';
}
const openForm = (name) => { form = name; assigning = false; draw(); const f = page()?.querySelector('[data-record-reply], [data-record-dispatch], [data-record-close-form]'); f?.scrollIntoView?.({ block: 'nearest' }); f?.querySelector('input, select, textarea')?.focus(); };
const shut = () => { form = ''; draw(); };

/* ─── Acting ────────────────────────────────────────────────────────────────────────────── */
async function run(label, body, fn) {
  if (label && !await confirmAction({ title: label, body })) return;
  let r; try { r = await fn(); } catch { return; } /* the governance layer has already said what failed */
  const n = r?.notice; toast(n ? `${r.message} ${n.message}` : (r?.message || 'Done.'), r?.ok === false || (n && !n.sent && !n.queued) ? 'error' : 'success');
  return r;
}
function bind(el, v) {
  el.querySelectorAll('[data-record-close]').forEach((b) => b.addEventListener('click', closeRecordPage));
  if (!v) return;
  const d = v.doc, t = v.task, name = esc(d.subject || d.referenceId || '');
  el.querySelectorAll('[data-record-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.recordAct;
    if (act === 'triage') { const s = el.querySelector('[data-record-triage]')?.value; return run('Triage this record', `<p>${name}</p><p>Status: <b>${esc(s)}</b>. It is recorded on the server.</p>`, () => Actions.triage(d, s)); }
    if (act === 'assign') {
      /* The Assignment Desk's own form, mounted on the record: the same cascade, validation, confirmation and write
         (assign-one, SINGLE_ASSIGNMENT). Loaded on demand, as the router loads every screen. */
      assigning = true; draw();
      const hostEl = page()?.querySelector('[data-record-assign-host]'); if (!hostEl) return;
      const { mountAssignmentForm } = await import('../modules/single-assignment.js');
      const finish = () => { assigning = false; draw(); };
      mountAssignmentForm(hostEl, d, { guidance: false, onDone: finish, onCancel: finish });
      hostEl.querySelector('select, input, textarea')?.focus();
      return;
    }
    if (act === 'acknowledge') return run('Confirm receipt of this task', `<p>${esc(t.title)}</p><p>This records that you have received it. A notice goes to the assigned officer, copied to Registry.</p>`, () => Actions.acknowledge(t));
    if (act === 'start') return run('Start work on this task', `<p>${esc(t.title)}</p><p>It is set In progress on the server.</p>`, () => Actions.setTaskStatus(t, 'In Progress'));
    if (act === 'complete') return run('Mark this task done', `<p>${esc(t.title)}</p><p>It is set Completed on the server.</p>`, () => Actions.setTaskStatus(t, 'Completed'));
    if (act === 'remind') return run('Remind the assignee to acknowledge', `<p>${esc(t.title)}</p><p>This e-mails ${esc(t.assignedTo || 'the assignee')} a reminder.</p>`, () => Actions.remind(t));
    if (act === 'escalate') return run('Escalate this task', `<p>${esc(t.title)}</p><p>Its priority is set to urgent on the server and its owner is e-mailed.</p>`, () => Actions.escalate(t));
    if (act === 'request-approval') { const to = el.querySelector('[data-record-approver]')?.value; if (!to) return toast('Choose who is to approve it first.', 'error'); return run('Request approval', `<p>${name}</p><p>An approval request is recorded on the server against this record, and ${esc(to)} is e-mailed.</p>`, () => Actions.requestApproval(d, { title: `Approval: ${d.subject || d.referenceId || ''}`, approverEmail: to })); }
    if (act === 'approve') return run('Approve', `<p>${name}</p><p>The DG/CEO decision is recorded on the server.</p>`, () => Actions.decide(d, 'Accepted'));
    if (act === 'decline') return run('Decline', `<p>${name}</p><p>The DG/CEO decision is recorded on the server.</p>`, () => Actions.decide(d, 'Declined'));
    if (act === 'reply') return openForm('reply');
    if (act === 'dispatch') return openForm('dispatch');
    if (act === 'close') return openForm('close');
    if (act === 'send-reply') { const m = (v.response?.replies || []).find((x) => x.status === 'draft' || x.status === 'queued'); if (!m) return; return run('Send this reply now', `<p><b>${esc(m.subjectLine || m.subject)}</b></p><p>It goes to <b>${esc(m.recipientEmail)}</b> as an official letter from this office, under reference ${esc(m.referenceId || '—')}. Once it is sent it cannot be recalled.</p>`, () => Actions.sendReply(m)); }
    if (act === 'confirm-receipt') return run('Confirm receipt', `<p>${esc(t.title)}</p><p>Closing confirms receipt and ends the dispatch lifecycle for this task.</p>`, async () => ({ ...(await closeDispatch(t)), message: 'Receipt confirmed. The dispatch lifecycle of this task is complete.' }));
    if (act === 'delegate') { const to = el.querySelector('[data-record-delegate]')?.value; if (!to) return toast('Choose who it is delegated to first.', 'error'); return run('Delegate', `<p>${name}</p><p>It is delegated to ${esc(to)}, who is e-mailed that it is now theirs.</p>`, () => Actions.decide(d, 'Delegated', { delegate: to })); }
  }));
  el.querySelectorAll('[data-record-form-cancel]').forEach((b) => b.addEventListener('click', shut));
  el.querySelector('[data-ai-triage]')?.addEventListener('click', async () => {
    ai = { busy: true }; draw();
    let p;
    /* Bounded far below the contract's own 90s: an advisory answer that takes a minute is no help (D2). */
    try { p = aiProposal(await invokeData('AI_DOC_ANALYSIS', { operation: 'classify', referenceId: d.referenceId || String(d.id), subject: d.subject, remarks: d.description || '' }, { timeoutMs: 8000, retry: 0 })); }
    catch (e) { p = aiUnavailable(e?.message || 'the classification service is unavailable; the record is unchanged'); }
    ai = { p }; if (page()) draw();
  });
  el.querySelectorAll('[data-record-flag]').forEach((b) => b.addEventListener('click', () => {
    const f = DocumentFlags.find((x) => x.code === b.dataset.recordFlag), on = hasFlag(d, f.code);
    run(on ? `Lift ${f.label}` : `Mark ${f.label}`, `<p>${name}</p><p>${esc(f.description)}</p>`, () => Actions.toggleFlag(d, f.code));
  }));
  el.querySelectorAll('[data-approval-act]').forEach((b) => b.addEventListener('click', () => {
    const box = b.closest('[data-approval]'), a = (v.approvals || []).find((x) => String(x.id) === box.dataset.approval); if (!a) return;
    const kind = b.dataset.approvalAct, minute = String(box.querySelector('[data-approval-minute]')?.value || '').trim(), signed = !!box.querySelector('[data-approval-sign]')?.checked;
    if (kind === 'reject' && !minute) return toast('A reason is required to reject', 'error');
    run(kind === 'approve' ? 'Confirm approval' : 'Confirm rejection', `<p><b>${esc(a.title)}</b></p><p>Minute: ${esc(minute || '—')}</p><p>Signed: ${signed ? 'Yes' : 'No'}</p><p>The decision is e-mailed to ${esc(a.fromEmail || a.from || 'the officer who raised it')}.</p>`, () => Actions.decideApproval(a, kind, { minute, signed }));
  }));
  /* File custody */
  const fileOf = (id) => v.files.find((x) => String(x.file.id) === String(id));
  el.querySelector('[data-file-open]')?.addEventListener('click', () => run('Open an official file', `<p>${name}</p><p>The server opens the file in Central Registry and issues its number.</p>`, async () => { const r = await openFile(d); return r.ok ? { ...r, message: `File ${r.file.registryNumber || ''} opened on the server.` } : r; }));
  el.querySelectorAll('[data-file-route]').forEach((b) => b.addEventListener('click', () => { form = `route:${b.dataset.fileRoute}`; assigning = false; draw(); page()?.querySelector('[data-file-route-form] input')?.focus(); }));
  el.querySelectorAll('[data-file-receive]').forEach((b) => b.addEventListener('click', () => { const x = fileOf(b.dataset.fileReceive), m = x?.moves.find((y) => y.status === 'Routed'); if (!m) return; run('Record receipt of this file', `<p><b>${esc(x.file.registryNumber || '')}</b></p><p>This records that ${esc(m.to)} now holds the file.</p>`, async () => { const r = await receiveFile(x.file, m); return r.ok ? { ...r, message: 'Receipt and custody recorded.' } : r; }); }));
  el.querySelectorAll('[data-file-close]').forEach((b) => b.addEventListener('click', () => { const x = fileOf(b.dataset.fileClose); if (!x) return; run('Close this official file', `<p><b>${esc(x.file.registryNumber || '')}</b></p><p>The file is marked closed. No further minute or movement can be recorded against it.</p>`, async () => { const r = await closeFile(x.file); return r.ok ? { ...r, message: 'File closed.' } : r; }); }));
  el.querySelectorAll('[data-file-route-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); const x = fileOf(f.dataset.fileRouteForm); if (!x) return;
    const dd = Object.fromEntries(new FormData(f));
    const r = await run('Record this minute and send the file on', `<p><b>${esc(x.file.registryNumber || '')}</b></p><p>Custody passes from ${esc(x.file.currentHolder || 'Central Registry')} to ${esc(dd.to)}, ${esc(String(dd.action || '').replace(/_/g, ' ').toLowerCase())}. It stays awaiting receipt until they record that they have it.</p><p>${esc(dd.minute)}</p>`, async () => { const out = await routeFile(x.file, { to: String(dd.to || '').trim(), action: dd.action, minute: String(dd.minute || '').trim() }); return out.ok ? { ...out, message: 'Minute recorded and the move recorded on the server.' } : out; });
    if (r?.ok) shut();
  }));
  const replyForm = el.querySelector('[data-record-reply]');
  if (replyForm) {
    const draftOf = () => Object.fromEntries(new FormData(replyForm));
    replyForm.addEventListener('submit', async (e) => {
      e.preventDefault(); const x = draftOf();
      const r = await run('Send this reply now', `<p><b>${esc(x.subject)}</b></p><p>It goes to <b>${esc(x.recipientEmail)}</b> as an official letter from this office, under reference ${esc(d.referenceId || '—')}. Once it is sent it cannot be recalled. A copy is kept in the sent register.</p>`, () => Actions.reply(d, x, { send: true }));
      if (r && (r.ok || r.held)) shut();
    });
    el.querySelector('[data-record-reply-draft]')?.addEventListener('click', async () => { const r = await run('', '', () => Actions.reply(d, draftOf())); if (r?.ok) shut(); });
  }
  const dispatchForm = el.querySelector('[data-record-dispatch]');
  if (dispatchForm) {
    dispatchForm.addEventListener('submit', async (e) => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(dispatchForm)), byEmail = x.channel === 'Email';
      const problem = dispatchProblem({ channel: x.channel, recipient: String(x.recipient || '').trim(), message: String(x.message || '').trim() });
      if (problem === 'no-recipient') return toast('Enter who this went to before recording it', 'error');
      if (problem === 'not-an-address') return toast('An Email dispatch needs the recipient\'s email address', 'error');
      if (problem === 'no-message') return toast('Enter the approved response to send', 'error');
      const r = await run(byEmail ? 'Send this dispatch' : 'Record this dispatch', `<p><b>${esc(t.title)}</b></p><p>Channel: ${esc(x.channel)} · Recipient: ${esc(x.recipient)}</p><p>${byEmail ? 'This sends the approved response to the recipient through the Correspondence Email Desk and records the dispatch.' : 'This records that the item went out.'}</p>`, async () => {
        const out = await recordDispatch(t, x);
        return { ...out, message: out.held ? 'The letter has not gone out yet: it is held on this device and goes when the connection is back.' : out.queued ? 'Dispatch recorded on this device. It has not reached the server yet.' : byEmail ? 'Dispatch sent by email and recorded.' : `Dispatch recorded (${x.channel}).` };
      });
      if (r && (r.ok || r.held)) shut();
    });
    el.querySelector('[data-record-no-dispatch]')?.addEventListener('click', async () => {
      const reason = String(dispatchForm.reason.value || '').trim();
      if (!reason) return toast('A reason is required to mark no-dispatch', 'error');
      const r = await run('Record that nothing needs to be sent', `<p><b>${esc(t.title)}</b></p><p>Reason: ${esc(reason)}</p>`, async () => {
        const out = await noDispatch(t, reason);
        return out.ok ? { ...out, message: out.onServer ? 'Recorded on the server: nothing needs to be sent for this task.' : 'Recorded on this device: nothing needs to be sent for this task.' } : out;
      });
      if (r?.ok) shut();
    });
  }
  el.querySelector('[data-portal-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)), ref = d.referenceId, status = String(f.status || ''), note = String(f.note || '').trim();
    const label = (PORTAL_STAFF_STATUSES.find((o) => o.value === status) || {}).label || status;
    await run(`Set ${ref} to ${label}`, `<p>The submitter will see this status when they track their reference, and is told by e-mail.${note ? ' Your note is shown to them.' : ''}</p>`, async () => {
      const r = await setPortalStatus({ referenceId: ref, status, note });
      if (!r.ok) return { ok: false, message: { 'not-configured': 'No SCAN_INTAKE address is configured.', unauthenticated: 'Sign in again, then retry.', forbidden: 'Your role cannot set portal statuses.', 'not-found': 'No portal submission has that reference.', invalid: 'That status or note is not accepted.', unreachable: 'The server could not be reached.' }[r.reason] || 'The server refused the update.' };
      const st = State.get();
      State.patch({ portalRegister: (st.portalRegister || []).map((x) => x.referenceId === ref ? { ...x, status: r.status, statusLabel: r.label || x.statusLabel } : x) }, { module: 'correspondence', action: 'portal-status-writeback', ref });
      return { ok: true, message: `${ref} is now ${label}.` };
    });
  });
  el.querySelector('[data-record-close-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const summary = String(new FormData(e.currentTarget).get('summary') || '').trim();
    const r = await run('Close this record for good', `<p><b>${esc(d.referenceId || '')}</b> · ${name}</p><p>Archiving is permanent. Once closed, this reference and its records are kept as evidence and can no longer be edited.</p><p>Reopening later does not restore this reference — it creates a new one derived from it.</p>`, () => Actions.closeAndArchive(d, summary));
    if (r?.ok) shut();
  });
  el.querySelector('[data-record-minute]')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const text = String(new FormData(e.currentTarget).get('text') || '').trim();
    if (!text) return toast('Write the minute first.', 'error');
    const r = await run('Add this minute', `<p>${esc(text)}</p>`, () => Actions.addMinute(d, t, text));
    if (r && r.ok !== false) { const ta = page()?.querySelector('#rp-minute'); if (ta) ta.value = ''; }
  });
}

/**
 * A link that names a record which is not on this device yet (essentials plan UX-401: the screens that said so are
 * redirected, so the place the link lands on says it). While the records load it says so; once they have loaded without
 * it, it says the record has not loaded and offers to load again. Nothing is drawn once the record has opened, or when
 * no link names one.
 */
export function linkedRecordNotice() {
  const s = State.get(), ctx = s.deepLinkContext || {}, portal = /^all$/i.test(String(ctx.portalRef || '')) ? '' : String(ctx.portalRef || '');
  const key = String(ctx.taskId || ctx.referenceId || portal || '');
  if (!key || ctx.recordPageOpenedAt || ctx.openedAt || page() || recordView(s, key)) return '';
  const what = ctx.taskId || /^TASK-/i.test(key) ? 'task' : 'record';
  if (s.runtime?.loading || !s.runtime?.lastLoad) return `<section class="panel" data-linked-loading role="status"><h2>Loading the ${what} this link points to…</h2><p>The records are on their way from the server; <b>${esc(key)}</b> opens as soon as they arrive.</p></section>`;
  return `<section class="panel" data-linked-missing role="status"><h2>The ${what} this link points to has not loaded</h2><p>The link names <b>${esc(key)}</b>, but it is not among the records loaded on this device. Load the latest records, or find it with the search box at the top.</p><div class="form-row"><button type="button" class="btn" data-linked-reload>Load latest records</button></div></section>`;
}
export function bindLinkedRecordNotice(el, redraw) {
  el.querySelector('[data-linked-reload]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { const { requestSync } = await import('../core/data-loader.js'); await requestSync({ source: 'deeplink', mode: 'full' }); } catch (x) { toast(x?.message || 'The server could not be reached.', 'error'); }
    redraw();
  });
}

/* ─── Opening ───────────────────────────────────────────────────────────────────────────── */
/** Wire the switch's entry points once: data-open-record anywhere, and a notification link once its record loads. */
export function installRecordPage(root = document) {
  root.addEventListener('click', (e) => { const b = e.target.closest?.('[data-open-record]'); if (b) { e.preventDefault(); openRecordPage(b.dataset.openRecord); } });
  const fromLink = () => {
    if (page()) return;
    const ctx = State.get().deepLinkContext || {};
    const key = ctx.taskId || ctx.referenceId || '';
    if (!key || ctx.recordPageOpenedAt) return;
    if (openRecordPage(key)) State.patch({ deepLinkContext: { ...ctx, recordPageOpenedAt: new Date().toISOString() } }, { module: 'record', action: 'open-from-link', ref: key });
  };
  addEventListener('dgo:data-loaded', () => setTimeout(fromLink, 0));
  /* A redirected route that had a record chosen (core/route-redirects.js) opens it. */
  addEventListener('dgo:open-linked-record', () => setTimeout(fromLink, 0));
  addEventListener('hashchange', () => { if (page()) closeRecordPage(); });
  setTimeout(fromLink, 0);
}
