/* The e-mails the Workspace sends to staff (register ITEM-51). core/staff-notice-service.js renders one of these and
   sends it through the EMAIL endpoint. One template per required notification, named by its matrix row
   (config/notification-matrix.config.js); `content` there says what each must carry, and these carry exactly that.

   Each names its design in the e-mail template package (docs/folio-Master-Flows-and-Endpoints/email-templates/,
   rows TR-074 to TR-081): the body fragment of that name in config/email-fragments.generated.js holds the subject,
   preheader, hero and wording. The commissioning hold sends the design's `--hold` variant, and a request that is not
   approved sends `SN-Approval-Decision--not-approved`. `optional` lists the detail rows that are left out when the
   record has no value for them. Colours live in the fragments; tests/staff-notice.test.mjs holds them to the palette. */
export const StaffNoticeTemplates = Object.freeze({
  'RN-012': Object.freeze({ id: 'ack-reminder', design: 'SN-Ack-Reminder', optional: ['title', 'instruction', 'ackDate', 'dueDate'] }),
  'RN-015': Object.freeze({ id: 'owner-notice', design: 'SN-Owner-Notice', optional: ['title', 'dueDate', 'risk', 'level'] }),
  'RN-017': Object.freeze({ id: 'approval-request', design: 'SN-Approval-Request', optional: ['title', 'summary'] }),
  'RN-018': Object.freeze({ id: 'approval-decision', design: 'SN-Approval-Decision', optional: ['title', 'minute'] }),
  'RN-019': Object.freeze({ id: 'reassignment', design: 'SN-Reassignment', optional: ['title', 'instruction', 'ackDate', 'dueDate', 'previousAssignee'] }),
  'RN-020': Object.freeze({ id: 'comment', design: 'SN-Comment', optional: ['title'] }),
  'RN-034': Object.freeze({ id: 'escalation', design: 'SN-Escalation', optional: ['title', 'reason', 'dueDate'] }),
  'RN-036': Object.freeze({ id: 'delegation', design: 'SN-Delegation', optional: ['title', 'expected'] }),
});
