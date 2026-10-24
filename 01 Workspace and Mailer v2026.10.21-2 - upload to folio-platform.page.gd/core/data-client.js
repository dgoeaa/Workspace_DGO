import { State } from './state.js';
import { EndpointContracts } from '../config/endpoints.config.js';
import { EndpointRegistry } from './endpoint-registry.js';
import { fetchPolicyFor } from '../config/fetch-policy.config.js';
import { normalizeError } from './errors.js';
import { LoadingState } from './loading-state.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { PendingQueue } from './pending-queue.js';
import { confirmFlowExecution } from './flow-confirmation.js';
import { authHeaders, clientMayAssertIdentity, ensureAuthenticated } from './auth.js';
import { AuthConfig } from '../config/auth.config.js';
export const DataClient=Object.freeze({request,resolveUrl});
/** A 4xx other than 408 or 429: the flow answered and refused. */
export const refusal=e=>{const st=Number(e?.status||0);return st>=400&&st<500&&st!==408&&st!==429;};
/**
 * Resolve the runtime target for a contract key.
 *
 * Every request is sent directly to the configured Power Automate flow endpoint from
 * config/endpoints.config.js / runtime window.DGO_CONFIG.endpoints. No external proxy
 * is required or consulted. When authentication is enabled the bearer token is attached
 * via authHeaders(); the flow endpoint itself must enforce required authorization.
 */
export function resolveUrl(key){
  const st=State.get();
  return EndpointRegistry.url(key,{overrides:st.settings?.endpoints||{}});
}
export async function request(key,payload={},options={}){ const contract=EndpointContracts[key]; if(!contract) throw new Error('Unknown endpoint '+key); /* Enforced posture: no governed request leaves unauthenticated. No-op while inert. */ const establishesIdentity=AuthConfig.identityEndpoints.includes(key); if(!establishesIdentity) await ensureAuthenticated(`endpoint:${key}`); const url=resolveUrl(key); if(!url) throw new Error('Endpoint '+key+' is not configured'); const policy={...fetchPolicyFor(key),...options}; if(!(await confirmFlowExecution({key,contract,payload,options}))) throw new Error('Endpoint execution cancelled by user'); const id=crypto.randomUUID(); const started=Date.now(); LoadingState.start(contract.write?'action':'data',key,{source:'network'}); return PerformanceMonitor.measure('fetch',key,async()=>{ let attempt=0,lastError; while(attempt<=policy.retry){ const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),policy.timeoutMs||contract.timeoutMs||45000); try{ /* Identity. While auth is inert the client asserts `userEmail` from local state, exactly
   as before. Once auth is enforced that field is DROPPED entirely and identity travels
   only in the bearer token, so a tampered local profile cannot influence the backend. */
const asserted=clientMayAssertIdentity()?{userEmail:State.get().profile?.email||''}:{};
const body=options.flatPayload?{action:contract.action,...payload,...asserted,correlationId:id}:{action:contract.action,payload,...asserted,requestId:id,timestamp:new Date().toISOString()}; const r=await fetch(url,{method:contract.method,headers:{'Content-Type':'application/json','X-Correlation-Id':id,...(establishesIdentity?{}:await authHeaders())},body:JSON.stringify(body),signal:ctl.signal}); const raw=await r.text(); let data; try{data=raw?JSON.parse(raw):{}}catch{throw new Error('Invalid JSON response from '+key)} if(!r.ok) throw Object.assign(new Error(data?.status?.message||data?.data?.message||data?.message||('HTTP '+r.status)),{status:r.status,code:data?.data?.code||data?.code||''}); LoadingState.success(contract.write?'action':'data',key,{source:'network'}); return {ok:true,key,data,requestId:id,durationMs:Date.now()-started,attempts:attempt+1}; } catch(e){ lastError=e; attempt++; /* F-22: a 4xx is the flow refusing the request. Sending it again cannot succeed, so it is not retried
   and not queued: the caller shows the refusal. Only a lost connection, a timeout, 408, 429 or a 5xx can succeed later. */ const refused=refusal(e); if(refused) Object.assign(e,{refused:true}); if(attempt>policy.retry||refused){ const norm=normalizeError(e,{key,requestId:id}); LoadingState.error(contract.write?'action':'data',key,e,{retryable:!!contract.write}); if(contract.write&&!refused){ PendingQueue.enqueue({key,url,payload,ref:String(payload?.ref||payload?.referenceId||''),error:norm.message,requestId:id,operation:contract.action,retryable:true}); } throw Object.assign(e,{normalized:norm}); } } finally{clearTimeout(timer);} } throw lastError; },{write:!!contract.write}); }
