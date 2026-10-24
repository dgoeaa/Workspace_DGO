import { hydrateGovernance } from '../core/governed-actions.js';
import { State } from '../core/state.js';
import { status } from '../core/domain.js';
import { head, esc, toast, confirmAction,fmtDate, actionPreview} from '../core/ui.js';
import { invoke } from '../core/api.js';
import { UIState } from '../core/ui-state.js';
import { statRow } from '../core/ui.js';
import { normalizeReportRows, filterByDateRange, reportSummary, exportHtmlDoc } from '../core/report-export-service.js';
import { Brand } from '../config/brand.config.js';
import { managementReportEmail } from '../core/report-email-service.js';

/* Essentials plan UX-D6 (owner decision 2026-10-21). The canvas app's M1-M10 were visibility variables, and here they
   had become ten toggles over six layouts, three of them duplicates; GTQ (Global Tracking Queue, the task list), DGO
   and Combined chose between two identical date ranges and filtered nothing. Reports is now two named reports over
   one period: Summary (the figures and the activity table) and Full list (every record, its status, acknowledgement
   and link), with one email action. */
const REPORTS = Object.freeze([{ id:'summary', label:'Summary' }, { id:'list', label:'Full list' }]);
let activeReport = 'summary';
let lastReportRows = [];
const today = () => new Date().toISOString().slice(0,10);
const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
let filters = { start: daysAgo(14), end: today() };
function syncLocal(){const u=UIState.get('reports',{report:activeReport,...filters});activeReport=REPORTS.some(r=>r.id===u.report)?u.report:'summary';filters={start:u.start??u.dgoStart??filters.start,end:u.end??u.dgoEnd??filters.end};}
const val = x => typeof x === 'object' && x ? (x.Value || x.value || '') : (x || '');
const rowDate = r => fmtDate(r.created || r.Created || r.due || r.DueDate || '');
const inRange = (r,start,end) => { const d=rowDate(r); return !d || (!start || d>=start) && (!end || d<=end); };
const normalizeRows = s => normalizeReportRows(s);
const summary = rows => reportSummary(rows);
const statCards = xs => statRow(xs,'dgo-report-kpis');
function tableRows(rows){return rows.map(r=>`<tr><td>${esc(r.title||'')}</td><td>${esc(rowDate(r))}</td><td>${esc(r.category||'')}</td><td>${esc(r.assignedTo||'')}</td><td>${esc(r.due||'')}</td><td>${esc(val(r.status)||'Pending')}</td><td>${esc(val(r.ack)||'Pending')}</td><td><a href="${esc(r.link||'#')}" target="_blank" rel="noreferrer">View</a></td></tr>`).join('') || '<tr><td colspan="8">No records fall inside the dates chosen above. Widen the date range to see more.</td></tr>';}
function buildTemplate(id,rows,s){const sum=summary(rows); if(id==='M1')return `<section class="report-template"><h2>Document Summary</h2><p><b>From:</b> ${esc(s.profile.name)} · <b>Department:</b> ${esc(s.profile.persona)}</p><div class="tablewrap"><table><thead><tr><th>Title</th><th>Created</th><th>Category</th><th>Assigned</th><th>Due</th><th>Status</th><th>Ack</th><th>Link</th></tr></thead><tbody>${tableRows(rows)}</tbody></table></div></section>`;
if(id==='M2')return `<section class="report-template"><h2>Management Insight</h2>${statCards([['Total',sum.total],['Completed',sum.completed],['Pending',sum.pending],['Overdue',sum.overdue]])}<p>${sum.overdue?'Immediate attention is required for overdue items.':'No overdue item is visible in the selected range.'}</p></section>`;
if(id==='M4')return `<section class="report-template"><h2>Activity Summary</h2><div class="tablewrap"><table><thead><tr><th>Activity</th><th>Department</th><th>Start Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${esc(rowDate(r))}</td><td>${esc(val(r.status))}</td><td>${esc(r.comments)}</td></tr>`).join('')||'<tr><td colspan="5">No records fall inside the dates chosen above.</td></tr>'}</tbody></table></div></section>`;
return '';}
const reportBody=(id,rows,s)=>id==='list'?buildTemplate('M1',rows,s).replace('<h2>Document Summary</h2>','<h2>Full list</h2>'):`${buildTemplate('M2',rows,s).replace('<h2>Management Insight</h2>','<h2>Summary</h2>')}${buildTemplate('M4',rows,s)}`;
function updateRows(s){const all=normalizeRows(s); lastReportRows=filterByDateRange(all,filters.start,filters.end); return lastReportRows;}
/* Essentials plan UX-303: Reports is also a section of the Overview, drawn there without a page heading of its own. */
let embedded=false;
export async function mount(el){embedded=false;hydrateGovernance();render(el);}
export async function mountEmbedded(el){embedded=true;hydrateGovernance();render(el);}
function render(el){syncLocal();const s=State.get(); const rows=updateRows(s); const sum=summary(rows); el.innerHTML=`<div class="${embedded?'report-embedded':'workspace'}">${embedded?'<h2 id="overview-reports">Reports</h2>':head('Reports','Management reports for a chosen period, ready to read, print or send on.')}

