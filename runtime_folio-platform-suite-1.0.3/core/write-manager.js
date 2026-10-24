import { State } from './state.js';
import { DataClient } from './data-client.js';
import { PendingQueue } from './pending-queue.js';
import { Idempotency } from './idempotency.js';
import { auditAction } from './action-authority.js';
import { toast } from './ui.js';
const clone=v=>structuredClone(v);
export const WriteManager=Object.freeze({local,backend,optimistic,commit:(args)=>backend(args)});
export async function local({module,action,patch,ref='',message=''}){ State.patch(patch,{module,action,ref}); auditAction(module,action,{ref,meta:{local:true}}); if(message) toast?.(message,'success'); return {ok:true,source:'local',patch}; }
/* The idempotency key is computed once per user action and reused by every retry or queued replay
   of it (B3): a caller that already has one passes it in, and a payload that carries one keeps it.
   It goes to the flow twice: as idempotencyKey for the flows that read that field today, and as
   clientRequestHash, the field the identification kit checks. */
export async function backend({module,action,endpoint='DYNAMIC_ACTIONS',payload={},ref='',message='',idempotencyKey}){ const actor=State.get().profile||{}; const key=idempotencyKey||payload?.idempotencyKey||await Idempotency.key({operation:action,ref,actor,payload}); const res=await DataClient.request(endpoint,{operation:action,ref,...payload,idempotencyKey:key,clientRequestHash:key}); auditAction(module,action,{ref,meta:{backend:endpoint,idempotencyKey:key}}); if(message) toast?.(message,'success'); return res; }
export async function optimistic({module,action,patch,endpoint='DYNAMIC_ACTIONS',payload={},ref='',rollbackOnFailure=true,message=''}){ const before=clone(State.get()); State.patch(patch,{module,action,ref}); const idempotencyKey=payload?.idempotencyKey||await Idempotency.key({operation:action,ref,actor:State.get().profile||{},payload}); try{return await backend({module,action,endpoint,payload,ref,message,idempotencyKey});}catch(e){ if(rollbackOnFailure) State.patch(before,{module:'write-manager',action:'rollback',ref,silent:true}); else if(!e.refused) PendingQueue.enqueue({key:endpoint,payload,ref,error:e.message,operation:action,idempotencyKey}); throw e;} }

