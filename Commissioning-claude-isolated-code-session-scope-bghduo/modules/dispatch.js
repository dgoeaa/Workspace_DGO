import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { WriteManager } from '../core/write-manager.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, badge, mdBack, mdSwitch, resetDetailScroll,fmtDateTime} from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { capRows, RenderBudget } from '../core/render-budget.js';
export async function mount(el){hydrateGovernance();render(el); }
function badgeTone(ds) { return ds === 'dispatched' ? 'ok' : ds === 'closed' ? 'info' : ds === 'no-dispatch' ? 'warn' : ''; }
const CHANNELS = ['Internal Memo', 'Email', 'Courier', 'Portal Upload'];
function queue(s) {
  // Closure gate: only completed work is eligible for outbound dispatch; anything already
  // dispatched (or marked no-dispatch) stays visible until it is closed.
  return s.tracking.filter(t => t.dispatchStatus !== 'closed' && (t["status"] === 'Completed' || t.dispatchStatus))
    .sort((a, b) => (a["dispatchStatus"] ? 1 : 0) - (b["dispatchStatus"] ? 1 : 0));
}
function render(el) {
  const s = State.get(); const u = UIState.get('dispatch', { selected: null, md: 'list' }); const list = queue(s); const sel = list.find(t => t.id === u.selected) || null;
  const closedCount = s.tracking.filter(t => t.dispatchStatus === 'closed').length;
  el.innerHTML = `<div class="workspace">${head('Dispatch', 'Send completed work out and close the record once receipt is confirmed.')}
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
    if (!recipient) return toast('Enter who this is going to before sending', 'error');
    if (!await confirmAction({ title: 'Send this record out', body: `<p><b>${esc(sel.title)}</b></p><p>Channel: ${esc(channel)} · Recipient: ${esc(recipient)}</p>` })) return;
    const at = new Date().toISOString();
    const record = { id: crypto.randomUUID(), taskId: sel.id, referenceId: sel.referenceId || '', title: sel.title, channel, recipient, status: 'dispatched', at, by: s.profile.email };
    await executeOwnedAction('dispatch', 'send-dispatch', async () => {
      State.patch({
        tracking: s.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'dispatched', dispatchedAt: at, dispatchChannel: channel, dispatchRecipient: recipient } : x),
        dispatches: [record, ...s.dispatches]
      }, { module: 'dispatch', action: 'dispatch:send', ref: sel.referenceId || sel.id });
      try { await WriteManager.backend({ module: 'dispatch', action: 'dispatch', payload: { taskId: sel.id, title: sel.title, channel, recipient }, ref: sel.referenceId || sel.id }); }
      catch { State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, sync: 'queued' } : d) }, { silent: true }); toast('Dispatch recorded on this device — it has not reached the registry yet. Use Send now to try again.', 'info'); }
    }, { ref: sel.referenceId || sel.id });
    toast('Sent by ' + channel, 'success'); render(el);
  };
  const noDispatchBtn = el.querySelector('[data-no-dispatch]'); if (noDispatchBtn) noDispatchBtn.onclick = async () => {
    const reason = el.querySelector('[data-nd-reason]')?.value?.trim() || '';
    if (!reason) return toast('A reason is required to mark no-dispatch', 'error');
    if (!await confirmAction({ title: 'Record that nothing needs to be sent', body: `<p><b>${esc(sel.title)}</b></p><p>Reason: ${esc(reason)}</p>` })) return;
    await executeOwnedAction('dispatch', 'no-dispatch', () => State.patch({ tracking: s.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'no-dispatch', noDispatchReason: reason } : x) }, { module: 'dispatch', action: 'dispatch:no-dispatch', ref: sel.referenceId || sel.id }), { ref: sel.referenceId || sel.id });
    toast('Recorded — nothing needs to be sent for this task', 'success'); render(el);
  };
  const retryBtn = el.querySelector('[data-retry-dispatch]'); if (retryBtn) retryBtn.onclick = async () => {
    const record = s.dispatches.find(d => d.taskId === sel.id && d.sync === 'queued'); if (!record) return;
    try {
      /* `notify:false` — the operator pressed retry because it failed once already, so the
         useful fact is that it is STILL queued and still waiting, not that it failed again. */
      await executeOwnedAction('dispatch', 'retry-dispatch', () => WriteManager.backend({ module: 'dispatch', action: 'dispatch', payload: { taskId: sel.id, title: sel.title, channel: record.channel, recipient: record.recipient }, ref: sel.referenceId || sel.id }), { ref: sel.referenceId || sel.id, notify: false });
      State.patch({ dispatches: State.get().dispatches.map(d => d.id === record.id ? { ...d, sync: 'confirmed', syncedAt: new Date().toISOString() } : d) }, { module: 'dispatch', action: 'dispatch:retry', ref: sel.referenceId || sel.id });
      toast('The registry has confirmed this dispatch', 'success'); render(el);
    } catch { toast('The registry is still unreachable — this dispatch is still waiting to be sent', 'error'); }
  };
  const closeBtn = el.querySelector('[data-close-item]'); if (closeBtn) closeBtn.onclick = async () => {
    if (!await confirmAction({ title: 'Close this record', body: `<p><b>${esc(sel.title)}</b></p><p>Closing confirms receipt and ends the dispatch lifecycle for this record.</p>` })) return;
    const at = new Date().toISOString();
    await executeOwnedAction('dispatch', 'close-dispatch', () => State.patch({
      tracking: s.tracking.map(x => x.id === sel.id ? { ...x, dispatchStatus: 'closed', closedAt: at } : x),
      dispatches: s.dispatches.map(d => d.taskId === sel.id && d.status === 'dispatched' ? { ...d, status: 'closed', receiptAt: at, receiptBy: s.profile.email } : d)
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
    ${!t.dispatchStatus ? `<section class="panel"><div class="eyebrow panel-eyebrow">Execute Dispatch</div><div class="grid"><label>Channel<select data-channel>${CHANNELS.map(c => `<option>${c}</option>`).join('')}</select></label><label>Recipient<input data-recipient placeholder="Recipient name or address" value="${esc(t.assignedTo || '')}"></label><label class="wide">No-dispatch reason (only if not dispatching)<input data-nd-reason placeholder="Why no outbound dispatch is required"></label></div>
    <div class="form-row"><button class="btn" data-dispatch>Dispatch</button><button class="btn ghost" data-no-dispatch>No Dispatch Required</button></div></section>` : ''}
    ${t["dispatchStatus"] === 'dispatched' || t["dispatchStatus"] === 'no-dispatch' ? '<section class="panel"><div class="eyebrow panel-eyebrow">Closure</div><p class="meta">Closing confirms receipt and ends the dispatch lifecycle for this record.</p><div class="form-row"><button class="btn" data-close-item>Close</button></div></section>' : ''}`;
}
