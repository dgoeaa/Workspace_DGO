/**
 * In-memory SharePoint for the identification flow tests: the connector calls (GetItems, GetItem, PostItem, PatchItem,
 * CreateFile) and "Send an HTTP request to SharePoint" as the generation kit uses it (Flow Configuration reads, list
 * reads by $filter or item ID, MERGE with IF-MATCH, creates). It keeps the rules the flows depend on: a stale IF-MATCH is
 * refused with 412, the counter's Title is enforce-unique, and a read is a snapshot that a later write does not change.
 */
const SEQ = 'd95409a4-2b48-4d34-9f60-da5d27db862d';

/* 'or' binds looser than 'and', as in OData. A clause the mock does not model fails the test, unless `lenient`. */
function matcher(lenient) {
  const clause = (row, c) => {
    let m = /^startswith\((\w+),'(.*)'\)$/.exec(c); if (m) return String(row[m[1]] ?? '').startsWith(m[2]);
    m = /^(\w+) eq '(.*)'$/.exec(c); if (m) return String(row[m[1]] ?? '') === m[2].replace(/''/g, "'");
    m = /^(\w+) eq (\d+)$/.exec(c); if (m) return Number(row[m[1]] ?? 0) === Number(m[2]);
    m = /^(\w+) ge '(.*)'$/.exec(c); if (m) return String(row[m[1]] ?? '') >= m[2];
    m = /^(\w+) (gt|ge|lt|le) (\d+)$/.exec(c); if (m) { const v = Number(row[m[1]] ?? 0), n = Number(m[3]); return { gt: v > n, ge: v >= n, lt: v < n, le: v <= n }[m[2]]; }
    if (lenient) return true;
    throw new Error(`filter not modelled: ${c}`);
  };
  return (row, f) => !f || f.split(/\s+or\s+/i).some((g) => g.split(/\s+and\s+/i).every((c) => clause(row, c.trim())));
}

