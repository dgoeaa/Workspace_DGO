#!/usr/bin/env node
/**
 * Identification Phase 3 (IDENTIFICATION_SYSTEM.md §13): the portal-facing flows on the generation kit.
 *
 *   npm run idphase3
 *   npm run idphase3 -- --check
 *
 * Source, never edited here: the conformance stage (build-identification-conformance.mjs, built in memory), which is
 * what the tenant runs after the conformance pastes. Each flow's Phase 3 edits replace its own claim with
 * the kit's (scripts/lib/identification-kit.mjs) and write the identity columns Phase 1 added. Every edit
 * names the action it touches and checks the text it expects, so the build fails, rather than guessing,
 * if the source changes. tests/identification-phase3.test.mjs runs the result in the strict simulator.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCatalogue, messagesOf } from './lib/email-catalogue.mjs';
import { packageFingerprint } from './lib/package-fingerprint.mjs';
import { flowArtifactName } from './lib/flow-artifact-name.mjs';
import { conformancePackages } from './build-identification-conformance.mjs';
import * as K from './lib/identification-kit.mjs';
import { locate, names, swap, jsonText, ok, ALWAYS, edit, ROLE_OF, redactProofHeader, adoptConnections, fromCapture, outboxReceipts, bindReceipts, guardUtcInputs, adminRecipients, registryMailConnection, packageStatus, variableSteps, variableStepsChanged, composeVariableValues } from './lib/identification-flow-edit.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3';
const CONFIG_SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const REQ = "outputs('Compose_Request_Context')?['requestId']";

/** §8.3: every reply carries requestId, the flow's own guid(). */
function replyRequestId(A, log) {
  const r = locate(A, 'Compose_Response_Body').a;
  const was = "@coalesce(actions('Compose_Outcome')?['outputs']?['data'],json('{}'))";
  if (r.inputs !== was) throw new Error('Compose_Response_Body changed in the source');
  r.inputs = `@setProperty(coalesce(actions('Compose_Outcome')?['outputs']?['data'],json('{}')),'requestId',string(coalesce(${REQ},'')))`;
  log.push("§8.3: every reply carries requestId, the flow's own guid().");
}
/** §10.2 FLOW_TELEMETRY: the run row is keyed by Request ID and Flow Registry Key. */
function telemetryKeys(A, log, contract, correlation = null) {
  const p = locate(A, 'Create_Flow_Telemetry').a.inputs.parameters;
  Object.assign(p, {
    'item/RequestId': `@${REQ}`,
    'item/CorrelationId': correlation || `@${REQ}`,
    'item/ClientCorrelationId': "@string(coalesce(outputs('Compose_Request_Context')?['clientCorrelationId'],''))",
    'item/RegistryKey': "@concat('DGO:',string(workflow()?['name']))",
  });
  if (contract) p['item/ContractKey'] = contract;
  log.push(`§10.2 FLOW_TELEMETRY: the run row carries RequestId, CorrelationId, ClientCorrelationId and the Flow Registry Key DGO:<flow ID>${contract ? `, and ContractKey ${contract}` : ' (no Contract Key: no endpoint calls this flow)'}.`);
}
/* RN-025 (owner decision, 2026-10-18): the run record is e-mailed to the registry, as IP_SCAN_INTAKE does, with the record
   attached. It runs after the telemetry row whatever that row's outcome, and writes its own outbox receipt (ITEM-66). */
