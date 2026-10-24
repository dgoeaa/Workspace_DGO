#!/usr/bin/env node
/**
 * WHO MAY INVOKE EACH FLOW, READ FROM THE EXPORTS RATHER THAN ASSUMED.
 *
 * WHY THIS EXISTS
 *   Nothing in this repository read `triggerAuthenticationType` at all. Two things followed.
 *
 *   The estate's own standing constraint — `ECM_DOCS_INTAKE` is the single sanctioned crossing
 *   into the internal platform and must stay POST and tenant-authenticated, stated in
 *   DECISIONS.md as "triggerAuthenticationType = Tenant (unchanged)" — was guarded by nobody. A
 *   flow edit that widened it would have passed every gate here, and the bridge is precisely the
 *   flow where widening matters most.
 *
 *   And the posture of the estate as a whole was unmeasured. This does not interpret the values:
 *   it records what each export says, so that a CHANGE to any flow's posture appears as a diff
 *   in a tracked file instead of passing unremarked. Reading the meaning of a value off the
 *   Power Automate UI is a separate question this file deliberately does not answer.
 *
 *     node scripts/audit-trigger-auth.mjs            # write the baseline
 *     node scripts/audit-trigger-auth.mjs --check    # exit 1 if it drifted, or the bridge widened
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEPLOYED = join(ROOT, 'docs/reference/flow-contracts/deployed');
const OUT = join(ROOT, 'docs/reference/flow-trigger-auth.json');

/* The one flow whose posture this repository asserts. Anything else is recorded, not required —
   the repository has no authority to say what the rest of the estate should be.

   IT IS IDENTIFIED BY WORKFLOW, NOT BY NAME, and the workflow id is read from the wiring
   specification rather than repeated here so there is one declaration of what the bridge is.
   This file used to resolve it as `file.split('__')[0]` — the display name the export happened
   to carry — which is the same defect open item 37 records against verify-portal-wiring.mjs.
   That one was fixed; this one was not, and it is the more serious of the two: workflow
   df7ddff1 is in `deployed/` twice, as ECM_DOCS_INTAKE on 2026-08-19 and as CG_Upload_Endpoint
   on 2026-08-24, so the name match found the superseded copy and printed a green tick asserting
   the security posture of a flow that no longer exists in that form. The single sanctioned
   crossing is the one place in this estate where a false green costs the most. */
const WIRING = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/sharepoint/portal-wiring.json'), 'utf8'));
const REQUIRED = {
  flow: WIRING.bridge?.flow || 'ECM_DOCS_INTAKE',
  internalName: WIRING.bridge?.internalName || null,
  auth: 'Tenant',
  method: 'POST',
  why: 'the single sanctioned crossing into the internal platform (DECISIONS.md D6)',
};

/* WHAT A REQUEST TRIGGER WILL ACCEPT, not merely who may call it.
 *
 * Brief item 6.3 says trigger posture is largely unverified: IP_Get_Docs_Endpoint was read and
 * found to restrict no HTTP method and declare no request schema, and the other thirteen
 * endpoints were never read at all. This is the missing half of that reading. A schema on a
 * Request trigger is the only input validation a flow gets before its own actions run, and
 * "declared" is not the same as "constraining" — `additionalProperties` left open accepts any
 * field alongside the declared ones, and an empty `required` accepts a body with none of them.
 * All three states are recorded separately so a reader is not left inferring which one applies. */
function describeSchema(schema) {
  if (!schema || typeof schema !== 'object') return { declared: false };
  const props = schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties) : [];
  return {
    declared: true,
    type: schema.type || null,
    properties: props.length,
    required: Array.isArray(schema.required) ? schema.required.length : 0,
    /* Absent means the JSON Schema default, which is to ALLOW unknown fields. Recorded as the
       absence it is rather than as `true`, so the export is not made to say something it did
       not say — but read it as open. */
    additionalProperties: Object.prototype.hasOwnProperty.call(schema, 'additionalProperties')
      ? schema.additionalProperties : null,
  };
}

