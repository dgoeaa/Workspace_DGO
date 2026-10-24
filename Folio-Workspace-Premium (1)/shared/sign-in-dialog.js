/* Sign-in dialog — the only place a person enters a one-time code, once auth is enforced.
   Spec: docs/architecture/AUTHENTICATION_CONTRACT.md; DL-1 in PLATFORM_ACCESS_SPEC.md §8a.

   core/otp-identity.js calls promptSignIn() when an action needs a proof and none is held,
   and waits. This asks OTP_GENERATE for a code, exchanges it with OTP_VERIFY, and resolves
   once a proof is held. The action that asked then carries on where it was, so a person who
   opened an acknowledgement link lands back on the same task, signed in. Cancel rejects.

   Nothing here decides who someone is: the flows do. This only carries the two calls. */

import { requestCode, submitCode, isSignedIn } from '../core/otp-identity.js';
import { createFocusTrap } from '../core/focus-trap.js';
import { State } from '../core/state.js';
import { escapeHtml as esc } from './design-system-adapter.js';

let open = null;

export function promptSignIn() {
  if (open) return open;
  open = new Promise((resolve, reject) => {
    const email0 = State.get()?.profile?.email || '';
    const wrap = document.createElement('div');
    wrap.className = 'dgo-dialog-backdrop';
    wrap.dataset.dialog = 'sign-in';
    wrap.innerHTML = `<section class="dgo-dialog" role="dialog" aria-modal="true" aria-labelledby="dgo-signin-title">
      <header><h2 id="dgo-signin-title">Sign in to continue</h2></header>
      <div class="dgo-dialog__body">
        <p>This needs to know who you are. We'll email you a one-time code. What you were doing stays open and carries on once you're signed in.</p>
        <form data-step="email" novalidate>
          <label for="dgo-signin-email">Work email address</label>
          <input id="dgo-signin-email" class="dgo-input" type="email" autocomplete="email" required value="${esc(email0)}">
          <p class="dgo-field-error" data-error role="alert" hidden></p>
          <footer><button type="button" class="dgo-btn dgo-btn--secondary" data-cancel>Cancel</button><button type="submit" class="dgo-btn dgo-btn--primary" data-send>Email me a code</button></footer>
        </form>
        <form data-step="code" novalidate hidden>
          <p data-sent-to></p>
          <label for="dgo-signin-code">Code from the email</label>
          <input id="dgo-signin-code" class="dgo-input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required>
          <p class="dgo-field-error" data-error role="alert" hidden></p>
          <footer><button type="button" class="dgo-btn dgo-btn--secondary" data-back>Use a different address</button><button type="submit" class="dgo-btn dgo-btn--primary" data-verify>Sign in</button></footer>
        </form>
      </div>
    </section>`;
    document.body.appendChild(wrap);
    createFocusTrap(wrap, { onEscape: () => cancel() });
    const $ = (s) => wrap.querySelector(s);
    const emailForm = $('[data-step="email"]');
    const codeForm = $('[data-step="code"]');
    let address = '';

    const showError = (form, msg) => { const e = form.querySelector('[data-error]'); e.textContent = msg; e.hidden = !msg; };
    const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = label; };
    /* Signed in from another tab (core/otp-identity.js watchOtherTabs): this tab uses that sign-in and carries on. */
    const fromOtherTab = (ev) => { if (ev?.detail?.from === 'another-tab' && isSignedIn()) { close(); resolve(); } };
    window.addEventListener('dgo:signed-in', fromOtherTab);
    const close = () => { window.removeEventListener('dgo:signed-in', fromOtherTab); wrap._releaseTrap?.(); wrap.remove(); open = null; };
    const cancel = () => { close(); reject(Object.assign(new Error('Sign-in was cancelled.'), { code: 'SIGN_IN_CANCELLED' })); };

    $('[data-cancel]').addEventListener('click', cancel);
    $('[data-back]').addEventListener('click', () => { codeForm.hidden = true; emailForm.hidden = false; $('#dgo-signin-email').focus(); });

    emailForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      address = $('#dgo-signin-email').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return showError(emailForm, 'Enter your work email address.');
      const btn = $('[data-send]');
      busy(btn, true, 'Sending…'); showError(emailForm, '');
      try {
        const r = await requestCode(address);
        if (!r.sent) { showError(emailForm, r.reason || 'The code could not be sent. Try again in a moment.'); return; }
        $('[data-sent-to]').textContent = `We sent a code to ${address}. It expires in a few minutes.`;
        emailForm.hidden = true; codeForm.hidden = false; $('#dgo-signin-code').value = ''; $('#dgo-signin-code').focus();
      } catch (e) {
        showError(emailForm, e?.message || 'The code could not be sent.');
      } finally { busy(btn, false, 'Email me a code'); }
    });

    codeForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const code = $('#dgo-signin-code').value.replace(/\s+/g, '');
      if (!code) return showError(codeForm, 'Enter the code from the email.');
      const btn = $('[data-verify]');
      busy(btn, true, 'Checking…'); showError(codeForm, '');
      try {
        await submitCode(address, code);
        close();
        resolve();
        /* Anything already on screen was drawn for the previous identity (or none). */
        window.dispatchEvent(new CustomEvent('dgo:signed-in'));
      } catch (e) {
        showError(codeForm, e?.message || 'That code was not accepted.');
        busy(btn, false, 'Sign in');
      }
    });

    requestAnimationFrame(() => (email0 ? $('[data-send]') : $('#dgo-signin-email')).focus());
  });
  return open;
}
