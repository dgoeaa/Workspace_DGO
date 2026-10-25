#!/usr/bin/env node
/**
 * Assemble the estate register: every SharePoint list and every Power Automate flow this branch
 * holds any statement about, with the provenance of each statement and every conflict named.
 *
 * WHAT THIS IS FOR
 *
 * It is intended as the primary source on the estate's lists and flows. That intent is the reason
 * for every design decision below, because a register trusted that far does more damage when it is
 * wrong than when it is missing.
 *
 * FOUR RULES, AND WHAT EACH ONE PREVENTS
 *
 * 1. NOTHING IS MERGED SILENTLY. A list or flow appearing in several sources gets one row carrying
 *    ALL of them, with what each says. Where two sources disagree the row holds both values and a
 *    conflict entry. Picking a winner is how a register becomes an opinion.
 *
 * 2. EVERY ROW CARRIES ITS KIND. `observed` was read from the tenant on a stated date; `specified`
 *    is a design and is not evidence anything exists; `derived` was computed here; `exported` is a
 *    flow body from Power Automate; `superseded` is kept for provenance and never counted. The
 *    register's own totals are broken out by kind, because "326 lists" and "326 lists that exist"
 *    are different claims and only one of them is supportable.
 *
 * 3. TWO IDENTIFIER SPACES ARE KEPT APART. A flow has a Power Automate flow GUID (36 characters,
 *    dashed) and a Logic Apps workflow id (32 hex, no dashes). GOV-06 measured the join: ZERO of 77
 *    exported definitions carry an id the tenant register knows, and normalised display name
 *    matches 13. So a flow row carries both fields, and either may be null. Inventing the missing
 *    one would fabricate the join this estate does not have.
 *
 * 4. NO TRUNCATION ANYWHERE. Every field of every list, every action reference of every flow. If
 *    the output is large, the output is large.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not contact the tenant, so it cannot tell you what exists right now — only what the
 * sources say, and when each looked. The newest observation in it is dated, and the register says
 * so on its face rather than in a footnote.
 *
 *   npm run estateregister
 *   npm run estateregister -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SOURCES, DEFINITION_DIRS } from './lib/estate-sources.mjs';
/* Ordering is by code unit, never by host locale: a locale-aware comparator depends on the
   machine's ICU build, so a --check'd file regenerated elsewhere reports as stale when nothing
   changed. The repository already had a guard for this and it caught this file on the first run. */
import { byteCompare } from './lib/stable-sort.mjs';
import { parseFlowArtifactName, FLOW_IDENTITIES, flowIdPart } from './lib/flow-artifact-name.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const abs = (rel) => path.join(ROOT, rel);
const readJson = (rel) => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const sha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex').slice(0, 16);

/* ── sources ─────────────────────────────────────────────────────────────────────────────────
   Every declared source is loaded and hashed. A missing one is fatal: a register that silently
   skips a source it was told about is the partial representation this exists to prevent. */
const loaded = new Map();
const sourceRecords = [];
for (const s of SOURCES) {
  if (!fs.existsSync(abs(s.path))) fail(`declared source is missing: ${s.path}`);
  let data;
  try { data = readJson(s.path); } catch (err) { fail(`${s.path} is not readable JSON: ${err.message}`); }
  loaded.set(s.id, data);
  sourceRecords.push({
    id: s.id,
    path: s.path,
    kind: s.kind,
    describes: s.describes,
    authority: s.authority,
    caveat: s.caveat ?? null,
    sha256_16: sha(s.path),
    bytes: fs.statSync(abs(s.path)).size,
  });
}

const definitionFiles = [];
for (const d of DEFINITION_DIRS) {
  if (!fs.existsSync(abs(d.dir))) fail(`declared definition directory is missing: ${d.dir}`);
  const files = fs.readdirSync(abs(d.dir))
    .filter((f) => f.endsWith('.json'))
    .filter((f) => (d.match ? d.match.test(f) : true))
    .sort();
  for (const f of files) definitionFiles.push({ group: d, rel: `${d.dir}/${f}`, file: f });
  sourceRecords.push({
    id: d.id,
    path: `${d.dir}/`,
    kind: d.kind,
    describes: ['flows'],
    authority: d.authority,
    caveat: d.caveat ?? null,
    files: files.length,
  });
}

/* ── evidence basis ──────────────────────────────────────────────────────────────────────────
   A column is known for one of five reasons, and they are not interchangeable. An earlier draft
   of this file flattened them to observed/specified and mapped internal-field-evidence's
   `deployed` to OBSERVED — which would have asserted 52 columns as seen on the tenant when that
   source's own note says `deployed` means "harvested from item/<col> writes and $filter clauses in
   the 57 exported definitions". A flow writing to a column is evidence that a flow expects it, and
   is not evidence that it exists.

   So no flattening. Each source's own word is kept, and mapped to one of these bases with the
   source's definition quoted beside it. Only `tenant-observation` means anything was seen. */
const EVIDENCE_BASIS = {
  'tenant-observation': 'Read from the tenant. The only basis that evidences existence.',
  'flow-definition': 'A flow definition reads or writes this column. Evidence a flow expects it, not that it exists.',
  'client-code': 'The shipping client reads this column back. Evidence the client expects it.',
  'specification': 'A specification declares it. Not evidence of existence.',
  'generated-seed': 'Generated from configuration in this repository.',
};

/** internal-field-evidence.json's own vocabulary, mapped with its own stated meaning. */
const INTERNAL_BASIS = {
  deployed: { basis: 'flow-definition', sourceMeaning: 'harvested from item/<col> writes and $filter clauses in the exported definitions' },
  normaliser: { basis: 'client-code', sourceMeaning: 'core/domain.js — the columns the shipping client actually reads back' },
  seed: { basis: 'generated-seed', sourceMeaning: 'role-catalogue-seed.json, generated from config/rbac.config.js' },
  tenant: { basis: 'tenant-observation', sourceMeaning: 'sharepoint-list-index.json — GUID, site and the adopted flag' },
  provisioned: { basis: 'specification', sourceMeaning: 'the extracted provisioning workbook that defines the governance lists column by column' },
};

/** portal-field-spec.json's capturedState, mapped the same way. */
const PORTAL_BASIS = {
  LIVE: { basis: 'tenant-observation', sourceMeaning: 'present on the tenant at the capture date' },
  MISSING: { basis: 'specification', sourceMeaning: 'specified and NOT present on the tenant at the capture date' },
  PENDING: { basis: 'specification', sourceMeaning: 'specified and awaiting provisioning' },
};

/* ── list identity ───────────────────────────────────────────────────────────────────────────
   A list is identified by GUID where any source gives one, and otherwise by site + title. Those
   are different strengths of identity and the row says which it has: 33 titles in this tenant
   name more than one list, so a title-only row is a weaker claim than a GUID row and must not
   read like one. */
const lists = new Map();
const LOWER = (s) => String(s ?? '').toLowerCase();
const listKey = (guid, site, title) => (guid ? `guid:${LOWER(guid)}` : `title:${LOWER(site)}::${LOWER(title)}`);

function list(guid, site, title) {
  const key = listKey(guid, site, title);
  if (!lists.has(key)) {
    lists.set(key, {
      key,
      identity: guid ? 'guid' : 'site+title',
      listGuid: guid ? LOWER(guid) : null,
      site: site ?? null,
      titles: [],
      siteUrls: [],
      serverRelativeUrls: [],
      objectType: null,
      template: null,
      itemsAtCapture: null,
      hidden: null,
      adoptedInCapture: null,
      roleInCapture: null,
      observedInTenant: false,
      statements: [],
      fields: [],
      indexTargets: [],
      touchedByFlows: [],
      governance: null,
      conflicts: [],
    });
  }
  const l = lists.get(key);
  if (title && !l.titles.includes(title)) l.titles.push(title);
  if (guid && !l.listGuid) { l.listGuid = LOWER(guid); l.identity = 'guid'; }
  if (site && !l.site) l.site = site;
  return l;
}
/* The spread order used to be { source: sourceId, ...statement }, and one reader passed a payload key
   of its own called `source` — endpoint-workflow-ids records where each resolution came from. That
   key overwrote the provenance on all 15 of its statements, which then read as though the endpoint
   register had said them. Provenance is written last so nothing can shadow it, and a payload carrying
   that key is a reader bug rather than something to silently resolve. */
const say = (row, sourceId, statement) => {
  if ('source' in statement) {
    fail(`a reader passed a statement with its own \`source\` key for ${sourceId}; rename it — `
      + 'that key is the provenance of the statement');
  }
  row.statements.push({ ...statement, source: sourceId });
};

