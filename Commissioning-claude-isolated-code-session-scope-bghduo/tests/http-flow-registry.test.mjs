#!/usr/bin/env node
/**
 * The DGO HTTP Flow Registry provisioning specification, checked against itself and against the
 * estate the rest of this repository already records.
 *
 * WHY A WORKBOOK NEEDS A TEST
 * `docs/reference/http-flow-registry-spec.json` is an extraction, so `--check` on the builder
 * proves it matches the .xlsx and nothing more. A workbook can be internally inconsistent and
 * still extract perfectly: a field marked unique whose schema XML omits `EnforceUniqueValues`
 * provisions a non-unique column, and SharePoint rejects a unique column that is not also
 * indexed outright. Neither shows up until a run fails at the tenant, by which point the
 * provisioning chain has already skipped everything downstream of it — the workbook's own
 * `12_Risks_Controls` sheet names that as its top failure mode.
 *
 * The second half is reconciliation. specVersion 1.0 of the portal specification named seven
 * lists that resolved against nothing in the tenant, and no test noticed, because nothing
 * compared the specification to the capture. These seven lists are in exactly that state today —
 * defined, not built — and the difference is that this says so, by name, and will say something
 * different the day they appear in a capture.
 *
 * Run: node tests/http-flow-registry.test.mjs
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failed++;
  console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`);
};
const section = (s) => console.log(`\n${s}`);

const spec = read('docs/reference/http-flow-registry-spec.json');
const listIndex = read('docs/reference/sharepoint-list-index.json');
const portalSpec = read('docs/deployment/sharepoint/portal-field-spec.json');
const internalSpec = read('docs/reference/sharepoint-provisioning-spec.json');

const listTitles = spec.lists.map((l) => l.listTitle);
const fieldsByList = new Map(listTitles.map((t) => [t, spec.fields.filter((f) => f.listTitle === t)]));
const yes = (v) => v === 'Yes';

console.log('\nDGO HTTP Flow Registry provisioning specification');

/* ------------------------------------------------------------------- the counts */

section("The workbook's own declared expectations");

/* 01_Overview is the workbook's self-check: every row states what the flow expects, what the
   workbook documents, and the variance. A non-zero variance is the workbook telling you it is
   incomplete, and it is worth reading before anything downstream trusts a count. */
ok('every overview row reconciles to zero variance',
  spec.overview.every((r) => r.variance === 0 && r.pass === 'Yes'),
  spec.overview.filter((r) => r.variance !== 0 || r.pass !== 'Yes')
    .map((r) => `${r.metric}: expected ${r.expected}, documented ${r.documented}`).join('; '));

const declared = Object.fromEntries(spec.overview.map((r) => [r.metric, r.expected]));
/* The workbook counts what the workbook documents. `totals` counts what the estate will
   provision, which is the workbook plus any declared amendment — see
   scripts/lib/registry-spec-amendments.mjs. Reconciling the two exactly, with the amendment
   named, is what keeps an addition visible instead of looking like extraction drift. */
const added = spec.amendments?.fieldsAdded ?? 0;
ok('the extracted rows match the counts the overview declares, plus any declared amendment',
  spec.totals.lists === declared.Lists
    && spec.totals.fields === declared['Custom fields'] + added
    && spec.totals.uniqueKeys === declared['Unique keys']
    && spec.totals.configSeeds === declared['Configuration seeds']
    && spec.totals.views === declared['Custom views'],
  `declared ${JSON.stringify(declared)} vs extracted ${JSON.stringify(spec.totals)}`);

/* The flow reports its own expectations back in Compose_Final_Report_JSON, and the runtime reads
   two of them out of the configuration list. Three separate statements of the same numbers, which
   is three chances for one of them to be edited alone. */
