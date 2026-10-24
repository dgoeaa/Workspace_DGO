#!/usr/bin/env node
/**
 * Repoint the governance provisioning specification onto the authoritative site, by GUID.
 *
 * GOV-01 is approved: `DGO_ECM_GOVERNANCE` is the single authoritative site for all ten
 * governance lists. This applies that decision to
 * `docs/reference/sharepoint-provisioning-spec.json`, which targeted
 * `NITDADGO-EAAACTIVITYTRACKING` while the internal flows read `DGO_ECM_GOVERNANCE`.
 *
 * TWO CHANGES, AND THE SECOND MATTERS MORE THAN THE FIRST.
 *
 *   1. `TargetSite` on every list row becomes the authoritative site. That closes GOV-01 —
 *      provisioning and consumption finally name one place.
 *
 *   2. Every address becomes GUID-based. `getByTitle('DGO_AuditLog')` is what produced the
 *      duplicate estate: run it against a site where the title already exists and SharePoint
 *      mints `DGO_AuditLog_2` rather than failing. `lists(guid'…')` cannot do that — a wrong
 *      GUID is a 404, which is a failure you can see. Fixing only the site would leave the
 *      mechanism that caused GOV-02 in place, and the next run would duplicate the lists onto
 *      the authoritative site instead.
 *
 * `NITDADGO-EAAACTIVITYTRACKING` is NOT wrong in general — it legitimately hosts the
 * correspondence and tracking lists. Only the ten governance rows move, and only they are
 * touched here.
 *
 * Idempotent: running it twice changes nothing the second time.
 *
 *   npm run governance:repoint             # apply
 *   npm run governance:repoint -- --check  # fail if the spec is not already repointed (CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'docs/reference/sharepoint-provisioning-spec.json');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

if (!fs.existsSync(REGISTRY)) fail('docs/reference/governance-list-registry.json is missing. Run: npm run governance:registry');
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

const byTitle = new Map(registry.lists.map((l) => [l.listTitle, l]));
const SITE = registry.decision.authoritativeSite;

const changes = [];

/* ── list rows ────────────────────────────────────────────────────────────────────────── */

for (const row of spec.lists || []) {
  const auth = byTitle.get(row.ListTitle);
  if (!auth) fail(`${row.ListTitle} is in the provisioning spec but not in the governance registry.`);
  if (row.TargetSite !== SITE) {
    changes.push(`${row.ListTitle}: TargetSite ${String(row.TargetSite).split('/sites/')[1]} → ${SITE.split('/sites/')[1]}`);
    row.TargetSite = SITE;
  }
  if (row.ListGuid !== auth.listGuid) {
    changes.push(`${row.ListTitle}: ListGuid → ${auth.listGuid}`);
    row.ListGuid = auth.listGuid;
  }
  /* The create-list URI is retained but marked, because these lists all exist: creating them is
     no longer the operation, and a spec that still says "create" invites a run that duplicates. */
  if (row.PowerAutomateCreateListUri !== auth.listUri) {
    changes.push(`${row.ListTitle}: address by GUID, not title`);
    row.PowerAutomateCreateListUri = auth.listUri;
  }
  if (row.ProvisioningMode !== 'update-in-place') {
    row.ProvisioningMode = 'update-in-place';
    row.ProvisioningNote =
      'All ten lists exist. This spec updates fields and seeds in place and never creates a '
      + 'list: creation by title is what produced the duplicate estate recorded as GOV-02.';
    changes.push(`${row.ListTitle}: ProvisioningMode → update-in-place`);
  }
}

/* ── field rows ───────────────────────────────────────────────────────────────────────── */

for (const f of spec.fields || []) {
  const auth = byTitle.get(f.ListTitle);
  if (!auth) continue;
  if (f.TargetSite !== SITE) { f.TargetSite = SITE; }
  if (f.ListGuid !== auth.listGuid) { f.ListGuid = auth.listGuid; }
  if (f.FieldsUri !== auth.fieldsUri) { f.FieldsUri = auth.fieldsUri; }
  const createField = `${auth.fieldsUri}/createfieldasxml`;
  if (f.CreateFieldUri !== createField) {
    if (!changes.some((c) => c.startsWith('field URIs'))) changes.push('field URIs addressed by GUID');
    f.CreateFieldUri = createField;
  }
  /* Preserve the per-field filter, re-hosted on the GUID address. */
  const q = String(f.CheckFieldUri || '').split('/fields')[1] || '';
  const checkField = `${auth.fieldsUri.replace(/\/fields$/, '')}/fields${q}`;
  if (f.CheckFieldUri !== checkField) { f.CheckFieldUri = checkField; }
}

