/* DGO_SEND_EMAIL addresses its mail from the payload, or this fails.
 *
 * The defect this package exists to close is not a crash. `Web - Send Email` sends every message
 * to a fixed mailbox and answers 200, so the officer is told their correspondence went to the
 * addressee while it went to the registry. Nothing observable at run time distinguishes the two.
 * That is why the recipient path is asserted here rather than left to a paste-time eyeball:
 * a regression would look exactly like success.
 *
 * tests/designer-paste-schema.test.mjs already knows the rules for a Scope payload, and
 * scripts/verify-connector-conformance.mjs knows the connector's. Neither knows what THIS flow
 * has to be true about — three desks that nest their recipient in three different places, an
 * endpoint that must not become an open relay, and a retry that must not send twice.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs/deployment/internal/flows/designer-paste');
const PASTE = join(DIR, 'DGO_SEND_EMAIL.designer-paste.json');
const VARS = join(DIR, 'DGO_SEND_EMAIL.variables.designer-paste.json');
const OUTBOX = '88a81ca1-319a-45f5-8409-f91a24538ffa';
const DIRECTORY = '3d591f5b-3f2f-409c-983a-a77b5c174834';
const O365_CONNECTION = 'c0b9e7a5b0854c39a435fd8ce92f48ad';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

console.log('\nDGO_SEND_EMAIL\n');

if (!existsSync(PASTE)) {
  console.log('  ❌ the package does not exist — run: npm run build:internalpaste');
  process.exit(1);
}
const raw = readFileSync(PASTE, 'utf8');
const pkg = JSON.parse(raw);
const sv = pkg.serializedValue;

/* Every action in the tree, by name, with the branch it sits in. */
const actions = new Map();
(function walk(a, path) {
  for (const [n, v] of Object.entries(a || {})) {
    if (!v || typeof v !== 'object') continue;
    actions.set(n, { ...v, __path: path });
    walk(v.actions, path.concat(n));
    walk(v.else?.actions, path.concat(n, 'else'));
    if (v.cases) for (const [cn, c] of Object.entries(v.cases)) walk(c.actions, path.concat(n, cn));
    walk(v.default?.actions, path.concat(n, 'default'));
  }
})(sv.actions, []);

/* ── 1. It is a clipboard package, and clipboard packages carry no trigger and no variables ── */
ok('the envelope is a Scope node the designer will accept',
  sv.type === 'Scope' && pkg.isScopeNode === true && pkg.mslaNode === true && typeof pkg.nodeId === 'string');
ok('it carries no trigger — a clipboard payload cannot',
  !('triggers' in sv) && !raw.includes('"Request"') && !raw.includes('"Recurrence"'));
ok('it declares no variable — Logic Apps accepts InitializeVariable only at the top level',
  ![...actions.values()].some((a) => a.type === 'InitializeVariable'));

/* ── 2. The recipient. The whole point of the package. ───────────────────────────────────── */
const mails = [...actions].filter(([, a]) => String(a.inputs?.host?.operationId || '').includes('SendEmail'));
ok('it sends mail', mails.length > 0);
ok('no send hard-codes a recipient — every To is an expression',
  mails.every(([, a]) => String(a.inputs.parameters['emailMessage/To']).startsWith('@')),
  mails.map(([n, a]) => `${n}: ${a.inputs.parameters['emailMessage/To']}`).join('\n     '));
ok('the registry mailbox appears nowhere in the package',
  !/dgsregistry@nitda\.gov\.ng/i.test(raw));

const recipient = actions.get('Compose_SendEmail_Recipients');
const rex = String(recipient?.inputs || '');
ok('the recipient reads the correspondence desk shape (payload.email.to)',
  rex.includes("['payload']?['email']?['to']"), rex);
ok('the recipient reads the statistics desk shape (payload.to, an array)',
  rex.includes("['payload']?['to']"), rex);
ok('the recipient falls back to the envelope userEmail, which the reports desk relies on',
  rex.includes("triggerBody()?['userEmail']"), rex);
ok('the array and the string are handled by one expression, with no type test',
  /join\(array\(/.test(rex), rex);

/* ── 3. Fail closed, four ways ───────────────────────────────────────────────────────────── */
ok('an unaddressed request is refused with 400, not sent anywhere',
  actions.has('Set_variable_varStatusCode_SendEmail_400')
  && String(actions.get('Set_variable_varData_SendEmail_Invalid')?.inputs?.value?.code) === 'INVALID_REQUEST');
ok('the caller is resolved against DGO_UserDirectory and must be active',
  [...actions.values()].some((a) => a.inputs?.parameters?.table === DIRECTORY
    && /Status eq ''active''/.test(String(a.inputs.parameters.$filter))));
ok('an unknown caller is refused with 401 — this endpoint sends as the registry mailbox',
  actions.has('Set_variable_varStatusCode_SendEmail_401'));
ok('a refused send answers 5xx rather than reporting success',
  [...actions].filter(([n]) => n.startsWith('Set_variable_varStatusCode_SendEmail_'))
    .some(([, a]) => /,502\)/.test(String(a.inputs?.value))));

/* ── 4. A retry must not send twice ──────────────────────────────────────────────────────── */
ok('the outbox is READ before sending, keyed on the receipt title',
  [...actions.values()].some((a) => a.inputs?.parameters?.table === OUTBOX
    && a.inputs.host.operationId === 'GetItems'));
ok('the idempotency key is the requestId, which the client reuses across its retry loop',
  /varRequestId/.test(String(actions.get('Compose_SendEmail_Receipt_Title')?.inputs || '')));
ok('only a receipt that says `sent` suppresses a send — a failed one must be retryable',
  /'sent'\)\)$/.test(String(actions.get('Compose_SendEmail_Already_Sent')?.inputs || '')),
  String(actions.get('Compose_SendEmail_Already_Sent')?.inputs || ''));
