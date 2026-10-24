import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { status, makeRef } from '../core/domain.js';
import { updateTaskState, createTask } from '../core/enterprise-domain.js';
import { priorityOptions, priorityLabel } from '../config/priority.config.js';
import { sourceFilterChips } from '../core/source-views.js';
import { buildEmailTaskPayload, validateEmailTaskPayload, assignmentPreviewHtml } from '../core/assignment-payload.js';
import { debouncedInput } from '../core/ui-interactions.js';
import { head, esc, chips, badge, toast, confirmAction, mdBack, mdSwitch, resetDetailScroll,fmtDate,fmtDateTime, actionPreview, emptyFor, loadFlags, refCode} from '../core/ui.js';
import { WriteManager } from '../core/write-manager.js';
import { PendingQueue } from '../core/pending-queue.js';
import { DocumentFlags, flagSpec, flagLabel, flagsOf, hasFlag, applyFlag, flagPayload } from '../core/document-flags.js';
import { UIState } from '../core/ui-state.js';
import { AssignmentCascade } from '../core/assignment-cascade.js';
const U=()=>UIState.get('lookup',{q:'',scope:'all',selType:'',selId:'',md:'list'});
let q='', scope='all', selected={type:'',id:''}, mdView='list';
function syncLocal(){const u=U();q=u.q;scope=u.scope;selected={type:u.selType,id:u.selId};mdView=u.md;}
const SCOPES=[{value:'all',label:'All'},{value:'activities',label:'Activities'},{value:'tasks',label:'Tasks'},{value:'emails',label:'Emails'},{value:'comments',label:'Comments'},{value:'approvals',label:'Approvals'}];
const vec=v=>String(v||'').toLowerCase();
const hit=(...xs)=>!q||xs.some(x=>vec(x).includes(vec(q)));
function groups(s){const out={};if(scope==='all'||scope==='activities'){const rows=s.activities.filter(a=>hit(a.title,a.referenceId,status(a),a.category,a.assignedTo));if(rows.length)out.activities=rows}if(scope==='all'||scope==='tasks'){const rows=s.tracking.filter(t=>hit(t.title,t.referenceId,t.assignedTo,t.status,t.priority));if(rows.length)out.tasks=rows}if(scope==='all'||scope==='emails'){const rows=(s.emails||[]).filter(e=>hit(e.subject,e.bodyPreview,e.fromAddress,e.from));if(rows.length)out.emails=rows}if(scope==='all'||scope==='comments'){const rows=s.comments.filter(c=>hit(c.body,c.author,c.referenceId));if(rows.length)out.comments=rows}if(scope==='all'||scope==='approvals'){const rows=s.approvals.filter(a=>hit(a.title,a.ref,a.status));if(rows.length)out.approvals=rows}return out;}
function findItem(s){if(!selected.id)return null;return (selected.type==='activities'?s.activities:selected.type==='tasks'?s.tracking:selected.type==='emails'?(s.emails||[]):selected.type==='comments'?s.comments:s.approvals).find(x=>String(x.id)===String(selected.id));}
function item(type,r){const id=esc(r.id);if(type==='activities')return `<div class="list-item" data-type="activities" data-id="${id}"><h4>${esc(r.title)}</h4><div class="meta">${esc(r.referenceId||'—')} · ${esc(status(r))} · ${esc(r.category||'Unclassified')}</div></div>`;if(type==='tasks')return `<div class="list-item" data-type="tasks" data-id="${id}"><h4>${esc(r.title)}</h4><div class="meta">${esc(r.referenceId||'—')} · ${esc(r.assignedTo||'—')} · ${esc(r.status||'Pending')}</div></div>`;if(type==='emails')return `<div class="list-item" data-type="emails" data-id="${id}"><h4>${esc(r.subject||'No subject')}</h4><div class="meta">${esc(r.fromAddress||r.from||'—')} · ${esc(fmtDateTime(r.receivedDateTime||r.received||''))}</div></div>`;if(type==='comments')return `<div class="list-item" data-type="comments" data-id="${id}"><h4>${esc((r.body||'').slice(0,80))}</h4><div class="meta">${esc(r.author)} · ${esc(r.referenceId||'—')}</div></div>`;return `<div class="list-item" data-type="approvals" data-id="${id}"><h4>${esc(r.title)}</h4><div class="meta">${esc(r.ref||'—')} · ${esc(r.status)}</div></div>`;}