/* ── the operative Power Automate action URIs ─────────────────────────────────────────────
 *
 * These four are the ones a run actually issues, and they interpolate a list TITLE from the
 * loop item. That is the exact call shape that minted the duplicates. Each loop item now
 * carries a `listGuid`, emitted in the list rows above, so the action addresses the list it
 * means rather than the first list with a matching name on whichever site it is pointed at. */
const ACTION_URI = {
  SP_Check_Field: "_api/web/lists(guid'@{items('Apply_to_each_field')?['listGuid']}')/fields?$select=InternalName&$filter=InternalName eq '@{items('Apply_to_each_field')?['internalName']}'",
  SP_Create_Field: "_api/web/lists(guid'@{items('Apply_to_each_field')?['listGuid']}')/fields/createfieldasxml",
  SP_Check_Seed_Item: null,   // filled below: its filter is built from the seed row
  SP_Create_Seed_Item: "_api/web/lists(guid'@{items('Apply_to_each_seed')?['listGuid']}')/items",
};
for (const a of spec.powerAutomateActions || []) {
  if (!(a.ActionName in ACTION_URI)) continue;
  let next = ACTION_URI[a.ActionName];
  if (a.ActionName === 'SP_Check_Seed_Item') {
    const q = String(a.Uri || '').split('/items')[1] || '';
    next = `_api/web/lists(guid'@{items('Apply_to_each_seed')?['listGuid']}')/items${q}`;
  }
  if (a.Uri !== next) {
    changes.push(`action ${a.StepOrder} ${a.ActionName}: addressed by GUID`);
    a.Uri = next;
  }
}

/* ── seed rows ────────────────────────────────────────────────────────────────────────── */

for (const s of spec.seedItems || []) {
  const auth = byTitle.get(s.ListTitle);
  if (!auth) fail(`seed ${s.SeedId} names ${s.ListTitle}, which is not a governance list.`);
  const create = auth.createItemUri;
  if (s.CreateItemUri !== create) {
    changes.push(`seed ${s.SeedId} (${s.ListTitle}): create URI addressed by GUID`);
    s.CreateItemUri = create;
  }
  /* Preserve the existing filter, re-hosted on the GUID address. */
  const query = String(s.CheckItemUri || '').split('/items')[1] || '';
  const check = `${create}${query}`;
  if (s.CheckItemUri !== check) { s.CheckItemUri = check; }
  if (s.TargetSite !== SITE) { s.TargetSite = SITE; }
}

/* ── provenance ───────────────────────────────────────────────────────────────────────── */

const stamp = {
  decision: 'GOV-01',
  authoritativeSite: SITE,
  appliedBy: 'scripts/repoint-governance-provisioning.mjs',
  appliedUtc: '2026-09-09',
  supersedes: 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING',
  note:
    'Every governance list address in this file is GUID-based and resolves on the authoritative '
    + 'site. NITDADGO-EAAACTIVITYTRACKING remains correct for the correspondence and tracking '
    + 'lists; only the ten governance rows moved. Retire the 17 duplicate instances listed in '
    + 'docs/reference/governance-list-registry.json before running provisioning again.',
};
const stampChanged = JSON.stringify(spec.governanceSiteDecision) !== JSON.stringify(stamp);
if (stampChanged) { spec.governanceSiteDecision = stamp; changes.push('recorded the GOV-01 decision in the spec'); }

const rendered = JSON.stringify(spec, null, 2) + '\n';
const previous = fs.readFileSync(SPEC, 'utf8');

console.log('\nGovernance provisioning — repoint onto the authoritative site\n');
console.log(`  authoritative site  ${SITE}`);
console.log(`  lists repointed     ${(spec.lists || []).length}`);
console.log(`  seeds repointed     ${(spec.seedItems || []).length}`);
console.log(`  changes applied     ${changes.length}\n`);
for (const c of changes.slice(0, 12)) console.log(`    ${c}`);
if (changes.length > 12) console.log(`    … and ${changes.length - 12} more`);
console.log('');

if (CHECK) {
  if (rendered !== previous) {
    fail('the provisioning spec is not repointed onto the authoritative site. Run: npm run governance:repoint');
  }
  console.log('  ✅ the provisioning spec targets the authoritative site, by GUID\n');
  process.exit(0);
}

fs.writeFileSync(SPEC, rendered);
console.log(`  ✅ wrote ${path.relative(ROOT, SPEC)}\n`);
