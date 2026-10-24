import { hydrateGovernance, actor, executeOwnedAction } from '../core/governed-actions.js';
import { head, kpis, esc, badge, toast, emptyFor, loadFlags, confirmAction, actionPreview,refCode} from '../core/ui.js';
import { UIState } from '../core/ui-state.js';
import { Entities } from '../core/entity-store.js';
import { ArchiveService } from '../core/archive.js';
import { State } from '../core/state.js';
import { filterItemsBySource, sourceFilterChips, sourceBadge } from '../core/source-views.js';
export async function mount(el){hydrateGovernance();render(el);}
function currentActor(){ return State.get().profile || actor(); }
function rows(){ const s=Entities.snapshot(); return (s.byRef||[]).map(([ref,b])=>({ref,open:Entities.canClose(ref),archived:!!Entities.getArchive(ref)})); }
/* I-21 — the tile band holds counts only. Whether a reference can be closed is a state, not a
   measure, so it stays in the table's own column where it can carry a pill and a reason.
   I-13 — "No references in this queue." stated a fact and stopped: the queue selector and the
   source chips are both filters, so an operator could not tell a filtered-out list from a
   platform that had closed everything, or from one that had never reached the registry.
   I-07 — "Immutable reference bundles, audit threads, retention evidence and reopen controls"
   and "Archive owns immutable closure evidence" describe the module to itself. I-02 — the
   screen that finds records is called "Lookup & Direct Action" in the sidebar, not "Lookup". */
function render(el){
  const stats=Entities.stats();
  const u=UIState.get('archive',{queue:'All',source:'all'});
  const allRows=rows();
  const sourceRows=filterItemsBySource(allRows,u.source||'all');
  const list=sourceRows.filter(r=>u.queue==='All'||(u.queue==='Ready'&&r.open.ok&&!r.archived)||(u.queue==='Blocked'&&!r.open.ok&&!r.archived)||(u.queue==='Archived'&&r.archived));
  const filtered=(u.queue&&u.queue!=='All')||(u.source&&u.source!=='all');
  const readyToClose=sourceRows.filter(r=>r.open.ok&&!r.archived).length;
  const table=list.length
    ? `<div class="tablewrap dgo-table-wrap"><table class="dgo-table"><thead><tr><th>Reference</th><th>Ready to close</th><th>Archived</th><th>Actions</th></tr></thead><tbody>${list.map(r=>`<tr><td>${sourceBadge(r)} ${refCode(r.ref)}</td><td>${badge(r.open.ok?'Ready':'Blocked',r.open.ok?'ok':'warn')}</td><td>${badge(r.archived?'Archived':'Active',r.archived?'ok':'')}</td><td><button class="btn ghost compact" data-ref="${esc(r.ref)}">Inspect</button></td></tr>`).join('')}</tbody></table></div>`
    : emptyFor({filtered,...loadFlags(State.get().runtime),noun:'references',clearAttr:'data-clear-filters'});
  el.innerHTML=`<div class="workspace">${head('Archive Evidence','Close a reference for good and keep the evidence of how it was closed.')}${kpis([['Archived',stats.archives],['References',sourceRows.length],['Quarantine',stats.quarantine],['Ready to close',readyToClose]])}${sourceFilterChips(u.source||'all','data-source-view',allRows)}<div class="toolbar"><span class="meta">Closing a reference here is final: its records and their history are kept as evidence and can no longer be edited. To find a record, use Lookup &amp; Direct Action.</span><select data-queue aria-label="Show references by closure readiness">${['All','Ready','Blocked','Archived'].map(x=>`<option ${x===u.queue?'selected':''}>${x}</option>`).join('')}</select><button class="btn ghost" data-refresh>Refresh</button></div><div class="split"><section class="panel"><div class="eyebrow panel-eyebrow">Archive a reference</div><form id="archive-form" class="grid"><label>Reference<input name="ref" required placeholder="REF-..." /></label><label class="wide">Why it is being closed<textarea name="summary" rows="3">Closed and ready for archive.</textarea></label><div class="wide"><button class="btn" data-archive>Archive this reference</button></div></form></section><section class="panel detail-col"><div class="eyebrow panel-eyebrow">References and whether they can be closed</div>${table}</section></div></div>`;
  el.querySelectorAll('[data-source-view]').forEach(b=>b.onclick=()=>{UIState.set('archive',{source:b.dataset.sourceView});render(el);});
  el.querySelector('[data-queue]').onchange=e=>{UIState.set('archive',{queue:e.target.value});render(el);};
  /* Archiving was the one consequential mutation on the platform with no confirmation step.
     "Inspect" fills the reference into this form, so closing a record for good was two clicks
     with nothing in between — and reopenArchive() does not undo it: it mints a *new* derived
     reference and leaves the original archived permanently. The dialog names the record, says
     the closure is permanent, and says plainly what reopening does and does not do. */
  el.querySelector('#archive-form').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
    if(!await confirmAction({title:'Close this reference for good',body:`<p><b>${esc(d.ref)}</b></p><p>Archiving is permanent. Once closed, this reference and its records are kept as evidence and can no longer be edited.</p><p>Reopening later does not restore this reference — it creates a new one derived from it. This one stays archived.</p>${actionPreview({reference:d.ref,closureReason:d.summary},{payload:false})}`})) return;
    /* `notify:false` — this screen can say more than the governance layer can. The closure
       gate refuses for two different reasons and the operator's next move differs completely:
       a reference the register does not hold is a typing mistake, while a reference with open
       work is a queue to go and clear. ArchiveService throws a typed closure error carrying
       that reason, so name it, and name the reference. The raw text stays in the audit trail. */
    try{await executeOwnedAction('archive','archive-reference',()=>ArchiveService.archiveReference(d.ref,currentActor(),{closureSummary:d.summary}),{ref:d.ref,notify:false});toast(`${d.ref} is closed and its evidence is kept`,'success');render(el);}
    catch(err){toast(err?.details?.reason==='UNKNOWN_REFERENCE'
      ? `${d.ref} is not in the register, so there is nothing to close. Check the reference and try again.`
      : `${d.ref} cannot be closed yet — work on it is still open. The checks above show what is outstanding. Nothing was changed.`,'error');}};
  el.querySelector('[data-refresh]').onclick=()=>render(el);
  /* The arms of the I-13 contract, wired: clear the filters back to every reference, or ask
     the registry again. Without these the buttons emptyFor() renders would be decoration. */
  el.querySelectorAll('[data-clear-filters]').forEach(b=>b.onclick=()=>{UIState.set('archive',{queue:'All',source:'all'});render(el);});
  el.querySelectorAll('[data-retry-load]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {requestSync}=await import('../core/data-loader.js');await requestSync({source:'archive',mode:'refresh'});toast('References reloaded from the registry','success');}catch{toast('The registry could not be reached — nothing was reloaded','error');}finally{b.disabled=false;}render(el);});
  el.querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>{const f=el.querySelector('#archive-form');f.ref.value=b.dataset.ref;f.ref.focus();});
}
export async function archiveReference(ref, closureSummary='Closed and ready for archive'){ return ArchiveService.archiveReference(ref,currentActor(),{closureSummary}); }
