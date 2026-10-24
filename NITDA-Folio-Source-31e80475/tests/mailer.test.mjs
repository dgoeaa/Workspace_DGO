#!/usr/bin/env node
/**
 * The DGO Correspondence Mailer: its flows, its data and its merge logic.
 *
 * WHY THIS EXISTS
 *
 * A Power Automate definition is not compiled until someone imports it into a tenant, so a
 * misspelled function, an action that references one that does not exist, or a runAfter that
 * names nothing all survive until the import dialog — or worse, until the first real letter.
 * This suite parses every expression in every generated flow and resolves every reference,
 * so those failures happen here instead.
 *
 * It also holds the contract the SPA relies on: HTTP triggers only, a fail-closed operator
 * key, no hard-coded recipient, the allowlist ahead of the send, the validationOnly branch
 * ahead of every write, and the idempotency check ahead of the mailbox.
 *
 * Run:  node tests/mailer.test.mjs
 * Exit: 0 = all checks pass, 1 = otherwise
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAll, FLOWS, MAILER, LIST_SCHEMA } from '../scripts/build-mailer-flows.mjs';
import { openZip } from '../scripts/lib/zip-reader.mjs';
import { merge, fieldsIn } from '../mailer/js/merge.js';
import { fileMatchesKey, domainAllowed, parseCsv, toCsv, letterDate } from '../mailer/js/util.js';
import { buildMessages, newCampaign, sendRequest } from '../mailer/js/campaign.js';
import { SEED_DIRECTORY } from '../mailer/js/seed-directory.js';
import { SEED_TEMPLATES } from '../mailer/js/seed-templates.js';
import { createMockFlows, KEYS as MOCK_KEYS } from '../scripts/mailer-mock-flows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${detail ? `\n     ${detail}` : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

console.log('\nDGO Correspondence Mailer');

/* ================================================================== *
 * 1. The committed flows are what the generator writes
 * ================================================================== */
section('Generated artefacts');
const files = buildAll();
const drift = Object.entries(files).filter(([rel, buf]) => {
  const abs = path.join(ROOT, 'mailer', 'flows', rel);
  return !fs.existsSync(abs) || !fs.readFileSync(abs).equals(buf);
}).map(([rel]) => rel);
ok('mailer/flows matches scripts/build-mailer-flows.mjs byte for byte', drift.length === 0, `stale: ${drift.join(', ')} — run npm run mailer:flows`);
ok('there are exactly seven flows, the sign-in flow and the shared-data flow among them', FLOWS.length === 7 && FLOWS.some((f) => f.key === 'MAIL_AUTH') && FLOWS.some((f) => f.key === 'MAIL_DATA'));

/* ================================================================== *
 * 2. A static checker for Workflow Definition Language expressions
 * ================================================================== */

const KNOWN_FUNCTIONS = new Set([
  'outputs', 'body', 'actions', 'items', 'item', 'triggerBody', 'workflow', 'parameters', 'variables', 'result',
  'concat', 'replace', 'string', 'substring', 'take', 'min', 'max', 'length', 'toLower', 'trim', 'coalesce', 'guid',
  'equals', 'not', 'and', 'or', 'if', 'contains', 'createArray', 'startsWith', 'greaterOrEquals', 'greater',
  'less', 'join', 'skip', 'split', 'last', 'first', 'sub', 'union', 'empty', 'int', 'encodeUriComponent', 'utcNow', 'json',
  /* sign-in and shared files (DGO_MAIL_AUTH, DGO_MAIL_DATA) — each in Microsoft's WDL function reference */
  'rand', 'add', 'addMinutes', 'addHours', 'ticks', 'base64', 'base64ToBinary', 'uriPath',
  /* 2.0.6: the in-progress window (DGO_MAIL_SEND) and the log's date filter (DGO_MAIL_LOG) */
  'mul', 'formatDateTime',
]);

/** Tokenise and parse one expression; returns the function calls it makes, or throws. */
function parseExpression(src) {
  const calls = [];
  let i = 0;
  const ws = () => { while (/\s/.test(src[i] || '')) i++; };
  const expect = (c) => { ws(); if (src[i] !== c) throw new Error(`expected '${c}' at ${i} in: ${src}`); i++; };
  function literal() {
    i++; let out = '';
    for (;;) {
      if (i >= src.length) throw new Error(`unterminated string in: ${src}`);
      if (src[i] === "'") { if (src[i + 1] === "'") { out += "'"; i += 2; continue; } i++; return out; }
      out += src[i++];
    }
  }
  function primary() {
    ws();
    if (src[i] === "'") return { str: literal() };
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return {}; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!id) throw new Error(`unexpected '${src[i]}' at ${i} in: ${src}`);
    i += id[0].length;
    if (['true', 'false', 'null'].includes(id[0])) return {};
    expect('(');
    const args = [];
    ws();
    if (src[i] !== ')') {
      for (;;) { args.push(expr()); ws(); if (src[i] === ',') { i++; continue; } break; }
    }
    expect(')');
    calls.push({ fn: id[0], args });
    return { fn: id[0], args };
  }
  function expr() {
    const p = primary();
    for (;;) {
      ws();
      if (src[i] === '?' && (src[i + 1] === '[' || src[i + 1] === '.')) i++;
      if (src[i] === '[') { i++; expr(); expect(']'); continue; }
      if (src[i] === '.' && /[A-Za-z_]/.test(src[i + 1] || '')) { i++; while (/[A-Za-z0-9_]/.test(src[i] || '')) i++; continue; }
      return p;
    }
  }
  expr();
  ws();
  if (i !== src.length) throw new Error(`trailing input at ${i} in: ${src}`);
  return calls;
}

/** Every expression inside a JSON string value: whole-value "@…" and interpolated "@{…}". */
function expressionsIn(value) {
  if (typeof value !== 'string' || !value.includes('@')) return [];
  if (value.startsWith('@@')) return [];
  if (value.startsWith('@') && !value.startsWith('@{')) return [value.slice(1)];
  const out = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '@' && value[i + 1] === '{') {
      let depth = 0; let j = i + 1; let inStr = false;
      for (; j < value.length; j++) {
        const c = value[j];
        if (inStr) { if (c === "'") { if (value[j + 1] === "'") j++; else inStr = false; } continue; }
        if (c === "'") inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
      }
      out.push(value.slice(i + 2, j));
      i = j;
    }
  }
  return out;
}

function walkStrings(node, visit, trail = []) {
  if (typeof node === 'string') visit(node, trail);
  else if (Array.isArray(node)) node.forEach((v, k) => walkStrings(v, visit, trail.concat(k)));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walkStrings(v, visit, trail.concat(k));
}

/** Every action in a definition, with its container (for runAfter) and enclosing foreach.
 *  Names seen more than once are recorded in `all.duplicates`. */
function collectActions(defActions) {
  const all = new Map();
  all.duplicates = [];
  (function walk(actions, scope, loops) {
    for (const [name, a] of Object.entries(actions || {})) {
      if (all.has(name)) all.duplicates.push(name);
      all.set(name, { ...a, __scope: scope, __loops: loops });
      const inner = a.type === 'Foreach' ? loops.concat(name) : loops;
      walk(a.actions, a.actions, inner);
      walk(a.else?.actions, a.else?.actions, inner);
      for (const c of Object.values(a.cases || {})) walk(c.actions, c.actions, inner);
      walk(a.default?.actions, a.default?.actions, inner);
    }
  })(defActions, defActions, []);
  return all;
}

