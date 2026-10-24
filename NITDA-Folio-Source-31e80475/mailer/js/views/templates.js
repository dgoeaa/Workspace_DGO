import { esc, uid } from '../util.js';
import { modal, toast, confirmDialog, previewFrame } from '../ui.js';
import { editorHtml, bindEditor } from '../editor.js';
import { merge, fieldsIn, markMissing } from '../merge.js';
import { senderFields, RECIPIENT_FIELDS, letterheadContext } from '../campaign.js';
import { letterheadTemplate, renderLetterhead, letterheadDate, CONDITION_FIELDS } from '../letterhead.js';
import { effective } from '../settings.js';
import { SEED_TEMPLATES } from '../seed-templates.js';
import { op } from '../api.js';
import { Reports } from '../reports.js';
import { Sync, mergeShared, templateFromServer } from '../sync.js';
import { letterDate } from '../util.js';

export const STANDARD_FIELDS = ['Addressee', 'Institution', 'Salutation', 'Reference', 'Date', 'LetterTitle', 'Message', 'Website', 'SenderName', 'SenderTitle', 'SenderOffice', 'Organisation'];

let selected = null;
let sampleKey = null;

export function sampleData(app, extra = {}) {
  const r = app.state.directory.find((d) => d.key === sampleKey) || app.state.directory.find((d) => d.email) || {};
  const s = effective(app.state.settings);
  return {
    ...senderFields(s),
    Date: letterDate(),
    Reference: `NITDA/DGO/${r.key || 'KEY'}/${new Date().getFullYear()}/001`,
    LetterTitle: 'Sample letter title',
    Message: 'The body of your message appears here.',
    Key: r.key, Institution: r.institution, Addressee: r.addressee, Email: r.email, Website: r.website,
    Salutation: r.salutation || 'Sir/Madam', Category: r.category,
    ...extra,
  };
}

