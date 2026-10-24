// DGO R11.6 — client for the flow URL capsule registry.
//
// WHAT THE CAPSULE REGISTRY IS, AND WHY THIS PLATFORM CARES
//
// Every endpoint in this estate is a signed Power Automate URL invoked directly by the browser.
// That is the approved architecture and it has one irreducible consequence: the signature reaches
// the browser, so it can be rotated but never retired, and anyone who obtains it can call the flow.
//
// The capsule registry is the alternative posture, for deployments that can run a server. It holds
// each complete signed URL as one opaque string that it never returns, and exposes an alias
// instead: `POST /invoke/orders.create` with an invocation token. The signature stops at the
// registry. It also gives the estate three things the direct model structurally cannot have —
// version history per alias with rollback, an enable/disable switch that takes effect without a
// redeploy, and an audit row per invocation.
//
// WHY THE CLIENT LIVES HERE AND THE SERVICE DOES NOT
//
// The service is `flowcapsule.py`: Python, SQLite, standard library only, deployed beside the
// tenant. It cannot be part of a zero-build browser platform. What belongs here is the
// administration of it — an operator who has a registry should be able to see its aliases, verify
// one, roll one back and disable one from the same console they use for everything else, rather
// than from a shell on the server.
//
// THE TOKEN IS NEVER PERSISTED
//
// Administration needs a bearer token. This module holds it in a module-scoped variable for the
// life of the tab and offers no way to store it. That is deliberate and it is the same rule the
// rest of this platform follows for signatures: `core/state.js` persists endpoint overrides but
// this platform has never written a credential to localStorage, and a registry admin token is a
// credential that can rotate every URL in the estate. Requiring it to be re-entered per session
// is the cost; it is a smaller cost than a token sitting in a browser profile on a shared laptop.
//
// NOTHING HERE INVOKES A BUSINESS FLOW. The client exposes health, list, versions, verify,
// enable, disable and rollback. `POST /invoke/{alias}` is deliberately absent: invoking a flow is
// the platform's own job through its own governed path, and a console that can invoke arbitrary
// aliases with an operator's token is a console that can dispatch correspondence by accident.

import { EndpointFormation } from './endpoint-formation.js';

/** Routes as the service declares them. Kept together so a service upgrade is one edit. */
export const ROUTES = Object.freeze({
  health: () => '/health',
  flows: () => '/admin/flows',
  versions: (alias) => `/admin/flows/${encodeURIComponent(alias)}/versions`,
  verify: (alias) => `/admin/flows/${encodeURIComponent(alias)}/verify`,
  rollback: (alias, version) => `/admin/flows/${encodeURIComponent(alias)}/rollback/${encodeURIComponent(version)}`,
  enable: (alias) => `/admin/flows/${encodeURIComponent(alias)}/enable`,
  disable: (alias) => `/admin/flows/${encodeURIComponent(alias)}/disable`,
  register: () => '/admin/flows',
});

/** The service's alias grammar, enforced before a call rather than after a 400. */
export const ALIAS_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
export const METADATA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

/* Session-scoped, never persisted. See the note above. */
let session = { baseUrl: '', token: '', at: '' };

export function connect({ baseUrl, token }) {
  const url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('The registry address must be an absolute http:// or https:// URL.');
  /* http:// is permitted only for a loopback address. The registry is designed to sit behind a
     reverse proxy on 127.0.0.1; anywhere else, plain http would put the admin token on the wire. */
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/i.test(url);
  if (url.startsWith('http://') && !isLoopback) {
    throw new Error('Plain http is only accepted for a loopback address. Anywhere else it would send the administration token in clear text.');
  }
  if (!String(token || '').trim()) throw new Error('An administration bearer token is required.');
  session = { baseUrl: url, token: String(token).trim(), at: new Date().toISOString() };
  return status();
}

export function disconnect() {
  session = { baseUrl: '', token: '', at: '' };
  return status();
}

/** What the suite may display: never the token, and never its length. */
export const status = () => Object.freeze({ connected: Boolean(session.baseUrl && session.token), baseUrl: session.baseUrl, connectedAt: session.at });

