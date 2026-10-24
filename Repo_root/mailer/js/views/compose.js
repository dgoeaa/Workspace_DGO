// The mailing wizard: Letter → Recipients → Attachments → Review → Send.
// Every change is saved to the campaign as it is made, so a draft survives a reload.

import { esc, uid, fmtBytes, fmtDateTime, fileToBase64, fileMatchesKey, toCsv, download, splitAddresses, isEmail } from '../util.js';
import { modal, toast, confirmDialog, badge, statusBadge, previewFrame, empty } from '../ui.js';
import { editorHtml, bindEditor } from '../editor.js';
import { markMissing } from '../merge.js';
import { newCampaign, buildMessages, campaignFieldNames, referenceFor, IMPORTANCE, tally, sendRequest, templateParts } from '../campaign.js';
import { letterheadTemplate } from '../letterhead.js';
import { effective, isLive } from '../settings.js';
import { Store } from '../store.js';
import { Sender } from '../sender.js';
import { Reports } from '../reports.js';
import { Sync } from '../sync.js';
import { STANDARD_FIELDS } from './templates.js';

const STEPS = [
  ['letter', '1 · Letter'],
  ['recipients', '2 · Recipients'],
  ['attachments', '3 · Attachments'],
  ['review', '4 · Review'],
  ['send', '5 · Send'],
];

let unsubscribe = null;

/** Template options, grouped the way the Templates page groups them. */
const templateOptions = (templates, selected) => [['letterhead', 'Agency letterhead (internal platform)'], ['html', 'Mailer templates']]
  .map(([kind, label]) => {
    const group = templates.filter((t) => (t.kind === 'letterhead') === (kind === 'letterhead'));
    return group.length ? `<optgroup label="${esc(label)}">${group.map((t) => `<option value="${esc(t.key)}" ${t.key === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');

const LETTERHEAD_FIELD_LABELS = {
  ActionRequired: ['Action required', 'optional — adds the "Action required:" paragraph'],
  DueDate: ['Respond by', 'optional — e.g. 9 October 2026; adds the "on or before" paragraph'],
  AttachmentSummary: ['Attachment reference(s)', 'optional — leave empty to list the files you attach'],
};
let saveTimer = null;
let recipientFilter = '';

const debounceSave = (app, c, ms = 400) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => app.saveCampaign(c), ms);
};

export async function render(app, params) {
  unsubscribe?.();
  unsubscribe = null;
  const [id, step = 'letter'] = params;
  if (!id) return renderStart(app);
  const c = app.state.campaigns.find((x) => x.id === id);
  if (!c) return { title: 'Mailing', html: empty('Mailing not found', 'It may have been deleted in another tab.', '<a class="btn" href="#/compose">Back</a>') };

  const settings = effective(app.state.settings);
  const messages = buildMessages({ campaign: c, directory: app.state.directory, settings, files: app.state.fileIndex });
  const blocking = messages.filter((m) => m.issues.length).length;
  const locked = c.status !== 'draft' && Object.values(c.results || {}).some((r) => ['sent', 'duplicate'].includes(r.status));

  const nav = `<nav class="steps" aria-label="Steps">${STEPS.map(([k, label]) => `<a href="#/compose/${esc(c.id)}/${k}" class="${k === step ? 'active' : ''}" ${k === step ? 'aria-current="step"' : ''}>${esc(label)}${k === 'review' && blocking ? ` <span class="dot-bad" title="${blocking} message(s) need attention">${blocking}</span>` : ''}</a>`).join('')}</nav>`;

  const head = `
    <section class="page-head">
      <div><h1>${esc(c.name)}</h1>
      <p class="lede">${c.recipients.length} recipient(s) · ${esc(c.status)}${locked ? ' · some messages already sent — edits apply only to messages not yet sent' : ''}</p></div>
      <div class="actions"><a class="btn" href="#/outbox/${esc(c.id)}">Results</a></div>
    </section>${nav}`;

  const views = { letter: stepLetter, recipients: stepRecipients, attachments: stepAttachments, review: stepReview, send: stepSend };
  const out = await (views[step] || stepLetter)(app, c, messages, settings);
  return { title: c.name, html: head + out.html, bind: out.bind };
}

/* ------------------------------------------------------------------ */

function renderStart(app) {
  const drafts = app.state.campaigns.filter((c) => c.status !== 'done');
  const html = `
    <section class="page-head"><div><h1>New mailing</h1>
      <p class="lede">One letter, many addressees — each email personalised, each with its own attachments.</p></div></section>
    <form class="panel" data-start>
      <div class="form-grid">
        <label class="field span-2"><span>Start from template</span>
          <select name="template" class="input">${templateOptions(app.state.templates, 'cover-letter')}</select></label>
        <label class="field span-2"><span>Mailing name <small>(for your records)</small></span><input name="name" placeholder="e.g. Cybersecurity framework letters — September"></label>
      </div>
      <button class="btn btn-primary" type="submit">Start mailing</button>
    </form>
    ${drafts.length ? `<section class="panel"><h2>Continue</h2><table class="table"><thead><tr><th>Mailing</th><th>Status</th><th>Updated</th></tr></thead><tbody>
      ${drafts.map((c) => { const t = tally(c); return `<tr><td><a href="#/compose/${esc(c.id)}">${esc(c.name)}</a></td><td>${esc(c.status)} · ${t.sent}/${t.total} sent</td><td class="muted">${esc(fmtDateTime(c.updatedAt))}</td></tr>`; }).join('')}
    </tbody></table></section>` : ''}`;
  const bind = (root) => {
    root.querySelector('[data-start]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const tpl = app.state.templates.find((t) => t.key === f.template.value);
      const c = newCampaign(tpl, app.state.settings);
      if (f.name.value.trim()) c.name = f.name.value.trim();
      await app.saveCampaign(c);
      app.navigate(`#/compose/${c.id}/letter`);
    });
  };
  return { title: 'New mailing', html, bind };
}

