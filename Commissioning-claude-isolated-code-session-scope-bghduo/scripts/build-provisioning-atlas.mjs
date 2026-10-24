#!/usr/bin/env node
/**
 * The provisioning atlas — what SharePoint provisioning actually creates, from the contracts.
 *
 *   npm run provisioning:atlas
 *   npm run provisioning:atlas -- --check
 *
 * WHY THIS EXISTS
 *
 * Until now the only browsable document describing Power Automate SharePoint provisioning was
 * docs/reference/foundational/lists-and-data/DGO_POWER_AUTOMATE_PROVISIONING_FULL_VISUALIZATION.html
 * — and that file is HARVEST. docs/README.md classifies the whole foundational tree as
 * *untrusted, prefer the contract over the sample*, which is why tests/references.test.mjs,
 * tests/check-secrets.mjs, tests/standing-claims.test.mjs and tests/closure-alignment.test.mjs all
 * exclude it: it is a verbatim record and is never edited to agree with the present.
 *
 * Reading it as current documentation goes wrong in three ways that matter, not one:
 *
 *   1. IT NAMES THE WRONG SITE. Every address in it targets
 *      `NITDADGO-EAAACTIVITYTRACKING`. Decision GOV-01 moved the ten governance lists to
 *      `DGO_ECM_GOVERNANCE` on 2026-09-09, and every address in the contract is GUID-based on
 *      the authoritative site. An operator following the harvest provisions into the wrong place.
 *   2. IT DESCRIBES CREATION, AND THE CONTRACT DESCRIBES UPDATE. The harvest creates lists by
 *      title. Creating by title twice is exactly what produced GOV-02 — seventeen duplicates.
 *      sharepoint-provisioning-spec.json carries `ProvisioningMode: update-in-place` on all ten
 *      rows and never creates a list.
 *   3. IT COVERS HALF THE ESTATE. There are two provisioning scopes, not one: the ten
 *      governance lists (Step 2, which exist) and the seven HTTP flow registry lists (Step 5,
 *      which do not). The harvest predates the second entirely.
 *
 * So this is not a restyle of that page. It is the document that page should have been, read off
 * the two contracts that are actually authoritative, carrying the distinction the harvest cannot
 * make: DEFINED IS NOT CREATED. The registry spec says so itself, in `registry.executionStatus`
 * and in the first of its thirteen risks, and every one of its 102 field rows carries
 * `executionEvidence: "Defined; …"`. A reader of the harvest has no way to know that.
 *
 * WHAT IS READ AND WHAT IS NOT
 *
 * Everything is read from docs/reference/sharepoint-provisioning-spec.json and
 * docs/reference/http-flow-registry-spec.json. Field values are rendered verbatim — the schema
 * XML an operator pastes, the REST URI a call is made against, the CAML a view filters by. No
 * value is defaulted, normalised or carried across from a sibling list; where a contract does not
 * declare a thing the page says it is not declared, which is the integrity policy both specs
 * already state about themselves.
 *
 * Nothing here gathers or re-derives data. If a number is wrong, it is wrong in a spec, and the
 * spec is what to change.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GOVERNANCE_SPEC = 'docs/reference/sharepoint-provisioning-spec.json';
const REGISTRY_SPEC = 'docs/reference/http-flow-registry-spec.json';
const LIST_REGISTRY = 'docs/reference/governance-list-registry.json';
const TARGET = 'docs/reference/PROVISIONING_ATLAS.html';
const CHECK = process.argv.includes('--check');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const gov = JSON.parse(read(GOVERNANCE_SPEC));
const reg = JSON.parse(read(REGISTRY_SPEC));
const listRegistry = existsSync(join(ROOT, LIST_REGISTRY)) ? JSON.parse(read(LIST_REGISTRY)) : null;

/* ------------------------------------------------------------------ *
 * Normalise the two contracts into one shape
 *
 * They are different documents with different vocabularies — one says `ListTitle`, the other
 * `listTitle`; one carries a create URI per field, the other carries execution evidence. Rather
 * than render two dialects and let the reader translate, both are mapped onto one model here,
 * ONCE, with every field either read or null. A key absent from a contract stays null and the
 * page prints "not declared" rather than borrowing the other contract's answer.
 * ------------------------------------------------------------------ */

const yes = (v) => v === 'Yes' || v === true || v === 'true' || v === 'TRUE';
const clean = (v) => (v === null || v === undefined || v === '' ? null : v);

const governanceScope = {
  id: 'governance',
  step: 'Step 2',
  title: 'Governance lists',
  subtitle: 'Identity, RBAC and audit — the ten lists the platform reads on every call',
  targetSite: gov.governanceSiteDecision?.authoritativeSite || null,
  supersedes: gov.governanceSiteDecision?.supersedes || null,
  decision: gov.governanceSiteDecision?.decision || null,
  decisionNote: gov.governanceSiteDecision?.note || null,
  appliedUtc: gov.governanceSiteDecision?.appliedUtc || null,
  standing: 'ALL TEN EXIST',
  standingDetail: clean(gov.lists[0]?.ProvisioningNote)
    || 'The contract updates fields and seeds in place and never creates a list.',
  mode: clean(gov.lists[0]?.ProvisioningMode) || null,
  lists: gov.lists.map((l) => ({
    title: l.ListTitle,
    order: l.ListOrder,
    description: clean(l.Description),
    purpose: clean(l.Purpose),
    fieldCount: l.FieldCount,
    requiredCount: l.RequiredFieldCount,
    indexedCount: l.IndexedFieldCount,
    seedCount: l.SeedRecordCount,
    guid: clean(l.ListGuid),
    mode: clean(l.ProvisioningMode),
    note: clean(l.ProvisioningNote),
    uri: clean(l.PowerAutomateCreateListUri),
    site: clean(l.TargetSite),
    uniqueKey: null,
    evidence: null,
    settings: null,
  })),
  fields: gov.fields.map((f) => ({
    list: f.ListTitle,
    order: f.FieldOrderInList,
    internalName: f.InternalName,
    displayName: clean(f.DisplayName),
    type: clean(f.FieldType),
    required: yes(f.Required),
    indexed: yes(f.Indexed),
    unique: null,
    params: [f.ChoiceValues && `Choices: ${f.ChoiceValues}`, f.NumLines && `Lines: ${f.NumLines}`,
      f.Format && `Format: ${f.Format}`, f.RichText && `RichText: ${f.RichText}`].filter(Boolean).join(' · ') || null,
    purpose: null,
    group: null,
    schemaXml: clean(f.SchemaXml),
    createUri: clean(f.CreateFieldUri),
    checkUri: clean(f.CheckFieldUri),
    evidence: null,
  })),
  seeds: gov.seedItems.map((s) => ({
    list: s.ListTitle,
    key: `${s.KeyField} = ${s.KeyValue}`,
    title: clean(s.Title),
    description: clean(s.Notes),
    body: clean(s.FieldsJson),
    behaviour: 'Checked by key, then created — see CheckItemUri and CreateItemUri',
    evidence: null,
  })),
  actions: gov.powerAutomateActions.map((a) => ({
    order: a.StepOrder,
    name: a.ActionName,
    type: clean(a.ActionType),
    purpose: clean(a.Notes),
    runAfter: clean(a.RunAfter),
    detail: [a.Method && `${a.Method} ${a.Uri || ''}`.trim(), !a.Method && a.Uri, a.LoopInput && `Loop over ${a.LoopInput}`,
      a.ConditionExpression && `Condition: ${a.ConditionExpression}`,
      a.BodyOrExpression && `Body: ${a.BodyOrExpression}`, a.HeadersJson && `Headers: ${a.HeadersJson}`]
      .filter(Boolean).join('\n') || null,
  })),
  checks: gov.validationChecks.map((c) => ({
    id: c.CheckId, category: clean(c.Category), check: clean(c.Check),
    expected: clean(c.ExpectedResult), status: clean(c.Status), source: clean(c.SourceSheet),
  })),
  views: [], uniqueKeys: [], settings: [], rest: [], statusVocabulary: [], risks: [], overview: [],
  dictionary: gov.dataDictionary.map((d) => ({ term: d.Term, definition: d.Definition, appliesTo: d.AppliesTo })),
};

