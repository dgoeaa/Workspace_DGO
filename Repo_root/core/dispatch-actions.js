/**
 * Dispatch: sending completed work out, recording that nothing needs to go, and confirming receipt.
 *
 * These lived inside modules/dispatch.js. The record page (essentials plan UX-203) records a dispatch too, so they are
 * here, once, and both screens call them: one owner and audit name each (config/action-ownership.config.js, `dispatch`),
 * one server write each, the same dispatch record. Each resolves to an outcome ({ ok, problem, held, queued, onServer })
 * and the calling screen says it in its own words, as a literal notice the process catalogue can read
 * (docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md); the calling screen asks for confirmation first.
 *
 * F-17: a dispatch's state is read from the dispatch records, which this device keeps, not from the task, which every
 * load replaces with the server's copy; the server keeps the hand-over in the task's comments and the audit log.
 */
import { executeOwnedAction } from './governed-actions.js';
import { WriteManager } from './write-manager.js';
import { Payloads, attempt } from './server-writes.js';
import { State } from './state.js';
import { CorrespondenceEmailService } from './correspondence-email-service.js';

export const DISPATCH_CHANNELS = Object.freeze(['Internal Memo', 'Email', 'Courier', 'Portal Upload']);
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const refOf = (t) => t.referenceId || t.id;

/** The task's latest dispatch record, and the state it gives the task: '', 'dispatched', 'no-dispatch' or 'closed'. */
export function dispatchOf(task, state = State.get()) {
  let latest = null;
  for (const d of (state.dispatches || [])) if (String(d.taskId) === String(task.id) && (!latest || String(d.receiptAt || d.at || '') >= String(latest.receiptAt || latest.at || ''))) latest = d;
  const status = !latest ? '' : latest.status === 'closed' ? 'closed' : latest.status === 'no-dispatch' ? 'no-dispatch' : 'dispatched';
  return { record: latest, status };
}

/** What is wrong with a dispatch before it is attempted: 'no-recipient', 'not-an-address', 'no-message', or ''. */
export function dispatchProblem({ channel, recipient, message }) {
  if (!recipient) return 'no-recipient';
  /* RN-022: an Email dispatch is sent, not just recorded, and only through the Correspondence Email Desk (owner,
     2026-10-18), so the letter leaves a delivery record in Portal Outbox Receipts. */
  if (channel === 'Email' && !EMAIL_RX.test(recipient)) return 'not-an-address';
  if (channel === 'Email' && !message) return 'no-message';
  return '';
}

/** Send or record a dispatch. An Email dispatch is sent as a letter through the Correspondence Email Desk. */
export async function recordDispatch(task, { channel = DISPATCH_CHANNELS[0], recipient = '', message = '' } = {}) {
  recipient = String(recipient).trim(); message = String(message).trim();
  const problem = dispatchProblem({ channel, recipient, message });
  if (problem) return { ok: false, problem };
  const byEmail = channel === 'Email', at = new Date().toISOString(), s = State.get();
  const record = { id: crypto.randomUUID(), taskId: task.id, referenceId: task.referenceId || '', title: task.title, channel, recipient, status: 'dispatched', at, by: s.profile.email };
  let emailHeld = false, queued = false;
  await executeOwnedAction('dispatch', 'send-dispatch', async () => {
    const st = State.get();
    State.patch({
      tracking: (st.tracking || []).map((x) => x.id === task.id ? { ...x, dispatchStatus: 'dispatched', dispatchedAt: at, dispatchChannel: channel, dispatchRecipient: recipient } : x),
      dispatches: [record, ...(st.dispatches || [])],
    }, { module: 'dispatch', action: 'dispatch:send', ref: refOf(task) });
    if (byEmail) {
      const draft = CorrespondenceEmailService.saveDraft({ referenceId: task.referenceId || '', subject: task.title, recipientEmail: recipient, body: message, templateId: 'official-correspondence', sourceKind: 'dispatch-record', sourceId: record.id }, {});
      State.patch({ dispatches: State.get().dispatches.map((d) => d.id === record.id ? { ...d, correspondenceEmailId: draft.id } : d) }, { silent: true });
      try { const sent = await CorrespondenceEmailService.sendDraft(draft, { recordDispatch: false }); State.patch({ dispatches: State.get().dispatches.map((d) => d.id === record.id ? { ...d, email: 'sent', requestId: sent.requestId || '' } : d) }, { silent: true }); }
      catch { emailHeld = true; State.patch({ dispatches: State.get().dispatches.map((d) => d.id === record.id ? { ...d, email: 'queued', sync: 'queued' } : d) }, { silent: true }); }
    }
    if (emailHeld) return;
    try { await WriteManager.backend({ module: 'dispatch', action: 'dispatch', payload: { taskId: task.id, title: task.title, channel, recipient }, ref: refOf(task) }); }
    catch { queued = true; State.patch({ dispatches: State.get().dispatches.map((d) => d.id === record.id ? { ...d, sync: 'queued' } : d) }, { silent: true }); }
  }, { ref: refOf(task) });
  /* held: an Email dispatch whose letter could not go out (it waits on this device); queued: recorded here, not yet on
     the server. */
  return { ok: !emailHeld, held: emailHeld, queued, byEmail, channel, record };
}

/** Record that nothing needs to be sent for a task, with the reason, on the task's comments on the server. */
export async function noDispatch(task, reason = '') {
  reason = String(reason).trim();
  if (!reason) return { ok: false, problem: 'no-reason' };
  return executeOwnedAction('dispatch', 'no-dispatch', async () => {
    const w = await attempt(Payloads.taskUpdate(task, { comments: `No dispatch required: ${reason}` }), { module: 'dispatch', ref: refOf(task) });
    if (!w.ok && !w.error?.notOnServer) return w;
    const st = State.get();
    State.patch({ tracking: (st.tracking || []).map((x) => x.id === task.id ? { ...x, dispatchStatus: 'no-dispatch', noDispatchReason: reason } : x), dispatches: [{ id: crypto.randomUUID(), taskId: task.id, referenceId: task.referenceId || '', title: task.title, status: 'no-dispatch', reason, at: new Date().toISOString(), by: st.profile.email }, ...(st.dispatches || [])] }, { module: 'dispatch', action: 'dispatch:no-dispatch', ref: refOf(task) });
    return { ok: true, onServer: w.ok };
  }, { ref: refOf(task) });
}

/** Confirm receipt: the dispatch lifecycle of the task ends. The dispatch record holds it; the server's audit log is told. */
export async function closeDispatch(task) {
  const at = new Date().toISOString();
  attempt(Payloads.event('dispatch:closed', { ref: task.referenceId || String(task.id), module: 'dispatch' }), { module: 'dispatch', ref: refOf(task) });
  await executeOwnedAction('dispatch', 'close-dispatch', () => {
    const s = State.get(), open = (d) => d.taskId === task.id && ['dispatched', 'no-dispatch'].includes(d.status);
    return State.patch({
      tracking: (s.tracking || []).map((x) => x.id === task.id ? { ...x, dispatchStatus: 'closed', closedAt: at } : x),
      dispatches: ((s.dispatches || []).some(open) ? s.dispatches : [{ id: crypto.randomUUID(), taskId: task.id, referenceId: task.referenceId || '', title: task.title, status: 'dispatched', at }, ...(s.dispatches || [])]).map((d) => open(d) ? { ...d, status: 'closed', receiptAt: at, receiptBy: s.profile.email } : d),
    }, { module: 'dispatch', action: 'dispatch:close', ref: refOf(task) });
  }, { ref: refOf(task) });
  return { ok: true };
}
