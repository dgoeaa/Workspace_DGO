#!/usr/bin/env node
/**
 * Phase 1 of the identification system (IDENTIFICATION_SYSTEM.md §10, §13; decisions B2, B11),
 * generated from the catalogue.
 *
 *   npm run idprovision
 *   npm run idprovision -- --check
 *
 * Output, in docs/reference/identification/provisioning/:
 *   identity-provisioning.json     every column, list and Flow Configuration row Phase 1 adds
 *   scripts/identity-verify.browser.js     READ-ONLY: per list, required columns, index slots, item count,
 *                                  and which identity columns exist and how (B11)
 *   scripts/identity-provision.browser.js  adds the columns OPTIONAL and NON-UNIQUE, indexed (B2), creates the
 *                                  new lists and writes the Flow Configuration rows. A dry run unless
 *                                  called with { apply: true }. Never changes or deletes an existing column.
 *   README.md                      the runbook
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT = 'docs/reference/identification/provisioning';
const cat = JSON.parse(readFileSync(join(ROOT, 'docs/reference/identification/identifier-catalogue.json'), 'utf8'));
const TENANT = 'https://nitdanigeria.sharepoint.com/sites/';
const CONFIG_SITE = `${TENANT}NITDADGO-EAAACTIVITYTRACKING`;

/* Column types. Text lengths follow §10.1: keys 36, qualified keys 40, references 20. */
const T = (max, indexed = false) => ({ type: 'Text', max, indexed });
const COL = {
  EntityKey: T(36, true), ParentKey: T(40, true), RootKey: T(40, true), RootRef: T(20, true), SupersededBy: T(40),
  SubjectKey: T(40, true), FromKey: T(40, true), ToKey: T(40, true), EntityRef: T(40, true),
  AssigneeKey: T(40, true), RoutedOrgKey: T(40, true), ActorKey: T(40, true), AuthorKey: T(40), CurrentHolder: T(40, true),
  FromOrgKey: T(40), ToOrgKey: T(40),
  TaskRef: T(20, true), CaseRef: T(20, true), RegistryFileRef: T(20, true), ReferenceId: T(20, true), UnitKey: T(20, true),
  CorrelationId: T(36, true), CreatedByRequest: T(36), RequestId: T(36, true), ClientCorrelationId: T(64), ClientRequestHash: T(64, true),
  VoidReason: T(255), SourceLocator: T(255), Action: T(64, true), Process: T(16), ContractKey: T(40), RegistryKey: T(64),
  LinkMatchKey: T(255, true), Kind: T(40, true), System: T(24), Container: T(255), Value: T(255, true), MatchKey: T(255, true),
  MovementAction: T(64),
  Rev: { type: 'Number', indexed: false }, RevAfter: { type: 'Number', indexed: false },
  IdState: { type: 'Choice', choices: cat.idStates.map((s) => s.state), indexed: true },
  Direction: { type: 'Choice', choices: ['In', 'Out', 'Internal'], indexed: false },
  LinkType: { type: 'Choice', choices: cat.linkTypes.map((l) => l.code), indexed: true },
  EntryKind: { type: 'Choice', choices: ['LOCATOR', 'ALIAS'], indexed: true },
  Environment: { type: 'Choice', choices: cat.environments.map((e) => e.code), indexed: false },
  Decision: { type: 'Choice', choices: ['Pending', 'Approved', 'Rejected', 'Returned'], indexed: true },
  Ambiguous: { type: 'Boolean', indexed: true },
  AttachmentHashSet: { type: 'Note', indexed: false }, ValueLong: { type: 'Note', indexed: false },
  ValidFromUtc: { type: 'DateTime', indexed: false }, ValidToUtc: { type: 'DateTime', indexed: false },
};
const BASE = ['EntityKey', 'IdState', 'Rev', 'CorrelationId', 'CreatedByRequest'];
const EVENT = ['EntityKey', 'SubjectKey', 'RootKey', 'RootRef', 'Action', 'ActorKey', 'RequestId', 'CorrelationId', 'RevAfter', 'Process', 'ContractKey'];