/* 1 · the tenant capture — the only observation of what exists */
const capture = loaded.get('tenant-capture');
const CAPTURE_UTC = capture.capturedUtc;
const SITES = capture.sites;
for (const [guid, c] of Object.entries(capture.lists)) {
  const l = list(guid, c.site, c.title);
  l.observedInTenant = true;
  l.objectType = c.objectType;
  l.template = c.template;
  l.itemsAtCapture = c.itemsAtCapture;
  l.hidden = c.hidden;
  l.adoptedInCapture = c.adopted;
  l.roleInCapture = c.role ?? null;
  if (c.siteUrl && !l.siteUrls.includes(c.siteUrl)) l.siteUrls.push(c.siteUrl);
  if (c.serverRelativeUrl && !l.serverRelativeUrls.includes(c.serverRelativeUrl)) l.serverRelativeUrls.push(c.serverRelativeUrl);
  say(l, 'tenant-capture', {
    kind: 'observed',
    observedUtc: CAPTURE_UTC,
    says: `exists on ${c.site} as a ${c.objectType} (${c.template}) with ${c.itemsAtCapture} item(s)`,
    hidden: c.hidden,
    adopted: c.adopted,
  });
}

/* 2 · the governance decision */
const govReg = loaded.get('governance-registry');
for (const g of govReg.lists) {
  const l = list(g.listGuid, g.targetSite.split('/sites/')[1], g.listTitle);
  l.governance = { disposition: 'KEEP', decision: govReg.decision.id };
  if (!l.serverRelativeUrls.includes(g.serverRelativeUrl)) l.serverRelativeUrls.push(g.serverRelativeUrl);
  say(l, 'governance-registry', { kind: 'derived', says: `authoritative governance list under ${govReg.decision.id}`, targetSite: g.targetSite });
}
for (const r of govReg.retire) {
  const l = list(r.listGuid, r.site, r.listTitle);
  l.governance = { disposition: 'RETIRE', supersededBy: r.supersededBy ?? null, reason: r.reason };
  say(l, 'governance-registry', { kind: 'derived', says: `marked for retirement: ${r.reason}`, supersededBy: r.supersededBy ?? null });
}

/* 3 · the governance specification — BOTH field tables, because they disagree */
const govSpec = loaded.get('governance-spec');
const govWorkbookFields = govSpec.tables.Fields.records;
const govCorrectedFields = govSpec.fields;
for (const row of govSpec.tables.Lists.records) {
  const known = [...lists.values()].find((x) => x.titles.includes(row.ListTitle) && x.governance?.disposition === 'KEEP');
  const l = known || list(null, row.TargetSite.split('/sites/')[1], row.ListTitle);
  say(l, 'governance-spec', {
    kind: 'specified',
    says: `specified with ${row.FieldCount} field(s), ${row.RequiredFieldCount} required, ${row.IndexedFieldCount} indexed, ${row.SeedRecordCount} seed record(s)`,
    purpose: row.Purpose,
    description: row.Description,
    targetSiteInSpec: row.TargetSite,
  });
  if (l.governance?.disposition === 'KEEP' && row.TargetSite !== govReg.decision.authoritativeSite) {
    l.conflicts.push({
      about: 'targetSite',
      between: ['governance-spec', 'governance-registry'],
      values: { 'governance-spec': row.TargetSite, 'governance-registry': govReg.decision.authoritativeSite },
      note: 'The workbook predates GOV-01. The registry decision governs; the spec row is kept so the divergence is visible rather than quietly overwritten.',
    });
  }
}
const addField = (l, sourceId, f) => {
  l.fields.push({ source: sourceId, ...f });
};
for (const f of govCorrectedFields) {
  const l = [...lists.values()].find((x) => x.titles.includes(f.ListTitle) && x.governance?.disposition === 'KEEP');
  if (!l) continue;
  addField(l, 'governance-spec', {
    evidenceBasis: 'specification',
    sourceMeaning: 'declared by the governance provisioning workbook, with GOV-03 and GOV-08 applied',
    internalName: f.InternalName,
    displayName: f.DisplayName,
    fieldType: f.FieldType,
    required: f.Required,
    indexed: f.Indexed,
    choiceValues: f.ChoiceValues ?? null,
    schemaXml: f.SchemaXml,
    renamedFrom: f.RenamedFrom ?? null,
    table: 'corrected (GOV-03, GOV-08 applied)',
  });
}
const govFieldDelta = govCorrectedFields.length - govWorkbookFields.length;

/* 4 · the HTTP flow registry — specified, and built nowhere */
const regSpec = loaded.get('registry-spec');
for (const r of regSpec.lists) {
  const l = list(null, regSpec.registry.targetSite.split('/sites/')[1], r.listTitle);
  l.governance = l.governance ?? { disposition: 'NOT PROVISIONED' };
  say(l, 'registry-spec', {
    kind: 'specified',
    says: `designed with ${r.customFieldCount} custom field(s), unique key ${r.uniqueKey}, base template ${r.baseTemplate}`,
    description: r.description,
    executionEvidence: r.executionEvidence,
    exists: false,
  });
  if (l.observedInTenant) {
    l.conflicts.push({
      about: 'existence',
      between: ['registry-spec', 'tenant-capture'],
      values: { 'registry-spec': 'declared NOT BUILT', 'tenant-capture': `observed ${CAPTURE_UTC}` },
      note: 'The specification says this list does not exist and the capture saw it. Resolve against the tenant before relying on either.',
    });
  }
}
for (const f of regSpec.fields) {
  const l = [...lists.values()].find((x) => x.titles.includes(f.listTitle));
  if (!l) continue;
  addField(l, 'registry-spec', {
    evidenceBasis: 'specification',
    sourceMeaning: 'declared by the HTTP flow registry workbook. No list in that spec is built',
    internalName: f.internalName,
    displayName: f.displayName,
    fieldType: f.expectedTypeAsString,
    required: f.required,
    indexed: f.indexed,
    unique: f.unique,
    typeParameters: f.typeParameters ?? null,
    purpose: f.purpose,
    schemaXml: f.schemaXml,
    executionEvidence: f.executionEvidence,
  });
}

/* 5 · the portal specification — per-column captured state, kept per column */
const portalSpec = loaded.get('portal-spec');
for (const p of portalSpec.lists) {
  const l = list(p.listGuid, p.site, p.listTitle);
  if (p.serverRelativeUrl && !l.serverRelativeUrls.includes(p.serverRelativeUrl)) l.serverRelativeUrls.push(p.serverRelativeUrl);
  if (p.siteUrl && !l.siteUrls.includes(p.siteUrl)) l.siteUrls.push(p.siteUrl);
  const live = (p.fields || []).filter((f) => f.capturedState === 'LIVE').length;
  const pending = (p.fields || []).length - live;
  say(l, 'portal-spec', {
    kind: 'specified',
    says: `${(p.fields || []).length} column(s) specified — ${live} LIVE at capture, ${pending} not`,
    estate: p.estate,
    capturedUtc: portalSpec.tenantCaptureUtc,
  });
  for (const f of p.fields || []) {
    const pb = PORTAL_BASIS[f.capturedState] ?? { basis: 'specification', sourceMeaning: `unrecognised capturedState ${f.capturedState}` };
    addField(l, 'portal-spec', {
      evidenceBasis: pb.basis,
      sourceMeaning: pb.sourceMeaning,
      capturedState: f.capturedState,
      internalName: f.internalName,
      displayName: f.displayName,
      fieldType: f.fieldType,
      required: f.required,
      indexed: f.indexed,
      enforceUnique: f.enforceUnique,
      choices: f.choices ?? null,
    });
  }
}

/* 6 · internal platform evidence — columns observed deployed */
const internal = loaded.get('internal-evidence');
for (const [guid, e] of Object.entries(internal.lists)) {
  const l = list(guid, e.site, e.title);
  const cols = Object.entries(e.columns || {});
  say(l, 'internal-evidence', {
    kind: 'observed',
    says: `${cols.length} column(s) evidenced on the internal platform`,
    adopted: e.adopted,
  });
  for (const [name, state] of cols) {
    const ib = INTERNAL_BASIS[state];
    if (!ib) fail(`internal-field-evidence uses an evidence state this register does not map: ${state}`);
    addField(l, 'internal-evidence', {
      evidenceBasis: ib.basis,
      sourceMeaning: ib.sourceMeaning,
      evidenceState: state,
      internalName: name,
    });
  }
}

/* 7 · index targets */
for (const t of loaded.get('index-targets').targets) {
  const l = [...lists.values()].find((x) => x.titles.includes(t.listTitle) || (t.listGuid && x.listGuid === LOWER(t.listGuid)))
    || list(t.listGuid ?? null, t.site ?? null, t.listTitle);
  l.indexTargets.push(t);
  say(l, 'index-targets', {
    kind: 'specified',
    says: `an index is required on ${t.internalName} — ${t.reason}`,
    internalName: t.internalName,
    itemsAtCapture: t.itemsAtCapture,
    declaredOn: t.declaredOn,
  });
}

/* 8 · the superseded list spec, recorded and never counted */
const legacy = loaded.get('legacy-list-spec');
for (const g of legacy.lists ?? []) {
  const title = g.listTitle ?? null;
  if (!title) continue;
  const l = [...lists.values()].find((x) => x.titles.includes(title)) || list(null, legacy.targetSite?.split('/sites/')[1] ?? null, title);
  say(l, 'legacy-list-spec', {
    kind: 'superseded',
    says: `named by the superseded specification (${legacy.supersededReason})`,
    supersededBy: legacy.supersededBy,
  });
}

