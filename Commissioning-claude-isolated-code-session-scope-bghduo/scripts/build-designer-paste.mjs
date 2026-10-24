import {
  T, get, post, patch, compose, setVar, appendErr, cond, ok, filt,
  rateLimit, rateLimitedActions, assemble, emit, OUT,
} from './lib/designer-paste-builder.mjs';
import { readdirSync, statSync } from 'node:fs';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RL = (tag, bucket, limit, after) => rateLimit(tag, bucket, limit, after);
const IP = "@coalesce(triggerOutputs()?['headers']?['X-Forwarded-For'],triggerOutputs()?['headers']?['x-forwarded-for'],'unknown')";

/* ============================ SUBMISSION ============================ */
const submissionBody = {
  Compose_Submission_Subject: compose("@trim(string(coalesce(triggerBody()?['subject'],'')))"),
  Compose_Submission_Category: compose("@trim(string(coalesce(triggerBody()?['category'],'')))", ok('Compose_Submission_Subject')),
  Compose_Submission_SenderEmail: compose("@toLower(trim(string(coalesce(triggerBody()?['senderEmail'],''))))", ok('Compose_Submission_Category')),
  Compose_Submission_Verification: compose("@trim(string(coalesce(triggerBody()?['verification'],'')))", ok('Compose_Submission_SenderEmail')),
  Compose_Submission_SourceIp: compose(IP, ok('Compose_Submission_Verification')),
  Compose_Submission_Attachments: compose("@coalesce(triggerBody()?['attachments'],json('[]'))", ok('Compose_Submission_SourceIp')),
  ...RL('Submission', "@concat('SUBMISSION_IP:',outputs('Compose_Submission_SourceIp'))", 20, ok('Compose_Submission_Attachments')),
  Condition_Submission_Gate: cond(
    { equals: ["@outputs('Compose_Rate_Limited_Submission')", true] },
    rateLimitedActions('Submission'),
    {
      Condition_Submission_Required_Inputs: cond(
        { or: [
          { equals: ["@empty(outputs('Compose_Submission_Subject'))", true] },
          { equals: ["@empty(outputs('Compose_Submission_Category'))", true] },
          { equals: ["@empty(outputs('Compose_Submission_SenderEmail'))", true] },
        ] },
        {
          Set_variable_varStatusCode_Submission_400: setVar('varStatusCode', 400),
          Append_to_array_variable_varErrors_Submission_Validation: appendErr({ scope: 'SUBMISSION', stage: 'validation', status: 'failed', message: 'subject, category and senderEmail are required.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Submission_400')),
          Set_variable_varData_Submission_BadRequest: setVar('varData', { code: 'SUBMISSION_INPUT_REQUIRED', message: 'subject, category and senderEmail are required.' }, ok('Append_to_array_variable_varErrors_Submission_Validation')),
        },
        {
          Get_Verification_Proof_Submission: get(T.proofs, { $filter: `@concat('Title eq ''',replace(outputs('Compose_Submission_Verification'),'''',''''''),''' and Consumed eq 0')`, $top: 1 }),
          Compose_Submission_Proof_Present: compose("@not(empty(outputs('Compose_Submission_Verification')))", ok('Get_Verification_Proof_Submission')),
          Compose_Submission_Proof_Valid: compose("@and(outputs('Compose_Submission_Proof_Present'),greater(length(coalesce(outputs('Get_Verification_Proof_Submission')?['body/value'],json('[]'))),0),greater(ticks(coalesce(first(outputs('Get_Verification_Proof_Submission')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z')),ticks(utcNow())))", ok('Compose_Submission_Proof_Present')),
          Condition_Submission_Verification_Required: cond(
            { and: [
              { equals: ["@outputs('Compose_Submission_Proof_Present')", true] },
              { equals: ["@outputs('Compose_Submission_Proof_Valid')", false] },
            ] },
            {
              Set_variable_varStatusCode_Submission_403: setVar('varStatusCode', 403),
              Set_variable_varData_Submission_VerificationRequired: setVar('varData', { error: 'verification_required', message: 'The verification proof is missing, expired, or already used.' }, ok('Set_variable_varStatusCode_Submission_403')),
            },
            {
              Compose_Submission_Year: compose('@formatDateTime(utcNow(),\'yyyy\')'),
              Compose_Submission_LockToken: compose("@concat(replace(guid(),'-',''),workflow()?['run']?['name'])", ok('Compose_Submission_Year')),
              Get_Sequence_Counter: get(T.seq, { $filter: `@concat('Year eq ''',outputs('Compose_Submission_Year'),''' and Prefix eq ''NITDA''')`, $top: 1 }, ok('Compose_Submission_LockToken')),
              Condition_Sequence_Counter_Exists: cond(
                { greater: ["@length(coalesce(outputs('Get_Sequence_Counter')?['body/value'],json('[]')))", 0] },
                {
                  Claim_Sequence_Counter: patch(T.seq, {
                    id: "@first(outputs('Get_Sequence_Counter')?['body/value'])?['ID']",
                    'item/LockToken': "@outputs('Compose_Submission_LockToken')",
                    'item/ModifiedByFlowRun': "@workflow()?['run']?['name']",
                  }),
                },
                {
                  Create_Sequence_Counter: post(T.seq, {
                    'item/Title': "@concat('NITDA-',outputs('Compose_Submission_Year'))",
                    'item/Year': "@outputs('Compose_Submission_Year')",
                    'item/Prefix': 'NITDA',
                    'item/CurrentSequence': 0,
                    'item/LockToken': "@outputs('Compose_Submission_LockToken')",
                    'item/ModifiedByFlowRun': "@workflow()?['run']?['name']",
                  }),
                },
                ok('Get_Sequence_Counter')),
              Get_Sequence_Counter_Confirm: get(T.seq, { $filter: `@concat('Year eq ''',outputs('Compose_Submission_Year'),''' and Prefix eq ''NITDA''')`, $top: 1 }, ok('Condition_Sequence_Counter_Exists')),
              Condition_Sequence_Lock_Held: cond(
                { equals: ["@string(first(outputs('Get_Sequence_Counter_Confirm')?['body/value'])?['LockToken'])", "@outputs('Compose_Submission_LockToken')"] },
                {
                  Compose_Submission_Next_Sequence: compose("@add(int(coalesce(first(outputs('Get_Sequence_Counter_Confirm')?['body/value'])?['CurrentSequence'],0)),1)"),
                  Compose_Submission_Reference: compose("@concat('NITDA-',outputs('Compose_Submission_Year'),'-',padLeft(string(outputs('Compose_Submission_Next_Sequence')),5,'0'))", ok('Compose_Submission_Next_Sequence')),
                  Update_Sequence_Counter: patch(T.seq, {
                    id: "@first(outputs('Get_Sequence_Counter_Confirm')?['body/value'])?['ID']",
                    'item/CurrentSequence': "@outputs('Compose_Submission_Next_Sequence')",
                    'item/LastIssuedAt': '@utcNow()',
                    'item/LastReferenceId': "@outputs('Compose_Submission_Reference')",
                  }, ok('Compose_Submission_Reference')),
                  Create_Submission_Record: post(T.registry, {
                    'item/Title': "@outputs('Compose_Submission_Reference')",
                    'item/ReferenceId': "@outputs('Compose_Submission_Reference')",
                    'item/Subject': "@outputs('Compose_Submission_Subject')",
                    'item/Category': "@outputs('Compose_Submission_Category')",
                    'item/CorrespondenceType': "@coalesce(triggerBody()?['correspondenceType'],'Incoming')",
                    'item/Channel': "@coalesce(triggerBody()?['channel'],'Portal')",
                    'item/SenderName': "@trim(string(coalesce(triggerBody()?['sender']?['name'],'')))",
                    'item/SenderEmail': "@outputs('Compose_Submission_SenderEmail')",
                    'item/SenderPhone': "@trim(string(coalesce(triggerBody()?['senderPhone'],'')))",
                    'item/SenderOrganisation': "@trim(string(coalesce(triggerBody()?['sender']?['organisation'],'')))",
                    'item/SenderOrganisationType': "@trim(string(coalesce(triggerBody()?['sender']?['organisationType'],'')))",
                    'item/EventDate': "@trim(string(coalesce(triggerBody()?['eventDate'],'')))",
                    'item/Description': "@trim(string(coalesce(triggerBody()?['description'],'')))",
                    'item/AttachmentCount': "@length(outputs('Compose_Submission_Attachments'))",
                    'item/SubmittedAtUtc': "@coalesce(triggerBody()?['submittedAt'],utcNow())",
                    'item/UpdatedAtUtc': '@utcNow()',
                    'item/Status': 'received',
                    'item/StatusLabel': 'Received',
                    'item/ActionRequired': false,
                    'item/VerifiedSubmission': "@outputs('Compose_Submission_Proof_Valid')",
                    'item/SourceIp': "@outputs('Compose_Submission_SourceIp')",
                    'item/LocalId': "@trim(string(coalesce(triggerBody()?['localId'],'')))",
                  }, ok('Update_Sequence_Counter')),
                  Create_Submission_Timeline_Event: post(T.timeline, {
                    'item/Title': "@outputs('Compose_Submission_Reference')",
                    'item/SubmissionRef': "@outputs('Compose_Submission_Reference')",
                    'item/AtUtc': '@utcNow()',
                    'item/Status': 'received',
                    'item/Label': 'Submission received and recorded by the registry.',
                    'item/Actor': 'Registry',
                    'item/Note': '',
                  }, ok('Create_Submission_Record')),
                  Condition_Submission_Consume_Proof: cond(
                    { equals: ["@outputs('Compose_Submission_Proof_Valid')", true] },
                    {
                      Consume_Verification_Proof_Submission: patch(T.proofs, {
                        id: "@first(outputs('Get_Verification_Proof_Submission')?['body/value'])?['ID']",
                        'item/Consumed': true,
                      }),
                    },
                    { Compose_Submission_No_Proof_To_Consume: compose(false) },
                    ok('Create_Submission_Timeline_Event')),
                  Create_Upload_Tickets: {
                    type: 'Foreach',
                    foreach: "@outputs('Compose_Submission_Attachments')",
                    actions: {
                      Compose_Ticket_Token: compose("@concat(replace(guid(),'-',''),replace(guid(),'-',''))"),
                      Create_Upload_Ticket: post(T.tickets, {
                        'item/Title': "@outputs('Compose_Ticket_Token')",
                        'item/SubmissionRef': "@outputs('Compose_Submission_Reference')",
                        'item/DeclaredName': "@string(coalesce(item()?['name'],''))",
                        'item/StoredName': "@concat(outputs('Compose_Submission_Reference'),'-',replace(replace(trim(string(coalesce(item()?['name'],'file'))),' ','_'),'/','_'))",
                        'item/DeclaredSizeBytes': "@int(coalesce(item()?['size'],0))",
                        'item/DeclaredSha256': "@string(coalesce(item()?['sha256'],''))",
                        'item/ExpiresAtUtc': '@addHours(utcNow(),2)',
                        'item/CreatedAtUtc': '@utcNow()',
                        'item/Redeemed': false,
                        'item/Status': 'issued',
                      }, ok('Compose_Ticket_Token')),
                    },
                    runAfter: ok('Condition_Submission_Consume_Proof'),
                    metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009001' },
                  },
                  Get_Issued_Upload_Tickets: get(T.tickets, { $filter: filt('SubmissionRef', "outputs('Compose_Submission_Reference')"), $top: 20 }, ok('Create_Upload_Tickets')),
                  Select_Submission_Uploads: {
                    type: 'Select',
                    inputs: {
                      from: "@coalesce(outputs('Get_Issued_Upload_Tickets')?['body/value'],json('[]'))",
                      select: { ticket: "@item()?['Title']", name: "@item()?['DeclaredName']" },
                    },
                    runAfter: ok('Get_Issued_Upload_Tickets'),
                    metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009002' },
                  },
                  Set_variable_varStatusCode_Submission_200: setVar('varStatusCode', 200, ok('Select_Submission_Uploads')),
                  Set_variable_varData_Submission_Success: setVar('varData', {
                    referenceId: "@outputs('Compose_Submission_Reference')",
                    uploads: "@body('Select_Submission_Uploads')",
                  }, ok('Set_variable_varStatusCode_Submission_200')),
                },
                {
                  Set_variable_varStatusCode_Submission_409: setVar('varStatusCode', 409),
                  Set_variable_varData_Submission_LockLost: setVar('varData', { code: 'SEQUENCE_LOCK_LOST', message: 'Reference could not be minted. Retry the submission.' }, ok('Set_variable_varStatusCode_Submission_409')),
                },
                ok('Get_Sequence_Counter_Confirm')),
            },
            ok('Compose_Submission_Proof_Valid')),
        },
        null),
    },
    ok('Compose_Rate_Limited_Submission')),
};

