#!/usr/bin/env node
/**
 * `docs/reference/flow-identity-crosswalk.json`, and whether the claim it exists to make holds.
 *
 * WHY THIS EXISTS
 * The crosswalk asserts one thing above all: an application workflow id and a tenant flow id are
 * DIFFERENT IDENTIFIERS FOR THE SAME FLOW, and neither can be computed from the other. Everything
 * downstream depends on it. The trigger harvester addresses the management API by tenant flow id
 * and keys its output by application workflow id; get the claim wrong and it either resolves
 * nothing or — far worse — writes one flow's signature under another flow's key.
 *
 * That claim was expensive to establish. A harvester addressed the management API with
 * application workflow ids and could not resolve a single flow; the dashed rendering of one
 * answered 404; the forensic audit's F-004 says the same thing from an independent evidence set.
 * A claim that cost three findings to establish gets a test, so that nobody re-derives it by
 * losing another afternoon.
 *
 * WHAT IT ASSERTS THAT THE BUILDER DOES NOT
 * The builder proves the crosswalk matches its workbook and reconciles to the register. It cannot
 * prove the crosswalk is internally coherent or that its provenance is real, because it is the
 * thing that wrote both. So:
 *
 *   1. The two id domains are disjoint — no application workflow id is a tenant flow id with its
 *      dashes removed. This is the claim itself, checked rather than asserted in prose.
 *   2. No tenant flow is claimed by two different application workflow ids. The harvester looks
 *      up in that direction; an ambiguity there is a mis-keyed credential.
 *   3. Every candidate under a key agrees with the key about which application workflow it serves.
 *   4. An unresolved key carries the reason it is unresolved. "No flow id" and "no flow id, and
 *      here is what the exporter said when it tried" are different facts to an operator.
 *   5. The recorded sha256 is the workbook on disk. Provenance nobody verifies is decoration.
 *   6. Nothing in it is a credential.
 *   7. A package resource id is never used as a flow id. An export package carries two GUIDs —
 *      the folder it writes the flow under, and the flow's own `name` — and only the second one
 *      addresses anything. They differ on every package here, so reading the wrong one yields a
 *      plausible GUID that resolves to nothing, which is the whole failure mode this crosswalk
 *      exists to end.
 *   8. Evidence grades stay distinguishable. A package match is by display name and proves
 *      nothing about which contract key a flow serves; a row that carried the key's application
 *      workflow id anyway would launder a guess into a fact.
 *
 * Run: node tests/flow-identity-crosswalk.test.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✅ ${name}`); };
const no = (name, detail) => { failed++; console.log(`  ❌ ${name}\n       ${detail}`); };
const is = (name, cond, detail = '') => (cond ? ok(name) : no(name, detail));

console.log('\nThe flow identity crosswalk\n');

const crosswalk = JSON.parse(read('docs/reference/flow-identity-crosswalk.json'));
const register = JSON.parse(read('docs/reference/endpoint-register.json')).current_configuration;
const rows = crosswalk.keys;

/* ── shape ───────────────────────────────────────────────────────────────────────────────── */
const APP_ID = /^[0-9a-f]{32}$/;
const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

is('every application workflow id is 32 hex characters',
   rows.every((r) => APP_ID.test(r.applicationWorkflowId)),
   rows.filter((r) => !APP_ID.test(r.applicationWorkflowId)).map((r) => `${r.key}: ${r.applicationWorkflowId}`).join(', '));

const candidates = rows.flatMap((r) => r.candidates);
is('every tenant flow id is a dashed GUID',
   candidates.every((c) => TENANT_ID.test(c.tenantFlowId)),
   candidates.filter((c) => !TENANT_ID.test(c.tenantFlowId)).map((c) => c.tenantFlowId).join(', '));

/* ── the claim ───────────────────────────────────────────────────────────────────────────── */
const appIds = new Set(rows.map((r) => r.applicationWorkflowId));
const collisions = candidates
  .map((c) => c.tenantFlowId.replace(/-/g, ''))
  .filter((flat) => appIds.has(flat));
