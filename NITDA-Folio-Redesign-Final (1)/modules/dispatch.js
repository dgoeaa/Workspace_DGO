import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { WriteManager } from '../core/write-manager.js';
import { Payloads, attempt } from '../core/server-writes.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, badge, mdBack, mdSwitch, resetDetailScroll,fmtDateTime} from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
import { CorrespondenceEmailService } from '../core/correspondence-email-service.js';
export async function mount(el){hydrateGovernance();render(el); }
function badgeTone(ds) { return ds === 'dispatched' ? 'ok' : ds === 'closed' ? 'info' : ds === 'no-dispatch' ? 'warn' : ''; }
const CHANNELS = ['Internal Memo', 'Email', 'Courier', 'Portal Upload'];
/* F-17: a dispatch's state was held on the task, and every load replaces the tasks with the server's copy, so a closed
   or no-dispatch record came back as ready. It is now read from the dispatch records, which are this screen's own and
   are not replaced; the server keeps the hand-over in the task's comments and the audit log. */
function withDispatch(s) {
  const latest = new Map();
  for (const d of (s.dispatches || [])) { const k = String(d.taskId); const prev = latest.get(k); if (!prev || String(d.receiptAt || d.at || '') >= String(prev.receiptAt || prev.at || '')) latest.set(k, d); }
  return (s.tracking || []).map(t => { const d = latest.get(String(t.id)); return d ? { ...t, dispatchStatus: d.status === 'closed' ? 'closed' : d.status === 'no-dispatch' ? 'no-dispatch' : 'dispatched', noDispatchReason: d.reason || t.noDispatchReason } : t; });
}
function queue(s) {
  // Closure gate: only completed work is eligible for outbound dispatch; anything already
  // dispatched (or marked no-dispatch) stays visible until it is closed.
  return withDispatch(s).filter(t => t.dispatchStatus !== 'closed' && (t["status"] === 'Completed' || t.dispatchStatus))
    .sort((a, b) => (a["dispatchStatus"] ? 1 : 0) - (b["dispatchStatus"] ? 1 : 0));
}
function render(el) {
  const s = State.get(); const u = UIState.get('dispatch', { selected: null, md: 'list' }); const list = queue(s); const sel = list.find(t => t.id === u.selected) || null;
  const closedCount = withDispatch(s).filter(t => t.dispatchStatus === 'closed').length;
  el.innerHTML = `<div class="workspace">${head('Dispatch', 'Send completed work out and record it, then close the record once receipt is confirmed. An Email dispatch sends the approved response through the Correspondence Email Desk; any other channel is recorded here.')}
    <div class="toolbar"><span class="meta">${list.length} in queue · ${s.dispatches.length} dispatch record(s) · ${closedCount} closed</span><a class="btn ghost" href="#/orchestrator">Complete work in My Work</a></div>
    <div class="split" ${mdSwitch(sel?u.md:'list')}><div class="list-col">${list.length ? capRows(list, RenderBudget.listRows).map(t => `<div class="list-item ${sel && sel.id === t.id ? 'active' : ''}" data-ref="${esc(t.id)}">
      <div class="meta">${badge(t.dispatchStatus === 'no-dispatch' ? 'No Dispatch' : t.dispatchStatus || 'Ready for Dispatch', badgeTone(t.dispatchStatus))} ${esc(t.referenceId || '')}</div>
      <h4>${esc(t.title)}</h4><div class="meta">${esc(t.assignedTo || '—')}</div></div>`).join('') : '<div class="empty dgo-empty"><h2 class="dgo-empty__title">Nothing waiting to be sent</h2><p>A task appears here once it is marked completed. Complete work in My Work first.</p><p><a class="btn" href="#/orchestrator">Open My Work</a></p></div>'}</div>
    <div class="detail-col panel-stack">${sel ? detail(sel, s) : '<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No record selected</h2><p>Choose a record from the queue to send it out or close it.</p></div></section>'}</div></div></div>`;
  el.querySelectorAll('[data-ref]').forEach(c => c.onclick = () => { UIState.set('dispatch', { selected: c.dataset.ref, md: 'detail' }); render(el); resetDetailScroll(el); });
  el.querySelector('[data-md-back]')?.addEventListener('click', () => { UIState.set('dispatch', { md: 'list' }); render(el); });
  const dispatchBtn = el.querySelector('[data-dispatch]'); if (dispatchBtn) dispatchBtn.onclick = async () => {
    const channel = el.querySelector('[data-channel]')?.value || CHANNELS[0];
    const recipient = el.querySelector('[data-recipient]')?.value?.trim() || '';
    const message = el.querySelector('[data-dispatch-message]')?.value?.trim() || '';
    const byEmail = channel === 'Email';
    if (!recipient) return toast('Enter who this went to before recording it', 'error');
    /* RN-022: an Email dispatch is sent, not just recorded, and only through the Correspondence Email Desk
       (owner, 2026-10-18), so the letter leaves a delivery record in Portal Outbox Receipts. */
    if (byEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return toast('An Email dispatch needs the recipient\'s email address', 'error');
    if (byEmail && !message) return toast('Enter the approved response to send', 'error');
    if (!await confirmAction({ title: byEmail ? 'Send this dispatch' : 'Record this dispatch', body: `<p><b>${esc(sel.title)}</b></p><p>Channel: ${esc(channel)} · Recipient: ${esc(recipient)}</p><p>${byEmail ? 'This sends the approved response to the recipient through the Correspondence Email Desk, records the dispatch and marks the document Treated in the server.' : 'This records that the item went out and marks the document Treated in the server.'}</p>` })) return;
    const at = new Date().toISOString();
    const record = { id: crypto.randomUUID(), taskId: sel.id, referenceId: sel.referenceId || '', title: sel.title, channel, recipient, status: 'dispatched', at, by: s.profile.email };
    let emailHeld = false;
    await executeOwnedAction('dispatch', 'send-dispatch', async () => {
      State.patch({
        tracking: s.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'dispatched', dispatchedAt: at, dispatchChannel: channel, dispatchRecipient: recipient } : x),
        dispatches: [record, ...s.dispatches]
      }, { module: 'dispatch', action: 'dispatch:send', ref: sel.referenceId || sel.id });
      if (byEmail) {
        const draft = CorrespondenceEmailService.saveDraft({ referenceId: sel.referenceId || '', subject: sel.title, recipientEmail: recipient, body: message, templateId: 'official-correspondence', sourceKind: 'dispatch-record', sourceId: record.id }, {});
        State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, correspondenceEmailId: draft.id } : d) }, { silent: true });
        try { const sent = await CorrespondenceEmailService.sendDraft(draft, { recordDispatch: false }); State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, email: 'sent', requestId: sent.requestId || '' } : d) }, { silent: true }); }
        catch { emailHeld = true; State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, email: 'queued', sync: 'queued' } : d) }, { silent: true }); }
      }
      if (emailHeld) return toast('The letter has not gone out yet: it is held on this device and goes when the connection is back. Use Send now to try again.', 'error');
      try { await WriteManager.backend({ module: 'dispatch', action: 'dispatch', payload: { taskId: sel.id, title: sel.title, channel, recipient }, ref: sel.referenceId || sel.id }); }
      catch { State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, sync: 'queued' } : d) }, { silent: true }); toast('Dispatch recorded on this device — it has not reached the server yet. Use Send now to try again.', 'info'); }
    }, { ref: sel.referenceId || sel.id });
    if (!emailHeld) toast(byEmail ? 'Dispatch sent by email and recorded' : 'Dispatch recorded (' + channel + ')', 'success'); render(el);
  };
  const noDispatchBtn = el.querySelector('[data-no-dispatch]'); if (noDispatchBtn) noDispatchBtn.onclick = async () => {
    const reason = el.querySelector('[data-nd-reason]')?.value?.trim() || '';
    if (!reason) return toast('A reason is required to mark no-dispatch', 'error');
    if (!await confirmAction({ title: 'Record that nothing needs to be sent', body: `<p><b>${esc(sel.title)}</b></p><p>Reason: ${esc(reason)}</p>` })) return;
    let out; try { out = await executeOwnedAction('dispatch', 'no-dispatch', async () => {
      const w = await attempt(Payloads.taskUpdate(sel, { comments: `No dispatch required: ${reason}` }), { module: 'dispatch', ref: sel.referenceId || sel.id });
      if (!w.ok && !w.error?.notOnServer) return w;
      const st = State.get();
      State.patch({ tracking: st.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'no-dispatch', noDispatchReason: reason } : x), dispatches: [{ id: crypto.randomUUID(), taskId: sel.id, referenceId: sel.referenceId || '', title: sel.title, status: 'no-dispatch', reason, at: new Date().toISOString(), by: st.profile.email }, ...(st.dispatches || [])] }, { module: 'dispatch', action: 'dispatch:no-dispatch', ref: sel.referenceId || sel.id });
      return { ok: true, onServer: w.ok };
    }, { ref: sel.referenceId || sel.id }); } catch { return render(el); }
    if (!out.ok) return toast(out.message, 'error');
    toast(out.onServer ? 'Recorded on the server: nothing needs to be sent for this task' : 'Recorded on this device: nothing needs to be sent for this task', 'success'); render(el);
  };
  const retryBtn = el.querySelector('[data-retry-dispatch]'); if (retryBtn) retryBtn.onclick = async () => {
    const record = s.dispatches.find(d => d.taskId === sel.id && d.sync === 'queued'); if (!record) return;
    try {
      /* `notify:false` — the operator pressed retry because it failed once already, so the
         useful fact is that it is STILL queued and still waiting, not that it failed again. */
      await executeOwnedAction('dispatch', 'retry-dispatch', async () => { if (record.email === 'queued') { const draft = (State.get().correspondenceEmails || []).find(x => x.id === record.correspondenceEmailId); if (draft) await CorrespondenceEmailService.sendDraft(draft, { recordDispatch: false }); State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, email: 'sent' } : d) }, { silent: true }); } return WriteManager.backend({ module: 'dispatch', action: 'dispatch', payload: { taskId: sel.id, title: sel.title, channel: record.channel, recipient: record.recipient }, ref: sel.referenceId || sel.id }); }, { ref: sel.referenceId || sel.id, notify: false });
      State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, sync: 'confirmed', syncedAt: new Date().toISOString() } : d) }, { module: 'dispatch', action: 'dispatch:retry', ref: sel.referenceId || sel.id });
      toast('The server has confirmed this dispatch', 'success'); render(el);
    } catch { toast('The server is still unreachable — this dispatch is still waiting to be sent', 'error'); }
  };
  const closeBtn = el.querySelector('[data-close-item]'); if (closeBtn) closeBtn.onclick = async () => {
    if (!await confirmAction({ title: 'Close this record', body: `<p><b>${esc(sel.title)}</b></p><p>Closing confirms receipt and ends the dispatch lifecycle for this record.</p>` })) return;
    const at = new Date().toISOString();
    /* The dispatch record holds the closure; the server's audit log is told too, when it can be reached. */
    attempt(Payloads.event('dispatch:closed', { ref: sel.referenceId || String(sel.id), module: 'dispatch' }), { module: 'dispatch', ref: sel.referenceId || sel.id });
    await executeOwnedAction('dispatch', 'close-dispatch', () => State.patch({
      tracking: s.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'closed', closedAt: at } : x),
      dispatches: (s.dispatches.some(d => d.taskId === sel.id && ['dispatched', 'no-dispatch'].includes(d.status)) ? s.dispatches : [{ id: crypto.randomUUID(), taskId: sel.id, referenceId: sel.referenceId || '', title: sel.title, status: 'dispatched', at }, ...s.dispatches]).map(d => d.taskId === sel.id && ['dispatched', 'no-dispatch'].includes(d.status) ? { ...d, status: 'closed', receiptAt: at, receiptBy: s.profile.email } : d)
    }, { module: 'dispatch', action: 'dispatch:close', ref: sel.referenceId || sel.id }), { ref: sel.referenceId || sel.id });
    UIState.set('dispatch', { selected: null }); toast('Record closed — its dispatch lifecycle is complete', 'success'); render(el);
  };
}
function detail(t, s) {
  const record = s.dispatches.find(d => d.taskId === t.id && d.status !== 'closed') || s.dispatches.find(d => d.taskId === t.id);
  return `${mdBack('Back to dispatch queue')}<section class="panel"><div class="eyebrow panel-eyebrow">Dispatch Record</div><div class="meta">${badge(t.dispatchStatus === 'no-dispatch' ? 'No Dispatch' : t.dispatchStatus || 'Ready for Dispatch', badgeTone(t.dispatchStatus))}</div><h2>${esc(t.title)}</h2>
    <p class="meta">${esc(t.referenceId || '—')} · Assigned to ${esc(t.assignedTo || '—')}</p>
    ${record ? `<dl class="detail-grid"><dt>Channel</dt><dd>${esc(record.channel)}</dd><dt>Recipient</dt><dd>${esc(record.recipient || '—')}</dd><dt>Dispatched</dt><dd>${esc(fmtDateTime(record.at || ''))}</dd><dt>By</dt><dd>${esc(record.by || '—')}</dd>${record.receiptAt ? `<dt>Receipt</dt><dd>${esc(fmtDateTime(record.receiptAt))} by ${esc(record.receiptBy || '—')}</dd>` : ''}</dl>` : ''}
    ${t.noDispatchReason ? `<p class="meta">No-dispatch reason: ${esc(t.noDispatchReason)}</p>` : ''}${record?.sync === 'queued' ? `<div class="form-row"><span class="pill">Waiting to be sent</span><button class="btn ghost" data-retry-dispatch>Send now</button></div>` : ''}</section>
    ${!t.dispatchStatus ? `<section class="panel"><div class="eyebrow panel-eyebrow">Execute Dispatch</div><div class="grid"><label>Channel<select data-channel>${CHANNELS.map(c => `<option>${c}</option>`).join('')}</select></label><label>Recipient<input data-recipient placeholder="Recipient name or address" value="${esc(t.assignedTo || '')}"></label><label class="wide">Approved response (sent as the letter when the channel is Email)<textarea data-dispatch-message rows="5" placeholder="The approved text of the response"></textarea></label><label class="wide">No-dispatch reason (only if not dispatching)<input data-nd-reason placeholder="Why no outbound dispatch is required"></label></div>
    <div class="form-row"><button class="btn" data-dispatch>Record dispatch</button><button class="btn ghost" data-no-dispatch>No Dispatch Required</button></div></section>` : ''}
    ${t["dispatchStatus"] === 'dispatched' || t["dispatchStatus"] === 'no-dispatch' ? '<section class="panel"><div class="eyebrow panel-eyebrow">Closure</div><p class="meta">Closing confirms receipt and ends the dispatch lifecycle for this record.</p><div class="form-row"><button class="btn" data-close-item>Close</button></div></section>' : ''}`;
}
