/* End-to-end checks for the Flow Operations Workbench.
 *
 * Drives the page over the Chrome DevTools Protocol with no test framework, so it
 * runs anywhere a Chromium binary and Node 18+ exist. Each assertion covers a
 * defect found in the v2 build; see README.md.
 *
 * Usage:
 *   python3 local_agent.py &
 *   chromium --headless --remote-debugging-port=9222 about:blank &
 *   node scripts/browser-test.mjs
 */
const base='http://127.0.0.1:9222';
const t0=Date.now();
let targets;
while(true){
  try{ targets=await (await fetch(base+'/json/list')).json(); if(targets.find(t=>t.type==='page'))break; }catch{}
  if(Date.now()-t0>20000) throw new Error('no devtools target');
  await new Promise(r=>setTimeout(r,300));
}
const page=targets.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r));
let id=0; const pend=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);} });
const send=(method,params={})=>new Promise(r=>{const i=++id; pend.set(i,r); ws.send(JSON.stringify({id:i,method,params}));});
async function ev(expr){
  const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(expr+' -> '+JSON.stringify(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails));
  return r.result.result.value;
}
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url:'http://127.0.0.1:8765/'});
await new Promise(r=>setTimeout(r,4000));

let pass=0,fail=0;
const check=(name,cond,got)=>{ if(cond){pass++;console.log('  PASS  '+name)} else {fail++;console.log('  FAIL  '+name+'  got: '+JSON.stringify(got))} };

console.log('\n-- boot --');
check('catalog loaded (50 flows)', await ev('CATALOG.flows.length')===50, await ev('CATALOG.flows.length'));
check('no PowerAppV2 in catalog', await ev("CATALOG.flows.filter(f=>f.triggers[0].kind==='PowerAppV2').length")===0);
check('runtime badge active', (await ev("document.querySelector('#runtime').textContent")).startsWith('ACTIVE'));

console.log('\n-- send gating (was gated on trigger kind; now on a valid HTTPS URL) --');
check('send disabled with no URL', await ev("document.querySelector('#sendBtn').disabled")===true);
await ev("document.querySelector('#url').value='http://insecure.example';updateSendState()");
check('send disabled for http://', await ev("document.querySelector('#sendBtn').disabled")===true);
await ev("document.querySelector('#url').value='https://prod.example/flow?sig=SECRET123';updateSendState()");
check('send enabled for https://', await ev("document.querySelector('#sendBtn').disabled")===false);

console.log('\n-- every catalogued flow is sendable, including Button/event kinds --');
const kinds=await ev(`JSON.stringify([...new Set(CATALOG.flows.map(f=>f.triggers[0].kind))])`);
check('kinds present: Http, Button, null', kinds.includes('Http')&&kinds.includes('Button'), kinds);
const btnIdx=await ev("CATALOG.flows.findIndex(f=>f.triggers[0].kind==='Button')");
await ev(`selectFlow(${btnIdx});document.querySelector('#url').value='https://prod.example/x';updateSendState()`);
check('Button-trigger flow can send', await ev("document.querySelector('#sendBtn').disabled")===false);
check('Button-trigger shows advisory note', await ev("!document.querySelector('#triggerNote').classList.contains('hidden')")===true);
const evIdx=await ev("CATALOG.flows.findIndex(f=>f.triggers[0].type!=='Request')");
await ev(`selectFlow(${evIdx});document.querySelector('#url').value='https://prod.example/y';updateSendState()`);
check('event-trigger flow can send too', await ev("document.querySelector('#sendBtn').disabled")===false);

console.log('\n-- composer resets across flow switches (v2 carried the body over) --');
await ev("selectFlow(0);document.querySelector('#requestBody').value='{\"leaked\":\"from previous flow\"}';fillFormFromJson()");
check('body set on flow 0', (await ev("document.querySelector('#requestBody').value")).includes('leaked'));
await ev('selectFlow(1)');
check('body cleared on switch', !(await ev("document.querySelector('#requestBody').value")).includes('leaked'), await ev("document.querySelector('#requestBody').value"));
check('headers reset on switch', (await ev("document.querySelector('#headers').value"))==='{}');

