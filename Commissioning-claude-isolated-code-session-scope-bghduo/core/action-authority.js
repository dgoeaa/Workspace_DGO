import { State } from './state.js';
import { AuditLog } from './audit-log.js';
import { toast } from './ui.js';
import { boundaryFor, ownsAction } from '../config/module-boundaries.config.js';
import { actionSpec } from '../config/action-ownership.config.js';
import { ensureCurrentUserActive, getCurrentUser } from './current-user.js';
import { ErrorClass } from './errors.js';
/* ─── Operator-facing failure copy ────────────────────────────────────────────────────────
 * This layer is the only place that reliably sees EVERY failed governed action, so it owns
 * the message an operator reads when one fails. It used to toast `error.message`, which is
 * written for whoever has to fix the platform, not for whoever pressed the button: an
 * unconfigured contract key surfaced as "AI_CHAT: Endpoint AI_CHAT is not configured" on a
 * registry officer's screen — the exact vocabulary audit finding I-07 bans, reintroduced by
 * the governance layer after every module's copy had been rewritten.
 *
 * core/errors.js offers ObsidianError, which carries a typed `errorClass` and `details` — but
 * NO user-safe message field; its `message` is developer text ("Closure gate failed.",
 * "Invalid lifecycle transition: x -> y"). So the class is used, the message never is: the
 * class selects a plain sentence about what the failure means for the record, and the action's
 * `label` from config/action-ownership.config.js names what was being attempted. An untyped
 * error simply gets the neutral consequence.
 *
 * The raw text is NOT lost. auditAction() below still records `error: error.message`
 * verbatim, and System Health, the Operator HUD and the pending-write queue still show it.
 * Only what reaches the toast changes. */
const FAILURE_OUTCOME = Object.freeze({
  [ErrorClass.VALIDATION_ERROR]: 'Some of what was entered was not accepted, so nothing was changed.',
  [ErrorClass.AUTH_ERROR]: 'Your sign-in does not carry the rights this needs, so nothing was changed.',
  [ErrorClass.SCOPE_ERROR]: 'This record is outside what you are allowed to act on, so nothing was changed.',
  [ErrorClass.DIRECTORATE_SCOPE_ERROR]: 'This record belongs to another directorate, so nothing was changed.',
  [ErrorClass.OTP_REQUIRED]: 'A one-time code is needed before this can go ahead, so nothing was changed.',
  [ErrorClass.OTP_VERIFICATION_FAILED]: 'The one-time code was not accepted, so nothing was changed.',
  [ErrorClass.IDEMPOTENCY_CONFLICT]: 'The same request is already going through, so it was not sent twice.',
  [ErrorClass.FLOW_UNAVAILABLE]: 'The registry could not be reached, so nothing was changed. Try again shortly.',
  [ErrorClass.FLOW_CONTRACT_ERROR]: 'The registry did not accept it, so nothing was changed.',
  [ErrorClass.DISPATCH_FAILED]: 'It has not gone out, and the record still shows it as waiting to be sent.',
  [ErrorClass.ARCHIVE_FAILED]: 'Nothing was filed away and the reference is still open.',
  [ErrorClass.CLOSURE_GATE_FAILED]: 'Work on this reference is still open, so it cannot be closed yet.',
  [ErrorClass.NO_ORPHAN_VIOLATION]: 'It would leave a record with nothing to belong to, so nothing was changed.',
  [ErrorClass.QUARANTINED_RECORD]: 'This record is held for review and cannot be changed at the moment.',
  [ErrorClass.UNKNOWN_ERROR]: 'Nothing was changed.',
});
const DEFAULT_OUTCOME='Nothing was changed.';
const DEFAULT_LABEL='complete that step';
/** The plain noun phrase for an action, for use inside a sentence. Never a raw action id. */
export function actionLabel(action){ return actionSpec(action)?.label || DEFAULT_LABEL; }
/** What the operator reads when a governed action fails. Never derived from error.message. */
export function actionFailureMessage(action, error){
  return `Could not ${actionLabel(action)}. ${FAILURE_OUTCOME[error?.errorClass] || DEFAULT_OUTCOME}`;
}
export function assertModuleAction(moduleName, action){
  const spec=actionSpec(action); const boundary=boundaryFor(moduleName);
  if(!boundary) throw new Error(`Unknown module boundary: ${moduleName}`);
  if(spec && spec.owner && spec.owner!==moduleName){
    const invokers=Array.isArray(spec.allowedInvokers)?spec.allowedInvokers:[];
    if(!invokers.includes(moduleName)) throw new Error(`Action ${action} is owned by ${spec.owner}, not ${moduleName}`);
  }
  if(!spec && !ownsAction(moduleName, action)) throw new Error(`Action ${action} is not registered for ${moduleName}`);
  return {spec,boundary};
}
export function auditAction(moduleName, action, meta={}){
  const actor=getCurrentUser(State.get()) || State.get().profile || {};
  const spec=actionSpec(action) || {};
  const event=meta.event || spec.audit || `audit:${moduleName}:${action}`;
  return AuditLog.record({ref:meta.ref||'', actor, event, entityType:meta.entityType||'', entityId:meta.entityId||'', meta:{module:moduleName, action, owner:spec.owner||moduleName, service:spec.service||'', backend:spec.backend||'', ...(meta.meta||{})}});
}
export async function executeOwnedAction(moduleName, action, runner, meta={}){
  ensureCurrentUserActive(`${moduleName}:${action}`);
  assertModuleAction(moduleName, action);
  auditAction(moduleName, action, {ref:meta.ref, meta:{stage:'started', ...(meta.meta||{})}});
  try { const result=await runner(); auditAction(moduleName, action, {ref:meta.ref, meta:{stage:'completed'}}); return result; }
  catch(error){
    // The audit trail keeps the raw technical detail verbatim — IT reads this, and System
    // Health, the Operator HUD and the pending-write queue surface it. The operator does not.
    auditAction(moduleName, action, {ref:meta.ref, meta:{stage:'failed', error:error.message}});
    /* One failure, one toast. This layer speaks by default because it is the only place that
       sees every failed governed action; a call site that can say something genuinely more
       useful — naming the reference, the recovery it just took, what is still outstanding —
       passes `notify:false` and takes responsibility for telling the operator itself. The
       opt-out is explicit at the call site rather than a time-window de-duplication in the
       toast helper: a window would hide two messages racing, not stop them being sent. */
    if(meta.notify!==false) toast?.(actionFailureMessage(action, error),'error');
    throw error; // The rethrow contract: callers still decide what to do about the failure.
  }
}
export function boundaryNotice(moduleName){ const b=boundaryFor(moduleName); if(!b) return ''; return `<section class="panel boundary-note"><div class="eyebrow">Module Authority</div><p><b>${b.role}</b></p><p class="meta">Owns: ${(b.owns||[]).join(', ')}</p><p class="meta">Does not own: ${(b.mustNotOwn||[]).join(', ')}</p></section>`; }
