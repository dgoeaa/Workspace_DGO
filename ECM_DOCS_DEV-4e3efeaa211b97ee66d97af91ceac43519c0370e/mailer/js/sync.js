// Shared working data: mailings, reports and attached files live in SharePoint (DGO_MAIL_DATA),
// and the directory and templates in their own lists. This browser keeps a copy as a cache.
//
//   after sign-in   pullAll() brings every device to the same state. It MERGES: an entry
//                   edited here and not yet shared is kept (and shared), not overwritten by an
//                   older copy; one only this browser has is kept. A mailing or report that was
//                   shared once and is no longer in SharePoint was deleted on another device, so
//                   it is removed here rather than uploaded again; one never shared is uploaded.
//   while working   saving a mailing, a directory entry or a template, attaching a file or
//                   finishing a report also saves it to SharePoint
//   deleting        a deletion SharePoint did not take is remembered and retried, and the
//                   deleted item is not brought back in the meantime
//   when sending    a file this browser has never stored is fetched from SharePoint first
//
// Nothing here throws into the page: a failure is recorded in app.state.sync and shown, and
// the next save retries.

import { op } from './api.js';
import { Store } from './store.js';
import { Session } from './session.js';
import { fromServer, toServer } from './views/directory.js';

const DEBOUNCE_MS = 800;
/* The signatory and sending rules are the office's, not one device's: they are kept as one
   record in DGOMailCampaigns under this id (ids starting "_" are never mailings). */
const SHARED_SETTINGS_ID = '_shared-settings';
export const SHARED_FIELDS = Object.freeze(['sender', 'allowedSuffixes', 'allowedDomains', 'maxRecipients', 'maxAttachmentMb', 'sendDelayMs', 'referencePattern']);
const timers = new Map();
let shareQueue = Promise.resolve();
/* How many mailings and reports a pull asks for. Below this, the list is complete, so an item
   missing from it really is gone; at it, nothing is removed. */
const PULL_TOP = 1000;
/* Deletions not yet taken by SharePoint: { mailings: [id], reports: [id] }. */
const PENDING_DELETES = 'sync-pending-deletes';

const time = (v) => Date.parse(v || '') || 0;
const newer = (a, b) => time(a) > time(b);

async function pendingDeletes() {
  const p = await Store.get(PENDING_DELETES, {});
  return { mailings: [...(p.mailings || [])], reports: [...(p.reports || [])] };
}
async function markDeleted(kind, ids, pending) {
  const p = await pendingDeletes();
  const set = new Set(p[kind]);
  for (const id of ids) { if (pending) set.add(id); else set.delete(id); }
  p[kind] = [...set];
  await Store.set(PENDING_DELETES, p);
}

/** The shared record of a template (the mailer's own; letterhead ones are built in). */
const templateRecord = (app, x) => ({ key: x.key, name: x.name, subject: x.subject, bodyHtml: x.bodyHtml, description: x.description || '', updatedBy: app.state.settings.operator?.email || '' });
export const templateFromServer = (x) => ({ key: x.key, name: x.name || x.key, subject: x.subject || '', bodyHtml: x.bodyHtml || '', description: x.description || '', updatedAt: x.modified });

/** Content of a directory entry or template, without the bookkeeping fields. */
const content = (r) => JSON.stringify(Object.fromEntries(Object.entries(r || {}).filter(([k]) => !['dirty', 'updatedAt', 'caution', 'shared'].includes(k)).sort(([a], [b]) => a.localeCompare(b))));

/* One save of a record at a time: a second save of the same letter waits for the first, so two
   overlapping first saves can never both create a row for it in SharePoint. */