function emailCascadeFields(s, email){ const draft=AssignmentCascade.cascade({activity:{category:email.category||'General Administration'},state:s}); const cats=AssignmentCascade.categories(s), subs=AssignmentCascade.subcategories(draft.category,s), deps=AssignmentCascade.departments(s); return `<label>Category<select name="category"><option value="">Select category</option>${cats.map(c=>`<option value="${esc(c.category)}" ${c.category===draft.category?'selected':''}>${esc(c.category)}</option>`).join('')}</select></label><label>Subcategory<select name="subcategory"><option value="">Select subcategory</option>${subs.map(x=>`<option value="${esc(x.subcategory)}" ${x.subcategory===draft.subcategory?'selected':''}>${esc(x.subcategory)}</option>`).join('')}</select></label><label>Primary DSU<select name="dsu"><option value="">Select DSU</option>${deps.map(d=>`<option value="${esc(d.dsuKey)}" ${d.dsuKey===draft.dsu?'selected':''}>${esc(d.title||d.dsuKey)}</option>`).join('')}</select></label><label>Support DSU<select name="supportDsu"><option value="">Select support DSU</option>${deps.map(d=>`<option value="${esc(d.dsuKey)}" ${d.dsuKey===draft.supportDsu?'selected':''}>${esc(d.title||d.dsuKey)}</option>`).join('')}</select></label><label>Start date<input name="startDate" type="date" value="${esc(draft.startDate||'')}"></label><label>Ack due<input name="ack" type="date" value="${esc(draft.ack||'')}"></label><label>Due date<input name="due" type="date" value="${esc(draft.due||'')}"></label><label>Priority<select name="priority">${priorityOptions(draft.priority||email.importance||'normal')}</select></label><input type="hidden" name="categoryCode" value="${esc(draft.categoryCode||'')}"><input type="hidden" name="subcategoryCode" value="${esc(draft.subcategoryCode||'')}"><input type="hidden" name="supportingAssignee" value="${esc(draft.supportingAssignee||'')}"><input type="hidden" name="cascadeSnapshot" value="">`; }

