// DGO R11.6 — endpoint estate analysis.
//
// WHAT THIS IS, AND WHY IT IS SEPARATE FROM THE CONSOLE THAT DISPLAYS IT
//
// `modules/endpoint-console.js` renders. This decides. Every judgement the console makes about
// the estate — is a key configured, does it point at the flow the tenant says it should, is a
// workflow impersonating a key it does not serve — is computed here, in functions that take
// data and return data and touch no DOM. That is what lets the whole analysis be tested in
// Node without a browser, which is the difference between a console whose numbers are checked
// and one whose numbers are merely rendered.
//
// THE THREE SOURCES IT JOINS, AND WHAT EACH IS FOR
//
//   1. `config/endpoint-atlas.data.js` — generated from the tenant's register by
//      `npm run reconcile`. WHAT THE ESTATE IS: 25 contract keys, 51 workflows, which flow
//      each key must call. This is the authority; where anything disagrees with it, the other
//      thing is wrong.
//   2. `config/endpoints.config.js` — WHAT THIS BUILD KNOWS HOW TO CALL: the contract per key,
//      its method, whether it is read-only, its timeout.
//   3. The resolved runtime URL for each key, via `core/endpoint-registry.js` — WHAT THIS
//      DEPLOYMENT WILL ACTUALLY CALL, after the manifest, operator overrides and packaged
//      defaults have been applied.
//
// The gap between 1 and 3 is the entire subject. A URL that is present, HTTPS and correctly
// shaped, on a workflow that is not the one the register names, passes every check this
// platform had before the register arrived and calls the wrong flow forever.
//
// WHAT IT NEVER DOES. It never returns a signature. `describeKey` reports whether one is
// present and how long it is; the value is redacted at the point of resolution and never
// travels further. tests/endpoint-console.test.mjs asserts that on the rendered output too,
// because an analysis that is safe and a view that leaks are not the same guarantee.

import { EndpointAtlas } from '../config/endpoint-atlas.data.js';
import { EndpointContracts, EndpointKeys } from '../config/endpoints.config.js';
import { EndpointRegistry } from './endpoint-registry.js';

/**
 * A Power Automate signature is base64url of an HMAC-SHA256: 32 bytes, 43 characters unpadded.
 * There is no legitimate variation, which is what makes length a usable verdict rather than a
 * heuristic — anything else is a truncated copy or something pasted onto the end.
 */
export const SIGNATURE_LENGTH = 43;

const SIG = /[?&]sig=([A-Za-z0-9_%-]*)/i;
const WORKFLOW_ID = /\/workflows\/([0-9a-f]{32})\b/i;