const contract = Object.fromEntries(spec.finalReportContract.map((r) => [r.jsonPath, r.valueOrExpression]));
ok('the final-report contract states the same expected counts as the workbook',
  Number(contract['validation.expectedLists']) === spec.totals.lists
    && Number(contract['validation.expectedFields']) === spec.totals.fields - added
    && Number(contract['validation.expectedUniqueKeys']) === spec.totals.uniqueKeys
    && Number(contract['validation.expectedSeeds']) === spec.totals.configSeeds
    && Number(contract['validation.expectedViews']) === spec.totals.views,
  `report says lists=${contract['validation.expectedLists']}, fields=${contract['validation.expectedFields']}, `
  + `keys=${contract['validation.expectedUniqueKeys']}, seeds=${contract['validation.expectedSeeds']}, `
  + `views=${contract['validation.expectedViews']}`);

const seedValue = (key) => spec.configSeeds.find((s) => s.configKey === key)?.configValue;
ok('the configuration seeds state the same expected counts as the workbook',
  Number(seedValue('ProvisioningSchemaExpectedListCount')) === spec.totals.lists
    && Number(seedValue('ProvisioningSchemaExpectedFieldCount')) === spec.totals.fields - added,
  `seeds say lists=${seedValue('ProvisioningSchemaExpectedListCount')}, `
  + `fields=${seedValue('ProvisioningSchemaExpectedFieldCount')}`);

/* An amendment adds a column the deployed flow does not know about. Flow 01 reports
   `validation.expectedFields` back on every run and the runtime reads the same number out of the
   configuration list, so provisioning the amended set while those still state the workbook count
   makes a correct run report a variance against itself. The divergence is allowed; going
   unrecorded is not. */
ok('an amendment records the runtime counts it leaves behind',
  added === 0 || (typeof spec.amendments?.runtimeDivergence === 'string'
    && /expectedFields/.test(spec.amendments.runtimeDivergence)
    && /ProvisioningSchemaExpectedFieldCount/.test(spec.amendments.runtimeDivergence)),
  `${added} amended column(s) and no record of which runtime counts now disagree`);

ok('the report schema version matches the read-me',
  contract.schemaVersion === spec.registry.reportSchemaVersion,
  `report ${contract.schemaVersion} vs read-me ${spec.registry.reportSchemaVersion}`);

ok('each list declares the number of fields the field sheet gives it',
  spec.lists.every((l) => l.customFieldCount === fieldsByList.get(l.listTitle).length),
  spec.lists.filter((l) => l.customFieldCount !== fieldsByList.get(l.listTitle).length)
    .map((l) => `${l.listTitle}: declares ${l.customFieldCount}, has ${fieldsByList.get(l.listTitle).length}`).join('; '));

ok('every field belongs to a declared list',
  spec.fields.every((f) => fieldsByList.has(f.listTitle)),
  [...new Set(spec.fields.filter((f) => !fieldsByList.has(f.listTitle)).map((f) => f.listTitle))].join(', '));

ok('field numbering is 1..n with no gaps or repeats',
  spec.fields.every((f, i) => f.fieldNumber === i + 1));

ok('no list declares the same internal name twice',
  listTitles.every((t) => new Set(fieldsByList.get(t).map((f) => f.internalName)).size === fieldsByList.get(t).length),
  listTitles.filter((t) => new Set(fieldsByList.get(t).map((f) => f.internalName)).size !== fieldsByList.get(t).length).join(', '));

ok('Title is never declared as a column to add',
  !spec.fields.some((f) => f.internalName === 'Title'),
  "Title is every list's native column");

/* ------------------------------------------------------------- the schema XML */

section('Schema XML says what the row says');

/** Attributes of a `<Field ... />` element, which is all a schema XML string is. */
const attrsOf = (xml) => Object.fromEntries(
  [...String(xml).matchAll(/(\w+)\s*=\s*'([^']*)'/g)].map((m) => [m[1], m[2]]),
);

