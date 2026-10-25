import { esc, toCsv, parseCsv, download, splitAddresses, isEmail, domainAllowed } from '../util.js';
import { modal, toast, confirmDialog, badge } from '../ui.js';
import { SEED_DIRECTORY, DIRECTORY_SOURCE } from '../seed-directory.js';
import { op } from '../api.js';
import { Reports } from '../reports.js';
import { Sync, mergeShared } from '../sync.js';

const CSV_COLUMNS = ['key', 'institution', 'addressee', 'salutation', 'email', 'cc', 'website', 'verification', 'category', 'active', 'notes', 'sortOrder'];
const CAUTION_RE = /purpose-specific|not a named|not yet|unverified/i;

let filter = { q: '', category: '' };

function verificationBadge(r) {
  if (!r.email) return badge('No verified address', 'bad', r.verification);
  if (r.caution || CAUTION_RE.test(r.verification || '')) return badge('Verified — caution', 'warn', r.verification);
  return badge('Verified', 'ok', r.verification);
}

function formBody(r = {}, isNew) {
  const f = (name, label, value, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
  return `
    <div class="form-grid">
      ${f('key', 'Key <small>(short, unique — names attachments)</small>', r.key, isNew ? 'required pattern="[A-Za-z0-9-]{2,24}"' : 'readonly')}
      ${f('category', 'Category', r.category)}
      <label class="field span-2"><span>Institution</span><input name="institution" required value="${esc(r.institution ?? '')}"></label>
      <label class="field span-2"><span>Addressee line</span><input name="addressee" required value="${esc(r.addressee ?? '')}" placeholder="The Director-General/CEO, …"></label>
      ${f('salutation', 'Salutation', r.salutation ?? 'Sir/Madam')}
      ${f('email', 'Email', r.email, 'type="email"')}
      <label class="field span-2"><span>Always copy (Cc) <small>comma-separated</small></span><input name="cc" value="${esc((r.cc || []).join(', '))}"></label>
      ${f('website', 'Official website', r.website, 'type="url"')}
      ${f('verification', 'Verification note', r.verification)}
      <label class="field span-2"><span>Notes</span><textarea name="notes" rows="2">${esc(r.notes ?? '')}</textarea></label>
      ${f('sortOrder', 'Order', r.sortOrder ?? 99, 'type="number" min="0"')}
      <div class="field checks">
        <label><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''}> Active</label>
        <label><input type="checkbox" name="caution" ${r.caution ? 'checked' : ''}> Show caution when selected</label>
      </div>
    </div>`;
}

function fromForm(v, prev = {}) {
  return {
    ...prev,
    key: String(v.key || prev.key).trim().toUpperCase(),
    institution: String(v.institution).trim(),
    addressee: String(v.addressee).trim(),
    salutation: String(v.salutation || 'Sir/Madam').trim(),
    email: String(v.email || '').trim(),
    cc: splitAddresses(v.cc),
    website: String(v.website || '').trim(),
    verification: String(v.verification || '').trim(),
    category: String(v.category || '').trim(),
    notes: String(v.notes || '').trim(),
    sortOrder: Number(v.sortOrder) || 99,
    active: v.active === true,
    caution: v.caution === true,
  };
}

export const toServer = (r) => ({
  key: r.key, institution: r.institution, addressee: r.addressee, email: r.email, cc: r.cc || [],
  website: r.website, verification: r.verification, salutation: r.salutation, category: r.category,
  active: r.active !== false, notes: r.notes || '', sortOrder: r.sortOrder ?? 99,
});

export const fromServer = (s, local) => ({
  key: s.key,
  institution: s.institution || '',
  addressee: s.addressee || '',
  email: s.email || '',
  cc: splitAddresses(s.cc || ''),
  website: s.website || '',
  verification: s.verification || '',
  salutation: s.salutation || 'Sir/Madam',
  category: s.category || '',
  active: s.active !== false,
  notes: s.notes || '',
  sortOrder: Number(s.sortOrder) || 99,
  caution: local?.caution ?? CAUTION_RE.test(s.verification || ''),
});

export async function render(app) {
  const { directory, settings } = app.state;
  const cats = [...new Set(directory.map((r) => r.category).filter(Boolean))].sort();
  const q = filter.q.toLowerCase();
  const rows = directory.filter((r) => (!filter.category || r.category === filter.category)
    && (!q || [r.key, r.institution, r.addressee, r.email].join(' ').toLowerCase().includes(q)));
  const allow = { suffixes: settings.allowedSuffixes, domains: settings.allowedDomains };
  const synced = Boolean(settings.endpoints?.MAIL_DIRECTORY);

  const html = `
    <section class="page-head">
      <div><h1>Addressees</h1>
      <p class="lede">${directory.length} institutions the office writes to, shared with every device. Add, correct or switch one off here; a letter's addressees are chosen from this list. (First filled from the <em>${esc(DIRECTORY_SOURCE)}</em>.)</p></div>
      <div class="actions">
        <button class="btn btn-primary" data-act="add">＋ Add institution</button>
      </div>
    </section>

    <div class="toolbar">
      <input type="search" class="input" placeholder="Search key, institution, addressee, email" value="${esc(filter.q)}" data-filter="q" aria-label="Search the addressees">
      <select class="input" data-filter="category" aria-label="Category">
        <option value="">All categories</option>${cats.map((c) => `<option ${c === filter.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button class="btn" data-act="import">Import CSV</button>
      <button class="btn" data-act="export">Export CSV</button>
      <button class="btn" data-act="restore" title="Re-add any guide entry that has been deleted, without touching edits">Restore guide entries</button>
      <button class="btn" data-act="pull" ${synced ? '' : 'disabled title="Wire MAIL_DIRECTORY first"'}>⇣ Pull from SharePoint</button>
      <button class="btn" data-act="push" ${synced ? '' : 'disabled title="Wire MAIL_DIRECTORY first"'}>⇡ Push to SharePoint</button>
      <input type="file" accept=".csv,text/csv" hidden data-csv>
    </div>

    <div class="table-wrap">
    <table class="table table-dir">
      <thead><tr><th>#</th><th>Key</th><th>Institution &amp; addressee</th><th>Email</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>
        ${rows.map((r) => {
          const outside = r.email && (!isEmail(r.email) || !domainAllowed(r.email, allow));
          return `<tr class="${r.active === false ? 'row-muted' : ''}">
            <td class="muted">${esc(r.sortOrder ?? '')}</td>
            <td><code>${esc(r.key)}</code><div class="muted small">${esc(r.category || '')}</div></td>
            <td><strong>${esc(r.institution)}</strong><div>${esc(r.addressee)}</div>${r.notes ? `<div class="small warn-text">${esc(r.notes)}</div>` : ''}</td>
            <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '<span class="bad-text">— none —</span>'}
              ${(r.cc || []).length ? `<div class="small muted">cc ${esc(r.cc.join(', '))}</div>` : ''}
              ${outside ? `<div class="small bad-text">Outside the allowed domains — the send flow will refuse it.</div>` : ''}
              ${r.website ? `<div class="small"><a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer">${esc(r.website.replace(/^https?:\/\//, ''))}</a></div>` : ''}</td>
            <td>${verificationBadge(r)} ${r.active === false ? badge('Inactive', 'neutral') : ''}</td>
            <td class="row-actions"><button class="btn btn-sm" data-edit="${esc(r.key)}">Edit</button><button class="btn btn-sm btn-ghost" data-del="${esc(r.key)}" aria-label="Delete ${esc(r.key)}">✕</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">Nothing matches.</td></tr>'}
      </tbody>
    </table></div>`;

  const bind = (root) => {
    root.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      filter[el.dataset.filter] = el.value;
      const pos = el.selectionStart;
      app.render().then(() => {
        const again = document.querySelector(`[data-filter="${el.dataset.filter}"]`);
        if (again && el.tagName !== 'SELECT') { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* search inputs */ } }
      });
    }));

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const list = [...app.state.directory];

      if (t.dataset.edit || t.dataset.act === 'add') {
        const prev = list.find((r) => r.key === t.dataset.edit);
        const v = await modal({ title: prev ? `Edit ${prev.key}` : 'Add institution', body: formBody(prev || {}, !prev), wide: true });
        if (!v) return;
        const next = fromForm(v, prev);
        if (!prev && list.some((r) => r.key === next.key)) { toast(`Key ${next.key} is already used.`, 'bad'); return; }
        if (next.email && !isEmail(next.email)) { toast(`"${next.email}" is not an email address.`, 'bad'); return; }
        if (prev) list[list.indexOf(prev)] = next; else list.push(next);
        await app.saveDirectory(list);
        toast(`${next.key} saved.`, 'ok');
        app.render();
      }

      if (t.dataset.del) {
        if (!(await confirmDialog('Delete institution', `Remove ${t.dataset.del} from this browser's directory? Mailings already sent keep their record. Unless it is also deleted from SharePoint, it comes back at the next sync.`, { submit: 'Delete', danger: true }))) return;
        await app.saveDirectory(list.filter((r) => r.key !== t.dataset.del));
        if (app.state.settings.endpoints?.MAIL_DIRECTORY && await confirmDialog('Also delete from SharePoint?', `Delete ${t.dataset.del} from the shared DGOMailDirectory list too?`, { submit: 'Delete there too', danger: true })) {
          const report = Reports.begin(app, 'directory-delete', t.dataset.del, { List: 'DGOMailDirectory' });
          try { await op(app.state.settings, 'MAIL_DIRECTORY', 'delete', { record: { key: t.dataset.del } }); report.add(t.dataset.del, 'ok', 'Deleted from this browser and from SharePoint.'); }
          catch (err) { report.add(t.dataset.del, 'fail', `Deleted from this browser only. SharePoint: ${err.message}`); }
          await report.finish();
        }
        app.render();
      }

      if (t.dataset.act === 'export') {
        download(`dgo-mailer-directory-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(app.state.directory, CSV_COLUMNS), 'text/csv');
      }
      if (t.dataset.act === 'import') root.querySelector('[data-csv]').click();

      if (t.dataset.act === 'restore') {
        const have = new Set(list.map((r) => r.key));
        const missing = SEED_DIRECTORY.filter((r) => !have.has(r.key));
        if (!missing.length) { toast('Every guide entry is already present.', 'info'); return; }
        await app.saveDirectory([...list, ...missing.map((r) => JSON.parse(JSON.stringify(r)))]);
        const report = Reports.begin(app, 'directory-import', 'Restore guide entries', { Source: 'Nigerian Government Letter Mailing Guide' });
        for (const r of missing) report.add(`${r.key} — ${r.institution}`, 'ok', `Restored: ${r.email || 'no verified address'}`);
        await report.finish();
        app.render();
      }

      if (t.dataset.act === 'pull') {
        t.disabled = true;
        const report = Reports.begin(app, 'directory-pull', 'Pull the directory from SharePoint', { List: 'DGOMailDirectory', 'Entries here before': String(list.length) });
        try {
          const data = await op(app.state.settings, 'MAIL_DIRECTORY', 'list');
          const items = data?.items || [];
          if (!items.length) report.add('DGOMailDirectory', 'warn', 'The SharePoint list is empty, so nothing changed here. Push this directory first.');
          const local = new Map(list.map((r) => [r.key, r]));
          const { list: mergedList, unshared, removed } = mergeShared(list, items, fromServer, { complete: items.length < 2000 });
          const merged = new Map(mergedList.map((r) => [r.key, r]));
          for (const x of items) {
            const before = local.get(x.key);
            const after = merged.get(x.key);
            if (unshared.includes(before)) { report.add(`${x.key} — ${before.institution}`, 'warn', 'Edited here after the SharePoint copy and not yet shared: this browser\'s version is kept, and shared now.'); continue; }
            const changed = before && ['institution', 'addressee', 'email', 'website', 'verification', 'salutation', 'category', 'active', 'notes'].filter((f) => String(before[f] ?? '') !== String(after[f] ?? ''));
            report.add(`${x.key} — ${after.institution}`, 'ok', !before ? `Added: ${after.email || 'no address'}` : changed.length ? `Updated: ${changed.join(', ')}` : 'Unchanged');
          }
          for (const r of list.filter((r) => !items.some((x) => x.key === r.key))) {
            if (removed.includes(r.key)) report.add(`${r.key} — ${r.institution}`, 'info', 'Deleted from SharePoint on another device; removed here too.');
            else report.add(`${r.key} — ${r.institution}`, 'info', 'Only in this browser; not in SharePoint. Kept. Push to share it.');
          }
          await app.saveDirectory(mergedList, { fromServer: true });
          if (unshared.length) await Sync.pushDirectory(app, unshared.map((r) => r.key));
        } catch (err) { report.add('DGOMailDirectory', 'fail', err.message); } finally { t.disabled = false; }
        await report.finish();
        app.render();
      }

      if (t.dataset.act === 'push') {
        if (!(await confirmDialog('Push to SharePoint', `Write all ${list.length} entries to the shared DGOMailDirectory list? Entries there with the same key are overwritten.`, { submit: 'Push' }))) return;
        t.disabled = true;
        const report = Reports.begin(app, 'directory-push', 'Push the directory to SharePoint', { List: 'DGOMailDirectory', Entries: String(list.length) });
        let n = 0; let stop = '';
        for (const r of list) {
          n++;
          if (stop) { report.add(`${r.key} — ${r.institution}`, 'skip', `Not attempted: ${stop}`); continue; }
          try {
            const res = await op(app.state.settings, 'MAIL_DIRECTORY', 'upsert', { record: toServer(r) });
            r.dirty = false;
            report.add(`${r.key} — ${r.institution}`, 'ok', `${res?.created ? 'Created' : 'Updated'} in SharePoint${res?.id ? ` (item ${res.id})` : ''}. ${r.email || 'No address'}${r.active === false ? '; inactive' : ''}.`);
          } catch (err) {
            report.add(`${r.key} — ${r.institution}`, 'fail', err.message);
            if (/UNAUTHORISED|NOT_CONFIGURED|Unreachable/.test(err.message)) stop = 'the flow refused the first request, so the rest would fail the same way.';
          }
          t.textContent = `Pushing ${n}/${list.length}…`;
        }
        await app.saveDirectory(list, { fromServer: true });
        t.disabled = false; t.textContent = '⇡ Push to SharePoint';
        await report.finish();
      }
    });

    root.querySelector('[data-csv]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const rows = parseCsv(await file.text());
      if (!rows.length || !('key' in rows[0])) { toast('That CSV has no "key" column. Export first to see the expected layout.', 'bad', 7000); return; }
      const merged = new Map(app.state.directory.map((r) => [r.key, r]));
      const before = new Set(merged.keys());
      for (const row of rows) {
        const key = String(row.key || '').trim().toUpperCase();
        if (!key) continue;
        const prev = merged.get(key) || {};
        merged.set(key, fromForm({ ...row, key, active: !/^(false|0|no)$/i.test(row.active || 'true'), caution: prev.caution || CAUTION_RE.test(row.verification || '') }, prev));
      }
      await app.saveDirectory([...merged.values()]);
      const report = Reports.begin(app, 'directory-import', file.name, { File: `${file.name} (${rows.length} rows)` });
      for (const row of rows) {
        const key = String(row.key || '').trim().toUpperCase();
        if (!key) { report.add('(row without a key)', 'skip', 'Ignored: the key column is empty.'); continue; }
        const r = merged.get(key);
        report.add(`${key} — ${r.institution}`, r.email ? 'ok' : 'warn', `${before.has(key) ? 'Updated' : 'Added'}: ${r.email || 'no email address, so it cannot be selected for a mailing'}`);
      }
      await report.finish(Sync.listOn(app, 'MAIL_DIRECTORY') ? 'Imported into this browser, and being shared with SharePoint.' : 'Imported into this browser. Sign in to share the changes with SharePoint.');
      app.render();
    });
  };

  return { title: 'Addressees', html, bind };
}
