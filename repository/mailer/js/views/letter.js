// The letter composer: one page, top to bottom — who it goes to, what it says, the signed letters,
// then check and send. Every change is saved as it is made (a draft survives a reload and shows
// on every device), and the page updates the parts a change affects instead of redrawing, so
// typing never loses its place.
//
// The campaign model, the message builder, sending, duplicate protection and the send log are
// the same as the step-by-step wizard (compose.js), which stays available at #/compose/<id>.

import { esc, uid, fmtBytes, fmtDateTime, fileToBase64, fileMatchesKey, toCsv, download, splitAddresses, isEmail, domainAllowed, letterDate } from '../util.js';
import { modal, toast, confirmDialog, statusBadge, previewFrame, empty } from '../ui.js';
import { editorHtml, bindEditor } from '../editor.js';
import { markMissing } from '../merge.js';
import { templateParts, campaignFieldNames, referenceFor, IMPORTANCE, buildMessages } from '../campaign.js';
import { letterheadTemplate } from '../letterhead.js';
import { effective } from '../settings.js';
import { FLOW_LIMITS } from '../settings.js';
import { Store } from '../store.js';
import { Sender } from '../sender.js';
import { Reports } from '../reports.js';
import { Sync } from '../sync.js';
import { health } from '../api.js';
import { STANDARD_FIELDS } from './templates.js';
import { LETTER_TYPES, readiness, createLetter, duplicateLetter, typeLabel, ago } from '../letters.js';

/* Per-letter page state that is not part of the letter itself. */
const UI = new Map();
const ui = (id) => {
  if (!UI.has(id)) UI.set(id, { q: '', cat: '', onlyChosen: false, previewKey: '', addOpen: false, dry: null, test: null, filesBusy: '', lastRun: null });
  return UI.get(id);
};

let cleanup = null;

const OPTIONAL_FIELDS = {
  ActionRequired: ['Action required', 'Adds an "Action required" paragraph', 'e.g. Nominate two focal persons'],
  DueDate: ['Respond by', 'Adds an "on or before" paragraph', ''],
  AttachmentSummary: ['What is attached', 'Leave empty to list the attached file names', 'e.g. Signed letter and the framework document'],
};

export async function render(app, params) {
  cleanup?.();
  cleanup = null;
  const [id] = params;
  if (!id) {
    const c = await createLetter(app);
    history.replaceState(null, '', `#/letter/${c.id}`);
    return render(app, [c.id]);
  }
  const c = app.state.campaigns.find((x) => x.id === id);
  if (!c) {
    return { title: 'Letter', html: empty('This letter is not here', 'It may have been deleted on another device.', '<a class="btn btn-primary" href="#/">Back to Letters</a>') };
  }
  c.overrides ||= {}; c.perRecipient ||= {}; c.commonAttachments ||= []; c.unassigned ||= []; c.fields ||= {};
  const s = ui(c.id);
  const r = readiness(app, c);
  if (!s.previewKey || !c.recipients.includes(s.previewKey)) s.previewKey = c.recipients[0] || '';
  const sentAny = r.tally.sent > 0;

  const html = `
    <div class="composer" data-composer>
      <header class="composer-head">
        <a class="back-link" href="#/">← Letters</a>
        <div class="composer-title">
          <label class="sr-only" for="letter-name">Name of this letter</label>
          <input id="letter-name" class="title-input" data-name value="${esc(c.name)}" maxlength="140" autocomplete="off">
          <span class="save-state" data-region="save" aria-live="polite">${saveText(c)}</span>
        </div>
        <div class="composer-actions">
          <button class="btn btn-sm" data-dup>Duplicate</button>
          ${sentAny ? `<a class="btn btn-sm" href="#/sent/${esc(c.id)}">Results</a>` : `<button class="btn btn-sm btn-ghost" data-delete>Delete draft</button>`}
        </div>
      </header>
      ${sentAny ? `<div class="callout callout-info">${r.tally.sent} of ${r.tally.total} letters have gone. Changes you make now apply only to the ones not yet sent.</div>` : ''}

      <div class="composer-grid">
        <div class="composer-main">
          ${sectionTo(app, c, s)}
          ${sectionLetter(app, c)}
          ${sectionFiles()}
          ${sectionSend()}
        </div>
        <aside class="composer-side" aria-label="Preview">
          <section class="card preview-card" id="preview">
            <div class="card-head"><h2>Preview</h2><button class="btn btn-sm" data-preview-all>Open all</button></div>
            <div data-region="preview"></div>
          </section>
        </aside>
      </div>
      <div class="action-bar" data-region="bar"></div>
    </div>`;

  /* #/letter/<id>/<section> opens the letter at that section (e.g. "send" from Sent). */
  const section = ['to', 'letter', 'files', 'send'].includes(params[1]) ? params[1] : '';
  if (section) history.replaceState(null, '', `#/letter/${c.id}`);
  const bind = (root) => bindComposer(app, c, root, section);
  return { title: c.fields?.LetterTitle || c.name, html, bind, cleanup: () => { cleanup?.(); cleanup = null; } };
}

/* ------------------------------------------------------------------ sections */

const saveText = (c) => (c._saving ? '<span class="dot dot-busy"></span>Saving…' : `<span class="dot dot-ok"></span>Saved ${esc(ago(c.updatedAt))}`);