const xmlMismatches = [];
for (const f of spec.fields) {
  const a = attrsOf(f.schemaXml);
  const want = {
    Type: f.expectedTypeAsString,
    Name: f.internalName,
    StaticName: f.internalName,
    DisplayName: f.displayName,
    Required: yes(f.required) ? 'TRUE' : 'FALSE',
    Group: f.fieldGroup,
  };
  for (const [k, v] of Object.entries(want)) {
    if (a[k] !== v) xmlMismatches.push(`${f.listTitle}.${f.internalName}: ${k}='${a[k]}' but row says '${v}'`);
  }
  /* Indexed and EnforceUniqueValues are written only when true, so absence is the false case and
     a stray FALSE would be as wrong as a missing TRUE. */
  const indexed = a.Indexed === 'TRUE';
  const unique = a.EnforceUniqueValues === 'TRUE';
  if (indexed !== yes(f.indexed)) xmlMismatches.push(`${f.listTitle}.${f.internalName}: Indexed=${a.Indexed ?? 'absent'} but row says ${f.indexed}`);
  if (unique !== yes(f.unique)) xmlMismatches.push(`${f.listTitle}.${f.internalName}: EnforceUniqueValues=${a.EnforceUniqueValues ?? 'absent'} but row says ${f.unique}`);
}
ok('every field\'s schema XML carries the row\'s own type, names, flags and group',
  xmlMismatches.length === 0, xmlMismatches.slice(0, 8).join('\n     '));

/* Type parameters are the half of a field definition that a reviewer skims. A Note column that
   loses `NumLines` provisions as a single line; a Number column that loses `Min` accepts
   negatives into a counter the registry increments. */
const paramMismatches = [];
for (const f of spec.fields) {
  const a = attrsOf(f.schemaXml);
  if (f.typeParameters === null) continue;
  for (const pair of String(f.typeParameters).split(';')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (!k) continue;
    if (a[k] !== v) paramMismatches.push(`${f.listTitle}.${f.internalName}: ${k}='${a[k] ?? 'absent'}' but row says '${v}'`);
  }
}
ok('every declared type parameter appears in the schema XML with the same value',
  paramMismatches.length === 0, paramMismatches.slice(0, 8).join('\n     '));

/* Boolean is the one type with nothing to parameterise, and the one whose row therefore has an
   empty cell in the middle of the sheet. An extractor that mishandles an empty element returns
   the next column's value here and drops the purpose — which is exactly what the first run of
   scripts/lib/xlsx-reader.mjs did. */
ok('only Boolean fields carry no type parameters',
  spec.fields.every((f) => (f.typeParameters === null) === (f.expectedTypeAsString === 'Boolean')),
  spec.fields.filter((f) => (f.typeParameters === null) !== (f.expectedTypeAsString === 'Boolean'))
    .map((f) => `${f.internalName} (${f.expectedTypeAsString}): ${JSON.stringify(f.typeParameters)}`).join('; '));

ok('every field states a purpose',
  spec.fields.every((f) => typeof f.purpose === 'string' && f.purpose.trim() !== ''),
  spec.fields.filter((f) => !f.purpose).map((f) => f.internalName).join(', '));

/* ------------------------------------------------------------- the unique keys */

section('Unique keys');

/* SharePoint's own rule, and it is a hard failure rather than a warning: a create call for a
   column with EnforceUniqueValues and no index is rejected. */
ok('every unique field is also indexed',
  spec.fields.filter((f) => yes(f.unique)).every((f) => yes(f.indexed)),
  spec.fields.filter((f) => yes(f.unique) && !yes(f.indexed)).map((f) => `${f.listTitle}.${f.internalName}`).join(', '));

const uniqueFields = spec.fields.filter((f) => yes(f.unique)).map((f) => `${f.listTitle}.${f.internalName}`).sort();
const keyRows = spec.uniqueKeys.map((k) => `${k.listTitle}.${k.field}`).sort();
ok('the unique-key sheet names exactly the fields the field sheet marks unique',
  uniqueFields.length === keyRows.length && uniqueFields.every((v, i) => v === keyRows[i]),
  `fields: ${uniqueFields.join(', ')}\n     keys:   ${keyRows.join(', ')}`);

ok('every list declares its unique key, and it is a field of that list',
  spec.lists.every((l) => fieldsByList.get(l.listTitle).some((f) => f.internalName === l.uniqueKey && yes(f.unique))),
  spec.lists.filter((l) => !fieldsByList.get(l.listTitle).some((f) => f.internalName === l.uniqueKey && yes(f.unique)))
    .map((l) => `${l.listTitle} -> ${l.uniqueKey}`).join(', '));

