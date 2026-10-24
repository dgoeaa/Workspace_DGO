#!/usr/bin/env node
/**
 * Is each portal endpoint wired to the portal estate, and does anything cross the boundary?
 *
 * WHY THIS EXISTS
 * Provisioning the columns proved the estate is there. It said nothing about whether any flow
 * uses it, and the flow export showed that almost none do: of the twelve provisioned lists,
 * one is read by one flow and the rest have no reader or writer at all, while the flows
 * actually serving portal traffic write somewhere else entirely.
 *
 * "Wired" is therefore a claim that needs checking on every run, not a state anyone can
 * remember being true. This reads docs/deployment/sharepoint/portal-wiring.json - which says
 * what each endpoint must do to which list - and checks it against the definitions exported
 * from the tenant. Every gap is named as an operation on a list, so the remediation is a list
 * of actions to add rather than a verdict to interpret.
 *
 * IT ALSO CHECKS THE BOUNDARY, WHICH MATTERS MORE
 * The portal flows are invoked by anonymous strangers with no session. The estate they may
 * touch is the twelve portal lists and nothing else; exactly one crossing into the internal
 * platform exists, ECM_DOCS_INTAKE, and it is tenant-authenticated and read-only. A portal
 * flow reading or writing the internal operations estate is a finding whether or not the
 * wiring is otherwise complete, so it is reported separately and first.
 *
 * Usage:
 *   node scripts/verify-portal-wiring.mjs           # human report
 *   node scripts/verify-portal-wiring.mjs --json    # machine-readable
 *   node scripts/verify-portal-wiring.mjs --strict  # exit 1 unless fully wired and clean
 *   node scripts/verify-portal-wiring.mjs <dir>     # check a directory of candidate definitions
 *
 * THE PACKAGES ARE MEASURED TOO, BECAUSE THE DEPLOYED SET IS ALWAYS ONE PASTE BEHIND
 * Everything above reads definitions exported FROM the tenant, which is the right source for
 * "what is running". It is the wrong source for "what is about to run": the seven portal
 * designer-paste packages are the next deployment, and until someone pastes them and exports
 * again this sweep cannot see a thing they do. That is not hypothetical - all seven read Flow
 * Configuration on the internal operations site, and this reported one crossing while seven more
 * were staged. So `packageBoundary` runs the same rule over the packages. A crossing found there
 * has not happened yet, which is the entire point: it is the only moment it is still cheap.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, readFlowFile } from './lib/flow-definition-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WIRING = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/sharepoint/portal-wiring.json'), 'utf8'));
const INDEX = JSON.parse(readFileSync(join(ROOT, 'docs/reference/sharepoint-list-index.json'), 'utf8'));
const SPEC = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/sharepoint/portal-field-spec.json'), 'utf8'));
/* Normally the definitions exported from the tenant. A directory can be named instead, which is
 * how a patched definition is checked BEFORE it is imported - the whole point of patching rather
 * than clicking is that the number moves on disk first. */
const dirArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DEPLOYED = dirArg ? resolve(dirArg) : join(ROOT, 'docs/reference/flow-contracts/deployed');

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

/* Only definitions exported from the tenant count. The 01-06 files in this repository are the
 * design, and checking the design against itself would report perfect wiring while the tenant
 * did something else - which is exactly the error this whole exercise started from. */
const allExports = [];
for (const file of walk(DEPLOYED)) {
  const rec = readFlowFile(file, INDEX);
  if (rec) allExports.push({ ...rec, file: relative(ROOT, file) });
}

/* A SUPERSEDED EXPORT MUST NEVER ANSWER FOR THE FLOW IT USED TO BE.
   Workflow df7ddff1 is in this directory twice: as ECM_DOCS_INTAKE, captured 2026-08-19 with two
   actions, and as CG_Upload_Endpoint, captured 2026-08-24 with nine. One flow, renamed and
   rebuilt in place. Matching on display name found BOTH, so the bridge check answered
   `readsPortalRegistry: true` off the 2026-08-19 copy while the live export of that same workflow
   performs no Portal Registry read at all — a green check reporting the health of a flow that no
   longer exists in that form. Where one internal name has several exports the latest is the flow;
   the rest are history and are set aside here, with what was dropped reported so the resolution is
   visible rather than silent. */
