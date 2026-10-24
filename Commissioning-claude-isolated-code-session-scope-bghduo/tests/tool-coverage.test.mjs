#!/usr/bin/env node
/**
 * Every capability of the eight merged tools has a home in this repository, and this asserts it.
 *
 * WHY THIS TEST EXISTS
 *
 * The Admin Suite was built by merging eight standalone tools. The merge was reported as complete
 * while five capabilities had quietly not come across — an exported commissioning record that
 * could not be imported, a print report, five CSV tables, a cURL command, an example payload. None
 * of that was caught by any test, because every test asserted what the suite *does* and none
 * asserted what the sources *had*.
 *
 * That is the gap this closes. It is the inverse assertion: for each capability the source tools
 * shipped, name the file that carries it now, and fail if that file stops carrying it. A merge
 * cannot be declared complete against memory; it has to be declared against a list.
 *
 * WHAT A ROW MEANS
 *
 *   capability  what the source tool could do, in the source's own vocabulary
 *   source      which tool it came from
 *   home        the file that carries it now — checked to exist AND to contain `proof`
 *   proof       a string that is present only if the capability is really implemented there,
 *               not merely mentioned. A comment saying "we should add CSV export" contains the
 *               word CSV; `requestFieldsCsv` is only present if the function is.
 *
 * `home` may be a standalone tool under `tools/`. That is a deliberate, documented split — the
 * offline consoles run with no deployment, from a phone, through a CORS relay, which an
 * in-platform screen cannot — and `docs/reference/ADMIN_SUITE.md` records which half owns what.
 * The rule this enforces is that every capability lives SOMEWHERE, not that everything lives
 * in the suite.
 *
 * Usage:  node tests/tool-coverage.test.mjs
 * Exit:   0 = every capability has a home, 1 = at least one was lost
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* One row per capability the eight source tools shipped. Adding a tool means adding its rows. */
const COVERAGE = [
  /* ── admin-console-1.html — the standalone endpoint console ───────────────────────── */
  ['estate diagnosis: per-key verdict', 'admin-console', 'core/endpoint-atlas.js', 'describeKey'],
  ['estate findings: name collisions, uncontracted keys', 'admin-console', 'core/endpoint-atlas.js', 'estate.name-collision'],
  ['severity ordering: silent faults first', 'admin-console', 'core/endpoint-atlas.js', 'wrong-flow'],
  ['signature redaction', 'admin-console', 'core/endpoint-registry.js', 'export function redact'],
  ['overview / summary strip', 'admin-console', 'modules/admin-suite.js', 'function overviewPanel'],
  ['endpoint table', 'admin-console', 'modules/admin-suite.js', 'function estatePanel'],
  ['flow estate: all tenant workflows', 'admin-console', 'modules/endpoint-console.js', 'function estatePanel'],
  ['live health probe', 'admin-console', 'core/health-contract.js', 'export async function readOnlyCall'],
  ['reference: where the facts come from', 'admin-console', 'modules/endpoint-console.js', 'function referencePanel'],
  ['commission wizard: apply a signature per key', 'admin-console', 'tools/admin-console.html', 'applySignature'],
  ['commission: generate the values file', 'admin-console', 'tools/admin-console.html', 'valuesFileText'],
  ['commission: generate config.local.js', 'admin-console', 'tools/admin-console.html', 'renderRuntimeConfig'],
  ['rotation register', 'admin-console', 'tools/admin-console.html', 'rotationPanel'],
  ['compare against a live export', 'admin-console', 'tools/admin-console.html', 'comparePanel'],
  ['readiness scoring', 'admin-console', 'tools/admin-console.html', 'readiness'],
  ['estate CSV export', 'admin-console', 'tools/admin-console.html', 'estateCsv'],
  ['print / save as PDF', 'admin-console', 'tools/admin-console.html', 'Print / save as PDF'],

  /* ── DGO Configuration Launchpad ──────────────────────────────────────────────────── */
  ['non-destructive health contract', 'launchpad', 'core/health-contract.js', 'export async function healthContract'],
  ['health contract: endpoint key echo check', 'launchpad', 'core/health-contract.js', 'wrong-endpoint-key'],
  ['health contract documented for flow authors', 'launchpad', 'docs/reference/HEALTH_CONTRACT.md', 'validationOnly'],
  ['per-endpoint address editing', 'launchpad', 'modules/admin-suite.js', 'function overridePanel'],
  ['address validation before save', 'launchpad', 'modules/admin-suite.js', 'export function validateOverride'],
  ['readiness metrics', 'launchpad', 'modules/admin-suite.js', 'function attention'],
  ['export a deployment bundle', 'launchpad', 'scripts/package.mjs', 'PACKAGE_MANIFEST'],
  ['redacted report export', 'launchpad', 'core/endpoint-atlas.js', 'export function exportReport'],

  /* ── Flow Operations Workbench v1 + v2 ────────────────────────────────────────────── */
  ['flow catalogue with provenance', 'workbench', 'config/flow-shapes.data.js', 'sourceSha256'],
  ['inspect shapes: every nested field path', 'workbench', 'core/flow-shapes.js', 'export function flattenSchema'],
  ['compose a request from a form', 'workbench', 'core/flow-shapes.js', 'export function composeBody'],
  ['draft-07 validation', 'workbench', 'core/flow-shapes.js', 'export function validateValue'],
  ['alignment report artefact', 'workbench', 'core/flow-shapes.js', 'export function alignmentReport'],
  ['send a composed request', 'workbench', 'modules/admin-suite.js', 'async function sendComposed'],
  ['send through a loopback relay (CORS)', 'workbench', 'tools/flow-workbench/local_agent.py', 'api/request'],
  ['outcomes history', 'workbench', 'tools/flow-workbench/app.js', 'exportHistory'],
  ['endpoint profiles', 'workbench', 'tools/flow-workbench/app.js', 'saveProfile'],
  ['export the full catalogue', 'workbench', 'tools/flow-workbench/app.js', 'exportCatalog'],
  ['export all request shapes', 'workbench', 'tools/flow-workbench/app.js', 'exportShapes'],
  ['copy the request as curl', 'workbench', 'core/flow-shapes.js', 'export function toCurl'],
  ['example payload generated from the schema', 'workbench', 'core/flow-shapes.js', 'export function exampleFor'],

  /* ── Live Operations Execution Console ────────────────────────────────────────────── */
  ['dependency-gated actions', 'liveops', 'core/ops-runbook.js', 'export function dependenciesMet'],
  ['resolved requires evidence', 'liveops', 'core/ops-runbook.js', 'export function canSetStatus'],
  ['parameter register with locked values', 'liveops', 'core/ops-runbook.js', 'export function parameterValue'],
  ['placeholder text counts as unanswered', 'liveops', 'core/ops-runbook.js', 'PLACEHOLDER'],
  ['acceptance records with evidence fields', 'liveops', 'core/ops-runbook.js', 'export function acceptanceComplete'],
  ['residual risk register', 'liveops', 'modules/admin-suite.js', 'function runbookRisks'],
  ['cutover and hypercare controls', 'liveops', 'modules/admin-suite.js', 'function runbookCutover'],
  ['computed release gate', 'liveops', 'core/ops-runbook.js', 'export function releaseGate'],
  ['structural audit', 'liveops', 'core/ops-runbook.js', 'export function structuralAudit'],
  ['export state', 'liveops', 'core/ops-runbook.js', 'export function exportRunbook'],
  ['import state', 'liveops', 'core/ops-runbook.js', 'export function importRunbook'],
  ['print report', 'liveops', 'modules/admin-suite.js', 'function printView'],
  ['reset', 'liveops', 'core/admin-actions.js', 'runbook.reset'],
  ['integrity check on load', 'liveops', 'core/ops-runbook.js', 'export function hydrate'],

  /* ── Guided Desk Walkthrough ──────────────────────────────────────────────────────── */
  ['ordered stages', 'walkthrough', 'config/ops-runbook.config.js', 'stages:'],
  ['stop conditions', 'walkthrough', 'config/ops-runbook.config.js', 'stopIf'],
  ['per-step validation criteria', 'walkthrough', 'config/ops-runbook.config.js', 'validation:'],
  ['required decisions register', 'walkthrough', 'config/ops-runbook.config.js', 'RunbookParameters'],
  ['session gate', 'walkthrough', 'core/ops-runbook.js', 'export function releaseGate'],
  ['import a session', 'walkthrough', 'core/ops-runbook.js', 'export function importRunbook'],

  /* ── Endpoint Provisioning Documentation ──────────────────────────────────────────── */
  ['master flow catalogue', 'provisioning-doc', 'config/flow-shapes.data.js', 'dgo-flow-shapes/v1'],
  ['per-flow request schemas', 'provisioning-doc', 'scripts/build-flow-shapes.mjs', 'inputs?.schema'],
  ['response actions recorded', 'provisioning-doc', 'scripts/build-flow-shapes.mjs', "action.type === 'Response'"],
  ['mail actions recorded', 'provisioning-doc', 'scripts/build-flow-shapes.mjs', 'MAIL_OPERATIONS'],
  ['connectors recorded', 'provisioning-doc', 'scripts/build-flow-shapes.mjs', 'connectorOf'],
  ['SHA-256 per source definition', 'provisioning-doc', 'scripts/build-flow-shapes.mjs', "createHash('sha256')"],
  ['table: flow summary', 'provisioning-doc', 'core/flow-shapes.js', 'export function flowSummaryCsv'],
  ['table: request fields', 'provisioning-doc', 'core/flow-shapes.js', 'export function requestFieldsCsv'],
  ['table: response actions', 'provisioning-doc', 'core/flow-shapes.js', 'export function responseActionsCsv'],
  ['table: mail actions', 'provisioning-doc', 'core/flow-shapes.js', 'export function mailActionsCsv'],
  ['table: endpoint keys', 'provisioning-doc', 'core/flow-shapes.js', 'export function endpointKeysCsv'],

  /* ── flow-url-capsule: registry + termux ──────────────────────────────────────────── */
  ['the service itself', 'capsule', 'tools/flow-capsule/app/flowcapsule.py', 'FLOWCAP_DATA_DIR'],
  ['the CLI', 'capsule', 'tools/flow-capsule/app/flowcapctl.py', 'configure-flow'],
  ['systemd unit', 'capsule', 'tools/flow-capsule/flowcapsule.service', '[Service]'],
  ['Termux installer', 'capsule', 'tools/flow-capsule/termux-setup.sh', 'POST-INSTALL CHECKS PASSED'],
  ['installer: diagnose / repair / rollback / uninstall', 'capsule', 'tools/flow-capsule/termux-setup.sh', 'uninstall)'],
  ['service tests', 'capsule', 'tools/flow-capsule/tests/test_flowcapsule.py', 'test_store_exact_atomic_versions_integrity'],
  ['installer tests', 'capsule', 'tools/flow-capsule/tests/test_installer.py', 'test_security_idempotency'],
  ['URL formation rules', 'capsule', 'core/endpoint-formation.js', 'export function inspect'],
  ['URL masking', 'capsule', 'core/endpoint-formation.js', 'export function mask'],
  ['SHA-256 fingerprinting', 'capsule', 'core/endpoint-formation.js', 'export async function fingerprint'],
  ['identity verification handshake', 'capsule', 'core/health-contract.js', 'export async function identityVerify'],
  ['alias list with fingerprints', 'capsule', 'core/capsule-client.js', 'export async function listFlows'],
  ['version history', 'capsule', 'core/capsule-client.js', 'export async function versions'],
  ['rollback', 'capsule', 'core/capsule-client.js', 'export async function rollback'],
  ['enable / disable', 'capsule', 'core/capsule-client.js', 'export async function setEnabled'],
  ['register or rotate', 'capsule', 'core/capsule-client.js', 'export async function register'],
];

