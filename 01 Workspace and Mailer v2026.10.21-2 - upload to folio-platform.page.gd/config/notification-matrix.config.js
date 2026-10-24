/* The required-notification matrix: every message this estate is obliged to send.
 *
 * WHY THIS FILE EXISTS.
 *
 * Until now the estate had a notification *inventory* and no notification *requirement*.
 * `docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md` catalogues 220 notification
 * points, but it is generated from the code by `scripts/process-discovery.mjs` — it records
 * what the artifacts happen to do, never what they owe. Its own coverage note (COV-013) says
 * as much: "220 notification points identified ... No escalation bound to a service-level
 * clock is evidenced anywhere in the supplied inputs."
 *
 * An inventory cannot answer "is anything missing", because a message that was never built
 * leaves nothing to inventory. Measured against this file instead of against itself, the
 * estate provisions eight of the thirty-three messages it owes, and of its 76 live mail
 * actions only four are addressed solely to the person concerned: 70 hard-code a fixed
 * mailbox, and two more resolve a recipient but append a fixed address alongside it.
 *
 * WHAT MAKES A ROW BELONG HERE.
 *
 * Every row is an obligation this repository already carries somewhere else — a sentence the
 * portal shows a citizen, a clock a config starts, a column a list provisions, a recipient a
 * service requires. `basis` names that obligation and `basisEvidence` cites it at file and
 * line. Nothing here is a preference, a nice-to-have, or a notification someone thought would
 * be good to have. If the obligation is withdrawn — the promise deleted, the clock removed —
 * the row goes with it, and the verifier will say so.
 *
 * `status` IS A CLAIM, NOT A SETTING.
 *
 * The `status` on each row is recomputed from the artifacts by
 * `scripts/verify-notification-matrix.mjs`, which reads the flow exports, the paste packages,
 * the runtime and the portal client and derives what the estate actually does. A row whose
 * declared status disagrees with the estate fails `npm run test:notifications`. So this file
 * cannot quietly go stale, and a fix that lands in the estate without being recorded here is
 * as much a failure as a claim recorded here without a fix.
 *
 * THE ARTIFACT SETS THIS MATRIX IS MEASURED AGAINST.
 *
 * Four sets, because no one of them is the whole estate:
 *
 *   deployed exports  docs/folio-Master-Flows-and-Endpoints/contracts/deployed         what the tenant runs today
 *   portal packages   docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3  what is pasted into the adopted portal flows
 *   internal packages docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4  what is pasted into the adopted internal flows
 *   clients           modules/ core/ shared/ document-portal/         what the two UIs promise
 *
 * The generated catalogue reads the first set; the superseded fragment set it also read is retired
 * (PRE-3, resolved 2026-10-06).
 */

export const NotificationMatrixMeta = Object.freeze({
  schema: 'dgo-notification-matrix/v1',
  compiledUtc: '2026-09-01',
  compiledAgainstCommit: 'aeaa7e0',
  purpose:
    'The set of notifications this estate is required to send, the audience and channel of each, ' +
    'and the artifact that must carry it. Measured against the estate by npm run notifications.',
});

/* Audiences. Named rather than free-typed because the whole finding of this matrix is that
   messages reach the wrong audience — 70 of 76 live mail actions go to a fixed internal
   mailbox. An audience of `registry-fixed` is therefore a distinct, visible thing, not a
   variant of `citizen`. */
export const Audiences = Object.freeze({
  citizen: 'The external submitter, at the address they used.',
  assignee: 'The officer the record is assigned to.',
  supporting: 'The supporting department or unit named by the assignment cascade.',
  copyTo: 'The copy-to and inform-DSU list named by the assignment cascade.',
  approver: 'The officer whose approval the record is waiting on.',
  originator: 'The officer who raised the action being reported on.',
  owner: 'The accountable owner of an overdue or escalated record.',
  correspondent: 'The external party an outward correspondence or dispatch is addressed to.',
  operator: 'Whoever is working the platform at the time, in the UI.',
  administrator: 'The platform or registry administrator.',
  'registry-fixed': 'A fixed internal mailbox, regardless of who the message concerns.',
});

export const Channels = Object.freeze({
  email: 'Office 365 Outlook, via a SendEmailV2 action in a Power Automate flow.',
  'in-app': 'A toast plus a durable entry in core/notification-center.js. Device-local.',
  ledger: 'A row in a SharePoint list that records delivery — Portal Outbox Receipts.',
  sms: 'Text message. Not provisioned, by owner decision (2026-10-03): no screen or current package may offer it.',
});

/* Provisioning states. Deliberately finer-grained than present/absent, because the three
   failure modes here are genuinely different and need different work:

     ABSENT        nothing anywhere sends this. Build it.
     MISADDRESSED  it is sent, to a hard-coded mailbox instead of the person. Re-address it.
     LOCAL_ONLY    the runtime records it in browser storage and calls it queued. Nothing
                   leaves the device. Give it a carrier.
     UNIMPLEMENTED the carrier exists and answers 501, or the channel has no connector at all.
     REGRESSION    the deployed flow sends it and the package that replaces it does not.
     PROVISIONED   sent, to the right audience, with a failure path.
     WITHDRAWN     the owner decided it will not be provided; nothing may offer it. Not outstanding. */
export const ProvisioningStates = Object.freeze({
  PROVISIONED: 'Sent to the correct audience by a named artifact, with its failure behaviour defined.',
  MISADDRESSED: 'Sent, but to a hard-coded mailbox rather than the audience this row names.',
  ABSENT: 'No artifact in any of the four sets sends this.',
  LOCAL_ONLY: 'Recorded in browser storage by the runtime. Nothing leaves the device.',
  UNIMPLEMENTED: 'The carrier is named but does not implement it, or the channel has no connector.',
  REGRESSION: 'A deployed flow sends it; the package that replaces that flow does not.',
  WITHDRAWN: 'Not to be provided, by owner decision; no screen or current package offers it.',
});

export const Severities = Object.freeze({
  CRITICAL: 'A person is told something untrue, or a legally significant message never arrives.',
  HIGH: 'Work stalls unseen, or a message reaches the wrong person.',
  MEDIUM: 'A recipient must go looking for something that should have reached them.',
  LOW: 'Operational visibility only.',
});

/* ── The matrix ──────────────────────────────────────────────────────────────────────────
 *
 * Ordered by platform, then by the order the audience meets them. `carrier` names the artifact
 * that must implement the row — an existing one where there is one, the one that would have to
 * be created where there is not. */