/* ============================ UPLOAD ============================ */
const uploadBody = {
  Compose_Upload_Ticket: compose("@trim(string(coalesce(triggerOutputs()?['headers']?['X-Upload-Ticket'],triggerOutputs()?['headers']?['x-upload-ticket'],'')))"),
  Compose_Upload_SourceIp: compose(IP, ok('Compose_Upload_Ticket')),
  Compose_Upload_Content_Length: compose("@int(coalesce(triggerOutputs()?['headers']?['Content-Length'],triggerOutputs()?['headers']?['content-length'],0))", ok('Compose_Upload_SourceIp')),
  ...RL('Upload', "@concat('UPLOAD_IP:',outputs('Compose_Upload_SourceIp'))", 60, ok('Compose_Upload_Content_Length')),
  Condition_Upload_Gate: cond(
    { equals: ["@outputs('Compose_Rate_Limited_Upload')", true] },
    rateLimitedActions('Upload'),
    {
      Condition_Upload_Ticket_Present: cond(
        { equals: ["@empty(outputs('Compose_Upload_Ticket'))", true] },
        {
          Set_variable_varStatusCode_Upload_401: setVar('varStatusCode', 401),
          Set_variable_varData_Upload_NoTicket: setVar('varData', { stored: false, reason: 'ticket_required' }, ok('Set_variable_varStatusCode_Upload_401')),
        },
        {
          Get_Upload_Ticket: get(T.tickets, { $filter: `@concat('Title eq ''',replace(outputs('Compose_Upload_Ticket'),'''',''''''),''' and Redeemed eq 0')`, $top: 1 }),
          Condition_Upload_Ticket_Valid: cond(
            { and: [
              { greater: ["@length(coalesce(outputs('Get_Upload_Ticket')?['body/value'],json('[]')))", 0] },
              { greater: ["@ticks(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z'))", '@ticks(utcNow())'] },
            ] },
            {
              Condition_Upload_Size_Matches: cond(
                { equals: ["@int(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredSizeBytes'],0))", "@outputs('Compose_Upload_Content_Length')"] },
                {
                  Create_Attachment_File: {
                    type: 'OpenApiConnection',
                    inputs: {
                      parameters: {
                        dataset: 'https://nitdanigeria.sharepoint.com/sites/NEDMS',
                        folderPath: '/Portal Attachments',
                        name: "@first(outputs('Get_Upload_Ticket')?['body/value'])?['StoredName']",
                        body: '@triggerBody()',
                      },
                      host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'CreateFile' },
                    },
                    metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009101' },
                  },
                  Create_Attachment_Record: post(T.attachments, {
                    'item/Title': "@first(outputs('Get_Upload_Ticket')?['body/value'])?['StoredName']",
                    'item/SubmissionRef': "@first(outputs('Get_Upload_Ticket')?['body/value'])?['SubmissionRef']",
                    'item/DeclaredName': "@first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredName']",
                    'item/StoredName': "@first(outputs('Get_Upload_Ticket')?['body/value'])?['StoredName']",
                    'item/DeclaredSizeBytes': "@int(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredSizeBytes'],0))",
                    'item/DeclaredSha256': "@string(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredSha256'],''))",
                    'item/AttachmentLink': "@outputs('Create_Attachment_File')?['body/Path']",
                    'item/CreatedAtUtc': '@utcNow()',
                    'item/Status': 'stored',
                  }, ok('Create_Attachment_File')),
                  Redeem_Upload_Ticket: patch(T.tickets, {
                    id: "@first(outputs('Get_Upload_Ticket')?['body/value'])?['ID']",
                    'item/Redeemed': true,
                    'item/Status': 'redeemed',
                  }, ok('Create_Attachment_Record')),
                  Set_variable_varStatusCode_Upload_200: setVar('varStatusCode', 200, ok('Redeem_Upload_Ticket')),
                  Set_variable_varData_Upload_Stored: setVar('varData', {
                    stored: true,
                    attachmentLink: "@outputs('Create_Attachment_File')?['body/Path']",
                  }, ok('Set_variable_varStatusCode_Upload_200')),
                },
                {
                  Redeem_Upload_Ticket_Refused: patch(T.tickets, {
                    id: "@first(outputs('Get_Upload_Ticket')?['body/value'])?['ID']",
                    'item/Redeemed': true,
                    'item/Status': 'refused',
                  }),
                  Set_variable_varStatusCode_Upload_422: setVar('varStatusCode', 422, ok('Redeem_Upload_Ticket_Refused')),
                  Set_variable_varData_Upload_SizeMismatch: setVar('varData', { stored: false, reason: 'size_mismatch' }, ok('Set_variable_varStatusCode_Upload_422')),
                }),
            },
            {
              Set_variable_varStatusCode_Upload_403: setVar('varStatusCode', 403),
              Set_variable_varData_Upload_TicketRefused: setVar('varData', { stored: false, reason: 'ticket_invalid_or_expired' }, ok('Set_variable_varStatusCode_Upload_403')),
            },
            ok('Get_Upload_Ticket')),
        },
        null),
    },
    ok('Compose_Rate_Limited_Upload')),
};

