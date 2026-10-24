#!/usr/bin/env node
/**
 * Render the estate register into the formats different purposes need.
 *
 *   docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv    one row per list identity
 *   docs/folio-Master-Flows-and-Endpoints/reference/estate-register-fields.csv   one row per column, per source
 *   docs/folio-Master-Flows-and-Endpoints/reference/estate-register-flows.csv    one row per flow identity
 *   docs/folio-Master-Flows-and-Endpoints/reference/estate-register-touches.csv  one row per flow→list reference
 *   docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md           the full report, nothing elided
 *
 * WHY FOUR CSVs AND NOT ONE
 *
 * A list has many columns and a flow touches many lists. Flattening that into one sheet either
 * repeats every list row once per column — which makes every count in a pivot table wrong — or
 * drops the detail. Four tables at their natural grain keeps both counts and detail correct, and
 * they join on `key`.
 *
 * WHY THE REPORT DOES NOT SUMMARISE
 *
 * It was asked to be the primary source, so it prints every list, every column and every flow.
 * A register that elides its long tail is a register whose long tail nobody can audit, and the long
 * tail is where the surprises are: the 33 titles that name more than one list, the 86 flow rows with
 * no identifier, the two endpoints whose method two sources disagree about.
 *
 *   npm run estateviews
 *   npm run estateviews -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json');
const CHECK = process.argv.includes('--check');
const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

if (!fs.existsSync(REG)) fail('docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json is missing. Run: npm run estateregister');
const R = JSON.parse(fs.readFileSync(REG, 'utf8'));

/* ── CSV ─────────────────────────────────────────────────────────────────────────────────────
   RFC 4180 quoting, and a UTF-8 BOM so Excel does not mangle the display names — several columns
   in this estate carry `_x0020_` escapes and non-ASCII characters, and a register that arrives
   corrupted in the tool people actually open it in has failed at the last step. */
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' | ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (headers, rows) => `﻿${[headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n')}\r\n`;

const listHeaders = [
  'key', 'identity', 'listGuid', 'site', 'title', 'alternateTitles', 'objectType', 'template',
  'serverRelativeUrl', 'observedInTenantCapture', 'itemsAtCapture', 'hidden', 'adoptedInCapture',
  'roleInCapture', 'governanceDisposition', 'governanceNote', 'fieldCount', 'tenantObservedFieldCount',
  'evidenceKinds', 'sourceCount', 'sources', 'touchedByFlowCount', 'indexTargetCount', 'conflictCount', 'conflicts',
];
const listRows = R.lists.map((l) => ({
  key: l.key,
  identity: l.identity,
  listGuid: l.listGuid,
  site: l.site,
  title: l.titles[0] ?? '',
  alternateTitles: l.alternateTitles?.length ? l.alternateTitles.slice(1) : '',
  objectType: l.objectType,
  template: l.template,
  serverRelativeUrl: l.serverRelativeUrls[0] ?? '',
  observedInTenantCapture: l.observedInTenant,
  itemsAtCapture: l.itemsAtCapture,
  hidden: l.hidden,
  adoptedInCapture: l.adoptedInCapture,
  roleInCapture: l.roleInCapture,
  governanceDisposition: l.governance?.disposition ?? '',
  governanceNote: l.governance?.reason ?? l.governance?.decision ?? '',
  fieldCount: l.fieldCount,
  tenantObservedFieldCount: l.tenantObservedFieldCount,
  evidenceKinds: l.kinds,
  sourceCount: l.sourceCount,
  sources: [...new Set(l.statements.map((s) => s.source))],
  touchedByFlowCount: l.touchedByFlows.length,
  indexTargetCount: l.indexTargets.length,
  conflictCount: l.conflicts.length,
  conflicts: l.conflicts.map((c) => `${c.about}: ${JSON.stringify(c.values)}`),
}));

const fieldHeaders = [
  'listKey', 'site', 'listTitle', 'listGuid', 'source', 'evidenceBasis', 'sourceMeaning',
  'internalName', 'displayName', 'fieldType', 'required', 'indexed', 'unique', 'enforceUnique',
  'capturedState', 'evidenceState', 'choiceValues', 'typeParameters', 'purpose', 'renamedFrom',
  'executionEvidence', 'schemaXml',
];
const fieldRows = [];
for (const l of R.lists) {
  for (const f of l.fields) {
    fieldRows.push({
      listKey: l.key,
      site: l.site,
      listTitle: l.titles[0] ?? '',
      listGuid: l.listGuid,
      source: f.source,
      evidenceBasis: f.evidenceBasis,
      sourceMeaning: f.sourceMeaning,
      internalName: f.internalName,
      displayName: f.displayName ?? '',
      fieldType: f.fieldType ?? '',
      required: f.required ?? '',
      indexed: f.indexed ?? '',
      unique: f.unique ?? '',
      enforceUnique: f.enforceUnique ?? '',
      capturedState: f.capturedState ?? '',
      evidenceState: f.evidenceState ?? '',
      choiceValues: f.choiceValues ?? f.choices ?? '',
      typeParameters: f.typeParameters ?? '',
      purpose: f.purpose ?? '',
      renamedFrom: f.renamedFrom ?? '',
      executionEvidence: f.executionEvidence ?? '',
      schemaXml: f.schemaXml ?? '',
    });
  }
}

const flowHeaders = [
  'key', 'identity', 'workflowId', 'flowGuid', 'name', 'aliases', 'contractKeys', 'category',
  'trigger', 'method', 'routingSegment', 'environment', 'endpointShape', 'definitionHeld',
  'definitionFileCount', 'definitionFiles', 'actionCount', 'listsTouchedCount',
  'distinctListsTouched', 'evidenceKinds', 'sourceCount', 'sources', 'candidateSameFlowAs',
  'otherFlowGuids', 'mergedRowKeys', 'inTenantExport2026_09_26', 'usedByThisEstate',
  'tenantExportRowsMatched', 'conflictCount', 'conflicts',
];
const flowRows = R.flows.map((f) => ({
  key: f.key,
  identity: f.identity,
  workflowId: f.workflowId,
  flowGuid: f.flowGuid,
  name: f.names[0] ?? '',
  aliases: f.aliases?.length ? f.aliases.slice(1) : '',
  contractKeys: f.contractKeys,
  category: f.category,
  trigger: f.trigger,
  method: f.method,
  routingSegment: f.routingSegment,
  environment: f.environment,
  endpointShape: f.endpointShape,
  definitionHeld: f.definitionHeld,
  definitionFileCount: f.definitionFiles.length,
  definitionFiles: f.definitionFiles.map((d) => d.path),
  actionCount: f.actionCount,
  listsTouchedCount: f.listsTouchedCount,
  distinctListsTouched: f.distinctListsTouched,
  evidenceKinds: f.kinds,
  sourceCount: f.sourceCount,
  sources: [...new Set(f.statements.map((s) => s.source))],
  candidateSameFlowAs: f.candidateSameFlowAs,
  otherFlowGuids: f.otherFlowGuids ?? [],
  mergedRowKeys: f.mergedRowKeys ?? [],
  inTenantExport2026_09_26: f.inTenantExport2026_09_26,
  /* null is not false here: it means the export carries no identity this row can be matched on, which
     is a different statement from the export having seen it and found no use. */
  usedByThisEstate: f.usedByThisEstate === null ? 'not determinable from the export' : f.usedByThisEstate,
  tenantExportRowsMatched: f.tenantExportRowsMatched ?? 0,
  conflictCount: f.conflicts.length,
  conflicts: f.conflicts.map((c) => `${c.about}: ${JSON.stringify(c.values)}`),
}));

const touchHeaders = [
  'flowKey', 'flowName', 'workflowId', 'flowGuid', 'action', 'operation', 'operationId',
  'connector', 'siteUrl', 'listTitle', 'listGuid', 'addressedBy', 'dynamic', 'actionPath',
];
const touchRows = [];
for (const f of R.flows) {
  for (const t of f.listsTouched) {
    touchRows.push({
      flowKey: f.key,
      flowName: f.names[0] ?? '',
      workflowId: f.workflowId,
      flowGuid: f.flowGuid,
      action: t.action,
      operation: t.operation,
      operationId: t.operationId,
      connector: t.connector,
      siteUrl: t.siteUrl,
      listTitle: t.listTitle,
      listGuid: t.listGuid,
      addressedBy: t.addressedBy,
      dynamic: t.dynamic,
      actionPath: t.path,
    });
  }
}

/* ── the report ─────────────────────────────────────────────────────────────────────────────── */
const t = R.totals;
const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '—');
const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : '—');

const md = `# Estate register — SharePoint lists and Power Automate flows

