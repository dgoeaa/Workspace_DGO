#!/usr/bin/env node
/**
 * `IP_OTP_VERIFY` as it stands in the tenant, held to the hardening it was built to carry.
 *
 * WHY THIS EXISTS
 * The operator built this flow by hand on 2026-09-04 from the designer-paste kit and exported it.
 * A hand build is where a paste can land short: one variable missed, one connector bound to the
 * wrong operation, one scope pasted into the wrong place. Reading the export answers all of that,
 * and it keeps answering — if the flow is edited later and re-exported, these assertions are what
 * notices the hardening going backwards.
 *
 * Each check names the defect it exists to catch. Five come from OTP-VERIFY-SECURITY-PATCH.md and
 * four from the 2026-09-03 review of the patched definition itself.
 *
 * Run: node tests/otp-verify-deployed.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'docs/reference/flow-contracts/deployed/' +
             'IP_OTP_VERIFY__c5e314c7-68b5-4bdc-8935-0954ef6a256d__full_definition.json';
const record = JSON.parse(readFileSync(path.join(ROOT, FILE), 'utf8'));
const D = record.definition;
const G = D.actions.Scope_Global;
const text = JSON.stringify(D);

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

const flat = (n, out = {}) => {
  for (const [k, v] of Object.entries(n.actions || {})) {
    out[k] = v; flat(v, out);
    if (v.else) flat(v.else, out);
    for (const c of Object.values(v.cases || {})) flat(c, out);
    if (v.default) flat(v.default, out);
  }
  return out;
};
const A = flat(G);

console.log('\nIP_OTP_VERIFY, as deployed\n');

console.log('  THE FIVE DEFECTS THE PATCH EXISTS TO CLOSE');
ok('1 · the code lookup is bound to the caller identity — a code issued to one person no longer verifies anyone',
   (text.match(/Title eq '@\{replace\(outputs\('Compose_OTP_Identifier_Verify'\)/g) || []).length >= 2);
ok('2 · caller input is escaped into the OData filter, so a crafted code cannot rewrite the query',
   text.includes("replace(outputs('Compose_OTP_Identifier_Verify'),'''','''''')") &&
   text.includes("replace(outputs('Compose_OTP_Code'),'''','''''')"));
ok('3 · the identity is composed before the lookup that reads it',
   Boolean(A.Get_items_OTP_Attempts?.runAfter?.Compose_OTP_Identifier_Verify),
   'fix 1 fails at run time on every call if this is out of order');
ok('4 · the attempt cap is present and refuses at five', Boolean(A.Condition_Attempt_Cap) &&
   JSON.stringify(A.Condition_Attempt_Cap.expression).includes('5') &&
   JSON.stringify(A.Condition_Attempt_Cap.actions).includes('429'));
ok('5 · the unconditional mail scope is gone — no open relay on the agency connection',
   !text.includes('Scope_VERIFY_Complete_No_Trigger'));

console.log('\n  THE FOUR FOUND ON 2026-09-03 IN THE PATCH ITSELF');
/* Addressed through the flattened map, not G.actions, because WHERE the action sits is not
   what is being asserted. The 2026-09-05 re-export wrapped the whole flow in Scope_Global and
   these two assertions crashed on undefined — a checker reporting the shape of the export
   rather than the property it exists to hold. Both properties still held. */
ok('the response returns the status the flow decided, not a literal 200',
   A.Response?.inputs?.statusCode === "@coalesce(variables('varStatusCode'), 500)",
   'a literal here discards the 429, the 404, the 410 and the 401');
ok('the finalize scope no longer overwrites that status after the switch has set it',
   Boolean(A.Scope_Finalize_Response_State) &&
   !('Set_variable_varStatusCode' in (A.Scope_Finalize_Response_State.actions || {})),
   'absent scope counts as a failure here: silence about it is not the same as the overwrite being gone');
ok('the attempt counter WRITES — PatchItem, not GetItems',
   A.Update_item_Attempts?.inputs?.host?.operationId === 'PatchItem',
   'a read here leaves Attempts at 0 for ever, so the cap at five is unreachable');
ok('varStatusCode starts at 500, so coalesce cannot resolve it to 0',
   Object.values(D.actions).some((a) => a.type === 'InitializeVariable' &&
     a.inputs.variables[0].name === 'varStatusCode' && a.inputs.variables[0].value === 500));

