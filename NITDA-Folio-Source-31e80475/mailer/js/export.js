// Full export and restore: everything the mailer keeps in this browser, in one ZIP.
//
// The export is for keeping — an archive of what was sent, to whom, with which files — and for
// moving the mailer to another computer or browser. It holds:
//
//   manifest.json        what is inside, with counts
//   README.txt           the same, for a person
//   settings.json        settings; flow addresses only if asked for (no key: browsers hold none)
//   directory.json/.csv  the addressee directory
//   templates.json       the mailer's own templates (plus templates/<key>.html to read)
//   mailings.json        every mailing with its per-recipient results
//   mailings/*.csv       each mailing's results, one row per recipient
//   reports.json         every Activity report
//   activity.csv         one row per report; reports/*.csv the lines of each
//   attachments.json     every stored file's metadata
//   attachments/<id>/<name>  the files themselves, byte for byte
//   store/kv.json        the raw key/value store, so nothing unnamed above is lost
//
// The six Agency letterhead templates are not exported: they come from the code, not storage.

import { Store } from './store.js';
import { zip, unzip, base64ToBytes, bytesToBase64 } from './zip.js';
import { toCsv } from './util.js';
import { Reports } from './reports.js';
import { referenceFor } from './campaign.js';
import { confirmDialog, toast } from './ui.js';
import { ENDPOINT_KEYS } from './settings.js';
import { health, verify, describe } from './api.js';

export const EXPORT_KIND = 'dgo-mailer-export';

