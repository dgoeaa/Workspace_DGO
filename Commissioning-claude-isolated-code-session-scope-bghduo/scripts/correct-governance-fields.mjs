#!/usr/bin/env node
/**
 * Apply GOV-08 and GOV-03 to the governance provisioning specification.
 *
 * GOV-08 — ONE COLUMN SHAREPOINT WILL NEVER LET THE ESTATE OWN
 *
 * `ScopeId` is a SharePoint system field name: every list carries a hidden one holding the item's
 * security scope. The specification declared a custom Text column of that name, so the
 * provisioner's presence check answered yes against SharePoint's own field, reported the column
 * present, and never created the specification's. The live run of 2026-09-09 then failed on both
 * operations that touched it: indexing a system field returns 500, and filtering a Guid-typed
 * system field against the string `'all'` returns 500 "List does not exist."
 *
 * IT WAS ONE COLUMN, NOT THREE. `Version` was added to the same list on the strength of this
 * finding and without checking it. The tenant disproved it: `DGO_RoleCatalogue.Version` and
 * `DGO_EndpointRegistry.Version` are ordinary custom columns, populated and working. Generalising
 * from one confirmed case to a category is how a fix becomes churn — see WITHDRAWN below.
 *
 * That was first recorded as a damaged list (GOV-07) and it was not. The list loads normally,
 * and its view shows a column titled **Access Scope Id** — the tenant's real custom column,
 * under a different internal name, created by someone who hit the same collision and worked
 * around it by hand.
 *
 * So the renames here are not inventions. `AccessScopeId` carries the display name the tenant
 * already shows, which is what lets the provisioner ADOPT the existing column rather than
 * create a second one beside it.
 *
 * GOV-03 — A LIST COLUMN THAT WOULD HOLD A BEARER CREDENTIAL
 *
 * `DGO_EndpointRegistry.FlowUrl` is declared as a Note column for the Power Automate endpoint
 * URL. A signed trigger URL IS the credential: possession alone authorises invoking the flow. A
 * list column holding one hands every reader of that list every endpoint, and SharePoint list
 * read access is ordinarily far wider than Power Automate maker access.
 *
 * The correct design already exists in this estate — `DGO_HTTPFlowRegistry` stores
 * `EndpointRedacted` and `EndpointFingerprint` and never the raw URL. This brings the older list
 * onto it: `FlowUrl` becomes `EndpointRedacted` (everything before the `?`, so no query string
 * and therefore no `sig=`), and `EndpointFingerprint` is added.
 *
 * WHY A SCRIPT AND NOT AN EDIT
 *
 * The specification is an extraction from a workbook. A hand-edit is invisible to anyone reading
 * it later and cannot be re-applied when the workbook is re-extracted. This is idempotent and
 * carries a `--check`, so the corrections are a property of the repository rather than something
 * that happened once.
 *
 *   npm run governance:correctfields              # apply
 *   npm run governance:correctfields -- --check   # fail if the spec is not corrected
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

/**
 * GOV-08 renames. `display` is what an operator sees, and for AccessScopeId it is deliberately
 * the name the tenant already carries — adopting a column beats creating a rival to it.
 */
const RENAMES = [
  { list: 'DGO_AccessScopes', from: 'ScopeId', to: 'AccessScopeId', display: 'Access Scope Id' },
];

/**
 * TWO RENAMES WERE WITHDRAWN, AND THE TENANT IS WHY.
 *
 * `DGO_RoleCatalogue.Version` and `DGO_EndpointRegistry.Version` were renamed here on the
 * strength of the ScopeId finding — a reserved-name list assembled from one confirmed case. The
 * tenant then answered the question directly. Both columns are `FromBaseType=false`,
 * `CanBeDeleted=true` — genuine custom columns — and both are fully populated by an earlier
 * provisioning: 'R11.6-PILOT' on all six role rows, 'document-portal.1' on all six registry rows.
 * They were never a collision. `Version` is not a reserved internal name on an ordinary list;
 * SharePoint's own version field is `_UIVersionString`.
 *
 * So the rename was churn, and acting on it would have migrated live data and deleted a working,
 * required column to no purpose. Renaming a populated column for cosmetic clarity is not worth a
 * migration; renaming it on a premise the tenant disproves is worse.
 *
 * They are listed here rather than deleted from the file because the revert pass below needs to
 * know they were once applied — a specification that has already been renamed cannot be corrected
 * by a rule keyed on the old name.
 */
