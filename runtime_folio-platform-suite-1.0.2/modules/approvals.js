import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, badge, chips, mdBack, mdSwitch, resetDetailScroll,fmtDate,fmtDateTime} from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { send as sendStaffNotice, StaffNotices, holdNotice } from '../core/staff-notice-service.js';
import { Payloads, attempt, isServerKey } from '../core/server-writes.js';
/* F-17, F-18: a request and its decision were kept on this device, and the decision was e-mailed to the requester; the
   next refresh set the request back to pending. Both are now APR records on the server (upsert-record), written before
   anyone is e-mailed. A request made before this change has no server key; it is decided on this device and says so. */
const onServer = (a) => isServerKey(a?.entityKey);
const statusLabel = (v) => ({ pending: 'Pending', approved: 'Approved', rejected: 'Rejected', accepted: 'Accepted', declined: 'Declined', delegated: 'Delegated', archived: 'Archived' })[String(v || '').toLowerCase()] || String(v || 'Pending');
const statusToneOf = (v) => (/approved|accepted/.test(String(v)) ? 'ok' : /rejected|declined/.test(String(v)) ? 'danger' : '');
export async function mount(el){hydrateGovernance();render(el); }
function pending(s) { return s.approvals.filter(a => a["status"] === 'pending'); }
/* A decision on a document (Intake or the DG/CEO hub) is also an APR record; it shows here among the decided ones,
   named by its title ("DG/CEO decision: …"), so every decision is in one list (F-12). */
