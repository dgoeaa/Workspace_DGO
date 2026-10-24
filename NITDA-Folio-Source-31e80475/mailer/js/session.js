// Operator sign-in: a code mailed by DGO_MAIL_AUTH, exchanged for a session token.
//
// The token lives in sessionStorage — it dies with the browser session, as the platform's own
// OTP proof does — and the flows look it up on every call, so signing out, expiry and an admin
// switching an operator off all take effect at once. Nothing secret is kept on the device
// beyond this session: there is no operator key in the browser any more.

import { callFlow, describe, useSessionToken } from './api.js';

const STORE = 'dgo-mailer.session';

function storage() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

let current = null;
try { current = JSON.parse(storage()?.getItem(STORE) || 'null'); } catch { current = null; }

export const Session = {
  /** { token, email, name, role, expiresAt } or null. */
  get() {
    if (current && current.expiresAt && Date.parse(current.expiresAt) <= Date.now()) Session.clear();
    return current;
  },
  token() { return Session.get()?.token || ''; },
  active() { return Boolean(Session.get()?.token); },
  set(s) {
    current = s ? { token: s.token, email: s.email || '', name: s.name || '', role: s.role || 'operator', expiresAt: s.expiresAt || null } : null;
    try { if (current) storage()?.setItem(STORE, JSON.stringify(current)); else storage()?.removeItem(STORE); } catch { /* the session lasts for this page only */ }
    globalThis.dispatchEvent?.(new CustomEvent('dgo-mailer:session', { detail: current }));
    return current;
  },
  clear() { Session.set(null); },
};

useSessionToken(() => Session.token());

const fail = (res) => { throw new Error(describe(res)); };

/** Step 1: ask for a code. Answers the same whether or not the address is an operator. */
export async function requestCode(settings, email) {
  const res = await callFlow(settings, 'MAIL_AUTH', { operation: 'requestCode', payload: { email: String(email || '').trim() } }, { timeoutMs: 60000 });
  if (!res.ok) fail(res);
  return res.json.data; // { challengeId, expiresAt, message }
}

/** Step 2: exchange the code for a session. */
export async function verifyCode(settings, challengeId, code) {
  const res = await callFlow(settings, 'MAIL_AUTH', { operation: 'verifyCode', payload: { challengeId, code: String(code || '').trim() } }, { timeoutMs: 60000 });
  if (!res.ok) fail(res);
  const d = res.json.data;
  Session.set({ token: d.token, email: d.email, name: d.name, expiresAt: d.expiresAt });
  const who = await callFlow(settings, 'MAIL_AUTH', { operation: 'whoAmI', sessionToken: d.token }, { timeoutMs: 60000 });
  if (who.ok) Session.set({ ...Session.get(), role: who.json.data.role, name: who.json.data.name || d.name });
  return Session.get();
}

export async function signOut(settings) {
  const token = Session.token();
  Session.clear();
  if (token && settings.endpoints?.MAIL_AUTH) await callFlow(settings, 'MAIL_AUTH', { operation: 'signOut', sessionToken: token }, { timeoutMs: 30000 }).catch(() => {});
}
