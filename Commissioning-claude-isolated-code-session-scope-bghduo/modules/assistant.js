import { hydrateGovernance, executeOwnedAction } from '../core/governed-actions.js';
import { QueryStore } from '../core/query-store.js';
import { head, esc, confirmAction, toast, actionPreview } from '../core/ui.js';
import { invokeData } from '../core/api.js';
import { SupportService } from '../core/support-service.js';
import { SupportRoutingConfig } from '../config/support-routing.config.js';
let messages = [], sending = false;
export async function mount(el){hydrateGovernance();render(el); }
/* I-07 — this panel used to describe itself in the platform's own terms ("captures current
   route, selected reference, last error, pending writes and recent receipts for support
   triage") and then showed the operator a raw JSON dump. It now says, in the operator's
   words, what the support team will be able to see, and shows that as a readable list with
   the technical detail folded away behind actionPreview()'s disclosure. */
function supportPanel(){ const ctx=SupportService.buildContext(); return `<section class="panel"><h2>Ask the support team</h2><p class="meta">Your message goes to the support team together with the screen you are on, the record you have open, and anything that has recently failed — so they see what you see without you having to describe it.</p><div class="form-row"><select id="support-category" aria-label="What kind of help you need">${SupportRoutingConfig.categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}</select><input id="support-ref" placeholder="Reference or task number this is about" value="${esc(ctx.selectedId||'')}"></div><textarea id="support-message" rows="3" placeholder="Describe what you need — a reassignment, a date that looks wrong, something that will not save…"></textarea><div class="toolbar"><button class="btn" id="support-submit">Send support request</button></div><details><summary>What is sent with your request</summary>${actionPreview(ctx)}</details></section>`; }
function render(el) {
  /* I-13 — "Ask a question to get started." was a hint, not an empty state. A conversation has
     only one way of being empty (nothing has been asked in this session — it is not filtered
     and it is not a failed load), so this is the single-arm form of the contract: it names the
     cause, says where answers will appear, and carries one action that puts the cursor in the
     box. It is written out rather than taken from emptyFor() because emptyFor()'s nouns are
     records in a registry and these are questions in a session. */
  const emptyThread = `<div class="empty dgo-empty"><h2 class="dgo-empty__title">No questions asked yet</h2><p>Nothing has been asked in this session. Your questions and the answers appear here as a conversation.</p><p><button type="button" class="btn" data-ask-first>Ask a question</button></p></div>`;
  el.innerHTML = `<div class="workspace">${head('Assistant', 'Ask about correspondence, tasks and where work has got to. Only records you are allowed to see are used.')}
    <div class="panel"><div class="thread" id="asst-log">${messages.length ? messages.map(m => `<div class="msg ${m.role === 'user' ? 'mine' : ''}"><span class="who">${m.role === 'user' ? 'You' : 'Assistant'}</span>${esc(m.content)}</div>`).join('') : emptyThread}</div>
      <div class="form-row"><textarea id="asst-input" class="flex-1" rows="2" placeholder="Ask the assistant… (Ctrl+Enter to send)"></textarea>
      <button class="btn" id="asst-send" ${sending ? 'disabled' : ''}>${sending ? 'Sending…' : 'Send'}</button></div></div>${supportPanel()}</div>`;
  const input = el.querySelector('#asst-input'), send = el.querySelector('#asst-send');
  send.onclick = () => submit(el);
  el.querySelector('[data-ask-first]')?.addEventListener('click', () => el.querySelector('#asst-input')?.focus());
  el.querySelector('#support-submit')?.addEventListener('click', async()=>{ const category=el.querySelector('#support-category')?.value||'clarification'; const ref=el.querySelector('#support-ref')?.value||''; const message=el.querySelector('#support-message')?.value||''; if(!message.trim()) return toast('Write what you need help with first','error'); const catLabel=SupportRoutingConfig.categories.find(c=>c.id===category)?.label||category; if(!await confirmAction({title:'Send this to the support team', body:`<p>${esc(message)}</p><p class="meta">It goes to support as a ${esc(catLabel)} request${ref?`, about ${esc(ref)}`:''}. Nothing on this screen changes, and no record is updated — someone will come back to you.</p>`, confirmText:'Send request', cancelText:'Cancel'})) return; try{ await SupportService.submit({category,message,ref,taskId:ref}); toast('Support request sent','success'); }catch(e){ toast('Your support request could not be sent — try again in a moment','error'); } });
  input.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(el); } };
  el.querySelector('#asst-log').scrollTop = el.querySelector('#asst-log').scrollHeight;
}
async function submit(el) {
  if (sending) return; const input = el.querySelector('#asst-input'); const text = (input.value || '').trim(); if (!text) return;
  /* I-07 — "This is sent to the AI_CHAT flow endpoint." named a service the operator has no
     relationship with. The dialog is where they decide, so it now says what leaves the screen
     and what it cannot reach. */
  if (!await confirmAction({ title: 'Send this question to the assistant', body: `<p>${esc(text)}</p><p class="meta">Your question is sent with a summary of the records you are allowed to see. Records you cannot open are not included, and nothing is changed by asking.</p>`, confirmText: 'Send question', cancelText: 'Cancel' })) return;
  messages.push({ role: 'user', content: text }); sending = true; render(el);
  try {
    const context = await QueryStore.dashboard().catch(()=>null);
    /* `notify:false` — this is the screen where the defect was reproduced: an unconfigured
       connection made the governance layer toast "AI_CHAT: Endpoint AI_CHAT is not
       configured" on top of the answer-line message below, twice over. The catch already
       writes the failure into the conversation, where the operator is looking, and points at
       the one screen that can explain it. Governance stays quiet so that is the only word. */
    const res = await executeOwnedAction('assistant','ask',()=>invokeData('AI_CHAT', { messages, scoped:true, context }),{notify:false, meta:{promptLength:text.length}});
    messages.push({ role: 'assistant', content: res?.reply || res?.message || (typeof res==='string'?res:'The assistant came back with no answer. Try asking in a different way.') });
    toast('Answer received','success');
    /* I-02 — the screen to check is named "System Health" in the sidebar, not "Diagnostics". */
  } catch (error) { messages.push({ role: 'assistant', content: 'The assistant could not answer just now, so nothing was returned. Try again — if it keeps failing, System Health shows whether the platform can reach its data.' }); toast('The assistant could not answer','error'); }
  sending = false; render(el);
}
