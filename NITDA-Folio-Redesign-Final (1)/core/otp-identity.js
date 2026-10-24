// DGO R11.6 — OTP identity.
//
// An identity provider built entirely from Power Automate flows: no external identity
// provider, no vendor SDK, and nothing added to a repository whose architecture is zero-build
// with no runtime dependencies. It satisfies core/auth.js's token-provider contract, so
// turning it on is the same activation path docs/architecture/AUTHENTICATION_CONTRACT.md already describes.
//
// THE SHAPE OF THE THING
//   1. requestCode(email)         -> OTP_GENERATE mails a one-time code.
//   2. submitCode(email, code)    -> OTP_VERIFY exchanges it for a signed, expiring proof.
//   3. The proof is held here and handed to core/auth.js on demand.
//
// WHY A PROVIDER THAT CANNOT ACQUIRE SILENTLY
// getAccessToken() calls the registered provider whenever it needs a token, expecting
// acquisition to be non-interactive. OTP is interactive by construction — a human reads a
// mailbox. So this provider never initiates: it returns the proof obtained by submitCode()
// and otherwise throws SIGN_IN_REQUIRED, which the shell turns into a sign-in prompt. A
// provider that silently returned "no token" instead would let a governed action proceed
// looking authenticated and unauthorised, which is the ambiguity the enforced posture
// exists to remove.
//
// WHAT THIS DOES NOT DO
// It does not make anything server-authoritative on its own. The proof is only worth what
// the FLOW does with it: every flow must verify the signature and expiry itself and derive
// the role from DGO_UserDirectory rather than trusting any field the client sent. The
// client half cannot check its own work — see docs/folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md.

import { invokeObsidianAction } from './api.js';
import { registerTokenProvider, clearToken } from './auth.js';
import { AuditLog } from './audit-log.js';
import { State } from './state.js';

/** Thrown when a governed action needs identity and nobody has signed in yet. */
export const SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED';

const STORAGE_KEY = 'dgo.r11.identity.proof';

let _proof = null; // { token, expiresAt, claims }

/* ------------------------------------------------------------------ *
 * Proof persistence
 *
 * One sign-in for the whole browser (owner, 2026-10-20). The proof is kept in localStorage, so
 * every tab of the Workspace uses it and it survives a reload and a browser restart, until the
 * expiry the flow stamped on it (4 hours) or until the person signs out, which ends it in every
 * tab. It used to be kept in sessionStorage, which belongs to one tab: a new tab, and every link
 * in a task e-mail, asked for a new code. A proof a tab still holds in sessionStorage from before
 * this change is moved across the first time it is read.
 *
 * The trade-off the owner accepted: anyone who uses the same browser profile before the proof
 * expires acts as the person who signed in. Sign out (the account menu) ends it at once.
 * ------------------------------------------------------------------ */

function safeStore(kind) {
  try { const s = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage; return s || null; } catch { return null; }
}

function persist(proof) {
  for (const kind of ['local', 'session']) {
    const s = safeStore(kind);
    if (!s) continue;
    try {
      if (proof && kind === 'local') s.setItem(STORAGE_KEY, JSON.stringify(proof));
      else s.removeItem(STORAGE_KEY);
    } catch { /* quota or privacy mode — the proof simply does not survive reload */ }
  }
}