> **GENERATED FILE — do not edit by hand.** Built by \`scripts/build-estate-register-views.mjs\`
> from \`docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json\`, which is assembled by
> \`scripts/build-estate-register.mjs\` from ${R.sources.length} declared sources.
> \`npm run estateviews -- --check\` fails if this report drifts from the register.

**Every list and every flow this branch holds any statement about, with the provenance of each
statement and every conflict named rather than resolved.** Nothing below is summarised or elided.

---

## How to read this register before you rely on it

**${R.totals.lists.rows} list rows and ${R.totals.flows.rows} flow rows are not ${R.totals.lists.rows} lists and ${R.totals.flows.rows} flows.** Three things a reader must
hold before quoting any number here:

### 1 · A row is an identity, not a proven object

| Lists | Count | What it means |
|---|---:|---|
| Identified by GUID | ${t.lists.identifiedByGuid} | Strong identity |
| Identified by site + title only | ${t.lists.identifiedBySiteAndTitleOnly} | Weaker — **33 titles in this tenant name more than one list** |
| Observed in the tenant capture | ${t.lists.observedInTenantCapture} | Seen on ${R.newestListObservation} |
| Specified and never observed | ${t.lists.specifiedNotObserved} | Design only. No evidence any of these exists |

| Flows | Count |
|---|---:|
| Rows | ${t.flows.rows} |
| Identified by workflow id or flow GUID | ${t.flows.identifiedByWorkflowIdOrFlowGuid} |
| Identified by display name only | ${t.flows.identifiedByDisplayNameOnly} |
| Of those, sharing a name with an identified row | ${t.flows.nameOnlyRowsMatchingAnIdentifiedRowByName} |
| **Distinct flows, lower bound** | **${t.flows.distinctFlowsLowerBound}** |
| **Distinct flows, upper bound** | **${t.flows.distinctFlowsUpperBound}** |

### 2 · Two identifier spaces that do not resolve

${R.howToReadIt.identity.flows}

| | Count |
|---|---:|
| Rows with a 32-hex Logic Apps workflow id | ${t.flows.withWorkflowId} |
| Rows with a 36-character Power Automate flow GUID | ${t.flows.withFlowGuid} |
| Rows carrying **both** | ${t.flows.withBothIdentifiers} (${pct(t.flows.withBothIdentifiers, t.flows.rows)}) |

### 3 · Knowing a column exists is five different claims

${Object.entries(R.howToReadIt.evidenceBasis).map(([k, v]) => `- **\`${k}\`** — ${v}`).join('\n')}