function detail(s){const r=findItem(s);if(!r)return `<section class="panel"><div class="empty dgo-empty"><h2 class="dgo-empty__title">No record open</h2><p>Choose a result on the left to read it and act on it here. Nothing is open, so there is nothing to show.</p><p><button type="button" class="btn" data-focus-q>Search for a record</button></p></div></section>`;if(selected.type==='activities')return `${mdBack('Back to results')}<section class="panel"><div class="eyebrow panel-eyebrow">Document Details</div><h2>${esc(r.title)}</h2><div class="status-strip">${badge(status(r))} ${badge(r.assignmentStatus||'Assignment pending')}</div><dl class="detail-grid"><dt>ID</dt><dd>${esc(r.id)}</dd><dt>Reference</dt><dd>${refCode(r.referenceId)}</dd><dt>Category</dt><dd>${esc(r.category||'—')}</dd><dt>Assigned To</dt><dd>${esc(r.assignedTo||'—')}</dd><dt>Created</dt><dd>${esc(fmtDateTime(r.created||''))}</dd></dl>${flagChips(r)}</section><section class="panel"><div class="eyebrow panel-eyebrow">Direct Actions</div><div class="form-row"><button class="btn" data-assign>Assign</button>${flagButtons(r)}</div></section>`;if(selected.type==='tasks')return `${mdBack('Back to results')}<section class="panel"><div class="eyebrow panel-eyebrow">Task Details</div><h2>${esc(r.title)}</h2><div class="status-strip">${badge(r.status||'Pending')} ${badge(r.priority||'normal')}</div><dl class="detail-grid"><dt>ID</dt><dd>${esc(r.id)}</dd><dt>Reference</dt><dd>${refCode(r.referenceId)}</dd><dt>Owner</dt><dd>${esc(r.assignedTo||'—')}</dd><dt>Due</dt><dd>${esc(fmtDate(r.due||'—'))}</dd></dl></section><section class="panel"><div class="eyebrow panel-eyebrow">Update this task</div><p class="meta">Saved here and kept with the task’s history in My Work. You stay on this screen.</p><form class="grid" data-update-task><label>Progress<select name="status"><option>Not started</option><option>In progress</option><option>Completed</option><option>Deferred</option></select></label><label>Priority<select name="priority">${priorityOptions(r.priority)}</select></label><label class="wide">Comments<textarea name="comments" rows="3"></textarea></label><div class="wide"><button class="btn">Save this update</button></div></form></section>`;if(selected.type==='emails')return `${mdBack('Back to results')}<section class="panel"><div class="eyebrow panel-eyebrow">Email Details</div><h2>${esc(r.subject||'No subject')}</h2><dl class="detail-grid"><dt>From</dt><dd>${esc(r.fromAddress||r.from||'—')}</dd><dt>Received</dt><dd>${esc(fmtDateTime(r.receivedDateTime||r.received||''))}</dd><dt>Attachments</dt><dd>${r.hasAttachments?'Yes':'No'}</dd></dl><form class="grid" data-email-task-form><label class="wide">Task title<input name="title" value="${esc(r.subject||'Email task')}" required></label><label>Assigned to<input name="assignedTo" type="email" value="${esc(State.get().profile.email||'')}" required></label>${emailCascadeFields(State.get(), r)}<label class="wide">CC recipients<input name="copy" placeholder="email1; email2"></label><label class="wide">Instruction<textarea name="comments" rows="3">${esc(r.bodyPreview||'')}</textarea></label><div class="wide form-row"><button class="btn">Create the task</button></div></form></section><section class="panel"><div class="eyebrow panel-eyebrow">Message Body</div><div class="email-frame"><iframe sandbox="" srcdoc="${esc(r.bodyContent||r.body||r.bodyPreview||'')}"></iframe></div></section>`;return `${mdBack('Back to results')}<section class="panel"><h2>${esc(r.title||r.body||'Item')}</h2>${actionPreview(r)}</section>`;}
export async function mount(el){hydrateGovernance();render(el);}

/* I-13 — the audit names this screen as a bare-fact offender, and it had two of them.
   "Start typing or choose Direct Lookup for an endpoint-backed search." was a hint written in
   the platform's vocabulary, and "No local results for …" stated a fact and stopped: it never
   said whether the search had found nothing, or whether nothing had loaded for it to search.
   Nothing-searched-yet is its own state and is written out here; once there is a query the
   three arms come from emptyFor(), with loadFlags() supplying the failed/loaded distinction
   from lastLoad.ok — the flag core/data-loader.js actually writes. */