const json = (v) => JSON.stringify(v, null, 2);
const safeName = (s) => String(s || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'file';
const slug = (s) => safeName(s).replace(/\s+/g, '-').replace(/[^\w.-]+/g, '').slice(0, 60) || 'item';
const dec = new TextDecoder();

async function mailerVersion() {
  if (globalThis.DGO_MAILER_VERSION) return globalThis.DGO_MAILER_VERSION; // the published single file carries it
  try {
    const r = await fetch('VERSION', { cache: 'no-store' });
    return r.ok ? (await r.text()).trim() : '';
  } catch { return ''; }
}

function stripCredentials(settings) {
  const { operatorKey, rememberKey, ...rest } = settings || {};
  return { ...rest, endpoints: Object.fromEntries(Object.keys(rest.endpoints || {}).map((k) => [k, ''])) };
}

const DIRECTORY_COLUMNS = ['key', 'institution', 'addressee', 'email', 'cc', 'salutation', 'category', 'website', 'verification', 'active', 'caution', 'notes', 'sortOrder'];
const RESULT_COLUMNS = ['key', 'institution', 'email', 'reference', 'status', 'at', 'messageId', 'runId', 'logItemId', 'attempts', 'error'];

/**
 * Build the full export.
 * @returns {Promise<{name: string, bytes: Uint8Array, report: import('./reports.js').Report}>}
 */
export async function buildFullExport(app, { includeCredentials = false } = {}) {
  const at = new Date();
  const report = Reports.begin(app, 'export', includeCredentials ? 'Everything, with credentials' : 'Everything, without credentials');
  const entries = [];
  const put = (name, data) => entries.push({ name, data });

  const kv = await Store.allKv();
  const files = await Store.allFiles();
  const index = kv.fileIndex || {};
  const directory = app.state.directory || [];
  const templates = (app.state.templates || []).filter((t) => t.kind !== 'letterhead');
  const campaigns = app.state.campaigns || [];
  const reports = await Reports.list();

  // Settings — the live, layered view, so file-configured values are captured too.
  const settings = includeCredentials ? { ...app.state.settings } : stripCredentials(app.state.settings);
  put('settings.json', json(settings));
  const endpointCount = Object.values(app.state.settings?.endpoints || {}).filter(Boolean).length;
  if (includeCredentials) {
    report.add('Settings', 'ok', `Included with ${endpointCount} flow address(es). Nobody can use them without signing in, but keep the file private.`);
  } else {
    report.add('Settings', 'ok', 'Included without flow addresses.');
  }

  put('directory.json', json(directory));
  put('directory.csv', `﻿${toCsv(directory, DIRECTORY_COLUMNS)}`);
  report.add('Directory', 'ok', `${directory.length} entr${directory.length === 1 ? 'y' : 'ies'} (${directory.filter((d) => d.active).length} active)`);

  put('templates.json', json(templates));
  for (const t of templates) if (t.bodyHtml) put(`templates/${slug(t.key)}.html`, t.bodyHtml);
  report.add('Templates', 'ok', `${templates.length} mailer template(s); the six Agency letterheads come from the code and are not stored`);

  put('mailings.json', json(campaigns));
  const byKey = Object.fromEntries(directory.map((d) => [d.key, d]));
  let resultRows = 0;
  for (const c of campaigns) {
    const keys = [...new Set([...(c.recipients || []), ...Object.keys(c.results || {})])];
    const rows = keys.map((k) => {
      const r = c.results?.[k] || {};
      const d = byKey[k] || {};
      return { key: k, institution: d.institution || '', email: c.overrides?.[k]?._to || d.email || '', reference: r.reference || c.overrides?.[k]?.Reference || ((c.recipients || []).includes(k) ? referenceFor(c, k, c.recipients.indexOf(k)) : ''), status: r.status || 'not sent', at: r.at || '', messageId: r.messageId || '', runId: r.runId || '', logItemId: r.logItemId ?? '', attempts: r.attempts ?? '', error: r.error || '' };
    });
    resultRows += rows.length;
    put(`mailings/${slug(c.id)}-${slug(c.name)}.csv`, `﻿${toCsv(rows, RESULT_COLUMNS)}`);
  }
  report.add('Mailings', 'ok', `${campaigns.length} mailing(s), ${resultRows} recipient result(s)`);

  put('reports.json', json(reports));
  put('activity.csv', `﻿${toCsv(reports.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt || '',
    operator: r.operator || '', counts: Reports.countsText(r), note: r.note || '',
  })), ['id', 'kind', 'title', 'status', 'startedAt', 'finishedAt', 'operator', 'counts', 'note'])}`);
  for (const r of reports) put(`reports/${slug(r.id)}.csv`, `﻿${Reports.csv(r)}`);
  report.add('Activity reports', 'ok', `${reports.length} report(s)`);

  // Attachments — every record in the files store, whether or not the index still lists it.
  const meta = [];
  let bytes = 0;
  for (const f of files) {
    const path = `attachments/${safeName(f.id)}/${safeName(f.name)}`;
    let data;
    try { data = base64ToBytes(f.data); } catch {
      report.add(f.name || f.id, 'fail', 'Stored content is damaged and could not be read; not exported.');
      continue;
    }
    put(path, data);
    bytes += data.length;
    meta.push({ id: f.id, name: f.name, type: f.type, size: data.length, addedAt: f.addedAt, path, indexed: Boolean(index[f.id]) });
  }
  const missing = Object.keys(index).filter((id) => !files.some((f) => f.id === id));
  for (const id of missing) report.add(index[id].name || id, 'warn', 'Listed in the file index but its content is not in this browser; nothing to export.');
  put('attachments.json', json(meta));
  report.add('Attachments', 'ok', `${meta.length} file(s), ${(bytes / 1048576).toFixed(2)} MB`);

  // The raw store, for anything not named above. Credentials follow the same choice.
  const raw = { ...kv };
  if (!includeCredentials && raw.settings) raw.settings = stripCredentials(raw.settings);
  put('store/kv.json', json(raw));
  const other = Object.keys(kv).filter((k) => !['settings', 'directory', 'templates', 'campaigns', 'fileIndex', 'reports'].includes(k));
  if (other.length) report.add('Other stored data', 'info', `Also kept: ${other.join(', ')}`);

  const version = await mailerVersion();
  const manifest = {
    kind: EXPORT_KIND,
    version: 1,
    mailerVersion: version,
    exportedAt: at.toISOString(),
    origin: globalThis.location?.origin || '',
    operator: app.state.settings?.operator?.email || '',
    includesCredentials: includeCredentials,
    counts: { directory: directory.length, templates: templates.length, mailings: campaigns.length, results: resultRows, reports: reports.length, attachments: meta.length, attachmentBytes: bytes },
  };
  const readme = [
    'DGO Correspondence Mailer — full export',
    '',
    `Exported:      ${manifest.exportedAt}${version ? `  (mailer ${version})` : ''}`,
    `From:          ${manifest.origin}`,
    `Operator:      ${manifest.operator || '(not set)'}`,
    `Credentials:   ${includeCredentials ? 'INCLUDED — the flow addresses are in settings.json and store/kv.json. They are useless without signing in, but keep the file private.' : 'not included'}`,
    '',
    `Directory:     ${directory.length} entries           directory.json, directory.csv`,
    `Templates:     ${templates.length}                    templates.json, templates/*.html`,
    `Mailings:      ${campaigns.length} (${resultRows} results)       mailings.json, mailings/*.csv`,
    `Reports:       ${reports.length}                    reports.json, activity.csv, reports/*.csv`,
    `Attachments:   ${meta.length} (${(bytes / 1048576).toFixed(2)} MB)       attachments.json, attachments/<id>/<file>`,
    '',
    'To put this back into a mailer: Settings → Data → Restore, and choose this .zip.',
    'The CSV files open in Excel. The six Agency letterhead templates are part of the mailer',
    'itself and are not in the export.',
    '',
  ].join('\r\n');
  entries.unshift({ name: 'manifest.json', data: json(manifest) }, { name: 'README.txt', data: readme });

  const out = zip(entries, at);
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return { name: `dgo-mailer-export-${stamp}.zip`, bytes: out, report, manifest };
}

/** Read an export (ZIP) or an older JSON backup, without changing anything yet. */
export async function readRestoreFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const members = await unzip(buf);
    const text = (n) => (members.has(n) ? dec.decode(members.get(n)).replace(/^﻿/, '') : null);
    const manifest = JSON.parse(text('manifest.json') || 'null');
    if (manifest?.kind !== EXPORT_KIND) throw new Error('That ZIP is not a mailer export (no manifest.json).');
    return { type: 'export', manifest, members, text };
  }
  let data;
  try { data = JSON.parse(dec.decode(buf)); } catch { throw new Error('That file is neither a mailer export (.zip) nor a backup (.json).'); }
  if (data.kind !== 'dgo-mailer-backup') throw new Error('That is not a mailer backup.');
  return { type: 'backup', data };
}

