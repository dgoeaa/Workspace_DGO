#!/usr/bin/env node
/**
 * Reconcile the exported flow definitions against the tenant's endpoint register.
 *
 * WHY THIS EXISTS
 *
 * This repository holds two independent descriptions of the same Power Automate estate and,
 * until now, no way to relate them:
 *
 *   · `docs/reference/flow-contracts/deployed/` — flow definitions exported from the tenant.
 *     Each carries an `internal_name`: a 36-character Power Automate flow GUID.
 *   · `docs/reference/endpoint-register.json` — the tenant's endpoint register. Each record
 *     carries a `workflow_id`: a 32-hex Logic Apps workflow id.
 *
 * Those are different identifier spaces for the same object, and **not one of the exported
 * definitions carries an id the register knows**. So the obvious question — "is this exported
 * flow one of the register's workflows, or something else entirely?" — had no answer, and any
 * comparison between the two counts was a comparison of populations measured on different axes.
 *
 * This script answers what can be answered, and states plainly what cannot. It joins on
 * normalised display name, the only field the two share, and reports three groups:
 *
 *   matched      the register names this exported flow. The join is by name, so it is evidence,
 *                not proof: two flows may share a name, and a renamed flow breaks the link.
 *   unmatched    exported, but no register record names it. Either it is outside the register's
 *                scope, or it is the same flow under a different name. Nothing here can tell
 *                which, and that is the point.
 *   unexported   the register names it; no definition for it is held here.
 *
 * WHAT WOULD ACTUALLY FIX IT. A registry row carrying BOTH ids — which is what
 * `DGO_HTTPFlowRegistry` is for: `FlowId` plus `RegistryKey`, written once at registration.
 * Until that exists, this reconciliation is the best available and its limits are stated in
 * the output rather than left for a reader to discover.
 *
 *   npm run reconcile:definitions            # regenerate and report
 *   npm run reconcile:definitions -- --check # fail if the derived file has drifted (CI)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = path.join(ROOT, 'docs/reference/endpoint-register.json');
const DEPLOYED = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const OUT = path.join(ROOT, 'docs/reference/flow-definition-map.json');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

if (!fs.existsSync(REGISTER)) fail('docs/reference/endpoint-register.json is missing.');
const reg = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));

/* Names are compared with punctuation, spacing and case removed. The two corpora disagree on
   all three for the same flow — "01-Fetch_Docs_POST" against "01 - Fetch_Docs_POST" — and a
   join that fails on a hyphen would overstate the divergence this script exists to measure. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const registerByName = new Map();
for (const w of reg.complete_flow_registry || []) {
  for (const n of w.flow_names_and_keys || []) {
    const k = norm(n);
    if (!registerByName.has(k)) registerByName.set(k, []);
    registerByName.get(k).push(w);
  }
}

const boundKeys = new Map();   // workflow_id -> [contract keys]
for (const e of reg.current_configuration || []) {
  const k = e.workflow_id;
  if (!boundKeys.has(k)) boundKeys.set(k, []);
  boundKeys.get(k).push(String(e.key).replace(/^(DGO|PF)_ENDPOINT_/, ''));
}

/* ── read every exported definition ───────────────────────────────────────────────────── */

const definitions = [];
for (const file of fs.readdirSync(DEPLOYED).filter((f) => f.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(DEPLOYED, file), 'utf8'));
  const def = doc.definition || doc.properties?.definition || {};
  const triggers = Object.values(def.triggers || {});
  const http = triggers.filter((t) => t?.kind === 'Http');
  definitions.push({
    file,
    name: doc.workflow_identity?.tags?.flowDisplayName ?? file,
    internalName: doc.workflow_identity?.internal_name ?? null,
    exportedAtUtc: doc.exportedAtUtc ?? null,
    triggerKinds: [...new Set(triggers.map((t) => [t?.type, t?.kind].filter(Boolean).join('/')))],
    httpMethods: [...new Set(http.map((t) => t?.inputs?.method).filter(Boolean))],
    triggerAuthenticationType: [...new Set(http.map((t) => t?.inputs?.triggerAuthenticationType).filter(Boolean))],
  });
}

