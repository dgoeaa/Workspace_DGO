import { State } from './state.js';
import { AuditLog } from './audit-log.js';
const clone=v=>structuredClone(v); const uid=()=>crypto.randomUUID?.() || Math.random().toString(36).slice(2);
export const PendingQueue=Object.freeze({enqueue,list,retry,clear,remove,stats,replayKey});
/* The queue holds the newest CAP writes. One pushed out by a newer one is recorded in the audit trail (F-22), so a held
   write is never lost without a trace. */
export const CAP=250;
export function enqueue(item){ const s=State.get(); const row={id:item.id||uid(),at:new Date().toISOString(),retryCount:item.retryCount||0,retryable:item.retryable!==false,status:'pending',...item}; const all=[row,...(s.pending||[])]; for(const dropped of all.slice(CAP)) AuditLog.record({event:'audit:pending-write-dropped',actor:s.profile||{},ref:dropped.ref||'',meta:{key:dropped.key,operation:dropped.operation||'',queuedAt:dropped.at,reason:`the queue holds ${CAP} writes`}}); State.patch({pending:all.slice(0,CAP)},{module:'pending-queue',action:'enqueue',ref:item.ref||''}); AuditLog.record({event:'audit:pending-write-queued',actor:s.profile||{},ref:item.ref||'',meta:{key:item.key,error:item.error}}); return clone(row); }
export function list(filter={}){ return clone((State.get().pending||[]).filter(x=>Object.entries(filter).every(([k,v])=>!v||x[k]===v))); }
export function remove(id){ const s=State.get(); State.patch({pending:(s.pending||[]).filter(x=>x.id!==id)},{module:'pending-queue',action:'remove'}); }
export function clear(){ State.patch({pending:[]},{module:'pending-queue',action:'clear'}); }
/* A queued write older than REPLAY_LIMIT_MS is not sent again (B3): the flows only recognise a repeat
   within 7 days, so an older replay could act twice. It is marked for review instead. */
export const REPLAY_LIMIT_MS=7*24*60*60*1000;
export async function retry(id,runner){ const s=State.get(); const item=(s.pending||[]).find(x=>x.id===id); if(!item) throw new Error('Pending item not found'); if(Date.now()-Date.parse(item.at||0)>REPLAY_LIMIT_MS){ State.patch({pending:(s.pending||[]).map(x=>x.id===id?{...x,status:'review',retryable:false}:x)},{module:'pending-queue',action:'expired'}); throw new Error('This change is more than 7 days old, so it was not sent again. Check whether it is still needed, then make it again.'); } try{ const res=await runner(item); remove(id); AuditLog.record({event:'audit:pending-write-retried',actor:s.profile||{},ref:item.ref||'',meta:{id,key:item.key}}); return res; }catch(e){ const pending=(State.get().pending||[]).map(x=>x.id===id?{...x,retryCount:(x.retryCount||0)+1,lastError:e.message,lastRetryAt:new Date().toISOString()}:x); State.patch({pending},{module:'pending-queue',action:'retry-failed'}); throw e; } }
/** The idempotency key a replay of this item must send: the one stored with it, or, for an item
 *  queued without one, a key pinned to the time it was queued, so it never changes between replays. */
export async function replayKey(item,actor={}){ if(item.idempotencyKey) return item.idempotencyKey; if(item.payload?.idempotencyKey) return item.payload.idempotencyKey; const { Idempotency }=await import('./idempotency.js'); return Idempotency.key({operation:item.operation||item.key,ref:item.ref||'',actor,payload:item.payload||{},at:item.at}); }
export function stats(){ const p=State.get().pending||[]; return Object.freeze({count:p.length,retryable:p.filter(x=>x.retryable!==false).length,failed:p.filter(x=>x.status==='failed').length,oldest:p[p.length-1]?.at||''}); }