const NOTHING_SEARCHED = `<div class="empty dgo-empty"><h2 class="dgo-empty__title">Nothing searched yet</h2><p>Type a number, reference, title or email subject in the box above and matches appear as you type. Nothing has been searched, so nothing is missing.</p><p><button type="button" class="btn" data-focus-q>Start a search</button></p></div>`;
function results(s,g,total){
  if(!q) return NOTHING_SEARCHED;
  if(total) return Object.entries(g).map(([type,rows])=>`<div class="result-group"><div class="eyebrow">${esc(type.toUpperCase())} (${rows.length})</div><div class="list-col">${rows.slice(0,80).map(r=>item(type,r)).join('')}</div></div>`).join('');
  const scopeLabel=(SCOPES.find(x=>x.value===scope)||SCOPES[0]).label;
  return `${emptyFor({filtered:true,...loadFlags(s.runtime),noun:'records',clearAttr:'data-clear-filters'})}<p class="meta">Searched for “${esc(q)}” in ${esc(scopeLabel)} among the records already open on this device. Direct Lookup asks the registry for a record this screen has not loaded.</p>`;
}
function render(el){syncLocal();const s=State.get(),g=groups(s),total=Object.values(g).reduce((n,r)=>n+r.length,0);el.innerHTML=`<div class="workspace">${head('Lookup & Direct Action','Find one document, task or email by its number, and act on it without leaving the screen.')}
<section class="panel lookup-direct"><div class="toolbar"><input data-q placeholder="Enter ID, reference, title or email subject" value="${esc(q)}"><select data-scope-select>${SCOPES.map(x=>`<option value="${x.value}">${x.label}</option>`).join('')}</select><button class="btn" data-direct>Direct Lookup</button><button class="btn ghost" data-back>Reset</button></div>${chips(SCOPES,scope,'data-scope')}</section>
<div class="split" ${mdSwitch(selected.id?mdView:'list')}><section class="panel"><div class="eyebrow">Results (${total})</div>${results(s,g,total)}</section><div class="detail-col panel-stack">${detail(s)}</div></div></div>`;
el.querySelector('[data-scope-select]').value=scope;debouncedInput(el.querySelector('[data-q]'),v=>{UIState.set('lookup',{q:v});render(el)},{delay:120,refind:()=>el.querySelector('[data-q]')});el.querySelector('[data-scope-select]').onchange=e=>{UIState.set('lookup',{scope:e.target.value});render(el)};el.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{UIState.set('lookup',{scope:b.dataset.scope});render(el)});el.querySelector('[data-back]').onclick=()=>{UIState.set('lookup',{q:'',selType:'',selId:'',md:'list'});render(el)};
/* The three arms of the I-13 contract, wired. Without these the buttons emptyFor() and the
   nothing-searched block render would be decoration. */
el.querySelectorAll('[data-focus-q]').forEach(b=>b.onclick=()=>el.querySelector('[data-q]')?.focus());
el.querySelectorAll('[data-clear-filters]').forEach(b=>b.onclick=()=>{UIState.set('lookup',{q:'',scope:'all',selType:'',selId:'',md:'list'});render(el)});
el.querySelectorAll('[data-retry-load]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {requestSync}=await import('../core/data-loader.js');await requestSync({source:'lookup',mode:'refresh'});toast('Records reloaded from the registry','success')}catch{toast('The registry could not be reached — nothing was reloaded','error')}finally{b.disabled=false}render(el)});
el.querySelector('[data-direct]').onclick=async()=>directLookup(el);el.querySelectorAll('[data-type][data-id]').forEach(c=>c.onclick=()=>{UIState.set('lookup',{selType:c.dataset.type,selId:c.dataset.id,md:'detail'});render(el);resetDetailScroll(el)});el.querySelector('[data-md-back]')?.addEventListener('click',()=>{UIState.set('lookup',{md:'list'});render(el)});el.querySelector('[data-assign]')?.addEventListener('click',()=>{State.patch({selectedId:selected.id});location.hash='#/single-assignment'});el.querySelectorAll('[data-flag]').forEach(b=>b.onclick=()=>flagActivity(b.dataset.flag,el));el.querySelector('[data-update-task]')?.addEventListener('submit',e=>updateTask(e,el));el.querySelector('[data-email-task-form]')?.addEventListener('submit',e=>createTaskFromEmail(e,el));}
/* I-07 — "Confirm direct lookup … Run lookup" named the act, not the outcome, and the toasts
   below reported on an endpoint. What the operator needs to know at this dialog is that the
   search leaves this device, reads only, and changes nothing. */
