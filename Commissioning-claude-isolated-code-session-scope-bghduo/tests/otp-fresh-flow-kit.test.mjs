#!/usr/bin/env node
/**
 * The fresh-build kit for `Web - OTP Verify`, held to the definition it is generated from.
 *
 * WHY THIS EXISTS
 * The kit is pasted by hand into a designer against a public endpoint. Nothing catches a mistake
 * in it until the flow is live and answering citizens. The failure modes are specific and each
 * one is checked here:
 *
 *   a scope carrying an Initialize variable       — the designer refuses to save the flow
 *   a variable read but never declared            — fails at run time, on a real request
 *   a connector action left unbound               — fails at run time, on a real request
 *   a body that drifted from the patched one      — the five defects come back silently
 *   a trigger that differs from the contract      — the portal's payloads stop matching
 *   BUILD.md that omits turning the old flow off  — the insecure flow stays reachable
 *
 * Run: node tests/otp-fresh-flow-kit.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = 'docs/deployment/power-automate-flows/fresh-flow';
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const definition = json('docs/deployment/power-automate-flows/otp-verify-patched-definition.json');
const body = json(`${KIT}/Web_OTP_Verify.Scope_Global.designer-paste.json`);
const telemetry = json(`${KIT}/Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json`);
const trig = json(`${KIT}/Web_OTP_Verify.trigger.json`);
const build = read(`${KIT}/BUILD.md`);

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

/** Every action in a node, flattened across actions / else / cases / default. */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.actions) for (const [n, a] of Object.entries(node.actions)) { visit(n, a); walk(a, visit); }
  if (node.else) walk(node.else, visit);
  if (node.cases) for (const c of Object.values(node.cases)) walk(c, visit);
  if (node.default) walk(node.default, visit);
}

console.log('\nThe fresh-build kit\n');

console.log('  THE ENVELOPE');
for (const [name, p] of [['body', body], ['telemetry', telemetry]]) {
  ok(`${name}: the clipboard envelope is the shape the designer accepts`,
     typeof p.nodeId === 'string' && p.serializedValue && p.serializedValue.type === 'Scope' &&
     p.allConnectionData && typeof p.staticResults === 'object' &&
     p.isScopeNode === true && p.mslaNode === true);
}
ok('the body package is Scope_Global', body.nodeId === 'Scope_Global');

console.log('\n  IT IS THE PATCHED DEFINITION, NOT A COPY THAT DRIFTED');
ok('the pasted scope is byte-identical to the patched Scope_Global',
   JSON.stringify(body.serializedValue) === JSON.stringify(definition.actions.Scope_Global));
ok('the telemetry scope is byte-identical to the patched one',
   JSON.stringify(telemetry.serializedValue) === JSON.stringify(definition.actions.Scope_Flow_Data_Capture));
const bodyText = JSON.stringify(body.serializedValue);
for (const marker of ['Condition_Attempt_Cap', 'Get_items_OTP_Attempts', 'Update_item_Attempts', 'Title eq']) {
  ok(`the hardening is in the paste: ${marker}`, bodyText.includes(marker));
}
ok('the open mail relay is not in it', !bodyText.includes('Scope_VERIFY_Complete_No_Trigger'));
ok('the response returns the status the flow decided, not a literal',
   /"statusCode":"@coalesce\(variables\('varStatusCode'\)/.test(bodyText),
   'a literal here is the defect that made the 429 answer 200');
ok('the attempt counter writes rather than reads',
   !/"Update_item_Attempts"[\s\S]{0,400}?"operationId":"GetItems"/.test(bodyText),
   'GetItems here is the defect that made the cap unreachable');

console.log('\n  WHAT CANNOT TRAVEL INSIDE A PASTE');
let inits = [];
walk(body.serializedValue, (n, a) => { if (a.type === 'InitializeVariable') inits.push(n); });
walk(telemetry.serializedValue, (n, a) => { if (a.type === 'InitializeVariable') inits.push(n); });
ok('no package declares a variable', inits.length === 0,
   `${inits.join(', ')} — Power Automate accepts Initialize variable only at the top level, and a ` +
   'package carrying one produces a definition the designer will not save');

