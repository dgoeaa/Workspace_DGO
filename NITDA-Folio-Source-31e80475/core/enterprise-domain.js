import { normalizePriority } from '../config/priority.config.js';
const now=()=>new Date().toISOString();
const uid=p=>`${p}-${crypto.randomUUID()}`;
const val=(...x)=>x.find(v=>v!==undefined&&v!==null&&v!=='')??'';
export const CorrespondenceStates=Object.freeze(['Received','Logged','Reviewed','Classified','Assigned','In Treatment','Completed','Closed','Archived','On Hold','Rejected','Duplicate']);
export const OperationStates=Object.freeze(['Not Started','In Progress','Awaiting Response','Pending Approval','Escalated','Blocked','Completed','Closed']);
export const RegistryStates=Object.freeze(['Unregistered','Registered','In Registry','Routed','Received','Awaiting Collection','Dispatched','Closed','Archived']);
export function enrichCorrespondence(a,old={},decision=null){return{...old,entityKey:a.entityKey||old.entityKey||'',id:String(a.id),sourceId:a.sourceId,referenceId:a.referenceId||old.referenceId||'',subject:a.title,sender:old.sender||'',senderEmail:old.senderEmail||'',receivedAt:a.created,correspondenceType:old.correspondenceType||'Incoming',channel:old.channel||'Document',category:a.category||old.category||'',subcategory:old.subcategory||'',assignedTo:a.assignedTo||old.assignedTo||'',assignedDsu:old.assignedDsu||'',status:correspondenceStatus(a,old,decision),decision:decision?.status||'',decidedBy:decision?.surface||old.decidedBy||'',priority:normalizePriority(old.priority),confidentiality:old.confidentiality||'Official',attachmentLink:a.attachmentLink||'',description:a.description||'',duplicateOf:old.duplicateOf||'',holdReason:old.holdReason||'',closedAt:old.closedAt||'',createdAt:old.createdAt||a.created,updatedAt:now()}}
export function enrichOperation(t,old={}){return{...old,id:String(t.id),sourceId:t.sourceId,referenceId:t.referenceId||'',title:t.title,description:t.description||'',owner:t.assignedTo||'',dsu:t.assignedToDsu||'',supportingDsu:t.supportingDsu||'',status:mapTaskStatus(t.status),priority:normalizePriority(t.priority),startDate:t.startDate||t.created,dueDate:t.due||'',progress:mapTaskStatus(t.status)==='Completed'?100:Number(t.progressPercent??old.progress??parseProgress(t.progress)),blockedReason:t.blockedReason||old.blockedReason||'',dependencies:t.dependencies||old.dependencies||[],milestones:old.milestones||[],escalationLevel:Number(t.escalationLevel??old.escalationLevel??0),createdAt:old.createdAt||t.created,updatedAt:now()}}
function mapTaskStatus(s){const x=String(s||'').toLowerCase();if(x.includes('complete'))return'Completed';if(x.includes('closed'))return'Closed';if(x.includes('block'))return'Blocked';if(x.includes('escalat'))return'Escalated';if(x.includes('progress')||x.includes('acknowledg'))return'In Progress';if(x.includes('await'))return'Awaiting Response';return'Not Started'}
/* F-2 (module rationalisation): the stored copy used to keep its own status once it had one (`old.status` won), so a
   document marked Treated elsewhere still read Received in Intake, and a completed task still read In Progress in
   Activities. The server's record now decides: a decision recorded on the server (an APR record naming the document)
   first, then the document's Treated state. A finer status set on this device is kept only while it agrees with that
   state, and a record that exists only on this device keeps what was set here. */