const WITHDRAWN = [
  { list: 'DGO_RoleCatalogue', was: 'CatalogueVersion', restore: 'Version', display: 'Version' },
  { list: 'DGO_EndpointRegistry', was: 'EndpointVersion', restore: 'Version', display: 'Version' },
];

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const changes = [];

/**
 * Set one attribute of a SchemaXml string.
 *
 * THE BUG THIS EXISTS TO KILL. This was three chained `.replace()` calls, the last of them
 * `/Name='[^']*'/`. That pattern has no left boundary, so its first match in
 *
 *     <Field DisplayName='Catalogue Version' StaticName='CatalogueVersion' Name='Version' />
 *
 * is the tail of **DisplayName**, not the standalone `Name` attribute. The rename therefore
 * rewrote DisplayName a second time — collapsing 'Catalogue Version' to 'CatalogueVersion' —
 * and left `Name='Version'` untouched. `createfieldasxml` is called with Options 24, and 8 of
 * that is AddFieldInternalNameHint: SharePoint takes the internal name from `Name`. So the
 * column the specification believed it was renaming would have been created under the reserved
 * name after all — silently, reported as CREATED, which is the exact defect GOV-08 records.
 *
 * The lookbehind is the whole fix: `Name` must not be preceded by a letter.
 */
const setAttr = (xml, attr, value) =>
  new RegExp(`(?<![A-Za-z])${attr}='[^']*'`).test(xml)
    ? xml.replace(new RegExp(`(?<![A-Za-z])${attr}='[^']*'`), `${attr}='${value}'`)
    : xml.replace(/^<Field /, `<Field ${attr}='${value}' `);

/** All three names SharePoint reads, forced to agree with the field they belong to. */
const alignSchema = (field) =>
  setAttr(setAttr(setAttr(String(field.SchemaXml), 'DisplayName', field.DisplayName),
    'StaticName', field.InternalName), 'Name', field.InternalName);

/* ── withdraw the renames the tenant disproved ────────────────────────────────────────── */

for (const w of WITHDRAWN) {
  const field = (spec.fields || []).find((f) => f.ListTitle === w.list && f.InternalName === w.was);
  if (!field) continue;
  field.InternalName = w.restore;
  field.DisplayName = w.display;
  delete field.RenamedFrom;
  delete field.RenameReason;
  field.SchemaXml = alignSchema(field);
  changes.push(`${w.list}.${w.was} → ${w.restore} (rename withdrawn — the column was never reserved)`);

  for (const s of spec.seedItems || []) {
    if (s.ListTitle !== w.list) continue;
    if (s.KeyField === w.was) { s.KeyField = w.restore; changes.push(`seed ${s.SeedId}: KeyField → ${w.restore}`); }
    const payload = JSON.parse(s.FieldsJson);
    if (Object.prototype.hasOwnProperty.call(payload, w.was)) {
      const rebuilt = {};
      for (const [k, v] of Object.entries(payload)) rebuilt[k === w.was ? w.restore : k] = v;
      s.FieldsJson = JSON.stringify(rebuilt, null, 2);
      changes.push(`seed ${s.SeedId}: payload field ${w.was} → ${w.restore}`);
    }
    const filterRe = new RegExp(`(?<![A-Za-z0-9_])${w.was} eq`);
    if (s.CheckItemUri && filterRe.test(s.CheckItemUri)) {
      s.CheckItemUri = s.CheckItemUri.replace(filterRe, `${w.restore} eq`);
    }
  }
}

