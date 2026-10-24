#!/usr/bin/env node
/**
 * Extract `docs/reference/http-flow-registry-workbook.xlsx` into a machine-readable specification.
 *
 * WHAT THE WORKBOOK IS
 * Design-time documentation of `Scope_01_GOV_Provision_HTTP_Flow_Registry_COMPLETE_UPDATED`, the
 * Power Automate scope that provisions seven `DGO_HTTPFlow*` governance lists on
 * `/sites/DGO_ECM_GOVERNANCE`: 101 custom fields with their schema XML, twelve configuration
 * seeds, seven views with their CAML, seven unique-key controls, the list-settings template, the
 * action graph, the REST request catalogue, the status vocabulary, the final-report contract, and
 * the workbook's own list of design observations.
 *
 * WHY IT IS GENERATED RATHER THAN TRANSCRIBED
 * `docs/reference/sharepoint-provisioning-spec.json` is a verbatim record of a workbook that no
 * script regenerates, and it has already needed a correction note bolted on — `role-catalogue-seed.json`
 * carries one — because the tree moved and the transcription could not. This repository has been
 * bitten twice more by copied measurements. So the workbook ships beside its extraction and this
 * rebuilds it; `--check` fails if the committed JSON has drifted from the source.
 *
 * WHAT THE EXTRACTION DOES NOT DO
 * It does not interpret. `Defined` in an `executionEvidence` column means the flow intends to
 * create the thing, not that it exists — the workbook says so on its own first sheet, and nothing
 * here upgrades that claim. Reconciliation against what the tenant actually holds is
 * `tests/http-flow-registry.test.mjs`, which reads the 2026-08-18 capture and reports these seven
 * lists as unbuilt.
 *
 * Usage:
 *   node scripts/build-http-flow-registry-spec.mjs
 *   node scripts/build-http-flow-registry-spec.mjs --check
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './lib/xlsx-reader.mjs';
import { applyFieldAmendments } from './lib/registry-spec-amendments.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');

const SOURCE = 'docs/reference/http-flow-registry-workbook.xlsx';
const TARGET = 'docs/reference/http-flow-registry-spec.json';
const SPEC_VERSION = '1.0.0';

/**
 * Every tabular sheet, with the header row it must carry and the key each column becomes.
 *
 * The labels are quoted rather than mechanically camel-cased for two reasons. A derivation that
 * turns `HTTP method` into a usable key needs special cases anyway, and — the reason that matters
 * — a declared header row is a drift guard. If a later revision of the workbook renames, reorders
 * or inserts a column, this build fails and says which sheet, instead of quietly emitting a
 * differently-shaped record under the same key.
 */