console.log('\n-- duplicate workflowId no longer collides --');
const dup=await ev("JSON.stringify(CATALOG.flows.map((f,i)=>({i,w:f.workflowId})).filter(x=>x.w==='_References_Matrix-POST').map(x=>x.i))");
const idxs=JSON.parse(dup);
check('three flows share _References_Matrix-POST', idxs.length===3, dup);
for(let n=0;n<idxs.length;n++){
  await ev(`selectFlow(${idxs[n]});document.querySelector('#url').value='https://endpoint-${n}.example/run';saveProfile&&0`);
  await ev(`profiles[flowKey(CATALOG.flows[${idxs[n]}])]={url:'https://endpoint-${n}.example/run',flowName:CATALOG.flows[${idxs[n]}].name,workflowId:'_References_Matrix-POST'}`);
}
check('3 distinct profile keys stored', await ev("Object.keys(profiles).length")===3, await ev("JSON.stringify(Object.keys(profiles))"));
for(let n=0;n<idxs.length;n++){
  const got=await ev(`selectFlow(${idxs[n]});document.querySelector('#url').value`);
  check(`flow ${idxs[n]} keeps its own endpoint`, got===`https://endpoint-${n}.example/run`, got);
}

console.log('\n-- URL masking --');
const masked = await ev("mask('https://x.example/p?sig=ABC&api-key=K&plain=1')");
check('sig redacted', masked.includes('sig=REDACTED'), masked);
check('api-key redacted', masked.includes('api-key=REDACTED'), masked);
check('no percent-encoded marker', !masked.includes('%5B'), masked);
check('plain param kept', masked.includes('plain=1'), masked);

console.log('\n-- validation --');
await ev("selectFlow(0);document.querySelector('#requestBody').value='{ not json';validatePayload()");
check('invalid JSON reported', (await ev("document.querySelector('#validation').className"))==='error');
await ev("document.querySelector('#requestBody').value='{\"userEmail\":\"not-an-email\"}';validatePayload()");
check('bad email caught', (await ev("JSON.stringify(validatePayload().errors)")).includes('invalid email'), await ev("JSON.stringify(validatePayload().errors)"));
await ev("document.querySelector('#requestBody').value='{\"userEmail\":\"a@b.co\"}';validatePayload()");
check('valid payload accepted', (await ev("validatePayload().valid"))===true);

console.log('\n-- search index --');
await ev("document.querySelector('#q').value='odataFilter';renderList()");
const c1=await ev("document.querySelector('#listCount').textContent");
check('search narrows list', !c1.startsWith('50 of'), c1);
await ev("document.querySelector('#q').value='';document.querySelector('#only').checked=true;renderList()");
check('HTTP-only filter -> 44', (await ev("document.querySelector('#listCount').textContent")).startsWith('44 of'), await ev("document.querySelector('#listCount').textContent"));

console.log('\n-- method default surfaced --');
const nm=await ev("CATALOG.flows.findIndex(f=>!f.triggers[0].method)");
await ev(`selectFlow(${nm})`);
check('undeclared method shown as default', (await ev("document.querySelector('#meta').innerHTML")).includes('defaulting to POST'));
check('method control set to POST', (await ev("document.querySelector('#method').value"))==='POST');

console.log('\n-- relay detected --');
check('mode auto-switched to relay', (await ev("document.querySelector('#mode').value"))==='relay', await ev("document.querySelector('#mode').value"));

console.log('\n-- end-to-end send through the relay --');
await ev("selectFlow(0);document.querySelector('#mode').value='relay';document.querySelector('#url').value='https://api.github.com/?sig=SECRET';document.querySelector('#requestBody').value='{}';validatePayload()");
await ev("sendRequest()");
await new Promise(r=>setTimeout(r,3000));
const res = await ev("document.querySelector('#result').textContent");
check('response rendered', res.length>20 && res!=='No request sent.', res.slice(0,120));
check('outcome recorded', await ev('outcomes.length')>=1, await ev('outcomes.length'));
const rec = await ev('JSON.stringify(outcomes[0])');
check('stored URL is masked', rec.includes('sig=REDACTED') && !rec.includes('SECRET'), rec.slice(0,200));
check('outcomes table populated', (await ev("document.querySelector('#history').innerHTML")).includes('View'));
check('alignment carries provenance', (await ev("JSON.stringify(outcomes[0].requestAlignment)")).includes('sourceSha256'));

console.log(`\n${pass} passed, ${fail} failed`);
ws.close();
process.exit(fail?1:0);
