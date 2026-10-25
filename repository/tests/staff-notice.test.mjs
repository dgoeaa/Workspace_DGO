#!/usr/bin/env node
/**
 * Staff notices (register ITEM-51; notification matrix RN-012, RN-015, RN-017, RN-018, RN-019, RN-034, RN-036).
 *
 * Proves, without a browser or a network:
 *   1. each of the seven actions builds its notice for the right person, and its module really calls that builder;
 *   2. each action declares EMAIL as its mandatory backend, and escalate-non-ack is gone from the charter;
 *   3. while the commissioning hold is on, every notice goes to the registry mailbox and names the intended officer;
 *   4. a failed send is queued for retry and is never reported as sent;
 *   5. with no address for the recipient, nothing is sent and the operator is told;
 *   6. the e-mail is its package body fragment (F1), on the brand palette, with every user value escaped.
 *
 * Usage:  node tests/staff-notice.test.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* Minimal browser surface so the runtime modules import under Node (as tests/governance.test.mjs does). */
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { DGO_CONFIG: {} };
globalThis.document = undefined;
if (!globalThis.crypto?.randomUUID) globalThis.crypto = { ...(globalThis.crypto || {}), randomUUID: () => 'test-uuid' };

const svc = await import('../core/staff-notice-service.js');
const { StaffNotices, send, render, resolveRecipient, deliveryMode } = svc;
const { StaffNoticeDelivery, NotificationDeliveryPolicy } = await import('../config/notification-delivery.config.js');
const { actionSpec } = await import('../config/action-ownership.config.js');
const { boundaryFor } = await import('../config/module-boundaries.config.js');
const { StaffNoticeTemplates } = await import('../config/staff-notice-templates.config.js');

const REGISTRY = { recipients: 'registry', registryMailbox: 'dgsregistry@nitda.gov.ng' };
const STAFF = { recipients: 'staff', registryMailbox: 'dgsregistry@nitda.gov.ng' };
const fake = (behaviour = 'ok') => {
  const t = { sent: [], queued: [] };
  t.send = async (a) => {
    t.sent.push(a);
    if (behaviour === 'throw') throw new Error('HTTP 502');
    if (behaviour === 'client-queued') throw Object.assign(new Error('HTTP 503'), { normalized: { message: 'HTTP 503' } });
    if (behaviour === 'refused') return { ok: true, data: { ok: false, message: 'caller not in directory' } };
    return { ok: true, data: { ok: true } };
  };
  t.enqueue = (item) => { t.queued.push(item); return item; };
  return t;
};