ok('a duplicate is answered without a second send',
  actions.has('Set_variable_varData_SendEmail_Duplicate')
  && actions.get('Set_variable_varData_SendEmail_Duplicate').inputs.value.duplicate === true);

/* ── 5. Every send leaves a receipt, whichever way it went ───────────────────────────────── */
const receipts = [...actions].filter(([, a]) => a.inputs?.parameters?.table === OUTBOX
  && a.inputs.host.operationId === 'PostItem');
ok('one outbox receipt per send', receipts.length === mails.length,
  `${mails.length} send(s), ${receipts.length} receipt(s)`);
ok('each receipt runs whichever way its send went',
  receipts.every(([, a]) => ['Succeeded', 'Failed', 'TimedOut', 'Skipped']
    .every((s) => Object.values(a.runAfter)[0].includes(s))));
ok('each receipt records the send outcome rather than assuming it',
  receipts.every(([, a]) => /^@if\(equals\(actions\('/.test(String(a.inputs.parameters['item/Status']))
    && String(a.inputs.parameters['item/Status']).includes("'sent','failed'")));
ok('a receipt that cannot be written does not turn a delivered message into an error',
  receipts.every(([n]) => [...actions.values()].some((a) => a.runAfter?.[n]?.includes('Failed'))));

/* ── 6. Attachments: two shapes, kept apart, nothing fabricated ──────────────────────────── */
const withFiles = mails.filter(([, a]) => 'emailMessage/Attachments' in a.inputs.parameters);
ok('exactly one send carries emailMessage/Attachments — a parameter cannot be conditionally absent',
  withFiles.length === 1 && mails.length - withFiles.length === 1);
ok('nothing invents ContentBytes for an attachment the request did not carry',
  !/ContentBytes/i.test(raw));

/* ── 7. Bindings and integrity ───────────────────────────────────────────────────────────── */
const openApi = [...actions].filter(([, a]) => a.type === 'OpenApiConnection').map(([n]) => n);
ok('every connector action arrives bound — no connection picker on paste',
  openApi.every((n) => pkg.allConnectionData?.[n]?.connectionReference?.connection?.id));
ok('mail is bound to the decided sending mailbox connection',
  mails.every(([n]) => pkg.allConnectionData[n].connectionReference.connectionName === O365_CONNECTION));

/* A runAfter naming an action that is not its sibling is accepted by the paste and refused by
   the save, with a message that names neither action. */
const siblings = new Map();
(function collect(a, key) {
  const names = Object.keys(a || {});
  for (const n of names) siblings.set(n, key);
  for (const [n, v] of Object.entries(a || {})) {
    if (!v || typeof v !== 'object') continue;
    collect(v.actions, n); collect(v.else?.actions, n + ':else');
    if (v.cases) for (const [cn, c] of Object.entries(v.cases)) collect(c.actions, n + ':' + cn);
    collect(v.default?.actions, n + ':default');
  }
})(sv.actions, '');
const strays = [];
for (const [n, a] of actions) {
  for (const dep of Object.keys(a.runAfter || {})) {
    if (siblings.get(dep) !== siblings.get(n)) strays.push(`${n} runs after ${dep}, which is not its sibling`);
  }
}
ok('every runAfter names a sibling — the designer refuses the save otherwise', strays.length === 0,
  strays.join('\n     '));

/* ── 8. The prerequisites travel with it ─────────────────────────────────────────────────── */
const used = new Set([...raw.matchAll(/variables\('(var[A-Za-z]+)'\)/g)].map((m) => m[1]));
for (const m of raw.matchAll(/"name":"(var[A-Za-z]+)"/g)) used.add(m[1]);
const declared = new Set(Object.values(JSON.parse(readFileSync(VARS, 'utf8')).serializedValue.actions)
  .map((a) => a.inputs.variables[0].name));
const missing = [...used].filter((v) => !declared.has(v));
ok('every variable the scope reads or writes is declared in its companion package',
  missing.length === 0, missing.join(', '));

/* ── 9. No credential travels with it ────────────────────────────────────────────────────── */
ok('the package carries no trigger URL and no signature',
  !/sig=/.test(raw) && !/logic\.azure\.com|api\.powerplatform\.com/.test(raw));

console.log(`\n${failed ? '❌' : '✅'} DGO_SEND_EMAIL: ${failed} failed\n`);
process.exit(failed ? 1 : 0);