const byInternal = new Map();
for (const r of allExports) {
  const id = r.internalName || `file:${r.file}`;
  const prev = byInternal.get(id);
  if (!prev || String(r.exportedAtUtc || '') > String(prev.exportedAtUtc || '')) byInternal.set(id, r);
}
const deployed = [...byInternal.values()];
const supersededExports = allExports
  .filter((r) => !deployed.includes(r))
  .map((r) => ({ internalName: r.internalName, supersededFile: r.file, exportedAtUtc: r.exportedAtUtc,
    liveExport: deployed.find((d) => d.internalName === r.internalName)?.file || null,
    liveExportedAtUtc: deployed.find((d) => d.internalName === r.internalName)?.exportedAtUtc || null }));

/* Every provisioned portal list, whether or not an endpoint names it. Taken from the field
   specification rather than from a hand-kept list here, so a newly provisioned list is inside
   the boundary from the moment it exists. */
const portalGuids = new Map();
for (const l of SPEC.lists) {
  if (l.estate === 'Document portal') portalGuids.set(String(l.listGuid).toLowerCase(), l.listTitle);
}
for (const e of WIRING.endpoints) for (const o of e.requiredOperations) portalGuids.set(o.listGuid.toLowerCase(), o.list);

/* Derived, not asserted. This was a hardcoded array in the specification and went stale the
   moment WRITEBACK began writing Portal Audit Events — the same failure mode as the catch-scope
   name list. A provisioned portal list is unwired when no endpoint's required operations name it
   and the designed bridge does not read it. */
const namedLists = new Set(WIRING.endpoints.flatMap((e) => e.requiredOperations.map((o) => o.list)));
if (WIRING.bridge?.list) namedLists.add(WIRING.bridge.list);
const unwiredLists = SPEC.lists
  .filter((l) => l.estate === 'Document portal')
  .map((l) => l.listTitle)
  .filter((t) => !namedLists.has(t));

const byName = new Map(deployed.map((d) => [(d.displayName || d.flow || '').trim(), d]));
const findFlow = (name) => byName.get(name.trim())
  || deployed.find((d) => (d.displayName || '').trim().toLowerCase() === name.trim().toLowerCase());

/* ── boundary ───────────────────────────────────────────────────────────────────────────── */
const boundary = [];
for (const e of WIRING.endpoints) {
  const allowedOutside = new Set((e.alsoWrites || []).map((a) => a.target));
  for (const name of e.deployedFlowCandidates) {
    const f = findFlow(name);
    if (!f) continue;
    for (const r of f.references) {
      if (!r.listGuid || portalGuids.has(r.listGuid.toLowerCase())) continue;
      if (r.listTitle && allowedOutside.has(r.listTitle)) continue;
      boundary.push({ endpoint: e.endpoint, flow: name, site: r.site, list: r.listTitle, operation: r.operation });
    }
  }
}

/* ── the same boundary rule, over the packages not yet pasted ──────────────────────────── */
const PKG_DIR = join(ROOT, 'docs/deployment/sharepoint/flows/designer-paste');
/* The package file name carries the endpoint: Portal_STATUS_ECM_DOCS -> STATUS. Derived rather
   than mapped by hand, so a new package is measured the day it is generated. */
const endpointOf = (file) => file.replace(/^Portal_/, '').replace(/_ECM_DOCS\.designer-paste\.json$/, '');
const packageBoundary = [];
if (existsSync(PKG_DIR)) {
  for (const file of readdirSync(PKG_DIR).filter((f) => f.startsWith('Portal_') && f.endsWith('.designer-paste.json'))) {
    const endpoint = endpointOf(file);
    const e = WIRING.endpoints.find((x) => x.endpoint === endpoint);
    const allowedOutside = new Set((e?.alsoWrites || []).map((a) => a.target));
    const sv = JSON.parse(readFileSync(join(PKG_DIR, file), 'utf8')).serializedValue;
    const seen = new Set();
    (function walkActions(actions) {
      for (const v of Object.values(actions || {})) {
        if (!v || typeof v !== 'object') continue;
        const guid = String(v.inputs?.parameters?.table || '').toLowerCase();
        if (guid && !portalGuids.has(guid)) {
          const l = INDEX.lists[guid];
          const op = /^(PostItem|PatchItem|DeleteItem)$/.test(v.inputs?.host?.operationId || '') ? 'write' : 'read';
          const title = l?.title || guid;
          if (!allowedOutside.has(title) && !seen.has(title + op)) {
            seen.add(title + op);
            packageBoundary.push({ endpoint, package: file.replace('.designer-paste.json', ''),
              site: (l?.siteUrl || '').split('/').pop(), list: title, listGuid: guid, operation: op });
          }
        }
        walkActions(v.actions); walkActions(v.else?.actions);
        if (v.cases) for (const c of Object.values(v.cases)) walkActions(c.actions);
        walkActions(v.default?.actions);
      }
    })(sv.actions);
  }
}

