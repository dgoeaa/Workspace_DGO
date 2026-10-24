#!/usr/bin/env node
/**
 * The authoritative instance of each governance list, and every copy to retire.
 *
 * WHY THIS EXISTS
 *
 * The ten governance lists exist two and three times across two site collections. Seven carry a
 * `_2` suffix — SharePoint disambiguating a title that already existed, which is what a
 * title-based provisioning flow produces when it runs twice or runs against the wrong site.
 * Nothing recorded which instance was real, so a flow writing `DGO_AuditLog` and one reading
 * `DGO_AuditLog_2` both succeeded and neither saw the other.
 *
 * GOV-01 is decided: `DGO_ECM_GOVERNANCE` is the single authoritative site. That decision is
 * evidenced, not arbitrary — the internal flows already address `DGO_UserDirectory`,
 * `DGO_RoleCatalogue` and `DGO_AuditLog` by GUID on that site, and the role catalogue is seeded
 * there. This file derives, from the tenant capture, exactly which list GUID is authoritative
 * for each title and exactly which instances must be retired.
 *
 * ADDRESSING BY GUID IS THE POINT. `docs/deployment/sharepoint/portal-field-spec.json` addresses
 * every portal list by GUID so that, in its own words, "a typo can never produce a duplicate
 * list". The governance path creates by title against `_api/web/lists` and did not inherit that.
 * The URIs emitted here are GUID-addressed, so re-running provisioning cannot mint an eleventh
 * copy of anything.
 *
 *   npm run governance:registry              # regenerate
 *   npm run governance:registry -- --check   # fail if it has drifted from the capture
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'docs/reference/sharepoint-list-index.json');
const OUT = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const CHECK = process.argv.includes('--check');

const AUTHORITATIVE_SITE = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
const SITE_SEGMENT = 'DGO_ECM_GOVERNANCE';

/** The ten governance lists, in the provisioning spec's own order. */
const GOVERNANCE_LISTS = [
  'DGO_UserDirectory', 'DGO_RoleCatalogue', 'DGO_UserRoleHistory', 'DGO_AuditLog',
  'DGO_PendingWrites', 'DGO_DepartmentDirectory', 'DGO_AccessScopes', 'DGO_PilotCohorts',
  'DGO_EndpointRegistry', 'DGO_AccessEvents',
];

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const all = Object.entries(index.lists).map(([guid, l]) => ({ guid, ...l }));
const siteOf = (l) => String(l.serverRelativeUrl || '').split('/sites/')[1]?.split('/')[0] || null;

const lists = [];
const retire = [];
for (const title of GOVERNANCE_LISTS) {
  const instances = all.filter((l) => l.title === title || l.title === `${title}_2`);
  const keep = instances.find((l) => siteOf(l) === SITE_SEGMENT && l.title === title);
  if (!keep) fail(`${title} has no instance on ${SITE_SEGMENT} — the authoritative site cannot be adopted for it.`);
  lists.push({
    listTitle: title,
    listGuid: keep.guid,
    targetSite: AUTHORITATIVE_SITE,
    serverRelativeUrl: keep.serverRelativeUrl,
    /* GUID-addressed. `getByTitle` is what produced the duplicates; `getById` cannot. */
    createItemUri: `_api/web/lists(guid'${keep.guid}')/items`,
    listUri: `_api/web/lists(guid'${keep.guid}')`,
    fieldsUri: `_api/web/lists(guid'${keep.guid}')/fields`,
  });
  for (const other of instances.filter((l) => l.guid !== keep.guid)) {
    retire.push({
      listTitle: other.title,
      listGuid: other.guid,
      site: siteOf(other),
      serverRelativeUrl: other.serverRelativeUrl,
      supersededBy: keep.guid,
      reason: other.title.endsWith('_2')
        ? 'SharePoint disambiguation copy — the title already existed when provisioning ran again'
        : 'duplicate of the authoritative instance on a non-authoritative site collection',
    });
  }
}

const derived = {
  schema: 'dgo-governance-list-registry/v1',
  purpose:
    'The authoritative instance of each governance list and every copy to retire. Derived from '
    + 'docs/reference/sharepoint-list-index.json by scripts/build-governance-list-registry.mjs; '
    + 'do not hand-edit. Addresses are GUID-based so re-running provisioning cannot create a '
    + 'further duplicate.',
  generatedBy: 'scripts/build-governance-list-registry.mjs',
  decision: {
    id: 'GOV-01',
    authoritativeSite: AUTHORITATIVE_SITE,
    approvedUtc: '2026-09-09',
    rationale:
      'The internal flows already address DGO_UserDirectory, DGO_RoleCatalogue and DGO_AuditLog '
      + 'by GUID on this site, and the role catalogue is seeded there. Repointing the '
      + 'specification is therefore a one-sided change; repointing the flows would not be.',
  },
  derivedFrom: { capture: 'docs/reference/sharepoint-list-index.json', capturedUtc: index.capturedUtc },
  totals: { lists: lists.length, instancesToRetire: retire.length },
  lists,
  retire,
};

const rendered = JSON.stringify(derived, null, 2) + '\n';
const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

console.log('\nGovernance list registry\n');
console.log(`  authoritative site   ${AUTHORITATIVE_SITE}`);
console.log(`  lists                ${lists.length}, each addressed by GUID`);
console.log(`  instances to retire  ${retire.length}\n`);

if (CHECK) {
  if (previous !== rendered) fail(`${path.relative(ROOT, OUT)} has drifted. Run: npm run governance:registry`);
  console.log(`  ✅ ${path.relative(ROOT, OUT)} is current\n`);
  process.exit(0);
}

fs.writeFileSync(OUT, rendered);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)}\n`);