| Evidence basis | Column rows | Share |
|---|---:|---:|
${Object.entries(t.fields.byEvidenceBasis).filter(([, n]) => n).map(([k, n]) => `| \`${k}\` | ${n} | ${pct(n, t.fields.rows)} |`).join('\n')}
| **Total** | **${t.fields.rows}** | |

**Only \`tenant-observation\` evidences existence, and there are ${t.fields.byEvidenceBasis['tenant-observation']} such rows of ${t.fields.rows}.**
${t.fields.note}

---

## What this register is not

${R.howToReadIt.whatIsNotHere}

### Known divergences, stated rather than smoothed

${R.knownDivergences.map((d) => `#### ${d.id} — ${d.about}

**${d.statement}**

${d.consequence}

Measured in \`${d.measuredIn}\`.`).join('\n\n')}

---

## The ${R.sources.length} sources, and what each is allowed to claim

| Source | Kind | Describes | Files / size |
|---|---|---|---|
${R.sources.map((s) => `| \`${s.path}\` | \`${s.kind}\` | ${s.describes.join(', ')} | ${s.files ? `${s.files} file(s)` : `${Math.round((s.bytes ?? 0) / 1024)} KB, sha ${s.sha256_16}`} |`).join('\n')}

${R.sources.map((s) => `**\`${s.path}\`** — ${s.authority}${s.caveat ? `\n\n> ⚠ ${s.caveat}` : ''}`).join('\n\n')}