section('Flow definitions');
for (const flow of FLOWS) {
  const def = JSON.parse(files[`definitions/${flow.name}.definition.json`]);
  const actions = collectActions(def.actions);
  const tag = flow.name;

  ok(`${tag}: every action name is unique across the whole flow (Logic Apps rejects duplicates)`, actions.duplicates.length === 0, [...new Set(actions.duplicates)].join(', '));

  const triggers = Object.values(def.triggers);
  ok(`${tag}: its only trigger is an HTTP request`, triggers.length === 1 && triggers[0].type === 'Request' && triggers[0].kind === 'Http');
  ok(`${tag}: the trigger is callable from the SPA with its signed URL`, triggers[0].inputs.triggerAuthenticationType === 'All');

  const parseErrors = [];
  const unknown = new Set();
  const badRefs = new Set();
  const variables = new Set([...actions.values()].filter((a) => a.type === 'InitializeVariable').flatMap((a) => a.inputs.variables.map((v) => v.name)));
  walkStrings(def.actions, (s, trail) => {
    for (const e of expressionsIn(s)) {
      let calls;
      try { calls = parseExpression(e); } catch (err) { parseErrors.push(`${trail.join('.')}: ${err.message}`); continue; }
      for (const c of calls) {
        if (!KNOWN_FUNCTIONS.has(c.fn)) unknown.add(c.fn);
        const target = c.args[0]?.str;
        if (['outputs', 'body', 'actions', 'result'].includes(c.fn) && !actions.has(target)) badRefs.add(`${c.fn}('${target}')`);
        if (c.fn === 'items' && actions.get(target)?.type !== 'Foreach') badRefs.add(`items('${target}')`);
        if (c.fn === 'variables' && !variables.has(target)) badRefs.add(`variables('${target}')`);
      }
    }
  });
  ok(`${tag}: every expression parses`, parseErrors.length === 0, parseErrors.slice(0, 5).join('\n     '));
  ok(`${tag}: every function is a real Workflow Definition Language function`, unknown.size === 0, [...unknown].join(', '));
  ok(`${tag}: every action, loop and variable an expression names exists`, badRefs.size === 0, [...badRefs].join(', '));

  const badRunAfter = [];
  for (const [name, a] of actions) {
    for (const dep of Object.keys(a.runAfter || {})) if (!(dep in a.__scope)) badRunAfter.push(`${name} → ${dep}`);
  }
  ok(`${tag}: every runAfter names a sibling action`, badRunAfter.length === 0, badRunAfter.join(', '));

  const responses = [...actions].filter(([, a]) => a.type === 'Response');
  ok(`${tag}: no Response sits inside a loop (Power Automate rejects that)`, responses.every(([, a]) => a.__loops.length === 0));
  ok(`${tag}: every Response carries CORS headers and JSON`, responses.every(([, a]) => a.inputs.headers['Access-Control-Allow-Origin'] === "@outputs('Compose_Config')?['allowedOrigin']" && a.inputs.headers.Vary === 'Origin' && a.inputs.headers['Content-Type'] === 'application/json'));

  const itemMisuse = [];
  for (const [name, a] of actions) {
    walkStrings({ ...a, actions: undefined, else: undefined, cases: undefined, default: undefined, __scope: undefined, __loops: undefined }, (s, trail) => {
      if (/\bitem\(\)/.test(s) && !['Query', 'Select'].includes(a.type)) itemMisuse.push(`${name}.${trail.join('.')}`);
    });
  }
  ok(`${tag}: item() is used only inside Filter array and Select`, itemMisuse.length === 0, itemMisuse.join(', '));

  const cfg = def.actions.Compose_Config.inputs;
  ok(`${tag}: Compose_Config names the key this flow serves`, cfg.endpointKey === flow.key);
  ok(`${tag}: ships with a placeholder operator key, so it fails closed until configured`, cfg.operatorKey.startsWith('__'));
  ok(`${tag}: only the platform's host may read its answers, not every origin`, cfg.allowedOrigin === 'https://folio-platform.page.gd');
  const sw = def.actions.Scope_Try.actions.Switch_Operation;
  const caseNames = Object.values(sw.cases).map((c) => c.case);
  ok(`${tag}: answers healthCheck and verify`, caseNames.includes('healthcheck') && caseNames.includes('verify'));
  ok(`${tag}: implements its declared operations`, flow.operations.every((o) => caseNames.includes(o.toLowerCase())), caseNames.join(', '));
  ok(`${tag}: refuses an unconfigured flow, and anyone not signed in, before any operation runs`,
    def.actions.Condition_Check_Session.runAfter.Condition_Refuse_Unconfigured && def.actions.Compose_Caller.runAfter.Condition_Check_Session
    && def.actions.Condition_Refuse_Unauthorised.runAfter.Compose_Caller && def.actions.Scope_Try.runAfter.Condition_Refuse_Unauthorised
    && JSON.stringify(def.actions.Condition_Refuse_Unauthorised).includes('SIGN_IN_REQUIRED'));
  const sessionLookup = JSON.stringify(def.actions.Condition_Check_Session.actions);
  const activeFilter = JSON.stringify(def.actions.Condition_Check_Session.actions.Filter_Active_Session?.inputs?.where || '');
  ok(`${tag}: a session counts only while active, unexpired, holding this token, and its operator is still active`,
    activeFilter.includes("equals(string(item()?['Status']), 'Active')") && activeFilter.includes("ticks(utcNow())") && activeFilter.includes("item()?['Token']")
    && sessionLookup.includes("Active eq 1"));
  /* SharePoint refused a filter on a custom column on the tenant; the session is found by Title. */
  ok(`${tag}: the session is looked up by Title only`,
    /\$filter=', encodeUriComponent\(concat\('Title eq '''/.test(def.actions.Condition_Check_Session.actions.SP_Find_Session.inputs.parameters['parameters/uri'])
    && !/Status eq|Token eq|\$select/.test(def.actions.Condition_Check_Session.actions.SP_Find_Session.inputs.parameters['parameters/uri']));
  const caller = JSON.stringify(def.actions.Compose_Caller.inputs);
  ok(`${tag}: who is calling comes from the session (or setup's admin key), never from the request alone`,
    caller.includes("variables('varCallerSessions')") && caller.includes("variables('varCallerOperators')") && caller.includes('isAdmin')
    && JSON.stringify(def.actions.Condition_Check_Session.actions.Set_varCallerSessions.inputs).includes("body('Filter_Active_Session')"));
  /* On a real tenant, a step that runs on every call and reads a look-up that was skipped
     stopped every flow before it answered (HTTP 502 NoResponse). No such read may remain. */
  const inner = Object.keys(def.actions.Condition_Check_Session.actions);
  const everyCall = ['Compose_Caller', 'Condition_Refuse_Unauthorised', 'Condition_Refuse_Unconfigured', 'Compose_Request'].map((n) => JSON.stringify(def.actions[n] || {})).join('');
  ok(`${tag}: nothing that runs on every call reads the sign-in look-ups, which are skipped for open calls`,
    inner.every((n) => !everyCall.includes(`('${n}')`)), inner.filter((n) => everyCall.includes(`('${n}')`)).join());
  ok(`${tag}: the caller is still worked out when a sign-in look-up fails, so the call is refused rather than left unanswered`,
    JSON.stringify(def.actions.Compose_Caller.runAfter.Condition_Check_Session) === JSON.stringify(['Succeeded', 'Failed', 'TimedOut'])
    && def.actions.Initialize_varCallerSessions?.type === 'InitializeVariable' && def.actions.Initialize_varCallerOperators?.type === 'InitializeVariable');
  const openExpr = JSON.stringify(def.actions.Condition_Check_Session.expression);
  const openOps = (openExpr.match(/contains\(createArray\(([^)]*)\)/)?.[1] || '').split(',').map((x) => x.trim().replace(/'/g, '')).sort();
  ok(`${tag}: only health, identity${flow.key === 'MAIL_AUTH' ? ' and the two sign-in steps' : ''} are open without signing in`,
    openOps.join() === ['healthcheck', 'verify', ...(flow.key === 'MAIL_AUTH' ? ['requestcode', 'verifycode'] : [])].sort().join()
    && JSON.stringify(def.actions.Condition_Refuse_Unauthorised.expression) === JSON.stringify({ and: [{ equals: [`@and(not(${openExpr.match(/@(contains\(createArray\([^)]*\), outputs\('Compose_Request'\)\?\['operation'\]\))/)[1]}), not(outputs('Compose_Caller')?['authenticated']))`, true] }] }), openOps.join());
  const health = sw.cases.HealthCheck.actions;
  ok(`${tag}: healthCheck echoes validationOnly and names its own key (HEALTH_CONTRACT.md)`,
    health.Respond_Health.inputs.body.validationOnly === true && health.Respond_Health.inputs.body.endpoint.key === "@outputs('Compose_Config')?['endpointKey']");
  ok(`${tag}: verify echoes the correlation id`, sw.cases.Verify.actions.Respond_Verify.inputs.body.correlationId === "@triggerBody()?['_platform']?['correlationId']");

  const usedConnections = new Set([...actions.values()].map((a) => a.inputs?.host?.connectionName).filter(Boolean));
  ok(`${tag}: uses exactly the connectors it declares`, JSON.stringify([...usedConnections].sort()) === JSON.stringify(flow.apis.map((x) => `shared_${x}`).sort()), [...usedConnections].join(', '));
}

section('DGO_MAIL_SEND — the rules that stop it being a relay');
{
  const def = JSON.parse(files['definitions/DGO_MAIL_SEND.definition.json']);
  const send = def.actions.Scope_Try.actions.Switch_Operation.cases.Send.actions;
  const all = collectActions(def.actions);
  const mails = [...all].filter(([, a]) => /SendEmailV2/.test(a.inputs?.host?.operationId || ''));
  ok('it sends through Office 365 Outlook, as the connection or from a shared mailbox', mails.length === 2
    && mails.some(([, a]) => a.inputs.host.operationId === 'SendEmailV2') && mails.some(([, a]) => a.inputs.host.operationId === 'SharedMailboxSendEmailV2'));
  ok('no send hard-codes a recipient', mails.every(([, a]) => a.inputs.parameters['emailMessage/To'] === "@join(outputs('Compose_Message')?['to'], ';')"));
  ok('attachments come from the request, name and content', mails.every(([, a]) => a.inputs.parameters['emailMessage/Attachments'] === "@body('Select_Attachments')")
    && send.Select_Attachments.inputs.select.ContentBytes === "@item()?['contentBase64']");
  ok('the allowlist filter checks every To, Cc and Bcc', send.Filter_Disallowed_Recipients.inputs.from === "@outputs('Compose_Message')?['recipients']"
    && send.Compose_Message.inputs.recipients.startsWith('@union('));
  ok(`the allowlist is ${MAILER.allowedSuffixes.join(' and ')}`, JSON.stringify(def.actions.Compose_Config.inputs.allowedSuffixes) === JSON.stringify(MAILER.allowedSuffixes));

  /* Order of the send case, by following runAfter from the first action. */
  const order = [];
  const pending = new Map(Object.entries(send));
  while (pending.size) {
    const next = [...pending].find(([, a]) => Object.keys(a.runAfter || {}).every((d) => order.includes(d)) && Object.values(a.runAfter || {}).every((s) => s.includes('Succeeded')));
    if (!next) break;
    order.push(next[0]); pending.delete(next[0]);
  }
  const at = (n) => order.indexOf(n);
  ok('invalid requests are refused before anything is written', at('Condition_Refuse_Invalid') < at('SP_Create_Log'));
  ok('validationOnly stops before the first write', at('Condition_Stop_If_ValidationOnly') < at('SP_Find_Sent') && at('Condition_Stop_If_ValidationOnly') < at('SP_Create_Log'));
  ok('a messageId already Sent is answered from the log, not mailed again', at('Condition_Already_Sent') < at('Scope_Send'));
  ok('the log row exists before the mail goes, so every send is traceable', at('SP_Create_Log') < at('Scope_Send'));
  ok('a failed send is logged Failed and answered 502', send.SP_Mark_Failed.runAfter.Compose_Failed_Item && send.Respond_Send_Failed.inputs.statusCode === 502
    && send.Compose_Send_Error.runAfter.Scope_Send.includes('Failed'));
  ok('a log update that fails after a successful send still answers Sent (the mail went)', send.Respond_Sent.runAfter.SP_Mark_Sent.includes('Failed'));
}

section('DGO_MAIL_PROVISION');
{
  const def = JSON.parse(files['definitions/DGO_MAIL_PROVISION.definition.json']);
  const lists = def.actions.Compose_Config.inputs.lists;
  ok('it provisions the three lists the other flows use', JSON.stringify(lists.map((l) => l.title)) === JSON.stringify(Object.values(MAILER.lists)));
  ok('every column the send flow writes is provisioned', (() => {
    const send = JSON.parse(files['definitions/DGO_MAIL_SEND.definition.json']).actions.Scope_Try.actions.Switch_Operation.cases.Send.actions;
    const cols = new Set(lists.find((l) => l.title === MAILER.lists.log).fields.map((f) => f.name).concat('Title'));
    return Object.keys(send.Compose_Log_Item.inputs).every((c) => cols.has(c));
  })());
  ok('every column the directory flow writes is provisioned', (() => {
    const d = JSON.parse(files['definitions/DGO_MAIL_DIRECTORY.definition.json']).actions.Scope_Try.actions.Switch_Operation.cases.Upsert.actions;
    const cols = new Set(lists.find((l) => l.title === MAILER.lists.directory).fields.map((f) => f.name).concat('Title'));
    return Object.keys(d.Compose_Item.inputs).every((c) => cols.has(c));
  })());
  ok('every column XML is well formed', LIST_SCHEMA.every((l) => l.fields.every((f) => /^<Field [^>]*Name="\w+"[^>]*(\/>|>.*<\/Field>)$/.test(f.xml))));
  const each = def.actions.Scope_Try.actions.Switch_Operation.cases.Provision.actions.Apply_to_each_List;
  ok('list creation is skipped in plan mode', JSON.stringify(each.actions.Condition_Create_List.expression).includes("validationOnly"));
  ok('column creation is skipped in plan mode', JSON.stringify(each.actions.Condition_Create_Fields.expression).includes("validationOnly"));
}

section('2.0.6 hardening in the flows');
{
  const defOf = (n) => JSON.parse(files[`definitions/${n}.definition.json`]);
  const casesOf = (n) => defOf(n).actions.Scope_Try.actions.Switch_Operation.cases;
  const send = defOf('DGO_MAIL_SEND');
  const sendActs = casesOf('DGO_MAIL_SEND').Send.actions;
  ok('DGO_MAIL_SEND sets no trigger concurrency limit, which Power Automate refuses beside a Response action', !send.triggers.manual.runtimeConfiguration?.concurrency);
  ok('the duplicate check finds every row for the message by Title, then picks Sent and Sending rows in the flow',
    /Title eq/.test(sendActs.SP_Find_Sent.inputs.parameters['parameters/uri']) && !/Status eq/.test(sendActs.SP_Find_Sent.inputs.parameters['parameters/uri'])
    && JSON.stringify(sendActs.Filter_Already_Sent.inputs).includes("'Sent'") && JSON.stringify(sendActs.Filter_In_Progress.inputs).includes("'Sending'"));
  ok('a message still being sent is refused 409 IN_PROGRESS before the mailbox is touched',
    sendActs.Condition_In_Progress.actions.Condition_In_Progress_Respond.inputs.statusCode === 409
    && JSON.stringify(sendActs.Condition_In_Progress).includes('IN_PROGRESS') && sendActs.Select_Attachment_Names.runAfter.Condition_In_Progress);
  ok('the in-progress window is a setting in Compose_Config', send.actions.Compose_Config.inputs.inProgressMinutes === MAILER.inProgressMinutes && MAILER.inProgressMinutes > 0);
  for (const flow of FLOWS) {
    const def = defOf(flow.name);
    const guardJson = JSON.stringify(def.actions.Condition_Refuse_Unauthorised);
    ok(`${flow.name}: a failed sign-in look-up answers 503 SIGN_IN_CHECK_FAILED, not a sign-out`,
      guardJson.includes('SIGN_IN_CHECK_FAILED') && guardJson.includes('503') && def.actions.Compose_Caller.inputs.lookupFailed.includes("actions('Condition_Check_Session')"));
  }
  const privateLists = LIST_SCHEMA.filter((l) => l.private).map((l) => l.title).sort();
  ok('the operators, sessions, send log, mailings and templates lists are private',
    JSON.stringify(privateLists) === JSON.stringify([MAILER.lists.campaigns, MAILER.lists.log, MAILER.lists.operators, MAILER.lists.sessions, MAILER.lists.templates].sort()), privateLists.join());
  const each = casesOf('DGO_MAIL_PROVISION').Provision.actions.Apply_to_each_List.actions;
  const present = each.Condition_List_Present.actions;
  ok('a private list is made private on every run in which it exists, not only when it is created',
    !JSON.stringify(each.Condition_Create_List).includes('breakroleinheritance') && JSON.stringify(present.Condition_Make_Private).includes('breakroleinheritance')
    && present.SP_Get_List_Permissions && present.Condition_Make_Private.runAfter.SP_Get_List_Permissions);
  ok('its permissions are read only from a list that exists, and nothing in the loop may fail, so a plan is always answered',
    !each.SP_Get_List_Permissions && JSON.stringify(present.Condition_Make_Private.runAfter.SP_Get_List_Permissions) === JSON.stringify(['Succeeded']));
  ok('it checks HasUniqueRoleAssignments first, and never breaks inheritance in plan mode',
    JSON.stringify(present.Condition_Make_Private.expression).includes('HasUniqueRoleAssignments') && JSON.stringify(present.Condition_Make_Private.expression).includes('validationOnly'));
  ok('the provisioning report says whether each list really is private', each.Append_Report.inputs.value.isPrivate === "@variables('varListPrivate')"
    && JSON.stringify(present.Set_varListPrivate.inputs.value).includes('HasUniqueRoleAssignments'));
  const verify = casesOf('DGO_MAIL_AUTH').VerifyCode.actions;
  ok('a sign-in try is counted, with the row\'s ETag, before the code is compared',
    verify.SP_Count_Attempt.inputs.parameters['parameters/headers']['IF-MATCH'].includes("['__metadata']?['etag']")
    && verify.Condition_Code_Wrong.runAfter.Condition_Too_Many_Attempts && verify.Condition_Too_Many_Attempts.runAfter.Condition_Attempt_Not_Counted
    && verify.Condition_Attempt_Not_Counted.runAfter.SP_Count_Attempt);
  ok('a try whose count could not be written is refused unchecked (TRY_AGAIN)', JSON.stringify(verify.Condition_Attempt_Not_Counted).includes('TRY_AGAIN')
    && JSON.stringify(verify.Condition_Attempt_Not_Counted.runAfter.SP_Count_Attempt) === JSON.stringify(['Succeeded', 'Failed', 'TimedOut']));
  const logList = casesOf('DGO_MAIL_LOG').List.actions;
  ok('DGO_MAIL_LOG re-formats "since" as a date, and filters in the flow, never in the SharePoint query',
    logList.Compose_Since.inputs.startsWith('@formatDateTime(') && !/\$filter/.test(logList.SP_Get_Log.inputs.parameters['parameters/uri'])
    && JSON.stringify(logList.Filter_Log.inputs).includes("ticks(outputs('Compose_Since'))") && JSON.stringify(logList.Condition_Since_Invalid).includes('BAD_SINCE'));
  const data = casesOf('DGO_MAIL_DATA');
  ok('DGO_MAIL_DATA refuses a file name with "/" or "\\" before touching the library',
    ['UploadFile', 'DownloadFile', 'DeleteFile'].every((c) => JSON.stringify(data[c]).includes('BAD_FILE_NAME'))
    && data.DownloadFile.actions.SP_Get_File_Content.runAfter.Condition_Download_Name_Unsafe && data.DeleteFile.actions.Condition_Delete_File_ValidationOnly.runAfter.Condition_Delete_Name_Unsafe);
  const probe = (n) => casesOf(n).HealthCheck.actions.SP_Health_Probe.inputs.parameters['parameters/uri'];
  ok('each healthCheck looks for the lists that flow uses, and names them',
    probe('DGO_MAIL_AUTH').includes('sessionsList') && probe('DGO_MAIL_DATA').includes('campaignsList') && probe('DGO_MAIL_DATA').includes('filesLibrary')
    && !probe('DGO_MAIL_AUTH').includes('directoryList') && FLOWS.every((f) => JSON.stringify(casesOf(f.name).HealthCheck.actions.Respond_Health.inputs.body.data.listsExpected).includes('operatorsList')));
}

section('Every step reads only steps that ran');
/* Proven on the tenant: a step that reads the output of a step that was skipped stops the run
   without an answer (HTTP 502 NoResponse), while reading a skipped step's status is fine. So a
   step may read another step's body/outputs/result only when that step is certain to have run
   first: it is reached through runAfter edges that never include "Skipped", directly or from an
   enclosing Condition, Switch, Scope or loop. */
for (const flow of FLOWS) {
  const def = JSON.parse(files[`definitions/${flow.name}.definition.json`]);
  const idx = {};
  const walk = (actions, parents) => {
    for (const [n, a] of Object.entries(actions || {})) {
      idx[n] = { a, parents, siblings: actions };
      const inner = [a.actions, a.else?.actions, a.default?.actions, ...Object.values(a.cases || {}).map((c) => c.actions)].filter(Boolean);
      for (const x of inner) walk(x, [...parents, n]);
    }
  };
  walk(def.actions, []);
  const ranBefore = (n, seen = new Set()) => {
    for (const [p, states] of Object.entries(idx[n].a.runAfter || {})) {
      if (states.includes('Skipped') || seen.has(p)) continue;
      seen.add(p);
      ranBefore(p, seen);
    }
    for (const c of idx[n].parents) { if (!seen.has(c)) { seen.add(c); ranBefore(c, seen); } }
    return seen;
  };
  const bad = [];
  for (const [n, { a }] of Object.entries(idx)) {
    const text = JSON.stringify({ inputs: a.inputs, expression: a.expression, foreach: a.foreach }).replace(/actions\('[A-Za-z0-9_]+'\)\?\['status'\]/g, '');
    const ran = ranBefore(n);
    for (const m of text.matchAll(/\b(actions|body|outputs|result)\('([A-Za-z0-9_]+)'\)/g)) {
      if (!idx[m[2]]) bad.push(`${n} reads ${m[1]}('${m[2]}'), which does not exist`);
      else if (!ran.has(m[2])) bad.push(`${n} reads ${m[1]}('${m[2]}'), which may not have run`);
    }
  }
  ok(`${flow.name}: no step reads the output of a step that may have been skipped`, bad.length === 0, [...new Set(bad)].join('; '));
}

section('SharePoint queries use only what the tenant accepted');
/* On the tenant SharePoint answered "Value does not fall within the expected range" to an items
   query filtering on the custom Status column. Every items query now filters on Title (with
   Active on the operator list, proven there) and nothing else. */
for (const flow of FLOWS) {
  const def = JSON.parse(files[`definitions/${flow.name}.definition.json`]);
  const bad = [];
  const walk = (as) => {
    for (const [n, a] of Object.entries(as || {})) {
      const u = a.inputs?.parameters?.['parameters/uri'];
      if (typeof u === 'string' && /\/items/.test(u) && /\$filter/.test(u)) {
        const fields = [...u.matchAll(/'([A-Za-z]+) (eq|ne|gt|ge|lt|le) /g)].map((m) => m[1]).concat([...u.matchAll(/''' and ([A-Za-z]+) (eq|ne|gt|ge|lt|le) /g)].map((m) => m[1]));
        const off = fields.filter((f) => !['Title', 'Active'].includes(f));
        if (off.length) bad.push(`${n}: filters on ${off.join(', ')}`);
      }
      for (const x of [a.actions, a.else?.actions, a.default?.actions, ...Object.values(a.cases || {}).map((c) => c.actions)].filter(Boolean)) walk(x);
    }
  };
  walk(def.actions);
  ok(`${flow.name}: every SharePoint items query filters only on Title (and Active)`, bad.length === 0, bad.join('; '));
}