function decided(s) { return s.approvals.filter(a => a["status"] !== 'pending'); }
function render(el) {
  const s = State.get(); const u = UIState.get('approvals', { selected: null, creating: false, view: 'pending', md: 'list' });
  const list = u.view === 'pending' ? pending(s) : decided(s);
  const sel = list.find(a => a.id === u.selected) || null;
  el.innerHTML = `<div class="workspace">${head('Review & Approval', 'Approve or reject requests, each decision recorded with its minute.')}
    <div class="toolbar">${chips([{ value: 'pending', label: `Pending (${pending(s).length})` }, { value: 'decided', label: `Decided (${decided(s).length})` }], u.view, 'data-view')}<span class="meta flex-1">${list.length} shown</span><div><button class="btn" data-new>New Approval Request</button> <a class="btn ghost" href="#/executive">Open Decision Hub</a></div></div>
    <div class="split" ${mdSwitch((sel||u.creating)?u.md:'list')}><div class="list-col">${list.length ? list.map(a => `<div class="list-item ${sel && sel.id === a.id ? 'active' : ''}" data-ref="${esc(a.id)}">
      <div class="meta">${esc(a.ref || '—')} · ${badge(statusLabel(a.status), statusToneOf(a.status))}</div><h4>${esc(a.title)}</h4><div class="meta">From ${esc(a.from || '—')}</div></div>`).join('') :
      /* I-13 cites this screen as the pattern the rest should copy — a cause line and one
         action. It now also renders that action as a button rather than describing it. */
      `<div class="empty dgo-empty"><h2 class="dgo-empty__title">${u.view === 'pending' ? 'No pending approvals' : 'No decided approvals'}</h2><p>${u.view === 'pending' ? 'Nothing is waiting for a decision right now.' : 'Decisions will appear here with their recorded minutes.'}</p>${u.view === 'pending' ? '<p><button type="button" class="btn" data-new>New Approval Request</button></p>' : ''}</div>`}</div>
    <div class="detail-col panel-stack">${u.creating ? `${mdBack('Back to approvals')}<section class="panel">${createForm(s)}</section>` : (sel ? detail(sel) : '<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No request selected</h2><p>Choose a request from the list to read it and record a decision.</p></div></section>')}</div></div></div>`;
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { UIState.set('approvals', { view: b.dataset.view, selected: null, creating: false }); render(el); });
  el.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { UIState.set('approvals', { creating: true, selected: null, view: 'pending', md: 'detail' }); render(el); resetDetailScroll(el); });
  el.querySelector('[data-md-back]')?.addEventListener('click', () => { UIState.set('approvals', { md: 'list' }); render(el); });
  el.querySelectorAll('[data-ref]').forEach(c => c.onclick = () => { UIState.set('approvals', { selected: c.dataset.ref, creating: false, md: 'detail' }); render(el); resetDetailScroll(el); });
  const cancelBtn = el.querySelector('[data-cancel]'); if (cancelBtn) cancelBtn.onclick = () => { UIState.set('approvals', { creating: false }); render(el); };
  /* RN-017 and RN-018: the request is e-mailed to the approver it names, and the decision to the originator who
     raised it (core/staff-notice-service.js). The toast reports what happened to the e-mail: sent, queued for
     retry, or not sent for want of an address. */
  const form = el.querySelector('form.new-approval'); if (form) form.onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(form));
    const rec = { id: crypto.randomUUID(), ref: d.ref || ('APR-' + Date.now()), title: d.title, from: s.profile.name, fromEmail: s.profile.email || '', approverEmail: String(d.approver || '').trim(), summary: d.summary, ts: new Date().toISOString(), status: 'pending' };
    const record = async () => { const w = await attempt(Payloads.record('APR', { title: rec.title, decision: 'Pending', ref: rec.ref }), { module: 'approvals', ref: rec.ref }); if (!w.ok) return w; rec.id = w.data.entityKey; rec.entityKey = w.data.entityKey; State.patch({ approvals: [rec, ...(State.get().approvals || [])] }, { module: 'approvals', action: 'approval:create', ref: rec.ref }); return w; };
    let r; try { r = await executeOwnedAction('approvals', 'create-approval', async () => { const w = await record(); return w.ok ? sendStaffNotice(StaffNotices.approvalRequest(rec)) : { refused: w.message }; }, { ref: rec.ref }); } catch { return render(el); }
    if (r?.refused) { toast(r.refused, 'error'); return render(el); }
    UIState.set('approvals', { creating: false, selected: rec.id }); toast(`Approval request recorded on the server. ${r.message}`, r.sent ? 'success' : 'error'); render(el);
  };
  ['approve', 'reject'].forEach(kind => {
    const btn = el.querySelector(`[data-${kind}]`); if (!btn) return;
    btn.onclick = async () => {
      const comment = el.querySelector('#ap-comment')?.value || ''; const signed = !!el.querySelector('#ap-sign')?.checked;
      if (kind === 'reject' && !comment.trim()) { toast('A reason is required to reject', 'error'); return; }
      const hold = holdNotice();
      if (!await confirmAction({ title: kind === 'approve' ? 'Confirm approval' : 'Confirm rejection', body: `<p><b>${esc(sel.title)}</b></p><p>Minute: ${esc(comment || '—')}</p><p>Signed: ${signed ? 'Yes' : 'No'}</p><p>The decision is e-mailed to ${esc(sel.fromEmail || sel.from || 'the officer who raised it')}.</p>${hold ? `<p class="meta">${esc(hold)}</p>` : ''}` })) return;
      const decidedStatus = kind === 'approve' ? 'approved' : 'rejected';
      const record = async () => { if (onServer(sel)) { const w = await attempt(Payloads.record('APR', { entityKey: sel.entityKey, title: sel.title, decision: kind === 'approve' ? 'Approved' : 'Rejected' }), { module: 'approvals', ref: sel.ref || sel.id }); if (!w.ok) return w; } State.patch({ approvals: (State.get().approvals || []).map(a => a.id === sel.id ? { ...a, status: decidedStatus, minute: comment, signed, decidedBy: s.profile.email, decidedAt: new Date().toISOString(), deviceOnly: !onServer(sel) } : a) }, { module: 'approvals', action: kind === 'approve' ? 'approval:approve' : 'approval:reject', ref: sel.ref || sel.id }); return { ok: true }; };
      let r; try { r = await executeOwnedAction('approvals', kind === 'approve' ? 'approve' : 'reject', async () => { const w = await record(); return w.ok ? sendStaffNotice(StaffNotices.approvalDecision(sel, decidedStatus, comment)) : { refused: w.message }; }, { ref: sel.ref || sel.id }); } catch { return render(el); }
      if (r?.refused) { toast(r.refused, 'error'); return render(el); }
      const where = onServer(sel) ? 'recorded on the server' : 'recorded on this device only: this request never reached the server';
      UIState.set('approvals', { selected: null }); toast(`${kind === 'approve' ? 'Request approved' : 'Request rejected'}, ${where}. ${r.message}`, kind === 'approve' && r.sent ? 'success' : 'error'); render(el);
    };
  });
}
function detail(a) {
  const isPending = a.status === 'pending';
  return `${mdBack('Back to approvals')}<section class="panel"><div class="eyebrow panel-eyebrow">Approval Request</div><div class="meta">${esc(a.ref || '—')} · ${badge(statusLabel(a.status), statusToneOf(a.status))}</div><h2>${esc(a.title)}</h2>
    <p class="meta">Submitted by ${esc(a.from || '—')} · ${esc(fmtDate(a.ts))}${a.approverEmail ? ` · Approver: ${esc(a.approverEmail)}` : ''}</p>
    <p>${esc(a.summary || 'No summary provided.')}</p></section>
    ${isPending ? `<section class="panel"><div class="eyebrow panel-eyebrow">Decision</div><label class="wide">Minute<textarea id="ap-comment" rows="3" placeholder="Record a minute for this decision"></textarea></label>
    <label class="check-inline"><input type="checkbox" id="ap-sign"> Digitally sign this decision</label>
    <div class="form-row"><button class="btn" data-approve>Approve</button><button class="btn ghost" data-reject>Reject</button></div></section>`
    : `<section class="panel"><div class="eyebrow panel-eyebrow">Decision Record</div><dl class="detail-grid"><dt>Decision</dt><dd>${esc(a.status)}</dd><dt>Decided by</dt><dd>${esc(a.decidedBy || '—')}</dd><dt>Decided at</dt><dd>${esc(fmtDateTime(a.decidedAt || '') || '—')}</dd><dt>Signed</dt><dd>${a.signed ? 'Yes' : 'No'}</dd><dt>Minute</dt><dd>${esc(a.minute || '—')}</dd></dl></section>`}`;
}
function createForm(s) {
  const users = (s?.users || []).filter(u => u?.email);
  return `<form class="grid new-approval"><h2 class="grid-title">New Approval Request</h2>
    <label>Reference<input name="ref"></label><label>Title<input name="title" required></label>
    <label class="wide">Approver's e-mail<input name="approver" type="email" list="approver-emails" required placeholder="The officer who must decide this"></label><datalist id="approver-emails">${users.map(u => `<option value="${esc(u.email)}">${esc(u.fullName || u.name || u.email)}</option>`).join('')}</datalist>
    <label class="wide">Summary<textarea name="summary" rows="3"></textarea></label>
    <div class="wide"><button class="btn">Submit for Approval</button> <button type="button" class="btn ghost" data-cancel>Cancel</button></div></form>`;
}