const inFlight = new Map();
function serial(key, fn) {
  const run = (inFlight.get(key) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  inFlight.set(key, tail);
  tail.then(() => { if (inFlight.get(key) === tail) inFlight.delete(key); });
  return run;
}

/** Mark what changed between two versions of a list as edited here: dirty, and stamped now. */
export function stampEdits(before, list) {
  const prev = new Map(before.map((r) => [r.key, r]));
  const now = new Date().toISOString();
  const changed = [];
  const out = list.map((r) => {
    if (prev.has(r.key) && content(prev.get(r.key)) === content(r)) return r;
    changed.push(r.key);
    return { ...r, dirty: true, updatedAt: now };
  });
  return { list: out, changed };
}

/**
 * The server's entries laid over this browser's: an entry edited here and not yet shared, and
 * edited after the server's copy, is kept and returned in `unshared`. An entry only here is kept
 * if it was never shared; one that was shared before and is missing from a complete server list
 * was deleted on another device, and is dropped (`removed`).
 */
export function mergeShared(local, items, convert, { complete = true } = {}) {
  const merged = new Map(local.map((r) => [r.key, r]));
  const onServer = new Set(items.map((x) => x.key));
  const unshared = [];
  const removed = [];
  for (const x of items) {
    const mine = merged.get(x.key);
    if (mine?.dirty && !newer(x.modified, mine.updatedAt)) { unshared.push(mine); continue; }
    merged.set(x.key, { ...convert(x, mine), shared: true });
  }
  if (complete) {
    for (const [k, r] of merged) if (!onServer.has(k) && r.shared && !r.dirty) { merged.delete(k); removed.push(k); }
  }
  return { list: [...merged.values()], unshared, removed };
}

/** A name SharePoint accepts: no " * : < > ? / \ | # %, no leading/trailing dots or spaces. */
export function safeFileName(name) {
  const clean = String(name || 'file').replace(/["*:<>?/\\|#%\u0000-\u001f]+/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 100);
  return clean || 'file';
}
const storedNameOf = (id, name) => `${id}__${safeFileName(name)}`;
const guessType = (name) => (/\.pdf$/i.test(name) ? 'application/pdf' : /\.docx$/i.test(name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream');

export const Sync = {
  /** Shared data is on when the data flow is configured and someone is signed in. */
  on(app) { return Boolean(app.state.settings?.endpoints?.MAIL_DATA) && Session.active(); },

  note(app, ok, what, error = '') {
    app.state.sync = { ok, what, error, at: new Date().toISOString() };
    app.renderStatus?.();
  },

  /* ---------- mailings ---------- */

  queueMailing(app, c) {
    if (!Sync.on(app)) return;
    clearTimeout(timers.get(c.id));
    timers.set(c.id, setTimeout(() => { timers.delete(c.id); Sync.saveMailing(app, c); }, DEBOUNCE_MS));
  },

  saveMailing(app, c) {
    return serial(`mailing:${c.id}`, () => Sync.saveMailingNow(app, c));
  },

  async saveMailingNow(app, c) {
    if (!Sync.on(app)) return false;
    /* Deleted while this save waited its turn: not written back. */
    if (!app.state.campaigns.some((x) => x.id === c.id)) return false;
    /* The first save carries the stamp it will be marked with, so the shared copy and this one
       are identical even when a letter is saved only once (e.g. a copy never edited). */
    const stamp = c.syncedAt ? null : new Date().toISOString();
    try {
      await op(app.state.settings, 'MAIL_DATA', 'saveMailing', { mailing: { id: c.id, name: c.name || '', status: c.status || '', data: JSON.stringify(stamp ? { ...c, syncedAt: stamp } : c) } });
      /* Shared at least once: from now on, missing from SharePoint means deleted elsewhere. */
      if (stamp && !c.syncedAt) { c.syncedAt = stamp; await Store.set('campaigns', app.state.campaigns); }
      Sync.note(app, true, `Mailing “${c.name}” saved to SharePoint`);
      return true;
    } catch (e) { Sync.note(app, false, `Mailing “${c.name}” not yet saved to SharePoint`, e.message); return false; }
  },

  /** Save now whatever is waiting — before sending, so another device sees the same state. */
  async flush(app) {
    await shareQueue;
    const waiting = [...timers.keys()];
    for (const id of waiting) { clearTimeout(timers.get(id)); timers.delete(id); const c = app.state.campaigns.find((x) => x.id === id); if (c) await Sync.saveMailing(app, c); }
  },

  async deleteMailing(app, id) {
    clearTimeout(timers.get(id)); timers.delete(id);
    await markDeleted('mailings', [id], true);
    await inFlight.get(`mailing:${id}`); // a save already on its way finishes first, then is deleted
    if (!Sync.on(app)) return;
    try {
      await op(app.state.settings, 'MAIL_DATA', 'deleteMailing', { mailing: { id } });
      await markDeleted('mailings', [id], false);
    } catch (e) { Sync.note(app, false, 'A deleted mailing is still in SharePoint; it will be deleted there at the next sync', e.message); }
  },

  async saveSharedSettings(app) {
    if (!Sync.on(app)) return false;
    const s = app.state.settings;
    const shared = Object.fromEntries(SHARED_FIELDS.map((k) => [k, s[k]]));
    try {
      await op(s, 'MAIL_DATA', 'saveMailing', { mailing: { id: SHARED_SETTINGS_ID, name: 'Shared settings', status: 'settings', data: JSON.stringify({ ...shared, updatedAt: s.sharedChangedAt || new Date().toISOString() }) } });
      if (s.sharedDirty) await app.saveSettings({ ...app.state.settings, sharedDirty: false }, { fromServer: true });
      return true;
    } catch (e) { Sync.note(app, false, 'Settings saved here, not yet shared', e.message); return false; }
  },

  /* ---------- directory and templates ---------- */

  /** Directory entries and templates are shared by their own flows, whenever someone is signed in. */
  listOn(app, key) { return Boolean(app.state.settings?.endpoints?.[key]) && Session.active(); },

  /** Share, in the background, the directory entries (by key) edited here. */
  queueDirectory(app, keys) {
    if (!Sync.listOn(app, 'MAIL_DIRECTORY') || !keys.length) return shareQueue;
    shareQueue = shareQueue.then(() => Sync.pushDirectory(app, keys));
    return shareQueue;
  },

  async pushDirectory(app, keys) {
    if (!Sync.listOn(app, 'MAIL_DIRECTORY')) return false;
    let all = true;
    for (const key of keys) {
      const r = app.state.directory.find((x) => x.key === key);
      if (!r) continue;
      const stamp = r.updatedAt;
      try {
        await op(app.state.settings, 'MAIL_DIRECTORY', 'upsert', { record: toServer(r) });
        /* Cleared only if nobody edited it again while it was being shared. */
        const i = app.state.directory.findIndex((x) => x.key === key);
        if (i >= 0 && app.state.directory[i].updatedAt === stamp) app.state.directory[i] = { ...app.state.directory[i], dirty: false, shared: true };
      } catch (e) { all = false; Sync.note(app, false, `${key} is saved here but not yet in SharePoint`, e.message); }
    }
    await Store.set('directory', app.state.directory);
    if (all) Sync.note(app, true, 'Directory shared with SharePoint');
    return all;
  },

  /** Share, in the background, the templates (by key) edited here. */
  queueTemplates(app, keys) {
    if (!Sync.listOn(app, 'MAIL_TEMPLATES') || !keys.length) return shareQueue;
    shareQueue = shareQueue.then(() => Sync.pushTemplates(app, keys));
    return shareQueue;
  },

  async pushTemplates(app, keys) {
    if (!Sync.listOn(app, 'MAIL_TEMPLATES')) return false;
    let all = true;
    for (const key of keys) {
      const t = app.state.templates.find((x) => x.key === key && x.kind !== 'letterhead');
      if (!t) continue;
      const stamp = t.updatedAt;
      try {
        await op(app.state.settings, 'MAIL_TEMPLATES', 'upsert', { template: templateRecord(app, t) });
        const i = app.state.templates.findIndex((x) => x.key === key);
        if (i >= 0 && app.state.templates[i].updatedAt === stamp) app.state.templates[i] = { ...app.state.templates[i], dirty: false, shared: true };
      } catch (e) { all = false; Sync.note(app, false, `Template “${t.name}” is saved here but not yet in SharePoint`, e.message); }
    }
    await Store.set('templates', app.state.templates.filter((t) => t.kind !== 'letterhead'));
    if (all) Sync.note(app, true, 'Templates shared with SharePoint');
    return all;
  },

  /* ---------- files ---------- */

  /** Share a newly attached file, one upload at a time, without holding up the page. */
  share(app, rec) {
    if (!Sync.on(app)) return shareQueue;
    shareQueue = shareQueue.then(() => Sync.uploadFile(app, rec));
    return shareQueue;
  },

  async uploadFile(app, rec) {
    if (!Sync.on(app)) return null;
    try {
      const d = await op(app.state.settings, 'MAIL_DATA', 'uploadFile', { file: { id: rec.id, name: safeFileName(rec.name), contentBase64: rec.data } }, { timeoutMs: 240000 });
      await Store.indexFile(rec.id, { storedName: d?.storedName || storedNameOf(rec.id, rec.name), shared: true });
      await app.refreshFiles();
      return d?.storedName;
    } catch (e) { Sync.note(app, false, `${rec.name} is attached here but not yet shared`, e.message); return null; }
  },

  /** The file's content: from this browser, else from SharePoint (and kept here afterwards). */
  async fileContent(app, id) {
    const local = await Store.getFile(id);
    if (local) return local;
    const meta = app.state.fileIndex?.[id];
    if (!meta || !Sync.on(app)) return null;
    const d = await op(app.state.settings, 'MAIL_DATA', 'downloadFile', { file: { storedName: meta.storedName || storedNameOf(id, meta.name) } }, { timeoutMs: 240000 });
    if (!d?.contentBase64) return null;
    const rec = await Store.putFile({ id, name: meta.name, type: meta.type || guessType(meta.name), size: meta.size || 0, data: d.contentBase64 });
    await Store.indexFile(id, { storedName: meta.storedName, shared: true });
    await app.refreshFiles();
    return rec;
  },

  async deleteFile(app, id) {
    const meta = app.state.fileIndex?.[id];
    if (!Sync.on(app) || !meta?.shared) return true;
    try { await op(app.state.settings, 'MAIL_DATA', 'deleteFile', { file: { storedName: meta.storedName || storedNameOf(id, meta.name) } }); return true; }
    catch (e) { Sync.note(app, false, `${meta.name} was removed here but is still in SharePoint`, e.message); return false; }
  },

  /* ---------- reports ---------- */

  saveReport(app, r) {
    return serial(`report:${r.id}`, () => Sync.saveReportNow(app, r));
  },

  async saveReportNow(app, r) {
    if (!Sync.on(app)) return false;
    try {
      await op(app.state.settings, 'MAIL_DATA', 'saveReport', { report: { id: r.id, kind: r.kind, title: r.title, status: r.status, data: JSON.stringify(r) } });
      const all = await Store.get('reports', []);
      const mine = all.find((x) => x.id === r.id);
      if (mine && !mine.syncedAt) { mine.syncedAt = new Date().toISOString(); await Store.set('reports', all); }
      return true;
    } catch (e) { Sync.note(app, false, 'A report is kept here but not yet in SharePoint', e.message); return false; }
  },

  /** Activity → Clear history: every report, here and in SharePoint. */
  async clearReports(app, localIds) {
    let ids = [...localIds];
    if (Sync.on(app)) {
      try { ids = [...new Set([...ids, ...((await op(app.state.settings, 'MAIL_DATA', 'listReports', { top: PULL_TOP }))?.items || []).map((x) => x.id)])]; }
      catch (e) { Sync.note(app, false, 'Reports in SharePoint could not be listed', e.message); }
    }
    await markDeleted('reports', ids, true);
    return Sync.retryDeletes(app, { limit: Infinity });
  },

  /** Deletions SharePoint has not taken yet: try them again, five at a time, at most `limit`. */
  async retryDeletes(app, { limit = 50, batch = 5 } = {}) {
    if (!Sync.on(app)) return 0;
    const p = await pendingDeletes();
    const jobs = [
      ...p.mailings.map((id) => ['mailings', 'deleteMailing', 'mailing', id]),
      ...p.reports.map((id) => ['reports', 'deleteReport', 'report', id]),
    ].slice(0, limit);
    const done = { mailings: [], reports: [] };
    for (let i = 0; i < jobs.length; i += batch) {
      await Promise.all(jobs.slice(i, i + batch).map(async ([kind, operation, name, id]) => {
        try { await op(app.state.settings, 'MAIL_DATA', operation, { [name]: { id } }); done[kind].push(id); } catch { /* kept for the next sync */ }
      }));
    }
    for (const kind of ['mailings', 'reports']) if (done[kind].length) await markDeleted(kind, done[kind], false);
    return p.mailings.length + p.reports.length - done.mailings.length - done.reports.length;
  },

  /* ---------- everything, after sign-in ---------- */

  async pullAll(app) {
    if (!Sync.on(app)) return null;
    const s = app.state.settings;
    const out = { mailings: 0, uploadedMailings: 0, files: 0, uploadedFiles: 0, reports: 0, directory: 0, templates: 0, errors: [] };
    const step = async (label, fn) => { try { await fn(); } catch (e) { out.errors.push(`${label}: ${e.message}`); } };

    await step('Directory', async () => {
      const items = (await op(s, 'MAIL_DIRECTORY', 'list'))?.items || [];
      const { list, unshared, removed } = mergeShared(app.state.directory, items, fromServer, { complete: items.length < 2000 });
      out.removedDirectory = removed.length;
      await app.saveDirectory(list, { fromServer: true });
      out.directory = items.length;
      /* Edited here and not yet shared: share it now, rather than lose it. */
      const waiting = app.state.directory.filter((r) => r.dirty).map((r) => r.key);
      if (waiting.length) await Sync.pushDirectory(app, waiting);
      out.sharedDirectory = unshared.length;
    });
    await step('Templates', async () => {
      const items = (await op(s, 'MAIL_TEMPLATES', 'list'))?.items || [];
      const own = app.state.templates.filter((t) => t.kind !== 'letterhead');
      const { list, unshared, removed } = mergeShared(own, items, templateFromServer, { complete: items.length < 2000 });
      await app.saveTemplates(list, { fromServer: true });
      out.templates = items.length;
      out.removedTemplates = removed.length;
      const waiting = list.filter((t) => t.dirty).map((t) => t.key);
      if (waiting.length) await Sync.pushTemplates(app, waiting);
      out.sharedTemplates = unshared.length;
    });
    await step('Files', async () => {
      const items = (await op(s, 'MAIL_DATA', 'listFiles'))?.items || [];
      const onServer = new Set(items.map((x) => x.id));
      for (const x of items) {
        if (app.state.fileIndex[x.id]?.storedName) continue;
        const name = String(x.storedName).split('__').slice(1).join('__');
        await Store.indexFile(x.id, { name: app.state.fileIndex[x.id]?.name || name, size: x.size, type: app.state.fileIndex[x.id]?.type || guessType(name), storedName: x.storedName, shared: true, addedAt: x.created });
        out.files++;
      }
      await app.refreshFiles();
      /* Files attached here and never shared: share them, so the mailings that use them work
         anywhere. A file that was shared once (or downloaded from SharePoint) and is no longer
         there was removed on purpose, and is not put back. */
      for (const [id, meta] of Object.entries(app.state.fileIndex)) {
        if (onServer.has(id) || !meta.local || meta.shared) continue;
        const rec = await Store.getFile(id);
        if (rec && await Sync.uploadFile(app, rec)) out.uploadedFiles++;
      }
    });
    const deleted = await pendingDeletes();
    await step('Mailings', async () => {
      /* Only what was shared BEFORE the list was asked for can be missing from it because it was
         deleted; a mailing saved while this pull runs is simply not in the list yet. */
      const listedAt = new Date().toISOString();
      const items = (await op(s, 'MAIL_DATA', 'listMailings', { top: PULL_TOP }))?.items || [];
      const complete = items.length < PULL_TOP;
      const gone = new Set(deleted.mailings);
      const byId = new Map(app.state.campaigns.filter((c) => !gone.has(c.id)).map((c) => [c.id, c]));
      const serverIds = new Set();
      const stamp = new Date().toISOString();
      for (const x of items) {
        if (x.id === SHARED_SETTINGS_ID) {
          try {
            const shared = JSON.parse(x.data);
            const mine = app.state.settings;
            /* Changed here, not yet shared, and after the shared copy: this device's wins and is shared. */
            if (mine.sharedDirty && !newer(shared.updatedAt, mine.sharedChangedAt)) { out.settings = 'local'; continue; }
            const next = { ...mine, sharedDirty: false, sharedChangedAt: shared.updatedAt || stamp };
            for (const k of SHARED_FIELDS) if (shared[k] !== undefined) next[k] = shared[k];
            await app.saveSettings(next, { fromServer: true });
            out.settings = true;
          } catch { /* a damaged record is ignored */ }
          continue;
        }
        if (String(x.id).startsWith('_') || gone.has(x.id)) continue;
        serverIds.add(x.id);
        let c;
        try { c = JSON.parse(x.data); } catch { continue; }
        const mine = byId.get(x.id);
        if (!mine || String(c.updatedAt || '') >= String(mine.updatedAt || '')) { byId.set(x.id, { ...c, syncedAt: c.syncedAt || stamp }); out.mailings++; }
        else if (!mine.syncedAt) mine.syncedAt = stamp;
      }
      const upload = [];
      for (const c of [...byId.values()]) {
        if (serverIds.has(c.id)) continue;
        /* Shared before and now missing: deleted on another device. Never shared: upload it. */
        if (c.syncedAt && complete && c.status !== 'sending' && newer(listedAt, c.syncedAt)) { byId.delete(c.id); out.removedMailings = (out.removedMailings || 0) + 1; }
        else if (!c.syncedAt) upload.push(c);
      }
      app.state.campaigns = [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      await Store.set('campaigns', app.state.campaigns);
      for (const c of upload) if (await Sync.saveMailing(app, c)) out.uploadedMailings++;
      if (out.settings !== true) await Sync.saveSharedSettings(app); // the first device to sign in, or a newer change here, is shared
    });
    await step('Reports', async () => {
      const listedAt = new Date().toISOString();
      const items = (await op(s, 'MAIL_DATA', 'listReports', { top: PULL_TOP }))?.items || [];
      const complete = items.length < PULL_TOP;
      const gone = new Set(deleted.reports);
      const local = (await Store.get('reports', [])).filter((r) => !gone.has(r.id));
      const byId = new Map(local.map((r) => [r.id, r]));
      const serverIds = new Set(items.map((x) => x.id));
      const stamp = new Date().toISOString();
      for (const x of items) {
        if (gone.has(x.id)) continue;
        try { byId.set(x.id, { ...JSON.parse(x.data), syncedAt: stamp }); out.reports++; } catch { /* */ }
      }
      const upload = [];
      for (const r of local) {
        if (serverIds.has(r.id)) continue;
        if (r.syncedAt && complete && newer(listedAt, r.syncedAt)) byId.delete(r.id); // shared before, deleted elsewhere
        else if (!r.syncedAt) upload.push(r);
      }
      const merged = [...byId.values()].sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))).slice(0, 200);
      await Store.set('reports', merged);
      for (const r of upload) await Sync.saveReport(app, r);
    });
    /* Deletions SharePoint has not taken yet go last, a bounded number per sync, so a long
       queue (after Clear history) never holds up the letters and results above. */
    await step('Deletions', async () => { out.pendingDeletes = await Sync.retryDeletes(app, { limit: 50 }); });
    Sync.note(app, out.errors.length === 0, out.errors.length ? 'Some shared data could not be loaded' : 'Up to date with SharePoint', out.errors.join('; '));
    return out;
  },
};