/**
 * Source capabilities that deliberately do NOT map, with the reason.
 *
 * Recorded rather than omitted. An absence with no entry here is a loss; an absence with one is a
 * decision somebody can disagree with. The list is printed on every run so it stays visible
 * instead of becoming a thing nobody remembers deciding.
 */
const NOT_APPLICABLE = [
  ['launchpad', 'add / remove an endpoint row (`newEndpoint`)',
    'The Launchpad let an operator invent arbitrary key→URL pairs because it had no register to '
    + 'check them against. In this platform a contract key is declared in config/endpoints.config.js '
    + 'and named by the tenant register, and adding one means adding the code that calls it — so '
    + 'there is nothing a UI could add. The equivalent capability, changing where an existing key '
    + 'points, is the override panel, which is covered above.'],
];

let passed = 0;
const failures = [];
const cache = new Map();
const read = (rel) => {
  if (!cache.has(rel)) {
    const abs = path.join(ROOT, rel);
    cache.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
  }
  return cache.get(rel);
};

console.log('\nEvery capability of the eight merged tools has a home\n');

const bySource = new Map();
for (const row of COVERAGE) {
  const [, source] = row;
  if (!bySource.has(source)) bySource.set(source, []);
  bySource.get(source).push(row);
}

for (const [source, rows] of bySource) {
  console.log(`  ${source}`);
  for (const [capability, , home, proof] of rows) {
    const body = read(home);
    if (body === null) {
      failures.push(`${source} · ${capability}\n      its home ${home} does not exist`);
      console.log(`    ❌ ${capability}\n       LOST — ${home} does not exist`);
    } else if (!body.includes(proof)) {
      failures.push(`${source} · ${capability}\n      ${home} no longer contains ${JSON.stringify(proof)}`);
      console.log(`    ❌ ${capability}\n       LOST — ${home} no longer contains ${JSON.stringify(proof)}`);
    } else {
      passed++;
      console.log(`    ✅ ${capability}  →  ${home}`);
    }
  }
  console.log('');
}