/* ============================ SUPPORT ============================ */
const caseRef = (i) => `@concat('CASE-',substring('${ALPHA}',mod(rand(0,32),32),1),substring('${ALPHA}',mod(rand(0,32),32),1),substring('${ALPHA}',mod(rand(0,32),32),1),substring('${ALPHA}',mod(rand(0,32),32),1),substring('${ALPHA}',mod(rand(0,32),32),1),substring('${ALPHA}',mod(rand(0,32),32),1))`;
const supportBody = {
  Compose_Support_Name: compose("@trim(string(coalesce(triggerBody()?['name'],'')))"),
  Compose_Support_Email: compose("@toLower(trim(string(coalesce(triggerBody()?['email'],''))))", ok('Compose_Support_Name')),
  Compose_Support_Topic: compose("@trim(string(coalesce(triggerBody()?['topic'],'')))", ok('Compose_Support_Email')),
  Compose_Support_Message: compose("@trim(string(coalesce(triggerBody()?['message'],'')))", ok('Compose_Support_Topic')),
  Compose_Support_AboutReference: compose("@trim(string(coalesce(triggerBody()?['aboutReference'],'')))", ok('Compose_Support_Message')),
  Compose_Support_SourceIp: compose(IP, ok('Compose_Support_AboutReference')),
  ...RL('Support', "@concat('SUPPORT_IP:',outputs('Compose_Support_SourceIp'))", 10, ok('Compose_Support_SourceIp')),
  Condition_Support_Gate: cond(
    { equals: ["@outputs('Compose_Rate_Limited_Support')", true] },
    rateLimitedActions('Support'),
    {
      Condition_Support_Required_Inputs: cond(
        { or: [
          { equals: ["@empty(outputs('Compose_Support_Name'))", true] },
          { equals: ["@empty(outputs('Compose_Support_Email'))", true] },
          { equals: ["@empty(outputs('Compose_Support_Topic'))", true] },
          { equals: ["@empty(outputs('Compose_Support_Message'))", true] },
        ] },
        {
          Set_variable_varStatusCode_Support_400: setVar('varStatusCode', 400),
          Append_to_array_variable_varErrors_Support_Validation: appendErr({ scope: 'SUPPORT', stage: 'validation', status: 'failed', message: 'name, email, topic and message are required.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Support_400')),
          Set_variable_varData_Support_BadRequest: setVar('varData', { code: 'SUPPORT_INPUT_REQUIRED', message: 'name, email, topic and message are required.' }, ok('Append_to_array_variable_varErrors_Support_Validation')),
        },
        {
          Compose_Support_CaseRef_Candidate: compose(caseRef()),
          Get_Support_Case_Collision: get(T.support, { $filter: filt('Title', "outputs('Compose_Support_CaseRef_Candidate')"), $top: 1 }, ok('Compose_Support_CaseRef_Candidate')),
          Compose_Support_CaseRef: compose("@if(greater(length(coalesce(outputs('Get_Support_Case_Collision')?['body/value'],json('[]'))),0),concat(outputs('Compose_Support_CaseRef_Candidate'),substring('" + ALPHA + "',mod(rand(0,32),32),1)),outputs('Compose_Support_CaseRef_Candidate'))", ok('Get_Support_Case_Collision')),
          Create_Support_Case: post(T.support, {
            'item/Title': "@outputs('Compose_Support_CaseRef')",
            'item/Name': "@outputs('Compose_Support_Name')",
            'item/Email': "@outputs('Compose_Support_Email')",
            'item/Topic': "@outputs('Compose_Support_Topic')",
            'item/AboutReference': "@outputs('Compose_Support_AboutReference')",
            'item/Message': "@outputs('Compose_Support_Message')",
            'item/Status': 'open',
            'item/SubmittedAtUtc': '@utcNow()',
            'item/SourceIp': "@outputs('Compose_Support_SourceIp')",
          }, ok('Compose_Support_CaseRef')),
          Set_variable_varStatusCode_Support_200: setVar('varStatusCode', 200, ok('Create_Support_Case')),
          Set_variable_varData_Support_Success: setVar('varData', { caseRef: "@outputs('Compose_Support_CaseRef')" }, ok('Set_variable_varStatusCode_Support_200')),
          Send_Support_Acknowledgement: {
            type: 'OpenApiConnection',
            inputs: {
              parameters: {
                'emailMessage/To': "@outputs('Compose_Support_Email')",
                'emailMessage/Subject': "@concat('NITDA support case ',outputs('Compose_Support_CaseRef'))",
                'emailMessage/Body': "<div style=\"font-family:Arial,sans-serif;padding:20px\"><h2 style=\"color:#008751\">NITDA Support</h2><p>Your case has been opened.</p><p><b>Reference:</b> @{outputs('Compose_Support_CaseRef')}</p><p>The helpdesk replies within one working day.</p></div>",
                'emailMessage/Importance': 'Normal',
              },
              host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
            },
            runAfter: ok('Set_variable_varData_Support_Success'),
            metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009201' },
          },
          Create_Support_Outbox_Receipt: post(T.outbox, {
            'item/Title': "@concat('support-acknowledgement:',outputs('Compose_Support_CaseRef'))",
            'item/MessageType': 'support-acknowledgement',
            'item/RecipientEmail': "@outputs('Compose_Support_Email')",
            'item/Reference': "@outputs('Compose_Support_CaseRef')",
            'item/SentAtUtc': '@utcNow()',
            'item/Status': "@if(equals(actions('Send_Support_Acknowledgement')?['status'],'Succeeded'),'sent','failed')",
            'item/Attempts': 1,
            'item/LastError': "@if(equals(actions('Send_Support_Acknowledgement')?['status'],'Succeeded'),'',string(actions('Send_Support_Acknowledgement')?['error']))",
          }, { Send_Support_Acknowledgement: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }),
        },
        null),
    },
    ok('Compose_Rate_Limited_Support')),
};

