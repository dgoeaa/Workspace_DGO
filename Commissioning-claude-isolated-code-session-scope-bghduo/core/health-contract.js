// DGO R11.6 — the non-destructive health contract, and what a probe result is allowed to claim.
//
// THE PROBLEM A HEALTH CHECK HAS IN THIS ARCHITECTURE
//
// Every endpoint here is a Power Automate flow the browser calls directly, and most of them
// write: they assign, dispatch, email and archive. So the obvious health check — call it and see
// whether it answers — is not available, because for two thirds of the estate "checking" it means
// doing it. A console that dispatches correspondence as a side effect of a health check is not a
// console, and this platform shipped without one for exactly that reason.
//
// THREE PROBES, AND WHY EACH EXISTS
//
//   healthContract   POST {operation:'healthCheck', validationOnly:true, requestId}. A flow that
//                    implements the contract branches on `validationOnly` BEFORE any write,
//                    validates its own configuration and connections, and answers 200 with the
//                    endpoint key it believes it is. It writes nothing. This is the only probe
//                    that is safe against a write endpoint, and it is safe only because the flow
//                    makes it so — so a flow that does not implement the contract must be
//                    reported as unimplemented, never assumed harmless.
//
//   identityVerify   POST {_platform:{operation:'verify', correlationId}}. The flow-capsule
//                    registry's handshake: the flow echoes its own identity, environment and
//                    contract version together with the correlation id it was given. This is the
//                    only probe that proves WHICH flow answered. A URL pointing at the wrong
//                    workflow passes every other check in this platform — it succeeds, against
//                    the wrong flow — and this is what catches it at the tenant rather than in
//                    the register.
//
//   readOnlyCall     The endpoint's own declared read contract. Available only where
//                    EndpointContracts says `readOnly`, and used because it exercises the real
//                    path a feature will take rather than a contract the flow implements
//                    specially.
//
// THE FIELD THAT CARRIES THE WEIGHT IS `reached`, NOT `status`
//
// Power Automate refuses a call with JSON. A corporate egress filter refuses it with an HTML
// error page and a status line that looks identical. Reading the second as "this signature is
// revoked" has happened in this estate: it produced a report declaring 39 flows dead on a machine
// whose network simply blocked the host. So a non-JSON body means the tenant was never reached,
// and every result says so instead of drawing a conclusion the call cannot support.
//
// KEY ECHO. `healthContract` compares the key the flow reports against the key that was called.
// A mismatch means two contract keys are wired to one flow, or a key is wired to the wrong one.
// It is reported as a distinct outcome because a 200 with the wrong key is a pass by every other
// measure and is the fault that hurts most.

import { EndpointFormation } from './endpoint-formation.js';

/** How the health contract is addressed. Kept here so the flow-side documentation has one source. */
export const HEALTH_CONTRACT = Object.freeze({
  request: Object.freeze({ operation: 'healthCheck', validationOnly: true }),
  requiredResponseKeys: Object.freeze(['success', 'validationOnly', 'endpoint']),
  documentation: 'docs/reference/HEALTH_CONTRACT.md',
});

/** How the identity handshake is addressed. Mirrors the flow-capsule registry's `verify`. */
export const IDENTITY_VERIFY = Object.freeze({
  envelope: '_platform',
  operation: 'verify',
  echoedKeys: Object.freeze(['verified', 'flowIdentity', 'environment', 'contractVersion', 'correlationId']),
});

const uuid = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/**
 * Outcomes, ordered by how much an administrator should care.
 *
 * `wrong-endpoint-key` outranks a refusal because a refusal fails loudly at first use, while a
 * flow answering 200 under another key succeeds — against the wrong flow. The suite sorts by
 * this, so the thing that fails silently is the thing at the top of the list.
 */
export const OUTCOME_SEVERITY = Object.freeze({
  'wrong-endpoint-key': 1,
  'identity-mismatch': 2,
  'refused': 3,
  'not-implemented': 4,
  'unreachable': 5,
  'blocked': 6,
  'not-configured': 7,
  'unsafe-to-probe': 8,
  'healthy': 99,
});