/* ------------------------------------------------------------------ */

function stepLetter(app, c, messages) {
  const letterhead = c.templateKind === 'letterhead';
  const lt = letterhead ? letterheadTemplate(c.letterheadId) : null;
  const custom = campaignFieldNames(c).filter((f) => !['LetterTitle', 'Message'].includes(f));
  const chips = [...new Set([...STANDARD_FIELDS, ...custom])];
  const input = (f, label, hint, attrs = '') => `<label class="field ${f === 'AttachmentSummary' ? 'span-2' : ''}"><span>${esc(label)} <small>${esc(hint)}</small></span><input name="field:${esc(f)}" value="${esc(c.fields[f] || '')}" ${attrs}></label>`;
  const bodyFields = letterhead ? `
        <div class="callout span-2"><strong>${esc(lt?.label || 'Agency letterhead')}</strong> — the internal platform's template on the Agency letterhead. Its layout and wording are fixed. You supply the title and the message, and each addressee's letter is built from the directory.</div>
        <label class="field span-2"><span>Letter title <small>shown as the heading and in the subject</small></span><input name="field:LetterTitle" value="${esc(c.fields.LetterTitle || '')}" placeholder="e.g. Adoption of the National Data Exchange Framework" required></label>
        <label class="field span-2"><span>Message <small>the body of the letter; line breaks are kept</small></span><textarea name="field:Message" rows="8" required>${esc(c.fields.Message || '')}</textarea></label>
        ${custom.map((f) => input(f, ...(LETTERHEAD_FIELD_LABELS[f] || [f, '']))).join('')}
        <label class="field"><span>Classification</span><select name="field:Classification" class="input">${['Official', 'Confidential', 'Restricted'].map((x) => `<option ${x === (c.fields.Classification || 'Official') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`
    : `
        <label class="field span-2"><span>Letter title / subject line <small>{{LetterTitle}}</small></span><input name="field:LetterTitle" value="${esc(c.fields.LetterTitle || '')}" placeholder="e.g. REQUEST FOR NOMINATION OF FOCAL PERSONS ON …"></label>
        <label class="field span-2"><span>Message paragraph <small>{{Message?}} — optional; plain text, line breaks kept</small></span><textarea name="field:Message" rows="4">${esc(c.fields.Message || '')}</textarea></label>
        ${custom.map((f) => `<label class="field"><span>${esc(f)} <small>{{${esc(f)}}}</small></span><input name="field:${esc(f)}" value="${esc(c.fields[f] || '')}"></label>`).join('')}`;
  const sample = letterhead ? messages[0] || buildMessages({ campaign: { ...c, recipients: [app.state.directory.find((r) => r.email)?.key].filter(Boolean) }, directory: app.state.directory, settings: effective(app.state.settings), files: app.state.fileIndex })[0] : null;

  const html = `
    <form class="panel" data-letter>
      <div class="form-grid">
        <label class="field span-2"><span>Mailing name</span><input name="name" value="${esc(c.name)}"></label>
        <label class="field span-2"><span>Template</span>
          <span class="inline-row"><select name="templateKey" class="input">${templateOptions(app.state.templates, c.templateKey)}</select>
          <button type="button" class="btn" data-apply-template>Use this template</button></span></label>
        ${bodyFields}
        <label class="field"><span>Letter date</span><input type="date" name="date" value="${esc(c.date)}"></label>
        <label class="field"><span>${letterhead ? 'Importance <small>shown as the priority</small>' : 'Importance'}</span><select name="importance" class="input">${IMPORTANCE.map((i) => `<option ${i === c.importance ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
        <label class="field"><span>Reference pattern <small>{{Key}} {{Year}} {{Month}} {{Seq}}</small></span><input name="referencePattern" value="${esc(c.referencePattern)}"></label>
        <label class="field"><span>First sequence number</span><input type="number" min="1" name="referenceStart" value="${esc(c.referenceStart)}"></label>
        <label class="field span-2"><span>Copy every message to (Cc)</span><input name="cc" value="${esc(c.cc.join(', '))}" placeholder="optional, comma-separated"></label>
        <label class="field span-2"><span>Blind copy every message to (Bcc)</span><input name="bcc" value="${esc(c.bcc.join(', '))}" placeholder="optional — e.g. the registry mailbox, for the file copy"></label>
        <div class="field span-2 checks"><label><input type="checkbox" name="requireAttachment" ${c.requireAttachment ? 'checked' : ''}> Every message must carry an attachment (the signed letter)</label></div>
        ${letterhead ? '' : `<label class="field span-2"><span>Email subject</span><input name="subject" value="${esc(c.subject)}"></label>`}
      </div>
      ${letterhead ? `<h3>How it looks — ${esc(sample?.key || 'sample')}</h3><div class="preview-meta" data-lh-subject><strong>Subject:</strong> ${esc(sample?.subject || '')}</div><div data-lh-preview>${sample ? previewFrame(sample.htmlBody) : ''}</div>`
        : `<div class="field"><span>Email body</span>${editorHtml({ id: 'body', name: 'bodyHtml', value: c.bodyHtml, fields: chips })}</div>`}
      <p class="muted small">Example reference: <code data-ref-sample>${esc(referenceFor(c, c.recipients[0] || 'NUC', 0))}</code></p>
      <div class="form-actions"><a class="btn btn-primary" href="#/compose/${esc(c.id)}/recipients">Next: recipients →</a></div>
    </form>`;

  const bind = (root) => {
    const form = root.querySelector('[data-letter]');
    let previewTimer = null;
    const refreshPreview = () => {
      if (!letterhead) return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        const keys = c.recipients.length ? [c.recipients[0]] : [app.state.directory.find((r) => r.email)?.key].filter(Boolean);
        const [m] = buildMessages({ campaign: { ...c, recipients: keys }, directory: app.state.directory, settings: effective(app.state.settings), files: app.state.fileIndex });
        if (!m) return;
        root.querySelector('[data-lh-subject]').innerHTML = `<strong>Subject:</strong> ${esc(m.subject)}`;
        root.querySelector('[data-lh-preview]').innerHTML = previewFrame(m.htmlBody);
      }, 350);
    };
    const read = () => {
      c.name = form.name.value.trim() || c.name;
      if (!letterhead) {
        c.subject = form.subject.value;
        c.bodyHtml = form.bodyHtml.value;
      }
      c.date = form.date.value || c.date;
      c.importance = form.importance.value;
      c.referencePattern = form.referencePattern.value;
      c.referenceStart = Number(form.referenceStart.value) || 1;
      c.cc = splitAddresses(form.cc.value);
      c.bcc = splitAddresses(form.bcc.value);
      c.requireAttachment = form.requireAttachment.checked;
      for (const el of form.querySelectorAll('[name^="field:"]')) c.fields[el.name.slice(6)] = el.value;
      root.querySelector('[data-ref-sample]').textContent = referenceFor(c, c.recipients[0] || 'NUC', 0);
      debounceSave(app, c);
      refreshPreview();
    };
    form.addEventListener('input', read);
    form.addEventListener('change', read);
    if (!letterhead) bindEditor(root, 'body', read);
    form.addEventListener('submit', (e) => e.preventDefault());
    root.querySelector('[data-apply-template]').addEventListener('click', async () => {
      const tpl = app.state.templates.find((t) => t.key === form.templateKey.value);
      if (!tpl) return;
      const hasOwnText = c.templateKind !== 'letterhead' && (c.subject || c.bodyHtml);
      if (hasOwnText && !(await confirmDialog('Replace subject and body?', `Replace this mailing's subject and body with "${tpl.name}"? Field values you have entered are kept.`, { submit: 'Replace' }))) return;
      c.templateKey = tpl.key;
      Object.assign(c, templateParts(tpl));
      await app.saveCampaign(c);
      app.render();
    });
  };
  return { html, bind };
}

/* ------------------------------------------------------------------ */

function stepRecipients(app, c, messages) {
  const byKey = new Map(messages.map((m) => [m.key, m]));
  const selected = new Set(c.recipients);
  const q = recipientFilter.toLowerCase();
  const rows = app.state.directory.filter((r) => !q || [r.key, r.institution, r.addressee, r.category].join(' ').toLowerCase().includes(q));
  const cats = [...new Set(app.state.directory.map((r) => r.category).filter(Boolean))].sort();

  const html = `
    <section class="panel">
      <div class="toolbar">
        <input type="search" class="input" placeholder="Filter" value="${esc(recipientFilter)}" data-rfilter aria-label="Filter recipients">
        <button class="btn btn-sm" data-sel="ready">Select all ready</button>
        <button class="btn btn-sm" data-sel="none">Clear</button>
        <select class="input" data-sel-cat aria-label="Add a category"><option value="">Add a category…</option>${cats.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
        <span class="spacer"></span><strong>${c.recipients.length} selected</strong>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th><span class="sr-only">Select</span></th><th>Institution</th><th>To</th><th>Reference</th><th><span class="sr-only">Customise</span></th></tr></thead>
        <tbody>${rows.map((r) => {
          const on = selected.has(r.key);
          const m = byKey.get(r.key);
          const ov = c.overrides[r.key] || {};
          const disabled = !r.email && !ov._to;
          return `<tr class="${on ? 'row-on' : ''}">
            <td><input type="checkbox" data-pick="${esc(r.key)}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="Select ${esc(r.key)}"></td>
            <td><strong>${esc(r.key)}</strong> — ${esc(r.institution)}<div class="small">${esc(ov.Addressee || r.addressee)}</div>
              ${r.caution ? `<div class="small warn-text">⚠ ${esc(r.notes || r.verification)}</div>` : ''}
              ${disabled ? '<div class="small bad-text">No verified address — add one in the Directory or customise “To”.</div>' : ''}</td>
            <td class="small">${esc(ov._to || r.email || '—')}${(r.cc || []).length || ov._cc ? `<div class="muted">cc ${esc([...(r.cc || []), ...splitAddresses(ov._cc)].join(', '))}</div>` : ''}</td>
            <td class="small"><code>${esc(m?.reference || referenceFor(c, r.key, 0))}</code></td>
            <td><button class="btn btn-sm" data-custom="${esc(r.key)}">Customise${Object.values(ov).some((v) => String(v || '').trim()) ? ' •' : ''}</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>
      <div class="form-actions"><a class="btn" href="#/compose/${esc(c.id)}/letter">← Letter</a><a class="btn btn-primary" href="#/compose/${esc(c.id)}/attachments">Next: attachments →</a></div>
    </section>`;

  const order = (keys) => app.state.directory.map((r) => r.key).filter((k) => keys.has(k));
  const bind = (root) => {
    root.querySelector('[data-rfilter]').addEventListener('input', (e) => {
      recipientFilter = e.target.value;
      const pos = e.target.selectionStart;
      app.render().then(() => { const el = document.querySelector('[data-rfilter]'); el?.focus(); try { el.setSelectionRange(pos, pos); } catch { /* */ } });
    });
    root.addEventListener('change', async (e) => {
      if (e.target.dataset.pick) {
        const s = new Set(c.recipients);
        if (e.target.checked) s.add(e.target.dataset.pick); else s.delete(e.target.dataset.pick);
        c.recipients = order(s);
        await app.saveCampaign(c); app.render();
      }
      if (e.target.matches('[data-sel-cat]') && e.target.value) {
        const s = new Set(c.recipients);
        app.state.directory.filter((r) => r.category === e.target.value && r.email && r.active !== false).forEach((r) => s.add(r.key));
        c.recipients = order(s);
        await app.saveCampaign(c); app.render();
      }
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.sel === 'ready') { c.recipients = order(new Set(app.state.directory.filter((r) => r.email && r.active !== false).map((r) => r.key))); await app.saveCampaign(c); app.render(); }
      if (b.dataset.sel === 'none') { c.recipients = []; await app.saveCampaign(c); app.render(); }
      if (b.dataset.custom) {
        const key = b.dataset.custom;
        const r = app.state.directory.find((x) => x.key === key);
        const ov = c.overrides[key] || {};
        const fields = [...(c.templateKind === 'letterhead' ? ['RecipientName'] : []), 'Addressee', 'Salutation', 'Reference', 'LetterTitle', 'Message', ...campaignFieldNames(c).filter((f) => !['LetterTitle', 'Message'].includes(f))];
        const v = await modal({
          title: `Customise for ${key}`,
          wide: true,
          body: `<p class="muted">Leave a field empty to use the mailing's value. These apply to ${esc(r.institution)} only.</p>
            <div class="form-grid">
              <label class="field span-2"><span>To <small>(replaces ${esc(r.email || 'no address')})</small></span><input name="_to" value="${esc(ov._to || '')}"></label>
              <label class="field span-2"><span>Additional Cc</span><input name="_cc" value="${esc(ov._cc || '')}"></label>
              ${fields.map((f) => `<label class="field ${f === 'Message' ? 'span-2' : ''}"><span>${esc(f)}</span>${f === 'Message' ? `<textarea name="${esc(f)}" rows="3">${esc(ov[f] || '')}</textarea>` : `<input name="${esc(f)}" value="${esc(ov[f] || '')}">`}</label>`).join('')}
            </div>`,
        });
        if (!v) return;
        for (const a of splitAddresses(v._to)) if (!isEmail(a)) { toast(`"${a}" is not an email address.`, 'bad'); return; }
        c.overrides[key] = Object.fromEntries(Object.entries(v).filter(([, x]) => String(x).trim() !== ''));
        if (v._to && !c.recipients.includes(key)) c.recipients = order(new Set([...c.recipients, key]));
        await app.saveCampaign(c); app.render();
      }
    });
  };
  return { html, bind };
}

/* ------------------------------------------------------------------ */

async function storeFiles(app, fileList) {
  const ids = [];
  for (const file of fileList) {
    const data = await fileToBase64(file);
    const id = uid('f');
    const rec = await Store.putFile({ id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, data });
    Sync.share(app, rec);
    ids.push({ id, name: file.name });
  }
  await app.refreshFiles();
  return ids;
}

function chip(app, id, removeAttr) {
  const f = app.state.fileIndex[id];
  return `<span class="file-chip ${f ? '' : 'file-missing'}">📎 ${esc(f?.name || 'missing file')} <span class="muted">${esc(fmtBytes(f?.size))}</span><button type="button" class="icon-btn" ${removeAttr} aria-label="Remove ${esc(f?.name || 'file')}">✕</button></span>`;
}

function stepAttachments(app, c, messages) {
  const unassigned = c.unassigned || [];
  const html = `
    <section class="panel">
      <h2>For every addressee</h2>
      <p class="muted">Files attached to every message — e.g. an enclosure common to all.</p>
      <div class="chips">${c.commonAttachments.map((id) => chip(app, id, `data-rm-common="${esc(id)}"`)).join('') || '<span class="muted">None.</span>'}</div>
      <label class="btn">＋ Add common file<input type="file" multiple hidden data-common></label>
    </section>

    <section class="panel">
      <h2>Individually addressed letters</h2>
      <p class="muted">Drop the signed letters here. Each is matched to its addressee by the key in its file name —
        <code>NUC_Letter.pdf</code>, <code>Letter-NPF-NCCC.pdf</code> and <code>CBN.pdf</code> all match. Anything unmatched is listed for you to assign.</p>
      <label class="dropzone" data-drop>
        <input type="file" multiple hidden data-bulk>
        <span><strong>Choose files</strong> or drop them here</span>
      </label>
      ${unassigned.length ? `<div class="callout callout-warn"><strong>Not matched to anyone:</strong>
        ${unassigned.map((id) => `<div class="inline-row">${chip(app, id, `data-rm-unassigned="${esc(id)}"`)}
          <select class="input" data-assign="${esc(id)}"><option value="">Assign to…</option>${c.recipients.map((k) => `<option>${esc(k)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Recipient</th><th>Attachments</th><th>Total</th><th><span class="sr-only">Add</span></th></tr></thead>
        <tbody>${messages.map((m) => `<tr>
          <td><strong>${esc(m.key)}</strong><div class="small muted">${esc(m.recipient?.institution || '')}</div></td>
          <td><div class="chips">${(c.perRecipient[m.key] || []).map((id) => chip(app, id, `data-rm-per="${esc(m.key)}|${esc(id)}"`)).join('') || (c.requireAttachment && !c.commonAttachments.length ? '<span class="bad-text small">No letter yet</span>' : '<span class="muted small">—</span>')}</div></td>
          <td class="small">${esc(fmtBytes(m.attachmentBytes))}</td>
          <td><label class="btn btn-sm">＋<input type="file" multiple hidden data-add-for="${esc(m.key)}"></label></td>
        </tr>`).join('') || '<tr><td colspan="4" class="muted">Select recipients first.</td></tr>'}</tbody>
      </table></div>
      <div class="form-actions"><a class="btn" href="#/compose/${esc(c.id)}/recipients">← Recipients</a><a class="btn btn-primary" href="#/compose/${esc(c.id)}/review">Next: review →</a></div>
    </section>`;

  const bind = (root) => {
    const bulk = async (files) => {
      if (!files.length) return;
      const stored = await storeFiles(app, files);
      const matched = [];
      c.unassigned ||= [];
      for (const s of stored) {
        const keys = c.recipients.filter((k) => fileMatchesKey(s.name, k));
        /* The longest key wins: "NPF-NCCC_letter.pdf" names NPF-NCCC even if a key "NPF" existed. */
        const key = keys.sort((a, b) => b.length - a.length)[0];
        if (key) { (c.perRecipient[key] ||= []).push(s.id); matched.push(`${s.name} → ${key}`); }
        else c.unassigned.push(s.id);
      }
      await app.saveCampaign(c);
      toast(`${matched.length} matched${stored.length - matched.length ? `, ${stored.length - matched.length} to assign` : ''}.`, matched.length === stored.length ? 'ok' : 'warn', 6000);
      app.render();
    };
    root.querySelector('[data-bulk]').addEventListener('change', (e) => bulk([...e.target.files]));
    const dz = root.querySelector('[data-drop]');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); bulk([...e.dataTransfer.files]); });

    root.querySelector('[data-common]').addEventListener('change', async (e) => {
      const stored = await storeFiles(app, [...e.target.files]);
      c.commonAttachments.push(...stored.map((s) => s.id));
      await app.saveCampaign(c); app.render();
    });
    root.querySelectorAll('[data-add-for]').forEach((inp) => inp.addEventListener('change', async (e) => {
      const stored = await storeFiles(app, [...e.target.files]);
      (c.perRecipient[inp.dataset.addFor] ||= []).push(...stored.map((s) => s.id));
      await app.saveCampaign(c); app.render();
    }));
    root.querySelectorAll('[data-assign]').forEach((sel) => sel.addEventListener('change', async () => {
      if (!sel.value) return;
      (c.perRecipient[sel.value] ||= []).push(sel.dataset.assign);
      c.unassigned = c.unassigned.filter((x) => x !== sel.dataset.assign);
      await app.saveCampaign(c); app.render();
    }));
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rmCommon) c.commonAttachments = c.commonAttachments.filter((x) => x !== b.dataset.rmCommon);
      else if (b.dataset.rmUnassigned) c.unassigned = c.unassigned.filter((x) => x !== b.dataset.rmUnassigned);
      else if (b.dataset.rmPer) { const [k, id] = b.dataset.rmPer.split('|'); c.perRecipient[k] = (c.perRecipient[k] || []).filter((x) => x !== id); }
      else return;
      await app.saveCampaign(c); app.render();
    });
  };
  return { html, bind };
}

