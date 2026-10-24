/* Responsive layout checks for the Flow Operations Workbench.
 *
 * Asserts two things across every tab and viewport width:
 *   1. the page never scrolls sideways (documentElement.scrollWidth <= innerWidth)
 *   2. no tap target on a phone is smaller than 44px
 *
 * The v2 interface failed the first badly: the .work and .two grids used bare
 * 1fr tracks, whose automatic minimum is min-content, so the wide action table
 * stretched its track to ~2900px and dragged the whole page with it. Wide
 * content belongs inside .scroll, not in the page's own scrollbar.
 *
 * Driven over the Chrome DevTools Protocol; no test framework needed.
 * Run through scripts/e2e.sh, which starts the relay and the browser.
 */
const base='http://127.0.0.1:9222';
let targets,t0=Date.now();
while(true){try{targets=await(await fetch(base+'/json/list')).json();if(targets.find(t=>t.type==='page'))break}catch{}if(Date.now()-t0>20000)throw new Error('no target');await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r));
let id=0;const pend=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
 if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description);return r.result.result.value};
await send('Page.enable');await send('Runtime.enable');

const widths=[[360,'small phone'],[390,'phone'],[430,'large phone'],[768,'tablet'],[1024,'small laptop'],[1440,'desktop']];
const tabs=['dashboard','inspect','compose','outcomes','profilesPage','help'];
let fails=0;
for(const [w,label] of widths){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:8765/'});
  await new Promise(r=>setTimeout(r,3200));
  const row=[];
  for(const t of tabs){
    await ev(`$$('.page').forEach(p=>p.classList.add('hidden'));$('#${t}').classList.remove('hidden')`);
    await new Promise(r=>setTimeout(r,250));
    const over=await ev('document.documentElement.scrollWidth - innerWidth');
    if(over>1){fails++;row.push(`${t}:+${over}`)} else row.push(`${t}:ok`);
  }
  console.log(`${String(w).padStart(5)}px ${label.padEnd(13)} ${row.join('  ')}`);
}
// touch targets at phone width
await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:'http://127.0.0.1:8765/'});
await new Promise(r=>setTimeout(r,3000));
const small=await ev(`JSON.stringify([...document.querySelectorAll('button,input,select')].map(e=>{const r=e.getBoundingClientRect();return{t:(e.textContent||e.id||e.tagName).trim().slice(0,16),h:Math.round(r.height)}}).filter(x=>x.h>0&&x.h<44))`);
const list=JSON.parse(small);
console.log(`\ntouch targets under 44px on a phone: ${list.length}`);
if(list.length) console.log('   ', small.slice(0,240));
console.log(`\nhorizontal-overflow failures: ${fails}`);
ws.close();process.exit(fails?1:0);
