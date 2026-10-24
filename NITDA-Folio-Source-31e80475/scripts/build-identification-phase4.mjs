#!/usr/bin/env node
/**
 * Identification Phase 4 (IDENTIFICATION_SYSTEM.md §13): the internal flows on the generation kit.
 *
 *   npm run idphase4
 *   npm run idphase4 -- --check
 *
 * Sources, never edited here: the tenant captures in docs/folio-Master-Flows-and-Endpoints/captures/. Each flow's
 * edits name the action they touch and check the text they expect (scripts/lib/identification-flow-edit.mjs), so the
 * build fails, rather than guessing, if a source changes. tests/identification-phase4.test.mjs runs the result in the
 * strict simulator.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCatalogue, messagesOf } from './lib/email-catalogue.mjs';
import { packageFingerprint } from './lib/package-fingerprint.mjs';
import { flowArtifactName } from './lib/flow-artifact-name.mjs';
import * as K from './lib/identification-kit.mjs';
import { DeepLinkConfig } from '../config/deeplink.config.js';
import { FailureGroups, FailureGroupByType, FailureGroupByFlowType, FailureWatchDefaults } from '../config/notification-failure-groups.config.js';
import { locate, names, ok, edit, ROLE_OF, redactProofHeader, adoptConnections, fromCapture, fromExport, outboxReceipts, bindReceipts, guardUtcInputs, adminRecipients, registryMailConnection, REGISTRY_MAIL_CONNECTION, packageStatus, variableSteps, variableStepsChanged, composeVariableValues } from './lib/identification-flow-edit.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4';
const CONFIG_SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';

/* ---------------------------------------------------------------- caller identity (G-04) */
/**
 * G-04 / AUTHENTICATION_CONTRACT.md §2: an internal endpoint takes its caller from a sign-in proof, never from the
 * request body. The proof is the bearer token Folio sends (core/auth.js authHeaders), looked up in the proof ledger:
 * unconsumed, Purpose internal-session, unexpired — the check the G-04 designer-pastes make
 * (surfaces/internal/designer-paste/DGO_*.designer-paste.json). Until the proof mint (DGO_OTP_VERIFY) is installed no
 * client holds a valid proof, so one Flow Configuration switch, IDENTITY_PROOF_REQUIRED, sets the posture for every
 * identification package at once:
 *   not 'true' — as today: a valid proof is used when one is sent, else the address the request names;
 *   'true'     — the caller is the proof's address or nobody, and the endpoint's gate refuses nobody (401).
 * The identification packages carry this themselves, so applying G-04 is setting the switch, not re-pasting flows.
 */
/* ITEM-64: the internal platform's proof ledger is decided separate from the portal's (docs/reference/internal-proof-ledger.json,
   2026-09-24). Until its list is provisioned and its GUID recorded there (listId), the internal flows keep the shared
   ledger with the internal-session Purpose filter; rebuild (npm run idphase4) once listId is set. */
const INTERNAL_LEDGER = JSON.parse(readFileSync(join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'docs/reference/internal-proof-ledger.json'), 'utf8'));
const PROOF_LEDGER = INTERNAL_LEDGER.listId
  ? { site: INTERNAL_LEDGER.listToProvision.site, table: INTERNAL_LEDGER.listId }
  : { site: 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre', table: 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9' };
const GOV_SITE = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
const spGet = (dataset, table, filter, top = 1) => ({ type: 'OpenApiConnection', runAfter: {}, inputs: {
  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
  parameters: { dataset, table, $filter: filter, $top: top } } });
function callerGate(tag, bodyEmail) {
  const TOKEN = `Compose_${tag}_Proof_Token`, PROOF = `Get_${tag}_Proof`, MODE = `Get_${tag}_Proof_Mode`;
  const ROWS = `coalesce(outputs('${PROOF}')?['body/value'],json('[]'))`;
  const REQUIRED = `equals(toLower(trim(string(coalesce(first(coalesce(outputs('${MODE}')?['body/value'],json('[]')))?['ConfigValue'],'')))),'true')`;
  return K.chain(
    { [MODE]: spGet(CONFIG_SITE, '9bc168c3-06e5-4d58-982b-0df06205fd35', "Title eq 'IDENTITY_PROOF_REQUIRED'") },
    { [TOKEN]: { type: 'Compose', inputs: "@trim(replace(replace(string(coalesce(triggerOutputs()?['headers']?['X-DGO-Proof'],triggerOutputs()?['headers']?['x-dgo-proof'],triggerOutputs()?['headers']?['Authorization'],triggerOutputs()?['headers']?['authorization'],'')),'Bearer ',''),'bearer ',''))" } },
    { [PROOF]: spGet(PROOF_LEDGER.site, PROOF_LEDGER.table, `@if(empty(outputs('${TOKEN}')),'ID eq 0',concat('Title eq ''',replace(outputs('${TOKEN}'),'''',''''''),''' and Consumed eq 0 and Purpose eq ''internal-session'''))`) },
    { [`Compose_${tag}_Identity`]: { type: 'Compose', inputs: {
      proofRequired: `@${REQUIRED}`,
      proofValid: `@and(not(empty(outputs('${TOKEN}'))),greater(length(${ROWS}),0),greater(ticks(coalesce(first(${ROWS})?['ExpiresAtUtc'],'1900-01-01T00:00:00Z')),ticks(utcNow())))`,
    } } },
    { [`Compose_${tag}_Caller`]: { type: 'Compose', inputs: `@if(outputs('Compose_${tag}_Identity')?['proofValid'],toLower(trim(string(coalesce(first(${ROWS})?['Email'],'')))),if(outputs('Compose_${tag}_Identity')?['proofRequired'],'',toLower(trim(string(coalesce(${bodyEmail},''))))))` } },
  );
}
/** The directory and role check for an endpoint that had none (SINGLE_ASSIGNMENT, BULK_ASSIGNMENT). It decides only
 *  when the proof is required, so the flows answer as they do today until the switch is set. A role passes on "*", on
 *  the endpoint's Folio route (config/rbac.config.js) in AllowedRoutesJson, or on bulk:assign in PermissionsJson (the
 *  G-04 packages' permission). Output Compose_<tag>_Auth: ok, unauthenticated or forbidden. */
function permissionGate(tag, route) {
  const CALLER = `outputs('Compose_${tag}_Caller')`;
  const DIR = `Get_${tag}_Directory_User`, PERM = `Get_${tag}_Role_Permissions`;
  const PROW = `first(coalesce(outputs('${PERM}')?['body/value'],json('[]')))`;
  return K.chain(
    { [DIR]: spGet(GOV_SITE, '3d591f5b-3f2f-409c-983a-a77b5c174834', `@if(empty(${CALLER}),'ID eq 0',concat('Email eq ''',replace(${CALLER},'''',''''''),''' and Status eq ''active'''))`) },
    { [`Compose_${tag}_Role`]: { type: 'Compose', inputs: `@${ROLE_OF(`first(coalesce(outputs('${DIR}')?['body/value'],json('[]')))`)}` } },
    { [PERM]: spGet(GOV_SITE, 'f675598b-271d-4200-8d75-2597aad4057f', `@if(empty(outputs('Compose_${tag}_Role')),'ID eq 0',concat('RoleId eq ''',replace(outputs('Compose_${tag}_Role'),'''',''''''),''' and Active eq 1'))`) },
    { [`Compose_${tag}_Auth`]: { type: 'Compose', inputs: `@if(not(outputs('Compose_${tag}_Identity')?['proofRequired']),'ok',if(or(empty(${CALLER}),empty(coalesce(outputs('${DIR}')?['body/value'],json('[]')))),'unauthenticated',if(or(contains(string(coalesce(${PROW}?['AllowedRoutesJson'],'')),'"*"'),contains(string(coalesce(${PROW}?['AllowedRoutesJson'],'')),'"${route}"'),contains(string(coalesce(${PROW}?['PermissionsJson'],'')),'bulk:assign')),'ok','forbidden')))` } },
  );
}

/* ---------------------------------------------------------------- Single_Task_Assignment */
function singleAssignment(pkg, log) {
  const A = pkg.serializedValue.actions;
  const RQ = "variables('varRequestId')";
  const DOC = (col) => `outputs('Get_item_Doc')?['body/${col}']`;
  const RECQK = `if(equals(length(string(coalesce(${DOC('EntityKey')},''))),36),concat('REC:',toLower(string(${DOC('EntityKey')}))),'')`;
  const HASH = "toLower(trim(string(coalesce(triggerBody()?['clientRequestHash'],''))))";

  edit(log, 'S8 / ID-19: every run mints its Request ID. varRequestId was declared with no value and never set, so every reply and error record carried an empty requestId. The root scope now sets it to guid() first.', () => {
    const mode = A.Compose_Mode;
    if (!mode || (mode.runAfter && Object.keys(mode.runAfter).length)) throw new Error('Compose_Mode is no longer first in Scope_Global');
    A.Set_variable_varRequestId = { type: 'SetVariable', inputs: { name: 'varRequestId', value: '@guid()' }, runAfter: {} };
    mode.runAfter = ok('Set_variable_varRequestId');
  });

  edit(log, 'G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above): from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail as today. With the switch true, a caller who is not an active directory user is refused with 401 and one whose role does not allow single-assignment (or bulk:assign) with 403, through the flow\'s own validation-failure path, before any task is claimed or written. The task\'s AssignedBy is that caller.', () => {
    const mode = A.Compose_Mode;
    const gate = K.chain(callerGate('Assign_Gate', "triggerBody()?['userEmail']"), permissionGate('Assign_Gate', 'single-assignment'));
    gate[Object.keys(gate)[0]].runAfter = ok('Set_variable_varRequestId');
    Object.assign(A, gate);
    mode.runAfter = ok('Compose_Assign_Gate_Auth');
    const AUTH = "outputs('Compose_Assign_Gate_Auth')";
    const v = A.Condition_Validate_Input;
    const old = v.expression.and[0].equals[0];
    if (!old.startsWith("@or(empty(string(triggerBody()?['Selected']?['ID']))")) throw new Error('Condition_Validate_Input changed in the source');
    v.expression.and[0].equals[0] = `@or(not(equals(${AUTH},'ok')),${old.slice(1)})`;
    const err = v.actions.Scope_Validation_Failure.actions['Append_to_array_variable_varErrrors_(array)__Validation_error'].inputs.value;
    if (err.message !== 'No selected item was provided.') throw new Error('validation message changed in the source');
    err.message = `@if(equals(${AUTH},'unauthenticated'),'The caller is not an active user in the DGO user directory.',if(equals(${AUTH},'forbidden'),'The caller''s role does not allow assignments.','No selected item was provided.'))`;
    const st = A.Scope_Finalize_Response_State.actions.Set_variable_varStatusCode.inputs;
    if (!String(st.value).startsWith('@if(or(greater(variables(\'varFailedCount\'), 0)')) throw new Error('Set_variable_varStatusCode changed in the source');
    st.value = `@if(equals(${AUTH},'unauthenticated'),401,if(equals(${AUTH},'forbidden'),403,${st.value.slice(1)}))`;
    const ct = locate(A, 'Create_Task').a.inputs.parameters;
    if (ct['item/AssignedBy'] !== "@triggerBody()?['userEmail']") throw new Error('Create_Task AssignedBy changed in the source');
    ct['item/AssignedBy'] = "@outputs('Compose_Assign_Gate_Caller')";
  });

  edit(log, 'ID-19: the reply\'s requestId is always the flow\'s own. It took the client\'s requestId whenever the request carried one.', () => {
    const r = locate(A, 'Compose__Standard_Response_Revised').a;
    const want = "@if(\n      empty(trim(string(coalesce(triggerBody()?['requestId'], '')))),\n      variables('varRequestId'),\n      triggerBody()?['requestId']\n    )";
    if (r.inputs?.request?.requestId !== want) throw new Error('Compose__Standard_Response_Revised requestId changed in the source');
    r.inputs.request.requestId = "@variables('varRequestId')";
  });

  edit(log, 'S3 / §8.2: each new task gets a Task Reference TASK-YYYY-NNNNN, claimed by the generation kit (10 flat attempts, IF-MATCH, counter row TASK-<year> created by the first claim of the year), addressed through Flow Configuration (DATASET_SEQUENCE_COUNTERS_*). If no number can be claimed the task is not created and the run takes the existing Task Processing catch, which records the error.', () => {
    const { parent } = locate(A, 'Create_Task');
    if (JSON.stringify(parent.Create_Task.runAfter) !== JSON.stringify(ok('Get_item_Doc'))) throw new Error('Create_Task order changed in the source');
    const kit = K.chain(
      K.readDatasetBindings({ keys: ['SEQUENCE_COUNTERS'], configSite: CONFIG_SITE }),
      K.environmentPrefix(),
      K.entityKey('Task'),
      K.claimReference({ tag: 'Task', prefix: 'TASK' }),
    );
    const first = Object.keys(kit)[0];
    kit[first].runAfter = ok('Get_item_Doc');
    Object.assign(parent, kit);
    /* if() evaluates both of its branches, so it chooses between two plain strings and int() runs on the result: the step
       fails only when the claim did, and a task is never created without a number. */
    parent.Compose_Task_Claim_Check = { type: 'Compose', inputs: "@int(if(equals(outputs('Compose_Claim_Task')?['ok'],true),'0','TASK_REFERENCE_UNAVAILABLE'))", runAfter: ok('Compose_Claim_Task') };
    parent.Compose_Task_Ref = { type: 'Compose', inputs: "@string(coalesce(first(outputs('Compose_Claim_Task')?['references']),''))", runAfter: ok('Compose_Task_Claim_Check') };
    parent.Create_Task.runAfter = ok('Compose_Task_Ref');
  });

  edit(log, '§10.2 TASK_QUEUE: the task row carries its Entity Key, TaskRef, ParentKey and RootKey REC:<the document\'s record key> (DGO DIGITAL OPS rows carry the master record\'s key; empty for a row the Phase 5 backfill has not reached), RootRef (the record\'s ReferenceId), IdState ACTIVE, Rev 1, the Request ID as CorrelationId and CreatedByRequest, and ClientRequestHash when the request carries one (B3). The task type and grouping, which a second Update item wrote straight after the create, are written by the create itself, so that update is removed (it is a governed row: B9).', () => {
    const { parent } = locate(A, 'Create_Task');
    const upd = parent.Update_Item_Task || parent.Update_item_Task;
    const up = upd.inputs.parameters;
    for (const k of ['item/TaskTypeChoice/Value', 'item/TaskType/Value', 'item/GTQGrouping']) if (!(k in up)) throw new Error(`Update_item_Task: no ${k}`);
    if (Object.keys(up).filter((k) => k.startsWith('item/')).length !== 3) throw new Error('Update_item_Task writes more than the task type and grouping');
    Object.assign(parent.Create_Task.inputs.parameters, {
      'item/TaskTypeChoice/Value': up['item/TaskTypeChoice/Value'],
      'item/TaskType/Value': up['item/TaskType/Value'],
      'item/GTQGrouping': up['item/GTQGrouping'],
      'item/EntityKey': "@outputs('Compose_EntityKey_Task')",
      'item/TaskRef': "@outputs('Compose_Task_Ref')",
      'item/ParentKey': `@${RECQK}`,
      'item/RootKey': `@${RECQK}`,
      'item/RootRef': `@string(coalesce(${DOC('ReferenceId')},''))`,
      'item/IdState/Value': 'ACTIVE',
      'item/Rev': 1,
      'item/CorrelationId': `@${RQ}`,
      'item/CreatedByRequest': `@${RQ}`,
      'item/ClientRequestHash': `@if(equals(length(${HASH}),64),${HASH},'')`,
    });
    if (JSON.stringify(parent.Update_item_Doc.runAfter) !== JSON.stringify(ok('Update_item_Task'))) throw new Error('Update_item_Doc order changed in the source');
    delete parent.Update_item_Task;
    parent.Update_item_Doc.runAfter = ok('Compose_ReferenceID');
  });

  edit(log, 'S3: new tasks have no composite reference. Compose_ReferenceID, which the e-mails, the acknowledgement link\'s ref= text and the task/document pairs show, is now the Task Reference. The composite <yyyyMMdd>-<doc ID>-<category>-<sub-category>-<task ID> was never stored, so nothing that resolves a task changes; the acknowledgement link finds the task by its item= value, as before.', () => {
    const r = locate(A, 'Compose_ReferenceID').a;
    if (!String(r.inputs).includes("formatDateTime(") || !String(r.inputs).includes("'yyyyMMdd'")) throw new Error('Compose_ReferenceID changed in the source');
    r.inputs = "@outputs('Compose_Task_Ref')";
  });

  edit(log, 'Review C-1 (2026-10-02): assigning a document no longer erases its AI extraction. Update_item_Doc wrote BodyExtract and TextExtraxt as empty text; both keys are removed, and Update item leaves fields it is not given unchanged.', () => {
    const p = locate(A, 'Update_item_Doc').a.inputs.parameters;
    if (p['item/BodyExtract'] !== '' || p['item/TextExtraxt'] !== '') throw new Error('Update_item_Doc no longer blanks the AI fields');
    delete p['item/BodyExtract']; delete p['item/TextExtraxt'];
  });

  edit(log, 'Review C-2 (2026-10-02): Compose_Config_BaseURL held a Markdown link, [https://taskack.page.gd](https://taskack.page.gd), so the acknowledgement link built from it was broken. It is now the address itself.', () => {
    const c = locate(A, 'Compose_Config_BaseURL').a;
    if (c.inputs !== '[https://taskack.page.gd](https://taskack.page.gd)') throw new Error('Compose_Config_BaseURL changed in the source');
    c.inputs = 'https://taskack.page.gd';
  });

  edit(log, 'Tenant defect 2026-10-10 (TASK-2026-00002, run 08584100110433772866731334335CU24): the e-mail greeted "Dear ,". Compose_AssignedToTitle_Value took coalesce() of its candidates, and coalesce() skips only nulls: the department match came back as empty text and won. It now takes the first candidate that is not empty, ending with "Officer".', () => {
    const t = locate(A, 'Compose_AssignedToTitle_Value').a;
    const want = "@coalesce(outputs('Compose_MatchedDepartmentValue'), outputs('Get_item_Task')?['body/HDSUTitletext'], outputs('Get_item_Task')?['body/AssignedToTitle'], triggerBody()?['NewActivityTask']?['AssignedToTitle'], outputs('Get_item_Task')?['body/Assigned'], triggerBody()?['NewActivityTask']?['AssignedTo'], 'Officer')";
    if (t.inputs !== want) throw new Error('Compose_AssignedToTitle_Value changed in the source');
    const candidates = want.slice('@coalesce('.length, -1).split(/,\s(?=outputs|triggerBody|')/);
    const pick = candidates.slice(0, -1).reduceRight((rest, c) => `if(empty(trim(string(coalesce(${c},'')))),${rest},trim(string(${c})))`, "'Officer'");
    t.inputs = `@${pick}`;
  });

  edit(log, 'Tenant defect 2026-10-10: Handling Status and Response Priority both read "Standard Official Review" on every normal task, because both fell back to that text. Response Priority now states the response window it describes: "Priority Review Window" for critical, urgent or high, otherwise "Standard Response Window". Handling Status is unchanged.', () => {
    const p = locate(A, 'Compose_Priority_Text').a;
    if (!String(p.inputs).endsWith("'Restricted Executive Dispatch','Standard Official Review'))")) throw new Error('Compose_Priority_Text changed in the source');
    p.inputs = String(p.inputs).replace(/'Standard Official Review'\)\)$/, "'Standard Response Window'))");
  });

  edit(log, 'Tenant defect 2026-10-10: the Support Access link sent ref=TASK-<item ID> (TASK-16167) while the e-mail itself shows the Task Reference (TASK-2026-00002). The link now carries the Task Reference, Compose_ReferenceID, and keeps item=<ID> for the lookup.', () => {
    let n = 0;
    const walk = (acts) => { for (const [, a] of Object.entries(acts || {})) {
      if (a.type === 'Compose' && typeof a.inputs === 'string' && a.inputs.includes('support.html')) {
        const old = "'?ref=', uriComponent(concat('TASK-', string(coalesce(outputs('Get_item_Task')?['body/ID'], 0))))";
        if (a.inputs.includes(old)) { a.inputs = a.inputs.split(old).join("'?ref=', uriComponent(string(coalesce(outputs('Compose_ReferenceID'), concat('TASK-', string(coalesce(outputs('Get_item_Task')?['body/ID'], 0))))))"); n++; }
      }
      for (const sub of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions]) if (sub) walk(sub);
    } };
    walk(A);
    if (!n) throw new Error('no support link carries ref=TASK-<item ID>');
  });
  repointTaskLinks(A, log);
}

/** Owner decision 2026-10-08: links in task e-mails open the Workspace at its primary host (config/deeplink.config.js
 *  productionBase), not taskack.page.gd. The Workspace serves index.html and support.html there, and the forwarding
 *  pages keep the old page names working, so only the host changes. */
const OLD_TASK_HOST = 'https://taskack.page.gd';
function repointTaskLinks(A, log) {
  const base = DeepLinkConfig.productionBase.replace(/\/$/, '');
  edit(log, `Deep links: task e-mail links start at ${base} (the Workspace's primary host, owner 2026-10-08), not ${OLD_TASK_HOST}.`, () => {
    let n = 0;
    const walk = (acts) => { for (const [k, a] of Object.entries(acts || {})) {
      if (a.type === 'Compose' && typeof a.inputs === 'string' && a.inputs.includes(OLD_TASK_HOST) && /Link|BaseURL/.test(k)) { a.inputs = a.inputs.split(OLD_TASK_HOST).join(base); n++; }
      for (const sub of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions]) if (sub) walk(sub);
    } };
    walk(A);
    if (!n) throw new Error(`no task link names ${OLD_TASK_HOST}`);
  });
}

/* ---------------------------------------------------------------- read endpoints: no payload in run records */
/** ITEM-52 (owner decision 2026-10-06: surplus mail from read endpoints is removed). Tenant evidence 2026-10-10: every
 *  FETCH_ALL call e-mailed dgsregistry a "Flow Run Record" whose attachment carried body_sent, the whole reply (about
 *  6.4 MB: documents, tasks, the directory with e-mail addresses), and wrote the same into Portal Flow Telemetry's
 *  RunRecordJson. GET_DOCS and REFERENCE_DATA carry the same capture. The run record now states the reply's size, not
 *  its contents, and the read endpoint sends no run-record mail; the telemetry row (outcome, duration, errors) stays. */
/* ITEM-74 (owner decision 2026-10-10: build an e-mail source). FETCH_ALL returned emails: [] (a literal), so Folio had no
   e-mail to raise a task from. The registry tier now receives the registry inbox's newest 50 messages, summary fields only. */
function fetchAllEmails(pkg, log) {
  edit(log, 'ITEM-74 (owner decision 2026-10-10): FETCH_ALL carries the registry inbox. For the all tier (the registry, admin and executive roles) it reads the newest 50 messages of the registry mailbox\'s Inbox (Office 365 Get emails (V3), as Fetch_Emails_POST does, no attachments) and returns id, subject, sender, received time, preview, importance, conversation, internetMessageId and whether it has attachments, so Lookup can raise a task from an e-mail (EMAIL_RELATED_TASK). Other tiers receive none. A failed read leaves the list empty; the rest of the reply is unchanged.', () => {
    const A = pkg.serializedValue.actions;
    let hit = null;
    const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
      if (a.type === 'SetVariable' && a.inputs?.value && typeof a.inputs.value === 'object' && Array.isArray(a.inputs.value.emails)) hit = { parent: o, name: n, a };
      walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions);
    } };
    walk(A);
    if (!hit || hit.a.inputs.value.emails.length) throw new Error('FETCH_ALL no longer sets emails to []');
    const TIER = "outputs('Compose_FetchAll_Scope')?['tier']";
    hit.parent.Condition_FetchAll_Read_Emails = { type: 'If', runAfter: hit.a.runAfter || {},
      expression: { and: [{ equals: [`@${TIER}`, 'all'] }] },
      actions: {
        Get_FetchAll_Registry_Emails: { type: 'OpenApiConnection', runAfter: {}, inputs: {
          host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'GetEmailsV3' },
          parameters: { folderPath: 'Inbox', fetchOnlyUnread: false, includeAttachments: false, top: 50, importance: 'Any', fetchOnlyWithAttachment: false } } },
        Select_FetchAll_Emails: { type: 'Select', runAfter: ok('Get_FetchAll_Registry_Emails'), inputs: {
          from: "@coalesce(outputs('Get_FetchAll_Registry_Emails')?['body/value'],json('[]'))",
          select: { id: "@item()?['id']", subject: "@item()?['subject']", fromAddress: "@toLower(string(coalesce(item()?['from'],'')))",
            receivedDateTime: "@item()?['receivedDateTime']", bodyPreview: "@substring(string(coalesce(item()?['bodyPreview'],'')),0,min(length(string(coalesce(item()?['bodyPreview'],''))),400))",
            hasAttachments: "@item()?['hasAttachments']", importance: "@item()?['importance']", conversationId: "@item()?['conversationId']", internetMessageId: "@item()?['internetMessageId']",
            toRecipients: "@split(string(coalesce(item()?['toRecipients'],'')),';')" } } },
      },
      else: { actions: {} } };
    hit.a.runAfter = { Condition_FetchAll_Read_Emails: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] };
    hit.a.inputs.value.emails = `@if(and(equals(${TIER},'all'),equals(actions('Select_FetchAll_Emails')?['status'],'Succeeded')),body('Select_FetchAll_Emails'),json('[]'))`;
  });
}

function quietReadCapture(pkg, log, recordKey) {
  const A = pkg.serializedValue.actions;
  edit(log, `ITEM-52: the ${recordKey.replace(/_record$/, '')} run record carries the reply's size instead of the reply, and the read endpoint no longer e-mails its run record (owner decision 2026-10-06; tenant evidence 2026-10-10).`, () => {
    const cap = A.Scope_Flow_Data_Capture?.actions;
    if (!cap) throw new Error('no Scope_Flow_Data_Capture');
    const rec = cap.Compose_Flow_Run_Record?.inputs?.[recordKey];
    if (!rec || typeof rec.body_sent !== 'string' || !rec.body_sent.includes("?['inputs']?['body']")) throw new Error(`${recordKey}.body_sent changed in the source`);
    rec.body_sent_bytes = `@length(string(${rec.body_sent.slice(1)}))`;
    delete rec.body_sent;
    const schema = cap.Compose_Flow_Run_Record_Schema?.inputs?.properties?.[recordKey];
    if (!schema?.properties || !('body_sent' in schema.properties)) throw new Error(`the run record schema no longer describes ${recordKey}.body_sent`);
    delete schema.properties.body_sent;
    schema.properties.body_sent_bytes = { type: 'integer' };
    if (Array.isArray(schema.required)) schema.required = schema.required.map((r) => (r === 'body_sent' ? 'body_sent_bytes' : r));
    /* The outbox receipt and outcome steps for this send are added by a later pass (ITEM-66) to every send it finds;
       with the send gone, none is added. */
    for (const k of ['Compose_Telemetry_Attachments', 'Send_Telemetry_Email']) {
      if (!cap[k]) throw new Error(`Scope_Flow_Data_Capture has no ${k}`);
      delete cap[k];
    }
    const left = JSON.stringify(cap);
    for (const k of ['Compose_Telemetry_Attachments', 'Send_Telemetry_Email', 'Create_Send_Telemetry_Email_Receipt', 'Compose_Send_Telemetry_Email_Outcome']) if (left.includes(`'${k}'`) || left.includes(`"${k}"`)) throw new Error(`something still depends on ${k}`);
  });
}

/* ---------------------------------------------------------------- BULK_ASSIGNMENT */
/**
 * The bulk assignment flow, built on the generation kit for the flow Folio's BULK_ASSIGNMENT URL calls
 * (BULK_OPS_DATA_RETRIEVAL_HTTP, 5aab9e61). That flow only read documents, so nothing Folio sent to it was ever
 * assigned. The scope here replaces its Scope_Global and uses only the variables that flow declares above it.
 *
 * Per document it runs the task steps of the Phase 4 Single_Task_Assignment package (task row with its identity
 * columns, the document row without the AI wipe, the assignee title, one notification), so a bulk task and a single
 * task are the same record. The Task References are claimed once for the whole batch (T7), and the reply is sent before
 * the tasks are created: Folio allows 50 records a batch and waits 90 s, and a batch that outlived the wait would be
 * queued and sent again.
 */
const LOOP = 'Apply_to_each_Bulk_Item';
function bulkAssignment(single, log) {
  const S = single.serializedValue.actions;
  const proc = structuredClone(locate(S, 'Scope_Task_Processing').a.actions);
  const body = { Scope_Create_Task: proc.Scope_Create_Task, Scope_Assigned_To_Title_Resolution: proc.Scope_Assigned_To_Title_Resolution, Scope_Task_Email_Notification: proc.Scope_Task_Email_Notification };
  const IT = (k) => `items('${LOOP}')?['${k}']`;

  edit(log, 'Each document goes through the task steps of the Single_Task_Assignment package above: the task row in Global Tracking Queue with its identity columns, the document row in DGO DIGITAL OPS (Processed, its AI extraction kept: C-1), the assignee\'s title from Departments, and one notification to the assignee with the task\'s acknowledgement link. A bulk task and a single task are the same record.', () => {});
  edit(log, 'T7 / §8.2: the Task References for the whole batch are claimed once, by the generation kit, before any task is created: N consecutive TASK-YYYY-NNNNN numbers from the TASK-<year> counter. Each document is paired with its number before the loop, so a document keeps its number whatever happens to the others. If no numbers can be claimed the reply is 503 RETRY_LATER and nothing is created.', () => {
    const ct = body.Scope_Create_Task.actions;
    const drop = Object.keys(ct).filter((n) => /^(Get_Dataset_Bindings|Select_Dataset_Bindings|Compose_Dataset_Bindings|Compose_Environment_Prefix|Compose_Claim_Task.*|Scope_Claim_Task_\d+|Select_Claim_Task_References|Compose_Task_Claim_Check|Compose_Task_Ref|Set_variable_vardocID_1|Increment_variable_.*)$/.test(n));
    for (const n of ['Compose_Task_Ref', 'Set_variable_vardocID_1', 'Scope_Claim_Task_1', 'Increment_variable_varTasksCretedCount', 'Increment_variable_varDocsUpdatedCount']) if (!drop.includes(n)) throw new Error(`Single_Task_Assignment: no ${n}`);
    for (const n of drop) delete ct[n];
    ct.Get_item_Doc.runAfter = {};
    ct.Compose_EntityKey_Task.runAfter = ok('Get_item_Doc');
    ct.Create_Task.runAfter = ok('Compose_EntityKey_Task');
    ct.Get_item_Task.runAfter = ok('Create_Task');
    if (JSON.stringify(ct.Update_item_Doc.runAfter) !== JSON.stringify(ok('Compose_ReferenceID'))) throw new Error('Update_item_Doc order changed');
    const em = body.Scope_Task_Email_Notification.actions;
    if (!em.Increment_variable_varNotifcationsSentCount) throw new Error('Single_Task_Assignment: no notification counter');
    delete em.Increment_variable_varNotifcationsSentCount;
  });

  edit(log, 'Folio\'s payload is read as it sends it (core/assignment-payload.js, dgo-bulk-assignment-payload/v2: ids, category, categoryCode, subcategory, subcategoryCode, assignedTo, assignedToDsu, supportingAssignee, supportingDsu, ccRecipients, priority, startDate, ack, due, instruction, requestedBy). Compose_Bulk_Task holds those values under the names the task steps read; per document, the activity and document IDs are the document\'s own and the title and attachment link come from its DGO DIGITAL OPS row.', () => {
    let t = JSON.stringify(body);
    const sub = (a, b) => { if (!t.includes(a)) throw new Error(`task steps no longer read ${a}`); t = t.split(a).join(b); };
    sub("triggerBody()?['NewActivityTask']?['ActivityID']", `int(${IT('id')})`);
    sub("triggerBody()?['NewActivityTask']?['AttachmentLink']", "outputs('Get_item_Doc')?['body/AttachmentLink']");
    sub("triggerBody()?['NewActivityTask']?['Title']", "outputs('Get_item_Doc')?['body/Title']");
    sub("triggerBody()?['NewActivityTask']", "outputs('Compose_Bulk_Task')");
    sub("triggerBody()?['userEmail']", "outputs('Compose_Bulk_Task')?['CreatedBy']");
    sub("variables('vardocID')", `int(${IT('id')})`);
    sub("outputs('Compose_Assign_Gate_Caller')", "outputs('Compose_Bulk_Task')?['CreatedBy']");
    sub("outputs('Compose_Task_Ref')", IT('taskRef'));
    /* One task per run of these steps: the counters the single flow kept are 1 task, 1 document, nothing failed. */
    sub("variables('varTasksCreatedCount')", '1');
    sub("variables('varDocsUpdatedCount')", '1');
    for (const v of ['varFailedCount', 'varNotificationsSentCount']) if (t.includes(`variables('${v}')`)) t = t.split(`variables('${v}')`).join('0');
    if (/triggerBody\(\)\?\['(NewActivityTask|Selected|userEmail)'\]/.test(t)) throw new Error('a single-assignment field is still read');
    Object.assign(body, JSON.parse(t));
  });

  const IDS = "body('Select_Bulk_Ids')";
  const N = `length(${IDS})`;
  const TB = (k) => `triggerBody()?['${k}']`;
  const TXT = (k) => `trim(string(coalesce(${TB(k)},'')))`;
  const A = {};
  /* The flow's own Request ID (S8), and a known start for the answer: the variables are declared above the scope. */
  A.Set_variable_varRequestId = { type: 'SetVariable', inputs: { name: 'varRequestId', value: '@guid()' }, runAfter: {} };
  A.Set_variable_varStatusCode_Bulk_0 = { type: 'SetVariable', inputs: { name: 'varStatusCode', value: 0 }, runAfter: ok('Set_variable_varRequestId') };
  A.Set_variable_varData_Bulk_Empty = { type: 'SetVariable', inputs: { name: 'varData', value: {} }, runAfter: ok('Set_variable_varStatusCode_Bulk_0') };
  /* G-04: the caller (see "Caller identity"); Folio's v2 payload names its user as requestedBy. */
  const bgate = K.chain(callerGate('Bulk_Gate', "coalesce(triggerBody()?['userEmail'],triggerBody()?['requestedBy'])"), permissionGate('Bulk_Gate', 'bulk-assignment'));
  bgate[Object.keys(bgate)[0]].runAfter = ok('Set_variable_varData_Bulk_Empty');
  Object.assign(A, bgate);
  A.Select_Bulk_Ids = { type: 'Select', inputs: { from: `@coalesce(${TB('ids')},json('[]'))`, select: '@trim(string(item()))' }, runAfter: ok('Compose_Bulk_Gate_Auth') };
  A.Compose_Bulk_Priority = { type: 'Compose', inputs: `@if(empty(${TXT('priority')}),'normal',toLower(${TXT('priority')}))`, runAfter: ok('Select_Bulk_Ids') };
  const P = "outputs('Compose_Bulk_Priority')";
  A.Compose_Bulk_Task = { type: 'Compose', runAfter: ok('Compose_Bulk_Priority'), inputs: {
    StartDate: `@${TXT('startDate')}`,
    Category: `@${TXT('category')}`, CategoryCode: `@${TXT('categoryCode')}`,
    SubCategory: `@${TXT('subcategory')}`, SubCategoryCode: `@${TXT('subcategoryCode')}`,
    PrimaryDSU: `@${TXT('assignedToDsu')}`,
    AssignedTo: `@toLower(${TXT('assignedTo')})`,
    AssignedToTitle: null,
    supportingAssignedTo: `@toLower(${TXT('supportingAssignee')})`,
    SupportAssignedTo: `@toLower(${TXT('supportingAssignee')})`,
    SupportDSU: `@${TXT('supportingDsu')}`,
    AckDue: `@${TXT('ack')}`,
    TaskDueDate: `@${TXT('due')}`,
    CopyTo: `@join(coalesce(${TB('ccRecipients')},json('[]')),';')`,
    Priority: `@concat(toUpper(substring(${P},0,1)),substring(${P},1,sub(length(${P}),1)))`,
    Comments: `@${TXT('instruction')}`,
    CreatedBy: "@outputs('Compose_Bulk_Gate_Caller')",
  } };
  const T = (k) => `outputs('Compose_Bulk_Task')?['${k}']`;
  edit(log, 'G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above), from the sign-in proof or, while IDENTITY_PROOF_REQUIRED is not true, from userEmail or requestedBy. With the switch true, a caller who is not an active directory user is refused with 401 and one whose role does not allow bulk-assignment (or bulk:assign) with 403, before any number is claimed. The batch\'s requester (AssignedBy, the failure e-mail) is that caller.', () => {});
  edit(log, 'The request is refused with 400 unless it names 1 to 50 documents (Folio\'s own limit, config/app.config.js maxBulkAssign), an assignee e-mail address and a category.', () => {});
  const kit = K.chain(
    K.readDatasetBindings({ keys: ['SEQUENCE_COUNTERS'], configSite: CONFIG_SITE }),
    K.environmentPrefix(),
    K.claimReference({ tag: 'Task', prefix: 'TASK', count: `@${N}` }),
  );
  A.Condition_Bulk_Valid = {
    type: 'If', runAfter: ok('Compose_Bulk_Task'),
    expression: { and: [
      { greater: [`@${N}`, 0] },
      { lessOrEquals: [`@${N}`, 50] },
      /* contains() inside the expression: a value of just "@" would itself be read as an expression. */
      { equals: [`@contains(${T('AssignedTo')},'@')`, true] },
      { not: { equals: [`@empty(${T('Category')})`, true] } },
      { equals: ["@outputs('Compose_Bulk_Gate_Auth')", 'ok'] },
    ] },
    actions: {
      ...kit,
      Condition_Bulk_Claimed: {
        type: 'If', runAfter: ok('Compose_Claim_Task'),
        expression: { and: [{ equals: ["@outputs('Compose_Claim_Task')?['ok']", true] }] },
        actions: {
          Select_Bulk_Items: { type: 'Select', runAfter: {}, inputs: { from: `@range(0,${N})`, select: { id: `@${IDS}[item()]`, taskRef: "@outputs('Compose_Claim_Task')?['references'][item()]" } } },
          Set_variable_varData_Bulk_Accepted: { type: 'SetVariable', runAfter: ok('Select_Bulk_Items'), inputs: { name: 'varData', value: { accepted: `@${N}`, assignedTo: `@${T('AssignedTo')}`, tasks: "@body('Select_Bulk_Items')" } } },
          Set_variable_varStatusCode_Bulk_202: { type: 'SetVariable', runAfter: ok('Set_variable_varData_Bulk_Accepted'), inputs: { name: 'varStatusCode', value: 202 } },
        },
        else: { actions: {
          Set_variable_varData_Bulk_Retry: { type: 'SetVariable', runAfter: {}, inputs: { name: 'varData', value: { code: 'RETRY_LATER', message: 'Task references could not be issued. Nothing was assigned; try again in a few seconds.' } } },
          Set_variable_varStatusCode_Bulk_503: { type: 'SetVariable', runAfter: ok('Set_variable_varData_Bulk_Retry'), inputs: { name: 'varStatusCode', value: 503 } },
        } },
      },
    },
    else: { actions: {
      Set_variable_varData_Bulk_Invalid: { type: 'SetVariable', runAfter: {}, inputs: { name: 'varData', value: {
        error: "@if(equals(outputs('Compose_Bulk_Gate_Auth'),'unauthenticated'),'unauthenticated',if(equals(outputs('Compose_Bulk_Gate_Auth'),'forbidden'),'forbidden','invalid_request'))",
        message: "@if(equals(outputs('Compose_Bulk_Gate_Auth'),'unauthenticated'),'The caller is not an active user in the DGO user directory. Nothing was assigned.',if(equals(outputs('Compose_Bulk_Gate_Auth'),'forbidden'),'The caller''s role does not allow bulk assignment. Nothing was assigned.','A bulk assignment needs 1 to 50 document IDs, an assignee e-mail address and a category. Nothing was assigned.'))" } } },
      Set_variable_varStatusCode_Bulk_400: { type: 'SetVariable', runAfter: ok('Set_variable_varData_Bulk_Invalid'), inputs: { name: 'varStatusCode', value: "@if(equals(outputs('Compose_Bulk_Gate_Auth'),'unauthenticated'),401,if(equals(outputs('Compose_Bulk_Gate_Auth'),'forbidden'),403,400))" } },
    } },
  };
  const first = Object.keys(kit)[0];
  A.Condition_Bulk_Valid.actions[first].runAfter = {};
  /* A run that fails before choosing an answer (a counter read refused, say) answers 500. */
  const CODE = "if(equals(variables('varStatusCode'),0),500,variables('varStatusCode'))";
  A.Compose__Standard_Response_Revised = { type: 'Compose', runAfter: { Condition_Bulk_Valid: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: {
    ok: `@less(${CODE},400)`,
    status: { http: `@${CODE}`, code: `@if(less(${CODE},400),'ACCEPTED',concat('ERR',string(${CODE})))` },
    request: { requestId: "@variables('varRequestId')", action: 'bulkassignment', operation: 'create', mode: 'bulk', requestedBy: `@${T('CreatedBy')}`, source: `@${TXT('source')}` },
    data: "@variables('varData')",
    errors: "@variables('varErrors')",
    meta: { runId: "@workflow()?['run']?['name']", flowName: "@workflow()?['name']", schema: `@${TXT('schema')}` },
  } };
  A.Get_Allowed_Origins_Bulk = { type: 'OpenApiConnection', runAfter: ok('Compose__Standard_Response_Revised'),
    inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
      parameters: { dataset: CONFIG_SITE, table: '9bc168c3-06e5-4d58-982b-0df06205fd35', $filter: "startswith(Title,'ALLOWED_ORIGIN')", $top: 20 } } };
  A.Select_Allowed_Origins_Bulk = { type: 'Select', runAfter: { Get_Allowed_Origins_Bulk: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { from: "@coalesce(outputs('Get_Allowed_Origins_Bulk')?['body/value'],json('[]'))", select: "@trim(string(coalesce(item()?['ConfigValue'],'')))" } };
  A.Compose_Request_Origin_Bulk = { type: 'Compose', runAfter: ok('Select_Allowed_Origins_Bulk'), inputs: "@trim(string(coalesce(triggerOutputs()?['headers']?['Origin'],triggerOutputs()?['headers']?['origin'],'')))" };
  A.Compose_Allowed_Origin_Bulk = { type: 'Compose', runAfter: ok('Compose_Request_Origin_Bulk'), inputs: "@if(contains(coalesce(body('Select_Allowed_Origins_Bulk'),json('[]')),outputs('Compose_Request_Origin_Bulk')),outputs('Compose_Request_Origin_Bulk'),string(coalesce(first(coalesce(body('Select_Allowed_Origins_Bulk'),json('[]'))),'')))" };
  A.Response = { type: 'Response', kind: 'Http', runAfter: ok('Compose_Allowed_Origin_Bulk'), inputs: {
    statusCode: `@${CODE}`,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': "@outputs('Compose_Allowed_Origin_Bulk')", 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Correlation-ID', Vary: 'Origin' },
    body: "@outputs('Compose__Standard_Response_Revised')",
  } };
  /* Sequential: the steps set the flow's variables, and an assignee gets the notifications in the batch's order. */
  A.Condition_Bulk_Process = {
    type: 'If', runAfter: ok('Response'),
    expression: { and: [{ equals: ["@variables('varStatusCode')", 202] }] },
    actions: {
      [LOOP]: {
        type: 'Foreach', runAfter: {}, foreach: "@body('Select_Bulk_Items')",
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          ...body,
          Append_to_array_variable_varErrors_Bulk_Task: { type: 'AppendToArrayVariable', runAfter: { Scope_Create_Task: ['Failed', 'TimedOut'] },
            inputs: { name: 'varErrors', value: { id: `@${IT('id')}`, taskRef: `@${IT('taskRef')}`, stage: 'task', message: 'The task or the document update was not written.', trackedAtUtc: '@utcNow()' } } },
          Append_to_array_variable_varErrors_Bulk_Notice: { type: 'AppendToArrayVariable', runAfter: { Scope_Task_Email_Notification: ['Failed', 'TimedOut'] },
            inputs: { name: 'varErrors', value: { id: `@${IT('id')}`, taskRef: `@${IT('taskRef')}`, stage: 'notification', message: 'The task was created; its notification was not sent.', trackedAtUtc: '@utcNow()' } } },
        },
      },
      Condition_Bulk_Failures: {
        type: 'If', runAfter: { [LOOP]: ['Succeeded', 'Failed', 'TimedOut'] },
        expression: { and: [{ greater: ["@length(variables('varErrors'))", 0] }] },
        actions: {
          Select_Bulk_Failure_Rows: { type: 'Select', runAfter: {}, inputs: { from: "@variables('varErrors')", select: "@concat('<tr><td>',string(item()?['id']),'</td><td>',string(item()?['taskRef']),'</td><td>',string(item()?['message']),'</td></tr>')" } },
          Send_Bulk_Failure_Email: { type: 'OpenApiConnection', runAfter: ok('Select_Bulk_Failure_Rows'),
            inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
              parameters: {
                'emailMessage/To': `@if(contains(${T('CreatedBy')},'@'),${T('CreatedBy')},'dgs@nitda.gov.ng')`,
                'emailMessage/Subject': `@concat('Bulk assignment: ',string(length(variables('varErrors'))),' of ',string(${N}),' not completed')`,
                'emailMessage/Body': `@concat('<p>The bulk assignment to ',${T('AssignedTo')},' (request ',variables('varRequestId'),') did not complete for these documents. Every other document in the batch was assigned. Assign the ones below again; their task references were not used.</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Document ID</th><th>Task reference</th><th>What happened</th></tr>',join(body('Select_Bulk_Failure_Rows'),''),'</table>')`,
                'emailMessage/Importance': 'High',
              } } },
        },
        else: { actions: {} },
      },
    },
    else: { actions: {} },
  };
  edit(log, 'The reply (202 with the claimed references, or 400, 503, 500) is sent before any task is created, with Access-Control-Allow-Origin from Flow Configuration\'s ALLOWED_ORIGIN rows, as the flow\'s data-retrieval reply did. The documents are then assigned one after another. A document whose task or update fails is recorded with its reference in varErrors and the rest go on; if any failed, the requester (requestedBy, else dgs@nitda.gov.ng) gets one e-mail listing them.', () => {});
  edit(log, 'S8 / ID-19: the run sets its own Request ID (varRequestId = guid()) first; the reply, the task rows and the failure e-mail carry it. Nothing the client sends is adopted.', () => {});

  const pkg = { nodeId: 'Scope_Global', serializedValue: { type: 'Scope', actions: A, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  pkg.allConnectionData = targetConnections(pkg, 'BULK_OPS_DATA_RETRIEVAL_HTTP__');
  return pkg;
}

/** Every connector step uses the target flow's own connection keys (shared_sharepointonline, shared_office365) and the
 *  connections its capture lists, so the paste needs no connection chosen by hand. */
function targetConnections(pkg, capturePrefix) {
  const dir = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures');
  const d = JSON.parse(readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith(capturePrefix))), 'utf8').replace(/^\uFEFF/, ''));
  const conn = Object.fromEntries((d.ConnectionReferences || []).map((c) => [c.id, c.connectionName]));
  const used = new Set(JSON.stringify(d.Definition).match(/"connectionName":"[^"]+"/g).map((x) => x.slice(18, -1)));
  const all = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'OpenApiConnection') {
      const api = a.inputs.host.apiId; const key = api.split('/').pop();
      if (!conn[api] || !used.has(key)) throw new Error(`${capturePrefix}: no ${key} connection to adopt for ${n}`);
      a.inputs.host.connection = key;
      all[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${conn[api]}` }, connectionName: conn[api] }, referenceKey: key };
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
  } };
  walk(pkg.serializedValue.actions);
  return all;
}

/* ---------------------------------------------------------------- FETCH_ALL */
/** The Workspace read (IP_FETCH_ALL_BOOTSTRAP, b79e6707): identity fields on what it already returns, and the
 *  collections Phase 4 adds (§13: register, briefs, meetings, projects, approvals, files). */
const FETCH_SETS = [
  ['register', 'INTAKE_REGISTER', { id: 'EntityKey', entityKey: 'EntityKey', referenceId: 'ReferenceId', title: 'Title', subject: 'Subject', channel: 'Channel', status: 'Status', statusLabel: 'StatusLabel', senderEmail: 'SenderEmail', submittedAtUtc: 'SubmittedAtUtc', idState: 'IdState', rev: 'Rev', supersededBy: 'SupersededBy' }],
  ['briefs', 'BRIEFS', { id: 'EntityKey', entityKey: 'EntityKey', title: 'Title', idState: 'IdState', rev: 'Rev', supersededBy: 'SupersededBy', modified: 'Modified' }],
  ['meetings', 'MEETINGS', { id: 'EntityKey', entityKey: 'EntityKey', title: 'Title', idState: 'IdState', rev: 'Rev', supersededBy: 'SupersededBy', modified: 'Modified' }],
  ['projects', 'PROJECTS', { id: 'EntityKey', entityKey: 'EntityKey', title: 'Title', idState: 'IdState', rev: 'Rev', supersededBy: 'SupersededBy', modified: 'Modified' }],
  /* Folio's approvals view reads id, title, status, ref and ts (modules/approvals.js). */
  ['approvals', 'APPROVALS', { id: 'EntityKey', entityKey: 'EntityKey', title: 'Title', status: '@toLower(string(coalesce(item()?[\'Decision\'],\'Pending\')))', ref: 'RootRef', parentKey: 'ParentKey', rootKey: 'RootKey', idState: 'IdState', rev: 'Rev', ts: 'Modified' }],
  ['files', 'REGISTRY_FILES', { id: 'EntityKey', entityKey: 'EntityKey', fileRef: 'RegistryFileRef', title: 'Title', currentHolder: 'CurrentHolder', idState: 'IdState', rev: 'Rev', supersededBy: 'SupersededBy' }],
];
function fetchAll(pkg, log) {
  const A = pkg.serializedValue.actions;
  edit(log, 'S8 / ID-19: the run sets its own Request ID (varRequestId = guid()) first. The flow declared it as the client\'s requestId when one was sent.', () => {
    const first = Object.entries(A).find(([, a]) => !a.runAfter || !Object.keys(a.runAfter).length);
    if (!first || first[0] !== 'Scope_Global_FetchAll') throw new Error('Scope_Global_FetchAll is no longer first');
    A.Set_variable_varRequestId = { type: 'SetVariable', inputs: { name: 'varRequestId', value: '@guid()' }, runAfter: {} };
    A.Scope_Global_FetchAll.runAfter = ok('Set_variable_varRequestId');
  });
  edit(log, 'G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above): from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail as today. With the switch true and no valid proof, the flow\'s own unknown-caller branch answers 401. The role is read from the directory row\'s Role choice, which the flow read as text and so never matched a RoleId.', () => {
    const { parent } = locate(A, 'Compose_FetchAll_Caller');
    const c = parent.Compose_FetchAll_Caller;
    if (c.inputs !== "@toLower(trim(string(coalesce(triggerBody()?['payload']?['userEmail'],triggerBody()?['userEmail'],''))))") throw new Error('Compose_FetchAll_Caller changed in the source');
    const gate = callerGate('FetchAll_Gate', "coalesce(triggerBody()?['payload']?['userEmail'],triggerBody()?['userEmail'])");
    gate[Object.keys(gate)[0]].runAfter = c.runAfter || {};
    Object.assign(parent, gate);
    c.runAfter = ok('Compose_FetchAll_Gate_Caller');
    c.inputs = "@outputs('Compose_FetchAll_Gate_Caller')";
    const r = parent.Compose_FetchAll_Role;
    if (r.inputs !== "@toLower(trim(string(coalesce(first(outputs('Get_FetchAll_Directory_User')?['body/value'])?['Role'],''))))") throw new Error('Compose_FetchAll_Role changed in the source');
    r.inputs = `@${ROLE_OF("first(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]')))")}`;
  });
  const auth = locate(A, 'Condition_FetchAll_Authorised').a.actions;
  edit(log, '§10.2: every record the Workspace reads carries its identity. Documents: EntityKey, ReferenceId, IdState. Tasks: EntityKey, TaskRef, ParentKey, RootKey, RootRef, IdState, Rev. Comments (minutes): EntityKey, ParentKey, RootKey, RootRef, AuthorKey. The fields already returned are unchanged.', () => {
    const add = (sel, cols) => { const m = auth[sel].inputs.select; for (const [k, v] of Object.entries(cols)) { if (k in m) throw new Error(`${sel} already returns ${k}`); m[k] = v; } };
    add('Select_Docs', { EntityKey: "@item()?['EntityKey']", ReferenceId: "@item()?['ReferenceId']", IdState: "@item()?['IdState']?['Value']" });
    add('Select_Tasks', { EntityKey: "@item()?['EntityKey']", TaskRef: "@item()?['TaskRef']", ParentKey: "@item()?['ParentKey']", RootKey: "@item()?['RootKey']", RootRef: "@item()?['RootRef']", IdState: "@item()?['IdState']?['Value']", Rev: "@item()?['Rev']" });
    add('Select_Comments', { EntityKey: "@item()?['EntityKey']", ParentKey: "@item()?['ParentKey']", RootKey: "@item()?['RootKey']", RootRef: "@item()?['RootRef']", AuthorKey: "@item()?['AuthorKey']",
      /* Tenant defect 2026-10-10: every comment showed its author as "Unknown". The row's creator (SharePoint Author)
         was never selected, and AuthorKey is empty on rows written before the identification system. */
      AuthorName: "@item()?['Author']?['DisplayName']", AuthorEmail: "@toLower(string(coalesce(item()?['Author']?['Email'],'')))" });
  });
  edit(log, `§13 Phase 4: FETCH_ALL also returns ${FETCH_SETS.map(([k]) => k).join(', ')}: the latest 500 rows of Portal Registry, DGO_Briefs, DGO_Meetings, DGO_Projects, DGO_Approvals and DGO_RegistryFiles, each with its Entity Key and reference, addressed through Flow Configuration (DATASET_<KEY>_*). A collection whose list cannot be read comes back empty and the rest of the reply is unaffected. approvals, which was always empty, now holds DGO_Approvals rows in the shape Folio's approvals view reads.`, () => {
    if (JSON.stringify(auth.Set_variable_varStatusCode_FetchAll_200.runAfter) !== JSON.stringify(ok('Select_Comments'))) throw new Error('FETCH_ALL success order changed');
    const reads = K.chain(K.readDatasetBindings({ keys: FETCH_SETS.map(([, k]) => k), configSite: CONFIG_SITE }));
    reads.Get_Dataset_Bindings.runAfter = ok('Select_Comments');
    /* The bindings are read once; a failed read leaves every new collection empty. */
    reads.Select_Dataset_Bindings.runAfter = { Get_Dataset_Bindings: ['Succeeded', 'Failed', 'TimedOut'] };
    Object.assign(auth, reads);
    let prev = 'Compose_Dataset_Bindings';
    for (const [name, key, cols] of FETCH_SETS) {
      const T = name.charAt(0).toUpperCase() + name.slice(1);
      auth[`Get_FetchAll_${T}`] = { type: 'OpenApiConnection', runAfter: ok(prev), inputs: {
        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'HttpRequest' },
        parameters: { dataset: K.site(key), 'parameters/method': 'GET', 'parameters/uri': `_api/web/lists(guid'${K.list(key)}')/items?$top=500&$orderby=Modified%20desc`, 'parameters/headers': { Accept: 'application/json;odata=nometadata' } },
        retryPolicy: { type: 'none' } } };
      auth[`Select_FetchAll_${T}`] = { type: 'Select', runAfter: { [`Get_FetchAll_${T}`]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }, inputs: {
        from: `@coalesce(body('Get_FetchAll_${T}')?['value'],json('[]'))`,
        select: Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, c.startsWith('@') ? c : `@item()?['${c}']`])) } };
      prev = `Select_FetchAll_${T}`;
    }
    auth.Set_variable_varStatusCode_FetchAll_200.runAfter = ok(prev);
    const v = auth.Set_variable_varData_FetchAll_Success.inputs.value;
    if (JSON.stringify(v.approvals) !== '[]') throw new Error('FETCH_ALL approvals is no longer the empty placeholder');
    for (const [name] of FETCH_SETS) v[name] = `@body('Select_FetchAll_${name.charAt(0).toUpperCase() + name.slice(1)}')`;
  });
  edit(log, 'Directory and reference data as Folio reads them, ported from the retired DGO_FETCH_ALL design (registers/flow-retirement.json): the directory is read in pages to 5,000 rows (it holds 852; one GetItems page is 500), Role, Persona and Status are served as text rather than Choice objects, and Departments and Categories, imported from spreadsheets so GetItems returns field_1…field_N, are read by those internal names. The keys Folio reads are unchanged.', () => {
    const users = locate(A, 'Get_All_Users').a;
    if (users.inputs.parameters.$top !== 500 || users.runtimeConfiguration) throw new Error('Get_All_Users changed in the source');
    users.inputs.parameters.$top = 5000;
    users.runtimeConfiguration = { paginationPolicy: { minimumItemCount: 5000 } };
    const text = (col) => `@string(coalesce(json(if(startsWith(string(coalesce(item()?['${col}'],'')),'{'),string(item()?['${col}']),concat('{"Value":"',replace(string(coalesce(item()?['${col}'],'')),'"',''),'"}')))?['Value'],''))`;
    const su = locate(A, 'Select_Users').a.inputs.select;
    for (const c of ['Role', 'Persona', 'Status']) { if (su[c] !== `@item()?['${c}']`) throw new Error(`Select_Users.${c} changed in the source`); su[c] = text(c); }
    const sd = locate(A, 'Select_Departments').a.inputs.select;
    if (sd.DSU_KEY !== "@item()?['DSU_KEY']") throw new Error('Select_Departments changed in the source');
    Object.assign(sd, { DSU_KEY: "@item()?['field_1']", DSU_Email: "@item()?['field_2']", DSU_HeadEmail: "@item()?['field_3']", DSU_HeadTitle: "@item()?['field_6']" });
    const sc = locate(A, 'Select_Categories').a;
    if (sc.inputs.select.DSU_KEY !== "@item()?['DSU_KEY']") throw new Error('Select_Categories changed in the source');
    sc.inputs.select = { ID: "@item()?['ID']", Title: "@item()?['Title']", Category: "@item()?['Title']", Subcategory: "@item()?['field_2']",
      'Category Code': "@item()?['field_1']", 'SubCategory Code': "@item()?['field_3']", DSU_KEY: "@item()?['field_4']",
      'Default Primary Responsible': "@item()?['field_4']", 'Default Supporting Department/Unit': "@item()?['field_5']",
      INFORMDSU1: "@item()?['field_6']", INFORMDSU2: "@item()?['field_7']", INFORMDSU3: "@item()?['field_8']",
      Priority: "@item()?['field_14']", Timeline: "@item()?['field_9']" };
  });
  edit(log, 'ITEM-90 (owner approval 2026-10-08): every active directory user is admitted and receives the slice of data their role allows; until now only roles carrying "*" or user:view were admitted (systemAdmin and userAdmin: the operator and 822 active viewers got 403), and whoever was admitted received everything. Tiers, from the directory row: all (systemAdmin, userAdmin, executive, operator, which is the registry role, or the admin, executive or registry persona) receives what it did; every other caller receives the tasks assigned to them, read from Global Tracking Queue by the indexed AssignedTo so older assignments are included, the documents those tasks name (read by ID, up to 60), and those documents\' comments. A director also receives approvals; their directorate\'s tasks are not read, because Global Tracking Queue holds its 20 indexed columns and GDSUROUT is not one of them (follow-up). The directory goes to every caller, with e-mail addresses only for the all tier and on the caller\'s own row. Portal submissions, briefs, meetings, projects and registry files go to the all tier only. Tasks now carry RoutedDsu (GDSUROUT).', () => {
    const auth = locate(A, 'Condition_FetchAll_Authorised').a;
    const want = "@and(greater(length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]'))),0),or(contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['AllowedRoutesJson'],'')),'\"*\"'),contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['PermissionsJson'],'')),'user:view')))";
    if (JSON.stringify(auth.expression) !== JSON.stringify({ and: [{ equals: ["@outputs('Compose_FetchAll_Permitted')", want] }] })) throw new Error('Condition_FetchAll_Authorised changed in the source');
    auth.expression = { and: [{ equals: ["@outputs('Compose_FetchAll_Permitted')", "@greater(length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]'))),0)"] }] };
    const B = auth.actions;
    const DIRROW = "first(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]')))";
    const PERSONA = ROLE_OF(DIRROW).split("['Role']").join("['Persona']");
    const ROLE = "outputs('Compose_FetchAll_Role')";
    const CALLER = "toLower(string(outputs('Compose_FetchAll_Caller')))";
    if (B.Get_All_Docs.runAfter && Object.keys(B.Get_All_Docs.runAfter).length) throw new Error('Get_All_Docs is no longer first');
    B.Compose_FetchAll_Scope = { type: 'Compose', runAfter: {}, inputs: {
      tier: `@if(or(contains(createArray('systemadmin','useradmin','executive','operator'),toLower(string(${ROLE}))),contains(createArray('admin','executive','registry'),${PERSONA})),'all',if(equals(toLower(string(${ROLE})),'director'),'directorate','own'))`,
      caller: `@${CALLER}` } };
    B.Get_All_Docs.runAfter = ok('Compose_FetchAll_Scope');
    const SC = (k) => `outputs('Compose_FetchAll_Scope')?['${k}']`;
    const ALL = `equals(${SC('tier')},'all')`;
    const st = B.Select_Tasks.inputs.select;
    if ('RoutedDsu' in st) throw new Error('Select_Tasks already returns RoutedDsu');
    st.RoutedDsu = "@item()?['GDSUROUT']";
    const last = Object.keys(B.Set_variable_varStatusCode_FetchAll_200.runAfter)[0];
    const get = (name, src, filter, runAfter) => { const g = locate(A, src).a; return { [name]: { type: 'OpenApiConnection', runAfter, inputs: { host: structuredClone(g.inputs.host), parameters: {
      dataset: g.inputs.parameters.dataset, table: g.inputs.parameters.table, $filter: filter, $top: 500 } } } }; };
    const sel = (name, from, select, after) => ({ [name]: { type: 'Select', runAfter: { [after]: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { from: `@coalesce(outputs('${from}')?['body/value'],json('[]'))`, select } } });
    const IDS = "union(body('Select_FetchAll_Own_Doc_Ids'),json('[]'))";
    B.Condition_FetchAll_Own = { type: 'If', runAfter: ok(last), expression: { and: [{ equals: [`@${ALL}`, false] }] },
      actions: {
        ...get('Get_FetchAll_Own_Tasks', 'Get_All_Tasks', `@concat('AssignedTo eq ''',replace(${SC('caller')},'''',''''''),'''')`, {}),
        ...sel('Select_FetchAll_Own_Tasks', 'Get_FetchAll_Own_Tasks', structuredClone(st), 'Get_FetchAll_Own_Tasks'),
        /* ITEM-91 (owner, 2026-10-18: build now): a director also receives the tasks routed to their directorate, read by the
           indexed GDSUROUT (indexed 2026-10-18 in place of the unused Reference_ID). Flow Configuration DIRECTORATE_UNIT_MAP is a
           JSON object from a directory directorate code to the task unit codes it covers; a directorate it does not name covers
           the unit of the same code. */
        Get_FetchAll_Unit_Map: { ...CFG_GET('Get_FetchAll_Unit_Map', "Title eq 'DIRECTORATE_UNIT_MAP'"), runAfter: { Select_FetchAll_Own_Tasks: ['Succeeded', 'Failed', 'TimedOut'] } },
        Compose_FetchAll_Units: { type: 'Compose', runAfter: { Get_FetchAll_Unit_Map: ['Succeeded', 'Failed', 'TimedOut'] },
          inputs: `@if(not(equals(${SC('tier')},'directorate')),json('[]'),if(empty(trim(string(coalesce(${DIRROW}?['Directorate'],'')))),json('[]'),coalesce(json(string(coalesce(first(coalesce(outputs('Get_FetchAll_Unit_Map')?['body/value'],json('[]')))?['ConfigValue'],'{}')))?[trim(string(${DIRROW}?['Directorate']))],createArray(trim(string(${DIRROW}?['Directorate']))))))` },
        ...get('Get_FetchAll_Directorate_Tasks', 'Get_All_Tasks', "@if(empty(outputs('Compose_FetchAll_Units')),'ID eq 0',concat('GDSUROUT eq ''',join(take(outputs('Compose_FetchAll_Units'),20),''' or GDSUROUT eq '''),''''))", ok('Compose_FetchAll_Units')),
        ...sel('Select_FetchAll_Directorate_Tasks', 'Get_FetchAll_Directorate_Tasks', structuredClone(st), 'Get_FetchAll_Directorate_Tasks'),
        Compose_FetchAll_Scope_Tasks: { type: 'Compose', runAfter: { Select_FetchAll_Directorate_Tasks: ['Succeeded', 'Failed', 'TimedOut'] },
          inputs: "@union(coalesce(body('Select_FetchAll_Own_Tasks'),json('[]')),coalesce(body('Select_FetchAll_Directorate_Tasks'),json('[]')))" },
        Select_FetchAll_Own_Doc_Ids: { type: 'Select', runAfter: ok('Compose_FetchAll_Scope_Tasks'), inputs: { from: "@outputs('Compose_FetchAll_Scope_Tasks')",
          select: "@if(empty(string(coalesce(item()?['RefIDD'],''))),'0',string(item()?['RefIDD']))" } },
        ...get('Get_FetchAll_Own_Docs', 'Get_All_Docs', `@if(empty(${IDS}),'ID eq 0',concat('ID eq ',join(take(${IDS},60),' or ID eq ')))`, ok('Select_FetchAll_Own_Doc_Ids')),
        ...sel('Select_FetchAll_Own_Docs', 'Get_FetchAll_Own_Docs', structuredClone(B.Select_Docs.inputs.select), 'Get_FetchAll_Own_Docs'),
        ...get('Get_FetchAll_Own_Comments', 'Get_All_Comments', `@concat('RefIDD eq ''',join(take(${IDS},60),''' or RefIDD eq '''),'''')`, { Select_FetchAll_Own_Docs: ['Succeeded', 'Failed', 'TimedOut'] }),
        ...sel('Select_FetchAll_Own_Comments', 'Get_FetchAll_Own_Comments', structuredClone(B.Select_Comments.inputs.select), 'Get_FetchAll_Own_Comments'),
      },
      else: { actions: {} } };
    const su = B.Select_Users.inputs.select;
    const usersSel = Object.fromEntries(Object.keys(su).map((k) => [k, `@item()?['${k}']`]));
    usersSel.Email = `@if(or(${ALL},equals(toLower(string(coalesce(item()?['Email'],''))),${SC('caller')})),item()?['Email'],'')`;
    B.Select_FetchAll_Scoped_Users = { type: 'Select', runAfter: { Condition_FetchAll_Own: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] }, inputs: { from: "@coalesce(body('Select_Users'),json('[]'))", select: usersSel } };
    B.Set_variable_varStatusCode_FetchAll_200.runAfter = ok('Select_FetchAll_Scoped_Users');
    const data = B.Set_variable_varData_FetchAll_Success.inputs.value;
    for (const k of ['docs', 'tasks', 'users', 'comments', 'register', 'briefs', 'meetings', 'projects', 'approvals', 'files']) if (!(k in data)) throw new Error(`FETCH_ALL reply has no ${k}`);
    const OWN = (k) => `coalesce(body('Select_FetchAll_Own_${k}'),json('[]'))`;
    data.docs = `@if(${ALL},${data.docs.slice(1)},${OWN('Docs')})`;
    data.tasks = `@if(${ALL},${data.tasks.slice(1)},coalesce(outputs('Compose_FetchAll_Scope_Tasks'),json('[]')))`;
    data.comments = `@if(${ALL},${data.comments.slice(1)},${OWN('Comments')})`;
    data.users = "@body('Select_FetchAll_Scoped_Users')";
    for (const k of ['register', 'briefs', 'meetings', 'projects', 'files']) data[k] = `@if(${ALL},${data[k].slice(1)},json('[]'))`;
    data.approvals = `@if(equals(${SC('tier')},'own'),json('[]'),${data.approvals.slice(1)})`;
  });

  edit(log, 'Owner decision 2026-10-18: the Workspace\'s System Health shows failed notices. FETCH_ALL returns failureHealth, the JSON Folio_Failure_Watch writes to Flow Configuration NOTIFY_FAILURE_HEALTH (the open count per group, the broken-connection flag and the time of the check), to the all tier only; null when the row is absent or unreadable. One row of a few hundred characters: the reply grows by that and nothing else.', () => {
    const B = locate(A, 'Condition_FetchAll_Authorised').a.actions;
    const set = B.Set_variable_varStatusCode_FetchAll_200;
    const after = Object.keys(set.runAfter || {});
    if (after.length !== 1 || after[0] !== 'Select_FetchAll_Scoped_Users') throw new Error('FETCH_ALL success order changed');
    B.Get_FetchAll_Failure_Health = { ...CFG_GET('Get_FetchAll_Failure_Health', "Title eq 'NOTIFY_FAILURE_HEALTH'"), runAfter: ok('Select_FetchAll_Scoped_Users') };
    B.Get_FetchAll_Failure_Health.inputs.parameters.$top = 1;
    set.runAfter = { Get_FetchAll_Failure_Health: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] };
    const data = B.Set_variable_varData_FetchAll_Success.inputs.value;
    if ('failureHealth' in data) throw new Error('FETCH_ALL already returns failureHealth');
    const RAW = "string(coalesce(first(coalesce(actions('Get_FetchAll_Failure_Health')?['outputs']?['body']?['value'],json('[]')))?['ConfigValue'],''))";
    data.failureHealth = `@json(if(and(equals(outputs('Compose_FetchAll_Scope')?['tier'],'all'),startsWith(${RAW},'{')),${RAW},'null'))`;
  });

  edit(log, 'Tenant defect (8 October 2026): the newest 500 tasks are read by ID, not Modified. Global Tracking Queue holds 16,071 rows and already carries the 20 indexed columns SharePoint allows, none of them Modified, so "Modified desc" exceeded the list view threshold: Get_All_Tasks failed, every read after it was skipped, and the flow answered 200 with null collections, so the Workspace loaded empty. ID is always indexed.', () => {
    const tasks = locate(A, 'Get_All_Tasks').a;
    if (tasks.inputs.parameters.$orderby !== 'Modified desc') throw new Error('Get_All_Tasks order changed in the source');
    tasks.inputs.parameters.$orderby = 'ID desc';
  });
}

/* ---------------------------------------------------------------- DYNAMIC_ACTIONS */
/**
 * IP_Dynamic_Global_Actions_Endpoint (31c0aaf0). Its live scope, Scope_Dynamic_Flow, serves four operations behind a
 * directory, role, validation and replay gate. Phase 4 adds the identity operations of §13 behind the same gate:
 * register, upsert_record, open_file, move_file, link, void, reparent and merge. The four live operations are unchanged.
 */
const DYN_DATASETS = ['INTAKE_REGISTER', 'SEQUENCE_COUNTERS', 'IDENTITY_MAP', 'MINUTES', 'BRIEFS', 'MEETINGS', 'PROJECTS', 'APPROVALS', 'REGISTRY_FILES', 'FILE_MOVEMENTS', 'RECORD_LINKS', 'TASK_QUEUE', 'ATTACHMENTS', 'OPS_WORKING_REGISTER', 'SUPPORT_CASES', 'REMINDERS'];
/* The home list of each entity type (§5); a REC not yet in Portal Registry is looked for in DGO DIGITAL OPS. */
const TYPE_HOME = { REC: 'INTAKE_REGISTER', TSK: 'TASK_QUEUE', MIN: 'MINUTES', ATT: 'ATTACHMENTS', BRF: 'BRIEFS', MTG: 'MEETINGS', PRJ: 'PROJECTS', APR: 'APPROVALS', REG: 'REGISTRY_FILES', CAS: 'SUPPORT_CASES', RMD: 'REMINDERS' };
const HOME_TYPE = { ...Object.fromEntries(Object.entries(TYPE_HOME).map(([t, d]) => [d, t])), OPS_WORKING_REGISTER: 'REC' };
const NEW_OPS = ['register', 'upsert-record', 'open-file', 'move-file', 'link', 'void', 'reparent', 'merge'];
/* Catalogue vocabularies, read at build time so the flow cannot drift from the catalogue. */
const CAT = JSON.parse(readFileSync(join(ROOT, 'docs/reference/identification/identifier-catalogue.json'), 'utf8'));
const CHANNELS = CAT.channels.map((c) => c.code);
const LOCATOR_SYSTEM = Object.fromEntries(CAT.locatorKinds.map((k) => [k.kind, k.system]));
/* The locator kinds a client may register a record with: the system kinds (PA_RUN, PA_TRIGGER) are written by flows,
   and EXO_GRAPH_MESSAGE_ID is kept only to resolve legacy rows (catalogue). */
const CLIENT_LOCATORS = ['EXO_INTERNET_MESSAGE_ID', 'SPO_ITEM', 'ODB_ITEM', 'PAPER_FILE'];
for (const k of CLIENT_LOCATORS) if (!LOCATOR_SYSTEM[k]) throw new Error(`catalogue has no locator kind ${k}`);
for (const k of ['FOLIO_LOCAL_KEY', 'LEGACY_REGISTRY_FILE_NO']) if (!CAT.aliasKinds.some((a) => (a.kind || a.code) === k)) throw new Error(`catalogue has no alias kind ${k}`);
if (!CAT.systems.some((x) => x.code === 'runtime')) throw new Error('catalogue has no system runtime');
const ENV_EXPR = "if(contains(createArray('prd','uat','dev'),toLower(string(coalesce(outputs('Compose_Dataset_Bindings')?['ENVIRONMENT_CODE'],'')))),toLower(string(coalesce(outputs('Compose_Dataset_Bindings')?['ENVIRONMENT_CODE'],''))),'uat')";
const LINK_TYPES = ['RELATES_TO', 'REPLIES_TO', 'ABOUT', 'DUPLICATE_OF', 'MERGED_INTO', 'SUPERSEDES', 'DERIVED_FROM', 'DEPENDS_ON', 'FILED_IN', 'DISCUSSED_AT', 'BRIEFS_ON'];

const DI = (k) => `outputs('Compose_Dynamic_Input')?['${k}']`;
const DREQ = "outputs('Compose_Request_Context')?['requestId']";
const DOP = "outputs('Compose_Dynamic_Operation')";
const SITE_OF = (dk) => `outputs('Compose_Dataset_Bindings')?[concat('DATASET_',${dk},'_SITE_URL')]`;
const LIST_OF = (dk) => `outputs('Compose_Dataset_Bindings')?[concat('DATASET_',${dk},'_LIST_ID')]`;
const jlit = (o) => `json('${JSON.stringify(o).replace(/'/g, "''")}')`;
const QK_OK = (x) => `and(equals(length(split(${x},':')),2),equals(length(last(split(${x},':'))),36))`;
const SPO_OK = (x) => `and(startsWith(toLower(${x}),'spo:'),equals(length(split(replace(toLower(${x}),'spo:',''),'/')),2))`;
const ALL = ['Succeeded', 'Failed', 'Skipped', 'TimedOut'];

function dHttp({ site, method, uri, body, runAfter = {}, headers = {} }) {
  return { type: 'OpenApiConnection', runAfter, inputs: {
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'HttpRequest' },
    parameters: { dataset: site, 'parameters/method': method, 'parameters/uri': uri,
      'parameters/headers': { Accept: 'application/json;odata=nometadata', ...(body ? { 'Content-Type': 'application/json;odata=nometadata' } : {}), ...headers },
      ...(body ? { 'parameters/body': body } : {}) },
    retryPolicy: { type: 'none' } } };
}
/** One row of a dynamic dataset by $filter (an expression giving the filter text). */
const dGet = (site, list, filterExpr, runAfter) => dHttp({ site: `@${site}`, method: 'GET', uri: `_api/web/lists(guid'@{${list}}')/items?$top=2&$filter=@{${filterExpr}}`, runAfter });
const dPost = (site, list, bodyExpr, runAfter) => dHttp({ site: `@${site}`, method: 'POST', uri: `_api/web/lists(guid'@{${list}}')/items`, body: `@${bodyExpr}`, runAfter });
const rows = (get) => `coalesce(body('${get}')?['value'],json('[]'))`;
const obj = (o) => K.bodyExpr(o).slice(1);

/** The audit event (EVT) for a change: DGO_AuditLog with its legacy columns and the §10.2 identity columns. The
 *  operation's main event carries Compose_Dynamic_Audit_Id, the key the replay gate looks for, and the result. */
function dAudit({ event, action, process, subjectKey, rootKey = subjectKey, rootRef = "''", revAfter = 'null', result, auditId = "outputs('Compose_Dynamic_Audit_Id')", runAfter }) {
  return { type: 'OpenApiConnection', runAfter, inputs: {
    host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
    parameters: {
      dataset: 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE', table: 'be0c7af1-b21d-4efe-8c30-53fc55598d95',
      'item/Title': `@concat('${event}:',${subjectKey})`,
      'item/AuditId': `@${auditId}`,
      'item/Event': event,
      'item/CreatedAt': '@utcNow()',
      'item/Severity/Value': 'info',
      'item/RequestId': `@${DREQ}`,
      'item/Module': 'dynamic-global-actions',
      'item/Action': action,
      'item/ActorEmail': `@${DI('caller')}`,
      'item/ActorRole': "@outputs('Compose_Dynamic_Role')",
      'item/EntityType': `@first(split(${subjectKey},':'))`,
      'item/EntityId': `@${subjectKey}`,
      'item/Ref': `@${rootRef}`,
      'item/MetaJson': `@string(setProperty(json('{}'),'result',${result ?? 'null'}))`,
      'item/EntityKey': '@guid()',
      'item/SubjectKey': `@${subjectKey}`,
      'item/RootKey': `@${rootKey}`,
      'item/RootRef': `@${rootRef}`,
      'item/ActorKey': "@outputs('Compose_Dynamic_Actor_Key')",
      'item/CorrelationId': `@${DREQ}`,
      'item/RevAfter': `@${revAfter}`,
      'item/Process': process,
      'item/ContractKey': 'DYNAMIC_ACTIONS',
    } } };
}
/** Result compose in the live flow's shape: { status, data, errors, event }. */
const dResult = (status, data, runAfter = {}, errors = []) => ({ type: 'Compose', runAfter, inputs: { status, data, errors, event: 'none' } });

/** Resolves a target (B10): TYPE:guid (a Qualified Key) or spo:<listGuid>/<itemId> on a bound dataset. */
function dResolve(tag, rawExpr) {
  const R = `outputs('Compose_T_${tag}_Raw')`;
  const T = (k) => `outputs('Compose_T_${tag}')?['${k}']`;
  const out = {};
  out[`Compose_T_${tag}_Raw`] = { type: 'Compose', inputs: `@trim(string(coalesce(${rawExpr},'')))`, runAfter: {} };
  out[`Compose_T_${tag}`] = { type: 'Compose', runAfter: ok(`Compose_T_${tag}_Raw`), inputs: {
    isQk: `@${QK_OK(R)}`, isSpo: `@${SPO_OK(R)}`,
    type: `@if(${QK_OK(R)},toUpper(first(split(${R},':'))),'')`,
    key: `@if(${QK_OK(R)},toLower(last(split(${R},':'))),'')`,
    listGuid: `@if(${SPO_OK(R)},first(split(replace(toLower(${R}),'spo:',''),'/')),'')`,
    itemId: `@if(${SPO_OK(R)},last(split(replace(toLower(${R}),'spo:',''),'/')),'0')`,
  } };
  out[`Select_T_${tag}_Bound`] = { type: 'Select', runAfter: ok(`Compose_T_${tag}`), inputs: {
    from: `@${jlit(DYN_DATASETS)}`,
    select: `@if(and(${T('isSpo')},equals(toLower(string(coalesce(${LIST_OF('item()')},''))),${T('listGuid')})),concat(item(),'|'),'')`,
  } };
  out[`Compose_T_${tag}_Dataset`] = { type: 'Compose', runAfter: ok(`Select_T_${tag}_Bound`),
    inputs: `@if(${T('isQk')},string(coalesce(${jlit(TYPE_HOME)}?[${T('type')}],'')),first(split(join(body('Select_T_${tag}_Bound'),''),'|')))` };
  const DS = `outputs('Compose_T_${tag}_Dataset')`;
  out[`Get_T_${tag}_Row`] = dGet(SITE_OF(DS), LIST_OF(DS), `if(${T('isQk')},concat('EntityKey eq ''',${T('key')},''''),concat('ID eq ',${T('itemId')}))`, ok(`Compose_T_${tag}_Dataset`));
  out[`Get_T_${tag}_Row_Ops`] = dGet(SITE_OF("'OPS_WORKING_REGISTER'"), LIST_OF("'OPS_WORKING_REGISTER'"),
    `if(and(equals(${T('type')},'REC'),empty(${rows(`Get_T_${tag}_Row`)})),concat('EntityKey eq ''',${T('key')},''''),'ID eq 0')`, { [`Get_T_${tag}_Row`]: ALL });
  const R1 = rows(`Get_T_${tag}_Row`), R2 = rows(`Get_T_${tag}_Row_Ops`);
  const inOps = `and(empty(${R1}),equals(length(${R2}),1))`;
  out[`Compose_Row_${tag}`] = { type: 'Compose', runAfter: { [`Get_T_${tag}_Row_Ops`]: ALL }, inputs: {
    found: `@or(equals(length(${R1}),1),${inOps})`,
    datasetKey: `@if(${inOps},'OPS_WORKING_REGISTER',${DS})`,
    row: `@if(${inOps},first(${R2}),first(${R1}))`,
  } };
  out[`Compose_Row_${tag}_Keys`] = { type: 'Compose', runAfter: ok(`Compose_Row_${tag}`), inputs: {
    found: `@outputs('Compose_Row_${tag}')?['found']`,
    datasetKey: `@outputs('Compose_Row_${tag}')?['datasetKey']`,
    type: `@string(coalesce(${jlit(HOME_TYPE)}?[outputs('Compose_Row_${tag}')?['datasetKey']],''))`,
    id: `@outputs('Compose_Row_${tag}')?['row']?['ID']`,
    entityKey: `@toLower(string(coalesce(outputs('Compose_Row_${tag}')?['row']?['EntityKey'],'')))`,
    qk: `@concat(string(coalesce(${jlit(HOME_TYPE)}?[outputs('Compose_Row_${tag}')?['datasetKey']],'')),':',toLower(string(coalesce(outputs('Compose_Row_${tag}')?['row']?['EntityKey'],''))))`,
    reference: `@string(coalesce(outputs('Compose_Row_${tag}')?['row']?['ReferenceId'],outputs('Compose_Row_${tag}')?['row']?['TaskRef'],outputs('Compose_Row_${tag}')?['row']?['RegistryFileRef'],outputs('Compose_Row_${tag}')?['row']?['CaseRef'],outputs('Compose_Row_${tag}')?['row']?['RootRef'],''))`,
    idState: `@string(coalesce(outputs('Compose_Row_${tag}')?['row']?['IdState'],'ACTIVE'))`,
    parentKey: `@string(coalesce(outputs('Compose_Row_${tag}')?['row']?['ParentKey'],''))`,
    rootKey: `@string(coalesce(outputs('Compose_Row_${tag}')?['row']?['RootKey'],''))`,
  } };
  return out;
}
const RK = (tag, k) => `outputs('Compose_Row_${tag}_Keys')?['${k}']`;

/** An Identity Map entry (§7.4). MatchKey = EntryKind|Kind|lower(Container)|Value, cut to the column's 255 characters;
 *  the writing flow looks for that key before inserting, which is also how a value too long for the key is kept unique
 *  (§10.2 MatchKey). Written only when `when` holds and no entry has the key; an existing entry is left as it is. */
function idEntry(tag, { entryKind, kind, container, value, entityRef, system, when, runAfter }) {
  const MK = `Compose_MatchKey_${tag}`;
  const FULL = `concat('${entryKind}','|',${kind},'|',toLower(${container}),'|',${value})`;
  return {
    [MK]: { type: 'Compose', runAfter, inputs: `@substring(${FULL},0,min(255,length(${FULL})))` },
    [`Get_MatchKey_${tag}`]: dGet(SITE_OF("'IDENTITY_MAP'"), LIST_OF("'IDENTITY_MAP'"), `if(${when},concat('MatchKey eq ''',uriComponent(replace(outputs('${MK}'),'''','''''')),''''),'ID eq 0')`, ok(MK)),
    [`Condition_${tag}`]: {
      /* Not Skipped: the lookup is skipped only when the row the entry points at was not written, and then no entry may be. */
      type: 'If', runAfter: { [`Get_MatchKey_${tag}`]: ['Succeeded', 'Failed', 'TimedOut'] },
      expression: { and: [{ equals: [`@and(${when},empty(${rows(`Get_MatchKey_${tag}`)}))`, true] }] },
      actions: { [`Create_${tag}`]: dPost(SITE_OF("'IDENTITY_MAP'"), LIST_OF("'IDENTITY_MAP'"), obj({
        Title: `@{outputs('${MK}')}`, EntityKey: '@guid()', EntityRef: `@{${entityRef}}`, EntryKind: entryKind, Kind: `@{${kind}}`, System: `@{${system}}`,
        Environment: `@{${ENV_EXPR}}`, Container: `@{${container}}`, Value: `@{substring(${value},0,min(255,length(${value})))}`, ValueLong: `@{${value}}`,
        MatchKey: `@{outputs('${MK}')}`, Ambiguous: false, IdState: 'ACTIVE', Rev: 1, CreatedByRequest: `@{${DREQ}}`,
      }), {}) },
      else: { actions: {} },
    },
  };
}

function dynamicActions(pkg, log, opts = {}) {
  const A = pkg.serializedValue.actions;
  const G = locate(A, 'Scope_Global_Dynamic').a.actions;

  edit(log, 'S8 / ID-19: the Request ID is the flow\'s own guid(). It was the client\'s X-Correlation-ID or requestId whenever one was sent; that value is now kept only as clientCorrelationId (sanitised, 64 characters).', () => {
    const c = A.Compose_Request_Context;
    if (!String(c.inputs.requestId).includes("triggerOutputs()?['headers']?['X-Correlation-ID']")) throw new Error('Compose_Request_Context changed in the source');
    c.inputs = { ...K.requestContext().Compose_Request_Context.inputs, startTicks: c.inputs.startTicks };
  });

  edit(log, 'G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above): from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail as today. With the switch true and no valid proof, the gate answers 401. The role is read from the directory row\'s Role choice, which the flow read as text and so never matched a RoleId.', () => {
    const inp = G.Compose_Dynamic_Input;
    const body = String(inp.inputs.caller);
    if (!body.startsWith("@toLower(trim(string(coalesce(if(empty(trim(string(coalesce(triggerBody()?['userEmail']")) throw new Error('Compose_Dynamic_Input caller changed in the source');
    const gate = callerGate('Dynamic_Gate', body.slice(1));
    gate[Object.keys(gate)[0]].runAfter = inp.runAfter || {};
    Object.assign(G, gate);
    inp.runAfter = ok('Compose_Dynamic_Gate_Caller');
    inp.inputs.caller = "@outputs('Compose_Dynamic_Gate_Caller')";
    const r = G.Compose_Dynamic_Role;
    if (r.inputs !== "@trim(string(coalesce(first(coalesce(outputs('Get_Dynamic_Directory_User')?['body/value'],json('[]')))?['Role'],'')))") throw new Error('Compose_Dynamic_Role changed in the source');
    r.inputs = `@${ROLE_OF("first(coalesce(outputs('Get_Dynamic_Directory_User')?['body/value'],json('[]')))")}`;
  });

  edit(log, `The request may now carry, at its top level or under payload, the fields the identity operations read: entityType, entityKey, target, survivor, fromKey, toKey, linkType, title, text, localKey, parentKey, reason, toOrgKey, movementAction, subject, senderEmail, channel, locatorKind, locatorContainer, locatorValue, legacyNumber, decision and clientRequestHash.`, () => {
    const inp = G.Compose_Dynamic_Input.inputs;
    const F = (k) => `trim(string(coalesce(if(empty(trim(string(coalesce(triggerBody()?['payload']?['${k}'],'')))),triggerBody()?['${k}'],triggerBody()?['payload']?['${k}']),'')))`;
    for (const k of ['entityKey', 'target', 'survivor', 'fromKey', 'toKey', 'title', 'text', 'localKey', 'parentKey', 'reason', 'toOrgKey', 'movementAction', 'subject', 'channel', 'locatorValue', 'locatorContainer', 'legacyNumber', 'decision', 'assignedTo', 'dueAt']) { if (k in inp) throw new Error(`Compose_Dynamic_Input already reads ${k}`); inp[k] = `@${F(k)}`; }
    for (const k of ['entityType', 'linkType', 'locatorKind']) inp[k] = `@toUpper(${F(k)})`;
    for (const k of ['senderEmail', 'clientRequestHash']) inp[k] = `@toLower(${F(k)})`;
  });

  edit(log, `The gate serves the new operations (${NEW_OPS.join(', ')}; underscores are read as hyphens, so upsert_record is upsert-record). upsert-record leaves the recognised-but-unserved set. Routes the caller's role must allow: register and link need correspondence; upsert-record needs briefs, meetings, projects, approvals or orchestrator (minutes) by entity type; open-file, move-file, void and reparent need registry; merge needs registry-merge (Registry Manager only, §9: add "registry-merge" to that role's AllowedRoutesJson; "*" also passes).`, () => {
    const kind = G.Compose_Dynamic_Kind;
    const a = "createArray('update','update-task','transitionstatus','logauditevent')", b = "createArray('upsert-record','update-status',";
    if (!kind.inputs.includes(a) || !kind.inputs.includes(b)) throw new Error('Compose_Dynamic_Kind changed in the source');
    kind.inputs = kind.inputs.replace(a, `createArray('update','update-task','transitionstatus','logauditevent',${NEW_OPS.map((o) => `'${o}'`).join(',')})`).replace(b, "createArray('update-status',");
    const route = G.Compose_Dynamic_Required_Route;
    const ROUTE_BY_TYPE = { BRF: 'briefs', MTG: 'meetings', PRJ: 'projects', APR: 'approvals', MIN: 'orchestrator', RMD: 'orchestrator' };
    route.inputs = `@if(contains(createArray('register','link'),${DOP}),'correspondence',if(contains(createArray('open-file','move-file','void','reparent'),${DOP}),'registry',if(equals(${DOP},'merge'),'registry-merge',if(equals(${DOP},'upsert-record'),string(coalesce(${jlit(ROUTE_BY_TYPE)}?[${DI('entityType')}],'')),${route.inputs.slice(1)}))))`;
  });

  edit(log, 'Each new operation is checked before anything is written; a request that fails is refused with 400 and the reason. register: a subject. upsert-record: entity type MIN, BRF, MTG, PRJ, APR or RMD (a reminder: assignedTo and dueAt, written once); a title (or, for a minute, its text and its task as parentKey TSK:<key>) unless entityKey names the row to change. open-file: a title. move-file: the file as target and toOrgKey. link: fromKey and toKey as Qualified Keys and one of the 11 link types. void: a target and a reason. reparent: a target ATT, TSK, MIN or APR Qualified Key and the new parentKey. merge: the absorbed record as target and the survivor, two different REC Qualified Keys. A target is a Qualified Key TYPE:<guid> or spo:<listGuid>/<itemId> (B10); a bare item ID, RefIDD or title is refused.', () => {
    const inv = G.Compose_Dynamic_Invalid;
    const TGT = (k) => `or(${QK_OK(DI(k))},${SPO_OK(DI(k))})`;
    const rules = [
      [`and(equals(${DOP},'register'),or(empty(${DI('subject')}),greater(length(${DI('subject')}),255)))`, 'register needs a subject of up to 255 characters.'],
      [`and(equals(${DOP},'register'),not(empty(${DI('channel')})),not(contains(${jlit(CHANNELS)},toLower(${DI('channel')}))))`, `register: channel must be one of ${CHANNELS.join(', ')}.`],
      [`and(equals(${DOP},'register'),not(empty(${DI('locatorValue')})),or(not(contains(${jlit(CLIENT_LOCATORS)},${DI('locatorKind')})),empty(${DI('locatorContainer')})))`, `register: a locator needs locatorKind (${CLIENT_LOCATORS.join(', ')}) and locatorContainer (the mailbox, list, drive or registry location it is unique in).`],
      [`and(equals(${DOP},'register'),equals(${DI('locatorKind')},'EXO_INTERNET_MESSAGE_ID'),not(and(startsWith(${DI('locatorValue')},'<'),endsWith(${DI('locatorValue')},'>'),contains(${DI('locatorValue')},'@'))))`, 'register: an internetMessageId is written <id@host>.'],
      [`and(equals(${DOP},'upsert-record'),not(contains(createArray('MIN','BRF','MTG','PRJ','APR','RMD'),${DI('entityType')})))`, 'upsert_record needs entityType MIN, BRF, MTG, PRJ, APR or RMD.'],
      [`and(equals(${DOP},'upsert-record'),empty(${DI('entityKey')}),equals(${DI('entityType')},'MIN'),or(empty(${DI('text')}),not(and(${QK_OK(DI('parentKey'))},startsWith(toUpper(${DI('parentKey')}),'TSK:')))))`, 'A minute needs its text and its task as parentKey TSK:<key>.'],
      [`and(equals(${DOP},'upsert-record'),empty(${DI('entityKey')}),not(equals(${DI('entityType')},'MIN')),empty(${DI('title')}))`, 'upsert_record needs a title.'],
      [`and(equals(${DOP},'upsert-record'),not(empty(${DI('entityKey')})),not(equals(length(${DI('entityKey')}),36)))`, 'entityKey must be the record\'s 36-character key.'],
      [`and(equals(${DOP},'open-file'),empty(${DI('title')}))`, 'open_file needs a title.'],
      [`and(equals(${DOP},'move-file'),or(not(${TGT('target')}),empty(${DI('toOrgKey')})))`, 'move_file needs the file as target (REG:<key>) and toOrgKey.'],
      [`and(equals(${DOP},'link'),or(not(${QK_OK(DI('fromKey'))}),not(${QK_OK(DI('toKey'))}),not(contains(${jlit(LINK_TYPES)},${DI('linkType')}))))`, `link needs fromKey and toKey as TYPE:<key> and linkType one of ${LINK_TYPES.join(', ')}.`],
      [`and(equals(${DOP},'void'),or(not(${TGT('target')}),empty(${DI('reason')})))`, 'void needs a target and a reason.'],
      [`and(equals(${DOP},'reparent'),or(not(${QK_OK(DI('target'))}),not(contains(createArray('ATT','TSK','MIN','APR'),toUpper(first(split(${DI('target')},':'))))),not(${QK_OK(DI('parentKey'))})))`, 'reparent needs an ATT, TSK, MIN or APR target as TYPE:<key> and the new parentKey.'],
      [`and(equals(${DOP},'merge'),or(not(${QK_OK(DI('target'))}),not(${QK_OK(DI('survivor'))}),not(startsWith(toUpper(${DI('target')}),'REC:')),not(startsWith(toUpper(${DI('survivor')}),'REC:')),equals(toLower(${DI('target')}),toLower(${DI('survivor')}))))`, 'merge needs the absorbed record as target and a different survivor, both REC:<key>.'],
    ];
    /* ITEM-81 (from the hardened scope): values longer than their columns are refused first. */
    rules.unshift([`or(greater(length(${DI('target')}),300),greater(length(${DI('clientRequestHash')}),128),greater(length(${DI('title')}),255),greater(length(${DI('subject')}),255),greater(length(${DI('reason')}),1000),greater(length(${DI('text')}),8000))`, 'One or more values exceed the permitted length.']);
    /* RN-035: the reminder rule is a step of its own, so the rule chain stays under the 8192-character expression limit. */
    const RMD_BAD = `and(equals(${DOP},'upsert-record'),equals(${DI('entityType')},'RMD'),or(not(empty(${DI('entityKey')})),not(contains(${DI('assignedTo')},'@')),not(startsWith(${DI('dueAt')},'20'))))`;
    G.Compose_Invalid_RMD = { type: 'Compose', runAfter: inv.runAfter, inputs: `@if(${RMD_BAD},'A reminder needs assignedTo (an e-mail address) and dueAt (an ISO date and time), and cannot be changed once set.','')` };
    inv.runAfter = ok('Compose_Invalid_RMD');
    const RMD_TAIL = (tail) => `concat(outputs('Compose_Invalid_RMD'),${tail})`; // '' unless a reminder is malformed
    inv.inputs = `@${rules.reduceRight((acc, [c, m]) => `if(${c},'${m.replace(/'/g, "''")}',${acc})`, RMD_TAIL(inv.inputs.slice(1)))}`;
  });

  edit(log, 'T11 / B3: a replayed request (the same idempotency key; Folio sends its clientRequestHash as that key) returns the first result unchanged. Every new operation stores its result on its audit event, and the replay answer is that result; older events, which hold none, keep the replay answer they had.', () => {
    const rc = locate(A, 'Compose_Result_Dynamic_200_Replay');
    const old = rc.a.inputs.data;
    rc.parent.Compose_Dynamic_Replay_Meta = { type: 'Compose', runAfter: {},
      inputs: "@json(if(empty(string(coalesce(first(coalesce(outputs('Get_Dynamic_Replay')?['body/value'],json('[]')))?['MetaJson'],''))),'{}',string(first(coalesce(outputs('Get_Dynamic_Replay')?['body/value'],json('[]')))?['MetaJson'])))" };
    rc.a.runAfter = ok('Compose_Dynamic_Replay_Meta');
    rc.a.inputs.data = `@if(equals(outputs('Compose_Dynamic_Replay_Meta')?['result'],null),${obj(old)},setProperty(outputs('Compose_Dynamic_Replay_Meta')?['result'],'replayed',true))`;
  });
  edit(log, 'ITEM-81 (from the hardened scope): an idempotency key already used for a different operation answers 409 IDEMPOTENCY_CONFLICT and nothing is replayed or written; only the same request gets the first result back.', () => {
    const rc = locate(A, 'Compose_Result_Dynamic_200_Replay');
    const META = "outputs('Compose_Dynamic_Replay_Meta')?['result']";
    const CONFLICT = `and(not(equals(${META},null)),not(equals(toLower(string(coalesce(${META}?['operation'],outputs('Compose_Dynamic_Operation')))),toLower(string(outputs('Compose_Dynamic_Operation'))))))`;
    const msg = 'The idempotency key is already associated with a different request.';
    rc.a.inputs.status = `@if(${CONFLICT},409,200)`;
    rc.a.inputs.data = `@if(${CONFLICT},json('{"code":"IDEMPOTENCY_CONFLICT","message":"${msg}","recognised":true}'),${rc.a.inputs.data.slice(1)})`;
    rc.a.inputs.errors = `@if(${CONFLICT},json('[{"code":"IDEMPOTENCY_CONFLICT","message":"${msg}"}]'),json('[]'))`;
  });

  /* ---- the operations ---- */
  const okCase = locate(A, 'Switch_Dynamic_Operation');
  const sw = okCase.a;
  const prelude = K.chain(
    K.readDatasetBindings({ keys: opts.userAdmin ? [...DYN_DATASETS, 'USER_DIRECTORY'] : DYN_DATASETS, configSite: CONFIG_SITE }),
    K.environmentPrefix(),
    { Compose_Dynamic_Actor_Key: { type: 'Compose', inputs: "@if(empty(string(coalesce(first(coalesce(outputs('Get_Dynamic_Directory_User')?['body/value'],json('[]')))?['UserId'],''))),'',concat('USR:',string(first(coalesce(outputs('Get_Dynamic_Directory_User')?['body/value'],json('[]')))?['UserId'])))" } },
    { Compose_Dynamic_Hash: { type: 'Compose', inputs: `@if(equals(length(${DI('clientRequestHash')}),64),${DI('clientRequestHash')},'')` } },
  );
  Object.assign(okCase.parent, prelude);
  sw.runAfter = ok('Compose_Dynamic_Hash');
  const HASH = "outputs('Compose_Dynamic_Hash')";
  const replayGet = (name, dk) => dGet(SITE_OF(`'${dk}'`), LIST_OF(`'${dk}'`), `if(empty(${HASH}),'ID eq 0',concat('ClientRequestHash eq ''',${HASH},''''))`, {});
  const results = [];
  const addCase = (name, op, actions) => { sw.cases[`Case_Dynamic_${name}`] = { case: op, actions }; };
  const res = (name, ...a) => { results.push(name); return { [name]: dResult(...a) }; };
  /* ITEM-81 (from the hardened scope): when the last write attempt timed out or met a server error rather than a changed row
     (412), the change may or may not have been committed: 503 OUTCOME_UNKNOWN, retry with the same idempotency key. */
  const UNKNOWN = (tag) => `or(equals(actions('Merge_Row_${tag}_3')?['status'],'TimedOut'),greaterOrEquals(int(coalesce(outputs('Merge_Row_${tag}_3')?['statusCode'],0)),500))`;
  const conflictOrUnknown = (name, tag, message) => ({ [name]: { ...dResult(`@if(${UNKNOWN(tag)},503,409)`, `@if(${UNKNOWN(tag)},json('{"code":"OUTCOME_UNKNOWN","message":"The registry did not confirm whether the change was committed. Retry with the same idempotency key.","recognised":true}'),setProperty(json('{"code":"CHANGED_ELSEWHERE","message":"${message}","recognised":true}'),'operation',${DOP}))`) } });

  /* register (REC) */
  edit(log, 'register (§8.2, S7): registers a record received outside the portal (Folio, e-mail, library). A request whose clientRequestHash Portal Registry already holds returns that record. Otherwise it claims the next NITDA-YYYY-NNNNN (the kit claim, floored at the register\'s highest number) and writes the Portal Registry row: Title and ReferenceId, Subject, Channel (one of the catalogue\'s channel codes, else internal), CorrespondenceType Incoming, SenderEmail, Status received, EntityKey, IdState ACTIVE, Rev 1, Direction In, CorrelationId, CreatedByRequest, ClientRequestHash and, when sent, SourceLocator. A locator (locatorKind EXO_INTERNET_MESSAGE_ID, SPO_ITEM, ODB_ITEM or PAPER_FILE, with locatorContainer and locatorValue; for an e-mail, the registry mailbox and the internetMessageId, T8) is written to DGO_IdentityMap as a LOCATOR entry: System from the catalogue, MatchKey LOCATOR|<kind>|<container>|<value> (§10.2), not written again when that key exists. If the row cannot be written a VOID row accounts for the number (Q2) and the reply is 500; if no number can be claimed, 503. The audit event REGISTERED carries REC:<key>.', () => {
    const REG = { ...replayGet('Register', 'INTAKE_REGISTER') };
    const replayRow = `first(${rows('Get_Dynamic_Register_Replay')})`;
    const claim = K.chain(K.entityKey('Record'), K.claimReference({ tag: 'Registry', prefix: 'NITDA', floor: { dataset: 'INTAKE_REGISTER', column: 'ReferenceId' }, lean: true }));
    const REF = "string(coalesce(first(outputs('Compose_Claim_Registry')?['references']),''))";
    const RECK = "outputs('Compose_EntityKey_Record')";
    const data = { operation: `@${DOP}`, referenceId: `@${REF}`, entityKey: `@${RECK}`, qualifiedKey: `@concat('REC:',${RECK})`, locatorWritten: "@or(equals(actions('Create_Dynamic_Register_Locator')?['status'],'Succeeded'),not(empty(coalesce(body('Get_MatchKey_Dynamic_Register_Locator')?['value'],json('[]')))))", recognised: true, replayed: false };
    const SENDER = `if(empty(${DI('senderEmail')}),${DI('caller')},${DI('senderEmail')})`;
    addCase('Register', 'register', {
      Get_Dynamic_Register_Replay: REG,
      Condition_Dynamic_Register_Replay: {
        type: 'If', runAfter: ok('Get_Dynamic_Register_Replay'),
        expression: { and: [{ equals: [`@empty(${rows('Get_Dynamic_Register_Replay')})`, false] }] },
        actions: res('Compose_Result_Dynamic_200_Register_Replay', 200, { operation: `@${DOP}`, referenceId: `@string(${replayRow}?['ReferenceId'])`, entityKey: `@string(${replayRow}?['EntityKey'])`, qualifiedKey: `@concat('REC:',string(${replayRow}?['EntityKey']))`, recognised: true, replayed: true }),
        else: { actions: {
          ...claim,
          Condition_Dynamic_Register_Claimed: {
            type: 'If', runAfter: ok('Compose_Claim_Registry'),
            expression: { and: [{ equals: ["@outputs('Compose_Claim_Registry')?['ok']", true] }] },
            actions: {
              Create_Dynamic_Register_Record: { type: 'OpenApiConnection', runAfter: {}, inputs: {
                host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
                parameters: {
                  dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS', table: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667',
                  'item/Title': `@${REF}`, 'item/ReferenceId': `@${REF}`, 'item/Subject': `@${DI('subject')}`,
                  'item/Channel': `@if(empty(${DI('channel')}),'internal',toLower(${DI('channel')}))`,
                  'item/CorrespondenceType': 'Incoming', 'item/SenderEmail': `@${SENDER}`,
                  'item/Status/Value': 'received', 'item/StatusLabel': 'Received', 'item/AttachmentCount': 0,
                  'item/SubmittedAtUtc': '@utcNow()', 'item/UpdatedAtUtc': '@utcNow()', 'item/ActionRequired': false,
                  'item/EntityKey': `@${RECK}`, 'item/IdState/Value': 'ACTIVE', 'item/Rev': 1, 'item/Direction/Value': 'In',
                  'item/CorrelationId': `@${DREQ}`, 'item/CreatedByRequest': `@${DREQ}`, 'item/ClientRequestHash': `@${HASH}`,
                  'item/SourceLocator': `@${DI('locatorValue')}`,
                } } },
              ...K.voidRow({ tag: 'Dynamic_Register', dataset: 'INTAKE_REGISTER', referenceColumn: 'ReferenceId', reference: `@{${REF}}`, reason: 'RECORD_WRITE_FAILED', fields: { Title: 'VOID', Status: 'void', SenderEmail: `@{${SENDER}}` } }),
              ...res('Compose_Result_Dynamic_500_Register', 500, { code: 'RECORD_NOT_WRITTEN', message: 'The reference was claimed but the record could not be written; the number is recorded as void. Try again.', operation: `@${DOP}`, recognised: true }, { Create_Void_Dynamic_Register: ['Succeeded', 'Failed', 'TimedOut'] }),
              ...idEntry('Dynamic_Register_Locator', { entryKind: 'LOCATOR', kind: DI('locatorKind'), container: DI('locatorContainer'), value: DI('locatorValue'), entityRef: `concat('REC:',${RECK})`, system: `string(coalesce(${jlit(LOCATOR_SYSTEM)}?[${DI('locatorKind')}],''))`, when: `not(empty(${DI('locatorValue')}))`, runAfter: ok('Create_Dynamic_Register_Record') }),
              Compose_Dynamic_Register_Data: { type: 'Compose', runAfter: { Condition_Dynamic_Register_Locator: ALL }, inputs: data },
              Create_Dynamic_Register_Audit: dAudit({ event: 'record:registered', action: 'REGISTERED', process: 'INTAKE', subjectKey: `concat('REC:',${RECK})`, rootRef: REF, revAfter: '1', result: "outputs('Compose_Dynamic_Register_Data')", runAfter: ok('Compose_Dynamic_Register_Data') }),
              ...res('Compose_Result_Dynamic_200_Register', 200, "@outputs('Compose_Dynamic_Register_Data')", { Create_Dynamic_Register_Audit: ALL }),
            },
            else: { actions: res('Compose_Result_Dynamic_503_Register', 503, { code: 'RETRY_LATER', message: 'A reference could not be issued. Nothing was registered; try again in a few seconds.', operation: `@${DOP}`, recognised: true }) },
          },
        } },
      },
    });
    const v = sw.cases.Case_Dynamic_Register.actions.Condition_Dynamic_Register_Replay.else.actions.Condition_Dynamic_Register_Claimed.actions;
    v.Create_Void_Dynamic_Register.runAfter = { Create_Dynamic_Register_Record: ['Failed', 'TimedOut'] };
    v.Compose_Result_Dynamic_200_Register.inputs.data = "@outputs('Compose_Dynamic_Register_Data')";
    const first = Object.keys(claim)[0];
    sw.cases.Case_Dynamic_Register.actions.Condition_Dynamic_Register_Replay.else.actions[first].runAfter = {};
  });

  /* upsert-record (MIN, BRF, MTG, PRJ, APR) */
  edit(log, 'upsert_record (§7, §13): creates or changes a minute, brief, meeting, project or approval. With entityKey it changes that row\'s Title (a minute\'s Description, an approval\'s Decision) by the kit\'s Guarded Update (Rev + 1); without, it creates the row with a new Entity Key, IdState ACTIVE, Rev 1, CreatedByRequest and ClientRequestHash (CorrelationId where the list has it), after returning the existing row if its clientRequestHash is already there. A minute (Task_Comments) is created under its task: ParentKey TSK:<key>, RootKey and RootRef from the task row, RefIDD the task\'s document, Description the text, AuthorKey USR:<the caller>; an unknown task is 404. An approval takes Decision (Pending unless sent) and, when parentKey is given, ParentKey and RootKey. When Folio sends its own local key (localKey), DGO_IdentityMap gets a FOLIO_LOCAL_KEY alias, System runtime, MatchKey ALIAS|FOLIO_LOCAL_KEY||<key> (§12.3 4a).', () => {
    const ET = DI('entityType');
    const DK = `string(coalesce(${jlit({ MIN: 'MINUTES', BRF: 'BRIEFS', MTG: 'MEETINGS', PRJ: 'PROJECTS', APR: 'APPROVALS', RMD: 'REMINDERS' })}?[${ET}],''))`;
    const NEWK = "outputs('Compose_EntityKey_Upsert')";
    const TASKROW = `first(${rows('Get_Dynamic_Upsert_Parent')})`;
    /* The service evaluates both arms of if() and substring() fails on an empty text (start index 0 is not less than
       its length), so the text is padded with one character the cut never reaches: a brief with a title and no text. */
    const base = obj({ Title: `@{if(empty(${DI('title')}),substring(concat(${DI('text')},'_'),0,min(255,length(${DI('text')}))),${DI('title')})}`, EntityKey: `@{${NEWK}}`, CreatedByRequest: `@{${DREQ}}`, ClientRequestHash: `@{${HASH}}` });
    const minBody = `setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(${base},'Description',${DI('text')}),'ParentKey',concat('TSK:',toLower(last(split(${DI('parentKey')},':'))))),'RootKey',string(coalesce(${TASKROW}?['RootKey'],''))),'RootRef',string(coalesce(${TASKROW}?['RootRef'],''))),'RefIDD',string(coalesce(${TASKROW}?['RefIDD'],''))),'AuthorKey',outputs('Compose_Dynamic_Actor_Key'))`;
    const govBody = `setProperty(setProperty(setProperty(${base},'IdState','ACTIVE'),'Rev',1),'CorrelationId',${DREQ})`;
    const aprBody = `setProperty(setProperty(setProperty(${govBody},'Decision',if(empty(${DI('decision')}),'Pending',${DI('decision')})),'ParentKey',${DI('parentKey')}),'RootKey',${DI('parentKey')})`;
    /* RN-035: a reminder (DGO_TaskReminders) is scheduled; AUTO_SCHEDULED_SWEEP sends it once DueAtUtc has passed. */
    const rmdBody = `setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(${govBody},'RefIDD',${DI('ref')}),'ParentKey',${DI('parentKey')}),'AssignedTo',toLower(${DI('assignedTo')})),'DueAtUtc',${DI('dueAt')}),'Note',${DI('text')}),'ReminderStatus','scheduled')`;
    const BODY = `if(equals(${ET},'MIN'),${minBody},if(equals(${ET},'APR'),${aprBody},if(equals(${ET},'RMD'),${rmdBody},${govBody})))`;
    const UPD = `if(equals(${ET},'MIN'),setProperty(json('{}'),'Description',${DI('text')}),if(and(equals(${ET},'APR'),not(empty(${DI('decision')}))),setProperty(setProperty(json('{}'),'Title',${DI('title')}),'Decision',${DI('decision')}),setProperty(json('{}'),'Title',${DI('title')})))`;
    const createdRow = "body('Create_Dynamic_Upsert_Row')";
    const QK = (k) => `concat(${ET},':',${k})`;
    const gu = K.guardedUpdate({ tag: 'Dynamic_Upsert', dataset: 'BRIEFS', itemId: `@{first(${rows('Get_Dynamic_Upsert_Row')})?['ID']}`, changes: UPD, siteExpr: `@${SITE_OF(DK)}`, listExpr: LIST_OF(DK), revIf: `not(equals(${ET},'MIN'))` });
    addCase('Upsert', 'upsert-record', {
      Condition_Dynamic_Upsert_Change: {
        type: 'If', runAfter: {},
        expression: { and: [{ equals: [`@empty(${DI('entityKey')})`, false] }] },
        actions: {
          Get_Dynamic_Upsert_Row: dGet(SITE_OF(DK), LIST_OF(DK), `concat('EntityKey eq ''',toLower(${DI('entityKey')}),'''')`, {}),
          Condition_Dynamic_Upsert_Found: {
            type: 'If', runAfter: { Get_Dynamic_Upsert_Row: ALL },
            expression: { and: [{ equals: [`@length(${rows('Get_Dynamic_Upsert_Row')})`, 1] }] },
            actions: {
              ...K.chain(gu),
              Condition_Dynamic_Upsert_Updated: {
                type: 'If', runAfter: ok('Compose_Updated_Dynamic_Upsert'),
                expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_Upsert')?['ok']", true] }] },
                actions: {
                  Compose_Dynamic_Upsert_Change_Data: { type: 'Compose', runAfter: {}, inputs: { operation: `@${DOP}`, entityKey: `@toLower(${DI('entityKey')})`, qualifiedKey: `@${QK(`toLower(${DI('entityKey')})`)}`, created: false, revAfter: "@outputs('Compose_Updated_Dynamic_Upsert')?['revAfter']", recognised: true, replayed: false } },
                  Create_Dynamic_Upsert_Change_Audit: dAudit({ event: 'record:updated', action: 'UPDATED', process: 'ACTION', subjectKey: QK(`toLower(${DI('entityKey')})`), revAfter: "outputs('Compose_Updated_Dynamic_Upsert')?['revAfter']", result: "outputs('Compose_Dynamic_Upsert_Change_Data')", runAfter: ok('Compose_Dynamic_Upsert_Change_Data') }),
                  ...res('Compose_Result_Dynamic_200_Upsert_Change', 200, "@outputs('Compose_Dynamic_Upsert_Change_Data')", { Create_Dynamic_Upsert_Change_Audit: ALL }),
                },
                else: { actions: (results.push('Compose_Result_Dynamic_409_Upsert'), conflictOrUnknown('Compose_Result_Dynamic_409_Upsert', 'Dynamic_Upsert', 'The record changed while this update was applied, three times. Reload it and try again.')) },
              },
            },
            else: { actions: res('Compose_Result_Dynamic_404_Upsert', 404, { code: 'TARGET_NOT_FOUND', message: 'No record has that entityKey.', operation: `@${DOP}`, recognised: true }) },
          },
        },
        else: { actions: {
          Get_Dynamic_Upsert_Replay: dGet(SITE_OF(DK), LIST_OF(DK), `if(empty(${HASH}),'ID eq 0',concat('ClientRequestHash eq ''',${HASH},''''))`, {}),
          Get_Dynamic_Upsert_Parent: dGet(SITE_OF("'TASK_QUEUE'"), LIST_OF("'TASK_QUEUE'"), `if(equals(${ET},'MIN'),concat('EntityKey eq ''',toLower(last(split(${DI('parentKey')},':'))),''''),'ID eq 0')`, { Get_Dynamic_Upsert_Replay: ALL }),
          Compose_Dynamic_Upsert_State: { type: 'Compose', runAfter: { Get_Dynamic_Upsert_Parent: ALL },
            inputs: `@if(not(empty(${rows('Get_Dynamic_Upsert_Replay')})),'replay',if(and(equals(${ET},'MIN'),empty(${rows('Get_Dynamic_Upsert_Parent')})),'no_parent','new'))` },
          Switch_Dynamic_Upsert_State: {
            type: 'Switch', runAfter: ok('Compose_Dynamic_Upsert_State'), expression: "@outputs('Compose_Dynamic_Upsert_State')",
            cases: {
              Case_Upsert_Replay: { case: 'replay', actions: res('Compose_Result_Dynamic_200_Upsert_Replay', 200, { operation: `@${DOP}`, entityKey: `@toLower(string(first(${rows('Get_Dynamic_Upsert_Replay')})?['EntityKey']))`, qualifiedKey: `@${QK(`toLower(string(first(${rows('Get_Dynamic_Upsert_Replay')})?['EntityKey']))`)}`, created: false, recognised: true, replayed: true }) },
              Case_Upsert_No_Parent: { case: 'no_parent', actions: res('Compose_Result_Dynamic_404_Upsert_Parent', 404, { code: 'TASK_NOT_FOUND', message: 'No task has that parentKey, so the minute was not written.', operation: `@${DOP}`, recognised: true }) },
              Case_Upsert_New: { case: 'new', actions: {
                Compose_EntityKey_Upsert: { type: 'Compose', inputs: '@guid()', runAfter: {} },
                Create_Dynamic_Upsert_Row: { ...dPost(SITE_OF(DK), LIST_OF(DK), BODY, ok('Compose_EntityKey_Upsert')) },
                ...idEntry('Dynamic_Upsert_Alias', { entryKind: 'ALIAS', kind: "'FOLIO_LOCAL_KEY'", container: "''", value: DI('localKey'), entityRef: QK(NEWK), system: "'runtime'", when: `not(empty(${DI('localKey')}))`, runAfter: ok('Create_Dynamic_Upsert_Row') }),
                Compose_Dynamic_Upsert_Data: { type: 'Compose', runAfter: { Condition_Dynamic_Upsert_Alias: ALL }, inputs: { operation: `@${DOP}`, entityKey: `@${NEWK}`, qualifiedKey: `@${QK(NEWK)}`, created: true, aliasWritten: "@or(equals(actions('Create_Dynamic_Upsert_Alias')?['status'],'Succeeded'),not(empty(coalesce(body('Get_MatchKey_Dynamic_Upsert_Alias')?['value'],json('[]')))))", recognised: true, replayed: false } },
                Create_Dynamic_Upsert_Audit: dAudit({ event: 'record:created', action: 'CREATED', process: 'ACTION', subjectKey: QK(NEWK), rootKey: `if(equals(${ET},'MIN'),string(coalesce(${TASKROW}?['RootKey'],'')),${QK(NEWK)})`, rootRef: `if(equals(${ET},'MIN'),string(coalesce(${TASKROW}?['RootRef'],'')),'')`, revAfter: '1', result: "outputs('Compose_Dynamic_Upsert_Data')", runAfter: ok('Compose_Dynamic_Upsert_Data') }),
                ...res('Compose_Result_Dynamic_200_Upsert', 200, "@outputs('Compose_Dynamic_Upsert_Data')", { Create_Dynamic_Upsert_Audit: ALL }),
                ...res('Compose_Result_Dynamic_422_Upsert', 422, { code: 'VALUE_REJECTED', message: 'The list did not accept the record, so nothing was created.', operation: `@${DOP}`, recognised: true, detail: `@string(coalesce(actions('Create_Dynamic_Upsert_Row')?['outputs']?['body']?['error']?['message'],''))` }, { Create_Dynamic_Upsert_Row: ['Failed', 'TimedOut'] }),
              } },
            },
            default: { actions: {} },
          },
        } },
      },
    });
  });

  /* open-file (REG) */
  edit(log, 'open_file (§8.2, T12): opens a registry file. A request whose clientRequestHash DGO_RegistryFiles already holds returns that file. Otherwise it claims the next FILE-YYYY-NNNNN (the kit claim, counter FILE-<year>) and writes the file: Title, RegistryFileRef, CurrentHolder (toOrgKey, else the caller), EntityKey, IdState ACTIVE, Rev 1, CorrelationId, CreatedByRequest, ClientRequestHash; then the OPENED movement in DGO_FileMovements; and, when Folio sends the file\'s old DGO/YYYY/NNNNNN number (legacyNumber), a LEGACY_REGISTRY_FILE_NO alias (MatchKey ALIAS|LEGACY_REGISTRY_FILE_NO||<number>). If the file cannot be written a VOID row accounts for the number and the reply is 500; if no number can be claimed, 503.', () => {
    const claim = K.chain(K.entityKey('File'), K.claimReference({ tag: 'File', prefix: 'FILE', floor: { dataset: 'REGISTRY_FILES', column: 'RegistryFileRef' }, lean: true }));
    const REF = "string(coalesce(first(outputs('Compose_Claim_File')?['references']),''))";
    const FK = "outputs('Compose_EntityKey_File')";
    const HOLDER = `if(empty(${DI('toOrgKey')}),outputs('Compose_Dynamic_Actor_Key'),${DI('toOrgKey')})`;
    const replayRow = `first(${rows('Get_Dynamic_File_Replay')})`;
    addCase('Open_File', 'open-file', {
      Get_Dynamic_File_Replay: replayGet('File', 'REGISTRY_FILES'),
      Condition_Dynamic_File_Replay: {
        type: 'If', runAfter: { Get_Dynamic_File_Replay: ALL },
        expression: { and: [{ equals: [`@empty(${rows('Get_Dynamic_File_Replay')})`, false] }] },
        actions: res('Compose_Result_Dynamic_200_File_Replay', 200, { operation: `@${DOP}`, fileRef: `@string(${replayRow}?['RegistryFileRef'])`, entityKey: `@string(${replayRow}?['EntityKey'])`, qualifiedKey: `@concat('REG:',string(${replayRow}?['EntityKey']))`, recognised: true, replayed: true }),
        else: { actions: {
          ...claim,
          Condition_Dynamic_File_Claimed: {
            type: 'If', runAfter: ok('Compose_Claim_File'),
            expression: { and: [{ equals: ["@outputs('Compose_Claim_File')?['ok']", true] }] },
            actions: {
              Create_Dynamic_File: dPost(SITE_OF("'REGISTRY_FILES'"), LIST_OF("'REGISTRY_FILES'"), obj({ Title: `@{${DI('title')}}`, RegistryFileRef: `@{${REF}}`, CurrentHolder: `@{${HOLDER}}`, EntityKey: `@{${FK}}`, IdState: 'ACTIVE', Rev: 1, CorrelationId: `@{${DREQ}}`, CreatedByRequest: `@{${DREQ}}`, ClientRequestHash: `@{${HASH}}` }), {}),
              /* DGO_RegistryFiles has no VoidReason column: the void row is the number, the state and the request. */
              Create_Void_Dynamic_File: dPost(SITE_OF("'REGISTRY_FILES'"), LIST_OF("'REGISTRY_FILES'"), obj({ Title: 'VOID', RegistryFileRef: `@{${REF}}`, EntityKey: '@guid()', IdState: 'VOID', CreatedByRequest: `@{${DREQ}}` }), { Create_Dynamic_File: ['Failed', 'TimedOut'] }),
              ...res('Compose_Result_Dynamic_500_File', 500, { code: 'FILE_NOT_WRITTEN', message: 'The file number was claimed but the file could not be written; the number is recorded as void. Try again.', operation: `@${DOP}`, recognised: true }, { Create_Void_Dynamic_File: ['Succeeded', 'Failed', 'TimedOut'] }),
              Create_Dynamic_File_Opened: dPost(SITE_OF("'FILE_MOVEMENTS'"), LIST_OF("'FILE_MOVEMENTS'"), obj({ Title: `@{concat('OPENED:',${REF})}`, EntityKey: '@guid()', SubjectKey: `@{concat('REG:',${FK})}`, RootKey: `@{concat('REG:',${FK})}`, RootRef: `@{${REF}}`, Action: 'OPENED', ActorKey: "@{outputs('Compose_Dynamic_Actor_Key')}", RequestId: `@{${DREQ}}`, CorrelationId: `@{${DREQ}}`, RevAfter: 1, Process: 'GOVERN', ContractKey: 'DYNAMIC_ACTIONS', FromOrgKey: '', ToOrgKey: `@{${HOLDER}}`, MovementAction: 'OPENED' }), ok('Create_Dynamic_File')),
              ...idEntry('Dynamic_File_Alias', { entryKind: 'ALIAS', kind: "'LEGACY_REGISTRY_FILE_NO'", container: "''", value: DI('legacyNumber'), entityRef: `concat('REG:',${FK})`, system: "'runtime'", when: `not(empty(${DI('legacyNumber')}))`, runAfter: ok('Create_Dynamic_File') }),
              Compose_Dynamic_File_Data: { type: 'Compose', runAfter: { Create_Dynamic_File_Opened: ALL, Condition_Dynamic_File_Alias: ALL }, inputs: { operation: `@${DOP}`, fileRef: `@${REF}`, entityKey: `@${FK}`, qualifiedKey: `@concat('REG:',${FK})`, currentHolder: `@${HOLDER}`, recognised: true, replayed: false } },
              Create_Dynamic_File_Audit: dAudit({ event: 'file:opened', action: 'OPENED', process: 'GOVERN', subjectKey: `concat('REG:',${FK})`, rootRef: REF, revAfter: '1', result: "outputs('Compose_Dynamic_File_Data')", runAfter: ok('Compose_Dynamic_File_Data') }),
              ...res('Compose_Result_Dynamic_200_File', 200, "@outputs('Compose_Dynamic_File_Data')", { Create_Dynamic_File_Audit: ALL }),
            },
            else: { actions: res('Compose_Result_Dynamic_503_File', 503, { code: 'RETRY_LATER', message: 'A file number could not be issued. Nothing was opened; try again in a few seconds.', operation: `@${DOP}`, recognised: true }) },
          },
        } },
      },
    });
    sw.cases.Case_Dynamic_Open_File.actions.Condition_Dynamic_File_Replay.else.actions[Object.keys(claim)[0]].runAfter = {};
  });

  /* target operations: move-file, void, reparent, merge */
  const notFound = (name) => res(name, 404, { code: 'TARGET_NOT_FOUND', message: 'No record has that key.', operation: `@${DOP}`, recognised: true, target: `@${DI('target')}` });
  const conflict = (name, tag) => { results.push(name); return conflictOrUnknown(name, tag, 'The record changed while this change was applied, three times. Reload it and try again.'); };

  edit(log, 'move_file (T12): moves a registry file to toOrgKey. The file (REG:<key> or its spo: locator) is found in DGO_RegistryFiles; its CurrentHolder changes by the Guarded Update (Rev + 1) and DGO_FileMovements gets a MOVED event: SubjectKey and RootKey REG:<key>, RootRef the FILE reference, FromOrgKey (the holder before), ToOrgKey, MovementAction (as sent, else MOVED), RevAfter. An unknown file is 404; a file changed three times during the move is 409.', () => {
    const RES = dResolve('Move', DI('target'));
    const gu = K.guardedUpdate({ tag: 'Dynamic_Move', dataset: 'REGISTRY_FILES', itemId: `@{${RK('Move', 'id')}}`, changes: `setProperty(json('{}'),'CurrentHolder',${DI('toOrgKey')})` });
    const FROM = "string(coalesce(outputs('Compose_Row_Move')?['row']?['CurrentHolder'],''))";
    addCase('Move_File', 'move-file', {
      ...K.chain(RES),
      Condition_Dynamic_Move_Found: {
        type: 'If', runAfter: ok('Compose_Row_Move_Keys'),
        expression: { and: [{ equals: [`@and(${RK('Move', 'found')},equals(${RK('Move', 'type')},'REG'))`, true] }] },
        actions: {
          ...K.chain(gu),
          Condition_Dynamic_Move_Updated: {
            type: 'If', runAfter: ok('Compose_Updated_Dynamic_Move'),
            expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_Move')?['ok']", true] }] },
            actions: {
              Create_Dynamic_Move_Event: dPost(SITE_OF("'FILE_MOVEMENTS'"), LIST_OF("'FILE_MOVEMENTS'"), obj({ Title: `@{concat('MOVED:',${RK('Move', 'reference')})}`, EntityKey: '@guid()', SubjectKey: `@{${RK('Move', 'qk')}}`, RootKey: `@{${RK('Move', 'qk')}}`, RootRef: `@{${RK('Move', 'reference')}}`, Action: 'MOVED', ActorKey: "@{outputs('Compose_Dynamic_Actor_Key')}", RequestId: `@{${DREQ}}`, CorrelationId: `@{${DREQ}}`, RevAfter: "@outputs('Compose_Updated_Dynamic_Move')?['revAfter']", Process: 'GOVERN', ContractKey: 'DYNAMIC_ACTIONS', FromOrgKey: `@{${FROM}}`, ToOrgKey: `@{${DI('toOrgKey')}}`, MovementAction: `@{if(empty(${DI('movementAction')}),'MOVED',${DI('movementAction')})}` }), {}),
              Compose_Dynamic_Move_Data: { type: 'Compose', runAfter: { Create_Dynamic_Move_Event: ALL }, inputs: { operation: `@${DOP}`, fileRef: `@${RK('Move', 'reference')}`, qualifiedKey: `@${RK('Move', 'qk')}`, fromOrgKey: `@${FROM}`, toOrgKey: `@${DI('toOrgKey')}`, revAfter: "@outputs('Compose_Updated_Dynamic_Move')?['revAfter']", movementWritten: "@equals(actions('Create_Dynamic_Move_Event')?['status'],'Succeeded')", recognised: true, replayed: false } },
              Create_Dynamic_Move_Audit: dAudit({ event: 'file:moved', action: 'MOVED', process: 'GOVERN', subjectKey: RK('Move', 'qk'), rootRef: RK('Move', 'reference'), revAfter: "outputs('Compose_Updated_Dynamic_Move')?['revAfter']", result: "outputs('Compose_Dynamic_Move_Data')", runAfter: ok('Compose_Dynamic_Move_Data') }),
              ...res('Compose_Result_Dynamic_200_Move', 200, "@outputs('Compose_Dynamic_Move_Data')", { Create_Dynamic_Move_Audit: ALL }),
            },
            else: { actions: conflict('Compose_Result_Dynamic_409_Move', 'Dynamic_Move') },
          },
        },
        else: { actions: notFound('Compose_Result_Dynamic_404_Move') },
      },
    });
  });

  edit(log, 'link (§6, T12): writes a DGO_RecordLinks row: FromKey, LinkType, ToKey, LinkMatchKey <from>|<type>|<to> (unique), EntityKey, IdState ACTIVE, Rev 1, CreatedByRequest. A link that already exists is returned (existing: true), not written twice.', () => {
    const MK = `concat(toUpper(first(split(${DI('fromKey')},':'))),':',toLower(last(split(${DI('fromKey')},':'))),'|',${DI('linkType')},'|',toUpper(first(split(${DI('toKey')},':'))),':',toLower(last(split(${DI('toKey')},':'))))`;
    addCase('Link', 'link', {
      Compose_Dynamic_Link_Key: { type: 'Compose', runAfter: {}, inputs: `@${MK}` },
      Get_Dynamic_Link_Existing: dGet(SITE_OF("'RECORD_LINKS'"), LIST_OF("'RECORD_LINKS'"), "concat('LinkMatchKey eq ''',outputs('Compose_Dynamic_Link_Key'),'''')", ok('Compose_Dynamic_Link_Key')),
      Condition_Dynamic_Link_Exists: {
        type: 'If', runAfter: { Get_Dynamic_Link_Existing: ALL },
        expression: { and: [{ equals: [`@empty(${rows('Get_Dynamic_Link_Existing')})`, false] }] },
        actions: res('Compose_Result_Dynamic_200_Link_Existing', 200, { operation: `@${DOP}`, linkKey: "@outputs('Compose_Dynamic_Link_Key')", entityKey: `@string(first(${rows('Get_Dynamic_Link_Existing')})?['EntityKey'])`, existing: true, recognised: true, replayed: false }),
        else: { actions: {
          Compose_EntityKey_Link: { type: 'Compose', inputs: '@guid()', runAfter: {} },
          Create_Dynamic_Link: dPost(SITE_OF("'RECORD_LINKS'"), LIST_OF("'RECORD_LINKS'"), obj({ Title: "@{outputs('Compose_Dynamic_Link_Key')}", EntityKey: "@{outputs('Compose_EntityKey_Link')}", FromKey: `@{first(split(outputs('Compose_Dynamic_Link_Key'),'|'))}`, ToKey: `@{last(split(outputs('Compose_Dynamic_Link_Key'),'|'))}`, LinkType: `@{${DI('linkType')}}`, LinkMatchKey: "@{outputs('Compose_Dynamic_Link_Key')}", IdState: 'ACTIVE', Rev: 1, CreatedByRequest: `@{${DREQ}}` }), ok('Compose_EntityKey_Link')),
          Compose_Dynamic_Link_Data: { type: 'Compose', runAfter: ok('Create_Dynamic_Link'), inputs: { operation: `@${DOP}`, linkKey: "@outputs('Compose_Dynamic_Link_Key')", entityKey: "@outputs('Compose_EntityKey_Link')", existing: false, recognised: true, replayed: false } },
          Create_Dynamic_Link_Audit: dAudit({ event: 'link:created', action: 'LINKED', process: 'ACTION', subjectKey: "concat('LNK:',outputs('Compose_EntityKey_Link'))", rootKey: `first(split(outputs('Compose_Dynamic_Link_Key'),'|'))`, revAfter: '1', result: "outputs('Compose_Dynamic_Link_Data')", runAfter: ok('Compose_Dynamic_Link_Data') }),
          ...res('Compose_Result_Dynamic_200_Link', 200, "@outputs('Compose_Dynamic_Link_Data')", { Create_Dynamic_Link_Audit: ALL }),
          ...res('Compose_Result_Dynamic_422_Link', 422, { code: 'VALUE_REJECTED', message: 'The link was not accepted, so nothing was written.', operation: `@${DOP}`, recognised: true }, { Create_Dynamic_Link: ['Failed', 'TimedOut'] }),
        } },
      },
    });
  });

  edit(log, 'void (§9): sets the target\'s IdState to VOID by the Guarded Update (Rev + 1) and writes VoidReason where the list has it (Portal Registry). The row is kept and its reference is never reissued. The audit event VOIDED carries the reason. A target already void is answered unchanged.', () => {
    const RES = dResolve('Void', DI('target'));
    const DSV = RK('Void', 'datasetKey');
    const CH = `if(equals(${DSV},'INTAKE_REGISTER'),setProperty(json('{"IdState":"VOID"}'),'VoidReason',${DI('reason')}),json('{"IdState":"VOID"}'))`;
    const gu = K.guardedUpdate({ tag: 'Dynamic_Void', dataset: 'INTAKE_REGISTER', itemId: `@{${RK('Void', 'id')}}`, changes: CH, siteExpr: `@${SITE_OF(DSV)}`, listExpr: LIST_OF(DSV), revIf: `not(contains(createArray('OPS_WORKING_REGISTER','MINUTES'),${DSV}))` });
    addCase('Void', 'void', {
      ...K.chain(RES),
      Compose_Dynamic_Void_State: { type: 'Compose', runAfter: ok('Compose_Row_Void_Keys'), inputs: `@if(not(${RK('Void', 'found')}),'none',if(equals(toUpper(${RK('Void', 'idState')}),'VOID'),'void','ok'))` },
      Switch_Dynamic_Void_State: {
        type: 'Switch', runAfter: ok('Compose_Dynamic_Void_State'), expression: "@outputs('Compose_Dynamic_Void_State')",
        cases: {
          Case_Void_None: { case: 'none', actions: notFound('Compose_Result_Dynamic_404_Void') },
          Case_Void_Already: { case: 'void', actions: res('Compose_Result_Dynamic_200_Void_Unchanged', 200, { operation: `@${DOP}`, qualifiedKey: `@${RK('Void', 'qk')}`, idState: 'VOID', changed: false, recognised: true, replayed: false }) },
          Case_Void_Ok: { case: 'ok', actions: {
            ...K.chain(gu),
            Condition_Dynamic_Void_Updated: {
              type: 'If', runAfter: ok('Compose_Updated_Dynamic_Void'),
              expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_Void')?['ok']", true] }] },
              actions: {
                Compose_Dynamic_Void_Data: { type: 'Compose', runAfter: {}, inputs: { operation: `@${DOP}`, qualifiedKey: `@${RK('Void', 'qk')}`, reference: `@${RK('Void', 'reference')}`, idState: 'VOID', reason: `@${DI('reason')}`, revAfter: "@outputs('Compose_Updated_Dynamic_Void')?['revAfter']", changed: true, recognised: true, replayed: false } },
                Create_Dynamic_Void_Audit: dAudit({ event: 'record:voided', action: 'VOIDED', process: 'GOVERN', subjectKey: RK('Void', 'qk'), rootKey: `if(empty(${RK('Void', 'rootKey')}),${RK('Void', 'qk')},${RK('Void', 'rootKey')})`, rootRef: RK('Void', 'reference'), revAfter: "outputs('Compose_Updated_Dynamic_Void')?['revAfter']", result: "outputs('Compose_Dynamic_Void_Data')", runAfter: ok('Compose_Dynamic_Void_Data') }),
                ...res('Compose_Result_Dynamic_200_Void', 200, "@outputs('Compose_Dynamic_Void_Data')", { Create_Dynamic_Void_Audit: ALL }),
              },
              else: { actions: conflict('Compose_Result_Dynamic_409_Void', 'Dynamic_Void') },
            },
          } },
        },
        default: { actions: {} },
      },
    });
  });

  edit(log, 'reparent (§9): moves an attachment, task, minute or approval under a new parent. ParentKey becomes parentKey; RootKey becomes parentKey when the new parent is a REC or CAS, else stays as it was. Guarded Update (Rev + 1); audit event REPARENTED with the old and new parent.', () => {
    const RES = dResolve('Reparent', DI('target'));
    const DSR = RK('Reparent', 'datasetKey');
    const NP = `concat(toUpper(first(split(${DI('parentKey')},':'))),':',toLower(last(split(${DI('parentKey')},':'))))`;
    const CH = `if(contains(createArray('REC','CAS'),toUpper(first(split(${DI('parentKey')},':')))),setProperty(setProperty(json('{}'),'ParentKey',${NP}),'RootKey',${NP}),setProperty(json('{}'),'ParentKey',${NP}))`;
    const gu = K.guardedUpdate({ tag: 'Dynamic_Reparent', dataset: 'ATTACHMENTS', itemId: `@{${RK('Reparent', 'id')}}`, changes: CH, siteExpr: `@${SITE_OF(DSR)}`, listExpr: LIST_OF(DSR), revIf: `not(contains(createArray('OPS_WORKING_REGISTER','MINUTES'),${DSR}))` });
    addCase('Reparent', 'reparent', {
      ...K.chain(RES),
      Condition_Dynamic_Reparent_Found: {
        type: 'If', runAfter: ok('Compose_Row_Reparent_Keys'),
        expression: { and: [{ equals: [`@${RK('Reparent', 'found')}`, true] }] },
        actions: {
          ...K.chain(gu),
          Condition_Dynamic_Reparent_Updated: {
            type: 'If', runAfter: ok('Compose_Updated_Dynamic_Reparent'),
            expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_Reparent')?['ok']", true] }] },
            actions: {
              Compose_Dynamic_Reparent_Data: { type: 'Compose', runAfter: {}, inputs: { operation: `@${DOP}`, qualifiedKey: `@${RK('Reparent', 'qk')}`, parentBefore: `@${RK('Reparent', 'parentKey')}`, parentAfter: `@${NP}`, revAfter: "@outputs('Compose_Updated_Dynamic_Reparent')?['revAfter']", recognised: true, replayed: false } },
              Create_Dynamic_Reparent_Audit: dAudit({ event: 'record:reparented', action: 'REPARENTED', process: 'GOVERN', subjectKey: RK('Reparent', 'qk'), rootKey: NP, revAfter: "outputs('Compose_Updated_Dynamic_Reparent')?['revAfter']", result: "outputs('Compose_Dynamic_Reparent_Data')", runAfter: ok('Compose_Dynamic_Reparent_Data') }),
              ...res('Compose_Result_Dynamic_200_Reparent', 200, "@outputs('Compose_Dynamic_Reparent_Data')", { Create_Dynamic_Reparent_Audit: ALL }),
            },
            else: { actions: conflict('Compose_Result_Dynamic_409_Reparent', 'Dynamic_Reparent') },
          },
        },
        else: { actions: notFound('Compose_Result_Dynamic_404_Reparent') },
      },
    });
  });

  edit(log, 'merge (§9 merge procedure, T9; Registry Manager only): absorbs record A (target) into survivor B. 1. LNK A MERGED_INTO B. 2. A\'s attachments (Portal Attachments, ParentKey REC:A) and tasks (Global Tracking Queue, ParentKey or RootKey REC:A) are re-parented to B, each by the Guarded Update with RootRef B\'s reference and an audit event REPARENTED. 3. A: IdState MERGED and, where the list has it, SupersededBy REC:B, by the Guarded Update (Rev + 1). 4. Audit event MERGED on A and on B. A\'s reference resolves to B from then on. Either record unknown is 404; a record already merged or void cannot be merged (409).', () => {
    const RA = dResolve('MergeA', DI('target')), RB = dResolve('MergeB', DI('survivor'));
    const AQK = RK('MergeA', 'qk'), BQK = RK('MergeB', 'qk'), BREF = RK('MergeB', 'reference');
    const DSA = RK('MergeA', 'datasetKey');
    const CH = `if(equals(${DSA},'INTAKE_REGISTER'),setProperty(json('{"IdState":"MERGED"}'),'SupersededBy',${BQK}),json('{"IdState":"MERGED"}'))`;
    const gu = K.guardedUpdate({ tag: 'Dynamic_Merge', dataset: 'INTAKE_REGISTER', itemId: `@{${RK('MergeA', 'id')}}`, changes: CH, siteExpr: `@${SITE_OF(DSA)}`, listExpr: LIST_OF(DSA), revIf: `not(contains(createArray('OPS_WORKING_REGISTER','MINUTES'),${DSA}))` });
    const MK = `concat(${AQK},'|MERGED_INTO|',${BQK})`;
    const childLoop = (T, dk, filter, changes) => ({
      [`Get_Dynamic_Merge_${T}`]: dHttp({ site: K.site(dk), method: 'GET', uri: `_api/web/lists(guid'${K.list(dk)}')/items?$top=500&$filter=@{${filter}}`, runAfter: {} }),
      [`Apply_to_each_Merge_${T}`]: {
        type: 'Foreach', runAfter: { [`Get_Dynamic_Merge_${T}`]: ALL }, foreach: `@${rows(`Get_Dynamic_Merge_${T}`)}`,
        runtimeConfiguration: { concurrency: { repetitions: 1 } },
        actions: {
          ...K.chain(K.guardedUpdate({ tag: `Merge_${T}`, dataset: dk, itemId: `@{items('Apply_to_each_Merge_${T}')?['ID']}`, changes })),
          [`Create_Dynamic_Merge_${T}_Audit`]: dAudit({ event: 'record:reparented', action: 'REPARENTED', process: 'GOVERN', subjectKey: `concat('${dk === 'ATTACHMENTS' ? 'ATT' : 'TSK'}:',toLower(string(items('Apply_to_each_Merge_${T}')?['EntityKey'])))`, rootKey: BQK, rootRef: BREF, revAfter: `outputs('Compose_Updated_Merge_${T}')?['revAfter']`, auditId: `concat(outputs('Compose_Dynamic_Audit_Id'),':${T}:',string(items('Apply_to_each_Merge_${T}')?['ID']))`, runAfter: ok(`Compose_Updated_Merge_${T}`) }),
        },
      },
    });
    const AKEYF = `concat('''',${AQK},'''')`;
    addCase('Merge', 'merge', {
      ...K.chain(RA, RB),
      Compose_Dynamic_Merge_State: { type: 'Compose', runAfter: ok('Compose_Row_MergeB_Keys'),
        inputs: `@if(or(not(${RK('MergeA', 'found')}),not(${RK('MergeB', 'found')})),'none',if(or(not(equals(toUpper(${RK('MergeA', 'idState')}),'ACTIVE')),not(equals(toUpper(${RK('MergeB', 'idState')}),'ACTIVE'))),'state','ok'))` },
      Switch_Dynamic_Merge_State: {
        type: 'Switch', runAfter: ok('Compose_Dynamic_Merge_State'), expression: "@outputs('Compose_Dynamic_Merge_State')",
        cases: {
          Case_Merge_None: { case: 'none', actions: notFound('Compose_Result_Dynamic_404_Merge') },
          Case_Merge_State: { case: 'state', actions: res('Compose_Result_Dynamic_409_Merge_State', 409, { code: 'NOT_ACTIVE', message: 'Both records must be active to merge; one is already merged, void or archived.', operation: `@${DOP}`, recognised: true }) },
          Case_Merge_Ok: { case: 'ok', actions: {
            Create_Dynamic_Merge_Link: dPost(SITE_OF("'RECORD_LINKS'"), LIST_OF("'RECORD_LINKS'"), obj({ Title: `@{${MK}}`, EntityKey: '@guid()', FromKey: `@{${AQK}}`, ToKey: `@{${BQK}}`, LinkType: 'MERGED_INTO', LinkMatchKey: `@{${MK}}`, IdState: 'ACTIVE', Rev: 1, CreatedByRequest: `@{${DREQ}}` }), {}),
            Scope_Dynamic_Merge_Children: { type: 'Scope', runAfter: { Create_Dynamic_Merge_Link: ALL }, actions: K.chain(
              childLoop('Attachments', 'ATTACHMENTS', `concat('ParentKey eq ',${AKEYF})`, `setProperty(setProperty(setProperty(json('{}'),'ParentKey',${BQK}),'RootKey',${BQK}),'RootRef',${BREF})`),
              childLoop('Tasks', 'TASK_QUEUE', `concat('ParentKey eq ',${AKEYF},' or RootKey eq ',${AKEYF})`, `setProperty(setProperty(setProperty(json('{}'),'ParentKey',if(equals(toLower(string(items('Apply_to_each_Merge_Tasks')?['ParentKey'])),toLower(${AQK})),${BQK},string(items('Apply_to_each_Merge_Tasks')?['ParentKey']))),'RootKey',${BQK}),'RootRef',${BREF})`),
            ) },
            ...K.chain(gu),
            Condition_Dynamic_Merge_Updated: {
              type: 'If', runAfter: ok('Compose_Updated_Dynamic_Merge'),
              expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_Merge')?['ok']", true] }] },
              actions: {
                Compose_Dynamic_Merge_Data: { type: 'Compose', runAfter: {}, inputs: { operation: `@${DOP}`, absorbed: `@${AQK}`, absorbedReference: `@${RK('MergeA', 'reference')}`, survivor: `@${BQK}`, survivorReference: `@${BREF}`, attachmentsMoved: `@length(${rows('Get_Dynamic_Merge_Attachments')})`, tasksMoved: `@length(${rows('Get_Dynamic_Merge_Tasks')})`, linked: "@equals(actions('Create_Dynamic_Merge_Link')?['status'],'Succeeded')", revAfter: "@outputs('Compose_Updated_Dynamic_Merge')?['revAfter']", recognised: true, replayed: false } },
                Create_Dynamic_Merge_Audit: dAudit({ event: 'record:merged', action: 'MERGED', process: 'GOVERN', subjectKey: AQK, rootRef: RK('MergeA', 'reference'), revAfter: "outputs('Compose_Updated_Dynamic_Merge')?['revAfter']", result: "outputs('Compose_Dynamic_Merge_Data')", runAfter: ok('Compose_Dynamic_Merge_Data') }),
                Create_Dynamic_Merge_Survivor_Audit: dAudit({ event: 'record:merged', action: 'MERGED', process: 'GOVERN', subjectKey: BQK, rootRef: BREF, auditId: "concat(outputs('Compose_Dynamic_Audit_Id'),':survivor')", runAfter: ok('Compose_Dynamic_Merge_Data') }),
                ...res('Compose_Result_Dynamic_200_Merge', 200, "@outputs('Compose_Dynamic_Merge_Data')", { Create_Dynamic_Merge_Audit: ALL, Create_Dynamic_Merge_Survivor_Audit: ALL }),
              },
              else: { actions: conflict('Compose_Result_Dynamic_409_Merge', 'Dynamic_Merge') },
            },
          } },
        },
        default: { actions: {} },
      },
    });
    const ok_ = sw.cases.Case_Dynamic_Merge.actions.Switch_Dynamic_Merge_State.cases.Case_Merge_Ok.actions;
    ok_.Scope_Update_Dynamic_Merge_1.runAfter = { Scope_Dynamic_Merge_Children: ALL };
  });

  /* user-admin (ITEM-25): Folio's User Administration screen (modules/user-admin.js) */
  if (opts.userAdmin) edit(log, 'ITEM-25 user-admin (needs assessment 2026-10-08: the User Administration screen\'s changes queued on the device and never reached DGO_UserDirectory, so a person could be added or given a role only in SharePoint itself): user-admin:create-user, update-user, assign-role and disable-user are served. The caller\'s role must allow the user-admin route. The person is found by e-mail. create-user writes a new directory row (UserId, EntityKey, IdState ACTIVE, Rev 1, CreatedAt/By) and is refused 409 when the address is already there; the others change the row by Guarded Update (Rev + 1) and are refused 404 when it is not. Role, Persona and Status must be the directory\'s own choices (400). Only a systemAdmin grants systemAdmin or changes a systemAdmin\'s row (403). Each change is audited as user:<action> with the officer as actor.', () => {
    const ROLES = ['systemAdmin', 'userAdmin', 'executive', 'director', 'operator', 'viewer'];
    const PERSONAS = ['admin', 'executive', 'registry', 'general'];
    const STATUSES = ['staged', 'active', 'disabled', 'unregistered'];
    const ACTIONS = ['create-user', 'update-user', 'assign-role', 'disable-user'];
    const inp = G.Compose_Dynamic_Input.inputs;
    if ('user' in inp || 'userAdminAction' in inp) throw new Error('Compose_Dynamic_Input already reads user');
    const F = (k) => `trim(string(coalesce(if(empty(trim(string(coalesce(triggerBody()?['payload']?['${k}'],'')))),triggerBody()?['${k}'],triggerBody()?['payload']?['${k}']),'')))`;
    const RAW = `toLower(replace(if(empty(${F('operation')}),${F('action')},${F('operation')}),'_','-'))`;
    inp.user = "@coalesce(triggerBody()?['payload']?['user'],triggerBody()?['user'],json('{}'))";
    /* split, not substring: the service evaluates both arms of if(), and substring() fails on a shorter operation name. */
    inp.userAdminAction = `@if(startsWith(${RAW},'user-admin:'),last(split(${RAW},':')),'')`;
    const op = G.Compose_Dynamic_Operation;
    op.inputs = `@if(startsWith(${RAW},'user-admin:'),'user-admin',${String(op.inputs).slice(1)})`;
    const kind = G.Compose_Dynamic_Kind;
    const impl = "createArray('update','update-task','transitionstatus','logauditevent',";
    if (!kind.inputs.includes(impl)) throw new Error('Compose_Dynamic_Kind implemented set changed');
    kind.inputs = kind.inputs.replace(impl, "createArray('update','update-task','transitionstatus','logauditevent','user-admin',");
    const route = G.Compose_Dynamic_Required_Route;
    route.inputs = `@if(equals(${DOP},'user-admin'),'user-admin',${String(route.inputs).slice(1)})`;
    const U = (k) => `trim(string(coalesce(${DI('user')}?['${k}'],'')))`;
    const EMAIL = `toLower(${U('email')})`;
    const ROLE = U('role'), PERSONA = U('persona'), STATUS = `if(empty(${U('status')}),'active',${U('status')})`;
    const CALLER_IS_SYS = "equals(toLower(string(outputs('Compose_Dynamic_Role'))),'systemadmin')";
    const isUA = `equals(${DOP},'user-admin')`;
    const rules = [
      [`and(${isUA},not(contains(${jlit(ACTIONS)},${DI('userAdminAction')})))`, `user-admin: the action must be one of ${ACTIONS.join(', ')}.`],
      [`and(${isUA},or(not(contains(${EMAIL},'@')),greater(length(${EMAIL}),255)))`, 'user-admin: the person needs a valid e-mail address.'],
      [`and(${isUA},equals(${DI('userAdminAction')},'create-user'),or(empty(${U('fullName')}),empty(${U('directorate')})))`, 'user-admin: a new person needs a full name and a directorate.'],
      [`and(${isUA},not(equals(${DI('userAdminAction')},'disable-user')),not(contains(${jlit(ROLES)},${ROLE})))`, `user-admin: role must be one of ${ROLES.join(', ')}.`],
      [`and(${isUA},not(equals(${DI('userAdminAction')},'disable-user')),not(empty(${PERSONA})),not(contains(${jlit(PERSONAS)},${PERSONA})))`, `user-admin: persona must be one of ${PERSONAS.join(', ')}.`],
      [`and(${isUA},not(contains(${jlit(STATUSES)},${STATUS})))`, `user-admin: status must be one of ${STATUSES.join(', ')}.`],
    ];
    const inv = G.Compose_Dynamic_Invalid;
    /* In IP_User_Admin_Endpoint only these rules apply: the other operations' rules leave with their cases, which also keeps
       the expression under the service's 8,192-character limit (tenant 2026-10-08: 10,391 refused). */
    inv.inputs = `@${rules.reduceRight((acc, [c, m]) => `if(${c},'${m.replace(/'/g, "''")}',${acc})`, opts.only ? "''" : inv.inputs.slice(1))}`;
    const ROW = `first(${rows('Get_Dynamic_User_Row')})`;
    const ROWROLE = `toLower(string(coalesce(${ROW}?['Role'],'')))`;
    const ACTION = DI('userAdminAction');
    const STATE = `@if(and(not(${CALLER_IS_SYS}),or(equals(toLower(${ROLE}),'systemadmin'),equals(${ROWROLE},'systemadmin'))),'protected',if(equals(${ACTION},'create-user'),if(empty(${rows('Get_Dynamic_User_Row')}),'create','exists'),if(empty(${rows('Get_Dynamic_User_Row')}),'none','change')))`;
    const personaOf = `if(empty(${PERSONA}),${jlit({ systemAdmin: 'admin', userAdmin: 'admin', executive: 'executive', director: 'general', operator: 'registry', viewer: 'general' })}?[${ROLE}],${PERSONA})`;
    const NEWUID = "outputs('Compose_Dynamic_New_User_Id')";
    const createBody = obj({ Title: `@{${EMAIL}}`, UserId: `@{${NEWUID}}`, FullName: `@{${U('fullName')}}`, Email: `@{${EMAIL}}`, Directorate: `@{${U('directorate')}}`, Department: `@{${U('department')}}`, Unit: `@{${U('unit')}}`,
      JobTitle: `@{${U('jobTitle')}}`, Phone: `@{${U('phone')}}`, Role: `@{${ROLE}}`, Persona: `@{${personaOf}}`, Status: `@{${STATUS}}`, AccessScope: `@{string(coalesce(${DI('user')}?['accessScope'],json('[]')))}`, PilotCohort: `@{${U('pilotCohort')}}`,
      CreatedAt: '@{utcNow()}', CreatedBy: `@{${DI('caller')}}`, EntityKey: '@{guid()}', IdState: 'ACTIVE', Rev: 1, CreatedByRequest: `@{${DREQ}}` });
    const DIS = `equals(${ACTION},'disable-user')`;
    const changes = `if(${DIS},setProperty(setProperty(setProperty(json('{}'),'Status','disabled'),'DisabledReason',${U('disabledReason')}),'UpdatedAt',utcNow()),${obj({ Title: `@{${EMAIL}}`, FullName: `@{${U('fullName')}}`, Directorate: `@{${U('directorate')}}`, Department: `@{${U('department')}}`, Unit: `@{${U('unit')}}`, JobTitle: `@{${U('jobTitle')}}`, Phone: `@{${U('phone')}}`, Role: `@{${ROLE}}`, Persona: `@{${personaOf}}`, Status: `@{${STATUS}}`, AccessScope: `@{string(coalesce(${DI('user')}?['accessScope'],json('[]')))}`, PilotCohort: `@{${U('pilotCohort')}}`, UpdatedAt: '@{utcNow()}' })})`;
    const changesBy = `setProperty(${changes},'UpdatedBy',${DI('caller')})`;
    const gu = K.guardedUpdate({ tag: 'Dynamic_User', siteExpr: `@${SITE_OF("'USER_DIRECTORY'")}`, listExpr: LIST_OF("'USER_DIRECTORY'"), itemId: `@{${ROW}?['ID']}`, changes: changesBy });
    const UQK = (uid) => `concat('USR:',string(${uid}))`;
    const DATA = (extra) => ({ operation: `@${DOP}`, action: `@${ACTION}`, email: `@${EMAIL}`, role: `@${ROLE}`, recognised: true, replayed: false, ...extra });
    addCase('UserAdmin', 'user-admin', {
      Get_Dynamic_User_Row: dGet(SITE_OF("'USER_DIRECTORY'"), LIST_OF("'USER_DIRECTORY'"), `concat('Email eq ''',replace(${EMAIL},'''',''''''),'''')`, {}),
      Compose_Dynamic_User_State: { type: 'Compose', runAfter: ok('Get_Dynamic_User_Row'), inputs: STATE },
      Switch_Dynamic_User_State: { type: 'Switch', runAfter: ok('Compose_Dynamic_User_State'), expression: "@outputs('Compose_Dynamic_User_State')",
        cases: {
          Case_User_Protected: { case: 'protected', actions: res('Compose_Result_Dynamic_403_User', 403, { code: 'FORBIDDEN', message: 'Only a system administrator grants system administrator access or changes a system administrator.', operation: `@${DOP}`, recognised: true }) },
          Case_User_Exists: { case: 'exists', actions: res('Compose_Result_Dynamic_409_User_Exists', 409, { code: 'ALREADY_IN_DIRECTORY', message: 'That address is already in the directory; change the person instead.', operation: `@${DOP}`, recognised: true }) },
          Case_User_None: { case: 'none', actions: res('Compose_Result_Dynamic_404_User', 404, { code: 'NOT_IN_DIRECTORY', message: 'No one in the directory has that address.', operation: `@${DOP}`, recognised: true }) },
          Case_User_Create: { case: 'create', actions: {
            Compose_Dynamic_New_User_Id: { type: 'Compose', runAfter: {}, inputs: '@guid()' },
            Create_Dynamic_User: dPost(SITE_OF("'USER_DIRECTORY'"), LIST_OF("'USER_DIRECTORY'"), createBody, ok('Compose_Dynamic_New_User_Id')),
            Condition_Dynamic_User_Created: { type: 'If', runAfter: { Create_Dynamic_User: ALL }, expression: { and: [{ equals: ["@actions('Create_Dynamic_User')?['status']", 'Succeeded'] }] },
              actions: {
                Create_Dynamic_User_Audit: dAudit({ event: 'user:create-user', action: 'USER_CREATED', process: 'GOVERN', subjectKey: UQK(NEWUID), rootRef: EMAIL, revAfter: '1', runAfter: {} }),
                ...res('Compose_Result_Dynamic_200_User_Created', 200, DATA({ userId: `@${NEWUID}`, created: true, revAfter: 1 }), { Create_Dynamic_User_Audit: ALL }),
              },
              else: { actions: res('Compose_Result_Dynamic_422_User', 422, { code: 'VALUE_REJECTED', message: 'The directory did not accept the new person, so nothing was changed.', operation: `@${DOP}`, recognised: true }) } },
          } },
          Case_User_Change: { case: 'change', actions: {
            ...K.chain(gu),
            Condition_Dynamic_User_Updated: { type: 'If', runAfter: ok('Compose_Updated_Dynamic_User'), expression: { and: [{ equals: ["@outputs('Compose_Updated_Dynamic_User')?['ok']", true] }] },
              actions: {
                Create_Dynamic_User_Change_Audit: dAudit({ event: `user:${'@{' + ACTION + '}'}`.replace('@{', '').replace('}', ''), action: 'USER_CHANGED', process: 'GOVERN', subjectKey: UQK(`${ROW}?['UserId']`), rootRef: EMAIL, revAfter: "outputs('Compose_Updated_Dynamic_User')?['revAfter']", result: `concat(${ACTION},' ',${ROLE})`, runAfter: {} }),
                ...res('Compose_Result_Dynamic_200_User_Changed', 200, DATA({ userId: `@string(${ROW}?['UserId'])`, created: false, previousRole: `@string(${ROW}?['Role'])`, revAfter: "@outputs('Compose_Updated_Dynamic_User')?['revAfter']" }), { Create_Dynamic_User_Change_Audit: ALL }),
              },
              else: { actions: conflict('Compose_Result_Dynamic_409_User', 'Dynamic_User') } },
          } },
        },
        default: { actions: {} } },
    });
    /* The audit event of a change names the action: dAudit writes its event as text, so it is set here as an expression. */
    const chg = sw.cases.Case_Dynamic_UserAdmin.actions.Switch_Dynamic_User_State.cases.Case_User_Change.actions.Condition_Dynamic_User_Updated.actions.Create_Dynamic_User_Change_Audit.inputs.parameters;
    chg['item/Event'] = `@concat('user:',${ACTION})`;
    chg['item/Title'] = `@concat('user:',${ACTION},':',${UQK(`${ROW}?['UserId']`)})`;
    if (opts.only) {
      /* IP_User_Admin_Endpoint carries this operation only: the other cases leave its Switch. */
      for (const k of Object.keys(sw.cases)) if (k !== 'Case_Dynamic_UserAdmin') delete sw.cases[k];
    }
  });


  edit(log, 'The reply (Compose_Outcome) takes the result of whichever new operation ran, as it does for the live ones.', () => {
    const o = locate(A, 'Compose_Outcome').a;
    const tail = "json('{\"status\":500";
    if (!o.inputs.includes(tail)) throw new Error('Compose_Outcome changed in the source');
    const present = names(A);
    o.inputs = o.inputs.replace(tail, `${results.filter((r) => present.has(r)).map((r) => `actions('${r}')?['outputs'],`).join('')}${tail}`);
    /* A step the build removed (IP_User_Admin_Endpoint keeps one operation) is not referenced. */
    if (opts.only) o.inputs = o.inputs.replace(/actions\('([A-Za-z0-9_]+)'\)\?\['outputs'\],/g, (m, n) => (present.has(n) ? m : ''));
  });

  if (!opts.only) edit(log, 'ITEM-25 (owner decision 2026-10-08, on the needs assessment): dispatch, dispatchoutbound and archivereference are served by transitionstatus instead of answering 501. A letter goes out through the DGO Correspondence Mailer; dispatch records the document as Treated (the Status column offers Treated and Not Treated). archivereference records it as Treated and sets its IdState to ARCHIVED (the catalogue\'s lifecycle state), before the unchanged check so an already treated document is still archived. The caller\'s role must allow the dispatch route (dispatch) or the archive route (archive). The audit row names the operation asked for.', () => {
    const RETIRED = ['dispatch', 'dispatchoutbound', 'dispatch-outbound', 'archivereference', 'archive-reference'];
    const inp = G.Compose_Dynamic_Input.inputs;
    if ('retiredOp' in inp || !inp.status || !inp.action) throw new Error('Compose_Dynamic_Input changed in the source');
    const F = (k) => `trim(string(coalesce(if(empty(trim(string(coalesce(triggerBody()?['payload']?['${k}'],'')))),triggerBody()?['${k}'],triggerBody()?['payload']?['${k}']),'')))`;
    const RAW = `toLower(replace(if(empty(${F('operation')}),${F('action')},${F('operation')}),'_','-'))`;
    inp.retiredOp = `@if(contains(createArray(${RETIRED.map((o) => `'${o}'`).join(',')}),${RAW}),replace(${RAW},'-',''),'')`;
    inp.status = `@if(contains(createArray(${RETIRED.map((o) => `'${o}'`).join(',')}),${RAW}),'Treated',${inp.status.slice(1)})`;
    const op = G.Compose_Dynamic_Operation;
    if (!String(op.inputs).includes("if(contains(createArray('transition-status','transitionstatus')")) throw new Error('Compose_Dynamic_Operation changed in the source');
    op.inputs = `@if(not(empty(${DI('retiredOp')})),'transitionstatus',${String(op.inputs).slice(1)})`;
    const route = G.Compose_Dynamic_Required_Route;
    route.inputs = `@if(startsWith(${DI('retiredOp')},'dispatch'),'dispatch',if(startsWith(${DI('retiredOp')},'archive'),'archive',${String(route.inputs).slice(1)}))`;
    const { a: sw } = locate(A, 'Switch_Dynamic_Operation');
    const tcase = Object.values(sw.cases).find((c) => c.case === 'transitionstatus');
    const one = Object.values(tcase.actions.Switch_Dynamic_Status_State.cases).find((c) => c.case === 'one');
    const changed = one.actions.Condition_Dynamic_Status_Changed;
    if (!changed || Object.keys(changed.runAfter || {}).length) throw new Error('transitionstatus one-case shape changed in the source');
    const DOC = "first(coalesce(outputs('Get_Dynamic_Status_Document')?['body/value'],json('[]')))";
    const upd = one.actions.Condition_Dynamic_Status_Changed.else.actions.Update_Dynamic_Status;
    one.actions.Condition_Dynamic_Archive_IdState = { type: 'If', runAfter: {},
      expression: { and: [{ equals: [`@${DI('retiredOp')}`, 'archivereference'] }] },
      actions: { Update_Dynamic_Archive_IdState: { type: 'OpenApiConnection', runAfter: {}, inputs: { host: structuredClone(upd.inputs.host), parameters: {
        dataset: upd.inputs.parameters.dataset, table: upd.inputs.parameters.table, id: `@${DOC}?['ID']`, 'item/Title': `@${DOC}?['Title']`, 'item/IdState/Value': 'ARCHIVED' } } } },
      else: { actions: {} } };
    changed.runAfter = ok('Condition_Dynamic_Archive_IdState');
    const meta = one.actions.Condition_Dynamic_Status_Changed.else.actions.Compose_Dynamic_Status_Meta;
    if (!meta?.inputs || typeof meta.inputs !== 'object') throw new Error('Compose_Dynamic_Status_Meta changed in the source');
    meta.inputs.retiredOperation = `@${DI('retiredOp')}`;
    /* update-status and delete-record have no caller (no Folio, portal or flow source names them): they leave the
       recognised set and are refused as unknown (400), not as recognised-but-unserved (501). */
    const kind = G.Compose_Dynamic_Kind;
    const rec = "createArray('update-status','delete-record','archivereference','dispatch','dispatchoutbound')";
    if (!kind.inputs.includes(rec)) throw new Error('Compose_Dynamic_Kind recognised set changed');
    kind.inputs = kind.inputs.replace(rec, "createArray('archivereference','dispatch','dispatchoutbound')");
    /* user-admin:* is served by IP_User_Admin_Endpoint (USER_ADMIN, owner approval 2026-10-08): here it is unknown (400). */
    const ua = ",startsWith(outputs('Compose_Dynamic_Operation'),'user-admin:')";
    if (!kind.inputs.includes(ua)) throw new Error('Compose_Dynamic_Kind user-admin clause changed');
    kind.inputs = kind.inputs.replace(ua, '');
  });

  if (!opts.only) edit(log, 'Gap found 2026-10-10: a task\'s assignee whose role lacks the My Work route (Read-only Viewer, Executive: 852 of 854 people) could acknowledge a task but never start, update or complete it, because update-task required the orchestrator route at the gate. The gate now lets update-task through for any active role, and the update-task case decides once the task is read: a role with the orchestrator route (or "*") may update any task, as before; anyone else only a task assigned to them, and is refused 403 otherwise.', () => {
    const rr = G.Compose_Dynamic_Required_Route;
    const before = "if(equals(outputs('Compose_Dynamic_Operation'),'update-task'),'orchestrator',";
    if (!String(rr.inputs).includes(before)) throw new Error('Compose_Dynamic_Required_Route no longer maps update-task to orchestrator');
    rr.inputs = String(rr.inputs).replace(before, "if(equals(outputs('Compose_Dynamic_Operation'),'update-task'),'',");
    const sw = locate(A, 'Switch_Dynamic_Operation').a.cases.Case_Dynamic_Update_Task.actions;
    const st = sw.Compose_Dynamic_Task_State;
    const ROWS = "coalesce(outputs('Get_Dynamic_Task')?['body/value'],json('[]'))";
    const want = `@if(equals(length(${ROWS}),1),'one',if(equals(length(${ROWS}),0),'none','many'))`;
    if (st.inputs !== want) throw new Error('Compose_Dynamic_Task_State changed in the source');
    const ROUTES = "string(coalesce(first(coalesce(outputs('Get_Dynamic_Role_Permissions')?['body/value'],json('[]')))?['AllowedRoutesJson'],''))";
    const MINE = `equals(toLower(trim(string(coalesce(first(${ROWS})?['AssignedTo'],'')))),toLower(trim(string(coalesce(outputs('Compose_Dynamic_Input')?['caller'],'')))))`;
    st.inputs = `@if(equals(length(${ROWS}),1),if(or(contains(${ROUTES},'"*"'),contains(${ROUTES},'"orchestrator"'),${MINE}),'one','forbidden'),if(equals(length(${ROWS}),0),'none','many'))`;
    const ts = sw.Switch_Dynamic_Task_State;
    if (ts.cases.Case_Task_Forbidden) throw new Error('Case_Task_Forbidden already exists');
    const msg = 'This task is assigned to someone else, and your role does not allow changing other people\'s tasks.';
    ts.cases.Case_Task_Forbidden = { case: 'forbidden', actions: { Compose_Result_Dynamic_403_Task: { type: 'Compose', runAfter: {}, inputs: {
      status: 403,
      data: { code: 'NOT_PERMITTED', message: msg, operation: "@outputs('Compose_Dynamic_Operation')", referenceId: "@outputs('Compose_Dynamic_Input')?['ref']", recognised: true },
      errors: [{ code: 'NOT_PERMITTED', message: msg }],
      event: 'none',
    } } } };
    const o = locate(A, 'Compose_Outcome').a;
    const tail = "json('{\"status\":500";
    if (!o.inputs.includes(tail)) throw new Error('Compose_Outcome changed in the source');
    o.inputs = o.inputs.replace(tail, `actions('Compose_Result_Dynamic_403_Task')?['outputs'],${tail}`);
  });

  /* ITEM-25 (owner decision 2026-10-10: build them). The Canvas Activities screen's Archive, SIWES and NYSC shortcuts
     (docs/reference/foundational/canvas/Activivities_1_Screen.txt), served as the three steps Folio sends
     (config/dynamic-actions.config.js): create-queue-record, set-reference-id, update-activity. */
  /* DYNAMIC_ACTIONS is at the service's 500-action limit (live read 2026-10-10: 495), so the lifecycle has a flow of its own,
     IP_Activity_Lifecycle_Endpoint (ACTIVITY_LIFECYCLE), as user-admin did on 2026-10-08 (524 actions refused). */
  if (!opts.only) edit(log, 'ITEM-25: the activity lifecycle steps (activity-archive, activity-siwes, activity-nysc :create-queue-record, :set-reference-id, :update-activity) are served by IP_Activity_Lifecycle_Endpoint (ACTIVITY_LIFECYCLE); here they are refused as unknown (400), not as recognised-but-unserved (501).', () => {
    const kind = G.Compose_Dynamic_Kind;
    const clause = ",startsWith(outputs('Compose_Dynamic_Operation'),'activity-')";
    if (!kind.inputs.includes(clause)) throw new Error('Compose_Dynamic_Kind activity clause changed');
    kind.inputs = kind.inputs.replace(clause, '').replace("if(or(contains(createArray('archivereference','dispatch','dispatchoutbound'),outputs('Compose_Dynamic_Operation'))),", "if(contains(createArray('archivereference','dispatch','dispatchoutbound'),outputs('Compose_Dynamic_Operation')),");
  });
  if (opts.activity) edit(log, 'ITEM-25 (owner decision 2026-10-10): activity-archive, activity-siwes and activity-nysc are served, as the Canvas Activities screen did them, in the three steps Folio sends. The activity is read from DGO DIGITAL OPS by its item ID (404 if absent). create-queue-record writes a Global Tracking Queue row built from that activity, not from the request: Title, ActivityTrackingID (its RefIDD), RefIDD and RefIDDN (its ID), AttachmentLink, StartDate, DueDate and Acknowledgement Due Date today, AssignedBy DGS OFFICE, AssignedTo dgs@NITDA.gov.ng, Status Completed, Priority Low, NVERSE DGOFASTTRACK, Category (Archived, Internships (SIWES) or Internships (NYSC)), EntityKey and IdState ACTIVE, and answers its ID. set-reference-id reads that queue row back and refuses (409) one that is not this activity\'s DGOFASTTRACK row of that category, then sets Reference_ID to yyyyMMdd(tomorrow, WAT)-<activity ID>-<UNC | INT-SIWES | INT-NYSC>-<queue ID>, computed here. update-activity marks the activity Treated, AssignmentStatus Processed (the list offers Processed and Pending; Canvas wrote Assigned), AssignedTo dgs@NITDA.gov.ng and the category. Each step writes an audit event carrying its result, so a repeated request returns the first result (T11). The caller\'s role must allow the activities route.', () => {
    const LC = { archive: { suffix: 'UNC', category: 'Archived' }, siwes: { suffix: 'INT-SIWES', category: 'Internships (SIWES)' }, nysc: { suffix: 'INT-NYSC', category: 'Internships (NYSC)' } };
    const STEPS = ['create-queue-record', 'set-reference-id', 'update-activity'];
    const OPS = Object.keys(LC).flatMap((t) => STEPS.map((s) => `activity-${t}:${s}`));
    const inp = G.Compose_Dynamic_Input.inputs;
    const F = (k) => `trim(string(coalesce(if(empty(trim(string(coalesce(triggerBody()?['payload']?['${k}'],'')))),triggerBody()?['${k}'],triggerBody()?['payload']?['${k}']),'')))`;
    for (const k of ['activityId', 'queueRecordId']) { if (k in inp) throw new Error(`Compose_Dynamic_Input already reads ${k}`); inp[k] = `@${F(k)}`; }
    const RAWOP = `replace(if(empty(${DI('operation')}),${DI('action')},${DI('operation')}),'_','-')`;
    const op = G.Compose_Dynamic_Operation;
    op.inputs = `@if(contains(${jlit(OPS)},${RAWOP}),'activity-lifecycle',${String(op.inputs).slice(1)})`;
    const kind = G.Compose_Dynamic_Kind;
    if (!kind.inputs.startsWith("@if(contains(createArray('update','update-task',")) throw new Error('Compose_Dynamic_Kind changed in the source');
    kind.inputs = `@if(equals(${DOP},'activity-lifecycle'),'implemented',${kind.inputs.slice(1)})`;
    const route = G.Compose_Dynamic_Required_Route;
    route.inputs = `@if(equals(${DOP},'activity-lifecycle'),'activities',${String(route.inputs).slice(1)})`;
    const DIGITS = (x) => `and(not(empty(${x})),less(length(${x}),10),empty(${'0123456789'.split('').reduce((acc, d) => `replace(${acc},'${d}','')`, x)}))`;
    const inv = G.Compose_Dynamic_Invalid;
    inv.inputs = `@if(and(equals(${DOP},'activity-lifecycle'),not(${DIGITS(DI('activityId'))})),'An activity step needs activityId, the activity\'\'s item ID.',if(and(equals(${DOP},'activity-lifecycle'),endsWith(${RAWOP},':set-reference-id'),not(${DIGITS(DI('queueRecordId'))})),'set-reference-id needs queueRecordId, the queue record\'\'s item ID.',${opts.only ? "''" : inv.inputs.slice(1)}))`;

    const sw = locate(A, 'Switch_Dynamic_Operation').a;
    const flag = locate(A, 'Update_Dynamic_Flag').a, getDoc = locate(A, 'Get_Dynamic_Document').a;
    if (flag.inputs.host.operationId !== 'PatchItem' || getDoc.inputs.host.operationId !== 'GetItems') throw new Error('the activity steps\' connector shapes changed');
    const SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
    const sp = (operationId, parameters, runAfter = {}) => ({ type: 'OpenApiConnection', runAfter, inputs: { host: { ...getDoc.inputs.host, operationId }, parameters } });
    const L = (k) => `outputs('Compose_Dynamic_Lifecycle')?['${k}']`;
    const ACT = "first(coalesce(outputs('Get_Dynamic_Lifecycle_Activity')?['body/value'],json('[]')))";
    const QROW = "first(coalesce(outputs('Get_Dynamic_Lifecycle_Queue')?['body/value'],json('[]')))";
    const SUBJ = `concat('OPS:',${L('activityId')})`;
    const TODAY = "formatDateTime(convertFromUtc(utcNow(),'W. Central Africa Standard Time'),'yyyy-MM-dd')";
    const base = (extra) => ({ operation: `@${DOP}`, lifecycleOperation: `@${L('operation')}`, activityId: `@${L('activityId')}`, recognised: true, replayed: false, ...extra });
    const audit = (name, event, action, result, runAfter) => ({ [name]: dAudit({ event, action, process: 'ACTION', subjectKey: SUBJ, rootRef: `string(coalesce(${ACT}?['ReferenceId'],''))`, result, runAfter }) });
    const fail = (name, status, code, message) => res(name, status, { code, message, operation: `@${DOP}`, lifecycleOperation: `@${L('operation')}`, recognised: true }, {}, [{ code, message }]);

    sw.cases.Case_Dynamic_Activity_Lifecycle = { case: 'activity-lifecycle', actions: {
      Compose_Dynamic_Lifecycle: { type: 'Compose', runAfter: {}, inputs: {
        operation: `@${RAWOP}`,
        type: `@last(split(first(split(${RAWOP},':')),'-'))`,
        step: `@last(split(${RAWOP},':'))`,
        activityId: `@${DI('activityId')}`,
        queueRecordId: `@${DI('queueRecordId')}`,
        category: `@string(coalesce(${jlit(Object.fromEntries(Object.entries(LC).map(([k, v]) => [k, v.category])))}?[last(split(first(split(${RAWOP},':')),'-'))],''))`,
        suffix: `@string(coalesce(${jlit(Object.fromEntries(Object.entries(LC).map(([k, v]) => [k, v.suffix])))}?[last(split(first(split(${RAWOP},':')),'-'))],''))`,
      } },
      Get_Dynamic_Lifecycle_Activity: sp('GetItems', { dataset: SITE, table: OPS_LIST, $filter: `@concat('ID eq ',${L('activityId')})`, $top: 1 }, ok('Compose_Dynamic_Lifecycle')),
      Switch_Dynamic_Lifecycle_Step: { type: 'Switch', runAfter: ok('Get_Dynamic_Lifecycle_Activity'),
        expression: `@if(empty(coalesce(outputs('Get_Dynamic_Lifecycle_Activity')?['body/value'],json('[]'))),'missing',${L('step')})`,
        cases: {
          Case_Lifecycle_Missing: { case: 'missing', actions: fail('Compose_Result_Dynamic_404_Lifecycle', 404, 'TARGET_NOT_FOUND', 'No activity has that item ID.') },
          Case_Lifecycle_Create: { case: 'create-queue-record', actions: {
            Create_Dynamic_Lifecycle_Queue: sp('PostItem', { dataset: SITE, table: GTQ,
              'item/Title': `@string(${ACT}?['Title'])`, 'item/ActivityTrackingID': `@string(coalesce(${ACT}?['RefIDD'],''))`,
              'item/StartDate': `@${TODAY}`, 'item/AttachmentLink': `@string(coalesce(${ACT}?['AttachmentLink'],''))`,
              'item/AssignedBy': 'DGS OFFICE', 'item/RefIDD': `@string(${ACT}?['ID'])`, 'item/AssignedTo': 'dgs@NITDA.gov.ng', 'item/RefIDDN': `@string(${ACT}?['ID'])`,
              'item/Progress/Value': 'Completed', 'item/Priority/Value': 'Low', 'item/Acknowledgement_x0020_Due_x0020_': `@${TODAY}`, 'item/DueDate': `@${TODAY}`,
              'item/NVERSE': 'DGOFASTTRACK', 'item/Classification': `@${L('category')}`, 'item/EntityKey': '@guid()', 'item/IdState/Value': 'ACTIVE' }),
            Compose_Dynamic_Lifecycle_Create_Data: { type: 'Compose', runAfter: ok('Create_Dynamic_Lifecycle_Queue'), inputs: base({ ID: "@outputs('Create_Dynamic_Lifecycle_Queue')?['body/ID']", category: `@${L('category')}` }) },
            ...audit('Create_Dynamic_Lifecycle_Create_Audit', 'activity:queued', 'ROUTED', "outputs('Compose_Dynamic_Lifecycle_Create_Data')", ok('Compose_Dynamic_Lifecycle_Create_Data')),
            ...res('Compose_Result_Dynamic_200_Lifecycle_Create', 200, "@outputs('Compose_Dynamic_Lifecycle_Create_Data')", { Create_Dynamic_Lifecycle_Create_Audit: ALL }),
            ...{ Compose_Result_Dynamic_422_Lifecycle_Create: { ...dResult(422, { code: 'VALUE_REJECTED', message: 'The task list did not accept the queue record, so nothing was changed.', operation: `@${DOP}`, recognised: true }, { Create_Dynamic_Lifecycle_Queue: ['Failed', 'TimedOut'] }) } },
          } },
          Case_Lifecycle_Reference: { case: 'set-reference-id', actions: {
            Get_Dynamic_Lifecycle_Queue: sp('GetItems', { dataset: SITE, table: GTQ, $filter: `@concat('ID eq ',${L('queueRecordId')})`, $top: 1 }),
            Compose_Dynamic_Lifecycle_Reference: { type: 'Compose', runAfter: ok('Get_Dynamic_Lifecycle_Queue'),
              inputs: `@concat(formatDateTime(addDays(convertFromUtc(utcNow(),'W. Central Africa Standard Time'),1),'yyyyMMdd'),'-',${L('activityId')},'-',${L('suffix')},'-',${L('queueRecordId')})` },
            Condition_Dynamic_Lifecycle_Queue_Matches: { type: 'If', runAfter: ok('Compose_Dynamic_Lifecycle_Reference'),
              expression: { and: [
                { equals: [`@string(coalesce(${QROW}?['NVERSE'],''))`, 'DGOFASTTRACK'] },
                { equals: [`@string(coalesce(${QROW}?['RefIDD'],''))`, `@${L('activityId')}`] },
                { equals: [`@string(coalesce(${QROW}?['Classification'],''))`, `@${L('category')}`] },
              ] },
              actions: {
                Update_Dynamic_Lifecycle_Reference: sp('PatchItem', { dataset: SITE, table: GTQ, id: `@${L('queueRecordId')}`, 'item/Reference_ID': "@outputs('Compose_Dynamic_Lifecycle_Reference')" }),
                Compose_Dynamic_Lifecycle_Reference_Data: { type: 'Compose', runAfter: ok('Update_Dynamic_Lifecycle_Reference'), inputs: base({ ID: `@int(${L('queueRecordId')})`, Reference_ID: "@outputs('Compose_Dynamic_Lifecycle_Reference')" }) },
                ...audit('Create_Dynamic_Lifecycle_Reference_Audit', 'activity:reference-set', 'UPDATED', "outputs('Compose_Dynamic_Lifecycle_Reference_Data')", ok('Compose_Dynamic_Lifecycle_Reference_Data')),
                ...res('Compose_Result_Dynamic_200_Lifecycle_Reference', 200, "@outputs('Compose_Dynamic_Lifecycle_Reference_Data')", { Create_Dynamic_Lifecycle_Reference_Audit: ALL }),
              },
              else: { actions: fail('Compose_Result_Dynamic_409_Lifecycle_Queue', 409, 'QUEUE_RECORD_MISMATCH', 'That queue record is not this activity\'s routing record.') } },
          } },
          Case_Lifecycle_Update: { case: 'update-activity', actions: {
            Update_Dynamic_Lifecycle_Activity: sp('PatchItem', { dataset: SITE, table: OPS_LIST, id: `@${ACT}?['ID']`, 'item/Title': `@${ACT}?['Title']`,
              'item/Status/Value': 'Treated', 'item/AssignmentStatus/Value': 'Processed', 'item/AssignedTo': 'dgs@NITDA.gov.ng', 'item/Category0': `@${L('category')}` }),
            Compose_Dynamic_Lifecycle_Update_Data: { type: 'Compose', runAfter: ok('Update_Dynamic_Lifecycle_Activity'), inputs: base({ changed: { status: 'Treated', assignmentStatus: 'Processed', assignedTo: 'dgs@NITDA.gov.ng', category: `@${L('category')}` } }) },
            ...audit('Create_Dynamic_Lifecycle_Update_Audit', 'activity:treated', 'UPDATED', "outputs('Compose_Dynamic_Lifecycle_Update_Data')", ok('Compose_Dynamic_Lifecycle_Update_Data')),
            ...res('Compose_Result_Dynamic_200_Lifecycle_Update', 200, "@outputs('Compose_Dynamic_Lifecycle_Update_Data')", { Create_Dynamic_Lifecycle_Update_Audit: ALL }),
            ...{ Compose_Result_Dynamic_422_Lifecycle_Update: { ...dResult(422, { code: 'VALUE_REJECTED', message: 'The activity list did not accept the change, so nothing was changed.', operation: `@${DOP}`, recognised: true }, { Update_Dynamic_Lifecycle_Activity: ['Failed', 'TimedOut'] }) } },
          } },
        },
        default: { actions: {} } },
    } };
    const o = locate(A, 'Compose_Outcome').a;
    const tail = "json('{\"status\":500";
    if (!o.inputs.includes(tail)) throw new Error('Compose_Outcome changed in the source');
    const mine = ['Compose_Result_Dynamic_404_Lifecycle', 'Compose_Result_Dynamic_200_Lifecycle_Create', 'Compose_Result_Dynamic_422_Lifecycle_Create', 'Compose_Result_Dynamic_200_Lifecycle_Reference', 'Compose_Result_Dynamic_409_Lifecycle_Queue', 'Compose_Result_Dynamic_200_Lifecycle_Update', 'Compose_Result_Dynamic_422_Lifecycle_Update'];
    o.inputs = o.inputs.replace(tail, `${mine.map((r) => `actions('${r}')?['outputs'],`).join('')}${tail}`);
    if (opts.only) {
      /* IP_Activity_Lifecycle_Endpoint carries this operation only: the others leave its Switch and are refused as unknown. */
      for (const k of Object.keys(sw.cases)) if (k !== 'Case_Dynamic_Activity_Lifecycle') delete sw.cases[k];
      kind.inputs = `@if(equals(${DOP},'activity-lifecycle'),'implemented','unknown')`;
      const present = names(A);
      o.inputs = o.inputs.replace(/actions\('([A-Za-z0-9_]+)'\)\?\['outputs'\],/g, (m, n) => (present.has(n) ? m : ''));
    }
  });
}

/* ---------------------------------------------------------------- LIBRARY INTAKE */
/**
 * DGSO INCOMING AI PROCESSING (b6d92bae): the watched-library channel (catalogue channel "library"). A file dropped in
 * the routing library is copied, shared and given a DGO DIGITAL OPS row (Preliminaries_and_Backup), then read by the AI
 * steps. Phase 4 gives the record its identity at that point (S7: one Intake Register for every channel), and removes
 * the AI service keys from the flow definition.
 */
const LIB_CAPTURE = '_DGSO_INCOMING_AI_PROCESSING__';
const OPS_LIST = '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3';
function captureConnections(pkg, capturePrefix) {
  const dir = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures');
  const d = JSON.parse(readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith(capturePrefix))), 'utf8').replace(/^﻿/, ''));
  const conn = {}; for (const c of d.ConnectionReferences || []) conn[c.id] = conn[c.id] || c.connectionName;
  const all = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'OpenApiConnection') {
      const api = a.inputs.host.apiId;
      if (!conn[api]) throw new Error(`${capturePrefix}: no ${api} connection`);
      all[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${conn[api]}` }, connectionName: conn[api] }, referenceKey: a.inputs.host.connection };
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
  } };
  walk(pkg.serializedValue.actions);
  return all;
}
const CFG_GET = (name, filter) => ({ type: 'OpenApiConnection', runAfter: {}, inputs: {
  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
  parameters: { dataset: CONFIG_SITE, table: '9bc168c3-06e5-4d58-982b-0df06205fd35', $filter: filter, $top: 5 } } });

function libraryReferences(pkg, log) {
  const A = pkg.serializedValue.actions;
  edit(log, 'Security: the flow held three Google AI API keys as literal text (Compose_API_Key, Compose_API_Key_2 and Compose_API_Key_kanihamza@gmail.com__v2), so every copy of its definition carried them, this repository\'s capture included. They are now read from Flow Configuration: GEMINI_API_KEY, and GEMINI_API_KEY_2 for the second key the text extraction uses (GEMINI_API_KEY when that row is absent). The step names are unchanged, so the AI calls that read them need no change. The keys that were in the definition are exposed and are to be revoked in Google Cloud and replaced (readiness register).', () => {
    const keys = ['Compose_API_Key', 'Compose_API_Key_2', 'Compose_API_Key_kanihamza@gmail.com__v2'];
    /* The repository's capture holds the keys redacted (ITEM-72); the tenant's copy holds them as text. Either way the step is a literal. */
    for (const k of keys) if (!/^(AIza[0-9A-Za-z_-]{30,}|REDACTED)$/.test(String(A[k]?.inputs))) throw new Error(`${k} no longer holds a literal key`);
    const first = Object.entries(A).find(([, a]) => !a.runAfter || !Object.keys(a.runAfter).length)[0];
    A.Get_Gemini_Keys = CFG_GET('Get_Gemini_Keys', "Title eq 'GEMINI_API_KEY' or Title eq 'GEMINI_API_KEY_2'");
    /* Select the value by title without Filter array: each row maps to its value when its title matches, else ''. */
    A.Select_Gemini_Key_1 = { type: 'Select', runAfter: ok('Get_Gemini_Keys'), inputs: { from: "@coalesce(outputs('Get_Gemini_Keys')?['body/value'],json('[]'))", select: "@if(equals(trim(string(item()?['Title'])),'GEMINI_API_KEY'),trim(string(coalesce(item()?['ConfigValue'],''))),'')" } };
    A.Select_Gemini_Key_2 = { type: 'Select', runAfter: ok('Select_Gemini_Key_1'), inputs: { from: "@coalesce(outputs('Get_Gemini_Keys')?['body/value'],json('[]'))", select: "@if(equals(trim(string(item()?['Title'])),'GEMINI_API_KEY_2'),trim(string(coalesce(item()?['ConfigValue'],''))),'')" } };
    A[first].runAfter = ok('Select_Gemini_Key_2');
    const K1 = "join(body('Select_Gemini_Key_1'),'')";
    A.Compose_API_Key.inputs = `@${K1}`;
    A.Compose_API_Key_2.inputs = `@if(empty(join(body('Select_Gemini_Key_2'),'')),${K1},join(body('Select_Gemini_Key_2'),''))`;
    A['Compose_API_Key_kanihamza@gmail.com__v2'].inputs = `@${K1}`;
  });
}

function libraryIdentity(log, { copy = 'CREATE_COPY_OF_TRIGGER_DOCUMENT' } = {}) {
  const COPY = `body('${copy}')`;
  const ROW = "body('CREATE_MAIN_ITEM_IN_DDOPS')";
  const A = {};
  edit(log, 'S7 / §8.2: every document the library intake takes in becomes a registered record, as a portal submission or a scan does. After the DGO DIGITAL OPS row is created, the scope claims the next NITDA-YYYY-NNNNN (the kit claim, floored at the register\'s highest number) and writes the Portal Registry row: Title and ReferenceId, Subject the file name, Channel library, CorrespondenceType Incoming, SenderEmail the registry mailbox (Flow Configuration NOTIFY_REGISTRY_TO, else dgsregistry@nitda.gov.ng, as for scans), Status received, AttachmentCount 1, EntityKey, IdState ACTIVE, Rev 1, Direction In, CorrelationId and CreatedByRequest, and SourceLocator spo:<DGO DIGITAL OPS>/<item ID>.', () => {
    Object.assign(A, K.chain(
      { Compose_Request_Context: { type: 'Compose', inputs: { requestId: '@guid()', runName: "@workflow()?['run']?['name']", receivedAtUtc: '@utcNow()' } } },
      K.readDatasetBindings({ keys: ['INTAKE_REGISTER', 'SEQUENCE_COUNTERS', 'IDENTITY_MAP', 'OPS_WORKING_REGISTER'], configSite: CONFIG_SITE }),
      K.environmentPrefix(),
      { Get_Library_Registry_Mailbox: CFG_GET('Get_Library_Registry_Mailbox', "Title eq 'NOTIFY_REGISTRY_TO'") },
      { Compose_Library_Sender: { type: 'Compose', inputs: "@if(empty(toLower(trim(string(coalesce(first(coalesce(outputs('Get_Library_Registry_Mailbox')?['body/value'],json('[]')))?['ConfigValue'],''))))),'dgsregistry@nitda.gov.ng',toLower(trim(string(first(outputs('Get_Library_Registry_Mailbox')?['body/value'])?['ConfigValue']))))" } },
      K.entityKey('Record'),
      K.claimReference({ tag: 'Registry', prefix: 'NITDA', floor: { dataset: 'INTAKE_REGISTER', column: 'ReferenceId' } }),
    ));
  });
  const REF = "string(coalesce(first(outputs('Compose_Claim_Registry')?['references']),''))";
  const RECK = "outputs('Compose_EntityKey_Record')";
  const RQ = "outputs('Compose_Request_Context')?['requestId']";
  const SENDER = "outputs('Compose_Library_Sender')";
  edit(log, '§10.2 OPS_WORKING_REGISTER: the DGO DIGITAL OPS row gets the record\'s EntityKey, ReferenceId and IdState ACTIVE by the kit\'s Guarded Update (IF-MATCH; the list has no Rev column). DGO_IdentityMap gets the row as the record\'s SPO_ITEM locator: Container the DGO DIGITAL OPS list, Value the item ID, MatchKey LOCATOR|SPO_ITEM|<list>|<ID>. If the register row cannot be written, a VOID row accounts for the number (Q2) and the DGO DIGITAL OPS row is left without a key. If no number can be claimed, nothing is written. Either way the scope ends Succeeded, so the AI processing that follows runs as before.', () => {
    const gu = K.guardedUpdate({ tag: 'Library_Row', dataset: 'OPS_WORKING_REGISTER', itemId: `@{${ROW}?['ID']}`, changes: K.bodyExpr({ EntityKey: `@{${RECK}}`, ReferenceId: `@{${REF}}`, IdState: 'ACTIVE' }).slice(1), revIf: 'false' });
    A.Condition_Library_Claimed = {
      type: 'If', runAfter: ok('Compose_Claim_Registry'),
      expression: { and: [{ equals: ["@outputs('Compose_Claim_Registry')?['ok']", true] }] },
      actions: {
        Create_Library_Record: { type: 'OpenApiConnection', runAfter: {}, inputs: {
          host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
          parameters: {
            dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS', table: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667',
            'item/Title': `@${REF}`, 'item/ReferenceId': `@${REF}`,
            'item/Subject': `@substring(string(coalesce(${COPY}?['Name'],'Library document')),0,min(255,length(string(coalesce(${COPY}?['Name'],'Library document')))))`,
            'item/Channel': 'library', 'item/CorrespondenceType': 'Incoming', 'item/SenderEmail': `@${SENDER}`,
            'item/Status/Value': 'received', 'item/StatusLabel': 'Received', 'item/AttachmentCount': 1,
            'item/SubmittedAtUtc': '@utcNow()', 'item/UpdatedAtUtc': '@utcNow()', 'item/ActionRequired': false,
            'item/EntityKey': `@${RECK}`, 'item/IdState/Value': 'ACTIVE', 'item/Rev': 1, 'item/Direction/Value': 'In',
            'item/CorrelationId': `@${RQ}`, 'item/CreatedByRequest': `@${RQ}`,
            'item/SourceLocator': `@concat('spo:${OPS_LIST}/',string(${ROW}?['ID']))`,
          } } },
        ...K.voidRow({ tag: 'Library', dataset: 'INTAKE_REGISTER', referenceColumn: 'ReferenceId', reference: `@{${REF}}`, reason: 'RECORD_WRITE_FAILED', fields: { Title: 'VOID', Status: 'void', SenderEmail: `@{${SENDER}}` } }),
        ...K.chain(gu),
        ...idEntry('Library_Locator', { entryKind: 'LOCATOR', kind: "'SPO_ITEM'", container: `'${OPS_LIST}'`, value: `string(${ROW}?['ID'])`, entityRef: `concat('REC:',${RECK})`, system: "'sharepoint'", when: 'true', runAfter: ok('Create_Library_Record') }),
      },
      else: { actions: {} },
    };
    const c = A.Condition_Library_Claimed.actions;
    c.Create_Void_Library.runAfter = { Create_Library_Record: ['Failed', 'TimedOut'] };
    c[Object.keys(gu)[0]].runAfter = ok('Create_Library_Record');
    A.Compose_Library_Identity = { type: 'Compose', runAfter: { Condition_Library_Claimed: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] }, inputs: {
      referenceId: `@if(equals(actions('Create_Library_Record')?['status'],'Succeeded'),${REF},'')`,
      entityKey: `@if(equals(actions('Create_Library_Record')?['status'],'Succeeded'),${RECK},'')`,
      rowKeyed: "@equals(outputs('Compose_Updated_Library_Row')?['ok'],true)",
      locator: "@or(equals(actions('Create_Library_Locator')?['status'],'Succeeded'),not(empty(coalesce(body('Get_MatchKey_Library_Locator')?['value'],json('[]')))))",
    } };
  });
  const pkg = { nodeId: 'Scope_Library_Identity', serializedValue: { type: 'Scope', actions: A, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  pkg.allConnectionData = captureConnections(pkg, LIB_CAPTURE);
  return pkg;
}

/* ---------------------------------------------------------------- SCAN_PROCESSING (ITEM-80) */
/* Owner direction (2026-10-06, 2026-10-07): DGSO INCOMING AI PROCESSING is not patched; it is rebuilt in the flow the owner
   created for it, Folio_Incoming_Correspondence_Scan_Processing_Flow (197527c8). Its trigger watches /E-DOCUMENT STATION, where
   the scanner saves (owner, 2026-10-16; the registry OneDrive's /Scans/Incoming cannot issue edit links, see ITEM-80).
   The rebuild is the legacy flow's own logic, from its tenant capture, with only what the new design requires changed.
   The flow's variable declarations stay at the top level (SCAN_DECLARATIONS); everything else is this one scope. */
const SCAN_FLOW = '197527c8-e76c-4f7d-81b8-3cb5c88b1c6c';
let SCAN_DECLARATIONS = {};
function scanProcessing(log) {
  const dir = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures');
  const cap = JSON.parse(readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith(LIB_CAPTURE))), 'utf8').replace(/^﻿/, ''));
  const legacy = structuredClone(cap.Definition.actions);
  const META = 'Get_Trigger_Document_Metadata';
  const FOLDER = "substring(triggerBody()?['Path'],0,add(lastIndexOf(triggerBody()?['Path'],'/'),1))";
  const ROWID = "body('CREATE_MAIN_ITEM_IN_DDOPS')?['ID']";
  let text = JSON.stringify(legacy);
  edit(log, 'Trigger: the OneDrive trigger reports a file\'s properties, not its content (When a file is created (properties only), split per file). Get_Trigger_Document_Content reads the content first, and every reference to the old trigger reads the new one: the content from Get_Trigger_Document_Content, the file id and name from the trigger\'s Id and Name, the folder from its Path.', () => {
    text = text
      .split("base64ToString(triggerOutputs()?['headers/x-ms-file-name-encoded'])").join("triggerBody()?['Name']")
      .split("decodeBase64(triggerOutputs()?['headers/x-ms-file-name-encoded'])").join("triggerBody()?['Name']")
      .split("triggerOutputs()?['headers/x-ms-file-name-encoded']").join("triggerBody()?['Name']")
      .split("triggerOutputs()?['headers/x-ms-file-id']").join("triggerBody()?['Id']")
      .split("triggerOutputs()?['body/{Path}']").join(FOLDER)
      .split("triggerOutputs()?['body/RefIDD']").join(ROWID)
      .split("triggerOutputs()?['body/ID']").join(ROWID)
      .split("triggerOutputs()?['body/Title']").join("variables('New File Name')")
      .split("triggerOutputs()?['body/Category/Value']").join("''")
      .split("triggerOutputs()?['body']").join("body('Get_Trigger_Document_Content')");
    if (/triggerOutputs\(\)/.test(text)) throw new Error('scan processing: a reference to the old trigger remains');
  });
  edit(log, 'One account: the legacy flow spread its work over three OneDrive and two SharePoint connections, some signed in as other people. Every OneDrive step uses the flow\'s own OneDrive connection (dgsRegistry@nitda.gov.ng) and every SharePoint step the registry\'s SharePoint connection (3f1943c5).', () => {
    text = text.replace(/shared_onedriveforbusiness_\d/g, 'shared_onedriveforbusiness').replace(/shared_sharepointonline_\d/g, 'shared_sharepointonline').replace(/shared_office365-\d/g, 'shared_office365');
  });
  const A = JSON.parse(text);
  const all = {}; const index = (o, parent) => { for (const [n, a] of Object.entries(o || {})) { all[n] = { a, parent: o }; index(a.actions, a); if (a.else) index(a.else.actions, a); } };
  index(A);
  const drop = (name) => { const { a, parent } = all[name]; for (const b of Object.values(parent)) if (b.runAfter?.[name]) { const r = { ...b.runAfter }; delete r[name]; b.runAfter = { ...r, ...(a.runAfter || {}) }; } delete parent[name]; };
  edit(log, 'No copy to another person\'s OneDrive: the legacy flow copied each document to "/2024 DOCUMENTS/Documente Volume II" in a second account and renamed that copy. The document stays where it arrived and is renamed there (Rename_Trigger_File*); CREATE_COPY_OF_TRIGGER_DOCUMENT becomes Get_Trigger_Document_Metadata, which reads the same Id, Name and DisplayName of the file itself, and the steps that moved the copy are removed.', () => {
    const c = all.CREATE_COPY_OF_TRIGGER_DOCUMENT;
    c.parent[META] = { ...c.a, inputs: { host: c.a.inputs.host, method: 'get', path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['Id']))}", authentication: c.a.inputs.authentication } };
    delete c.parent.CREATE_COPY_OF_TRIGGER_DOCUMENT;
    let t = JSON.stringify(A).split("'CREATE_COPY_OF_TRIGGER_DOCUMENT'").join(`'${META}'`).split('"CREATE_COPY_OF_TRIGGER_DOCUMENT"').join(`"${META}"`);
    Object.keys(A).forEach((k) => delete A[k]); Object.assign(A, JSON.parse(t));
    Object.keys(all).forEach((k) => delete all[k]); index(A);
    for (const n of Object.keys(all).filter((n) => /^Move_or_rename_a_file/.test(n))) drop(n);
  });
  edit(log, 'No flow definition by e-mail: Scope_Flow_Definition_Email read the flow\'s own definition and mailed it on every run (ITEM-52\'s surplus pattern). It is removed with its Flow management connection; nothing else read it.', () => { delete A.Scope_Flow_Definition_Email; });
  edit(log, 'Deep links: APP_FAST_TRACK_LINK points at the internal platform, not the retired Power Apps player, and Set_variable_Deeplink / Set_variable_Deeplink_2 lose the stray "veggie " suffix the legacy flow appended to every link (the fix npm run deeplinks:patches gave for the legacy flow).', () => {
    const link = "@{outputs('APP_FAST_TRACK_LINK')}@{body('CREATE_MAIN_ITEM_IN_DDOPS')?['ID']}";
    if (!all.APP_FAST_TRACK_LINK) throw new Error('scan processing: APP_FAST_TRACK_LINK not found');
    all.APP_FAST_TRACK_LINK.a.inputs = `${DeepLinkConfig.productionBase}?DGOPID=`;
    for (const n of ['Set_variable_Deeplink', 'Set_variable_Deeplink_2']) {
      if (!all[n]) throw new Error(`scan processing: ${n} not found`);
      all[n].a.inputs.value = link;
    }
  });
  libraryReferences({ serializedValue: A.Scope_References }, log);
  SCAN_DECLARATIONS = Object.fromEntries(Object.entries(A).filter(([, a]) => a.type === 'InitializeVariable'));
  for (const n of Object.keys(SCAN_DECLARATIONS)) delete A[n];
  edit(log, `Placement: the flow\'s six variable declarations stay at the top level (${Object.keys(SCAN_DECLARATIONS).join(', ')}); the rest of the legacy flow is one scope, Scope_Scan_Processing, which starts by reading the document's content.`, () => {
    for (const a of Object.values(A)) if (a.runAfter) for (const k of Object.keys(a.runAfter)) if (SCAN_DECLARATIONS[k]) delete a.runAfter[k];
    const host = { connection: { name: "@parameters('$connections')['shared_onedriveforbusiness']['connectionId']" } };
    A.Get_Trigger_Document_Content = { type: 'ApiConnection', runAfter: {}, inputs: { host, method: 'get', path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['Id']))}/content", queries: { inferContentType: true }, authentication: "@parameters('$authentication')" } };
    for (const [n, a] of Object.entries(A)) if (n !== 'Get_Trigger_Document_Content' && (!a.runAfter || !Object.keys(a.runAfter).length)) a.runAfter = ok('Get_Trigger_Document_Content');
  });
  const id = libraryIdentity(log, { copy: META });
  edit(log, 'S7 / §8.2: Scope_Library_Identity (the registry record, its NITDA-YYYY-NNNNN and its DGO_IdentityMap locator, as designed for the legacy flow) runs after Preliminaries_and_Backup has created the DGO DIGITAL OPS row; Scope_Processing runs after it, whatever it ends.', () => {
    A.Scope_Library_Identity = { ...id.serializedValue, runAfter: ok('Preliminaries_and_Backup') };
    A.Scope_Processing.runAfter = { Scope_Library_Identity: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] };
  });
  const pkg = { nodeId: 'Scope_Scan_Processing', serializedValue: { type: 'Scope', actions: A, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  pkg.allConnectionData = {};
  const conn = { '/providers/Microsoft.PowerApps/apis/shared_sharepointonline': SP_CONNECTION, '/providers/Microsoft.PowerApps/apis/shared_office365': REGISTRY_MAIL_CONNECTION };
  const walkc = (o) => { for (const [n, a] of Object.entries(o || {})) { if (a.type === 'OpenApiConnection') { const api = a.inputs.host.apiId; if (!conn[api]) throw new Error(`scan processing: no connection for ${api}`); pkg.allConnectionData[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${conn[api]}` }, connectionName: conn[api] }, referenceKey: a.inputs.host.connection || a.inputs.host.connectionName }; } walkc(a.actions); if (a.else) walkc(a.else.actions); } };
  walkc(A);
  return pkg;
}

/* ---------------------------------------------------------------- FAILURE_WATCH (owner decision 2026-10-18) */
/* Every failed notice is registered (its receipt, Status failed); only some are reported. Folio_Failure_Watch, a flow
   created for it, runs hourly in working hours (scripts/write-failure-watch-flow.mjs writes its Recurrence trigger and
   this scope). It reads the failures registered since its last run, places each in a group
   (config/notification-failure-groups.config.js), reports the reportable ones to the registry once, reports a burst as a
   broken mail connection, and at 07:00 sends the summary of every failure still open. It writes the open count per group
   to Flow Configuration NOTIFY_FAILURE_HEALTH, which FETCH_ALL returns to the Workspace's System Health. */
const WATCH_CFG_T = '9bc168c3-06e5-4d58-982b-0df06205fd35';
const RECEIPTS_LIST = { site: 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre', table: '88a81ca1-319a-45f5-8409-f91a24538ffa' };
function failureWatch(log) {
  const SP = (operationId) => ({ apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId });
  const ESC = (v) => `replace(replace(replace(replace(replace(string(${v}),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')`;
  const V = (k) => `trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k="${k}"]/v)')))`;
  const ID = (k) => `trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k="${k}"]/id)')))`;
  const CFG = (k) => `outputs('Compose_Watch_Config')?['${k}']`;
  const START = "outputs('Compose_Watch_Start')";
  const WAT = 'W. Central Africa Standard Time';
  /* Every branch of if() is evaluated, so each expression is safe on its own: the flow is the Title's second part (Title + '::' always has one). */
  const GROUP = (x) => `string(coalesce(${jlit(FailureGroupByFlowType)}?[concat(split(concat(string(coalesce(${x}?['Title'],'')),'::'),':')[1],'|',string(coalesce(${x}?['MessageType'],'')))],${jlit(FailureGroupByType)}?[string(coalesce(${x}?['MessageType'],''))],'unclassified'))`;
  const TO = (x) => `toLower(trim(string(coalesce(${x}?['RecipientEmail'],''))))`;
  const MASK = (x) => `if(or(empty(${TO(x)}),not(contains(${TO(x)},'@'))),'',concat(substring(concat(${TO(x)},' '),0,1),'***@',last(split(${TO(x)},'@'))))`;
  const ROWSEL = (from) => ({ type: 'Select', inputs: { from, select: {
    group: `@${GROUP('item()')}`, id: "@item()?['ID']", type: "@string(coalesce(item()?['MessageType'],''))", to: `@${MASK('item()')}`,
    ref: "@string(coalesce(item()?['Reference'],''))", /* substring() refuses an empty string (tenant, 2026-10-18: Select_Open_Failures failed on a receipt with no LastError) */
    error: "@if(empty(string(coalesce(item()?['LastError'],''))),'',substring(string(coalesce(item()?['LastError'],'')),0,min(length(string(coalesce(item()?['LastError'],''))),200)))",
    at: `@if(empty(string(coalesce(item()?['Created'],''))),'',formatDateTime(convertFromUtc(if(empty(string(coalesce(item()?['Created'],''))),'1970-01-01T00:00:00Z',item()?['Created']),'${WAT}'),'d MMM HH:mm'))` } } });
  const REPORTED = `or(equals(item()?['group'],'unclassified'),contains(split(${CFG('groups')},','),item()?['group']))`;
  const GROUPS = Object.keys(FailureGroups);
  const upsert = (tag, key, value, cond) => ({
    [`Condition_Watch_${tag}_Row`]: { type: 'If', runAfter: cond.after, expression: { and: [{ equals: [`@empty(${ID(key)})`, false] }] },
      actions: { [`Update_Watch_${tag}_Row`]: { type: 'OpenApiConnection', runAfter: {}, inputs: { host: SP('PatchItem'), parameters: { dataset: CONFIG_SITE, table: WATCH_CFG_T, id: `@${ID(key)}`, 'item/Title': key, 'item/ConfigValue': value } } } },
      else: { actions: { [`Create_Watch_${tag}_Row`]: { type: 'OpenApiConnection', runAfter: {}, inputs: { host: SP('PostItem'), parameters: { dataset: CONFIG_SITE, table: WATCH_CFG_T, 'item/Title': key, 'item/ConfigValue': value } } } } } } });
  const A = {};
  edit(log, 'Owner decision 2026-10-18: every failed notice is registered; only some are reported. The watch reads Flow Configuration (NOTIFY_FAILURE_WATCH_ENABLED, NOTIFY_FAILURE_REPORT_GROUPS, NOTIFY_FAILURE_BURST, NOTIFY_FAILURE_REPORT_TO, and the cursor and health rows it writes itself), falling back to config/notification-failure-groups.config.js when a row is absent.', () => {
    Object.assign(A, {
      Compose_Watch_Start: { type: 'Compose', runAfter: {}, inputs: "@formatDateTime(utcNow(),'yyyy-MM-ddTHH:mm:ssZ')" },
      Get_Watch_Config: { type: 'OpenApiConnection', runAfter: ok('Compose_Watch_Start'), inputs: { host: SP('GetItems'), parameters: { dataset: CONFIG_SITE, table: WATCH_CFG_T, $filter: "startswith(Title,'NOTIFY_FAILURE_')", $top: 20 } } },
      Select_Watch_Config: { type: 'Select', runAfter: { Get_Watch_Config: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { from: "@coalesce(actions('Get_Watch_Config')?['outputs']?['body']?['value'],json('[]'))",
        select: { k: "@toUpper(trim(string(item()?['Title'])))", v: "@trim(string(coalesce(item()?['ConfigValue'],'')))", id: "@string(item()?['ID'])" } } },
      Compose_Watch_Config_Xml: { type: 'Compose', runAfter: ok('Select_Watch_Config'), inputs: "@xml(json(concat('{\"r\":{\"i\":',string(union(body('Select_Watch_Config'),createArray(json('{\"k\":\"_\",\"v\":\"\",\"id\":\"\"}')))),'}}')))" },
      Compose_Watch_Config: { type: 'Compose', runAfter: ok('Compose_Watch_Config_Xml'), inputs: {
        enabled: `@not(equals(toLower(${V('NOTIFY_FAILURE_WATCH_ENABLED')}),'false'))`,
        groups: `@toLower(replace(if(empty(${V('NOTIFY_FAILURE_REPORT_GROUPS')}),'${FailureWatchDefaults.reportGroups.join(',')}',${V('NOTIFY_FAILURE_REPORT_GROUPS')}),' ',''))`,
        burst: `@int(if(empty(${V('NOTIFY_FAILURE_BURST')}),'${FailureWatchDefaults.burst}',${V('NOTIFY_FAILURE_BURST')}))`,
        to: `@if(empty(${V('NOTIFY_FAILURE_REPORT_TO')}),'${FailureWatchDefaults.reportTo}',${V('NOTIFY_FAILURE_REPORT_TO')})`,
        /* The cursor is stored as 'utc:<ISO>': the list hands a bare ISO value back reformatted ('10/18/2026 13:19:08', tenant
           2026-10-18), and Created gt that matches nothing. A value without the prefix is still parsed. */
        cursor: `@if(empty(${V('NOTIFY_FAILURE_WATCH_CURSOR')}),formatDateTime(addHours(${START},-1),'yyyy-MM-ddTHH:mm:ssZ'),if(startsWith(${V('NOTIFY_FAILURE_WATCH_CURSOR')},'utc:'),replace(${V('NOTIFY_FAILURE_WATCH_CURSOR')},'utc:',''),formatDateTime(if(or(empty(${V('NOTIFY_FAILURE_WATCH_CURSOR')}),startsWith(${V('NOTIFY_FAILURE_WATCH_CURSOR')},'utc:')),'1970-01-01T00:00:00Z',${V('NOTIFY_FAILURE_WATCH_CURSOR')}),'yyyy-MM-ddTHH:mm:ssZ')))`,
        summary: `@equals(int(formatDateTime(convertFromUtc(${START},'${WAT}'),'HH')),${FailureWatchDefaults.summaryHour})` } },
    });
  });
  edit(log, 'The window: failures registered after the cursor and up to this run\'s start (Created), so each is read by exactly one run; a run that cannot read leaves the cursor, and the next run reads the window again. Then every failure still open (Status failed), for the counts and the 07:00 summary. Each failure is placed by its receipt\'s MessageType, or by flow and type where two flows share a type. Only the reference, type, masked recipient, error and time are carried: never a message body.', () => {
    Object.assign(A, {
      Get_New_Failures: { type: 'OpenApiConnection', runAfter: ok('Compose_Watch_Config'), inputs: { host: SP('GetItems'), parameters: { dataset: RECEIPTS_LIST.site, table: RECEIPTS_LIST.table,
        $filter: `@concat('Status eq ''failed'' and Created gt ''',${CFG('cursor')},''' and Created le ''',${START},'''')`, $orderby: 'Created asc', $top: 500 } } },
      Get_Open_Failures: { type: 'OpenApiConnection', runAfter: { Get_New_Failures: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { host: SP('GetItems'), parameters: { dataset: RECEIPTS_LIST.site, table: RECEIPTS_LIST.table,
        $filter: "Status eq 'failed'", $orderby: 'Created desc', $top: 1000 } } },
      Select_New_Failures: { ...ROWSEL("@coalesce(actions('Get_New_Failures')?['outputs']?['body']?['value'],json('[]'))"), runAfter: { Get_Open_Failures: ['Succeeded', 'Failed', 'TimedOut'] } },
      Select_Open_Failures: { ...ROWSEL("@coalesce(actions('Get_Open_Failures')?['outputs']?['body']?['value'],json('[]'))"), runAfter: ok('Select_New_Failures') },
      Filter_New_Reported: { type: 'Query', runAfter: ok('Select_Open_Failures'), inputs: { from: "@body('Select_New_Failures')", where: `@${REPORTED}` } },
      Filter_Open_Reported: { type: 'Query', runAfter: ok('Filter_New_Reported'), inputs: { from: "@body('Select_Open_Failures')", where: `@${REPORTED}` } },
    });
  });
  /* The open count per group, one filter each. */
  let lastFilter = 'Filter_Open_Reported';
  for (const g of GROUPS) { const n = `Filter_Open_${g[0].toUpperCase()}${g.slice(1)}`; A[n] = { type: 'Query', runAfter: ok(lastFilter), inputs: { from: "@body('Select_Open_Failures')", where: `@equals(item()?['group'],'${g}')` } }; lastFilter = n; }
  edit(log, `What is reported: in the 07:00 run, every reportable failure still open (the morning summary); in every other run, the reportable failures registered since the last run, each once. Reportable: the groups in NOTIFY_FAILURE_REPORT_GROUPS (default ${FailureWatchDefaults.reportGroups.join(', ')}), and any failure the mapping cannot place. A burst (NOTIFY_FAILURE_BURST or more failures of any group in the window, default ${FailureWatchDefaults.burst}) is reported as a broken mail connection. Nothing is sent when there is nothing to report, or when NOTIFY_FAILURE_WATCH_ENABLED is false.`, () => {
    const LIST = `if(${CFG('summary')},body('Filter_Open_Reported'),body('Filter_New_Reported'))`;
    const BURST = `greaterOrEquals(length(body('Select_New_Failures')),${CFG('burst')})`;
    const COUNTS = Object.fromEntries(GROUPS.map((g) => [g, `@length(body('Filter_Open_${g[0].toUpperCase()}${g.slice(1)}'))`]));
    Object.assign(A, {
      Compose_Watch_Outcome: { type: 'Compose', runAfter: ok(lastFilter), inputs: {
        listed: `@${LIST}`, burst: `@${BURST}`, summary: `@${CFG('summary')}`, newCount: "@length(body('Select_New_Failures'))", openCount: "@length(body('Select_Open_Failures'))", open: COUNTS,
        readNew: "@equals(string(coalesce(actions('Get_New_Failures')?['status'],'')),'Succeeded')", readOpen: "@equals(string(coalesce(actions('Get_Open_Failures')?['status'],'')),'Succeeded')" } },
      Condition_Watch_Report: { type: 'If', runAfter: ok('Compose_Watch_Outcome'),
        expression: { and: [{ equals: [`@${CFG('enabled')}`, true] }, { equals: ["@outputs('Compose_Watch_Outcome')?['readNew']", true] },
          { or: [{ greater: ["@length(outputs('Compose_Watch_Outcome')?['listed'])", 0] }, { equals: ["@outputs('Compose_Watch_Outcome')?['burst']", true] }] }] },
        actions: {
          Select_Watch_Rows: { type: 'Select', runAfter: {}, inputs: { from: "@outputs('Compose_Watch_Outcome')?['listed']",
            select: `@concat('<tr><td style="padding:8px 10px;border-bottom:1px solid #E8E6E7;font:600 13px Arial,sans-serif;color:#05583B;word-break:break-all">',${ESC("item()?['ref']")},'</td><td style="padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#1B1A1A">',${ESC("item()?['type']")},'</td><td style="padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#1B1A1A">',${ESC("item()?['to']")},'</td><td style="padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#5F5C5D">',${ESC("item()?['error']")},'</td><td style="padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#5F5C5D;white-space:nowrap">',${ESC("item()?['at']")},'</td></tr>')` } },
          Compose_Watch_Totals: { type: 'Compose', runAfter: ok('Select_Watch_Rows'), inputs: `@concat(${GROUPS.map((g) => `'${FailureGroups[g].label}: ',string(outputs('Compose_Watch_Outcome')?['open']?['${g}'])`).join(",' · ',")})` },
          Compose_Watch_Html: { type: 'Compose', runAfter: ok('Compose_Watch_Totals'), inputs: "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light\"><title>Failed notices</title></head><body style=\"margin:0;padding:0;background:#FAFAF9;\"><div style=\"display:none;max-height:0;overflow:hidden\">@{if(outputs('Compose_Watch_Outcome')?['summary'],'Open failed notices this morning','New failed notices')}</div><table role=\"presentation\" width=\"100%\" style=\"background:#FAFAF9\"><tr><td align=\"center\" style=\"padding:24px 12px\"><table role=\"presentation\" width=\"640\" style=\"max-width:640px;width:100%;background:#FFFFFF;border:1px solid #E8E6E7;border-radius:8px\"><tr><td bgcolor=\"#05583B\" style=\"padding:24px 32px 22px 32px;background:#05583B;border-bottom:3px solid #17B255;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td valign=\"middle\" style=\"padding:0;\"><img src=\"https://folio-portal.page.gd/email-assets/nitda-lockup-white.png\" width=\"168\" alt=\"NITDA\" style=\"display:block;width:168px;max-width:100%;height:auto;border:0;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#FFFFFF;\"></td><td align=\"right\" valign=\"middle\" style=\"padding:0 0 0 12px;\"><img src=\"https://folio-portal.page.gd/email-assets/dgo-logo-whiteout.png\" width=\"150\" alt=\"DGO Digital Ops, an initiative of NITDA\" style=\"display:block;width:150px;max-width:100%;height:auto;border:0;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#FFFFFF;\"></td></tr></table></td></tr>@{if(outputs('Compose_Watch_Outcome')?['burst'],concat('<tr><td style=\"padding:12px 24px;background:#FBE7EB;font:600 13px Arial,sans-serif;color:#780820\">',string(outputs('Compose_Watch_Outcome')?['newCount']),' notices failed in the last hour. The mail connection may be broken: check the registry mailbox connection in Power Automate.</td></tr>'),'')}<tr><td style=\"padding:20px 24px 8px 24px;font:20px Arial,sans-serif;color:#1B1A1A\">Dear Registry,</td></tr><tr><td style=\"padding:0 24px 16px 24px;font:14px Arial,sans-serif;color:#373435\">@{if(outputs('Compose_Watch_Outcome')?['summary'],'These notices failed and are still open. Resend each one, or correct its address, then set its Status in Portal Outbox Receipts to resolved-resent, resolved-corrected or resolved-superseded.','These notices failed since the last check. Resend each one, or correct its address, then set its Status in Portal Outbox Receipts to resolved-resent, resolved-corrected or resolved-superseded.')}</td></tr><tr><td style=\"padding:0 24px 16px 24px\"><table role=\"presentation\" width=\"100%\" style=\"border-collapse:collapse\"><tr><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Reference</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Notice</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Recipient</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Error</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Failed</th></tr>@{join(body('Select_Watch_Rows'),'')}</table></td></tr><tr><td style=\"padding:0 24px 16px 24px;font:13px Arial,sans-serif;color:#5F5C5D\">Open failures by group (registered, not all reported): @{outputs('Compose_Watch_Totals')}</td></tr><tr><td style=\"padding:14px 24px;border-top:1px solid #E8E6E7;font:12px Arial,sans-serif;color:#5F5C5D\">Folio Failure Watch checks every hour in working hours. National Information Technology Development Agency.</td></tr></table></td></tr></table></body></html>" },
          Send_Failure_Watch_Email: { type: 'OpenApiConnection', runAfter: ok('Compose_Watch_Html'), inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' }, parameters: {
            'emailMessage/To': `@${CFG('to')}`,
            'emailMessage/Subject': `@concat('Folio: ',if(outputs('Compose_Watch_Outcome')?['burst'],'mail connection may be broken; ',''),string(length(outputs('Compose_Watch_Outcome')?['listed'])),if(outputs('Compose_Watch_Outcome')?['summary'],' failed notice(s) still open',' new failed notice(s)'))`,
            'emailMessage/Body': "@outputs('Compose_Watch_Html')", 'emailMessage/Importance': 'High' } } },
        },
        else: { actions: {} } },
    });
  });
  edit(log, 'Afterwards: the cursor moves to this run\'s start only when the window was read, and NOTIFY_FAILURE_HEALTH is written (the open count per group, the burst flag, the time) only when the open failures were read. Each row is created on the first run if it is absent.', () => {
    const health = `@string(json(concat('{"at":"',${START},'","open":',string(outputs('Compose_Watch_Outcome')?['open']),',"openTotal":',string(outputs('Compose_Watch_Outcome')?['openCount']),',"newSinceLastRun":',string(outputs('Compose_Watch_Outcome')?['newCount']),',"connectionBroken":',if(outputs('Compose_Watch_Outcome')?['burst'],'true','false'),'}')))`;
    const c1 = upsert('Cursor', 'NOTIFY_FAILURE_WATCH_CURSOR', `@concat('utc:',${START})`, { after: { Condition_Watch_Report: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] } });
    /* The cursor moves only when the window was read AND its report (when one was due) was sent: a report that failed is
       retried by the next run instead of being skipped. */
    const REPORT_OK = "@not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))";
    c1.Condition_Watch_Cursor_Row.expression = { and: [{ equals: ["@outputs('Compose_Watch_Outcome')?['readNew']", true] }, { equals: [REPORT_OK, true] }, { equals: [`@empty(${ID('NOTIFY_FAILURE_WATCH_CURSOR')})`, false] }] };
    /* A cursor row is created only when the window was read. */
    const create = c1.Condition_Watch_Cursor_Row.else.actions.Create_Watch_Cursor_Row;
    c1.Condition_Watch_Cursor_Row.else.actions = { Condition_Watch_Cursor_Read: { type: 'If', runAfter: {}, expression: { and: [{ equals: ["@outputs('Compose_Watch_Outcome')?['readNew']", true] }, { equals: [REPORT_OK, true] }, { equals: [`@empty(${ID('NOTIFY_FAILURE_WATCH_CURSOR')})`, true] }] }, actions: { Create_Watch_Cursor_Row: create }, else: { actions: {} } } };
    const c2 = upsert('Health', 'NOTIFY_FAILURE_HEALTH', health, { after: { Condition_Watch_Cursor_Row: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] } });
    c2.Condition_Watch_Health_Row.expression = { and: [{ equals: ["@outputs('Compose_Watch_Outcome')?['readOpen']", true] }, { equals: [`@empty(${ID('NOTIFY_FAILURE_HEALTH')})`, false] }] };
    const hc = c2.Condition_Watch_Health_Row.else.actions.Create_Watch_Health_Row;
    c2.Condition_Watch_Health_Row.else.actions = { Condition_Watch_Health_Read: { type: 'If', runAfter: {}, expression: { and: [{ equals: ["@outputs('Compose_Watch_Outcome')?['readOpen']", true] }, { equals: [`@empty(${ID('NOTIFY_FAILURE_HEALTH')})`, true] }] }, actions: { Create_Watch_Health_Row: hc }, else: { actions: {} } } };
    Object.assign(A, c1, c2);
    /* The run ends Failed when the watch could not do its job (a read, the classification or the report failed), so the
       failure shows in run history instead of a run that only looks successful (tenant, 2026-10-18). */
    const ST = (n) => `string(coalesce(actions('${n}')?['status'],''))`;
    A.Compose_Watch_Run_Outcome = { type: 'Compose', runAfter: { Condition_Watch_Health_Row: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] },
      inputs: `@int(if(or(not(equals(${ST('Compose_Watch_Outcome')},'Succeeded')),equals(${ST('Condition_Watch_Report')},'Failed'),equals(${ST('Condition_Watch_Cursor_Row')},'Failed'),equals(${ST('Condition_Watch_Health_Row')},'Failed')),'watch-failed','0'))` };
  });
  const pkg = { nodeId: 'Scope_Failure_Watch', serializedValue: { type: 'Scope', actions: A, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  const conn = { '/providers/Microsoft.PowerApps/apis/shared_sharepointonline': SP_CONNECTION, '/providers/Microsoft.PowerApps/apis/shared_office365': REGISTRY_MAIL_CONNECTION };
  const walkc = (o) => { for (const [n, a] of Object.entries(o || {})) { if (a.type === 'OpenApiConnection') { const api = a.inputs.host.apiId; pkg.allConnectionData[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${conn[api]}` }, connectionName: conn[api] }, referenceKey: a.inputs.host.connection }; } walkc(a.actions); if (a.else) walkc(a.else.actions); } };
  walkc(A);
  return pkg;
}

/* ---------------------------------------------------------------- EMAIL_RELATED_TASK */
/**
 * Folio's "raise a task from this email" (modules/lookup.js → EMAIL_RELATED_TASK). The adopted flow is
 * IP_Create__Task__for_received_Email_Endpoint (ab1a3555; registers/flow-adoption.json), whose export of 2026-10-05 is the
 * source here. Its two copies with the same definition, 3f2f649b and 2fbb5485, are retired.
 */
const EMAIL_EXPORT = 'docs/folio-Master-Flows-and-Endpoints/exports/EMAIL_RELATED_TASK__IP_Create_Task_for_received_Email_Endpoint__ab1a3555__Export_20261005174125.zip';
const GTQ = 'ee82725a-c408-45e2-a8e8-facf7a092047';
const GTQ_MIRROR = '22c4e38d-5040-4e0f-aa47-dd3aa3f28abf';
function emailTask(pkg, log) {
  const A = pkg.serializedValue.actions;
  const IN = "outputs('Compose_Email_Task_Input')";
  const N = (k) => `triggerBody()?['NewActivityTask']?['${k}']`;
  const P = (k) => `triggerBody()?['payload']?['${k}']`;
  const PE = (k) => `triggerBody()?['payload']?['email']?['${k}']`;
  const PRIO = "string(coalesce(triggerBody()?['payload']?['priority'],'normal'))";

  edit(log, 'Folio\'s request reaches the flow: core/data-client.js sends {action, payload:{…}, userEmail, requestId}, with the e-mail as payload.email and the task fields flat in payload (core/assignment-payload.js buildEmailTaskPayload), while every step of the flow read Email.id and NewActivityTask.* at the top level. Folio\'s requests therefore carried no e-mail id and were refused at validation. Compose_Email_Task_Input, the scope\'s first step, gives the steps the fields they read, from the top-level form when a request carries it and from Folio\'s payload otherwise (priority capitalised and status New, as the Assignment Desk sends them), and every step reads it instead of the trigger.', () => {
    const text = JSON.stringify(A);
    for (const s of ["triggerBody()?['NewActivityTask']", "triggerBody()?['Email']", "triggerBody()?['email']", "triggerBody()?['sourceEmailId']"]) if (!text.includes(s)) throw new Error(`Scope_Global no longer reads ${s}`);
    const swapped = text
      .split("triggerBody()?['NewActivityTask']").join(`${IN}?['NewActivityTask']`)
      .split("triggerBody()?['Email']").join(`${IN}?['Email']`)
      .split("triggerBody()?['email']").join(`${IN}?['Email']`)
      .split("triggerBody()?['sourceEmailId']").join(`${IN}?['Email']?['id']`);
    for (const k of Object.keys(A)) delete A[k];
    Object.assign(A, JSON.parse(swapped));
    const pick = (k, folio) => `@coalesce(${N(k)},${folio})`;
    A.Compose_Email_Task_Input = { type: 'Compose', runAfter: {}, inputs: {
      NewActivityTask: {
        /* Text the flow trims or tests defaults to empty text: an expression evaluates both branches of if(), so trim(null) in the untaken one fails the step. */
        Title: pick('Title', P('title')), Description: pick('Description', `${P('instruction')},''`), Comments: pick('Comments', `${P('instruction')},''`),
        Status: pick('Status', "'New'"),
        Category: pick('Category', P('category')), CategoryCode: pick('CategoryCode', P('categoryCode')),
        SubCategory: pick('SubCategory', P('subcategory')), SubCategoryCode: pick('SubCategoryCode', P('subcategoryCode')),
        Categorization: `@${N('Categorization')}`,
        AssignedTo: pick('AssignedTo', P('assignedTo')), AssignedToTitle: `@${N('AssignedToTitle')}`,
        AssignedDSU: pick('AssignedDSU', P('assignedToDsu')), PrimaryDSU: pick('PrimaryDSU', P('assignedToDsu')),
        supportingAssignedTo: pick('supportingAssignedTo', P('supportingAssignee')), SupportDSU: pick('SupportDSU', P('supportingDsu')),
        CopyTo: pick('CopyTo', `join(coalesce(${P('ccRecipients')},json('[]')),';')`),
        Priority: pick('Priority', `concat(toUpper(substring(${PRIO},0,1)),substring(${PRIO},1))`),
        StartDate: pick('StartDate', P('startDate')),
        AckDue: pick('AckDue', P('ack')), AcknolwedgementDueBy: pick('AcknolwedgementDueBy', P('ack')),
        TaskDue: pick('TaskDue', P('due')), TaskDueDate: pick('TaskDueDate', P('due')),
        AttachmentLink: pick('AttachmentLink', PE('webLink')),
        CreatedBy: pick('CreatedBy', P('createdBy')),
        ID: `@${N('ID')}`, ItemID: `@${N('ItemID')}`,
      },
      Email: {
        id: `@coalesce(triggerBody()?['Email']?['id'],triggerBody()?['email']?['id'],${PE('id')},${P('sourceEmailId')},triggerBody()?['sourceEmailId'])`,
        subject: `@coalesce(triggerBody()?['Email']?['subject'],triggerBody()?['email']?['subject'],${PE('subject')})`,
        webLink: `@coalesce(triggerBody()?['Email']?['webLink'],${PE('webLink')})`,
        receivedDateTime: `@coalesce(triggerBody()?['Email']?['receivedDateTime'],${PE('receivedDateTime')})`,
        /* The flow reads from.emailAddress.address (Graph's form); Folio sends the address as text. */
        from: { emailAddress: { address: `@coalesce(triggerBody()?['Email']?['from']?['emailAddress']?['address'],${PE('fromAddress')})` } },
      },
    } };
    const mode = A.Compose_Mode;
    if (!mode || Object.keys(mode.runAfter || {}).length) throw new Error('Compose_Mode is no longer first in Scope_Global');
    mode.runAfter = ok('Compose_Email_Task_Input');
  });

  edit(log, 'S8 / ID-19: every run mints its Request ID. varRequestId took the client\'s requestId whenever the request carried one (Folio always sends one), so the reply, the audit and every row written carried a value the client chose. The scope now sets it to guid() before anything reads it.', () => {
    A.Set_variable_varRequestId = { type: 'SetVariable', inputs: { name: 'varRequestId', value: '@guid()' }, runAfter: ok('Compose_Email_Task_Input') };
    A.Compose_Mode.runAfter = ok('Set_variable_varRequestId');
  });

  edit(log, 'G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above): from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from the request (userEmail, else Folio\'s createdBy). With the switch true, a caller who is not an active directory user is refused with 401 and one whose role does not allow single-assignment (the Folio route that owns create-task-from-email, config/action-ownership.config.js) with 403, through the flow\'s own validation-failure path, before any number is claimed or any row written. The task\'s AssignedBy is that caller.', () => {
    const gate = K.chain(callerGate('Assign_Gate', `coalesce(triggerBody()?['userEmail'],${P('createdBy')},${N('CreatedBy')})`), permissionGate('Assign_Gate', 'single-assignment'));
    gate[Object.keys(gate)[0]].runAfter = ok('Set_variable_varRequestId');
    Object.assign(A, gate);
    A.Compose_Mode.runAfter = ok('Compose_Assign_Gate_Auth');
    const AUTH = "outputs('Compose_Assign_Gate_Auth')";
    const v = A.Condition_Validate_Input;
    const old = v.expression.and[0].equals[0];
    if (old !== "@empty(trim(coalesce(outputs('Compose_NormalizedInput')?['emailId'], '')))") throw new Error('Condition_Validate_Input changed in the source');
    v.expression.and[0].equals[0] = `@or(not(equals(${AUTH},'ok')),${old.slice(1)})`;
    const err = v.actions.Scope_Validation_Failure.actions.Append_to_array_variable_varErrors_Validation_Failur.inputs.value;
    if (!String(err.message).startsWith("@concat('Validation failed: '")) throw new Error('validation message changed in the source');
    err.message = `@if(equals(${AUTH},'unauthenticated'),'The caller is not an active user in the DGO user directory.',if(equals(${AUTH},'forbidden'),'The caller''s role does not allow assignments.',${err.message.slice(1)}))`;
    const st = A.Scope_Finalize_Response_State.actions.Set_variable_varStatusCode.inputs;
    if (!String(st.value).startsWith('@if(\n  or(\n    greater(coalesce(variables(\'varFailedCount\')')) throw new Error('Set_variable_varStatusCode changed in the source');
    st.value = `@if(equals(${AUTH},'unauthenticated'),401,if(equals(${AUTH},'forbidden'),403,${st.value.slice(1)}))`;
    const ct = locate(A, 'Create_Task_Email').a.inputs.parameters;
    if (ct['item/AssignedBy'] !== `@coalesce(triggerBody()?['userEmail'], ${IN}?['NewActivityTask']?['CreatedBy'], '')`) throw new Error('Create_Task_Email AssignedBy changed in the source');
    ct['item/AssignedBy'] = "@outputs('Compose_Assign_Gate_Caller')";
  });

  edit(log, 'B1: the audit e-mail\'s attachment list is built without a Filter array, which a pasted scope may not hold. Select_Audit_Attachments turns each attachment with a name and content into its JSON text and Compose_Audit_Attachments joins them into the same list Filter_array_Compose_Data_FlowRun_Verification_Email_Attachments gave.', () => {
    const { parent } = locate(A, 'Filter_array_Compose_Data_FlowRun_Verification_Email_Attachments');
    const q = parent.Filter_array_Compose_Data_FlowRun_Verification_Email_Attachments;
    if (q.type !== 'Query' || q.inputs.where !== "@and(not(empty(item()?['Name'])), not(empty(item()?['ContentBytes'])))") throw new Error('the audit Filter array changed in the source');
    const send = parent['Send_an_email_(V2)_Audit'];
    if (send.inputs.parameters['emailMessage/Attachments'] !== "@body('Filter_array_Compose_Data_FlowRun_Verification_Email_Attachments')") throw new Error('the audit e-mail attachments changed in the source');
    parent.Select_Audit_Attachments = { type: 'Select', runAfter: q.runAfter, inputs: { from: q.inputs.from, select: "@if(and(not(empty(item()?['Name'])),not(empty(item()?['ContentBytes']))),concat(',',string(item())),'')" } };
    parent.Compose_Audit_Attachments = { type: 'Compose', runAfter: ok('Select_Audit_Attachments'), inputs: "@json(replace(concat('[',join(body('Select_Audit_Attachments'),''),']'),'[,','['))" };
    delete parent.Filter_array_Compose_Data_FlowRun_Verification_Email_Attachments;
    send.runAfter = ok('Compose_Audit_Attachments');
    send.inputs.parameters['emailMessage/Attachments'] = "@outputs('Compose_Audit_Attachments')";
  });

  edit(log, `S3 / §8.2: each task gets a Task Reference TASK-YYYY-NNNNN, claimed by the generation kit (10 flat attempts, IF-MATCH, counter row TASK-<year> created by the first claim of the year), addressed through Flow Configuration (DATASET_SEQUENCE_COUNTERS_*). If no number can be claimed the task is not created and the run takes the existing Task Processing catch, which records the error.`, () => {
    const { parent } = locate(A, 'Create_Task_Email');
    if (Object.keys(parent.Create_Task_Email.runAfter || {}).length) throw new Error('Create_Task_Email is no longer first in Scope_Create_Task');
    const kit = K.chain(
      K.readDatasetBindings({ keys: ['SEQUENCE_COUNTERS', 'IDENTITY_MAP', 'INTAKE_REGISTER'], configSite: CONFIG_SITE }),
      K.environmentPrefix(),
      K.entityKey('Task'),
      K.claimReference({ tag: 'Task', prefix: 'TASK' }),
    );
    Object.assign(parent, kit);
    parent.Compose_Task_Claim_Check = { type: 'Compose', inputs: "@int(if(equals(outputs('Compose_Claim_Task')?['ok'],true),'0','TASK_REFERENCE_UNAVAILABLE'))", runAfter: ok('Compose_Claim_Task') };
    parent.Compose_Task_Ref = { type: 'Compose', inputs: "@string(coalesce(first(outputs('Compose_Claim_Task')?['references']),''))", runAfter: ok('Compose_Task_Claim_Check') };
  });

  edit(log, '§7.1 / §15: the task names its e-mail\'s record when the e-mail is registered. The e-mail\'s internetMessageId (Get_Email) is looked up in DGO_IdentityMap as an EXO_INTERNET_MESSAGE_ID LOCATOR, which DYNAMIC_ACTIONS register writes (T8); when it points at a REC, the task\'s ParentKey and RootKey are that REC and RootRef its NITDA-YYYY-NNNNN from Portal Registry. An e-mail no one has registered gives an empty ParentKey, and the task still keeps the message id in ActivityTrackingID and RefIDD, as before. No map entry is written here: an e-mail\'s locator belongs to its record (§7.1), and one written for a task would block the e-mail\'s registration. A failed lookup does not stop the task.', () => {
    const { parent } = locate(A, 'Create_Task_Email');
    const IMID = "string(coalesce(outputs('Get_Email')?['body/internetMessageId'],''))";
    const MAP_SITE = "outputs('Compose_Dataset_Bindings')?['DATASET_IDENTITY_MAP_SITE_URL']";
    const REG_SITE = "outputs('Compose_Dataset_Bindings')?['DATASET_INTAKE_REGISTER_SITE_URL']";
    parent.Get_Email_Locator = dGet(MAP_SITE, K.listRaw('IDENTITY_MAP'), `if(empty(${IMID}),'ID eq 0',concat('EntryKind eq ''LOCATOR'' and Kind eq ''EXO_INTERNET_MESSAGE_ID'' and Value eq ''',uriComponent(replace(substring(${IMID},0,min(255,length(${IMID}))),'''','''''')),''''))`, ok('Compose_Task_Ref'));
    const REF = `string(coalesce(first(${rows('Get_Email_Locator')})?['EntityRef'],''))`;
    parent.Compose_Email_Record_Key = { type: 'Compose', runAfter: { Get_Email_Locator: ['Succeeded', 'Failed'] },
      inputs: `@if(and(startsWith(${REF},'REC:'),equals(length(${REF}),40)),concat('REC:',toLower(substring(concat(${REF},'0000000000000000000000000000000000000000'),4,36))),'')` };
    parent.Get_Email_Record = dGet(REG_SITE, K.listRaw('INTAKE_REGISTER'), `if(empty(outputs('Compose_Email_Record_Key')),'ID eq 0',concat('EntityKey eq ''',substring(concat(outputs('Compose_Email_Record_Key'),'0000000000000000000000000000000000000000'),4,36),''''))`, ok('Compose_Email_Record_Key'));
    parent.Compose_Email_Record_Ref = { type: 'Compose', runAfter: { Get_Email_Record: ['Succeeded', 'Failed'] },
      inputs: `@if(empty(outputs('Compose_Email_Record_Key')),'',string(coalesce(first(${rows('Get_Email_Record')})?['ReferenceId'],'')))` };
    parent.Create_Task_Email.runAfter = ok('Compose_Email_Record_Ref');
  });

  edit(log, `§10.2 TASK_QUEUE: the task is created in Global Tracking Queue (${GTQ}), the list Folio reads tasks from (FETCH_ALL) and Single and Bulk Assignment write. The flow created it in DEV_OPS_Global_Tracking_Queue (${GTQ_MIRROR}), a test list (owner direction, 5 October 2026; spec 1.2.4), so a task raised from an e-mail never appeared in Folio, and then Update_item_Task_Email wrote the reference and task type into Global Tracking Queue at the test list's item ID — onto whichever unrelated task holds that ID there. The create now carries the task type and grouping itself, the Entity Key, TaskRef, ParentKey, RootKey, RootRef, IdState ACTIVE, Rev 1, the Request ID as CorrelationId and CreatedByRequest, ClientRequestHash (B3), and Reference_ID, the legacy reference column, holding the Task Reference until Phase 6; the update is removed (B9).`, () => {
    const { parent } = locate(A, 'Create_Task_Email');
    const p = parent.Create_Task_Email.inputs.parameters;
    if (p.table !== GTQ_MIRROR) throw new Error('Create_Task_Email no longer writes DEV_OPS_Global_Tracking_Queue');
    const up = parent.Update_item_Task_Email.inputs.parameters;
    if (up.table !== GTQ || up.id !== "@outputs('Get_item_Task_Email')?['body/ID']") throw new Error('Update_item_Task_Email changed in the source');
    if (locate(A, 'Get_item_Task_Email').a.inputs.parameters.table !== GTQ_MIRROR) throw new Error('Get_item_Task_Email changed in the source');
    const HASH = "toLower(trim(string(coalesce(triggerBody()?['payload']?['clientRequestHash'],triggerBody()?['clientRequestHash'],''))))";
    p.table = GTQ;
    locate(A, 'Get_item_Task_Email').a.inputs.parameters.table = GTQ;
    const KEY = "outputs('Compose_Email_Record_Key')";
    Object.assign(p, {
      'item/TaskTypeChoice/Value': up['item/TaskTypeChoice/Value'],
      'item/TaskType/Value': up['item/TaskType/Value'],
      'item/GTQGrouping': up['item/GTQGrouping'],
      'item/Reference_ID': "@outputs('Compose_Task_Ref')",
      'item/EntityKey': "@outputs('Compose_EntityKey_Task')",
      'item/TaskRef': "@outputs('Compose_Task_Ref')",
      'item/ParentKey': `@${KEY}`,
      'item/RootKey': `@${KEY}`,
      'item/RootRef': "@outputs('Compose_Email_Record_Ref')",
      'item/IdState/Value': 'ACTIVE',
      'item/Rev': 1,
      'item/CorrelationId': "@variables('varRequestId')",
      'item/CreatedByRequest': "@variables('varRequestId')",
      'item/ClientRequestHash': `@if(equals(length(${HASH}),64),${HASH},'')`,
    });
    if (JSON.stringify(parent.Increment_variable_varTasksCretedCount.runAfter) !== JSON.stringify(ok('Update_item_Task_Email'))) throw new Error('Increment_variable_varTasksCretedCount order changed in the source');
    delete parent.Update_item_Task_Email;
    parent.Increment_variable_varTasksCretedCount.runAfter = ok('Compose_ReferenceID');
  });

  edit(log, 'The task\'s DueDate is written. It was null unless the due date was given as a non-text value, which JSON never does, and its expression called type(), which is not a workflow expression function, so the step could not evaluate it. DueDate is now the given due date (TaskDueDate, else TaskDue) in yyyy-MM-ddTHH:mm:ssZ, or empty when none is given.', () => {
    const p = locate(A, 'Create_Task_Email').a.inputs.parameters;
    if (!String(p['item/DueDate']).includes('type(')) throw new Error('Create_Task_Email DueDate changed in the source');
    const DUE = `string(coalesce(${IN}?['NewActivityTask']?['TaskDueDate'],${IN}?['NewActivityTask']?['TaskDue'],''))`;
    p['item/DueDate'] = `@if(empty(${DUE}),null,formatDateTime(if(empty(${DUE}),'1900-01-01',${DUE}),'yyyy-MM-ddTHH:mm:ssZ'))`;
  });

  edit(log, 'StartDate and the acknowledgement due date no longer fail when the request gives none. Each chose between a default and formatDateTime(<the given date>), and an expression evaluates both branches of if(), so an absent date stopped the create. The given date is now read as 1900-01-01 where it is empty, in the branch that is then not taken; the defaults are unchanged.', () => {
    const p = locate(A, 'Create_Task_Email').a.inputs.parameters;
    for (const [col, k] of [['item/StartDate', 'StartDate'], ['item/Acknowledgement_x0020_Due_x0020_', 'AckDue']]) {
      const X = `${IN}?['NewActivityTask']?['${k}']`;
      const want = `formatDateTime(\n    ${X},\n    'yyyy-MM-ddTHH:mm:ssZ'\n  )`;
      if (!String(p[col]).includes(want)) throw new Error(`Create_Task_Email ${col} changed in the source`);
      p[col] = p[col].replace(want, `formatDateTime(if(empty(${X}),'1900-01-01T00:00:00Z',string(${X})),'yyyy-MM-ddTHH:mm:ssZ')`);
    }
  });

  edit(log, 'S3: new tasks have no composite reference. Compose_ReferenceID (<yyyyMMdd>-EML-<category>-<sub-category>-<item ID>), which the e-mails and the reply show, is now the Task Reference, and the acknowledgement and support links\' ref= is the Task Reference instead of TASK-<item ID> (support.html?ref=TASK-YYYY-NNNNN, §5 ID-05); the links still find the task by item=. The reply\'s data carries taskRef and entityKey.', () => {
    const r = locate(A, 'Compose_ReferenceID').a;
    if (!String(r.inputs).includes("'-EML-'")) throw new Error('Compose_ReferenceID changed in the source');
    r.inputs = "@outputs('Compose_Task_Ref')";
    let n = 0;
    for (const name of ['Compose_Task_Acknowledgement_Link', 'Compose_Task_Email_Acknowledgement_Link', 'Compose_Support_Link', 'Compose_SupportLink']) {
      const a = locate(A, name).a;
      const re = /concat\(\s*'TASK-',\s*string\(\s*coalesce\(\s*outputs\('Get_item_Task_Email'\)\?\['body\/ID'\],\s*0\s*\)\s*\)\s*\)/;
      if (!re.test(a.inputs)) throw new Error(`${name}: ref= changed in the source`);
      a.inputs = a.inputs.replace(re, "outputs('Compose_Task_Ref')"); n++;
    }
    const d = locate(A, 'Set_variable_varData_Success').a.inputs.value;
    if (!('referenceId' in d)) throw new Error('Set_variable_varData_Success changed in the source');
    d.taskRef = "@outputs('Compose_Task_Ref')";
    d.entityKey = "@outputs('Compose_EntityKey_Task')";
    if (n !== 4) throw new Error('acknowledgement and support links not found');
  });
}

/* ---------------------------------------------------------------- OTP_GENERATE / OTP_VERIFY: the proof mint */
/* G-04 (AUTHENTICATION_CONTRACT.md §2, §2a): every internal endpoint takes its caller from a sign-in proof in the proof
   ledger, and something must mint that proof. The adopted one-time code flow, IP_OTP_VERIFY (4dbe6dde), verifies the
   code but mints none: on success it answers "verificationToken": "optional-server-issued-token". The mint was designed
   only in DGO_OTP_VERIFY, a replacement package retired on 2026-10-06; it moves here, into the live flow. */
/** ITEM-50 / ITEM-52 (owner decision, 2026-10-06): the email-to-task flow sent all five of its mails to one named person. */
function emailTaskRouting(pkg, log) {
  const A = pkg.serializedValue.actions;
  const OFFICER = "@toLower(trim(string(coalesce(outputs('Get_item_Task_Email')?['body/AssignedTo'],outputs('Compose_Email_Task_Input')?['NewActivityTask']?['AssignedTo'],''))))";
  edit(log, 'ITEM-50 (owner decision, 2026-10-06): the two task notifications go to the assigned officer, the task row\'s AssignedTo (the request\'s assignee when the row has none), with the third-assignee Cc kept. They went to one named address whoever the task was for.', () => {
    for (const n of ['Send_an_email_(V2)_Main_1_1_1', 'Send_an_email_(V2)_Main_1_1_2']) {
      const p = locate(A, n).a.inputs.parameters;
      if (p['emailMessage/To'] !== 'hkani@nitda.gov.ng') throw new Error(`${n} no longer sends to the fixed address`);
      p['emailMessage/To'] = OFFICER;
    }
  });
  /* Remove a step, re-chaining every sibling that ran after it to what it ran after. */
  const drop = (name) => {
    const { parent, a } = locate(A, name);
    for (const [n, b] of Object.entries(parent)) if (b.runAfter?.[name]) { const r = { ...b.runAfter }; delete r[name]; b.runAfter = { ...r, ...(a.runAfter || {}) }; }
    delete parent[name];
  };
  const readsOutside = (scopeName) => {
    const { a } = locate(A, scopeName);
    const inner = new Set(names(a.actions));
    const { actions, ...rest } = A; void actions;
    const others = JSON.stringify(Object.fromEntries(Object.entries(A).filter(([n]) => n !== scopeName)));
    return [...inner].filter((n) => others.includes(`'${n}'`));
  };
  edit(log, 'ITEM-50 / ITEM-52 (owner decision, 2026-10-06): the diagnostics mail (Send_an_email_(V2)_Main_1_1, the raw response to one named address) and the two audit mails (Send_an_email_(V2)_Audit and _Audit_1, which repeated what the audit lists hold) are removed, with Scope_Build_Audit_information, which built nothing else. The reply to the caller is unchanged.', () => {
    if (locate(A, 'Send_an_email_(V2)_Main_1_1').a.inputs.parameters['emailMessage/To'] !== 'hkani@nitda.gov.ng') throw new Error('the diagnostics mail changed in the source');
    drop('Send_an_email_(V2)_Main_1_1');
    const outside = readsOutside('Scope_Build_Audit_information');
    if (outside.length) throw new Error(`Scope_Build_Audit_information is read outside it: ${outside.join(', ')}`);
    drop('Scope_Build_Audit_information');
  });
}

function otpProof(pkg, log) {
  const A = pkg.serializedValue.actions;
  edit(log, 'Tenant defect (8 October 2026): a verify for an address with no code issued answered 500, because Update_item_Attempts had no row to count against (id empty). The attempt count is now written only when an unverified code exists; otherwise the flow goes straight to its no-pending-code answer, as a wrong code does, and nothing is written.', () => {
    const { parent } = locate(A, 'Update_item_Attempts');
    const upd = parent.Update_item_Attempts, verify = parent.Get_items_OTP_Verify;
    if (!verify || JSON.stringify(verify.runAfter) !== JSON.stringify(ok('Update_item_Attempts')) || (upd.runAfter && Object.keys(upd.runAfter).length)) throw new Error('OTP attempt order changed in the source');
    delete parent.Update_item_Attempts;
    parent.Condition_Otp_Has_Pending_Code = { type: 'If', runAfter: {},
      expression: { and: [{ greater: ["@length(coalesce(outputs('Get_items_OTP_Attempts')?['body/value'],json('[]')))", 0] }] },
      actions: { Update_item_Attempts: upd }, else: { actions: {} } };
    verify.runAfter = ok('Condition_Otp_Has_Pending_Code');
  });
  edit(log, 'The response data is an object. The flow built it in varResponse, a string, and returned that string as data, so Folio (core/contracts.js liftEnvelope) could not read any field of it, the proof included. Set_variable_varData now parses it; every value the flow appends to varResponse is one JSON object.', () => {
    const appends = [];
    const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
      if (a.type === 'AppendToStringVariable' && a.inputs?.name === 'varResponse') appends.push([n, a.inputs.value]);
      walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
    } };
    walk(A);
    const notObject = appends.filter(([, v]) => !v || typeof v !== 'object' || Array.isArray(v));
    if (!appends.length || notObject.length) throw new Error(`varResponse appends that are not one JSON object: ${notObject.map(([n]) => n).join(', ')}`);
    const d = locate(A, 'Set_variable_varData').a;
    if (d.inputs.value !== "@variables('varResponse')") throw new Error('Set_variable_varData changed in the source');
    d.inputs.value = "@json(if(empty(variables('varResponse')),'{}',variables('varResponse')))";
  });
  edit(log, 'G-04, the mint: when the code verifies, the caller is looked up in DGO_UserDirectory (active rows only). An active directory user gets a proof: a guid() token written to the proof ledger (Purpose internal-session, unconsumed) with an expiry of 4 hours (AUTHENTICATION_CONTRACT.md §2a), and the reply carries token, expiresAt (the same Compose, so the ledger row and the reply agree) and claims read from the directory row. A verified address that is not an active directory user gets 401 and no proof. This is DGO_OTP_VERIFY\'s mint (retired 2026-10-06), placed in the live flow.', () => {
    const { parent, a: upd } = locate(A, 'Update_item');
    if (upd.inputs.parameters['item/Is_Verified'] !== true) throw new Error('Update_item changed in the source');
    const okSet = locate(A, 'Set_variable_Verification_Successful').a;
    const okAppend = locate(A, 'Append_to_string_variable_Verification_Successful').a;
    if (okAppend.inputs.value?.verificationToken !== 'optional-server-issued-token') throw new Error('the success reply changed in the source');
    delete parent.Set_variable_Verification_Successful; delete parent.Append_to_string_variable_Verification_Successful;
    const EMAIL = "toLower(trim(string(coalesce(outputs('Compose_OTP_Identifier_Verify'),''))))";
    const ROW = "first(coalesce(outputs('Get_Otp_Directory_User')?['body/value'],json('[]')))";
    const post = (parameters) => ({ type: 'OpenApiConnection', inputs: {
      host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' }, parameters } });
    parent.Get_Otp_Directory_User = { ...spGet(GOV_SITE, '3d591f5b-3f2f-409c-983a-a77b5c174834', `@concat('Email eq ''',replace(${EMAIL},'''',''''''),''' and Status eq ''active''')`), runAfter: ok('Update_item') };
    parent.Compose_Otp_Proof_Token = { type: 'Compose', inputs: '@guid()', runAfter: ok('Get_Otp_Directory_User') };
    parent.Compose_Otp_Proof_Expires = { type: 'Compose', inputs: '@addHours(utcNow(),4)', runAfter: ok('Compose_Otp_Proof_Token') };
    parent.Condition_Otp_Known_User = { type: 'If', runAfter: ok('Compose_Otp_Proof_Expires'),
      expression: { greater: [`@length(coalesce(outputs('Get_Otp_Directory_User')?['body/value'],json('[]')))`, 0] },
      actions: {
        Create_Otp_Proof: { ...post({ dataset: PROOF_LEDGER.site, table: PROOF_LEDGER.table,
          'item/Title': "@outputs('Compose_Otp_Proof_Token')", 'item/Email': `@toLower(string(${ROW}?['Email']))`, 'item/Purpose': 'internal-session',
          'item/ExpiresAtUtc': "@outputs('Compose_Otp_Proof_Expires')", 'item/CreatedAtUtc': '@utcNow()', 'item/Consumed': false }), runAfter: {} },
        Set_variable_Verification_Successful: { ...okSet, runAfter: ok('Create_Otp_Proof') },
        Append_to_string_variable_Verification_Successful: { type: 'AppendToStringVariable', runAfter: ok('Set_variable_Verification_Successful'), inputs: { name: 'varResponse', value: {
          ok: true, status: 'success', valid: true, message: 'OTP verified', request_id: '@guid()',
          token: "@outputs('Compose_Otp_Proof_Token')", expiresAt: "@outputs('Compose_Otp_Proof_Expires')",
          claims: {
            preferred_username: `@toLower(string(${ROW}?['Email']))`, email: `@toLower(string(${ROW}?['Email']))`,
            name: `@string(coalesce(${ROW}?['FullName'],${ROW}?['Email']))`,
            role: `@coalesce(${ROLE_OF(ROW)},'viewer')`, roles: `@createArray(coalesce(${ROLE_OF(ROW)},'viewer'))`,
            accessScope: `@${ROW}?['AccessScope']`,
          } } } },
      },
      else: { actions: {
        Set_variable_Verification_Not_A_Directory_User: { type: 'SetVariable', runAfter: {}, inputs: { name: 'varStatusCode', value: 401 } },
        Append_to_string_variable_Verification_Not_A_Directory_User: { type: 'AppendToStringVariable', runAfter: ok('Set_variable_Verification_Not_A_Directory_User'),
          inputs: { name: 'varResponse', value: { ok: false, valid: false, verified: false, reason: 'NOT_A_DIRECTORY_USER', message: 'The code is correct, but this address is not an active user of the platform.' } } },
      } } };
  });
}

/* ---------------------------------------------------------------- the remaining internal endpoints (ITEM-76) */
/** The directory check for an endpoint whose only gate is the caller being a user (FETCH_EMAIL_ATTACHMENTS, the AI
 *  flow). Like permissionGate it decides only when the proof is required. Output Compose_<tag>_Auth: ok or
 *  unauthenticated. */
function directoryGate(tag) {
  const CALLER = `outputs('Compose_${tag}_Caller')`, DIR = `Get_${tag}_Directory_User`;
  return K.chain(
    { [DIR]: spGet(GOV_SITE, '3d591f5b-3f2f-409c-983a-a77b5c174834', `@if(empty(${CALLER}),'ID eq 0',concat('Email eq ''',replace(${CALLER},'''',''''''),''' and Status eq ''active'''))`) },
    { [`Compose_${tag}_Auth`]: { type: 'Compose', inputs: `@if(not(outputs('Compose_${tag}_Identity')?['proofRequired']),'ok',if(or(empty(${CALLER}),empty(coalesce(outputs('${DIR}')?['body/value'],json('[]')))),'unauthenticated','ok'))` } },
  );
}
/** S8 / ID-19: the run's Request ID is its own. The flow declares varRequestId above the pasted scope from the client's
 *  X-Correlation-ID or requestId; the scope now sets it to guid() before anything reads it. */
function ownRequestId(log, A, first) {
  edit(log, 'S8 / ID-19: the run sets its own Request ID (varRequestId = guid()) first. The flow declared it from the client\'s correlation id or requestId when one was sent.', () => {
    const starts = Object.entries(A).filter(([, a]) => !a.runAfter || !Object.keys(a.runAfter).length).map(([n]) => n);
    if (starts.length !== 1 || starts[0] !== first) throw new Error(`${first} is no longer the scope's first step (${starts.join(', ')})`);
    A.Set_variable_varRequestId = { type: 'SetVariable', inputs: { name: 'varRequestId', value: '@guid()' }, runAfter: {} };
    A[first].runAfter = ok('Set_variable_varRequestId');
  });
}
const BODY_EMAIL = "if(empty(triggerBody()?['payload']?['userEmail']),triggerBody()?['userEmail'],triggerBody()?['payload']?['userEmail'])";
/** IP_Reference_Data_Endpoint and IP_Get_Docs_Endpoint are built on one template: Scope_Global_<P> resolves the caller
 *  from userEmail, reads the directory row and the role's permissions, and a condition decides. In both, the condition was
 *  disconnected from that check: it reads two Composes that hold the literal true (Compose_temp_fix_caller,
 *  Compose_temp_fix_permtted), so the endpoint answered anyone, with no caller at all. */
function readTemplate(pkg, log, P, { first, fixNames, label }) {
  const A = pkg.serializedValue.actions;
  ownRequestId(log, A, first);
  const PR = `outputs('Compose_${P}_Gate_Identity')?['proofRequired']`;
  edit(log, `G-04: the caller is resolved as every identification package resolves it (see "Caller identity" above): from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail as today. The role is read from the directory row's Role choice, which the flow read as text and so never matched a RoleId.`, () => {
    const { parent } = locate(A, `Compose_${P}_Caller`);
    const c = parent[`Compose_${P}_Caller`];
    if (c.inputs !== `@toLower(trim(string(if(empty(triggerBody()?['payload']?['userEmail']),coalesce(triggerBody()?['userEmail'],''),triggerBody()?['payload']?['userEmail']))))`) throw new Error(`Compose_${P}_Caller changed in the source`);
    const gate = callerGate(`${P}_Gate`, BODY_EMAIL);
    gate[Object.keys(gate)[0]].runAfter = c.runAfter || {};
    Object.assign(parent, gate);
    c.runAfter = ok(`Compose_${P}_Gate_Caller`);
    c.inputs = `@outputs('Compose_${P}_Gate_Caller')`;
    const r = parent[`Compose_${P}_Role`];
    if (r.inputs !== `@toLower(trim(string(coalesce(first(body('Get_${P}_Directory_User')?['value'])?['Role'],''))))`) throw new Error(`Compose_${P}_Role changed in the source`);
    r.inputs = `@${ROLE_OF(`first(coalesce(body('Get_${P}_Directory_User')?['value'],json('[]')))`)}`;
  });
  edit(log, `A caller with no role-permission row made the read fail with 500: Compose_${P}_Permissions_Array and Compose_${P}_Routes_Array chose between json('[]') and json(<the row's text>) with if(), which evaluates both, and json('') throws. They now parse one string, '[]' when the row is absent or empty. With the switch true this is what lets a caller with no proof be answered 401 rather than 500.`, () => {
    const { parent } = locate(A, `Compose_${P}_Permissions_Array`);
    for (const [step, col] of [[`Compose_${P}_Permissions_Array`, 'PermissionsJson'], [`Compose_${P}_Routes_Array`, 'AllowedRoutesJson']]) {
      const X = `first(body('Get_${P}_Role_Permissions')?['value'])?['${col}']`;
      if (parent[step].inputs !== `@if(empty(${X}),json('[]'),json(string(${X})))`) throw new Error(`${step} changed in the source`);
      parent[step].inputs = `@json(if(empty(${X}),'[]',string(${X})))`;
    }
  });
  edit(log, `The ${label} answered anyone: Condition_${P}_Authorised read ${fixNames.slice(0, 2).join(' and ')}, which hold the literal true, in place of the caller and permission check the flow computes. Those steps (and ${fixNames[2]}, which only displayed the real values) are removed, and the condition decides on the caller: while IDENTITY_PROOF_REQUIRED is not true it passes as today; when it is true, the caller must be an active DGO_UserDirectory user resolved from a valid proof, else 401 UNAUTHENTICATED. The role's route and permission (Compose_${P}_Permitted) are still not enforced: which roles hold them is not recorded in this repository, and enforcing them unverified would lock officers out.`, () => {
    const { parent } = locate(A, `Condition_${P}_Authorised`);
    for (const n of fixNames.slice(0, 2)) if (parent[n]?.inputs !== true) throw new Error(`${n} no longer holds true`);
    if (!parent[fixNames[2]]) throw new Error(`${fixNames[2]} is gone from the source`);
    for (const n of fixNames) delete parent[n];
    const cond = parent[`Condition_${P}_Authorised`];
    if (!cond.runAfter[fixNames[1]]) throw new Error(`Condition_${P}_Authorised no longer runs after ${fixNames[1]}`);
    cond.runAfter = ok(`Compose_${P}_Permitted`);
    cond.expression = { and: [{ equals: [`@or(not(${PR}),and(not(empty(outputs('Compose_${P}_Caller'))),equals(length(coalesce(body('Get_${P}_Directory_User')?['value'],json('[]'))),1)))`, true] }] };
    let t = JSON.stringify(cond.else.actions);
    const E = `if(empty(outputs('Compose_${P}_Caller')),`;
    const swaps = [[`${E}400,`, `${E}if(${PR},401,400),`], [`${E}'INVALID_REQUEST',`, `${E}if(${PR},'UNAUTHENTICATED','INVALID_REQUEST'),`], [`${E}'userEmail is required.',`, `${E}if(${PR},'A valid sign-in is required.','userEmail is required.'),`]];
    for (const [a, b] of swaps) { const n = t.split(a).length - 1; if (!n) throw new Error(`the denied branch no longer reads ${a}`); t = t.split(a).join(b); }
    cond.else.actions = JSON.parse(t);
  });
  return A;
}
function referenceData(pkg, log) {
  const A = readTemplate(pkg, log, 'Lookups', { first: 'Scope_Lookups_Fetch', fixNames: ['Compose_temp_fix_permtted', 'Compose_temp_fix_caller', 'Compose_actual_expressions_Condition_Lookups_Authorised'], label: 'reference data endpoint' });
  const auth = locate(A, 'Condition_Lookups_Authorised').a.actions;
  edit(log, 'Directory and reference data as Folio reads them, as FETCH_ALL\'s package reads them (ported from the retired DGO_REFERENCE_DATA design, registers/flow-retirement.json): the directory is read in pages to 5,000 rows (it holds 852; the flow read one page of 500), Role, Persona and Status are served as text rather than Choice objects, and Departments and Categories, imported from spreadsheets so GetItems returns field_1…field_N, are read by those internal names. The keys Folio reads are unchanged.', () => {
    const users = auth.Get_Lookup_Users;
    if (users.inputs.parameters.$top !== 500 || users.runtimeConfiguration) throw new Error('Get_Lookup_Users changed in the source');
    users.inputs.parameters.$top = 5000;
    users.runtimeConfiguration = { paginationPolicy: { minimumItemCount: 5000 } };
    const text = (col) => `@string(coalesce(json(if(startsWith(string(coalesce(item()?['${col}'],'')),'{'),string(item()?['${col}']),concat('{"Value":"',replace(string(coalesce(item()?['${col}'],'')),'"',''),'"}')))?['Value'],''))`;
    const su = auth.Select_Lookup_Users.inputs.select;
    for (const c of ['Role', 'Persona', 'Status']) { if (su[c] !== `@item()?['${c}']`) throw new Error(`Select_Lookup_Users.${c} changed in the source`); su[c] = text(c); }
    const sd = auth.Select_Lookup_Departments.inputs.select;
    if (sd.DSU_KEY !== "@item()?['DSU_KEY']") throw new Error('Select_Lookup_Departments changed in the source');
    Object.assign(sd, { DSU_KEY: "@item()?['field_1']", DSU_Email: "@item()?['field_2']", DSU_HeadEmail: "@item()?['field_3']", DSU_HeadTitle: "@item()?['field_6']" });
    const sc = auth.Select_Lookup_Categories;
    if (sc.inputs.select.DSU_KEY !== "@item()?['DSU_KEY']") throw new Error('Select_Lookup_Categories changed in the source');
    sc.inputs.select = { ID: "@item()?['ID']", Title: "@item()?['Title']", Category: "@item()?['Title']", Subcategory: "@item()?['field_2']",
      'Category Code': "@item()?['field_1']", 'SubCategory Code': "@item()?['field_3']", DSU_KEY: "@item()?['field_4']",
      'Default Primary Responsible': "@item()?['field_4']", 'Default Supporting Department/Unit': "@item()?['field_5']",
      INFORMDSU1: "@item()?['field_6']", INFORMDSU2: "@item()?['field_7']", INFORMDSU3: "@item()?['field_8']",
      Priority: "@item()?['field_14']", Timeline: "@item()?['field_9']" };
    const v = auth.Set_Lookups_Success_Data.inputs.value;
    if (v.limits?.users !== 500) throw new Error('Set_Lookups_Success_Data limits changed in the source');
    v.limits.users = 5000;
  });
  edit(log, 'The full directory only to a holder of user:view (or of every route, "*"), as the retired DGO_REFERENCE_DATA design served it. Every caller gets every active user\'s UserId, FullName, Email, Directorate and Department, which the Workspace needs to address and assign; Role, Persona, Status, AccessScope and PilotCohort are served for the caller\'s own row and, to anyone else, as null. The rows and their keys are unchanged; one Select does it, so no Filter array is pasted.', () => {
    const PROW = "first(coalesce(body('Get_Lookups_Role_Permissions')?['value'],json('[]')))";
    auth.Compose_Lookups_Sees_Directory = { type: 'Compose', runAfter: {}, inputs: `@or(contains(string(coalesce(${PROW}?['AllowedRoutesJson'],'')),'"*"'),contains(string(coalesce(${PROW}?['PermissionsJson'],'')),'user:view'))` };
    const s = auth.Select_Lookup_Users;
    s.runAfter = { ...s.runAfter, Compose_Lookups_Sees_Directory: ['Succeeded'] };
    const seen = `or(outputs('Compose_Lookups_Sees_Directory'),equals(toLower(trim(string(coalesce(item()?['Email'],'')))),outputs('Compose_Lookups_Caller')))`;
    for (const c of ['Role', 'Persona', 'Status', 'AccessScope', 'PilotCohort']) {
      const v = s.inputs.select[c];
      if (typeof v !== 'string' || !v.startsWith('@')) throw new Error(`Select_Lookup_Users.${c} is not an expression`);
      s.inputs.select[c] = `@if(${seen},${v.slice(1)},null)`;
    }
  });
}
function getDocs(pkg, log) {
  readTemplate(pkg, log, 'GetDocs', { first: 'Scope_GetDocs_Data_Processing', fixNames: ['Compose_temp_fix_permtted', 'Compose_temp_fix_caller', 'Compose_actual_condition_expressions'], label: 'documents endpoint (GET_DOCS and FETCH_ACTIVITIES)' });
}
function sendEmail(pkg, log) {
  const A = pkg.serializedValue.actions;
  ownRequestId(log, A, 'Scope_Global_SendEmail');
  edit(log, 'G-04: the caller is resolved from the sign-in proof when one is valid; else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail as today. The flow\'s own directory check then decides: with the switch true and no valid proof the caller is nobody, no directory row matches, and Condition_SendEmail_Known_Caller answers 401 UNAUTHENTICATED; nothing is sent.', () => {
    const { parent } = locate(A, 'Compose_SendEmail_Caller');
    const c = parent.Compose_SendEmail_Caller;
    if (c.inputs !== "@toLower(trim(string(coalesce(triggerBody()?['payload']?['userEmail'],triggerBody()?['userEmail'],''))))") throw new Error('Compose_SendEmail_Caller changed in the source');
    const gate = callerGate('SendEmail_Gate', "coalesce(triggerBody()?['payload']?['userEmail'],triggerBody()?['userEmail'])");
    gate[Object.keys(gate)[0]].runAfter = c.runAfter || {};
    Object.assign(parent, gate);
    c.runAfter = ok('Compose_SendEmail_Gate_Caller');
    c.inputs = "@outputs('Compose_SendEmail_Gate_Caller')";
    if (!/outputs\('Compose_SendEmail_Caller'\)/.test(JSON.stringify(parent.Get_SendEmail_Directory_User.inputs))) throw new Error('Get_SendEmail_Directory_User no longer reads the caller');
  });
}
function emailAttachments(pkg, log) {
  const A = pkg.serializedValue.actions;
  const T = locate(A, 'Scope_Try_Email_Attachments').a.actions;
  edit(log, 'G-04: the endpoint had no caller check at all: anyone holding its URL could read the attachments of any message in the mailbox by its id. It now resolves the caller from the sign-in proof (else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail) and looks the caller up in DGO_UserDirectory. While the switch is not true it answers as today; when it is true, a caller who is not an active directory user resolved from a valid proof gets 401 UNAUTHENTICATED and no message is read. The steps are SharePoint reads, so the flow gains a SharePoint connection (the one the other endpoint flows use).', () => {
    if (JSON.stringify(T.Compose_EmailMessageId.runAfter || {}) !== '{}') throw new Error('Compose_EmailMessageId is no longer the first step');
    const gate = K.chain(callerGate('Attachments_Gate', "coalesce(triggerBody()?['userEmail'],triggerBody()?['payload']?['userEmail'])"), directoryGate('Attachments_Gate'));
    Object.assign(T, gate);
    T.Compose_EmailMessageId.runAfter = ok('Compose_Attachments_Gate_Auth');
    const cond = T.Condition_EmailId_Valid;
    if (JSON.stringify(cond.expression) !== JSON.stringify({ and: [{ equals: ["@not(empty(outputs('Compose_EmailMessageId')))", true] }] })) throw new Error('Condition_EmailId_Valid changed in the source');
    const AUTH = "equals(outputs('Compose_Attachments_Gate_Auth'),'ok')";
    cond.expression = { and: [{ equals: [`@${AUTH}`, true] }, { equals: ["@not(empty(outputs('Compose_EmailMessageId')))", true] }] };
    const e = cond.else.actions;
    if (e.Set_Invalid_Status.inputs.value !== 400 || e.Set_Invalid_Outcome.inputs.value !== 'INVALID_REQUEST' || e.Append_Invalid_Request_Error.inputs.value.code !== 'EMAIL_ID_REQUIRED') throw new Error('the invalid branch changed in the source');
    e.Set_Invalid_Status.inputs.value = `@if(${AUTH},400,401)`;
    e.Set_Invalid_Outcome.inputs.value = `@if(${AUTH},'INVALID_REQUEST','UNAUTHENTICATED')`;
    e.Append_Invalid_Request_Error.inputs.value = { code: `@if(${AUTH},'EMAIL_ID_REQUIRED','UNAUTHENTICATED')`, message: `@if(${AUTH},'The emailId property is required and must not be empty.','A valid sign-in is required.')` };
  });
}
const SP_CONNECTION = '3f1943c5955a4cb8b301e8f22f2b590d';
const AI_CAPTURE = 'AI_Document_Processing__';
function aiGate(log) {
  const A = {};
  edit(log, 'G-04: AI_Document_Processing (AI_EMAIL_ANALYSIS, AI_DOC_ANALYSIS, AI_CHAT) had no caller check: it read any DGO DIGITAL OPS item\'s attachments and sent them to an external model for anyone holding its URL. Its steps sit at the top level of the flow, so this is an added scope, not a replacement: it resolves the caller from the sign-in proof (else, while IDENTITY_PROOF_REQUIRED is not true, from userEmail) and looks the caller up in DGO_UserDirectory. While the switch is not true it does nothing visible; when it is true, a caller who is not an active directory user resolved from a valid proof gets 401 UNAUTHENTICATED and the run stops before any item is read.', () => {
    Object.assign(A, K.chain(callerGate('AI_Gate', "coalesce(triggerBody()?['userEmail'],triggerBody()?['payload']?['userEmail'])"), directoryGate('AI_Gate')));
    A.Condition_AI_Gate_Refused = { type: 'If', runAfter: ok('Compose_AI_Gate_Auth'),
      expression: { and: [{ not: { equals: ["@outputs('Compose_AI_Gate_Auth')", 'ok'] } }] },
      actions: {
        Response_AI_Gate_Unauthenticated: { type: 'Response', kind: 'Http', runAfter: {}, inputs: { statusCode: 401, headers: { 'Content-Type': 'application/json' },
          body: { ok: false, status: { http: 401, code: 'UNAUTHENTICATED', message: 'A valid sign-in is required.' }, data: { code: 'UNAUTHENTICATED' }, errors: [{ code: 'UNAUTHENTICATED' }] } } },
        Terminate_AI_Gate: { type: 'Terminate', runAfter: ok('Response_AI_Gate_Unauthenticated'), inputs: { runStatus: 'Cancelled' } },
      },
      else: { actions: {} } };
  });
  edit(log, 'Security (ITEM-75): the flow\'s HTTP action sends an OpenRouter key as literal text in its Authorization header, so every copy of the definition carries it. This scope reads the key from Flow Configuration (OPENROUTER_API_KEY) and composes the header value, Compose_OpenRouter_Authorization = "Bearer <key>". After pasting, set the HTTP action\'s Authorization header to @{outputs(\'Compose_OpenRouter_Authorization\')}: that one field is the only edit outside this scope, and afterwards the definition holds no key. With no row the value is "Bearer " and the AI call is refused by OpenRouter rather than sent with the old key.', () => {
    A.Get_OpenRouter_Key = { ...CFG_GET('Get_OpenRouter_Key', "Title eq 'OPENROUTER_API_KEY'"), runAfter: ok('Condition_AI_Gate_Refused') };
    A.Compose_OpenRouter_Authorization = { type: 'Compose', runAfter: { Get_OpenRouter_Key: ['Succeeded', 'Failed', 'TimedOut'] },
      inputs: "@concat('Bearer ',trim(string(coalesce(first(coalesce(outputs('Get_OpenRouter_Key')?['body/value'],json('[]')))?['ConfigValue'],''))))" };
  });
  const pkg = { nodeId: 'Scope_AI_Caller_Gate', serializedValue: { type: 'Scope', actions: A, runAfter: {} }, allConnectionData: {}, staticResults: {}, isScopeNode: true, mslaNode: true };
  pkg.allConnectionData = captureConnections(pkg, AI_CAPTURE);
  return pkg;
}

/* IP_OTP_GENERATE's scope: the built OTP_VERIFY package without Case_Verify, and without the connections only it used. */
function otpGenerateOnly(verifyPkg) {
  const pkg = structuredClone(verifyPkg);
  const sw = pkg.serializedValue.actions.Switch;
  if (!sw?.cases?.Case_Verify || !sw.cases.Case_Generate) throw new Error('OTP_VERIFY no longer has Case_Generate and Case_Verify');
  delete sw.cases.Case_Verify;
  const kept = names(pkg.serializedValue.actions);
  pkg.allConnectionData = Object.fromEntries(Object.entries(pkg.allConnectionData).filter(([n]) => kept.has(n)));
  return pkg;
}

/* Owner direction 2026-10-10 ("fix all defects"; handbook 10-TROUBLESHOOTING §10.6): a code is created and mailed only to an
   active DGO_UserDirectory member, so the registry mailbox cannot be made to mail any address. The reply is the same
   either way, so the endpoint does not tell a caller which addresses are users. */
function otpGenerateDirectory(pkg, log) {
  edit(log, 'Codes go only to active directory users: Case_Generate looks the address up in DGO_UserDirectory (active rows) and creates and mails the code only when it is found. The reply (200, OTP sent, the expiry) is the same for any address, so the endpoint does not reveal who is a user; IP_OTP_VERIFY still refuses a proof to anyone outside the directory.', () => {
    const G = pkg.serializedValue.actions.Switch?.cases?.Case_Generate?.actions;
    if (!G) throw new Error('OTP_GENERATE has no Case_Generate');
    const want = ['Compose_OTP_Expiry', 'Create_item_OTP_Record', 'Send_an_email_(V2)', 'Append_to_string_variable_varResponse_Generate_OTP', 'Set_variable_varStatusCode_Generate_OTP'];
    if (Object.keys(G).sort().join() !== [...want].sort().join()) throw new Error(`Case_Generate changed in the source: ${Object.keys(G).join(', ')}`);
    if (G['Send_an_email_(V2)'].runAfter?.Create_item_OTP_Record?.[0] !== 'Succeeded' || G.Append_to_string_variable_varResponse_Generate_OTP.runAfter?.['Send_an_email_(V2)']?.[0] !== 'Succeeded') throw new Error('Case_Generate order changed in the source');
    const reply = G.Append_to_string_variable_varResponse_Generate_OTP;
    if (reply.inputs.value?.expiry_minutes !== "@{outputs('Create_item_OTP_Record')?['body/Expires_At']}") throw new Error('the generate reply changed in the source');
    const EMAIL = "toLower(trim(string(coalesce(triggerBody()?['identifier'],''))))";
    const create = G.Create_item_OTP_Record, send = G['Send_an_email_(V2)'];
    delete G.Create_item_OTP_Record; delete G['Send_an_email_(V2)'];
    G.Get_Otp_Generate_Directory_User = { ...spGet(GOV_SITE, '3d591f5b-3f2f-409c-983a-a77b5c174834', `@if(empty(${EMAIL}),'ID eq 0',concat('Email eq ''',replace(${EMAIL},'''',''''''),''' and Status eq ''active'''))`), runAfter: ok('Compose_OTP_Expiry') };
    G.Condition_Otp_Generate_Known_User = { type: 'If', runAfter: ok('Get_Otp_Generate_Directory_User'),
      expression: { greater: ["@length(coalesce(outputs('Get_Otp_Generate_Directory_User')?['body/value'],json('[]')))", 0] },
      actions: { Create_item_OTP_Record: { ...create, runAfter: {} }, 'Send_an_email_(V2)': send }, else: { actions: {} } };
    reply.runAfter = ok('Condition_Otp_Generate_Known_User');
    reply.inputs.value = { ...reply.inputs.value, expiry_minutes: "@{outputs('Compose_OTP_Expiry')}" };
    pkg.allConnectionData.Get_Otp_Generate_Directory_User = structuredClone(pkg.allConnectionData.Create_item_OTP_Record);
  });
}


/* ---------------------------------------------------------------- AUTO_SCHEDULED_SWEEP: one digest per person */
/* Owner direction 2026-10-10: the sweep sent one e-mail per task, so a person with many overdue tasks received many
   e-mails at once. It now sends each person one e-mail listing all their items, once a working day, and while
   NOTIFY_SWEEP_RECIPIENTS is not 'staff' every digest goes to the registry (opsTo) instead, so nobody is written to
   before the platform is commissioned. */
const SWEEP_CAPTURE = 'AUTO_SCHEDULED_SWEEP__';
function sweepDigest(log) {
  const pkg = fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith(SWEEP_CAPTURE)), 'Scope_ScheduledSweep_Flow');
  const A = pkg.serializedValue.actions;
  const G = locate(A, 'Scope_Global_ScheduledSweep').a.actions;
  edit(log, 'Owner direction 2026-10-10: one e-mail per person, not one per task. The acknowledgement-overdue and task-overdue loops are replaced by a digest: the eligible tasks of both (the same rules: not acknowledged or not completed, a single valid address) are gathered, and each person receives one e-mail listing all their items, at most once a day (a receipt task-digest:<address>:<date> is written and checked). Until Flow Configuration NOTIFY_SWEEP_RECIPIENTS is staff, every digest goes to the registry (NOTIFY_OPS_TO) with the intended person named, and the closed-support-case notices go there too: nobody outside the registry is written to before commissioning. The working-hours and NOTIFY_ENABLED switches still apply.', () => {
    const drop = ['Get_Ack_Receipts', 'Select_Ack_Receipts', 'Compose_Ack_Receipts_Xml', 'Foreach_Ack_Overdue', 'Compose_Sweep_Section_Ack', 'Get_Due_Receipts', 'Select_Due_Receipts', 'Compose_Due_Receipts_Xml', 'Foreach_Due_Breached', 'Compose_Sweep_Section_Due'];
    for (const n of drop) { if (!G[n]) throw new Error(`the sweep has no ${n}`); delete G[n]; }
    if (!G.Get_Ack_Tasks || !G.Get_Due_Tasks || !G.Get_Closed_Support_Cases || !G.Compose_Sweep_Sections) throw new Error('the sweep changed in the source');
    const cfg = G.Compose_Notify_Config.inputs;
    if (!cfg.opsTo || 'staffRecipients' in cfg) throw new Error('Compose_Notify_Config changed in the source');
    cfg.staffRecipients = "@equals(toLower(trim(string(xpath(outputs('Compose_Notify_Config_Xml'),'string(/r/i[k=\"NOTIFY_SWEEP_RECIPIENTS\"]/v)')))),'staff')";
    const LIVE = "outputs('Compose_Notify_Config')?['staffRecipients']";
    const OPS = "outputs('Compose_Notify_Config')?['opsTo']";
    const TO = (x) => `toLower(trim(string(coalesce(${x}?['AssignedTo'],''))))`;
    const VALID = (x) => `not(or(empty(${TO(x)}),greater(length(${TO(x)}),255),not(equals(length(split(${TO(x)},'@')),2)),startsWith(${TO(x)},'@'),endsWith(${TO(x)},'@'),contains(${TO(x)},' '),contains(${TO(x)},';'),contains(${TO(x)},','),not(contains(string(last(split(${TO(x)},'@'))),'.')),endsWith(${TO(x)},'.')))`;
    const NOT_DONE = (x) => `not(contains(toLower(string(coalesce(${x}?['Progress']?['Value'],''))),'complet'))`;
    const ESC = (v) => `replace(replace(replace(replace(replace(string(${v}),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')`;
    const REF = (x) => `if(not(empty(string(coalesce(${x}?['TaskRef'],'')))),string(${x}?['TaskRef']),if(not(empty(string(coalesce(${x}?['Reference_ID'],'')))),string(${x}?['Reference_ID']),string(${x}?['ID'])))`;
    const ROW = (kind, dateCol) => ({ to: `@${TO('item()')}`, kind, ref: `@${ESC(REF('item()'))}`, title: `@if(empty(string(coalesce(item()?['Title'],''))),'(untitled task)',${ESC("item()?['Title']")})`,
      date: `@if(empty(string(coalesce(item()?['${dateCol}'],''))),'',formatDateTime(convertFromUtc(item()?['${dateCol}'],'W. Central Africa Standard Time'),'d MMM yyyy'))` });
    const DAY = "formatDateTime(convertFromUtc(utcNow(),'W. Central Africa Standard Time'),'yyyy-MM-dd')";
    const RECEIPTS_T = '88a81ca1-319a-45f5-8409-f91a24538ffa', RECEIPTS_S = 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre';
    const spHost = (operationId) => ({ apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: G.Get_Ack_Tasks.inputs.host.connection, operationId });
    G.Get_Due_Tasks.runAfter = { Get_Ack_Tasks: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] };
    Object.assign(G, {
      Filter_Digest_Ack: { type: 'Query', runAfter: { Get_Due_Tasks: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
        inputs: { from: "@coalesce(outputs('Get_Ack_Tasks')?['body/value'],json('[]'))", where: `@and(not(equals(toLower(string(coalesce(item()?['Acknowledge_x0020_Task']?['Value'],''))),'acknowledged')),${NOT_DONE('item()')},${VALID('item()')})` } },
      Filter_Digest_Due: { type: 'Query', runAfter: ok('Filter_Digest_Ack'),
        inputs: { from: "@coalesce(outputs('Get_Due_Tasks')?['body/value'],json('[]'))", where: `@and(${NOT_DONE('item()')},${VALID('item()')})` } },
      Select_Digest_Ack: { type: 'Select', runAfter: ok('Filter_Digest_Due'), inputs: { from: "@body('Filter_Digest_Ack')", select: ROW('Acknowledge receipt', 'Acknowledgement_x0020_Due_x0020_') } },
      Select_Digest_Due: { type: 'Select', runAfter: ok('Select_Digest_Ack'), inputs: { from: "@body('Filter_Digest_Due')", select: ROW('Overdue', 'DueDate') } },
      Compose_Digest_Items: { type: 'Compose', runAfter: ok('Select_Digest_Due'), inputs: "@union(coalesce(body('Select_Digest_Ack'),json('[]')),coalesce(body('Select_Digest_Due'),json('[]')))" },
      Select_Digest_Recipients: { type: 'Select', runAfter: ok('Compose_Digest_Items'), inputs: { from: "@outputs('Compose_Digest_Items')", select: "@item()?['to']" } },
      Compose_Digest_Recipients: { type: 'Compose', runAfter: ok('Select_Digest_Recipients'), inputs: "@union(body('Select_Digest_Recipients'),body('Select_Digest_Recipients'))" },
      Get_Digest_Receipts: { type: 'OpenApiConnection', runAfter: ok('Compose_Digest_Recipients'), inputs: { host: spHost('GetItems'), parameters: { dataset: RECEIPTS_S, table: RECEIPTS_T,
        $filter: `@concat('MessageType eq ''task-digest'' and SentAtUtc ge ''',formatDateTime(addDays(utcNow(),-1),'yyyy-MM-ddTHH:mm:ssZ'),'''')`, $top: 5000 } } },
      Select_Digest_Sent: { type: 'Select', runAfter: ok('Get_Digest_Receipts'), inputs: { from: "@coalesce(outputs('Get_Digest_Receipts')?['body/value'],json('[]'))", select: "@if(equals(toLower(string(coalesce(item()?['Status'],''))),'sent'),string(item()?['Title']),'')" } },
      Condition_Digest_Window: { type: 'If', runAfter: ok('Select_Digest_Sent'),
        expression: { and: [{ equals: ["@outputs('Compose_In_Working_Hours')", true] }, { equals: ["@outputs('Compose_Notify_Config')?['enabled']", true] }] },
        actions: { Foreach_Digest_Recipient: { type: 'Foreach', runAfter: {}, foreach: "@coalesce(outputs('Compose_Digest_Recipients'),json('[]'))", runtimeConfiguration: { concurrency: { repetitions: 1 } }, actions: {
          Compose_Digest_Key: { type: 'Compose', runAfter: {}, inputs: `@concat('task-digest:',items('Foreach_Digest_Recipient'),':',${DAY})` },
          Condition_Digest_Not_Sent: { type: 'If', runAfter: ok('Compose_Digest_Key'),
            expression: { and: [{ equals: ["@contains(body('Select_Digest_Sent'),outputs('Compose_Digest_Key'))", false] }] },
            actions: {
              Filter_Digest_Mine: { type: 'Query', runAfter: {}, inputs: { from: "@outputs('Compose_Digest_Items')", where: "@equals(item()?['to'],items('Foreach_Digest_Recipient'))" } },
              Select_Digest_Rows: { type: 'Select', runAfter: ok('Filter_Digest_Mine'), inputs: { from: "@body('Filter_Digest_Mine')",
                select: "@concat('<tr><td style=\"padding:8px 10px;border-bottom:1px solid #E8E6E7;font:600 13px Arial,sans-serif;color:#05583B;white-space:nowrap\">',item()?['ref'],'</td><td style=\"padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#1B1A1A\">',item()?['title'],'</td><td style=\"padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#1B1A1A;white-space:nowrap\">',item()?['kind'],'</td><td style=\"padding:8px 10px;border-bottom:1px solid #E8E6E7;font:13px Arial,sans-serif;color:#5F5C5D;white-space:nowrap\">',item()?['date'],'</td></tr>')" } },
              Compose_Digest_Html: { type: 'Compose', runAfter: ok('Select_Digest_Rows'), inputs: "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Your Folio tasks</title></head><body style=\"margin:0;padding:0;background:#FAFAF9;\"><table role=\"presentation\" width=\"100%\" style=\"background:#FAFAF9\"><tr><td align=\"center\" style=\"padding:24px 12px\"><table role=\"presentation\" width=\"640\" style=\"max-width:640px;width:100%;background:#FFFFFF;border:1px solid #E8E6E7;border-radius:8px\"><tr><td style=\"padding:20px 24px;border-bottom:3px solid #05583B\"><img src=\"@{outputs('Compose_Notify_Config')?['logoSrc']}\" alt=\"NITDA\" height=\"40\" style=\"display:block;height:40px\"></td></tr>@{if(equals(outputs('Compose_Notify_Config')?['staffRecipients'],true),'',concat('<tr><td style=\"padding:12px 24px;background:#FBF1D8;font:13px Arial,sans-serif;color:#5A3F00\">Commissioning: this digest is for ',items('Foreach_Digest_Recipient'),'. It comes to the registry until Flow Configuration NOTIFY_SWEEP_RECIPIENTS is staff.</td></tr>'))}<tr><td style=\"padding:20px 24px 8px 24px;font:20px Arial,sans-serif;color:#1B1A1A\">Your tasks needing attention</td></tr><tr><td style=\"padding:0 24px 16px 24px;font:14px Arial,sans-serif;color:#373435\">You have @{length(body('Filter_Digest_Mine'))} task(s) in Folio that are overdue or not yet acknowledged. Open each one in Folio to acknowledge it or bring it up to date.</td></tr><tr><td style=\"padding:0 24px 16px 24px\"><table role=\"presentation\" width=\"100%\" style=\"border-collapse:collapse\"><tr><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Reference</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Task</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Needs</th><th align=\"left\" style=\"padding:8px 10px;background:#F5F4F4;font:600 12px Arial,sans-serif;color:#373435\">Due</th></tr>@{join(body('Select_Digest_Rows'),'')}</table></td></tr><tr><td style=\"padding:0 24px 24px 24px\"><a href=\"https://folio-platform.page.gd/acknowledge.html\" style=\"display:inline-block;padding:10px 18px;background:#05583B;color:#FFFFFF;font:600 14px Arial,sans-serif;text-decoration:none;border-radius:6px\">Open Folio</a></td></tr><tr><td style=\"padding:14px 24px;border-top:1px solid #E8E6E7;font:12px Arial,sans-serif;color:#5F5C5D\">One e-mail a working day lists everything that needs you. National Information Technology Development Agency.</td></tr></table></td></tr></table></body></html>" },
              Send_Digest_Email: { type: 'OpenApiConnection', runAfter: ok('Compose_Digest_Html'), inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' }, parameters: {
                'emailMessage/To': `@if(equals(${LIVE},true),items('Foreach_Digest_Recipient'),${OPS})`,
                'emailMessage/Subject': `@concat('Folio: ',string(length(body('Filter_Digest_Mine'))),' task(s) need your attention',if(equals(${LIVE},true),'',concat(' (for ',items('Foreach_Digest_Recipient'),')')))`,
                'emailMessage/Body': "@outputs('Compose_Digest_Html')", 'emailMessage/ReplyTo': "@outputs('Compose_Notify_Config')?['replyTo']", 'emailMessage/Importance': 'Normal' } } },
              Create_Digest_Receipt: { type: 'OpenApiConnection', runAfter: { Send_Digest_Email: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { host: spHost('PostItem'), parameters: { dataset: RECEIPTS_S, table: RECEIPTS_T,
                'item/Title': "@outputs('Compose_Digest_Key')", 'item/MessageType': 'task-digest',
                'item/RecipientEmail': `@if(equals(${LIVE},true),items('Foreach_Digest_Recipient'),${OPS})`, 'item/Reference': "@items('Foreach_Digest_Recipient')",
                'item/SentAtUtc': '@utcNow()', 'item/Status': "@if(equals(string(coalesce(actions('Send_Digest_Email')?['status'],'')),'Succeeded'),'sent','failed')", 'item/Attempts': 1,
                'item/LastError': "@if(equals(string(coalesce(actions('Send_Digest_Email')?['status'],'')),'Succeeded'),'',substring(string(coalesce(actions('Send_Digest_Email')?['error']?['message'],'send failed')),0,min(length(string(coalesce(actions('Send_Digest_Email')?['error']?['message'],'send failed'))),900)))" } } },
              /* ITEM-66: fails exactly when the send failed, so the sweep's sections report it and the failure alert fires. */
              'Compose_Send_Digest_Email_Outcome': { type: 'Compose', runAfter: { Create_Digest_Receipt: ['Succeeded', 'Failed', 'Skipped', 'TimedOut'] },
                inputs: "@int(if(or(equals(actions('Send_Digest_Email')?['status'],'Failed'),equals(actions('Send_Digest_Email')?['status'],'TimedOut')),'send-failed','0'))" },
            },
            else: { actions: {} } },
        } } },
        else: { actions: {} } },
      Compose_Sweep_Section_Digest: { type: 'Compose', runAfter: { Condition_Digest_Window: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'], Select_Digest_Sent: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
        inputs: "@if(and(equals(string(coalesce(actions('Get_Ack_Tasks')?['status'],'')),'Succeeded'),equals(string(coalesce(actions('Get_Due_Tasks')?['status'],'')),'Succeeded'),equals(string(coalesce(actions('Get_Digest_Receipts')?['status'],'')),'Succeeded')),string(coalesce(actions('Condition_Digest_Window')?['status'],'Skipped')),'Failed')" },
    });
    /* RN-035 (owner decision, 2026-10-18): a reminder set in Folio (DGO_TaskReminders, written by DYNAMIC_ACTIONS upsert-record
       RMD) is sent to its assignee once DueAtUtc has passed, in working hours, and marked sent or failed so it goes once. */
    const RMD_S = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING', RMD_T = '2f42abf5-f425-4714-9046-ffa6c0bb7151';
    const R = (k) => `items('Foreach_Due_Reminder')?['${k}']`;
    const RTO = `toLower(trim(string(coalesce(${R('AssignedTo')},''))))`;
    Object.assign(G, {
      Get_Due_Reminders: { type: 'OpenApiConnection', runAfter: { Compose_Sweep_Section_Digest: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }, inputs: { host: spHost('GetItems'), parameters: { dataset: RMD_S, table: RMD_T,
        $filter: "@concat('ReminderStatus eq ''scheduled'' and DueAtUtc le ''',formatDateTime(utcNow(),'yyyy-MM-ddTHH:mm:ssZ'),'''')", $top: 200 } } },
      Condition_Reminder_Window: { type: 'If', runAfter: { Get_Due_Reminders: ['Succeeded'] },
        expression: { and: [{ equals: ["@outputs('Compose_In_Working_Hours')", true] }, { equals: ["@outputs('Compose_Notify_Config')?['enabled']", true] }] },
        actions: { Foreach_Due_Reminder: { type: 'Foreach', runAfter: {}, foreach: "@coalesce(outputs('Get_Due_Reminders')?['body/value'],json('[]'))", runtimeConfiguration: { concurrency: { repetitions: 1 } }, actions: {
          Compose_Reminder_Row: { type: 'Compose', runAfter: {},
            inputs: `@concat('<tr><td style="padding:9px 10px;border-bottom:1px solid #E8E6E7;font:600 13px Verdana,Geneva,sans-serif;color:#05583B;white-space:nowrap">',${ESC(`coalesce(${R('RefIDD')},'')`)},'</td><td style="padding:9px 10px;border-bottom:1px solid #E8E6E7;font:13px Verdana,Geneva,sans-serif;color:#1B1A1A">',${ESC(`coalesce(${R('Title')},'')`)},'</td><td style="padding:9px 10px;border-bottom:1px solid #E8E6E7;font:13px Verdana,Geneva,sans-serif;color:#1B1A1A">',${ESC(`coalesce(${R('Note')},'')`)},'</td><td style="padding:9px 10px;border-bottom:1px solid #E8E6E7;font:13px Verdana,Geneva,sans-serif;color:#1B1A1A;white-space:nowrap">',formatDateTime(convertFromUtc(${R('DueAtUtc')},'W. Central Africa Standard Time'),'d MMM yyyy HH:mm'),'</td></tr>')` },
          Compose_Task_Reminder_Html: { type: 'Compose', runAfter: ok('Compose_Reminder_Row'), inputs: '<p>Task reminder</p>' },
          Send_Task_Reminder_Email: { type: 'OpenApiConnection', runAfter: ok('Compose_Task_Reminder_Html'), inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' }, parameters: {
            'emailMessage/To': `@if(equals(${LIVE},true),${RTO},${OPS})`,
            'emailMessage/Subject': `@concat('Reminder: ',string(coalesce(${R('RefIDD')},'')),' — ',string(coalesce(${R('Title')},'')),if(equals(${LIVE},true),'',concat(' (for ',${RTO},')')))`,
            'emailMessage/Body': "@outputs('Compose_Task_Reminder_Html')", 'emailMessage/ReplyTo': "@outputs('Compose_Notify_Config')?['replyTo']", 'emailMessage/Importance': 'Normal' } } },
          Patch_Reminder_Status: { type: 'OpenApiConnection', runAfter: { Send_Task_Reminder_Email: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: { host: spHost('PatchItem'), parameters: { dataset: RMD_S, table: RMD_T,
            id: `@${R('ID')}`, 'item/Title': `@${R('Title')}`,
            'item/ReminderStatus': "@if(equals(string(coalesce(actions('Send_Task_Reminder_Email')?['status'],'')),'Succeeded'),'sent','failed')", 'item/SentAtUtc': '@utcNow()' } } },
        } } },
        else: { actions: {} } },
      Compose_Sweep_Section_Reminders: { type: 'Compose', runAfter: { Condition_Reminder_Window: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
        inputs: "@if(equals(string(coalesce(actions('Get_Due_Reminders')?['status'],'')),'Succeeded'),string(coalesce(actions('Condition_Reminder_Window')?['status'],'Skipped')),'Failed')" },
    });
    G.Get_Closed_Support_Cases.runAfter = { Compose_Sweep_Section_Reminders: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] };
    const sec = G.Compose_Sweep_Sections.inputs;
    delete sec.acknowledgementOverdue; delete sec.taskOverdue;
    G.Compose_Sweep_Sections.inputs = { digest: "@outputs('Compose_Sweep_Section_Digest')", reminders: "@outputs('Compose_Sweep_Section_Reminders')", remindersDue: "@length(coalesce(outputs('Get_Due_Reminders')?['body/value'],json('[]')))", digestRecipients: "@length(coalesce(outputs('Compose_Digest_Recipients'),json('[]')))", staffRecipients: `@${LIVE}`, ...sec };
    const caseSend = locate(A, 'Send_Case_Email').a;
    const was = caseSend.inputs.parameters['emailMessage/To'];
    if (was !== "@toLower(trim(string(coalesce(items('Foreach_Closed_Case')?['Email'],''))))") throw new Error('Send_Case_Email recipient changed in the source');
    caseSend.inputs.parameters['emailMessage/To'] = `@if(equals(${LIVE},true),toLower(trim(string(coalesce(items('Foreach_Closed_Case')?['Email'],'')))),${OPS})`;
  });
  return pkg;
}

/* Tenant defect found 2026-10-12 (run 08584097726339433081123807376CU29): a task raised from an e-mail sent its assignee two
   notices, the second from Scope_3, a second template run after the first send. One task, one notice. */
function emailTaskOneNotice(pkg, log) {
  edit(log, 'Tenant defect 2026-10-12: a task raised from an e-mail sent the assignee two near-identical notices (Send_an_email_(V2)_Main_1_1_1, then Scope_3\'s Send_an_email_(V2)_Main_1_1_2, the same task and links). Scope_3 is removed, so one task sends one notice; the notification count follows the one send.', () => {
    const { a: scope } = locate(pkg.serializedValue.actions, 'Scope_Task_Email_Notification');
    const A = scope.actions;
    if (!A.Scope_3?.actions?.['Send_an_email_(V2)_Main_1_1_2'] || !A['Send_an_email_(V2)_Main_1_1_1']) throw new Error('the e-mail task notification scope changed in the source');
    const inc = A.Increment_variable_varNotifcationsSentCount;
    if (!inc?.runAfter?.Scope_3) throw new Error('Increment_variable_varNotifcationsSentCount no longer follows Scope_3');
    delete A.Scope_3;
    inc.runAfter = ok('Send_an_email_(V2)_Main_1_1_1');
  });
}

const built = {};
const FLOWS = [
  { name: 'Single_Task_Assignment', id: '3caf9458-8d95-4740-a01b-6803dad97d34', build: singleAssignment,
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('Single_Task_Assignment__')), 'Scope_Global'),
    test: 'Assign one document from Folio\'s Assignment Desk. The officer\'s e-mail shows a TASK-YYYY-NNNNN reference; in Global Tracking Queue the new row has TaskRef = that reference, EntityKey, IdState ACTIVE, Rev 1, TaskTypeChoice Standard Task, and ParentKey REC:<key> when the document\'s DGO DIGITAL OPS row has an EntityKey; the document row keeps its BodyExtract and TextExtraxt; the reply carries a requestId.' },
  { name: 'BULK_ASSIGNMENT', id: '5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06', target: 'BULK_OPS_DATA_RETRIEVAL_HTTP', fresh: true,
    load: () => bulkAssignment(built.Single_Task_Assignment, (bulkLog = [])), build: (pkg, log) => log.push(...bulkLog),
    test: 'Assign three documents to one officer from Folio\'s Bulk Assignment. The reply is 202 with three consecutive TASK-YYYY-NNNNN references; in Global Tracking Queue three new rows carry those TaskRefs, each with its own EntityKey, IdState ACTIVE and Rev 1; each document row shows AssignmentStatus Processed and keeps its BodyExtract; the officer receives three e-mails, one per task; Portal Sequence Counters\' TASK-<year> row advanced by three in one claim. Then send one document ID that does not exist with two that do: two tasks are created and the requester receives one e-mail naming the missing one.' },
  { name: 'FETCH_ALL', id: 'b79e6707-df4d-4ae7-8a65-738aa45e9a73', target: 'IP_FETCH_ALL_BOOTSTRAP', build: (p, l) => { fetchAll(p, l); fetchAllEmails(p, l); quietReadCapture(p, l, 'Response_FetchAll_record'); },
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_FETCH_ALL_BOOTSTRAP__')), 'Scope'),
    test: 'Open Folio. The Workspace loads as before; in the browser\'s network tab the FETCH_ALL reply carries a requestId of its own and data.register, briefs, meetings, projects, approvals and files arrays (empty where the list has no rows yet); data.docs rows carry EntityKey and ReferenceId, data.tasks rows TaskRef and EntityKey.' },
  { name: 'DYNAMIC_ACTIONS', id: '31c0aaf0-ddbb-478c-9a98-bc013265c4c7', target: 'IP_Dynamic_Global_Actions_Endpoint', build: dynamicActions,
    /* Owner decision, 2026-10-07: this package takes the place of Scope_Dynamic_Flow_Production_Hardened, a scope put into the
       flow in the tenant on 2026-10-07 in place of Scope_Dynamic_Flow (live read); npm run flows:update replaces it by name. */
    replaces: ['Scope_Dynamic_Flow_Production_Hardened'],
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Dynamic_Global_Actions_Endpoint__')), 'Scope_Dynamic_Flow'),
    test: 'From Folio (or any client signed in as an active directory user), send: register {subject, channel email, locatorKind EXO_INTERNET_MESSAGE_ID, locatorContainer <the registry mailbox>, locatorValue <an internetMessageId>} → a NITDA-YYYY-NNNNN and a REC key, a Portal Registry row and a DGO_IdentityMap LOCATOR row; upsert_record {entityType MIN, parentKey TSK:<a task\'s EntityKey>, text} → a Task_Comments row under that task; open_file {title} → FILE-YYYY-NNNNN; link {fromKey REC:…, toKey REG:…, linkType FILED_IN}; move_file twice {target REG:…, toOrgKey} → two MOVED rows in DGO_FileMovements (T12). Send any of them again with the same clientRequestHash: the first result comes back with replayed true and nothing new is written (T11). merge two test records as a Registry Manager (T9).' },
  { name: 'USER_ADMIN', id: 'e3e5c825-55ba-447e-88c1-96b7e89fd013', target: 'IP_User_Admin_Endpoint', build: (pkg, log) => dynamicActions(pkg, log, { userAdmin: true, only: true }),
    /* Owner approval 2026-10-08 (ITEM-25): IP_User_Admin_Endpoint was created as a stopped copy of IP_Dynamic_Global_Actions_Endpoint; this
       package takes the place of its scope and carries only user-admin, on the same gate. */
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Dynamic_Global_Actions_Endpoint__')), 'Scope_Dynamic_Flow'),
    replaces: ['Scope_Dynamic_Flow_Production_Hardened'],
    test: 'In Folio, User Administration: add a person, change their role, disable them. Each change appears in DGO_UserDirectory at once (Rev rising) with an audit row user:<action>. A user administrator granting systemAdmin is refused (403).' },
  { name: 'ACTIVITY_LIFECYCLE', id: 'b4db02d8-02a0-4bc9-b9d3-06e2aae2448c', target: 'IP_Activity_Lifecycle_Endpoint', build: (pkg, log) => dynamicActions(pkg, log, { activity: true, only: true }),
    /* Owner decision 2026-10-10 (ITEM-25, build them): IP_Activity_Lifecycle_Endpoint was created 2026-10-10 as a stopped copy of
       IP_Dynamic_Global_Actions_Endpoint, which is at the 500-action limit; this package takes the place of its scope and carries
       only the activity lifecycle, on the same gate. */
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Dynamic_Global_Actions_Endpoint__')), 'Scope_Dynamic_Flow'),
    replaces: ['Scope_Dynamic_Flow_Production_Hardened'],
    test: 'In Folio, Activities: open an activity and choose Route to SIWES. Global Tracking Queue has a new row NVERSE DGOFASTTRACK, Category Internships (SIWES), Reference_ID yyyyMMdd-<activity ID>-INT-SIWES-<row ID>; the activity shows Status Treated and AssignmentStatus Processed; DGO_AuditLog has activity:queued, activity:reference-set and activity:treated. Archive (UNC) and NYSC likewise.' },
  { name: 'EMAIL_RELATED_TASK', id: 'ab1a3555-7fce-4bfe-a193-b8b84654b0a4', target: 'IP_Create__Task__for_received_Email_Endpoint', build: (pkg, log) => { emailTask(pkg, log); emailTaskRouting(pkg, log); repointTaskLinks(pkg.serializedValue.actions, log); emailTaskOneNotice(pkg, log); },
    load: () => fromExport(EMAIL_EXPORT, 'Scope_Global').node,
    apply: 'Paste over Scope_Global in IP_Create__Task__for_received_Email_Endpoint (ab1a3555), the adopted email-to-task flow. Point Folio\'s EMAIL_RELATED_TASK URL at this flow if it is not already, then turn off the retired copies 3f2f649b and 2fbb5485 (reference/FLOW_ADOPTION.md).',
    test: 'In Folio, open an e-mail in Lookup and raise a task from it. In Global Tracking Queue (not DEV_OPS_Global_Tracking_Queue) a new row has the e-mail\'s subject or the title given, TaskRef = Reference_ID = the next TASK-YYYY-NNNNN, EntityKey, IdState ACTIVE, Rev 1, TaskTypeChoice Standard Task and ActivityTrackingID = the e-mail\'s id; the officer\'s e-mail shows the TASK reference; the reply carries data.taskRef and a requestId of the flow\'s own. Register the same e-mail first through DYNAMIC_ACTIONS register (locatorKind EXO_INTERNET_MESSAGE_ID) and raise another task: that task\'s ParentKey and RootKey are REC:<the record\'s key> and RootRef its NITDA-YYYY-NNNNN.' },
  { name: 'OTP_VERIFY', id: '4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61', target: 'IP_OTP_VERIFY', build: otpProof,
    /* After every common step, so IP_OTP_GENERATE's package (derived from this one before it) is unchanged. */
    finalize: (pkg, log) => edit(log, 'ITEM-82: Case_Generate leaves IP_OTP_VERIFY. Owner decision 2026-10-07: generation and verification run on separate flows; a Folio sign-in on 2026-10-08 ran generation in IP_OTP_GENERATE (05:14:59Z) and verification here (05:16:15Z, proof created), so this flow now only verifies. A generate request answers 400 from the Switch default.', () => {
      const sw = pkg.serializedValue.actions.Switch;
      if (!sw?.cases?.Case_Generate) throw new Error('OTP_VERIFY no longer has Case_Generate');
      delete sw.cases.Case_Generate;
      const kept = names(pkg.serializedValue.actions);
      pkg.allConnectionData = Object.fromEntries(Object.entries(pkg.allConnectionData).filter(([n]) => kept.has(n)));
    }),
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_OTP_VERIFY__4dbe6dde')), 'Scope_Global'),
    apply: 'Paste over Scope_Global in IP_OTP_VERIFY (4dbe6dde), the one flow OTP_GENERATE and OTP_VERIFY run on. The proof ledger (Global_Digital_Documents_Centre, f5c9698e) already exists. Set Flow Configuration IDENTITY_PROOF_REQUIRED to true only after a sign-in has returned a proof.',
    test: 'Sign in to Folio with an emailed code as an active directory user. The reply\'s data carries token, expiresAt (four hours ahead) and claims with the directory row\'s role; the proof ledger has a row with that token as Title, Purpose internal-session, Consumed No and the same expiry; the next Folio call sends Authorization: Bearer <token>. Sign in with a correct code as an address that is not in DGO_UserDirectory: 401 NOT_A_DIRECTORY_USER and no ledger row.' },
  /* Owner decision and approval, 2026-10-07: code generation and code verification run on separate flows. IP_OTP_GENERATE
     is IP_OTP_VERIFY's package with Case_Verify removed, so the two cannot drift; it was created in the tenant from this
     derivation (evidence/2026-10-07-otp-generate-created.json). */
  { name: 'OTP_GENERATE', id: 'e5632336-641f-4b9b-bd93-99185b5eb975', target: 'IP_OTP_GENERATE', fresh: true,
    load: () => otpGenerateOnly(built.OTP_VERIFY_BEFORE_FINALIZE), build: (pkg, log) => { edit(log, 'Owner decision, 2026-10-07: OTP_GENERATE has a flow of its own. This is the OTP_VERIFY package with Case_Verify removed: the code is created in OTP_Transactions and e-mailed exactly as IP_OTP_VERIFY does it; a verify request answers 400 from the Switch default.', () => {}); otpGenerateDirectory(pkg, log); },
    apply: 'Created in the tenant by the Flow API (2026-10-07). Point Folio\'s OTP_GENERATE URL at this flow; once a sign-in has run through it, Case_Generate leaves IP_OTP_VERIFY.',
    test: 'Sign in to Folio: the code arrives from dgsregistry@nitda.gov.ng, and the run appears in IP_OTP_GENERATE\'s history (not IP_OTP_VERIFY\'s); OTP_Transactions has the new row; Portal Outbox Receipts has a row with Status sent. Entering the code verifies through IP_OTP_VERIFY as before.' },
  { name: 'REFERENCE_DATA', id: '9a4dea8e-15f2-42b6-904d-3655056fa3c2', target: 'IP_Reference_Data_Endpoint', build: (p, l) => { referenceData(p, l); quietReadCapture(p, l, 'Response_Lookups_record'); },
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Reference_Data_Endpoint__')), 'Scope_Global'),
    apply: 'Paste over Scope_Global in IP_Reference_Data_Endpoint (9a4dea8e). SharePoint connections arrive bound. Paste before IDENTITY_PROOF_REQUIRED is set to true.',
    test: 'Open Folio as an officer whose role holds user:view: the directory lists every active user (more than 500 if the directory holds them) with Role, Persona and Status as text, and the category and department pickers show codes and heads. Open it as an officer whose role does not: every user is listed with name, e-mail, directorate and department, Role and the rest are blank except on the officer\'s own row. With IDENTITY_PROOF_REQUIRED true, call REFERENCE_DATA with no Authorization header: 401 UNAUTHENTICATED.' },
  { name: 'GET_DOCS', id: '28f6e62a-fea8-437c-a61a-47aec706c4e2', target: 'IP_Get_Docs_Endpoint', build: (p, l) => { getDocs(p, l); quietReadCapture(p, l, 'Response_GetDocs_record'); },
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Get_Docs_Endpoint__')), 'Scope_Global'),
    apply: 'Paste over Scope_Global in IP_Get_Docs_Endpoint (28f6e62a); it serves GET_DOCS and FETCH_ACTIVITIES. SharePoint connections arrive bound.',
    test: 'Open a document list in Folio: documents load as before and the reply carries a requestId of the flow\'s own. With IDENTITY_PROOF_REQUIRED true, call GET_DOCS with no Authorization header: 401 UNAUTHENTICATED; signed in, the documents load.' },
  { name: 'FETCH_EMAIL_ATTACHMENTS', id: '5bc87cf3-7a99-4259-b6a2-315fbc794d9b', target: 'IP_Retrieve_Email_Attachment_Endpoint', build: emailAttachments, spConnection: SP_CONNECTION,
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_Retrieve_Email_Attachment_Endpoint__')), 'Scope_Email_Attachment_Endpoint_REBUILT'),
    apply: 'Paste over Scope_Email_Attachment_Endpoint_REBUILT in IP_Retrieve_Email_Attachment_Endpoint (5bc87cf3). The pasted gate reads SharePoint, which this flow did not use: when the designer asks, pick the SharePoint connection the other endpoint flows use (3f1943c5).',
    test: 'Open an e-mail with attachments in Folio\'s Lookup: the attachments load as before. With IDENTITY_PROOF_REQUIRED true, call FETCH_EMAIL_ATTACHMENTS with an emailId and no Authorization header: 401 UNAUTHENTICATED and no message read (the run shows Get_email_V2 skipped).' },
  { name: 'EMAIL', id: 'df59a69f-92ca-4554-ae68-6b464aa73ef7', target: 'IP_SEND_EMAIL', build: sendEmail,
    load: () => fromCapture(readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).find((f) => f.startsWith('IP_SEND_EMAIL__')), 'Scope_Send_Email_Flow'),
    apply: 'Paste over Scope_Send_Email_Flow in IP_SEND_EMAIL (df59a69f). Connections arrive bound.',
    test: 'Send a message from Folio: it is delivered and the receipt row is written as before; the reply carries a requestId of the flow\'s own. With IDENTITY_PROOF_REQUIRED true, call EMAIL with a userEmail in the body and no Authorization header: 401 UNAUTHENTICATED and nothing is sent.' },
  { name: 'AI', id: 'fefa43c6-fb9d-4337-8b65-7fd19fa09b6d', target: 'AI_Document_Processing', fresh: true,
    requires: 'Flow Configuration holds a row OPENROUTER_API_KEY with a new OpenRouter key (ITEM-75). After the write, set the HTTP action\'s Authorization header to @{outputs(\'Compose_OpenRouter_Authorization\')} and revoke the old key.',
    load: () => aiGate((aiLog = [])), build: (pkg, log) => log.push(...aiLog),
    apply: 'First add a Flow Configuration row OPENROUTER_API_KEY holding a new OpenRouter key (ITEM-75). This scope is added, not replaced: in AI_Document_Processing (fefa43c6) select the + between Initialize_variable_2 and Get_item, choose Paste an action, paste the file. Then open the HTTP action and set its Authorization header to @{outputs(\'Compose_OpenRouter_Authorization\')}, replacing the key text. Save, then revoke the old key in OpenRouter.',
    test: 'Run an AI analysis from Folio signed in: it answers as before, and in the run history the HTTP action\'s Authorization shows the configured key, while Export (or Peek code on HTTP) shows only the expression. With IDENTITY_PROOF_REQUIRED true, call AI_DOC_ANALYSIS with no Authorization header: 401 UNAUTHENTICATED, and the run is Cancelled at Terminate_AI_Gate with Get_item not run.' },
  /* ITEM-80 (owner direction): the legacy library intake rebuilt in the flow created for it. Written whole the first time
     (its trigger and variable declarations with this scope, scripts/write-scan-processing-flow.mjs); maintained by
     npm run flows:update after that. The legacy flow's two LIBRARY_INTAKE packages were removed with release 2026-10-18:
     DGSO INCOMING AI PROCESSING was turned off on 2026-10-16 and is not maintained. */
  { name: 'SCAN_PROCESSING', id: SCAN_FLOW, target: 'Folio_Incoming_Correspondence_Scan_Processing_Flow', fresh: true,
    load: () => scanProcessing((scanLog = [])), build: (pkg, log) => log.push(...scanLog),
    apply: 'Written whole by scripts/write-scan-processing-flow.mjs (trigger on the OneDrive folder /E-DOCUMENT STATION, bound to the OneDrive connection that reaches it, the six variable declarations, this scope), then kept current by npm run flows:update.',
    test: 'Scan a document to /E-DOCUMENT STATION. Within a minute: DGO DIGITAL OPS has a new row with the file name, the extracted text in Notes and the AI summary in Description, the document attached and renamed "<ID> -<date> -<name>"; Portal Registry has a row with Channel library and the next NITDA-YYYY-NNNNN; dgs@nitda.gov.ng receives "New E-Scan"; Portal Outbox Receipts records it.' },
  /* Owner direction 2026-10-10: the scheduled sweep sends one digest per person, once a working day, to the registry until commissioning. */
  { name: 'SWEEP', id: '8c19b45c-4174-4d2f-9429-ffd08dd1a5ae', target: 'AUTO_SCHEDULED_SWEEP', fresh: true,
    load: () => sweepDigest((sweepLog = [])), build: (pkg, log) => log.push(...sweepLog),
    apply: 'Written by npm run flows:update (the flow is Stopped). Its schedule is set to weekdays at 08:45 WAT by a separate trigger write. Start it only at commissioning, and set Flow Configuration NOTIFY_SWEEP_RECIPIENTS to staff only when staff may receive the digests.',
    test: 'Run the sweep once by hand while NOTIFY_SWEEP_RECIPIENTS is not staff: the registry receives one e-mail per person with overdue or unacknowledged tasks, each naming that person and listing all their tasks; Portal Outbox Receipts has one task-digest:<address>:<date> row per person. Run it again the same day: nothing is sent.' },
  /* Owner decision 2026-10-18: every failed notice is registered, only some are reported. A flow created for it, written
     whole the first time (its Recurrence trigger and this scope, scripts/write-failure-watch-flow.mjs), kept current by
     npm run flows:update after that. Its id is NOT_CAPTURED until the flow is created. */
  { name: 'FAILURE_WATCH', id: 'c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6', target: 'Folio_Failure_Watch', fresh: true,
    load: () => failureWatch((watchLog = [])), build: (pkg, log) => log.push(...watchLog),
    apply: 'Created by scripts/write-failure-watch-flow.mjs (a Recurrence trigger: every hour, Monday to Friday, 07:00 to 18:00 WAT; this scope), then kept current by npm run flows:update. Record its id in scripts/lib/flow-artifact-name.mjs FLOW_IDENTITIES and capture it.',
    test: 'Make one notice fail on purpose in each group (a citizen outcome to an address that does not exist, a staff notice, a sign-in code). Each has a Portal Outbox Receipts row with Status failed. At the next hour the registry receives one Folio Failure Watch e-mail listing only the citizen outcome; the next run does not list it again; the 07:00 run lists it while its Status is failed. Five failures in one hour bring the broken-connection line. Flow Configuration NOTIFY_FAILURE_HEALTH holds the open count per group, and the Workspace\'s System Health shows it.' },
];
let bulkLog = [];
let scanLog = [];
let sweepLog = [];
let watchLog = [];
let aiLog = [];

/* ---------------------------------------------------------------- build */
/* What the tenant runs comes from the paste ledger (registers/identification-paste-ledger.json), by fingerprint. */
const files = {};
const changes = [];
const statuses = [];
for (const f of FLOWS) {
  const pkg = f.load();
  const before = f.fresh ? new Set() : names(pkg.serializedValue.actions);
  const log = [];
  const varsBefore = variableSteps(pkg);
  f.build(pkg, log);
  { const held = composeVariableValues(pkg, varsBefore); if (held.length) edit(log, `Set variable values held in a Compose step (the designer dropped inline and changed Set variable values on paste; tenant export of IP_Create__Task__for_received_Email_Endpoint, 6 October 2026): ${held.join(', ')}.`, () => {}); }
  /* A step that removes part of the package (OTP_VERIFY's Case_Generate) runs here, before the catalogue, receipts and
     connections are settled, so they describe what the flow keeps; a package derived from it reads the copy taken first. */
  if (f.finalize) { built[`${f.name}_BEFORE_FINALIZE`] = structuredClone(pkg); f.finalize(pkg, log); }
  /* ITEM-68: every send's body comes from the e-mail catalogue. */
  { const sharedName = FLOWS.filter((g) => (g.target || g.name) === (f.target || f.name)).length > 1;
    if (!(process.env.DGO_CATALOGUE_BOOTSTRAP === f.name)) applyCatalogue(pkg, flowArtifactName({ flowName: f.target || f.name, part: sharedName ? pkg.nodeId : undefined, kind: 'paste.json' }), ROOT); }
  const admin = adminRecipients(pkg);
  if (admin.length) edit(log, `Administrative e-mail goes to the registry mailbox (owner decision, 2026-10-06): the fixed recipients ${admin.join(', ')} are set to dgsregistry@nitda.gov.ng (the bulk-failure fallback was dgs@nitda.gov.ng). The configurable ones stay read from Flow Configuration (NOTIFY_OPS_TO, NOTIFY_REGISTRY_TO, NOTIFY_HELPDESK_TO), which fall back to the registry mailbox when blank.`, () => {});
  { const red = redactProofHeader(pkg); if (red.length) edit(log, `The sign-in proof is redacted from the run record (tenant defect, 8 October 2026): ${red.join(', ')} masked Authorization but not X-DGO-Proof, where the proof travels since release 9, so every telemetry row held a usable session token.`, () => {}); }
  { const g = guardUtcInputs(pkg); if (g) edit(log, `Tenant defect 2026-10-18 (AUTO_SCHEDULED_SWEEP run 08584093115454153780858604181CU30): a SharePoint date-only column comes back without a zone, and convertFromUtc refused it. Every date this package converts from a list row, a trigger body or a connector reply (${g}) is read with a Z added when it has none, and an empty one reads as the epoch.`, () => {}); }
  const covered = outboxReceipts(pkg);
  if (covered.length) edit(log, `ITEM-66: every mail send writes a receipt to Portal Outbox Receipts (${covered.join(', ')}): message type, recipient (the send's own To), the run as reference, sent or failed, and the error on failure; never the message body. Compose_<send>_Outcome fails exactly when the send failed, so the scope around it ends as it did before the receipt was added and the flow's catch path still fires.`, () => {});
  const after = names(pkg.serializedValue.actions);
  if (f.captureConnections) pkg.allConnectionData = captureConnections(pkg, f.captureConnections);
  else if (f.spConnection) {
    /* A flow with no SharePoint connection of its own: the new SharePoint steps bind the tenant's SharePoint connection. */
    const kept = Object.fromEntries(Object.entries(pkg.allConnectionData).filter(([n]) => after.has(n)));
    const api = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline';
    const added = {};
    const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
      if (!before.has(n) && a.type === 'OpenApiConnection') added[n] = { connectionReference: { api: { id: api }, connection: { id: `${api}/connections/${f.spConnection}` }, connectionName: f.spConnection }, referenceKey: a.inputs.host.connection };
      walk(a.actions); if (a.else) walk(a.else.actions);
    } };
    walk(pkg.serializedValue.actions);
    pkg.allConnectionData = { ...kept, ...added };
  } else if (!f.fresh) {
    const kept = Object.fromEntries(Object.entries(pkg.allConnectionData).filter(([n]) => after.has(n)));
    pkg.allConnectionData = { ...kept, ...adoptConnections(pkg, before) };
  }
  bindReceipts(pkg);
  { const mail = registryMailConnection(pkg); if (mail.length) edit(log, `ITEM-77 (owner decision, 2026-10-06): every Office 365 step signs in as the registry mailbox, dgsregistry@nitda.gov.ng, connection c0b9e7a5 (${mail.join(', ')} used another connection).`, () => {}); }
  built[f.name] = pkg;
  /* A part only where one flow takes more than one package (the library intake's two scopes). */
  const shared = FLOWS.filter((g) => (g.target || g.name) === (f.target || f.name)).length > 1;
  const file = flowArtifactName({ flowName: f.target || f.name, part: shared ? pkg.nodeId : undefined, kind: 'paste.json' });
  files[file] = `${JSON.stringify(pkg, null, 2)}\n`;
  changes.push({ ...f, file, log, added: [...after].filter((n) => !before.has(n)), removed: [...before].filter((n) => !after.has(n)), root: pkg.nodeId, steps: after.size });
  { const st = packageStatus(changes[changes.length - 1], pkg, messagesOf(pkg).length, packageFingerprint(pkg));
    statuses.push({ ...st, variableStepsChanged: variableStepsChanged(varsBefore, variableSteps(pkg)) });
    changes[changes.length - 1].tenant = st.tenant; }
}

const P1 = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json'), 'utf8')).lists;
const PROV = JSON.parse(readFileSync(join(ROOT, 'docs/reference/identification/provisioning/identity-provisioning.json'), 'utf8'));
const NEW_LIST_ROWS = PROV.lists.filter((l) => !l.listGuid && l.datasetKey).flatMap((l) => {
  const hit = P1.find((x) => x.list === l.title);
  if (!hit) throw new Error(`Phase 1 list check has no ${l.title}`);
  return [`| \`DATASET_${l.datasetKey}_SITE_URL\` | \`https://nitdanigeria.sharepoint.com/sites/${hit.site}\` |`, `| \`DATASET_${l.datasetKey}_LIST_ID\` | \`${hit.listGuid}\` |`];
}).join('\n');
files['README.md'] = `# Identification Phase 4: internal flows on the generation kit

**Generated by \`npm run idphase4\` from \`scripts/build-identification-phase4.mjs\`. Do not edit by hand.**

[IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) §13, Phase 4. Each file is the
flow's root scope as the tenant capture holds it (\`docs/folio-Master-Flows-and-Endpoints/captures/\`), with the edits
below applied. \`tests/identification-phase4.test.mjs\` runs every file in the strict simulator and checks the designer's
limits (nesting depth 8, no variable declared inside a pasted scope).

## Before pasting

Phases 1 to 3 as recorded in [identification-phase1](../identification-phase1/README.md),
[identification-phase2](../identification-phase2/README.md) and [identification-phase3](../identification-phase3/README.md).
The first TASK claim of a year creates the counter row \`TASK-<year>\` in Portal Sequence Counters; nothing has to be
created by hand.

## Flow Configuration for the new lists

FETCH_ALL (and DYNAMIC_ACTIONS) address the lists Phase 1 created through Flow Configuration. The provisioning template
shipped these rows as "(set after the list is created)". Each value below is the list as the Phase 1 list check found it
([p1-1-list-check-2026-10-04-after-finish.json](../identification-phase1/evidence/p1-1-list-check-2026-10-04-after-finish.json)).
Where a row still holds the placeholder, set it to the value shown. A row left unset only empties that collection.

| Title | ConfigValue |
|---|---|
${NEW_LIST_ROWS}

## How to apply

**All at once:** \`npm run flows:update -- apply\` writes every package below into its flow, backing each flow up first and
reading it back ([FLOWS_UPDATE.md](../../deployment/FLOWS_UPDATE.md)). Or by hand, one flow at a time:

For each flow: open it, delete the root scope named below, select the step above where it was, choose **Paste an
action**, paste the file, and save. Keep every **Initialize variable** step above it: these scopes set the flow's own
variables. If a step shows *Invalid connection*, open it and choose the existing connection once. Then run the flow's test.

| Flow | Flow ID | Root scope | Steps | File | In the tenant |
|---|---|---|---|---|---|
${changes.map((c) => `| ${c.target ? `${c.target} (Folio's ${c.name})` : c.name} | \`${c.id}\` | \`${c.root}\` | ${c.steps} | \`${c.file}\` | ${c.tenant} |`).join('\n')}

## Caller identity (G-04)

Every internal endpoint key resolves its caller the same way (SINGLE_ASSIGNMENT, BULK_ASSIGNMENT, FETCH_ALL, DYNAMIC_ACTIONS
and SUBSIDIARY_ACTIONS, EMAIL_RELATED_TASK, REFERENCE_DATA, GET_DOCS and FETCH_ACTIVITIES, FETCH_EMAIL_ATTACHMENTS, EMAIL and
the three AI keys), through one Flow Configuration switch, \`IDENTITY_PROOF_REQUIRED\`:

| Switch | Caller | Refused |
|---|---|---|
| not \`true\` (no row, or any other value) | the sign-in proof's address when a valid proof is sent, else the address the request names (\`userEmail\`; Bulk also \`requestedBy\`) | as before these packages: FETCH_ALL, DYNAMIC_ACTIONS and EMAIL by their own directory and role gate; the others not at all (REFERENCE_DATA and GET_DOCS had a gate whose decision was hard-coded to pass) |
| \`true\` | only the sign-in proof's address: the bearer token Folio sends, found in the proof ledger unconsumed, Purpose internal-session and unexpired | no valid proof, or not an active directory user: 401. A role without the endpoint's route (single-assignment, bulk-assignment; \`"*"\` and \`bulk:assign\` also pass): 403 |

This is the enforcement of [G-04](../../../deployment/PRODUCTION_READINESS_REGISTER.json), carried by the identification
packages so that applying it is setting the switch, not pasting other flows over these. The proof is minted by IP_OTP_VERIFY
(\`OTP_VERIFY__IP_OTP_VERIFY__4dbe6dde.paste.json\`, below). Set the switch only after that package is pasted and Folio
users can sign in: before then no client holds a valid proof and every call would be refused. The DGO_* replacement
packages that carried an earlier form of this are retired (2026-10-06, registers/flow-retirement.json).

REFERENCE_DATA and GET_DOCS do not yet enforce a role's route or permission, only the caller: which roles hold them is not
recorded in this repository. REFERENCE_DATA serves the full directory (Role, Persona, Status, AccessScope, PilotCohort) only
to a holder of \`user:view\` or \`"*"\`, and to anyone else on the caller's own row.

The directory row's \`Role\` is a Choice column (docs/reference/sharepoint-provisioning-spec.json). FETCH_ALL and
DYNAMIC_ACTIONS read it as text, which never matched a \`RoleId\`; every package here reads its value.

## One bulk assignment endpoint

Folio calls one bulk endpoint, \`BULK_ASSIGNMENT\` (modules/bulk-assignment.js). Its URL is the trigger of
BULK_OPS_DATA_RETRIEVAL_HTTP (\`5aab9e61\`), which only read documents, so a bulk assignment created no task. That flow
now holds the bulk assignment scope below and is the one bulk endpoint kept. \`BULK_ASSIGNMENT_DIRECT\`
(IP_Bulk_Assign_Endpoint, \`0d1e8df5\`, reassignment only) is called by nothing in Folio and is retired: turn that flow
off, and leave its URL out of the endpoint configuration. The legacy Deployed Bulk Task Assignment_Create Task
(\`122bb363\`) is not wired to Folio and stays off.

## Changes

${changes.map((c) => `### ${c.name}

${c.log.map((l) => `- ${l}`).join('\n')}

${c.fresh ? `The scope is new: it replaces the flow's ${c.root} as a whole (${c.steps} steps).` : `Steps added: ${c.added.length ? c.added.map((n) => `\`${n}\``).join(', ') : 'none'}.

Steps removed: ${c.removed.length ? c.removed.map((n) => `\`${n}\``).join(', ') : 'none'}.`}

${c.apply ? `**How to apply.** ${c.apply}\n\n` : ''}**Test after pasting.** ${c.test}
`).join('\n')}`;

let stale = 0;
if (!CHECK) mkdirSync(join(ROOT, OUT), { recursive: true });
for (const [f, body] of Object.entries(files)) {
  const p = join(ROOT, OUT, f);
  let cur = null; try { cur = readFileSync(p, 'utf8'); } catch { /* new */ }
  if (cur === body) continue;
  if (CHECK) { stale++; console.error(`stale: ${OUT}/${f}`); } else writeFileSync(p, body);
}
let present = []; try { present = readdirSync(join(ROOT, OUT)); } catch { /* none */ }
for (const f of present) if (!files[f]) { if (CHECK) { stale++; console.error(`stray: ${OUT}/${f}`); } else rmSync(join(ROOT, OUT, f)); }
/* Each package's tenant state, for the Folio Estate Console's Work status tab (npm run console). Kept with the registers,
   not beside the packages, so nothing that reads the package folder takes it for a package. */
{
  const STATUS = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-phase4-status.json';
  const body = `${JSON.stringify({ schema: 'dgo-identification-status/v1', generatedBy: 'scripts/build-identification-phase4.mjs', phase: 4, packages: statuses }, null, 2)}\n`;
  let cur = null; try { cur = readFileSync(join(ROOT, STATUS), 'utf8'); } catch { /* new */ }
  if (cur !== body) {
    if (CHECK) { console.error(`stale: ${STATUS} — run: npm run idphase4`); process.exit(1); }
    writeFileSync(join(ROOT, STATUS), body);
  }
}
if (CHECK && stale) { console.error('identification phase 4 is out of date — run: npm run idphase4'); process.exit(1); }
console.log(`identification phase 4: ${Object.keys(files).length} files ${CHECK ? 'up to date' : 'written'} (${FLOWS.length} flow${FLOWS.length === 1 ? '' : 's'})`);
