import { State } from './state.js';
import { invoke } from './api.js';
import { FetchManager } from './fetch-manager.js';
import { LoadingState } from './loading-state.js';
import { assertEnvelope,collection,responseMeta } from './contracts.js';
import { reconcileEnterprise } from './enterprise-domain.js';
import { Entities } from './entity-store.js';
import { PlatformProvisioner } from './platform-provisioner.js';
import { normalizeDocument,normalizeTask,normalizeComment,normalizeUser,normalizeCategory,normalizeDepartment,normalizeEmail } from './domain.js';
import { sanitizeSourceRecord, sanitizeTaskRecord } from './source-normalizer.js';
import { partition } from './entry-point-feeds.js';
import { EntryPoints } from '../config/entry-points.config.js';
import { normalizeFailureHealth } from './failure-health.js';
/* Portal Registry rows (FETCH_ALL data.register, identification Phase 4): portal submissions, read so an officer can set
   their status (DECISIONS.md D1, core/portal-status-service.js). They arrive through the portal's own lane. */
const normalizePortalRecord=(r)=>({id:String(r.referenceId||r.id||''),referenceId:String(r.referenceId||''),entityKey:r.entityKey||'',subject:String(r.subject||r.title||''),channel:String(r.channel||'portal'),status:String((r.status&&typeof r.status==='object'?r.status.Value:r.status)||'received').toLowerCase(),statusLabel:String(r.statusLabel||''),senderEmail:String(r.senderEmail||''),submittedAtUtc:r.submittedAtUtc||'',idState:(r.idState&&typeof r.idState==='object'?r.idState.Value:r.idState)||'',rev:r.rev??null,entryPoint:r.entryPoint||'public-portal'});
/** A register row from the server (id, entityKey, title, status, idState, rev, supersededBy, modified) in the shape the
 *  briefs, meetings and projects screens read. A row without a status takes the register's first state. */
const registerRow=(firstState)=>r=>({...r,id:String(r.entityKey||r.id),entityKey:r.entityKey||'',sourceId:r.id,title:r.title||'',status:r.status||undefined,firstState,idState:r.idState||'ACTIVE',rev:r.rev,updatedAt:r.modified||r.updatedAt||'',source:'registry'});
const specs={activities:{aliases:['docs','activities','Activities','correspondence','items','records'],map:normalizeDocument,pre:sanitizeSourceRecord},portalRegister:{lane:'public-portal',aliases:['register'],map:normalizePortalRecord,pre:(r)=>r},tracking:{aliases:['tasks','tracking','Tracking','Tasks'],map:normalizeTask,pre:sanitizeTaskRecord},comments:{lane:false,aliases:['taskComments','comments','Comments'],map:normalizeComment},users:{lane:false,aliases:['users','Users'],map:normalizeUser},categories:{lane:false,aliases:['categories','Categories'],map:normalizeCategory},departments:{lane:false,aliases:['departments','Departments'],map:normalizeDepartment},emails:{aliases:['emails','Emails'],map:normalizeEmail,lane:'email'},/* Approvals (APR) merge by their key: the server holds the title and the decision, and this device what the request said
   (summary, approver, minute). A decision recorded on a document is an APR record whose parentKey names it. */
approvals:{lane:false,merge:true,aliases:['approvals','Approvals'],map:r=>({...r,id:String(r.entityKey||r.id),entityKey:r.entityKey||'',title:r.title||'',status:String(r.status||'pending').toLowerCase(),parentKey:r.parentKey||'',ts:r.ts||'',source:'registry'})},
/* FETCH_ALL has returned these four since identification Phase 4 and nothing read them: a brief, meeting, project or
   registry file recorded on one device never reached another (found 2026-10-10). They merge by id, because these
   screens also hold records made on this device that have not been sent yet. */
briefs:{lane:false,merge:true,aliases:['briefs','Briefs'],map:registerRow('Draft')},
meetings:{lane:false,merge:true,aliases:['meetings','Meetings'],map:registerRow('Requested')},
projects:{lane:false,merge:true,aliases:['projects','Projects'],map:r=>({...registerRow('Planned')(r),name:r.title||undefined})},
registryFiles:{lane:false,merge:true,aliases:['files','registryFiles'],map:r=>({...r,id:String(r.entityKey||r.id),sourceId:r.id,fileRef:r.fileRef||r.title||'',title:r.title||r.fileRef||'',currentHolder:r.currentHolder||'',idState:r.idState||'ACTIVE',source:'registry'})}};
let activeLoad=null;
const clean = xs => xs.filter(x=>x&&typeof x==='object');
export function parseFetchAll(response){const data=assertEnvelope(response,'fetchAll'),patch={},counts={},warnings=[],feeds={},presence={};for(const [target,spec] of Object.entries(specs)){const present=spec.aliases.some(k=>Array.isArray(data?.[k]));presence[target]=present;if(!present)continue;/* collection absent from this response — leave existing state untouched */const rows=collection(data,...spec.aliases);/* D4: stamp provenance AT THE DOOR, before anything else touches the row. FETCH_ALL is a
   shared endpoint carrying several channels, so the partition happens here — each row is
   assigned to the entry point it declares, and one that declares nothing is stamped null and
   counted rather than defaulting into a channel it was never seen at. Only then does the row
   pass through the sanitiser and the normaliser, which is the convergence layer. */
const laneSpec=spec.lane!==false;const split=laneSpec?partition(clean(rows),{assume:typeof spec.lane==='string'?spec.lane:null}):{stamped:clean(rows),unplaced:[],conflicts:[]};patch[target]=split.stamped.map(spec.pre||sanitizeSourceRecord).map(spec.map);counts[target]=patch[target].length;if(laneSpec){feeds[target]={unplaced:split.unplaced.length,conflicts:split.conflicts.length,byEntryPoint:Object.fromEntries(EntryPoints.map(e=>[e.id,split.byEntryPoint[e.id].length]))};if(split.unplaced.length)warnings.push(`${target}: ${split.unplaced.length} record(s) declare no entry point`);if(split.conflicts.length)warnings.push(`${target}: ${split.conflicts.length} record(s) disagree with the lane that carried them`);}if(rows.some(x=>!x||typeof x!=='object'))warnings.push(`${target}: non-object rows skipped`)}/* Failed notices (owner decision 2026-10-18): the watch's NOTIFY_FAILURE_HEALTH row, when the reply carries it. */const failureHealth=data&&Object.prototype.hasOwnProperty.call(data,'failureHealth')?normalizeFailureHealth(data.failureHealth):undefined;return{patch,counts,warnings,feeds,presence,failureHealth,meta:responseMeta(response)}}
/* F-17: a load replaces a collection with the server's copy. A row the server has no place for (a comment with no task
   to attach to) is marked deviceOnly when it is made, says so on screen, and is kept rather than wiped. */
