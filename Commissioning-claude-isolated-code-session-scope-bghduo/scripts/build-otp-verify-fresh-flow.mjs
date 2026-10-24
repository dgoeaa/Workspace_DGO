#!/usr/bin/env node
/**
 * Build `Web - OTP Verify` from nothing, as a kit you paste into the designer.
 *
 * WHY THIS EXISTS
 * Patching the live flow needs the flow-management API, and on this tenant that API has moved
 * twice under us — the flows are Dataverse-backed and the maker portal talks to a host and a
 * path that are not the documented ones. The designer's own clipboard does not care about any
 * of that: it is the UI pasting into itself.
 *
 * So this emits the patched body as clipboard packages, plus the trigger and the variables that
 * cannot travel inside a package, plus the procedure. Everything is generated from
 * `otp-verify-patched-definition.json`, so the kit cannot drift from the definition the flow
 * patch tests validate.
 *
 * WHAT A FRESH FLOW COSTS, STATED HERE BECAUSE IT IS NOT OPTIONAL
 * A new flow is a NEW TRIGGER URL. The portal's configuration holds the current one, and the
 * defective flow keeps answering on it until it is turned off. Building this and stopping is
 * worse than not building it: two flows would then serve the same purpose and the insecure one
 * would still be the one the portal calls. BUILD.md carries the three steps.
 *
 *   node scripts/build-otp-verify-fresh-flow.mjs           # write
 *   node scripts/build-otp-verify-fresh-flow.mjs --check   # fail if stale
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'docs/deployment/power-automate-flows/otp-verify-patched-definition.json';
const OUT = 'docs/deployment/power-automate-flows/fresh-flow';
const FLOW_ID = '3e201620-f1e8-4c17-a90a-4d95b94a24c2';

const definition = JSON.parse(readFileSync(path.join(ROOT, SRC), 'utf8'));
const A = definition.actions;

/* The tenant's recorded connections. These are the same two the fourteen portal packages bind to
   and that have been pasted into this tenant; they are not invented here. The designer still
   shows every bound action, and the operator confirms each one is the intended account. */
const CONNECTIONS = {
  shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d',
  shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad',
};

/** Every OpenApiConnection inside a node, bound to a recorded connection where one exists. */
function connData(node) {
  const out = {};
  const unbound = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.type === 'OpenApiConnection') {
        const api = String(v.inputs.host.apiId || '').split('/').pop();
        const id = CONNECTIONS[api];
        if (!id) { unbound.push(`${k} (${api})`); }
        else {
          out[k] = {
            connectionReference: {
              api: { id: `/providers/Microsoft.PowerApps/apis/${api}` },
              connection: { id: `/providers/Microsoft.PowerApps/apis/${api}/connections/${id}` },
              connectionName: id,
            },
            referenceKey: api,
          };
        }
      }
      walk(v);
    }
  })(node);
  return { out, unbound };
}

/** The Power Automate modern-designer clipboard envelope. */
function pkg(nodeId, node) {
  const { out, unbound } = connData(node);
  return {
    body: { nodeId, serializedValue: node, allConnectionData: out, staticResults: {}, isScopeNode: true, mslaNode: true },
    unbound,
  };
}

/* ---- the variables, in the order the chain declares them ---------------------------------
   Power Automate accepts Initialize variable ONLY at a workflow's top level. A clipboard package
   is a scope, so these cannot travel inside one — pasting them there produces a definition the
   designer will not save. They are created by hand first, and the pasted scope reads and writes
   them. */
const chain = [];
{
  let cur = 'Compose';
  for (;;) {
    const next = Object.keys(A).find((k) => (A[k].runAfter || {})[cur]);
    if (!next) break;
    chain.push(next); cur = next;
  }
}
const declaredVars = chain
  .filter((k) => A[k].type === 'InitializeVariable')
  .map((k) => ({ action: k, ...A[k].inputs.variables[0] }));

/* A variable nothing reads is an action per run and a line in a build sheet, both for nothing.
   `varCurrentTime` is initialised to utcNow() in the live flow and referenced zero times; a flow
   built fresh does not inherit it. The rule is applied rather than the name hardcoded, so the next
   dead one goes the same way. */