/* ONE OF THE 102 REGISTRY FIELDS IS NOT FROM THE WORKBOOK, AND THAT MATTERS TO AN OPERATOR.
   `DGO_HTTPFlowRegistry.WorkflowId` was added on 2026-09-10 by
   scripts/lib/registry-spec-amendments.mjs to close the first GOV-06 blocker. The contract counts
   it in `totals` but deliberately does NOT count it in the workbook overview, the final-report
   contract or the configuration seeds — because those are statements the workbook and the deployed
   flow make, and neither has been revised. The consequence is stated in the contract's own
   `runtimeDivergence`: provision the amended column without updating
   `ProvisioningSchemaExpectedFieldCount` and flow 01 reports a variance against a correct run.
   A provisioning document that renders 102 identical rows hides that entirely. */
const AMENDED = new Set((reg.amendments?.applied || [])
  .map((a) => (/([A-Za-z_]+\.[A-Za-z_]+)/.exec(a) || [])[1]).filter(Boolean));

const registryScope = {
  id: 'registry',
  step: 'Step 5',
  title: 'HTTP flow registry',
  subtitle: 'The seven lists that would hold the estate’s own flow truth',
  targetSite: reg.registry?.targetSite || null,
  supersedes: null,
  decision: null,
  decisionNote: clean(reg.registry?.executionStatus),
  appliedUtc: null,
  standing: 'NONE EXIST',
  standingDetail: clean(reg.registry?.expectedResources)
    ? `Expected: ${reg.registry.expectedResources}. Every row below is declared by the flow definition and none is proven created.`
    : 'Declared by the flow definition; none proven created.',
  mode: 'create-if-missing',
  lists: reg.lists.map((l, n) => ({
    title: l.listTitle,
    order: n + 1,
    description: clean(l.description),
    purpose: null,
    fieldCount: l.customFieldCount,
    requiredCount: reg.fields.filter((f) => f.listTitle === l.listTitle && yes(f.required)).length,
    indexedCount: reg.fields.filter((f) => f.listTitle === l.listTitle && yes(f.indexed)).length,
    seedCount: l.listTitle === 'DGO_HTTPFlowRegistryConfig' ? reg.configSeeds.length : 0,
    guid: null,
    mode: 'Create if missing, by title, once — then address by GUID',
    note: null,
    uri: null,
    site: reg.registry?.targetSite || null,
    uniqueKey: clean(l.uniqueKey),
    evidence: clean(l.executionEvidence),
    settings: [`Base template ${l.baseTemplate}`, `Attachments ${l.attachmentsEnabled}`,
      `Versioning ${l.versioningEnabled}${l.majorVersionLimit ? ` (limit ${l.majorVersionLimit})` : ''}`,
      `Force checkout ${l.forceCheckout}`, `Title required ${l.titleRequired}`,
      l.customViews].filter(Boolean).join(' · '),
  })),
  fields: reg.fields.map((f) => ({
    list: f.listTitle,
    order: f.fieldNumber,
    internalName: f.internalName,
    displayName: clean(f.displayName),
    type: clean(f.expectedTypeAsString),
    required: yes(f.required),
    indexed: yes(f.indexed),
    unique: yes(f.unique),
    params: clean(f.typeParameters),
    purpose: clean(f.purpose),
    group: clean(f.fieldGroup),
    schemaXml: clean(f.schemaXml),
    createUri: null,
    checkUri: null,
    evidence: clean(f.executionEvidence),
    amended: AMENDED.has(`${f.listTitle}.${f.internalName}`),
  })),
  amendments: reg.amendments
    ? {
      note: clean(reg.amendments.note),
      applied: reg.amendments.applied || [],
      workbookFieldCount: reg.amendments.workbookFieldCount ?? null,
      divergence: clean(reg.amendments.runtimeDivergence),
    }
    : null,
  seeds: reg.configSeeds.map((s) => ({
    list: 'DGO_HTTPFlowRegistryConfig',
    key: `${s.configKey} = ${s.configValue}`,
    title: clean(s.title),
    description: clean(s.description),
    body: null,
    behaviour: clean(s.upsertBehavior),
    evidence: clean(s.executionEvidence),
    valueType: clean(s.valueType),
    secret: yes(s.isSecret),
    enabled: yes(s.isEnabled),
  })),
  actions: reg.workflowActions.map((a, n) => ({
    order: n + 1, name: a.action, type: clean(a.type),
    purpose: clean(a.purpose), runAfter: clean(a.runAfter), detail: null,
  })),
  checks: [],
  views: reg.views.map((v) => ({
    list: v.listTitle, title: v.viewTitle, caml: clean(v.camlViewQuery),
    fields: clean(v.viewFieldsInOrder), behaviour: clean(v.provisioningBehavior),
    evidence: clean(v.executionEvidence),
  })),
  uniqueKeys: reg.uniqueKeys.map((k) => ({
    list: k.listTitle, field: k.field, indexed: yes(k.expectedIndexed), unique: yes(k.expectedUnique),
    test: clean(k.validationTest), effect: clean(k.successEffect), evidence: clean(k.executionEvidence),
  })),
  settings: reg.listSettings.map((s) => ({
    list: s.listTitle, property: s.property, expected: clean(s.expectedValue),
    method: clean(s.method), evidence: clean(s.executionEvidence),
  })),
  rest: reg.restRequests.map((r) => ({
    operation: r.operation, method: r.httpMethod, uri: clean(r.relativeUriPattern),
    headers: clean(r.headers), body: clean(r.bodyParameters),
  })),
  statusVocabulary: reg.statusVocabulary.map((s) => ({
    status: s.status, meaning: clean(s.meaning), recordedIn: clean(s.recordedIn),
  })),
  risks: reg.risksAndControls.map((r) => ({
    area: r.area, observation: clean(r.observation), control: clean(r.recommendedControl),
  })),
  overview: reg.overview.map((o) => ({
    metric: o.metric, expected: o.expected, documented: o.documented,
    variance: o.variance, pass: yes(o.pass), interpretation: clean(o.interpretation), source: clean(o.sourceArea),
  })),
  dictionary: [],
};

const SCOPES = [governanceScope, registryScope];

