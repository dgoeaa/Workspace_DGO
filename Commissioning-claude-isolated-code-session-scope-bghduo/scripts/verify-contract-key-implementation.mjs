#!/usr/bin/env node
/**
 * Does a contract key have an implementation, and can its caller reach it?
 *
 * WHY THIS EXISTS
 * `docs/deployment/INDEPENDENT_REVIEW_BRIEF.md` §6.8 disclosed three keys as having "no
 * implementation anywhere in the documented estate": `SCAN_INTAKE`, `UPLOAD`, `WRITEBACK`.
 * Two of the three were wrong. `npm run wiring`, in this repository, already reported UPLOAD
 * wired 7/7 against `CG_Upload_Endpoint` and WRITEBACK wired 10/10 against
 * `CG_Writeback_Endpoint`, and `docs/reference/portal-endpoint-workflow-ids.json` records a
 * workflow id for each. The disclosure was assembled from `scripts/lib/endpoint-recovery.mjs`'s
 * UNAVAILABLE table, which names two keys, not three, and answers a narrower question than the
 * one the brief asked it: that table is about whether a labelled trigger URL can be recovered
 * from `docs/reference/`, not about whether a flow exists.
 *
 * Understating what exists is not the safe direction of error. A reviewer told UPLOAD is
 * unbuilt does not read `CG_Upload_Endpoint`, and `CG_Upload_Endpoint` is where the interesting
 * defect is: it is built, it is complete, and it cannot be called by the portal.
 *
 * WHAT IT DECIDES, AND FROM WHAT
 * Nothing here is asserted in prose and checked by looking for the prose again. Three previous
 * fixes in this estate were policed by grepping the source for the words of the fix and the
 * defect returned each time through a path the source-reading guard could not see. So every
 * value below is derived from a primary artefact:
 *
 *   implementation  the definitions exported from the tenant under
 *                   docs/reference/flow-contracts/deployed/, resolved through the same reader
 *                   and the same latest-export-per-workflow rule verify-portal-wiring.mjs uses,
 *                   and keyed on the workflow identities in portal-endpoint-workflow-ids.json,
 *                   which were read out of the flows' own run records.
 *   reachability    the trigger of that definition — its triggerAuthenticationType and its
 *                   declared method — against the method and caller the data contract declares.
 *   disclosure      the brief's own §6.8 list, parsed, and each contract's own `status` field.
 *
 * A key is UNIMPLEMENTED only when no exported definition performs it. A key is UNREACHABLE
 * when a definition performs it but its trigger refuses the call its own contract says the
 * caller makes — which is a different finding, and reported as one, because the remedy is a
 * trigger setting rather than a flow to build.
 *
 * Usage:
 *   node scripts/verify-contract-key-implementation.mjs           # human report
 *   node scripts/verify-contract-key-implementation.mjs --json    # machine-readable
 *   node scripts/verify-contract-key-implementation.mjs --strict  # exit 1 on any disagreement
 */

import { readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, readFlowFile, definitionRoot } from './lib/flow-definition-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const text = (p) => readFileSync(join(ROOT, p), 'utf8');

const CONTRACT_PATH = 'docs/deployment/sharepoint/portal-data-contract.json';
const IDS_PATH = 'docs/reference/portal-endpoint-workflow-ids.json';
const BRIEF_PATH = 'docs/deployment/INDEPENDENT_REVIEW_BRIEF.md';
const DEPLOYED_DIR = 'docs/reference/flow-contracts/deployed';

const contract = read(CONTRACT_PATH);
const ids = read(IDS_PATH);
const index = read('docs/reference/sharepoint-list-index.json');

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const strict = flags.has('--strict');

/* ── the deployed set ───────────────────────────────────────────────────────────────────
 * One workflow exported twice is one flow, and only the later export describes it as it is
 * now. Workflow df7ddff1 is in this directory as ECM_DOCS_INTAKE (2026-08-19) and again as
 * CG_Upload_Endpoint (2026-08-24) — renamed and rebuilt in place. Matching on display name
 * alone answers questions about the live flow out of a superseded copy, so the same rule
 * verify-portal-wiring.mjs applies is applied here. */
const allExports = [];
for (const file of walk(join(ROOT, DEPLOYED_DIR))) {
  const rec = readFlowFile(file, index);
  if (rec) allExports.push({ ...rec, file: relative(ROOT, file) });
}
const byInternal = new Map();
for (const r of allExports) {
  const id = r.internalName || `file:${r.file}`;
  const prev = byInternal.get(id);
  if (!prev || String(r.exportedAtUtc || '') > String(prev.exportedAtUtc || '')) byInternal.set(id, r);
}
const deployed = [...byInternal.values()];

