import { DeepLinkConfig } from '../config/deeplink.config.js';
import { parseDeepLink } from './deeplink-parse.js';
import { State } from './state.js';
import { Router } from './router.js';
import { ReceiptLedger } from './receipt-ledger.js';
/* Parsing lives in ./deeplink-parse.js so the rules can be tested without a browser. */
function parse(url=location.href){ return parseDeepLink(url, location.href); }
export const DeepLinkResolver=Object.freeze({parse, resolveInitial, apply, openRef});
export function apply(result, options={}){ if(!result?.route) return false; const current=State.get(); /* A new link REPLACES the last one's context. It used to merge into it, and the context is persisted, so the task id from yesterday's link rode along with today's link to a different item. */ const ctx={...result.context, route:result.route, action:result.action, matchedParam:result.matchedParam, resolvedAt:new Date().toISOString(), source:DeepLinkConfig.source}; State.patch({deepLinkContext:ctx, selectedId:ctx.referenceId||ctx.taskId||current.selectedId}, {module:'deeplink', action:'resolve', event:'audit:deeplink-resolved', ref:ctx.referenceId||ctx.taskId||''}); if(result.route==='acknowledgment'||result.action==='acknowledge-task')ReceiptLedger.record({type:'acknowledgement',ref:ctx.referenceId||ctx.taskId||'',taskId:ctx.taskId||'',status:'deeplink-resolved',source:ctx.source,payload:ctx}); if(options.navigate!==false){ /* Already on that route: nothing changes the address, so nothing would redraw the screen with the new link's context. */ if(Router.path()===result.route) Router.render(); else Router.go(result.route); } return true; }
/* A link is read once per tab. A reload keeps the address, link and all, so it used to resolve the link again: an
   officer who had moved on to another screen was sent back to the link's screen, and a Lookup link already opened
   opened again. This tab now remembers the link it resolved; while the address still carries that link and names a
   screen, the reload stays on that screen (its context is kept in State). A new link, or the same one in a new tab,
   resolves as before. */
const SEEN_KEY='dgo.deeplink.resolved';
const seenStore=()=>{ try{ return globalThis.sessionStorage||null; }catch{ return null; } };
export function resolveInitial(){ try{ const r=parse(); if(!r?.route) return false; const store=seenStore(); const here=String(location.search||'')+'|'+r.matchedParam; let seen=''; try{ seen=store?.getItem(SEEN_KEY)||''; }catch{ /* no storage: resolve every time */ } if(seen===here && /^#\/./.test(location.hash||'')) return false; try{ store?.setItem(SEEN_KEY,here); }catch{ /* no storage */ } return apply(r,{navigate:true}); }catch(e){ console.warn('[DGO deeplink]',e); return false; } }

/** Open a task or item by its reference, the same way a link would (DL-3: the bell uses this). */
export function openRef(ref){ const v=String(ref||'').trim(); if(!v) return false; const m=v.match(DeepLinkConfig.taskRefPattern); const r=parse(`/?${m?'TaskID':'ref'}=${encodeURIComponent(m?m[1]:v)}`); return apply(r,{navigate:true}); }
