import { AppConfig } from '../config/app.config.js';import { State } from './state.js';import { canCurrentUserAccess, accessDenial } from './current-user.js';import { LoadingState } from './loading-state.js';import { watchLinks } from './link-guard.js';import { enhanceWorkspace, autoHideChrome } from './workspace-enhance.js';

// How long a route may take to mount before the shell admits it is working. Routes that
// resolve from state are effectively instant, and showing a bar for 12ms reads as a flicker
// rather than as progress — so nothing is shown until a mount has visibly failed to be
// instant. Anything slower than this is exactly the case the 15-second boot watchdog was
// written for, and the case where the user was previously given no signal at all.
const PENDING_AFTER_MS=140;

const handlers=new Map();
let generation=0;

const esc=s=>String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
const shell=()=>document.querySelector('dgo-shell');
const setPending=on=>{ const s=shell(); if(!s)return; s.toggleAttribute('data-route-pending',!!on); const out=document.querySelector('[data-outlet]'); if(out) out.setAttribute('aria-busy',on?'true':'false'); };

export const Router={
  register:(id,f)=>handlers.set(id,f),
  known:()=>[...handlers.keys()],
  /* A link may carry its parameters after the route (`#/lookup?ref=…`, core/deeplink-parse.js reads them); the route is
     the part before them. It was the whole of it, so such a link opened "Workspace not found". */
  path:()=>location.hash.replace(/^#\/?/,'').split('?')[0]||AppConfig.defaultRoute,
  go:p=>location.hash='#/'+p,
  start(){addEventListener('hashchange',()=>this.render());enhanceWorkspace(document.querySelector('[data-outlet]'));autoHideChrome(shell());this.render()},
  async render(){
    const token=++generation,p=this.path(),out=document.querySelector('[data-outlet]');
    if(!out)return;
    const fn=handlers.get(p);
    if(!fn){setPending(false);out.innerHTML=`<div class="empty"><h2>Workspace not found</h2><p>The requested route is unavailable.</p><p><a class="dgo-btn dgo-btn--secondary" href="#/${esc(AppConfig.defaultRoute)}">Go to the Command Center</a></p></div>`;return}
    /* The denial says which of the several reasons this is, and which directory column
       carries it. It used to say "your current role" for all of them — including a staged
       enrollment and a status the runtime could not parse, where the role was fine. */
    if(!canCurrentUserAccess(p)){setPending(false);const d=accessDenial(p);out.innerHTML=`<div class="empty"><h2>${esc(d.title)}</h2><p>${esc(d.message)}</p>${d.detail?`<p class="meta">${esc(d.detail)}</p>`:''}</div>`;return}

    // The outgoing route stays on screen while the incoming one mounts. Blanking the outlet
    // first would trade "no feedback" for "a flash of nothing", and the generation token
    // below already guarantees a mount that loses the race never reaches the DOM — so there
    // is nothing to gain by tearing down the view the user is still reading.
    LoadingState.start('route',p,{source:'router'});
    const timer=setTimeout(()=>{ if(token===generation) setPending(true); },PENDING_AFTER_MS);
    const settle=()=>{ clearTimeout(timer); if(token===generation) setPending(false); };

    const stage=document.createElement('div');stage.className='route-stage';stage.dataset.routeHost=p;
    try{
      await fn(stage);
      if(token!==generation){LoadingState.clear('route',p);clearTimeout(timer);return}
      out.replaceChildren(stage);out.scrollTop=0;watchLinks(stage);
      LoadingState.success('route',p,{source:'router'});
      settle();
      shell()?.active(p);
    }catch(e){
      if(token!==generation){clearTimeout(timer);return}
      console.error(e);
      LoadingState.error('route',p,e,{retryable:true});
      settle();
      out.innerHTML=`<div class="empty"><h2>Module failed</h2><p>${esc(e.message||e)}</p><p><button type="button" class="dgo-btn dgo-btn--secondary" data-route-retry>Try again</button></p></div>`;
      out.querySelector('[data-route-retry]')?.addEventListener('click',()=>this.render());
    }
  }
};