ok('every unique-key row expects both an index and uniqueness',
  spec.uniqueKeys.every((k) => yes(k.expectedIndexed) && yes(k.expectedUnique)),
  spec.uniqueKeys.filter((k) => !yes(k.expectedIndexed) || !yes(k.expectedUnique)).map((k) => k.field).join(', '));

/* ------------------------------------------------------------------- the views */

section('Views');

/* `LinkTitle` is the native Title column rendered as a link to the item. It is not a provisioned
   field and will never appear in the field sheet. */
const NATIVE_VIEW_FIELDS = new Set(['LinkTitle', 'Title', 'ID', 'Modified', 'Created', 'Author', 'Editor']);
const viewProblems = [];
for (const v of spec.views) {
  const declaredOn = fieldsByList.get(v.listTitle);
  if (!declaredOn) { viewProblems.push(`${v.viewTitle}: list ${v.listTitle} is not provisioned`); continue; }
  const names = new Set(declaredOn.map((f) => f.internalName));
  for (const name of String(v.viewFieldsInOrder).split(';').map((s) => s.trim()).filter(Boolean)) {
    if (!names.has(name) && !NATIVE_VIEW_FIELDS.has(name)) {
      viewProblems.push(`${v.listTitle} / ${v.viewTitle}: view field ${name} is not a column of the list`);
    }
  }
  for (const m of String(v.camlViewQuery).matchAll(/<FieldRef\s+Name='([^']+)'/g)) {
    if (!names.has(m[1]) && !NATIVE_VIEW_FIELDS.has(m[1])) {
      viewProblems.push(`${v.listTitle} / ${v.viewTitle}: CAML filters on ${m[1]}, which the list does not have`);
    }
  }
}
ok('every view field and every CAML FieldRef names a column of its own list',
  viewProblems.length === 0, viewProblems.slice(0, 8).join('\n     '));

/* The list sheet's "Custom views" column is prose — "4 custom views", "Open Exceptions", "No
   custom view" — so it is read for the count it implies rather than parsed as a name. */
const viewsPerList = new Map(listTitles.map((t) => [t, spec.views.filter((v) => v.listTitle === t).length]));
ok('the list sheet and the view sheet agree on which lists get views',
  spec.lists.every((l) => (l.customViews === 'No custom view') === (viewsPerList.get(l.listTitle) === 0)),
  spec.lists.filter((l) => (l.customViews === 'No custom view') !== (viewsPerList.get(l.listTitle) === 0))
    .map((l) => `${l.listTitle}: says "${l.customViews}", has ${viewsPerList.get(l.listTitle)}`).join('; '));

/* ------------------------------------------------------------------- the seeds */

section('Configuration seeds');

const configFields = new Set(fieldsByList.get('DGO_HTTPFlowRegistryConfiguration').map((f) => f.internalName));
ok('the configuration list has every column a seed row writes',
  ['ConfigKey', 'ConfigValue', 'ValueType', 'IsSecret', 'ConfigDescription', 'IsEnabled'].every((c) => configFields.has(c)),
  ['ConfigKey', 'ConfigValue', 'ValueType', 'IsSecret', 'ConfigDescription', 'IsEnabled'].filter((c) => !configFields.has(c)).join(', '));

ok('no configuration key is seeded twice',
  new Set(spec.configSeeds.map((s) => s.configKey)).size === spec.configSeeds.length);

ok('every seed is enabled and none is marked secret',
  spec.configSeeds.every((s) => yes(s.isEnabled) && s.isSecret === 'No'),
  spec.configSeeds.filter((s) => !yes(s.isEnabled) || s.isSecret !== 'No').map((s) => s.configKey).join(', '));

/* The seed's declared ValueType is what a consumer parses the string with, so a value that will
   not parse is a defect the workbook can be read for without a tenant. */