/* ── 1. Each action, its builder, its recipient, its call site ───────────────────────────── */
console.log('\nEach action notifies the right person');
const task = { id: 'T1', referenceId: 'REF-1', title: 'Budget memo', assignedTo: 'officer@nitda.gov.ng', ack: '2026-10-20', due: '2026-10-30', description: 'Prepare a reply', escalationLevel: 1 };
const approval = { id: 'A1', ref: 'APR-1', title: 'Approve the memo', from: 'Ada Officer', fromEmail: 'ada@nitda.gov.ng', approverEmail: 'director@nitda.gov.ng', summary: 'For sign-off' };
const cases = [
  ['RN-012', 'remind-assignee', 'acknowledgment', StaffNotices.ackReminder(task), 'officer@nitda.gov.ng', 'modules/acknowledgment.js', /'remind-assignee'[^\n]*StaffNotices\.ackReminder\(sel\)/],
  ['RN-015', 'notify-owner', 'fasttrack', StaffNotices.ownerNotice(task), 'officer@nitda.gov.ng', 'modules/fasttrack.js', /'notify-owner'[^\n]*?StaffNotices\.ownerNotice\(t\)/],
  ['RN-017', 'create-approval', 'approvals', StaffNotices.approvalRequest(approval), 'director@nitda.gov.ng', 'modules/approvals.js', /'create-approval'[^\n]*StaffNotices\.approvalRequest\(rec\)/],
  ['RN-018', 'approve', 'approvals', StaffNotices.approvalDecision(approval, 'approved', 'Cleared'), 'ada@nitda.gov.ng', 'modules/approvals.js', /'approve' : 'reject'[^\n]*StaffNotices\.approvalDecision\(sel, decidedStatus, comment\)/],
  ['RN-018', 'reject', 'approvals', StaffNotices.approvalDecision(approval, 'rejected', 'No'), 'ada@nitda.gov.ng', 'modules/approvals.js', /StaffNotices\.approvalDecision/],
  ['RN-019', 'reassign', 'single-assignment', StaffNotices.reassignment({ referenceId: 'REF-1', title: 'Budget memo', assignedTo: 'new@nitda.gov.ng', previousAssignee: 'old@nitda.gov.ng' }), 'new@nitda.gov.ng', 'modules/single-assignment.js', /d\.type==='reassignment'[\s\S]{0,200}'reassign'[^\n]*StaffNotices\.reassignment\(\{[^\n]*assignedTo:d\.assignedTo,previousAssignee:a\.assignedTo/],
  ['RN-034', 'escalate-priority', 'fasttrack', StaffNotices.escalation(task, 2, 'SLA'), 'officer@nitda.gov.ng', 'modules/fasttrack.js', /'escalate-priority'[^\n]*?StaffNotices\.escalation\(t,/],
  ['RN-036', 'executive-escalate', 'executive', StaffNotices.delegation({ id: 'C1', referenceId: 'REF-9', subject: 'Policy' }, 'delegate@nitda.gov.ng'), 'delegate@nitda.gov.ng', 'modules/executive.js', /'executive-escalate'[^\n]*?StaffNotices\.delegation\(item,delegate\)/],
];
for (const [rn, action, module, spec, to, file, callSite] of cases) {
  check(`${rn} ${action}: the notice is addressed to ${to}`, spec.notice === rn && spec.action === action && spec.module === module && spec.recipient === to,
    JSON.stringify({ notice: spec.notice, action: spec.action, module: spec.module, recipient: spec.recipient }));
  check(`${rn} ${action}: ${file} sends it from the action's handler`, callSite.test(read(file)));
  const s = actionSpec(action);
  check(`${rn} ${action}: owned by ${module}, mandatory backend EMAIL, audit ${s?.audit}`, s?.owner === module && s?.backend === 'EMAIL' && /^audit:/.test(s?.audit || ''),
    JSON.stringify(s));
}
check('the reassignment notice names the officer it was previously with', StaffNotices.reassignment({ assignedTo: 'new@x.gov.ng', previousAssignee: 'old@x.gov.ng' }).context.previousAssignee === 'old@x.gov.ng');
check('the approval decision falls back to the originator\'s name when no address was stored', StaffNotices.approvalDecision({ from: 'Ada Officer' }).recipient === 'Ada Officer');
check('remind-assignee and notify-owner no longer only write browser state',
  !/notifications:\[\{id:crypto\.randomUUID\(\)[^\n]*Acknowledgment reminder/.test(read('modules/acknowledgment.js'))
  && !/FastTrack notice: \$\{t\.title\}/.test(read('modules/fasttrack.js')));
check('escalate-non-ack is removed from the acknowledgment charter (it never had a handler)',
  !(boundaryFor('acknowledgment')?.owns || []).includes('escalate-non-ack') && !/'escalate-non-ack'/.test(read('config/module-boundaries.config.js')));
check('every template the builders name exists', cases.every(([rn]) => StaffNoticeTemplates[rn]));

/* ── 2. Recipient resolution ──────────────────────────────────────────────────────────────── */
console.log('\nRecipient resolution');
const users = { users: [{ fullName: 'Ada Officer', email: 'ada@nitda.gov.ng' }, { fullName: 'No Mail' }] };
check('an address is used as given', resolveRecipient('x@nitda.gov.ng', users).email === 'x@nitda.gov.ng');
check('a name resolves through the user directory', resolveRecipient('ada officer', users).email === 'ada@nitda.gov.ng');
check('a name with no address in the directory resolves to none', resolveRecipient('No Mail', users).email === '' && resolveRecipient('No Mail', users).name === 'No Mail');
check('nothing named resolves to none', resolveRecipient('', users).email === '');

/* ── 3. The commissioning hold ────────────────────────────────────────────────────────────── */
console.log('\nCommissioning hold');
check('held 2026-10-19 (owner, until their own testing is done): the tracked setting sends every notice to the registry mailbox', StaffNoticeDelivery.recipients === 'registry' && deliveryMode() === 'registry');
check('the hold sends to the configured registry mailbox', StaffNoticeDelivery.registryMailbox === NotificationDeliveryPolicy.serviceMailbox && StaffNoticeDelivery.registryMailbox === 'dgsregistry@nitda.gov.ng');
check('only the exact value staff releases the hold', deliveryMode({ recipients: 'Staff ' }) === 'registry' && deliveryMode(STAFF) === 'staff');
{
  const t = fake();
  const r = await send(StaffNotices.ackReminder(task), t, REGISTRY);
  const email = t.sent[0]?.payload?.email || {};
  check('held: the e-mail goes to the registry mailbox, not the officer', email.to === 'dgsregistry@nitda.gov.ng', email.to);
  check('held: the body names the intended officer in the commissioning banner', /Commissioning: this notice is for [^<]*officer@nitda\.gov\.ng[^<]*It comes to the registry until StaffNoticeDelivery\.recipients is staff\./.test(email.html || ''));
  check('held: the subject names the intended officer', /^\[For officer@nitda\.gov\.ng\] /.test(email.subject || ''), email.subject);
  check('held: it is sent through the EMAIL contract by the action it belongs to', t.sent[0]?.module === 'acknowledgment' && t.sent[0]?.action === 'remind-assignee' && t.sent[0]?.payload?.operation === 'sendStaffNotice' && t.sent[0]?.payload?.__confirmedByUI === true);
  check('held: the operator is told it went to the registry, not that the officer was notified', r.sent && /registry mailbox/.test(r.message) && !/was notified/.test(r.message), r.message);
}
{
  const t = fake();
  const r = await send(StaffNotices.approvalRequest(approval), t, STAFF);
  const email = t.sent[0]?.payload?.email || {};
  check('released: the e-mail goes to the officer', email.to === 'director@nitda.gov.ng', email.to);
  check('released: no commissioning banner', !/Commissioning:/.test(email.html || '') && !/^\[For/.test(email.subject || ''));
  check('released: the operator is told the officer was notified, only after a successful response', r.status === 'sent' && /was notified by e-mail/.test(r.message));
}

/* ── 4. Failure is queued, never claimed as sent ──────────────────────────────────────────── */
console.log('\nFailure');
for (const [label, behaviour, queuesHere] of [['the send throws', 'throw', true], ['the e-mail service refuses it', 'refused', true], ['the data client already queued it', 'client-queued', false]]) {
  const t = fake(behaviour);
  const r = await send(StaffNotices.escalation(task, 2, 'SLA'), t, STAFF);
  check(`${label}: reported as queued, not sent`, r.status === 'queued' && r.sent === false && r.queued === true && !/was notified|was e-mailed/.test(r.message) && /not been sent/.test(r.message), r.message);
  check(`${label}: held once on PendingQueue for retry`, queuesHere
    ? t.queued.length === 1 && t.queued[0].key === 'EMAIL' && t.queued[0].retryable === true && t.queued[0].payload?.email?.to === 'officer@nitda.gov.ng'
    : t.queued.length === 0, JSON.stringify(t.queued[0] || {}).slice(0, 200));
}

/* ── 5. No recipient, no send ─────────────────────────────────────────────────────────────── */
console.log('\nNo recipient');
{
  const t = fake();
  const r = await send(StaffNotices.ackReminder({ ...task, assignedTo: '' }), t, REGISTRY);
  check('nobody named: nothing is sent, even to the registry', t.sent.length === 0 && t.queued.length === 0 && r.status === 'no-recipient' && !r.sent);
  check('nobody named: the operator is told plainly', /No e-mail was sent/.test(r.message) && /directly/.test(r.message), r.message);
  const t2 = fake();
  const r2 = await send(StaffNotices.delegation({ referenceId: 'REF-9' }, 'Unknown Person'), t2, STAFF);
  check('a name with no address: nothing is sent and the person is named', t2.sent.length === 0 && r2.status === 'no-recipient' && /Unknown Person/.test(r2.message), r2.message);
}

/* ── 6. The e-mail itself ─────────────────────────────────────────────────────────────────── */
console.log('\nThe e-mail');
{
  const hostile = '<script>alert(1)</script> & "q"';
  for (const rn of Object.keys(StaffNoticeTemplates)) {
    const r = render(rn, { referenceId: 'REF-1', title: hostile, recipientName: hostile, actorName: hostile, instruction: hostile, summary: hostile, minute: hostile, reason: hostile, decision: 'approved', level: '2' }, { hold: { email: 'a@b.gov.ng', name: hostile } });
    check(`${rn}: the body is its package fragment, not a second document inside the IP_SEND_EMAIL frame (F1)`,
      !/<!DOCTYPE|<html|<body/i.test(r.html) && /^<!-- folio-greeting: Dear /.test(r.html) && r.html.includes(`data-folio-fragment="${r.design}"`) && /--hold$/.test(r.design));
    check(`${rn}: the frame gets the hero and footer note of its design`, r.hero.purpose === r.design && r.hero.title && r.hero.chip && /Sent by Folio for/.test(r.footerNote) && r.preheader);
    check(`${rn}: the frame adds no second greeting (it looks for one in the first 600 characters)`, /dear /i.test(r.html.slice(0, 600)));
    check(`${rn}: every user value is escaped`, !r.html.includes('<script>') && r.html.includes('&lt;script&gt;'));
    check(`${rn}: a plain-text part is carried`, r.text.length > 40 && !/<td/.test(r.text));
  }
  {
    const ok = render('RN-018', { referenceId: 'R', decision: 'approved' }), no = render('RN-018', { referenceId: 'R', decision: 'rejected' });
    const heldNo = render('RN-018', { referenceId: 'R', decision: 'rejected' }, { hold: { email: 'a@b.gov.ng' } });
    check('a request that is not approved is sent as SN-Approval-Decision--not-approved', ok.design === 'SN-Approval-Decision' && no.design === 'SN-Approval-Decision--not-approved' && /Not approved/.test(no.hero.chip));
    check('held, a rejected request keeps the hold design and says it was not approved', heldNo.design === 'SN-Approval-Decision--hold' && /Not approved/.test(heldNo.hero.chip));
    const released = render('RN-012', { referenceId: 'TASK-2109', title: 'Memo' });
    check('released: the default design, and its button opens the task in the Workspace', released.design === 'SN-Ack-Reminder' && released.html.includes('href="https://folio-platform.page.gd/?TaskID=2109"'));
    check('a detail row with no value is left out', !/>Instruction</.test(released.html) && />Task</.test(released.html));
  }
  const primitive = read('styles/dgo-design-system/tokens/tokens.primitive.css') + read('styles/dgo-design-system/tokens/tokens.semantic.css');
  const palette = new Set([...primitive.matchAll(/--dgo-[\w-]+:\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => m[1].toUpperCase()));
  const { EmailFragments } = await import('../config/email-fragments.generated.js');
  const sn = Object.values(EmailFragments).filter((f) => f.id.startsWith('SN-'));
  const colours = [...new Set([read('config/staff-notice-templates.config.js'), read('core/staff-notice-service.js'), ...sn.map((f) => f.html + JSON.stringify(f.scheme))].join('\n').match(/#[0-9A-Fa-f]{6}\b/g) || [])].map((h) => h.toUpperCase());
  const off = colours.filter((h) => !palette.has(h));
  check(`every colour in the staff notice e-mail is a brand palette value (${colours.length})`, colours.length > 0 && off.length === 0, off.join(' '));
}

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