function runRecordMail(A, log, flowName) {
  const { parent } = locate(A, 'Create_Flow_Telemetry');
  parent.Compose_Telemetry_Attachments = {
    type: 'Compose', runAfter: { Create_Flow_Telemetry: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
    inputs: [{ Name: `@{concat('${flowName}__',workflow()?['run']?['name'],'__run_record.json')}`, ContentBytes: "@{string(coalesce(outputs('Compose_Flow_Run_Record'),json('{}')))}" }],
  };
  parent.Send_Telemetry_Email = {
    type: 'OpenApiConnection', runAfter: { Compose_Telemetry_Attachments: ['Succeeded'] },
    inputs: {
      host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
      parameters: {
        'emailMessage/To': 'dgsregistry@nitda.gov.ng',
        'emailMessage/Subject': `@concat('${flowName} — Flow Run Record — ',workflow()?['run']?['name'])`,
        'emailMessage/Body': '<p>Flow run record attached.</p>',
        'emailMessage/Attachments': "@outputs('Compose_Telemetry_Attachments')",
        'emailMessage/Importance': 'Low',
      },
    },
  };
  log.push(`RN-025 (owner, 2026-10-18): the run record is e-mailed to the registry mailbox after the telemetry row (Send_Telemetry_Email, "${flowName} — Flow Run Record — <run>"), with the record attached, as IP_SCAN_INTAKE does.`);
}
/* ---------------------------------------------------------------- CG_Submission_Endpoint */
function submission(pkg, log) {
  const A = pkg.serializedValue.actions;
  const edit = (why, fn) => { fn(); log.push(why); };

  edit('The proof check is safe when no proof is sent. The portal\'s first call never carries one, so the proof lookup is skipped and its value is null; first() of null fails the step, which the live flow escapes only if the service stops evaluating and() at its first false argument. It now reads first() of an empty list instead.', () => {
    swap(A, 'Compose_Submission_Proof_Valid',
      jsonText("first(actions('Get_Verification_Proof_Submission')?['outputs']?['body']?['value'])"),
      jsonText("first(coalesce(actions('Get_Verification_Proof_Submission')?['outputs']?['body']?['value'],json('[]')))"), 1);
  });

  /* S6 / B5: the duplicate check. */
  edit('B5 / §8.3: duplicate check by query, then comparison. The register is queried for the same sender, subject and attachment count in the last 24 hours (indexed columns, as before), and each row found is compared on EventDate and AttachmentHashSet: the first 12 hex characters of each declared SHA-256, compared as a set (union sizes), so the order the files were declared in does not matter. The client localId is no longer read (§8.1, V9), and LocalId is no longer written (§10.2: retired).', () => {
    const { parent } = locate(A, 'Compose_Submission_LocalId');
    delete parent.Compose_Submission_LocalId;
    parent.Select_Submission_Attachment_Hashes = {
      type: 'Select',
      inputs: { from: "@outputs('Compose_Submission_Attachments')", select: "@substring(concat(toLower(string(coalesce(item()?['sha256'],''))),'000000000000'),0,12)" },
      runAfter: {},
    };
    parent.Compose_Submission_Attachment_Hash_Set = { type: 'Compose', inputs: "@join(body('Select_Submission_Attachment_Hashes'),',')", runAfter: ok('Select_Submission_Attachment_Hashes') };
    const get = parent.Get_Existing_Submission;
    if (get.inputs.parameters.$top !== 1) throw new Error('Get_Existing_Submission: expected $top 1');
    get.inputs.parameters.$top = 20;
    get.runAfter = ok('Compose_Submission_Attachment_Hash_Set');
    const MINE = "split(outputs('Compose_Submission_Attachment_Hash_Set'),',')";
    const THEIRS = "split(string(coalesce(item()?['AttachmentHashSet'],'')),',')";
    const DAY = (x) => `substring(concat(string(coalesce(${x},'')),'          '),0,10)`;
    parent.Select_Submission_Duplicate_Matches = {
      type: 'Select',
      inputs: {
        from: "@coalesce(outputs('Get_Existing_Submission')?['body/value'],json('[]'))",
        select: `@if(and(equals(length(union(${THEIRS},${MINE})),length(union(${MINE},${MINE}))),equals(length(union(${THEIRS},${THEIRS})),length(union(${MINE},${MINE}))),equals(${DAY("item()?['EventDate']")},${DAY("triggerBody()?['eventDate']")})),string(coalesce(item()?['ReferenceId'],'')),'')`,
      },
      runAfter: ok('Get_Existing_Submission'),
    };
    /* The first match in ID order: references hold no space, so joining with spaces and splitting the trimmed text
       yields the matches in order without a Filter array (B1). */
    parent.Compose_Submission_Duplicate_Reference = {
      type: 'Compose',
      inputs: "@first(split(trim(join(body('Select_Submission_Duplicate_Matches'),' ')),' '))",
      runAfter: ok('Select_Submission_Duplicate_Matches'),
    };
    const rep = parent.Condition_Submission_Is_Replay;
    rep.expression = { and: [{ equals: ["@empty(outputs('Compose_Submission_Duplicate_Reference'))", false] }] };
    rep.runAfter = ok('Compose_Submission_Duplicate_Reference');
  });
  const FIRST_REF = "first(outputs('Get_Existing_Submission')?['body/value'])?['ReferenceId']";
  swap(A, 'Get_Replay_Upload_Tickets', jsonText(FIRST_REF), jsonText("outputs('Compose_Submission_Duplicate_Reference')"), 1);
  swap(A, 'Compose_Result_Submission_200_Replay', jsonText(FIRST_REF), jsonText("outputs('Compose_Submission_Duplicate_Reference')"), 1);

  /* §8.2: the kit's claim replaces the flow's own three attempts. */
  edit('§8.2: the Registry Reference is claimed by the generation kit (10 flat attempts with a 1 to 5 s Delay, HTTP MERGE with IF-MATCH, the counter row found by Prefix and Year and created by the first claim of a year), as proven by the Phase 2 exit run. The flow\'s own three attempts are removed. The kit reads the counter and register addresses from Flow Configuration (DATASET_SEQUENCE_COUNTERS_*, DATASET_INTAKE_REGISTER_*) and the environment prefix from ENVIRONMENT_CODE (prd: none). The claim never issues at or below the highest NITDA-<year> number already in Portal Registry (the kit floor read): a counter row that is missing or behind the register can no longer reissue a reference in use, as it did live on 5 October 2026 (NITDA-2026-00001 refused as a duplicate Reference ID).', () => {
    const { parent } = locate(A, 'Compose_Submission_Reference');
    const removed = ['Compose_Submission_Year', 'Get_Sequence_Counter', 'Condition_Sequence_Counter_Exists',
      ...[1, 2, 3].flatMap((k) => [`Get_Sequence_Counter_Current_${k}`, `Compose_Submission_Next_Sequence_${k}`, `Compose_Submission_Reference_${k}`, `Claim_Sequence_Number_${k}`])];
    const expected = new Set([...removed, 'Compose_Submission_Reference', 'Condition_Sequence_Claimed']);
    const have = Object.keys(parent);
    if (have.length !== expected.size || have.some((n) => !expected.has(n))) throw new Error(`claim branch holds ${have.join(', ')}`);
    const keep = { Compose_Submission_Reference: parent.Compose_Submission_Reference, Condition_Sequence_Claimed: parent.Condition_Sequence_Claimed };
    for (const n of have) delete parent[n];
    const kit = K.chain(
      K.readDatasetBindings({ keys: ['SEQUENCE_COUNTERS', 'INTAKE_REGISTER'], configSite: CONFIG_SITE }),
      K.environmentPrefix(),
      K.entityKey('Record'),
      K.claimReference({ tag: 'Registry', prefix: 'NITDA', floor: { dataset: 'INTAKE_REGISTER', column: 'ReferenceId' } }),
    );
    Object.assign(parent, kit);
    keep.Compose_Submission_Reference.inputs = "@string(coalesce(first(outputs('Compose_Claim_Registry')?['references']),''))";
    keep.Compose_Submission_Reference.runAfter = ok('Compose_Claim_Registry');
    Object.assign(parent, keep);
    const left = JSON.stringify(pkg);
    for (const n of removed) if (left.includes(`'${n}'`)) throw new Error(`${n} is removed but still referenced`);
  });
  swap(A, 'Compose_Result_Submission_409', 'after 3 attempts', 'after 10 attempts', 1);

  /* §10.2: the identity columns on the record, and the VOID row. */
  edit('§10.2 / §6.5: the register row carries its Entity Key, IdState ACTIVE, Rev 1, Direction In, AttachmentHashSet, and the Request ID as both CorrelationId (this flow starts the transaction) and CreatedByRequest.', () => {
    const p = locate(A, 'Create_Submission_Record').a.inputs.parameters;
    if (!('item/LocalId' in p)) throw new Error('Create_Submission_Record: expected item/LocalId');
    delete p['item/LocalId'];
    Object.assign(p, {
      'item/EntityKey': "@outputs('Compose_EntityKey_Record')",
      'item/IdState/Value': 'ACTIVE',
      'item/Rev': 1,
      'item/Direction/Value': 'In',
      'item/AttachmentHashSet': "@outputs('Compose_Submission_Attachment_Hash_Set')",
      'item/CorrelationId': `@${REQ}`,
      'item/CreatedByRequest': `@${REQ}`,
    });
  });
  edit('§8.2 / B8: if the record write fails after the claim, a VOID row accounts for the number (Title VOID, ReferenceId, Status void, SenderEmail, IdState VOID, VoidReason RECORD_WRITE_FAILED: owner decision Q2). The run still ends in the 500 path.', () => {
    const { parent } = locate(A, 'Create_Submission_Record');
    const v = K.voidRow({ tag: 'Registry', dataset: 'INTAKE_REGISTER', referenceColumn: 'ReferenceId', reference: "@{outputs('Compose_Submission_Reference')}", reason: 'RECORD_WRITE_FAILED',
      fields: { Title: 'VOID', Status: 'void', SenderEmail: "@{outputs('Compose_Submission_SenderEmail')}" } });
    parent.Create_Void_Registry = { ...v.Create_Void_Registry, runAfter: { Create_Submission_Record: ['Failed', 'TimedOut'] } };
  });
  edit('§10.2 STATUS_TIMELINE: the RECEIVED event carries its own Entity Key, SubjectKey and RootKey (REC:<key>), RootRef, Action RECEIVED, RequestId, CorrelationId, RevAfter 1, Process INTAKE and ContractKey SUBMISSION.', () => {
    const p = locate(A, 'Create_Submission_Timeline_Event').a.inputs.parameters;
    const qk = "@concat('REC:',outputs('Compose_EntityKey_Record'))";
    Object.assign(p, {
      'item/EntityKey': '@guid()', 'item/SubjectKey': qk, 'item/RootKey': qk,
      'item/RootRef': "@outputs('Compose_Submission_Reference')", 'item/Action': 'RECEIVED',
      'item/RequestId': `@${REQ}`, 'item/CorrelationId': `@${REQ}`, 'item/RevAfter': 1,
      'item/Process': 'INTAKE', 'item/ContractKey': 'SUBMISSION',
    });
  });

  replyRequestId(A, log);
  telemetryKeys(A, log, 'SUBMISSION');
}

/* ---------------------------------------------------------------- CG_Portal_Support_Endpoint */
/* A citizen's address goes into a registry alert's Reply-To only when it is well formed. Outlook refuses the whole message
   for a malformed Reply-To ("A participant without an email address is not allowed for ReplyTo property"), so one bad
   address in a case kept the registry from hearing of the case at all (tenant, 2026-10-18, CG_Portal_Support_Endpoint run
   08584092765524672908188781689CU23). Otherwise the alert keeps the registry's own reply address. */
const EMAIL_OK = (x) => `and(equals(length(split(${x},'@')),2),greater(length(first(split(${x},'@'))),0),contains(last(split(${x},'@')),'.'),not(contains(${x},'..')),not(contains(${x},' ')),not(startsWith(last(split(${x},'@')),'.')),not(endsWith(${x},'.')))`;
function guardReplyTo(A, log, send) {
  const { a } = locate(A, send);
  const p = a.inputs.parameters;
  const cur = String(p['emailMessage/ReplyTo'] || '');
  if (!cur.startsWith('@') || cur.includes('EMAIL_GUARD')) throw new Error(`${send}: Reply-To changed in the source`);
  const x = `toLower(trim(string(coalesce(${cur.slice(1)},''))))`;
  p['emailMessage/ReplyTo'] = `@if(${EMAIL_OK(x)},${x},string(coalesce(outputs('Compose_Notify_Config')?['replyTo'],'dgsregistry@nitda.gov.ng')))`;
  log.push(`${send}: the citizen's address is its Reply-To only when well formed; otherwise the registry's reply address (a malformed address made Outlook refuse the alert, tenant 2026-10-18).`);
}

function support(pkg, log) {
  const A = pkg.serializedValue.actions;
  const edit = (why, fn) => { fn(); log.push(why); };
  guardReplyTo(A, log, 'Send_Helpdesk_Alert_Email');

  edit('§8.3: the live draw (five CASE-XXXXXX candidates checked in one query, the first unused one taken) already meets the case reference rule and is kept. When all five collide, the flow now answers 503 RETRY_LATER and writes nothing; before, it wrote the fifth candidate, a duplicate. The replay branch it replaces was unreachable: no client reference is accepted (§8.1).', () => {
    const c = locate(A, 'Condition_Support_Replay');
    const cond = c.a;
    if (JSON.stringify(cond.expression) !== JSON.stringify({ and: [{ equals: ["@outputs('Compose_Support_Case_State')", 'replay'] }] })) throw new Error('Condition_Support_Replay changed in the source');
    if (Object.keys(cond.actions).join() !== 'Compose_Result_Support_200_Replay') throw new Error('Condition_Support_Replay true branch changed in the source');
    cond.expression = { and: [{ equals: ["@outputs('Compose_Support_Case_State')", 'conflict'] }] };
    cond.actions = { Compose_Result_Support_503: { type: 'Compose', inputs: { status: 503, data: { code: 'RETRY_LATER', message: 'A case reference could not be issued. Try again in a few seconds.' }, errors: [], event: 'none' }, runAfter: {} } };
    delete c.parent.Condition_Support_Replay; c.parent.Condition_Support_Collision = cond;
  });
  swap(A, 'Compose_Outcome', "actions('Compose_Result_Support_200_Replay')", "actions('Compose_Result_Support_503')", 1);

  edit('A repeat of the same case is answered with the case already opened, not a second one: a case from the same e-mail address with the same topic and message in the last hour returns its reference (replayed: true), writes nothing and sends no e-mail. On 5 October 2026 the endpoint ran 24 times in one minute for one case from one phone (the portal outbox resending it; fixed in document-portal/js/core.js), and a browser that gives up on a slow run resends a case the flow did create. Portal Support Cases holds under a hundred rows, so the address and time filter is safe without an index; the message, a Note column, is compared in the flow. A failed lookup counts as no repeat.', () => {
    const { parent } = locate(A, 'Compose_Support_Minted_Ref');
    const before = parent.Compose_Support_Minted_Ref.runAfter || {};
    const EMAIL_FILTER = "@concat('Email eq ''',replace(outputs('Compose_Support_Email'),'''',''''''),''' and SubmittedAtUtc ge ''',addHours(utcNow(),-1),'''')";
    parent.Get_Recent_Support_Cases = {
      type: 'OpenApiConnection', runAfter: before,
      inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
        parameters: { dataset: 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre', table: 'b984645b-8e3a-457f-a305-b95650fd3f23', $filter: EMAIL_FILTER, $top: 50 } },
    };
    parent.Select_Support_Repeat = {
      type: 'Select', runAfter: { Get_Recent_Support_Cases: ['Succeeded', 'Failed', 'TimedOut'] },
      inputs: {
        from: "@coalesce(body('Get_Recent_Support_Cases')?['value'],json('[]'))",
        select: "@if(and(equals(trim(string(coalesce(item()?['Message'],''))),outputs('Compose_Support_Message')),equals(trim(string(coalesce(item()?['Topic'],''))),outputs('Compose_Support_Topic'))),concat(string(coalesce(item()?['CaseRef'],item()?['Title'],'')),'|'),'')",
      },
    };
    parent.Compose_Support_Repeat_Ref = { type: 'Compose', inputs: "@first(split(join(body('Select_Support_Repeat'),''),'|'))", runAfter: ok('Select_Support_Repeat') };
    parent.Compose_Support_Minted_Ref.runAfter = ok('Compose_Support_Repeat_Ref');
    const REP = "not(empty(outputs('Compose_Support_Repeat_Ref')))";
    const state = parent.Compose_Support_Case_State, ref = parent.Compose_Support_Case_Ref;
    state.inputs = `@if(${REP},'repeat',${state.inputs.slice(1)})`;
    ref.inputs = `@if(${REP},outputs('Compose_Support_Repeat_Ref'),${ref.inputs.slice(1)})`;
    const col = parent.Condition_Support_Collision;
    col.expression = { and: [{ not: { equals: ["@outputs('Compose_Support_Case_State')", 'new'] } }] };
    col.actions = {
      Condition_Support_Repeat: {
        type: 'If', runAfter: {},
        expression: { and: [{ equals: ["@outputs('Compose_Support_Case_State')", 'repeat'] }] },
        actions: { Compose_Result_Support_200_Repeat: { type: 'Compose', inputs: { status: 200, data: { caseRef: "@outputs('Compose_Support_Case_Ref')", replayed: true }, errors: [], event: 'none' }, runAfter: {} } },
        else: { actions: col.actions },
      },
    };
  });
  swap(A, 'Compose_Outcome', "actions('Compose_Result_Support_200')?['outputs'],", "actions('Compose_Result_Support_200')?['outputs'],actions('Compose_Result_Support_200_Repeat')?['outputs'],", 1);

  edit('§10.2 SUPPORT_CASES: the case row carries its Entity Key, CaseRef, IdState ACTIVE, Rev 1, and the Request ID as CorrelationId and CreatedByRequest.', () => {
    const { parent } = locate(A, 'Create_Support_Case');
    parent.Compose_EntityKey_Case = { type: 'Compose', inputs: '@guid()', runAfter: {} };
    const create = parent.Create_Support_Case;
    create.runAfter = ok('Compose_EntityKey_Case');
    Object.assign(create.inputs.parameters, {
      'item/EntityKey': "@outputs('Compose_EntityKey_Case')",
      'item/CaseRef': "@outputs('Compose_Support_Case_Ref')",
      'item/IdState/Value': 'ACTIVE',
      'item/Rev': 1,
      'item/CorrelationId': `@${REQ}`,
      'item/CreatedByRequest': `@${REQ}`,
    });
  });

  edit('§6.4 / T5: when the request names a reference, the flow finds that record by exact ReferenceId (V10) and, if the record has an Entity Key, writes an ABOUT link CAS → REC to Record Links (LinkMatchKey = FromKey|ABOUT|ToKey), addressed through Flow Configuration (DATASET_RECORD_LINKS_*). A record written before Phase 3 has no Entity Key until the Phase 5 backfill; it keeps the free-text AboutReference only. A failed link never fails the case: the reply follows the link step whatever its outcome.', () => {
    const { parent } = locate(A, 'Create_Support_Case');
    const REC = "first(coalesce(outputs('Get_About_Record')?['body/value'],json('[]')))";
    const LINK = "@{outputs('Compose_About_Link')?['from']}|ABOUT|@{outputs('Compose_About_Link')?['to']}";
    const link = K.chain(
      K.readDatasetBindings({ keys: ['RECORD_LINKS'], configSite: CONFIG_SITE }),
      { Compose_About_Link: { type: 'Compose', inputs: {
        from: "@concat('CAS:',outputs('Compose_EntityKey_Case'))",
        to: `@concat('REC:',toLower(string(${REC}?['EntityKey'])))`,
      } } },
      { Create_About_Link: {
        type: 'OpenApiConnection',
        inputs: {
          host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'HttpRequest' },
          parameters: {
            dataset: K.site('RECORD_LINKS'),
            'parameters/method': 'POST',
            'parameters/uri': `_api/web/lists(guid'${K.list('RECORD_LINKS')}')/items`,
            'parameters/headers': { Accept: 'application/json;odata=minimalmetadata', 'Content-Type': 'application/json;odata=nometadata' },
            'parameters/body': K.bodyExpr({
              Title: LINK, EntityKey: '@guid()',
              FromKey: "@{outputs('Compose_About_Link')?['from']}", ToKey: "@{outputs('Compose_About_Link')?['to']}",
              LinkType: 'ABOUT', LinkMatchKey: LINK, IdState: 'ACTIVE', Rev: 1, CreatedByRequest: `@{${REQ}}`,
            }),
          },
          retryPolicy: { type: 'none' },
        },
      } },
    );
    const ABOUT_FILTER = "@concat('ReferenceId eq ''',replace(outputs('Compose_Support_About_Ref'),'''',''''''),'''')";
    parent.Scope_About_Link = {
      type: 'Scope',
      runAfter: ok('Create_Support_Case'),
      actions: {
        Condition_About_Given: {
          type: 'If',
          expression: { and: [{ equals: ["@empty(outputs('Compose_Support_About_Ref'))", false] }] },
          runAfter: {},
          actions: {
            Get_About_Record: {
              type: 'OpenApiConnection', runAfter: {},
              inputs: {
                host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
                parameters: { dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS', table: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667', $filter: ABOUT_FILTER, $top: 1 },
              },
            },
            Condition_About_Has_Key: {
              type: 'If',
              expression: { and: [{ equals: [`@equals(length(string(coalesce(${REC}?['EntityKey'],''))),36)`, true] }] },
              runAfter: ok('Get_About_Record'),
              actions: link,
              else: { actions: {} },
            },
          },
          else: { actions: {} },
        },
      },
    };
    locate(A, 'Compose_Result_Support_200').a.runAfter = { Scope_About_Link: ALWAYS };
  });

  replyRequestId(A, log);
  telemetryKeys(A, log, 'SUPPORT');
}

/* ---------------------------------------------------------------- shared: STATUS and WRITEBACK */
/** V10: the padded variant is never computed. The step was already unread; only the next step's run-after named it. */
function dropPadded(A, log, tag) {
  const pad = `Compose_${tag}_Ref_Padded`;
  const { parent } = locate(A, pad);
  const before = JSON.stringify(parent[pad].runAfter);
  const users = Object.entries(parent).filter(([, a]) => a.runAfter && pad in a.runAfter);
  if (users.length !== 1) throw new Error(`${pad}: expected one step after it, found ${users.length}`);
  const s = JSON.stringify(A);
  if ((s.match(new RegExp(`outputs\\('${pad}'\\)`, 'g')) || []).length) throw new Error(`${pad} is read; it cannot be dropped`);
  users[0][1].runAfter = JSON.parse(before);
  delete parent[pad];
  log.push(`V10: the unread padded-reference step (${pad}) is removed, so no padded variant of a reference is ever computed.`);
}
const RECROW = "first(coalesce(outputs('Get_Submission_By_Reference')?['body/value'],json('[]')))";
const NOT_VOID = `not(equals(toUpper(string(coalesce(${RECROW}?['IdState']?['Value'],''))),'VOID'))`;

/* ---------------------------------------------------------------- CG_Portal_Status_Check_Endpoint */
function status(pkg, log) {
  const A = pkg.serializedValue.actions;
  dropPadded(A, log, 'Status');
  const c = locate(A, 'Condition_Status_Record_Found').a;
  const was = { greater: ["@length(coalesce(outputs('Get_Submission_By_Reference')?['body/value'],json('[]')))", 0] };
  if (JSON.stringify(c.expression) !== JSON.stringify(was)) throw new Error('Condition_Status_Record_Found changed in the source');
  c.expression = { and: [was, { equals: [`@${NOT_VOID}`, true] }] };
  log.push('§8.2: a VOID row (a number claimed for a submission whose record write failed, so never issued to anyone) answers the same 404 as no record. The public endpoint gives a caller nothing about a number they were never given.');
  replyRequestId(A, log);
  telemetryKeys(A, log, 'STATUS');
}

/* ---------------------------------------------------------------- CG_Portal_Writeback_Endpoint */
function writeback(pkg, log) {
  const A = pkg.serializedValue.actions;
  guardReplyTo(A, log, 'Send_Writeback_Alert_Email');
  dropPadded(A, log, 'Writeback');

  swap(A, 'Compose_Writeback_Record_State', jsonText(`@if(empty(${RECROW}),'none',`), jsonText(`@if(or(empty(${RECROW}),not(${NOT_VOID})),'none',`), 1);
  log.push('§8.2: a VOID row is treated as no record (404), as in STATUS.');

  const ACTION = "if(equals(outputs('Compose_Writeback_Action'),'withdraw'),'WITHDRAWN',if(equals(outputs('Compose_Writeback_Action'),'note'),'NOTE_ADDED','RESPONDED'))";
  const KEY = `if(equals(length(string(coalesce(${RECROW}?['EntityKey'],''))),36),concat('REC:',toLower(string(${RECROW}?['EntityKey']))),'')`;
  edit(log, 'B9 / §8.3: the register row is changed by the kit\'s Guarded Update (HTTP MERGE with IF-MATCH, Rev + 1, up to 3 attempts that each re-read the row), never by Update item, which cannot send IF-MATCH. The same columns change as before (UpdatedAtUtc, ClosedAtUtc, StatusLabel, ActionRequired, Status). If every attempt loses to a concurrent change, the reply is 503 RETRY_LATER and no timeline event is written.', () => {
    const { parent } = locate(A, 'Update_Registry_Record');
    const p = parent.Update_Registry_Record.inputs.parameters;
    const val = (k) => { if (!(k in p)) throw new Error(`Update_Registry_Record: no ${k}`); return p[k]; };
    const changes = K.bodyExpr({
      UpdatedAtUtc: '@utcNow()',
      ClosedAtUtc: val('item/ClosedAtUtc'),
      StatusLabel: val('item/StatusLabel'),
      ActionRequired: val('item/ActionRequired'),
      Status: val('item/Status/Value'),
    }).slice(1);
    const tl = parent.Create_Timeline_Event, done = parent.Compose_Result_Writeback_200;
    if (JSON.stringify(parent.Update_Registry_Record.runAfter) !== JSON.stringify(ok('Create_Timeline_Event'))) throw new Error('Update_Registry_Record order changed in the source');
    for (const n of Object.keys(parent)) delete parent[n];
    Object.assign(parent, K.chain(
      K.readDatasetBindings({ keys: ['INTAKE_REGISTER'], configSite: CONFIG_SITE }),
      K.guardedUpdate({ tag: 'Registry', dataset: 'INTAKE_REGISTER', itemId: `@{${RECROW}?['ID']}`, changes }),
    ));
    tl.runAfter = {};
    done.runAfter = ok('Create_Timeline_Event');
    parent.Condition_Writeback_Updated = {
      type: 'If',
      expression: { and: [{ equals: ["@outputs('Compose_Updated_Registry')?['ok']", true] }] },
      runAfter: ok('Compose_Updated_Registry'),
      actions: { Create_Timeline_Event: tl, Compose_Result_Writeback_200: done },
      else: { actions: { Compose_Result_Writeback_503_Update: { type: 'Compose', inputs: { status: 503, data: { ok: false, code: 'RETRY_LATER', reason: 'record_busy' }, errors: [], event: 'none' }, runAfter: {} } } },
    };
    Object.assign(tl.inputs.parameters, {
      'item/EntityKey': '@guid()',
      'item/SubjectKey': `@${KEY}`,
      'item/RootKey': `@${KEY}`,
      'item/RootRef': `@string(${RECROW}?['ReferenceId'])`,
      'item/Action': `@${ACTION}`,
      'item/RequestId': `@${REQ}`,
      'item/CorrelationId': `@string(coalesce(${RECROW}?['CorrelationId'],${REQ}))`,
      'item/RevAfter': "@outputs('Compose_Updated_Registry')?['revAfter']",
      'item/Process': 'INTAKE',
      'item/ContractKey': 'WRITEBACK',
    });
  });
  swap(A, 'Compose_Outcome', "actions('Compose_Result_Writeback_503')?['outputs'],", "actions('Compose_Result_Writeback_503')?['outputs'],actions('Compose_Result_Writeback_503_Update')?['outputs'],", 1);
  log.push('§10.2 STATUS_TIMELINE / ID-20: the writeback event carries its own Entity Key, SubjectKey and RootKey (REC:<key>, when the record has one), RootRef, Action (WITHDRAWN, NOTE_ADDED or RESPONDED), RequestId, the record\'s CorrelationId (server state; the flow\'s own Request ID for a record written before Phase 3), RevAfter, Process INTAKE and ContractKey WRITEBACK.');

  replyRequestId(A, log);
  telemetryKeys(A, log, 'WRITEBACK');
  runRecordMail(A, log, 'CG_Portal_Writeback_Endpoint');
}

/* ---------------------------------------------------------------- CG_Upload_Endpoint */
function upload(pkg, log) {
  const A = pkg.serializedValue.actions;
  const TICKET = "outputs('Compose_Ticket_Row')";
  const REC = "first(coalesce(outputs('Get_Upload_Record')?['body/value'],json('[]')))";
  const KEY = `if(equals(length(string(coalesce(${REC}?['EntityKey'],''))),36),concat('REC:',toLower(string(${REC}?['EntityKey']))),'')`;
  /* The fourth underscore-separated part of <ref>_<8 hex>_<name>; a legacy name has no such part. */
  const FRAG = `toLower(string(coalesce(first(skip(split(string(coalesce(${TICKET}?['StoredName'],'')),'_'),3)),'')))`;
  const HEXLEFT = '0123456789abcdef'.split('').reduce((e, d) => `replace(${e},'${d}','')`, FRAG);

  edit(log, '§10.2 ATTACHMENTS / §8.3: the attachment row carries its Entity Key, ParentKey and RootKey REC:<the record\'s key> (found by the ticket\'s SubmissionRef, exactly), RootRef, IdState ACTIVE, Rev 1 and CreatedByRequest. The Entity Key begins with the 8 hex characters SUBMISSION put in the stored file name, so the name carries the first 8 hex of the attachment\'s key as §8.3 requires; a ticket from before Phase 3 gets a fresh guid(). A record written before Phase 3 has no key, so ParentKey and RootKey stay empty until the Phase 5 backfill.', () => {
    const { parent } = locate(A, 'Create_Attachment_Record');
    if (JSON.stringify(parent.Create_Attachment_Record.runAfter) !== JSON.stringify(ok('Create_Attachment_File'))) throw new Error('Create_Attachment_Record order changed in the source');
    parent.Get_Upload_Record = {
      type: 'OpenApiConnection', runAfter: ok('Create_Attachment_File'),
      inputs: {
        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
        parameters: { dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS', table: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667',
          $filter: `@concat('ReferenceId eq ''',replace(string(coalesce(${TICKET}?['SubmissionRef'],'')),'''',''''''),'''')`, $top: 1 },
      },
    };
    parent.Compose_EntityKey_Attachment = {
      type: 'Compose', runAfter: ok('Get_Upload_Record'),
      inputs: `@if(and(equals(length(${FRAG}),8),empty(${HEXLEFT})),concat(${FRAG},substring(guid(),8,28)),guid())`,
    };
    const rec = parent.Create_Attachment_Record;
    rec.runAfter = ok('Compose_EntityKey_Attachment');
    Object.assign(rec.inputs.parameters, {
      'item/EntityKey': "@outputs('Compose_EntityKey_Attachment')",
      'item/ParentKey': `@${KEY}`,
      'item/RootKey': `@${KEY}`,
      'item/RootRef': `@string(coalesce(${TICKET}?['SubmissionRef'],''))`,
      'item/IdState/Value': 'ACTIVE',
      'item/Rev': 1,
      'item/CreatedByRequest': `@${REQ}`,
    });
  });

  replyRequestId(A, log);
  telemetryKeys(A, log, 'UPLOAD');
  edit(log, 'ID-20: UPLOAD continues the submission\'s transaction, so its telemetry CorrelationId is the record\'s, read from the register (server state), never from the browser. Without a record it is the flow\'s own Request ID.', () => {
    const p = locate(A, 'Create_Flow_Telemetry').a.inputs.parameters;
    p['item/CorrelationId'] = `@string(coalesce(first(coalesce(actions('Get_Upload_Record')?['outputs']?['body']?['value'],json('[]')))?['CorrelationId'],${REQ}))`;
  });  runRecordMail(A, log, 'CG_Upload_Endpoint');
}

/* ---------------------------------------------------------------- CG_Registry_Status_Notifier, CG_Portal_Daily_Sweep */
function notifier(pkg, log) {
  const A = pkg.serializedValue.actions;
  telemetryKeys(A, log, null, `@string(coalesce(triggerBody()?['CorrelationId'],${REQ}))`);
  log.push('§6.5 / ID-20: the notifier is triggered by the register row, so its CorrelationId is that row\'s (server state); a row written before Phase 3 has none and the run\'s own Request ID is used.');
}
function sweep(pkg, log) {
  telemetryKeys(pkg.serializedValue.actions, log, null);
  log.push('ID-20: a scheduled sweep starts its own transaction, so its CorrelationId is its own Request ID. It writes no governed row (it marks upload tickets expired, which are not governed).');
  ackOverdueNotice(pkg, log);
}

/* The top-level arguments of a workflow-language call: `if(a,b,c)` → ['a','b','c']. Quotes ('' escapes one) and
   brackets are respected, so a comma inside a string or a nested call does not split. */
function callArgs(expr, fn) {
  const src = expr.replace(/^@/, '');
  if (!src.startsWith(`${fn}(`) || !src.endsWith(')')) throw new Error(`not a ${fn}(...) call: ${src.slice(0, 60)}`);
  const body = src.slice(fn.length + 1, -1);
  const out = []; let depth = 0, quote = false, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === "'") { if (body[i + 1] === "'") i++; else quote = false; } continue; }
    if (c === "'") quote = true;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  if (depth !== 0 || quote) throw new Error(`unbalanced ${fn}(...)`);
  return out;
}