const wholeDefinition = JSON.stringify(definition);
const unread = declaredVars.filter((v) => !wholeDefinition.includes(`variables('${v.name}')`));
const variables = declaredVars.filter((v) => wholeDefinition.includes(`variables('${v.name}')`));

/* Compose and Compose_1 hold a copy of the trigger schema as an action's inputs and are read by
   nothing — `outputs('Compose')` appears nowhere. They are documentation that costs two actions
   per run, and a flow built fresh does not inherit them. */
const dead = ['Compose', 'Compose_1'].filter((k) => A[k]);
for (const k of dead) {
  if (JSON.stringify(A).includes(`outputs('${k}')`)) throw new Error(`${k} is read somewhere — it is not dead`);
}

const trigger = definition.triggers.manual;
const body = pkg('Scope_Global', A.Scope_Global);
const telemetry = pkg('Scope_Flow_Data_Capture', A.Scope_Flow_Data_Capture);

const files = {};
files['Web_OTP_Verify.Scope_Global.designer-paste.json'] = JSON.stringify(body.body);
files['Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json'] = JSON.stringify(telemetry.body);
files['Web_OTP_Verify.trigger.json'] = JSON.stringify({
  note: 'Create this by hand as the flow trigger: "When an HTTP request is received". ' +
        'The schema below goes in "Request Body JSON Schema"; method POST; ' +
        '"Who can trigger the flow" = Anyone.',
  type: trigger.type,
  kind: trigger.kind,
  method: trigger.inputs.method,
  triggerAuthenticationType: trigger.inputs.triggerAuthenticationType,
  schema: trigger.inputs.schema,
}, null, 2);

const vrows = variables.map((v) => {
  const val = v.value === undefined ? '_(leave empty)_' : '`' + (typeof v.value === 'string' ? v.value : JSON.stringify(v.value)) + '`';
  return `| ${variables.indexOf(v) + 1} | \`${v.name}\` | ${v.type} | ${val} |`;
});

files['BUILD.md'] = `# Build \`Web - OTP Verify\` fresh

> GENERATED by \`scripts/build-otp-verify-fresh-flow.mjs\` from
> [\`otp-verify-patched-definition.json\`](../otp-verify-patched-definition.json). Do not edit.

Everything here is the patched definition — the five defects in
[\`OTP-VERIFY-SECURITY-PATCH.md\`](../OTP-VERIFY-SECURITY-PATCH.md) are already closed in it,
along with the four found on 2026-09-03 (the response returned 200 for every outcome, the status
was overwritten after the switch had set it, the attempt counter was typed as a read, and the
status variable started at 0).

## What this costs, before you start

**A new flow is a new trigger URL.** The current one is published in the portal's configuration
and in 72 places across this estate. Building this flow and stopping leaves you with two flows
serving the same purpose, and the portal still calling the insecure one. Three steps, all of them:

1. Build and save the new flow (below).
2. Point the portal at its URL.
3. **Turn the old flow off.** \`${FLOW_ID}\` — until it is off, the authentication bypass and the
   open mail relay are still reachable by anyone holding the old URL.

Do not send the new URL anywhere it will be recorded. It carries a \`sig=\` bearer token; it goes
into the portal configuration and nowhere else.

## 1 · Create the trigger

New instant cloud flow → **When an HTTP request is received**.

| Setting | Value |
| --- | --- |
| Method | \`${trigger.inputs.method}\` (show advanced options to reveal it) |
| Who can trigger the flow | **Anyone** |
| Request Body JSON Schema | the \`schema\` object in [\`Web_OTP_Verify.trigger.json\`](Web_OTP_Verify.trigger.json) |

Anyone is deliberate and is not an oversight: the document portal is public, so citizens outside
the tenant must be able to request and confirm a code. The identity checks inside the flow are the
control, which is what the patch is for.

## 2 · Create the variables — all ${variables.length}, in this order, before pasting anything

Power Automate accepts **Initialize variable** only at the top level of a flow, so these cannot
travel inside a pasted scope. Add them one after another, in this order. The pasted body reads and
writes every one; a missing one fails at run time with \`The variable 'name' is not defined\`.

| # | Name | Type | Value |
| --- | --- | --- | --- |
${vrows.join('\n')}

${unread.length ? `The live flow also declares ${unread.map((v) => '\`' + v.name + '\`').join(', ')}, referenced
nowhere in it. A fresh build does not inherit ${unread.length > 1 ? 'them' : 'it'}.