/* ------------------------------------------------------------------ */

function stepReview(app, c, messages, settings) {
  const blocking = messages.filter((m) => m.issues.length);
  const testTo = settings.testAddress || settings.operator?.email || '';
  const live = isLive(settings);

  const html = `
    <section class="panel">
      <div class="stats stats-inline">
        <div class="stat"><div class="stat-num">${messages.length}</div><div class="stat-label">messages</div></div>
        <div class="stat"><div class="stat-num ${blocking.length ? 'bad-text' : ''}">${blocking.length}</div><div class="stat-label">need attention</div></div>
        <div class="stat"><div class="stat-num">${esc(fmtBytes(messages.reduce((n, m) => n + m.attachmentBytes, 0)))}</div><div class="stat-label">attachments in total</div></div>
      </div>
      ${blocking.length ? '<div class="callout callout-bad">Messages with a problem are not sent. Fix them, or remove those recipients.</div>' : messages.length ? '<div class="callout callout-ok">Every message is complete.</div>' : ''}
      <div class="checks-panel">
        <div class="check-card">
          <h3>Send a test</h3>
          <p class="small muted">Sends one addressee's letter, exactly as built, to your own address instead of theirs. The subject is marked [TEST] and the letter's real attachments are included. Nothing goes to the institution.</p>
          <div class="toolbar">
            <label class="inline-field">Letter for <select class="input" data-test-key ${messages.length ? '' : 'disabled'}>${messages.map((m) => `<option value="${esc(m.key)}">${esc(m.key)}</option>`).join('')}</select></label>
            <label class="inline-field">to <input class="input" data-test-to type="email" value="${esc(testTo)}" placeholder="you@nitda.gov.ng"></label>
            <button class="btn" data-test ${messages.length ? '' : 'disabled'}>${live ? 'Send test' : 'Build test (simulation)'}</button>
          </div>
        </div>
        <div class="check-card">
          <h3>Dry run</h3>
          <p class="small muted">${live ? 'Runs every message through the send flow in check-only mode. The flow applies every check of a real send (key, allowed domains, recipients, subject, body, attachments) and stops before sending. Nothing is sent or logged.' : 'MAIL_SEND is not wired, so the dry run applies the mailer\'s own checks only.'} You get a report with one line per message.</p>
          <div class="toolbar"><button class="btn" data-dryrun ${messages.length && !Sender.busy() ? '' : 'disabled'}>Dry run ${messages.length} message(s)</button></div>
        </div>
      </div>
      <div class="toolbar"><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-export-json>Export payloads (no file content)</button></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Recipient</th><th>Subject &amp; reference</th><th>Attachments</th><th>Checks</th><th><span class="sr-only">Preview</span></th></tr></thead>
        <tbody>${messages.map((m) => `<tr>
          <td><strong>${esc(m.key)}</strong><div class="small">${esc(m.to.join(', '))}</div>${m.cc.length ? `<div class="small muted">cc ${esc(m.cc.join(', '))}</div>` : ''}${m.bcc.length ? `<div class="small muted">bcc ${esc(m.bcc.join(', '))}</div>` : ''}</td>
          <td class="small">${markMissing(esc(m.subject))}<div><code>${esc(m.reference)}</code></div></td>
          <td class="small">${m.attachments.map((a) => esc(a.name)).join('<br>') || '—'}</td>
          <td class="small">${m.issues.map((i) => `<div class="bad-text">✕ ${esc(i)}</div>`).join('')}${m.warnings.map((w) => `<div class="warn-text">⚠ ${esc(w)}</div>`).join('')}${!m.issues.length ? '<div class="ok-text">✓ Ready</div>' : ''}</td>
          <td><button class="btn btn-sm" data-preview="${esc(m.key)}">Preview</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">No recipients selected.</td></tr>'}</tbody>
      </table></div>
      <div class="form-actions"><a class="btn" href="#/compose/${esc(c.id)}/attachments">← Attachments</a><a class="btn btn-primary" href="#/compose/${esc(c.id)}/send">Next: send →</a></div>
    </section>`;

  const bind = (root) => {
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.preview) {
        const m = messages.find((x) => x.key === b.dataset.preview);
        await modal({
          title: `Preview — ${m.key}`, wide: true, submit: '', cancel: 'Close',
          body: `<dl class="meta"><dt>To</dt><dd>${esc(m.to.join(', '))}</dd>${m.cc.length ? `<dt>Cc</dt><dd>${esc(m.cc.join(', '))}</dd>` : ''}${m.bcc.length ? `<dt>Bcc</dt><dd>${esc(m.bcc.join(', '))}</dd>` : ''}
            <dt>Subject</dt><dd>${markMissing(esc(m.subject))}</dd><dt>Attachments</dt><dd>${m.attachments.map((a) => `${esc(a.name)} (${esc(fmtBytes(a.size))})`).join(', ') || '—'}</dd></dl>
            ${previewFrame(markMissing(m.htmlBody))}`,
        });
      }
      if (b.dataset.test !== undefined) {
        const to = root.querySelector('[data-test-to]').value.trim();
        const key = root.querySelector('[data-test-key]').value;
        if (!isEmail(to)) { toast('Enter a test address.', 'bad'); return; }
        const m = messages.find((x) => x.key === key);
        b.disabled = true; b.textContent = 'Sending test…';
        const report = Reports.begin(app, 'test', `${key} letter to ${to}`, {
          Mode: live ? 'Live — sent through DGO_MAIL_SEND' : 'Simulation — nothing transmitted',
          Mailing: `${c.name} (${c.id})`,
          'Letter of': `${key} — ${m?.recipient?.institution || ''}`,
          'Sent to': `${to} (instead of ${m?.to.join(', ') || '—'})`,
        });
        try {
          const r = await Sender.test(app, c, key, to);
          (c.tests ||= []).unshift({ ...r, to, key });
          await app.saveCampaign(c);
          const detail = [`Subject: [TEST — not sent to ${m?.recipient?.institution}] ${m?.subject}`, `Reference ${m?.reference}`,
            `Attachments: ${m?.attachments.map((a) => `${a.name} (${fmtBytes(a.size)})`).join(', ') || 'none'}`,
            r.logItemId ? `Log entry #${r.logItemId}` : '', r.runId ? `Flow run ${r.runId}` : ''].filter(Boolean).join('\n');
          if (r.status === 'sent' || r.status === 'duplicate') report.add(`Test to ${to}`, 'ok', `Sent. Check the inbox of ${to}.\n${detail}`);
          else if (r.status === 'simulated') report.add(`Test to ${to}`, 'info', `Built but not sent: MAIL_SEND is not wired.\n${detail}`);
          else report.add(`Test to ${to}`, 'fail', `${r.status}: ${r.error}\n${detail}`);
        } catch (err) { report.add(`Test to ${to}`, 'fail', err.message); }
        await report.finish();
        b.disabled = false; b.textContent = live ? 'Send test' : 'Build test (simulation)';
      }
      if (b.dataset.dryrun !== undefined) {
        Sender.dryRun(app, c.id).catch((err) => toast(err.message, 'bad'));
        setTimeout(() => app.navigate(`#/compose/${c.id}/send`), 30);
      }
      if (b.dataset.exportJson !== undefined) {
        const payloads = messages.map((m) => sendRequest(m, { campaign: c, settings: { ...settings, operatorKey: '' }, requestId: '(assigned at send)' }));
        download(`${c.id}-payloads.json`, JSON.stringify(payloads, null, 2), 'application/json');
      }
    });
  };
  return { html, bind };
}