section('Power Automate accepts every trigger');
/* Proven on the tenant: a Request trigger with a concurrency limit is refused at save
   (InvalidConcurrencyConfiguration) in any flow that answers with a Response action. */
for (const flow of FLOWS) {
  const def = JSON.parse(files[`definitions/${flow.name}.definition.json`]);
  const t = def.triggers.manual;
  ok(`${flow.name}: its trigger sets no concurrency limit (refused beside a Response action) and is not asynchronous`,
    !t.runtimeConfiguration?.concurrency && !/asynchronous/i.test(String(t.operationOptions || '')));
}

section('Every tolerated failure is still answered');
/* Proven on the tenant: a step allowed to fail (a successor runs after it "Failed") still marks
   its loop or scope Failed, so steps after that container never run. Wherever a failure is
   tolerated, an answer (a Response) must follow it inside the same container, or the caller
   waits for an answer that never comes. */
for (const flow of FLOWS) {
  const def = JSON.parse(files[`definitions/${flow.name}.definition.json`]);
  const bad = [];
  const hasResponse = (a) => a.type === 'Response' || [a.actions, a.else?.actions, a.default?.actions, ...Object.values(a.cases || {}).map((c) => c.actions)]
    .filter(Boolean).some((x) => Object.values(x).some(hasResponse));
  const scan = (actions) => {
    for (const [n, a] of Object.entries(actions || {})) {
      for (const [p, states] of Object.entries(a.runAfter || {})) {
        if (!states.includes('Failed') && !states.includes('TimedOut')) continue;
        const seen = new Set([n]);
        const queue = [n];
        let answered = hasResponse(a);
        while (queue.length && !answered) {
          const cur = queue.shift();
          for (const [m, b] of Object.entries(actions)) if (!seen.has(m) && b.runAfter?.[cur]) { seen.add(m); queue.push(m); if (hasResponse(b)) answered = true; }
        }
        if (!answered) bad.push(`${n} runs after ${p} fails, and nothing after it answers`);
      }
      for (const x of [a.actions, a.else?.actions, a.default?.actions, ...Object.values(a.cases || {}).map((c) => c.actions)].filter(Boolean)) scan(x);
    }
  };
  scan(def.actions);
  ok(`${flow.name}: every step that may fail without stopping the run is followed by an answer`, bad.length === 0, bad.join('; '));
}