/* ============================ VERIFY (generate + verify) ============================ */
const verifyBody = {
  /* WHICH HALF IS THIS?
     One body serves both Portal_Verify and Portal_Verify_Confirm, so the request has to say
     which half it wants — and document-portal/js/core.js sends NO `action` on either call:
     verifyRequest posts { email }, verifyConfirm posts { email, code }. Defaulting an absent
     `action` to 'generate' therefore routed BOTH to generate, so entering a code mailed a fresh
     one and no proof was ever minted. Verification could never complete, and WRITEBACK — which
     needs a proof on every call — could never be used at all.

     So the code decides: a request carrying one is a verify, a request without one is a generate.
     An explicit `action` still wins when it is supplied, for any caller that sends it. */
  Compose_Verify_Action: compose("@if(not(empty(trim(string(coalesce(triggerBody()?['action'],''))))),toLower(trim(string(triggerBody()?['action']))),if(not(empty(trim(string(coalesce(triggerBody()?['code'],''))))),'verify','generate'))"),
  Compose_Verify_Email: compose("@toLower(trim(string(coalesce(triggerBody()?['email'],''))))", ok('Compose_Verify_Action')),
  Compose_Verify_Code: compose("@trim(string(coalesce(triggerBody()?['code'],'')))", ok('Compose_Verify_Email')),
  Compose_Verify_SourceIp: compose(IP, ok('Compose_Verify_Code')),
  Compose_Verify_RandomOtp: compose('@rand(100000,1000000)', ok('Compose_Verify_SourceIp')),
  ...RL('Verify', "@concat(if(equals(outputs('Compose_Verify_Action'),'verify'),'VERIFY_CONFIRM_IP:','VERIFY_IP:'),outputs('Compose_Verify_SourceIp'))", 5, ok('Compose_Verify_RandomOtp')),
  Compose_Verify_Switch_Key: compose("@if(outputs('Compose_Rate_Limited_Verify'),'rate-limited',outputs('Compose_Verify_Action'))", ok('Compose_Rate_Limited_Verify')),
  Switch_Verify_Action: {
    type: 'Switch',
    expression: "@outputs('Compose_Verify_Switch_Key')",
    cases: {
      Case_Generate: {
        case: 'generate',
        actions: {
          Condition_Generate_Email_Required: cond(
            { equals: ["@empty(outputs('Compose_Verify_Email'))", true] },
            {
              Set_variable_varStatusCode_Verify_400: setVar('varStatusCode', 400),
              Set_variable_varData_Verify_EmailRequired: setVar('varData', { sent: false, code: 'EMAIL_REQUIRED', message: 'email is required.' }, ok('Set_variable_varStatusCode_Verify_400')),
            },
            {
              Compose_Otp_Expiry: compose('@addMinutes(utcNow(),5)'),
              Create_Otp_Record: post(T.otp, {
                'item/Title': "@outputs('Compose_Verify_Email')",
                'item/Email': "@outputs('Compose_Verify_Email')",
                'item/OTP_Code': "@string(outputs('Compose_Verify_RandomOtp'))",
                'item/Expires_At': "@outputs('Compose_Otp_Expiry')",
                'item/Attempts': 0,
                'item/Consumed': false,
                'item/CreatedAtUtc': '@utcNow()',
                'item/SourceIp': "@outputs('Compose_Verify_SourceIp')",
              }, ok('Compose_Otp_Expiry')),
              Send_Otp_Email: {
                type: 'OpenApiConnection',
                inputs: {
                  parameters: {
                    'emailMessage/To': "@outputs('Compose_Verify_Email')",
                    'emailMessage/Subject': 'Your NITDA verification code',
                    'emailMessage/Body': "<div style=\"font-family:Arial,sans-serif;padding:20px;border:1px solid #e0e0e0;border-radius:5px\"><h2 style=\"color:#008751\">NITDA Verification</h2><p>Use the code below to complete your verification:</p><div style=\"font-size:24px;font-weight:bold;letter-spacing:5px;margin:20px 0\">@{outputs('Compose_Verify_RandomOtp')}</div><p style=\"color:#666;font-size:12px\">This code expires in 5 minutes.</p></div>",
                    'emailMessage/Importance': 'Normal',
                  },
                  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
                },
                runAfter: ok('Create_Otp_Record'),
                metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009301' },
              },
              Create_Verify_Outbox_Receipt: post(T.outbox, {
                'item/Title': "@concat('verification-code:',outputs('Compose_Verify_Email'))",
                'item/MessageType': 'verification-code',
                'item/RecipientEmail': "@outputs('Compose_Verify_Email')",
                'item/Reference': '',
                'item/SentAtUtc': '@utcNow()',
                'item/Status': "@if(equals(actions('Send_Otp_Email')?['status'],'Succeeded'),'sent','failed')",
                'item/Attempts': 1,
                'item/LastError': "@if(equals(actions('Send_Otp_Email')?['status'],'Succeeded'),'',string(actions('Send_Otp_Email')?['error']))",
              }, { Send_Otp_Email: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }),
              Set_variable_varStatusCode_Verify_200: setVar('varStatusCode', 200, ok('Create_Verify_Outbox_Receipt')),
              Set_variable_varData_Verify_Sent: setVar('varData', {
                sent: "@equals(actions('Send_Otp_Email')?['status'],'Succeeded')",
                expiresAt: "@outputs('Compose_Otp_Expiry')",
              }, ok('Set_variable_varStatusCode_Verify_200')),
            },
            null),
        },
      },
      Case_Verify: {
        case: 'verify',
        actions: {
          Condition_Verify_Inputs_Required: cond(
            { or: [
              { equals: ["@empty(outputs('Compose_Verify_Email'))", true] },
              { equals: ["@empty(outputs('Compose_Verify_Code'))", true] },
            ] },
            {
              Set_variable_varStatusCode_Confirm_400: setVar('varStatusCode', 400),
              Set_variable_varData_Confirm_InputRequired: setVar('varData', { code: 'OTP_INPUT_REQUIRED', message: 'email and code are required.' }, ok('Set_variable_varStatusCode_Confirm_400')),
            },
            {
              Get_Otp_Record: get(T.otp, { $filter: `@concat('Email eq ''',replace(outputs('Compose_Verify_Email'),'''',''''''),''' and Consumed eq 0')`, $orderby: 'Created desc', $top: 1 }),
              Condition_Otp_Found: cond(
                { greater: ["@length(coalesce(outputs('Get_Otp_Record')?['body/value'],json('[]')))", 0] },
                {
                  Condition_Otp_Not_Expired: cond(
                    { greater: ["@ticks(coalesce(first(outputs('Get_Otp_Record')?['body/value'])?['Expires_At'],'1900-01-01T00:00:00Z'))", '@ticks(utcNow())'] },
                    {
                      Condition_Otp_Code_Matches: cond(
                        { equals: ["@trim(string(coalesce(first(outputs('Get_Otp_Record')?['body/value'])?['OTP_Code'],'')))", "@outputs('Compose_Verify_Code')"] },
                        {
                          Consume_Otp_Record: patch(T.otp, { id: "@first(outputs('Get_Otp_Record')?['body/value'])?['ID']", 'item/Consumed': true }),
                          Compose_Verification_Proof_Token: compose("@concat(replace(guid(),'-',''),replace(guid(),'-',''))", ok('Consume_Otp_Record')),
                          Create_Verification_Proof: post(T.proofs, {
                            'item/Title': "@outputs('Compose_Verification_Proof_Token')",
                            'item/Email': "@outputs('Compose_Verify_Email')",
                            'item/Purpose': 'portal-verification',
                            'item/ExpiresAtUtc': '@addMinutes(utcNow(),15)',
                            'item/CreatedAtUtc': '@utcNow()',
                            'item/Consumed': false,
                          }, ok('Compose_Verification_Proof_Token')),
                          Set_variable_varStatusCode_Confirm_200: setVar('varStatusCode', 200, ok('Create_Verification_Proof')),
                          Set_variable_varData_Confirm_Verified: setVar('varData', {
                            verification: "@outputs('Compose_Verification_Proof_Token')",
                            expiresAt: '@addMinutes(utcNow(),15)',
                          }, ok('Set_variable_varStatusCode_Confirm_200')),
                        },
                        {
                          Increment_Otp_Attempts: patch(T.otp, {
                            id: "@first(outputs('Get_Otp_Record')?['body/value'])?['ID']",
                            'item/Attempts': "@add(int(coalesce(first(outputs('Get_Otp_Record')?['body/value'])?['Attempts'],0)),1)",
                            'item/Consumed': "@greaterOrEquals(add(int(coalesce(first(outputs('Get_Otp_Record')?['body/value'])?['Attempts'],0)),1),5)",
                          }),
                          Set_variable_varStatusCode_Confirm_401: setVar('varStatusCode', 401, ok('Increment_Otp_Attempts')),
                          Set_variable_varData_Confirm_Invalid: setVar('varData', { code: 'OTP_INVALID', message: 'The code was not accepted.' }, ok('Set_variable_varStatusCode_Confirm_401')),
                        }),
                    },
                    {
                      Consume_Expired_Otp: patch(T.otp, { id: "@first(outputs('Get_Otp_Record')?['body/value'])?['ID']", 'item/Consumed': true }),
                      Set_variable_varStatusCode_Confirm_410: setVar('varStatusCode', 410, ok('Consume_Expired_Otp')),
                      Set_variable_varData_Confirm_Expired: setVar('varData', { code: 'OTP_EXPIRED', message: 'The code has expired.' }, ok('Set_variable_varStatusCode_Confirm_410')),
                    }),
                },
                {
                  Set_variable_varStatusCode_Confirm_401_NotFound: setVar('varStatusCode', 401),
                  Set_variable_varData_Confirm_NotFound: setVar('varData', { code: 'OTP_INVALID', message: 'The code was not accepted.' }, ok('Set_variable_varStatusCode_Confirm_401_NotFound')),
                },
                ok('Get_Otp_Record')),
            },
            null),
        },
      },
      Case_Rate_Limited: {
        case: 'rate-limited',
        actions: rateLimitedActions('Verify'),
      },
    },
    default: {
      actions: {
        Set_variable_varStatusCode_Verify_400_Action: setVar('varStatusCode', 400),
        Set_variable_varData_Verify_InvalidAction: setVar('varData', { code: 'INVALID_ACTION', message: 'action must be generate or verify.' }, ok('Set_variable_varStatusCode_Verify_400_Action')),
      },
    },
    runAfter: ok('Compose_Verify_Switch_Key'),
    metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009302' },
  },
};

