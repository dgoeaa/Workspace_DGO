import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, fmtDateTime, emptyFor, loadFlags } from '../core/ui.js';
import { requestSync } from '../core/data-loader.js';
import { send as sendStaffNotice, StaffNotices, holdNotice } from '../core/staff-notice-service.js';
import { Payloads, attempt, isServerKey } from '../core/server-writes.js';
function scopeRef(s) {
  const a = s.activities.find(x => x.id === s.selectedId) || s.tracking.find(x => x.id === s.selectedId);
  return a ? (a.referenceId || a.id) : null;
}
export async function mount(el){hydrateGovernance();render(el); }
function render(el) {
  const s = State.get(); const ref = scopeRef(s);
  const items = ref ? s.comments.filter(c => c.referenceId === ref) : s.comments;
  /* I-13 — "No comments yet." read the same whether nobody had commented, the thread was
     narrowed to one reference that happens to have none, or nothing had loaded at all. The
     scope is this screen's only filter, so it is the filtered arm; loadFlags() supplies the
     other two from lastLoad.ok, the flag core/data-loader.js writes on a failed load. */
  const thread = items.length
    ? items.map(c => `<div class="msg ${c.author === s.profile.email ? 'mine' : ''}"><span class="who">${esc(c.author)} · ${esc(fmtDateTime(c.ts))} ${c.referenceId ? '· ' + esc(c.referenceId) : ''}${c.deviceOnly ? ' · <b>on this device only</b>' : ''}</span>${esc(c.body)}</div>`).join('')
    : emptyFor({ filtered: !!ref, ...loadFlags(s.runtime), noun: 'comments', createLabel: 'Write the first comment', createAttr: 'data-write-comment', clearAttr: 'data-clear-scope' });
  el.innerHTML = `<div class="workspace">${head('Comments', ref ? `Only the comments recorded against ${ref}.` : 'Every comment recorded against a record, newest first.')}
    <div class="toolbar"><span class="meta">${ref ? `Reference ${esc(ref)} · ${items.length} comment(s)` : `${items.length} comment(s)`}</span>
      <div>${ref ? '<button class="btn ghost" data-clear-scope>Show comments on every record</button>' : ''}<button class="btn ghost" data-refresh>Refresh</button></div></div>
    <div class="panel"><div class="thread">${thread}</div>
    <form class="grid" id="comment-form">${ref ? '' : '<label class="wide">Reference ID (optional)<input name="referenceId" placeholder="e.g. REF-001"></label>'}
      <label class="wide">Comment<textarea name="body" rows="3" required></textarea></label>
      <div class="wide"><button class="btn">Post Comment</button></div></form></div></div>`;
  el.querySelectorAll('[data-clear-scope]').forEach(b => b.onclick = () => { State.patch({ selectedId: null }); render(el); });
  /* The create arm has nowhere else to go — the form is already on the page — so it puts the
     cursor in it rather than rendering a button that only scrolls. */
  el.querySelectorAll('[data-write-comment]').forEach(b => b.onclick = () => el.querySelector('#comment-form [name="body"]')?.focus());
  el.querySelectorAll('[data-refresh]').forEach(b => b.onclick = () => render(el));
  el.querySelectorAll('[data-retry-load]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await requestSync({ source: 'comments', mode: 'refresh' }); toast('Comments reloaded from the server', 'success'); }
    catch { toast('The server could not be reached — nothing was reloaded', 'error'); }
    finally { b.disabled = false; }
    render(el);
  });
  el.querySelector('#comment-form').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    const referenceId = ref || d.referenceId || '';
    /* RN-020: the officer working the record is e-mailed the comment (core/staff-notice-service.js), unless they wrote it. */
    const task = referenceId ? [...s.tracking, ...s.activities].find(x => (x.referenceId || x.id) === referenceId && (x.assignedTo || x.AssignedTo)) : null;
    /* F-17: a comment used to be kept on this device and wiped at the next refresh. It is now a minute on the record's task
       (upsert-record MIN, Task_Comments), which FETCH_ALL returns to everyone. A reference with no task on the server has
       nowhere to hold one; such a comment is kept on this device and says so. */
    const serverTask = referenceId ? s.tracking.find(x => (x.referenceId || x.id) === referenceId && isServerKey(x.entityKey)) : null;
    const assignee = String(task?.assignedTo || task?.AssignedTo || '').trim();
    const notify = task && assignee.toLowerCase() !== String(s.profile.email || '').toLowerCase();
    if (!await confirmAction({
      title: 'Post this comment',
      body: `<p>${esc(d.body)}</p><p class="meta">${serverTask ? `It is recorded on the server against ${esc(referenceId)}, and anyone who opens that record will see it, under your name.` : referenceId ? `${esc(referenceId)} has no task on the server, so the comment is kept on this device only.` : 'It is not attached to any record, so it is kept on this device only.'}</p>${notify ? `<p class="meta">It is also e-mailed to ${esc(assignee)}, who is working this record.${holdNotice() ? ' ' + esc(holdNotice()) : ''}</p>` : ''}`,
      confirmText: 'Post comment', cancelText: 'Cancel',
    })) return;
    let r = null;
    try {
      r = await executeOwnedAction('comments', 'add-comment', async () => {
        let id = crypto.randomUUID();
        if (serverTask) { const w = await attempt(Payloads.minute(serverTask, { text: d.body }), { module: 'comments', ref: referenceId }); if (!w.ok) return { refused: w.message }; id = w.data?.entityKey || id; }
        const st = State.get();
        State.patch({ comments: [...(st.comments || []), { id, referenceId, body: d.body, author: st.profile.email, ts: new Date().toISOString(), type: 'comment', deviceOnly: !serverTask }] }, { module: 'comments', action: 'comment:add', ref: referenceId });
        return notify ? sendStaffNotice(StaffNotices.comment(task, d.body)) : null;
      }, { ref: referenceId });
    } catch { return render(el); }
    if (r?.refused) { toast(r.refused, 'error'); return render(el); }
    toast(r ? `Comment posted. ${r.message}` : 'Comment posted', r && !r.sent ? 'error' : 'success'); render(el);
  };
}