/* F5 of the e-mail template package (TR-108, TR-143; ITEM-92): a citizen whose submission is past its acknowledgement
   due date is told so, once. The sweep's own rule decides what is overdue (Select_Overdue_Rows' condition, reused
   verbatim per row, so the registry digest and the citizen notice cannot disagree; the kit has no Filter array), and the notice is sent only when Portal
   Outbox Receipts holds no 'sent' citizen-ack-overdue receipt for that submission: the sweep runs every working day,
   and a failed send is tried again the next day. The body is PT-Ack-Overdue (email-catalogue). */
const RECEIPTS_LIST = { site: 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre', table: '88a81ca1-319a-45f5-8409-f91a24538ffa' };
const PT_ACK_OVERDUE = 'docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/email/PT-Ack-Overdue.html';
function ackOverdueNotice(pkg, log) {
  edit(log, 'F5 (e-mail template package, ITEM-92): each submission the sweep finds past its acknowledgement due date is notified to the citizen once (PT-Ack-Overdue, Send_Citizen_Ack_Overdue_Email); a sent receipt for the submission stops a repeat.', () => {
    const G = locate(pkg.serializedValue.actions, 'Select_Overdue_Rows').parent;
    const sel = G.Select_Overdue_Rows;
    if (JSON.stringify(sel.runAfter) !== JSON.stringify(ok('Get_Unacknowledged_Submissions'))) throw new Error('Select_Overdue_Rows no longer reads Get_Unacknowledged_Submissions');
    const [cond, , empty] = callArgs(sel.inputs.select, 'if');
    if (empty !== "''") throw new Error('Select_Overdue_Rows no longer renders nothing for a row that is not overdue');
    const [dueTicks] = callArgs(cond, 'less');
    const [due] = callArgs(dueTicks, 'ticks');
    if (!G.Compose_Sweep_Counts?.runAfter?.Select_Overdue_Rows) throw new Error('Compose_Sweep_Counts no longer waits for the overdue rows');
    const ROW = "items('Foreach_Overdue_Submission')";
    const per = (e) => e.replaceAll('item()', ROW);
    const esc = (e) => `replace(replace(replace(replace(replace(string(${e}),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')`;
    const EMAIL = `toLower(trim(string(coalesce(${ROW}?['SenderEmail'],''))))`;
    const NAME = `trim(string(coalesce(${ROW}?['SenderName'],'')))`;
    const REF = `string(coalesce(${ROW}?['ReferenceId'],''))`;
    const WAT = (e) => `formatDateTime(${e},'dd MMM yyyy')`;
    /* SubmittedAtUtc as the source reads it: a value without a zone is UTC. */
    const AT = `string(coalesce(${ROW}?['SubmittedAtUtc'],''))`;
    const SUBMITTED = `if(empty(${AT}),'1970-01-01T00:00:00Z',if(endsWith(${AT},'Z'),${AT},concat(${AT},'Z')))`;
    const html = readFileSync(join(ROOT, PT_ACK_OVERDUE), 'utf8').trim();
    const F = (k) => `@{outputs('Compose_Ack_Overdue_Fields')?['${k}']}`;
    const body = html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (k === 'year') return "@{formatDateTime(utcNow(),'yyyy')}";
      if (!['citizenName', 'citizenEmail', 'trackingNumber', 'submittedDate', 'dueDate', 'trackingUrl'].includes(k)) throw new Error(`${PT_ACK_OVERDUE}: no value for {{${k}}}`);
      return F(k);
    });
    const subject = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    if (!subject) throw new Error(`${PT_ACK_OVERDUE}: no title`);
    const RECEIPT = 'Get_Ack_Overdue_Receipt';
    G.Foreach_Overdue_Submission = { type: 'Foreach', foreach: `@${sel.inputs.from.replace(/^@/, '')}`, runAfter: ok('Get_Unacknowledged_Submissions'),
      runtimeConfiguration: { concurrency: { repetitions: 1 } },
      actions: {
        Compose_Ack_Overdue_Is_Overdue: { type: 'Compose', runAfter: {}, inputs: `@${per(cond)}` },
        Condition_Ack_Overdue: { type: 'If', runAfter: ok('Compose_Ack_Overdue_Is_Overdue'),
          expression: { and: [{ equals: ["@outputs('Compose_Ack_Overdue_Is_Overdue')", true] }] },
          actions: {
            [RECEIPT]: { type: 'OpenApiConnection', runAfter: {}, inputs: {
              host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
              parameters: { dataset: RECEIPTS_LIST.site, table: RECEIPTS_LIST.table, $top: 1,
                $filter: `@concat('MessageType eq ''citizen-ack-overdue'' and Status eq ''sent'' and Reference eq ''',replace(${REF},'''',''''''),'''')` } } },
            Compose_Ack_Overdue_Fields: { type: 'Compose', runAfter: ok(RECEIPT), inputs: {
              referenceRaw: `@${REF}`,
              emailRaw: `@${EMAIL}`,
              citizenName: `@{if(empty(${NAME}),'Sir/Madam',${esc(NAME)})}`,
              citizenEmail: `@{${esc(EMAIL)}}`,
              trackingNumber: `@{${esc(REF)}}`,
              submittedDate: `@{${WAT(`convertFromUtc(${SUBMITTED},'W. Central Africa Standard Time')`)}}`,
              dueDate: `@{${WAT(per(due))}}`,
              trackingUrl: `@{if(empty(outputs('Compose_Notify_Config')?['trackUrl']),'',concat(outputs('Compose_Notify_Config')?['trackUrl'],if(contains(outputs('Compose_Notify_Config')?['trackUrl'],'?'),'&','?'),'id=',uriComponent(${REF}),'&email=',uriComponent(${EMAIL})))}`,
            } },
            Compose_Ack_Overdue_Should_Notify: { type: 'Compose', runAfter: ok('Compose_Ack_Overdue_Fields'),
              inputs: `@and(equals(outputs('Compose_Notify_Config')?['enabled'],true),empty(coalesce(outputs('${RECEIPT}')?['body/value'],json('[]'))),not(empty(${REF})),contains(${EMAIL},'@'),lessOrEquals(length(${EMAIL}),255))` },
            Condition_Notify_Ack_Overdue: { type: 'If', runAfter: ok('Compose_Ack_Overdue_Should_Notify'),
              expression: { and: [{ equals: ["@outputs('Compose_Ack_Overdue_Should_Notify')", true] }] },
              actions: {
                Compose_Ack_Overdue_Html: { type: 'Compose', runAfter: {}, inputs: body },
                Send_Citizen_Ack_Overdue_Email: { type: 'OpenApiConnection', runAfter: ok('Compose_Ack_Overdue_Html'), inputs: {
                  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
                  parameters: { 'emailMessage/To': "@outputs('Compose_Ack_Overdue_Fields')?['emailRaw']",
                    'emailMessage/Subject': subject.replace('{{trackingNumber}}', "@{outputs('Compose_Ack_Overdue_Fields')?['referenceRaw']}"),
                    'emailMessage/Body': "@outputs('Compose_Ack_Overdue_Html')", 'emailMessage/Importance': 'Normal',
                    'emailMessage/ReplyTo': "@outputs('Compose_Notify_Config')?['replyTo']" } } },
                /* The receipt's Reference is the submission, not the run, so the next sweep finds it. */
                Create_Send_Citizen_Ack_Overdue_Email_Receipt: { type: 'OpenApiConnection', runAfter: { Send_Citizen_Ack_Overdue_Email: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: {
                  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
                  parameters: { dataset: RECEIPTS_LIST.site, table: RECEIPTS_LIST.table,
                    'item/Title': "@concat('citizen-ack-overdue:',string(coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])),':',string(workflow()?['run']?['name']))",
                    'item/MessageType': 'citizen-ack-overdue',
                    'item/RecipientEmail': "@outputs('Compose_Ack_Overdue_Fields')?['emailRaw']",
                    'item/Reference': "@outputs('Compose_Ack_Overdue_Fields')?['referenceRaw']",
                    'item/SentAtUtc': '@utcNow()',
                    'item/Status': "@if(equals(actions('Send_Citizen_Ack_Overdue_Email')?['status'],'Succeeded'),'sent','failed')",
                    'item/Attempts': 1,
                    'item/LastError': "@if(equals(actions('Send_Citizen_Ack_Overdue_Email')?['status'],'Succeeded'),'',substring(string(coalesce(actions('Send_Citizen_Ack_Overdue_Email')?['error']?['message'],actions('Send_Citizen_Ack_Overdue_Email')?['outputs']?['body']?['message'],'send failed')),0,min(length(string(coalesce(actions('Send_Citizen_Ack_Overdue_Email')?['error']?['message'],actions('Send_Citizen_Ack_Overdue_Email')?['outputs']?['body']?['message'],'send failed'))),900)))" } } },
                Compose_Send_Citizen_Ack_Overdue_Email_Outcome: { type: 'Compose', runAfter: { Create_Send_Citizen_Ack_Overdue_Email_Receipt: ALWAYS },
                  inputs: "@int(if(or(equals(actions('Send_Citizen_Ack_Overdue_Email')?['status'],'Failed'),equals(actions('Send_Citizen_Ack_Overdue_Email')?['status'],'TimedOut')),'send-failed','0'))" },
              },
              else: { actions: {} } },
          },
          else: { actions: {} } },
      } };
    G.Compose_Sweep_Counts.runAfter = { ...G.Compose_Sweep_Counts.runAfter, Foreach_Overdue_Submission: ['Succeeded'] };
  });
}