section('Import packages');
for (const flow of FLOWS) {
  const abs = path.join(ROOT, 'mailer', 'flows', 'packages', `${flow.name}.zip`);
  let zip;
  try { zip = openZip(abs); } catch (e) { ok(`${flow.name}.zip opens`, false, e.message); continue; }
  const byName = Object.fromEntries(zip.members.map((m) => [m.name, JSON.parse(m.read().toString('utf8'))]));
  const manifest = byName['manifest.json'];
  const flowsManifest = byName['Microsoft.Flow/flows/manifest.json'];
  const flowId = flowsManifest?.flowAssets?.assetPaths?.[0];
  const pkgDef = byName[`Microsoft.Flow/flows/${flowId}/definition.json`];
  const apisMap = byName[`Microsoft.Flow/flows/${flowId}/apisMap.json`];
  const connMap = byName[`Microsoft.Flow/flows/${flowId}/connectionsMap.json`];
  ok(`${flow.name}.zip has the legacy package layout`, Boolean(manifest && flowsManifest && pkgDef && apisMap && connMap));
  ok(`${flow.name}.zip: the root resource is the flow`, manifest?.resources?.[flowId]?.type === 'Microsoft.Flow/flows' && manifest.resources[flowId].hierarchy === 'Root');
  ok(`${flow.name}.zip: carries the same definition as the readable copy`, JSON.stringify(pkgDef?.properties?.definition) === JSON.stringify(JSON.parse(files[`definitions/${flow.name}.definition.json`])));
  const refs = Object.keys(pkgDef?.properties?.connectionReferences || {});
  ok(`${flow.name}.zip: every connection reference maps to an API and a connection to pick at import`,
    refs.length === flow.apis.length && refs.every((r) => manifest.resources[apisMap[r]]?.type === 'Microsoft.PowerApps/apis' && manifest.resources[connMap[r]]?.type === 'Microsoft.PowerApps/apis/connections'));
}

/* ================================================================== *
 * 3. The directory is the mailing guide
 * ================================================================== */
section('Directory (Nigerian Government Letter Mailing Guide)');
ok('25 institutions', SEED_DIRECTORY.length === 25);
ok('keys are unique', new Set(SEED_DIRECTORY.map((r) => r.key)).size === 25);
ok('order follows the guide 1–25', SEED_DIRECTORY.every((r, i) => r.sortOrder === i + 1));
const npc = SEED_DIRECTORY.find((r) => r.key === 'NPC');
ok('NPC has no address and is inactive, as the guide directs', npc.email === '' && npc.active === false && /not yet/i.test(npc.verification));
ok('the purpose-specific addresses carry a caution', ['ONSA', 'NPF-ICT'].every((k) => SEED_DIRECTORY.find((r) => r.key === k).caution));
const guideSpot = { 'NPF-NCCC': '247poc.npfnccc@npf.gov.ng', NUC: 'info@nuc.edu.ng', NIS: 'nis.servicom@nigeriaimmigration.gov.ng', NBS: 'feedback@nigerianstat.gov.ng', CBN: 'contactcbn@cbn.gov.ng', NRS: 'contactus@nrs.gov.ng', FMIST: 'info@scienceandtech.gov.ng' };
ok('addresses are the guide\'s own', Object.entries(guideSpot).every(([k, e]) => SEED_DIRECTORY.find((r) => r.key === k).email === e));
const allow = { suffixes: MAILER.allowedSuffixes, domains: MAILER.allowedDomains };
ok('every address in the guide is inside the send flow\'s allowlist', SEED_DIRECTORY.filter((r) => r.email).every((r) => domainAllowed(r.email, allow)));

/* ================================================================== *
 * 4. Merge and message building
 * ================================================================== */
section('Merge engine');
ok('fills fields case-insensitively', merge('Dear {{addressee}}', { Addressee: 'Sir' }).text === 'Dear Sir');
ok('escapes values in HTML bodies', merge('<p>{{X}}</p>', { X: '<b>A & B</b>' }, { html: true }).text === '<p>&lt;b&gt;A &amp; B&lt;/b&gt;</p>');
ok('keeps line breaks in HTML bodies', merge('<p>{{X}}</p>', { X: 'a\nb' }, { html: true }).text === '<p>a<br>b</p>');
ok('inserts {{{raw}}} as HTML', merge('{{{S}}}', { S: '<b>x</b>' }, { html: true }).text === '<b>x</b>');
ok('reports a missing field and leaves it visible', (() => { const r = merge('Hi {{Name}}', {}); return r.missing[0] === 'Name' && r.text === 'Hi {{Name}}'; })());
ok('an optional {{Field?}} left empty prints nothing and removes its paragraph', (() => { const r = merge('<p>a</p><p>{{M?}}</p><p>b</p>', {}, { html: true }); return r.missing.length === 0 && r.text === '<p>a</p><p>b</p>'; })());
ok('lists fields without duplicates', JSON.stringify(fieldsIn('{{A}} {{a}} {{{B}}} {{C?}}')) === '["A","B","C"]');
ok('dates read in the official style', letterDate(new Date(2026, 8, 1)) === '1st September, 2026' && letterDate(new Date(2026, 8, 12)) === '12th September, 2026' && letterDate(new Date(2026, 8, 23)) === '23rd September, 2026');

section('Attachments are matched to addressees by file name');
ok('NUC_Letter.pdf → NUC', fileMatchesKey('NUC_Letter.pdf', 'NUC'));
ok('Letter-NPF-NCCC.pdf → NPF-NCCC', fileMatchesKey('Letter-NPF-NCCC.pdf', 'NPF-NCCC'));
ok('Letter-NPF-NCCC.pdf is not NPF-ICT', !fileMatchesKey('Letter-NPF-NCCC.pdf', 'NPF-ICT'));
ok('NPFNCCC.pdf → NPF-NCCC', fileMatchesKey('NPFNCCC.pdf', 'NPF-NCCC'));
ok('Personnel.pdf is not SON', !fileMatchesKey('Personnel.pdf', 'SON'));
ok('commission.pdf is not NIS', !fileMatchesKey('commission.pdf', 'NIS'));

section('Messages');
{
  const settings = { allowedSuffixes: MAILER.allowedSuffixes, allowedDomains: [], maxRecipients: 10, maxAttachmentMb: 20, sender: { name: 'A. Signatory', title: 'DG', office: 'Office of the DG', organisation: 'NITDA', signatureHtml: '<p>sig</p>' }, operator: { email: 'op@nitda.gov.ng' } };
  const c = newCampaign(SEED_TEMPLATES[0], settings);
  c.fields.LetterTitle = 'Test title';
  c.recipients = ['NUC', 'NPC', 'CBN'];
  c.overrides.CBN = { _to: 'someone@gmail.com' };
  c.perRecipient.NUC = ['f1'];
  const files1 = { f1: { name: 'NUC.pdf', size: 1000, type: 'application/pdf' } };
  const msgs = buildMessages({ campaign: c, directory: SEED_DIRECTORY, settings, files: files1 });
  const [nuc, npcMsg, cbn] = msgs;
  ok('a complete message has no issues', nuc.issues.length === 0, nuc.issues.join(' '));
  ok('messageId is campaign + key, so a retry is recognised', nuc.messageId === `${c.id}-NUC`);
  ok('the subject is personalised with the reference', /^Test title — Ref: NITDA\/DGO\/NUC\/\d{4}\/001$/.test(nuc.subject), nuc.subject);
  ok('the second recipient gets the next sequence number', /\/002$/.test(npcMsg.reference));
  ok('NPC is blocked: no verified address', npcMsg.issues.some((i) => /No email address/.test(i)));
  ok('an address outside the allowlist is blocked before sending', cbn.issues.some((i) => /outside the allowed domains/.test(i)));
  ok('a message without its letter is blocked', cbn.issues.some((i) => /No letter/.test(i)));
  const req = sendRequest(nuc, { campaign: c, settings: { ...settings, operatorKey: 'k' }, attachmentContent: { f1: 'QUJD' }, requestId: 'r1' });
  ok('the send request is the flow contract', req.operation === 'send' && req.operatorKey === 'k' && req.payload.to[0] === 'info@nuc.edu.ng' && req.payload.attachments[0].contentBase64 === 'QUJD' && req.payload.attachments[0].name === 'NUC.pdf');
}

section('CSV round trip');
{
  const rows = [{ key: 'A', note: 'x, "y"\nz', cc: ['a@b.gov.ng', 'c@d.gov.ng'] }];
  const back = parseCsv(toCsv(rows, ['key', 'note', 'cc']));
  ok('quotes, commas and newlines survive', back[0].note === 'x, "y"\nz' && back[0].cc === 'a@b.gov.ng; c@d.gov.ng');
}

/* ================================================================== *
 * 5. The mock answers the same rules the flow enforces
 * ================================================================== */