/* 9 · the separate internal proof ledger — one list, decided and not built */
const ledger = loaded.get('proof-ledger');
{
  const t = ledger.listToProvision;
  const l = list(ledger.listId ?? null, t.site?.split('/sites/')[1] ?? null, t.title);
  say(l, 'proof-ledger', {
    kind: 'specified',
    says: `required by the owner's ${ledger.decidedUtc} decision: ${ledger.status}`,
    decision: ledger.decision,
    whyThatSite: t.whyThatSite,
    indexOn: t.indexOn ?? null,
    whatIsBlocked: ledger.whatIsBlocked,
    untilThen: ledger.untilThen,
    exists: false,
  });
  for (const c of t.columns ?? []) {
    addField(l, 'proof-ledger', {
      evidenceBasis: 'specification',
      sourceMeaning: "declared by the owner's 2026-09-24 separate-ledger decision; the list is not provisioned",
      internalName: c.internalName,
      displayName: c.internalName,
      fieldType: c.type,
      required: c.required ?? null,
      indexed: (t.indexOn ?? []).includes?.(c.internalName) ?? null,
      holds: c.holds ?? null,
    });
  }
}

/* 10 · the mailer platform's own lists — a platform the tenant capture predates */
const mailer = loaded.get('mailer-catalogue');
const MAILER_SITE = mailer.siteUrl?.split('/sites/')[1] ?? null;
for (const m of mailer.lists ?? []) {
  const l = list(null, MAILER_SITE, m.title);
  if (mailer.siteUrl && !l.siteUrls.includes(mailer.siteUrl)) l.siteUrls.push(mailer.siteUrl);
  say(l, 'mailer-catalogue', {
    kind: 'specified',
    says: `${(m.fields || []).length} column(s) declared by the mailer contract ${mailer.contractVersion}`,
    provisionedBy: "the mailer's own setup, on first run",
    exists: null,
  });
  for (const name of m.fields ?? []) {
    /* The catalogue gives the internal name and nothing else. Recording a type it does not state
       would be inventing one, so the row carries the name and says what is absent. */
    addField(l, 'mailer-catalogue', {
      evidenceBasis: 'specification',
      sourceMeaning: `declared by the mailer flow catalogue, contract ${mailer.contractVersion}`,
      internalName: name,
      displayName: name,
      fieldType: null,
      fieldTypeAbsentBecause: 'the catalogue declares column names only; no type, requiredness or index is stated',
    });
  }
}

/* ── flows ──────────────────────────────────────────────────────────────────────────────────
   Keyed on the 32-hex workflow id when a source has one, otherwise on the flow GUID, otherwise on
   the display name. Three tiers of identity, and the row says which it has — because GOV-06 is the
   measured fact that the first two never resolve to each other in this estate. */
const flows = new Map();
const HEX32 = /^[0-9a-f]{32}$/i;
const GUID36 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Indexed by each identifier as well as by key, because keying on the workflow id where both are
   present split 32 flows across two rows: one keyed `workflow:<wid>` carrying the dashed id too, and
   one keyed `flow:<guid>` from a source that gave only the dashed id. Those two rows carry the SAME
   dashed identifier, so they are one flow by identity and not by inference — nothing like the GOV-06
   join, which asks a workflow id to resolve to a dashed id it has no relation to. Left unmerged they
   inflated every flow total by 32 and made the usage breakdown sum past the 648 the export read. */
const byWorkflowId = new Map();
const byFlowGuid = new Map();
const byNameOnly = new Map();
const ARRAY_FIELDS = ['names', 'contractKeys', 'definitionFiles', 'listsTouched', 'statements', 'conflicts', 'otherFlowGuids'];
const SCALAR_FIELDS = ['category', 'trigger', 'method', 'routingSegment', 'environment', 'endpointShape'];

function mergeFlowRows(keep, drop) {
  for (const k of ARRAY_FIELDS) {
    for (const v of drop[k]) {
      if (k === 'names' || k === 'contractKeys') { if (!keep[k].includes(v)) keep[k].push(v); } else keep[k].push(v);
    }
  }
  for (const k of SCALAR_FIELDS) keep[k] = keep[k] ?? drop[k];
  keep.workflowId = keep.workflowId ?? drop.workflowId;
  keep.flowGuid = keep.flowGuid ?? drop.flowGuid;
  keep.definitionHeld = keep.definitionHeld || drop.definitionHeld;
  if (drop.actionCount !== null) keep.actionCount = Math.max(keep.actionCount ?? 0, drop.actionCount);
  keep.mergedRowKeys.push(drop.key, ...drop.mergedRowKeys);
  flows.delete(drop.key);
  for (const [id, row] of byWorkflowId) if (row === drop) byWorkflowId.set(id, keep);
  for (const [id, row] of byFlowGuid) if (row === drop) byFlowGuid.set(id, keep);
  for (const [n, row] of byNameOnly) if (row === drop) byNameOnly.set(n, keep);
  return keep;
}