/* ---------------------------------------------------------------- IP_SCAN_INTAKE (from the tenant capture) */
function scan(pkg, log) {
  const A = pkg.serializedValue.actions;
  const RQ = "variables('varRequestId')";
  const SHA = "outputs('Compose_Scan_Sha256')";

  edit(log, '§8.2: the year is no longer read in UTC and the LockToken is retired. Compose_Scan_Year and Compose_Scan_LockToken are removed; the kit\'s claim takes the WAT year.', () => {
    const { parent } = locate(A, 'Compose_Scan_Year');
    if (JSON.stringify(parent.Compose_Scan_LockToken.runAfter) !== JSON.stringify(ok('Compose_Scan_Year'))) throw new Error('scan header order changed in the source');
    if (JSON.stringify(parent.Compose_Scan_Caller.runAfter) !== JSON.stringify(ok('Compose_Scan_LockToken'))) throw new Error('scan header order changed in the source');
    parent.Compose_Scan_Caller.runAfter = structuredClone(parent.Compose_Scan_Year.runAfter);
    delete parent.Compose_Scan_Year; delete parent.Compose_Scan_LockToken;
  });

  edit(log, 'G-04, owner decision 2026-10-08: the trigger is open to anyone, as every other endpoint is, so the caller can no longer come from x-ms-client-principal-name (set only for a tenant-authenticated trigger; on an open one any caller could send it). The caller is the address of the sign-in proof Folio sends (core/scan-intake-service.js authHeaders), looked up in the proof ledger: unconsumed, Purpose internal-session, unexpired. A deposit always needs a valid proof: with none the caller is empty, no directory row matches, and the existing check answers 401. The directory and role check that follows is unchanged.', () => {
    const { parent } = locate(A, 'Compose_Scan_Caller');
    const ledger = JSON.parse(readFileSync(join(ROOT, 'docs/reference/internal-proof-ledger.json'), 'utf8'));
    const site = ledger.listId ? ledger.listToProvision.site : 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre';
    const table = ledger.listId || 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9';
    const ROWS = "coalesce(outputs('Get_Scan_Proof')?['body/value'],json('[]'))";
    const after = parent.Compose_Scan_Caller.runAfter;
    parent.Compose_Scan_Proof_Token = { type: 'Compose', runAfter: after,
      inputs: "@trim(replace(replace(string(coalesce(triggerOutputs()?['headers']?['X-DGO-Proof'],triggerOutputs()?['headers']?['x-dgo-proof'],triggerOutputs()?['headers']?['Authorization'],triggerOutputs()?['headers']?['authorization'],'')),'Bearer ',''),'bearer ',''))" };
    parent.Get_Scan_Proof = { type: 'OpenApiConnection', runAfter: ok('Compose_Scan_Proof_Token'), inputs: {
      host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
      parameters: { dataset: site, table, $filter: "@if(empty(outputs('Compose_Scan_Proof_Token')),'ID eq 0',concat('Title eq ''',replace(outputs('Compose_Scan_Proof_Token'),'''',''''''),''' and Consumed eq 0 and Purpose eq ''internal-session'''))", $top: 1 } } };
    parent.Compose_Scan_Caller = { ...parent.Compose_Scan_Caller, runAfter: ok('Get_Scan_Proof'),
      inputs: `@if(and(not(empty(outputs('Compose_Scan_Proof_Token'))),greater(length(${ROWS}),0),greater(ticks(coalesce(first(${ROWS})?['ExpiresAtUtc'],'1900-01-01T00:00:00Z')),ticks(utcNow()))),toLower(trim(string(coalesce(first(${ROWS})?['Email'],'')))),'')` };
  });

  edit(log, '§8.2: the Registry Reference is claimed by the generation kit (10 attempts, IF-MATCH, counter row found by Prefix and Year, floored at the highest number in Portal Registry), the same block SUBMISSION uses, so portal and scan share one number line (T2). The LockToken claim is removed. It also removes padLeft(), which the service refused live on 28 September ("The template function \'padLeft\' is not defined or not valid"): every deposit that reached the number failed. When every attempt loses, the reply is 503 RETRY_LATER (was 409).', () => {
    const { parent } = locate(A, 'Get_Scan_Sequence_Counter');
    const want = ['Get_Scan_Sequence_Counter', 'Condition_Scan_Sequence_Exists', 'Get_Scan_Sequence_Confirm', 'Condition_Scan_Lock_Held'];
    if (Object.keys(parent).join() !== want.join()) throw new Error(`claim branch holds ${Object.keys(parent).join(', ')}`);
    const held = parent.Condition_Scan_Lock_Held;
    const win = held.actions, lost = held.else.actions;
    for (const n of Object.keys(parent)) delete parent[n];
    Object.assign(parent, K.chain(
      K.readDatasetBindings({ keys: ['SEQUENCE_COUNTERS', 'INTAKE_REGISTER', 'SCAN_LIBRARY'], configSite: CONFIG_SITE }),
      K.environmentPrefix(),
      K.entityKey('Record'),
      K.claimReference({ tag: 'Registry', prefix: 'NITDA', floor: { dataset: 'INTAKE_REGISTER', column: 'ReferenceId' } }),
    ));
    parent.Compose_Scan_Reference = { type: 'Compose', inputs: "@string(coalesce(first(outputs('Compose_Claim_Registry')?['references']),''))", runAfter: ok('Compose_Claim_Registry') };
    delete win.Compose_Scan_Next_Sequence; delete win.Compose_Scan_Reference; delete win.Update_Scan_Sequence_Counter;
    lost.Set_variable_varStatusCode_Scan_409.inputs.value = 503;
    lost.Append_to_array_variable_varErrors_Scan_Lock.inputs.value.message = 'A reference number could not be issued after 10 attempts because of concurrent traffic. Retry.';
    lost.Set_variable_varData_Scan_Lock.inputs.value = { requestId: `@${RQ}`, accepted: false, retryable: true, error: 'RETRY_LATER' };
    parent.Condition_Scan_Claimed = {
      type: 'If',
      expression: { and: [{ equals: ["@empty(outputs('Compose_Scan_Reference'))", false] }] },
      runAfter: ok('Compose_Scan_Reference'),
      actions: win,
      else: { actions: lost },
    };
    /* The designer refuses a step nested deeper than 8 levels ("nested at level '9' which exceeds the maximum nesting
       limit of '8'", the operator's paste of 5 October 2026). The five gates before the claim (authorised, rate limit,
       metadata, size, already processed) are each nested in the last, and the kit adds two levels. So the gates stay as
       they are, the innermost one's pass branch now holds only a marker, and the claim and the deposit run in one
       condition beside the gates, at the scope's top level, when that marker ran. */
    const claim = { ...parent };
    for (const n of Object.keys(parent)) delete parent[n];
    parent.Compose_Scan_Cleared = { type: 'Compose', inputs: true, runAfter: {} };
    const glob = locate(A, 'Scope_Global_Scan').a.actions;
    if (JSON.stringify(glob.Condition_Scan_Authorised.runAfter) !== JSON.stringify(ok('Compose_Scan_Permitted'))) throw new Error('scan gate order changed in the source');
    glob.Condition_Scan_Proceed = {
      type: 'If',
      expression: { and: [{ equals: ["@string(actions('Compose_Scan_Cleared')?['status'])", 'Succeeded'] }] },
      runAfter: ok('Condition_Scan_Authorised'),
      actions: claim,
      else: { actions: {} },
    };
  });

  edit(log, 'S7 / §10.2: every scan now has a Portal Registry row, as every portal submission does: Title and ReferenceId = the reference, Subject = the file name, Channel scan, CorrespondenceType Incoming, Status received, AttachmentCount 1, AttachmentHashSet (first 12 hex of the declared SHA-256), EntityKey, IdState ACTIVE, Rev 1, Direction In, CorrelationId and CreatedByRequest = the Request ID, and SourceLocator = the stored file\'s path. SenderEmail is the registry mailbox (Flow Configuration NOTIFY_REGISTRY_TO, else dgsRegistry@nitda.gov.ng), owner decision 4 October 2026: a paper letter\'s sender is not known to the system, so status e-mails for scans go to the registry. The scanning officer stays on the audit event. The row is written before the file, and if it fails a VOID row accounts for the number (Q2).', () => {
    const win = locate(A, 'Condition_Scan_Claimed').a.actions;
    const name = win.Compose_Scan_Stored_Name;
    win.Get_Scan_Registry_Mailbox = {
      type: 'OpenApiConnection', runAfter: {},
      inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'GetItems' },
        parameters: { dataset: CONFIG_SITE, table: '9bc168c3-06e5-4d58-982b-0df06205fd35', $filter: "Title eq 'NOTIFY_REGISTRY_TO'", $top: 1 } },
    };
    const CFG = "toLower(trim(string(coalesce(first(coalesce(outputs('Get_Scan_Registry_Mailbox')?['body/value'],json('[]')))?['ConfigValue'],''))))";
    win.Compose_Scan_Sender = { type: 'Compose', inputs: `@if(empty(${CFG}),'dgsregistry@nitda.gov.ng',${CFG})`, runAfter: ok('Get_Scan_Registry_Mailbox') };
    win.Compose_EntityKey_Scan_File = { type: 'Compose', inputs: '@guid()', runAfter: ok('Compose_Scan_Sender') };
    win.Create_Scan_Record = {
      type: 'OpenApiConnection', runAfter: ok('Compose_EntityKey_Scan_File'),
      inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
        parameters: {
          dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS', table: '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667',
          'item/Title': "@outputs('Compose_Scan_Reference')",
          'item/ReferenceId': "@outputs('Compose_Scan_Reference')",
          'item/Subject': "@outputs('Compose_Scan_Filename_Decoded')",
          'item/Channel': 'scan',
          'item/CorrespondenceType': 'Incoming',
          'item/SenderEmail': "@outputs('Compose_Scan_Sender')",
          'item/Status/Value': 'received',
          'item/StatusLabel': 'Received',
          'item/AttachmentCount': 1,
          'item/SubmittedAtUtc': '@utcNow()',
          'item/UpdatedAtUtc': '@utcNow()',
          'item/ActionRequired': false,
          'item/AttachmentHashSet': `@substring(concat(${SHA},'000000000000'),0,12)`,
          'item/EntityKey': "@outputs('Compose_EntityKey_Record')",
          'item/IdState/Value': 'ACTIVE',
          'item/Rev': 1,
          'item/Direction/Value': 'In',
          'item/CorrelationId': `@${RQ}`,
          'item/CreatedByRequest': `@${RQ}`,
          'item/SourceLocator': "@concat('/NITDA_Central_Registry/',outputs('Compose_Scan_Stored_Name'))",
        } },
    };
    const v = K.voidRow({ tag: 'Registry', dataset: 'INTAKE_REGISTER', referenceColumn: 'ReferenceId', reference: "@{outputs('Compose_Scan_Reference')}", reason: 'RECORD_WRITE_FAILED',
      fields: { Title: 'VOID', Status: 'void', SenderEmail: "@{outputs('Compose_Scan_Sender')}", CreatedByRequest: `@{${RQ}}` } });
    win.Create_Void_Registry = { ...v.Create_Void_Registry, runAfter: { Create_Scan_Record: ['Failed', 'TimedOut'] } };
    if (win.Create_Void_Registry.inputs.parameters['parameters/body'].includes('Compose_Request_Context')) throw new Error('VOID row still reads Compose_Request_Context');
    /* §8.3 stored file name: <lower(ref), - to _>_<first 8 hex of the file's Entity Key>_<name>. */
    name.inputs = "@concat(toLower(replace(outputs('Compose_Scan_Reference'),'-','_')),'_',substring(outputs('Compose_EntityKey_Scan_File'),0,8),'_',outputs('Compose_Scan_Filename_Decoded'))";
    /* The row's SourceLocator reads the stored name, so the name is composed first (the designer refuses a reference to
       an action that is not on the runAfter path: IP_SCAN_INTAKE save, 5 October 2026), then the row, then the file. */
    name.runAfter = ok('Compose_EntityKey_Scan_File');
    win.Create_Scan_Record.runAfter = ok('Compose_Scan_Stored_Name');
    if (JSON.stringify(win.Create_Scan_File.runAfter) !== JSON.stringify(ok('Compose_Scan_Stored_Name'))) throw new Error('scan file order changed in the source');
    win.Create_Scan_File.runAfter = ok('Create_Scan_Record');
  });

  edit(log, '§10.2 SCAN_LIBRARY: the stored file\'s library item gets its identity columns (EntityKey, whose first 8 hex are in the file name; ParentKey and RootKey REC:<the record\'s key>; RootRef; IdState ACTIVE; Rev 1; CreatedByRequest) through the kit\'s Guarded Update, addressed through Flow Configuration (DATASET_SCAN_LIBRARY_*). A failure here does not undo the deposit: the reply follows whatever its outcome.', () => {
    const win = locate(A, 'Condition_Scan_Claimed').a.actions;
    const QK = "concat('REC:',outputs('Compose_EntityKey_Record'))";
    const changes = K.bodyExpr({
      EntityKey: "@outputs('Compose_EntityKey_Scan_File')",
      ParentKey: `@${QK}`, RootKey: `@${QK}`,
      RootRef: "@outputs('Compose_Scan_Reference')",
      IdState: 'ACTIVE',
      CreatedByRequest: `@${RQ}`,
    }).slice(1);
    win.Condition_Scan_File_Stored = {
      type: 'If',
      expression: { and: [{ equals: ["@outputs('Compose_Scan_Stored')", true] }] },
      runAfter: ok('Compose_Scan_Stored'),
      actions: K.chain(K.guardedUpdate({ tag: 'Scan_File', dataset: 'SCAN_LIBRARY', itemId: "@{outputs('Create_Scan_File')?['body/ItemId']}", changes })),
      else: { actions: {} },
    };
    if (JSON.stringify(win.Set_variable_varStatusCode_Scan_200.runAfter) !== JSON.stringify(ok('Compose_Scan_Stored'))) throw new Error('scan success order changed in the source');
    /* Not Skipped: the condition is skipped only when the record or file step before it failed, and then no 200 may be set. */
    win.Set_variable_varStatusCode_Scan_200.runAfter = { Condition_Scan_File_Stored: ['Succeeded', 'Failed', 'TimedOut'] };
  });

  edit(log, 'The reply now carries the fields Folio\'s scan service reads at its top level (core/scan-intake-service.js: referenceId, attachmentLink, stored, depositedBy, depositedAt, sha256, bytes). The flow answered with an envelope whose data held reference and resource, so even a successful deposit showed the officer an empty reference. The envelope keeps its own fields.', () => {
    const d = locate(A, 'Set_variable_varData_Scan_Deposited').a.inputs.value;
    Object.assign(d, {
      referenceId: "@outputs('Compose_Scan_Reference')",
      attachmentLink: "@outputs('Compose_Scan_Link')",
      stored: "@outputs('Compose_Scan_Stored')",
      depositedBy: "@outputs('Compose_Scan_Caller')",
      depositedAt: '@utcNow()',
      sha256: `@${SHA}`,
      bytes: "@outputs('Compose_Scan_Declared_Bytes')",
    });
    const r = locate(A, 'Compose_Response_Body').a;
    if (r.inputs !== "@outputs('Compose__Standard_Response_Revised')") throw new Error('Compose_Response_Body changed in the source');
    const D = (k) => `variables('varData')?['${k}']`;
    r.inputs = `@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(outputs('Compose__Standard_Response_Revised'),'requestId',${RQ}),'referenceId',${D('referenceId')}),'attachmentLink',${D('attachmentLink')}),'stored',${D('stored')}),'depositedBy',${D('depositedBy')}),'depositedAt',${D('depositedAt')}),'sha256',${D('sha256')}),'bytes',${D('bytes')})`;
  });

  edit(log, '§10.2 AUDIT_LOG: the deposit event in DGO_AuditLog carries its Entity Key, SubjectKey and RootKey REC:<key>, RootRef, CorrelationId, RevAfter 1, Process INTAKE and ContractKey SCAN_INTAKE.', () => {
    const p = locate(A, 'Create_Scan_Audit').a.inputs.parameters;
    const QK = "@concat('REC:',outputs('Compose_EntityKey_Record'))";
    Object.assign(p, {
      'item/EntityKey': '@guid()', 'item/SubjectKey': QK, 'item/RootKey': QK,
      'item/RootRef': "@outputs('Compose_Scan_Reference')", 'item/CorrelationId': `@${RQ}`,
      'item/RevAfter': 1, 'item/Process': 'INTAKE', 'item/ContractKey': 'SCAN_INTAKE',
    });
  });

  edit(log, 'Two expressions carried over from the live flow are corrected. The notification condition tested contains(caller, "@") with a bare "@", which the workflow language reads as an empty expression, not the character; it is now "@@", the literal @. Compose_Complete_Run_Record wrapped its expression in @{...}, which makes the value text, so the final telemetry update\'s setProperty() on it failed on every run; it is now the object itself.', () => {
    const c = locate(A, 'Condition_DGO_Notification_Recipient_Valid').a;
    const was = JSON.stringify(c.expression);
    if (!was.includes('"@outputs(\'Compose_Scan_Caller\')","@"]')) throw new Error('notification condition changed in the source');
    c.expression = JSON.parse(was.replace('"@outputs(\'Compose_Scan_Caller\')","@"]', '"@outputs(\'Compose_Scan_Caller\')","@@"]'));
    const r = locate(A, 'Compose_Complete_Run_Record').a;
    const t = String(r.inputs).trim();
    if (!(t.startsWith('@{') && t.endsWith('}'))) throw new Error('Compose_Complete_Run_Record changed in the source');
    r.inputs = `@${t.slice(2, -1).trim()}`;
  });

  edit(log, '§10.2 FLOW_TELEMETRY: the run row carries RequestId, CorrelationId (this flow starts the transaction), the Flow Registry Key DGO:<flow ID> and ContractKey SCAN_INTAKE.', () => {
    Object.assign(locate(A, 'Create_Flow_Telemetry').a.inputs.parameters, {
      'item/RequestId': `@${RQ}`, 'item/CorrelationId': `@${RQ}`,
      'item/RegistryKey': "@concat('DGO:',string(workflow()?['name']))", 'item/ContractKey': 'SCAN_INTAKE',
    });
  });

  edit(log, 'X-DGO-Size is read without failing when it is absent: the service evaluates both arms of if(), so int() of an empty header failed the scope before any check (a write-back carries no file). The value is chosen first and converted once: int(if(valid, the header, \'0\')); a deposit with no size still answers 400 from the size check.', () => {
    const G = A.Scope_Global_Scan.actions;
    const SIZE = "trim(string(coalesce(triggerOutputs()?['headers']?['X-DGO-Size'],triggerOutputs()?['headers']?['x-dgo-size'],'')))";
    const was = G.Compose_Scan_Declared_Bytes.inputs;
    if (!String(was).startsWith('@if(and(not(empty(') || !String(was).endsWith(`int(${SIZE}),0)`)) throw new Error('Compose_Scan_Declared_Bytes changed in the source');
    const cond = String(was).slice('@if('.length, -(`,int(${SIZE}),0)`.length));
    G.Compose_Scan_Declared_Bytes.inputs = `@int(if(${cond},${SIZE},'0'))`;
  });

  edit(log, 'Tenant defect (8 October 2026, first live write-back): the caller\'s role is read from the directory row\'s Role choice, as FETCH_ALL reads it. The connector returns a Choice column as an object, which the flow read as text, so the RoleId lookup never matched and every caller was refused: 403 on a write-back, and no officer could deposit.', () => {
    const { parent } = locate(A, 'Compose_Scan_Role');
    if (parent.Compose_Scan_Role.inputs !== "@toLower(trim(string(coalesce(first(outputs('Get_Scan_Directory_User')?['body/value'])?['Role'],''))))") throw new Error('Compose_Scan_Role changed in the source');
    parent.Compose_Scan_Role.inputs = `@${ROLE_OF("first(coalesce(outputs('Get_Scan_Directory_User')?['body/value'],json('[]')))")}`;
  });

  edit(log, 'Tenant defect (8 October 2026, first live write-back): an absent X-DGO-Filename failed the scope before any check, because substring() of an empty string fails ("start index must be less than the length") and a write-back carries no file. The decoded name is now empty when the header is: the name is padded with one character before it is cut and the pad is never part of the result. A deposit with no name still fails the metadata check.', () => {
    const G = A.Scope_Global_Scan.actions;
    const was = String(G.Compose_Scan_Filename_Decoded.inputs);
    const m = /^@substring\((.*),0,min\(length\((.*)\),180\)\)$/.exec(was);
    if (!m || m[1] !== m[2]) throw new Error('Compose_Scan_Filename_Decoded changed in the source');
    /* substring(concat(x,'_'),0,min(length(x),180)): the start index 0 is always inside the padded string. */
    G.Compose_Scan_Filename_Decoded.inputs = `@substring(concat(${m[1]},'_'),0,min(length(${m[1]}),180))`;
  });

  edit(log, 'D1 / ITEM-6 (owner direction 2026-10-08, "proceed as recommended"): the staff status write-back is a second branch on the intake flow, which the owner identifies as IP_SCAN_INTAKE (ITEM-86). A request carrying X-DGO-Action: writeback sets a portal submission\'s status from Folio; every other request takes the deposit path unchanged. The caller is the sign-in proof\'s officer (above), who must be an active directory user (401) whose role carries "*" or the correspondence route (403). The body names referenceId, status (received, validation, review, action-required, approved or declined: the portal\'s governed values; withdrawn stays the citizen\'s) and optionally label and note (400 otherwise). The Portal Registry row is found by ReferenceId (404 if none) and gets Status, StatusLabel, ActionRequired, UpdatedAtUtc, AcknowledgedAtUtc on its first move past received, and ClosedAtUtc on approved or declined; a Portal Status Timeline row records the change with the officer as Actor. CG_Registry_Status_Notifier, triggered by the row change, tells the citizen.', () => {
    const G = A.Scope_Global_Scan.actions;
    if (!G.Condition_Scan_Authorised || !G.Condition_Scan_Proceed || !G.Compose_Scan_Permitted) throw new Error('scan authorisation shape changed');
    const auth = G.Condition_Scan_Authorised, proceed = G.Condition_Scan_Proceed;
    delete G.Condition_Scan_Authorised; delete G.Condition_Scan_Proceed;
    const NEDMS = 'https://nitdanigeria.sharepoint.com/sites/NEDMS', REG = '4c49f66a-23cd-4e1f-8ce7-ec1bb40eb667', TL = '5b486a5e-0ce7-46d7-a159-d84c77f3d1fd';
    const sp = (operationId, parameters, runAfter) => ({ type: 'OpenApiConnection', runAfter, inputs: {
      host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId }, parameters } });
    const IN = (k) => `outputs('Compose_Scan_Writeback_Input')?['${k}']`;
    const ROW = "first(coalesce(outputs('Get_Scan_Writeback_Submission')?['body/value'],json('[]')))";
    const PROW = "first(coalesce(outputs('Get_Scan_Role_Permissions')?['body/value'],json('[]')))";
    const STATUSES = "createArray('received','validation','review','action-required','approved','declined')";
    const LABELS = { received: 'Received by the registry.', validation: 'Being validated by the registry.', review: 'Under review.', 'action-required': 'The registry needs more information from you.', approved: 'Approved.', declined: 'Declined.' };
    const LABEL = `@if(empty(${IN('label')}),string(coalesce(json('${JSON.stringify(LABELS)}')?[${IN('status')}],'')),${IN('label')})`;
    const reply = (tag, code, data, message, after) => ({
      [`Set_variable_varStatusCode_Scan_Writeback_${tag}`]: { type: 'SetVariable', runAfter: after, inputs: { name: 'varStatusCode', value: code } },
      ...(message ? { [`Append_to_array_variable_varErrors_Scan_Writeback_${tag}`]: { type: 'AppendToArrayVariable', runAfter: ok(`Set_variable_varStatusCode_Scan_Writeback_${tag}`),
        inputs: { name: 'varErrors', value: { scope: 'Scan', stage: 'writeback', status: 'failed', message, trackedAtUtc: '@utcNow()' } } } } : {}),
      [`Compose_Value_Set_variable_varData_Scan_Writeback_${tag}`]: { type: 'Compose', runAfter: ok(message ? `Append_to_array_variable_varErrors_Scan_Writeback_${tag}` : `Set_variable_varStatusCode_Scan_Writeback_${tag}`), inputs: data },
      [`Set_variable_varData_Scan_Writeback_${tag}`]: { type: 'SetVariable', runAfter: ok(`Compose_Value_Set_variable_varData_Scan_Writeback_${tag}`),
        inputs: { name: 'varData', value: `@outputs('Compose_Value_Set_variable_varData_Scan_Writeback_${tag}')` } },
    });
    const refused = { requestId: `@${RQ}`, accepted: false };
    const writeback = {
      Compose_Scan_Writeback_Input: { type: 'Compose', runAfter: {}, inputs: {
        referenceId: "@toUpper(trim(string(coalesce(triggerBody()?['referenceId'],''))))",
        status: "@toLower(trim(string(coalesce(triggerBody()?['status'],''))))",
        label: "@trim(string(coalesce(triggerBody()?['label'],'')))",
        note: "@trim(string(coalesce(triggerBody()?['note'],'')))" } },
      Compose_Scan_Writeback_Gate: { type: 'Compose', runAfter: ok('Compose_Scan_Writeback_Input'),
        inputs: `@if(or(empty(outputs('Compose_Scan_Caller')),equals(length(coalesce(outputs('Get_Scan_Directory_User')?['body/value'],json('[]'))),0)),'unauthenticated',if(not(or(contains(string(coalesce(${PROW}?['AllowedRoutesJson'],'')),'"*"'),contains(string(coalesce(${PROW}?['AllowedRoutesJson'],'')),'"correspondence"'))),'forbidden',if(or(empty(${IN('referenceId')}),not(contains(${STATUSES},${IN('status')})),greater(length(${IN('note')}),4000),greater(length(${IN('label')}),255)),'invalid','ok')))` },
      Switch_Scan_Writeback_Gate: { type: 'Switch', runAfter: ok('Compose_Scan_Writeback_Gate'), expression: "@outputs('Compose_Scan_Writeback_Gate')",
        cases: {
          Case_Scan_Writeback_Unauthenticated: { case: 'unauthenticated', actions: reply('401', 401, refused, 'Sign in: the caller holds no valid sign-in proof, or is not an active directory user.', {}) },
          Case_Scan_Writeback_Forbidden: { case: 'forbidden', actions: reply('403', 403, refused, 'The caller\'s role does not carry the correspondence route.', {}) },
          Case_Scan_Writeback_Invalid: { case: 'invalid', actions: reply('400', 400, { ...refused, error: 'INVALID_REQUEST', allowedStatuses: Object.keys(LABELS) }, 'referenceId and a governed status are required; label at most 255 and note at most 4000 characters.', {}) },
          Case_Scan_Writeback_Ok: { case: 'ok', actions: {
            Get_Scan_Writeback_Submission: sp('GetItems', { dataset: NEDMS, table: REG, $filter: `@concat('ReferenceId eq ''',replace(${IN('referenceId')},'''',''''''),'''')`, $top: 1 }, {}),
            Condition_Scan_Writeback_Found: { type: 'If', runAfter: ok('Get_Scan_Writeback_Submission'),
              expression: { and: [{ greater: ["@length(coalesce(outputs('Get_Scan_Writeback_Submission')?['body/value'],json('[]')))", 0] }] },
              actions: {
                Update_Scan_Writeback_Registry: sp('PatchItem', { dataset: NEDMS, table: REG, id: `@${ROW}?['ID']`,
                  'item/Title': `@${ROW}?['Title']`, 'item/ReferenceId': `@${ROW}?['ReferenceId']`, 'item/SenderEmail': `@${ROW}?['SenderEmail']`,
                  'item/Status/Value': `@${IN('status')}`, 'item/StatusLabel': LABEL,
                  'item/ActionRequired': `@equals(${IN('status')},'action-required')`, 'item/UpdatedAtUtc': '@utcNow()',
                  'item/AcknowledgedAtUtc': `@if(and(empty(${ROW}?['AcknowledgedAtUtc']),not(equals(${IN('status')},'received'))),utcNow(),${ROW}?['AcknowledgedAtUtc'])`,
                  'item/ClosedAtUtc': `@if(contains(createArray('approved','declined'),${IN('status')}),utcNow(),${ROW}?['ClosedAtUtc'])` }, {}),
                Create_Scan_Writeback_Timeline: sp('PostItem', { dataset: NEDMS, table: TL,
                  'item/Title': `@${ROW}?['ReferenceId']`, 'item/SubmissionRef': `@${ROW}?['ReferenceId']`, 'item/AtUtc': '@utcNow()',
                  'item/Status': `@${IN('status')}`, 'item/Label': LABEL, 'item/Actor': "@outputs('Compose_Scan_Caller')", 'item/Note': `@${IN('note')}`,
                  'item/Action': 'STATUS_SET', 'item/RequestId': `@${RQ}`, 'item/CorrelationId': `@${RQ}`, 'item/RootRef': `@${ROW}?['ReferenceId']`,
                  'item/Process': 'INTAKE', 'item/ContractKey': 'PORTAL_STATUS_WRITEBACK',
                  /* §10.2: an EVT row carries its own Entity Key and names the record it is about, as the RECEIVED row does. */
                  'item/EntityKey': '@{guid()}',
                  'item/RootKey': `@{concat('REC:',toLower(string(${ROW}?['EntityKey'])))}`, 'item/SubjectKey': `@{concat('REC:',toLower(string(${ROW}?['EntityKey'])))}` }, ok('Update_Scan_Writeback_Registry')),
                ...reply('200', 200, { requestId: `@${RQ}`, accepted: true, referenceId: `@${ROW}?['ReferenceId']`, status: `@${IN('status')}`, label: LABEL, updatedBy: "@outputs('Compose_Scan_Caller')" }, null, ok('Create_Scan_Writeback_Timeline')),
              },
              else: { actions: reply('404', 404, { ...refused, error: 'NOT_FOUND' }, 'No portal submission has that reference.', {}) } },
          } },
        },
        default: { actions: reply('500', 500, refused, 'Unexpected gate value.', {}) } },
    };
    G.Condition_Scan_Writeback = { type: 'If', runAfter: ok('Compose_Scan_Permitted'),
      expression: { and: [{ equals: ["@toLower(trim(string(coalesce(triggerOutputs()?['headers']?['X-DGO-Action'],triggerOutputs()?['headers']?['x-dgo-action'],''))))", 'writeback'] }] },
      actions: writeback,
      else: { actions: { Condition_Scan_Authorised: { ...auth, runAfter: {} }, Condition_Scan_Proceed: proceed } } };
  });
}

