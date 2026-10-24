import { Entities } from './entity-store.js';
import { AuditLog } from './audit-log.js';
import { Idempotency } from './idempotency.js';
import { invokeObsidianAction } from './security-actions.js';
import { createValidationError, createError, ErrorClass } from './errors.js';
export const DispatchService=Object.freeze({prepareDispatch,dispatchOutbound,markDispatchFailed,markNoDispatch,getReceipt,canDispatch});
/* An UNKNOWN reference is not a dispatchable one — the same defect `Entities.canClose`
   was hardened against, in the same shape, one phase earlier. The test below is "is there
   an unapproved approval in the way?", and an empty bundle passes it vacuously: measured,
   `canDispatch('REF-DOES-NOT-EXIST')` returned true, `prepareDispatch` then minted a
   dispatch record for it, and `dispatchOutbound` would have called DISPATCH_OUTBOUND and
   written an `audit:dispatch-receipt-captured` for a reference the register never held.
   Official correspondence sent on behalf of a file that does not exist is the phase-5
   equivalent of fabricated closure evidence, and reads as proof for the same reason. */
export function canDispatch(ref){ if(Entities.canClose(ref).unknownReference) return false; const b=Entities.byReference(ref,{profile:{persona:'admin'}}); const approvals=b.approval||[]; return approvals.length===0 || approvals.some(a=>['approved','approved_with_edit'].includes(a.__status)); }
export function prepareDispatch({ref,actor,channel='email',recipients=[],approvedResponse={},attachments=[]}){ if(Entities.canClose(ref).unknownReference) throw createValidationError('The register does not hold this reference.',{ref}); if(!canDispatch(ref)) throw createValidationError('Dispatch requires an approved response.',{ref}); return Entities.createDispatch({__ref:ref,actor,channel,recipients,approvedResponse,attachments,__status:'dispatch_pending'}); }
export async function dispatchOutbound({ref,actor,channel='email',recipients=[],approvedResponse={},attachments=[],meta={}}){ if(!recipients.length) throw createValidationError('Dispatch requires at least one recipient.',{ref}); const payload={channel,recipients,approvedResponse,attachments}; const idempotencyKey=await Idempotency.key({operation:'DISPATCH_OUTBOUND',ref,actor,payload,windowSeconds:600}); const dispatch=prepareDispatch({ref,actor,...payload}); try{ await Entities.transitionStatus(ref,'dispatch_pending','dispatch_in_flight',actor,{dispatchId:dispatch.__id,idempotencyKey}); }catch{} AuditLog.record({ref,actor,event:'audit:dispatch-started',phase:5,meta:{idempotencyKey,channel,recipientsCount:recipients.length}}); const res=await invokeObsidianAction('DISPATCH_OUTBOUND',{ref,actor,...payload,idempotencyKey,meta}); if(res?.ok===false) return markDispatchFailed(ref,actor,res); try{ await Entities.transitionStatus(ref,'dispatch_in_flight','dispatched',actor,{receipt:res.receipt||res}); }catch{} AuditLog.record({ref,actor,event:'audit:dispatch-receipt-captured',phase:5,meta:{receipt:res.receipt||res}}); return res; }
export function markDispatchFailed(ref,actor,error={}){ AuditLog.record({ref,actor,event:'audit:dispatch-failed',phase:5,meta:error}); throw createError(ErrorClass.DISPATCH_FAILED,error.message||'Dispatch failed.',error); }
export async function markNoDispatch(ref,actor,reason){ if(!reason) throw createValidationError('No-dispatch reason is required.',{ref}); if(Entities.canClose(ref).unknownReference) throw createValidationError('The register does not hold this reference.',{ref}); try{ await Entities.transitionStatus(ref,'dispatch_pending','no_dispatch',actor,{reason}); await Entities.transitionStatus(ref,'no_dispatch','closure_check',actor,{reason}); }catch{} return Entities.byReference(ref,{actor}); }
export function getReceipt(ref){ const b=Entities.byReference(ref,{profile:{persona:'admin'}}); return (b.dispatch||[]).map(d=>d.receipt).filter(Boolean); }