/* Per dataset, the columns §10.2 adds, and existing columns that only need an index. */
const PLAN = {
  INTAKE_REGISTER: { add: [...BASE, 'SupersededBy', 'VoidReason', 'SourceLocator', 'Direction', 'AttachmentHashSet', 'ClientRequestHash'], index: ['SubmittedAtUtc'] },
  ATTACHMENTS: { add: ['EntityKey', 'ParentKey', 'RootKey', 'RootRef', 'IdState', 'Rev', 'CreatedByRequest'] },
  SCAN_LIBRARY: { add: ['EntityKey', 'ParentKey', 'RootKey', 'RootRef', 'IdState', 'Rev', 'CreatedByRequest'] },
  STATUS_TIMELINE: { add: EVENT },
  SUPPORT_CASES: { add: [...BASE, 'CaseRef', 'ClientRequestHash'] },
  TASK_QUEUE: { add: [...BASE, 'TaskRef', 'ParentKey', 'RootKey', 'RootRef', 'AssigneeKey', 'RoutedOrgKey', 'SupersededBy', 'ClientRequestHash'] },
  TASK_QUEUE_MIRROR: { add: [...BASE, 'TaskRef', 'ParentKey', 'RootKey', 'RootRef', 'AssigneeKey', 'RoutedOrgKey', 'SupersededBy', 'ClientRequestHash'] },
  OPS_WORKING_REGISTER: { add: ['EntityKey', 'ReferenceId', 'IdState'] },
  MINUTES: { add: ['EntityKey', 'ParentKey', 'RootKey', 'RootRef', 'AuthorKey', 'CreatedByRequest', 'ClientRequestHash'] },
  AI_TEXT_LOG: { add: EVENT },
  AUDIT_LOG: { add: EVENT },
  FLOW_TELEMETRY: { add: ['RequestId', 'CorrelationId', 'ClientCorrelationId', 'RegistryKey', 'ContractKey'] },
  ORG_DIRECTORY: { add: ['EntityKey', 'UnitKey', 'ParentKey', 'IdState'] },
  SEQUENCE_COUNTERS: { add: [], note: 'No new column. Counter rows for TASK and FILE are created by the first claim of each year (identification kit).' },
  USER_DIRECTORY: { add: [], note: 'No new column. UserId must hold the Entra object ID; the verifier lists rows whose UserId is not a GUID.' },
  FLOW_CONFIGURATION: { add: [], note: 'Receives the ENVIRONMENT_CODE and DATASET_* rows.' },
  ENDPOINT_REGISTRY: { add: [], note: 'No new column.' },
  FLOW_REGISTRY: { add: [], note: 'Provisioned by the governance registry provisioner (npm run test:governanceregistryprovisioner); not by this plan.' },
  FLOW_DEPENDENCIES: { add: [], note: 'Provisioned by the governance registry provisioner; not by this plan.' },
  RECORD_LINKS: { add: ['EntityKey', 'FromKey', 'ToKey', 'LinkType', 'LinkMatchKey', 'IdState', 'Rev', 'CreatedByRequest'] },
  IDENTITY_MAP: { add: ['EntityKey', 'EntityRef', 'EntryKind', 'Kind', 'System', 'Environment', 'Container', 'Value', 'ValueLong', 'MatchKey', 'Ambiguous', 'ValidFromUtc', 'ValidToUtc', 'IdState', 'Rev', 'CreatedByRequest'] },
  BRIEFS: { add: [...BASE, 'SupersededBy', 'ClientRequestHash'] },
  MEETINGS: { add: [...BASE, 'SupersededBy', 'ClientRequestHash'] },
  PROJECTS: { add: [...BASE, 'SupersededBy', 'ClientRequestHash'] },
  APPROVALS: { add: [...BASE, 'ParentKey', 'RootKey', 'RootRef', 'Decision', 'ClientRequestHash'] },
  REGISTRY_FILES: { add: [...BASE, 'RegistryFileRef', 'CurrentHolder', 'SupersededBy', 'ClientRequestHash'] },
  FILE_MOVEMENTS: { add: [...EVENT, 'FromOrgKey', 'ToOrgKey', 'MovementAction'] },
};

const missing = cat.datasets.filter((d) => !PLAN[d.key]).map((d) => d.key);
if (missing.length) { console.error(`no provisioning plan for: ${missing.join(', ')}`); process.exit(1); }
for (const [k, p] of Object.entries(PLAN)) for (const c of p.add) if (!COL[c]) { console.error(`${k}: unknown column ${c}`); process.exit(1); }