const PARSES = {
  Integer: (v) => /^-?\d+$/.test(v),
  Boolean: (v) => v === 'true' || v === 'false',
  Email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  String: () => true,
};
ok('every seed value parses as the type it declares',
  spec.configSeeds.every((s) => (PARSES[s.valueType] ?? (() => false))(String(s.configValue))),
  spec.configSeeds.filter((s) => !(PARSES[s.valueType] ?? (() => false))(String(s.configValue)))
    .map((s) => `${s.configKey}: '${s.configValue}' declared ${s.valueType}`).join(', '));

/* The workbook disables raw request-body and header capture on purpose — 12_Risks_Controls calls
   endpoint and execution metadata the privacy exposure of this design. A seed flipped to true is
   a governance change, not a configuration tweak, and it should not pass silently. */
ok('raw request-body and header capture stay disabled',
  seedValue('CaptureRequestBody') === 'false' && seedValue('CaptureHeaders') === 'false',
  `CaptureRequestBody=${seedValue('CaptureRequestBody')}, CaptureHeaders=${seedValue('CaptureHeaders')}`);

/* ----------------------------------------------------------- the list settings */

section('List settings');

ok('every list carries the full settings template',
  spec.totals.listSettings === spec.totals.lists * 7,
  `${spec.totals.listSettings} rows for ${spec.totals.lists} lists`);

const SETTING_TO_COLUMN = {
  EnableAttachments: 'attachmentsEnabled',
  EnableFolderCreation: 'folderCreationEnabled',
  EnableVersioning: 'versioningEnabled',
  ForceCheckout: 'forceCheckout',
  'Title.Required': 'titleRequired',
};
const settingProblems = [];
for (const s of spec.listSettings) {
  const list = spec.lists.find((l) => l.listTitle === s.listTitle);
  if (!list) { settingProblems.push(`${s.listTitle} is not a provisioned list`); continue; }
  const column = SETTING_TO_COLUMN[s.property];
  if (column) {
    const asYesNo = s.expectedValue === 'true' ? 'Yes' : 'No';
    if (list[column] !== asYesNo) settingProblems.push(`${s.listTitle}.${s.property}=${s.expectedValue} but the list sheet says ${column}=${list[column]}`);
  } else if (s.property === 'MajorVersionLimit') {
    if (Number(s.expectedValue) !== Number(list.majorVersionLimit)) settingProblems.push(`${s.listTitle}.MajorVersionLimit=${s.expectedValue} but the list sheet says ${list.majorVersionLimit}`);
  }
}
ok('the settings matrix and the list sheet agree on every list',
  settingProblems.length === 0, settingProblems.slice(0, 8).join('\n     '));

ok('no list is provisioned hidden',
  spec.listSettings.filter((s) => s.property === 'Hidden').every((s) => s.expectedValue === 'false'),
  spec.listSettings.filter((s) => s.property === 'Hidden' && s.expectedValue !== 'false').map((s) => s.listTitle).join(', '));

ok('every list is created from the generic list template',
  spec.lists.every((l) => l.baseTemplate === 100),
  spec.lists.filter((l) => l.baseTemplate !== 100).map((l) => `${l.listTitle}=${l.baseTemplate}`).join(', '));

/* ---------------------------------------------------------------- the workflow */

section('Workflow and requests');

ok('no action name appears twice',
  new Set(spec.workflowActions.map((a) => a.action)).size === spec.workflowActions.length);

ok('every action states what it runs after',
  spec.workflowActions.every((a) => typeof a.runAfter === 'string' && a.runAfter.trim() !== ''),
  spec.workflowActions.filter((a) => !a.runAfter).map((a) => a.action).join(', '));

ok('every REST request states a method and a relative URI',
  spec.restRequests.every((r) => r.httpMethod && r.relativeUriPattern),
  spec.restRequests.filter((r) => !r.httpMethod || !r.relativeUriPattern).map((r) => r.operation).join(', '));

/* Relative, so the flow can be bound to a site at run time. An absolute URI here would pin the
   scope to one tenant and silently defeat the `dataset` the connector supplies. */