section('Mock flows (npm run mailer:mock)');
{
  const m = createMockFlows({ operatorKey: 'k-0000000000000000' });
  const send = (payload, extra = {}) => m.handle('MAIL_SEND', { operation: 'send', operatorKey: 'k-0000000000000000', payload, ...extra });
  ok('refuses a wrong key', m.handle('MAIL_SEND', { operation: 'send', operatorKey: 'nope', payload: {} })[0] === 401);
  ok('refuses a recipient outside the allowlist', send({ messageId: 'x', to: ['a@gmail.com'], subject: 's', htmlBody: 'b' })[1].error.code === 'RECIPIENT_NOT_ALLOWED');
  ok('validationOnly sends nothing', send({ messageId: 'y', to: ['a@nuc.edu.ng'], subject: 's', htmlBody: 'b' }, { validationOnly: true })[1].validationOnly === true && m.sent.length === 0);
  send({ messageId: 'z', to: ['a@nuc.edu.ng'], subject: 's', htmlBody: 'b' });
  ok('de-duplicates on messageId', send({ messageId: 'z', to: ['a@nuc.edu.ng'], subject: 's', htmlBody: 'b' })[1].data.duplicate === true && m.sent.length === 1);
}

/* ================================================================== *
 * 6. Nothing secret is committed, and the platform is registered
 * ================================================================== */
section('Hygiene and registration');
const mailerFiles = (function list(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(path.join(dir, d.name)) : [path.join(dir, d.name)])); })(path.join(ROOT, 'mailer'));
ok('no signed trigger URL anywhere under mailer/', mailerFiles.filter((f) => !f.endsWith('.zip')).every((f) => !/sig=[A-Za-z0-9_-]{20,}/.test(fs.readFileSync(f, 'utf8'))));
ok('mailer/config.js carries no endpoint URL', (() => { globalThis.window = {}; new Function('window', read('mailer/config.js'))(globalThis.window); return Object.values(globalThis.window.DGO_MAILER_CONFIG.endpoints).every((v) => v === ''); })());
ok('mailer/config.local.js is git-ignored', /^mailer\/config\.local\.js$/m.test(read('.gitignore')));
ok('the mailer is a registered platform', /id: 'mailer'/.test(read('scripts/platforms.config.mjs')));
const pkg = JSON.parse(read('package.json'));
ok('this suite is in the non-browser gate', (pkg.scripts['test:node'] || '').includes('npm run test:mailer'));

section('Agency letterhead: the platform\'s six templates, sent by the mailer');
{
  const { renderLetterhead, letterheadTemplate, LETTERHEAD_TEMPLATES } = await import('../mailer/js/letterhead.js');
  const { LETTERHEAD } = await import('../mailer/js/letterhead.generated.js');
  const { CorrespondenceEmailTemplateConfig: PC } = await import('../config/correspondence-email-templates.config.js');
  const { letterheadContext } = await import('../mailer/js/campaign.js');
  ok('the compiled copy is the platform config', JSON.stringify(LETTERHEAD.templates) === JSON.stringify(PC.templates) && JSON.stringify(LETTERHEAD.brand) === JSON.stringify(PC.brand), 'run: npm run mailer:letterhead');
  ok('all six platform templates are offered, read-only', LETTERHEAD_TEMPLATES.length === 6 && LETTERHEAD_TEMPLATES.every((t) => t.kind === 'letterhead' && t.readOnly));
  ok('the letterhead names the Agency, not the platform', LETTERHEAD.brand.agency === 'National Information Technology Development Agency' && !JSON.stringify(LETTERHEAD).includes('Folio'));

  /* Byte-for-byte against the platform's own render(), with "now" pinned so both print one date. */
  const RealDate = Date;
  const FIXED = RealDate.UTC(2026, 8, 25, 9);
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
  const { render: platformRender } = await import('../core/correspondence-email-service.js');
  const dateText = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const drafts = [
    { referenceId: 'NITDA/DG/COR/2026/0142', subject: 'A <b>title</b> & more', recipientName: 'Executive Secretary', recipientEmail: 'info@nuc.edu.ng', body: 'Line one\nLine "two"', actionRequired: 'Nominate two officers', dueDate: '9 October 2026', attachmentSummary: 'a.pdf; b.pdf', classification: 'Confidential', priority: 'high', signatoryName: 'A. Signatory', signatoryTitle: 'Director-General/CEO' },
    { referenceId: 'R1', subject: 'Plain', recipientEmail: 'x@y.gov.ng', body: 'Body' },
  ];
  const mismatches = [];
  for (const t of PC.templates) {
    for (const d of drafts) {
      const p = platformRender({ templateId: t.id, ...d }, {});
      const m = renderLetterhead(letterheadTemplate(t.id), p.ctx, dateText);
      if (m.html !== p.html || m.subject !== p.subject) mismatches.push(`${t.id} (${d.referenceId})`);
    }
  }
  globalThis.Date = RealDate;
  ok('every template renders byte-identical to the platform\'s render(), conditional paragraphs on and off', mismatches.length === 0, mismatches.join(', '));

  const settings = { allowedSuffixes: MAILER.allowedSuffixes, allowedDomains: [], maxRecipients: 10, maxAttachmentMb: 20, sender: { name: 'A. Signatory', title: 'Director-General/CEO' } };
  const c = newCampaign(LETTERHEAD_TEMPLATES.find((t) => t.letterheadId === 'official-correspondence'), settings);
  c.recipients = ['NUC']; c.perRecipient.NUC = ['f1']; c.fields.LetterTitle = 'Adoption of the framework';
  const f = { f1: { name: 'NUC_Letter.pdf', size: 1000, type: 'application/pdf' } };
  const [blank] = buildMessages({ campaign: c, directory: SEED_DIRECTORY, settings, files: f });
  ok('a letterhead mailing without a message is blocked, as the platform blocks it', blank.issues.some((i) => /Message is required/.test(i)));
  c.fields.Message = 'Please note.'; c.fields.DueDate = '9 October 2026';
  const [m] = buildMessages({ campaign: c, directory: SEED_DIRECTORY, settings, files: f });
  ok('a complete letterhead mailing has no issues', m.issues.length === 0, m.issues.join(' '));
  ok('it greets the addressee by the directory salutation', m.htmlBody.includes('<p>Dear Sir/Madam,</p>'));
  ok('its subject is the platform pattern with the mailer reference', /^NITDA\/DGO\/NUC\/\d{4}\/001 — Adoption of the framework$/.test(m.subject), m.subject);
  ok('an optional paragraph appears only when its field is filled', m.htmlBody.includes('on or before <b>9 October 2026</b>') && !m.htmlBody.includes('Action required'));
  ok('it is signed by the signatory in Settings', m.htmlBody.includes('<b>A. Signatory</b><br>Director-General/CEO'));
  ok('attachment references default to the files actually attached', letterheadContext(c, { }, [{ name: 'NUC_Letter.pdf' }]).attachmentSummary === 'NUC_Letter.pdf');
  ok('the real file still travels as an attachment', m.attachments[0]?.name === 'NUC_Letter.pdf');
}