const SHEETS = {
  '01_Overview': ['overview', {
    'Metric': 'metric',
    'Expected': 'expected',
    'Documented': 'documented',
    'Variance': 'variance',
    'Pass?': 'pass',
    'Interpretation': 'interpretation',
    'Source area': 'sourceArea',
  }],
  '02_Lists': ['lists', {
    'List title': 'listTitle',
    'Description': 'description',
    'Base template': 'baseTemplate',
    'Custom field count': 'customFieldCount',
    'Unique key': 'uniqueKey',
    'Custom views': 'customViews',
    'Attachments enabled': 'attachmentsEnabled',
    'Folder creation enabled': 'folderCreationEnabled',
    'Versioning enabled': 'versioningEnabled',
    'Major version limit': 'majorVersionLimit',
    'Force checkout': 'forceCheckout',
    'Title required': 'titleRequired',
    'Execution evidence': 'executionEvidence',
  }],
  '03_Fields': ['fields', {
    '#': 'fieldNumber',
    'List': 'listTitle',
    'Internal name': 'internalName',
    'Display name': 'displayName',
    'Expected TypeAsString': 'expectedTypeAsString',
    'Required': 'required',
    'Indexed': 'indexed',
    'Unique': 'unique',
    'Type parameters': 'typeParameters',
    'Purpose / information': 'purpose',
    'Field group': 'fieldGroup',
    'Schema XML': 'schemaXml',
    'Execution evidence': 'executionEvidence',
  }],
  '04_Config_Seeds': ['configSeeds', {
    'Title': 'title',
    'ConfigKey': 'configKey',
    'ConfigValue': 'configValue',
    'ValueType': 'valueType',
    'IsSecret': 'isSecret',
    'Description': 'description',
    'IsEnabled': 'isEnabled',
    'Upsert behavior': 'upsertBehavior',
    'Execution evidence': 'executionEvidence',
  }],
  '05_Views': ['views', {
    'List': 'listTitle',
    'View title': 'viewTitle',
    'CAML ViewQuery': 'camlViewQuery',
    'View fields in order': 'viewFieldsInOrder',
    'Provisioning behavior': 'provisioningBehavior',
    'Execution evidence': 'executionEvidence',
  }],
  '06_Unique_Keys': ['uniqueKeys', {
    'List': 'listTitle',
    'Field': 'field',
    'Expected indexed': 'expectedIndexed',
    'Expected unique': 'expectedUnique',
    'Validation test': 'validationTest',
    'Success effect': 'successEffect',
    'Execution evidence': 'executionEvidence',
  }],
  '07_List_Settings': ['listSettings', {
    'List': 'listTitle',
    'Property': 'property',
    'Expected value': 'expectedValue',
    'Method': 'method',
    'Execution evidence': 'executionEvidence',
  }],
  '08_Workflow': ['workflowActions', {
    'Action': 'action',
    'Type': 'type',
    'Purpose': 'purpose',
    'Dependency / run-after': 'runAfter',
  }],
  '09_REST_Parameters': ['restRequests', {
    'Operation': 'operation',
    'HTTP method': 'httpMethod',
    'Relative URI pattern': 'relativeUriPattern',
    'Headers': 'headers',
    'Body / parameters': 'bodyParameters',
  }],
  '10_Status_Logging': ['statusVocabulary', {
    'Status': 'status',
    'Meaning': 'meaning',
    'Recorded in': 'recordedIn',
  }],
  '11_Final_Report': ['finalReportContract', {
    'JSON path': 'jsonPath',
    'Value / expression': 'valueOrExpression',
    'Classification': 'classification',
  }],
  '12_Risks_Controls': ['risksAndControls', {
    'Area': 'area',
    'Observation': 'observation',
    'Recommended control': 'recommendedControl',
  }],
  '13_Connections': ['connections', {
    'Property': 'property',
    'Value': 'value',
  }],
};

/* Every tabular sheet is laid out the same way: title, subtitle, spacer, header, then rows. */
const HEADER_ROW = 4;

const fail = (message) => { console.error(`\n  ❌ ${message}\n`); process.exit(1); };

const workbook = readWorkbook(join(ROOT, SOURCE));
const sheet = (name) => {
  const s = workbook.sheets[name];
  if (!s) fail(`${SOURCE} has no sheet "${name}"`);
  return s;
};

/** A row is data until the sheet runs out of it — the first all-blank row ends the block. */
const isBlank = (row) => !row || row.every((c) => c === null || c === '');

/**
 * Rows of one tabular sheet as objects, after proving the header is the one declared above.
 */
function table(name, columns) {
  const s = sheet(name);
  /* Compared whole, not by prefix. Trailing blanks are the reader padding every row to the widest
     one and mean nothing; a labelled column past the last declared one is a column this extraction
     would silently drop, which is the case worth failing on. */
  const header = (s.rows[HEADER_ROW - 1] || []).map((c) => (c === null ? '' : String(c)));
  while (header.length && header[header.length - 1] === '') header.pop();
  const expected = Object.keys(columns);
  if (header.length !== expected.length || expected.some((h, i) => h !== header[i])) {
    fail(`${name} header changed.\n     expected: ${expected.join(' | ')}\n     found:    ${header.join(' | ')}`);
  }
  const keys = Object.values(columns);
  const out = [];
  for (const row of s.rows.slice(HEADER_ROW)) {
    if (isBlank(row)) break;
    out.push(Object.fromEntries(keys.map((k, i) => [k, row[i] === undefined ? null : row[i]])));
  }
  return out;
}

/* ------------------------------------------------------------------- 00_Read_Me */

/* No header row: rows 4 onward are label/value pairs, and the first two rows are the workbook's
   own title and standing caveat. Both are kept — the caveat is the load-bearing sentence in the
   whole document and belongs where a reader of the JSON will meet it. */
const readMeSheet = sheet('00_Read_Me');
const readMe = {
  title: readMeSheet.rows[0]?.[0] ?? null,
  subtitle: readMeSheet.rows[1]?.[0] ?? null,
  entries: readMeSheet.rows.slice(3)
    .filter((r) => !isBlank(r))
    .map((r) => ({ property: r[0], value: r[1] })),
};
const readMeValue = (property) => readMe.entries.find((e) => e.property === property)?.value ?? null;

/* ---------------------------------------------------------------- 13_Connections */