/**
 * Put an export back. Everything the mailer keeps in this browser is replaced. Credentials are
 * restored only if the export has them; otherwise the ones already here are kept.
 */
export async function restoreFullExport(app, parsed, fileName = 'export') {
  const { manifest, members, text } = parsed;
  const report = Reports.begin(app, 'restore', fileName, { 'Exported': manifest.exportedAt, 'From mailer': manifest.mailerVersion || 'unknown', 'Credentials in file': manifest.includesCredentials ? 'yes' : 'no' });
  const readJson = (n, fallback) => { const t = text(n); return t == null ? fallback : JSON.parse(t); };

  const raw = readJson('store/kv.json', {});
  const settings = readJson('settings.json', raw.settings || {});
  const directory = readJson('directory.json', raw.directory || []);
  const templates = readJson('templates.json', raw.templates || []);
  const campaigns = readJson('mailings.json', raw.campaigns || []);
  const reports = readJson('reports.json', raw.reports || []);
  const attachments = readJson('attachments.json', []);

  const current = app.state.settings;
  await Store.wipe();

  // Anything in the raw store not handled by name below goes back as it was.
  for (const [k, v] of Object.entries(raw)) {
    if (!['settings', 'directory', 'templates', 'campaigns', 'fileIndex', 'reports'].includes(k)) await Store.set(k, v);
  }

  if (manifest.includesCredentials) {
    const { operatorKey, rememberKey, ...kept } = settings; // a key from a 1.x export is not kept: browsers hold none
    await app.saveSettings(kept);
    report.add('Settings', 'ok', `Restored, with ${Object.values(settings.endpoints || {}).filter(Boolean).length} flow address(es) from the file${operatorKey ? '. The operator key in this older export was not restored: operators now sign in with a mailed code' : ''}.`);
  } else {
    const { operatorKey, rememberKey, endpoints, ...rest } = settings;
    await app.saveSettings({ ...rest, endpoints: current.endpoints });
    report.add('Settings', 'ok', 'Restored; the flow addresses already in this browser were kept.');
  }

  await app.saveDirectory(directory, { fromServer: true }); // a restore is not an edit: it is not pushed over SharePoint's shared copy
  report.add('Directory', 'ok', `${directory.length} entries`);
  await app.saveTemplates(templates, { fromServer: true }); // a restore is not an edit: it is not pushed over SharePoint's shared copy
  report.add('Templates', 'ok', `${templates.filter((t) => t.kind !== 'letterhead').length} mailer template(s)`);
  await Store.set('campaigns', campaigns);
  app.state.campaigns = campaigns;
  report.add('Mailings', 'ok', `${campaigns.length} mailing(s) with their results`);

  let restored = 0;
  for (const a of attachments) {
    const bytes = members.get(a.path);
    if (!bytes) { report.add(a.name || a.id, 'fail', `Missing from the ZIP (${a.path}).`); continue; }
    await Store.putFile({ id: a.id, name: a.name, type: a.type, size: bytes.length, data: bytesToBase64(bytes) });
    restored++;
  }
  await app.refreshFiles();
  report.add('Attachments', restored === attachments.length ? 'ok' : 'warn', `${restored} of ${attachments.length} file(s)`);

  await Store.set('reports', reports);
  report.add('Activity reports', 'ok', `${reports.length} report(s) (this restore is added on top)`);
  await report.finish('Everything the mailer keeps in this browser now matches the export.');
  return report;
}