console.log('\n  THE BUILD ITSELF');
const declared = new Set(Object.values(D.actions)
  .filter((a) => a.type === 'InitializeVariable').map((a) => a.inputs.variables[0].name));
const used = new Set([...text.matchAll(/variables\('(\w+)'\)/g)].map((m) => m[1]));
ok(`every variable the flow reads is declared (${used.size} read, ${declared.size} declared)`,
   [...used].every((v) => declared.has(v)),
   [...used].filter((v) => !declared.has(v)).join(', '));
ok('and none is declared that nothing reads',
   [...declared].every((v) => used.has(v)), [...declared].filter((v) => !used.has(v)).join(', '));
const conn = Object.entries(A).filter(([, a]) => a.type === 'OpenApiConnection');
ok(`every connector action is bound (${conn.length})`,
   conn.every(([, a]) => a.inputs.host.connectionName));
/* Every OTP RECORD operation must still be OTP_Transactions by GUID on the tracking site. The
   flow acquired two other SharePoint targets in the 2026-09-05 re-export, and both are named
   here rather than exempted by pattern: the allow-list the CORS origin is resolved from
   (ITEM-56) and the estate's standard telemetry list. Anything else fails — a new unexplained
   target is exactly what this assertion exists to catch, and widening it to "any list" would
   have retired the check instead of updating it. */
const OTP_LIST = '9421d473-8906-43b7-a41f-a213046683c1';
const TRACKING = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const NAMED_OTHER = new Map([
  ['Get_Allowed_Origins_Otp', ['9bc168c3-06e5-4d58-982b-0df06205fd35', TRACKING]],
  ['Create_Flow_Telemetry', ['726c210d-09d5-45d9-952d-7a506b644b13',
    'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre']],
]);
const spActions = conn.filter(([, a]) => a.inputs.host.apiId.endsWith('shared_sharepointonline'));
const misdirected = spActions.filter(([name, a]) => {
  const [table, site] = NAMED_OTHER.get(name) || [OTP_LIST, TRACKING];
  return a.inputs.parameters.table !== table || a.inputs.parameters.dataset !== site;
});
ok(`every SharePoint action targets the list it is supposed to, by GUID (${spActions.length} actions, ${NAMED_OTHER.size} named non-OTP)`,
   misdirected.length === 0,
   misdirected.map(([n, a]) => `${n} -> ${a.inputs.parameters.table}`).join(', '));
ok('the trigger is POST and anonymous, which is what a public portal needs',
   D.triggers.manual.inputs.method === 'POST' &&
   D.triggers.manual.inputs.triggerAuthenticationType === 'All');
ok('it is a different flow from the defective one, so this record cannot be read as its replacement in place',
   record.workflow_identity.internal_name !== '3e201620-f1e8-4c17-a90a-4d95b94a24c2');

console.log('\n  WHAT IS NOT DONE, ASSERTED SO IT CANNOT BE FORGOTTEN');
const schemaProps = Object.keys(D.triggers.manual.inputs.schema?.properties || {}).length;
ok('KNOWN GAP: the trigger carries no request schema, and this record says so',
   schemaProps === 0,
   'if this starts passing with a schema in place, update the register — the gap closed');
/* This assertion used to read the other way: it asserted the placeholder was STILL there, and
   said to reconcile it if the origin was ever set. The operator set it on 2026-09-05 (ITEM-55),
   so it is inverted here rather than deleted. It now fails if the flow regresses to any literal
   origin — a placeholder, a wildcard, or a hardcoded host — which is the property worth holding.
   The allow-list the composed expression reads is tenant data and is ITEM-56, not assertable here. */
const acao = A.Response?.inputs?.headers?.['Access-Control-Allow-Origin'];
ok('the response resolves its origin from the allow-list, not from a literal',
   typeof acao === 'string' && acao.includes("Compose_Allowed_Origin_Otp") && !acao.includes('your-host'),
   `Access-Control-Allow-Origin is ${JSON.stringify(acao)} — a literal here fails every browser call`);
ok('the allow-list the origin is resolved from is actually built in this flow',
   Boolean(A.Select_Allowed_Origins_Otp) && Boolean(A.Compose_Request_Origin_Otp),
   'the composed origin resolves to nothing if the Select and the request-origin Compose are absent');

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