/* A KEY IS RESOLVED BY WORKFLOW IDENTITY, NOT BY DISPLAY NAME.
   Matching a candidate flow NAME against the exported set is what produced the error this file
   exists to correct, one layer down: five of the seven portal endpoints were renamed in place —
   Portal_Verify became CG_Verification_Endpoint, Portal_Status_Enquiry became
   CG_Status_Check_Endpoint, ECM_DOCS_INTAKE became CG_Upload_Endpoint — and a name match finds
   none of them, reporting "no flow" for a flow the tenant is running. The identity is the
   internal name recorded in portal-endpoint-workflow-ids.json, read on 2026-08-27 out of the
   flows' own run records. That file is the flow identifying itself, which outranks any name.

   Where the export carries a DIFFERENT display name from the one the register records, the
   export predates the rename: the workflow is real, but this capture is of what it used to be,
   and it must not be used to answer what the flow does now. That is a third state, and the
   whole point of separating it from the other two is that it needs a fresh export rather than
   a flow to build or a trigger to change. */
const registered = new Map(ids.endpoints.map((e) => [e.key, e]));
function resolveKey(key) {
  const entry = registered.get(key);
  if (!entry) return { state: 'unregistered' };
  const rec = deployed.find((d) => (d.internalName || '').toLowerCase() === String(entry.internalName || '').toLowerCase());
  if (!rec) return { state: 'no export', flowName: entry.flow, internalName: entry.internalName };
  const sameName = (rec.displayName || rec.flow || '').trim().toLowerCase() === String(entry.flow).trim().toLowerCase();
  return {
    state: sameName ? 'current' : 'export predates rename',
    flowName: entry.flow, internalName: entry.internalName, rec, exportedAs: rec.displayName || rec.flow,
  };
}

/* The one thing a trigger states about who may call it and how. `triggerAuthenticationType`
   absent is Power Automate's own default, which is tenant-authenticated — reported as such
   rather than as unknown, because an anonymous caller is refused either way. A `method` absent
   is genuinely unrestricted: the trigger answers every verb. */
function triggerOf(rec) {
  const def = definitionRoot(rec.doc);
  const [name, trig] = Object.entries(def?.triggers || {})[0] || [];
  const inputs = trig?.inputs || {};
  return {
    name: name || null,
    kind: trig?.kind || null,
    auth: inputs.triggerAuthenticationType || 'Tenant (default — not stated)',
    method: inputs.method || null,
  };
}

/* ── the keys ───────────────────────────────────────────────────────────────────────────
 * The portal's public contract keys, taken from the contract itself. The `_`-prefixed entries
 * are the estate's internal list shapes — rate limits, telemetry, the sequence counter, the
 * outbox — not endpoints anything calls, and they have no flow of their own by design. */
const portalKeys = contract.contracts.filter((c) => !c.key.startsWith('_'));

const rows = [];
for (const c of portalKeys) {
  const r = resolveKey(c.key);
  const row = {
    key: c.key,
    surface: 'portal',
    contractMethod: c.method || null,
    caller: 'document-portal (anonymous citizen — no tenant session)',
    flow: r.flowName || null,
    internalName: r.internalName || null,
    resolution: r.state,
    definition: r.rec?.file || null,
    exportedAtUtc: r.rec?.exportedAtUtc || null,
    exportedAs: r.exportedAs || null,
    declaredStatus: c.status || null,
    problems: [],
  };
  /* Only a CURRENT export may answer for the flow. An export taken before the rename describes
     a workflow that has since been rebuilt, and reading a trigger out of it would report the
     posture of something that no longer exists in that form. */
  if (r.state === 'current') {
    const t = triggerOf(r.rec);
    row.trigger = t;
    /* A portal endpoint is invoked by a stranger with no session. Anything but `All` refuses
       that caller at the door, however complete the flow behind it is. */
    if (t.auth !== 'All') {
      row.problems.push(`trigger authentication is ${t.auth} — the portal's caller is anonymous and cannot invoke it`);
    }
    /* A declared method is a restriction; no declared method is not. Only a stated method that
       disagrees with the contract's is a refusal. */
    if (t.method && row.contractMethod && t.method.toUpperCase() !== row.contractMethod.toUpperCase()) {
      row.problems.push(`trigger accepts ${t.method} only — the contract's caller sends ${row.contractMethod}`);
    }
  }
  rows.push(row);
}