export const OUTCOME_LABEL = Object.freeze({
  'healthy': 'healthy',
  'wrong-endpoint-key': 'WRONG KEY ANSWERED',
  'identity-mismatch': 'IDENTITY MISMATCH',
  'refused': 'refused',
  'not-implemented': 'contract not implemented',
  'unreachable': 'no answer',
  'blocked': 'answered by something else',
  'not-configured': 'not configured',
  'unsafe-to-probe': 'not safe to probe',
});

/**
 * One HTTP attempt, with the timeout the caller sets and no retry of its own.
 *
 * Retries are the caller's decision because they are not free here: a retry against a write
 * endpoint is a second write. `probe()` retries only what it knows is safe.
 */
async function attempt(url, body, { method = 'POST', timeoutMs = 30000, headers = {}, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') return { transport: 'unavailable', error: 'This runtime has no fetch implementation.' };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const started = Date.now();
  try {
    const res = await doFetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    const text = await res.text();
    let json = null;
    let isJson = false;
    try { json = JSON.parse(text); isJson = true; } catch { /* not JSON — see `reached` below */ }
    return {
      transport: 'answered',
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      isJson,
      json,
      /* Truncated. A blocked call answers with a whole HTML error page, and putting that in a
         result record that gets exported turns a diagnostic into a 40 KB attachment. */
      text: text.slice(0, 500),
    };
  } catch (e) {
    return {
      transport: e?.name === 'AbortError' ? 'timeout' : 'network',
      ms: Date.now() - started,
      error: e?.name === 'AbortError' ? `No answer within ${timeoutMs} ms.` : String(e?.message || e),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Shape one attempt into the common result record every probe returns. */
function judge(base, res) {
  if (res.transport === 'unavailable') return { ...base, outcome: 'unreachable', reached: false, note: res.error };
  if (res.transport === 'timeout') return { ...base, outcome: 'unreachable', reached: false, ms: res.ms, note: res.error };
  if (res.transport === 'network') {
    return {
      ...base,
      outcome: 'unreachable',
      reached: false,
      ms: res.ms,
      /* A browser reports a CORS refusal and a DNS failure identically — as a TypeError with no
         detail — so this says what it cannot distinguish rather than picking one. */
      note: `${res.error}. From a browser this is indistinguishable between a blocked host, a DNS `
        + 'failure and a CORS refusal; the flow may be healthy and unreachable from this network.',
    };
  }

  const common = { ...base, status: res.status, ms: res.ms, reached: res.isJson };
  if (!res.isJson) {
    return {
      ...common,
      outcome: 'blocked',
      note: `HTTP ${res.status} with a non-JSON body. Power Automate always answers JSON, so `
        + 'something between this browser and the tenant answered instead — an egress filter or a '
        + 'proxy. Nothing can be concluded about the endpoint from this.',
    };
  }
  return { ...common, body: res.json };
}

/* ------------------------------------------------------------------ *
 * The three probes
 * ------------------------------------------------------------------ */

/**
 * The non-destructive health contract. Safe against a write endpoint IF the flow implements it.
 *
 * A flow that does not implement it answers in one of two ways, and they are reported
 * differently on purpose: a 4xx or an error body means the flow refused the unknown operation
 * and wrote nothing — `not-implemented`, and safe. A 200 whose body does not echo
 * `validationOnly` means the flow ignored the flag, which means it may have taken the write
 * path. That is reported as `not-implemented` too but with the warning spelled out, because the
 * operator needs to know a write may just have happened.
 */
export async function healthContract(key, url, options = {}) {
  const requestId = options.requestId || uuid();
  const base = { key, probe: 'healthContract', at: new Date().toISOString(), requestId, target: EndpointFormation.mask(url) };
  const res = await attempt(url, { ...HEALTH_CONTRACT.request, requestId, endpointKey: key }, options);
  const out = judge(base, res);
  if (out.outcome) return out;

  const body = out.body || {};
  const echoed = body.endpoint?.key ?? body.endpointKey ?? null;

  if (!out.ok) {
    return { ...out, outcome: 'refused', note: `The flow answered HTTP ${out.status} with JSON. It was reached and it refused the call.` };
  }
  if (body.validationOnly !== true) {
    return {
      ...out,
      outcome: 'not-implemented',
      note: 'The flow answered 200 but did not echo validationOnly:true, so it did not take the '
        + 'validation branch. It does not implement the health contract, and this call may have '
        + 'reached its write path. Do not repeat it against this endpoint.',
    };
  }
  if (echoed && String(echoed) !== String(key)) {
    return {
      ...out,
      outcome: 'wrong-endpoint-key',
      echoedKey: String(echoed),
      note: `Called as ${key}; the flow reports itself as ${echoed}. The address is valid and it `
        + 'answers — as the wrong flow. Nothing else in this platform detects that.',
    };
  }
  if (body.success === false) {
    return { ...out, outcome: 'refused', note: `The flow validated itself and reported a failure: ${String(body.error ?? body.message ?? 'no reason given')}.` };
  }
  return {
    ...out,
    outcome: 'healthy',
    echoedKey: echoed ? String(echoed) : '',
    note: echoed
      ? `Validated its configuration and confirmed it is ${echoed}. Nothing was written.`
      : 'Validated its configuration and wrote nothing. It did not name itself, so this does not '
        + 'confirm which flow answered — run the identity check for that.',
  };
}

/**
 * The identity handshake. Proves which flow answered, which no other check here can do.
 *
 * The correlation id is generated per call and must come back unchanged. Without it a cached or
 * replayed response is indistinguishable from a live one.
 */
export async function identityVerify(key, url, expected = {}, options = {}) {
  const correlationId = options.correlationId || uuid();
  const base = { key, probe: 'identityVerify', at: new Date().toISOString(), correlationId, target: EndpointFormation.mask(url) };
  const res = await attempt(url, { [IDENTITY_VERIFY.envelope]: { operation: IDENTITY_VERIFY.operation, correlationId } }, options);
  const out = judge(base, res);
  if (out.outcome) return out;

  const body = out.body || {};
  if (!out.ok || body.verified !== true) {
    return { ...out, outcome: 'not-implemented', note: `The flow answered HTTP ${out.status} but did not complete the identity handshake. It does not implement it.` };
  }
  if (String(body.correlationId || '') !== correlationId) {
    return {
      ...out,
      outcome: 'identity-mismatch',
      note: 'The answer did not carry the correlation id sent with it. This response was not '
        + 'produced by this call — it is cached, replayed, or from something impersonating the flow.',
    };
  }
  const mismatches = Object.entries(expected)
    .filter(([k, v]) => v && String(body[k] ?? '') !== String(v))
    .map(([k, v]) => ({ field: k, expected: String(v), actual: String(body[k] ?? '—') }));
  if (mismatches.length) {
    return {
      ...out,
      outcome: 'identity-mismatch',
      mismatches,
      note: `The flow answered, and it is not the one expected: ${mismatches.map((m) => `${m.field} is ${m.actual}, expected ${m.expected}`).join('; ')}.`,
    };
  }
  return {
    ...out,
    outcome: 'healthy',
    identity: { flowIdentity: body.flowIdentity ?? '', environment: body.environment ?? '', contractVersion: body.contractVersion ?? '' },
    note: 'Confirmed its own identity, environment and contract version against a correlation id issued for this call.',
  };
}

/**
 * The endpoint's declared read contract.
 *
 * Refuses outright unless the contract says `readOnly`. That refusal is the point: it is what
 * stops "run every check" from meaning "invoke every write endpoint", and it is a returned
 * result rather than a thrown error so that a batch reports the skip instead of aborting.
 */
export async function readOnlyCall(key, url, contract, options = {}) {
  const base = { key, probe: 'readOnlyCall', at: new Date().toISOString(), target: EndpointFormation.mask(url) };
  if (!contract || contract.readOnly !== true) {
    return {
      ...base,
      outcome: 'unsafe-to-probe',
      reached: false,
      note: contract
        ? 'This endpoint writes. Calling it is doing the thing, not checking it — use the health contract instead.'
        : 'No contract is on record for this key, so nothing here can say whether calling it writes. It is not called.',
    };
  }
  const res = await attempt(url, contract.operation ? { action: contract.operation } : {}, { method: contract.method || 'POST', timeoutMs: contract.timeoutMs || 30000, ...options });
  const out = judge(base, res);
  if (out.outcome) return out;
  if (!out.ok) return { ...out, outcome: 'refused', note: `The flow answered HTTP ${out.status} with JSON. It was reached and it refused the call.` };
  return {
    ...out,
    outcome: 'healthy',
    note: `JSON returned · keys: ${Object.keys(out.body || {}).slice(0, 6).join(', ') || 'none'}`,
  };
}

/* ------------------------------------------------------------------ *
 * Batch
 * ------------------------------------------------------------------ */

/**
 * Run one probe across many endpoints, sequentially.
 *
 * Sequential and not parallel. Twenty-five simultaneous calls to one tenant is the shape of an
 * abuse pattern, gets throttled, and produces failures that read as endpoint faults. The suite
 * reports progress per endpoint instead, which is more useful than finishing sooner.
 *
 * `retries` applies only to `unreachable` — a transport failure that wrote nothing. A refusal is
 * never retried: the flow answered, and asking again does not change its answer.
 */
export async function runProbes(targets, { probe = 'healthContract', retries = 1, onResult, ...options } = {}) {
  const rows = [];
  for (const t of targets) {
    if (!t.url) {
      const row = { key: t.key, probe, at: new Date().toISOString(), outcome: 'not-configured', reached: false, target: '', note: 'No URL resolves for this key in this deployment, so there is nothing to call.' };
      rows.push(row);
      onResult?.(row, rows.length, targets.length);
      continue;
    }
    let row;
    for (let attemptNo = 0; attemptNo <= retries; attemptNo++) {
      row = probe === 'identityVerify' ? await identityVerify(t.key, t.url, t.expected || {}, options)
        : probe === 'readOnlyCall' ? await readOnlyCall(t.key, t.url, t.contract, options)
          : await healthContract(t.key, t.url, options);
      if (row.outcome !== 'unreachable') break;
      row.attempts = attemptNo + 1;
    }
    rows.push(row);
    onResult?.(row, rows.length, targets.length);
  }
  return rows;
}

/**
 * What a set of probe results is entitled to claim.
 *
 * `conclusive` is the field to read before believing any of it. When nothing reached the tenant,
 * the run measured the network and not the estate — and a summary that reports "0 healthy of 25"
 * without saying so has produced a false estate-wide failure report before, in this estate.
 */
export function summariseProbes(rows) {
  const answered = rows.filter((r) => r.reached);
  const counts = {};
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
  const attempted = rows.filter((r) => r.outcome !== 'not-configured' && r.outcome !== 'unsafe-to-probe');
  return {
    total: rows.length,
    attempted: attempted.length,
    reached: answered.length,
    healthy: rows.filter((r) => r.outcome === 'healthy').length,
    conclusive: attempted.length === 0 || answered.length > 0,
    counts,
    worst: rows.map((r) => r.outcome).sort((a, b) => (OUTCOME_SEVERITY[a] ?? 50) - (OUTCOME_SEVERITY[b] ?? 50))[0] || 'healthy',
    note: attempted.length && !answered.length
      ? 'Nothing reached Power Automate. Every call was answered by something else, so this run '
        + 'measured the network between this browser and the tenant — not the endpoints. No '
        + 'conclusion about any endpoint or signature can be drawn from it.'
      : '',
  };
}

export const HealthContract = Object.freeze({
  healthContract, identityVerify, readOnlyCall, runProbes, summariseProbes,
  HEALTH_CONTRACT, IDENTITY_VERIFY, OUTCOME_SEVERITY, OUTCOME_LABEL,
});
export default HealthContract;