/* Every variable the pasted scopes touch has to be in the table the operator builds first. */
const declared = new Set([...build.matchAll(/\| \d+ \| `(\w+)` \|/g)].map((m) => m[1]));
const used = new Set([...JSON.stringify([body, telemetry]).matchAll(/variables\('(\w+)'\)/g)].map((m) => m[1]));
const setBy = new Set();
for (const p of [body, telemetry]) {
  walk(p.serializedValue, (n, a) => {
    if (/SetVariable|AppendToStringVariable|AppendToArrayVariable|IncrementVariable/.test(a.type || '')) {
      setBy.add(a.inputs && a.inputs.name);
    }
  });
}
for (const v of setBy) used.add(v);
const missing = [...used].filter((v) => v && !declared.has(v));
ok(`every variable the paste touches is in the build table (${used.size} used, ${declared.size} declared)`,
   missing.length === 0, `not declared: ${missing.join(', ')}`);
const unusedVars = [...declared].filter((v) => !used.has(v));
ok('and the table declares nothing the paste never touches', unusedVars.length === 0,
   `declared but unused: ${unusedVars.join(', ')}`);
/* The order is the whole point of the table — the chain declares these one after another and a
   variable created out of order is a variable the next one cannot reference. Check the numbering
   runs 1..N without naming any particular variable, so dropping a dead one does not fail this. */
const nums = [...build.matchAll(/\| (\d+) \| `\w+` \|/g)].map((m) => Number(m[1]));
ok(`the table is numbered 1..${nums.length}, so the order is unambiguous`,
   nums.length === declared.size && nums.every((n, i) => n === i + 1),
   nums.join(', '));

console.log('\n  CONNECTIONS');
const bound = (p) => {
  const need = [];
  walk(p.serializedValue, (n, a) => { if (a.type === 'OpenApiConnection') need.push([n, a.inputs.host.apiId]); });
  return need;
};
const need = bound(body);
ok(`every connector action in the body is bound (${need.length})`,
   need.every(([n]) => body.allConnectionData[n]),
   need.filter(([n]) => !body.allConnectionData[n]).map(([n]) => n).join(', '));
ok('each binding names the api the action actually uses',
   need.every(([n, apiId]) => body.allConnectionData[n].connectionReference.api.id === apiId));
ok('and carries the referenceKey the designer reads',
   need.every(([n, apiId]) => body.allConnectionData[n].referenceKey === apiId.split('/').pop()));
ok('the telemetry package leaves flowmanagement unbound, and BUILD.md says so',
   !telemetry.allConnectionData.Get_Flow_Definition && build.includes('shared_flowmanagement'),
   'binding it to a connection this repository has not recorded would be an invention');

console.log('\n  THE TRIGGER');
ok('the trigger is the one the patched definition carries',
   trig.method === definition.triggers.manual.inputs.method &&
   trig.triggerAuthenticationType === definition.triggers.manual.inputs.triggerAuthenticationType &&
   JSON.stringify(trig.schema) === JSON.stringify(definition.triggers.manual.inputs.schema));
ok('it is POST', trig.method === 'POST');
ok('Anyone is stated and justified rather than left to look like an oversight',
   /Anyone is deliberate/.test(build) && /public/.test(build));

console.log('\n  THE PROCEDURE');
ok('BUILD.md says a new flow is a new URL', /new flow is a new trigger URL/i.test(build));
ok('it names the old flow that must be turned off',
   build.includes('3e201620-f1e8-4c17-a90a-4d95b94a24c2') && /[Tt]urn the old flow off/.test(build));
ok('it says what stays reachable until that happens',
   /authentication bypass and the\s*\n?open mail relay are still reachable/.test(build));
ok('it tells the operator not to circulate the new URL',
   /carries a `sig=` bearer token/.test(build));
ok('it names the four live tests', /must \*\*fail\*\*/.test(build) && /429/.test(build));
ok('no kit file carries a shared-access signature',
   !/[?&]sig=[A-Za-z0-9]/.test(build + JSON.stringify([body, telemetry, trig])));

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
