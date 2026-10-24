import { isOverdue } from '../core/work-measures.js';
import { hydrateGovernance } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { status } from '../core/domain.js';
import { head, kpis, esc } from '../core/ui.js';
import { VisibleWorkspaces } from '../config/workflow-clarity.config.js';
import { EntryPoints } from '../config/entry-points.config.js';
import { getCurrentUser, isSharedAccount } from '../core/current-user.js';
import { isEssentialsOn } from '../shared/record-page.js';
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening'}
/* I-19 — "Good morning, Registry" greeted a shared mailbox by name as if it were a person.
   A greeting is only personal when there is a real signed-in person to greet: a shared or
   bootstrap account, or a profile still carrying a mailbox name, gets the time-of-day line
   with no name attached rather than being addressed as somebody. Roles are untouched — they
   are title-cased by personaLabel() wherever they are shown. */
const MAILBOX_NAMES=new Set(['registry','admin','administrator','dgo','operator','helpdesk','support','operations','office','user']);
function personName(s){ const u=getCurrentUser(s); if(isSharedAccount(u)) return ''; const n=String(u?.fullName||s?.profile?.name||'').trim(); return !n||MAILBOX_NAMES.has(n.toLowerCase())?'':n; }
export function welcomeLine(s){ const n=personName(s); return n?`${greeting()}, ${n}.`:`${greeting()}.`; }
/* Essentials plan UX-303: with the essential screens on, this address draws the Overview. */
export async function mount(el){if(isEssentialsOn())return (await import('./overview.js')).mount(el);hydrateGovernance();render(el);}
function card(w, count='', note='', priority='normal'){
  if(!w) return '';
  return `<a class="panel action-card cc-action ${priority==='primary'?'cc-primary-action':''}" href="#/${w.route}" data-cc-card="${esc(w.id)}"><div><div class="eyebrow">${esc(w.group)}</div><h2>${esc(w.label)}</h2><p>${esc(note||w.purpose)}</p></div>${count!==''?`<b class="kpi-inline">${esc(count)}</b>`:''}</a>`
}
function render(el){const s=State.get();const open=s.activities.filter(a=>!['Treated','Processed'].includes(status(a)));const unassigned=s.activities.filter(a=>!a.assignedTo&&!['Treated','Processed'].includes(status(a)));const active=s.tracking.filter(t=>t.status!=='Completed');const overdue=s.tracking.filter(t=>isOverdue(t));const approvals=(s.approvals||[]).filter(a=>['Pending','Draft'].includes(a.status||'Pending'));const dispatchedTotal=s.dispatches.length;const dispatches=(s.dispatches||[]).filter(d=>!d.closedAt);const by=Object.fromEntries(VisibleWorkspaces.map(w=>[w.id,w]));
  el.innerHTML=`<div class="workspace cc-workspace">${head('Command Center',`${welcomeLine(s)} Everything waiting on this office, and where each piece of work goes next.`)}
  <section class="cc-hero-grid" aria-label="Command Center overview">
    <div class="cc-kpi-band" data-critical="true" data-strip>
      ${kpis([['Open References',open.length],['Unassigned',unassigned.length],['Active Tasks',active.length],['Overdue',overdue.length],['Dispatched',dispatchedTotal]])}
    </div>
    <aside class="panel cc-source-strip" aria-label="The four intakes">
      <div class="eyebrow panel-eyebrow">The four intakes</div>
      <div class="cc-source-list">
        ${EntryPoints.map((e) => `<span title="${esc(e.purpose)}">${esc(e.label)}</span>`).join('')}
      </div>
    </aside>
  </section>
  <section class="panel cc-actions-panel"><div class="eyebrow panel-eyebrow">Recommended next actions</div><div class="quick-grid cc-action-grid">
    ${card(by.intake,unassigned.length,'Capture, triage and assign incoming correspondence into governed tasks — in one place.','primary')}
    ${card(by['my-work'],active.length,'Acknowledge, start, update or complete assigned work.','primary')}
    ${card(by.tracking,overdue.length,'Monitor overdue, ageing and matched document/email responses.','primary')}
    ${card(by['review-approval'],approvals.length,'Review, return, reject or approve controlled work.')}
    ${card(by['dispatch-archive'],dispatches.length,'Dispatch, close and archive completed work.')}
  </div></section>
</div>`}