/* ============================ STATUS ============================ */
const statusBody = {
  Compose_Status_Reference: compose("@toUpper(trim(string(coalesce(triggerBody()?['referenceId'],''))))"),
  Compose_Status_Email: compose("@toLower(trim(string(coalesce(triggerBody()?['email'],''))))", ok('Compose_Status_Reference')),
  Compose_Status_Verification: compose("@trim(string(coalesce(triggerBody()?['verification'],'')))", ok('Compose_Status_Email')),
  Compose_Status_SourceIp: compose(IP, ok('Compose_Status_Verification')),
  ...RL('Status', "@concat('STATUS_IP:',outputs('Compose_Status_SourceIp'))", 30, ok('Compose_Status_SourceIp')),
  Condition_Status_Gate: cond(
    { equals: ["@outputs('Compose_Rate_Limited_Status')", true] },
    rateLimitedActions('Status'),
    {
      Condition_Status_Required_Inputs: cond(
        { or: [
          { equals: ["@empty(outputs('Compose_Status_Reference'))", true] },
          { and: [
            { equals: ["@empty(outputs('Compose_Status_Verification'))", true] },
            { equals: ["@empty(outputs('Compose_Status_Email'))", true] },
          ] },
          { and: [
            { equals: ["@empty(outputs('Compose_Status_Verification'))", false] },
            { equals: ["@empty(outputs('Compose_Status_Email'))", false] },
          ] },
        ] },
        {
          Set_variable_varStatusCode_Status_400: setVar('varStatusCode', 400),
          Append_to_array_variable_varErrors_Status_Validation: appendErr({ scope: 'STATUS', stage: 'validation', status: 'failed', message: 'referenceId and exactly one of verification or email are required.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Status_400')),
          Set_variable_varData_Status_BadRequest: setVar('varData', { code: 'STATUS_INPUT_REQUIRED', message: 'referenceId and exactly one of verification or email are required.' }, ok('Append_to_array_variable_varErrors_Status_Validation')),
        },
        {
          Get_Verification_Proof: get(T.proofs, { $filter: `@concat('Title eq ''',replace(outputs('Compose_Status_Verification'),'''',''''''),''' and Consumed eq 0')`, $top: 1 }),
          Compose_Status_Proof_Present: compose("@not(empty(outputs('Compose_Status_Verification')))", ok('Get_Verification_Proof')),
          Compose_Status_Proof_Valid: compose("@and(outputs('Compose_Status_Proof_Present'),greater(length(coalesce(outputs('Get_Verification_Proof')?['body/value'],json('[]'))),0),greater(ticks(coalesce(first(outputs('Get_Verification_Proof')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z')),ticks(utcNow())))", ok('Compose_Status_Proof_Present')),
          Compose_Status_Effective_Email: compose("@if(outputs('Compose_Status_Proof_Present'),toLower(trim(string(coalesce(first(outputs('Get_Verification_Proof')?['body/value'])?['Email'],'')))),outputs('Compose_Status_Email'))", ok('Compose_Status_Proof_Valid')),
          Condition_Status_Proof_Acceptable: cond(
            { and: [
              { equals: ["@outputs('Compose_Status_Proof_Present')", true] },
              { equals: ["@outputs('Compose_Status_Proof_Valid')", false] },
            ] },
            {
              Set_variable_varStatusCode_Status_403: setVar('varStatusCode', 403),
              Set_variable_varData_Status_VerificationRequired: setVar('varData', { error: 'verification_required', message: 'The verification proof is missing, expired, or already used.' }, ok('Set_variable_varStatusCode_Status_403')),
            },
            {
              Get_Submission_By_Reference: get(T.registry, {
                $filter: `@concat('ReferenceId eq ''',replace(outputs('Compose_Status_Reference'),'''',''''''),''' and SenderEmail eq ''',replace(outputs('Compose_Status_Effective_Email'),'''',''''''),'''')`,
                $top: 1,
              }),
              Condition_Status_Record_Found: cond(
                { greater: ["@length(coalesce(outputs('Get_Submission_By_Reference')?['body/value'],json('[]')))", 0] },
                {
                  Condition_Status_Consume_Proof: cond(
                    { equals: ["@outputs('Compose_Status_Proof_Valid')", true] },
                    { Consume_Verification_Proof: patch(T.proofs, { id: "@first(outputs('Get_Verification_Proof')?['body/value'])?['ID']", 'item/Consumed': true }) },
                    { Compose_Status_No_Proof_To_Consume: compose(false) }),
                  Get_Timeline_Events: get(T.timeline, { $filter: filt('SubmissionRef', "outputs('Compose_Status_Reference')"), $orderby: 'AtUtc asc', $top: 100 }, ok('Condition_Status_Consume_Proof')),
                  Select_Status_Timeline: {
                    type: 'Select',
                    inputs: {
                      from: "@coalesce(outputs('Get_Timeline_Events')?['body/value'],json('[]'))",
                      select: { at: "@item()?['AtUtc']", status: "@item()?['Status']", label: "@item()?['Label']", note: "@item()?['Note']" },
                    },
                    runAfter: ok('Get_Timeline_Events'),
                    metadata: { operationMetadataId: 'a0000000-0000-4000-8000-000000009401' },
                  },
                  Set_variable_varStatusCode_Status_200: setVar('varStatusCode', 200, ok('Select_Status_Timeline')),
                  Set_variable_varData_Status_Success: setVar('varData', {
                    record: {
                      referenceId: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['ReferenceId']",
                      status: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['Status']",
                      statusLabel: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['StatusLabel']",
                      category: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['Category']",
                      subject: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['Subject']",
                      receivedAt: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['SubmittedAtUtc']",
                      acknowledgedAt: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['AcknowledgedAtUtc']",
                      updatedAt: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['UpdatedAtUtc']",
                      closedAt: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['ClosedAtUtc']",
                      actionRequired: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['ActionRequired']",
                      timeline: "@body('Select_Status_Timeline')",
                    },
                  }, ok('Set_variable_varStatusCode_Status_200')),
                },
                {
                  Set_variable_varStatusCode_Status_404: setVar('varStatusCode', 404),
                  Set_variable_varData_Status_NotFound: setVar('varData', { code: 'STATUS_NOT_FOUND', message: 'No matching record was found.' }, ok('Set_variable_varStatusCode_Status_404')),
                },
                ok('Get_Submission_By_Reference')),
            },
            ok('Compose_Status_Effective_Email')),
        },
        null),
    },
    ok('Compose_Rate_Limited_Status')),
};