/* The suite must not quietly shed a section either: each is a source tool's surface. */
const suite = read('modules/admin-suite.js') || '';
for (const section of ['overview', 'estate', 'checks', 'shapes', 'runbook', 'capsule', 'people', 'control', 'actions', 'evidence']) {
  if (suite.includes(`['${section}',`)) passed++;
  else failures.push(`the Admin Suite no longer declares the "${section}" section`);
}

/* Every action the catalogue declares must be dispatchable, or the control is a dead button. */
const actions = read('core/admin-actions.js') || '';
/* `, domain:` anchors this to AdminActions entries. Without it the DOMAINS array above —
   `{ id: 'flows', label: … }` — is scraped as though its ids were actions. */
const declared = [...actions.matchAll(/\{ id: '([a-z.-]+)', domain:/g)].map((m) => m[1]);
const handled = new Set([...suite.matchAll(/case '([a-z.-]+)':/g)].map((m) => m[1]));
const rendered = new Set([...suite.matchAll(/actionButton\('([a-z.-]+)'|armed\('([a-z.-]+)'/g)].map((m) => m[1] || m[2]));
/**
 * Catalogued actions the suite lists but does not itself perform.
 *
 * The catalogue is the whole of a role's administrative reach, so it names actions other screens
 * own — User Administration creates people, Settings imports records, and the suite links to them
 * rather than re-implementing them. They are listed so an administrator can see their reach is
 * complete; they are excluded here so this check stays about DEAD buttons.
 *
 * Each is either performed inline by a form in the suite (the runbook editors) or owned by a
 * named module. Adding an id here without one of those being true is how a dead control gets
 * waved through, so every entry names its owner.
 */
const OWNED_ELSEWHERE = new Map([
  ['estate.review', 'the suite\'s own Endpoints section — reading is the section, not a button'],
  ['flows.inspect', 'the suite\'s own Flow shapes section'],
  ['flows.validate', 'runs continuously as the composer is typed into'],
  ['runbook.set-parameter', 'the runbook parameters form'],
  ['runbook.set-status', 'the runbook action form'],
  ['runbook.attach-evidence', 'the runbook action form'],
  ['runbook.accept-risk', 'the residual-risk form'],
  ['people.create', 'modules/user-admin.js'],
  ['people.update', 'modules/user-admin.js'],
  ['people.assign-role', 'modules/user-admin.js'],
  ['people.disable', 'modules/user-admin.js'],
  ['platform.import-records', 'modules/settings.js — its "Import records from a file" control'],
  ['evidence.review-audit', 'the suite\'s own Audit & evidence section'],
  ['capsule.connect', 'the capsule connect form'],
]);

const orphaned = declared.filter((id) => !handled.has(id) && !rendered.has(id)
  /* These are catalogue entries describing what another screen owns — the suite lists them so a
     role's reach is complete, and links out rather than re-implementing them. */
  && !OWNED_ELSEWHERE.has(id));
if (orphaned.length) failures.push(`${orphaned.length} catalogued action(s) are neither dispatched nor rendered: ${orphaned.join(', ')}`);
else passed++;

console.log('  deliberately not carried across\n');
for (const [source, capability, reason] of NOT_APPLICABLE) {
  console.log(`    ·  ${source} — ${capability}`);
  console.log(`       ${reason.replace(/(.{88}) /g, '$1\n       ')}\n`);
}

console.log(failures.length
  ? `❌ ${passed} covered, ${failures.length} LOST\n${failures.map((f) => `   · ${f}`).join('\n')}\n`
  : `✅ ${passed} capabilities with a home, ${NOT_APPLICABLE.length} recorded as not applicable. Nothing was lost in the merge.\n`);
process.exit(failures.length ? 1 : 0);