const FLOWS = [
  { name: 'CG_Submission_Endpoint', id: 'de9ef13b-ae4c-42b0-9afa-20e71a180759', build: submission,
    test: 'Submit once from the portal with an attachment. Expect a NITDA-YYYY-NNNNN reference and a requestId in the reply; in Portal Registry the new row has EntityKey, IdState ACTIVE, Rev 1, CorrelationId and AttachmentHashSet, and no LocalId; in Portal Status Timeline the RECEIVED row has RootRef = the reference. Submit the same form again within 24 hours: the reply is the same reference with replayed: true, and no counter number is used.' },
  { name: 'CG_Portal_Support_Endpoint', id: '4873c936-a2be-4726-8e69-426edb8f70e6', build: support,
    test: "Open a support case from the portal naming a reference issued after the SUBMISSION paste. Expect a CASE-XXXXXX case reference and a requestId; in Portal Support Cases the row has EntityKey, CaseRef = the case reference, IdState ACTIVE and Rev 1; in DGO_RecordLinks one ABOUT row whose FromKey is CAS:<the case's EntityKey> and ToKey is REC:<the record's EntityKey>. A case naming an older reference is created with AboutReference only and no link." },
  { name: 'CG_Portal_Status_Check_Endpoint', id: '60042a2e-dadb-4ad8-a672-38b4132d299f', build: status,
    test: 'Track a reference issued after the SUBMISSION paste, and a portal tracking ID from an older receipt, each with its own sender email. Both answer 200 with the record and a requestId; NITDA-2026-217 and NITDA-2026-00217 each resolve only to their own record (T6).' },
  { name: 'CG_Portal_Writeback_Endpoint', id: 'bde13d27-73b3-4e1a-9687-eb289b039c7a', build: writeback,
    test: 'Add a note to a test submission from track.html. Expect 200; in Portal Registry the row\'s Rev went up by 1 and UpdatedAtUtc changed; in Portal Status Timeline the new row has Action NOTE_ADDED, RevAfter = the new Rev and RootRef = the reference.' },
  { name: 'CG_Upload_Endpoint', id: 'df82e331-b800-4a8d-996e-d2b2ca846c77', build: upload,
    test: 'Submit from the portal with one attachment (after the SUBMISSION paste). In Portal Attachments the new row has EntityKey beginning with the 8 hex characters in its StoredName, ParentKey and RootKey REC:<the register row\'s EntityKey>, RootRef = the reference, IdState ACTIVE and Rev 1; the telemetry row\'s CorrelationId equals the register row\'s CorrelationId.' },
  { name: 'CG_Registry_Status_Notifier', id: '8ebf6001-89cd-49c9-a9b6-4dedb9a5768b', build: notifier,
    test: 'Change the Status of a test row created after the SUBMISSION paste. The e-mail arrives as before; the telemetry row has CorrelationId = the register row\'s CorrelationId and RegistryKey DGO:<the flow\'s ID>.' },
  { name: 'CG_Portal_Daily_Sweep', id: 'f12aec6d-1554-483d-a525-a96ddb60d06f', build: sweep,
    test: 'Run the flow once by hand. It ends Succeeded as before, and its telemetry row carries RequestId, CorrelationId (the same value) and RegistryKey.' },
  /* The verification flows take no Phase 3 change of their own: they are carried here so that each send writes its outbox
     receipt (ITEM-66). The source is the conformance package, as for the other portal flows. */
  { name: 'CG_Portal_Verification_Endpoint', id: 'ba47f79b-a831-49e8-b00b-3f8937c331df', build: () => {},
    test: 'Request a verification code from the portal for a test address. The code arrives as before; Portal Outbox Receipts has a row with MessageType verification-code, Status sent and that address, and no code in any column.' },
  { name: 'CG_Portal_Verification_Confirmation_Endpoint', id: 'f96e3448-3c79-4d42-b224-825258a552ba', build: () => {},
    test: 'Enter a wrong code six times for a test address. The lockout alert arrives as before and Portal Outbox Receipts has a row with MessageType lockout-alert, Status sent.' },
  { name: 'IP_SCAN_INTAKE', id: '5504d7f9-cc96-470c-be79-217582faf415', build: scan,
    load: () => fromCapture('IP_SCAN_INTAKE__5504d7f9-cc96-470c-be79-217582faf415.json', 'Scope_Scan_Flow'),
    source: 'docs/folio-Master-Flows-and-Endpoints/captures/IP_SCAN_INTAKE__5504d7f9-cc96-470c-be79-217582faf415.json (the tenant capture; this flow is not in the conformance package)',
    test: 'Deposit one scan from Folio. The screen shows a NITDA-YYYY-NNNNN reference (it showed none before). In Portal Registry the new row has Channel scan, SenderEmail = the registry mailbox, EntityKey, IdState ACTIVE and Rev 1; in NITDA_Central_Registry the file is named <reference>_<8 hex>_<name> and its EntityKey begins with those 8 hex; DGO_AuditLog has the deposit event with RootRef = the reference. Then T2: a portal submission and a scan in the same second get consecutive numbers.' },
];