const plan = {
  generatedFrom: 'docs/reference/identification/identifier-catalogue.json',
  specVersion: cat.specVersion,
  rule: 'B2: every column is added optional and non-unique. Required and enforce-unique are switched on in Phase 6.',
  lists: cat.datasets.map((d) => ({
    datasetKey: d.key, title: d.list, site: TENANT + d.site, listGuid: d.listGuid, create: !!d.new, entityType: d.entityType,
    note: PLAN[d.key].note || null,
    addColumns: PLAN[d.key].add.map((name) => ({ name, ...COL[name], required: false, enforceUnique: false })),
    indexExisting: PLAN[d.key].index || [],
    phase6: PLAN[d.key].add.filter((n) => ['EntityKey', 'TaskRef', 'CaseRef', 'RegistryFileRef', 'LinkMatchKey', 'MatchKey'].includes(n))
      .map((n) => ({ name: n, required: n === 'EntityKey', enforceUnique: true })),
  })),
  flowConfiguration: {
    site: CONFIG_SITE, list: 'Flow Configuration',
    rows: [
      { Title: 'ENVIRONMENT_CODE', ConfigValue: 'prd', note: 'prd in production; uat or dev elsewhere. If missing, the kit issues Z-prefixed references.' },
      ...cat.datasets.flatMap((d) => [
        { Title: `DATASET_${d.key}_SITE_URL`, ConfigValue: TENANT + d.site },
        { Title: `DATASET_${d.key}_LIST_ID`, ConfigValue: d.listGuid || '(set after the list is created)' },
      ]),
    ],
  },
};

const JSONTXT = JSON.stringify(plan, null, 2) + '\n';

const verify = `/* Identification system, Phase 1: READ-ONLY verifier (decision B11).
 * Generated by npm run idprovision from identifier-catalogue.json. Do not edit by hand.
 *
 * Open any page of https://nitdanigeria.sharepoint.com signed in as a site owner, open the browser
 * console, paste this file and press Enter. It reads, and writes nothing. It prints, per list:
 * whether the list exists, its item count, its required columns, its indexed columns and free index
 * slots (SharePoint allows 20), and, for each identity column the plan adds, whether it exists, is
 * optional, is indexed and is unique. Save the table it prints with the Phase 1 evidence.
 */
(async () => {
  const PLAN = ${JSON.stringify(plan.lists.map((l) => ({ key: l.datasetKey, title: l.title, site: l.site, guid: l.listGuid, cols: l.addColumns.map((c) => ({ name: c.name, indexed: c.indexed })), index: l.indexExisting })))};
  const get = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json;odata=nometadata' }, credentials: 'include' }); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); };
  const rows = [];
  for (const l of PLAN) {
    const base = l.site + "/_api/web/lists" + (l.guid ? "(guid'" + l.guid + "')" : "/getbytitle('" + l.title.replace(/'/g, "''") + "')");
    try {
      const info = await get(base + '?$select=Title,ItemCount');
      const fields = (await get(base + '/fields?$select=InternalName,Required,Indexed,EnforceUniqueValues,Hidden,ReadOnlyField&$top=500')).value;
      const live = fields.filter((f) => !f.Hidden && !f.ReadOnlyField);
      const byName = Object.fromEntries(fields.map((f) => [f.InternalName, f]));
      const indexed = fields.filter((f) => f.Indexed).length;
      const cols = l.cols.map((c) => { const f = byName[c.name]; return c.name + ':' + (f ? (f.Required ? 'REQUIRED' : 'optional') + (f.Indexed ? '+idx' : (c.indexed ? '-NOIDX' : '')) + (f.EnforceUniqueValues ? '+unique' : '') : 'missing'); });
      rows.push({ dataset: l.key, list: info.Title, items: info.ItemCount, overThreshold: info.ItemCount > 5000, required: live.filter((f) => f.Required).map((f) => f.InternalName).join(', '), indexed, freeIndexSlots: 20 - indexed, indexesToAdd: l.cols.filter((c) => c.indexed && !(byName[c.name] && byName[c.name].Indexed)).length + l.index.filter((n) => !(byName[n] && byName[n].Indexed)).length, identityColumns: cols.join('  ') });
    } catch (e) { rows.push({ dataset: l.key, list: l.title, items: null, error: l.guid ? e.message : 'not created yet (' + e.message + ')' }); }
  }
  /* USER_DIRECTORY: UserId must be the Entra object ID (ID-15). */
  const ud = PLAN.find((l) => l.key === 'USER_DIRECTORY');
  try {
    const items = (await get(ud.site + "/_api/web/lists(guid'" + ud.guid + "')/items?$select=ID,UserId&$top=5000")).value;
    const bad = items.filter((i) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(i.UserId || '')));
    console.log('USER_DIRECTORY: ' + items.length + ' rows, ' + bad.length + ' whose UserId is not an Entra object ID' + (bad.length ? ' (item IDs ' + bad.slice(0, 20).map((i) => i.ID).join(', ') + (bad.length > 20 ? ', ...' : '') + ')' : ''));
  } catch (e) { console.warn('USER_DIRECTORY check failed: ' + e.message); }
  console.table(rows);
  const short = rows.filter((r) => r.freeIndexSlots !== undefined && r.indexesToAdd > r.freeIndexSlots);
  if (short.length) console.warn('Not enough free index slots on: ' + short.map((r) => r.dataset).join(', '));
  window.IDENTITY_VERIFY_RESULT = rows;
  console.log('Copy the result with: copy(JSON.stringify(window.IDENTITY_VERIFY_RESULT, null, 2))');
})();
`;

