/* Failed notices: every one is registered, only some are reported (owner decision, 2026-10-18).
 *
 * Every Folio e-mail (Portal, Workspace and intake) writes a row to the delivery record list, Portal Outbox Receipts
 * (Global_Digital_Documents_Centre, 88a81ca1): Status sent or failed. That row is the register, and every failure is in
 * it; tests/failure-register.test.mjs holds every send of every released package to writing it on failure as well as
 * on success. A failure is closed by changing its Status by hand (FailureResolutions); Modified and Modified By record
 * who closed it and when, so the list needs no new column.
 *
 * Folio_Failure_Watch (scripts/build-identification-phase4.mjs, FAILURE_WATCH) reads the register every hour in working
 * hours and reports to the registry only the groups set to report: citizen outcomes, and any failure it cannot place
 * (fail-safe). It also reports a burst of failures in one hour as a broken mail connection, whatever their group. The
 * other groups are counted, in the 07:00 summary and in the Workspace's System Health, and not reported one by one.
 *
 * A message is placed by its receipt's MessageType; where one type is used by more than one flow, by the flow named in
 * the receipt's Title (<type>:<flow display name>:<run>) first. Flow Configuration NOTIFY_FAILURE_REPORT_GROUPS changes
 * which groups are reported without a release; this file is what the flow falls back to.
 */
export const FailureGroups = Object.freeze({
  citizen: Object.freeze({ label: 'Citizen outcomes', reported: true,
    why: 'A member of the public who is never told an outcome is the most serious failure; the registry can call them or correct the address.' }),
  codes: Object.freeze({ label: 'Sign-in and verification codes', reported: false,
    why: 'A code lives five minutes; the person on screen is told the code was not sent and asks again.' }),
  staff: Object.freeze({ label: 'Staff work notices', reported: false,
    why: 'The work itself stays in the officer\'s My Work and Acknowledgment Queue; the e-mail is a courtesy.' }),
  ops: Object.freeze({ label: 'Registry and operations alerts', reported: false,
    why: 'An e-mail about a failing registry mailbox would go to that mailbox; these are shown in the Workspace instead.' }),
  outward: Object.freeze({ label: 'Outward correspondence', reported: false,
    why: 'The sending officer sees the failure on screen at once; an automatic resend could duplicate an official letter.' }),
  unclassified: Object.freeze({ label: 'Not yet classified', reported: true,
    why: 'A notice this file does not place is reported, so a new send cannot fail unseen.' }),
});

/** Receipt MessageType → group. */
export const FailureGroupByType = Object.freeze({
  'sender-acknowledgement': 'citizen', 'status-acknowledged': 'citizen', 'status-actionrequired': 'citizen', 'status-approved': 'citizen',
  'status-declined': 'citizen', 'status-progress': 'citizen', 'status-withdrawn': 'citizen', 'citizen-note': 'citizen',
  'citizen-respond': 'citizen', 'citizen-withdraw': 'citizen', 'support-acknowledgement': 'citizen', 'support-reply': 'citizen',
  case: 'citizen', 'expired-upload': 'citizen',
  'verification-code': 'codes',
  'report-delivery': 'staff', 'an-email-v2-main-1-1-1': 'staff', 'an-email-v2-main-5': 'staff', 'task-digest': 'staff', 'task-reminder': 'staff',
  'registry-alert': 'ops', 'registry-digest': 'ops', 'helpdesk-alert': 'ops', 'lockout-alert': 'ops', 'rate-limit-alert': 'ops',
  'server-error-alert': 'ops', 'writeback-alert': 'ops', 'dgo-scan-notification': 'ops', telemetry: 'ops',
  'undeliverable-alert': 'ops', 'undelivered-alert': 'ops', 'bulk-failure': 'ops', 'failure-watch': 'ops',
  'outward-correspondence': 'outward',
});

/** "<flow display name>|<MessageType>" → group, for a type more than one flow writes. Read before FailureGroupByType. */
export const FailureGroupByFlowType = Object.freeze({
  'IP_OTP_GENERATE|an-email-v2': 'codes',
  'Folio_Incoming_Correspondence_Scan_Processing_Flow|an-email-v2': 'ops',
});

/** The Status values that close a failure. 'failed' is open. */
export const FailureResolutions = Object.freeze({
  'resolved-resent': 'Sent again by hand',
  'resolved-corrected': 'Address or data corrected; nothing to resend',
  'resolved-superseded': 'No longer needed (the work moved on, or the record was a test)',
});

/** Defaults the watch uses when a Flow Configuration row is absent. */
export const FailureWatchDefaults = Object.freeze({
  enabled: true,
  reportGroups: Object.entries(FailureGroups).filter(([, g]) => g.reported).map(([k]) => k),
  burst: 5,
  reportTo: 'dgsregistry@nitda.gov.ng',
  schedule: Object.freeze({ frequency: 'Week', interval: 1, /* Power Automate takes set hours only on a Day or Week recurrence (tenant, 2026-10-18: 'Hour' refused); Week with these hours and weekdays runs hourly in working hours */ weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], timeZone: 'W. Central Africa Standard Time' }),
  summaryHour: 7,
});

/** The group of a receipt, as the flow computes it. */
export function failureGroupOf({ MessageType, Title } = {}) {
  const type = String(MessageType || '');
  const parts = String(Title || '').split(':');
  const flow = parts.length > 1 ? parts[1] : '';
  return FailureGroupByFlowType[`${flow}|${type}`] || FailureGroupByType[type] || 'unclassified';
}

export const FAILURE_CONFIG_ROWS = Object.freeze({
  NOTIFY_FAILURE_WATCH_ENABLED: 'true or false; false stops the hourly report (failures are still registered).',
  NOTIFY_FAILURE_REPORT_GROUPS: 'comma-separated groups reported one by one (default citizen); unclassified is always reported.',
  NOTIFY_FAILURE_BURST: 'failures in one hour that count as a broken mail connection (default 5).',
  NOTIFY_FAILURE_REPORT_TO: 'who receives the report (default the registry mailbox).',
  NOTIFY_FAILURE_WATCH_CURSOR: 'written by the watch: the end of the window it last read (UTC).',
  NOTIFY_FAILURE_HEALTH: 'written by the watch: JSON with the open count per group, the connection flag and the time; FETCH_ALL returns it to the Workspace.',
});