/* ---------------------------------------------------------------- build */
/* What the tenant runs comes from the paste ledger (registers/identification-paste-ledger.json), by fingerprint. */
const files = {};
const changes = [];
const statuses = [];
for (const f of FLOWS) {
  /* The conformance stage is built in memory (build-identification-conformance.mjs); it is not kept as packages. */
  const src = f.load ? null : flowArtifactName({ flowName: f.name, kind: 'paste.json' });
  if (src && !conformancePackages[src]) throw new Error(`${f.name}: the conformance stage has no ${src}`);
  const pkg = f.load ? f.load() : structuredClone(conformancePackages[src]);
  const before = names(pkg.serializedValue.actions);
  const log = [];
  const varsBefore = variableSteps(pkg);
  f.build(pkg, log);
  { const held = composeVariableValues(pkg, varsBefore); if (held.length) edit(log, `Set variable values held in a Compose step (the designer dropped inline and changed Set variable values on paste; tenant export of IP_Create__Task__for_received_Email_Endpoint, 6 October 2026): ${held.join(', ')}.`, () => {}); }
  /* ITEM-68: every send's body comes from the e-mail catalogue. */
  if (process.env.DGO_CATALOGUE_BOOTSTRAP !== f.name) applyCatalogue(pkg, flowArtifactName({ flowName: f.name, kind: 'paste.json' }), ROOT);
  const admin = adminRecipients(pkg);
  if (admin.length) edit(log, `Administrative e-mail goes to the registry mailbox (owner decision, 2026-10-06): the fixed recipients ${admin.join(', ')} are set to dgsregistry@nitda.gov.ng (the bulk-failure fallback was dgs@nitda.gov.ng). The configurable ones stay read from Flow Configuration (NOTIFY_OPS_TO, NOTIFY_REGISTRY_TO, NOTIFY_HELPDESK_TO), which fall back to the registry mailbox when blank.`, () => {});
  { const red = redactProofHeader(pkg); if (red.length) edit(log, `The sign-in proof is redacted from the run record (tenant defect, 8 October 2026): ${red.join(', ')} masked Authorization but not X-DGO-Proof, where the proof travels since release 9, so every telemetry row held a usable session token.`, () => {}); }
  { const g = guardUtcInputs(pkg); if (g) edit(log, `Tenant defect 2026-10-18 (AUTO_SCHEDULED_SWEEP run 08584093115454153780858604181CU30): a SharePoint date-only column comes back without a zone, and convertFromUtc refused it. Every date this package converts from a list row, a trigger body or a connector reply (${g}) is read with a Z added when it has none, and an empty one reads as the epoch.`, () => {}); }
  const covered = outboxReceipts(pkg);
  if (covered.length) edit(log, `ITEM-66: every mail send writes a receipt to Portal Outbox Receipts (${covered.join(', ')}): message type, recipient (the send's own To), the run as reference, sent or failed, and the error on failure; never the message body. Compose_<send>_Outcome fails exactly when the send failed, so the scope around it ends as it did before the receipt was added and the flow's catch path still fires.`, () => {});
  const after = names(pkg.serializedValue.actions);
  const kept = Object.fromEntries(Object.entries(pkg.allConnectionData).filter(([n]) => after.has(n)));
  pkg.allConnectionData = { ...kept, ...adoptConnections(pkg, before) };
  bindReceipts(pkg);
  { const mail = registryMailConnection(pkg); if (mail.length) edit(log, `ITEM-77 (owner decision, 2026-10-06): every Office 365 step signs in as the registry mailbox, dgsregistry@nitda.gov.ng, connection c0b9e7a5 (${mail.join(', ')} used another connection).`, () => {}); }
  const file = flowArtifactName({ flowName: f.name, kind: 'paste.json' });
  files[file] = `${JSON.stringify(pkg, null, 2)}\n`;
  changes.push({ ...f, file, srcFile: src ? src.split('/').pop() : null, log, added: [...after].filter((n) => !before.has(n)), removed: [...before].filter((n) => !after.has(n)), root: pkg.nodeId, steps: after.size });
  { const st = packageStatus(changes[changes.length - 1], pkg, messagesOf(pkg).length, packageFingerprint(pkg));
    statuses.push({ ...st, variableStepsChanged: variableStepsChanged(varsBefore, variableSteps(pkg)) });
    changes[changes.length - 1].tenant = st.tenant; }
}