/* ------------------------------------------------------------------ */

function stepSend(app, c, messages, settings) {
  const live = isLive(settings);
  const run = Sender.run;
  const mine = run && run.campaignId === c.id;
  const busyElsewhere = Sender.busy() && !mine;
  const t = tally(c);
  const ready = messages.filter((m) => !m.issues.length);
  const outstanding = messages.filter((m) => !['sent', 'duplicate'].includes(c.results?.[m.key]?.status) && !(live ? false : c.results?.[m.key]?.status === 'simulated'));
  const failed = messages.filter((m) => ['failed', 'refused', 'skipped'].includes(c.results?.[m.key]?.status));
  const pct = mine && run.total ? Math.round((run.index / run.total) * 100) : 0;

  const html = `
    <section class="panel">
      ${live ? `<div class="callout callout-ok"><strong>Live.</strong> Messages go to the real addressees through DGO_MAIL_SEND.</div>`
        : `<div class="callout callout-warn"><strong>Simulation.</strong> MAIL_SEND is not wired: this rehearses the run and transmits nothing.</div>`}
      <div class="stats stats-inline">
        <div class="stat"><div class="stat-num">${t.total}</div><div class="stat-label">recipients</div></div>
        <div class="stat"><div class="stat-num ok-text">${t.sent}</div><div class="stat-label">sent</div></div>
        <div class="stat"><div class="stat-num">${t.simulated}</div><div class="stat-label">simulated</div></div>
        <div class="stat"><div class="stat-num bad-text">${t.failed}</div><div class="stat-label">failed / refused</div></div>
      </div>
      ${mine && !run.finished ? `
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${run.total}" aria-valuenow="${run.index}"><div style="width:${pct}%"></div></div>
        ${run.mode === 'dryrun'
          ? `<p><strong>Dry run</strong>: checking ${esc(run.current || '')}. ${run.index} of ${run.total} checked. Nothing is being sent.</p>
        <div class="toolbar"><button class="btn" data-stop>Stop the dry run</button></div>`
          : run.starting
            ? '<p><strong>Preparing</strong>: saving the attachments and the mailing to SharePoint before the first message goes. Nothing has been sent yet.</p>'
            : `<p>${run.paused ? 'Paused' : `Sending ${esc(run.current || '')}`}: ${run.index} of ${run.total} done.</p>
        ${run.waitingForSignIn ? `<p class="warn-text">Your session ended during the batch. ${esc(run.current || '')} was not sent and is still pending. Sign in again, then press Resume.</p>` : ''}
        <div class="toolbar">${run.paused ? '<button class="btn btn-primary" data-resume>Resume</button>' : '<button class="btn" data-pause>Pause</button>'}<button class="btn btn-danger" data-stop>Stop after this message</button></div>`}
        <p class="small muted">A report opens when this finishes. It is also kept on the Activity page.</p>`
      : `
        <div class="toolbar">
          <button class="btn btn-primary" data-start ${busyElsewhere || !outstanding.length ? 'disabled' : ''}>${live ? 'Send' : 'Simulate'} ${outstanding.filter((m) => !m.issues.length).length} message(s)</button>
          ${failed.length ? `<button class="btn" data-retry>Retry ${failed.length} failed</button>` : ''}
          <button class="btn" data-dryrun ${busyElsewhere || !messages.length ? 'disabled' : ''} title="Checks every message through the send flow without sending anything">Dry run first</button>
          <span class="spacer"></span>
          <button class="btn" data-export>Export results CSV</button>
        </div>
        ${busyElsewhere ? '<p class="warn-text">Another mailing is being sent. Wait for it to finish.</p>' : ''}
        ${outstanding.some((m) => m.issues.length) ? `<p class="warn-text">${outstanding.filter((m) => m.issues.length).length} message(s) have problems and will be skipped — see Review.</p>` : ''}`}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Recipient</th><th>Status</th><th>When</th><th>Detail</th></tr></thead>
        <tbody>${messages.map((m) => {
          const r = c.results?.[m.key] || {};
          return `<tr><td><strong>${esc(m.key)}</strong><div class="small muted">${esc(m.to.join(', '))}</div></td>
            <td>${statusBadge(r.status || (m.issues.length ? 'skipped' : 'pending'))}</td>
            <td class="small muted">${esc(fmtDateTime(r.at))}</td>
            <td class="small">${r.error ? `<span class="bad-text">${esc(r.error)}</span>` : ''}${r.logItemId ? `log #${esc(r.logItemId)}` : ''}${r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}${!r.status && m.issues.length ? `<span class="warn-text">${esc(m.issues[0])}</span>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
      ${ready.length === 0 && messages.length ? '<p class="bad-text">No message is ready to send. Go back to Review.</p>' : ''}
    </section>`;

  const bind = (root) => {
    if (mine && !run.finished) {
      let pending = false;
      unsubscribe = Sender.on(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; if (location.hash.endsWith(`${c.id}/send`)) app.render(); });
      });
    }
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pause !== undefined) Sender.pause();
      if (b.dataset.resume !== undefined) Sender.resume();
      if (b.dataset.stop !== undefined) Sender.stop();
      if (b.dataset.start !== undefined || b.dataset.retry !== undefined) {
        const keys = b.dataset.retry !== undefined ? failed.map((m) => m.key) : undefined;
        const n = keys ? keys.length : outstanding.filter((m) => !m.issues.length).length;
        const ok = await confirmDialog(live ? 'Send now?' : 'Run simulation?',
          live ? `Send ${n} personalised message(s) to real addressees from ${settings.sender?.office || 'the DGO'}? This cannot be recalled.` : `Rehearse sending ${n} message(s). Nothing is transmitted.`,
          { submit: live ? `Send ${n}` : 'Simulate' });
        if (!ok) return;
        Sender.start(app, c.id, { keys }).then((done) => {
          const tt = tally(done);
          toast(`Finished: ${tt.sent} sent, ${tt.simulated} simulated, ${tt.failed} failed. The full report is open.`, tt.failed ? 'warn' : 'ok');
          if (location.hash.endsWith(`${c.id}/send`)) app.render();
        }).catch((err) => toast(err.message, 'bad'));
        setTimeout(() => app.render(), 50);
      }
      if (b.dataset.dryrun !== undefined) {
        Sender.dryRun(app, c.id).then(() => { if (location.hash.endsWith(`${c.id}/send`)) app.render(); }).catch((err) => toast(err.message, 'bad'));
        setTimeout(() => app.render(), 50);
      }
      if (b.dataset.export !== undefined) {
        const rows = messages.map((m) => ({ key: m.key, institution: m.recipient?.institution, to: m.to.join('; '), reference: c.results?.[m.key]?.reference || m.reference, subject: m.subject, attachments: m.attachments.map((a) => a.name).join('; '), status: c.results?.[m.key]?.status || 'pending', at: c.results?.[m.key]?.at || '', error: c.results?.[m.key]?.error || '', messageId: m.messageId, logItemId: c.results?.[m.key]?.logItemId ?? '' }));
        download(`${c.id}-results.csv`, toCsv(rows, Object.keys(rows[0] || { key: '' })), 'text/csv');
      }
    });
  };
  return { html, bind };
}

export { badge };