is('the two identifier domains are disjoint', collisions.length === 0,
   `${collisions.join(', ')} is both an application workflow id and a tenant flow id with the `
   + 'dashes removed. If that is genuinely true the harvester can stop crosswalking — and if it '
   + 'is not, this crosswalk has a transcription error in it.');

/* ── the reverse lookup the harvester performs ───────────────────────────────────────────── */
const ownerOf = new Map();
const shared = [];
for (const row of rows) {
  for (const c of row.candidates) {
    const seen = ownerOf.get(c.tenantFlowId);
    if (seen && seen !== row.applicationWorkflowId) shared.push(`${c.tenantFlowId}: ${seen} and ${row.applicationWorkflowId}`);
    ownerOf.set(c.tenantFlowId, row.applicationWorkflowId);
  }
}
is('no tenant flow is claimed by two different application workflows', shared.length === 0,
   `${shared.join('; ')} — the harvester keys its output by the application workflow id it finds `
   + 'in a callback URL, so a flow serving two of them writes one key\'s credential under another.');

const disagree = rows.flatMap((r) =>
  r.candidates.filter((c) => c.applicationWorkflowId !== null && c.applicationWorkflowId !== r.applicationWorkflowId)
    .map((c) => `${r.key}: candidate ${c.tenantFlowId} serves ${c.applicationWorkflowId}`));
is('every candidate that names an application workflow agrees with its key',
   disagree.length === 0, disagree.join('\n       '));

/* ── the evidence grades stay apart ──────────────────────────────────────────────────────── */
const laundered = candidates.filter((c) => c.source === 'export-package' && c.applicationWorkflowId !== null);
is('a package candidate claims no application workflow id', laundered.length === 0,
   `${laundered.map((c) => c.tenantFlowId).join(', ')} — a package carries no application workflow `
   + 'id, so a value here can only have been copied from the key it was matched to by NAME. That '
   + 'turns an unproven match into a recorded fact, which is the failure this file exists to end.');

const SOURCES = new Set(['tenant-extraction', 'export-package']);
const BASES = new Set(['catalogue-key-row', 'register-flow-name']);
is('every candidate records where it came from and how it was matched',
   candidates.every((c) => SOURCES.has(c.source) && BASES.has(c.matchBasis)),
   candidates.filter((c) => !SOURCES.has(c.source) || !BASES.has(c.matchBasis))
     .map((c) => `${c.tenantFlowId}: ${c.source} / ${c.matchBasis}`).join(', '));

is('no candidate claims to be verified by anything but a callback URL',
   candidates.every((c) => c.verifiedBy === null || c.verifiedBy === 'listCallbackUrl'),
   'the only proof that a flow serves a key is its invoke URL carrying the register\'s '
   + 'application workflow id; nothing else may set this field');

const RESOLUTIONS = new Set(['EXTRACTED', 'PACKAGE_ONLY', 'UNRESOLVED']);
is('every key carries a resolution from the vocabulary', rows.every((r) => RESOLUTIONS.has(r.resolution)),
   rows.filter((r) => !RESOLUTIONS.has(r.resolution)).map((r) => `${r.key}: ${r.resolution}`).join(', '));
is('the resolution matches the candidates the key actually has',
   rows.every((r) => r.resolution === (r.candidates.some((c) => c.source === 'tenant-extraction') ? 'EXTRACTED'
     : r.candidates.length ? 'PACKAGE_ONLY' : 'UNRESOLVED')),
   rows.filter((r) => r.resolution === 'EXTRACTED' && !r.candidates.some((c) => c.source === 'tenant-extraction'))
     .map((r) => r.key).join(', '));

/* ── the fourth identifier ───────────────────────────────────────────────────────────────── */
const packageResourceIds = new Set((crosswalk.exports || []).map((e) => e.packageResourceId));
const confused = candidates.filter((c) => packageResourceIds.has(c.tenantFlowId));
is('no package resource id is recorded as a flow id', confused.length === 0,
   `${confused.map((c) => c.tenantFlowId).join(', ')} is the folder an export wrote a flow under, `
   + 'not the flow. It is minted per export and addresses nothing.');