const flows = [];
for (const file of readdirSync(DEPLOYED).filter((f) => f.endsWith('.json')).sort()) {
  const doc = JSON.parse(readFileSync(join(DEPLOYED, file), 'utf8'));
  const def = doc.properties?.definition || doc.definition || {};
  for (const [name, t] of Object.entries(def.triggers || {})) {
    if (t.type !== 'Request') continue;
    flows.push({
      flow: file.split('__')[0],
      /* Recorded so this file states which WORKFLOW each posture belongs to. Without it the
         baseline lists one renamed workflow as two flows and reads as two postures. */
      internalName: doc.workflow_identity?.internal_name || null,
      exportedAtUtc: typeof doc.exportedAtUtc === 'string' ? doc.exportedAtUtc : null,
      trigger: name,
      method: t.inputs?.method || null,
      /* Absent is its own state and is recorded as absent. Substituting a default here would
         invent a posture the export does not state. */
      triggerAuthenticationType: Object.prototype.hasOwnProperty.call(t.inputs || {}, 'triggerAuthenticationType')
        ? t.inputs.triggerAuthenticationType : null,
      requestSchema: describeSchema(t.inputs?.schema),
    });
  }
}
/* Was `(a.flow + byteCompare(a.trigger), b.flow + b.trigger)` — a comma expression returning a
   STRING, which sort() coerces to NaN and treats as 0, so the comparator ordered nothing and the
   imported byteCompare was called on one argument and discarded. The file only looked sorted
   because readdirSync().sort() had already ordered it. Compared by code unit, not by the host's
   locale, so the generated baseline is the same bytes on every machine. */
flows.sort((a, b) => byteCompare(a.flow, b.flow) || byteCompare(a.trigger, b.trigger));

/* The live export of a workflow is the latest one. Every earlier capture is history, and must
   never answer a question about what the flow is now. */
const latestOf = (internalName) => flows
  .filter((f) => internalName && f.internalName === internalName)
  .sort((a, b) => byteCompare(String(a.exportedAtUtc || ''), String(b.exportedAtUtc || '')))
  .at(-1) || null;

/* ── the posture of each ENDPOINT, which is the question item 6.3 asks ──────────────────
 *
 * The rows above are per exported definition. An endpoint is a contract key, and the two are
 * joined differently on each surface — which is the whole reason thirteen of them were never
 * read.
 *
 * WHY THE OBVIOUS JOIN DOES NOT EXIST. docs/reference/endpoint-workflow-ids.json keys every
 * endpoint by its 32-hex trigger workflow id. NOT ONE of the exported definitions carries that
 * id: `full_resource_id` is null in all of them, so the reader has nothing to match against, and
 * the dashed `internal_name` an export does carry is a different identifier scheme for the same
 * flow, not a reformatting of it. Zero of the twenty-five endpoint keys join that way. Anything
 * that claimed to have verified a trigger through that route verified nothing.
 *
 * Two joins do work, and they are the ones used here. The portal register records the dashed
 * internal name alongside the trigger id. The internal register attributes definition FILES to
 * each contract key. Where a key resolves to several definitions the ambiguity is reported
 * rather than resolved by picking one — several exports attributed to one key is a finding about
 * the register, not a detail to smooth over. */
const INTERNAL_REGISTER = JSON.parse(readFileSync(join(ROOT, 'docs/reference/internal-flow-register.json'), 'utf8'));
const PORTAL_IDS = JSON.parse(readFileSync(join(ROOT, 'docs/reference/portal-endpoint-workflow-ids.json'), 'utf8'));

const rowByFile = new Map();
for (const f of flows) rowByFile.set(f.flow, f);

