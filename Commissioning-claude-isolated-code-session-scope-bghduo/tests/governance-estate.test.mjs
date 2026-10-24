#!/usr/bin/env node
/**
 * The governance estate: does what provisions it agree with what consumes it?
 *
 * WHY THIS SUITE EXISTS
 *
 * The governance structure brought two sets of SharePoint lists into the estate:
 *
 *   · 10 governance lists — identity, RBAC, audit, pending writes, access scopes, and an
 *     endpoint registry — specified in `docs/reference/sharepoint-provisioning-spec.json`.
 *   · 7 HTTP flow registry lists on `DGO_ECM_GOVERNANCE`, specified in
 *     `docs/reference/http-flow-registry-spec.json`, not yet provisioned.
 *
 * Neither set introduces a browser-callable endpoint: the flows that create them are
 * button-triggered provisioning scopes using the SharePoint and Outlook connectors, so no new
 * contract key, trigger URL or signature enters the estate through them. The endpoint audit did
 * not need to widen. **The list estate did**, and this suite is that widening.
 *
 * WHAT IT CAUGHT, AND WHY IT IS THE SAME DEFECT CLASS AS THE REST
 *
 * The portal provisioning path was deliberately hardened against title-based creation:
 * `portal-field-spec.json` addresses every list by GUID precisely so "a typo can never produce
 * a duplicate list", and `docs/deployment/sharepoint/README.md` warns that the superseded
 * name-based artefacts would "add duplicates alongside the twelve real ones".
 *
 * The governance path did not inherit that. It creates by title against `_api/web/lists`, and
 * the 2026-08-18 capture shows the result: all 10 lists exist on TWO site collections, and 7 of
 * them additionally carry a `_2` copy — SharePoint's own disambiguation when a list of that
 * title already exists. That is the signature of a title-based provisioning flow run more than
 * once, or run against the wrong site.
 *
 * Worse than the duplication is the direction. The provisioning spec targets
 * `NITDADGO-EAAACTIVITYTRACKING`. The internal flows read and write the same lists by GUID on
 * `DGO_ECM_GOVERNANCE`. Provisioning and consumption point at different site collections, so
 * seeding a role catalogue or enrolling a pilot user through the specified path populates lists
 * that nothing reads — and every symptom of that is silence, not an error. It is the list-estate
 * form of the fault this repository keeps producing: a check that verifies shape while the
 * meaning is wrong.
 *
 * This suite cannot repair a tenant. It makes the divergence visible, counted and named, so it
 * cannot be rediscovered a third time, and it fails if the numbers move without the estate's
 * position moving with them.
 *
 * Usage:  node tests/governance-estate.test.mjs
 * Exit:   0 = the recorded position matches the evidence, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const GOVERNANCE_LISTS = [
  'DGO_UserDirectory', 'DGO_RoleCatalogue', 'DGO_UserRoleHistory', 'DGO_AuditLog',
  'DGO_PendingWrites', 'DGO_DepartmentDirectory', 'DGO_AccessScopes', 'DGO_PilotCohorts',
  'DGO_EndpointRegistry', 'DGO_AccessEvents',
];

const FLOW_REGISTRY_LISTS = [
  'DGO_HTTPFlowRegistry', 'DGO_HTTPFlowContractVersions', 'DGO_HTTPFlowExecutionLedger',
  'DGO_HTTPFlowDependencies', 'DGO_HTTPFlowRegistryExceptions',
  'DGO_HTTPFlowRegistryConfiguration', 'DGO_HTTPFlowConsumerRegistry',
];

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── the evidence ─────────────────────────────────────────────────────────────────────── */

const spec = J('docs/reference/sharepoint-provisioning-spec.json');
const registrySpec = J('docs/reference/http-flow-registry-spec.json');
const index = J('docs/reference/sharepoint-list-index.json');

const liveLists = Object.entries(index.lists).map(([guid, l]) => ({ guid, ...l }));
const siteOf = (l) => String(l.serverRelativeUrl || '').split('/sites/')[1]?.split('/')[0] || '(unknown)';

/** Every live instance whose title is the list, or the list plus SharePoint's `_2` suffix. */
const instancesOf = (title) => liveLists.filter((l) => l.title === title || l.title === `${title}_2`);

const specTargetOf = (title) => {
  const row = (spec.lists || []).find((l) => l.ListTitle === title);
  return row ? String(row.TargetSite || '').split('/sites/')[1] : null;
};

