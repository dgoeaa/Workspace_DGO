// The one place the mailer talks to Power Automate.
//
// Every call is a POST of JSON to a flow's HTTP trigger URL. The verdicts follow
// docs/folio-Master-Flows-and-Endpoints/reference/HEALTH_CONTRACT.md: the status code alone is not trusted, because an egress
// filter answering with an HTML page looks like a refusal but says nothing about the flow.

import { uid } from './util.js';

/* The signed-in operator's session token (session.js registers the provider). Every call
   carries it unless the caller is automatic setup, which uses the flows' admin key instead. */
let tokenProvider = () => '';
export function useSessionToken(fn) { tokenProvider = fn; }

export class NotConfigured extends Error {
  constructor(key) { super(`${key} has no endpoint URL. Add it in Settings → Endpoints.`); this.key = key; }
}

/**
 * Call one flow.
 * @returns {Promise<{reached:boolean,status:number,ok:boolean,json:any,raw:string,blocked?:boolean,error?:string,ms:number}>}
 */
export async function callFlow(settings, key, body, { timeoutMs = 180000 } = {}) {
  const url = settings.endpoints?.[key];
  if (!url) throw new NotConfigured(key);
  const started = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const token = tokenProvider();
  const sendBody = body && !body.operatorKey && !body.sessionToken && token ? { ...body, sessionToken: token } : body;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sendBody),
      signal: ctl.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const raw = await res.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON */ }
    /* The event names the token this call carried, so a late refusal of a call made before the
       operator signed in again cannot end the new session. */
    if (json?.error?.code === 'SIGN_IN_REQUIRED') globalThis.dispatchEvent?.(new CustomEvent('dgo-mailer:sign-in-required', { detail: { key, token: sendBody?.sessionToken || '' } }));
    return {
      reached: true,
      status: res.status,
      /* The run this call started, when the answer names it: setup reads that run's steps. */
      runId: res.headers?.get?.('x-ms-workflow-run-id') || json?.runId || '',
      /* A 2xx that is not JSON came from something other than the flow (a proxy, a filter): it
         is never taken as success. */
      ok: res.ok && json !== null && json?.success !== false,
      json,
      raw,
      blocked: raw !== '' && json === null,
      ms: Math.round(performance.now() - started),
    };
  } catch (e) {
    return {
      reached: false,
      status: 0,
      ok: false,
      json: null,
      raw: '',
      error: e.name === 'AbortError' ? `No answer within ${Math.round(timeoutMs / 1000)}s` : (e.message || String(e)),
      ms: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The standard request envelope. */
export function envelope(settings, operation, payload = {}, { validationOnly = false } = {}) {
  return {
    operation,
    requestId: uid('req'),
    validationOnly,
    ...(settings.operatorKey ? { operatorKey: settings.operatorKey } : {}),
    operator: { email: settings.operator?.email || '', name: settings.operator?.name || '' },
    payload,
  };
}

/** Call an operation and return its `data`, or throw with the flow's own message. */
export async function op(settings, key, operation, payload = {}, opts = {}) {
  const res = await callFlow(settings, key, envelope(settings, operation, payload, opts), opts);
  if (res.ok) return res.json?.data ?? null;
  const e = new Error(describe(res));
  e.res = res;
  throw e;
}

/** One line a person can act on. */
export function describe(res) {
  if (!res.reached) return `Unreachable: ${res.error}. From a browser this can be a blocked host, DNS, or a CORS refusal.`;
  if (res.blocked) return `HTTP ${res.status} with a non-JSON answer — something between this browser and the tenant replied instead of the flow (proxy or filter).`;
  const e = res.json?.error;
  if (e) return `${e.code || 'ERROR'}: ${e.message || ''}`.trim();
  if (res.status === 401 || res.status === 403) return `HTTP ${res.status}: the trigger refused the call — the URL's signature may be revoked.`;
  if (res.status === 404) return 'HTTP 404: no flow at this URL (deleted, or the URL is wrong).';
  return `HTTP ${res.status}`;
}

/** healthCheck per the health contract. */
export async function health(settings, key) {
  const res = await callFlow(settings, key, { operation: 'healthCheck', validationOnly: true, requestId: uid('hc'), endpointKey: key }, { timeoutMs: 60000 });
  let verdict;
  if (!res.reached) verdict = 'unreachable';
  else if (res.blocked) verdict = 'blocked';
  else if (res.status === 200 && res.json?.validationOnly === true) verdict = res.json?.endpoint?.key === key ? 'healthy' : 'wrong-endpoint-key';
  else if (res.status === 200) verdict = 'not-implemented';
  else verdict = 'refused';
  return { key, verdict, res };
}

/** The identity handshake: the correlation id must come back unchanged. */
export async function verify(settings, key) {
  const correlationId = uid('verify');
  const res = await callFlow(settings, key, { _platform: { operation: 'verify', correlationId } }, { timeoutMs: 60000 });
  let verdict;
  if (!res.reached) verdict = 'unreachable';
  else if (res.blocked) verdict = 'blocked';
  else if (res.json?.verified === true && res.json?.correlationId === correlationId) verdict = res.json?.endpoint?.key === key ? 'verified' : 'wrong-endpoint-key';
  else if (res.json?.verified === true) verdict = 'identity-mismatch';
  else verdict = 'refused';
  return { key, verdict, res };
}