/* SCAN_INTAKE is the one runtime key that is not a JSON contract: core/scan-intake-service.js
   PUTs raw bytes with the metadata in X-DGO-Filename / X-DGO-Sha256 / X-DGO-Size headers, so
   no EndpointContracts entry exists for it by design. A flow implementing it must read those
   headers; nothing else in an export identifies it. Searching the definitions for that header
   is therefore the whole test, and it is a search of the artefacts rather than of a register
   that could name a definition which does not do this. */
const SCAN_HEADER = /X-DGO-(?:Filename|Sha256|Size)/i;
const scanFlows = deployed.filter((d) => SCAN_HEADER.test(d.raw));
rows.push({
  key: 'SCAN_INTAKE',
  surface: 'runtime',
  contractMethod: 'PUT',
  caller: 'core/scan-intake-service.js#depositScan (registry officer, tenant session)',
  flow: scanFlows[0]?.displayName || null,
  internalName: scanFlows[0]?.internalName || null,
  resolution: scanFlows[0] ? 'current' : 'no flow',
  definition: scanFlows[0]?.file || null,
  exportedAtUtc: scanFlows[0]?.exportedAtUtc || null,
  exportedAs: null,
  declaredStatus: null,
  evidence: `no deployed definition references ${SCAN_HEADER.source}, and no register names a `
    + 'workflow for this key',
  problems: [],
});

/* The SAME trigger check the portal rows get. This row was pushed without one, so when
   SCAN_INTAKE went from unbuilt to deployed it reported IMPLEMENTED while its trigger declared
   POST and core/scan-intake-service.js PUTs — the identical mismatch flagged on UPLOAD two rows
   above, invisible only because this row took a different code path to the same table. A caller
   whose verb the trigger refuses is unreachable whichever surface it sits on. */
const scanRow = rows[rows.length - 1];
if (scanFlows[0]) {
  const t = triggerOf(scanFlows[0]);
  scanRow.trigger = t;
  if (t.method && scanRow.contractMethod && t.method.toUpperCase() !== scanRow.contractMethod.toUpperCase()) {
    scanRow.problems.push(`trigger accepts ${t.method} only — the contract's caller sends ${scanRow.contractMethod}`);
  }
  /* The inverse of the portal rule, and it is not symmetry for its own sake. A portal endpoint
     must be `All` because its caller is an anonymous citizen. SCAN_INTAKE must NOT be: it files
     into the central registry and mints a real reference, its caller is a signed-in officer, and
     it reads that officer's identity from the tenant principal header — which Power Automate
     does not populate unless the trigger is tenant-authenticated. `All` here makes the flow
     both open at the door and unable to identify anyone, so it refuses every caller. */
  if (t.auth === 'All') {
    scanRow.problems.push('trigger authentication is All — this flow reads its actor from the '
      + 'tenant principal header, which is not populated for an anonymous trigger, so every '
      + 'caller resolves to an empty identity and is refused. It must be Tenant.');
  }
}

/* UNIMPLEMENTED IS THE NARROW CLAIM, AND IT IS THE ONLY ONE THE BRIEF MAY MAKE.
   A key whose flow is identified but not currently exported is not unimplemented — the flow is
   in the tenant and the gap is a capture. Collapsing the two is precisely how the brief came to
   disclose two built endpoints as unbuilt. */
const unimplemented = rows.filter((r) => r.resolution === 'no flow' || r.resolution === 'unregistered').map((r) => r.key);
const notExported = rows.filter((r) => r.resolution === 'no export' || r.resolution === 'export predates rename');
const unreachable = rows.filter((r) => (r.resolution === 'current' || r.key === 'SCAN_INTAKE') && r.problems.length);

/* ── disclosure ─────────────────────────────────────────────────────────────────────────
 * The brief is what an external reviewer is handed. Its list of keys with no implementation is
 * parsed out and compared to the derivation above, so the disclosure cannot drift from the
 * estate in either direction — naming a key that exists steers a reviewer away from it, and
 * omitting one that does not presents a cleaner package than the estate is. */
const errors = [];
const briefText = text(BRIEF_PATH);
/* The claim is parsed from one declared line, not from the paragraph making it. The prose around
   it names UPLOAD, WRITEBACK, POST, PUT and half a dozen other capitalised identifiers while
   saying the opposite of what a naive scan would conclude from finding them, and a guard that
   has to be right about English is a guard that will one day be wrong about it. */
const declared = briefText.match(/^\s*keyimpl:unimplemented\s*=\s*(.*)$/m);
if (!declared) {
  errors.push(`${BRIEF_PATH}: no "keyimpl:unimplemented =" line found — the brief no longer `
    + 'states a position this can be checked against, which is itself the failure: the disclosed '
    + 'defect list is what an external reviewer is handed');
} else {
  const claimed = declared[1].split(/[,\s]+/).map((s) => s.trim().replace(/^`|`$/g, '')).filter(Boolean)
    .filter((s) => s.toLowerCase() !== 'none').sort();
  const derived = [...unimplemented].sort();
  if (claimed.join(',') !== derived.join(',')) {
    errors.push(`${BRIEF_PATH} declares ${claimed.join(', ') || '(none)'} as having no `
      + `implementation; the definitions say ${derived.join(', ') || '(none)'}`);
  }
}

