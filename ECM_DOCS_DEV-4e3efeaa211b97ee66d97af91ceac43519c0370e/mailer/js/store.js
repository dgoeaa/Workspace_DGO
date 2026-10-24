// Browser persistence: IndexedDB, because attachments are megabytes and localStorage is ~5 MB
// in total. Two object stores:
//
//   kv      settings, directory, templates, campaigns, the file index
//   files   attachment content (base64), one record per file, keyed by id
//
// If IndexedDB is unavailable (some private windows) everything still works for the session
// from memory, and the shell says so — nothing is silently lost at reload without warning.

const DB_NAME = 'dgo-mailer';
const DB_VERSION = 1;

let dbPromise = null;
let memory = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) throw new Error('no IndexedDB');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { memory = { kv: new Map(), files: new Map() }; resolve(null); };
      req.onblocked = () => { memory = { kv: new Map(), files: new Map() }; resolve(null); };
    } catch {
      memory = { kv: new Map(), files: new Map() };
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* The file index is read, changed and written back. Two of those overlapping (a file being
   stored while another finishes uploading) would lose one change, so they run one at a time. */
let indexChain = Promise.resolve();
function updateIndex(change) {
  const run = indexChain.then(async () => {
    const index = await Store.get('fileIndex', {});
    change(index);
    await Store.set('fileIndex', index);
  });
  indexChain = run.catch(() => {});
  return run;
}

export const Store = {
  async persistent() { await open(); return !memory; },

  async get(key, fallback = undefined) {
    const db = await open();
    const v = db ? await tx(db, 'kv', 'readonly', (s) => s.get(key)) : clone(memory.kv.get(key));
    return v === undefined ? fallback : v;
  },

  async set(key, value) {
    const db = await open();
    if (db) await tx(db, 'kv', 'readwrite', (s) => s.put(clone(value), key));
    else memory.kv.set(key, clone(value));
    return value;
  },

  async del(key) {
    const db = await open();
    if (db) await tx(db, 'kv', 'readwrite', (s) => s.delete(key));
    else memory.kv.delete(key);
  },

  /** Store one attachment. `data` is base64 without a data: prefix. */
  async putFile({ id, name, type, size, data }) {
    const db = await open();
    const rec = { id, name, type, size, data, addedAt: new Date().toISOString() };
    if (db) await tx(db, 'files', 'readwrite', (s) => s.put(rec));
    else memory.files.set(id, rec);
    await updateIndex((index) => { index[id] = { ...(index[id] || {}), name, type, size, addedAt: rec.addedAt, local: true }; });
    return rec;
  },

  async getFile(id) {
    const db = await open();
    return db ? tx(db, 'files', 'readonly', (s) => s.get(id)) : memory.files.get(id);
  },

  async deleteFile(id) {
    const db = await open();
    if (db) await tx(db, 'files', 'readwrite', (s) => s.delete(id));
    else memory.files.delete(id);
    await updateIndex((index) => { delete index[id]; });
  },

  /** Record a file that is shared in SharePoint but not (yet) stored in this browser. */
  async indexFile(id, meta) {
    await updateIndex((index) => { index[id] = { ...(index[id] || {}), ...meta }; });
  },

  /** Metadata for every stored attachment, by id. */
  fileIndex() { return this.get('fileIndex', {}); },

  /** Every stored attachment record, including any the index has lost track of. */
  async allFiles() {
    const db = await open();
    return db ? tx(db, 'files', 'readonly', (s) => s.getAll()) : [...memory.files.values()];
  },

  /** Every key/value record, raw — the full export writes this so nothing is left behind. */
  async allKv() {
    const db = await open();
    if (!db) return Object.fromEntries([...memory.kv.entries()].map(([k, v]) => [k, clone(v)]));
    const keys = await tx(db, 'kv', 'readonly', (s) => s.getAllKeys());
    const values = await tx(db, 'kv', 'readonly', (s) => s.getAll());
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  },

  /** Estimated usage, where the browser reports it. */
  async usage() {
    try { return await navigator.storage?.estimate?.(); } catch { return null; }
  },

  async wipe() {
    const db = await open();
    if (db) {
      await tx(db, 'kv', 'readwrite', (s) => s.clear());
      await tx(db, 'files', 'readwrite', (s) => s.clear());
    } else {
      memory.kv.clear();
      memory.files.clear();
    }
  },
};