/* ── wiring ─────────────────────────────────────────────────────────────────────────────── */
const results = [];
for (const e of WIRING.endpoints) {
  const present = new Set();
  const seen = [];
  for (const name of e.deployedFlowCandidates) {
    const f = findFlow(name);
    if (!f) continue;
    seen.push(name);
    for (const r of f.references) {
      if (r.listGuid) present.add(`${r.listGuid.toLowerCase()}|${r.operation}`);
    }
  }
  const missing = e.requiredOperations.filter((o) => !present.has(`${o.listGuid.toLowerCase()}|${o.operation}`));
  results.push({
    endpoint: e.endpoint,
    deployedFlowsFound: seen,
    deployedFlowsMissing: e.deployedFlowCandidates.filter((n) => !seen.includes(n)),
    required: e.requiredOperations.length,
    satisfied: e.requiredOperations.length - missing.length,
    missing,
  });
}

const totals = {
  endpoints: results.length,
  requiredOperations: results.reduce((n, r) => n + r.required, 0),
  satisfiedOperations: results.reduce((n, r) => n + r.satisfied, 0),
  endpointsFullyWired: results.filter((r) => r.missing.length === 0).length,
  boundaryCrossings: boundary.length,
  unwiredLists: unwiredLists.length,
  deployedDefinitionsRead: deployed.length,
  supersededExportsSetAside: supersededExports.length,
  packageBoundaryCrossings: packageBoundary.length,
};

const bridge = findFlow(WIRING.bridge.flow);
const bridgeOk = Boolean(bridge) && bridge.references.some(
  (r) => r.listTitle === 'Portal Registry' && r.operation === 'read');

if (flags.has('--json')) {
  console.log(JSON.stringify({ totals, bridge: { flow: WIRING.bridge.flow, present: Boolean(bridge), readsPortalRegistry: bridgeOk }, boundary, packageBoundary, supersededExports, results, unwiredLists: WIRING.unwiredLists }, null, 2));
} else {
  console.log(`\nPortal wiring - ${deployed.length} deployed definition(s), wiring spec ${WIRING.wiringVersion}\n`);

  if (boundary.length) {
    console.log(`  BOUNDARY - ${boundary.length} crossing(s). A portal endpoint is invoked by anonymous`);
    console.log('  callers; these reach outside the twelve portal lists:');
    const seen = new Set();
    for (const b of boundary) {
      const k = `${b.flow}|${b.list}|${b.operation}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`      ${b.endpoint.padEnd(15)} ${b.flow.padEnd(28)} ${b.operation.padEnd(11)} ${b.site}/${b.list}`);
    }
    console.log('');
  } else {
    console.log('  BOUNDARY - clean. No portal flow touches a list outside the portal estate.\n');
  }

  for (const r of results) {
    const mark = r.missing.length === 0 ? 'WIRED  ' : 'PARTIAL';
    console.log(`  ${mark} ${r.endpoint.padEnd(15)} ${r.satisfied}/${r.required} operation(s)`);
    if (r.deployedFlowsFound.length) console.log(`          flows read: ${r.deployedFlowsFound.join(', ')}`);
    if (r.deployedFlowsMissing.length) console.log(`          not exported: ${r.deployedFlowsMissing.join(', ')}`);
    for (const m of r.missing) console.log(`          missing: ${m.operation.padEnd(7)} ${m.site}/${m.list}`);
  }

  console.log(`\n  BRIDGE  ${WIRING.bridge.flow} ${bridgeOk ? 'reads Portal Registry - the one designed crossing is in place' : 'NOT FOUND or not reading Portal Registry'}`);

  /* Derived, not asserted. This was a hardcoded array in the specification, and it went stale
     the moment WRITEBACK was added and began writing Portal Audit Events — the same failure as
     the catch-scope name list. A list is unwired when no endpoint's required operations name it. */
  if (unwiredLists.length) {
    console.log(`\n  ${unwiredLists.length} provisioned list(s) with no reader or writer in the design:`);
    for (const u of unwiredLists) console.log(`      ${u}`);
  }

  console.log(`\n  ${totals.satisfiedOperations}/${totals.requiredOperations} required operations in place, ${totals.endpointsFullyWired}/${totals.endpoints} endpoints fully wired.\n`);
}

if (flags.has('--strict') && (totals.satisfiedOperations < totals.requiredOperations || boundary.length || packageBoundary.length)) process.exit(1);