/* ── GOV-08: rename the three, and everything that references them ────────────────────── */

for (const r of RENAMES) {
  const field = (spec.fields || []).find((f) => f.ListTitle === r.list && f.InternalName === r.from);
  if (field) {
    field.InternalName = r.to;
    field.DisplayName = r.display;
    field.SchemaXml = alignSchema(field);
    field.RenamedFrom = r.from;
    field.RenameReason = `GOV-08: '${r.from}' is a SharePoint reserved field name on every list.`;
    changes.push(`${r.list}.${r.from} → ${r.to} ("${r.display}")`);
  }

  /* Seed rows key on the field and carry it in their payload. A rename that stops at the field
     definition leaves the seed writing to a column that no longer exists — and the seed check
     filtering on one, which is exactly the 500 this correction exists to remove. */
  for (const s of spec.seedItems || []) {
    if (s.ListTitle !== r.list) continue;
    if (s.KeyField === r.from) { s.KeyField = r.to; changes.push(`seed ${s.SeedId}: KeyField → ${r.to}`); }
    const payload = JSON.parse(s.FieldsJson);
    if (Object.prototype.hasOwnProperty.call(payload, r.from)) {
      const rebuilt = {};
      for (const [k, v] of Object.entries(payload)) rebuilt[k === r.from ? r.to : k] = v;
      s.FieldsJson = JSON.stringify(rebuilt, null, 2);
      changes.push(`seed ${s.SeedId}: payload field ${r.from} → ${r.to}`);
    }
    /* Word-anchored. A bare `includes('ScopeId eq')` also matches `AccessScopeId eq`, so a
       second run rewrote the already-renamed filter into `AccessAccessScopeId eq` — the rename
       ate its own output and the script stopped being idempotent. The boundary is what stops a
       prefix of the new name matching the old one. */
    const filterRe = new RegExp(`(?<![A-Za-z0-9_])${r.from} eq`);
    if (s.CheckItemUri && filterRe.test(s.CheckItemUri)) {
      s.CheckItemUri = s.CheckItemUri.replace(filterRe, `${r.to} eq`);
    }
  }
}

/* ── GOV-03: no list column may hold a signed trigger URL ─────────────────────────────── */

const registryFields = (spec.fields || []).filter((f) => f.ListTitle === 'DGO_EndpointRegistry');
const flowUrl = registryFields.find((f) => f.InternalName === 'FlowUrl');
if (flowUrl) {
  flowUrl.InternalName = 'EndpointRedacted';
  flowUrl.DisplayName = 'Endpoint (redacted)';
  flowUrl.SchemaXml = alignSchema(flowUrl);
  flowUrl.RenamedFrom = 'FlowUrl';
  flowUrl.RenameReason =
    'GOV-03: a signed trigger URL is a bearer credential. This column holds the endpoint with its '
    + 'query string removed — everything before the "?" — so it cannot carry a sig.';
  flowUrl.ValueRule = 'first(split(endpoint, \'?\')) — never the raw URL, never a query string.';
  changes.push('DGO_EndpointRegistry.FlowUrl → EndpointRedacted (GOV-03)');
}

