import { esc, download, splitAddresses, isEmail } from '../util.js';
import { toast, confirmDialog, previewFrame } from '../ui.js';
import { ENDPOINT_KEYS, signatureHtml, shareable, fileConfig, deployedEndpoints, FLOW_LIMITS, clampLimit } from '../settings.js';
import { Session } from '../session.js';
import { op } from '../api.js';
import { Sync } from '../sync.js';
import { Store } from '../store.js';
import { Reports } from '../reports.js';
import { Sender } from '../sender.js';
import { buildFullExport, readRestoreFile, restoreFullExport, restoreBackup } from '../export.js';

const SIG_RE = /[?&]sig=[^&]+/;

export async function render(app) {
  const s = app.state.settings;
  const fromFile = fileConfig().endpoints;
  const deployed = deployedEndpoints();
  const who = Session.get();
  const admin = who?.role === 'admin';
  let operators = null;
  let operatorsError = '';
  if (admin) { try { operators = (await op(s, 'MAIL_AUTH', 'listOperators'))?.items || []; } catch (e) { operatorsError = e.message; } }
  const html = `
    <section class="page-head"><div><h1>Settings</h1>
      <p class="lede">${Sync.on(app) ? 'The signatory and sending rules are shared: saving here updates them for every device.' : 'Saved in this browser.'} No key or password is kept in the browser.</p></div></section>
    <form data-settings>
      <section class="panel">
        <h2>Operator</h2>
        ${who ? `<p>Signed in as <strong>${esc(who.name || who.email)}</strong> &lt;${esc(who.email)}&gt;${admin ? ' — <strong>admin</strong>' : ''}. Messages you send are logged under this address.
          <button class="btn btn-sm" type="button" data-signout>Sign out</button></p>
          <input type="hidden" name="operator.name" value="${esc(who.name || s.operator?.name)}"><input type="hidden" name="operator.email" value="${esc(who.email)}">`
        : `<div class="form-grid">
          <label class="field"><span>Your name</span><input name="operator.name" value="${esc(s.operator?.name)}"></label>
          <label class="field"><span>Your email</span><input type="email" name="operator.email" value="${esc(s.operator?.email)}"></label>
        </div>`}
      </section>

      <section class="panel">
        <h2>Signatory &amp; sender</h2>
        <div class="form-grid">
          <label class="field"><span>Signatory name <small>{{SenderName}}</small></span><input name="sender.name" value="${esc(s.sender?.name)}"></label>
          <label class="field"><span>Signatory title <small>{{SenderTitle}}</small></span><input name="sender.title" value="${esc(s.sender?.title)}" placeholder="Director-General/CEO"></label>
          <label class="field"><span>Office <small>{{SenderOffice}}</small></span><input name="sender.office" value="${esc(s.sender?.office)}"></label>
          <label class="field"><span>Organisation <small>{{Organisation}}</small></span><input name="sender.organisation" value="${esc(s.sender?.organisation)}"></label>
          <label class="field"><span>Contact email <small>{{SenderEmail}}</small></span><input name="sender.email" value="${esc(s.sender?.email)}"></label>
          <label class="field"><span>Contact phone <small>{{SenderPhone}}</small></span><input name="sender.phone" value="${esc(s.sender?.phone)}"></label>
          <label class="field span-2"><span>Signature block HTML <small>{{{SignatureBlock}}} — leave empty to generate one from the fields above</small></span>
            <textarea name="sender.signatureHtml" rows="4" spellcheck="false">${esc(s.sender?.signatureHtml)}</textarea></label>
        </div>
        <div data-sig-preview>${previewFrame(signatureHtml(s.sender), 'Signature preview')}</div>
      </section>

      <section class="panel">
        <h2>Endpoints</h2>
        ${ENDPOINT_KEYS.every((e) => deployed[e.key]) ? `<p class="muted">All ${ENDPOINT_KEYS.length} flow addresses are provided by this deployment (its <code>config.local.js</code>, written by automatic setup), so every device uses the same ones. To change them, run setup again and publish the new file.</p>
        <ul class="plain small">${ENDPOINT_KEYS.map((e) => `<li><code>${esc(e.key)}</code> — ${esc(e.flow)} ✓</li>`).join('')}</ul>`
        : `<p class="muted">Each flow's “HTTP URL”, from its trigger. A URL set in <code>config.local.js</code> is used, and cannot be changed here.</p>
        <div class="form-grid">
          ${ENDPOINT_KEYS.map((e) => `<label class="field span-2"><span><code>${esc(e.key)}</code> — ${esc(e.flow)}${fromFile[e.key] ? ' <small>(set by this deployment)</small>' : ''}</span>
            <input type="url" name="endpoints.${esc(e.key)}" value="${esc(fromFile[e.key] ? '' : s.endpoints?.[e.key] || '')}" placeholder="${fromFile[e.key] ? 'set by this deployment' : 'https://….logic.azure.com/…/triggers/manual/paths/invoke?…&sig=…'}" ${fromFile[e.key] ? 'disabled' : ''} autocomplete="off" spellcheck="false"></label>`).join('')}
        </div>`}
      </section>
      ${admin ? `
      <section class="panel">
        <h2>Operators <small class="muted">— who may sign in</small></h2>
        ${operatorsError ? `<div class="callout callout-bad">${esc(operatorsError)}</div>` : `
        <div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Can sign in</th><th></th></tr></thead><tbody>
        ${(operators || []).map((o) => `<tr><td>${esc(o.email)}</td><td>${esc(o.name || '')}</td><td>${esc(o.role || 'operator')}</td><td>${o.active === false ? 'No' : 'Yes'}</td>
          <td><button class="btn btn-sm" type="button" data-op-toggle="${esc(o.email)}" data-op-name="${esc(o.name || '')}" data-op-role="${esc(o.role || 'operator')}" data-op-active="${o.active === false ? '0' : '1'}" ${o.email === who.email ? 'disabled title="You cannot switch yourself off"' : ''}>${o.active === false ? 'Allow' : 'Switch off'}</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="form-grid" data-op-add>
          <label class="field"><span>Email</span><input type="email" data-op-field="email" placeholder="name@nitda.gov.ng"></label>
          <label class="field"><span>Name</span><input data-op-field="name"></label>
          <label class="field"><span>Role</span><select data-op-field="role"><option value="operator">Operator</option><option value="admin">Admin (can manage operators)</option></select></label>
          <div class="form-actions"><button class="btn" type="button" data-op-save>Add or update operator</button></div>
        </div>
        <p class="small muted">Switching someone off ends their sessions at once: every flow checks the operator list on every call.</p>`}
      </section>` : ''}

      <section class="panel">
        <h2>Sending rules</h2>
        <div class="form-grid">
          <label class="field"><span>Allowed domain suffixes <small>(must match DGO_MAIL_SEND)</small></span><input name="allowedSuffixes" value="${esc((s.allowedSuffixes || []).join(', '))}"></label>
          <label class="field"><span>Allowed exact domains</span><input name="allowedDomains" value="${esc((s.allowedDomains || []).join(', '))}"></label>
          <label class="field"><span>Max addresses per message</span><input type="number" min="1" max="${FLOW_LIMITS.maxRecipients}" name="maxRecipients" value="${esc(s.maxRecipients)}"></label>
          <label class="field"><span>Max attachments per message (MB) <small>(DGO_MAIL_SEND takes at most ${FLOW_LIMITS.maxAttachmentMb} MB and ${FLOW_LIMITS.maxRecipients} addresses)</small></span><input type="number" min="1" max="${FLOW_LIMITS.maxAttachmentMb}" name="maxAttachmentMb" value="${esc(s.maxAttachmentMb)}"></label>
          <label class="field"><span>Pause between messages (ms)</span><input type="number" min="0" step="500" name="sendDelayMs" value="${esc(s.sendDelayMs)}"></label>
          <label class="field"><span>Default reference pattern</span><input name="referencePattern" value="${esc(s.referencePattern)}"></label>
          <label class="field"><span>Test address</span><input type="email" name="testAddress" value="${esc(s.testAddress)}" placeholder="defaults to your email"></label>
          <div class="field checks"><label><input type="checkbox" name="bccSelf" ${s.bccSelf ? 'checked' : ''}> Bcc me on every message</label></div>
        </div>
      </section>

      <div class="form-actions sticky-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form>

    <section class="panel">
      <h2>Data</h2>
      <h3>Export everything</h3>
      <p class="small">One <code>.zip</code> with everything the mailer keeps in this browser: settings, the directory, templates,
        every mailing with its per-recipient results, all Activity reports, and every attached file byte for byte.
        The CSV files inside open in Excel. Restore it here or in another browser.</p>
      <div class="toolbar checks">
        <label><input type="checkbox" data-export-creds> Include the flow addresses</label>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" data-export>Export everything (.zip)</button>
        <label class="btn">Restore export or backup<input type="file" accept=".zip,application/zip,application/json,.json" hidden data-restore></label>
      </div>
      <p class="small muted">Mailings, reports and files are already shared through SharePoint for every device; this export is an archive you keep. Flow addresses are useless without signing in, but leave them out unless you need them.</p>
      <h3>Other</h3>
      <div class="toolbar">
        <button class="btn" data-backup>Download light backup (.json)</button>
        <button class="btn" data-gc>Remove unused attachment files</button>
        <button class="btn btn-danger" data-wipe>Erase everything in this browser</button>
      </div>
      <p class="small muted" data-usage></p>
      <p class="small muted">The light backup holds settings (without endpoint URLs or the key), the directory, templates and mailings — not attachments or reports.</p>
    </section>`;

  const bind = async (root) => {
    const form = root.querySelector('[data-settings]');
    form.querySelector('[name="sender.signatureHtml"]').addEventListener('input', () => {
      const sender = { ...s.sender };
      for (const el of form.querySelectorAll('[name^="sender."]')) sender[el.name.slice(7)] = el.value;
      root.querySelector('[data-sig-preview]').innerHTML = previewFrame(signatureHtml(sender), 'Signature preview');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = JSON.parse(JSON.stringify(s));
      for (const el of form.elements) {
        if (!el.name || el.disabled) continue;
        const v = el.type === 'checkbox' ? el.checked : el.value.trim();
        const [a, b] = el.name.split('.');
        if (b) { next[a] ||= {}; next[a][b] = v; } else next[a] = v;
      }
      /* Only addresses typed on this page are checked; the deployment's own are its business. */
      for (const k of ENDPOINT_KEYS.map((x) => x.key).filter((key) => !deployed[key])) {
        const v = next.endpoints[k];
        if (v && !/^https:\/\//i.test(v)) { toast(`${k}: the URL must start with https://`, 'bad'); return; }
        if (v && !SIG_RE.test(v)) toast(`${k}: that URL carries no sig= parameter — it will be refused unless the trigger allows it.`, 'warn', 8000);
        if (!v) next.endpoints[k] = ''; // falls back to the config file's value
      }
      next.allowedSuffixes = splitAddresses(next.allowedSuffixes).map((x) => x.toLowerCase().replace(/^\./, ''));
      next.allowedDomains = splitAddresses(next.allowedDomains).map((x) => x.toLowerCase());
      next.maxRecipients = clampLimit(next.maxRecipients, FLOW_LIMITS.maxRecipients);
      next.maxAttachmentMb = clampLimit(next.maxAttachmentMb, FLOW_LIMITS.maxAttachmentMb);
      next.sendDelayMs = Math.max(0, Number(next.sendDelayMs) || 0);
      if (next.operator.email && !isEmail(next.operator.email)) { toast('Your email is not an email address.', 'bad'); return; }
      await app.saveSettings(next);
      if (!Sync.on(app)) toast('Settings saved.', 'ok');
      else if (await Sync.saveSharedSettings(app)) toast('Settings saved, and shared with every device.', 'ok');
      else toast(`Settings saved in this browser, but NOT shared: ${app.state.sync?.error || 'SharePoint could not be reached'}. Save again when it is back, or other devices keep the old signatory and rules.`, 'bad', 12000);
      app.render();
    });

    const usage = await Store.usage();
    if (usage?.usage) root.querySelector('[data-usage]').textContent = `This browser holds ${(usage.usage / 1048576).toFixed(1)} MB for the mailer${usage.quota ? ` of ${(usage.quota / 1048576).toFixed(0)} MB available` : ''}.`;

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.signout !== undefined) { await app.signOut(); return; }
      if (b.dataset.opSave !== undefined || b.dataset.opToggle) {
        const get = (f) => root.querySelector(`[data-op-field="${f}"]`)?.value.trim();
        const operator = b.dataset.opToggle
          ? { email: b.dataset.opToggle, name: b.dataset.opName, role: b.dataset.opRole, active: b.dataset.opActive !== '1' }
          : { email: get('email').toLowerCase(), name: get('name'), role: get('role'), active: true };
        if (!isEmail(operator.email)) { toast('Enter the operator\'s email address.', 'bad'); return; }
        b.disabled = true;
        const report = Reports.begin(app, 'operators', operator.email, { Role: operator.role, 'Can sign in': operator.active ? 'yes' : 'no' });
        try {
          await op(app.state.settings, 'MAIL_AUTH', 'upsertOperator', { operator });
          report.add(operator.email, 'ok', operator.active ? `Can sign in as ${operator.role}. They ask for a code on the sign-in page with this address.` : 'Switched off: their sessions stop working at once.');
        } catch (err) { report.add(operator.email, 'fail', err.message); }
        await report.finish();
        app.render();
        return;
      }
      if (b.dataset.backup !== undefined) {
        const data = { kind: 'dgo-mailer-backup', version: 1, at: new Date().toISOString(), settings: shareable(app.state.settings), directory: app.state.directory, templates: app.state.templates, campaigns: app.state.campaigns };
        download(`dgo-mailer-backup-${data.at.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
      }
      if (b.dataset.export !== undefined) {
        const includeCredentials = root.querySelector('[data-export-creds]').checked;
        b.disabled = true;
        try {
          const out = await buildFullExport(app, { includeCredentials });
          download(out.name, new Blob([out.bytes], { type: 'application/zip' }));
          out.report.context = { File: out.name, Size: `${(out.bytes.length / 1048576).toFixed(2)} MB`, Credentials: includeCredentials ? 'included' : 'not included' };
          await out.report.finish(`Saved as ${out.name} in your Downloads folder.`);
        } catch (err) { toast(`Export failed: ${err.message}`, 'bad'); }
        finally { b.disabled = false; }
      }
      if (b.dataset.gc !== undefined) {
        const used = new Set();
        for (const c of app.state.campaigns) {
          (c.commonAttachments || []).forEach((id) => used.add(id));
          Object.values(c.perRecipient || {}).flat().forEach((id) => used.add(id));
          (c.unassigned || []).forEach((id) => used.add(id));
        }
        const unused = Object.keys(app.state.fileIndex).filter((id) => !used.has(id));
        let kept = 0;
        /* Removed from SharePoint too, or a shared file no mailing uses would come back at the next sync. */
        for (const id of unused) { if (!(await Sync.deleteFile(app, id))) kept++; await Store.deleteFile(id); }
        await app.refreshFiles();
        toast(`Removed ${unused.length} unused file(s)${kept ? `; ${kept} could not be removed from SharePoint` : ''}.`, kept ? 'warn' : 'ok');
        app.render();
      }
      if (b.dataset.wipe !== undefined) {
        if (Sender.busy()) { toast('Stop the running batch first.', 'bad'); return; }
        if (!(await confirmDialog('Erase everything', 'Erase settings, directory edits, templates, mailings and attachments from this browser? The flows and SharePoint are not affected.', { submit: 'Erase', danger: true }))) return;
        /* Whatever is still waiting to be shared goes to SharePoint first, so erasing never loses it. */
        await Sync.flush(app);
        await Store.wipe();
        try { sessionStorage.clear(); localStorage.removeItem('dgo-mailer.operatorKey'); } catch { /* */ }
        location.hash = '#/';
        location.reload();
      }
    });

    root.querySelector('[data-restore]').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        if (Sender.busy()) { toast('Stop the running batch first.', 'bad'); return; }
        const parsed = await readRestoreFile(f);
        if (parsed.type === 'export') {
          const m = parsed.manifest;
          const c = m.counts || {};
          const msg = `Replace everything the mailer keeps in this browser with the export from ${m.exportedAt}? It holds ${c.directory ?? '?'} directory entries, ${c.templates ?? '?'} template(s), ${c.mailings ?? '?'} mailing(s), ${c.reports ?? '?'} report(s) and ${c.attachments ?? '?'} attachment file(s). ${m.includesCredentials ? 'Its flow addresses and operator key will replace the ones here.' : 'The flow addresses and operator key here are kept.'}`;
          if (!(await confirmDialog('Restore export', msg, { submit: 'Restore', danger: true }))) return;
          await restoreFullExport(app, parsed, f.name);
        } else {
          const data = parsed.data;
          if (!(await confirmDialog('Restore backup', `Replace the directory, templates and mailings in this browser with the backup from ${data.at}? Endpoint URLs and the key are kept.`, { submit: 'Restore', danger: true }))) return;
          await restoreBackup(app, data, f.name);
        }
        app.render();
      } catch (err) { toast(err.message, 'bad', 8000); }
      finally { e.target.value = ''; }
    });
  };

  return { title: 'Settings', html, bind };
}
