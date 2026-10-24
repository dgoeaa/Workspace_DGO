// Sign in: your NITDA address, then the code DGO_MAIL_AUTH mails to it.

import { esc, isEmail } from '../util.js';
import { requestCode, verifyCode } from '../session.js';

const state = { stage: 'email', email: '', challengeId: '', expiresAt: '', error: '', info: '' };

export function reset(message = '') {
  Object.assign(state, { stage: 'email', challengeId: '', expiresAt: '', error: '', info: message });
}

export async function render(app) {
  const s = app.state.settings;
  const html = `
    <section class="panel signin" aria-labelledby="signin-h">
      <h1 id="signin-h">Sign in</h1>
      <p>The mailer sends letters for the Office of the Director-General/CEO. Sign in with your NITDA email address: a one-time code is mailed to it.</p>
      ${state.info ? `<div class="callout">${esc(state.info)}</div>` : ''}
      ${state.error ? `<div class="callout callout-bad" role="alert">${esc(state.error)}</div>` : ''}
      ${state.stage === 'email' ? `
        <form data-email class="form-grid">
          <label class="field span-2"><span>Your email address</span>
            <input name="email" type="email" autocomplete="email" inputmode="email" required value="${esc(state.email || s.operator?.email || '')}" placeholder="name@nitda.gov.ng"></label>
          <div class="form-actions span-2"><button class="btn btn-primary" type="submit">Send me a code</button></div>
        </form>` : `
        <p>A code has been mailed to <strong>${esc(state.email)}</strong> if it belongs to a mailer operator. It works once, for 10 minutes. Check the inbox (and junk folder) of that address.</p>
        <form data-code class="form-grid">
          <label class="field"><span>The 8-digit code</span>
            <input name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required></label>
          <div class="form-actions span-2">
            <button class="btn btn-primary" type="submit">Sign in</button>
            <button class="btn" type="button" data-resend>Send a new code</button>
            <button class="btn btn-ghost" type="button" data-other>Use a different address</button>
          </div>
        </form>`}
      <p class="small muted">Only people on the mailer's operator list can sign in; a mailer admin adds them. You stay signed in until you sign out, close the browser, or ${esc(String(12))} hours pass.</p>
    </section>`;

  const bind = (root) => {
    const busy = (form, on) => form.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    const ask = async (form) => {
      busy(form, true);
      try {
        const d = await requestCode(s, state.email);
        Object.assign(state, { stage: 'code', challengeId: d.challengeId, expiresAt: d.expiresAt, error: '', info: '' });
      } catch (e) { state.error = e.message; }
      app.render();
    };
    root.querySelector('[data-email]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim().toLowerCase();
      if (!isEmail(email)) { state.error = 'That is not an email address.'; app.render(); return; }
      state.email = email;
      ask(e.target);
    });
    root.querySelector('[data-code]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      busy(e.target, true);
      try {
        await verifyCode(s, state.challengeId, e.target.code.value);
        reset();
        await app.afterSignIn();
      } catch (err) {
        state.error = err.message;
        if (/CODE_EXPIRED/.test(err.message)) state.stage = 'email';
        app.render();
      }
    });
    root.querySelector('[data-resend]')?.addEventListener('click', (e) => ask(e.target.closest('form')));
    root.querySelector('[data-other]')?.addEventListener('click', () => { reset(); app.render(); });
    root.querySelector('input')?.focus();
  };

  return { title: 'Sign in', html, bind };
}