files['README.md'] = `# Identification Phase 3: portal-facing flows on the generation kit

**Generated by \`npm run idphase3\` from \`scripts/build-identification-phase3.mjs\`. Do not edit by hand.**

[IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) §13, Phase 3. Each file is
the flow's root scope, built from the conformance stage (\`scripts/build-identification-conformance.mjs\`, built in
memory and not kept as packages) or, for IP_SCAN_INTAKE, which that stage does not cover, from the tenant capture,
with the Phase 3 edits below applied. IP_SCAN_INTAKE's root scope sets the variables its flow
declares above it; keep those **Initialize variable** steps when pasting it.
\`tests/identification-phase3.test.mjs\` runs every file in the strict simulator (\`scripts/lib/wdl-sim.mjs\`)
against an in-memory SharePoint that keeps the lists' columns and the counter's ETag rule.

## Before pasting

- Phase 1 is complete: the identity columns exist on Portal Registry, Portal Status Timeline and Portal Flow
  Telemetry, and Flow Configuration holds \`ENVIRONMENT_CODE\` (\`prd\`) and the \`DATASET_*\` rows
  ([provisioning](../../../reference/identification/provisioning/README.md)).
- Phase 2 is complete: the kit's claim passed the tenant exit test
  ([identification-phase2](../identification-phase2/README.md)).
- **One list setting, once.** The VOID row (owner decision Q2) writes Status \`void\`, which is not among Portal
  Registry's Status choices (\`portal-field-spec.json\`: received, validation, review, action-required, approved,
  declined, withdrawn). NEDMS → Portal Registry → *List settings* → **Status** → add the choice \`void\` → OK.
  Nothing else changes; the existing choices and the default stay as they are.
- **One value to confirm, for SUPPORT.** In Flow Configuration, \`DATASET_RECORD_LINKS_LIST_ID\` must hold
  \`c3875803-8a9c-42d6-86b9-85e3f0ca5eef\`, the DGO_RecordLinks list ID the Phase 1 completion run recorded. The
  provisioning template shipped it as "(set after the list is created)". If it still says that, the ABOUT link is
  not written (the case itself is unaffected).

## How to apply

**All at once:** \`npm run flows:update -- apply\` writes every package below into its flow, backing each flow up first and
reading it back ([FLOWS_UPDATE.md](../../deployment/FLOWS_UPDATE.md)). Or by hand, one flow at a time:

For each flow: open it, delete the root scope named below, select the step above where it was, choose
**Paste an action**, paste the file, and save. If a step shows *Invalid connection*, open it, choose the existing
SharePoint connection once, and the others pick it up. Then run the flow's test.

| Flow | Flow ID | Root scope | Steps | File | In the tenant |
|---|---|---|---|---|---|
${changes.map((c) => `| ${c.name} | \`${c.id}\` | \`${c.root}\` | ${c.steps} | \`${c.file}\` | ${c.tenant} |`).join('\n')}