async function directLookup(el){if(!q)return toast('Enter a number, reference or title first','error');const qtype=scope==='tasks'?'FETCH_ACTIVITIES':scope==='emails'?'SUBSIDIARY_ACTIONS':'GET_DOCS';const scopeLabel=(SCOPES.find(x=>x.value===scope)||SCOPES[0]).label;if(!await confirmAction({title:'Ask the registry for this record',body:`<p>Search the registry for <b>${esc(q)}</b> in ${esc(scopeLabel)}.</p><p class="meta">This looks beyond the records already open on this device. It only reads — no record is changed, and nothing is assigned.</p>${actionPreview({'Searching for':q,'Looking in':scopeLabel},{payload:false})}`,confirmText:'Search the registry',cancelText:'Cancel'}))return;try{const {requestSync}=await import('../core/data-loader.js');await requestSync({source:'lookup',mode:'endpoint',endpoint:qtype,payload:{operation:'read',mode:'single',query:q,scope}});toast('The registry has been asked for this record — it joins the results when it comes back','success')}catch{toast('The registry could not be reached, so only the records already on this device were searched','error')}}
/* The controls show state. An officer needs to see what a document is already marked with
   before deciding, and needs a way back off the list — the previous version rendered four
   identical ghost buttons whatever the record carried, so "is this already on the DG's
   list?" was unanswerable from the screen that offers to put it there. */
function flagButtons(r){
  return DocumentFlags.map(f=>{
    const on=hasFlag(r,f.code);
    return `<button class="btn ${on?(f.tone||''):'ghost'}" data-flag="${esc(f.code)}"
      aria-pressed="${on}" title="${esc(on?`Lift ${f.label}`:f.description)}">${on?'⚑ ':''}${esc(f.label)}</button>`;
  }).join('');
}

function flagChips(r){
  const flags=flagsOf(r);
  if(!flags.length) return '';
  return `<div class="chips">${flags.map(f=>`<span class="chip">⚑ ${esc(flagLabel(f.flag))}${f.at?' · '+esc(fmtDate(f.at)):''}${f.by?' · '+esc(f.by):''}</span>`).join('')}</div>`;
}

/* Flagging is OWNED by `activities`; `lookup` is a registered allowed invoker of it
   (config/action-ownership.config.js). So this writes the flag here rather than sending the
   officer elsewhere — the previous implementation confirmed the act, navigated to
   `#/activities`, and left them in a workspace with no flag control, which reads as success
   and is not.

   The write is local-first and the backend call is optional (`DYNAMIC_ACTIONS.optional` in
   the ownership entry): a flag is a marker, and losing the mark because a flow was briefly
   unreachable would be worse than recording it and syncing late. A failed call queues. */
async function flagActivity(flag,el){
  syncLocal();
  const s=State.get(), a=s.activities.find(x=>String(x.id)===String(selected.id));
  if(!a) return;
  const spec=flagSpec(flag);
  if(!spec) return toast(`Unknown flag: ${flag}`,'error');

  const on=hasFlag(a,spec.code), remove=on;
  const actor=s.profile?.email||'';
  const result=applyFlag(a,spec.code,{actor,remove});
  if(!result.changed) return toast(`Already marked ${spec.label}`,'success');

  const payload=flagPayload(a,spec.code,{actor,remove});
  if(!await confirmAction({
    title: remove?`Lift ${spec.label}`:`Mark ${spec.label}`,
    body:`<p>${esc(a.title)}</p><p>${esc(spec.description)}</p>${actionPreview(payload)}`,
    confirmText: remove?'Lift flag':'Apply flag'})) return;

  await executeOwnedAction('lookup','flag-document',async()=>{
    State.patch({activities:State.get().activities.map(x=>String(x.id)===String(a.id)?{...x,flags:result.flags}:x)});
    try{ await WriteManager.backend({module:'lookup',action:'flag-document',endpoint:'DYNAMIC_ACTIONS',payload,ref:a.referenceId||String(a.id)}); }
    catch(e){ PendingQueue.enqueue({key:'DYNAMIC_ACTIONS',payload,ref:a.referenceId||String(a.id),error:e.message,operation:'flag-document'}); toast('The mark is saved here — it goes to the registry when the connection is back','error'); }
  },{ref:a.referenceId||String(a.id)});

  toast(remove?`${spec.label} lifted`:`Marked ${spec.label}`,'success');
  if(el) render(el);
}
/* Both of these forms used to collect a full set of fields and then throw them away: they
   confirmed, navigated, and left the officer to type everything a second time on the screen
   they landed on. Nothing was ever saved. `lookup` is a registered allowed invoker of both
   `update-task` (owner `orchestrator`) and `create-task-from-email` (owner
   `single-assignment`) in config/action-ownership.config.js, so they commit here instead —
   the same shape as flagActivity() above, which writes in place and keeps the officer in
   Lookup. Ownership is unchanged: executeOwnedAction still records the owning module. */