const matched = [];
const unmatched = [];
for (const d of definitions) {
  const hits = registerByName.get(norm(d.name)) || [];
  if (hits.length) {
    matched.push({
      ...d,
      registerWorkflowIds: hits.map((w) => w.workflow_id),
      ambiguous: hits.length > 1,
      servesKeys: hits.flatMap((w) => boundKeys.get(w.workflow_id) || []),
    });
  } else {
    unmatched.push(d);
  }
}

const matchedRegisterIds = new Set(matched.flatMap((m) => m.registerWorkflowIds));
const unexported = (reg.complete_flow_registry || [])
  .filter((w) => !matchedRegisterIds.has(w.workflow_id))
  .map((w) => ({
    workflowId: w.workflow_id,
    names: w.flow_names_and_keys || [],
    servesKeys: boundKeys.get(w.workflow_id) || [],
  }));

/* ── the derived file ─────────────────────────────────────────────────────────────────── */

const derived = {
  schema: 'dgo-flow-definition-map/v1',
  purpose:
    'Which exported flow definition corresponds to which tenant register workflow, joined on '
    + 'normalised display name because the two corpora carry different identifier spaces — a '
    + '36-character Power Automate flow GUID in the exports, a 32-hex workflow id in the '
    + 'register — and share no id. Derived by scripts/reconcile-flow-definitions.mjs; do not '
    + 'hand-edit.',
  generatedBy: 'scripts/reconcile-flow-definitions.mjs',
  limits: {
    joinField: 'normalised display name',
    idOverlap: 0,
    idOverlapNote:
      'Zero exported definitions carry an id the register knows. The join is therefore by name '
      + 'and is evidence rather than proof: two flows may share a name, and a rename breaks the '
      + 'link silently. A registry row carrying both ids — DGO_HTTPFlowRegistry.FlowId alongside '
      + 'RegistryKey — is what would replace this with a real join.',
  },
  totals: {
    exportedDefinitions: definitions.length,
    registerWorkflows: (reg.complete_flow_registry || []).length,
    contractKeys: (reg.current_configuration || []).length,
    matchedByName: matched.length,
    unmatchedExports: unmatched.length,
    unexportedRegisterWorkflows: unexported.length,
    ambiguousMatches: matched.filter((m) => m.ambiguous).length,
    exportsWithHttpTrigger: definitions.filter((d) => d.httpMethods.length || d.triggerKinds.some((k) => /\/Http$/.test(k))).length,
  },
  matched: matched.map(({ file, name, internalName, registerWorkflowIds, servesKeys, ambiguous }) => ({
    file, name, internalName, registerWorkflowIds, servesKeys, ambiguous,
  })),
  unmatchedExports: unmatched.map(({ file, name, internalName, triggerKinds, httpMethods, triggerAuthenticationType }) => ({
    file, name, internalName, triggerKinds, httpMethods, triggerAuthenticationType,
  })),
  unexportedRegisterWorkflows: unexported,
};

const rendered = JSON.stringify(derived, null, 2) + '\n';
const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

/* ── report ───────────────────────────────────────────────────────────────────────────── */

const t = derived.totals;
console.log('\nFlow definition reconciliation\n');
console.log(`  exported definitions      ${t.exportedDefinitions}`);
console.log(`  register workflows        ${t.registerWorkflows}   (serving ${t.contractKeys} contract keys)`);
console.log('');
console.log(`  matched by name           ${t.matchedByName}`);
console.log(`  exported, not in register ${t.unmatchedExports}`);
console.log(`  in register, not exported ${t.unexportedRegisterWorkflows}`);
if (t.ambiguousMatches) console.log(`  ambiguous (name reused)   ${t.ambiguousMatches}`);
console.log('');
console.log('  The two corpora share no identifier — 0 of the exported definitions carry an id');
console.log('  the register knows — so this join is by display name and is evidence, not proof.');
console.log('  A rename breaks it silently. See GOV-06.\n');

if (CHECK) {
  if (previous !== rendered) {
    fail(`${path.relative(ROOT, OUT)} has drifted. Run: npm run reconcile:definitions`);
  }
  console.log(`  ✅ ${path.relative(ROOT, OUT)} is current\n`);
  process.exit(0);
}

fs.writeFileSync(OUT, rendered);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)}\n`);