function read(kind) {
  const s = safeStore(kind);
  if (!s) return null;
  try { const raw = s.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function restore() {
  const shared = read('local');
  if (isLive(shared)) return shared;
  const tab = read('session');
  if (isLive(tab)) { persist(tab); return tab; }
  if (shared || tab) persist(null); /* expired: leave nothing behind */
  return null;
}

/** The flow stamps utcNow() plus 4 hours, with seven decimal places on the seconds. Not every browser parses more
 *  than three, so the fraction is cut to milliseconds before it is read. */
export function parseExpiry(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return Date.parse(String(value || '').replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '$1'));
}

const isLive = p => Boolean(p?.token) && Number(p.expiresAt) > Date.now();

/* ------------------------------------------------------------------ *
 * The two calls
 * ------------------------------------------------------------------ */

/**
 * Ask OTP_GENERATE to mail a code.
 *
 * Returns `{ sent, expiresAt, reason }`. `sent:false` is reported honestly rather than
 * being smoothed into a "check your inbox" the platform cannot stand behind — the portal's
 * VERIFY contract makes the same demand for the same reason.
 */
export async function requestCode(email) {
  const address = String(email || '').trim().toLowerCase();
  if (!address) throw new Error('An email address is required.');

  /* The flows' vocabulary, not the client's. Both OTP flows read `identifier` and `otp_code` at
     the TOP LEVEL and switch on `action` values `generate`/`verify` — see ITEM-44. `flatPayload`
     is the client's existing option for exactly this: a flow that reads its fields where they
     were sent rather than under an envelope. Web - OTP Generate writes item/Title straight from
     `identifier` with no coalesce, so the name is load-bearing, not decorative. */
  /* skipConfirmation: pressing "Email me a code" IS the confirmation. The generic "Confirm
     OTP_GENERATE execution" preview would ask someone signing in to approve a flow call. */
  const res = await invokeObsidianAction('REQUEST_OTP', { identifier: address }, { flatPayload: true, skipConfirmation: true });
  const sent = res?.sent !== false && res?.ok !== false;

  AuditLog.record({
    event: sent ? 'audit:otp-requested' : 'audit:otp-request-failed',
    actor: { email: address },
    meta: { reason: res?.reason || '' },
  });

  return {
    sent,
    expiresAt: res?.expiresAt || null,
    reason: res?.reason || (sent ? '' : 'The code could not be sent.'),
  };
}

/**
 * Exchange a code for a proof.
 *
 * The flow is the only party that can decide this. It compares the code in constant time,
 * expires and single-uses it, looks the caller up in DGO_UserDirectory, and returns the
 * role IT resolved. The role in the response is therefore a statement by the server about
 * the caller, which is exactly what the local `users` array never was.
 */
export async function submitCode(email, code) {
  const address = String(email || '').trim().toLowerCase();
  const entered = String(code || '').trim();
  if (!address || !entered) throw new Error('Both the email address and the code are required.');

  const res = await invokeObsidianAction('VERIFY_OTP', { identifier: address, otp_code: entered }, { flatPayload: true, skipConfirmation: true });

  const token = res?.token || res?.verification || res?.proof;
  if (!token || res?.ok === false || res?.verified === false) {
    AuditLog.record({ event: 'audit:otp-verify-denied', actor: { email: address }, meta: { reason: res?.reason || 'rejected' } });
    throw new Error(res?.reason || 'That code was not accepted.');
  }

  // Claims come from the flow, never from anything the browser knows. `roles` is an array
  // so AuthConfig.roleClaimMap can map it exactly as an identity provider's group claim
  // would be mapped — the enforced path in core/auth.js needs no special case for OTP.
  const claims = res.claims || {
    preferred_username: res.email || address,
    email: res.email || address,
    name: res.name || res.fullName || address,
    roles: res.roles || (res.role ? [res.role] : []),
  };

  /* A LIFETIME THE FLOW DID NOT STATE IS NOT A LIFETIME ANYONE CHOSE.
     This used to fall back to `Date.now() + 8 hours` when OTP_VERIFY returned no expiresAt.
     Eight hours then became the platform's session policy by accident, on every proof the
     flow forgot to stamp — and because the flow is the thing that must verify expiry, a flow
     that does not issue one is a flow that cannot check one. The approved lifetimes are in
     docs/architecture/AUTHENTICATION_CONTRACT.md §2a; the flow states them, the client only
     reads them. An unstamped proof is refused here rather than quietly given a long life. */
  const stamped = parseExpiry(res.expiresAt);
  if (!Number.isFinite(stamped) || stamped <= Date.now()) {
    throw new Error('OTP_VERIFY returned no usable expiresAt — the flow must stamp every proof '
      + 'with its expiry (AUTHENTICATION_CONTRACT.md §2a). Refusing to assume a lifetime.');
  }

  _proof = { token, expiresAt: stamped, claims };
  persist(_proof);
  clearToken(); // drop any cached token so the next call takes the new proof

  AuditLog.record({
    event: 'audit:otp-verified',
    actor: { email: address },
    meta: { expiresAt: new Date(_proof.expiresAt).toISOString(), roles: claims.roles || [] },
  });

  return { ...(_proof.claims), expiresAt: _proof.expiresAt };
}

/** Discard the proof, in this tab and (through the shared storage) in every other tab. */
export function signOut() {
  _proof = null;
  persist(null);
  clearToken();
  AuditLog.record({ event: 'audit:signed-out', actor: State.get()?.profile || {} });
}

/**
 * Follow sign-in and sign-out made in another tab. The browser fires `storage` in every OTHER tab when the shared
 * proof changes; this tab then takes the new proof, or drops its own, and says so with the same events a sign-in
 * in this tab raises (dgo:signed-in) or a sign-out (dgo:signed-out), which shared/shell.js answers.
 */
export function watchOtherTabs(target = globalThis) {
  if (!target?.addEventListener) return false;
  target.addEventListener('storage', (ev) => {
    if (ev.key !== STORAGE_KEY && ev.key !== null) return;
    const next = restore();
    const had = isLive(_proof);
    _proof = next;
    clearToken();
    try {
      if (isLive(next)) target.dispatchEvent(new CustomEvent('dgo:signed-in', { detail: { from: 'another-tab' } }));
      else if (had) target.dispatchEvent(new CustomEvent('dgo:signed-out', { detail: { from: 'another-tab' } }));
    } catch { /* no CustomEvent: nothing is drawn */ }
  });
  return true;
}

/** Whether a live proof is held right now. */
export function isSignedIn() {
  if (isLive(_proof)) return true;
  _proof = restore();
  return isLive(_proof);
}

/** The identity the held proof asserts, or null. Display only — the flow decides. */
export function heldIdentity() {
  if (!isSignedIn()) return null;
  const c = _proof.claims || {};
  return Object.freeze({
    email: c.preferred_username || c.email || '',
    name: c.name || c.email || '',
    roles: c.roles || [],
    expiresAt: _proof.expiresAt,
  });
}

/**
 * Register this module as core/auth.js's token provider.
 *
 * Call once at boot when auth is enforced. Idempotent.
 */
/* ------------------------------------------------------------------ *
 * Asking the person to sign in
 *
 * An action that needs identity used to fail with SIGN_IN_REQUIRED and nothing caught it, so
 * with auth enforced a governed action — acknowledging a task from an emailed link, above all —
 * simply stopped. The shell now registers a prompt here. When a proof is needed and none is
 * held, the provider asks for one and WAITS, then hands the new proof to the action that asked,
 * which carries on exactly where it was: same route, same task, same deep-link context.
 * Concurrent callers share one prompt. Cancelling rejects every waiter with SIGN_IN_REQUIRED.
 * ------------------------------------------------------------------ */

let _prompt = null;
let _pending = null;

/** Register the UI that collects an email and a code. It must resolve once submitCode succeeds. */
export function setSignInPrompt(fn) { _prompt = typeof fn === 'function' ? fn : null; }

function signInRequired() {
  const err = new Error('Sign in with the code sent to your email address.');
  err.code = SIGN_IN_REQUIRED;
  return err;
}

async function acquireInteractively() {
  if (!_prompt) throw signInRequired();
  if (!_pending) {
    _pending = (async () => {
      try { await _prompt(); } finally { _pending = null; }
    })();
  }
  try { await _pending; } catch { throw signInRequired(); }
  if (!isSignedIn()) throw signInRequired();
}

export function installOtpProvider() {
  registerTokenProvider(async () => {
    if (!isSignedIn()) await acquireInteractively();
    return { token: _proof.token, expiresAt: _proof.expiresAt, claims: _proof.claims };
  });
  _proof = restore();
  return true;
}

export const OtpIdentity = Object.freeze({
  requestCode, submitCode, signOut, isSignedIn, heldIdentity, installOtpProvider, setSignInPrompt, watchOtherTabs, parseExpiry, SIGN_IN_REQUIRED,
});
export default OtpIdentity;