const provision = `/* Identification system, Phase 1: provisioning (decision B2).
 * Generated by npm run idprovision from identifier-catalogue.json. Do not edit by hand.
 *
 * Run identity-verify.browser.js first and keep its output.
 *
 * Paste this file into the browser console on https://nitdanigeria.sharepoint.com, signed in as a site
 * owner. It defines IDENTITY_PROVISION and does nothing else. Then:
 *   await IDENTITY_PROVISION.run()               dry run: prints every change it would make
 *   await IDENTITY_PROVISION.run({ apply: true }) makes them
 * It only ADDS: missing columns (optional, non-unique), indexes on columns that lack one, the new lists,
 * and missing Flow Configuration rows. It never changes or deletes an existing column, list, row or item,
 * so running it twice changes nothing the second time.
 */
window.IDENTITY_PROVISION = (() => {
  const PLAN = ${JSON.stringify(plan)};
  const xmlFor = (c) => {
    const a = 'DisplayName="' + c.name + '" Name="' + c.name + '" StaticName="' + c.name + '" Required="FALSE" EnforceUniqueValues="FALSE"';
    if (c.type === 'Text') return '<Field Type="Text" ' + a + ' MaxLength="' + c.max + '" />';
    if (c.type === 'Number') return '<Field Type="Number" ' + a + ' Decimals="0" />';
    if (c.type === 'Boolean') return '<Field Type="Boolean" ' + a + '><Default>0</Default></Field>';
    if (c.type === 'DateTime') return '<Field Type="DateTime" ' + a + ' Format="DateTime" />';
    if (c.type === 'Note') return '<Field Type="Note" ' + a + ' NumLines="4" RichText="FALSE" />';
    if (c.type === 'Choice') return '<Field Type="Choice" ' + a + ' Format="Dropdown"><CHOICES>' + c.choices.map((x) => '<CHOICE>' + x + '</CHOICE>').join('') + '</CHOICES></Field>';
    throw new Error('type ' + c.type);
  };
  async function digest(site) { const r = await fetch(site + '/_api/contextinfo', { method: 'POST', headers: { Accept: 'application/json;odata=nometadata' }, credentials: 'include' }); return (await r.json()).FormDigestValue; }
  async function call(site, method, path, body, extra) {
    const headers = Object.assign({ Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', 'X-RequestDigest': await digest(site) }, extra || {});
    const r = await fetch(site + path, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status + ' ' + method + ' ' + path + ': ' + (await r.text()).slice(0, 300));
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  const get = (site, path) => fetch(site + path, { headers: { Accept: 'application/json;odata=nometadata' }, credentials: 'include' }).then((r) => (r.ok ? r.json() : null));

  async function run({ apply = false } = {}) {
    const log = [];
    const act = async (what, fn) => { log.push({ apply, what }); if (apply) await fn(); };
    for (const l of PLAN.lists) {
      if (!l.addColumns.length && !l.indexExisting.length && !l.create) continue;
      let ref = l.listGuid ? "/_api/web/lists(guid'" + l.listGuid + "')" : "/_api/web/lists/getbytitle('" + l.title.replace(/'/g, "''") + "')";
      let exists = await get(l.site, ref + '?$select=Id');
      if (!exists) {
        if (!l.create) { log.push({ apply, what: 'SKIP ' + l.datasetKey + ': list not found and not a new list' }); continue; }
        await act('CREATE LIST ' + l.title + ' on ' + l.site, () => call(l.site, 'POST', '/_api/web/lists', { BaseTemplate: 100, Title: l.title, Description: 'Identification system dataset ' + l.datasetKey }));
        if (!apply) { l.addColumns.forEach((c) => log.push({ apply, what: '  ADD ' + l.title + '.' + c.name + (c.indexed ? ' (indexed)' : '') })); continue; }
        exists = await get(l.site, ref + '?$select=Id');
      }
      const fields = ((await get(l.site, ref + '/fields?$select=InternalName,Indexed&$top=500')) || { value: [] }).value;
      const have = Object.fromEntries(fields.map((f) => [f.InternalName, f]));
      for (const c of l.addColumns) {
        if (!have[c.name]) await act('ADD ' + l.datasetKey + '.' + c.name + ' ' + c.type, () => call(l.site, 'POST', ref + '/fields/CreateFieldAsXml', { parameters: { SchemaXml: xmlFor(c), Options: 8 } }));
        if (c.indexed && !(have[c.name] && have[c.name].Indexed)) await act('INDEX ' + l.datasetKey + '.' + c.name, () => call(l.site, 'POST', ref + "/fields/getbyinternalnameortitle('" + c.name + "')", { Indexed: true }, { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' }));
      }
      for (const n of l.indexExisting) {
        if (have[n] && !have[n].Indexed) await act('INDEX ' + l.datasetKey + '.' + n + ' (existing column)', () => call(l.site, 'POST', ref + "/fields/getbyinternalnameortitle('" + n + "')", { Indexed: true }, { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' }));
      }
    }
    const fc = PLAN.flowConfiguration;
    const cfgRef = "/_api/web/lists/getbytitle('" + fc.list + "')";
    const rows = ((await get(fc.site, cfgRef + '/items?$select=Title&$top=5000')) || { value: [] }).value.map((r) => r.Title);
    for (const r of fc.rows) {
      if (rows.includes(r.Title)) continue;
      let value = r.ConfigValue;
      if (value.startsWith('(set after')) {
        const l = PLAN.lists.find((x) => 'DATASET_' + x.datasetKey + '_LIST_ID' === r.Title);
        const found = apply ? await get(l.site, "/_api/web/lists/getbytitle('" + l.title.replace(/'/g, "''") + "')?$select=Id") : null;
        value = found ? found.Id : value;
      }
      await act('CONFIG ' + r.Title + ' = ' + value, () => call(fc.site, 'POST', cfgRef + '/items', { Title: r.Title, ConfigValue: value }));
    }
    console.table(log);
    console.log(apply ? 'Applied ' + log.length + ' changes. Run identity-verify.browser.js again and keep its output.' : 'Dry run: ' + log.length + ' changes. Run with { apply: true } to make them.');
    return log;
  }
  /* Phase 6, before any unique constraint is switched on: does this tenant accept several blank values
     in an enforce-unique column? Creates a throwaway list, tests, and deletes that list. It touches no
     other list. Call it explicitly: await IDENTITY_PROVISION.probeUniqueBlanks('<site url>'). */
  async function probeUniqueBlanks(site) {
    const title = 'ZZ_IdentityProbe_' + Date.now();
    await call(site, 'POST', '/_api/web/lists', { BaseTemplate: 100, Title: title });
    const ref = "/_api/web/lists/getbytitle('" + title + "')";
    let result;
    try {
      await call(site, 'POST', ref + '/fields/CreateFieldAsXml', { parameters: { SchemaXml: '<Field Type="Text" DisplayName="Probe" Name="Probe" StaticName="Probe" MaxLength="20" Indexed="TRUE" EnforceUniqueValues="TRUE" />', Options: 8 } });
      await call(site, 'POST', ref + '/items', { Title: 'a' });
      try { await call(site, 'POST', ref + '/items', { Title: 'b' }); result = 'ACCEPTS several blank values: ReferenceId can be enforce-unique.'; }
      catch (e) { result = 'REFUSES a second blank value: ReferenceId stays non-unique; uniqueness rests on the counter claim and the sequence audit.'; }
    } finally {
      await call(site, 'POST', ref, null, { 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' });
    }
    console.log('Unique-blank probe: ' + result);
    return result;
  }
  return Object.freeze({ run, probeUniqueBlanks, plan: PLAN });
})();
`;

