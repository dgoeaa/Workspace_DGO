/* Staff notices: the e-mails the Workspace owes an officer when it hands them work (register ITEM-51).
 *
 * Seven actions used to record a note in browser state, or nothing at all, and the person concerned was never
 * told: remind-assignee (RN-012), add-comment (RN-020), notify-owner (RN-015), create-approval (RN-017), the approval decision (RN-018),
 * a reassignment (RN-019), an escalation (RN-034) and an executive delegation (RN-036). Each now calls send()
 * with a notice built by one of the StaffNotices builders below.
 *
 * send() resolves the recipient, renders the notice from config/staff-notice-templates.config.js and sends it
 * through the EMAIL endpoint (IP_SEND_EMAIL, which writes an outbox receipt for every send). It reports truthfully:
 *   sent          the endpoint answered with success; only then may the operator be told the person was notified;
 *   queued        the send failed; it is held on PendingQueue for retry, and it has NOT been sent;
 *   no-recipient  nobody with an e-mail address is named; nothing is sent, and the operator is told to act directly.
 * It never throws for a failed send, so the governed action it runs in is not reported as failed when the
 * record was written and only the notice is waiting.
 *
 * Commissioning hold: while StaffNoticeDelivery.recipients (config/notification-delivery.config.js) is not
 * 'staff', every notice goes to the registry mailbox with a banner naming the officer it is for. */
import { State } from './state.js';
import { WriteManager } from './write-manager.js';
import { PendingQueue } from './pending-queue.js';
import { AuditLog } from './audit-log.js';
import { StaffNoticeDelivery } from '../config/notification-delivery.config.js';
import { StaffNoticeTemplates, StaffNoticeBrand as B } from '../config/staff-notice-templates.config.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const clean = (v) => String(v ?? '').trim();
export const emailOk = (v) => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(clean(v));
const fill = (text, ctx, escape) => String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (escape ? esc(ctx[k] ?? '') : String(ctx[k] ?? '')));
const FONT = 'Arial,Segoe UI,sans-serif';

/** 'staff' only when the setting says so; anything else holds every notice at the registry. */
export function deliveryMode(setting = StaffNoticeDelivery) { return setting?.recipients === 'staff' ? 'staff' : 'registry'; }

/** The sentence a confirmation shows while the hold is on; empty once staff are e-mailed. */
export function holdNotice(setting = StaffNoticeDelivery) {
  return deliveryMode(setting) === 'staff' ? '' : 'Until commissioning, staff notices go to the registry mailbox, marked with the officer they are for.';
}

/** An address, or a name the user directory can turn into one. Never invents an address. */
export function resolveRecipient(value, state = State.get()) {
  const raw = clean(value);
  if (!raw) return { email: '', name: '' };
  const users = state?.users || [];
  const mail = (u) => clean(u?.email || u?.Email);
  if (emailOk(raw)) {
    const u = users.find((x) => mail(x).toLowerCase() === raw.toLowerCase());
    return { email: raw, name: clean(u?.fullName || u?.name) || raw };
  }
  const key = raw.toLowerCase();
  const u = users.find((x) => [x?.fullName, x?.name, x?.displayName].some((n) => clean(n).toLowerCase() === key));
  return { email: emailOk(mail(u)) ? mail(u) : '', name: raw };
}