is('every package resource id differs from the flow id in the same package',
   (crosswalk.exports || []).every((e) => e.packageResourceId !== e.tenantFlowId),
   'if these ever coincide the distinction above is untestable, and the next reader will collapse them');

/* ── the packages themselves ─────────────────────────────────────────────────────────────── */
const tampered = (crosswalk.exports || []).filter(
  (e) => createHash('sha256').update(readFileSync(path.join(ROOT, e.package))).digest('hex') !== e.sha256);
is('every export package is the one recorded', tampered.length === 0,
   tampered.map((e) => e.package).join(', '));
is('every export package names a flow with a Request trigger',
   (crosswalk.exports || []).every((e) => typeof e.requestTrigger === 'string' && e.requestTrigger.length > 0),
   (crosswalk.exports || []).filter((e) => !e.requestTrigger).map((e) => e.displayName).join(', ')
   + ' — a flow with no Request trigger cannot serve an HTTP contract key, whatever it is called');

const DISPOSITIONS = new Set(['NEW_EVIDENCE_FOR_A_CONTRACT_KEY', 'CORROBORATES_THE_EXTRACTION',
  'NO_REGISTER_FLOW_NAME_MATCHES_ITS_DISPLAY_NAME']);
is('every export package is dispositioned, including the ones that match nothing',
   (crosswalk.exports || []).length > 0 && crosswalk.exports.every((e) => DISPOSITIONS.has(e.disposition)),
   'an export the register cannot place is the finding, not the leftover');

/* ── the register ────────────────────────────────────────────────────────────────────────── */
const byContractKey = new Map(rows.map((r) => [r.contractKey, r]));
const missing = register.filter((e) => !byContractKey.has(e.key)).map((e) => e.key);
is('every contract key in the register has a crosswalk row', missing.length === 0, missing.join(', '));

const wrong = register
  .filter((e) => byContractKey.has(e.key) && byContractKey.get(e.key).applicationWorkflowId !== e.workflow_id)
  .map((e) => `${e.key}: register ${e.workflow_id}, crosswalk ${byContractKey.get(e.key).applicationWorkflowId}`);
is('the crosswalk and the register agree on every application workflow id', wrong.length === 0, wrong.join('\n       '));

/* ── unresolved keys say why ─────────────────────────────────────────────────────────────── */
const unevidenced = rows.filter((r) => r.resolution === 'UNRESOLVED');
is('an unresolved key carries no candidates, and a resolved one carries at least one',
   rows.every((r) => r.resolved === (r.candidates.length > 0)));
is('every unresolved key records the reason it is unresolved',
   unevidenced.every((r) => r.registryStatus && (r.failure?.code || r.failure?.message)),
   unevidenced.filter((r) => !r.failure?.code).map((r) => r.key).join(', ')
   + ' — a blank here is how an unresolved endpoint becomes an unexplained one');

/* ── provenance ──────────────────────────────────────────────────────────────────────────── */
const actual = createHash('sha256').update(readFileSync(path.join(ROOT, crosswalk.source.workbook))).digest('hex');
is('the recorded sha256 is the workbook on disk', actual === crosswalk.source.sha256,
   `recorded ${crosswalk.source.sha256}\n       actual   ${actual}`);
is('the source workbook declares its credentials were removed', crosswalk.source.credentialsRemoved === true);
is('the source names the tenant extraction it came from',
   typeof crosswalk.source.extractionSource === 'string' && crosswalk.source.extractionSource.length > 0);

/* ── nothing here is a credential ────────────────────────────────────────────────────────── */
const raw = read('docs/reference/flow-identity-crosswalk.json');
is('the crosswalk carries no signature, token or invoke URL',
   !/sig=|SharedAccessSignature|\beyJ[A-Za-z0-9_-]{20}|\/triggers\/manual\/paths\/invoke/i.test(raw),
   'the crosswalk is committed and world-readable; it maps identities, it does not carry credentials');

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