---

## Sites

| Site | Lists in capture | Rows in register | Observed | Specified only |
|---|---:|---:|---:|---:|
${Object.entries(R.bySite).map(([k, v]) => `| [\`${k}\`](${v.siteUrl}) | ${v.listsInCapture} | ${v.rowsInRegister} | ${v.observed} | ${v.specifiedOnly} |`).join('\n')}

---

## Conflicts — every one, unresolved

${t.lists.withConflicts + t.flows.withConflicts === 0 ? '_None recorded._' : `**${t.lists.withConflicts} list(s) and ${t.flows.withConflicts} flow(s).** A conflict is two sources giving different values for the
same single-valued field. Several names for one flow, or several titles for one list, are recorded
as aliases instead — in this estate those are ordinary.`}

${R.lists.filter((l) => l.conflicts.length).map((l) => `### \`${l.titles[0]}\`${l.listGuid ? ` · \`${l.listGuid}\`` : ''}

${l.conflicts.map((c) => `- **${c.about}** — ${Object.entries(c.values).map(([src, val]) => `\`${src}\` says \`${val}\``).join('; ')}\n  ${c.note}`).join('\n')}`).join('\n\n')}

${R.flows.filter((f) => f.conflicts.length).map((f) => `### \`${f.names[0]}\`${f.workflowId ? ` · \`${f.workflowId}\`` : ''}

${f.conflicts.map((c) => `- **${c.about}** — ${Object.entries(c.values).map(([src, val]) => `\`${src}\` says \`${val}\``).join('; ')}\n  ${c.note}`).join('\n')}`).join('\n\n')}

---

## Every list

${t.lists.rows} rows, ordered by site then title. Every column of every list follows its row.