<section class="panel panel--inline report-controls"><div class="form-row" role="group" aria-label="Report">${REPORTS.map(r=>`<button type="button" class="chip ${r.id===activeReport?'active':''}" data-report="${r.id}" aria-pressed="${r.id===activeReport}">${esc(r.label)}</button>`).join('')}<label class="cc-filter"><span>From</span><input type="date" data-filter="start" value="${filters.start}"></label><label class="cc-filter"><span>To</span><input type="date" data-filter="end" value="${filters.end}"></label><button class="btn ghost" data-print>Print</button><button class="btn ghost" data-html>Download</button><button class="btn" data-email>Email report</button></div></section>
<div class="panel" id="report-body"><div class="report-banner"><h2>NITDA Management Report</h2><p>${esc(Brand.estate)} · ${esc(REPORTS.find(r=>r.id===activeReport).label)} · ${esc(filters.start||'the beginning')} to ${esc(filters.end||'today')} · ${esc(s.profile.email)}</p></div>${reportBody(activeReport,rows,s)}</div></div>`;
el.querySelectorAll('[data-filter]').forEach(x=>x.onchange=()=>{UIState.set('reports',{[x.dataset.filter]:x.value}); render(el);});
el.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{UIState.set('reports',{report:b.dataset.report}); render(el);});

el.querySelector('[data-print]').onclick=()=>rows.length?print():toast('There is nothing to print — no record falls inside the dates chosen','error');
el.querySelector('[data-html]').onclick=()=>{if(!rows.length)return toast('There is nothing to download — no record falls inside the dates chosen','error'); exportHtmlDoc(`nitda-management-report-${activeReport}.html`,'NITDA Management Report',reportBody(activeReport,rows,s));};
/* I-07 — the audit quotes this dialog's old wording, "Review report email payload before
   backend execution.", as its example of jargon at the moment a user decides whether to
   proceed. It now says what is being sent, to whom, and what happens: the report leaves as an
   email and nothing on this screen changes. The failure toast said "Endpoint unavailable;
   report action queued locally" — EMAIL is a write contract, so core/data-client.js really
   does put it on the pending queue; that is what the operator needs to be told. */
const send=async subject=>{const start=filters.start,end=filters.end;const views=[activeReport];const preview={'Report':subject,'Records included':rows.length,'Dates covered':`${start||'the beginning'} to ${end||'today'}`,'Sent to':s.profile.email}; if(!await confirmAction({title:'Send this report by email',body:`<p>It goes to <b>${esc(s.profile.email)}</b> as the management report email: the summary figures and the task list of the ${rows.length} record${rows.length===1?'':'s'} in these dates.</p><p class="meta">Nothing on this screen changes and no record is edited.</p>${actionPreview(preview,{payload:false})}`,confirmText:'Send report',cancelText:'Cancel'}))return; try{/* RP-Management (TR-089): the body fragment, with the hero and footer note the IP_SEND_EMAIL frame draws (F1). */const email=managementReportEmail({profile:s.profile,rows,reportName:subject,start,end});await invoke('EMAIL',{subject:email.subject,summary:summary(rows),templates:views,email:{...email,to:s.profile.email}});toast('Report sent by email','success')}catch{toast('The report could not be sent right now — it is queued and will go out when the connection is back','error')}};
el.querySelector('[data-email]').onclick=()=>send(`Management report: ${REPORTS.find(r=>r.id===activeReport).label}`);}
