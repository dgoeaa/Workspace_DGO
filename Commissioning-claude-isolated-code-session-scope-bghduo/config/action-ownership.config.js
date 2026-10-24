/* Per-action governance record: who owns it, which service performs it, which audit
   vocabulary it writes, which endpoint contract it needs, and who else may invoke it.
 *
 * `label` — PRESENTATION ONLY. A plain noun phrase naming what the operator was trying to
 * do, written to slot into a sentence: "Could not <label>." It carries no authority: nothing
 * reads it to decide ownership, to route a call, or to write an audit event, and adding or
 * changing one cannot change what a module is permitted to do.
 *
 * It exists because this table had no human-readable name for an action, so when a governed
 * action failed, core/action-authority.js had nothing to say and fell back to the raw error
 * text — putting "AI_CHAT: Endpoint AI_CHAT is not configured" in front of a registry
 * officer, which is precisely the vocabulary audit finding I-07 bans from operator screens.
 * The raw text is still recorded in the audit trail and still surfaces on System Health and
 * the Operator HUD, where IT needs it. Every action here must carry a label; the governance
 * tests enforce that, and enforce that no label uses the banned vocabulary. */
export const ActionOwnership = Object.freeze({
  // scan-intake creates correspondence from a counter deposit. It is an ALLOWED INVOKER,
  // not a second owner: one action, one owner, so the audit event and the service stay
  // identical whichever channel a record came in through.
  'create-correspondence': { owner:'correspondence', label:'log the correspondence', allowedInvokers:['scan-intake'], service:'Entities.create', audit:'audit:correspondence-created', backend:'DYNAMIC_ACTIONS.optional' },
  'create-brief': { owner:'briefs', label:'create the brief', service:'Briefs.create', audit:'audit:brief-created', backend:'DYNAMIC_ACTIONS.optional' },
  'submit-brief': { owner:'briefs', label:'submit the brief', service:'Briefs.transition', audit:'audit:brief-submitted', backend:'DYNAMIC_ACTIONS.optional' },
  'decide-brief': { owner:'briefs', label:'record the decision on the brief', service:'Briefs.transition', audit:'audit:brief-decided', backend:'DYNAMIC_ACTIONS.optional' },
  'request-meeting': { owner:'meetings', label:'request the meeting', service:'Meetings.create', audit:'audit:meeting-requested', backend:'DYNAMIC_ACTIONS.optional' },
  'decide-meeting': { owner:'meetings', label:'record the decision on the meeting', service:'Meetings.transition', audit:'audit:meeting-decided', backend:'DYNAMIC_ACTIONS.optional' },
  'meeting-actions-to-tasks': { owner:'meetings', label:'turn the meeting actions into tasks', service:'Meetings.actionsToTasks', audit:'audit:meeting-actions-converted', backend:'DYNAMIC_ACTIONS.optional' },
  'create-project': { owner:'projects', label:'create the project', service:'Projects.create', audit:'audit:project-created', backend:'DYNAMIC_ACTIONS.optional' },
  'update-project': { owner:'projects', label:'update the project', service:'Projects.update', audit:'audit:project-updated', backend:'DYNAMIC_ACTIONS.optional' },
  // backend is SCAN_INTAKE, the key core/scan-intake-service.js actually resolves. It read
  // SCAN_UPLOAD, a name that exists nowhere in the endpoint registry, so anyone building a
  // flow from this governance config would have built against a key the client never calls.
  'scan-deposit': { owner:'scan-intake', label:'lodge the scanned document', service:'ScanIntakeService.depositScan', audit:'audit:scan-deposited', backend:'SCAN_INTAKE.required' },
  triage: { owner:'correspondence', label:'update the record', service:'Entities.transitionStatus', audit:'audit:triage-completed', backend:'DYNAMIC_ACTIONS.optional' },
  'assign-one': { owner:'single-assignment', label:'assign that record', service:'Entities.create(task)', audit:'audit:assigned', backend:'SINGLE_ASSIGNMENT' },
  'bulk-assign': { owner:'bulk-assignment', label:'assign those records', service:'OtpService+Idempotency', audit:'audit:bulk-assignment-submitted', backend:'BULK_ASSIGNMENT' },
  acknowledge: { owner:'acknowledgment', label:'record the acknowledgment', allowedInvokers:['orchestrator'], service:'AcknowledgementService.submit', audit:'audit:acknowledged', backend:'SUBSIDIARY_ACTIONS' },
  'acknowledge-retry': { owner:'acknowledgment', label:'send the acknowledgments still waiting', service:'OfflineActionQueue.retryAckQueue', audit:'audit:acknowledgement-retried', backend:'SUBSIDIARY_ACTIONS' },
  'start-work': { owner:'orchestrator', label:'start work on that task', service:'governedTransition', audit:'audit:work-started', backend:'DYNAMIC_ACTIONS.optional' },
  'complete-action': { owner:'orchestrator', label:'mark that work complete', service:'governedTransition', audit:'audit:action-complete', backend:'DYNAMIC_ACTIONS.optional' },
  approve: { owner:'approvals', label:'record the approval', service:'governedTransition', audit:'audit:approved', backend:'DYNAMIC_ACTIONS.optional' },
  'executive-approve': { owner:'executive', label:'record the executive approval', service:'governedTransition', audit:'audit:executive-approved', backend:'DYNAMIC_ACTIONS.optional' },
  'send-dispatch': { owner:'dispatch', label:'send the dispatch', service:'DispatchService.dispatchOutbound', audit:'audit:dispatch-started', backend:'DISPATCH_OUTBOUND' },
  'archive-reference': { owner:'archive', label:'archive the reference', service:'ArchiveService.archiveReference', audit:'audit:archived', backend:'ARCHIVE_REFERENCE.optional' },
  'generate-report': { owner:'reports', label:'produce the report', service:'ReportExportService', audit:'audit:report-generated', backend:'none' },
  'run-checks': { owner:'diagnostics', label:'run the system checks', service:'Diagnostics', audit:'audit:diagnostics-run', backend:'none' },
  'create-correspondence-email-draft': { owner:'correspondence-email', label:'save the letter draft', service:'CorrespondenceEmailService.saveDraft', audit:'audit:correspondence-email-draft-created', backend:'none' },
  'send-correspondence-email': { owner:'correspondence-email', label:'send the letter', service:'CorrespondenceEmailService.sendDraft', audit:'audit:correspondence-email-sent', backend:'EMAIL' },
  'duplicate-correspondence-email': { owner:'correspondence-email', label:'duplicate the letter draft', service:'CorrespondenceEmailService.duplicate', audit:'audit:correspondence-email-duplicated', backend:'none' },
  'archive-correspondence-email': { owner:'correspondence-email', label:'archive the letter', service:'CorrespondenceEmailService.archive', audit:'audit:correspondence-email-archived', backend:'none' },
  'profile': { owner:'settings', label:'save your profile', service:'State.patch', audit:'audit:settings-updated', backend:'none' },
  'create-user': { owner:'user-admin', label:'create the user', service:'State.patch', audit:'audit:user-created', backend:'DYNAMIC_ACTIONS.optional' },
  'update-user': { owner:'user-admin', label:'update the user', service:'State.patch', audit:'audit:user-updated', backend:'DYNAMIC_ACTIONS.optional' },
  'disable-user': { owner:'user-admin', label:'disable the user', service:'State.patch', audit:'audit:user-disabled', backend:'DYNAMIC_ACTIONS.optional' },
  'assign-role': { owner:'user-admin', label:"change the user's role", service:'State.patch', audit:'audit:user-role-assigned', backend:'DYNAMIC_ACTIONS.optional' },
  'create-approval': { owner:'approvals', label:'raise the approval request', service:'State.patch', audit:'audit:approval-requested', backend:'DYNAMIC_ACTIONS.optional' },
  reject: { owner:'approvals', label:'record the rejection', service:'governedTransition', audit:'audit:rejected', backend:'DYNAMIC_ACTIONS.optional' },
  'executive-return': { owner:'executive', label:'return the item to the sender', service:'governedTransition', audit:'audit:executive-returned', backend:'DYNAMIC_ACTIONS.optional' },
  'executive-escalate': { owner:'executive', label:'delegate the item', service:'governedTransition', audit:'audit:executive-escalated', backend:'DYNAMIC_ACTIONS.optional' },
  'append-minute': { owner:'executive', label:'add the minute', service:'State.patch', audit:'audit:executive-minute', backend:'DYNAMIC_ACTIONS.optional' },
  'route-task': { owner:'single-assignment', label:'route the task', allowedInvokers:['executive'], service:'createTask', audit:'audit:task-routed', backend:'SINGLE_ASSIGNMENT' },
  'add-comment': { owner:'comments', label:'add the comment', service:'State.patch', audit:'audit:comment-added', backend:'DYNAMIC_ACTIONS.optional' },
  'remind-assignee': { owner:'acknowledgment', label:'send the reminder', service:'State.patch', audit:'audit:ack-reminder', backend:'DYNAMIC_ACTIONS.optional' },
  'register-file': { owner:'registry', label:'register the file', service:'createRegistryFile', audit:'audit:file-registered', backend:'DYNAMIC_ACTIONS.optional' },
  'route-file': { owner:'registry', label:'route the file', service:'createMovement', audit:'audit:file-routed', backend:'DYNAMIC_ACTIONS.optional' },
  'receive-file': { owner:'registry', label:'record receipt of the file', service:'State.patch', audit:'audit:custody-received', backend:'DYNAMIC_ACTIONS.optional' },
  'close-file': { owner:'registry', label:'close the file', service:'State.patch', audit:'audit:file-closed', backend:'DYNAMIC_ACTIONS.optional' },
  'archive-file': { owner:'archive', label:'archive the file', allowedInvokers:['registry'], service:'ArchiveService.archiveReference', audit:'audit:file-archived', backend:'ARCHIVE_REFERENCE.optional' },
  'update-operation': { owner:'activities', label:'save the work state', service:'updateTaskState', audit:'audit:operation-updated', backend:'DYNAMIC_ACTIONS.optional' },
  'set-reminder': { owner:'orchestrator', label:'set the reminder', service:'State.patch', audit:'audit:reminder-set', backend:'DYNAMIC_ACTIONS' },
  'no-dispatch': { owner:'dispatch', label:'record that nothing will be dispatched', service:'State.patch', audit:'audit:no-dispatch', backend:'none' },
  'retry-dispatch': { owner:'dispatch', label:'send the dispatch again', service:'WriteManager.backend', audit:'audit:dispatch-retried', backend:'DYNAMIC_ACTIONS' },
  'close-dispatch': { owner:'dispatch', label:'close the dispatch', service:'State.patch', audit:'audit:dispatch-closed', backend:'DYNAMIC_ACTIONS.optional' },
  'flag-document': { owner:'activities', label:'mark the document', allowedInvokers:['lookup'], service:'State.patch', audit:'audit:document-flagged', backend:'DYNAMIC_ACTIONS.optional' },
  'update-task': { owner:'orchestrator', label:'update the task', allowedInvokers:['lookup'], service:'updateTaskState', audit:'audit:task-updated', backend:'DYNAMIC_ACTIONS.optional' },
  'create-task-from-email': { owner:'single-assignment', label:'raise a task from that email', allowedInvokers:['lookup','correspondence'], service:'createTask', audit:'audit:email-task-created', backend:'EMAIL_RELATED_TASK' },
  'convert-email': { owner:'correspondence', label:'turn the email into a correspondence record', service:'Entities.create', audit:'audit:email-converted', backend:'DYNAMIC_ACTIONS.optional' },
  'request-otp': { owner:'bulk-assignment', label:'send the one-time code', service:'OtpService.requestOtp', audit:'audit:otp-requested', backend:'OTP_GENERATE' },
  'verify-otp': { owner:'bulk-assignment', label:'check the one-time code', service:'OtpService.verifyOtp', audit:'audit:otp-verified', backend:'OTP_VERIFY' },
  'resolve-escalation': { owner:'fasttrack', label:'resolve the escalation', service:'State.patch', audit:'audit:escalation-resolved', backend:'DYNAMIC_ACTIONS.optional' },
  // Canvas Activities parity lifecycle. All three write one DGOFASTTRACK queue record through
  // WriteManager.backend (idempotency key applied there) and then patch the source activity
  // with the Canvas DGO DIGITAL OPS semantics. They reuse the already-registered
  // DYNAMIC_ACTIONS contract; no new endpoint is introduced.
  'activity-archive': { owner:'activities', label:'archive the activity', service:'ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend', audit:'audit:activity-archived', backend:'DYNAMIC_ACTIONS' },
  'activity-siwes': { owner:'activities', label:'route the activity to SIWES', service:'ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend', audit:'audit:activity-siwes-routed', backend:'DYNAMIC_ACTIONS' },
  'activity-nysc': { owner:'activities', label:'route the activity to NYSC', service:'ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend', audit:'audit:activity-nysc-routed', backend:'DYNAMIC_ACTIONS' },
  'import-state': { owner:'settings', label:'import that file', service:'DataReconciler.apply', audit:'audit:state-imported', backend:'none' }
});
export function actionSpec(action){ return ActionOwnership[action] || null; }
export function actionOwner(action){ return actionSpec(action)?.owner || ''; }