` : ''}## 3 · Paste the body

Copy the whole of
[\`Web_OTP_Verify.Scope_Global.designer-paste.json\`](Web_OTP_Verify.Scope_Global.designer-paste.json)
to the clipboard and paste it into the designer after the last variable. It arrives as one scope,
\`Scope_Global\`, holding the switch, both cases and the response.

It binds ${Object.keys(body.body.allConnectionData).length} connector action(s) to the tenant
connections this repository records. **Open each one and confirm the account is the one you
intend** — a bound connection is a working connection, not necessarily the right one.

## 4 · Optional — the telemetry scope

[\`Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json\`](Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json)
is the run-record capture from the old flow, offered separately rather than folded in, because on
a fresh build it is a decision rather than an inheritance:

- it emails **every run** to \`dgsRegistry@nitda.gov.ng\`, and this endpoint is anonymous, so the
  volume is whatever the internet sends it;
- the attachments include the flow's **full definition** on every call;
- it needs a \`shared_flowmanagement\` connection, which this repository has no recorded
  connection for — the designer will ask you to pick one.

Paste it after \`Scope_Global\` if you want it, and set it to run after \`Scope_Global\` has
**Succeeded, Failed, Skipped or Timed out**. Leaving it out costs nothing the flow needs to work.

## 5 · Save, then prove it

Saving is itself a check: the designer validates every \`item/<Column>\` against the connector at
save time and refuses the whole flow if a column is missing. \`OTP_Transactions.Attempts\` was
provisioned on 2026-09-03, so it saves.

Four calls, two mailboxes you control:

1. Generate for **A**, then verify that code claiming to be **B** → must **fail**.
2. Generate for **A**, verify as **A** → must **succeed**.
3. \`action: verify\` with an address and no valid code → **no mail may arrive**.
4. Six wrong guesses for **A** → the sixth returns **429**.

Then do step 2 and step 3 of "What this costs" above. The job is not done until the old flow is
off.
`;

files['README.md'] = `# Fresh-build kit — \`Web - OTP Verify\`

Generated. Start at [BUILD.md](BUILD.md).

| File | What it is |
| --- | --- |
| [BUILD.md](BUILD.md) | the procedure, and the two steps that must follow the build |
| [Web_OTP_Verify.trigger.json](Web_OTP_Verify.trigger.json) | the trigger to create by hand |
| [Web_OTP_Verify.Scope_Global.designer-paste.json](Web_OTP_Verify.Scope_Global.designer-paste.json) | the flow body, in the designer's clipboard format |
| [Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json](Web_OTP_Verify.Scope_Flow_Data_Capture.designer-paste.json) | optional run-record telemetry — read §4 before pasting it |

Regenerate with \`node scripts/build-otp-verify-fresh-flow.mjs\`; \`npm run test:freshflow\` fails
if these drift from the patched definition.
`;

const dir = path.join(ROOT, OUT);
const check = process.argv.includes('--check');
let stale = [];
mkdirSync(dir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const target = path.join(dir, name);
  if (check) {
    let cur = '';
    try { cur = readFileSync(target, 'utf8'); } catch { /* missing counts as stale */ }
    if (cur !== content) stale.push(name);
  } else {
    writeFileSync(target, content);
  }
}
if (check) {
  if (stale.length) {
    console.error(`❌ ${OUT} is stale — run: node scripts/build-otp-verify-fresh-flow.mjs\n   ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${variables.length} variables, ` +
              `${Object.keys(body.body.allConnectionData).length} bound connector action(s)`);
} else {
  console.log(`Wrote ${OUT}`);
  console.log(`  variables        ${variables.length}`);
  console.log(`  body scope       Scope_Global (${Object.keys(A.Scope_Global.actions).length} direct children)`);
  console.log(`  bound            ${Object.keys(body.body.allConnectionData).join(', ') || '(none)'}`);
  console.log(`  left to bind     ${body.unbound.join(', ') || '(none)'}`);
  console.log(`  telemetry scope  emitted separately; unbound: ${telemetry.unbound.join(', ') || '(none)'}`);
  console.log(`  dropped as dead  ${[...dead, ...unread.map((v) => v.name)].join(', ') || '(none)'}`);
}