/* ============================ WRITEBACK ============================ */
const writebackBody = {
  Compose_Writeback_Reference: compose("@toUpper(trim(string(coalesce(triggerBody()?['referenceId'],''))))"),
  Compose_Writeback_Verification: compose("@trim(string(coalesce(triggerBody()?['verification'],'')))", ok('Compose_Writeback_Reference')),
  Compose_Writeback_Action: compose("@toLower(trim(string(coalesce(triggerBody()?['action'],''))))", ok('Compose_Writeback_Verification')),
  Compose_Writeback_Body: compose("@trim(string(coalesce(triggerBody()?['body'],'')))", ok('Compose_Writeback_Action')),
  Compose_Writeback_SourceIp: compose(IP, ok('Compose_Writeback_Body')),
  Compose_Writeback_Label: compose("@if(equals(outputs('Compose_Writeback_Action'),'withdraw'),'Withdrawn at the request of the submitter.',if(equals(outputs('Compose_Writeback_Action'),'note'),'Note added by the requester.','Requester responded to the request for information.'))", ok('Compose_Writeback_SourceIp')),
  ...RL('Writeback', "@concat('WRITEBACK_IP:',outputs('Compose_Writeback_SourceIp'))", 20, ok('Compose_Writeback_Label')),
  Condition_Writeback_Gate: cond(
    { equals: ["@outputs('Compose_Rate_Limited_Writeback')", true] },
    rateLimitedActions('Writeback'),
    {
      Get_Verification_Proof: get(T.proofs, { $filter: `@concat('Title eq ''',replace(outputs('Compose_Writeback_Verification'),'''',''''''),''' and Consumed eq 0 and Purpose eq ''portal-verification''')`, $top: 1 }),
      Compose_Writeback_Proof_Valid: compose("@and(not(empty(outputs('Compose_Writeback_Verification'))),greater(length(coalesce(outputs('Get_Verification_Proof')?['body/value'],json('[]'))),0),greater(ticks(coalesce(first(outputs('Get_Verification_Proof')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z')),ticks(utcNow())))", ok('Get_Verification_Proof')),
      Condition_Writeback_Proof_Valid: cond(
        { equals: ["@outputs('Compose_Writeback_Proof_Valid')", false] },
        {
          Set_variable_varStatusCode_Writeback_401: setVar('varStatusCode', 401),
          Set_variable_varData_Writeback_ProofInvalid: setVar('varData', { ok: false, reason: 'proof_invalid_or_expired' }, ok('Set_variable_varStatusCode_Writeback_401')),
        },
        {
          Get_Submission_By_Reference: get(T.registry, {
            $filter: `@concat('ReferenceId eq ''',replace(outputs('Compose_Writeback_Reference'),'''',''''''),''' and SenderEmail eq ''',replace(toLower(trim(string(coalesce(first(outputs('Get_Verification_Proof')?['body/value'])?['Email'],'')))),'''',''''''),'''')`,
            $top: 1,
          }),
          Condition_Writeback_Owned: cond(
            { greater: ["@length(coalesce(outputs('Get_Submission_By_Reference')?['body/value'],json('[]')))", 0] },
            {
              Condition_Writeback_Action_Valid: cond(
                { or: [
                  { equals: ["@outputs('Compose_Writeback_Action')", 'respond'] },
                  { equals: ["@outputs('Compose_Writeback_Action')", 'note'] },
                  { equals: ["@outputs('Compose_Writeback_Action')", 'withdraw'] },
                ] },
                {
                  Condition_Writeback_Body_Valid: cond(
                    { or: [
                      { and: [
                        { equals: ["@outputs('Compose_Writeback_Action')", 'respond'] },
                        { greaterOrEquals: ["@length(outputs('Compose_Writeback_Body'))", 10] },
                      ] },
                      { and: [
                        { equals: ["@outputs('Compose_Writeback_Action')", 'note'] },
                        { greaterOrEquals: ["@length(outputs('Compose_Writeback_Body'))", 5] },
                      ] },
                      { equals: ["@outputs('Compose_Writeback_Action')", 'withdraw'] },
                    ] },
                    {
                      Consume_Verification_Proof: patch(T.proofs, { id: "@first(outputs('Get_Verification_Proof')?['body/value'])?['ID']", 'item/Consumed': true }),
                      Create_Timeline_Event: post(T.timeline, {
                        'item/Title': "@outputs('Compose_Writeback_Reference')",
                        'item/SubmissionRef': "@outputs('Compose_Writeback_Reference')",
                        'item/AtUtc': '@utcNow()',
                        'item/Status': "@if(equals(outputs('Compose_Writeback_Action'),'withdraw'),'withdrawn',string(first(outputs('Get_Submission_By_Reference')?['body/value'])?['Status']))",
                        'item/Label': "@outputs('Compose_Writeback_Label')",
                        'item/Actor': 'Submitter',
                        'item/Note': "@outputs('Compose_Writeback_Body')",
                      }, ok('Consume_Verification_Proof')),
                      Condition_Writeback_Is_Withdraw: cond(
                        { equals: ["@outputs('Compose_Writeback_Action')", 'withdraw'] },
                        {
                          Update_Registry_Status_On_Withdraw: patch(T.registry, {
                            id: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['ID']",
                            'item/Status': 'withdrawn',
                            'item/StatusLabel': 'Withdrawn by the submitter',
                            'item/UpdatedAtUtc': '@utcNow()',
                          }),
                        },
                        {
                          Update_Registry_Timestamp: patch(T.registry, {
                            id: "@first(outputs('Get_Submission_By_Reference')?['body/value'])?['ID']",
                            'item/UpdatedAtUtc': '@utcNow()',
                          }),
                        },
                        ok('Create_Timeline_Event')),
                      Create_Audit_Event: post(T.audit, {
                        'item/Title': "@concat('WRITEBACK ',outputs('Compose_Writeback_Action'),' ',outputs('Compose_Writeback_Reference'))",
                        'item/Flow': "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
                        'item/EventType': "@concat('citizen-',outputs('Compose_Writeback_Action'))",
                        'item/AtUtc': '@utcNow()',
                        'item/Reference': "@outputs('Compose_Writeback_Reference')",
                        'item/SourceIp': "@outputs('Compose_Writeback_SourceIp')",
                        'item/Detail': "@concat('action=',outputs('Compose_Writeback_Action'),', bodyLength=',string(length(outputs('Compose_Writeback_Body'))))",
                      }, ok('Condition_Writeback_Is_Withdraw')),
                      Set_variable_varStatusCode_Writeback_200: setVar('varStatusCode', 200, ok('Create_Audit_Event')),
                      Set_variable_varData_Writeback_Success: setVar('varData', { ok: true, queued: false }, ok('Set_variable_varStatusCode_Writeback_200')),
                    },
                    {
                      Set_variable_varStatusCode_Writeback_400_Body: setVar('varStatusCode', 400),
                      Set_variable_varData_Writeback_BodyTooShort: setVar('varData', { ok: false, reason: 'body_too_short' }, ok('Set_variable_varStatusCode_Writeback_400_Body')),
                    }),
                },
                {
                  Set_variable_varStatusCode_Writeback_400_Action: setVar('varStatusCode', 400),
                  Set_variable_varData_Writeback_InvalidAction: setVar('varData', { ok: false, reason: 'invalid_action' }, ok('Set_variable_varStatusCode_Writeback_400_Action')),
                }),
            },
            {
              Set_variable_varStatusCode_Writeback_404: setVar('varStatusCode', 404),
              Set_variable_varData_Writeback_NotFound: setVar('varData', { ok: false, reason: 'not_found' }, ok('Set_variable_varStatusCode_Writeback_404')),
            },
            ok('Get_Submission_By_Reference')),
        },
        ok('Compose_Writeback_Proof_Valid')),
    },
    ok('Compose_Rate_Limited_Writeback')),
};