function sectionTo(app, c, s) {
  const cats = [...new Set(app.state.directory.map((x) => x.category).filter(Boolean))].sort();
  return `
    <section class="card step" id="to" aria-labelledby="to-h">
      <div class="card-head"><h2 id="to-h"><span class="step-num">1</span> Who is it to?</h2><span data-region="to-count"></span></div>
      <div data-region="to-chosen"></div>
      <div class="to-tools">
        <input type="search" class="input grow" data-q placeholder="Search by name, institution or email" value="${esc(s.q)}" aria-label="Search addressees">
        ${cats.length ? `<select class="input" data-cat aria-label="Show a category"><option value="">All categories</option>${cats.map((x) => `<option ${x === s.cat ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
        <label class="toggle"><input type="checkbox" data-only ${s.onlyChosen ? 'checked' : ''}> Only chosen</label>
      </div>
      <div class="to-bulk">
        <button class="btn btn-sm" data-all>Choose all with an email address</button>
        <button class="btn btn-sm" data-none>Clear</button>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-add-open aria-expanded="${s.addOpen}">＋ New addressee</button>
      </div>
      <div data-region="add-form"></div>
      <div class="to-list" data-region="to-list" role="list"></div>
    </section>`;
}

function sectionLetter(app, c) {
  const letterhead = c.templateKind === 'letterhead';
  const own = app.state.templates.filter((t) => t.kind !== 'letterhead');
  const extra = letterhead ? campaignFieldNames(c).filter((f) => OPTIONAL_FIELDS[f]) : campaignFieldNames(c).filter((f) => !['LetterTitle', 'Message'].includes(f));
  const lt = letterhead ? letterheadTemplate(c.letterheadId) : null;
  const dueIso = c.dueIso || '';
  return `
    <section class="card step" id="letter" aria-labelledby="letter-h">
      <div class="card-head"><h2 id="letter-h"><span class="step-num">2</span> What does it say?</h2></div>
      <fieldset class="type-picker">
        <legend>Kind of letter</legend>
        <div class="type-grid">
          ${LETTER_TYPES.map((t) => `<button type="button" class="type-card ${t.key === c.templateKey ? 'on' : ''}" data-type="${esc(t.key)}" aria-pressed="${t.key === c.templateKey}"><strong>${esc(t.label)}</strong><span>${esc(t.hint)}</span></button>`).join('')}
        </div>
        ${own.length ? `<label class="inline-field small">Or one of the office's own templates:
          <select class="input" data-type-select><option value="">Choose…</option>${own.map((t) => `<option value="${esc(t.key)}" ${t.key === c.templateKey ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      </fieldset>
      ${letterhead ? `
        <p class="hint">On the Agency letterhead (${esc(lt?.label || '')}). The layout, greeting, signature and footer are added for you; each addressee's name and reference are filled in.</p>
        <label class="field"><span>Title <small>The heading of the letter and the email subject</small></span>
          <input data-f="field:LetterTitle" value="${esc(c.fields.LetterTitle || '')}" placeholder="e.g. Adoption of the National Data Exchange Framework" maxlength="200" autocomplete="off"></label>
        <label class="field"><span>Message <small>The body of the letter. Line breaks are kept.</small></span>
          <textarea data-f="field:Message" rows="7" placeholder="Write what the letter says to every addressee.">${esc(c.fields.Message || '')}</textarea>
          <span class="counter small muted" data-count="Message">${String(c.fields.Message || '').length} characters</span></label>
        ${extra.length ? `<div class="form-grid">${extra.map((f) => {
          const [label, hint, ph] = OPTIONAL_FIELDS[f];
          if (f === 'DueDate') return `<label class="field"><span>${esc(label)} <small>${esc(hint)}</small></span><input type="date" data-due value="${esc(dueIso)}"><span class="small muted" data-due-text>${esc(c.fields.DueDate || 'Optional')}</span></label>`;
          return `<label class="field ${f === 'AttachmentSummary' ? 'span-2' : ''}"><span>${esc(label)} <small>${esc(hint)}</small></span><input data-f="field:${esc(f)}" value="${esc(c.fields[f] || '')}" placeholder="${esc(ph)}"></label>`;
        }).join('')}</div>` : ''}`
    : `
        <label class="field"><span>Subject</span><input data-f="subject" value="${esc(c.subject || '')}"></label>
        <div class="field"><span>Email <small>Tap a field to insert it; it is filled in for each addressee</small></span>
          ${editorHtml({ id: 'body', name: 'bodyHtml', value: c.bodyHtml, fields: [...new Set([...STANDARD_FIELDS, ...extra])] })}</div>
        ${extra.length ? `<div class="form-grid">${extra.map((f) => `<label class="field"><span>${esc(f)}</span><input data-f="field:${esc(f)}" value="${esc(c.fields[f] || '')}"></label>`).join('')}</div>` : ''}`}

      <details class="more" ${c.moreOpen ? 'open' : ''} data-more>
        <summary>More options <span class="muted small">Reference number, date, copies, importance</span></summary>
        <div class="form-grid">
          <label class="field"><span>Letter date</span><input type="date" data-f="date" value="${esc(c.date)}"></label>
          <label class="field"><span>Importance</span><select data-f="importance">${IMPORTANCE.map((i) => `<option ${i === c.importance ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
          ${letterhead ? `<label class="field"><span>Classification</span><select data-f="field:Classification">${['Official', 'Confidential', 'Restricted'].map((x) => `<option ${x === (c.fields.Classification || 'Official') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
          <label class="field"><span>Reference number format <small>Key, Year, Month and Seq are filled in</small></span><input data-f="referencePattern" value="${esc(c.referencePattern)}"><span class="small muted">Example: <code data-ref-example>${esc(referenceFor(c, c.recipients[0] || 'NUC', 0))}</code></span></label>
          <label class="field"><span>Start numbering at</span><input type="number" min="1" data-f="referenceStart" value="${esc(c.referenceStart)}"></label>
          <label class="field span-2"><span>Copy every email to (Cc) <small>Separate addresses with commas</small></span><input data-f="cc" value="${esc(c.cc.join(', '))}" placeholder="optional"></label>
          <label class="field span-2"><span>Blind copy every email to (Bcc) <small>e.g. the registry mailbox, for the file copy</small></span><input data-f="bcc" value="${esc(c.bcc.join(', '))}" placeholder="optional"></label>
          <label class="toggle span-2"><input type="checkbox" data-f="requireAttachment" ${c.requireAttachment ? 'checked' : ''}> Every addressee must have a signed letter attached</label>
        </div>
      </details>
    </section>`;
}

const sectionFiles = () => `
    <section class="card step" id="files" aria-labelledby="files-h">
      <div class="card-head"><h2 id="files-h"><span class="step-num">3</span> Signed letters and attachments</h2><span data-region="files-count"></span></div>
      <label class="dropzone" data-drop tabindex="0">
        <input type="file" multiple hidden data-bulk>
        <span class="drop-main">Add the signed letters</span>
        <span class="small muted">Tap to choose, or drop files here. Each file goes to the addressee whose key is in its name: <code>NUC_Letter.pdf</code> goes to NUC.</span>
      </label>
      <div data-region="files"></div>
    </section>`;

const sectionSend = () => `
    <section class="card step" id="send" aria-labelledby="send-h">
      <div class="card-head"><h2 id="send-h"><span class="step-num">4</span> Check and send</h2></div>
      <div data-region="send"></div>
    </section>`;

/* ------------------------------------------------------------------ regions */

function regionToCount(c) {
  return `<span class="count-pill ${c.recipients.length ? 'on' : ''}">${c.recipients.length} chosen</span>`;
}

function regionChosen(app, c) {
  if (!c.recipients.length) return '<p class="muted small">No one yet. Tick addressees below, or search for them.</p>';
  const byKey = new Map(app.state.directory.map((x) => [x.key, x]));
  const shown = c.recipients.slice(0, 40);
  return `<div class="chosen">${shown.map((k) => `<span class="person-chip" title="${esc(byKey.get(k)?.institution || k)}">${esc(k)}<button type="button" data-unpick="${esc(k)}" aria-label="Remove ${esc(k)}">✕</button></span>`).join('')}${c.recipients.length > shown.length ? `<span class="muted small">and ${c.recipients.length - shown.length} more</span>` : ''}</div>`;
}

function regionToList(app, c, s, r) {
  const q = s.q.trim().toLowerCase();
  const chosen = new Set(c.recipients);
  const byMsg = new Map(r.messages.map((m) => [m.key, m]));
  const rows = app.state.directory.filter((x) => (!q || [x.key, x.institution, x.addressee, x.email, x.category].join(' ').toLowerCase().includes(q))
    && (!s.cat || x.category === s.cat) && (!s.onlyChosen || chosen.has(x.key)));
  if (!rows.length) return `<p class="muted pad">No addressee matches "${esc(s.q)}". <button class="linklike" data-add-open>Add a new addressee</button></p>`;
  return rows.map((x) => {
    const on = chosen.has(x.key);
    const res = c.results?.[x.key];
    const m = byMsg.get(x.key);
    const noEmail = !x.email && !c.overrides?.[x.key]?._to;
    const inactive = x.active === false;
    const files = (c.perRecipient[x.key] || []).length;
    const issue = on ? (m?.issues || []).find((i) => /allowed domains|not an email|No email address|More than/.test(i)) || '' : '';
    return `<div class="person ${on ? 'on' : ''} ${noEmail ? 'disabled' : ''}" role="listitem">
      <label class="person-pick">
        <input type="checkbox" data-pick="${esc(x.key)}" ${on ? 'checked' : ''} ${noEmail ? 'disabled' : ''} aria-label="Choose ${esc(x.institution)}">
        <span class="person-text">
          <span class="person-name"><strong>${esc(x.key)}</strong> ${esc(x.institution)}${inactive ? ' <span class="tag">inactive</span>' : ''}</span>
          <span class="person-sub">${esc(c.overrides?.[x.key]?.Addressee || x.addressee || '')}${x.email || c.overrides?.[x.key]?._to ? ` · ${esc(c.overrides?.[x.key]?._to || x.email)}` : ''}</span>
          ${x.caution ? `<span class="person-warn">⚠ ${esc(x.notes || x.verification || 'Check this address before sending')}</span>` : ''}
          ${noEmail ? '<span class="person-bad">No email address yet</span>' : ''}
          ${issue ? `<span class="person-bad">${esc(issue)}</span>` : ''}
        </span>
      </label>
      <span class="person-side">
        ${res?.status ? statusBadge(res.status) : on && c.requireAttachment ? (files || c.commonAttachments.length ? '<span class="badge badge-ok">Letter ✓</span>' : '<span class="badge badge-warn">No letter</span>') : ''}
        ${noEmail ? `<button class="btn btn-sm" data-add-email="${esc(x.key)}">Add email</button>` : on ? `<button class="btn btn-sm btn-ghost" data-custom="${esc(x.key)}" title="Change the greeting, address or wording for this addressee only">Adjust${Object.values(c.overrides?.[x.key] || {}).some((v) => String(v || '').trim()) ? ' •' : ''}</button>` : ''}
      </span>
    </div>`;
  }).join('');
}

function regionAddForm(app, s) {
  if (!s.addOpen) return '';
  return `<form class="add-person" data-add-form novalidate>
    <h3>New addressee</h3>
    <p class="small muted">Added to the shared addressee list and chosen for this letter.</p>
    <div class="form-grid">
      <label class="field span-2"><span>Institution</span><input name="institution" required placeholder="e.g. Nigerian Communications Commission" autocomplete="off"></label>
      <label class="field span-2"><span>Addressee line <small>How the letter is addressed</small></span><input name="addressee" required placeholder="e.g. The Executive Vice Chairman/CEO"></label>
      <label class="field"><span>Email address</span><input name="email" type="email" required placeholder="name@agency.gov.ng"></label>
      <label class="field"><span>Greeting <small>After "Dear"</small></span><input name="salutation" value="Sir/Madam"></label>
      <label class="field"><span>Short code <small>Used to match attachments and in the reference</small></span><input name="key" required pattern="[A-Za-z0-9-]{2,24}" placeholder="e.g. NCC" data-key-input></label>
      <label class="field"><span>Category <small>optional</small></span><input name="category" list="cat-list"></label>
    </div>
    <p class="form-error bad-text small" data-add-error role="alert"></p>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Add and choose</button><button class="btn" type="button" data-add-close>Cancel</button></div>
  </form>`;
}

function regionFiles(app, c, r, s) {
  const chip = (id, attr) => {
    const f = app.state.fileIndex[id];
    return `<span class="file-chip ${f ? '' : 'file-missing'}" title="${esc(f?.name || 'This file is missing')}">📄 <span class="file-name">${esc(f?.name || 'missing file')}</span> <span class="muted">${esc(fmtBytes(f?.size))}</span><button type="button" class="icon-btn" ${attr} aria-label="Remove ${esc(f?.name || 'file')}">✕</button></span>`;
  };
  const busy = s.filesBusy ? `<div class="busy-line" role="status"><span class="spinner"></span>${esc(s.filesBusy)}</div>` : '';
  const unassigned = c.unassigned || [];
  const rows = r.messages;
  return `${busy}
    ${unassigned.length ? `<div class="callout callout-warn"><strong>${unassigned.length} file${unassigned.length === 1 ? '' : 's'} did not match anyone.</strong> Choose who each is for, or remove it.
      ${unassigned.map((id) => `<div class="assign-row">${chip(id, `data-rm-unassigned="${esc(id)}"`)}<select class="input" data-assign="${esc(id)}" aria-label="Who is ${esc(app.state.fileIndex[id]?.name || 'this file')} for?"><option value="">For…</option>${c.recipients.map((k) => `<option>${esc(k)}</option>`).join('')}<option value="__all">Everyone</option></select></div>`).join('')}</div>` : ''}
    ${rows.length ? `<div class="file-table">${rows.map((m) => {
      const mine = c.perRecipient[m.key] || [];
      const need = c.requireAttachment && !mine.length && !c.commonAttachments.length;
      return `<div class="file-row ${need ? 'need' : ''}">
        <span class="file-who"><span class="mark ${mine.length || c.commonAttachments.length ? 'ok' : need ? 'bad' : ''}" aria-hidden="true">${mine.length || c.commonAttachments.length ? '✓' : need ? '!' : '–'}</span><strong>${esc(m.key)}</strong> <span class="muted small">${esc(m.recipient?.institution || '')}</span></span>
        <span class="file-list">${mine.map((id) => chip(id, `data-rm-per="${esc(m.key)}|${esc(id)}"`)).join('') || (need ? '<span class="small bad-text">No letter yet</span>' : '<span class="small muted">—</span>')}</span>
        <label class="btn btn-sm" title="Attach a file for ${esc(m.key)} only">＋ File<input type="file" multiple hidden data-add-for="${esc(m.key)}"></label>
      </div>`;
    }).join('')}</div>` : '<p class="muted small">Choose addressees first; each gets a row here.</p>'}
    <div class="common">
      <div class="row-between"><strong>For everyone</strong><label class="btn btn-sm">＋ Add a file for everyone<input type="file" multiple hidden data-common></label></div>
      <div class="chips">${c.commonAttachments.map((id) => chip(id, `data-rm-common="${esc(id)}"`)).join('') || '<span class="muted small">Nothing. Use this for an enclosure every addressee gets.</span>'}</div>
    </div>
    <p class="small muted">Each email can carry up to ${FLOW_LIMITS.maxAttachmentMb} MB of attachments.</p>`;
}

function regionFilesCount(c, r) {
  if (!c.recipients.length) return '';
  const ok = !c.requireAttachment || r.lettered === r.messages.length;
  return `<span class="count-pill ${ok ? 'on' : 'warn'}">${r.lettered} of ${r.messages.length} have a letter</span>`;
}

function regionSend(app, c, r, s) {
  const run = Sender.run && Sender.run.campaignId === c.id ? Sender.run : null;
  const busyElsewhere = Sender.busy() && !run;
  const t = r.tally;
  const failedKeys = Object.entries(c.results || {}).filter(([k, x]) => ['failed', 'refused'].includes(x.status) && c.recipients.includes(k)).map(([k]) => k);
  const checklist = `<ul class="checks-list">${r.checks.map((x) => `<li class="${x.ok ? 'ok' : 'todo'}"><span class="mark ${x.ok ? 'ok' : 'bad'}" aria-hidden="true">${x.ok ? '✓' : '!'}</span>${esc(x.text)}${x.ok ? '' : ` <button class="linklike" data-goto="${x.id === 'letter' ? 'letter' : x.id === 'files' || x.id === 'size' ? 'files' : 'to'}">Fix</button>`}</li>`).join('')}</ul>`;
  const problems = r.withIssues.length ? `<details class="problems" open><summary>${r.withIssues.length} email${r.withIssues.length === 1 ? '' : 's'} cannot go yet</summary><ul>${r.withIssues.slice(0, 30).map((m) => `<li><strong>${esc(m.key)}</strong>: ${esc(m.issues[0])}</li>`).join('')}</ul></details>` : '';

  if (run && !run.finished) {
    const pct = run.total ? Math.round((run.index / run.total) * 100) : 0;
    const dry = run.mode === 'dryrun';
    return `<div class="run-panel" aria-live="polite">
      <div class="row-between"><strong>${dry ? 'Checking with the send flow' : run.starting ? 'Preparing' : run.paused ? 'Paused' : 'Sending'}</strong><span class="muted small">${run.index} of ${run.total || '…'}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${run.index}"><div style="width:${pct}%"></div></div>
      <p class="small">${run.starting ? 'Saving the attachments so every device and the send flow can use them. Nothing has been sent yet.'
        : run.waitingForSignIn ? `Your session ended. ${esc(run.current || '')} has not been sent. Sign in again, then press Resume.`
        : dry ? `Checking ${esc(run.current || '')}. Nothing is being sent.` : run.paused ? 'Paused. Nothing more goes until you press Resume.' : `Now sending to ${esc(run.current || '')}. Keep this page open.`}</p>
      ${dry ? '<div class="toolbar"><button class="btn" data-stop>Stop checking</button></div>'
        : run.starting ? '' : `<div class="toolbar">${run.paused ? '<button class="btn btn-primary" data-resume>Resume</button>' : '<button class="btn" data-pause>Pause</button>'}<button class="btn btn-danger" data-stop>Stop after this one</button></div>`}
      ${runList(app, c, r, run)}
    </div>`;
  }

  const last = s.lastRun && s.lastRun.at ? `<div class="callout ${s.lastRun.failed ? 'callout-bad' : 'callout-ok'}" role="status"><strong>${s.lastRun.live ? `${s.lastRun.sent} sent` : `${s.lastRun.sent} practised`}${s.lastRun.failed ? `, ${s.lastRun.failed} failed` : ''}.</strong> ${s.lastRun.failed ? 'Each failed one says why below. Retrying never sends a letter twice.' : 'Every letter in this run went.'}
      <div class="toolbar"><a class="btn btn-sm" href="#/sent/${esc(c.id)}">See the results</a>${s.lastRun.reportId ? '<button class="btn btn-sm" data-report="last">Full report</button>' : ''}</div></div>` : '';

  const dry = s.dry ? `<div class="callout ${s.dry.fail ? 'callout-bad' : 'callout-ok'}" role="status"><strong>${s.dry.fail ? `${s.dry.fail} of ${s.dry.total} would not be sent.` : `All ${s.dry.total} would be sent.`}</strong> Checked ${esc(ago(s.dry.at))}; nothing was sent.${s.dry.fail ? ` ${s.dry.firstFail ? `First problem: ${esc(s.dry.firstFail)}` : ''}` : ''}${s.dry.reportId ? ' <button class="linklike" data-report="dry">Details</button>' : ''}</div>` : '';

  const testTo = s.testTo ?? (r.settings.testAddress || r.settings.operator?.email || '');
  const test = s.test ? `<p class="small ${s.test.ok ? 'ok-text' : 'bad-text'}" role="status">${s.test.ok ? `✓ Test ${s.test.simulated ? 'built (practice mode, not emailed)' : `sent to ${esc(s.test.to)}`} ${esc(ago(s.test.at))}. ${s.test.simulated ? '' : 'Check that inbox.'}` : `✕ Test not sent: ${esc(s.test.error)}`}</p>` : '';

  const outstanding = r.sendable.length;
  const allSent = t.total > 0 && t.sent === t.total;
  const final = allSent ? `<div class="send-final done">
      <p class="ok-text"><strong>✓ All ${t.total} letter${t.total === 1 ? ' has' : 's have'} gone.</strong> To send it again, or to others, make a copy.</p>
      <a class="btn btn-primary" href="#/sent/${esc(c.id)}">See the results</a><button class="btn" data-dup>Copy as a new letter</button><button class="btn btn-ghost" data-csv>Download results (CSV)</button>
    </div>` : '';
  return `
    ${last}
    ${checklist}
    ${problems}
    <div class="send-tools">
      <div class="tool-card">
        <h3>See it first</h3>
        <p class="small muted">Look through every email exactly as it will arrive.</p>
        <button class="btn" data-preview-all ${r.messages.length ? '' : 'disabled'}>Preview ${r.messages.length || ''} email${r.messages.length === 1 ? '' : 's'}</button>
      </div>
      <div class="tool-card">
        <h3>Check with the send flow</h3>
        <p class="small muted">The server checks every email as for a real send, and sends nothing.</p>
        <button class="btn" data-check ${r.messages.length && !Sender.busy() ? '' : 'disabled'}>Check ${r.messages.length || ''} email${r.messages.length === 1 ? '' : 's'}</button>
        ${dry}
      </div>
      <div class="tool-card wide">
        <h3>Send a test to yourself</h3>
        <p class="small muted">One addressee's email, with their letter, to your inbox instead. Nothing goes to them.</p>
        <div class="inline-row">
          <select class="input" data-test-key aria-label="Whose email to test" ${r.messages.length ? '' : 'disabled'}>${r.messages.map((m) => `<option value="${esc(m.key)}" ${m.key === s.previewKey ? 'selected' : ''}>${esc(m.key)}</option>`).join('')}</select>
          <input class="input grow" type="email" data-test-to value="${esc(testTo)}" aria-label="Send the test to" placeholder="you@nitda.gov.ng">
          <button class="btn" data-test ${r.messages.length && !busyElsewhere ? '' : 'disabled'}>Send test</button>
        </div>
        ${test}
      </div>
    </div>
    ${final || `<div class="send-final">
      ${busyElsewhere ? '<p class="warn-text small">Another letter is being sent. This one can go when it finishes.</p>' : ''}
      <button class="btn btn-primary btn-lg" data-send ${outstanding && r.withIssues.length === 0 && !busyElsewhere ? '' : 'disabled'}>${r.live ? 'Send' : 'Practise sending'} ${outstanding} letter${outstanding === 1 ? '' : 's'}</button>
      ${failedKeys.length ? `<button class="btn" data-retry>Retry ${failedKeys.length} that failed</button>` : ''}
      ${t.sent || failedKeys.length ? '<button class="btn btn-ghost" data-csv>Download results (CSV)</button>' : ''}
      <p class="small muted">${r.live ? 'Emails go one at a time from the sending mailbox. A letter already sent is never sent again.' : 'Practice mode: nothing is emailed.'}</p>
    </div>`}`;
}

function runList(app, c, r, run) {
  const outcomes = run.mode === 'dryrun' ? run.outcomes || {} : null;
  return `<ul class="run-list">${r.messages.map((m) => {
    const res = c.results?.[m.key];
    const now = run.current === m.key;
    const o = outcomes?.[m.key];
    const badgeHtml = outcomes ? (o ? `<span class="badge badge-${o.outcome === 'fail' ? 'bad' : o.outcome === 'warn' ? 'warn' : 'ok'}">${o.outcome === 'fail' ? 'Would not go' : 'Would go'}</span>` : now ? '<span class="badge badge-info">Checking…</span>' : '<span class="badge badge-neutral">Waiting</span>')
      : now ? '<span class="badge badge-info">Sending…</span>' : statusBadge(res?.status || 'pending');
    return `<li class="${now ? 'now' : ''}"><strong>${esc(m.key)}</strong><span class="muted small">${esc(m.to.join(', '))}</span>${badgeHtml}${res?.error && !outcomes ? `<span class="small bad-text">${esc(res.error)}</span>` : ''}${o?.outcome === 'fail' ? `<span class="small bad-text">${esc(o.detail)}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

function regionPreview(app, c, r, s) {
  const keys = r.messages.map((m) => m.key);
  let m = r.messages.find((x) => x.key === s.previewKey) || r.messages[0];
  if (!m) {
    const sample = app.state.directory.find((x) => x.email && x.active !== false);
    if (!sample) return '<p class="muted small">Add an addressee to see the letter.</p>';
    [m] = buildMessages({ campaign: { ...c, recipients: [sample.key] }, directory: app.state.directory, settings: r.settings, files: app.state.fileIndex });
    if (!m) return '';
  }
  const i = keys.indexOf(m.key);
  return `
    ${keys.length ? `<div class="preview-nav">
      <button class="icon-btn" data-prev ${i <= 0 ? 'disabled' : ''} aria-label="Previous addressee">‹</button>
      <select class="input" data-preview-key aria-label="Preview the email for">${r.messages.map((x) => `<option value="${esc(x.key)}" ${x.key === m.key ? 'selected' : ''}>${esc(x.key)} — ${esc(x.recipient?.institution || '')}</option>`).join('')}</select>
      <button class="icon-btn" data-next ${i >= keys.length - 1 ? 'disabled' : ''} aria-label="Next addressee">›</button>
    </div>` : '<p class="small muted">A sample: choose addressees to see each one\'s email.</p>'}
    <dl class="meta preview-meta">
      <dt>To</dt><dd>${esc(m.to.join(', ') || '—')}</dd>
      ${m.cc.length ? `<dt>Cc</dt><dd>${esc(m.cc.join(', '))}</dd>` : ''}
      <dt>Subject</dt><dd>${markMissing(esc(m.subject || '—'))}</dd>
      <dt>Attached</dt><dd>${m.attachments.map((a) => esc(a.name)).join(', ') || '<span class="muted">nothing yet</span>'}</dd>
    </dl>
    ${m.issues?.length && keys.length ? `<p class="small bad-text">✕ ${esc(m.issues[0])}</p>` : ''}
    ${previewFrame(markMissing(m.htmlBody || ''), `The email to ${m.key}`)}`;
}

function regionBar(app, c, r) {
  const run = Sender.run && Sender.run.campaignId === c.id && !Sender.run.finished ? Sender.run : null;
  if (run) {
    const pct = run.total ? Math.round((run.index / run.total) * 100) : 0;
    return `<div class="bar-inner"><span class="bar-status"><span class="spinner"></span>${run.mode === 'dryrun' ? 'Checking' : run.paused ? 'Paused' : 'Sending'} ${run.index} of ${run.total || '…'}</span>
      <span class="bar-progress"><span style="width:${pct}%"></span></span><button class="btn btn-sm" data-goto="send">View</button></div>`;
  }
  const todo = r.checks.filter((x) => !x.ok);
  const allSent = r.tally.total > 0 && r.tally.sent === r.tally.total;
  if (allSent) return `<div class="bar-inner"><span class="bar-status ok-text">✓ All ${r.tally.total} sent</span><a class="btn btn-sm btn-primary" href="#/sent/${esc(c.id)}">See the results</a></div>`;
  return `<div class="bar-inner">
    <span class="bar-status ${r.ready ? 'ok-text' : ''}">${r.ready ? `✓ Ready: ${r.sendable.length} letter${r.sendable.length === 1 ? '' : 's'}` : `${todo.length} thing${todo.length === 1 ? '' : 's'} to finish`}</span>
    ${!r.ready && todo[0] ? `<span class="bar-hint muted small">${esc(todo[0].text)}</span>` : ''}
    <button class="btn btn-sm ${r.ready ? 'btn-primary' : ''}" data-goto="${r.ready ? 'send' : todo[0]?.id === 'letter' ? 'letter' : todo[0]?.id === 'files' || todo[0]?.id === 'size' ? 'files' : todo[0] ? 'to' : 'send'}">${r.ready ? 'Review and send ↓' : 'Show me'}</button>
  </div>`;
}

/* ------------------------------------------------------------------ behaviour */

function bindComposer(app, c, root, section = '') {
  const s = ui(c.id);
  const $ = (sel) => root.querySelector(sel);
  const region = (name) => root.querySelector(`[data-region="${name}"]`);
  let r = readiness(app, c);
  let saveTimer = null;
  let previewTimer = null;

  const paint = {
    save: () => { region('save').innerHTML = saveText(c); },
    'to-count': () => { region('to-count').innerHTML = regionToCount(c); },
    'to-chosen': () => { region('to-chosen').innerHTML = regionChosen(app, c); },
    'to-list': () => { region('to-list').innerHTML = regionToList(app, c, s, r); },
    'add-form': () => { region('add-form').innerHTML = regionAddForm(app, s); },
    files: () => { region('files').innerHTML = regionFiles(app, c, r, s); },
    'files-count': () => { region('files-count').innerHTML = regionFilesCount(c, r); },
    send: () => { region('send').innerHTML = regionSend(app, c, r, s); },
    preview: () => { region('preview').innerHTML = regionPreview(app, c, r, s); },
    bar: () => { region('bar').innerHTML = regionBar(app, c, r); },
  };
  const refresh = (parts = Object.keys(paint)) => {
    r = readiness(app, c);
    for (const p of parts) paint[p]?.();
  };
  const later = (parts, ms = 250) => { clearTimeout(previewTimer); previewTimer = setTimeout(() => refresh(parts), ms); };

  const saveNow = async () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    c._saving = true; paint.save();
    try { await app.saveCampaign(c); } catch (e) { toast(`Could not save: ${e.message}`, 'bad'); }
    delete c._saving; paint.save();
  };
  const saveSoon = () => { clearTimeout(saveTimer); c._saving = true; paint.save(); saveTimer = setTimeout(saveNow, 600); };

  const order = (keys) => app.state.directory.map((x) => x.key).filter((k) => keys.has(k));
  /* Files that matched nobody are tried again when addressees change. */
  const rematch = () => {
    let n = 0;
    c.unassigned = (c.unassigned || []).filter((id) => {
      const name = app.state.fileIndex[id]?.name || '';
      const key = c.recipients.filter((k) => fileMatchesKey(name, k)).sort((a, b) => b.length - a.length)[0];
      if (!key) return true;
      (c.perRecipient[key] ||= []).push(id); n++; return false;
    });
    return n;
  };
  const setRecipients = async (keys, message) => {
    const before = c.recipients.length;
    /* Addressees not in this device's directory (deleted here, or not yet synced) cannot be
       ticked or unticked on this page: they are kept, after the ordered ones, with any result. */
    const inDirectory = new Set(app.state.directory.map((x) => x.key));
    c.recipients = [...order(new Set(keys)), ...c.recipients.filter((k) => !inDirectory.has(k))];
    const matched = rematch();
    await saveNow();
    refresh();
    if (message) toast(message, 'ok', 3500);
    else if (c.recipients.length !== before) announce(`${c.recipients.length} chosen`);
    if (matched) toast(`${matched} waiting file${matched === 1 ? '' : 's'} matched the newly chosen addressee${matched === 1 ? '' : 's'}.`, 'ok', 5000);
  };
  const announce = (text) => { const live = document.getElementById('sr-live') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'sr-live', className: 'sr-only' }); live.setAttribute('aria-live', 'polite'); live.textContent = text; };

  /* ---------- typing ---------- */
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-name]')) { c.name = el.value; c.autoName = false; saveSoon(); return; }
    if (el.matches('[data-q]')) { s.q = el.value; paint['to-list'](); return; }
    if (el.matches('[data-test-to]')) { s.testTo = el.value; return; }
    if (el.matches('[data-key-input]')) { el.value = el.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); return; }
    if (el.dataset.f) { readField(el); return; }
  });
  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.f) { readField(el, true); return; }
    if (el.matches('[data-due]')) {
      c.dueIso = el.value;
      c.fields.DueDate = el.value ? letterDate(new Date(`${el.value}T12:00:00`)) : '';
      root.querySelector('[data-due-text]').textContent = c.fields.DueDate || 'Optional';
      saveSoon(); later(['preview', 'send', 'bar']);
      return;
    }
    if (el.matches('[data-cat]')) { s.cat = el.value; paint['to-list'](); return; }
    if (el.matches('[data-only]')) { s.onlyChosen = el.checked; paint['to-list'](); return; }
    if (el.dataset.pick) {
      const keys = new Set(c.recipients);
      if (el.checked) keys.add(el.dataset.pick); else keys.delete(el.dataset.pick);
      await setRecipients(keys);
      return;
    }
    if (el.matches('[data-type-select]') && el.value) { await switchType(el.value); return; }
    if (el.matches('[data-preview-key]')) { s.previewKey = el.value; paint.preview(); return; }
    if (el.matches('[data-bulk]')) { await addFiles([...el.files]); el.value = ''; return; }
    if (el.matches('[data-common]')) { await addFiles([...el.files], { common: true }); el.value = ''; return; }
    if (el.dataset.addFor) { await addFiles([...el.files], { key: el.dataset.addFor }); el.value = ''; return; }
    if (el.dataset.assign && el.value) {
      const id = el.dataset.assign;
      if (el.value === '__all') c.commonAttachments.push(id); else (c.perRecipient[el.value] ||= []).push(id);
      c.unassigned = c.unassigned.filter((x) => x !== id);
      await saveNow(); refresh();
      toast(el.value === '__all' ? 'Attached for everyone.' : `Attached for ${el.value}.`, 'ok', 3000);
    }
  });
  root.querySelector('[data-more]')?.addEventListener('toggle', (e) => { c.moreOpen = e.target.open; });

  function readField(el, changed = false) {
    const f = el.dataset.f;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (f.startsWith('field:')) {
      const k = f.slice(6);
      c.fields[k] = v;
      if (k === 'LetterTitle' && c.autoName) { c.name = v.trim() || c.name; const n = $('[data-name]'); if (n) n.value = c.name; }
      if (k === 'Message') { const cnt = root.querySelector('[data-count="Message"]'); if (cnt) cnt.textContent = `${v.length} characters`; }
    } else if (f === 'cc' || f === 'bcc') c[f] = splitAddresses(v);
    else if (f === 'referenceStart') c.referenceStart = Math.max(1, Number(v) || 1);
    else c[f] = v;
    if (f === 'referencePattern' || f === 'referenceStart' || f === 'date') { const ex = root.querySelector('[data-ref-example]'); if (ex) ex.textContent = referenceFor(c, c.recipients[0] || 'NUC', 0); }
    if ((f === 'cc' || f === 'bcc') && changed) {
      const bad = splitAddresses(v).filter((a) => !isEmail(a));
      if (bad.length) toast(`"${bad[0]}" is not an email address.`, 'warn', 6000);
    }
    saveSoon();
    later(changed || f === 'requireAttachment' ? ['preview', 'send', 'bar', 'files', 'files-count', 'to-list'] : ['preview', 'send', 'bar'], changed ? 0 : 300);
  }

  async function switchType(key) {
    if (key === c.templateKey) return;
    const tpl = app.state.templates.find((t) => t.key === key);
    if (!tpl) return;
    const hasOwnText = c.templateKind !== 'letterhead' && (String(c.bodyHtml || '').replace(/<[^>]+>/g, '').trim());
    if (hasOwnText && !(await confirmDialog('Replace the email text?', `"${tpl.name}" has its own wording. The subject and email text you wrote are replaced; the title, message and other details are kept.`, { submit: 'Replace' }))) return;
    c.templateKey = tpl.key;
    Object.assign(c, templateParts(tpl));
    await saveNow();
    toast(`Now: ${typeLabel(app, c)}.`, 'ok', 3000);
    app.render({ keepScroll: true });
  }

  /* ---------- files ---------- */
  async function addFiles(list, { key, common } = {}) {
    if (!list.length) return;
    s.filesBusy = `Adding ${list.length} file${list.length === 1 ? '' : 's'}…`; paint.files();
    const big = list.filter((f) => f.size > FLOW_LIMITS.maxAttachmentMb * 1048576);
    const ok = list.filter((f) => !big.includes(f));
    const stored = [];
    try {
      for (const [i, file] of ok.entries()) {
        s.filesBusy = `Adding ${i + 1} of ${ok.length}: ${file.name}`; paint.files();
        const data = await fileToBase64(file);
        const id = uid('f');
        const rec = await Store.putFile({ id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, data });
        Sync.share(app, rec);
        stored.push({ id, name: file.name });
      }
      await app.refreshFiles();
    } catch (err) {
      toast(`A file could not be added: ${err.message}`, 'bad');
    }
    s.filesBusy = '';
    const matched = [];
    if (common) c.commonAttachments.push(...stored.map((x) => x.id));
    else if (key) (c.perRecipient[key] ||= []).push(...stored.map((x) => x.id));
    else {
      for (const f of stored) {
        const k = c.recipients.filter((x) => fileMatchesKey(f.name, x)).sort((a, b) => b.length - a.length)[0];
        if (k) { (c.perRecipient[k] ||= []).push(f.id); matched.push(k); } else c.unassigned.push(f.id);
      }
    }
    await saveNow();
    refresh();
    if (big.length) toast(`${big.map((f) => f.name).join(', ')} ${big.length === 1 ? 'is' : 'are'} over ${FLOW_LIMITS.maxAttachmentMb} MB and cannot be emailed. Save a smaller copy (e.g. "Reduce file size").`, 'bad');
    if (common) toast(`${stored.length} file${stored.length === 1 ? '' : 's'} attached for everyone.`, 'ok', 3500);
    else if (key) toast(`${stored.length} file${stored.length === 1 ? '' : 's'} attached for ${key}.`, 'ok', 3500);
    else if (stored.length) {
      const unmatched = stored.length - matched.length;
      toast(`${matched.length} of ${stored.length} matched to addressees${unmatched ? `; ${unmatched} to assign by hand` : ''}.`, unmatched ? 'warn' : 'ok', 6000);
    }
  }

  const dz = root.querySelector('[data-drop]');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.querySelector('input').click(); } });

  /* ---------- clicks ---------- */
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.type) { await switchType(d.type); return; }
    if (d.unpick) { const keys = new Set(c.recipients); keys.delete(d.unpick); await setRecipients(keys, `${d.unpick} removed.`); return; }
    if (d.all !== undefined) {
      const keys = app.state.directory.filter((x) => (x.email || c.overrides[x.key]?._to) && x.active !== false && (!s.cat || x.category === s.cat)).map((x) => x.key);
      await setRecipients(new Set([...c.recipients, ...keys]), `${keys.length} addressee${keys.length === 1 ? '' : 's'} with an email address chosen${s.cat ? ` in ${s.cat}` : ''}.`);
      return;
    }
    if (d.none !== undefined) {
      if (c.recipients.length > 3 && !(await confirmDialog('Clear all addressees?', `Remove all ${c.recipients.length} from this letter? Their attached letters are kept and match again if you choose them.`, { submit: 'Clear' }))) return;
      for (const k of c.recipients) { c.unassigned.push(...(c.perRecipient[k] || [])); delete c.perRecipient[k]; }
      await setRecipients(new Set(), 'Cleared.');
      return;
    }
    if (d.addOpen !== undefined) { s.addOpen = !s.addOpen; paint['add-form'](); b.setAttribute('aria-expanded', String(s.addOpen)); if (s.addOpen) region('add-form').querySelector('input')?.focus(); return; }
    if (d.addClose !== undefined) { s.addOpen = false; paint['add-form'](); return; }
    if (d.addEmail) { await addEmail(d.addEmail); return; }
    if (d.custom) { await adjust(d.custom); return; }
    if (d.rmCommon) { c.commonAttachments = c.commonAttachments.filter((x) => x !== d.rmCommon); await saveNow(); refresh(); return; }
    if (d.rmUnassigned) { c.unassigned = c.unassigned.filter((x) => x !== d.rmUnassigned); await saveNow(); refresh(); return; }
    if (d.rmPer) { const [k, id] = d.rmPer.split('|'); c.perRecipient[k] = (c.perRecipient[k] || []).filter((x) => x !== id); await saveNow(); refresh(); toast(`Removed from ${k}.`, 'info', 2500); return; }
    if (d.goto) { goto(d.goto); return; }
    if (d.prev !== undefined || d.next !== undefined) {
      const keys = r.messages.map((m) => m.key);
      const i = keys.indexOf(s.previewKey);
      s.previewKey = keys[Math.max(0, Math.min(keys.length - 1, i + (d.next !== undefined ? 1 : -1)))] || s.previewKey;
      paint.preview();
      return;
    }
    if (d.previewAll !== undefined) { await previewAll(); return; }
    if (d.test !== undefined) { await sendTest(b); return; }
    if (d.check !== undefined) { startCheck(); return; }
    if (d.send !== undefined) { await startSend(); return; }
    if (d.retry !== undefined) { await startSend(true); return; }
    if (d.pause !== undefined) { Sender.pause(); return; }
    if (d.resume !== undefined) { Sender.resume(); return; }
    if (d.stop !== undefined) { Sender.stop(); toast('Stopping after the current email.', 'info', 4000); return; }
    if (d.csv !== undefined) { downloadCsv(); return; }
    if (d.report) { const id = d.report === 'dry' ? s.dry?.reportId : s.lastRun?.reportId; if (id) Reports.showById(id); return; }
    if (d.dup !== undefined) { const copy = await duplicateLetter(app, c); toast('Copied as a new draft.', 'ok', 4000); app.navigate(`#/letter/${copy.id}`); return; }
    if (d.delete !== undefined) {
      /* Not while it is being sent: stop the send first (the header's button is drawn once, so
         the state is read now, not from when the page was drawn). */
      if (Sender.busy() && Sender.run?.campaignId === c.id) { toast('This letter is being sent. Stop the send first, then delete it.', 'bad', 7000); return; }
      const gone = Object.values(c.results || {}).filter((x) => ['sent', 'duplicate'].includes(x?.status)).length;
      if (!(await confirmDialog(gone ? 'Delete this letter?' : 'Delete this draft?',
        gone ? `${gone} of its emails have already been sent; deleting removes its record of them from every device (the send log in SharePoint keeps them). This cannot be undone.` : 'It is deleted on every device. This cannot be undone.',
        { submit: 'Delete', danger: true }))) return;
      await app.deleteCampaign(c.id);
      toast('Draft deleted.', 'ok', 4000);
      app.navigate('#/');
    }
  });

  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-add-form]')) return;
    e.preventDefault();
    await addPerson(e.target);
  });

  /* Suggest a short code from the institution's initials as it is typed. */
  root.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-add-form] [name="institution"]')) return;
    const form = e.target.form;
    if (form.key.value) return;
    const initials = e.target.value.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|for|on|in)$/i.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 10);
    let k = initials || '';
    const used = new Set(app.state.directory.map((x) => x.key));
    if (k && used.has(k)) { let n = 2; while (used.has(`${k}${n}`)) n++; k = `${k}${n}`; }
    form.key.value = k;
  });

  async function addPerson(form) {
    const err = form.querySelector('[data-add-error]');
    const v = Object.fromEntries(new FormData(form).entries());
    const key = String(v.key || '').trim().toUpperCase();
    const email = String(v.email || '').trim();
    const allow = { suffixes: r.settings.allowedSuffixes || [], domains: r.settings.allowedDomains || [] };
    const problem = !String(v.institution).trim() ? 'Enter the institution.'
      : !String(v.addressee).trim() ? 'Enter how the letter is addressed.'
      : !isEmail(email) ? 'Enter a valid email address.'
      : !domainAllowed(email, allow) ? `${email} is outside the domains the mailer may send to (${allow.suffixes.join(', ')}). An administrator can allow more.`
      : !/^[A-Z0-9-]{2,24}$/.test(key) ? 'The short code needs 2 to 24 letters, digits or hyphens.'
      : app.state.directory.some((x) => x.key === key) ? `The code ${key} is already used. Choose another.` : '';
    if (problem) { err.textContent = problem; form.querySelector(problem.startsWith('Enter the inst') ? '[name=institution]' : problem.includes('addressed') ? '[name=addressee]' : problem.includes('code') ? '[name=key]' : '[name=email]').focus(); return; }
    const entry = { key, institution: String(v.institution).trim(), addressee: String(v.addressee).trim(), salutation: String(v.salutation || 'Sir/Madam').trim(), email, cc: [], website: '', verification: `Added by ${r.settings.operator?.email || 'an operator'} on ${new Date().toISOString().slice(0, 10)}`, category: String(v.category || '').trim(), notes: '', sortOrder: 99, active: true, caution: false };
    await app.saveDirectory([...app.state.directory, entry]);
    s.addOpen = false;
    paint['add-form']();
    await setRecipients(new Set([...c.recipients, key]), `${entry.institution} added and chosen.`);
  }

  async function addEmail(key) {
    const x = app.state.directory.find((y) => y.key === key);
    const v = await modal({ title: `Email address for ${x.institution}`, body: `<label class="field"><span>Email address</span><input name="email" type="email" required placeholder="name@agency.gov.ng"></label><p class="small muted">Saved in the shared addressee list.</p>`, submit: 'Save' });
    if (!v) return;
    if (!isEmail(v.email)) { toast('That is not an email address.', 'bad'); return; }
    await app.saveDirectory(app.state.directory.map((y) => (y.key === key ? { ...y, email: v.email.trim() } : y)));
    await setRecipients(new Set([...c.recipients, key]), `${key} now has an address and is chosen.`);
  }

  async function adjust(key) {
    const x = app.state.directory.find((y) => y.key === key);
    const ov = c.overrides[key] || {};
    const letterhead = c.templateKind === 'letterhead';
    const fields = [...(letterhead ? [['RecipientName', 'Greeting name', 'e.g. Dr. Aminu (replaces "Sir/Madam")']] : [['Salutation', 'Greeting', '']]), ['Addressee', 'Addressee line', ''], ['LetterTitle', 'Title for this one', ''], ['Message', 'Message for this one', '']];
    const v = await modal({
      title: `Adjust for ${key}`,
      wide: true,
      body: `<p class="muted small">Only for ${esc(x?.institution || key)}. Leave a field empty to use the letter's own.</p>
        <div class="form-grid">
          <label class="field span-2"><span>Send to instead <small>replaces ${esc(x?.email || 'no address')}</small></span><input name="_to" value="${esc(ov._to || '')}"></label>
          <label class="field span-2"><span>Also copy (Cc)</span><input name="_cc" value="${esc(ov._cc || '')}"></label>
          ${fields.map(([f, label, ph]) => `<label class="field ${f === 'Message' ? 'span-2' : ''}"><span>${esc(label)}</span>${f === 'Message' ? `<textarea name="${f}" rows="3">${esc(ov[f] || '')}</textarea>` : `<input name="${f}" value="${esc(ov[f] || '')}" placeholder="${esc(ph)}">`}</label>`).join('')}
        </div>`,
    });
    if (!v) return;
    for (const a of splitAddresses(v._to)) if (!isEmail(a)) { toast(`"${a}" is not an email address.`, 'bad'); return; }
    c.overrides[key] = Object.fromEntries(Object.entries(v).filter(([, y]) => String(y).trim() !== ''));
    await saveNow(); refresh();
    toast(Object.keys(c.overrides[key]).length ? `Adjusted for ${key}.` : `${key} uses the letter as written.`, 'ok', 3000);
  }

  function goto(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
    setTimeout(() => el.querySelector('input:not([type=hidden]):not([disabled]),textarea,button:not([disabled])')?.focus({ preventScroll: true }), 350);
  }

  async function previewAll() {
    if (!r.messages.length) return;
    let i = Math.max(0, r.messages.findIndex((m) => m.key === s.previewKey));
    const view = () => {
      const m = r.messages[i];
      return `<div class="preview-nav"><button type="button" class="btn btn-sm" data-pv="-1" ${i === 0 ? 'disabled' : ''}>‹ Previous</button><strong>${i + 1} of ${r.messages.length}: ${esc(m.key)}</strong><button type="button" class="btn btn-sm" data-pv="1" ${i === r.messages.length - 1 ? 'disabled' : ''}>Next ›</button></div>
        <dl class="meta"><dt>To</dt><dd>${esc(m.to.join(', '))}</dd>${m.cc.length ? `<dt>Cc</dt><dd>${esc(m.cc.join(', '))}</dd>` : ''}${m.bcc.length ? `<dt>Bcc</dt><dd>${esc(m.bcc.join(', '))}</dd>` : ''}
        <dt>Subject</dt><dd>${markMissing(esc(m.subject))}</dd><dt>Reference</dt><dd><code>${esc(m.reference)}</code></dd><dt>Attached</dt><dd>${m.attachments.map((a) => `${esc(a.name)} (${esc(fmtBytes(a.size))})`).join(', ') || '—'}</dd></dl>
        ${m.issues.length ? `<div class="callout callout-bad small">${m.issues.map(esc).join('<br>')}</div>` : m.warnings.length ? `<div class="callout callout-warn small">${m.warnings.map(esc).join('<br>')}</div>` : ''}
        ${previewFrame(markMissing(m.htmlBody), `The email to ${m.key}`)}`;
    };
    await modal({
      title: 'Every email, as it will arrive', wide: true, submit: '', cancel: 'Close', body: `<div data-pv-body>${view()}</div>`,
      onOpen: (dlg) => {
        dlg.addEventListener('click', (e) => { const b = e.target.closest('[data-pv]'); if (!b) return; i += Number(b.dataset.pv); dlg.querySelector('[data-pv-body]').innerHTML = view(); });
        dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' && i < r.messages.length - 1) { i++; dlg.querySelector('[data-pv-body]').innerHTML = view(); } if (e.key === 'ArrowLeft' && i > 0) { i--; dlg.querySelector('[data-pv-body]').innerHTML = view(); } });
      },
    });
  }

  async function sendTest(b) {
    const to = String(root.querySelector('[data-test-to]').value || '').trim();
    const key = root.querySelector('[data-test-key]').value;
    if (!isEmail(to)) { toast('Enter the address to send the test to.', 'bad'); root.querySelector('[data-test-to]').focus(); return; }
    await saveNow();
    b.disabled = true; b.innerHTML = '<span class="spinner"></span>Sending…';
    const report = Reports.begin(app, 'test', `${key} letter to ${to}`, { Mailing: `${c.name} (${c.id})`, 'Letter of': key, 'Sent to': to });
    try {
      const res = await Sender.test(app, c, key, to);
      (c.tests ||= []).unshift({ ...res, to, key });
      await saveNow();
      const ok = ['sent', 'duplicate', 'simulated'].includes(res.status);
      s.test = { ok, to, at: new Date().toISOString(), simulated: res.status === 'simulated', error: res.error || res.status };
      report.add(`Test to ${to}`, ok ? 'ok' : 'fail', ok ? `Sent. ${res.logItemId ? `Log entry #${res.logItemId}.` : ''}` : `${res.status}: ${res.error || ''}`);
      toast(ok ? (res.status === 'simulated' ? 'Test built. Practice mode: nothing emailed.' : `Test sent to ${to}. Check that inbox.`) : `The test was not sent: ${res.error || res.status}`, ok ? 'ok' : 'bad');
    } catch (err) {
      s.test = { ok: false, to, at: new Date().toISOString(), error: err.message };
      report.add(`Test to ${to}`, 'fail', err.message);
      toast(`The test was not sent: ${err.message}`, 'bad');
    }
    await report.finish('', { show: false });
    paint.send();
  }

  function startCheck() {
    s.dry = null;
    Sender.dryRun(app, c.id, { quiet: true }).then((rep) => {
      const n = rep.counts();
      const fails = rep.items.filter((i) => i.outcome === 'fail');
      s.dry = { at: new Date().toISOString(), total: rep.items.length, fail: n.fail, reportId: rep.id, firstFail: fails[0] ? `${fails[0].label}: ${fails[0].detail.split('\n')[0]}` : '' };
      toast(n.fail ? `${n.fail} email${n.fail === 1 ? '' : 's'} would not be sent. Nothing was sent.` : `All ${rep.items.length} would be sent. Nothing was sent.`, n.fail ? 'warn' : 'ok', 8000, { action: { label: 'Details', run: () => Reports.showById(rep.id) } });
      refresh(['send', 'bar', 'to-list']);
    }).catch((err) => toast(err.message, 'bad'));
    setTimeout(() => refresh(['send', 'bar']), 30);
  }

  async function startSend(retry = false) {
    await saveNow();
    r = readiness(app, c);
    const keys = retry ? Object.entries(c.results || {}).filter(([k, x]) => ['failed', 'refused'].includes(x.status) && c.recipients.includes(k)).map(([k]) => k) : undefined;
    const n = keys ? keys.length : r.sendable.length;
    if (!n) return;
    const bytes = r.messages.reduce((t, m) => t + m.attachmentBytes, 0);
    /* The letters leave from the mailbox DGO_MAIL_SEND sends from (its shared mailbox, or the
       account that owns its Outlook connection), never from the signed-in operator's. */
    let from = 'the mailbox of the send flow’s Outlook connection';
    if (r.live) {
      /* Asked for at most 8 seconds: the confirmation is not held up by a slow flow. */
      const h = await Promise.race([health(r.settings, 'MAIL_SEND').catch(() => null), new Promise((ok) => setTimeout(() => ok(null), 8000))]);
      const box = h?.res?.json?.data?.sharedMailbox;
      if (box) from = box;
    }
    const title = c.fields?.LetterTitle || c.subject || c.name;
    const ok = await modal({
      title: r.live ? `Send ${n} letter${n === 1 ? '' : 's'} now?` : `Practise sending ${n}?`,
      submit: r.live ? `Send ${n}` : 'Practise',
      body: `<dl class="meta"><dt>Letter</dt><dd>${esc(title)}</dd><dt>To</dt><dd>${n} addressee${n === 1 ? '' : 's'}${keys ? ' (the ones that failed)' : ''}</dd><dt>Attachments</dt><dd>${esc(fmtBytes(bytes))} in total</dd><dt>From</dt><dd>${esc(from)}</dd></dl>
        <p>${r.live ? 'Emails cannot be recalled once sent. Keep this page open until it finishes; you can pause or stop at any time.' : 'Practice mode: nothing is emailed.'}</p>`,
    });
    if (!ok) return;
    s.lastRun = null;
    Sender.start(app, c.id, { keys, quiet: true }).then((done) => {
      const res = Object.values(done.results || {});
      const sentN = (keys || done.recipients).filter((k) => ['sent', 'duplicate', 'simulated'].includes(done.results?.[k]?.status)).length;
      const failed = (keys || done.recipients).filter((k) => ['failed', 'refused'].includes(done.results?.[k]?.status)).length;
      s.lastRun = { at: new Date().toISOString(), sent: sentN, failed, live: r.live, reportId: Sender.run?.reportId, n: res.length };
      toast(failed ? `${sentN} sent, ${failed} failed. Each failed one says why.` : `${sentN} letter${sentN === 1 ? '' : 's'} ${r.live ? 'sent' : 'practised'}.`, failed ? 'warn' : 'ok', failed ? 15000 : 8000, { action: { label: 'Full report', run: () => Reports.showById(s.lastRun.reportId) } });
      if (location.hash === `#/letter/${c.id}`) refresh();
    }).catch((err) => { toast(err.message, 'bad'); refresh(); });
    setTimeout(() => { refresh(['send', 'bar', 'to-list']); goto('send'); }, 40);
  }

  function downloadCsv() {
    const rows = r.messages.map((m) => ({ key: m.key, institution: m.recipient?.institution || '', to: m.to.join('; '), reference: c.results?.[m.key]?.reference || m.reference, subject: m.subject, attachments: m.attachments.map((a) => a.name).join('; '), status: c.results?.[m.key]?.status || 'pending', at: c.results?.[m.key]?.at || '', error: c.results?.[m.key]?.error || '', logEntry: c.results?.[m.key]?.logItemId ?? '' }));
    download(`${(c.fields?.LetterTitle || c.name).replace(/[^\w-]+/g, '_').slice(0, 60)}-results.csv`, toCsv(rows, Object.keys(rows[0] || { key: '' })), 'text/csv');
    toast('Results downloaded.', 'ok', 3000);
  }

  /* Live progress of a send or check of this letter. */
  let pending = false;
  const unsub = Sender.on((run) => {
    if (!run || run.campaignId !== c.id || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; if (location.hash === `#/letter/${c.id}`) refresh(['send', 'bar', 'to-list', 'save']); });
  });

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(() => toast('Saved.', 'ok', 2000)); }
    if (e.key === 'Escape' && s.addOpen) { s.addOpen = false; paint['add-form'](); }
  };
  document.addEventListener('keydown', onKey);
  const ticker = setInterval(() => { if (!c._saving) paint.save(); }, 30000);

  if (c.templateKind !== 'letterhead') bindEditor(root, 'body', () => { c.bodyHtml = root.querySelector('[name="bodyHtml"]')?.value ?? c.bodyHtml; saveSoon(); later(['preview', 'send', 'bar']); });

  cleanup = () => {
    unsub();
    document.removeEventListener('keydown', onKey);
    clearInterval(ticker);
    if (saveTimer) { clearTimeout(saveTimer); delete c._saving; app.saveCampaign(c); }
  };

  refresh();
  if (section) setTimeout(() => goto(section), 60);
  else if (!c.recipients.length && !c.fields?.LetterTitle) setTimeout(() => root.querySelector('[data-q]')?.focus({ preventScroll: true }), 50);
}