function keepDeviceOnly(current=[],incoming=[]){const ids=new Set(incoming.map(x=>String(x.id)));return (current||[]).filter(x=>x&&x.deviceOnly&&!ids.has(String(x.id)));}
/* A field the server does not hold (undefined) leaves this device's value in place: the briefs, meetings and projects
   registers hold a title, not a status, so a merge must not reset a status set here. A row new to this device takes the
   register's first state. */
function mergeById(current=[],incoming=[]){const map=new Map(current.map(x=>[String(x.id),x]));for(const row of incoming){const prev=map.get(String(row.id))||{};const next={...prev};for(const [k,v] of Object.entries(row))if(v!==undefined)next[k]=v;if(next.status===undefined&&row.firstState)next.status=row.firstState;delete next.firstState;map.set(String(row.id),next);}return[...map.values()]}
/**
 * Directory authority.
 *
 * The moment a backend response carries a `users` collection, DGO_UserDirectory is the
 * authority on who exists and what role they hold — and the packaged bootstrap
 * administrator in core/state.js must stop applying, INCLUDING when the collection came
 * back empty. `served` is therefore set from the presence of the collection in the
 * response, never from its length: "the directory answered with nobody" and "no directory
 * has ever answered" are different facts, and core/current-user.js has to tell them apart
 * to avoid handing systemAdmin to every caller.
 *
 * Once set it stays set for the life of the stored state. A later response that omits the
 * collection means "unchanged", not "revoked" — otherwise a partial refresh would silently
 * reinstate the bootstrap admin.
 *
 * Presence comes from parseFetchAll, which already decides it per collection while
 * unwrapping the envelope. Re-deriving it here meant a second copy of the unwrap rule in
 * assertEnvelope, and two copies of that rule drift the moment the envelope gains a level.
 */
function directoryStamp(parsed, current) {
  const prior = current.runtime?.directory || {};
  if (!parsed.presence?.users) return prior.served ? prior : undefined;
  return {
    served: true,
    at: new Date().toISOString(),
    count: parsed.counts.users ?? 0,
    source: 'backend',
  };
}

export function applyFetchAll(response,{replace=true}={}){const parsed=parseFetchAll(response),current=State.get(),patch={};for(const key of Object.keys(parsed.patch))patch[key]=replace&&!specs[key]?.merge?[...parsed.patch[key],...keepDeviceOnly(current[key],parsed.patch[key])]:mergeById(current[key],parsed.patch[key]);Object.assign(patch,reconcileEnterprise({...current,...patch}));const directory=directoryStamp(parsed,current);patch.runtime={...(current.runtime||{}),source:'FETCH_ALL',contract:parsed.meta,lastWarnings:parsed.warnings,lastCounts:parsed.counts,feeds:parsed.feeds,...(directory?{directory}:{}),...(parsed.failureHealth!==undefined?{failureHealth:parsed.failureHealth}:{})};State.patch(patch);Entities.hydrateFromState(State.get());PlatformProvisioner.ensure();return parsed}
/* Sign out (shared/shell.js): the records the last load brought are the person's who signed out, and this browser may be
   shared, so they go with the sign-in. These are the collections every load replaces whole; what only this device holds
   (a deviceOnly row, a record not yet sent, the pending queue) stays, as a load would keep it. The next person's load
   brings their own. */