/** The 32-hex workflow id a URL actually addresses, or '' when it addresses none. */
export function workflowIdOf(url) {
  const m = WORKFLOW_ID.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

/** Signature length only. The value itself is never returned by anything in this module. */
export function signatureLengthOf(url) {
  const m = SIG.exec(String(url || ''));
  if (!m) return null;                       // no sig parameter at all
  return decodeURIComponent(m[1] || '').length;
}

/* ------------------------------------------------------------------ *
 * Per-key state
 * ------------------------------------------------------------------ */

/**
 * Every problem one key can have, in the order an administrator should care about them.
 *
 * Ordered, not alphabetical, and the order is the point: `wrong-flow` outranks `no-signature`
 * because a key with no signature fails loudly at first use, while a key pointing at the wrong
 * flow succeeds — against the wrong flow. The console sorts by this, so the thing that fails
 * silently is the thing at the top of the list.
 */
export const SEVERITY = Object.freeze({
  'wrong-flow': 1,
  'no-contract': 2,
  'unconfigured': 3,
  'no-signature': 4,
  'bad-signature': 5,
  'not-https': 6,
  'placeholder': 7,
  'shares-flow': 90,      // informational
  'ok': 99,
});

const PLACEHOLDER = /YOUR_|REPLACE_ME|CHANGEME|ROTATE_ME|example\.(?:com|org|invalid)|<[^>]*>/i;

/**
 * Join the three sources for one contract key and state its condition.
 *
 * `resolve(key)` supplies the runtime URL. It is injected rather than imported so this can be
 * exercised against a fabricated deployment in tests — the alternative is a test that can only
 * assert whatever the machine it runs on happens to have in config.local.js, which is how a
 * check ends up passing for reasons unrelated to the code.
 */
export function describeKey(key, { resolve, atlas = EndpointAtlas } = {}) {
  const expected = atlas.keys.find((k) => k.key === key) || null;
  const contract = EndpointContracts[key] || null;
  const url = String((resolve ? resolve(key) : '') || '');

  const actualWorkflow = workflowIdOf(url);
  const sigLen = signatureLengthOf(url);
  const problems = [];

  if (!url) {
    problems.push({ code: 'unconfigured', text: 'No URL resolves for this key in this deployment. The feature it serves reports itself unavailable at the moment of use.' });
  } else {
    if (!/^https:/i.test(url)) {
      problems.push({ code: 'not-https', text: 'The URL is not HTTPS. The browser calls this flow directly, so the request would be in clear text.' });
    }
    if (PLACEHOLDER.test(url)) {
      problems.push({ code: 'placeholder', text: 'The URL still contains template text. It was never filled in.' });
    }
    if (sigLen === null) {
      problems.push({ code: 'no-signature', text: 'The URL carries no sig= parameter. It was cut short on copy, and every call will be refused.' });
    } else if (sigLen === 0) {
      problems.push({ code: 'no-signature', text: 'The URL is complete but its signature is blank — the template was generated and never signed.' });
    } else if (sigLen !== SIGNATURE_LENGTH) {
      problems.push({
        code: 'bad-signature',
        text: `The signature is ${sigLen} characters, not ${SIGNATURE_LENGTH}. `
          + `${sigLen < SIGNATURE_LENGTH ? 'It was truncated on copy.' : 'Something was pasted onto the end of it.'}`,
      });
    }
    if (expected?.workflowId && actualWorkflow && actualWorkflow !== expected.workflowId) {
      const impersonated = atlas.workflows.find((w) => w.workflowId === actualWorkflow);
      problems.push({
        code: 'wrong-flow',
        text: `This key calls workflow ${actualWorkflow}`
          + (impersonated ? ` (${impersonated.names[0]})` : ' — a workflow the register does not describe')
          + `, but the register says it must call ${expected.workflowId} (${expected.flow}). `
          + 'The URL is valid, so nothing fails: it succeeds against the wrong flow.',
      });
    }
  }

  /* Not a problem with the key — a property of it, and one an administrator must know before
     rotating anything, because regenerating that flow's trigger invalidates every key on it. */
  const shares = expected?.sharesFlowWith || [];

  const worst = problems.length
    ? problems.slice().sort((a, b) => SEVERITY[a.code] - SEVERITY[b.code])[0].code
    : 'ok';

  return {
    key,
    surface: expected?.surface || (EndpointKeys.includes(key) ? 'internal' : 'unknown'),
    expected,
    contract,
    inContractTable: Boolean(contract),
    configured: Boolean(url),
    target: EndpointRegistry.redact(url),          // redacted, always
    actualWorkflow,
    signatureLength: sigLen,
    signaturePresent: typeof sigLen === 'number' && sigLen > 0,
    sharesFlowWith: shares,
    problems,
    status: worst,
    healthy: problems.length === 0 && Boolean(url),
  };
}

/** Every contract key in the estate — all 25, both surfaces — joined and judged. */
export function describeEstate({ resolve, atlas = EndpointAtlas } = {}) {
  return atlas.keys.map((k) => describeKey(k.key, { resolve, atlas }));
}

/* ------------------------------------------------------------------ *
 * Estate-level findings
 * ------------------------------------------------------------------ */

/**
 * Conditions that belong to the estate rather than to any one key, and that nothing else in
 * this platform reports.
 *
 * Each one here is a real, measured condition of this tenant rather than a category invented
 * to fill a dashboard. They exist because they are invisible from every other view: the
 * per-key table cannot show a workflow that no key points at, and the diagnostics screen
 * counts only the 19 keys `EndpointKeys` happens to list.
 */
export function findings({ resolve, atlas = EndpointAtlas } = {}) {
  const out = [];
  const rows = describeEstate({ resolve, atlas });

  /* 1. Workflows named after a contract key that they do not serve.
        The dangerous half is `liveImpostors`: those still answer on a live endpoint, so
        wiring a key by NAME rather than by workflow id produces a URL that works, passes
        every format check, and calls a flow the estate retired. */
  const claimable = new Set(atlas.keys.map((k) => k.key));
  const impostors = atlas.workflows
    .filter((w) => !w.bound && w.names.some((n) => claimable.has(n)))
    .map((w) => ({
      workflowId: w.workflowId,
      claims: w.names.filter((n) => claimable.has(n)),
      name: w.names[0],
      live: w.hasEndpoint,
      servedInsteadBy: w.names.filter((n) => claimable.has(n))
        .map((n) => atlas.keys.find((k) => k.key === n)?.workflowId)
        .filter(Boolean),
    }));
  if (impostors.length) {
    const live = impostors.filter((i) => i.live);
    out.push({
      code: 'estate.name-collision',
      severity: live.length ? 'error' : 'warn',
      title: `${impostors.length} workflow(s) carry a contract-key name but serve no key`,
      detail: `${live.length} of them still answer on a live endpoint. Wiring a key by flow NAME `
        + 'instead of by workflow id gives a valid, working URL that calls a flow the estate no '
        + 'longer uses — and every automated check passes, because the URL is well formed.',
      items: impostors,
    });
  }

  /* 2. Keys the platform's own contract table does not know.
        `EndpointKeys` drives diagnostics' "Endpoints configured n/n". A key absent from it is
        absent from that count, so the check can read green while the key is unconfigured. */
  const uncontracted = rows.filter((r) => r.surface === 'internal' && !r.inContractTable);
  if (uncontracted.length) {
    out.push({
      code: 'estate.no-contract',
      severity: 'warn',
      title: `${uncontracted.length} internal key(s) have no entry in the contract table`,
      detail: 'config/endpoints.config.js drives the System Health count of configured endpoints. '
        + 'A key missing from it is not counted there, so that check can read green while the key '
        + 'is unconfigured and its feature is dead.',
      items: uncontracted.map((r) => ({ key: r.key, configured: r.configured })),
    });
  }

  /* 3. Contract keys with no place in the estate. The mirror of 2: the build knows how to call
        something the tenant has no record of. */
  const known = new Set(atlas.keys.map((k) => k.key));
  const orphanContracts = EndpointKeys.filter((k) => !known.has(k));
  if (orphanContracts.length) {
    out.push({
      code: 'estate.orphan-contract',
      severity: 'info',
      title: `${orphanContracts.length} contract key(s) are not in the register`,
      detail: 'This build can call them, but the tenant register does not list them as endpoints. '
        + 'They resolve through another key\'s URL — check each contract\'s sourceKey before '
        + 'assuming a missing flow.',
      items: orphanContracts.map((k) => ({ key: k, sourceKey: EndpointContracts[k]?.sourceKey || null })),
    });
  }

  /* 4. Keys calling a flow other than the one the register names. Silent by construction. */
  const wrong = rows.filter((r) => r.status === 'wrong-flow');
  if (wrong.length) {
    out.push({
      code: 'estate.wrong-flow',
      severity: 'error',
      title: `${wrong.length} key(s) call a workflow the register does not name for them`,
      detail: 'These do not fail. They succeed against the wrong flow, which is worse.',
      items: wrong.map((r) => ({ key: r.key, expected: r.expected?.workflowId, actual: r.actualWorkflow })),
    });
  }

  /* 5. Signature defects, grouped — one row per condition rather than one per key, so a
        half-finished values file reads as one job rather than twenty problems. */
  const sigProblems = rows.filter((r) => ['no-signature', 'bad-signature'].includes(r.status));
  if (sigProblems.length) {
    out.push({
      code: 'estate.signature',
      severity: 'error',
      title: `${sigProblems.length} key(s) have no usable signature`,
      detail: `A signature is ${SIGNATURE_LENGTH} characters. Complete them with `
        + 'npm run values:sign, then npm run setup -- --values <file> --force.',
      items: sigProblems.map((r) => ({ key: r.key, length: r.signatureLength })),
    });
  }

  /* 6. Unconfigured keys, by surface. Stated as a count of features that are off rather than
        as an error, because leaving a feature unconfigured is a legitimate posture. */
  const unconfigured = rows.filter((r) => r.status === 'unconfigured');
  if (unconfigured.length) {
    out.push({
      code: 'estate.unconfigured',
      severity: 'warn',
      title: `${unconfigured.length} key(s) are not configured in this deployment`,
      detail: 'Each reports itself unavailable at the moment of use rather than failing mid-action. '
        + 'That is correct behaviour for a feature you have chosen not to switch on.',
      items: unconfigured.map((r) => ({ key: r.key, surface: r.surface })),
    });
  }

  return out;
}

/** Headline counts for the console's summary strip. */
export function summarise({ resolve, atlas = EndpointAtlas } = {}) {
  const rows = describeEstate({ resolve, atlas });
  const f = findings({ resolve, atlas });
  return {
    keys: rows.length,
    configured: rows.filter((r) => r.configured).length,
    healthy: rows.filter((r) => r.healthy).length,
    signed: rows.filter((r) => r.signatureLength === SIGNATURE_LENGTH).length,
    internal: rows.filter((r) => r.surface === 'internal').length,
    portal: rows.filter((r) => r.surface === 'portal').length,
    workflows: atlas.workflows.length,
    workflowsBound: atlas.totals.workflowsBound,
    workflowsLive: atlas.totals.workflowsWithEndpoint,
    errors: f.filter((x) => x.severity === 'error').length,
    warnings: f.filter((x) => x.severity === 'warn').length,
  };
}

/**
 * The report an administrator hands to someone else.
 *
 * Redacted by construction: it is built from `describeKey`, which resolves the URL only to
 * redact it, and no field here carries the raw value. That is asserted in the test suite on
 * the serialised output, not just on the fields, because the guarantee people rely on is
 * "nothing in this JSON is a credential" and that is a property of the whole string.
 */
export function exportReport({ resolve, atlas = EndpointAtlas, generatedAt = new Date().toISOString() } = {}) {
  return {
    schema: 'dgo-endpoint-console-report/v1',
    generatedAt,
    authority: atlas.authority,
    note: 'Redacted. Every signature is replaced with *** — this file is safe to send to support.',
    summary: summarise({ resolve, atlas }),
    findings: findings({ resolve, atlas }),
    keys: describeEstate({ resolve, atlas }).map((r) => ({
      key: r.key,
      surface: r.surface,
      flow: r.expected?.flow ?? null,
      expectedWorkflow: r.expected?.workflowId ?? null,
      actualWorkflow: r.actualWorkflow || null,
      method: r.expected?.method ?? null,
      configured: r.configured,
      signatureLength: r.signatureLength,
      sharesFlowWith: r.sharesFlowWith,
      status: r.status,
      target: r.target,
      problems: r.problems.map((p) => p.code),
    })),
    workflows: atlas.workflows,
  };
}

export const EndpointAtlasView = Object.freeze({
  describeKey, describeEstate, findings, summarise, exportReport,
  workflowIdOf, signatureLengthOf, SIGNATURE_LENGTH, SEVERITY, atlas: EndpointAtlas,
});
export default EndpointAtlasView;