${R.lists.map((l) => {
  const title = l.titles[0] ?? '(untitled)';
  const head = `### ${title}${l.alternateTitles?.length ? ` _(also: ${l.alternateTitles.slice(1).join(', ')})_` : ''}`;
  const facts = [
    ['Site', l.site ?? '—'],
    ['GUID', l.listGuid ? `\`${l.listGuid}\`` : '**none — identified by site + title**'],
    ['Type', l.objectType ? `${l.objectType} (${l.template})` : '—'],
    ['Server-relative URL', l.serverRelativeUrls.length ? l.serverRelativeUrls.map((u) => `\`${u}\``).join(', ') : '—'],
    ['Observed in capture', `${yn(l.observedInTenant)}${l.observedInTenant ? ` · ${l.itemsAtCapture} item(s) · hidden ${yn(l.hidden)} · adopted ${yn(l.adoptedInCapture)}` : ''}`],
    ['Role in capture', l.roleInCapture ?? '—'],
    ['Governance', l.governance ? `${l.governance.disposition}${l.governance.reason ? ` — ${l.governance.reason}` : ''}${l.governance.supersededBy ? ` (superseded by \`${l.governance.supersededBy}\`)` : ''}` : '—'],
    ['Evidence kinds', l.kinds.map((k) => `\`${k}\``).join(', ')],
    ['Columns recorded', `${l.fieldCount}${l.fieldCount ? ` — ${Object.entries(l.fieldsByEvidenceBasis).map(([b, n]) => `${n} ${b}`).join(', ')}` : ''}`],
    ['Touched by flows', l.touchedByFlows.length ? `${l.touchedByFlows.length} reference(s)` : 'none recorded'],
  ];
  let out = `${head}\n\n${facts.map(([k, v]) => `- **${k}:** ${v}`).join('\n')}\n`;
  out += `\n**What each source says**\n\n${l.statements.map((s) => `- \`${s.source}\` (${s.kind}) — ${s.says}`).join('\n')}\n`;
  if (l.fields.length) {
    out += `\n**Columns (${l.fields.length})**\n\n| Internal name | Display | Type | Required | Indexed | Basis | Source | State |\n|---|---|---|---|---|---|---|---|\n`;
    out += l.fields.map((f) => `| \`${f.internalName}\` | ${f.displayName ?? '—'} | ${f.fieldType ?? '—'} | ${f.required ?? '—'} | ${f.indexed ?? '—'} | \`${f.evidenceBasis}\` | \`${f.source}\` | ${f.capturedState ?? f.evidenceState ?? '—'} |`).join('\n');
    out += '\n';
  }
  if (l.indexTargets.length) {
    out += `\n**Index targets (${l.indexTargets.length})**\n\n${l.indexTargets.map((i) => `- \`${i.internalName}\` — ${i.reason}${i.itemsAtCapture != null ? ` (${i.itemsAtCapture} items at capture)` : ''}`).join('\n')}\n`;
  }
  if (l.touchedByFlows.length) {
    out += `\n**Flows that touch it (${l.touchedByFlows.length})**\n\n| Flow | Action | Operation | Addressed by |\n|---|---|---|---|\n`;
    out += l.touchedByFlows.map((x) => `| ${x.flow} | \`${x.action}\` | ${x.operation} | ${x.addressedBy} |`).join('\n');
    out += '\n';
  }
  if (l.conflicts.length) {
    out += `\n**Conflicts (${l.conflicts.length})** — unresolved by design\n\n${l.conflicts.map((c) => `- **${c.about}:** ${Object.entries(c.values).map(([s, v]) => `\`${s}\` → \`${v}\``).join('; ')}`).join('\n')}\n`;
  }
  return out;
}).join('\n---\n\n')}

---

## Every flow

${t.flows.rows} rows, ordered by name. A row is an identity; see the bounds above before counting.