const endpoints = [];
for (const c of INTERNAL_REGISTER.contractKeys || []) {
  const files = (c.definitions || []).map((d) => d.split('/').pop().split('__')[0]);
  /* One workflow exported twice is one flow; the later export is the flow. Applied here too so
     an endpoint is never described from a capture that has been superseded. */
  const rows = [...new Map(files.map((n) => [rowByFile.get(n)?.internalName || n, rowByFile.get(n)])).values()]
    .filter(Boolean);
  const latest = rows.length
    ? rows.slice().sort((a, b) => byteCompare(String(a.exportedAtUtc || ''), String(b.exportedAtUtc || ''))).at(-1)
    : null;
  endpoints.push({
    key: c.key, surface: 'internal', resolvedBy: 'internal-flow-register definitions',
    definitions: files.length, ambiguous: rows.length > 1 ? rows.map((r) => r.flow) : undefined,
    flow: latest?.flow || null,
    method: latest ? (latest.method || 'ANY VERB — no method declared') : null,
    triggerAuthenticationType: latest ? latest.triggerAuthenticationType : null,
    requestSchema: latest ? latest.requestSchema : null,
    unread: latest ? undefined : 'no definition attributed to this key',
  });
}
for (const e of PORTAL_IDS.endpoints || []) {
  /* latestOf, not find. Workflow df7ddff1 has two rows and `find` returned whichever sorted
     first — CG_Upload_Endpoint, which happens to be the live one, by luck rather than by rule.
     The rule is the same one applied to the bridge: the later export is the flow. */
  const row = latestOf((PORTAL_IDS.endpoints.find((x) => x.key === e.key) || {}).internalName);
  endpoints.push({
    key: e.key, surface: 'portal', resolvedBy: 'portal-endpoint-workflow-ids internalName',
    definitions: row ? 1 : 0,
    flow: row?.flow || null,
    method: row ? (row.method || 'ANY VERB — no method declared') : null,
    triggerAuthenticationType: row ? row.triggerAuthenticationType : null,
    requestSchema: row ? row.requestSchema : null,
    unread: row ? undefined : 'no export carries this workflow id',
    /* The workflow is right; the capture is old. Four portal endpoints were renamed in place and
       the only exports held here were taken before that, so the posture above is the flow's as it
       WAS. Recording it without this flag would be the same error this file was just fixed for,
       one level along: an answer about a live flow taken from a superseded copy. */
    exportPredatesRename: row && row.flow !== e.flow
      ? `posture read from "${row.flow}" (${row.exportedAtUtc || 'undated'}), captured before this `
        + `workflow was renamed to ${e.flow} — re-export before relying on it`
      : undefined,
  });
}

const anyVerb = endpoints.filter((e) => e.method && e.method.startsWith('ANY VERB'));
const noSchema = endpoints.filter((e) => e.requestSchema && !e.requestSchema.declared);
const openSchema = endpoints.filter((e) => e.requestSchema?.declared && e.requestSchema.additionalProperties !== false);
const unread = endpoints.filter((e) => e.unread);

const counts = {};
for (const f of flows) counts[f.triggerAuthenticationType ?? '(absent from the export)'] =
  (counts[f.triggerAuthenticationType ?? '(absent from the export)'] || 0) + 1;

