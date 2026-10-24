/**
 * Ask the support team, under Help (owner decision UX-D5; essentials plan UX-401).
 *
 * The request form that sat beside the Assistant's chat, which is removed. It is now part of the Help dialog, and a
 * support link (?support=1, support.html) opens it there. What is sent, and how, is unchanged: core/support-service.js.
 */
import { esc, confirmAction, toast, actionPreview } from '../core/ui.js';
import { SupportService } from '../core/support-service.js';
import { SupportRoutingConfig } from '../config/support-routing.config.js';

/* I-07 — it says, in the officer's words, what the support team will be able to see, and shows that as a readable list with
   the technical detail folded away behind actionPreview()'s disclosure. */
export function supportFormHtml() {
  const ctx = SupportService.buildContext();
  return `<section data-support-form aria-labelledby="support-title"><h3 id="support-title">Ask the support team</h3><p class="meta">Your message goes to the support team together with the screen you are on, the record you have open, and anything that has recently failed, so they see what you see without you having to describe it.</p><div class="form-row"><select id="support-category" aria-label="What kind of help you need">${SupportRoutingConfig.categories.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select><input id="support-ref" aria-label="Reference or task number this is about" placeholder="Reference or task number this is about" value="${esc(ctx.selectedId || '')}"></div><textarea id="support-message" aria-label="What you need" rows="3" placeholder="Describe what you need: a reassignment, a date that looks wrong, something that will not save…"></textarea><div class="toolbar"><button type="button" class="btn" id="support-submit">Send support request</button></div><details><summary>What is sent with your request</summary>${actionPreview(ctx)}</details></section>`;
}

export function bindSupportForm(root) {
  root.querySelector('#support-submit')?.addEventListener('click', async () => {
    const category = root.querySelector('#support-category')?.value || 'clarification', ref = root.querySelector('#support-ref')?.value || '', message = root.querySelector('#support-message')?.value || '';
    if (!message.trim()) return toast('Write what you need help with first', 'error');
    const catLabel = SupportRoutingConfig.categories.find((c) => c.id === category)?.label || category;
    if (!await confirmAction({ title: 'Send this to the support team', body: `<p>${esc(message)}</p><p class="meta">It goes to support as a ${esc(catLabel)} request${ref ? `, about ${esc(ref)}` : ''}. Nothing on this screen changes, and no record is updated; someone will come back to you.</p>`, confirmText: 'Send request', cancelText: 'Cancel' })) return;
    try { await SupportService.submit({ category, message, ref, taskId: ref }); toast('Support request sent', 'success'); const m = root.querySelector('#support-message'); if (m) m.value = ''; }
    catch { toast('Your support request could not be sent. Try again in a moment', 'error'); }
  });
}