## Changes

${changes.map((c) => `### ${c.name}

Source: ${c.source ? c.source : `the conformance stage, built in memory by \`scripts/build-identification-conformance.mjs\` (\`${c.srcFile}\`)`}.

${c.log.map((l) => `- ${l}`).join('\n')}

Steps added: ${c.added.length ? c.added.map((n) => `\`${n}\``).join(', ') : 'none'}.

Steps removed: ${c.removed.length ? c.removed.map((n) => `\`${n}\``).join(', ') : 'none'}.

**Test after pasting.** ${c.test}
`).join('\n')}
## Phase 3 tenant tests (§14.3)

Run once every Phase 3 flow is pasted (§13: Phase 3 exits on flow lint, which \`npm run test:idphase3\` is, and T1–T6):

| # | Test | Flow | Pass condition |
|---|---|---|---|
| T1 | 20 concurrent portal submissions | SUBMISSION | 20 distinct, consecutive NITDA-YYYY-NNNNN; no gaps; the counter equals the last |
| T2 | A portal submission and a scan intake in the same second | SUBMISSION, SCAN_INTAKE | Consecutive numbers from the one counter. Waits on SCAN_INTAKE (an internal flow, Phase 4 in this repo's sequence). |
| T3 | The same content twice within 24 hours | SUBMISSION | The second call returns the first reference; nothing new is issued |
| T4 | The client sends \`requestId\`, \`ref\` and \`localId\` | SUBMISSION, SUPPORT | Ignored; logged as ClientCorrelationId only |
| T5 | A support case naming a reference | SUPPORT | \`^CASE-[A-HJ-NP-Z2-9]{6}$\`; an ABOUT link when the record has an Entity Key |
| T6 | STATUS with NITDA-2026-217 (legacy) and with NITDA-2026-00217 | STATUS | Each resolves to its own record, or not found; never to the other |
`;

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
  const STATUS = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-phase3-status.json';
  const body = `${JSON.stringify({ schema: 'dgo-identification-status/v1', generatedBy: 'scripts/build-identification-phase3.mjs', phase: 3, packages: statuses }, null, 2)}\n`;
  let cur = null; try { cur = readFileSync(join(ROOT, STATUS), 'utf8'); } catch { /* new */ }
  if (cur !== body) {
    if (CHECK) { console.error(`stale: ${STATUS} — run: npm run idphase3`); process.exit(1); }
    writeFileSync(join(ROOT, STATUS), body);
  }
}
if (CHECK && stale) { console.error('identification phase 3 is out of date — run: npm run idphase3'); process.exit(1); }
console.log(`identification phase 3: ${Object.keys(files).length} files ${CHECK ? 'up to date' : 'written'} (${FLOWS.length} flow${FLOWS.length === 1 ? '' : 's'})`);