export async function render(app) {
  const list = app.state.templates;
  if (!list.find((t) => t.key === selected)) selected = list[0]?.key || null;
  const t = list.find((x) => x.key === selected);
  const synced = Boolean(app.state.settings.endpoints?.MAIL_TEMPLATES);
  const used = t ? fieldsIn(t.subject, t.bodyHtml) : [];
  const chips = [...new Set([...STANDARD_FIELDS, ...used.filter((f) => !RECIPIENT_FIELDS.includes(f))])];

  const html = `
    <section class="page-head">
      <div><h1>Templates</h1>
      <p class="lede">Letter emails with merge fields. <code>{{Field}}</code> is filled per addressee and escaped; <code>{{{SignatureBlock}}}</code> inserts the signatory block from Settings as HTML.</p></div>
      <div class="actions">
        <button class="btn" data-act="pull" ${synced ? '' : 'disabled title="Wire MAIL_TEMPLATES first"'}>⇣ Pull</button>
        <button class="btn" data-act="push" ${synced ? '' : 'disabled title="Wire MAIL_TEMPLATES first"'}>⇡ Push</button>
        <button class="btn btn-primary" data-act="new">＋ New template</button>
      </div>
    </section>

    <div class="split">
      <nav class="panel list-nav" aria-label="Templates">
        ${[['letterhead', 'Agency letterhead · from the internal platform'], ['html', 'Mailer templates · editable']].map(([kind, heading]) => {
          const group = list.filter((x) => (x.kind === 'letterhead') === (kind === 'letterhead'));
          return group.length ? `<h3 class="list-heading">${esc(heading)}</h3>${group.map((x) => `<button class="list-item ${x.key === selected ? 'active' : ''}" data-select="${esc(x.key)}"><strong>${esc(x.name)}</strong><span class="muted small">${esc(x.description || '')}</span></button>`).join('')}` : '';
        }).join('')}
        <button class="btn btn-ghost btn-sm" data-act="restore">Restore starter templates</button>
      </nav>

      ${t && t.kind === 'letterhead' ? letterheadPanel(app, t) : t ? `
      <form class="panel" data-form>
        <div class="form-grid">
          <label class="field span-2"><span>Name</span><input name="name" required value="${esc(t.name)}"></label>
          <label class="field span-2"><span>Description</span><input name="description" value="${esc(t.description || '')}"></label>
          <label class="field span-2"><span>Subject</span><input name="subject" required value="${esc(t.subject)}"></label>
        </div>
        <div class="field"><span>Body</span>${editorHtml({ id: 'tpl', name: 'bodyHtml', value: t.bodyHtml, fields: chips })}</div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">Save template</button>
          <button class="btn" type="button" data-act="duplicate">Duplicate</button>
          <button class="btn btn-ghost" type="button" data-act="delete">Delete</button>
          <span class="spacer"></span>
          <label class="inline-field">Preview as
            <select class="input" data-sample>${app.state.directory.filter((d) => d.email).map((d) => `<option value="${esc(d.key)}" ${d.key === sampleKey ? 'selected' : ''}>${esc(d.key)}</option>`).join('')}</select>
          </label>
        </div>
        <h3>Preview</h3>
        <div class="preview-meta" data-preview-subject></div>
        <div data-preview></div>
      </form>` : '<section class="panel"><p>No templates. Create one, or restore the starter templates.</p></section>'}
    </div>`;

  const bind = (root) => {
    root.querySelector('[data-lh-sample]')?.addEventListener('change', (e) => { sampleKey = e.target.value; app.render(); });
    const form = root.querySelector('[data-form]');
    const refresh = () => {
      if (!form) return;
      const data = sampleData(app);
      const subj = merge(form.subject.value, data);
      const body = merge(form.bodyHtml.value, data, { html: true });
      root.querySelector('[data-preview-subject]').innerHTML = `<strong>Subject:</strong> ${markMissing(esc(subj.text))}`;
      root.querySelector('[data-preview]').innerHTML = previewFrame(markMissing(body.text));
    };
    if (form) {
      bindEditor(root, 'tpl', refresh);
      form.subject.addEventListener('input', refresh);
      root.querySelector('[data-sample]')?.addEventListener('change', (e) => { sampleKey = e.target.value; refresh(); });
      refresh();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const next = { ...t, name: form.name.value.trim(), description: form.description.value.trim(), subject: form.subject.value, bodyHtml: form.bodyHtml.value, updatedAt: new Date().toISOString() };
        await app.saveTemplates(app.state.templates.map((x) => (x.key === t.key ? next : x)));
        toast('Template saved.', 'ok');
        app.render();
      });
    }

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.select) { selected = b.dataset.select; app.render(); return; }
      const act = b.dataset.act;
      if (act === 'new' || act === 'duplicate') {
        const v = await modal({ title: act === 'new' ? 'New template' : 'Duplicate template', body: `<label class="field"><span>Name</span><input name="name" required value="${act === 'duplicate' ? esc(`${t.name} (copy)`) : ''}"></label>` });
        if (!v) return;
        const base = act === 'duplicate' ? t : SEED_TEMPLATES[0];
        const key = `${String(v.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'template'}-${uid().slice(0, 4)}`;
        await app.saveTemplates([...app.state.templates, { ...base, key, name: String(v.name).trim(), description: act === 'new' ? '' : base.description }]);
        selected = key;
        app.render();
      }
      if (act === 'delete') {
        if (!(await confirmDialog('Delete template', `Delete "${t.name}"? Mailings already created keep their own copy of the text.`, { submit: 'Delete', danger: true }))) return;
        await app.saveTemplates(app.state.templates.filter((x) => x.key !== t.key));
        if (app.state.settings.endpoints?.MAIL_TEMPLATES) {
          const report = Reports.begin(app, 'templates-delete', t.name, { List: 'DGOMailTemplates' });
          try { await op(app.state.settings, 'MAIL_TEMPLATES', 'delete', { template: { key: t.key } }); report.add(t.name, 'ok', 'Deleted from this browser and from SharePoint.'); }
          catch (err) { report.add(t.name, /NOT_FOUND/.test(err.message) ? 'ok' : 'fail', /NOT_FOUND/.test(err.message) ? 'Deleted from this browser; it was not in SharePoint.' : `Deleted from this browser only. SharePoint: ${err.message}`); }
          await report.finish();
        }
        selected = null;
        app.render();
      }
      if (act === 'restore') {
        const have = new Set(app.state.templates.map((x) => x.key));
        const add = SEED_TEMPLATES.filter((x) => !have.has(x.key));
        if (!add.length) { toast('The starter templates are all present.', 'info'); return; }
        await app.saveTemplates([...app.state.templates, ...add.map((x) => ({ ...x }))]);
        app.render();
      }
      if (act === 'pull') {
        const report = Reports.begin(app, 'templates-pull', 'Pull templates from SharePoint', { List: 'DGOMailTemplates', Note: 'The six Agency letterhead templates are built in and are not stored in SharePoint.' });
        try {
          const data = await op(app.state.settings, 'MAIL_TEMPLATES', 'list');
          const items = data?.items || [];
          if (!items.length) report.add('DGOMailTemplates', 'warn', 'The SharePoint list is empty, so nothing changed here. Push first.');
          const own = app.state.templates.filter((x) => x.kind !== 'letterhead');
          const before = new Map(own.map((x) => [x.key, x]));
          const { list, unshared } = mergeShared(own, items, templateFromServer);
          for (const x of items) {
            const was = before.get(x.key);
            if (unshared.includes(was)) { report.add(x.name || x.key, 'warn', 'Edited here after the SharePoint copy and not yet shared: this browser\'s version is kept, and shared now.'); continue; }
            const changed = was && (was.subject !== (x.subject || '') || was.bodyHtml !== (x.bodyHtml || '') || was.name !== (x.name || x.key));
            report.add(x.name || x.key, 'ok', `${!was ? 'Added' : changed ? 'Updated' : 'Unchanged'}. Last changed in SharePoint ${x.modified || ''}${x.modifiedBy ? ` by ${x.modifiedBy}` : ''}.`);
          }
          await app.saveTemplates(list, { fromServer: true });
          if (unshared.length) await Sync.pushTemplates(app, unshared.map((x) => x.key));
        } catch (err) { report.add('DGOMailTemplates', 'fail', err.message); }
        await report.finish();
        app.render();
      }
      if (act === 'push') {
        /* Letterhead templates are defined by the internal platform and compiled in; only the
           mailer's own HTML templates are shared through SharePoint. */
        const own = app.state.templates.filter((t) => t.kind !== 'letterhead');
        const report = Reports.begin(app, 'templates-push', 'Push templates to SharePoint', { List: 'DGOMailTemplates', Templates: `${own.length} mailer template(s); the 6 Agency letterhead templates are built in and not pushed` });
        for (const x of own) {
          try {
            const res = await op(app.state.settings, 'MAIL_TEMPLATES', 'upsert', { template: { key: x.key, name: x.name, subject: x.subject, bodyHtml: x.bodyHtml, description: x.description || '', updatedBy: app.state.settings.operator?.email || '' } });
            report.add(x.name, 'ok', `${res?.created ? 'Created' : 'Updated'} in SharePoint${res?.id ? ` (item ${res.id})` : ''}. Key ${x.key}.`);
            x.dirty = false;
          } catch (err) { report.add(x.name, 'fail', err.message); }
        }
        await app.saveTemplates(app.state.templates, { fromServer: true });
        await report.finish();
      }
    });
  };

  return { title: 'Templates', html, bind };
}

