import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, badge, mdBack, mdSwitch, resetDetailScroll, actionPreview } from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { ReceiptLedger } from '../core/receipt-ledger.js';
import { OfflineActionQueue } from '../core/offline-action-queue.js';
import { send as sendStaffNotice, StaffNotices, holdNotice } from '../core/staff-notice-service.js';
import { selectTaskForAcknowledgement, submitAcknowledgement, buildAcknowledgementPayload, validateAcknowledgementPayload, findAcknowledgementTask, resolveAcknowledgementActor } from '../core/acknowledgement-service.js';

export async function mount(el){ hydrateGovernance(); render(el); }
const holdNote=()=>holdNotice()?`<p class="meta">${esc(holdNotice())}</p>`:'';
function ageDays(t) { const from = t.created || t.start || t.createdAt; if (!from) return null; return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86400000)); }
async function buildPreview(task, form={}){ try{return await buildAcknowledgementPayload(task,{source:'acknowledgment-preview', form});}catch(e){return {error:e.message};} }
function actorFormHtml(){ const a=resolveAcknowledgementActor(); return `<section class="panel"><div class="eyebrow panel-eyebrow">Who is acknowledging</div><div class="grid" data-ack-user-form><label>Name<input name="actorName" value="${esc(a.name)}" required></label><label>Email<input name="actorEmail" type="email" value="${esc(a.email)}" required></label><label>Persona / Role<input name="persona" value="${esc(a.persona)}"></label><label>Department / Unit<input name="department" value="${esc(a.department)}"></label></div><p class="meta">Taken from ${esc(a.source)}. These details are recorded with the acknowledgement and kept on its receipt.</p></section>`; }
function readActorForm(root){ const box=root.querySelector('[data-ack-user-form]'); if(!box) return {}; return Object.fromEntries([...box.querySelectorAll('input,select,textarea')].map(x=>[x.name,x.value])); }
function findSelected(tasks,u){ const s=State.get(), ctx=s.deepLinkContext||{}; return selectTaskForAcknowledgement(s,u.selected||ctx.taskId||ctx.referenceId||s.selectedId) || tasks[0] || null; }
function taskRows(tasks, sel){ return tasks.map(t=>{ const age=ageDays(t), active=sel&&String(sel.id)===String(t.id); return `<tr class="row-link ${active?'row-active':''}" data-id="${esc(t.id)}"><td><div>${esc(t.title)}</div><div class="meta">${esc(t.referenceId || t.id)}</div></td><td>${age == null ? '—' : badge(age + 'd', !t.acknowledged && age >= 2 ? 'danger' : '')}</td><td>${badge(t.acknowledged ? 'Acknowledged' : 'Pending', t.acknowledged ? 'ok' : '')}</td></tr>`; }).join(''); }
function render(el) {
  const s = State.get(); const tasks = s.tracking || []; const u = UIState.get('acknowledgment', { selected: null, md: 'list' }); const ctx=s.deepLinkContext||{};
  const sel = findSelected(tasks,u); if(sel && (!u.selected || (ctx.taskId && String(u.selected)!==String(sel.id)))) UIState.set('acknowledgment',{selected:sel.id,md:ctx.taskId||ctx.referenceId?'detail':u.md});
   const missingCtx=(ctx.taskId||ctx.referenceId) && !findAcknowledgementTask(s,ctx.taskId||ctx.referenceId);
  el.innerHTML = `<div class="workspace">${head('Acknowledgment Queue', 'Confirm receipt of the tasks routed to you, and keep the record of who confirmed what.')}
    
    ${missingCtx&&s.runtime?.loading?`<section class="panel" data-linked-loading><div class="notify-banner show" role="status"><b>Loading the task this link points to…</b><p>The records are on their way from the server; this screen shows ${esc(ctx.taskId||ctx.referenceId)} as soon as they arrive.</p></div></section>`:''}
    ${missingCtx&&!s.runtime?.loading?`<section class="panel"><div class="notify-banner error show"><b>The task this link points to has not loaded</b><p>The link names ${esc(ctx.taskId||ctx.referenceId)}, but that task is not among the records loaded on this device. Load the latest records, or find it in Lookup &amp; Direct Action.</p></div></section>`:''}
    <div class="split" ${mdSwitch(sel?UIState.get('acknowledgment').md:'list')}><div class="panel">${tasks.length ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table"><thead><tr><th>Task</th><th class="col-narrow">Ageing</th><th class="col-narrow">Status</th></tr></thead><tbody>${taskRows(tasks,sel)}</tbody></table></div>` : '<div class="empty dgo-empty"><h2 class="dgo-empty__title">No tasks to acknowledge</h2><p>A task appears here once it has been assigned to you. Nothing has been loaded from the server in this session.</p><p><button type="button" class="btn" data-refresh-data>Load latest records</button></p></div>'}</div>
    <div class="detail-col panel-stack">${sel ? detail(sel) : '<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No task selected</h2><p>Choose a task from the queue to read it and confirm receipt.</p></div></section>'}</div></div></div>`;
  bind(el, sel);
}
function bind(el, sel){
  el.querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => { UIState.set('acknowledgment', { selected: tr.dataset.id, md: 'detail' }); render(el); resetDetailScroll(el); });
  el.querySelector('[data-md-back]')?.addEventListener('click', () => { UIState.set('acknowledgment', { md: 'list' }); render(el); });
  const ackBtn = el.querySelector('[data-ack]'); if (ackBtn) ackBtn.onclick = async () => {
    const actorForm=readActorForm(el); const preview=await buildPreview(sel, actorForm); const validation=validateAcknowledgementPayload(preview); if(validation.length) return toast(validation.join('; '),'error');
    if (!await confirmAction({ title: 'Confirm receipt of this task', body: `<p><b>${esc(sel.title)}</b></p><p>${esc(sel.referenceId || sel.id)}</p><p>This records that you have received the task. A notice goes to the assigned officer, copied to Registry.</p>${actionPreview(preview)}`, confirmText:'Acknowledge receipt', cancelText:'Cancel' })) return;
    ackBtn.disabled=true;
    try{ const result=await executeOwnedAction('acknowledgment', 'acknowledge', () => submitAcknowledgement(sel,{source:'acknowledgment', form:actorForm}), { ref: sel.referenceId || sel.id, meta:{deeplink:!!State.get().deepLinkContext?.taskId} }); toast(result.status==='queued'?'Acknowledgment recorded on this device — it will reach the server when the connection returns':'Acknowledgment recorded and sent to the server', result.status==='queued'?'error':'success'); render(el); }
    // No toast here. This catch used to repeat the raw `e.message` the governance layer had
    // already put on screen — two toasts, both written for a developer. The governance layer
    // names the action and what it means for the record; there is nothing truer to add about
    // an acknowledgment that failed, so it speaks alone and this only restores the screen.
    catch{ render(el); }
    finally{ ackBtn.disabled=false; }
  };
  /* RN-012: the reminder is e-mailed to the assignee (core/staff-notice-service.js). The toast says what happened:
     sent, queued for retry, or not sent because the assignee has no address. */
  el.querySelector('[data-remind]')?.addEventListener('click', async () => { const who=sel.assignedTo||sel.AssignedTo||'the assignee'; if (!await confirmAction({ title: 'Remind the assignee to acknowledge', body: `<p><b>${esc(sel.title)}</b></p><p>This e-mails ${esc(who)} a reminder to confirm receipt of the task.</p>${holdNote()}` })) return; let r; try { r=await executeOwnedAction('acknowledgment','remind-assignee',()=>sendStaffNotice(StaffNotices.ackReminder(sel)),{ref:sel.referenceId||sel.id}); } catch { return render(el); } toast(r.message, r.sent?'success':'error'); render(el); });
  el.querySelector('[data-track]')?.addEventListener('click',()=>{ State.patch({selectedId:sel.id}); location.hash='#/response-tracking'; });
  el.querySelector('[data-respond]')?.addEventListener('click',()=>{ State.patch({selectedId:sel.id,deepLinkContext:{...(State.get().deepLinkContext||{}),taskId:sel.id,mode:'respond'}}); location.hash='#/orchestrator'; });
  el.querySelector('[data-reassign]')?.addEventListener('click',()=>{ State.patch({selectedId:sel.id,deepLinkContext:{...(State.get().deepLinkContext||{}),taskId:sel.id,mode:'reassign'}}); location.hash='#/single-assignment'; });
  el.querySelector('[data-attachments]')?.addEventListener('click',()=>{ const links=[...(Array.isArray(sel.attachments)?sel.attachments:[]), sel.attachmentLink||sel.AttachmentLink].filter(Boolean); if(!links.length) return toast('This task has no attachments','error'); window.open(typeof links[0]==='string'?links[0]:(links[0].AbsoluteUri||links[0].absoluteUri||links[0].url||''),'_blank','noopener,noreferrer'); });
}
function detail(t) {
  const age = ageDays(t); const receipts=ReceiptLedger.byRef(t.referenceId||t.id).concat(ReceiptLedger.byRef(t.id)).slice(0,8);
  /* Essentials plan UX-109: the engineering panel that named the linked task is gone, so the task says it itself. An
     acknowledgement e-mail's link (item=…) has to land visibly on its task. */
  const ctx=State.get().deepLinkContext||{}, linkRef=ctx.taskId||ctx.referenceId||'', linked=linkRef?selectTaskForAcknowledgement(State.get(),linkRef):null;
  const fromLink=!!linked&&String(linked.id)===String(t.id);
  return `${mdBack('Back to queue')}<section class="panel"><div class="eyebrow panel-eyebrow">Who may acknowledge</div><p class="meta">Only the assigned officer may confirm receipt. Assigned to: <b>${esc(t.assignedTo||t.AssignedTo||'—')}</b></p></section><section class="panel"><div class="eyebrow panel-eyebrow">Acknowledgment Notice</div>${fromLink?`<p class="meta" data-linked-task>Opened from your link · item ${esc(linkRef)}</p>`:''}<div class="meta">${esc(t.referenceId || t.id)} · ${badge(t.acknowledged ? 'Acknowledged' : 'Pending', t.acknowledged ? 'ok' : '')}${age != null ? ' · ' + badge('Waiting ' + age + 'd', !t.acknowledged && age >= 2 ? 'danger' : '') : ''}</div><h2>${esc(t.title)}</h2><p class="meta">Assigned to: ${esc(t.assignedTo||'Unassigned')} · Acknowledgement due: ${esc(t.ack||'—')}</p><p>You are being asked to confirm receipt of: ${esc(t.title)}</p></section>
    ${actorFormHtml()}<section class="panel"><div class="eyebrow panel-eyebrow">Receipt Actions</div><div class="form-row">${t.acknowledged ? '<span class="pill ok">Receipt confirmed</span>' : '<button class="btn" data-ack>Acknowledge Receipt</button><button class="btn ghost" data-remind>Send reminder</button>'}<button class="btn ghost" data-track>Track History</button><button class="btn ghost" data-respond>Respond</button><button class="btn ghost" data-reassign>Reassign or Forward</button><button class="btn ghost" data-attachments>Attachments</button></div></section>
    <section class="panel"><div class="eyebrow panel-eyebrow">Receipt Ledger</div>${receipts.length?receipts.map(r=>`<div class="action-row"><span><b>${esc(r.status)}</b><small>${esc(r.createdAt||r.at||'')} · ${esc(r.receiptId)}</small></span>${badge(r.source||'ack')}</div>`).join(''):'<p class="meta">No receipts for this task yet.</p>'}</section>`;
}