/** The older JSON backup: no attachments, no reports, credentials never in it. */
export async function restoreBackup(app, data, fileName = 'backup') {
  await app.saveDirectory(data.directory || [], { fromServer: true }); // a restore is not an edit: it is not pushed over SharePoint's shared copy
  await app.saveTemplates(data.templates || [], { fromServer: true }); // a restore is not an edit: it is not pushed over SharePoint's shared copy
  await Store.set('campaigns', data.campaigns || []);
  app.state.campaigns = data.campaigns || [];
  const { endpoints, ...rest } = data.settings || {};
  await app.saveSettings({ ...app.state.settings, ...rest, endpoints: app.state.settings.endpoints });
  const report = Reports.begin(app, 'restore', fileName, { 'Backup taken': data.at });
  report.add('Directory', 'ok', `${(data.directory || []).length} entries`);
  report.add('Templates', 'ok', `${(data.templates || []).filter((t) => t.kind !== 'letterhead').length} mailer template(s)`);
  report.add('Mailings', 'ok', `${(data.campaigns || []).length} mailing(s) with their results`);
  report.add('Settings', 'ok', 'Restored, except the flow addresses, which were kept as they were.');
  await report.finish('Attachment files are not in backups; mailings that still need sending need their files attached again.');
  return report;
}


/**
 * An export handed over by the local server (tools/serve.mjs --offer-restore, which the Termux
 * installer uses). A browser with no mailer data restores it straight away; one that already has
 * data asks first. Either way the server then deletes the file, because it can hold the key.
 * Anywhere else — a static host, a server without an offer — this finds nothing and does nothing.
 */
export async function offerPendingRestore(app) {
  if (!['127.0.0.1', 'localhost'].includes(globalThis.location?.hostname)) return null; // only the local server hands over
  let info;
  try {
    const r = await fetch('__restore/info.json', { cache: 'no-store' });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
    info = await r.json();
  } catch { return null; }
  let changed = null;
  if (info?.pending) changed = (await takeExport(app, info)) || changed;
  if (info?.settings) changed = (await takeSetupSettings(app)) || changed; // after an export, so setup's fresh URLs and key win
  return changed;
}