function flow({ workflowId = null, flowGuid = null, name = null }) {
  /* A reader that hands this an object instead of a name silently writes that object into the row's
     names array, where it reads as a flow name in every view built from the register. One did:
     contract-key-flow-reconciliation's `intendedFlow` is {flowId, name, confidence}. Fail instead. */
  if (name !== null && typeof name !== 'string') {
    fail(`a reader passed a non-string flow name: ${JSON.stringify(name).slice(0, 200)}`);
  }
  const wid = workflowId && HEX32.test(workflowId) ? LOWER(workflowId) : null;
  /* A flow artefact file name carries its flow's id (identifier catalogue namingConventions.flowArtifactFile:
     <KEY>__<FlowName>__<flow-id8>[__<Part>].<kind>), so a package read by its file name joins its flow's row instead of
     becoming a flow of its own. The 8-digit id resolves to the full GUID only through FLOW_IDENTITIES, and only when
     the flow name and the prefix agree; a GUID elsewhere in a name is not taken as the flow's. */
  const named = !flowGuid && typeof name === 'string' ? parseFlowArtifactName(name.split(' (scope ')[0].replace(/^.*\//, '')) || parseFlowArtifactName(`${name.split(' (scope ')[0].replace(/^.*\//, '')}.json`) : null;
  const known = named ? FLOW_IDENTITIES[named.flow] : null;
  const nameGuid = known && named.id !== 'NOT_CAPTURED' && flowIdPart(known.id) === named.id ? known.id : null;
  const fid = (flowGuid && GUID36.test(flowGuid)) ? LOWER(flowGuid) : (nameGuid ? LOWER(nameGuid) : null);
  const byWid = wid ? byWorkflowId.get(wid) : null;
  const byFid = fid ? byFlowGuid.get(fid) : null;
  let f = byWid ?? byFid ?? (!wid && !fid ? byNameOnly.get(LOWER(name)) : null) ?? null;
  if (byWid && byFid && byWid !== byFid) {
    /* Merge only when neither row already carries a DIFFERENT value for the identifier the other
       supplies. Where it does, one workflow id is paired with two dashed flow ids by two readings —
       GOV-06's own failure mode — and merging would silently discard one of them. An earlier draft
       did exactly that and lost four flows the tenant export had read. So the rows stay apart and
       both carry the conflict with both values. */
    const clash = (byWid.flowGuid && byWid.flowGuid !== fid) || (byFid.workflowId && byFid.workflowId !== wid);
    if (clash) {
      const conflict = {
        about: 'identifier pairing',
        between: ['this row', 'the row carrying the other identifier'],
        values: {
          'workflow id': wid,
          'dashed flow id supplied beside it': fid,
          'dashed flow id already on the workflow-id row': byWid.flowGuid ?? null,
          'workflow id already on the dashed-id row': byFid.workflowId ?? null,
        },
        note:
          'Two readings pair these identifiers differently. The register keeps both rows and merges '
          + 'neither: GOV-06 is the measured fact that the two identifier spaces do not resolve, so a '
          + 'pairing is a statement by one source and not a fact about the flow.',
      };
      for (const row of [byWid, byFid]) {
        if (!row.conflicts.some((c) => c.about === 'identifier pairing' && c.values['workflow id'] === wid
          && c.values['dashed flow id supplied beside it'] === fid)) row.conflicts.push(conflict);
      }
      f = byWid;
    } else {
      f = mergeFlowRows(byWid, byFid);
    }
  }
  if (!f) {
    const key = wid ? `workflow:${wid}` : fid ? `flow:${fid}` : `name:${LOWER(name)}`;
    f = {
      key,
      identity: wid ? 'workflowId (32-hex Logic Apps)' : fid ? 'flowGuid (36-char Power Automate)' : 'displayName only',
      workflowId: wid,
      flowGuid: fid,
      names: [],
      contractKeys: [],
      category: null,
      trigger: null,
      method: null,
      routingSegment: null,
      environment: null,
      endpointShape: null,
      definitionHeld: false,
      definitionFiles: [],
      actionCount: null,
      listsTouched: [],
      statements: [],
      conflicts: [],
      otherFlowGuids: [],
      mergedRowKeys: [],
    };
    flows.set(key, f);
  }
  if (name && !f.names.includes(name)) f.names.push(name);
  if (wid && !f.workflowId) { f.workflowId = wid; f.identity = 'workflowId (32-hex Logic Apps)'; }
  if (fid && !f.flowGuid) f.flowGuid = fid;
  /* A second dashed id for a row that already has one. It is not a correction and not a duplicate:
     two sources pair this workflow id with two different flows. Keeping only the first would drop the
     other from the register entirely — it dropped two flows the tenant export had read — so the row
     carries every dashed id any source pairs with it, and says they disagree. */
  if (fid && f.flowGuid && f.flowGuid !== fid && !f.otherFlowGuids.includes(fid)) {
    f.otherFlowGuids.push(fid);
    f.conflicts.push({
      about: 'dashed flow id',
      between: ['the first source to pair a dashed id with this workflow id', 'a later one'],
      values: { first: f.flowGuid, later: fid },
      note:
        'Both are recorded. Which one this workflow id actually addresses is unresolved here, and GOV-06 '
        + 'is why: nothing in this branch resolves a workflow id to a dashed flow id.',
    });
  }
  if (wid) byWorkflowId.set(wid, f);
  if (fid) byFlowGuid.set(fid, f);
  if (!wid && !fid && name) byNameOnly.set(LOWER(name), f);
  return f;
}

/* 1 · the tenant endpoint register */
const epReg = loaded.get('endpoint-register');
for (const e of epReg.current_configuration) {
  const f = flow({ workflowId: e.workflow_id, name: e.flow_name });
  if (!f.contractKeys.includes(e.key)) f.contractKeys.push(e.key);
  f.endpointShape = String(e.sanitized_endpoint_url || '').split('?')[0] || null;
  say(f, 'endpoint-register', {
    kind: 'observed',
    says: `configured as contract key ${e.key}`,
    credentialFieldsRemoved: e.credential_fields_removed,
  });
}
for (const w of epReg.complete_flow_registry) {
  const f = flow({ workflowId: w.workflow_id, name: (w.flow_names_and_keys || [])[0] ?? null });
  for (const n of w.flow_names_and_keys || []) if (!f.names.includes(n)) f.names.push(n);
  f.category = f.category ?? w.category ?? null;
  const ep = (w.endpoints || [])[0];
  if (ep) {
    f.trigger = f.trigger ?? ep.trigger ?? null;
    f.method = f.method ?? ep.method ?? null;
    f.routingSegment = f.routingSegment ?? ep.routing_segment ?? null;
    f.endpointShape = f.endpointShape ?? (String(ep.sanitized_url || '').split('?')[0] || null);
  }
  say(f, 'endpoint-register', {
    kind: 'observed',
    says: `in the complete flow registry, category ${w.category}, ${(w.endpoints || []).length} endpoint(s)`,
  });
}

/* 2 · the derived contract-key resolution */
const wids = loaded.get('workflow-ids');
for (const scope of ['internal', 'portal']) {
  /* Keyed by contract key, not an array — so the key itself is data the register must keep. */
  for (const [contractKey, e] of Object.entries(wids[scope] ?? {})) {
    const f = flow({ workflowId: e.workflowId, name: e.flow });
    if (!f.contractKeys.includes(contractKey)) f.contractKeys.push(contractKey);
    f.category = f.category ?? e.category ?? null;
    f.method = f.method ?? e.method ?? null;
    f.routingSegment = f.routingSegment ?? e.routingSegment ?? null;
    say(f, 'workflow-ids', {
      kind: 'derived',
      says: `${scope} contract key ${contractKey}, method ${e.method}${e.sharesFlowWith?.length ? `, shares this flow with ${e.sharesFlowWith.join(', ')}` : ''}`,
      contractKey,
      scope,
      resolvedFrom: e.source,
      sharesFlowWith: e.sharesFlowWith ?? [],
    });
    if (e.method && e.registerMethod && e.method !== e.registerMethod) {
      f.conflicts.push({
        about: 'method',
        between: ['workflow-ids', 'endpoint-register'],
        values: { 'workflow-ids': e.method, 'endpoint-register': e.registerMethod },
        note: 'The resolved method and the method the tenant register reports differ.',
      });
    }
  }
}

/* 3 · the portal capture */
const pWids = loaded.get('portal-workflow-ids');
for (const e of pWids.endpoints ?? []) {
  const f = flow({ workflowId: e.workflowId, flowGuid: e.internalName, name: e.flow });
  if (e.key && !f.contractKeys.includes(e.key)) f.contractKeys.push(e.key);
  say(f, 'portal-workflow-ids', {
    kind: 'observed',
    says: `captured as portal endpoint ${e.key}`,
    capturedAt: pWids.capturedAt,
    record: e,
  });
}

/* 4 · the internal register's physical-flow mapping */
const intReg = loaded.get('internal-register');
for (const p of intReg.physicalFlows) {
  const f = flow({ workflowId: p.workflowId, name: p.physicalFlow });
  for (const k of p.servesContractKeys || []) if (!f.contractKeys.includes(k)) f.contractKeys.push(k);
  say(f, 'internal-register', {
    kind: 'derived',
    says: `physical flow serving ${(p.servesContractKeys || []).length} contract key(s): ${(p.servesContractKeys || []).join(', ') || 'none recorded'}`,
  });
}

/* 5 · exported and corrected definitions — authoritative about their own bodies */
const countActions = (node) => {
  let n = 0;
  const walk = (acts) => {
    for (const a of Object.values(acts || {})) {
      n += 1;
      if (a && typeof a === 'object') {
        if (a.actions) walk(a.actions);
        if (a.else?.actions) walk(a.else.actions);
      }
    }
  };
  walk(node);
  return n;
};
for (const { group, rel, file } of definitionFiles) {
  let d;
  try { d = readJson(rel); } catch (err) { fail(`${rel} is not readable JSON: ${err.message}`); }
  const ident = d.workflow_identity ?? {};
  const name = ident.tags?.flowDisplayName ?? d.flow ?? file.split('__')[0];
  const internalName = ident.internal_name ?? d.flowId ?? null;
  const f = flow({ flowGuid: internalName, workflowId: internalName, name });
  f.definitionHeld = true;
  f.definitionFiles.push({ source: group.id, path: rel, kind: group.kind });
  f.environment = f.environment ?? ident.tags?.environmentName ?? null;
  const defRoot = d.definition?.actions ?? d.definition ?? {};
  const acts = countActions(defRoot);
  if (acts) f.actionCount = Math.max(f.actionCount ?? 0, acts);
  const trig = Object.values(d.definition?.triggers ?? {})[0];
  if (trig) f.trigger = f.trigger ?? (trig.kind ?? trig.type ?? null);
  say(f, group.id, {
    kind: group.kind,
    says: `definition held at ${rel}, ${acts} action(s)`,
    exportedAtUtc: d.exportedAtUtc ?? null,
    corrects: d.corrects ?? null,
  });
}

/* 6 · the join that does not join */
const defMap = loaded.get('definition-map');
for (const m of defMap.matched) {
  const f = flow({ flowGuid: m.internalName, workflowId: m.internalName, name: m.name });
  say(f, 'definition-map', {
    kind: 'derived',
    says: `matched to register workflow id(s) ${m.registerWorkflowIds.join(', ')} by normalised display name${m.ambiguous ? ' — AMBIGUOUS' : ''}`,
    matchedBy: 'normalised display name',
    ambiguous: m.ambiguous,
    registerWorkflowIds: m.registerWorkflowIds,
    servesKeys: m.servesKeys,
  });
}

/* 7 · which flow touches which list */
const flMap = loaded.get('flow-list-map');
for (const fl of flMap.flows) {
  const f = flow({ workflowId: fl.workflowId, flowGuid: fl.internalName, name: fl.displayName ?? fl.flow });
  if (fl.actions) f.actionCount = Math.max(f.actionCount ?? 0, fl.actions);
  for (const r of fl.references || []) {
    f.listsTouched.push({
      action: r.action,
      path: r.path,
      operation: r.operation,
      operationId: r.operationId,
      siteUrl: r.siteUrl,
      listGuid: r.listGuid ? LOWER(r.listGuid) : null,
      listTitle: r.listTitle,
      addressedBy: r.listGuid ? 'GUID' : r.listTitle ? 'title' : 'neither',
      dynamic: r.dynamic,
      connector: r.connector,
    });
    const target = r.listGuid
      ? [...lists.values()].find((x) => x.listGuid === LOWER(r.listGuid))
      : [...lists.values()].find((x) => x.titles.includes(r.listTitle));
    if (target) {
      target.touchedByFlows.push({
        flow: fl.displayName ?? fl.flow,
        flowFile: fl.file,
        action: r.action,
        operation: r.operation,
        addressedBy: r.listGuid ? 'GUID' : 'title',
      });
    }
  }
  say(f, 'flow-list-map', {
    kind: 'derived',
    says: `${(fl.references || []).length} SharePoint reference(s) across ${fl.actions ?? 0} action(s)`,
    contentHash: fl.contentHash,
    duplicatePaths: fl.duplicatePaths ?? [],
  });
}

/* 8 · candidates, never counted as resolved */
const cands = loaded.get('flow-candidates');
for (const [wid, list_] of Object.entries(cands.candidates ?? {})) {
  const f = flow({ workflowId: wid });
  /* An empty candidate array is not nothing to record: it is the measured statement that this
     workflow id has no candidate mapping at all, which is exactly what a reader needs to know. */
  say(f, 'flow-candidates', {
    kind: 'derived',
    says: (list_ ?? []).length
      ? `${list_.length} UNCONFIRMED candidate mapping(s) (${cands.confirmationStatus})`
      : `no candidate mapping was found for this workflow id (${cands.confirmationStatus})`,
    candidates: list_ ?? [],
  });
}

/* 9 · designer-paste targets: retired with the replacement packages on 2026-10-06 (registers/flow-retirement.json). */

/* 10, 11 · the Flow Workbench catalogue and its request shapes: retired with the Workbench on 2026-10-22. */

/* 12 · the live tenant reading of 2026-09-18 — an observation, dashed ids and all */
const inv = loaded.get('tenant-flow-inventory');
for (const e of inv.flows ?? []) {
  const f = flow({ workflowId: e.applicationWorkflowId, flowGuid: e.flowId, name: e.displayName });
  for (const k of e.contractKeys ?? []) if (!f.contractKeys.includes(k)) f.contractKeys.push(k);
  f.trigger = f.trigger ?? e.triggerName ?? null;
  f.method = f.method ?? e.method ?? null;
  say(f, 'tenant-flow-inventory', {
    kind: 'observed',
    observedUtc: inv.capturedUtc,
    says: `read live on ${inv.capturedUtc}: state ${e.state}, trigger ${e.triggerName}, method ${e.method ?? 'not stated'}, trigger authentication ${e.triggerAuthenticationType}`,
    record: e,
  });
}
for (const n of inv.notFound ?? []) {
  const f = flow({ workflowId: n.applicationWorkflowId, name: n.canonicalFlowName ?? null });
  say(f, 'tenant-flow-inventory', {
    kind: 'observed',
    observedUtc: inv.capturedUtc,
    says: `requested from the tenant on ${inv.capturedUtc} and NOT FOUND (${n.status})`,
    record: n,
  });
}
for (const j of inv.registryJoin ?? []) {
  const f = flow({ workflowId: j.applicationWorkflowId, flowGuid: j.powerAutomateFlowId, name: j.canonicalFlowName ?? j.exportedFlowName ?? null });
  say(f, 'tenant-flow-inventory', {
    kind: 'derived',
    says: `registry sequence ${j.registrySequence} joins to this flow by ${j.mappingType}`,
    record: j,
  });
}

/* 13 · the widest tenant reading in the branch: 648 flows */
const usage = loaded.get('flow-usage');
/* The source states its own date inside a sentence and nowhere as a field. Read it from the
   sentence rather than from the file name, and fail instead of guessing if it is not there. */
const USAGE_EXPORT_DATE = (String(usage.source.export).match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
  ?? fail('flow-usage-analysis states no export date in source.export');
for (const u of usage.allFlows ?? []) {
  const f = flow({ flowGuid: u.flow_guid, name: u.flow_name });
  say(f, 'flow-usage', {
    kind: 'observed',
    observedUtc: USAGE_EXPORT_DATE,
    says: u.used
      ? `in the tenant export of ${usage.totals.flows} flows, state ${u.state}, USED by ${u.primary_role}${u.platforms ? ` on ${u.platforms}` : ''}, ${u.action_count} action(s)`
      : `in the tenant export of ${usage.totals.flows} flows, state ${u.state}, not evidenced as used by this estate, ${u.action_count} action(s)`,
    export: usage.source.export,
    record: u,
  });
}
for (const n of usage.namedButNotExported ?? []) {
  const f = flow({ name: n.flowName ?? n.reference ?? null });
  say(f, 'flow-usage', {
    kind: 'observed',
    observedUtc: USAGE_EXPORT_DATE,
    says: `named by ${n.reference} and NOT present in the tenant export of ${usage.totals.flows} flows`,
    record: n,
  });
}

/* 14 · the EMAIL adoption decision — two packages, one flow */
const adoption = loaded.get('email-flow-adoption');
for (const c of adoption.candidates ?? []) {
  const f = flow({ flowGuid: c.flowId, name: c.displayName });
  say(f, 'email-flow-adoption', {
    kind: 'observed',
    observedUtc: adoption.capturedUtc,
    says: `supplied as package ${c.package} for the EMAIL contract key — ${c.verdict}`,
    record: c,
  });
}

/* 15 · the two remediations verified from fresh artefacts */
const remediation = loaded.get('tenant-remediation');
for (const [which, r] of Object.entries(remediation)) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || !r.flowId) continue;
  const f = flow({ workflowId: r.applicationWorkflowId, flowGuid: r.flowId, name: which });
  if (r.contractKey && !f.contractKeys.includes(r.contractKey)) f.contractKeys.push(r.contractKey);
  say(f, 'tenant-remediation', {
    kind: 'observed',
    observedUtc: remediation.capturedUtc,
    says: `verified on ${remediation.capturedUtc} against ${r.item}`,
    record: r,
  });
}

/* 16 · the registry seed — every flow the estate knows, in registry column shape */
const seed = loaded.get('registry-seed');
const seedDeps = new Map();
for (const d of seed.dependencyRows ?? []) {
  if (!seedDeps.has(d.RegistryKey)) seedDeps.set(d.RegistryKey, []);
  seedDeps.get(d.RegistryKey).push(d);
}
for (const r of seed.registryRows ?? []) {
  const f = flow({ workflowId: r.WorkflowId, flowGuid: r.FlowId, name: r.FlowName });
  f.method = f.method ?? r.HttpMethod ?? null;
  f.environment = f.environment ?? r.EnvironmentName ?? null;
  const deps = seedDeps.get(r.RegistryKey) ?? [];
  say(f, 'registry-seed', {
    kind: 'derived',
    says: `seeded as registry key ${r.RegistryKey}, lifecycle ${r.LifecycleStatus}, authentication ${r.AuthenticationMode}, ${deps.length} dependency row(s)`,
    record: r,
    dependencies: deps,
    targetLists: seed.targetLists,
    listsProvisioned: seed.standing?.listsProvisioned ?? null,
  });
}
for (const sl of seed.lists ?? []) {
  const l = [...lists.values()].find((x) => (sl.listGuid && x.listGuid === LOWER(sl.listGuid)) || x.titles.includes(sl.listTitle))
    || list(sl.listGuid ?? null, sl.site ?? null, sl.listTitle);
  say(l, 'registry-seed', {
    kind: 'derived',
    says: `named as a dependency of ${sl.touchedBy} flow(s), resolved via ${sl.resolvedVia}${sl.addressedByTitleOnly ? ', addressed by title only' : ''}`,
    record: sl,
  });
}

/* 17 · the four registry columns that need a person */
for (const d of loaded.get('registry-decisions').decisions ?? []) {
  const f = [...flows.values()].find((x) => x.names.some((n) => LOWER(n) === LOWER(d.FlowName)))
    ?? flow({ name: d.FlowName });
  const needing = Object.entries(d.proposals ?? {}).filter(([, p]) => !p.proposed).map(([c]) => c);
  say(f, 'registry-decisions', {
    kind: 'derived',
    says: `${needing.length} of ${Object.keys(d.proposals ?? {}).length} required registry column(s) cannot be proposed from evidence: ${needing.join(', ') || 'none'}`,
    identity: d.identity,
    listsTouched: d.listsTouched,
    proposals: d.proposals,
    ratified: false,
  });
}

/* 18 · both identifier domains, side by side and never collapsed */
const cross = loaded.get('identity-crosswalk');
for (const k of cross.keys ?? []) {
  const f = flow({ workflowId: k.applicationWorkflowId, name: k.canonicalFlow ?? null });
  if (k.contractKey && !f.contractKeys.includes(k.contractKey)) f.contractKeys.push(k.contractKey);
  say(f, 'identity-crosswalk', {
    kind: 'derived',
    says: `contract key ${k.key}: ${k.resolution}, registry status ${k.registryStatus}, ${(k.candidates ?? []).length} tenant flow candidate(s)`,
    record: k,
    identifierDomains: cross.identifierDomains,
  });
  /* The candidate's tenant flow id is a row of its own. Writing it onto the workflow-id row would
     be the inference GOV-06 exists to refuse. */
  for (const c of k.candidates ?? []) {
    const t = flow({ flowGuid: c.tenantFlowId, name: c.tenantDisplayName });
    say(t, 'identity-crosswalk', {
      kind: 'derived',
      says: `offered as a candidate for contract key ${k.key} on ${c.matchBasis}${c.verifiedBy ? `, verified by ${c.verifiedBy}` : ', unverified'}`,
      record: c,
      forContractKey: k.key,
      note: 'A candidate. This row carries the tenant flow id; the contract key is keyed on the application workflow id, and the two do not resolve to each other.',
    });
  }
}
for (const e of cross.exports ?? []) {
  const f = flow({ flowGuid: e.tenantFlowId, name: e.displayName });
  say(f, 'identity-crosswalk', {
    kind: 'derived',
    says: `export package ${e.package} is of this flow — ${e.disposition}`,
    record: e,
  });
}

/* 19 · the owner's intended mapping, and the reconciliation that applies none of it */
const ckMap = loaded.get('contract-key-map');
for (const m of ckMap.map ?? []) {
  const f = flow({ flowGuid: m.flowId, name: m.expectedFlowName });
  if (m.contractKey && !f.contractKeys.includes(m.contractKey)) f.contractKeys.push(m.contractKey);
  say(f, 'contract-key-map', {
    kind: 'specified',
    says: `the platform owner intends this flow to serve ${m.contractKey} (${m.mappingConfidence})`,
    record: m,
    suppliedUtc: ckMap.recordedUtc,
    authority: ckMap.authority,
  });
}
for (const r of loaded.get('contract-key-reconciliation').rows ?? []) {
  /* intendedFlow is an OBJECT — {flowId, name, confidence} — and the flow it names is not always the
     flow the key is wired to; that difference is the whole point of the reconciliation. So the wired
     flow and the intended flow get a statement each, on their own rows, and the register does not
     pair one's workflow id with the other's dashed id. */
  const intended = r.intendedFlow && typeof r.intendedFlow === 'object' ? r.intendedFlow : null;
  const intendedName = intended ? intended.name : (typeof r.intendedFlow === 'string' ? r.intendedFlow : null);
  if (r.wiredWorkflowId) {
    const w = flow({ workflowId: r.wiredWorkflowId });
    if (r.contractKey && !w.contractKeys.includes(r.contractKey)) w.contractKeys.push(r.contractKey);
    say(w, 'contract-key-reconciliation', {
      kind: 'derived',
      says: `${r.contractKey} is wired here: ${r.verdict} — ${r.action}`,
      record: r,
      intendedFlow: intendedName,
      intendedFlowId: intended?.flowId ?? null,
    });
  }
  if (intended?.flowId || intendedName) {
    const i = flow({ flowGuid: intended?.flowId ?? null, name: intendedName });
    say(i, 'contract-key-reconciliation', {
      kind: 'derived',
      says: `named as the intended flow for ${r.contractKey}: ${r.verdict} — ${r.action}`,
      record: r,
      wiredWorkflowId: r.wiredWorkflowId ?? null,
      confidence: intended?.confidence ?? null,
      note: 'Intent. It is not evidence that this flow serves the key, and the wired flow is a separate row.',
    });
  }
}

/* 20 · where each supplied package came from */
for (const p of loaded.get('package-provenance').packages ?? []) {
  const f = flow({ flowGuid: p.flowId, name: p.displayName });
  for (const k of p.contractKeys ?? []) if (!f.contractKeys.includes(k)) f.contractKeys.push(k);
  say(f, 'package-provenance', {
    kind: 'derived',
    says: `package ${p.package} (tier ${p.tier}) is ${p.isDeployedFlow ? 'an export of a deployed flow' : 'NOT an export of any deployed flow'}, ${p.inTenantReading ? 'present in the 2026-09-18 tenant reading' : 'absent from the 2026-09-18 tenant reading'}`,
    record: p,
  });
}

/* 21 · every connector every flow action uses */
const conn = loaded.get('connector-register');
const connArtefacts = new Map();
for (const a of conn.artefacts ?? []) {
  if (!connArtefacts.has(a.flow)) connArtefacts.set(a.flow, []);
  connArtefacts.get(a.flow).push(a);
}
for (const c of conn.flows ?? []) {
  /* The register keys on the flow LABEL. Where an artefact for that label carries an identifier,
     the row takes it; where none does, the row stays name-only and says so by its identity. */
  const arts = connArtefacts.get(c.flow) ?? [];
  const withId = arts.find((a) => a.workflowId) ?? arts.find((a) => a.internalName) ?? {};
  const f = flow({ workflowId: withId.workflowId, flowGuid: withId.internalName, name: String(c.flow).trim() });
  f.environment = f.environment ?? withId.environment ?? null;
  say(f, 'connector-register', {
    kind: 'derived',
    says: `${(c.connectors ?? []).length} connector(s) across ${c.connectorRows ?? 0} action row(s) in ${(c.artefacts ?? []).length} artefact(s): ${(c.connectors ?? []).join(', ') || 'none'}`,
    connectors: c.connectors ?? [],
    artefacts: c.artefacts ?? [],
    connectorRows: c.connectorRows ?? 0,
    identifierCarriedByArtefact: withId.workflowId ?? withId.internalName ?? null,
  });
}
for (const t of conn.sharePointTargets ?? []) {
  if (!t.listTitle && !t.list) continue;
  const byGuid = t.list && GUID36.test(String(t.list)) ? LOWER(t.list) : null;
  const l = [...lists.values()].find((x) => (byGuid && x.listGuid === byGuid) || (t.listTitle && x.titles.includes(t.listTitle)));
  if (!l) continue;
  say(l, 'connector-register', {
    kind: 'derived',
    says: `addressed by ${(t.flows ?? []).length} flow(s) in ${t.uses} action(s) — ${(t.operations ?? []).join(', ')} (${t.listResolution})`,
    record: t,
  });
}

/* 22 · gates that cannot go both ways */
const gates = loaded.get('authorisation-gates');
for (const g of gates.findings ?? []) {
  const f = [...flows.values()].find((x) => x.names.some((n) => String(g.where ?? '').includes(n)))
    ?? flow({ name: g.where });
  say(f, 'authorisation-gates', {
    kind: 'derived',
    says: `an authorisation decision here is pinned to ${JSON.stringify(g.pinnedTo)} and cannot return false`,
    record: g,
    doesNotClaim: gates.whatItDoesNotClaim,
  });
}

/* 23 · which trigger URLs the rotation invalidates */
for (const r of loaded.get('rotation-worksheet').rows ?? []) {
  const f = flow({ workflowId: r.workflowId, name: r.flow });
  if (r.key && !f.contractKeys.includes(r.key)) f.contractKeys.push(r.key);
  say(f, 'rotation-worksheet', {
    kind: 'derived',
    says: `${r.scope} key ${r.key}: ${r.status} — ${r.action}`,
    record: r,
  });
}

/* 24 · the portal as a trust boundary */
const wiring = loaded.get('portal-wiring');
for (const e of wiring.endpoints ?? []) {
  const f = flow({ name: (e.deployedFlowCandidates ?? [])[0] ?? e.designFlow });
  if (e.endpoint && !f.contractKeys.includes(e.endpoint)) f.contractKeys.push(e.endpoint);
  say(f, 'portal-wiring', {
    kind: 'derived',
    says: `portal endpoint ${e.endpoint} requires ${(e.requiredOperations ?? []).length} list operation(s); deployed candidate(s): ${(e.deployedFlowCandidates ?? []).join(', ') || 'none named'}`,
    record: e,
  });
  for (const op of e.requiredOperations ?? []) {
    const l = [...lists.values()].find((x) => (op.listGuid && x.listGuid === LOWER(op.listGuid)) || x.titles.includes(op.list));
    if (!l) continue;
    say(l, 'portal-wiring', {
      kind: 'derived',
      says: `portal endpoint ${e.endpoint} requires ${op.operation} on this list`,
      record: { endpoint: e.endpoint, ...op },
    });
  }
}
if (wiring.bridge) {
  const b = wiring.bridge;
  const f = flow({ flowGuid: b.internalName, name: b.flow });
  say(f, 'portal-wiring', {
    kind: 'derived',
    says: `the single sanctioned crossing: ${b.measuredState ?? 'state not stated'}`,
    record: b,
  });
}
for (const c of wiring.declaredCrossings ?? []) {
  const l = [...lists.values()].find((x) => (c.listGuid && x.listGuid === LOWER(c.listGuid)) || x.titles.includes(c.list));
  if (!l) continue;
  say(l, 'portal-wiring', {
    kind: 'derived',
    says: `a measured crossing by portal flow ${c.flow}: ${c.operation} — state ${c.state}`,
    record: c,
  });
}

/* 25 · what the shipping internal client calls */
const opsManifest = loaded.get('operations-manifest');
for (const e of opsManifest.endpoint_registry ?? []) {
  const f = flow({ workflowId: e.workflow_id, name: e.name });
  say(f, 'operations-manifest', {
    kind: 'derived',
    says: `called by the internal client as ${e.id} (${e.method}, ${e.configured ? 'configured' : 'NOT configured'}) — ${e.purpose}`,
    record: e,
    extractedUtc: opsManifest.generated_at_utc,
    basis: 'read from the client, so it evidences what the client calls and not what answers',
  });
}

/* 27 · the mailer platform's own flows */
for (const m of mailer.flows ?? []) {
  const f = flow({ name: m.name });
  if (m.endpointKey && !f.contractKeys.includes(m.endpointKey)) f.contractKeys.push(m.endpointKey);
  f.trigger = f.trigger ?? m.trigger ?? null;
  say(f, 'mailer-catalogue', {
    kind: 'specified',
    says: `mailer flow serving ${m.endpointKey}, ${(m.operations ?? []).length} operation(s) over ${(m.connectors ?? []).join(', ')}`,
    record: m,
    contractVersion: mailer.contractVersion,
    site: mailer.siteUrl,
  });
}

/* ── totals, by kind, because one number would be a claim nobody can support ───────────────── */
const listRows = [...lists.values()].sort((a, b) =>
  byteCompare(a.site, b.site) || byteCompare(a.titles[0], b.titles[0]) || byteCompare(a.key, b.key));
/* Within one name, the row that carries an identifier comes first. Sorting by key alone put
   `name:cg_submission_endpoint` — one source, no identifier, no references — ahead of
   `workflow:1041ed…`, which carries 17 sources and 39 SharePoint references, so a reader searching
   that flow met the empty row first and the real one second. The rank is derived from the row, so the
   order stays deterministic and byte-stable. */
const identityRank = (f) => (f.workflowId ? 0 : f.flowGuid ? 1 : 2);
const flowRows = [...flows.values()].sort((a, b) =>
  byteCompare(a.names[0], b.names[0]) || identityRank(a) - identityRank(b) || byteCompare(a.key, b.key));

for (const l of listRows) {
  l.kinds = [...new Set(l.statements.map((s) => s.kind))];
  l.fieldCount = l.fields.length;
  l.fieldsByEvidenceBasis = Object.fromEntries(
    Object.keys(EVIDENCE_BASIS).map((b) => [b, l.fields.filter((f) => f.evidenceBasis === b).length]).filter(([, n]) => n),
  );
  l.tenantObservedFieldCount = l.fields.filter((f) => f.evidenceBasis === 'tenant-observation').length;
  l.sourceCount = new Set(l.statements.map((s) => s.source)).size;
  /* Same reasoning as flow aliases: a renamed list legitimately carries both titles. */
  l.alternateTitles = l.titles.length > 1 ? l.titles : [];
}
for (const f of flowRows) {
  f.kinds = [...new Set(f.statements.map((s) => s.kind))];
  f.sourceCount = new Set(f.statements.map((s) => s.source)).size;
  f.listsTouchedCount = f.listsTouched.length;
  f.distinctListsTouched = [...new Set(f.listsTouched.map((t) => t.listTitle).filter(Boolean))].sort();
  /* Several names for one flow is NORMAL here — a flow serving OTP_GENERATE and OTP_VERIFY is
     named for both — so it is recorded as aliases, not as a conflict. An earlier draft counted it
     as one and reported 45 flow conflicts where there were 2; a conflict count inflated 22-fold
     by an ordinary condition trains a reader to ignore the number. A conflict here means two
     sources give DIFFERENT values for the SAME single-valued field. */
  f.aliases = f.names.length > 1 ? f.names : [];
}

/* ── row count versus flow count ──────────────────────────────────────────────────────────────
   A row count is NOT a flow count. Some rows are identified by display name only, because the
   source that named them carried no identifier, and some of those are certainly the same physical
   flow as a row keyed by GUID or workflow id. The register will not merge them — GOV-06 is the
   measured fact that the two identifier spaces do not resolve, and guessing across them is the
   fabrication this file exists to avoid. The numbers are computed below and never typed here,
   because a count written into a comment is a count that goes stale silently.

   What it does instead is cross-link: where a name-only row's name also appears on an identified
   row, both carry a candidateSameFlowAs pointer. A reader can follow it; nothing is collapsed on
   their behalf. The totals then state an upper and a lower bound rather than one number that would
   be wrong either way. */
const nameIndex = new Map();
for (const f of flowRows) {
  for (const n of f.names) {
    const k = LOWER(n);
    if (!nameIndex.has(k)) nameIndex.set(k, []);
    nameIndex.get(k).push(f.key);
  }
}
for (const f of flowRows) {
  const peers = new Set();
  for (const n of f.names) for (const k of nameIndex.get(LOWER(n)) ?? []) if (k !== f.key) peers.add(k);
  f.candidateSameFlowAs = [...peers].sort();
}
const identifiedNames = new Set(flowRows.filter((f) => f.workflowId || f.flowGuid).flatMap((f) => f.names.map(LOWER)));
const nameOnlyRows = flowRows.filter((f) => !f.workflowId && !f.flowGuid);
const nameOnlyWithPeer = nameOnlyRows.filter((f) => f.names.some((n) => identifiedNames.has(LOWER(n))));

/* ── how much of the tenant's flow estate is this estate's ────────────────────────────────────
   The 2026-09-26 export read 648 flows in the environment. Most of them are not this estate's, and
   a register that reported one flow total would read as though they were. So the rows carry what
   the usage analysis says about each, and the totals report the three populations separately. */
const usageVerdict = new Map();
for (const u of usage.allFlows ?? []) usageVerdict.set(LOWER(u.flow_guid), u.used ? 'used' : 'present');
for (const f of flowRows) {
  /* Every dashed id the row carries, not only the first: 2 of the 648 exported flows reach the
     register as a second dashed id on a row whose first one is different. */
  const ids = [f.flowGuid, ...f.otherFlowGuids].filter(Boolean);
  const verdicts = ids.map((id) => usageVerdict.get(id)).filter((v) => v !== undefined);
  f.inTenantExport2026_09_26 = verdicts.length > 0;
  f.usedByThisEstate = verdicts.length ? verdicts.includes('used') : null;
  f.tenantExportRowsMatched = verdicts.length;
}
const registerFlowIds = new Set();
for (const f of flowRows) for (const id of [f.flowGuid, ...f.otherFlowGuids]) if (id) registerFlowIds.add(id);
const exportIdsRepresented = (usage.allFlows ?? []).filter((u) => registerFlowIds.has(LOWER(u.flow_guid))).length;
const usedExportIdsRepresented = (usage.allFlows ?? [])
  .filter((u) => u.used === true && registerFlowIds.has(LOWER(u.flow_guid))).length;
const usedRows = flowRows.filter((f) => f.usedByThisEstate === true);
const presentUnusedRows = flowRows.filter((f) => f.usedByThisEstate === false);
const notInExportRows = flowRows.filter((f) => !f.inTenantExport2026_09_26);

/* ── the newest observation, per estate, read from the statements rather than assumed ──────────
   An earlier draft published one `newestObservation` and set it to the list capture. Once the
   2026-09-18 tenant reading and the 2026-09-26 export were declared, that single field would have
   dated the whole register four and five weeks earlier than its newest evidence. Lists and flows
   are observed by different sources on different dates, so each gets its own field. */
const DATE = /^\d{4}-\d{2}-\d{2}/;
const newestOf = (rows) => {
  let newest = null;
  for (const r of rows) {
    for (const s of r.statements) {
      const d = s.observedUtc && DATE.test(String(s.observedUtc)) ? String(s.observedUtc).slice(0, 10) : null;
      if (d && (!newest || d > newest)) newest = d;
    }
  }
  return newest;
};
const NEWEST_LIST_OBSERVATION = newestOf(listRows);
const NEWEST_FLOW_OBSERVATION = newestOf(flowRows);

const bySite = {};
for (const s of SITES) {
  const rows = listRows.filter((l) => l.site === s.key);
  bySite[s.key] = {
    siteUrl: s.url,
    listsInCapture: s.lists,
    rowsInRegister: rows.length,
    observed: rows.filter((l) => l.observedInTenant).length,
    specifiedOnly: rows.filter((l) => !l.observedInTenant).length,
  };
}

const register = {
  schema: 'dgo-estate-register/v1',
  generator: 'scripts/build-estate-register.mjs',
  generatedFrom: 'the branch as committed — no tenant was contacted',
  purpose:
    'The primary register of every SharePoint list and Power Automate flow this branch holds any '
    + 'statement about, with the provenance of each statement and every conflict named rather than '
    + 'resolved.',
  howToReadIt: {
    evidenceBasis: EVIDENCE_BASIS,
    kinds: {
      observed: 'read from the tenant on a stated date. The strongest claim available here.',
      specified: 'a design. Not evidence that anything exists.',
      derived: 'computed from other sources by a generator in this repository.',
      exported: 'a flow definition exported from Power Automate — authoritative about its own body.',
      superseded: 'kept for provenance. Never counted in a total.',
    },
    identity: {
      lists: 'A row keyed by GUID is a strong identity. A row keyed by site+title is weaker: 33 titles in this tenant name more than one list.',
      flows:
        'A flow has two identifiers in two spaces — a 36-character dashed Power Automate flow GUID and '
        + 'a 32-hex Logic Apps workflow id. GOV-06 measured the join and found ZERO of 77 exported '
        + 'definitions carrying an id the tenant register knows. Either field may be null. Neither is '
        + 'ever inferred from the other.',
    },
    whatIsNotHere:
      'Current tenant state. Nothing here was read from the tenant at build time. The newest '
      + `observation of the list estate is ${NEWEST_LIST_OBSERVATION}; of the flow estate, `
      + `${NEWEST_FLOW_OBSERVATION}. Neither is today.`,
    tenantScope:
      'The flow rows include every flow in the environment, not only this estate\'s. The 2026-09-26 '
      + `export read ${usage.totals.flows} flows and classified ${usage.totals.used} as used by this `
      + 'estate. Read totals.flows.byEstateUse before quoting any flow number.',
  },
  newestListObservation: NEWEST_LIST_OBSERVATION,
  newestFlowObservation: NEWEST_FLOW_OBSERVATION,
  sources: sourceRecords,
  sites: SITES,
  totals: {
    lists: {
      rows: listRows.length,
      observedInTenantCapture: listRows.filter((l) => l.observedInTenant).length,
      specifiedNotObserved: listRows.filter((l) => !l.observedInTenant).length,
      identifiedByGuid: listRows.filter((l) => l.identity === 'guid').length,
      identifiedBySiteAndTitleOnly: listRows.filter((l) => l.identity !== 'guid').length,
      governanceKeep: listRows.filter((l) => l.governance?.disposition === 'KEEP').length,
      governanceRetire: listRows.filter((l) => l.governance?.disposition === 'RETIRE').length,
      touchedByAtLeastOneFlow: listRows.filter((l) => l.touchedByFlows.length).length,
      withConflicts: listRows.filter((l) => l.conflicts.length).length,
      withAlternateTitles: listRows.filter((l) => l.alternateTitles.length).length,
    },
    fields: {
      rows: listRows.reduce((n, l) => n + l.fields.length, 0),
      byEvidenceBasis: Object.fromEntries(Object.keys(EVIDENCE_BASIS).map((b) => [
        b, listRows.reduce((n, l) => n + l.fields.filter((f) => f.evidenceBasis === b).length, 0),
      ])),
      note:
        'Only tenant-observation evidences existence. An earlier draft mapped '
        + "internal-field-evidence's `deployed` to observed, which would have asserted 52 columns as "
        + 'seen on the tenant when that word means a flow definition writes to them.',
    },
    flows: {
      rows: flowRows.length,
      rowsAreUpperBound:
        'A row is a distinct IDENTITY, not a proven distinct flow. Two rows may be one flow under '
        + 'two identifier spaces that GOV-06 proves do not resolve to each other. Use the bounds below.',
      distinctFlowsUpperBound: flowRows.length,
      distinctFlowsLowerBound: flowRows.length - nameOnlyWithPeer.length,
      identifiedByWorkflowIdOrFlowGuid: flowRows.filter((f) => f.workflowId || f.flowGuid).length,
      identifiedByDisplayNameOnly: nameOnlyRows.length,
      nameOnlyRowsMatchingAnIdentifiedRowByName: nameOnlyWithPeer.length,
      withWorkflowId: flowRows.filter((f) => f.workflowId).length,
      withFlowGuid: flowRows.filter((f) => f.flowGuid).length,
      withBothIdentifiers: flowRows.filter((f) => f.workflowId && f.flowGuid).length,
      definitionHeld: flowRows.filter((f) => f.definitionHeld).length,
      touchesAtLeastOneList: flowRows.filter((f) => f.listsTouched.length).length,
      withConflicts: flowRows.filter((f) => f.conflicts.length).length,
      withAliases: flowRows.filter((f) => f.aliases.length).length,
      contractKeysCovered: [...new Set(flowRows.flatMap((f) => f.contractKeys))].length,
      byEstateUse: {
        usedByThisEstate: usedRows.length,
        inTheTenantExportAndNotEvidencedAsUsed: presentUnusedRows.length,
        notInTheTenantExport: notInExportRows.length,
        /* The row counts above do not sum to the export's 648, and saying so is the point: two of the
           exported flows reach the register as a second dashed id on a row whose first dashed id is a
           different exported flow, because two sources pair that workflow id differently. So the same
           populations are also counted in the export's own units, where they reconcile exactly. */
        inTheExportsOwnUnits: {
          flowsInTheExport: usage.totals.flows,
          flowsRepresentedInThisRegister: exportIdsRepresented,
          flowsNotRepresented: usage.totals.flows - exportIdsRepresented,
          usedFlowsInTheExport: usage.totals.used,
          usedFlowsRepresentedInThisRegister: usedExportIdsRepresented,
          registerRowsCarryingAtLeastOneExportedFlow: flowRows.filter((f) => f.inTenantExport2026_09_26).length,
          whyTheyDiffer:
            'A register row is an identity, not a flow. Where two exported flows are pinned to one '
            + 'workflow id by two sources, both are recorded and one row carries both.',
        },
        whatEachMeans: {
          usedByThisEstate:
            'The 2026-09-26 usage analysis names this flow as used, with its evidence, in at least one role.',
          inTheTenantExportAndNotEvidencedAsUsed:
            'The export saw it in the environment and no evidence ties it to this estate. It is the '
            + "tenant's, not necessarily Folio's.",
          notInTheTenantExport:
            'No row in the 2026-09-26 export carries this identity. Either it is keyed on a workflow id '
            + 'the export does not carry — the export keys on the dashed flow id — or it is specified and '
            + 'not deployed.',
        },
        analysisTotals: usage.totals,
      },
    },
    definitionFilesRead: definitionFiles.length,
  },
  bySite,
  knownDivergences: [
    {
      id: 'GOV-06',
      about: 'flow identity',
      statement: 'Zero of the exported definitions carry an id the tenant register knows; 13 of 77 match on normalised display name.',
      consequence: 'A flow row may exist twice in this register — once under each identifier space — and the register cannot merge them without fabricating the join.',
      measuredIn: 'docs/folio-Master-Flows-and-Endpoints/registers/flow-definition-map.json',
    },
    {
      id: 'governance-field-count',
      about: 'the governance field table',
      statement: `The workbook extraction carries ${govWorkbookFields.length} field rows; the corrected table carries ${govCorrectedFields.length} (delta ${govFieldDelta >= 0 ? '+' : ''}${govFieldDelta}).`,
      consequence: 'Quoting one as "the" field count contradicts the other. The register uses the corrected table for field rows and reports both counts here.',
      measuredIn: 'docs/reference/sharepoint-provisioning-spec.json',
    },
    {
      id: 'capture-age',
      about: 'every observed list row',
      statement: `The only tenant observation of the list estate is dated ${CAPTURE_UTC}.`,
      consequence: 'GOV-09 records rows written after it and GOV-11 records resources reported created after it. "Observed" here means observed then, not now.',
      measuredIn: 'docs/reference/sharepoint-list-index.json',
    },
    {
      id: 'reading-breadth',
      about: 'the two tenant readings of the flow estate',
      statement:
        `The 2026-09-18 Flow Management API reading covers ${(inv.flows ?? []).length} flows, requested by `
        + `identifier. The 2026-09-26 "List My Flows" export covers ${usage.totals.flows}. They are not the `
        + 'same population and neither supersedes the other: the first carries trigger authentication type '
        + 'per flow, which the second does not.',
      consequence:
        'A flow absent from the narrow reading is not absent from the tenant. A flow present in the wide '
        + 'export is not therefore this estate\'s. Rows carry both statements and the register merges neither.',
      measuredIn: 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json and docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json',
    },
    {
      id: 'mailer-lists-unobserved',
      about: 'the mailer platform',
      statement:
        `The mailer declares ${(mailer.lists ?? []).length} lists and ${(mailer.flows ?? []).length} flows `
        + `under contract ${mailer.contractVersion}, on ${mailer.siteUrl}. The tenant capture of ${CAPTURE_UTC} `
        + 'predates the platform, so no source in this branch has observed any of them.',
      consequence:
        "Those rows are specified, not observed, however the platform behaves in service. The mailer's own "
        + 'setup provisions the lists on first run; nothing here evidences that it has.',
      measuredIn: 'mailer/flows/flows.catalogue.json',
    },
  ],
  lists: listRows,
  flows: flowRows,
};

const rendered = `${JSON.stringify(register, null, 2)}\n`;
const previous = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, 'utf8') : '';