/**
 * Which site the internal flows actually address each list on.
 *
 * Read from the preflight browser script, which carries the GUID, title and site URL of every
 * list the internal flows touch — the consuming side of the estate, stated where the flows are
 * checked rather than where they are specified.
 */
const preflight = fs.readFileSync(path.join(ROOT, 'scripts/preflight-internal-flows.browser.js'), 'utf8');
const consumedSite = new Map();
for (const m of preflight.matchAll(
  /"guid":\s*"([0-9a-f-]{36})",\s*\n\s*"title":\s*"([^"]+)",\s*\n\s*"siteUrl":\s*"([^"]+)"/g)) {
  consumedSite.set(m[2], String(m[3]).split('/sites/')[1]);
}

const position = J('docs/reference/governance-estate-position.json');

console.log(`\nGovernance estate — capture ${index.capturedUtc}, ${index.totals.lists} lists across ${index.totals.sites} sites\n`);

/* ── the governance structure adds lists, not endpoints ───────────────────────────────── */

/**
 * The eight governance flow definitions, as imported from the tenant packages.
 *
 * This file previously asserted that the governance structure introduced no HTTP endpoint at
 * all. That was true of the first snapshot — every governance flow was a button-triggered
 * provisioning scope — and it stopped being true when the updated packages arrived: four of the
 * eight declare an HTTP POST trigger. An assertion that encodes a convenient fact rather than a
 * checked one is exactly how an audit goes stale, so the trigger posture is now read from the
 * definitions on every run and compared against what the estate has recorded.
 */