async function takeExport(app, info) {
  const done = () => fetch('__restore/done', { method: 'POST' }).catch(() => {});
  try {
    const r = await fetch('__restore/export.zip', { cache: 'no-store' });
    if (!r.ok) return null;
    const parsed = await readRestoreFile(new File([await r.blob()], info.name || 'export.zip'));
    if (parsed.type !== 'export') throw new Error('The file handed over is not a mailer export.');
    const fresh = Object.keys(await Store.allKv()).length === 0;
    if (!fresh) {
      const c = parsed.manifest.counts || {};
      const ok = await confirmDialog('Restore the export from setup?',
        `The installer found ${info.name}, exported ${parsed.manifest.exportedAt}, with ${c.mailings ?? '?'} mailing(s) and ${c.attachments ?? '?'} attachment file(s). This browser already has mailer data. Replace it with the export? Either way the file is then deleted from this device.`,
        { submit: 'Replace with the export', danger: true });
      if (!ok) { await done(); toast('The export was not restored, and has been deleted from this device.', 'info'); return null; }
    }
    const report = await restoreFullExport(app, parsed, `${info.name} (from setup)`);
    await done();
    return report;
  } catch (err) {
    toast(`The export from setup could not be restored: ${err.message}`, 'bad');
    return null;
  }
}

/**
 * The trigger URLs written by tools/setup.mjs for a local (unpublished) mailer. They are added to
 * this browser's settings (nothing else changes), the file is deleted, and every flow is then
 * checked from this browser — which proves what setup could not: that this browser reaches them.
 */
async function takeSetupSettings(app) {
  let h;
  try {
    const r = await fetch('__restore/settings.json', { cache: 'no-store' });
    if (!r.ok) return null;
    h = await r.json();
    if (h?.kind !== 'dgo-mailer-setup') throw new Error('The settings file handed over was not written by setup.');
  } catch (err) {
    toast(`The settings from setup could not be read: ${err.message}`, 'bad');
    return null;
  }
  const cur = app.state.settings;
  const report = Reports.begin(app, 'setup', 'Settings from automatic setup', { Environment: h.environment || '', 'Set up at': h.createdAt || '' });
  const endpoints = { ...cur.endpoints };
  for (const e of ENDPOINT_KEYS) if (h.endpoints?.[e.key]) endpoints[e.key] = h.endpoints[e.key];
  const operator = cur.operator?.email ? cur.operator : { name: h.operator?.name || cur.operator?.name || '', email: h.operator?.email || '' };
  await app.saveSettings({ ...cur, endpoints, operator });
  await fetch('__restore/settings-done', { method: 'POST' }).catch(() => {});
  report.add('Flow addresses', ENDPOINT_KEYS.every((e) => h.endpoints?.[e.key]) ? 'ok' : 'warn', `${ENDPOINT_KEYS.filter((e) => h.endpoints?.[e.key]).length} of ${ENDPOINT_KEYS.length} set from setup.`);
  report.add('Sign-in', 'info', 'No key is kept in the browser: sign in with the code mailed to you.');
  report.add('Operator', 'info', operator.email ? `${operator.name ? `${operator.name} ` : ''}<${operator.email}>` : 'Not set; enter it in Settings.');
  report.add('Settings file', 'ok', 'Taken and deleted from this device.');
  const s = app.state.settings;
  for (const e of ENDPOINT_KEYS) {
    const [hc, v] = [await health(s, e.key), await verify(s, e.key)];
    const good = hc.verdict === 'healthy' && v.verdict === 'verified';
    report.add(`${e.flow} from this browser`, good ? 'ok' : 'fail', good ? 'Healthy and verified.' : `${hc.verdict}, ${v.verdict}: ${describe(hc.verdict === 'healthy' ? v.res : hc.res)}`);
  }
  const c = report.counts();
  await report.finish(c.fail ? 'Setup configured the flows, but this browser cannot reach some of them. Each failed line says why; "Unreachable" from a browser often means a network filter.' : 'The mailer is configured, and every flow answers from this browser. You can send.');
  return report;
}