/* A contract's own `status` is read the same way. The vocabulary is closed on purpose:
   scripts/verify-portal-data-contract.mjs filtered on the exact string 'SPECIFIED, NOT
   PROVISIONED', which no contract in this file has ever carried, so its not-provisioned report
   has never printed a line. A status this script does not recognise is a failure here rather
   than a silent skip, which is the same bug one layer up. */
const STATUS_MEANS_NO_FLOW = /\bno flow\b|\bnot provisioned\b|\bunbuilt\b/i;
const STATUS_MEANS_BUILT = /\bflow (?:exists|deployed)\b|\bdeployed\b/i;
for (const r of rows) {
  if (!r.declaredStatus) continue;
  const saysNoFlow = STATUS_MEANS_NO_FLOW.test(r.declaredStatus);
  const saysBuilt = STATUS_MEANS_BUILT.test(r.declaredStatus);
  if (!saysNoFlow && !saysBuilt) {
    errors.push(`${CONTRACT_PATH}: ${r.key} carries status "${r.declaredStatus}", which states `
      + 'neither that a flow exists nor that none does — this check cannot read it, and a status '
      + 'nothing can read is a status nothing enforces');
    continue;
  }
  if (saysNoFlow && r.flow) {
    errors.push(`${CONTRACT_PATH}: ${r.key} status says "${r.declaredStatus}" but ${r.flow} `
      + `(${r.internalName}) implements it${r.definition ? ` — ${r.definition}` : ''}`);
  }
  if (saysBuilt && !r.flow) {
    errors.push(`${CONTRACT_PATH}: ${r.key} status says "${r.declaredStatus}" but no flow is `
      + 'identified for it and no exported definition implements it');
  }
}

/* ── report ─────────────────────────────────────────────────────────────────────────── */
function stateOf(r) {
  if (r.resolution === 'no flow' || r.resolution === 'unregistered') return 'NO FLOW';
  if (r.resolution !== 'current') return 'NOT EXPORTED';
  return r.problems.length ? 'UNREACHABLE' : 'IMPLEMENTED';
}

if (flags.has('--json')) {
  console.log(JSON.stringify({
    rows: rows.map((r) => ({ ...r, state: stateOf(r) })),
    unimplemented, notExported: notExported.map((r) => r.key),
    unreachable: unreachable.map((r) => r.key), errors,
  }, null, 2));
  process.exit(errors.length && strict ? 1 : 0);
}

const MARK = { IMPLEMENTED: '✅', UNREACHABLE: '⚠️ ', 'NOT EXPORTED': '·', 'NO FLOW': '❌' };
console.log(`\nContract key implementation — ${rows.length} keys against ${deployed.length} exported definitions\n`);
for (const r of rows) {
  const state = stateOf(r);
  console.log(`  ${MARK[state]} ${state.padEnd(12)} ${r.key.padEnd(15)} ${r.flow || '—'}`);
  if (r.definition) console.log(`        ${r.definition} · exported ${r.exportedAtUtc || 'unknown'}`);
  if (r.trigger) console.log(`        trigger: ${r.trigger.method || 'any verb'}, auth ${r.trigger.auth}`);
  for (const p of r.problems) console.log(`        ⚠️  ${p}`);
  if (state === 'NOT EXPORTED') {
    console.log(`        workflow ${r.internalName} is in the tenant; ${r.exportedAs
      ? `the only export of it is as "${r.exportedAs}", taken before the rename`
      : 'this repository holds no export of it'}`);
  }
  if (state === 'NO FLOW' && r.evidence) console.log(`        ${r.evidence}`);
}

console.log('');
if (errors.length) {
  console.log(`  ❌ ${errors.length} document(s) disagree with the definitions:\n`);
  for (const e of errors) console.log(`      ${e}`);
  console.log('');
} else {
  console.log('  ✅ every document that states an implementation position agrees with the definitions\n');
}

console.log(`${errors.length && strict ? '❌' : '✅'} ${unimplemented.length} key(s) with no flow, `
  + `${notExported.length} identified but not currently exported, ${unreachable.length} implemented `
  + `but unreachable, ${errors.length} disclosure error(s)\n`);
process.exit(errors.length && strict ? 1 : 0);