/* ============================ emit ============================ */
const FLOWS = [
  ['Portal_SUBMISSION_ECM_DOCS.designer-paste.json', 'Scope_Submission_Flow', 'Submission', submissionBody, { subject: "@outputs('Compose_Submission_Subject')", category: "@outputs('Compose_Submission_Category')", hasVerification: "@not(empty(outputs('Compose_Submission_Verification')))" }, 'submit', 'create'],
  ['Portal_UPLOAD_ECM_DOCS.designer-paste.json', 'Scope_Upload_Flow', 'Upload', uploadBody, { hasTicket: "@not(empty(outputs('Compose_Upload_Ticket')))", contentLength: "@outputs('Compose_Upload_Content_Length')" }, 'upload', 'redeem'],
  ['Portal_SUPPORT_ECM_DOCS.designer-paste.json', 'Scope_Support_Flow', 'Support', supportBody, { topic: "@outputs('Compose_Support_Topic')", aboutReference: "@outputs('Compose_Support_AboutReference')" }, 'support', 'create'],
  /* Two flows, one body. Portal_Verify and Portal_Verify_Confirm each keep their own trigger
     URL — the portal calls them separately and treats one configured without the other as
     verification being unavailable — so the set ships one file per target flow rather than one
     file with a note saying paste it twice. The two are byte-identical apart from the nodeId. */
  ['Portal_VERIFY_ECM_DOCS.designer-paste.json', 'Scope_Verify_Flow', 'Verify', verifyBody, { action: "@outputs('Compose_Verify_Action')", hasEmail: "@not(empty(outputs('Compose_Verify_Email')))" }, 'generate', 'otp'],
  ['Portal_VERIFY_CONFIRM_ECM_DOCS.designer-paste.json', 'Scope_Verify_Confirm_Flow', 'Verify', verifyBody, { action: "@outputs('Compose_Verify_Action')", hasEmail: "@not(empty(outputs('Compose_Verify_Email')))" }, 'generate', 'otp'],
  ['Portal_STATUS_ECM_DOCS.designer-paste.json', 'Scope_Status_Flow', 'Status', statusBody, { referenceId: "@outputs('Compose_Status_Reference')", hasVerification: "@not(empty(outputs('Compose_Status_Verification')))" }, 'status', 'read'],
  ['Portal_WRITEBACK_ECM_DOCS.designer-paste.json', 'Scope_Writeback_Flow', 'Writeback', writebackBody, { referenceId: "@outputs('Compose_Writeback_Reference')", action: "@outputs('Compose_Writeback_Action')", bodyLength: "@length(outputs('Compose_Writeback_Body'))" }, 'writeback', 'append'],
];

for (const [file, nodeId, tag, body, redacted, action, operation] of FLOWS) {
  emit(file, nodeId, assemble(tag, body, redacted, action, operation, 'portal'));
}
for (const f of readdirSync(OUT).sort()) {
  console.log(String(statSync(OUT + f).size).padStart(7), f);
}