ok('no REST request hard-codes an absolute URL',
  spec.restRequests.every((r) => !/^https?:\/\//i.test(String(r.relativeUriPattern))),
  spec.restRequests.filter((r) => /^https?:\/\//i.test(String(r.relativeUriPattern))).map((r) => r.operation).join(', '));

ok('the create-list request uses the same base template the list sheet declares',
  /BaseTemplate=100\b/.test(String(spec.restRequests.find((r) => r.operation === 'Create list')?.bodyParameters ?? '')),
  String(spec.restRequests.find((r) => r.operation === 'Create list')?.bodyParameters ?? ''));

ok('every status the logging model defines is recorded somewhere',
  spec.statusVocabulary.every((s) => s.status && s.meaning && s.recordedIn),
  spec.statusVocabulary.filter((s) => !s.status || !s.meaning || !s.recordedIn).map((s) => s.status).join(', '));

/* ------------------------------------------------------- the estate it lands in */

section('Reconciliation with the recorded estate');

const knownSites = new Set([
  ...listIndex.sites.map((s) => s.url),
  ...portalSpec.sites.map((s) => s.url),
]);
ok('the target site is one this repository already records',
  knownSites.has(spec.registry.targetSite),
  `${spec.registry.targetSite} is not among ${[...knownSites].join(', ')}`);

const capturedOnTargetSite = new Set(
  Object.values(listIndex.lists)
    .filter((l) => l.siteUrl === spec.registry.targetSite)
    .map((l) => l.title),
);
const alreadyBuilt = listTitles.filter((t) => capturedOnTargetSite.has(t));

/* THE STANDING CLAIM. Every `executionEvidence` value in this specification says "Defined", and
   the read-me is explicit that defined is not created. The capture is the only independent
   record of what the site holds, and on 2026-08-18 it held none of these seven.
 *
 * When a later capture does contain them this test goes red — deliberately. That is the day the
 * documentation stops saying "not yet provisioned", and a red test is how anyone finds out. */
ok(`none of the seven lists exists in the ${listIndex.capturedUtc} capture of the target site`,
  alreadyBuilt.length === 0,
  alreadyBuilt.length
    ? `now captured: ${alreadyBuilt.join(', ')} — the estate has been provisioned, so update the `
      + 'documentation and this expectation together'
    : '');

ok('no registry list collides with a governance list already adopted on that site',
  !listTitles.some((t) => capturedOnTargetSite.has(t)),
  listTitles.filter((t) => capturedOnTargetSite.has(t)).join(', '));

ok('no registry list collides with the internal provisioning specification',
  !listTitles.some((t) => internalSpec.lists.some((l) => l.ListTitle === t)),
  listTitles.filter((t) => internalSpec.lists.some((l) => l.ListTitle === t)).join(', '));

ok('no registry list collides with the portal estate',
  !listTitles.some((t) => portalSpec.lists.some((l) => l.listTitle === t)),
  listTitles.filter((t) => portalSpec.lists.some((l) => l.listTitle === t)).join(', '));

ok('every list is named DGO_HTTPFlow*, so the estate is greppable as one unit',
  listTitles.every((t) => /^DGO_HTTPFlow[A-Za-z]*$/.test(t)),
  listTitles.filter((t) => !/^DGO_HTTPFlow[A-Za-z]*$/.test(t)).join(', '));

/* The registry stores endpoints and execution metadata. The workbook's answer to that is a
   redacted endpoint plus a fingerprint, and it holds no secret values — which is a property of
   the specification worth keeping true rather than a fact about one revision of it. */
section('Secrets');

const asText = JSON.stringify(spec);
ok('the specification carries no SAS signature',
  !/sig=[A-Za-z0-9_-]{20,}/.test(asText));
ok('the endpoint columns are the redacted and fingerprinted pair, not a raw URL',
  spec.fields.some((f) => f.internalName === 'EndpointRedacted')
    && spec.fields.some((f) => f.internalName === 'EndpointFingerprint')
    && !spec.fields.some((f) => f.internalName === 'EndpointUrl'));

console.log(failed === 0
  ? `\n  ${spec.totals.lists} lists, ${spec.totals.fields} fields, ${spec.totals.configSeeds} seeds, `
    + `${spec.totals.views} views — specification consistent, estate not yet provisioned.\n`
  : `\n  ${failed} check${failed === 1 ? '' : 's'} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