export const RequiredNotifications = Object.freeze([

  /* ── Public document portal · the citizen ─────────────────────────────────────────────
     The portal makes six statements to citizens about mail it will send. None of the six has
     a carrier. RN-001 is the worst of them, because it also tells the citizen what to do when
     the mail does not arrive, and every citizen will qualify. */

  Object.freeze({
    id: 'RN-001',
    messageType: 'submission-confirmation',
    event: 'A submission is accepted and a reference is minted',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'CG_Submission_Endpoint, after the Portal Registry row is written',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/SUBMISSION__CG_Submission_Endpoint__de9ef13b.paste.json, the send "Submission received — reference …"',
    content: 'The tracking ID, the submission type, the time, the attachment count, and how to track.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType submission-confirmation and the send status.',
    basis:
      'The portal tells every submitter a confirmation is coming, and tells them to call the ' +
      'helpdesk if it does not arrive within one working day. The FAQ states tracking IDs are ' +
      'emailed. The tracking page instructs the citizen to take the ID from that email.',
    basisEvidence: [
      'document-portal/js/submit.js:604',
      'document-portal/js/submit.js:610',
      'document-portal/js/data.js:150',
      'document-portal/js/track.js:25',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'The identification Phase 3 package for CG_Submission_Endpoint (de9ef13b) sends "Submission received — reference <NITDA-YYYY-NNNNN>" to the sender\'s address from the request',
      'The live flow, as captured on 2026-10-01, sends nothing; the package is what Phase 3 pastes',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation:
      'Add a Send_Submission_Confirmation action and a Create_Submission_Outbox_Receipt catch ' +
      'to the SUBMISSION package, addressed to the senderEmail already written to Portal Registry.',
  }),

  Object.freeze({
    id: 'RN-002',
    messageType: 'action-required',
    event: 'A record moves to action-required',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'The status write that sets Portal Registry.ActionRequired',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Registry_Status_Notifier__8ebf6001-89cd-49c9-a9b6-4dedb9a5768b__full_definition.json, the send "Action required on your submission"',
    content: 'What is needed, the reference, and the link to the respond form on the tracking page.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType action-required.',
    basis:
      'The state exists to ask the submitter for something — "Something is needed from the ' +
      'submitter before this can continue" — and the tracking page carries a respond form for ' +
      'it. A request nobody is told about is a request that will not be answered.',
    basisEvidence: [
      'config/status-vocabulary.config.js:29',
      'document-portal/js/data.js:57',
      'document-portal/js/track.js:424',
      'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/LISTS.md — Portal Registry.ActionRequired',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'CG_Registry_Status_Notifier (8ebf6001), adopted and deployed, sends the submitter "Action required on your submission" when the Portal Registry row changes status, addressed from the row (emailRaw)',
      'The adopted AUTO_SCHEDULED_SWEEP (8c19b45c) carries no status scope; DGO_SCHEDULED_SWEEP, which did, is retired (2026-10-06)',
    ],
    severity: 'CRITICAL',
    owner: 'Process owner, correspondence lifecycle',
    remediation:
      'Requires PRE-2. Either a scheduled sweep of Portal Registry for rows whose status ' +
      'changed, or a send added to whichever write sets the status.',
  }),

  Object.freeze({
    id: 'RN-003',
    messageType: 'decision-outcome',
    event: 'A decision is issued — the record moves to approved',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'The status write that sets Portal Registry.Status to approved',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Registry_Status_Notifier__8ebf6001-89cd-49c9-a9b6-4dedb9a5768b__full_definition.json, the send "Decision: your submission"',
    content: 'The outcome, the reference, and the printable record.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType decision-outcome.',
    basis:
      'Both the governed status vocabulary and the portal say the outcome is sent to the ' +
      'submitter, and the portal home page states the decision is emailed.',
    basisEvidence: [
      'config/status-vocabulary.config.js:30',
      'document-portal/js/data.js:58',
      'document-portal/index.html:111',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'CG_Registry_Status_Notifier (8ebf6001), adopted and deployed, sends the submitter "Decision: your submission" when the Portal Registry row changes status, addressed from the row (emailRaw)',
      'The adopted AUTO_SCHEDULED_SWEEP (8c19b45c) carries no status scope; DGO_SCHEDULED_SWEEP, which did, is retired (2026-10-06)',
    ],
    severity: 'CRITICAL',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'Requires PRE-2. Same carrier as RN-002, keyed on the approved status.',
  }),

  Object.freeze({
    id: 'RN-004',
    messageType: 'decision-outcome',
    event: 'A decision is issued — the record moves to declined',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'The status write that sets Portal Registry.Status to declined',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Registry_Status_Notifier__8ebf6001-89cd-49c9-a9b6-4dedb9a5768b__full_definition.json, the send "Decision on your submission"',
    content: 'The outcome, the reference, and the reasons held in the notes.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType decision-outcome.',
    basis:
      'Declined is a stage-4 terminal decision in the governed vocabulary, and the portal home ' +
      'page promises the outcome is emailed without distinguishing which outcome.',
    basisEvidence: [
      'config/status-vocabulary.config.js:31',
      'document-portal/js/data.js:59',
      'document-portal/index.html:111',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'CG_Registry_Status_Notifier (8ebf6001), adopted and deployed, sends the submitter "Decision on your submission" when the Portal Registry row changes status, addressed from the row (emailRaw)',
      'The adopted AUTO_SCHEDULED_SWEEP (8c19b45c) carries no status scope; DGO_SCHEDULED_SWEEP, which did, is retired (2026-10-06)',
    ],
    severity: 'CRITICAL',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'Requires PRE-2. Same carrier as RN-002, keyed on the declined status.',
  }),

  Object.freeze({
    id: 'RN-005',
    messageType: 'withdrawal-receipt',
    event: 'A submitter withdraws their own submission',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'CG_Writeback_Endpoint, on the withdraw action',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Portal_Writeback_Endpoint__bde13d27-73b3-4e1a-9687-eb289b039c7a__full_definition.json, the send "Request withdrawn —"',
    content: 'Confirmation that the reference is closed at their request, and the time it was closed.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType withdrawal-receipt.',
    basis:
      'The writeback package closes a record on the citizen\'s instruction and sets ' +
      'StatusLabel "Withdrawn by the submitter". A closure taken on someone\'s instruction ' +
      'needs a receipt to that person; nothing else in the estate records that they asked.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Portal_Writeback_Endpoint__bde13d27-73b3-4e1a-9687-eb289b039c7a__full_definition.json — item/StatusLabel "Withdrawn by the submitter"',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'CG_Portal_Writeback_Endpoint (bde13d27), the one flow WRITEBACK runs on, sends "Request withdrawn —" to the submitter (senderEmailRaw) on the withdraw action',
      'CG_Registry_Status_Notifier (8ebf6001) also tells the submitter when the registry row moves to withdrawn',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'HIGH',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'None required.',
  }),

  Object.freeze({
    id: 'RN-006',
    messageType: 'verification-code',
    event: 'A citizen requests a verification code',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'Case_Generate in the verify switch, after Create Otp Record',
    carrier: 'Portal_VERIFY_ECM_DOCS and Portal_VERIFY_CONFIRM_ECM_DOCS, action Send_Otp_Email',
    content: 'The six-digit code and its expiry.',
    failureBehaviour: 'Create_Verify_Outbox_Receipt runs on Succeeded, Failed, TimedOut and Skipped.',
    basis: 'Verification cannot complete without the code reaching the person verifying.',
    basisEvidence: ['docs/deployment/RUNBOOK.md — Part 2 §5, Phase 3, the seven portal flows'],
    status: 'PROVISIONED',
    statusEvidence: [
      'Both packages address Send_Otp_Email to @outputs(\'Compose_Verify_Email\') and write Create_Verify_Outbox_Receipt on Succeeded, Failed, TimedOut and Skipped',
      'The live VERIFY endpoint runs on one flow, CG_Portal_Verification_Endpoint (ba47f79b; endpoint register current_configuration, PF_ENDPOINT_VERIFY). It sends "Your NITDA portal verification code" to @outputs(\'Compose_Verify_Email\'), the citizen who asked',
      'Portal_Verify (86897b2f), which sent the code to dgsregistry@nitda.gov.ng, is retired (docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json, 2026-10-05)',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation:
      'Session 4 fixes this by pasting the package over 86897b2f. Until it is pasted, a citizen ' +
      'cannot complete verification unless someone forwards the code from a shared mailbox. ' +
      'Subject to PRE-1, the sending mailbox decision.',
  }),

  Object.freeze({
    id: 'RN-007',
    messageType: 'support-acknowledgement',
    event: 'A support case is opened from the portal',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'Portal_SUPPORT_ECM_DOCS, after the Portal Support Cases row is written',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Portal_Support_Endpoint__4873c936-a2be-4726-8e69-426edb8f70e6__full_definition.json, the send "Support request received — case …"',
    content: 'The case reference and the reply undertaking.',
    failureBehaviour: 'Create_Support_Outbox_Receipt runs on Succeeded, Failed, TimedOut and Skipped.',
    basis: 'The acknowledgement carries the case reference, which the citizen has no other way to obtain.',
    basisEvidence: ['docs/folio-Master-Flows-and-Endpoints/deployment/PORTAL_INTEGRATION_FACTSHEET.md:384'],
    status: 'PROVISIONED',
    statusEvidence: [
      'Send_Support_Acknowledgement addressed to @outputs(\'Compose_Support_Email\')',
      'Create_Support_Outbox_Receipt records sent or failed with LastError',
      'CG_Portal_Support_Endpoint (4873c936), the one flow SUPPORT runs on, sends "Support request received — case" to the requester (emailRaw) and the case to the helpdesk address in Flow Configuration',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation: 'None. Subject to PRE-1, the sending mailbox decision.',
  }),

  Object.freeze({
    id: 'RN-008',
    messageType: 'support-reply',
    event: 'A support case is answered or closed',
    platform: 'portal',
    audience: 'citizen',
    channel: 'email',
    trigger: 'The write that changes Portal Support Cases.Status',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json, Foreach_Closed_Case',
    content: 'The reply, or the reason the case was closed, quoting the case reference.',
    failureBehaviour: 'A Portal Outbox Receipts row with MessageType support-reply.',
    basis:
      'The acknowledgement the estate already sends undertakes that "The helpdesk replies ' +
      'within one working day", and Portal Support Cases carries a Status column to close on. ' +
      'The undertaking is made by a message that exists; the reply it promises is not.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Portal_Support_Endpoint__4873c936-a2be-4726-8e69-426edb8f70e6__full_definition.json — the acknowledgement promises a reply',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'AUTO_SCHEDULED_SWEEP (8c19b45c) · Foreach_Closed_Case sends support-reply to the case\'s Email when Portal Support Cases.Status is closed, hourly',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'HIGH',
    owner: 'Registry helpdesk owner',
    remediation: 'Requires PRE-2, or a helpdesk action that sends on reply.',
  }),

  /* ── Internal platform · officers ─────────────────────────────────────────────────────
     The assignment cascade starts two clocks on every assignment and names four audiences to
     tell. The estate tells none of them: the two assignment packages carry no mail action at
     all, and the deployed flows they replace mail a single named individual. */

  Object.freeze({
    id: 'RN-009',
    event: 'A record is assigned to one officer',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'DGO_SINGLE_ASSIGNMENT, after the assignment is written',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/Single_Task_Assignment__3caf9458-8d95-4740-a01b-6803dad97d34__full_definition.json, and docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/SINGLE_ASSIGNMENT__Single_Task_Assignment__3caf9458.paste.json',
    content: 'The reference, the instruction, the acknowledgement date and the due date.',
    failureBehaviour: 'An outbox row, or the assignment is not reported as delivered.',
    basis:
      'The cascade requires an assignee and a due date on every assignment, and derives an ' +
      'acknowledgement date from ackDays. Both clocks start when the assignment is written, ' +
      'and the person they run against is not told they have started.',
    basisEvidence: [
      'config/assignment-cascade.config.js — validation.requireAssignedTo, requireDue',
      'config/assignment-cascade.config.js — defaultAckDays, defaultDueDays, dueByPriority',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'The task raised from an e-mail notifies its assigned officer too: the identification Phase 4 package for IP_Create__Task__for_received_Email_Endpoint (ab1a3555) sends both task notifications to the task row\'s AssignedTo (owner decision 2026-10-06, ITEM-50); its deployed definition sends them to hkani@nitda.gov.ng until the package is pasted',
      'Single_Task_Assignment (3caf9458), the one flow SINGLE_ASSIGNMENT runs on, notifies the assignee: its send is addressed to @outputs(\'Compose_Email_To_2\'), resolved from the task\'s AssignedTo',
      'Its identification Phase 4 package keeps that send',
      'The REGRESSION this row carried came from the DGO_SINGLE_ASSIGNMENT replacement package, which sent nothing; it is retired (2026-10-06)',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation: 'None required.',
  }),

  Object.freeze({
    id: 'RN-010',
    event: 'Records are assigned in bulk',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'DGO_BULK_ASSIGNMENT, once per distinct assignee',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/BULK_ASSIGNMENT__BULK_OPS_DATA_RETRIEVAL_HTTP__5aab9e61.paste.json',
    content: 'The references assigned, the instruction, and the earliest acknowledgement and due dates.',
    failureBehaviour: 'An outbox row per assignee, or the batch is not reported as delivered.',
    basis: 'Same obligation as RN-009. Bulk changes the volume, not the duty.',
    basisEvidence: [
      'config/assignment-cascade.config.js — validation.requireAssignedTo, requireDue',
      'config/app.config.js — maxBulkAssign',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'The identification Phase 4 package for BULK OPS DATA RETRIEVAL HTTP (5aab9e61) sends each assignee an e-mail per task, addressed to @outputs(\'Compose_Email_To_2\'), and the requester one naming any document it could not assign',
      'The owner pasted it on 2026-10-05 (identification Phase 4 README); the capture of 2026-10-01 predates it and sends only its run record',
      'BULK_ASSIGNMENT_DIRECT and its flows are retired',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation: 'None required.',
  }),

  Object.freeze({
    id: 'RN-011',
    event: 'A record is assigned with supporting and copy-to parties',
    platform: 'internal',
    audience: 'supporting',
    channel: 'email',
    trigger: 'The same write as RN-009 and RN-010',
    carrier: 'DGO_SINGLE_ASSIGNMENT and DGO_BULK_ASSIGNMENT',
    content: 'The reference and the instruction, marked as information rather than action.',
    failureBehaviour: 'An outbox row. A failure here does not fail the assignment.',
    basis:
      'The cascade resolves a supporting DSU, a supporting assignee, and a copy-to and ' +
      'inform-DSU list on every row of the routing matrix. Resolving an audience the system ' +
      'never writes to is work with no effect.',
    basisEvidence: [
      'config/assignment-cascade.config.js — categoryFieldAliases.supportDsuKey, supportingAssignee, copyTo, infoDsu',
      'config/assignment-cascade.config.js — fallbackMatrix, six rows each naming a supportDsuKey',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Single_Task_Assignment (3caf9458) and the BULK_ASSIGNMENT package copy each assignment e-mail to @outputs(\'Compose_Email__CC_2\'), the copy-to parties the request names',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'MEDIUM',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'Add a second send, addressed to the resolved supporting and copy-to lists.',
  }),

  Object.freeze({
    id: 'RN-012',
    event: 'An officer is reminded to acknowledge an assignment',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'The acknowledgment module\'s remind-assignee action',
    carrier: 'core/staff-notice-service.js (StaffNotices.ackReminder) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The reference, the original instruction, and the acknowledgement date now passed or approaching.',
    failureBehaviour: 'The reminder is queued in PendingQueue and retried, not reported as sent.',
    basis:
      'The action exists and is confirmed by the operator. Until 2026-10-03 it reported ' +
      '"Reminder recorded for <assignee>" after promising the assignee "will be reminded"; from ' +
      '2026-10-03 to 2026-10-16 it said the reminder was noted on this device and nothing was sent. ' +
      'A reminder that reaches nobody is not a reminder.',
    basisEvidence: [
      'modules/acknowledgment.js:58',
      'config/action-ownership.config.js — remind-assignee, backend EMAIL',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/acknowledgment.js:58 — the data-remind handler runs remind-assignee, which sends StaffNotices.ackReminder(task) to the task\'s assignedTo (core/staff-notice-service.js:134)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent; no address means nothing is sent and the operator is told',
      'config/action-ownership.config.js:72 — remind-assignee declares the mandatory backend EMAIL',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Platform technical owner',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-013',
    messageType: 'acknowledgement-overdue',
    event: 'An acknowledgement clock expires unacknowledged',
    platform: 'internal',
    audience: 'owner',
    channel: 'email',
    trigger: 'A scheduled sweep of assignments whose ack date has passed',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json, Foreach_Ack_Overdue',
    content: 'The references unacknowledged, their assignees, and how long each has been overdue.',
    failureBehaviour: 'The sweep run record; a failed sweep must be visible, not silent.',
    basis:
      'Every routing row carries an ackDays count that becomes a dated field on the ' +
      'assignment. GAP-045 records the consequence: a clock whose expiry raises nothing is a ' +
      'measurement, not a control.',
    basisEvidence: [
      'config/assignment-cascade.config.js — ackDays on all six fallbackMatrix rows',
      'docs/process/22-GAP-CONFLICT-AND-VALIDATION-REGISTER.md — GAP-045',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'AUTO_SCHEDULED_SWEEP (8c19b45c) · Foreach_Ack_Overdue carries this, hourly, to the assignee',
      'The carrier is the adopted, deployed sweep; PRE-2 records that it runs hourly in the tenant.',
    ],
    severity: 'HIGH',
    owner: 'Operational owner',
    remediation: 'Requires PRE-2. One scheduled flow closes RN-013, RN-014 and RN-027 together.',
  }),

  Object.freeze({
    id: 'RN-014',
    messageType: 'due-breached',
    event: 'A due date is breached',
    platform: 'internal',
    audience: 'owner',
    channel: 'email',
    trigger: 'A scheduled sweep of assignments whose due date has passed',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json, Foreach_Due_Breached',
    content: 'The breached references, their assignees, and the escalation level raised.',
    failureBehaviour: 'The sweep run record.',
    basis:
      'The cascade sets a due date by priority on every assignment, and FastTrack already ' +
      'classifies every tracked item Breached, Due soon or Unassigned against it. The ' +
      'detection exists and the response exists; only the connection is missing.',
    basisEvidence: [
      'config/assignment-cascade.config.js — dueByPriority, defaultDueDays',
      'docs/process/22-GAP-CONFLICT-AND-VALIDATION-REGISTER.md — GAP-045',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'AUTO_SCHEDULED_SWEEP (8c19b45c) · Foreach_Due_Breached carries this, hourly, to the assignee',
      'The carrier is the adopted, deployed sweep; PRE-2 records that it runs hourly in the tenant.',
    ],
    severity: 'HIGH',
    owner: 'Operational owner',
    remediation: 'Requires PRE-2. Same scheduled carrier as RN-013.',
  }),

  Object.freeze({
    id: 'RN-015',
    event: 'An operator notifies the owner of a fast-tracked record',
    platform: 'internal',
    audience: 'owner',
    channel: 'email',
    trigger: 'The fasttrack module\'s notify-owner action',
    carrier: 'core/staff-notice-service.js (StaffNotices.ownerNotice) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The reference, the fast-track notice, and the escalation level if one was raised.',
    failureBehaviour: 'Queued in PendingQueue and retried.',
    basis:
      'The action is confirmed by the operator. Until 2026-10-03 it reported "Owner ' +
      'notification queued" when nothing was queued anywhere but browser storage; from 2026-10-03 ' +
      'to 2026-10-16 it said the notice was noted on this device and nothing was sent.',
    basisEvidence: [
      'modules/fasttrack.js:25 — data-notify handler',
      'config/module-boundaries.config.js:17 — fasttrack owns notify-owner',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/fasttrack.js:25 — the data-notify handler runs notify-owner, which sends StaffNotices.ownerNotice(task) to the owner FastTrack shows on the row, the task\'s assignedTo (core/staff-notice-service.js:138)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent',
      'config/action-ownership.config.js:73 — notify-owner declares the mandatory backend EMAIL (GAP-001 closed for this action)',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Platform technical owner',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-016',
    event: 'An officer requests a sign-in code',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'DGO_OTP, after the OTP record is created',
    carrier: 'IP_OTP_GENERATE (e5632336), the flow OTP_GENERATE runs on (ITEM-82; IP_OTP_VERIFY (4dbe6dde) carries the same send until Folio\'s OTP_GENERATE points at it), action sending "Your Verification Code"',
    content: 'The six-digit code and its expiry.',
    failureBehaviour: 'None defined. This row is provisioned on delivery and unprovisioned on failure.',
    basis: 'Sign-in cannot complete without the code reaching the officer signing in.',
    basisEvidence: ['docs/deployment/RUNBOOK.md — Part 2 §5.1, the paste procedure'],
    status: 'PROVISIONED',
    statusEvidence: [
      'IP_OTP_VERIFY (4dbe6dde) is the one flow OTP_GENERATE and OTP_VERIFY run on (endpoint register current_configuration; docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json). It sends "Your Verification Code" to @outputs(\'Create_item_OTP_Record\')?[\'body/Title\'], the officer who requested it',
      'Owner decision, 2026-10-07 (ITEM-82): generation runs on its own flow, IP_OTP_GENERATE (e5632336), created from IP_OTP_VERIFY with the verification branch removed, so the send is the same action with the same catalogue template (docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-07-otp-generate-created.json)',
      'Web - OTP Generate, Web - OTP Verify and IP_OTP_Endpoint, which carried the fixed-address send or competed for the key, are retired (2026-10-05). PRE-5 is resolved',
      'DGO_OTP writes no outbox receipt, so a failed officer code is unrecorded',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation:
      'The package fixes the address. Until it is pasted, the deployed flow sends every ' +
      'officer\'s sign-in code to one shared mailbox. Add an outbox receipt to the package.',
  }),

  Object.freeze({
    id: 'RN-017',
    event: 'A record enters pending_review and awaits an approval',
    platform: 'internal',
    audience: 'approver',
    channel: 'email',
    trigger: 'The approvals module\'s create-approval action',
    carrier: 'core/staff-notice-service.js (StaffNotices.approvalRequest) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The reference, what is being approved, and who raised it.',
    failureBehaviour: 'Queued in PendingQueue and retried.',
    basis:
      'pending_review is a governed lifecycle state whose only exits are decisions by a ' +
      'second person — approved, approved_with_edit, returned, escalated or rejected. A state ' +
      'that can only be left by someone who is never told about it stalls by construction.',
    basisEvidence: [
      'core/lifecycle.js:2 — pending_review transitions',
      'modules/approvals.js:32 — create-approval',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/approvals.js:32 — create-approval writes the request and sends StaffNotices.approvalRequest(rec) to the approver it names; the form requires the approver\'s e-mail (approverEmail) (core/staff-notice-service.js:142)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent',
      'config/action-ownership.config.js:60 — create-approval declares the mandatory backend EMAIL',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-018',
    event: 'An approval is decided, returned or rejected',
    platform: 'internal',
    audience: 'originator',
    channel: 'email',
    trigger: 'The write that records the approval decision',
    carrier: 'core/staff-notice-service.js (StaffNotices.approvalDecision) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The decision, the reference, and any edit or reason recorded with it.',
    failureBehaviour: 'Queued in PendingQueue and retried.',
    basis:
      'returned sends the record back to in_progress — back to the originator, who must act ' +
      'on it. Nothing tells them it came back.',
    basisEvidence: ['core/lifecycle.js:2 — returned:[\'in_progress\']'],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/approvals.js:43 — approve and reject record the decision and send StaffNotices.approvalDecision(rec, decision, minute) to the originator, the request\'s fromEmail, else its from name resolved through the user directory (core/staff-notice-service.js:146)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent; an originator with no address is reported, not guessed',
      'config/action-ownership.config.js:45 and 61 — approve and reject declare the mandatory backend EMAIL',
      'The approvals screen records approved or rejected; returned is a lifecycle state with no action on this screen, so it has no send to carry',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-019',
    event: 'A record is reassigned from one officer to another',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'The reassign-task route into single-assignment, submitted as a Reassignment',
    carrier: 'core/staff-notice-service.js (StaffNotices.reassignment) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'To the new assignee, the assignment. To the previous assignee, that it has moved and to whom.',
    failureBehaviour: 'An outbox row.',
    basis:
      'reassign_requested is a governed exit from assigned, and the routing table carries a ' +
      'reassign-task action. A clock transfers with the record; the officer it transfers away ' +
      'from is still carrying it until told.',
    basisEvidence: [
      'core/lifecycle.js:2 — assigned:[\'acknowledged\',\'in_progress\',\'reassign_requested\']',
      'config/action-routing.config.js — reassign-task',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/single-assignment.js:148 — a submitted Reassignment runs reassign, which sends StaffNotices.reassignment to the new assignee, naming the officer it was previously with (core/staff-notice-service.js:150)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent',
      'config/action-ownership.config.js:75 — reassign declares the mandatory backend EMAIL',
      'The previous assignee is named in the notice but is not written to separately',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'MEDIUM',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'None required for the new assignee. A separate notice to the previous assignee is not built.',
  }),

  Object.freeze({
    id: 'RN-020',
    event: 'A comment is added to a reference someone else is working',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'The comments module\'s add-comment action, when the record\'s assignee is not the author',
    carrier: 'core/staff-notice-service.js StaffNotices.comment, through EMAIL (IP_SEND_EMAIL), which writes an outbox receipt',
    content: 'Who commented, on which reference, and the first line of the comment.',
    failureBehaviour: 'The send is held on PendingQueue and the officer is told it has not gone; the outbox receipt records a failed send.',
    basis:
      'Comments are addressed to the people working a reference. The notification centre is ' +
      'the estate\'s declared durable feedback channel, and it is device-local by design, so ' +
      'a comment raised on one device is invisible on every other.',
    basisEvidence: [
      'modules/comments.js — add-comment',
      'core/notification-center.js — storage is this module\'s own localStorage key',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Built 2026-10-18 (owner decision of that day): add-comment e-mails the record\'s assignee through EMAIL as staff notice RN-020 (config/staff-notice-templates.config.js), unless the assignee wrote the comment',
    ],
    severity: 'LOW',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  /* ── Outward correspondence and dispatch · external parties ───────────────────────────
     This is the group with the most severe single defect in the estate. The runtime offers
     officers six correspondence templates, every one of which requires a recipientEmail, and
     the flow behind the endpoint discards it. */

  Object.freeze({
    id: 'RN-021',
    event: 'An officer sends an outward official correspondence',
    platform: 'internal',
    audience: 'correspondent',
    channel: 'email',
    trigger: 'core/correspondence-email-service.js, on the send-correspondence-email action',
    carrier: 'The flow behind the EMAIL endpoint — IP_SEND_EMAIL (df59a69f)',
    content: 'The composed correspondence, addressed to the recipient the officer entered.',
    failureBehaviour: 'Marked queued with lastError, enqueued in PendingQueue, and retried.',
    basis:
      'All six correspondence templates require recipientEmail. The desk states its own ' +
      'purpose: "This desk is for actual outward correspondences via email." The register tab ' +
      'displays a Recipient column for everything it claims to have sent.',
    basisEvidence: [
      'config/correspondence-email-templates.config.js — required:[\'recipientEmail\', ...] on all six templates',
      'core/correspondence-email-service.js:68',
      'modules/correspondence-email.js:28 — the sent register displays x.recipientEmail',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'IP_SEND_EMAIL (df59a69f) is the one flow EMAIL runs on (endpoint register current_configuration, DGO_ENDPOINT_EMAIL; docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json). Both of its sends are addressed to @outputs(\'Compose_SendEmail_Recipients\'), from the request',
      'Web - Send Email (fixed to dgsregistry@nitda.gov.ng) and CG_SEND_EMAIL are retired (2026-10-05). PRE-5 is resolved',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation: 'None required for addressing.',
  }),

  Object.freeze({
    id: 'RN-022',
    event: 'An approved response is dispatched to its recipients',
    platform: 'internal',
    audience: 'correspondent',
    channel: 'email',
    trigger: 'The Dispatch screen (modules/dispatch.js), Send dispatch on the Email channel',
    carrier: 'The Correspondence Email Desk (core/correspondence-email-service.js sendDraft) through EMAIL (IP_SEND_EMAIL), which writes the outbox receipt; DYNAMIC_ACTIONS dispatchoutbound then marks the document Treated',
    content: 'The approved response and its attachments, to the recipients named on the dispatch.',
    failureBehaviour: 'markDispatchFailed, the dispatch_failed state, and the retry-dispatch action.',
    basis:
      'Dispatch is the estate\'s outbound stage. dispatchOutbound refuses to run without at ' +
      'least one recipient, transitions the record to dispatch_in_flight and then dispatched, ' +
      'and records a receipt — all of it predicated on a carrier that delivers.',
    basisEvidence: [
      'core/dispatch-service.js:9',
      'docs/folio-Master-Flows-and-Endpoints/deployment/internal/dynamic-operations.json — dispatchoutbound is a required operation',
      'core/lifecycle.js:2 — dispatch_pending → dispatch_in_flight → dispatched',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Built 2026-10-18 (owner decision of that day): an Email dispatch sends the approved response to the recipient through the Correspondence Email Desk, the one route for outward correspondence by e-mail, and marks the document Treated only once the letter has gone',
      'A letter that cannot be sent is held on PendingQueue, the dispatch shows Waiting to be sent, and Send now resends it; the registry is not marked Treated meanwhile',
    ],
    severity: 'CRITICAL',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-023',
    event: 'A dispatch fails',
    platform: 'internal',
    audience: 'originator',
    channel: 'in-app',
    trigger: 'markDispatchFailed',
    carrier: 'core/action-authority.js failure toast and core/notification-center.js',
    content: 'That it has not gone out and the record still shows it as waiting to be sent.',
    failureBehaviour: 'None required for an in-app notice.',
    basis:
      'DISPATCH_FAILED carries its own operator sentence in the failure vocabulary, and the ' +
      'dispatch_failed state has a retry route. The operator must know to take it.',
    basisEvidence: [
      'core/action-authority.js — FAILURE_OUTCOME[ErrorClass.DISPATCH_FAILED]',
      'core/lifecycle.js:2 — dispatch_failed:[\'dispatch_pending\',\'no_dispatch\']',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'executeOwnedAction toasts actionFailureMessage on every failed governed action ' +
        'unless the call site opts out, and the notification centre retains warn and error unread',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation: 'None. Device-local by design, which is acceptable for a notice to the actor.',
  }),

  Object.freeze({
    id: 'RN-024',
    event: 'An officer sends a report or statistics email',
    platform: 'internal',
    audience: 'originator',
    channel: 'email',
    trigger: 'The reports and statistics modules, via the EMAIL endpoint',
    carrier: 'The flow behind the EMAIL endpoint — IP_SEND_EMAIL (df59a69f)',
    content: 'The rendered report, to the recipients the officer confirmed.',
    failureBehaviour: 'Held on the device and sent when the connection returns.',
    basis:
      'Reports states its destination to the officer before sending — "It goes to <email>" — ' +
      'and statistics refuses to send without at least one recipient and passes them as `to`.',
    basisEvidence: [
      'modules/reports.js:49 — \'Sent to\': s.profile.email',
      'modules/statistics.js:48 — payload {subject, to: recipients, ...}',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'IP_SEND_EMAIL (df59a69f) is the one flow EMAIL runs on (endpoint register current_configuration, DGO_ENDPOINT_EMAIL; docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json). Both of its sends are addressed to @outputs(\'Compose_SendEmail_Recipients\'), from the request',
      'Web - Send Email (fixed to dgsregistry@nitda.gov.ng) and CG_SEND_EMAIL are retired (2026-10-05). PRE-5 is resolved',
    ],
    severity: 'HIGH',
    owner: 'Platform technical owner',
    remediation: 'None required for addressing.',
  }),

  /* ── Operations · administrators and the estate itself ────────────────────────────────── */

  Object.freeze({
    id: 'RN-025',
    event: 'A flow run completes and its run record is captured',
    platform: 'flow-estate',
    audience: 'registry-fixed',
    channel: 'email',
    trigger: 'Compose Telemetry Attachments succeeding, in each instrumented flow',
    carrier: 'Send_Telemetry_Email, in the deployed flows',
    content: 'The flow, the run id, the outcome and the run record as an attachment.',
    failureBehaviour: 'The outbox receipt records a failed send and the failure watch reports it; the send runs after the reply, so the caller is not affected.',
    basis:
      'The telemetry mail is the estate\'s run-record capture, and Portal Flow Telemetry ' +
      'exists to hold what it carries. A fixed registry mailbox is the correct audience here — ' +
      'this is the one row where it is.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/LISTS.md — Portal Flow Telemetry.RunRecordJson',
      'docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md — NOTIF-140 and its siblings',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Built 2026-10-18 (owner decision of that day): the UPLOAD and WRITEBACK packages (CG_Upload_Endpoint df82e331, CG_Portal_Writeback_Endpoint bde13d27) send Send_Telemetry_Email, "<flow> — Flow Run Record — <run>", to the registry mailbox with the run record attached, after the Portal Flow Telemetry row, and write an outbox receipt',
      'The earlier REGRESSION rested on the retired CG_Writeback_Endpoint (21d4bfd3) and an older CG_Upload_Endpoint export, which did capture one (retired 2026-10-05)',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-026',
    messageType: 'outbox-failure-alert',
    event: 'An outbound message to a citizen fails to send',
    platform: 'flow-estate',
    audience: 'administrator',
    channel: 'email',
    trigger: 'A Portal Outbox Receipts row written with Status failed',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json, Get_Undeliverable_Receipts and Send_Undeliverable_Alert_Email (support-case closures after their three retries); and Folio_Failure_Watch (c38bfeaa, owner design 2026-10-18), Get_New_Failures and Send_Failure_Watch_Email: every other failure, registered, citizen outcomes and bursts reported hourly in working hours',
    content: 'The message type, the recipient, the reference and the LastError.',
    failureBehaviour: 'The sweep run record.',
    basis:
      'The list carries Status and LastError precisely so a failure is recoverable. Writing a ' +
      'failure nobody reads is a record, not a control.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_SEND_EMAIL__df59a69f-92ca-4554-ae68-6b464aa73ef7__full_definition.json — writes Portal Outbox Receipts',
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json — reads them',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'AUTO_SCHEDULED_SWEEP (8c19b45c) reads Portal Outbox Receipts with Status failed and Attempts ge 3 (Get_Undeliverable_Receipts) and sends the operator address in Flow Configuration "Action required: N undelivered …"',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'HIGH',
    owner: 'Operational owner',
    remediation: 'Requires PRE-2. Same scheduled carrier as RN-013 and RN-014. Owner decision 2026-10-18: every failed notice is registered (its receipt, Status failed; tests/failure-register.test.mjs) and only some are reported. Folio_Failure_Watch (identification-phase4, NOKEY__Folio_Failure_Watch__c38bfeaa.paste.json; flow c38bfeaa created 2026-10-18 by scripts/write-failure-watch-flow.mjs) reports citizen outcomes and unplaced types to the registry hourly in working hours, each once, a burst as a broken mail connection, and the open failures at 07:00; the other groups are counted (config/notification-failure-groups.config.js) and shown in System Health. Created in the tenant 2026-10-18 (Stopped until its proof run).',
  }),

  Object.freeze({
    id: 'RN-027',
    messageType: 'outbox-retry',
    event: 'A failed outbound message is retried',
    platform: 'flow-estate',
    audience: 'citizen',
    channel: 'ledger',
    trigger: 'A scheduled sweep of Portal Outbox Receipts rows whose Status is failed',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json, the receipt patches that advance Attempts',
    content: 'The original message, resent, with Attempts incremented.',
    failureBehaviour: 'Attempts incremented and LastError replaced; a ceiling raises RN-026.',
    basis:
      'The list provisions an Attempts column and every writer hard-codes it to 1. A retry ' +
      'counter that never advances is a column that was designed for a mechanism nobody built.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json — item/Attempts advanced with add()',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'AUTO_SCHEDULED_SWEEP (8c19b45c) resends the acknowledgement, due-date and closed-case notices it owes and advances each receipt\'s Attempts with add(…,1)',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'HIGH',
    owner: 'Operational owner',
    remediation: 'Requires PRE-2. One scheduled flow closes RN-013, RN-014, RN-026 and RN-027. Owner decision 2026-10-18: no automatic resend beyond this one (the platform already retries a send within its run on a transient fault, and receipts keep no body); a failure is resent by the registry from the watch report and closed by its Status (resolved-resent, resolved-corrected, resolved-superseded).',
  }),

  Object.freeze({
    id: 'RN-028',
    event: 'A provisioning or gap-closure run completes',
    platform: 'flow-estate',
    audience: 'administrator',
    channel: 'email',
    trigger: '01 - GOV - Provision HTTP Flow Registry, at the end of the run',
    carrier: '01 - GOV - Provision HTTP Flow Registry, Send_Final_Report_Email, with an outbox receipt (Create_Send_Final_Report_Email_Receipt)',
    content: 'The run status and summary in the subject and body, with the JSON report attached.',
    failureBehaviour: 'The outbox receipt records the send as failed, and the failure watch reports it.',
    basis: 'A provisioning run that changes the tenant must report what it changed to whoever asked for it.',
    basisEvidence: ['docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md — NOTIF-173, NOTIF-174'],
    status: 'PROVISIONED',
    statusEvidence: [
      'Global_Gap_Remediation_Provisioning, which addressed its report to the caller, was a one-off and is retired (2026-10-05, docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json)',
      'Edited 2026-10-18 (owner decision of that day) and read back: 01 - GOV - Provision HTTP Flow Registry (17a85efb), a Button flow, sends its report to the registry mailbox and to the person who ran it (the trigger\'s x-ms-user-email); its receipt records the same addresses',
    ],
    severity: 'LOW',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-029',
    event: 'A scanned document is deposited by the intake pipeline',
    platform: 'flow-estate',
    audience: 'registry-fixed',
    channel: 'email',
    trigger: 'Folio_Incoming_Correspondence_Scan_Processing_Flow (197527c8), on the OneDrive file trigger for /E-DOCUMENT STATION (ITEM-80); DGSO INCOMING AI PROCESSING turned off 2026-10-16',
    carrier: 'Folio_Incoming_Correspondence_Scan_Processing_Flow, Send an email (V2) "New E-Scan", with an outbox receipt (DGSO INCOMING AI PROCESSING, which carried the same send, was turned off 2026-10-16)',
    content: 'The new file name and the intake outcome.',
    failureBehaviour: 'None. No catch path follows the send.',
    basis:
      'Scan intake is the one non-HTTP entry point in the estate, so nothing else in a ' +
      'citizen or officer journey reveals that a document arrived by it.',
    basisEvidence: [
      'docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md — NOTIF-159',
      'modules/scan-intake.js — scan-deposit',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Addressed to dgs@nitda.gov.ng, which config/support-routing.config.js names as the ' +
        'support mailbox — a fixed address that is the correct audience for this row',
      'The rebuild (ITEM-80, docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-08-closure-operations.json) writes a Portal Outbox Receipts row; since 2026-10-19 the send goes to dgs@nitda.gov.ng again, set by the owner in the designer and adopted by identification release 40 (docs/folio-Master-Flows-and-Endpoints/evidence/2026-10-19-flows-apply-3.json), its receipt recording the same address',
    ],
    severity: 'LOW',
    owner: 'Registry owner',
    remediation: 'None.',
  }),

  /* ── In-application feedback · the operator at the keyboard ───────────────────────────
     This is the one class the estate does well, and the matrix records it so that "notifications
     are broken" is not read as a claim about everything. */

  Object.freeze({
    id: 'RN-030',
    event: 'A governed action fails',
    platform: 'internal',
    audience: 'operator',
    channel: 'in-app',
    trigger: 'executeOwnedAction catching any failure',
    carrier: 'core/action-authority.js and core/notification-center.js',
    content: 'What was being attempted and what it means for the record — never the raw error.',
    failureBehaviour: 'Not applicable. This is itself the failure path.',
    basis:
      'The governance layer is the only place that sees every failed governed action, so it ' +
      'owns the sentence the operator reads. Fourteen error classes each have their own.',
    basisEvidence: [
      'core/action-authority.js — FAILURE_OUTCOME, actionFailureMessage',
      'core/action-authority.js:67 — executeOwnedAction',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'One failure, one toast, with an explicit notify:false opt-out for call sites that can ' +
        'say something more useful',
      'warn and error arrive unread in the notification centre so they survive a route change',
    ],
    severity: 'LOW',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-031',
    event: 'An operator action succeeds and must remain findable afterwards',
    platform: 'internal',
    audience: 'operator',
    channel: 'in-app',
    trigger: 'Any module raising a toast through the shell',
    carrier: 'core/notification-center.js',
    content: 'The outcome, its tone, the module and the reference.',
    failureBehaviour: 'Persist failures are logged; the feed degrades to in-memory.',
    basis:
      'Before the notification centre existed, a toast was the entire feedback surface and ' +
      'nothing survived a route change, so an approval or a failed sync the user did not ' +
      'happen to be looking at was unrecoverable from the UI.',
    basisEvidence: ['core/notification-center.js — header comment and CAPACITY'],
    status: 'PROVISIONED',
    statusEvidence: [
      '200-entry capacity, dismissal, unread counts, and a badge on the shell',
      'Device-local by design and correctly documented as such — it is a UI history, not a ' +
        'delivery channel, and this matrix does not count it as one',
    ],
    severity: 'LOW',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-032',
    event: 'A write cannot reach the registry and is held on the device',
    platform: 'internal',
    audience: 'operator',
    channel: 'in-app',
    trigger: 'PendingQueue.enqueue, on any write that fails while offline',
    carrier: 'core/pending-queue.js and the module toast at each call site',
    content: 'That the work is saved here and goes to the registry when the connection returns.',
    failureBehaviour: 'Not applicable.',
    basis:
      'An operator who is told a write succeeded when it is sitting in a local queue will not ' +
      'come back to it. Every enqueue site in the runtime pairs the queue with a toast that ' +
      'says where the work actually is.',
    basisEvidence: [
      'modules/lookup.js:153',
      'core/correspondence-email-service.js:69',
      'modules/statistics.js:48',
    ],
    status: 'PROVISIONED',
    statusEvidence: ['Enqueue and operator notice are paired at every call site checked'],
    severity: 'LOW',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  /* ── Channel contract ─────────────────────────────────────────────────────────────────── */

  Object.freeze({
    id: 'RN-033',
    event: 'A verification code is requested for delivery by SMS',
    platform: 'internal',
    audience: 'assignee',
    channel: 'sms',
    trigger: 'None. The owner decided on 2026-10-03 that no SMS channel will be provisioned.',
    carrier: 'No artifact, by decision. Verification codes go by email only.',
    content: 'The six-digit code.',
    failureBehaviour: 'Not applicable: nothing offers the channel, so no request can ask for it.',
    basis:
      'The internal sign-in screen offered a Phone (SMS) tab and a "Send code via SMS instead" ' +
      'button, and the old Web - OTP Verify trigger schema describes channel as "e.g. \'sms\' or ' +
      '\'email\'". No SMS connector exists. The owner decided SMS is not to be provisioned, so ' +
      'the offer is removed rather than a carrier built (ITEM-69).',
    basisEvidence: [
      'Owner decision, 2026-10-03: "No sms feature is to be provisioned, remove"',
      'core/welcome-experience.js — the SMS tab, the switch button and the phone masking are removed',
      'docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json — packages/otp-verify-patched-definition.json (retired 2026-10-21), the trigger schema of Web - OTP Verify ' +
        '(3e201620…), the flow ITEM-43 turns off; its trigger is kept byte-identical to the deployed one',
    ],
    status: 'WITHDRAWN',
    statusEvidence: [
      'core/welcome-experience.js offers no SMS channel',
      'No SMS, Twilio or text-message connector appears in any exported definition or paste package',
      'The only remaining mention is the description text in the trigger schema of Web - OTP Verify, ' +
        'which is retired by ITEM-43; the in-service IP_OTP flows carry no channel field',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation:
      'None to build. Keep the sign-in screen email-only; when Web - OTP Verify is turned off ' +
      '(ITEM-43) the last description mentioning sms leaves service with it.',
  }),

  /* ── Rows added by the completeness test ──────────────────────────────────────────────
     `tests/notification-matrix.test.mjs` ties this matrix to four governed lists — the status
     vocabulary, the assignment cascade's audiences, the estate's own live mail actions, and
     every runtime action whose name promises a notification. The five rows below were absent
     from the first draft of this matrix and the test found them. They are appended rather than
     filed into the groups above so that the ids already cited by the readiness register keep
     meaning what they meant. */

  Object.freeze({
    id: 'RN-034',
    event: 'An escalation is raised on a record',
    platform: 'internal',
    audience: 'owner',
    channel: 'email',
    trigger: 'The fasttrack escalate-priority action',
    carrier: 'core/staff-notice-service.js (StaffNotices.escalation) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The reference, the escalation level, the reason, and who raised it.',
    failureBehaviour: 'Queued in PendingQueue and retried.',
    basis:
      'escalate-priority writes an escalation record with status Open and forces priority to ' +
      'urgent. An escalation is by definition a request for someone above the current holder ' +
      'to act; a record marked Open that reaches nobody is a counter, not an escalation.',
    basisEvidence: [
      'modules/fasttrack.js:25 — the data-escalate handler writes an escalations entry with status Open',
      'config/module-boundaries.config.js:17 — fasttrack owns escalate-priority',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/fasttrack.js:25 — escalate-priority writes the escalation and sends StaffNotices.escalation(task, level, reason) to the owner FastTrack shows, the task\'s assignedTo (core/staff-notice-service.js:154)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent',
      'config/action-ownership.config.js:74 — escalate-priority has an action-ownership spec (GAP-001 closed for it) declaring the mandatory backend EMAIL',
      'escalate-non-ack is removed from the acknowledgment charter (config/module-boundaries.config.js:20, 2026-10-16): it never had a handler, and the scheduled sweep escalates an unacknowledged assignment (RN-013)',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Platform technical owner',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-035',
    messageType: 'task-reminder',
    event: 'A reminder set on a task falls due',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'The dueAt recorded by the orchestrator set-reminder action',
    carrier: 'DYNAMIC_ACTIONS upsert-record RMD writes the reminder to DGO_TaskReminders; AUTO_SCHEDULED_SWEEP (hourly) sends Send_Task_Reminder_Email once DueAtUtc has passed and marks the row sent or failed',
    content: 'The reference, the task title, and the reminder the operator set.',
    failureBehaviour: 'The outbox receipt (task-reminder) records a failed send, the row is marked failed so it is not resent, and the failure watch reports it.',
    basis:
      'set-reminder is a governed action with a mandatory DYNAMIC_ACTIONS backend and its own ' +
      'audit vocabulary, and it records a dueAt against a named assignee. A reminder carrying a ' +
      'due time that nothing reads at that time is a note, not a reminder.',
    basisEvidence: [
      'modules/orchestrator.js:66 — writes {taskId, dueAt, assignedTo} onto State.notifications',
      'config/action-ownership.config.js:69 — set-reminder, backend DYNAMIC_ACTIONS',
      'config/action-routing.config.js:309 — set-reminder, backendContract DYNAMIC_ACTIONS',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Built 2026-10-18 (owner decision of that day): set-reminder sends upsert-record entityType RMD with assignedTo and dueAt to DYNAMIC_ACTIONS, which writes DGO_TaskReminders (2f42abf5, Flow Configuration DATASET_REMINDERS_*)',
      'AUTO_SCHEDULED_SWEEP reads ReminderStatus scheduled with DueAtUtc passed, in working hours, e-mails the assignee (the registry mailbox while NOTIFY_SWEEP_RECIPIENTS is not staff) and marks the row sent or failed',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation: 'None.',
  }),

  Object.freeze({
    id: 'RN-036',
    event: 'The executive authority delegates a record to someone else',
    platform: 'internal',
    audience: 'assignee',
    channel: 'email',
    trigger: 'The executive-escalate action, which sets the record to Delegated',
    carrier: 'core/staff-notice-service.js (StaffNotices.delegation) through the EMAIL endpoint, IP_SEND_EMAIL',
    content: 'The reference, that it has been delegated by the executive authority, and what is expected.',
    failureBehaviour: 'Queued in PendingQueue and retried.',
    basis:
      'Delegation moves work to a person who was not previously holding it, and Delegated maps ' +
      'onto the public "Under review" status — so the record continues to progress publicly ' +
      'while the person it now depends on has not been told it is theirs.',
    basisEvidence: [
      'modules/executive.js:30 — executive-escalate sets status Delegated',
      'config/action-ownership.config.js:64 — executive-escalate, backend EMAIL',
      'config/status-vocabulary.config.js — InternalStatusToGoverned maps Delegated to review',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'modules/executive.js:31 — Delegate via EA requires a delegate chosen from the user directory, sets the record to Delegated and sends StaffNotices.delegation(item, delegate) to that person (core/staff-notice-service.js:158)',
      'core/staff-notice-service.js:82 — send() goes through WriteManager.backend with endpoint EMAIL; IP_SEND_EMAIL addresses the send from the request and writes an outbox receipt for it',
      'core/staff-notice-service.js:87 — a failed send is held on PendingQueue (retryable) and reported as queued, not sent',
      'config/action-ownership.config.js:64 — executive-escalate declares the mandatory backend EMAIL',
      'Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js:16) is registry, the notice goes to the registry mailbox with a banner naming the intended officer; staff are written to once it is staff',
    ],
    severity: 'HIGH',
    owner: 'Process owner, correspondence lifecycle',
    remediation: 'None required. At commissioning set StaffNoticeDelivery.recipients to staff.',
  }),

  Object.freeze({
    id: 'RN-037',
    event: 'A new portal submission arrives and the registry must pick it up',
    platform: 'flow-estate',
    audience: 'administrator',
    channel: 'email',
    trigger: 'CG_Submission_Endpoint, after the Portal Registry row is written',
    carrier: 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/SUBMISSION__CG_Submission_Endpoint__de9ef13b.paste.json, the send "New submission …"',
    content: 'The reference, the submission type, the sender and the attachment count.',
    failureBehaviour: 'A Portal Outbox Receipts row, or the submission is not reported as delivered.',
    basis:
      'DECISIONS.md records that a portal submission has no internal row and that no flow ' +
      'creates one — the portal estate and the internal estate are joined only by a live read ' +
      'feed. With no scheduled sweep either, a submission that nobody is told about waits in a ' +
      'list until somebody opens it. Three deployed flows already try to send this notice, ' +
      'which is the estate itself recording that it is needed.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/DECISIONS.md:20 — no flow creates an internal row from portal data',
      'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/LISTS.md — Portal Registry, written by CG_Submission_Endpoint',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'The identification Phase 3 package for CG_Submission_Endpoint (de9ef13b) sends "New submission …" to the registry address in Flow Configuration (registryTo) for each submission',
      'The three flows that sent "Glass Pane Portal submission" to hkani@nitda.gov.ng are retired (2026-10-05)',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
      'CG_Portal_Daily_Sweep (f12aec6d) also sends the registry address a daily digest (overdue acknowledgements) and the citizen a notice of files missing from a submission; neither is the per-submission notice',
    ],
    severity: 'HIGH',
    owner: 'Registry owner',
    remediation:
      'Re-address the notice to a monitored registry mailbox and add it to the SUBMISSION ' +
      'package, so it survives Session 4 rather than depending on flows the walkthrough retires.',
  }),

  Object.freeze({
    id: 'RN-038',
    event: 'A record is assigned and the cascade resolves a copy-to and inform list',
    platform: 'internal',
    audience: 'copyTo',
    channel: 'email',
    trigger: 'The same write as RN-009 and RN-010',
    carrier: 'DGO_SINGLE_ASSIGNMENT and DGO_BULK_ASSIGNMENT',
    content: 'The reference and the instruction, for information, with no action implied.',
    failureBehaviour: 'An outbox row. A failure here does not fail the assignment.',
    basis:
      'The cascade resolves copyTo and up to three inform-DSU fields separately from the ' +
      'supporting assignee, because they are a different audience with a different duty — told, ' +
      'not tasked. Resolving a list the system never writes to is work with no effect.',
    basisEvidence: [
      'config/assignment-cascade.config.js — categoryFieldAliases.copyTo, with CC and ccRecipients aliases',
      'config/assignment-cascade.config.js — categoryFieldAliases.infoDsu, INFORMDSU1 through INFORMDSU3',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      'Single_Task_Assignment (3caf9458) and the BULK_ASSIGNMENT package copy each assignment e-mail to @outputs(\'Compose_Email__CC_2\'), the copy-to parties the request names',
      'The replacement package this row cited before 2026-10-06 is retired (registers/flow-retirement.json).',
    ],
    severity: 'LOW',
    owner: 'Process owner, correspondence lifecycle',
    remediation:
      'Carry the resolved copy-to and inform lists on the RN-011 send as Cc, rather than as a ' +
      'separate message.',
  }),

  /* Added 2026-09-09. The obligation predates the carrier, which is what makes this a row rather
     than a surplus entry: the registry workbook provisions an AssignedToEmail column on
     DGO_HTTPFlowRegistryExceptions, an Open Exceptions view that carries that column beside
     Severity, and an ENABLED GovernanceNotificationEmail seed whose stated purpose is
     "Mailbox for registry, exception and provisioning notifications". Provisioning the address
     of the person answerable for an exception, and a view of the open ones, is an obligation to
     tell them.

     SN-006 already lists this flow, for its execution report. That entry and this row are about
     different actions: SN-006 is Send_Final_Report_Email, which runs once per run and which
     nothing obliges; this is Send_Exception_Email, which runs per open exception and which the
     registry's own provisioning does oblige. Listing the flow in both is not double-parking.

     This is one of the estate's scheduled carriers, and it is gated by nothing: PRE-2 was
     resolved by AUTO_SCHEDULED_SWEEP, and this flow carries its own hourly Recurrence. */
  Object.freeze({
    id: 'RN-039',
    event: 'An HTTP flow registry exception is open and assigned to someone',
    platform: 'flow-estate',
    audience: 'assignee',
    channel: 'email',
    trigger: "An hourly Recurrence; Get_Open_Exceptions reads Status eq 'Open' from DGO_HTTPFlowRegistryExceptions",
    carrier: 'Send_Exception_Email, inside Notify_Each_Exception, in 06 - GOV - Registry Exception',
    content:
      'Severity, exception type and exception key as the subject, the exception detail as the ' +
      'body. Acknowledge_Exception then writes the notification back to the row.',
    failureBehaviour:
      'Bounded and visible. Acknowledge_Exception runs only after Send_Exception_Email succeeds, ' +
      'so an undelivered notice leaves the row unacknowledged rather than silently marked sent; ' +
      'and If_Notification_Failed terminates the run when the final report is not Succeeded, so ' +
      'a failed cycle is a failed run rather than a quiet one. This is the only row in this ' +
      'matrix whose carrier both records its own delivery and fails loudly.',
    basis:
      'The registry provisions the address of the officer answerable for each exception, and a ' +
      'view of the open ones that carries that address. It also provisions an enabled ' +
      'configuration seed whose only stated purpose is exception notification. Resolving an ' +
      'accountable person and never writing to them is the defect this matrix already records ' +
      'against the assignment cascade in RN-011 and RN-038.',
    basisEvidence: [
      'docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json — fields: DGO_HTTPFlowRegistryExceptions.AssignedToEmail',
      "docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json — views: Open Exceptions, Status eq 'Open', AssignedToEmail in viewFieldsInOrder",
      'docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json — configSeeds: GovernanceNotificationEmail, isEnabled Yes',
      'docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/LISTS.md — DGO_HTTPFlowRegistryExceptions, Open Exceptions',
    ],
    status: 'PROVISIONED',
    statusEvidence: [
      '06 - GOV - Registry Exception is deployed on an hourly Recurrence, exported from the ' +
        'tenant 2026-09-08',
      'Send_Exception_Email addresses the assignee and copies the registry: where AssignedToEmail ' +
        'is set and is not already the registry mailbox it sends to ' +
        "concat(AssignedToEmail, ';dgsRegistry@nitda.gov.ng'), and where it is empty or already " +
        'the registry it sends to the registry alone. The recipient census counts it as mixed ' +
        'rather than sole for that reason',
      'Live delivery is unverified, as for every row here: the tenant evidence pack is NOT_CAPTURED',
    ],
    severity: 'MEDIUM',
    owner: 'Platform technical owner',
    remediation:
      'None outstanding for the carrier. Two things are: this row needs a tenant result like ' +
      'every other, and the standing copy to the registry mailbox on every exception notice is ' +
      'a choice worth confirming rather than inheriting — it is the same decision SN-006 puts ' +
      'to the governance owner about the same flow.',
  }),
]);

/* ── Surplus: messages the estate sends that nothing requires ─────────────────────────────
 *
 * The question this matrix answers has two halves. The rows above are the messages the estate
 * owes and does not send. These are the messages it sends and does not owe — and they matter
 * for the same reason, because each one is a mail action somebody has to keep working, and
 * several carry record payloads to a shared mailbox.
 *
 * They are listed rather than made rows because a row asserts an obligation, and asserting an
 * obligation for these would be inventing one. What they need is a decision to keep or remove,
 * which is why each carries a `concern` rather than a remediation. */
export const SurplusNotifications = Object.freeze([
  Object.freeze({
    id: 'SN-001',
    pattern: 'Read endpoints email their response payload to a fixed mailbox',
    flows: [
    ],
    recipients: 'dgsRegistry@nitda.gov.ng, hkani@nitda.gov.ng',
    concern:
      'These are per-flow diagnostic captures, distinct from the standardised Flow Run Record ' +
      'telemetry of RN-025. They mail response data — the records a read endpoint just ' +
      'returned — to a shared mailbox on every call. MANUAL-4 puts roughly 785 individuals in ' +
      'scope for that data. Whether this is acceptable is the same decision as MANUAL-4\'s ' +
      'posture, and it has not been taken.',
    decision: 'Keep, narrow, or remove. Owner: the agency, alongside MANUAL-4.',
    formerFlows: [
      'FETCH_DOCS_V2_POST',
      'Fetch_Emails_HTTP_POST',
      'Fetch_Emails_POST',
      'OPS_REFERENCES_AND_LOOKUPS',
      'WEB Get Docs  HTTP GET',
      'Web - Get Tasks GET SWITCH',
      'Web - Subsidiary Doc Actions',
      'Get Correspondences',
    ],
    resolved: 'Resolved 2026-10-05: every flow this entry named is retired (docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json), so the estate no longer makes these sends. In the tenant they stop when the retired flows are turned off.',
  }),
  Object.freeze({
    id: 'SN-002',
    pattern: 'AI chat and preprocessing flows email their results to a fixed mailbox',
    flows: [
    ],
    recipients: 'dgsRegistry@nitda.gov.ng',
    concern:
      'Chat content and preprocessed user messages are mailed out on each run. Subjects are ' +
      '"Result--Hugging Face --" and "HTTP CHAT FLOW", which suggests development instrumentation ' +
      'left in a deployed flow rather than a designed notification.',
    decision: 'Confirm whether these are still wanted in a production environment.',
    formerFlows: [
      'Instant OpenRouter AI Chat',
      'Web - Preprocess user message',
    ],
    resolved: 'Resolved 2026-10-05: every flow this entry named is retired (docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json), so the estate no longer makes these sends. In the tenant they stop when the retired flows are turned off.',
  }),
  Object.freeze({
    id: 'SN-003',
    pattern: 'A send on a second mail connector, with an empty body',
    flows: [
    ],
    recipients: 'dgsRegistry@nitda.gov.ng',
    concern:
      'Send_an_email_notification_(V3) is the estate\'s only SendEmailV3, and its only send on ' +
      'the Mail connector (shared_sendmail) rather than Office 365 Outlook. It has a recipient ' +
      'and a subject — "Email AI Assist Response- " plus the source subject — and a body of ' +
      '"<p class=\'editor-paragraph\'></p>", which is an empty paragraph. So it sends, and what ' +
      'arrives is blank.\n\n' +
      'Two things follow. The message is useless to whoever opens it, and the send sits outside ' +
      'every connection control this matrix applies: the sign-off assertion and the PRE-1 naming ' +
      'check both read shared_office365 connections, so the identity this one authenticates as ' +
      'is asserted nowhere.\n\n' +
      'CORRECTED 2026-09-09. This entry previously read "a send with no recipient and no ' +
      'subject ... it cannot succeed". That was the measurement, not the estate: the extractor ' +
      'read only the emailMessage/* parameters of SendEmailV2 and this action names its ' +
      'parameters request/to, request/subject and request/text. It has both, and it does ' +
      'succeed. The extractor now reads both schemas.',
    decision:
      'Give the message a body or remove the action, and decide whether a second mail connector ' +
      'is intended at all — if it is, the connection controls have to cover it.',
    formerFlows: [
      'Web - Email To Task Processing',
    ],
    resolved: 'Resolved 2026-10-05: every flow this entry named is retired (docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json), so the estate no longer makes these sends. In the tenant they stop when the retired flows are turned off.',
  }),
  Object.freeze({
    id: 'SN-004',
    pattern: 'Audit-trail emails duplicating what the audit list already holds',
    flows: [],
    recipients: 'hkani@nitda.gov.ng',
    concern: 'Sends whose subjects begin "NITDA AUDIT |" or "Diagnostics-" mail an audit or diagnostic line to one individual. The estate has an audit list and a Portal Audit Events list for exactly this. The two flows this entry first named are retired (2026-10-05); the adopted EMAIL_RELATED_TASK flow, IP_Create__Task__for_received_Email_Endpoint (ab1a3555), carries the same pattern: five sends, every one to hkani@nitda.gov.ng, and the identification Phase 4 package keeps them because it changes only identity.',
    decision: 'Retire in favour of the audit lists, or state why the mail copy is needed.',
    formerFlows: [
      'Web - Email Task Created',
      'Deployed Bulk Task Assignment_Create Task',
    ],
    resolved: 'Resolved 2026-10-06 (owner decision, ITEM-50 and ITEM-52): the identification Phase 4 package for IP_Create__Task__for_received_Email_Endpoint (ab1a3555) removes the diagnostics mail and both audit mails, and sends the two task notifications to the assigned officer. In the tenant the sends stop when that package is pasted.',
  }),
  /* Added by the consolidation of 2026-09-05: CG_Support_Endpoint reaches this estate from a
     branch merged into it, so the matrix — raised where it did not exist — had never seen it.
     Read off the deployed definition, not inferred.

     A second entry stood here until the operator's 2026-09-05 re-export: IP_OTP_VERIFY mailed
     the verification code to the literal dgsregistry@nitda.gov.ng. It now addresses
     Create_item_OTP_Record's Title, which is triggerBody()?['identifier'] — the requester. The
     entry is withdrawn rather than kept as resolved, because this register exists to carry
     decisions that are still open. What the re-export did NOT fix is recorded as ITEM-55. */
  Object.freeze({
    id: 'SN-005',
    pattern: 'A real acknowledgement that has no row to assert it',
    flows: [
    ],
    recipients: "each requester's own address — @outputs('Compose_Support_Email') for the support case, Create_item_OTP_Record's Title (triggerBody()?['identifier']) for the verification code",
    concern:
      'Send_Support_Acknowledgement mails "NITDA support case <ref>" to the address the requester ' +
      'supplied, read from ' +
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Support_Endpoint__1b2c2e53-6c07-46a3-80b2-c43be1ef69db__full_definition.json. ' +
      'Unlike SN-001 to SN-005 this is a legitimate notification addressed to the right person. ' +
      'It is recorded here only because the matrix has no row for it, and an unlisted mail action ' +
      'is indistinguishable from an unnoticed one. Listing it is not a claim that it is surplus. ' +
      'IP_OTP_VERIFY joins it after the 2026-09-05 re-export: Send_an_email_(V2) had addressed the ' +
      'literal dgsregistry@nitda.gov.ng and now addresses the requester, which moves it out of the ' +
      'surplus case and into this one — a required notification, correctly addressed, with no row.',
    decision: 'Give each a matrix row asserting the obligation, and remove them from this register.',
    formerFlows: [
      'CG_Support_Endpoint',
      'IP_OTP_VERIFY',
    ],
    resolved: 'Resolved 2026-10-05: each send now has a row. The support acknowledgement is RN-007, carried by CG_Portal_Support_Endpoint (4873c936), which replaced CG_Support_Endpoint (retired); the officer code is RN-016, carried by IP_OTP_VERIFY (4dbe6dde).',
  }),
  Object.freeze({
    id: 'SN-006',
    pattern: 'Every governance flow emails its own execution report to the registry mailbox',
    flows: [
      '01 - GOV - Provision HTTP Flow Registry',
      '02 - GOV - Register HTTP Flow Truth',
      '03 - GOV - Record HTTP Flow Execution',
      '04 - GOV - Audit HTTP Flow Registry',
      '05 - GOV - Retire HTTP Flow',
      '06 - GOV - Registry Exception Notification',
      '07 - GOV - Consumer HTTP Self-Registration Template',
      '08 - GOV - Discover and Register HTTP Consumers',
    ],
    recipients: 'dgsRegistry@nitda.gov.ng',
    concern:
      'Each of the eight ends by composing a JSON and an HTML execution report and mailing both ' +
      'to the registry mailbox, with the JSON attached. Unlike SN-001 these carry no ' +
      'correspondence data and no personal data — they report what the flow did to the ' +
      'governance lists — so the MANUAL-4 exposure does not apply. They are recorded here for ' +
      'the other reason this register exists: eight mail actions somebody has to keep working, ' +
      'on a mailbox that already receives the SN-001 to SN-005 traffic. Four of the eight are ' +
      'HTTP-triggered and anonymous (see GOV-04 and GOV-05 in ' +
      'docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json), so the volume is set by whoever holds ' +
      'the URL, not by the estate. That is the part worth deciding before the registry lists ' +
      'are provisioned.',
    decision:
      'Keep as the audit trail for a governance system that has no other observer, or route to ' +
      'a governance mailbox distinct from the registry one. Owner: the governance owner.',
  }),
  Object.freeze({
    id: 'SN-007',
    pattern: 'Endpoints alert the operator when they fail or are attacked',
    flows: ['CG_Portal_Verification_Confirmation_Endpoint', 'IP_Dynamic_Global_Actions_Endpoint', 'IP_User_Admin_Endpoint', 'IP_Activity_Lifecycle_Endpoint'],
    recipients: "the operator address in Flow Configuration — @outputs('Compose_Notify_Config')?['opsTo']",
    concern:
      'Added 2026-10-06, when the adopted flows\' definitions entered contracts/deployed. These send only ' +
      'operator alerts: a verification code locked after repeated attempts, and an endpoint run that failed. ' +
      'IP_User_Admin_Endpoint (2026-10-08, ITEM-25) and IP_Activity_Lifecycle_Endpoint (2026-10-10, ITEM-25) carry the same failed-run alert as the flow they were made from. ' +
      'The address is configuration, not a literal. The other adopted endpoints send the same alerts beside ' +
      'the notices their rows already name.',
    decision: 'Keep: the operator has no other signal that an endpoint failed or is being probed.',
  }),
]);

/* ── Preconditions ────────────────────────────────────────────────────────────────────────
 *
 * The things that are not notifications but that block or distort a whole class of them.
 * They are recorded here rather than in the rows because each one bears on several rows at
 * once, and fixing a row without its precondition produces a message that is built and still
 * does not arrive.
 *
 * `gates` and `qualifies` are different and the distinction is load-bearing. A gated row
 * CANNOT be provisioned while the precondition is open — there is no mechanism for it to use —
 * and `tests/notification-matrix.test.mjs` fails if one claims otherwise. A qualified row can
 * be fully provisioned and still be affected: PRE-1 does not stop a verification code being
 * sent, it leaves undecided which mailbox the public sees it come from. Collapsing the two
 * would either let gated rows be marked green early, or hold provisioned rows open forever. */
export const Preconditions = Object.freeze([
  Object.freeze({
    id: 'PRE-1',
    title: 'The sending mailbox is decided, and the tenant has now confirmed the connection — RESOLVED 2026-09-02',
    gates: [],
    qualifies: ['RN-006', 'RN-007', 'RN-016', 'RN-028'],
    statement:
      'DECIDED 2026-09-01: the mailbox citizens and officers see as the sender is ' +
      'dgsregistry@nitda.gov.ng. That settled the service-identity half of the execution ' +
      'guide\'s section 4.2 — the address the public reads.\n\n' +
      'CONFIRMED 2026-09-02, and it needed confirming. An Outlook connection sends as the account ' +
      'that authorised it, and a connection id carries no account: the run records named ' +
      'c0b9e7a5b0854c39a435fd8ce92f48ad only as "Office 365 Outlook", so nothing here could say ' +
      'whether the connection every package binds was the registry mailbox or an individual ' +
      'officer\'s. If it had been personal, every citizen verification mail would have gone out ' +
      'under one person\'s name and stopped working the day they left.\n\n' +
      'The three flows exported back from the environment on 1-2 September answer it. Each ' +
      'package manifest NAMES its connection resources, joined through connectionsMap.json, and ' +
      'across all three flows and both APIs every one of the six resources is named ' +
      'dgsregistry@nitda.gov.ng. That is the tenant stating what the connection is rather than ' +
      'this repository inferring it, and npm run notifications now asserts it on every run.\n\n' +
      'Note what this decision is still not: it fixes the FROM address, not the TO. RN-006, RN-016 ' +
      'and RN-021 are about recipients being hard-coded and are untouched by it — the fact that ' +
      'dgsregistry is also the mailbox currently receiving those misdirected messages is a ' +
      'coincidence of this estate, not a resolution of them.',
    evidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_SEND_EMAIL__63a7f2d7-d137-467a-9578-8099c52407dc__full_definition.json — packageProvenance.connections: both APIs named dgsregistry@nitda.gov.ng',
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_OTP_Endpoint__5d0d0a72-1467-4949-a808-61b58cdea0ce__full_definition.json — the same two names',
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__1cb48715-b1e4-4b9b-8740-fb3ee8c4d6f1__full_definition.json — the same two names',
      'docs/deployment/RUNBOOK.md — Part 2 §4.2, the decision, and Part 2 §13, the sign-off row',
      'npm run notifications — asserts every connection resource in the exported packages is that mailbox',
    ],
    owner: 'Agency — service identity (mailbox); operator (connection binding). Both settled.',
    resolution:
      'Done. No tenant check remains: the exported packages name the connection, which is the ' +
      'check that was outstanding. Re-confirm only if a connection is re-authorised by a ' +
      'different account, which would change the name in the next export.',
  }),
  Object.freeze({
    id: 'PRE-2',
    title: 'The scheduled carrier is live in the tenant — RESOLVED 2026-09-02',
    gates: [],
    qualifies: ['RN-002', 'RN-003', 'RN-004', 'RN-008', 'RN-013', 'RN-014', 'RN-026', 'RN-027', 'RN-035'],
    statement:
      'RESOLVED 2026-09-02. The estate had no clock at all: 59 Request triggers and one OneDrive ' +
      'file trigger across the whole exported set, no Recurrence and no SharePoint item trigger, ' +
      'so nothing could fire on time passing. Eight rows of this matrix depended on that one ' +
      'fact.\n\n' +
      'AUTO_SCHEDULED_SWEEP now runs in environment Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 ' +
      'on an hourly Recurrence in W. Central Africa Standard Time. It was imported from ' +
      'DGO_SCHEDULED_SWEEP.zip and exported back on 2026-09-02, and the export was diffed against ' +
      'the package it came from: the same 78 actions, the same six scopes, no drift beyond the ' +
      'designer normalising a single-predicate condition to {and:[…]} and the operator chaining ' +
      'the first scope after the variable initialisation, which is correct and which the package ' +
      'could not do because a clipboard scope has no variables above it.\n\n' +
      'The verifier now asserts the POSITIVE — a scheduled trigger is present — so a sweep that is ' +
      'deleted or turned off fails the check instead of leaving eight rows green on a clock that ' +
      'has stopped.',
    evidence: [
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AUTO_SCHEDULED_SWEEP__8c19b45c-4174-4d2f-9429-ffd08dd1a5ae__full_definition.json — the adopted sweep, Recurrence Hour/1, W. Central Africa Standard Time (the 2026-09-02 export, 1cb48715, was retired 2026-10-05 as a non-adopted copy; registers/flow-retirement.json)',
      'docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json — the DGO_SCHEDULED_SWEEP import package it was imported from, and its test, retired 2026-10-06 and held at the commit recorded there',
      'docs/process/22-GAP-CONFLICT-AND-VALIDATION-REGISTER.md — GAP-045, the clock this closes',
    ],
    owner: 'Operational owner',
    resolution:
      'Done. Imported and confirmed by export. What remains is operational rather than structural: ' +
      'watch the first few hourly runs and confirm one notice per changed record, no re-send on ' +
      'the next cycle, and a Portal Outbox Receipts row per send.',
  }),
  Object.freeze({
    id: 'PRE-3',
    title: 'The generated notification catalogue and this matrix read the same estate — resolved 2026-10-06',
    gates: [],
    qualifies: [],
    statement: 'Document 18 was generated from the deployed exports and from a superseded fragment set under designer-paste/correspondence-gateway, while the operator walkthrough pasted fourteen other packages, so the catalogue never described what the walkthrough produced. On 2026-10-06 the fragment set and the replacement packages were retired with the flows they replaced (registers/flow-retirement.json): the discovery scan reads the adopted definitions, and this matrix reads those and the identification packages that change them.',
    evidence: [
      'scripts/process-discovery.mjs — reads docs/folio-Master-Flows-and-Endpoints/contracts/deployed only',
      'docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json — the fragment set and the replacement packages',
    ],
    owner: 'Platform technical owner',
    resolution: 'Done.',
  }),
  Object.freeze({
    id: 'PRE-4',
    title: 'The readiness register carried no notification item',
    gates: [],
    qualifies: [],
    statement:
      'All 27 entries in the production-readiness register concerned tokens, columns, origins, ' +
      'indexes and endpoints. Nothing in it tracked a message to a human, so no amount of ' +
      'working the register would have surfaced any row in this matrix. Closed by this change: ' +
      'ITEM-38 through ITEM-42 now carry the five classes.',
    evidence: [
      'docs/deployment/PRODUCTION_READINESS_REGISTER.json — items ITEM-38 through ITEM-42',
    ],
    owner: 'Platform technical owner',
    resolution: 'Done.',
  }),
  Object.freeze({
    id: 'PRE-5',
    title: 'One carrier per endpoint — resolved 2026-10-05',
    gates: [],
    qualifies: ['RN-016', 'RN-021', 'RN-024'],
    statement: 'CG_SEND_EMAIL and IP_OTP_Endpoint were created in the tenant on 2 and 1 September beside Web - Send Email and Web - OTP Generate, which hard-coded dgsregistry@nitda.gov.ng, so the URL in config.local.js decided which carrier ran.\n\nResolved by adoption (docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json, 2026-10-05): EMAIL runs on IP_SEND_EMAIL (df59a69f) and OTP_GENERATE and OTP_VERIFY on IP_OTP_VERIFY (4dbe6dde), which the endpoint register\'s current configuration names. Web - Send Email, CG_SEND_EMAIL, Web - OTP Generate, Web - OTP Verify and IP_OTP_Endpoint are retired. The rows this qualified are read from the one carrier each endpoint has.',
    evidence: [
      'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json — the adopted flow per endpoint, and the retired flows',
      'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json — current_configuration: EMAIL → IP_SEND_EMAIL, OTP_GENERATE and OTP_VERIFY → IP_OTP_VERIFY',
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_SEND_EMAIL__df59a69f-92ca-4554-ae68-6b464aa73ef7__full_definition.json — both sends addressed from the request',
      'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_OTP_VERIFY__4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61__full_definition.json — the code addressed to the requesting officer',
      'npm run notifications — the PRE-5 line fails if a retired carrier returns to the deployed set',
    ],
    owner: 'operator',
    resolution: 'Done in the repository. In the tenant: turn off, then delete, Web - Send Email, CG_SEND_EMAIL, Web - OTP Generate, Web - OTP Verify and IP_OTP_Endpoint once their run history shows no call for 14 days (registers/flow-adoption.json).',
  }),
]);

/* Convenience readers. The verifier and the test both use these rather than re-deriving. */
export const byId = Object.freeze(
  Object.fromEntries(RequiredNotifications.map((r) => [r.id, r]))
);

export function countByStatus() {
  const out = {};
  for (const r of RequiredNotifications) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

export function countByPlatform() {
  const out = {};
  for (const r of RequiredNotifications) out[r.platform] = (out[r.platform] || 0) + 1;
  return out;
}

/** Rows that are not yet doing what they are required to do. */
export function outstanding() {
  return RequiredNotifications.filter((r) => r.status !== 'PROVISIONED' && r.status !== 'WITHDRAWN');
}
