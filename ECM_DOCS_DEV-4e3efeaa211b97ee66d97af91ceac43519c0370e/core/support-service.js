import { State } from './state.js';
import { WriteManager } from './write-manager.js';
import { ReceiptLedger } from './receipt-ledger.js';
import { SupportRoutingConfig } from '../config/support-routing.config.js';
import { DeepLinkConfig } from '../config/deeplink.config.js';
import { buildDeepLink } from './deeplink-parse.js';
import { render as renderFragment, emailFields } from './email-fragment-service.js';
function pendingStats(){ const p=State.get().pending||[]; return {count:p.length, ack:p.filter(x=>x.queueType==='acknowledgement').length}; }
export const SupportService=Object.freeze({buildContext, submit, supportEmail});
export function buildContext(extra={}){ const s=State.get(); return {route: location.hash.replace(/^#\/?/, '')||'home', selectedId:s.selectedId||'', profile:s.profile||{}, lastAction:s.runtime?.lastAction||'', lastError:s.runtime?.lastError||'', pendingStats:pendingStats(), receipts: (s.receipts||[]).slice(0,5), userAgent:navigator.userAgent, online:navigator.onLine, at:new Date().toISOString(), ...extra}; }
/* F5 of the e-mail template package (owner decision 2026-10-21): the request is the WS-Support-Request e-mail to the
   support mailbox, sent through EMAIL (IP_SEND_EMAIL) like the staff notices. It used to go to SUBSIDIARY_ACTIONS as
   CREATESUPPORTREQUEST, which no flow implements, so nothing reached the support team. */
export function supportEmail({category='clarification', message='', context={}}={}){
  const cat=SupportRoutingConfig.categories.find(c=>c.id===category)||{label:category,severity:'normal'};
  const ref=String(context.ref||context.taskId||context.selectedId||'').trim();
  const link=ref?buildDeepLink(DeepLinkConfig.productionBase,/^TASK-(\d+)$/i.test(ref)?{taskId:ref.replace(/^TASK-/i,'')}:{referenceId:ref}):DeepLinkConfig.productionBase;
  const receipts=(context.receipts||[]).map(r=>[r.type,r.ref,r.status].filter(Boolean).join(' ')).join('; ')||'None';
  const ctx={...context, message, categoryLabel:cat.label, priority:cat.severity, ref:context.ref||'None', taskId:context.taskId||'None', recordUrl:link,
    lastAction:context.lastAction||'None', lastError:context.lastError||'None', receipts, online:context.online===false?'Offline':'Online',
    profile:{...(context.profile||{}), name:context.profile?.name||context.profile?.email||'A Folio officer', persona:context.profile?.persona||'Not recorded'}};
  const r=renderFragment('WS-Support-Request', ctx, { multiline:['message'] });
  return {...emailFields(r), to:SupportRoutingConfig.supportEmail, replyTo:context.profile?.email||''};
}
export async function submit({category='clarification', message='', ref='', taskId=''}={}){ const context=buildContext({ref,taskId}); const email=supportEmail({category,message,context}); const payload={operation:'sendSupportRequest', category, message, context:{...context, receipts:undefined}, __confirmedByUI:true, email}; const res=await WriteManager.backend({module:'assistant',action:'support-request',endpoint:SupportRoutingConfig.endpointAlias,payload,ref:ref||taskId,message:'Support request sent to the support team'}); ReceiptLedger.record({type:'support',ref,taskId,status:'sent',sentAt:new Date().toISOString(),payload:{category,message,to:email.to},response:res}); return res; }