${R.flows.map((f) => {
  const name = f.names[0] ?? '(unnamed)';
  const facts = [
    ['Identity', f.identity],
    ['Workflow id (32-hex)', f.workflowId ? `\`${f.workflowId}\`` : '—'],
    ['Flow GUID (36-char)', f.flowGuid ? `\`${f.flowGuid}\`` : '—'],
    ['Aliases', f.aliases?.length ? f.aliases.slice(1).join(', ') : '—'],
    ['Contract keys', f.contractKeys.length ? f.contractKeys.map((k) => `\`${k}\``).join(', ') : '—'],
    ['Category', f.category ?? '—'],
    ['Trigger / method', `${f.trigger ?? '—'} / ${f.method ?? '—'}`],
    ['Routing segment', f.routingSegment ?? '—'],
    ['Environment', f.environment ?? '—'],
    ['Endpoint shape', f.endpointShape ? `\`${f.endpointShape}\` _(no credential — every \`sig=\` is stripped at source)_` : '—'],
    ['Definition held', `${yn(f.definitionHeld)}${f.definitionFiles.length ? ` — ${f.definitionFiles.length} file(s)` : ''}`],
    ['Actions', f.actionCount ?? '—'],
    ['Lists touched', f.listsTouchedCount ? `${f.listsTouchedCount} reference(s) across ${f.distinctListsTouched.length} list(s)` : 'none recorded'],
    ['Evidence kinds', f.kinds.map((k) => `\`${k}\``).join(', ')],
    ['Possibly the same flow as', f.candidateSameFlowAs.length ? f.candidateSameFlowAs.map((k) => `\`${k}\``).join(', ') : '—'],
    ['Other dashed flow ids paired with this row',
      f.otherFlowGuids?.length
        ? `${f.otherFlowGuids.map((g) => `\`${g}\``).join(', ')} — recorded as a conflict, not a correction`
        : '—'],
    ['In the 2026-09-26 tenant export', f.inTenantExport2026_09_26
      ? `yes${f.tenantExportRowsMatched > 1 ? ` — matching ${f.tenantExportRowsMatched} exported flows` : ''}`
      : 'no row in that export carries an identity this row can be matched on'],
    ['Used by this estate', f.usedByThisEstate === true
      ? 'yes — the usage analysis names it, with its evidence'
      : f.usedByThisEstate === false
        ? 'the export saw it in the environment and no evidence ties it to this estate'
        : 'not determinable from the export'],
    ['Rows merged into this one', f.mergedRowKeys?.length ? f.mergedRowKeys.map((k) => `\`${k}\``).join(', ') : '—'],
  ];
  let out = `### ${name}\n\n${facts.map(([k, v]) => `- **${k}:** ${v}`).join('\n')}\n`;
  out += `\n**What each source says**\n\n${f.statements.map((s) => `- \`${s.source}\` (${s.kind}) — ${s.says}`).join('\n')}\n`;
  if (f.definitionFiles.length) {
    out += `\n**Definition files**\n\n${f.definitionFiles.map((d) => `- \`${d.path}\` (${d.kind}, via \`${d.source}\`)`).join('\n')}\n`;
  }
  if (f.listsTouched.length) {
    out += `\n**SharePoint references (${f.listsTouched.length})**\n\n| Action | Operation | List | Addressed by | Site | Dynamic |\n|---|---|---|---|---|---|\n`;
    out += f.listsTouched.map((x) => `| \`${x.action}\` | ${x.operation} | ${x.listTitle ?? (x.listGuid ? `\`${x.listGuid}\`` : '—')} | ${x.addressedBy} | ${x.siteUrl ?? '—'} | ${yn(x.dynamic)} |`).join('\n');
    out += '\n';
  }
  if (f.conflicts.length) {
    out += `\n**Conflicts (${f.conflicts.length})** — unresolved by design\n\n${f.conflicts.map((c) => `- **${c.about}:** ${Object.entries(c.values).map(([s, v]) => `\`${s}\` → \`${v}\``).join('; ')}`).join('\n')}\n`;
  }
  return out;
}).join('\n---\n\n')}

---

## Companion files

| File | Grain | Rows |
|---|---|---:|
| \`estate-register.json\` | everything, nested | — |
| \`estate-register-lists.csv\` | one row per list identity | ${listRows.length} |
| \`estate-register-fields.csv\` | one row per column, per source | ${fieldRows.length} |
| \`estate-register-flows.csv\` | one row per flow identity | ${flowRows.length} |
| \`estate-register-touches.csv\` | one row per flow→list reference | ${touchRows.length} |

All four CSVs join on \`key\` / \`listKey\` / \`flowKey\`, carry a UTF-8 BOM for Excel, and quote to
RFC 4180.
`;

const outputs = [
  ['docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv', csv(listHeaders, listRows)],
  ['docs/folio-Master-Flows-and-Endpoints/reference/estate-register-fields.csv', csv(fieldHeaders, fieldRows)],
  ['docs/folio-Master-Flows-and-Endpoints/reference/estate-register-flows.csv', csv(flowHeaders, flowRows)],
  ['docs/folio-Master-Flows-and-Endpoints/reference/estate-register-touches.csv', csv(touchHeaders, touchRows)],
  ['docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md', md],
];

console.log('\nEstate register views\n');
for (const [rel, content] of outputs) {
  console.log(`  ${rel.padEnd(48)} ${String(Math.round(content.length / 1024)).padStart(5)} KB`);
}
console.log(`\n  list rows ${listRows.length} · field rows ${fieldRows.length} · flow rows ${flowRows.length} · touch rows ${touchRows.length}\n`);

if (CHECK) {
  for (const [rel, content] of outputs) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) {
      fail(`${rel} is stale. Run: npm run estateviews`);
    }
  }
  console.log('  ✅ every view matches the register\n');
  process.exit(0);
}
for (const [rel, content] of outputs) fs.writeFileSync(path.join(ROOT, rel), content);
console.log(`  ✅ wrote ${outputs.length} file(s)\n`);