const built = JSON.stringify({
  schema: 'dgo-flow-trigger-auth/v1',
  generatedBy: 'scripts/audit-trigger-auth.mjs',
  readFrom: 'docs/reference/flow-contracts/deployed',
  whatThisIs: 'The triggerAuthenticationType each exported definition carries on each Request trigger, '
    + 'recorded verbatim. This file asserts no interpretation of the values; it exists so a change to '
    + 'any flow’s posture is a visible diff rather than a silent one.',
  asserted: REQUIRED,
  counts,
  endpointPosture: {
    whatThisIs: 'Per CONTRACT KEY rather than per exported definition. The 32-hex trigger id in '
      + 'endpoint-workflow-ids.json joins to nothing — full_resource_id is null in every export — '
      + 'so these are resolved by the internal register\u2019s attributed definition files and by '
      + 'the portal register\u2019s dashed internal name.',
    answeringEveryVerb: anyVerb.length,
    withNoRequestSchema: noSchema.length,
    withASchemaThatAcceptsUnknownFields: openSchema.length,
    unread: unread.length,
    endpoints,
  },
  flows,
}, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let bad = 0;
  console.log('\nFlow trigger authentication\n');
  const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })();

  /* A gate that reads nothing passes forever. */
  if (!flows.length) { console.log('  ❌ no Request trigger found in any export — the reader has stopped reading'); bad++; }

  const b = latestOf(REQUIRED.internalName);
  if (!REQUIRED.internalName) {
    console.log('  ❌ portal-wiring.json declares no internalName for the bridge, so this check has '
      + 'nothing to resolve it by and would fall back to matching a display name — which is what '
      + 'made it wrong. Fix the wiring specification rather than this file.');
    bad++;
  } else if (!b) {
    console.log(`  ❌ workflow ${REQUIRED.internalName} is not among the exports, so the posture of `
      + `${REQUIRED.flow} cannot be checked`);
    bad++;
  } else if (b.flow !== REQUIRED.flow) {
    /* THE CONSTRAINT NO LONGER HAS A SUBJECT. The workflow the bridge is declared as is now
       running something else, so asserting POST+Tenant on it guards the posture of a different
       flow. Reporting that as a pass is exactly the false negative this file was written to stop,
       and it is what it did until this was fixed. Open item 37 is the decision that settles it;
       until then this cannot pass honestly. */
    console.log(`  ❌ ${REQUIRED.flow} no longer exists at workflow ${REQUIRED.internalName}. The `
      + `latest export of that workflow is "${b.flow}" (${b.exportedAtUtc || 'undated'}), so this `
      + `constraint — ${REQUIRED.why} — has no subject and this check guards nothing.`);
    console.log('       Its posture is recorded below with the rest; it is that flow\'s, not the '
      + 'crossing\'s. Settle OPEN_ITEMS item 37 — restore the intake feed somewhere, or retire the '
      + 'one-crossing argument in D1/D6 — then point bridge.internalName at whatever carries it.');
    bad++;
  } else {
    const okAuth = b.triggerAuthenticationType === REQUIRED.auth;
    const okMethod = b.method === REQUIRED.method;
    if (okAuth && okMethod) {
      console.log(`  ✅ ${REQUIRED.flow} (${REQUIRED.internalName}) is ${REQUIRED.method} and `
        + `${REQUIRED.auth} — ${REQUIRED.why}`);
    } else {
      console.log(`  ❌ ${REQUIRED.flow} must stay ${REQUIRED.method} and ${REQUIRED.auth} (${REQUIRED.why}); `
        + `the latest export says ${b.method} and ${b.triggerAuthenticationType ?? 'no triggerAuthenticationType at all'}`);
      bad++;
    }
  }

  /* Reported, never failed. This file records what the exports say so a CHANGE is a diff; it is
     not the authority on what the estate's posture ought to be, and failing on an open trigger
     would put fifteen flows red with no decision behind it. The numbers are here so the posture
     is a fact on the screen rather than an inference nobody drew. */
  console.log(`\n  Endpoint trigger posture — ${endpoints.length} contract key(s)`);
  console.log(`     ${anyVerb.length} answer every verb (no method declared): ${anyVerb.map((e) => e.key).join(', ') || '—'}`);
  console.log(`     ${noSchema.length} declare no request schema: ${noSchema.map((e) => e.key).join(', ') || '—'}`);
  console.log(`     ${openSchema.length} declare a schema that still accepts unknown fields`);
  if (unread.length) console.log(`     ${unread.length} could not be read: ${unread.map((e) => `${e.key} (${e.unread})`).join(', ')}`);
  const stale = endpoints.filter((e) => e.exportPredatesRename);
  if (stale.length) {
    console.log(`     ${stale.length} read from a capture taken BEFORE the flow was renamed — the posture is what it WAS:`);
    for (const e of stale) console.log(`        ${e.key} → ${e.flow}`);
  }
  const ambiguous = endpoints.filter((e) => e.ambiguous);
  if (ambiguous.length) {
    console.log(`     ${ambiguous.length} resolve to more than one definition, so "the" trigger is not one thing:`);
    for (const a of ambiguous) console.log(`        ${a.key} → ${a.ambiguous.join(', ')}`);
  }

  if (current !== built) {
    console.log('  ❌ the recorded posture no longer matches the exports — a flow’s trigger authentication '
      + 'changed, or a flow was added or removed. Review the diff, then run: node scripts/audit-trigger-auth.mjs');
    bad++;
  } else {
    console.log(`  ✅ all ${flows.length} Request trigger(s) match the recorded posture`);
    console.log('     ' + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · '));
  }
  console.log(`\n${bad ? '❌' : '✅'} ${bad} problem(s)\n`);
  process.exit(bad ? 1 : 0);
}

writeFileSync(OUT, built);
console.log(`Wrote ${OUT} — ${flows.length} Request trigger(s): `
  + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
