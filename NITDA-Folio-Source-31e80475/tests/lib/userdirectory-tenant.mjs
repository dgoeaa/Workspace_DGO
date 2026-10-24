/**
 * The in-memory Microsoft 365 / SharePoint tenant and run harness the UserDirectory sync is
 * simulated against. Shared by tests/userdirectory-sync.test.mjs and by replays of real exports
 * (which stay outside the repository — they carry staff data).
 */
import { readFileSync } from 'node:fs';
import { simulate } from '../../scripts/lib/wdl-sim.mjs';
import { pkg as built } from '../../scripts/build-userdirectory-sync.mjs';

export const USERDIR = '3d591f5b-3f2f-409c-983a-a77b5c174834';
export const AUDIT = 'be0c7af1-b21d-4efe-8c30-53fc55598d95';
export const SITE = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
export const TELEMETRY = '726c210d-09d5-45d9-952d-7a506b644b13';
export const COHORTS = 'ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2';
const ROOT = new URL('../../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));

export const spec = readJson('docs/reference/sharepoint-provisioning-spec.json');
export const fieldsOf = (title) => new Map(spec.fields.filter((f) => f.ListTitle === title).map((f) => [f.InternalName, f]));
export const portalSpec = readJson('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json');
export const telemetryList = portalSpec.lists.find((l) => l.listGuid === TELEMETRY);
export const LISTS = {
  [USERDIR]: fieldsOf('DGO_UserDirectory'),
  [AUDIT]: fieldsOf('DGO_AuditLog'),
  [COHORTS]: fieldsOf('DGO_PilotCohorts'),
  [TELEMETRY]: new Map(telemetryList.fields.map((f) => [f.internalName, { InternalName: f.internalName, Required: f.required ? 'Yes' : 'No', ChoiceValues: null }])),
};
export const SITE_OF = { [USERDIR]: SITE, [AUDIT]: SITE, [COHORTS]: SITE, [TELEMETRY]: telemetryList.siteUrl };
export const choicesOf = (f) => (Array.isArray(f.ChoiceValues) ? f.ChoiceValues : String(f.ChoiceValues || '').split(/[;,|]/).map((s) => s.trim()).filter(Boolean));

export const CHOICE = { [USERDIR]: ['Role', 'Persona', 'Status'], [AUDIT]: ['Severity'], [COHORTS]: ['Status'], [TELEMETRY]: [] };
export const REQUIRED = Object.fromEntries(Object.entries(LISTS).map(([g, f]) => [g, [...f.values()].filter((x) => x.Required === 'Yes').map((x) => x.InternalName)]));

export function tenant({ users, rows, failPatch = new Set(), failFlow = false, failAudit = false }) {
  const store = { [USERDIR]: [], [AUDIT]: [], [COHORTS]: [], [TELEMETRY]: [] };
  let nextId = 100;
  const toRow = (g, r) => ({ ...r });
  for (const r of rows) store[USERDIR].push({ ID: r.ID ?? nextId++, ...r });
  const out = { store, emails: [], attachments: [] };
  const view = (g, r) => {
    const v = { ...r, '{Link}': `${SITE}/Lists/x/DispForm.aspx?ID=${r.ID}` };
    for (const c of CHOICE[g]) if (r[c] !== undefined && r[c] !== null) v[c] = { '@odata.type': '#Microsoft.Azure.Connectors.SharePoint.SPListExpandedReference', Id: 0, Value: r[c] };
    return v;
  };
  const apply = (g, p, row, isNew) => {
    for (const [k, v] of Object.entries(p)) {
      if (!k.startsWith('item/')) continue;
      const col = k.slice(5).split('/')[0];
      if (col !== 'Title' && !LISTS[g].has(col)) return `Column '${col}' does not exist`;
      if (CHOICE[g].includes(col) && !choicesOf(LISTS[g].get(col)).includes(v)) return `'${v}' is not a valid choice for ${col}`;
      if (REQUIRED[g].includes(col) && (v === null || v === '' || v === undefined)) return `${col} is required`;
      row[col] = /At$/.test(col) && typeof v === 'string' ? v.replace(/\.\d+Z$/, 'Z') : v;
    }
    if (isNew) { const miss = REQUIRED[g].filter((c) => row[c] === undefined || row[c] === ''); if (miss.length) return `Required: ${miss.join(', ')}`; }
    return null;
  };
  out.connectors = {
    'shared_office365users.SearchUserV2': () => ({ body: { value: structuredClone(users) } }),
    'shared_sharepointonline.GetItems': (p) => {
      /* $filter support for the one shape the sync uses on a small list: Field eq 'value'. */
      const m = typeof p.$filter === 'string' && p.$filter.match(/^(\w+) eq '(.*)'$/);
      const rows = m ? store[p.table].filter((r) => String(r[m[1]] ?? '').toLowerCase() === m[2].replace(/''/g, "'").toLowerCase()) : store[p.table];
      return { body: { value: rows.map((r) => view(p.table, r)) } };
    },
    'shared_sharepointonline.PostItem': (p) => {
      if (p.table === AUDIT && failAudit) return { ok: false, message: 'The list is read-only' };
      const row = { ID: nextId++ }; const err = apply(p.table, p, row, true);
      if (err) return { ok: false, body: { status: 400, message: err }, message: err };
      store[p.table].push(row); return { body: view(p.table, row) };
    },
    'shared_sharepointonline.PatchItem': (p) => {
      const row = store[p.table].find((r) => String(r.ID) === String(p.id));
      if (!row) return { ok: false, body: { status: 404, message: `Item '${p.id}' not found` }, message: 'not found' };
      if (failPatch.has(row.UserId) || failPatch.has(p['item/UserId'])) return { ok: false, body: { status: 400, message: 'The item was changed by another user' }, message: 'conflict' };
      const next = { ...row }; const err = apply(p.table, p, next, false);
      if (err) return { ok: false, body: { status: 400, message: err }, message: err };
      Object.assign(row, next); return { body: view(p.table, row) };
    },
    'shared_sharepointonline.CreateAttachment': (p) => {
      const item = store[p.table].find((r) => String(r.ID) === String(p.itemId));
      if (!item) return { ok: false, message: 'item not found' };
      if (typeof p.body !== 'string') return { ok: false, message: 'attachment body is not text' };
      out.attachments.push({ itemId: item.ID, name: p.displayName, text: p.body });
      return { body: { Id: p.displayName } };
    },
    'shared_flowmanagement.GetFlow': () => (failFlow ? { ok: false, message: 'Forbidden' } : { body: { properties: {
      displayName: 'DGO User Directory Microsoft 365 Synchronization', state: 'Started',
      createdTime: '2026-07-01T08:00:00Z', lastModifiedTime: '2026-09-24T10:00:00Z',
      definition: { triggers: { Recurrence: { type: 'Recurrence' } }, actions: { Scope_Global: { type: 'Scope' } } },
      connectionReferences: { shared_sharepointonline: { connectionName: 'x' } },
      definitionSummary: { triggers: [{ type: 'Recurrence' }], actions: [{}, {}, {}] },
    } } }),
    'shared_office365.SendEmailV2': (p) => { out.emails.push(p); return { body: null }; },
  };
  void toRow;
  return out;
}

export function run(t, startIso, runId, pkg = built) {
  let ms = Date.parse(startIso);
  const sim = simulate(pkg, {
    variables: { RunId: runId, RequestId: `REQ-${runId}`, StartedAt: startIso, CreatedCount: 0, UpdatedCount: 0, DisabledCount: 0, SkippedCount: 0, Errors: [], DecisionLog: [] },
    connectors: t.connectors,
    workflow: { name: 'b1c2d3e4-0000-4000-8000-000000000001', run: { name: `085841${runId}` }, tags: { environmentName: 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1', flowDisplayName: 'DGO User Directory Microsoft 365 Synchronization' } },
    trigger: { name: 'Recurrence', startTime: startIso, scheduledTime: startIso, status: 'Succeeded', outputs: { headers: {} } },
    clock: () => new Date((ms += 7)).toISOString(),
  });
  return sim;
}

export const reportMail = (t) => t.emails.filter((m) => /^\[DGO\]/.test(m['emailMessage/Subject'])).at(-1);
export const telemetryMail = (t) => t.emails.filter((m) => /Flow Run Record/.test(m['emailMessage/Subject'])).at(-1);
export const byUserId = (t, id) => t.store[USERDIR].find((r) => r.UserId === id);