/** Subject, HTML and plain text for one notice. `hold` names the intended officer while the registry hold is on. */
export function render(notice, ctx = {}, { hold = null } = {}) {
  const t = StaffNoticeTemplates[notice];
  if (!t) throw new Error(`Unknown staff notice ${notice}`);
  const subject = (hold ? '[For ' + (hold.name || hold.email) + '] ' : '') + fill(t.subject, ctx, false).replace(/\s+/g, ' ').trim();
  const banner = hold
    ? `<tr><td style="padding:12px 24px;background:${B.holdBg};font:13px ${FONT};color:${B.holdInk}">Commissioning: this notice is for ${esc(hold.name && hold.name !== hold.email ? `${hold.name} <${hold.email}>` : hold.email)}. It comes to the registry until StaffNoticeDelivery.recipients is staff.</td></tr>`
    : '';
  const rows = t.rows.filter(([, k]) => clean(ctx[k])).map(([label, k]) =>
    `<tr><td style="padding:6px 12px 6px 0;font:13px ${FONT};color:${B.muted};vertical-align:top;width:150px">${esc(label)}</td><td style="padding:6px 0;font:14px ${FONT};color:${B.ink};vertical-align:top">${esc(ctx[k]).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${B.paper};">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(t.preheader)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.paper}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:${B.surface};border:1px solid ${B.line};border-radius:8px">`
    + `<tr><td style="padding:20px 24px;border-bottom:3px solid ${B.deepGreen};font:bold 14px ${FONT};color:${B.deepGreen}">${esc(B.agency)}</td></tr>`
    + banner
    + `<tr><td style="padding:20px 24px 8px 24px;font:20px ${FONT};color:${B.heading}">${esc(t.heading)}</td></tr>`
    + `<tr><td style="padding:0 24px 16px 24px;font:14px/1.5 ${FONT};color:${B.ink}">${fill(t.lead, ctx, true)}</td></tr>`
    + (rows ? `<tr><td style="padding:0 24px 16px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${B.line}">${rows}</table></td></tr>` : '')
    + `<tr><td style="padding:0 24px 20px 24px;font:14px ${FONT};color:${B.ink}">${t.closing}</td></tr>`
    + `<tr><td style="padding:14px 24px;border-top:1px solid ${B.line};font:12px ${FONT};color:${B.muted}">Sent by Folio for ${esc(ctx.actorName || 'the registry')}. Please do not reply to this e-mail; act on the record in Folio.</td></tr>`
    + `</table></td></tr></table></body></html>`;
  const text = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return { subject, html, text, template: t.id };
}

const defaultTransport = Object.freeze({
  send: (a) => WriteManager.backend({ module: a.module, action: a.action, endpoint: 'EMAIL', payload: a.payload, ref: a.ref }),
  enqueue: (item) => PendingQueue.enqueue(item),
});

/** Send one notice. Returns {status, sent, queued, to, intended, message}; `message` is what the operator reads. */
export async function send(spec, transport = defaultTransport, setting = StaffNoticeDelivery) {
  if (!StaffNoticeTemplates[spec?.notice]) throw new Error(`Unknown staff notice ${spec?.notice}`);
  const s = State.get();
  const actor = s.profile || {};
  const who = resolveRecipient(spec.recipient, s);
  const ref = clean(spec.ref || spec.context?.referenceId);
  const label = who.name || who.email || 'the officer concerned';
  const record = (event, meta) => AuditLog.record({ event, actor, ref, meta: { notice: spec.notice, action: spec.action, intended: who.email, ...meta } });
  const base = { notice: spec.notice, ref, intended: who.email, intendedName: label };

  if (!who.email) {
    record('audit:staff-notice-unaddressed', { named: who.name });
    return { ...base, status: 'no-recipient', sent: false, queued: false, to: '',
      message: who.name
        ? `No e-mail was sent: Folio has no e-mail address for ${who.name}. Tell them directly.`
        : 'No e-mail was sent: no one is named to receive it. Tell the officer concerned directly.' };
  }

  const mode = deliveryMode(setting);
  const to = mode === 'staff' ? who.email : clean(setting?.registryMailbox);
  const ctx = { ...(spec.context || {}), referenceId: ref, recipientName: label, actorName: clean(actor.name || actor.email) || 'A Folio officer' };
  const r = render(spec.notice, ctx, { hold: mode === 'staff' ? null : who });
  const payload = { operation: 'sendStaffNotice', mode: 'single', referenceId: ref, noticeId: spec.notice, __confirmedByUI: true,
    email: { to, subject: r.subject, html: r.html, text: r.text, priority: spec.priority || 'normal', referenceId: ref, templateId: r.template, intendedRecipient: who.email } };
  try {
    const res = await transport.send({ module: spec.module, action: spec.action, payload, ref });
    if (res?.data?.ok === false || res?.data?.success === false) throw new Error(res.data?.message || res.data?.status?.message || 'The e-mail service did not accept the notice');
    record('audit:staff-notice-sent', { to, mode });
    return { ...base, status: 'sent', sent: true, queued: false, to, mode,
      message: mode === 'staff'
        ? `${label} was notified by e-mail.`
        : `The notice for ${label} was e-mailed to the registry mailbox (${to}); staff are not e-mailed until commissioning.` };
  } catch (e) {
    /* core/data-client.js already holds a failed write on PendingQueue (it marks the error `normalized`);
       queue it here only when the failure came before that point, so a retry never sends it twice. */
    if (!e?.normalized) transport.enqueue({ key: 'EMAIL', operation: 'sendStaffNotice', payload, ref, error: e?.message || String(e), retryable: true, queueType: 'staff-notice', noticeId: spec.notice });
    record('audit:staff-notice-queued', { to, mode, error: e?.message || String(e) });
    return { ...base, status: 'queued', sent: false, queued: true, to, mode,
      message: `The e-mail to ${mode === 'staff' ? label : `the registry for ${label}`} could not be sent just now. It is queued on this device and will be retried; it has not been sent yet.` };
  }
}

/* One builder per notice: which record field names the recipient, and what the notice carries. Each module calls
   the builder for its action, so the recipient rule lives here, once, and tests/staff-notice.test.mjs checks it. */
const refOf = (x = {}) => clean(x.referenceId || x.ref || x.RefIDD || x.id);
export const StaffNotices = Object.freeze({
  /** RN-012 — acknowledgment · remind-assignee → the assignee. */
  ackReminder: (task = {}) => ({ notice: 'RN-012', module: 'acknowledgment', action: 'remind-assignee', ref: refOf(task),
    recipient: task.assignedTo || task.AssignedTo,
    context: { title: task.title, instruction: task.description || task.instruction || task.comments, ackDate: task.ack, dueDate: task.due } }),
  /** RN-015 — fasttrack · notify-owner → the owner FastTrack shows (the task's assignee). */
  ownerNotice: (task = {}) => ({ notice: 'RN-015', module: 'fasttrack', action: 'notify-owner', ref: refOf(task),
    recipient: task.ownerEmail || task.assignedTo,
    context: { title: task.title, dueDate: task.due, risk: task._risk, level: task.escalationLevel ? `L${task.escalationLevel}` : '' } }),
  /** RN-017 — approvals · create-approval → the approver the request names. */
  approvalRequest: (rec = {}) => ({ notice: 'RN-017', module: 'approvals', action: 'create-approval', ref: refOf(rec),
    recipient: rec.approverEmail || rec.approver,
    context: { title: rec.title, summary: rec.summary } }),
  /** RN-018 — approvals · approve / reject → the originator who raised the request. */
  approvalDecision: (rec = {}, decision = 'approved', minute = '') => ({ notice: 'RN-018', module: 'approvals', action: decision === 'approved' ? 'approve' : 'reject', ref: refOf(rec),
    recipient: rec.fromEmail || rec.from,
    context: { title: rec.title, decision, minute } }),
  /** RN-019 — single-assignment · reassign → the new assignee. */
  reassignment: ({ referenceId, title, assignedTo, previousAssignee, instruction, ack, due } = {}) => ({ notice: 'RN-019', module: 'single-assignment', action: 'reassign', ref: clean(referenceId),
    recipient: assignedTo,
    context: { title, instruction, ackDate: ack, dueDate: due, previousAssignee: clean(previousAssignee).toLowerCase() === clean(assignedTo).toLowerCase() ? '' : previousAssignee } }),
  /** RN-020 — comments · add-comment → the assignee of the record commented on. */
  comment: (task = {}, comment = '') => ({ notice: 'RN-020', module: 'comments', action: 'add-comment', ref: refOf(task),
    recipient: task.assignedTo || task.AssignedTo,
    context: { title: task.title || task.subject, comment: clean(comment).split(/\r?\n/)[0].slice(0, 400) } }),
  /** RN-034 — fasttrack · escalate-priority → the owner of the escalated record. */
  escalation: (task = {}, level = 1, reason = '') => ({ notice: 'RN-034', module: 'fasttrack', action: 'escalate-priority', ref: refOf(task), priority: 'urgent',
    recipient: task.ownerEmail || task.assignedTo,
    context: { title: task.title, level: String(level), reason, dueDate: task.due } }),
  /** RN-036 — executive · executive-escalate → the delegate. */
  delegation: (item = {}, delegate = '', expected = '') => ({ notice: 'RN-036', module: 'executive', action: 'executive-escalate', ref: refOf(item),
    recipient: delegate,
    context: { title: item.subject || item.title, expected: expected || 'Take the record forward and report back to the Office of the Director-General/CEO.' } }),
});

export const StaffNoticeService = Object.freeze({ send, render, resolveRecipient, deliveryMode, holdNotice, notices: StaffNotices });