const counts = plan.lists.reduce((a, l) => (a + l.addColumns.length), 0);
const README = `# Identification system: Phase 1 provisioning

**Generated by \`npm run idprovision\` from \`identifier-catalogue.json\`. Do not edit by hand.**

Phase 1 of [IDENTIFICATION_SYSTEM.md](../IDENTIFICATION_SYSTEM.md) §13: ${plan.lists.length} datasets, ${plan.lists.filter((l) => l.create).length} of them new lists,
${counts} columns in all, and ${plan.flowConfiguration.rows.length} Flow Configuration rows.

## Order

1. **Verify (read-only).** Paste \`scripts/identity-verify.browser.js\` into the browser console on
   https://nitdanigeria.sharepoint.com, signed in as a site owner. Keep the table it prints. It shows, per
   list, the required columns, the item count, the free index slots (SharePoint allows 20) and the state
   of every identity column. If a list has fewer free slots than indexes to add, stop and decide with the
   Platform Engineering Lead which existing index to drop.
2. **Dry run.** Paste \`scripts/identity-provision.browser.js\`, then \`await IDENTITY_PROVISION.run()\`. It prints
   every change and makes none.
3. **Apply.** \`await IDENTITY_PROVISION.run({ apply: true })\`. It only adds: missing columns (optional,
   non-unique), missing indexes, the new lists and missing Flow Configuration rows. Running it again
   changes nothing.
4. **Verify again** and keep both outputs as the Phase 1 evidence.

## Rules this follows

- **B2.** Every column is added **optional and non-unique**, so the flows that write these lists today
  keep working. Required and enforce-unique are switched on in Phase 6 (\`phase6\` in
  \`identity-provisioning.json\`).
- **Lists over 5,000 items** (DGO DIGITAL OPS, Global Tracking Queue): SharePoint may queue the index
  build. The verifier shows whether each index exists; the Phase 5 backfill waits until it does.
- **Unique and blank values.** Whether a unique column accepts several blank values can only be learned
  by writing, so the read-only verifier does not try. In Phase 6, before any constraint is switched on,
  \`await IDENTITY_PROVISION.probeUniqueBlanks('<site url>')\` creates a throwaway list, tests it, and
  deletes that list. Nothing in Phase 1 depends on the answer.

## What each list receives

| Dataset | List | New list | Columns added | Indexes |
|---|---|---|---|---|
${plan.lists.map((l) => `| \`${l.datasetKey}\` | ${l.title} | ${l.create ? 'yes' : ''} | ${l.addColumns.map((c) => c.name).join(', ') || (l.note || '—')} | ${l.addColumns.filter((c) => c.indexed).length + l.indexExisting.length} |`).join('\n')}
`;

/* Browser scripts live in scripts/ with every other *.browser.js (tests/single-source-of-truth.test.mjs);
   the plan and runbook live beside the specification. */
const files = { [`${OUT}/identity-provisioning.json`]: JSONTXT, 'scripts/identity-verify.browser.js': verify, 'scripts/identity-provision.browser.js': provision, [`${OUT}/README.md`]: README };
let stale = 0;
if (!CHECK) mkdirSync(join(ROOT, OUT), { recursive: true });
for (const [n, t] of Object.entries(files)) {
  const p = join(ROOT, n);
  if (CHECK) { if (!existsSync(p) || readFileSync(p, 'utf8') !== t) { console.error(`stale: ${n}`); stale++; } }
  else writeFileSync(p, t);
}
if (CHECK && stale) { console.error('Run: npm run idprovision'); process.exit(1); }
console.log(`identification provisioning: ${Object.keys(files).length} files ${CHECK ? 'up to date' : 'written'} (${plan.lists.length} datasets, ${counts} columns)`);