if (!registryFields.some((f) => f.InternalName === 'EndpointFingerprint')) {
  const anchor = registryFields.find((f) => f.InternalName === 'EndpointRedacted') ?? registryFields[0];
  const order = Number(anchor?.FieldOrderInList ?? 0);
  /* Renumber the rows after the anchor so the new column has a place rather than a duplicate
     ordinal — the emitted provisioner sorts on this. */
  for (const f of registryFields) {
    if (Number(f.FieldOrderInList) > order) f.FieldOrderInList = Number(f.FieldOrderInList) + 1;
  }
  spec.fields.push({
    FieldId: `${anchor?.FieldId ?? 'DGO_EndpointRegistry'}-fingerprint`,
    ListTitle: 'DGO_EndpointRegistry',
    FieldOrderInList: order + 1,
    InternalName: 'EndpointFingerprint',
    DisplayName: 'Endpoint fingerprint',
    FieldType: 'Text',
    Required: false,
    Indexed: false,
    SchemaXml: "<Field Type='Text' DisplayName='Endpoint fingerprint' StaticName='EndpointFingerprint' Name='EndpointFingerprint' MaxLength='255' />",
    TargetSite: anchor?.TargetSite,
    ListGuid: anchor?.ListGuid,
    FieldsUri: anchor?.FieldsUri,
    CreateFieldUri: anchor?.CreateFieldUri,
    CheckFieldUri: anchor?.CheckFieldUri
      ? String(anchor.CheckFieldUri).replace(/InternalName eq '[^']*'/, "InternalName eq 'EndpointFingerprint'")
      : undefined,
    AddedBy: 'scripts/correct-governance-fields.mjs',
    AddedReason:
      'GOV-03: identifies an endpoint without carrying it. Mirrors DGO_HTTPFlowRegistry, which '
      + 'stores EndpointRedacted and EndpointFingerprint and never the raw URL.',
  });
  changes.push('DGO_EndpointRegistry: added EndpointFingerprint (GOV-03)');
}

/* ── every field's SchemaXml must agree with the field ────────────────────────────────────
 *
 * Not only the renamed ones, and not only on the run that renames them. The rename branches
 * above are keyed on the OLD internal name, so once a rename has been applied they never fire
 * again — which meant a SchemaXml corrupted by the old chained-replace stayed corrupted through
 * every subsequent run and every --check. This pass is unconditional and is what makes the
 * agreement a property of the specification rather than of one execution.
 */
for (const f of spec.fields || []) {
  if (!f.SchemaXml) continue;
  const aligned = alignSchema(f);
  if (aligned !== f.SchemaXml) {
    f.SchemaXml = aligned;
    changes.push(`${f.ListTitle}.${f.InternalName}: SchemaXml realigned to the field`);
  }
}

/* ── provenance ───────────────────────────────────────────────────────────────────────── */

const stamp = {
  appliedBy: 'scripts/correct-governance-fields.mjs',
  appliedUtc: '2026-09-09',
  corrections: {
    'GOV-08': RENAMES.map((r) => `${r.list}.${r.from} → ${r.to}`),
    'GOV-08-withdrawn': WITHDRAWN.map((w) => `${w.list}.${w.restore} kept — never a reserved name`),
    'GOV-03': ['DGO_EndpointRegistry.FlowUrl → EndpointRedacted', 'DGO_EndpointRegistry + EndpointFingerprint'],
  },
  note:
    'ScopeId and Version are SharePoint reserved field names; the columns under those names were '
    + 'never created and the provisioner reported the system fields as present. FlowUrl would have '
    + 'held a bearer credential in a list whose read access is wider than Power Automate maker '
    + 'access. Where the tenant already carries a column for the renamed data — Access Scope Id — '
    + 'the provisioner adopts it rather than creating a rival.',
};
if (JSON.stringify(spec.governanceFieldCorrections) !== JSON.stringify(stamp)) {
  spec.governanceFieldCorrections = stamp;
  changes.push('recorded the GOV-03 and GOV-08 corrections in the spec');
}

const rendered = JSON.stringify(spec, null, 2) + '\n';
const previous = fs.readFileSync(SPEC, 'utf8');

console.log('\nGovernance field corrections — GOV-03 and GOV-08\n');
console.log(`  changes applied  ${changes.length}\n`);
for (const c of changes) console.log(`    ${c}`);
console.log('');

if (CHECK) {
  if (rendered !== previous) fail('the specification is not corrected. Run: npm run governance:correctfields');
  console.log('  ✅ the specification carries the GOV-03 and GOV-08 corrections\n');
  process.exit(0);
}

fs.writeFileSync(SPEC, rendered);
console.log(`  ✅ wrote ${path.relative(ROOT, SPEC)}\n`);