/* The sheet carries two blocks: the connection catalogue, then a navigation list of the workbook's
   own tabs after a blank spacer. `table()` stops at the spacer; the index is taken from what
   follows so it is recorded rather than silently dropped. */
const connectionsSheet = sheet('13_Connections');
const workbookSheetIndex = connectionsSheet.rows
  .slice(connectionsSheet.rows.findIndex((r) => r[1] === 'Workbook sheets') + 1)
  .map((r) => r[0])
  .filter((v) => typeof v === 'string' && v !== '');

/* --------------------------------------------------------------------- assemble */

const extracted = Object.fromEntries(
  Object.entries(SHEETS).map(([name, [key, columns]]) => [key, table(name, columns)]),
);

const spec = {
  specVersion: SPEC_VERSION,
  generator: 'scripts/build-http-flow-registry-spec.mjs',
  sourceWorkbook: SOURCE,
  extractionPurpose:
    'Machine-readable extraction of the DGO HTTP Flow Registry provisioning workbook: the seven '
    + 'DGO_HTTPFlow* governance lists, their 101 custom fields and schema XML, configuration seeds, '
    + 'views, unique-key controls, list settings, action graph, REST request catalogue, status '
    + 'vocabulary, final-report contract and recorded design observations.',
  integrityPolicy: {
    cellValueHandling:
      'Cell values are extracted as stored, with null for blank cells. Numbers stay numbers and '
      + 'text stays text; nothing is coerced, reworded or reordered.',
    noSummarization: true,
    noIntentionalTruncation: true,
    blankCellsPreservedAsNull: true,
    designTimeOnly:
      'Every executionEvidence value is the workbook\'s own design-time wording. "Defined" means the '
      + 'flow is configured to create the resource, not that the resource exists. Run history or the '
      + 'Compose_Final_Report_JSON output is the only evidence of an actual outcome.',
  },
  registry: {
    targetSite: readMeValue('Target site'),
    scopeNode: readMeValue('Scope node'),
    reportSchemaVersion: readMeValue('Report schema version'),
    flowDisplayName: extracted.finalReportContract.find((r) => r.jsonPath === 'flow.displayName')?.valueOrExpression ?? null,
    fieldGroup: extracted.fields[0]?.fieldGroup ?? null,
    expectedResources: readMeValue('Expected resources'),
    executionStatus: readMeValue('Execution status'),
    securityNote: readMeValue('Security note'),
  },
  totals: {
    lists: extracted.lists.length,
    fields: extracted.fields.length,
    configSeeds: extracted.configSeeds.length,
    views: extracted.views.length,
    uniqueKeys: extracted.uniqueKeys.length,
    listSettings: extracted.listSettings.length,
    workflowActions: extracted.workflowActions.length,
    restRequests: extracted.restRequests.length,
  },
  workbookMetadata: {
    sheetNames: workbook.sheetNames,
    sheetCount: workbook.sheetNames.length,
    dimensions: Object.fromEntries(workbook.sheetNames.map((n) => [n, workbook.sheets[n].dimension])),
    maxRows: Object.fromEntries(workbook.sheetNames.map((n) => [n, workbook.sheets[n].maxRow])),
    maxColumns: Object.fromEntries(workbook.sheetNames.map((n) => [n, workbook.sheets[n].maxColumn])),
  },
  readMe,
  ...extracted,
  workbookSheetIndex,
};

/* The columns the estate has added since the workbook was written. Declared in
   scripts/lib/registry-spec-amendments.mjs and applied here, so the committed JSON stays fully
   derived — workbook plus a reviewable list — rather than hand-edited into shape. */
const amendments = applyFieldAmendments(spec);

/* ---------------------------------------------------------------------------- io */

const rendered = `${JSON.stringify(spec, null, 2)}\n`;
const path = join(ROOT, TARGET);

if (check) {
  let current = null;
  try { current = readFileSync(path, 'utf8'); } catch { /* absent counts as stale */ }
  if (current !== rendered) {
    fail(`${TARGET} is stale. Run \`npm run httpflowregistry\`.`);
  }
  console.log(`  ✅ ${TARGET} matches ${SOURCE}`);
} else {
  writeFileSync(path, rendered);
  const t = spec.totals;
  console.log(`  ✅ ${TARGET}`);
  for (const a of amendments) console.log(`     + ${a}`);
  console.log(`     ${t.lists} lists, ${t.fields} fields, ${t.configSeeds} seeds, ${t.views} views, `
    + `${t.uniqueKeys} unique keys, ${t.listSettings} list settings, ${t.workflowActions} actions, `
    + `${t.restRequests} REST requests`);
}