section('Sign-in and shared data (the mock of DGO_MAIL_AUTH and DGO_MAIL_DATA)');
{
  const m = createMockFlows({ operatorKey: 'admin-key-000000000', operators: [{ email: 'op@nitda.gov.ng', name: 'Op One', role: 'operator' }, { email: 'boss@nitda.gov.ng', name: 'Boss', role: 'admin' }] });
  const call = (key, body) => m.handle(key, body);
  const code = (email) => call('MAIL_AUTH', { operation: 'requestCode', payload: { email } });
  const [s1, r1] = code('OP@nitda.gov.ng');
  ok('an operator asking for a code is mailed one', s1 === 200 && m.lastCode('op@nitda.gov.ng')?.length === 8 && r1.data.challengeId.length === 64);
  const before = m.mailbox.length;
  const [s2, r2] = code('stranger@nitda.gov.ng');
  ok('anyone else gets the same answer and no code', s2 === 200 && r2.data.challengeId.length === 64 && m.mailbox.length === before && r2.data.message === r1.data.message);
  ok('without signing in, nothing but sign-in, health and identity answers', call('MAIL_LOG', { operation: 'list' })[0] === 401 && call('MAIL_LOG', { operation: 'list' })[1].error.code === 'SIGN_IN_REQUIRED'
    && call('MAIL_LOG', { operation: 'healthCheck', validationOnly: true })[0] === 200);
  const wrong = call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: r1.data.challengeId, code: '00000000' } });
  ok('a wrong code is refused and says how many tries are left', wrong[0] === 401 && wrong[1].error.code === 'CODE_INVALID' && /4 try/.test(wrong[1].error.message));
  const [s3, r3] = call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: r1.data.challengeId, code: m.lastCode('op@nitda.gov.ng') } });
  ok('the right code gives a session', s3 === 200 && r3.data.token.length === 64 && r3.data.email === 'op@nitda.gov.ng');
  ok('a code works once', call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: r1.data.challengeId, code: m.lastCode('op@nitda.gov.ng') } })[1].error.code === 'CODE_EXPIRED');
  const tok = r3.data.token;
  ok('the session opens the other flows', call('MAIL_LOG', { operation: 'list', sessionToken: tok })[0] === 200);
  ok('an operator cannot manage operators', call('MAIL_AUTH', { operation: 'listOperators', sessionToken: tok })[1].error.code === 'FORBIDDEN');
  const sent = call('MAIL_SEND', { operation: 'send', sessionToken: tok, operator: { email: 'someone-else@nitda.gov.ng' }, payload: { messageId: 'x-1', to: ['info@nuc.edu.ng'], subject: 's', htmlBody: 'b', attachments: [] } });
  ok('the send log records who is signed in, not who the browser claims', sent[0] === 200 && m.lists.log[0].operatorEmail === 'op@nitda.gov.ng');

  code('boss@nitda.gov.ng');
  const boss = call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: [...m.lists.sessions.entries()].reverse().find(([, v]) => v.email === 'boss@nitda.gov.ng')[0], code: m.lastCode('boss@nitda.gov.ng') } })[1].data.token;
  ok('an admin sees the operator list', call('MAIL_AUTH', { operation: 'listOperators', sessionToken: boss })[1].data.count === 2);
  call('MAIL_AUTH', { operation: 'upsertOperator', sessionToken: boss, payload: { operator: { email: 'op@nitda.gov.ng', name: 'Op One', active: false } } });
  ok('switching an operator off ends their session at once', call('MAIL_LOG', { operation: 'list', sessionToken: tok })[1].error?.code === 'SIGN_IN_REQUIRED');
  call('MAIL_AUTH', { operation: 'signOut', sessionToken: boss });
  ok('signing out ends the session', call('MAIL_LOG', { operation: 'list', sessionToken: boss })[1].error?.code === 'SIGN_IN_REQUIRED');

  const [, again] = code('boss@nitda.gov.ng');
  for (let i = 0; i < 5; i++) call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: again.data.challengeId, code: '11111111' } });
  ok('five wrong tries lock the code, even for the right one after', call('MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId: again.data.challengeId, code: m.lastCode('boss@nitda.gov.ng') } })[1].error.code === 'CODE_EXPIRED');

  const admin = { operatorKey: 'admin-key-000000000', operator: { email: 'setup@nitda.gov.ng' } };
  call('MAIL_DATA', { operation: 'saveMailing', ...admin, payload: { mailing: { id: 'c1', name: 'First', status: 'draft', data: '{"id":"c1"}' } } });
  const listed = call('MAIL_DATA', { operation: 'listMailings', ...admin })[1].data.items;
  ok('a mailing saved is listed back with its data and who saved it', listed.length === 1 && listed[0].data === '{"id":"c1"}' && listed[0].updatedBy === 'setup@nitda.gov.ng');
  const pdf = Buffer.from('%PDF-1.4 test bytes');
  const up = call('MAIL_DATA', { operation: 'uploadFile', ...admin, payload: { file: { id: 'f1', name: 'NUC_Letter.pdf', contentBase64: pdf.toString('base64') } } })[1].data;
  const down = call('MAIL_DATA', { operation: 'downloadFile', ...admin, payload: { file: { storedName: up.storedName } } })[1].data;
  ok('a shared file comes back byte for byte', up.storedName === 'f1__NUC_Letter.pdf' && Buffer.from(down.contentBase64, 'base64').equals(pdf));
  ok('the mock serves exactly the seven flows the catalogue declares', JSON.stringify(MOCK_KEYS) === JSON.stringify(FLOWS.map((f) => f.key)));
}

section('2.0.6: sending never sends a letter twice, and says so when it cannot know');
{
  const { classifySend, _sendOne, Sender } = await import('../mailer/js/sender.js');
  const { callFlow } = await import('../mailer/js/api.js');
  const KEY = 'k-2060000000000000';
  const m = createMockFlows({ operatorKey: KEY, failFor: ['CBN'], lostAnswerFor: ['NUC'] });
  await new Promise((r) => m.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${m.server.address().port}`;
  const settings = { endpoints: Object.fromEntries(MOCK_KEYS.map((k) => [k, `${base}/${k}`])), operatorKey: KEY, allowedSuffixes: MAILER.allowedSuffixes, allowedDomains: [], maxRecipients: 10, maxAttachmentMb: 20, sender: { office: 'Office of the DG', organisation: 'NITDA', signatureHtml: '<p>s</p>' }, operator: { email: 'op@nitda.gov.ng' } };
  const { Reports } = await import('../mailer/js/reports.js');
  Reports.show = () => {}; // the report dialog needs a page
  Sender.fetchFile = async () => ({ data: 'UERG' });
  const quick = { waits: [20, 20, 20], backoff: [20] };
  const c = newCampaign(SEED_TEMPLATES[0], settings);
  c.fields.LetterTitle = 'T';
  c.recipients = ['NUC', 'CBN', 'NDPC', 'ICPC'];
  c.perRecipient = { NUC: ['f1'], CBN: ['f1'], NDPC: ['f1'], ICPC: ['f1'] };
  const msgs = buildMessages({ campaign: c, directory: SEED_DIRECTORY, settings, files: { f1: { name: 'L.pdf', size: 3, type: 'application/pdf' } } });
  const msg = (k) => msgs.find((x) => x.key === k);

  const lost = await _sendOne(settings, c, msg('NUC'), quick);
  ok('a send whose answer is lost (504, not JSON) is read back from the log as Sent, and not sent again',
    lost.status === 'sent' && lost.reconciled === true && m.sent.filter((x) => x.to.includes('info@nuc.edu.ng')).length === 1, JSON.stringify(lost));
  const failedOnce = await _sendOne(settings, c, msg('CBN'), quick);
  ok('SEND_FAILED is marked failed and never re-sent automatically',
    failedOnce.status === 'failed' && failedOnce.attempts === 1 && m.lists.log.filter((r) => r.messageId === msg('CBN').messageId).length === 1, JSON.stringify(failedOnce));
  m.lists.log.unshift({ logItemId: 999, messageId: msg('NDPC').messageId, recipientKey: 'NDPC', status: 'Sending', created: new Date().toISOString() });
  const running = await _sendOne(settings, c, msg('NDPC'), quick);
  ok('a message another run is still sending (409 IN_PROGRESS) is not sent; it is failed as "outcome unknown", to check the log',
    running.status === 'failed' && running.uncertain === true && /Outcome unknown/.test(running.error) && !m.sent.some((x) => x.to.includes('info@ndpc.gov.ng')), JSON.stringify(running));
  const noSession = await _sendOne({ ...settings, operatorKey: '' }, c, msg('ICPC'), quick);
  ok('an ended session pauses the message (signin), it is not refused', noSession.status === 'signin', JSON.stringify(noSession));
  ok('503 SIGN_IN_CHECK_FAILED is asked again; 401 SIGN_IN_REQUIRED waits for sign-in; other 4xx are refusals',
    classifySend({ reached: true, status: 503, ok: false, json: { error: { code: 'SIGN_IN_CHECK_FAILED' } } }) === 'retry'
    && classifySend({ reached: true, status: 401, ok: false, json: { error: { code: 'SIGN_IN_REQUIRED' } } }) === 'signin'
    && classifySend({ reached: true, status: 400, ok: false, json: { error: { code: 'RECIPIENT_NOT_ALLOWED' } } }) === 'refused'
    && classifySend({ reached: false, status: 0, ok: false, json: null }) === 'unknown'
    && classifySend({ reached: true, status: 409, ok: false, json: { error: { code: 'IN_PROGRESS' } } }) === 'unknown');

  /* A 200 that is not JSON (a proxy's page) is never success. */
  const http = await import('node:http');
  const html = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<html>proxy</html>'); });
  await new Promise((r) => html.listen(0, '127.0.0.1', r));
  const page = await callFlow({ endpoints: { MAIL_SEND: `http://127.0.0.1:${html.address().port}/` } }, 'MAIL_SEND', { operation: 'send' });
  ok('a 2xx answer that is not JSON is not success, and not a sent message', page.ok === false && page.blocked === true && classifySend(page, 'x') === 'unknown');
  html.close();

  /* Live run: a recipient left "simulated" from a rehearsal is not delivered. */
  const app = { state: { campaigns: [], directory: SEED_DIRECTORY, settings, fileIndex: { f1: { name: 'L.pdf', size: 3, type: 'application/pdf' } }, templates: SEED_TEMPLATES }, saveCampaign: async (x) => { x.updatedAt = new Date().toISOString(); if (!app.state.campaigns.includes(x)) app.state.campaigns.push(x); return x; } };
  const live = newCampaign(SEED_TEMPLATES[0], settings);
  live.fields.LetterTitle = 'Live';
  live.recipients = ['JAMB', 'SON'];
  live.perRecipient = { JAMB: ['f1'], SON: ['f1'] };
  live.results = { JAMB: { status: 'simulated' }, SON: { status: 'simulated' } };
  app.state.campaigns.push(live);
  Sender.beforeSend = null;
  await Sender.start(app, live.id, { keys: ['JAMB'] }).catch(() => {}); // the report dialog needs a page
  ok('in a live run, a recipient still "simulated" keeps the mailing partial, not done', live.results.JAMB.status === 'sent' && live.status === 'partial', `${live.results.JAMB.status} ${live.status}`);
  ok('the first live send fixes every recipient\'s reference number, and each result keeps the reference it carried',
    live.seq?.JAMB === 1 && live.seq?.SON === 2 && /\/001$/.test(live.results.JAMB.reference || ''), JSON.stringify(live.seq));

  /* Two presses of Send while the uploads are being saved start ONE run. */
  let release;
  Sender.run = null;
  Sender.beforeSend = () => new Promise((r) => { release = r; });
  const first = Sender.start(app, live.id).catch((e) => e);
  let second = null; let dry = null;
  try { await Sender.start(app, live.id); } catch (e) { second = e; }
  try { await Sender.dryRun(app, live.id); } catch (e) { dry = e; }
  ok('a second Send, or a Dry run, pressed while the first is still preparing is refused', /already being sent/.test(second?.message || '') && /already running/.test(dry?.message || '') && Sender.run?.starting === true);
  release();
  await first;
  m.server.close();
}

section('2.0.6: shared data merges, and references stay fixed');
{
  const { mergeShared, stampEdits } = await import('../mailer/js/sync.js');
  const { referenceFor, freezeSequence } = await import('../mailer/js/campaign.js');
  const local = [{ key: 'NUC', email: 'new@nuc.edu.ng', dirty: true, updatedAt: '2026-09-26T10:00:00Z' }, { key: 'CBN', email: 'old@cbn.gov.ng' }, { key: 'LOCALONLY', email: 'x@y.gov.ng' }];
  const server = [{ key: 'NUC', email: 'stale@nuc.edu.ng', modified: '2026-09-25T10:00:00Z' }, { key: 'CBN', email: 'new@cbn.gov.ng', modified: '2026-09-26T09:00:00Z' }];
  const { list, unshared } = mergeShared(local, server, (x) => ({ key: x.key, email: x.email }));
  const by = Object.fromEntries(list.map((r) => [r.key, r]));
  ok('a pull keeps an entry edited here and not yet shared, over an older SharePoint copy', by.NUC.email === 'new@nuc.edu.ng' && unshared.length === 1 && unshared[0].key === 'NUC');
  ok('a pull takes SharePoint\'s copy of an entry not edited here, and keeps entries only this browser has', by.CBN.email === 'new@cbn.gov.ng' && by.LOCALONLY);
  const newer = mergeShared(local, [{ key: 'NUC', email: 'later@nuc.edu.ng', modified: '2026-09-26T11:00:00Z' }], (x) => ({ key: x.key, email: x.email }));
  ok('an edit made on another device after this one wins', newer.list.find((r) => r.key === 'NUC').email === 'later@nuc.edu.ng' && !newer.unshared.length);
  const st = stampEdits([{ key: 'A', v: 1 }, { key: 'B', v: 1 }], [{ key: 'A', v: 1 }, { key: 'B', v: 2 }, { key: 'C', v: 1 }]);
  ok('an edit made here is marked unshared and stamped; an unchanged entry is not', JSON.stringify(st.changed) === '["B","C"]' && st.list[1].dirty === true && !st.list[0].dirty && st.list[2].updatedAt);

  const c = { referencePattern: 'R/{{Key}}/{{Seq}}', referenceStart: 1, date: '2026-01-01', recipients: ['NUC', 'CBN'] };
  ok('before any send, numbers follow the order', referenceFor(c, 'NUC', 0) === 'R/NUC/001' && referenceFor(c, 'CBN', 1) === 'R/CBN/002');
  freezeSequence(c);
  c.recipients = ['FMCIDE', 'NUC', 'CBN'];
  ok('a recipient added after the first send takes the next number; no issued number changes or repeats',
    referenceFor(c, 'FMCIDE', 0) === 'R/FMCIDE/003' && referenceFor(c, 'NUC', 1) === 'R/NUC/001' && referenceFor(c, 'CBN', 2) === 'R/CBN/002');
  const y = { referencePattern: '{{Year}}-{{Month}}', date: '2026-01-01', recipients: ['A'] };
  ok('the letter date is read as a local date (1 January stays in January, whatever the time zone)', referenceFor(y, 'A', 0) === '2026-01');
}

section('2.0.6: letters, limits and exports');
{
  const { renderLetterhead, letterheadTemplate, LETTERHEAD_TEMPLATES } = await import('../mailer/js/letterhead.js');
  const t = letterheadTemplate(LETTERHEAD_TEMPLATES.find((x) => /official/.test(x.letterheadId || x.key))?.letterheadId || 'official-correspondence');
  const r = renderLetterhead(t, { subject: "The Ministry's Data & AI Framework", referenceId: 'R/1', body: 'b', recipientName: 'Sir', signatoryName: 'S', signatoryTitle: 'T' }, '1 January 2026');
  ok('the subject line is plain text: & and \' arrive as themselves', r.subject.includes("Ministry's Data & AI") && !/&amp;|&#39;/.test(r.subject), r.subject);
  ok('the heading in the letter is still escaped HTML', r.html.includes('Ministry&#39;s Data &amp; AI'));
  const { FLOW_LIMITS, effective } = await import('../mailer/js/settings.js');
  ok('the mailer\'s limits are the send flow\'s: 10 addresses, and a size whose base64 fits maxAttachmentChars',
    FLOW_LIMITS.maxRecipients === MAILER.maxRecipients && Math.ceil(FLOW_LIMITS.maxAttachmentMb * 1048576 / 3) * 4 < MAILER.maxAttachmentChars - 200000);
  const e = effective({ maxRecipients: 50, maxAttachmentMb: 22, sender: {} });
  ok('settings above the flow\'s limits are held to them', e.maxRecipients === 10 && e.maxAttachmentMb === 21);
  const risky = [{ key: 'X', notes: '=HYPERLINK("http://x","y")', cc: '+234', email: '@a' }];
  const csv = toCsv(risky, ['key', 'notes', 'cc', 'email']);
  const back = parseCsv(csv);
  ok('an exported cell that would run as a formula in Excel is written as text, and imports back unchanged',
    /'=HYPERLINK/.test(csv) && /'\+234/.test(csv) && back[0].notes === risky[0].notes && back[0].cc === '+234' && back[0].email === '@a');
  const { sanitizeHtml } = await import('../mailer/js/sanitize.js');
  ok('without a page, stored letter HTML is escaped rather than inserted', sanitizeHtml('<meta http-equiv="refresh">') === '&lt;meta http-equiv=&quot;refresh&quot;&gt;');
}

section('2.0.6: the mock answers as the hardened flows do');
{
  const m = createMockFlows({ operatorKey: 'k-0000000000000000' });
  const admin = { operatorKey: 'k-0000000000000000' };
  ok('a file name that could leave the library is refused', m.handle('MAIL_DATA', { operation: 'downloadFile', ...admin, payload: { file: { storedName: '../Shared Documents/x.pdf' } } })[1].error.code === 'BAD_FILE_NAME');
  ok('a "since" that is not a date is refused', m.handle('MAIL_LOG', { operation: 'list', ...admin, payload: { since: "2020' or Title ne '" } })[1].error.code === 'BAD_SINCE');
  m.lists.log.unshift({ logItemId: 1, messageId: 'mid', status: 'Sending', created: new Date().toISOString() });
  ok('a message still Sending is refused 409 IN_PROGRESS', m.handle('MAIL_SEND', { operation: 'send', ...admin, payload: { messageId: 'mid', to: ['a@nuc.edu.ng'], subject: 's', htmlBody: 'b' } })[0] === 409 && m.sent.length === 0);
}

section('2.1.1: fixes from the review of 2.1.0');
{
  const defOf = (n) => JSON.parse(files[`definitions/${n}.definition.json`]);
  const casesOf = (n) => defOf(n).actions.Scope_Try.actions.Switch_Operation.cases;
  /* R1 — indexing and a bounded sign-in list */
  const present = casesOf('DGO_MAIL_PROVISION').Provision.actions.Apply_to_each_List.actions.Condition_List_Present.actions;
  ok('provisioning indexes Title and Created on every list that exists, never in a plan run',
    JSON.stringify(present.SP_Get_Index_Fields).includes("InternalName eq ''Title'' or InternalName eq ''Created''")
    && JSON.stringify(present.Condition_Index_Fields.expression).includes('validationOnly')
    && JSON.parse(present.Condition_Index_Fields.actions.Apply_to_each_Index_Field.actions.SP_Index_Field.inputs.parameters['parameters/body']).Indexed === true);
  ok('the provisioning report says whether each list is indexed',
    casesOf('DGO_MAIL_PROVISION').Provision.actions.Apply_to_each_List.actions.Append_Report.inputs.value.indexed === "@variables('varListIndexed')");
  const rc = casesOf('DGO_MAIL_AUTH').RequestCode.actions;
  ok('after answering a code request, expired sign-in rows are deleted (not in validation), so the list does not grow without end',
    rc.Condition_Cleanup_Sessions.runAfter.Respond_Code_Requested && JSON.stringify(rc.Condition_Cleanup_Sessions.expression).includes('validationOnly')
    && JSON.stringify(rc.Condition_Cleanup_Sessions).includes("'X-HTTP-Method':'DELETE'".replace(/'/g, '"')));
  /* R4 — the send claim */
  const send = casesOf('DGO_MAIL_SEND').Send.actions;
  ok('after writing its log row, a send re-reads the message\'s rows oldest first and only the first live claim sends',
    send.SP_Recheck_Claims.runAfter.SP_Create_Log && /orderby=Id%20asc/.test(send.SP_Recheck_Claims.inputs.parameters['parameters/uri'])
    && send.Select_Attachments.runAfter.Condition_Lost_Claim && send.Condition_Lost_Claim.actions.Respond_Lost_Claim.inputs.statusCode === 409
    && JSON.stringify(send.Condition_Lost_Claim.actions.Compose_Duplicate_Item).includes('Duplicate'));
  /* R2 — every row of a record */
  const data = casesOf('DGO_MAIL_DATA');
  ok('deleting a mailing or report deletes every row with its id, and a save removes extra rows',
    ['Mailings', 'Reports'].every((t) => data[`Delete${t}`].actions[`Condition_${t}_Delete`].actions[`Apply_to_each_${t}_Row`]?.type === 'Foreach'
      && data[`Save${t}`].actions[`Condition_${t}_Exists`].actions[`Apply_to_each_${t}_Extra`]?.type === 'Foreach'
      && /\$top=20&\$orderby=Id%20asc/.test(data[`Save${t}`].actions[`SP_Find_${t}`].inputs.parameters['parameters/uri'])));

  const { mergeShared } = await import('../mailer/js/sync.js');
  const local = [{ key: 'GONE', shared: true }, { key: 'NEWHERE' }, { key: 'EDITED', shared: true, dirty: true, updatedAt: '2026-09-29T10:00:00Z' }, { key: 'KEEP', shared: true }];
  const m1 = mergeShared(local, [{ key: 'KEEP', modified: '2026-09-01T00:00:00Z' }], (x) => ({ key: x.key }));
  ok('an entry shared before and missing from SharePoint is removed; one never shared, or edited here, is kept',
    JSON.stringify(m1.removed) === '["GONE"]' && m1.list.some((r) => r.key === 'NEWHERE') && m1.list.some((r) => r.key === 'EDITED') && m1.list.find((r) => r.key === 'KEEP').shared === true);
  ok('nothing is removed when the server list may be incomplete', mergeShared(local, [], (x) => x, { complete: false }).removed.length === 0);

  /* Client, over HTTP against the mock */
  const { _sendOne, Sender } = await import('../mailer/js/sender.js');
  const { Sync } = await import('../mailer/js/sync.js');
  const { Session } = await import('../mailer/js/session.js');
  const { Reports } = await import('../mailer/js/reports.js');
  const { letterLog } = await import('../mailer/js/logcheck.js');
  const http = await import('node:http');
  Reports.show = () => {};
  const KEY = 'k-2110000000000000';
  const m = createMockFlows({ operatorKey: KEY });
  await new Promise((r) => m.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${m.server.address().port}`;
  let sendCalls = 0;
  const late = http.createServer((q, r) => { sendCalls++; r.writeHead(504, { 'Content-Type': 'text/html' }); r.end('<html>timeout</html>'); });
  await new Promise((r) => late.listen(0, '127.0.0.1', r));
  const settings = { endpoints: Object.fromEntries(MOCK_KEYS.map((k) => [k, `${base}/${k}`])), operatorKey: KEY, allowedSuffixes: MAILER.allowedSuffixes, allowedDomains: [], maxRecipients: 10, maxAttachmentMb: 20, sender: { office: 'Office of the DG', organisation: 'NITDA', signatureHtml: '<p>s</p>' }, operator: { email: 'op@nitda.gov.ng' } };
  const c = newCampaign(SEED_TEMPLATES[0], settings);
  c.fields.LetterTitle = 'T';
  c.recipients = ['NUC', 'CBN', 'JAMB'];
  c.perRecipient = { NUC: ['f1'], CBN: ['f1'], JAMB: ['f1'] };
  const msgs = buildMessages({ campaign: c, directory: SEED_DIRECTORY, settings, files: { f1: { name: 'L.pdf', size: 3, type: 'application/pdf' } } });
  const msg = (k) => msgs.find((x) => x.key === k);
  Sender.fetchFile = async () => ({ data: 'UERG' });

  /* R4 client — "no row" is believed only on a second read */
  const lateSettings = { ...settings, endpoints: { ...settings.endpoints, MAIL_SEND: `http://127.0.0.1:${late.address().port}/` } };
  setTimeout(() => m.lists.log.unshift({ logItemId: 77, messageId: msg('NUC').messageId, recipientKey: 'NUC', status: 'Sent', sentAt: new Date().toISOString(), created: new Date().toISOString() }), 150);
  const r1 = await _sendOne(lateSettings, c, msg('NUC'), { waits: [20, 20], backoff: [20], absentAfterMs: 400 });
  ok('a lost answer whose log row appears only after the first read is taken as sent, and not sent again',
    r1.status === 'sent' && r1.reconciled === true && sendCalls === 1, JSON.stringify(r1) + ` calls=${sendCalls}`);
  /* R8 — a signed letter that needs a session */
  const saved = Sender.fetchFile;
  Sender.fetchFile = async () => { throw new Error('SIGN_IN_REQUIRED: sign in again to fetch it.'); };
  const r2 = await _sendOne(settings, c, msg('CBN'), { waits: [20], backoff: [20], absentAfterMs: 50 });
  Sender.fetchFile = saved;
  ok('a signed letter that cannot be fetched because the session ended pauses the message for sign-in', r2.status === 'signin', JSON.stringify(r2));

  /* R3 — a letter deleted during its send stops the run and stays deleted */
  const app = { state: { campaigns: [], directory: SEED_DIRECTORY, settings, fileIndex: { f1: { name: 'L.pdf', size: 3, type: 'application/pdf' } }, templates: SEED_TEMPLATES },
    saveCampaign: async (x) => { x.updatedAt = new Date().toISOString(); if (!app.state.campaigns.includes(x)) app.state.campaigns.unshift(x); return x; } };
  const d = newCampaign(SEED_TEMPLATES[0], settings);
  d.fields.LetterTitle = 'Deleted mid-send';
  d.recipients = ['NDPC', 'ICPC', 'SON'];
  d.perRecipient = { NDPC: ['f1'], ICPC: ['f1'], SON: ['f1'] };
  app.state.campaigns.push(d);
  Sender.run = null; Sender.beforeSend = null;
  const stop = Sender.on((run) => { if (run?.index === 1 && app.state.campaigns.includes(d)) app.state.campaigns = app.state.campaigns.filter((x) => x !== d); });
  const before = m.sent.length;
  await Sender.start(app, d.id, { quiet: true }).catch(() => {});
  stop();
  ok('a letter deleted during its send: the rest is not sent, and the letter is not saved back',
    m.sent.length - before === 1 && !app.state.campaigns.some((x) => x.id === d.id) && Sender.run?.deleted === true, `sent=${m.sent.length - before}`);

  /* R2 client — saves of one letter never overlap */
  Session.set({ token: 't', email: 'op@nitda.gov.ng', expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const realFetch = globalThis.fetch;
  let inflight = 0; let peak = 0;
  globalThis.fetch = async (url, init) => {
    const isSave = String(init?.body || '').includes('"saveMailing"');
    if (isSave) { inflight++; peak = Math.max(peak, inflight); await new Promise((r) => setTimeout(r, 80)); }
    try { return await realFetch(url, init); } finally { if (isSave) inflight--; }
  };
  const app2 = { state: { campaigns: [], settings }, renderStatus() {} };
  const e = { id: 'cnew1', name: 'New', status: 'draft' };
  app2.state.campaigns.push(e);
  await Promise.all([Sync.saveMailing(app2, e), Sync.saveMailing(app2, e), Sync.saveMailing(app2, e)]);
  globalThis.fetch = realFetch;
  ok('three saves of one new letter at once reach SharePoint one after another', peak === 1 && m.lists.campaigns.has('cnew1'), `peak=${peak}`);
  Session.clear();

  /* R11 — the log check reads each addressee's row directly */
  const L = newCampaign(SEED_TEMPLATES[0], settings);
  L.recipients = ['NUC', 'CBN'];
  m.lists.log.push({ logItemId: 5, messageId: `${L.id}-NUC`, campaignId: L.id, recipientKey: 'NUC', status: 'Sent', created: '2026-01-01T00:00:00Z' });
  for (let i = 0; i < 5001; i++) m.lists.log.unshift({ logItemId: 10000 + i, messageId: `other-${i}`, campaignId: 'other', recipientKey: 'X', status: 'Sent', created: new Date().toISOString() });
  const listed = (await (await realFetch(`${base}/MAIL_LOG`, { method: 'POST', body: JSON.stringify({ operation: 'list', operatorKey: KEY, payload: { campaignId: L.id } }) })).json()).data.items;
  const rows = await letterLog(settings, L);
  ok('an older letter\'s rows, outside the log list\'s newest 5,000, are still found by the check',
    listed.length === 0 && rows.length === 1 && rows[0].recipientKey === 'NUC' && rows[0].status === 'Sent', `listed=${listed.length} rows=${rows.length}`);

  /* R15 — pending deletions: after the letters and reports, five at a time, at most 50 per sync */
  const { Sync: S2 } = await import('../mailer/js/sync.js');
  const offApp = { state: { campaigns: [], settings: { ...settings, endpoints: {} } }, renderStatus() {} };
  for (let i = 0; i < 60; i++) await S2.deleteMailing(offApp, `gone-${i}`); // queued while sharing is off
  Session.set({ token: 't', email: 'op@nitda.gov.ng', expiresAt: new Date(Date.now() + 3600000).toISOString() });
  let delInflight = 0; let delPeak = 0; let delCalls = 0;
  globalThis.fetch = async (url, init) => {
    const isDel = String(init?.body || '').includes('"deleteMailing"');
    if (isDel) { delCalls++; delInflight++; delPeak = Math.max(delPeak, delInflight); await new Promise((r) => setTimeout(r, 20)); }
    try { return await realFetch(url, init); } finally { if (isDel) delInflight--; }
  };
  const left = await S2.retryDeletes({ state: { settings }, renderStatus() {} }, { limit: 50 });
  globalThis.fetch = realFetch;
  Session.clear();
  const syncSrc = read('mailer/js/sync.js');
  ok('pending deletions are retried five at a time, at most 50 per sync, the rest kept for the next',
    delCalls === 50 && delPeak === 5 && left === 10, `calls=${delCalls} peak=${delPeak} left=${left}`);
  ok('they run after the letters and reports have been brought in', syncSrc.indexOf("step('Deletions'") > syncSrc.indexOf("step('Reports'") && syncSrc.indexOf("step('Mailings'") < syncSrc.indexOf("step('Deletions'"));

  /* R1 — at most codesPerWindow codes per operator address per window */
  const rl = createMockFlows();
  for (let i = 0; i < MAILER.codesPerWindow + 3; i++) rl.handle('MAIL_AUTH', { operation: 'requestCode', payload: { email: 'operator@nitda.gov.ng' } });
  ok(`an operator address is mailed at most ${MAILER.codesPerWindow} codes per ${MAILER.codeWindowMinutes} minutes, and every request gets the same answer`,
    rl.mailbox.length === MAILER.codesPerWindow && rl.handle('MAIL_AUTH', { operation: 'requestCode', payload: { email: 'operator@nitda.gov.ng' } })[0] === 200);
  const reqActs = casesOf('DGO_MAIL_AUTH').RequestCode.actions.Condition_Known_Operator.actions;
  ok('DGO_MAIL_AUTH counts codes per address in a Title-keyed row and creates or mails nothing past the limit',
    /rate:/.test(reqActs.SP_Find_Rate.inputs.parameters['parameters/uri']) && reqActs.Condition_Rate_Allows.actions.Send_Code && reqActs.Condition_Rate_Allows.actions.SP_Create_Challenge
    && JSON.stringify(reqActs.Condition_Rate_Allows.else) === JSON.stringify({ actions: {} }) && defOf('DGO_MAIL_AUTH').actions.Compose_Config.inputs.codesPerWindow === MAILER.codesPerWindow);
  ok('expired counter rows are removed with the other expired sign-in rows', JSON.stringify(rc.Condition_Cleanup_Sessions).includes("'RateLimit'"));

  m.server.close(); late.close();
}

section('Release package (npm run mailer:package)');
{
  const { buildPackage, packageFiles, ZIP_PATH } = await import('../scripts/package-mailer.mjs');
  const pkgFiles = packageFiles();
  const names = Object.keys(pkgFiles);
  ok('the committed release zip is what a fresh build produces', fs.existsSync(ZIP_PATH) && fs.readFileSync(ZIP_PATH).equals(buildPackage()), 'run: npm run mailer:package');
  ok('it carries the app, all five flow packages, the tools and the guide',
    ['web/index.html', 'web/js/app.js', 'web/js/letterhead.js', 'web/js/letterhead.generated.js', 'tools/serve.mjs', 'tools/mock-flows.mjs', 'tools/verify-package.mjs', 'README.md', 'GO-LIVE.html', 'start.cmd', 'start-demo.sh', 'setup.cmd', 'setup.sh', 'tools/setup.mjs', 'tools/bundle.mjs', 'data/directory.csv', 'PACKAGE_MANIFEST.json'].every((n) => names.includes(n))
    && FLOWS.every((f) => names.includes(`flows/packages/${f.name}.zip`) && names.includes(`web/flows/packages/${f.name}.zip`)));
  ok('it never carries a config.local.js', !names.some((n) => /config\.local\.js$/.test(n)));
  ok('no packaged tool reaches back into the repository', ['tools/serve.mjs', 'tools/mock-flows.mjs', 'tools/verify-package.mjs', 'tools/setup.mjs', 'tools/bundle.mjs'].every((n) => {
    const src = pkgFiles[n].toString('utf8');
    return ![...src.matchAll(/^import .* from '([^']+)'/gm)].some((m) => m[1].startsWith('.') && !m[1].startsWith('./mock-flows'));
  }));
  const manifest = JSON.parse(pkgFiles['PACKAGE_MANIFEST.json']);
  ok('the manifest lists every other file with its hash', manifest.files.length === names.length - 1 && manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  const dir = parseCsv(pkgFiles['data/directory.csv'].toString('utf8'));
  ok('data/directory.csv is the guide, in the Directory screen\'s import format', dir.length === 25 && dir[0].key === 'NPF-NCCC' && dir.find((r) => r.key === 'NPC').email === '');
  ok('.cmd files have CRLF, everything else LF', /\r\n/.test(pkgFiles['start.cmd'].toString()) && !/\r/.test(pkgFiles['web/js/app.js'].toString()));
}

section('Full export ZIP (mailer/js/zip.js)');
{
  const { zip, unzip, crc32, base64ToBytes, bytesToBase64 } = await import('../mailer/js/zip.js');
  const { buildZip } = await import('../scripts/lib/zip-writer.mjs');
  ok('crc32 matches the reference value', crc32(new TextEncoder().encode('123456789')) === 0xcbf43926);
  const pdf = new Uint8Array(300000).map((_, i) => (i * 131 + 7) & 0xff);
  const bytes = zip([{ name: 'manifest.json', data: '{"kind":"dgo-mailer-export"}' }, { name: 'attachments/a1/NUC_Letter — é.pdf', data: pdf }], new Date(2026, 8, 25, 10, 30));
  const tmp = path.join(os.tmpdir(), `mailer-export-${process.pid}.zip`);
  fs.writeFileSync(tmp, bytes);
  const read = openZip(tmp);
  fs.rmSync(tmp);
  ok('an independent ZIP reader opens the export and gets every byte back',
    read.members.length === 2 && read.members[1].name === 'attachments/a1/NUC_Letter — é.pdf' && Buffer.compare(read.members[1].read(), Buffer.from(pdf)) === 0);
  const back = await unzip(bytes);
  ok('the mailer reads its own export back', back.get('manifest.json') && Buffer.compare(Buffer.from(back.get('attachments/a1/NUC_Letter — é.pdf')), Buffer.from(pdf)) === 0);
  const deflated = await unzip(buildZip([{ name: 'a.txt', data: Buffer.from('hello '.repeat(500)) }]));
  ok('it also reads a re-zipped (deflated) export', Buffer.from(deflated.get('a.txt')).toString() === 'hello '.repeat(500));
  ok('base64 round trip is exact for large files', Buffer.compare(Buffer.from(base64ToBytes(bytesToBase64(pdf))), Buffer.from(pdf)) === 0);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