/** A read-only view of one Agency letterhead template, previewed with every optional paragraph on. */
function letterheadPanel(app, t) {
  const lt = letterheadTemplate(t.letterheadId);
  const data = sampleData(app, {
    Message: 'The body of your letter appears here. Line breaks you type are kept.',
    ActionRequired: 'The action you ask the addressee to take appears here.',
    DueDate: '9 October 2026',
    Reference: sampleData(app).Reference,
  });
  const ctx = letterheadContext({ importance: 'Normal' }, data, [{ name: 'Signed_Letter.pdf' }]);
  const r = renderLetterhead(lt, ctx, letterheadDate(Date.now()));
  const optional = lt.sections.filter((x) => x.when).map((x) => CONDITION_FIELDS[x.when]).filter(Boolean);
  return `<section class="panel">
    <div class="callout">This template belongs to the internal platform's Correspondence Email Desk. The mailer sends it exactly as the platform does, on the Agency letterhead, so it can't be edited here. To change the wording, edit <code>config/correspondence-email-templates.config.js</code> in the platform and rebuild the mailer.</div>
    <dl class="meta">
      <dt>Template</dt><dd>${esc(lt.label)} · ${esc(lt.category)}</dd>
      <dt>Subject line</dt><dd><code>${esc(lt.subject)}</code></dd>
      <dt>You fill in</dt><dd>Letter title and Message, on the Letter step${optional.length ? `; optional: ${optional.map(esc).join(', ')}` : ''}</dd>
      <dt>Greeting</dt><dd>"Dear" and the addressee's salutation from the directory (Sir/Madam), or a name you set per addressee</dd>
      <dt>Signed by</dt><dd>The signatory in Settings, otherwise ${esc(ctx.signatoryName)}</dd>
    </dl>
    <div class="form-actions"><span class="spacer"></span>
      <label class="inline-field">Preview as
        <select class="input" data-lh-sample>${app.state.directory.filter((d) => d.email).map((d) => `<option value="${esc(d.key)}" ${d.key === sampleKey ? 'selected' : ''}>${esc(d.key)}</option>`).join('')}</select>
      </label></div>
    <h3>Preview</h3>
    <div class="preview-meta"><strong>Subject:</strong> ${esc(r.subject)}</div>
    ${previewFrame(r.html)}
  </section>`;
}