const t = register.totals;
console.log('\nEstate register\n');
console.log(`  sources read        ${sourceRecords.length} (${definitionFiles.length} definition files)`);
console.log(`  list rows           ${t.lists.rows}  —  ${t.lists.observedInTenantCapture} observed, ${t.lists.specifiedNotObserved} specified only`);
console.log(`  field rows          ${t.fields.rows}`);
for (const [b, n] of Object.entries(t.fields.byEvidenceBasis)) if (n) console.log(`      ${b.padEnd(20)} ${n}`);
console.log(`  flow rows           ${t.flows.rows}  —  ${t.flows.withWorkflowId} with a workflow id, ${t.flows.withFlowGuid} with a flow GUID, ${t.flows.withBothIdentifiers} with both`);
console.log(`  distinct flows      between ${t.flows.distinctFlowsLowerBound} and ${t.flows.distinctFlowsUpperBound} — ${t.flows.identifiedByDisplayNameOnly} row(s) have a name and no identifier`);
console.log(`      of which            ${t.flows.byEstateUse.usedByThisEstate} used by this estate, `
  + `${t.flows.byEstateUse.inTheTenantExportAndNotEvidencedAsUsed} in the tenant export and not evidenced as used, `
  + `${t.flows.byEstateUse.notInTheTenantExport} not in the export`);
console.log(`  definitions held    ${t.flows.definitionHeld}`);
console.log(`  conflicts recorded  ${t.lists.withConflicts} list(s), ${t.flows.withConflicts} flow(s)`);
console.log(`  newest observation  lists ${NEWEST_LIST_OBSERVATION}, flows ${NEWEST_FLOW_OBSERVATION}\n`);

if (CHECK) {
  if (rendered !== previous) fail('the estate register is stale. Run: npm run estateregister');
  console.log('  ✅ the estate register matches its sources\n');
  process.exit(0);
}

fs.writeFileSync(OUT_JSON, rendered);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT_JSON)} — ${Math.round(rendered.length / 1024)} KB\n`);