async function call(pathname, { method = 'GET', body = null, timeoutMs = 30000, fetchImpl } = {}) {
  if (!session.baseUrl || !session.token) throw new Error('Not connected to a capsule registry.');
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('This runtime has no fetch implementation.');

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const started = Date.now();
  try {
    const res = await doFetch(session.baseUrl + pathname, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${session.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
    const ms = Date.now() - started;

    if (json === null) {
      throw new Error(`The registry answered HTTP ${res.status} with a non-JSON body. Something other than the registry answered — check the proxy in front of it.`);
    }
    if (!res.ok) {
      /* The service's own error vocabulary, surfaced as it wrote it. Translating UNAUTHORIZED
         into "something went wrong" loses the one word that tells an operator which of the two
         tokens they pasted. */
      const err = new Error(json.message || `The registry refused the request (HTTP ${res.status}).`);
      err.code = json.code || `HTTP_${res.status}`;
      err.status = res.status;
      err.details = json.details ?? null;
      err.correlationId = json.correlationId || '';
      throw err;
    }
    return { ok: true, status: res.status, ms, body: json };
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`The registry did not answer within ${timeoutMs} ms.`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Read
 * ------------------------------------------------------------------ */

/** Health needs no token, but is called through the same path so a wrong base URL fails once. */
export async function health(options = {}) {
  const res = await call(ROUTES.health(), options);
  return res.body;
}

/**
 * Every alias, with the state the suite renders.
 *
 * The registry returns a fingerprint per alias and never the URL. That fingerprint is the whole
 * point of the list: an administrator can compare it against `EndpointFormation.fingerprint()`
 * of the URL in their own hand and establish that the two match, without either side
 * transmitting the URL.
 */
export async function listFlows(options = {}) {
  const res = await call(ROUTES.flows(), options);
  return (res.body?.flows || []).map((f) => ({
    alias: f.alias,
    enabled: Boolean(f.enabled),
    activeVersion: f.active_version ?? null,
    fingerprint: f.fingerprint || '',
    flowIdentity: f.flow_identity || '',
    environment: f.environment || '',
    contractVersion: f.contract_version || '',
    verifiedAt: f.verified_at || '',
    updatedAt: f.updated_at || '',
  }));
}

export async function versions(alias, options = {}) {
  const res = await call(ROUTES.versions(alias), options);
  return (res.body?.versions || []).map((v) => ({
    version: v.version,
    fingerprint: v.fingerprint || '',
    flowIdentity: v.flow_identity || '',
    environment: v.environment || '',
    contractVersion: v.contract_version || '',
    verifiedAt: v.verified_at || '',
    createdBy: v.created_by || '',
  }));
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */

/** Re-run the live identity handshake against the alias's active version. */
export async function verify(alias, options = {}) {
  const res = await call(ROUTES.verify(alias), { method: 'POST', ...options });
  return res.body;
}

export async function setEnabled(alias, enabled, options = {}) {
  const res = await call(enabled ? ROUTES.enable(alias) : ROUTES.disable(alias), { method: 'POST', ...options });
  return res.body;
}

/**
 * Activate a retained version.
 *
 * The registry re-checks the stored URL's integrity and performs a live identity verification
 * before it activates anything, so a rollback to a version whose flow has since been deleted
 * fails rather than leaving the alias pointing at nothing.
 */
export async function rollback(alias, version, options = {}) {
  const res = await call(ROUTES.rollback(alias, version), { method: 'POST', ...options });
  return res.body;
}

/**
 * Register or rotate an alias.
 *
 * The URL is inspected here before it is sent — not to duplicate the service's own check, but
 * because the service's rejection arrives as one `FORMATION_FAILED` with a list, after the URL
 * has crossed the network. Catching a trailing newline in the field the operator is looking at
 * is a better place to catch it.
 *
 * The URL is passed through unchanged: byte-for-byte, including anything this client would
 * consider odd. The registry fingerprints the exact string it is given, and a client that
 * helpfully trimmed or re-encoded it would produce a stored URL that no longer matches what the
 * operator copied from Power Automate.
 */
export async function register({ alias, url, flowIdentity, environment, contractVersion }, options = {}) {
  if (!ALIAS_PATTERN.test(String(alias || ''))) {
    throw new Error('The alias must be lower-case, start with a letter, and use only dots or hyphens as separators — for example dgo.fetch-activities.');
  }
  for (const [field, value] of [['flowIdentity', flowIdentity], ['environment', environment], ['contractVersion', contractVersion]]) {
    if (!METADATA_PATTERN.test(String(value || ''))) {
      throw new Error(`${field} is required, and must start with a letter or digit and contain only letters, digits, dot, underscore, plus or hyphen.`);
    }
  }
  const inspection = EndpointFormation.inspect(url);
  if (!inspection.valid) {
    const err = new Error(`The URL was not sent — it fails ${inspection.issues.length} formation rule(s).`);
    err.code = 'FORMATION_FAILED';
    err.details = inspection.issues;
    throw err;
  }
  const res = await call(ROUTES.register(), { method: 'POST', body: { alias, url, flowIdentity, environment, contractVersion }, ...options });
  return res.body;
}

/**
 * What is true about a registry connection, for the suite's status strip.
 *
 * `reachable` and `authorised` are separate on purpose: a registry that answers `/health` but
 * refuses `/admin/flows` means the address is right and the token is wrong, which is a different
 * problem from an address nothing answers.
 */
export async function probe(options = {}) {
  const out = { reachable: false, authorised: false, version: '', aliases: null, error: '' };
  try {
    const h = await health(options);
    out.reachable = true;
    out.version = h?.version || '';
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
  try {
    out.aliases = (await listFlows(options)).length;
    out.authorised = true;
  } catch (e) {
    out.error = e?.code === 'UNAUTHORIZED' || e?.code === 'FORBIDDEN'
      ? 'The registry is reachable and the administration token was refused. Check that the token pasted is the admin token and not the invocation token.'
      : String(e.message || e);
  }
  return out;
}

export const CapsuleClient = Object.freeze({
  connect, disconnect, status, probe, health, listFlows, versions, verify, setEnabled, rollback, register,
  ROUTES, ALIAS_PATTERN, METADATA_PATTERN,
});
export default CapsuleClient;