export function sharepoint(seed, { config = [], claimHook, failCreate = {}, failMerge = {}, lenientFilters = [], columns = {} } = {}) {
  /* columns: { <list GUID>: Set of column names }. A write to such a list naming any other column is refused with 400,
     as SharePoint refuses it ("Column 'X' does not exist"). */
  const unknownColumn = (table, body) => (columns[table] ? Object.keys(body || {}).find((k) => !['Title', 'ID'].includes(k) && !columns[table].has(k)) : null);
  const db = structuredClone(seed); let id = 1000;
  for (const rows of Object.values(db)) for (const r of rows) if (r && typeof r === 'object') { r['odata.etag'] = r['odata.etag'] || '"1"'; r['@odata.etag'] = r['odata.etag']; }
  const strict = matcher(false), lenient = matcher(true);
  const match = (table, row, f) => (lenientFilters.includes(table) ? lenient : strict)(row, f);
  const fields = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('item/')).map(([k, v]) => { const [, c, s] = k.split('/'); return [c, s ? { Value: v } : v]; }));
  const calls = [];
  const bump = (row) => { row['odata.etag'] = `"${Number(String(row['odata.etag']).replace(/\D/g, '') || 1) + 1}"`; row['@odata.etag'] = row['odata.etag']; };
  const http = (p) => {
    const method = p['parameters/method'], uri = decodeURIComponent(p['parameters/uri']), h = p['parameters/headers'] || {};
    let body = p['parameters/body']; if (typeof body === 'string' && uri !== '_api/$batch') body = JSON.parse(body);
    calls.push({ method, uri, headers: h, body });
    if (/getbytitle\('Flow Configuration'\)/i.test(uri)) {
      const titles = [...uri.matchAll(/Title eq '([^']+)'/g)].map((m) => m[1]);
      return { body: { value: config.filter((r) => titles.includes(r.Title)) } };
    }
    /* $batch of ValidateUpdateListItem calls, one change set each (identification Phase 5 keys first). A system update:
       the fields change, the item's etag (its version) does not. Each part answers 200 with SharePoint's per-field
       result; a column the list lacks (the `columns` option) comes back HasException true, as SharePoint reports it. */
    if (uri === '_api/$batch' && method === 'POST') {
      const text = String(p['parameters/body'] ?? '');
      const out = [];
      for (const m of text.matchAll(/POST (\S+)\/_api\/web\/lists\(guid'([0-9a-f-]+)'\)\/items\((\d+)\)\/ValidateUpdateListItem HTTP\/1\.1\r\n(?:[^\r\n]+\r\n)*\r\n(\{[^\r\n]*\})\r\n/g)) {
        const [, , table, itemId, json] = m;
        const row = (db[table] || []).find((x) => String(x.ID) === itemId);
        if (!row) { out.push('HTTP/1.1 404 Not Found\r\n\r\n{}'); continue; }
        const req = JSON.parse(json);
        if (!req.bNewDocumentUpdate) throw new Error('ValidateUpdateListItem without bNewDocumentUpdate would create a version');
        const value = req.formValues.map((f) => {
          if (columns[table] && !columns[table].has(f.FieldName)) return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: true, ErrorMessage: 'Column does not exist' };
          row[f.FieldName] = /^\d+$/.test(f.FieldValue) && f.FieldName === 'Rev' ? Number(f.FieldValue) : f.FieldValue;
          return { FieldName: f.FieldName, FieldValue: f.FieldValue, HasException: false, ErrorMessage: null };
        });
        out.push(`HTTP/1.1 200 OK\r\nCONTENT-TYPE: application/json;odata=nometadata\r\n\r\n${JSON.stringify({ value })}`);
      }
      calls[calls.length - 1].batch = out.length;
      return { body: out.map((x) => `--batchresponse_1\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n${x}\r\n`).join('') + '--batchresponse_1--\r\n' };
    }
    /* A list address that is not a GUID (its Flow Configuration binding empty or still the template's placeholder) is refused, as SharePoint refuses it. */
    { const g = /lists\(guid'([^']*)'\)/.exec(uri); if (g && !/^[0-9a-f-]{36}$/i.test(g[1])) return { ok: false, statusCode: 400, message: 'Invalid list address' }; }
    const lm = /lists\(guid'([0-9a-f-]+)'\)\/items(?:\((\d+)\))?(?:\?(.*))?$/.exec(uri);
    if (!lm) throw new Error(`uri not modelled: ${uri}`);
    const [, table, itemId, query] = lm; db[table] = db[table] || [];
    if (method === 'GET' && itemId) { const row = db[table].find((r) => String(r.ID) === itemId); return row ? { body: structuredClone(row) } : { ok: false, statusCode: 404 }; }
    if (method === 'GET') {
      const qs = Object.fromEntries((query || '').split('&').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
      let rows = db[table].filter((r) => match(table, r, qs.$filter));
      if (qs.$orderby) { const [col, dir] = qs.$orderby.split(' '); const cmp = (a, b) => (typeof a[col] === 'number' && typeof b[col] === 'number' ? a[col] - b[col] : String(a[col] ?? '').localeCompare(String(b[col] ?? ''))); rows = [...rows].sort((a, b) => cmp(a, b) * (dir === 'desc' ? -1 : 1)); }
      if (qs.$top) rows = rows.slice(0, Number(qs.$top));
      return { body: { value: structuredClone(rows) } };
    }
    if (method === 'POST' && itemId && h['X-HTTP-Method'] === 'MERGE') {
      const row = db[table].find((r) => String(r.ID) === itemId);
      if (!row) return { ok: false, statusCode: 404 };
      if (failMerge[table]) return { ok: false, statusCode: 503, message: 'simulated service failure on write' };
      if (claimHook) claimHook(row, db, table);
      { const bad = unknownColumn(table, body); if (bad) return { ok: false, statusCode: 400, message: `Column '${bad}' does not exist` }; }
      if (h['IF-MATCH'] !== row['odata.etag']) return { ok: false, statusCode: 412, message: "The request ETag value does not match the object's ETag value." };
      Object.assign(row, body); bump(row); return { statusCode: 204, body: null };
    }
    if (method === 'POST' && !itemId) {
      if (failCreate[table]) return { ok: false, statusCode: 500, message: 'simulated create failure' };
      { const bad = unknownColumn(table, body); if (bad) return { ok: false, statusCode: 400, message: `Column '${bad}' does not exist` }; }
      if (table === SEQ && db[table].some((r) => r.Title === body.Title)) return { ok: false, statusCode: 400, message: 'duplicate values were found in the following field(s) in the list: [Title]' };
      const row = { ID: ++id, ...body, 'odata.etag': '"1"', '@odata.etag': '"1"' }; db[table].push(row); return { statusCode: 201, body: structuredClone(row) };
    }
    throw new Error(`call not modelled: ${method} ${uri}`);
  };
  const connectors = {
    'shared_sharepointonline.GetItems': (p) => ({ body: { value: structuredClone((db[p.table] || []).filter((r) => match(p.table, r, p.$filter)).slice(0, p.$top || 100)) } }),
    'shared_sharepointonline.GetItem': (p) => { const r = (db[p.table] || []).find((x) => String(x.ID) === String(p.id)); return r ? { body: structuredClone(r) } : { ok: false, statusCode: 404 }; },
    'shared_sharepointonline.PostItem': (p) => {
      if (failCreate[p.table]) return { ok: false, statusCode: 400, message: 'simulated create failure' };
      const row = { ID: ++id, ...fields(p), 'odata.etag': '"1"', '@odata.etag': '"1"' }; (db[p.table] = db[p.table] || []).push(row); return { body: structuredClone(row) };
    },
    'shared_sharepointonline.PatchItem': (p) => { const r = (db[p.table] || []).find((x) => String(x.ID) === String(p.id)); if (!r) return { ok: false, statusCode: 404 }; Object.assign(r, fields(p)); bump(r); return { body: structuredClone(r) }; },
    'shared_sharepointonline.HttpRequest': http,
    'shared_sharepointonline.CreateFile': (p) => { (db.files = db.files || []).push({ folder: p.folderPath, name: p.name }); return { body: { Path: `${p.folderPath}/${p.name}`, ItemId: ++id } }; },
    'shared_office365.SendEmailV2': (p) => { (db.mail = db.mail || []).push(p); return { body: null }; },
    /* The registry inbox (FETCH_ALL, ITEM-74): the messages seeded as db.inbox, newest first, up to top. */
    'shared_office365.GetEmailsV3': (p) => ({ body: { value: (db.inbox || []).slice(0, p.top || 10) } }),
    /* The run-record scopes read their own flow's definition; nothing under test depends on it. */
    'shared_flowmanagement.GetFlow': () => ({ body: { name: 'flow', properties: { displayName: 'flow', definition: {} } } }),
  };
  /* A flow may name its connections with a suffix (shared_sharepointonline-1, shared_sharepointonline_2); the calls are the same. */
  for (const [k, v] of Object.entries({ ...connectors })) for (let n = 1; n <= 9; n++) { connectors[k.replace('.', `-${n}.`)] = v; connectors[k.replace('.', `_${n}.`)] = v; }
  return { db, calls, connectors };
}

/** The variables a flow declares above its pasted scope, with their initial values (expressions given type defaults). */
export function declaredVariables(capture) {
  const out = {};
  for (const a of Object.values(capture.Definition.actions)) {
    if (a.type !== 'InitializeVariable') continue;
    for (const v of a.inputs.variables) {
      /* Declared without a value: an array starts empty (the live flows append to such arrays), an object is null (the
         live flows coalesce such objects), a string is ''. */
      const t = String(v.type).toLowerCase();
      const dflt = { integer: 0, float: 0, boolean: false, string: '', array: [], object: {} }[t];
      if (!('value' in v)) out[v.name] = t === 'object' ? null : dflt;
      else out[v.name] = typeof v.value === 'string' && v.value.startsWith('@') ? dflt : v.value;
    }
  }
  return out;
}
