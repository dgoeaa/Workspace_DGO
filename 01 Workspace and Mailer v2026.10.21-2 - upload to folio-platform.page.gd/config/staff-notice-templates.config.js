/* The e-mails the Workspace sends to staff (register ITEM-51). core/staff-notice-service.js renders one of these and
   sends it through the EMAIL endpoint. One template per required notification, named by its matrix row
   (config/notification-matrix.config.js); `content` there says what each must carry, and these carry exactly that.

   Mail clients ignore CSS variables, so the colours are literal, and each one is a value of the brand palette
   (styles/dgo-design-system/tokens/tokens.primitive.css); tests/staff-notice.test.mjs holds them to it. The layout is
   the one the scheduled sweep's digest uses: a full document with lang, a hidden preheader, presentational tables,
   640px wide. {{token}} values are escaped when rendered; a row whose value is empty is left out. */
export const StaffNoticeBrand = Object.freeze({
  agency: 'National Information Technology Development Agency',
  deepGreen: '#05583B',   // --dgo-green-700
  paper: '#FAFAF9',       // --dgo-ink-25
  surface: '#FFFFFF',     // --dgo-ink-0
  line: '#E8E6E7',        // --dgo-ink-100
  heading: '#1B1A1A',     // --dgo-ink-900
  ink: '#373435',         // --dgo-ink-700
  muted: '#5F5C5D',       // --dgo-ink-500
  holdBg: '#FBF1D8',      // --dgo-warn-50: the commissioning banner, as the sweep digest shows it
  holdInk: '#5A3F00',     // --dgo-warn-800
});

export const StaffNoticeTemplates = Object.freeze({
  'RN-012': Object.freeze({
    id: 'ack-reminder',
    subject: 'Reminder: please acknowledge {{referenceId}} — {{title}}',
    preheader: 'An assignment is waiting for you to confirm receipt.',
    heading: 'Please acknowledge this assignment',
    lead: 'Dear {{recipientName}}, {{actorName}} is reminding you to confirm that you have received the assignment below.',
    rows: [['Reference', 'referenceId'], ['Task', 'title'], ['Instruction', 'instruction'], ['Acknowledge by', 'ackDate'], ['Due', 'dueDate']],
    closing: 'Open Folio and confirm receipt from the Acknowledgment Queue.',
  }),
  'RN-015': Object.freeze({
    id: 'owner-notice',
    subject: 'FastTrack notice: {{referenceId}} — {{title}}',
    preheader: 'A record you own has been fast-tracked.',
    heading: 'A record you own needs attention',
    lead: 'Dear {{recipientName}}, {{actorName}} has raised a FastTrack notice on the record below.',
    rows: [['Reference', 'referenceId'], ['Task', 'title'], ['Due', 'dueDate'], ['FastTrack status', 'risk'], ['Escalation level', 'level']],
    closing: 'Open Folio to act on it.',
  }),
  'RN-017': Object.freeze({
    id: 'approval-request',
    subject: 'Approval requested: {{referenceId}} — {{title}}',
    preheader: 'A request is waiting for your decision.',
    heading: 'Your approval is requested',
    lead: 'Dear {{recipientName}}, {{actorName}} has asked you to approve the request below. It stays pending until you decide it.',
    rows: [['Reference', 'referenceId'], ['Request', 'title'], ['Summary', 'summary'], ['Raised by', 'actorName']],
    closing: 'Open Folio and record your decision under Review &amp; Approval.',
  }),
  'RN-018': Object.freeze({
    id: 'approval-decision',
    subject: 'Decision on {{referenceId}}: {{decision}}',
    preheader: 'The request you raised has been decided.',
    heading: 'Your request has been decided',
    lead: 'Dear {{recipientName}}, the request you raised has been {{decision}}.',
    rows: [['Reference', 'referenceId'], ['Request', 'title'], ['Decision', 'decision'], ['Decided by', 'actorName'], ['Minute', 'minute']],
    closing: 'Open Folio to see the decision record.',
  }),
  'RN-019': Object.freeze({
    id: 'reassignment',
    subject: 'Reassigned to you: {{referenceId}} — {{title}}',
    preheader: 'A record has been reassigned to you.',
    heading: 'A record has been reassigned to you',
    lead: 'Dear {{recipientName}}, {{actorName}} has reassigned the record below to you.',
    rows: [['Reference', 'referenceId'], ['Task', 'title'], ['Instruction', 'instruction'], ['Acknowledge by', 'ackDate'], ['Due', 'dueDate'], ['Previously with', 'previousAssignee']],
    closing: 'Open Folio and confirm receipt from the Acknowledgment Queue.',
  }),
  'RN-020': Object.freeze({
    id: 'comment',
    subject: 'New comment on {{referenceId}} — {{title}}',
    preheader: 'Someone has commented on a record you are working.',
    heading: 'A comment has been added to your record',
    lead: 'Dear {{recipientName}}, {{actorName}} has commented on the record below, which is assigned to you.',
    rows: [['Reference', 'referenceId'], ['Task', 'title'], ['Comment by', 'actorName'], ['Comment', 'comment']],
    closing: 'Open Folio to read the thread and reply.',
  }),
  'RN-034': Object.freeze({
    id: 'escalation',
    subject: 'Escalated (level {{level}}): {{referenceId}} — {{title}}',
    preheader: 'A record you own has been escalated.',
    heading: 'A record you own has been escalated',
    lead: 'Dear {{recipientName}}, {{actorName}} has escalated the record below.',
    rows: [['Reference', 'referenceId'], ['Task', 'title'], ['Escalation level', 'level'], ['Reason', 'reason'], ['Due', 'dueDate'], ['Raised by', 'actorName']],
    closing: 'Open Folio to act on it.',
  }),
  'RN-036': Object.freeze({
    id: 'delegation',
    subject: 'Delegated to you: {{referenceId}} — {{title}}',
    preheader: 'The Director-General/CEO has delegated a record to you.',
    heading: 'A record has been delegated to you',
    lead: 'Dear {{recipientName}}, the executive authority has delegated the record below to you. It is now yours to take forward.',
    rows: [['Reference', 'referenceId'], ['Subject', 'title'], ['Delegated by', 'actorName'], ['What is expected', 'expected']],
    closing: 'Open Folio to take it forward.',
  }),
});