const OPEN_STATES=new Set(['','Received','Logged','Pending']);
const DECISION_STATES=Object.freeze({accepted:'Accepted',approved:'Accepted',declined:'Declined',rejected:'Declined',delegated:'Delegated',archived:'Archived'});
function correspondenceStatus(a,old,decision){
  if(decision&&DECISION_STATES[decision.status])return DECISION_STATES[decision.status];
  const onServer=/^\d+$/.test(String(a.sourceId??''));
  if(!onServer)return old.status||'Received';
  const treated=['Treated','Processed'].includes(a.status);
  if(treated)return OPEN_STATES.has(old.status||'')?'In Treatment':old.status;
  return OPEN_STATES.has(old.status||'')?(old.status||'Received'):'Received';
}
/** The decisions recorded on the server for documents: the newest APR record naming each one (core/server-payloads.js documentKey). */
export function decisionsByDocument(approvals=[]){const m=new Map();for(const r of approvals){const k=String(r?.parentKey||'');if(!/^(OPS|OPS-ID|REC):/.test(k))continue;const prev=m.get(k);if(!prev||String(r.ts||r.updatedAt||'')>=String(prev.ts||prev.updatedAt||''))m.set(k,{status:String(r.status||'').toLowerCase(),surface:/^DG\/CEO/.test(r.title||'')?'DG/CEO hub':/^Intake/.test(r.title||'')?'Intake':'',ts:r.ts||r.updatedAt||''});}return m}
const docKey=(a)=>a?.recordType==='REC'&&/^[0-9a-f-]{36}$/i.test(String(a?.entityKey||''))?`REC:${String(a.entityKey).toLowerCase()}`:/^[0-9a-f-]{36}$/i.test(String(a?.entityKey||''))?`OPS:${String(a.entityKey).toLowerCase()}`:/^\d+$/.test(String(a?.sourceId??''))?`OPS-ID:${a.sourceId}`:'';
function parseProgress(x){const n=parseInt(x,10);return Number.isFinite(n)?Math.min(100,Math.max(0,n)):0}
export function registryNumber(sourceId,date=new Date()){const y=new Date(date).getFullYear()||new Date().getFullYear();return `DGO/${y}/${String(sourceId||Date.now()).padStart(6,'0')}`}
/* Records logged in Folio itself (Intake's Log New Memo, Scan Intake) are written to the Intake Register by the
   `register` operation, which FETCH_ALL returns as `register` beside the portal's submissions. They are Intake's records
   too, so they join its list; portal submissions keep their own tab. */
function intakeRegisterRecords(state,corrMap,decisions,taken){return (state.portalRegister||[]).filter(r=>r&&r.channel&&r.channel!=='portal'&&!taken.has(String(r.referenceId||r.id))).map(r=>{const old=corrMap.get(String(r.referenceId||r.id))||{};const d=decisions.get(docKey({recordType:'REC',entityKey:r.entityKey}));const st=d&&DECISION_STATES[d.status]?DECISION_STATES[d.status]:(old.status||'Received');return{...old,id:String(r.referenceId||r.id),referenceId:r.referenceId||'',entityKey:r.entityKey||'',recordType:'REC',subject:r.subject||old.subject||'',senderEmail:r.senderEmail||old.senderEmail||'',sender:old.sender||r.senderEmail||'',channel:old.channel||(r.channel==='scan'?'Scan':r.channel==='email'?'Email':'Document'),receivedAt:r.submittedAtUtc||old.receivedAt||'',correspondenceType:'Incoming',category:old.category||'Official Correspondence',priority:normalizePriority(old.priority),status:st,decision:d?.status||'',decidedBy:d?.surface||old.decidedBy||'',createdAt:old.createdAt||r.submittedAtUtc||'',updatedAt:now()}});}
export function reconcileEnterprise(state){const corrMap=new Map((state.correspondence||[]).map(x=>[String(x.id),x])),opsMap=new Map((state.operations||[]).map(x=>[String(x.id),x])),decisions=decisionsByDocument(state.approvals);const fetchedIds=new Set((state.activities||[]).map(a=>String(a.id)));const correspondence=[...(state.activities||[]).map(a=>enrichCorrespondence(a,corrMap.get(String(a.id)),decisions.get(docKey(a))||null)),...intakeRegisterRecords(state,corrMap,decisions,fetchedIds),...(state.correspondence||[]).filter(c=>c&&!fetchedIds.has(String(c.id))&&c.deviceOnly)];const operations=(state.tracking||[]).map(t=>enrichOperation(t,opsMap.get(String(t.id))));return{correspondence,operations}}
export function createMovement(file,{from,to,action='FOR_ACTION',priority='MEDIUM',minute='',by='',status='Routed'}){return{id:uid('MOV'),registryFileId:file.id,registryNumber:file.registryNumber,referenceId:file.referenceId,from:from||file.currentHolder||'Central Registry',to,action,priority,minute,status,releasedAt:now(),receivedAt:'',receivedBy:'',createdBy:by,createdAt:now()}}
export function createRegistryFile(corr,by){return{id:uid('REG'),correspondenceId:corr.id,referenceId:corr.referenceId||'',registryNumber:registryNumber(corr.sourceId||corr.id,corr.receivedAt),subject:corr.subject,sender:corr.sender,status:'Registered',currentHolder:'Central Registry',currentDsu:'Registry',registeredAt:now(),registeredBy:by,closedAt:'',archivedAt:'',retentionClass:'Official correspondence',securityClass:corr.confidentiality||'Official'}}
export function audit(action,entityType,entityId,details={},actor=''){return{id:uid('AUD'),at:now(),action,entityType,entityId,actor,details}}