/* The seventeen duplicate list instances GOV-02 left behind. Carried because a provisioning
   document that shows only what should exist, in a tenant that also holds copies of it, is the
   document that made the duplicates possible. */
const retire = listRegistry?.retire || [];

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const payload = JSON.stringify({
  scopes: SCOPES,
  retire,
  sources: {
    governance: { path: GOVERNANCE_SPEC, workbook: clean(gov.sourceWorkbook), policy: gov.integrityPolicy?.cellValueHandling || null },
    registry: {
      path: REGISTRY_SPEC, workbook: clean(reg.sourceWorkbook),
      specVersion: clean(reg.specVersion), generator: clean(reg.generator),
      flow: clean(reg.registry?.flowDisplayName), scopeNode: clean(reg.registry?.scopeNode),
    },
  },
}).replace(/<\//g, '<\\/');

const html = `<title>Provisioning Atlas</title>
<!-- NO EXTERNAL FONT HOST, AND THAT IS THE ESTATE'S RULE RATHER THAN A PREFERENCE.
     Every other committed HTML document here — the architecture diagrams, the platform atlas,
     the standalone admin console, the briefing deck — loads zero external resources, and
     tests/references.test.mjs states the standard it is holding them to: "No server, no network,
     no dependencies." A provisioning document an operator may open on a locked-down tenant
     machine must render identically with the network off, so the faces are system stacks. -->
<style>
/* ── Tokens ────────────────────────────────────────────────────────────
   The complete light palette lives on bare :root so the un-stamped
   (system-default) document resolves; dark redefines only these tokens,
   once behind the media query guarded against an explicit light choice,
   once behind the dark stamp.

   The accent is blueprint indigo, NOT green. Green is spent entirely on
   one semantic: a resource that exists in the tenant. If the accent were
   also green, the single distinction this document exists to carry —
   defined is not created — would be drawn in the same colour as the page
   furniture. */
:root{
  --ground:#F4F6F5; --surface:#FFFFFF; --surface-2:#E9EDEB; --surface-3:#DFE5E3;
  --ink:#11171A; --ink-soft:#54636A; --ink-faint:#86949A;
  --rule:#D4DBD9; --rule-soft:#E4E9E7;
  --accent:#1F4B6E; --accent-soft:#E4ECF3;
  --exists:#1D6B4A; --exists-soft:#E2F0E9;
  --defined:#8A6414; --defined-soft:#F6EEDB;
  --absent:#8A3B2A; --absent-soft:#F7E7E2;
  --shadow:0 1px 2px rgba(17,23,26,.05), 0 10px 28px -18px rgba(17,23,26,.30);
  --focus:#1F4B6E;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0C1114; --surface:#131A1E; --surface-2:#1A2329; --surface-3:#222D33;
    --ink:#DFE7E6; --ink-soft:#9AA9AF; --ink-faint:#6A787E;
    --rule:#263136; --rule-soft:#1D262B;
    --accent:#86B6DA; --accent-soft:#15242F;
    --exists:#63B893; --exists-soft:#12251D;
    --defined:#D4A94F; --defined-soft:#2A2213;
    --absent:#DE8A72; --absent-soft:#2C1811;
    --shadow:0 1px 2px rgba(0,0,0,.45), 0 10px 28px -18px rgba(0,0,0,.9);
    --focus:#86B6DA;
  }
}
:root[data-theme="dark"]{
  --ground:#0C1114; --surface:#131A1E; --surface-2:#1A2329; --surface-3:#222D33;
  --ink:#DFE7E6; --ink-soft:#9AA9AF; --ink-faint:#6A787E;
  --rule:#263136; --rule-soft:#1D262B;
  --accent:#86B6DA; --accent-soft:#15242F;
  --exists:#63B893; --exists-soft:#12251D;
  --defined:#D4A94F; --defined-soft:#2A2213;
  --absent:#DE8A72; --absent-soft:#2C1811;
  --shadow:0 1px 2px rgba(0,0,0,.45), 0 10px 28px -18px rgba(0,0,0,.9);
  --focus:#86B6DA;
}

*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--ground); color:var(--ink);
  font:400 15px/1.55 system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1220px;margin:0 auto;padding-inline:20px}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;font-weight:500;text-wrap:balance;margin:0}
code,.mono{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
.num{font-variant-numeric:tabular-nums}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:3px}
button{font:inherit;color:inherit}
[hidden]{display:none!important}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
html{scroll-behavior:smooth}

/* ── Masthead ───────────────────────────────────────────────────── */
.mast{background:var(--surface);border-bottom:1px solid var(--rule)}
.mast .wrap{padding-block:26px 24px}
.kicker{
  font:500 11px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.13em;text-transform:uppercase;
  color:var(--accent);display:flex;gap:9px;flex-wrap:wrap;
}
h1{font-size:clamp(28px,5vw,42px);line-height:1.1;letter-spacing:-.012em;margin-top:11px}
.lede{max-width:64ch;color:var(--ink-soft);margin-top:11px;font-size:15.5px}
.lede strong{color:var(--ink);font-weight:600}

/* The one thing a reader must not miss. Not a card among cards — a notice,
   with the ochre reserved for exactly this claim. */
.notice{
  margin-top:20px;border-left:3px solid var(--defined);background:var(--defined-soft);
  padding:15px 17px;border-radius:0 5px 5px 0;max-width:78ch;
}
.notice b{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--defined);display:block;margin-bottom:6px}
.notice p{margin:0;font-size:14px;line-height:1.55;color:var(--ink)}
.notice p + p{margin-top:8px}

/* ── Sticky navigation ───────────────────────────────────────────
   One row, always. The document it replaces put thirty flat anchors in a
   310px rail that became a wall above the content on any phone. */
.nav{
  position:sticky;top:env(safe-area-inset-top, 0px);z-index:40;
  background:var(--surface);border-bottom:1px solid var(--rule);
}
.nav .wrap{display:flex;gap:14px;align-items:center;padding-block:9px;flex-wrap:wrap}
.scopes{display:flex;gap:0;border:1px solid var(--rule);border-radius:99px;overflow:hidden;flex:0 0 auto}
.scopes button{
  border:0;background:transparent;padding:7px 15px;cursor:pointer;
  font:500 13px/1 system-ui,sans-serif;color:var(--ink-soft);white-space:nowrap;
}
.scopes button[aria-pressed="true"]{background:var(--accent);color:var(--surface)}
:root[data-theme="dark"] .scopes button[aria-pressed="true"],
html:not([data-theme="light"]) .scopes button[aria-pressed="true"]{color:#0C1114}
.jump{display:flex;gap:4px;overflow-x:auto;flex:1 1 320px;min-width:0;scrollbar-width:thin;padding-bottom:2px}
.jump a{
  font:500 12.5px/1 system-ui,sans-serif;color:var(--ink-soft);text-decoration:none;
  padding:7px 10px;border-radius:5px;white-space:nowrap;
}
.jump a:hover{background:var(--surface-2);color:var(--ink)}
.jump a[aria-current="true"]{background:var(--accent-soft);color:var(--accent)}

/* ── Sections ────────────────────────────────────────────────────── */
section{padding-block:40px;scroll-margin-top:96px}
section + section{border-top:1px solid var(--rule-soft)}
.head{display:flex;align-items:baseline;gap:13px;flex-wrap:wrap;margin-bottom:6px}
.head h2{font-size:23px;letter-spacing:-.008em}
.head .n{font:500 11px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-faint)}
.sub{max-width:68ch;color:var(--ink-soft);font-size:14.5px;margin:0 0 22px}
.sub code{font-size:.9em;background:var(--surface-2);padding:1px 5px;border-radius:3px}

/* ── Standing strip ──────────────────────────────────────────────── */
.standing{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:start;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin-bottom:24px}
.standing div{padding:13px 16px 15px 0;border-right:1px solid var(--rule-soft)}
.standing div:last-child{border-right:0}
.standing b{display:block;font:500 24px/1 ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.standing span{display:block;font-size:12.5px;color:var(--ink-soft);margin-top:5px;line-height:1.35}
.standing .state b{font-size:15px;line-height:1.3}
.standing .exists b{color:var(--exists)}
.standing .absent b{color:var(--absent)}

/* ── Explorer: list index + detail ───────────────────────────────── */
.explorer{display:grid;grid-template-columns:270px 1fr;gap:0;border:1px solid var(--rule);border-radius:7px;background:var(--surface);overflow:hidden}
.index{border-right:1px solid var(--rule);background:var(--surface-2);max-height:min(74vh,760px);overflow:auto}
.index button{
  display:block;width:100%;text-align:left;border:0;background:transparent;cursor:pointer;
  padding:11px 14px;border-bottom:1px solid var(--rule-soft);
}
.index button:hover{background:var(--surface-3)}
.index button[aria-pressed="true"]{background:var(--surface);box-shadow:inset 3px 0 0 var(--accent)}
.index .lt{font:500 13px/1.35 ui-monospace,Menlo,Consolas,monospace;display:block;word-break:break-word}
.index .lm{display:block;font-size:11.5px;color:var(--ink-faint);margin-top:4px;font-variant-numeric:tabular-nums}
.detail{padding:20px 22px 24px;min-width:0;max-height:min(74vh,760px);overflow:auto}
.detail h3{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:17px;font-weight:500;word-break:break-word}
.detail .dsc{color:var(--ink-soft);font-size:14px;margin:7px 0 0;max-width:70ch}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}
.tag{font:500 11px/1 ui-monospace,Menlo,Consolas,monospace;padding:5px 8px;border-radius:3px;background:var(--surface-2);color:var(--ink-soft)}
.tag.on{background:var(--exists-soft);color:var(--exists)}
.tag.def{background:var(--defined-soft);color:var(--defined)}
.addr{margin-top:14px;font:400 11.5px/1.6 ui-monospace,Menlo,Consolas,monospace;color:var(--ink-soft);word-break:break-all}
.addr b{color:var(--ink-faint);font-weight:500}

.sub-head{font:500 10.5px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-faint);margin:24px 0 10px;padding-top:16px;border-top:1px solid var(--rule-soft)}

/* Field rows: a two-line record, never a table that needs 850px. */
.frow{display:grid;grid-template-columns:1fr auto;gap:8px 14px;padding:10px 0;border-bottom:1px solid var(--rule-soft);align-items:start}
.frow:last-child{border-bottom:0}
.fname{font:500 13px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-word}
.fmeta{grid-column:1/-1;font-size:12.5px;color:var(--ink-soft);line-height:1.5}
.fmeta .p{color:var(--ink-faint)}
.flags{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.flag{font:500 10px/1 ui-monospace,Menlo,Consolas,monospace;padding:4px 6px;border-radius:3px;background:var(--surface-2);color:var(--ink-soft);white-space:nowrap}
.flag.req{background:var(--absent-soft);color:var(--absent)}
.flag.idx{background:var(--accent-soft);color:var(--accent)}
.flag.uniq{background:var(--exists-soft);color:var(--exists)}
.flag.amd{background:var(--defined-soft);color:var(--defined)}
.xml{grid-column:1/-1;margin:6px 0 0}
.xml summary{cursor:pointer;font:500 11.5px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--accent);padding:4px 0}
.xml pre{
  margin:6px 0 0;background:var(--surface-2);border:1px solid var(--rule-soft);border-radius:5px;
  padding:11px 12px;font:400 11.5px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:var(--ink);
}

/* ── Field search ────────────────────────────────────────────────── */
.tools{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.tools input{
  flex:1 1 220px;min-width:0;font:400 13.5px/1 system-ui,sans-serif;padding:9px 13px;
  border:1px solid var(--rule);border-radius:99px;background:var(--surface);color:var(--ink);
}
.tools input::placeholder{color:var(--ink-faint)}
.tools button.t{
  font:500 12.5px/1 system-ui,sans-serif;padding:8px 12px;border-radius:99px;
  border:1px solid var(--rule);background:var(--surface);color:var(--ink-soft);cursor:pointer;
}
.tools button.t:hover{border-color:var(--accent);color:var(--accent)}
.tools button.t[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface)}
:root[data-theme="dark"] .tools button.t[aria-pressed="true"],
html:not([data-theme="light"]) .tools button.t[aria-pressed="true"]{color:#0C1114}
.tally{font:500 12px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--ink-faint);white-space:nowrap}
.results{border:1px solid var(--rule);border-radius:7px;background:var(--surface);padding:4px 16px;max-height:620px;overflow:auto}
.results .frow .fname a{text-decoration:none}
.results .lp{font:500 10.5px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--ink-faint);display:block;margin-bottom:4px}
.none{padding:34px 0;text-align:center;color:var(--ink-faint);font-size:14px}

/* ── Sequence ────────────────────────────────────────────────────── */
.seq{display:flex;flex-direction:column;gap:0}
.step{display:grid;grid-template-columns:52px 1fr;gap:15px;padding:13px 0;border-top:1px solid var(--rule-soft)}
.step:first-child{border-top:0}
.sn{font:500 12px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--surface);background:var(--accent);border-radius:4px;padding:7px 0;text-align:center;height:fit-content}
:root[data-theme="dark"] .sn, html:not([data-theme="light"]) .sn{color:#0C1114}
.step h4{margin:0;font:500 14px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-word}
.step .ty{font-size:12.5px;color:var(--accent);margin:3px 0 0}
.step .pu{font-size:13.5px;color:var(--ink-soft);margin:6px 0 0;max-width:72ch}
.step .ra{font:400 11.5px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--ink-faint);margin:6px 0 0}
.step pre{margin:8px 0 0;background:var(--surface-2);border:1px solid var(--rule-soft);border-radius:5px;padding:10px 12px;font:400 11.5px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;overflow-x:auto}

/* ── Tables that must stay tables ────────────────────────────────── */
.tw{overflow-x:auto;border:1px solid var(--rule);border-radius:7px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th{text-align:left;padding:10px 13px;font:500 10.5px/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-faint);border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:10px 13px;border-bottom:1px solid var(--rule-soft);vertical-align:top;line-height:1.5}
tr:last-child td{border-bottom:0}
td.m,th.m{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
td .st{font:500 10.5px/1 ui-monospace,Menlo,Consolas,monospace;padding:4px 7px;border-radius:3px;background:var(--defined-soft);color:var(--defined);white-space:nowrap}

.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));gap:14px}
.card{border:1px solid var(--rule);border-radius:7px;background:var(--surface);padding:15px 16px}
.card h4{margin:0 0 7px;font:500 13px/1.35 ui-monospace,Menlo,Consolas,monospace;color:var(--accent)}
.card p{margin:0;font-size:13.5px;color:var(--ink-soft);line-height:1.5}
.card p + p{margin-top:8px;color:var(--ink)}

/* ── Provenance ──────────────────────────────────────────────────── */
.prov{background:var(--surface);border-top:1px solid var(--rule)}
.prov .wrap{padding-block:30px 46px}
.prov blockquote{margin:0 0 20px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(18px,3vw,23px);line-height:1.34;max-width:30ch;border-left:3px solid var(--accent);padding-left:17px}
.prov dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px 30px}
.prov dt{font:500 10.5px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:6px}
/* Site URLs, GUID addresses and REST patterns are long unbroken strings. Without this they push
   the whole document sideways on a phone — a 33px horizontal scroll measured at 400px before the
   rule was added. They wrap anywhere rather than widening their container. */
.prov dd{margin:0;font-size:13.5px;color:var(--ink-soft);line-height:1.55;overflow-wrap:anywhere}
.prov dd code{font-size:12px;overflow-wrap:anywhere}
#whereBody dd{overflow-wrap:anywhere}
#whereBody dd code{overflow-wrap:anywhere}
.prov .foot{margin-top:26px;font-size:12.5px;color:var(--ink-faint);max-width:74ch;line-height:1.6}

@media (max-width:860px){
  .explorer{grid-template-columns:1fr}
  .index{border-right:0;border-bottom:1px solid var(--rule);max-height:none;display:flex;overflow-x:auto;gap:0}
  .index button{border-bottom:0;border-right:1px solid var(--rule-soft);white-space:nowrap;width:auto;flex:0 0 auto;padding:10px 13px}
  .index button[aria-pressed="true"]{box-shadow:inset 0 -3px 0 var(--accent)}
  .index .lm{display:none}
  .detail{max-height:none}
}
@media (max-width:560px){
  /* The standing strip carries one sentence and four numbers. Two equal columns keeps the numbers
     scannable; the sentence gets the full width rather than being squeezed beside a figure. */
  .standing{grid-template-columns:1fr 1fr}
  .standing .state{grid-column:1/-1}
  .standing div{border-right:0;border-bottom:1px solid var(--rule-soft);padding-right:0}
  .frow{grid-template-columns:1fr}
  .flags{justify-content:flex-start}
  .step{grid-template-columns:1fr;gap:6px}
  .sn{width:52px}
  .nav .wrap{gap:9px}
}
</style>

<header class="mast">
  <div class="wrap">
    <p class="kicker"><span>DGO / Commissioning</span><span>&middot;</span><span>SharePoint provisioning</span><span>&middot;</span><span>npm run provisioning:atlas</span></p>
    <h1>What provisioning creates, and where it puts it</h1>
    <p class="lede">
      Two provisioning scopes, read from the two contracts that govern them: the <strong>ten
      governance lists</strong> the platform reads on every call, and the <strong>seven HTTP flow
      registry lists</strong> that would hold the estate&rsquo;s own flow truth. Every list, every
      field, every seed, every call &mdash; searchable, addressable, and rendered exactly as the
      contract states it.
    </p>
    <div class="notice">
      <b>Defined is not created</b>
      <p>The registry contract is a reading of a flow <em>definition</em>, not of a run. Every one of
      its 102 field rows records <code>Defined; actual validation outcome unavailable</code>. A row
      on this page means the flow is configured to create that resource &mdash; never that the
      resource exists.</p>
      <p>The governance contract is the opposite case and says so: all ten lists exist, it updates
      them in place, and it never creates a list &mdash; because creating by title is what left
      seventeen duplicates in the tenant.</p>
    </div>
  </div>
</header>

<nav class="nav" aria-label="Document">
  <div class="wrap">
    <div class="scopes" id="scopes" role="group" aria-label="Provisioning scope"></div>
    <div class="jump" id="jump">
      <a href="#where">Where it goes</a>
      <a href="#lists">Lists &amp; fields</a>
      <a href="#find">Find a field</a>
      <a href="#seeds">Seed data</a>
      <a href="#flow">The flow</a>
      <a href="#proof">How you know</a>
    </div>
  </div>
</nav>

<main class="wrap">
  <section id="where">
    <div class="head"><h2>Where it goes</h2><span class="n" id="whereScope"></span></div>
    <p class="sub" id="whereSub"></p>
    <div class="standing" id="standing"></div>
    <div id="whereBody"></div>
  </section>

  <section id="lists">
    <div class="head"><h2>Lists and fields</h2><span class="n" id="listsN"></span></div>
    <p class="sub">Pick a list to see everything the contract declares for it &mdash; its fields with
      type, obligation and index, the schema XML an operator pastes, and the address every call is
      made against.</p>
    <div class="explorer">
      <div class="index" id="index" role="tablist" aria-label="Lists"></div>
      <div class="detail" id="detail" role="tabpanel"></div>
    </div>
  </section>

  <section id="find">
    <div class="head"><h2>Find a field</h2><span class="n" id="findN"></span></div>
    <p class="sub">Across every list in this scope. Search internal or display name, type, purpose,
      or anything in the schema XML.</p>
    <div class="tools">
      <input id="q" type="search" placeholder="RegistryKey, Choice, LifecycleStatus, Indexed&hellip;" autocomplete="off" aria-label="Search fields">
      <button class="t" type="button" data-f="required" aria-pressed="false">Required</button>
      <button class="t" type="button" data-f="indexed" aria-pressed="false">Indexed</button>
      <button class="t" type="button" data-f="unique" aria-pressed="false">Unique</button>
      <span class="tally" id="tally"></span>
    </div>
    <div class="results" id="results"></div>
  </section>

  <section id="seeds">
    <div class="head"><h2>Seed data</h2><span class="n" id="seedsN"></span></div>
    <p class="sub" id="seedsSub"></p>
    <div id="seedsBody"></div>
  </section>

  <section id="flow">
    <div class="head"><h2>The flow that does it</h2><span class="n" id="flowN"></span></div>
    <p class="sub">In order, with what each action runs after. This is the shape of the definition,
      not a record that it ran.</p>
    <div class="seq" id="seq"></div>
    <div id="restBody"></div>
  </section>

  <section id="proof">
    <div class="head"><h2>How you know it worked</h2><span class="n" id="proofN"></span></div>
    <p class="sub" id="proofSub"></p>
    <div id="proofBody"></div>
  </section>
</main>

<footer class="prov">
  <div class="wrap">
    <blockquote>Prefer the contract over the sample.</blockquote>
    <dl id="prov"></dl>
    <p class="foot">
      This page is generated from those contracts by <code>scripts/build-provisioning-atlas.mjs</code>
      and carries no data of its own; <code>npm run test:provisioningatlas</code> fails if it has
      drifted. It describes what the contracts declare &mdash; it is not the runbook, and the steps
      an operator performs are owned by
      <code>docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md</code>.
      The earlier visualization under <code>docs/reference/foundational/</code> is harvest kept as a
      record: it names the superseded site, describes creation where the contract updates in place,
      and predates the registry scope entirely. It is not edited, and it is not current.
    </p>
  </div>
</footer>

<script id="atlas" type="application/json">${payload}</script>
<script>
const ATLAS = JSON.parse(document.getElementById('atlas').textContent);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const el = id => document.getElementById(id);

let scope = ATLAS.scopes[0];
let selected = scope.lists[0]?.title || null;
const filters = { required:false, indexed:false, unique:false, q:'' };

/* ── Scope switch ──────────────────────────────────────────────── */
el('scopes').innerHTML = ATLAS.scopes.map(s =>
  \`<button type="button" data-scope="\${esc(s.id)}" aria-pressed="\${s.id === scope.id}">\${esc(s.title)}</button>\`).join('');
el('scopes').addEventListener('click', e => {
  const b = e.target.closest('[data-scope]');
  if (!b) return;
  scope = ATLAS.scopes.find(s => s.id === b.dataset.scope);
  selected = scope.lists[0]?.title || null;
  filters.q = ''; el('q').value = '';
  for (const k of ['required','indexed','unique']) filters[k] = false;
  document.querySelectorAll('.tools .t').forEach(t => t.setAttribute('aria-pressed','false'));
  document.querySelectorAll('[data-scope]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.scope === scope.id)));
  renderAll();
  document.getElementById('where').scrollIntoView({ block:'start' });
});

/* ── Where it goes ─────────────────────────────────────────────── */
function renderWhere() {
  el('whereScope').textContent = scope.step + ' · ' + scope.title;
  el('whereSub').textContent = scope.subtitle;

  const exists = scope.standing.startsWith('ALL');
  el('standing').innerHTML = [
    \`<div class="state \${exists ? 'exists' : 'absent'}"><b>\${esc(scope.standing)}</b><span>standing in the tenant today</span></div>\`,
    \`<div><b class="num">\${scope.lists.length}</b><span>lists</span></div>\`,
    \`<div><b class="num">\${scope.fields.length}</b><span>fields declared</span></div>\`,
    \`<div><b class="num">\${scope.seeds.length}</b><span>\${scope.id === 'registry' ? 'configuration seeds' : 'seed records'}</span></div>\`,
    \`<div><b class="num">\${scope.actions.length}</b><span>flow actions</span></div>\`,
  ].join('');

  const rows = [
    ['Target site', scope.targetSite ? \`<code>\${esc(scope.targetSite)}</code>\` : null],
    ['Superseded site', scope.supersedes ? \`<code>\${esc(scope.supersedes)}</code> — no longer the target\` : null],
    ['Decision', scope.decision ? \`<b>\${esc(scope.decision)}</b>\${scope.appliedUtc ? ', applied ' + esc(scope.appliedUtc) : ''}. \${esc(scope.decisionNote || '')}\` : (scope.decisionNote ? esc(scope.decisionNote) : null)],
    ['Provisioning mode', scope.mode ? \`<code>\${esc(scope.mode)}</code> — \${esc(scope.standingDetail)}\` : esc(scope.standingDetail)],
  ].filter(([, v]) => v);

  el('whereBody').innerHTML = \`<dl class="prov" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start;gap:18px 30px;margin:0">\${
    rows.map(([k, v]) => \`<div><dt style="font:500 10.5px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:6px">\${esc(k)}</dt><dd style="margin:0;font-size:13.5px;color:var(--ink-soft);line-height:1.55">\${v}</dd></div>\`).join('')}</dl>\`
    + (scope.id === 'governance' && ATLAS.retire.length
      ? \`<div class="notice" style="margin-top:22px;border-left-color:var(--absent);background:var(--absent-soft)">
           <b style="color:var(--absent)">\${ATLAS.retire.length} duplicate instances still stand</b>
           <p>Creating a list by title twice leaves two lists, and a flow writing one while another
           reads the other both succeed. These are the copies that survived, awaiting deletion:</p>
           <p class="mono" style="font-size:12px;line-height:1.7">\${
             ATLAS.retire.map(r => esc(r.listTitle)).join(' · ')}</p>
         </div>\`
      : '')
    + (scope.amendments && scope.amendments.applied.length
      ? \`<div class="notice" style="margin-top:22px">
           <b>\${scope.amendments.applied.length} column\${scope.amendments.applied.length === 1 ? '' : 's'} the workbook does not know about</b>
           <p>\${esc(scope.amendments.applied.join(' · '))} — added after extraction. The workbook
           counts \${scope.amendments.workbookFieldCount} fields and this contract counts
           \${scope.fields.length}.</p>
           \${scope.amendments.divergence ? \`<p><strong>Consequence:</strong> \${esc(scope.amendments.divergence)}</p>\` : ''}
         </div>\`
      : '');
}

/* ── Lists and fields ──────────────────────────────────────────── */
function fieldsOf(list) { return scope.fields.filter(f => f.list === list); }

function fieldRow(f, withList) {
  return \`<div class="frow">
    <div class="fname">\${withList ? \`<span class="lp">\${esc(f.list)}</span>\` : ''}\${esc(f.internalName)}\${
      f.displayName && f.displayName !== f.internalName ? \` <span class="p" style="color:var(--ink-faint);font-weight:400"> · \${esc(f.displayName)}</span>\` : ''}</div>
    <div class="flags">
      \${f.type ? \`<span class="flag">\${esc(f.type)}</span>\` : ''}
      \${f.required ? '<span class="flag req">required</span>' : ''}
      \${f.indexed ? '<span class="flag idx">indexed</span>' : ''}
      \${f.unique ? '<span class="flag uniq">unique</span>' : ''}
      \${f.amended ? '<span class="flag amd">not in the workbook</span>' : ''}
    </div>
    \${f.purpose || f.params ? \`<div class="fmeta">\${esc(f.purpose || '')}\${
      f.params ? \`<span class="p"> \${f.purpose ? '· ' : ''}\${esc(f.params)}</span>\` : ''}</div>\` : ''}
    \${f.amended && f.evidence ? \`<div class="fmeta" style="color:var(--defined)">\${esc(f.evidence)}</div>\` : ''}
    \${f.schemaXml ? \`<details class="xml"><summary>Schema XML</summary><pre>\${esc(f.schemaXml)}</pre></details>\` : ''}
  </div>\`;
}

function renderLists() {
  el('listsN').textContent = \`\${scope.lists.length} lists · \${scope.fields.length} fields\`;
  el('index').innerHTML = scope.lists.map(l =>
    \`<button type="button" role="tab" data-list="\${esc(l.title)}" aria-pressed="\${l.title === selected}">
       <span class="lt">\${esc(l.title)}</span>
       <span class="lm">\${l.fieldCount} fields · \${l.requiredCount} required · \${l.indexedCount} indexed\${l.seedCount ? ' · ' + l.seedCount + ' seed' + (l.seedCount === 1 ? '' : 's') : ''}</span>
     </button>\`).join('');
  renderDetail();
}

function renderDetail() {
  const l = scope.lists.find(x => x.title === selected) || scope.lists[0];
  if (!l) { el('detail').innerHTML = '<p class="none">No list declared.</p>'; return; }
  const fs = fieldsOf(l.title);
  const views = (scope.views || []).filter(v => v.list === l.title);
  const keys = (scope.uniqueKeys || []).filter(k => k.list === l.title);
  const settings = (scope.settings || []).filter(s => s.list === l.title);
  const seeds = scope.seeds.filter(s => s.list === l.title);

  el('detail').innerHTML = \`
    <h3>\${esc(l.title)}</h3>
    \${l.description ? \`<p class="dsc">\${esc(l.description)}</p>\` : ''}
    \${l.purpose && l.purpose !== l.description ? \`<p class="dsc">\${esc(l.purpose)}</p>\` : ''}
    <div class="meta">
      <span class="tag \${l.guid ? 'on' : 'def'}">\${l.guid ? 'exists in the tenant' : 'not created'}</span>
      <span class="tag">\${l.fieldCount} fields</span>
      <span class="tag">\${l.requiredCount} required</span>
      <span class="tag">\${l.indexedCount} indexed</span>
      \${l.uniqueKey ? \`<span class="tag">unique key: \${esc(l.uniqueKey)}</span>\` : ''}
      \${seeds.length ? \`<span class="tag">\${seeds.length} seed\${seeds.length === 1 ? '' : 's'}</span>\` : ''}
    </div>
    <div class="addr">
      \${l.guid ? \`<b>GUID</b> \${esc(l.guid)}<br>\` : ''}
      \${l.uri ? \`<b>Address</b> \${esc(l.uri)}<br>\` : ''}
      \${l.site ? \`<b>Site</b> \${esc(l.site)}<br>\` : ''}
      \${l.mode ? \`<b>Mode</b> \${esc(l.mode)}\` : ''}
    </div>
    \${l.settings ? \`<p class="dsc" style="margin-top:12px">\${esc(l.settings)}</p>\` : ''}
    \${l.note ? \`<p class="dsc" style="margin-top:12px">\${esc(l.note)}</p>\` : ''}
    \${l.evidence ? \`<p class="dsc" style="margin-top:10px;color:var(--defined)">\${esc(l.evidence)}</p>\` : ''}

    <p class="sub-head">Fields — \${fs.length}</p>
    \${fs.length ? fs.map(f => fieldRow(f, false)).join('') : '<p class="none">No field declared for this list.</p>'}

    \${keys.length ? \`<p class="sub-head">Unique key</p>\${keys.map(k => \`
      <div class="frow"><div class="fname">\${esc(k.field)}</div>
        <div class="flags">\${k.indexed ? '<span class="flag idx">indexed</span>' : ''}\${k.unique ? '<span class="flag uniq">unique</span>' : ''}</div>
        <div class="fmeta">\${esc(k.test || '')}\${k.effect ? \` <span class="p">· \${esc(k.effect)}</span>\` : ''}</div>
      </div>\`).join('')}\` : ''}

    \${views.length ? \`<p class="sub-head">Views — \${views.length}</p>\${views.map(v => \`
      <div class="frow"><div class="fname">\${esc(v.title)}</div><div class="flags"></div>
        <div class="fmeta">\${esc(v.fields || '')}\${v.behaviour ? \`<br><span class="p">\${esc(v.behaviour)}</span>\` : ''}</div>
        \${v.caml ? \`<details class="xml"><summary>CAML query</summary><pre>\${esc(v.caml)}</pre></details>\` : ''}
      </div>\`).join('')}\` : ''}

    \${settings.length ? \`<p class="sub-head">List settings — \${settings.length}</p>
      <div class="tw"><table><thead><tr><th>Property</th><th>Expected</th><th>Applied by</th></tr></thead><tbody>\${
        settings.map(s => \`<tr><td class="m">\${esc(s.property)}</td><td class="m">\${esc(s.expected ?? '—')}</td><td>\${esc(s.method ?? '—')}</td></tr>\`).join('')
      }</tbody></table></div>\` : ''}
  \`;
  el('detail').scrollTop = 0;
}

el('index').addEventListener('click', e => {
  const b = e.target.closest('[data-list]');
  if (!b) return;
  selected = b.dataset.list;
  document.querySelectorAll('[data-list]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.list === selected)));
  renderDetail();
});

/* ── Field search ──────────────────────────────────────────────── */
function renderFind() {
  el('findN').textContent = \`\${scope.fields.length} fields in \${scope.title.toLowerCase()}\`;
  const hit = scope.fields.filter(f => {
    if (filters.required && !f.required) return false;
    if (filters.indexed && !f.indexed) return false;
    if (filters.unique && !f.unique) return false;
    if (filters.q) {
      const hay = [f.internalName, f.displayName, f.type, f.purpose, f.params, f.list, f.schemaXml]
        .join(' ').toLowerCase();
      if (!hay.includes(filters.q)) return false;
    }
    return true;
  });
  el('tally').textContent = \`\${hit.length} of \${scope.fields.length}\`;
  el('results').innerHTML = hit.length
    ? hit.map(f => fieldRow(f, true)).join('')
    : '<p class="none">No field matches.</p>';
}
el('q').addEventListener('input', e => { filters.q = e.target.value.toLowerCase(); renderFind(); });
document.querySelectorAll('.tools .t').forEach(b => b.addEventListener('click', () => {
  filters[b.dataset.f] = !filters[b.dataset.f];
  b.setAttribute('aria-pressed', String(filters[b.dataset.f]));
  renderFind();
}));

/* ── Seeds ─────────────────────────────────────────────────────── */
function renderSeeds() {
  el('seedsN').textContent = \`\${scope.seeds.length} record\${scope.seeds.length === 1 ? '' : 's'}\`;
  el('seedsSub').textContent = scope.id === 'registry'
    ? 'Configuration the registry reads its own parameters from. Each is created when missing and merged when present.'
    : 'Rows the provisioning run writes. Each is located by its key field before it is written, so a re-run does not duplicate it.';
  el('seedsBody').innerHTML = scope.seeds.length ? \`<div class="cards">\${scope.seeds.map(s => \`
    <div class="card">
      <h4>\${esc(s.key)}</h4>
      \${s.description ? \`<p>\${esc(s.description)}</p>\` : ''}
      <p class="mono" style="font-size:11.5px;color:var(--ink-faint)">\${esc(s.list)}\${
        s.valueType ? ' · ' + esc(s.valueType) : ''}\${s.secret ? ' · secret' : ''}\${
        s.enabled === false ? ' · disabled' : ''}</p>
      \${s.behaviour ? \`<p style="font-size:12.5px;color:var(--ink-soft)">\${esc(s.behaviour)}</p>\` : ''}
      \${s.body ? \`<details class="xml"><summary>Body</summary><pre>\${esc(s.body)}</pre></details>\` : ''}
    </div>\`).join('')}</div>\` : '<p class="none">No seed declared.</p>';
}

/* ── Flow ──────────────────────────────────────────────────────── */
function renderFlow() {
  el('flowN').textContent = \`\${scope.actions.length} actions\`;
  el('seq').innerHTML = scope.actions.map(a => \`
    <div class="step">
      <div class="sn">\${String(a.order).padStart(2, '0')}</div>
      <div>
        <h4>\${esc(a.name)}</h4>
        \${a.type ? \`<p class="ty">\${esc(a.type)}</p>\` : ''}
        \${a.purpose ? \`<p class="pu">\${esc(a.purpose)}</p>\` : ''}
        \${a.runAfter ? \`<p class="ra">runs after: \${esc(a.runAfter)}</p>\` : ''}
        \${a.detail ? \`<pre>\${esc(a.detail)}</pre>\` : ''}
      </div>
    </div>\`).join('');

  el('restBody').innerHTML = (scope.rest || []).length ? \`
    <p class="sub-head" style="border-top:1px solid var(--rule);margin-top:30px">Every call it makes — \${scope.rest.length}</p>
    <div class="tw"><table><thead><tr><th>Operation</th><th>Method</th><th>Relative URI</th><th>Headers</th></tr></thead><tbody>\${
      scope.rest.map(r => \`<tr><td>\${esc(r.operation)}</td><td class="m">\${esc(r.method)}</td><td class="m">\${esc(r.uri ?? '—')}</td><td class="m">\${esc(r.headers ?? '—')}</td></tr>\`).join('')
    }</tbody></table></div>\` : '';
}

/* ── Proof ─────────────────────────────────────────────────────── */
function renderProof() {
  const parts = [];

  if (scope.overview.length) {
    parts.push(\`<p class="sub-head" style="border-top:0;padding-top:0;margin-top:0">Declared against documented</p>
      <div class="tw"><table><thead><tr><th>Metric</th><th>Expected</th><th>Documented</th><th>Variance</th><th>Reads</th></tr></thead><tbody>\${
      scope.overview.map(o => \`<tr><td>\${esc(o.metric)}</td><td class="m num">\${esc(o.expected)}</td><td class="m num">\${esc(o.documented)}</td><td class="m num">\${esc(o.variance)}</td><td>\${esc(o.interpretation ?? '')}</td></tr>\`).join('')
    }</tbody></table></div>\`);
  }

  if (scope.checks.length) {
    parts.push(\`<p class="sub-head" style="border-top:0;padding-top:0;margin-top:0">Validation checks — \${scope.checks.length}</p>
      <div class="tw"><table><thead><tr><th>Check</th><th>Against</th><th>Expected result</th><th>Status</th></tr></thead><tbody>\${
      scope.checks.map(c => \`<tr><td class="m">\${esc(c.id)} \${esc(c.category ?? '')}</td><td class="m">\${esc(c.check ?? '')}</td><td>\${esc(c.expected ?? '')}</td><td><span class="st">\${esc(c.status ?? '—')}</span></td></tr>\`).join('')
    }</tbody></table></div>\`);
  }

  if (scope.statusVocabulary.length) {
    parts.push(\`<p class="sub-head">What each recorded status means — \${scope.statusVocabulary.length}</p>
      <div class="cards">\${scope.statusVocabulary.map(s => \`
        <div class="card"><h4>\${esc(s.status)}</h4><p>\${esc(s.meaning ?? '')}</p>
        \${s.recordedIn ? \`<p class="mono" style="font-size:11.5px;color:var(--ink-faint)">recorded in \${esc(s.recordedIn)}</p>\` : ''}</div>\`).join('')}</div>\`);
  }

  if (scope.risks.length) {
    parts.push(\`<p class="sub-head">Risks the contract raises about itself — \${scope.risks.length}</p>
      <div class="tw"><table><thead><tr><th>Area</th><th>Observation</th><th>Control</th></tr></thead><tbody>\${
      scope.risks.map(r => \`<tr><td class="m">\${esc(r.area)}</td><td>\${esc(r.observation ?? '')}</td><td>\${esc(r.control ?? '')}</td></tr>\`).join('')
    }</tbody></table></div>\`);
  }

  if (scope.dictionary.length) {
    parts.push(\`<p class="sub-head">Terms — \${scope.dictionary.length}</p>
      <div class="tw"><table><thead><tr><th>Term</th><th>Definition</th><th>Applies to</th></tr></thead><tbody>\${
      scope.dictionary.map(d => \`<tr><td class="m">\${esc(d.term)}</td><td>\${esc(d.definition)}</td><td class="m">\${esc(d.appliesTo)}</td></tr>\`).join('')
    }</tbody></table></div>\`);
  }

  el('proofN').textContent = scope.step;
  el('proofSub').textContent = scope.id === 'registry'
    ? 'The contract is a design-time reading. It states what each outcome would mean and what it cannot tell you — including that no row here is evidence of a created resource.'
    : 'Sixteen checks, each naming the SharePoint response that would satisfy it. Status is what the contract records, not what a run proved.';
  el('proofBody').innerHTML = parts.join('');
}

/* ── Provenance ────────────────────────────────────────────────── */
el('prov').innerHTML = [
  ['Governance contract', \`<code>\${esc(ATLAS.sources.governance.path)}</code><br>\${esc(ATLAS.sources.governance.workbook || '')}\`],
  ['Registry contract', \`<code>\${esc(ATLAS.sources.registry.path)}</code><br>spec \${esc(ATLAS.sources.registry.specVersion || '—')} · \${esc(ATLAS.sources.registry.flow || '')}\`],
  ['Integrity policy', esc(ATLAS.sources.governance.policy || 'Values are rendered as the contract stores them.')],
].map(([k, v]) => \`<div><dt>\${esc(k)}</dt><dd>\${v}</dd></div>\`).join('');

/* ── Section tracking: the nav says where you are ──────────────── */
const sections = [...document.querySelectorAll('main section')];
const links = new Map([...document.querySelectorAll('.jump a')].map(a => [a.getAttribute('href').slice(1), a]));
if ('IntersectionObserver' in window) {
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
    const first = sections.find(s => seen.has(s.id));
    for (const [id, a] of links) a.setAttribute('aria-current', String(Boolean(first && id === first.id)));
  }, { rootMargin: '-90px 0px -55% 0px' });
  sections.forEach(s => io.observe(s));
}

function renderAll() { renderWhere(); renderLists(); renderFind(); renderSeeds(); renderFlow(); renderProof(); }
renderAll();
</script>
`;

const abs = join(ROOT, TARGET);
if (CHECK) {
  const previous = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (previous === html) {
    console.log(`\n  ✅ ${TARGET} matches the contracts — ${SCOPES.reduce((n, s) => n + s.lists.length, 0)} lists, ${SCOPES.reduce((n, s) => n + s.fields.length, 0)} fields.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${TARGET} has drifted from the provisioning contracts.`);
  console.error('     Run: npm run provisioning:atlas\n');
  process.exit(1);
}

writeFileSync(abs, html);
console.log('\nProvisioning atlas\n');
console.log(`  wrote ${TARGET}  (${(html.length / 1024).toFixed(0)} KB)`);
for (const s of SCOPES) {
  console.log(`  ${s.step.padEnd(7)} ${s.title.padEnd(22)} ${String(s.lists.length).padStart(3)} lists · `
    + `${String(s.fields.length).padStart(3)} fields · ${String(s.seeds.length).padStart(2)} seeds · `
    + `${String(s.actions.length).padStart(2)} actions   [${s.standing}]`);
}
console.log(`  ${ATLAS_RETIRE_NOTE(retire)}\n`);

function ATLAS_RETIRE_NOTE(rows) {
  return rows.length
    ? `${rows.length} duplicate list instances carried from governance-list-registry.json`
    : 'no duplicate list instances recorded';
}
