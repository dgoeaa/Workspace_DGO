import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { head, esc, toast, confirmAction, fmtDateTime, emptyFor, loadFlags } from '../core/ui.js';
import { requestSync } from '../core/data-loader.js';
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
    ? items.map(c => `<div class="msg ${c.author === s.profile.email ? 'mine' : ''}"><span class="who">${esc(c.author)} · ${esc(fmtDateTime(c.ts))} ${c.referenceId ? '· ' + esc(c.referenceId) : ''}</span>${esc(c.body)}</div>`).join('')
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
    try { await requestSync({ source: 'comments', mode: 'refresh' }); toast('Comments reloaded from the registry', 'success'); }
    catch { toast('The registry could not be reached — nothing was reloaded', 'error'); }
    finally { b.disabled = false; }
    render(el);
  });
  el.querySelector('#comment-form').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    const referenceId = ref || d.referenceId || '';
    if (!await confirmAction({
      title: 'Post this comment',
      body: `<p>${esc(d.body)}</p><p class="meta">${referenceId ? `It is attached to ${esc(referenceId)} and anyone who opens that record will see it, under your name.` : 'It is not attached to any record, and will appear in the general thread under your name.'}</p>`,
      confirmText: 'Post comment', cancelText: 'Cancel',
    })) return;
    await executeOwnedAction('comments', 'add-comment', () => State.patch({ comments: [...s.comments, { id: crypto.randomUUID(), referenceId, body: d.body, author: s.profile.email, ts: new Date().toISOString(), type: 'comment' }] }, { module: 'comments', action: 'comment:add', ref: referenceId }), { ref: referenceId });
    toast('Comment posted', 'success'); render(el);
  };
}