export function forgetLoadedRecords(){const current=State.get(),patch={};for(const [key,spec] of Object.entries(specs)){if(spec.merge||!Array.isArray(current[key])||['users','categories','departments'].includes(key))continue;patch[key]=keepDeviceOnly(current[key],[]);}patch.runtime={...(current.runtime||{}),lastLoad:null,lastCounts:{},feeds:{}};State.patch(patch,{module:'sign-out',action:'forget-loaded-records',event:'audit:signed-out-records-cleared'});return Object.keys(patch).filter(k=>k!=='runtime')}
/* A screen drawn before its data arrived was never drawn again: an e-mailed task link opened the Acknowledgment
   Queue straight after sign-in, about 20 s before FETCH_ALL answered, and it stayed on "The task this link points to has
   not loaded" with the task already in state (tenant, 2026-10-10, TASK-2026-00002). Every successful load now says so;
   shared/shell.js redraws the current screen when it hears it. A load that fails is announced too (detail.ok false), so a
   screen that said "Loading…" is redrawn to say the records did not arrive. */
function announceLoaded(result){try{if(typeof window!=='undefined'&&typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent('dgo:data-loaded',{detail:result}))}catch{/* no window: nothing is drawn */}}
export async function loadRuntimeData({force=false,replace=true}={}){const current=State.get();if(activeLoad)return activeLoad;const inflight=(async()=>{try{const response=(await FetchManager.fetch('FETCH_ALL',{force,requestedAt:new Date().toISOString()},{force,cacheNamespace:'FETCH_ALL'})).data;const parsed=applyFetchAll(response,{replace});const result={ok:true,key:'FETCH_ALL',at:new Date().toISOString(),counts:parsed.counts,meta:parsed.meta,warnings:parsed.warnings};State.patch({runtime:{...State.get().runtime,loading:false,lastLoad:result,lastError:null}});announceLoaded(result);return result}catch(primary){try{const response=(await FetchManager.fetch('FETCH_ACTIVITIES',{force,requestedAt:new Date().toISOString()},{force,cacheNamespace:'FETCH_ACTIVITIES'})).data;const data=assertEnvelope(response);const rows=Array.isArray(data)?data:collection(data,'activities','docs','items','records','value');const activities=rows.map(sanitizeSourceRecord).map(normalizeDocument);if(!activities.length)throw new Error('FETCH_ACTIVITIES returned no records');State.patch({activities,runtime:{...State.get().runtime,loading:false,lastLoad:{ok:true,key:'FETCH_ACTIVITIES',at:new Date().toISOString(),counts:{activities:activities.length},fallbackReason:primary.message},lastError:null}});Entities.hydrateFromState(State.get());PlatformProvisioner.ensure();announceLoaded(State.get().runtime.lastLoad);return State.get().runtime.lastLoad}catch(fallback){const message=`FETCH_ALL: ${primary.message}; FETCH_ACTIVITIES: ${fallback.message}`;const result={ok:false,key:'deferred-runtime-data',at:new Date().toISOString(),offline:true,message,counts:{},warnings:[message]};State.patch({runtime:{...State.get().runtime,loading:false,lastLoad:result,lastError:null,lastWarnings:[...(State.get().runtime?.lastWarnings||[]),message].slice(-10)}});/* A screen drawn while the load ran says "Loading…"; it is redrawn to say what happened. */announceLoaded(result);return result}}})();activeLoad=inflight.finally(()=>{activeLoad=null});State.patch({runtime:{...(current.runtime||{}),loading:true,lastError:null}});return activeLoad}

// R11.6.3 sync façade: the single implementation behind every sync trigger in the
// platform (shell, Operator HUD, Diagnostics, Executive, Correspondence, Statistics,
// FastTrack ribbon, Lookup direct). mode 'full' refreshes the whole runtime dataset;
// mode 'endpoint' routes a scoped governed request. Both record one audit vocabulary.
export async function requestSync({source='workspace',mode='full',endpoint='DYNAMIC_ACTIONS',payload={}}={}){
  const meta={module:source,action:'sync:request',ref:mode==='full'?'FETCH_ALL':endpoint};
  if(mode==='full'){
    const result=await loadRuntimeData({force:true});
    State.patch({},{...meta,event:'audit:sync-request'});
    return result;
  }
  const res=await invoke(endpoint,{...payload,source});
  State.patch({},{...meta,event:'audit:sync-request'});
  return res;
}