const GOV_PREFIX = /^0\d - GOV - /;
const deployedDir = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const governanceFlows = fs.readdirSync(deployedDir)
  .filter((f) => GOV_PREFIX.test(f) && f.endsWith('.json'))
  .map((f) => {
    const doc = JSON.parse(fs.readFileSync(path.join(deployedDir, f), 'utf8'));
    const def = doc.definition || {};
    const triggers = Object.values(def.triggers || {});
    return {
      file: f,
      name: doc.workflow_identity?.tags?.flowDisplayName || f,
      guid: doc.workflow_identity?.internal_name,
      httpTriggers: triggers.filter((t) => t.kind === 'Http'),
      def,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Every action at any depth, so a Response buried in a scope is still found. */
function allActions(actions, out = []) {
  for (const a of Object.values(actions || {})) {
    out.push(a);
    if (a.actions) allActions(a.actions, out);
    if (a.else?.actions) allActions(a.else.actions, out);
  }
  return out;
}

check('the imported governance flows are the eight the packages carry', () => {
  assert(governanceFlows.length === 8,
    `${governanceFlows.length} governance flow definition(s) are imported; the packages carry 8`);
});

check('the HTTP-triggered governance flows are exactly the ones on record', () => {
  const live = governanceFlows.filter((f) => f.httpTriggers.length).map((f) => f.name).sort();
  const recorded = position.endpointImpact.httpTriggeredFlows.map((f) => f.flow).sort();
  assert(JSON.stringify(live) === JSON.stringify(recorded),
    'the set of HTTP-triggered governance flows has changed.\n'
    + `      on record: ${recorded.join(', ') || '(none)'}\n`
    + `      in the definitions: ${live.join(', ') || '(none)'}\n`
    + '      Each is an endpoint carrying a signature: it belongs in the rotation scope and in\n'
    + '      any inventory claiming to cover the estate. Update endpointImpact, or the estate.');
  assert(position.endpointImpact.newHttpTriggeredFlows === live.length,
    `endpointImpact.newHttpTriggeredFlows says ${position.endpointImpact.newHttpTriggeredFlows}, the definitions show ${live.length}`);
});

check('the recorded trigger posture of each matches its definition', () => {
  const wrong = [];
  for (const rec of position.endpointImpact.httpTriggeredFlows) {
    const f = governanceFlows.find((g) => g.name === rec.flow);
    if (!f) { wrong.push(`${rec.flow}: no imported definition`); continue; }
    for (const t of f.httpTriggers) {
      if (String(t.inputs?.method).toUpperCase() !== String(rec.method).toUpperCase()) {
        wrong.push(`${rec.flow}: recorded ${rec.method}, definition says ${t.inputs?.method}`);
      }
      if (t.inputs?.triggerAuthenticationType !== rec.triggerAuthenticationType) {
        wrong.push(`${rec.flow}: recorded auth ${rec.triggerAuthenticationType}, definition says ${t.inputs?.triggerAuthenticationType}`);
      }
    }
  }
  assert(wrong.length === 0, `${wrong.length} posture mismatch(es):\n      ${wrong.join('\n      ')}`);
});

check('GOV-04 still describes what the definitions do — no reachable Response on any of the four', () => {
  /* Reachability, not presence. `05 - GOV - Retire HTTP Flow` HAS a Response action; it runs
     after a scope whose every path ends in a Terminate, so it never executes. Asserting only
     that a Response exists would have called that one fixed. */
  /* A Terminate ends the whole run, so nothing downstream of one executes — and "downstream"
     is transitive. In 05 the Response sits six hops past the scope (Scope → Key → Compose →
     Find → If_Found → Reply), which a one-hop check reads as reachable. Walk the chain. */
  const alwaysTerminates = (a) => {
    if (!a) return false;
    if (a.type === 'Terminate') return true;
    if (a.type === 'If') {
      const t = Object.values(a.actions || {}).some(alwaysTerminates);
      const e = Object.values(a.else?.actions || {}).some(alwaysTerminates);
      return t && e;                      // both branches end the run
    }
    if (a.type === 'Scope') return Object.values(a.actions || {}).some(alwaysTerminates);
    return false;
  };
  const withReachableResponse = [];
  for (const f of governanceFlows.filter((g) => g.httpTriggers.length)) {
    const top = f.def.actions || {};
    const unreachable = (name, seen = new Set()) => {
      if (seen.has(name)) return false;
      seen.add(name);
      return Object.keys(top[name]?.runAfter || {})
        .some((dep) => alwaysTerminates(top[dep]) || unreachable(dep, seen));
    };
    for (const [name, a] of Object.entries(top)) {
      if (a.type === 'Response' && !unreachable(name)) withReachableResponse.push(`${f.name}.${name}`);
    }
  }
  const stillOpen = position.openFindings.some((x) => x.id === 'GOV-04');
  if (withReachableResponse.length && stillOpen) {
    throw new Error(
      `${withReachableResponse.length} governance endpoint(s) now reply on a reachable path — `
      + `${withReachableResponse.join(', ')}. Good: close or narrow GOV-04 in `
      + 'docs/reference/governance-estate-position.json so the record stops reporting work that is done.');
  }
  assert(stillOpen || withReachableResponse.length,
    'GOV-04 has been closed but no governance endpoint has a reachable Response action — '
    + 'the callers still cannot tell acceptance from rejection');
});

check('GOV-05 still describes what the retirement flow does — an unguarded cascade', () => {
  const f = governanceFlows.find((g) => /Retire HTTP Flow/.test(g.name));
  assert(f, 'the retirement flow definition is no longer imported');
  const names = Object.keys(f.def.actions?.Scope_05_GOV_Retire_HTTP_Flow_COMPLETE_UPDATED?.actions?.Scope_Main?.actions || {});
  const cascades = ['Retire_Consumers', 'Retire_Dependencies'].filter((n) => names.includes(n));
  /* The documented control is to REFUSE when active consumers or dependencies remain. A guard
     would show up as a condition or terminate between finding them and retiring them. */
  const guarded = names.some((n) => /^(If|Check|Block|Refuse)_.*(Consumer|Dependenc)/i.test(n));
  const stillOpen = position.openFindings.some((x) => x.id === 'GOV-05');
  if (guarded && stillOpen) {
    throw new Error('the retirement flow now guards the cascade — close or narrow GOV-05');
  }
  assert(!stillOpen || cascades.length === 2,
    `GOV-05 records an unguarded cascade over consumers and dependencies, but the flow now has `
    + `only: ${cascades.join(', ') || 'neither'}. Re-read the definition and update the record.`);
});

check('the flow registry lists are specified but not provisioned, and the capture agrees', () => {
  const present = FLOW_REGISTRY_LISTS.filter((t) => instancesOf(t).length);
  assert(registrySpec.totals.lists === FLOW_REGISTRY_LISTS.length,
    `the spec declares ${registrySpec.totals.lists} lists; this suite knows ${FLOW_REGISTRY_LISTS.length}`);
  assert(present.length === 0,
    `${present.length} flow registry list(s) now exist in the capture — ${present.join(', ')}. `
    + 'The spec states they are not provisioned; one of the two is now out of date.');
});

check('the flow registry records a redacted endpoint and a fingerprint, never a signed URL', () => {
  /* This is the design the older DGO_EndpointRegistry did not get, and the reason this suite
     asserts it: a signed trigger URL IS the credential, so a list field that holds one hands it
     to everyone with read access to the list. */
  const byName = new Map(registrySpec.fields.map((f) => [`${f.listTitle}.${f.internalName}`, f]));
  assert(byName.has('DGO_HTTPFlowRegistry.EndpointRedacted'),
    'the registry no longer carries EndpointRedacted — check nothing replaced it with a raw URL');
  assert(byName.has('DGO_HTTPFlowRegistry.EndpointFingerprint'),
    'the registry no longer carries EndpointFingerprint');
  const raw = registrySpec.fields.filter((f) =>
    /^(FlowUrl|EndpointUrl|TriggerUrl|Url|Signature|Sig)$/i.test(f.internalName));
  assert(raw.length === 0,
    `${raw.length} field(s) in the flow registry would hold a raw endpoint or signature: `
    + `${raw.map((f) => `${f.listTitle}.${f.internalName}`).join(', ')}. A signed trigger URL is a `
    + 'bearer credential; store the redacted form and a fingerprint.');
});

/* ── the finding: provisioned in one place, consumed in another ───────────────────────── */

/*
 * These two assertions describe a TENANT state this repository cannot repair, so they are
 * written against the recorded position rather than against zero. Asserting zero would leave a
 * gate that can never go green — which is the fault this estate has already produced once, in a
 * rotation register that reported completed work as outstanding forever.
 *
 * So: reality must match `governance-estate-position.json`. It goes red when the divergence
 * widens (a new list duplicated, a new consumer on the wrong site) AND when it is repaired,
 * because a fixed estate with a stale record is also a disagreement. Either way the message
 * says which way it moved and what to update.
 */
/* BOTH COLLECTIONS, BECAUSE THE QUESTION IS "IS IT RECORDED", NOT "IS IT OPEN".
 *
 * This read `openFindings` alone, which made closing a finding break every assertion written
 * against it — so GOV-08 sat in `openFindings` carrying `closedUtc: 2026-09-09` and
 * `tenantStatus: "RESOLVED IN THE TENANT"`, and `npm run commission` printed it to operators as
 * `STILL TO DO IN THE TENANT: RESOLVED IN THE TENANT.` A record that costs you a test to close is
 * a record nobody closes.
 *
 * What these assertions actually use is the finding's evidence — `divergentLists`, `collisions`,
 * `renamesApplied` — and none of that stops being true when the work is done. The guard they
 * provide (emptying `collisions` would close a finding on paper) works just as well from
 * `closedFindings`. */
const finding = (id) => {
  const f = position.openFindings.find((x) => x.id === id)
    ?? (position.closedFindings ?? []).find((x) => x.id === id);
  assert(f, `${id} is no longer recorded in governance-estate-position.json`);
  return f;
};

check('the provisioned site and the consumed site diverge exactly where the record says', () => {
  const mismatched = [];
  for (const title of GOVERNANCE_LISTS) {
    const consumed = consumedSite.get(title);
    if (!consumed) continue;                  // not addressed by the internal flows
    const target = specTargetOf(title);
    if (target && target !== consumed) mismatched.push(title);
  }
  const recorded = finding('GOV-01').divergentLists;
  const unexpected = mismatched.filter((t) => !recorded.includes(t));
  const repaired = recorded.filter((t) => !mismatched.includes(t));
  assert(unexpected.length === 0,
    `${unexpected.length} governance list(s) diverge that the record does not name: `
    + `${unexpected.join(', ')}. Each is provisioned to one site collection and read from `
    + 'another, so seeding it populates a list nothing reads and the symptom is silence rather '
    + 'than an error. Fix the estate, or add them to GOV-01 with an owner.');
  assert(repaired.length === 0,
    `${repaired.length} list(s) recorded as divergent now agree: ${repaired.join(', ')}. `
    + 'Good — close them out of GOV-01 in docs/reference/governance-estate-position.json so the '
    + 'record stops reporting work that is done.');
});

check('the duplicate list instances are exactly the ones on record', () => {
  const duplicated = GOVERNANCE_LISTS
    .map((t) => ({ title: t, at: instancesOf(t).map((l) => `${siteOf(l)}${l.title.endsWith('_2') ? '/_2' : ''}`) }))
    .filter((r) => r.at.length > 1);
  const suffixed = GOVERNANCE_LISTS.filter((t) => liveLists.some((l) => l.title === `${t}_2`));
  const f = finding('GOV-02');
  assert(duplicated.length === f.duplicatedLists,
    `${duplicated.length} governance list(s) exist in more than one place; the record says `
    + `${f.duplicatedLists}:\n      `
    + duplicated.map((r) => `${r.title}  →  ${r.at.join(', ')}`).join('\n      ')
    + '\n\n      A `_2` suffix is SharePoint disambiguating a title that already existed — the'
    + '\n      signature of a title-based provisioning flow run twice, or against the wrong site.'
    + '\n      A flow writing DGO_AuditLog and one reading DGO_AuditLog_2 both succeed and neither'
    + '\n      sees the other. Update GOV-02, or repair the estate and then update it.');
  assert(JSON.stringify([...suffixed].sort()) === JSON.stringify([...f.withSuffixedCopy].sort()),
    `the lists carrying a _2 copy have changed.\n      now on record: ${f.withSuffixedCopy.join(', ')}`
    + `\n      in the capture: ${suffixed.join(', ')}`);
});

check('GOV-06 still describes the join — the two corpora share no identifier', () => {
  /* The numbers in the record are the ones an earlier recommendation got wrong, by setting the
     exported-definition count against the register's workflow count as though one contained the
     other. Held here so the same mistake cannot be made from a stale memory of the figures. */
  const map = J('docs/reference/flow-definition-map.json');
  const f = finding('GOV-06');
  const m = f.measured;
  const live = {
    exportedDefinitions: map.totals.exportedDefinitions,
    registerWorkflows: map.totals.registerWorkflows,
    matchedByName: map.totals.matchedByName,
    unmatchedExports: map.totals.unmatchedExports,
    unexportedRegisterWorkflows: map.totals.unexportedRegisterWorkflows,
    idOverlap: map.limits.idOverlap,
  };
  const drift = Object.keys(m).filter((k) => m[k] !== live[k]);
  assert(drift.length === 0,
    `${drift.length} figure(s) in GOV-06 no longer match the reconciliation:\n      `
    + drift.map((k) => `${k}: recorded ${m[k]}, measured ${live[k]}`).join('\n      ')
    + '\n      Run npm run reconcile:definitions, then update GOV-06.');
  assert(live.idOverlap === 0 || !position.openFindings.some((x) => x.id === 'GOV-06'),
    'exported definitions now carry register ids — the corpora can be joined properly. '
    + 'Close GOV-06 and retire the name-based map.');
});

/**
 * SharePoint reserved field names.
 *
 * `ScopeId` is a system field on every SharePoint list — it holds the item's security scope.
 * The provisioning specification declares a custom Text column of the same name, so the live
 * run's "is there a field called ScopeId?" check answered yes against SharePoint's own hidden
 * field, reported the column present, never created the real one, and then failed on both
 * operations that touched it: indexing a system field returns 500, and filtering a Guid-typed
 * system field against the string 'all' returns 500 "List does not exist."
 *
 * The tenant's actual custom column is called "Access Scope Id" — visible in the list view, and
 * a different field entirely. Two more collisions are in the same specification.
 *
 * This list is the reserved names that can appear on an ordinary custom list. It is not
 * exhaustive for libraries, and does not need to be: what it must catch is a specification field
 * that SharePoint will never let the estate own.
 *
 * `Version` IS NOT ONE, and was in this list until the tenant said otherwise. It was added on the
 * strength of the ScopeId finding rather than checked, and DGO_RoleCatalogue.Version and
 * DGO_EndpointRegistry.Version both turned out to be ordinary custom columns — FromBaseType=false,
 * CanBeDeleted=true — fully populated and working. SharePoint's own version field is
 * `_UIVersionString`. A name goes in this list because it was observed to collide, never because
 * it resembles one that did: a false entry here forces a rename, and a rename of a populated
 * column is a data migration.
 */
const SP_RESERVED_FIELDS = new Set([
  'ID', 'Title', 'Created', 'Modified', 'Author', 'Editor', 'Attachments', 'GUID', 'Order',
  'ScopeId', 'UniqueId', 'FileRef', 'FileLeafRef', 'FileDirRef', 'ContentType', 'ContentTypeId',
  'Level', 'WorkflowVersion', 'ItemChildCount', 'FolderChildCount', 'AppAuthor',
  'AppEditor', 'ComplianceAssetId', 'InstanceID', 'WorkflowInstanceID', 'ProgId', 'SyncClientId',
  'MetaInfo', 'owshiddenversion', 'FSObjType', 'PermMask', 'CheckoutUser', 'LinkTitle',
  'LinkTitleNoMenu', 'DocIcon', 'ServerUrl', 'EncodedAbsUrl', 'BaseName', 'Edit', 'Combine',
  '_UIVersion', '_UIVersionString', '_ModerationStatus', '_ModerationComments', '_Level',
  '_IsCurrentVersion', '_HasCopyDestinations', '_CopySource', '_CheckinComment', '_CommentCount',
]);

check('the provisioning spec claims no field name SharePoint reserves', () => {
  /* Not "the collisions still match what we recorded" — that version of this assertion went green
     while three columns were still uncreatable. The spec must carry NONE. */
  const spec = J('docs/reference/sharepoint-provisioning-spec.json');
  const clashes = (spec.fields || [])
    .filter((f) => SP_RESERVED_FIELDS.has(f.InternalName))
    .map((f) => `${f.ListTitle}.${f.InternalName}`);
  assert(clashes.length === 0,
    `${clashes.length} specification field(s) use a name SharePoint reserves: ${clashes.join(', ')}\n`
    + '      Such a field is never created, and the provisioner reports it present against the\n'
    + '      system field of that name. Rename it: npm run governance:correctfields');

  /* Every collision GOV-08 recorded must have a rename behind it. Without this, emptying the
     collisions list would satisfy the assertion above and close the finding on paper. */
  const gov08 = finding('GOV-08');
  const renames = (gov08?.renamesApplied ?? []).join(' ');
  const unrenamed = (gov08?.collisions ?? []).filter((c) => !renames.includes(c));
  assert(unrenamed.length === 0,
    `GOV-08 records ${unrenamed.length} collision(s) with no rename applied: ${unrenamed.join(', ')}`);

  /* And the renames must be the ones actually in the spec, not a description of them. */
  for (const line of gov08?.renamesApplied ?? []) {
    const to = /→ (\w+)/.exec(line)?.[1];
    const list = /^([\w]+)\./.exec(line)?.[1];
    assert((spec.fields || []).some((f) => f.ListTitle === list && f.InternalName === to),
      `GOV-08 claims ${list}.${to} but the specification has no such field`);
  }
});

check('every field\'s SchemaXml names the field the specification says it is', () => {
  /* SharePoint reads three names out of the SchemaXml, and `createfieldasxml` is called with
     Options 24 — 8 of which is AddFieldInternalNameHint, meaning the INTERNAL name comes from
     the `Name` attribute. A field whose JSON says AccessScopeId while its SchemaXml says
     Name='ScopeId' is created under the reserved name and reported CREATED.

     That is exactly what happened: the rename used `/Name='[^']*'/`, which has no left
     boundary, so it matched the tail of DisplayName instead — collapsing 'Catalogue Version'
     to 'CatalogueVersion' and leaving Name='Version' in place. Three columns went to the
     tenant that way before this assertion existed. It is not a style check; it is the last
     thing standing between a rename and a column created under the name being renamed away. */
  const spec = J('docs/reference/sharepoint-provisioning-spec.json');
  const wrong = [];
  for (const f of spec.fields || []) {
    if (!f.SchemaXml) continue;
    const read = (attr) => new RegExp(`(?<![A-Za-z])${attr}='([^']*)'`).exec(f.SchemaXml)?.[1];
    const name = read('Name');
    const staticName = read('StaticName');
    const display = read('DisplayName');
    if (name !== undefined && name !== f.InternalName) {
      wrong.push(`${f.ListTitle}.${f.InternalName}: SchemaXml Name='${name}'`);
    }
    if (staticName !== undefined && staticName !== f.InternalName) {
      wrong.push(`${f.ListTitle}.${f.InternalName}: SchemaXml StaticName='${staticName}'`);
    }
    if (display !== undefined && display !== f.DisplayName) {
      wrong.push(`${f.ListTitle}.${f.InternalName}: SchemaXml DisplayName='${display}' but the field says '${f.DisplayName}'`);
    }
  }
  assert(wrong.length === 0,
    `${wrong.length} SchemaXml/field disagreement(s):\n      ${wrong.join('\n      ')}\n`
    + '      Run: npm run governance:correctfields');
});

check('no governance list column can hold a signed trigger URL', () => {
  /* GOV-03. A sig= IS the credential; a list column holding one publishes every endpoint to
     every reader of that list. The renamed column holds everything before the '?'. */
  const spec = J('docs/reference/sharepoint-provisioning-spec.json');
  const registry = (spec.fields || []).filter((f) => f.ListTitle === 'DGO_EndpointRegistry');
  assert(!registry.some((f) => f.InternalName === 'FlowUrl'),
    'DGO_EndpointRegistry still declares FlowUrl. Run: npm run governance:correctfields');
  assert(registry.some((f) => f.InternalName === 'EndpointRedacted'),
    'DGO_EndpointRegistry has no EndpointRedacted column');
  assert(registry.some((f) => f.InternalName === 'EndpointFingerprint'),
    'DGO_EndpointRegistry has no EndpointFingerprint column — a redacted endpoint alone cannot identify a flow');
  /* The design being copied. If DGO_HTTPFlowRegistry ever grew a raw-URL column the pattern this
     rename points at would no longer be the safe one. */
  const httpReg = (spec.fields || []).filter((f) => f.ListTitle === 'DGO_HTTPFlowRegistry');
  assert(!httpReg.some((f) => /^(FlowUrl|TriggerUrl|EndpointUrl)$/.test(f.InternalName)),
    'DGO_HTTPFlowRegistry has grown a raw endpoint column — the design GOV-03 copies is no longer safe');
});

check('the provisioner adopts a live column rather than creating a rival to it', () => {
  /* DGO_AccessScopes carries 'Access Scope Id' — a custom column an operator made by hand after
     hitting the ScopeId collision. Creating the spec's column beside it would give the list two
     columns for one fact and the seeds would populate the empty one. */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/provision-governance-lists.browser.js'), 'utf8');
  assert(/byTitle/.test(src), 'the provisioner no longer indexes live fields by display name — it cannot adopt');
  assert(/'ADOPTED'/.test(src), 'the provisioner no longer reports an adoption');
  assert(/adopted\.get\(s\.keyField\)/.test(src),
    'the seed key is not read through the adoption map — a seed would filter on a column the tenant does not have');
  assert(/adopted\.get\(k\)/.test(src),
    'the seed payload is not rewritten through the adoption map — a seed would write into a column that does not exist');
  assert(/!specNames\.has\(byTitle\.InternalName\)/.test(src),
    'adoption no longer refuses a column another specification field claims — it could steal one');
});

check('the provisioner refuses to count a system field as the spec\'s own', () => {
  /* The fix for the false positive, asserted on the emitted file: a field inherited from the
     base type must be reported, not counted present. */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/provision-governance-lists.browser.js'), 'utf8');
  assert(/FromBaseType/.test(src), 'the provisioner no longer reads FromBaseType — the false positive would return');
  assert(/RESERVED NAME/.test(src), 'the provisioner no longer reports a reserved-name collision');
  assert(/isCustom/.test(src), 'the provisioner no longer distinguishes a custom field from an inherited one');
});

check('the stray-column remediation cannot destroy what it is moving', () => {
  /* This script deletes list columns. Every property below is the difference between a
     remediation and a data-loss incident, and each is asserted on the EMITTED file because that
     is what an operator pastes.

     The ordering one matters most: create, copy and verify all happen before any delete, so a
     failure at any point leaves the data where it was. A version that deleted first would look
     almost identical and be unrecoverable. */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/remediate-governance-strays.browser.js'), 'utf8');

  assert(/const DRY_RUN = true;/.test(src),
    'the remediation no longer defaults to a dry run — it would delete columns on first paste');

  const iVerify = src.indexOf("note('VERIFIED'");
  const iDelete = src.indexOf('await deleteField(');
  assert(iVerify > 0 && iDelete > 0 && iVerify < iDelete,
    'the delete is no longer downstream of the verify — a failed copy could now lose the data');

  assert(/mismatched\.length/.test(src) && /NOT DELETED/.test(src),
    'the remediation no longer refuses to delete when the copied values do not match');

  assert(/sig=/.test(src) && /REFUSED/.test(src),
    'the remediation no longer refuses a column holding a signed trigger URL');
  assert(/revokes NOTHING/i.test(src),
    'the remediation no longer says that deleting the column does not revoke the credential — '
    + 'an operator would reasonably assume it does');

  assert(/isCustom/.test(src),
    'the remediation no longer distinguishes a custom column from a SharePoint system field — '
    + "it could attempt to delete SharePoint's own ScopeId");

  assert(/!filled\(it\[s\.newName\]\)/.test(src),
    'the copy no longer skips rows whose destination already holds a value — a re-run would '
    + 'overwrite a later correction with the stale original');

  /* Every stray it acts on must be a rename the specification actually declares. */
  const spec = J('docs/reference/sharepoint-provisioning-spec.json');
  const declared = new Set((spec.fields || [])
    .filter((f) => f.RenamedFrom).map((f) => `${f.ListTitle}|${f.RenamedFrom}|${f.InternalName}`));
  const emitted = [...src.matchAll(/"list": "([^"]+)",\s*"listGuid": "[^"]+",\s*"oldName": "([^"]+)",\s*"newName": "([^"]+)"/g)]
    .map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  assert(emitted.length > 0, 'the remediation names no columns at all');
  const undeclared = emitted.filter((e) => !declared.has(e));
  assert(undeclared.length === 0,
    `the remediation would touch ${undeclared.length} column(s) the specification does not declare `
    + `as renamed: ${undeclared.join(', ')}`);
});

check('the disambiguation cleanup deletes only what it can prove is a leftover', () => {
  /* This script deletes columns with no migration step, so the whole of its safety is in what it
     will refuse. Each property below is asserted on the emitted file, because that is what gets
     pasted into a console with Manage Lists rights. */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/cleanup-disambiguated-columns.browser.js'), 'utf8');

  assert(/const DRY_RUN = true;/.test(src),
    'the cleanup no longer defaults to a dry run — it would delete columns on first paste');

  /* The base-name condition. Without it, any column ending in a digit is a target. */
  assert(/customNames\.has\(m\[1\]\)/.test(src),
    'the cleanup no longer requires a same-list base column — an ordinary name ending in a digit '
    + 'would become a deletion candidate');

  /* Emptiness, re-read live rather than taken from a list written at build time. */
  assert(/populated\.length/.test(src) && /KEPT — HOLDS DATA/.test(src),
    'the cleanup no longer keeps a column that holds data');
  const iPopulated = src.indexOf('const populated =');
  const iDelete = src.indexOf('await deleteField(');
  assert(iPopulated > 0 && iDelete > 0 && iPopulated < iDelete,
    'emptiness is no longer established before the delete');

  assert(/isCustom/.test(src),
    'the cleanup no longer excludes SharePoint system fields');

  /* It must not carry a hardcoded hit list: the condition is general, and a fixed list would be
     correct once and wrong at the next collision. */
  assert(!/['"]Version0['"]/.test(src) && !/['"]FlowUrl0['"]/.test(src),
    'the cleanup names specific columns to delete — it must detect them by shape on the live list');

  /* And it may only look at governance lists the registry declares authoritative. */
  const registry = J('docs/reference/governance-list-registry.json');
  const declared = new Set(registry.lists.map((l) => l.listGuid));
  const scanned = [...src.matchAll(/"guid": "([0-9a-f-]{36})"/g)].map((m) => m[1]);
  assert(scanned.length === declared.size,
    `the cleanup scans ${scanned.length} list(s); the registry declares ${declared.size}`);
  const foreign = scanned.filter((g) => !declared.has(g));
  assert(foreign.length === 0,
    `the cleanup would scan ${foreign.length} list(s) outside the authoritative registry: ${foreign.join(', ')}`);
});

check('the record names an owner and a resolution for every open finding', () => {
  /* A finding parked without either is how a known defect becomes a permanent one. */
  const thin = position.openFindings.filter((f) => !f.owner || !f.resolution);
  assert(thin.length === 0,
    `${thin.length} finding(s) have no owner or no resolution: ${thin.map((f) => f.id).join(', ')}`);
  assert(position.openFindings.every((f) => typeof f.blocksCommissioning === 'boolean'),
    'every finding must state whether it blocks commissioning — that is the question an operator asks first');
});

check('the endpoint estate is unchanged by the governance structure', () => {
  const totals = J('docs/reference/endpoint-workflow-ids.json').totals;
  assert(position.endpointImpact.newContractKeys === 0,
    'the record now claims the governance structure adds contract keys — reconcile them into the register');
  assert(totals.keys === 25 && totals.distinctWorkflows === 20,
    `the endpoint estate has moved to ${totals.keys} keys across ${totals.distinctWorkflows} workflows; `
    + 'check whether the governance structure introduced them and update the record');
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