async function updateTask(e,el){
  e.preventDefault();syncLocal();
  const s=State.get(),t=s.tracking.find(x=>String(x.id)===String(selected.id));
  if(!t)return;
  const d=Object.fromEntries(new FormData(e.target));
  // A blank comment box must not wipe an instruction the task already carries.
  const changes={status:d.status,priority:d.priority,...(String(d.comments||'').trim()?{description:d.comments}:{})};
  if(!await confirmAction({title:'Update this task',body:`<p><b>${esc(t.title)}</b></p><p>Saved against ${esc(t.referenceId||String(t.id))} now, from this screen. The change and your name are kept with the task's history in My Work.</p>${actionPreview({progress:d.status,priority:priorityLabel(d.priority),comments:d.comments},{payload:false})}`,confirmText:'Save the update',cancelText:'Cancel'}))return;
  const ref=t.referenceId||String(t.id);
  await executeOwnedAction('lookup','update-task',async()=>{
    const r=updateTaskState(State.get(),t.id,changes,s.profile?.email||'',{surface:'lookup'});
    if(!r)return;
    State.patch(r.patch,{module:'lookup',action:'task:update',ref});
    try{ await WriteManager.backend({module:'lookup',action:'update-task',endpoint:'DYNAMIC_ACTIONS',payload:{action:'update_task',id:t.id,...changes},ref}); }
    catch(err){ PendingQueue.enqueue({key:'DYNAMIC_ACTIONS',payload:{action:'update_task',id:t.id,...changes},ref,error:err.message,operation:'update-task'}); toast('The update is saved here — it goes to the registry when the connection is back','error'); }
  },{ref});
  toast(`Task updated — it is saved against ${ref}`,'success');
  if(el)render(el);
}
async function createTaskFromEmail(ev,el){
  ev?.preventDefault?.();syncLocal();
  const s=State.get(),e=(s.emails||[]).find(x=>String(x.id)===String(selected.id));
  if(!e)return;
  const form=Object.fromEntries(new FormData(ev.target));
  const referenceId=makeRef(e.id,form.categoryCode||'UNC',form.subcategoryCode||'GEN');
  const payload=buildEmailTaskPayload({email:e,form,actor:s.profile,referenceId});
  const errors=validateEmailTaskPayload(payload);
  if(errors.length)return toast(errors.join(' · '),'error');
  if(!await confirmAction({title:'Raise a task from this email',body:`<p><b>${esc(payload.title)}</b></p><p>A task is created now and ${esc(payload.assignedTo)} is notified. It is filed as ${esc(referenceId)} and appears in My Work.</p>${assignmentPreviewHtml(payload)}`,confirmText:'Create the task',cancelText:'Cancel'}))return;
  await executeOwnedAction('lookup','create-task-from-email',async()=>{
    const current=State.get();
    const r=createTask(current,{title:payload.title,referenceId,assignedTo:payload.assignedTo,assignedToDsu:payload.assignedToDsu,supportingDsu:payload.supportingDsu,priority:payload.priority,ack:payload.ack,due:payload.due,description:payload.instruction,sourceEmailId:payload.sourceEmailId},current.profile?.email||'',{surface:'lookup'});
    State.patch(r.patch,{module:'lookup',action:'task:create-from-email',ref:referenceId});
    try{ await WriteManager.backend({module:'lookup',action:'create-task-from-email',endpoint:'EMAIL_RELATED_TASK',payload,ref:referenceId}); }
    catch(err){ PendingQueue.enqueue({key:'EMAIL_RELATED_TASK',payload,ref:referenceId,error:err.message,operation:'create-task-from-email'}); toast('The task is saved here — it goes to the registry when the connection is back','error'); }
  },{ref:referenceId});
  toast(`Task ${referenceId} created and sent to ${payload.assignedTo}`,'success');
  if(el)render(el);
}