// ---------------------------------------------------------------------------
// Canonical shared transitions (R11.6.3 consolidation). Every surface that
// acknowledges, updates, dispositions or creates work calls these, so the two
// historical acknowledgment data models stay in lockstep and audit vocabulary,
// priority scale and record shapes are identical regardless of entry module.
const TERMINAL_TASK=['Completed','Closed','Cancelled'];
export function acknowledgeTask(state,taskId,actorEmail,{surface='acknowledgment'}={}){
  const t=(state.tracking||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return null;
  const at=now();
  const tracking=state.tracking.map(x=>String(x.id)===String(taskId)?{...x,acknowledged:true,ackedAt:at,acknowledgedAt:at,status:TERMINAL_TASK.includes(x.status)?x.status:'Acknowledged'}:x);
  return { task:t, patch:{ tracking, audit:[audit('Task Acknowledged','task',String(taskId),{referenceId:t.referenceId||'',surface},actorEmail),...(state.audit||[])] } };
}
export function updateTaskState(state,taskId,changes,actorEmail,{surface='orchestrator'}={}){
  const t=(state.tracking||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return null;
  const next={...t,...changes,...(changes.priority!==undefined?{priority:normalizePriority(changes.priority)}:{}),updatedAt:now()};
  const tracking=state.tracking.map(x=>String(x.id)===String(taskId)?next:x);
  return { task:next, before:t, patch:{ tracking, audit:[audit('Task Updated','task',String(taskId),{referenceId:t.referenceId||'',surface,from:t.status,to:next.status},actorEmail),...(state.audit||[])] } };
}
export function setCorrespondenceStatus(state,id,status,actorEmail,{surface='correspondence',extra={}}={}){
  const r=(state.correspondence||[]).find(x=>String(x.id)===String(id)||String(x.referenceId)===String(id));
  if(!r) return null;
  const next={...r,...extra,status,updatedAt:now()};
  const correspondence=state.correspondence.map(x=>x===r?next:x);
  return { record:next, before:r, patch:{ correspondence, audit:[audit('Correspondence Status Set','correspondence',String(r.id),{from:r.status,to:status,surface},actorEmail),...(state.audit||[])] } };
}
export function createTask(state,fields,actorEmail,{surface='single-assignment'}={}){
  const task={ id:crypto.randomUUID(), title:fields.title||'Untitled task', status:fields.status||'In progress',
    referenceId:fields.referenceId||'', assignedTo:fields.assignedTo||'', assignedToDsu:fields.assignedToDsu||fields.dsu||'',
    supportingDsu:fields.supportingDsu||'', priority:normalizePriority(fields.priority), ack:fields.ack||'', due:fields.due||'',
    description:fields.description||'', sourceEmailId:fields.sourceEmailId||'', created:now() };
  return { task, patch:{ tracking:[task,...(state.tracking||[])], audit:[audit('Task Created','task',task.id,{referenceId:task.referenceId,assignedTo:task.assignedTo,surface},actorEmail),...(state.audit||[])] } };
}
