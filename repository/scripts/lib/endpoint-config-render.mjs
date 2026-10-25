// The endpoint configuration files the Workspace and the Portal load, rendered from key → URL.
//
// One renderer, two callers: scripts/package.mjs writes these into a delivered package, and the
// platform suite's `folio wire` (scripts/platform-release/folio.mjs) writes them into an unpacked
// suite. Both therefore present the platforms with identical bytes for the same endpoints.
// Node built-ins only, because the suite ships this file and has nothing to install.

import crypto from 'node:crypto';

const pad = (s, n) => String(s).padEnd(n, ' ');

export function renderRuntimeConfig(values, auth, meta) {
  const w = Math.max(...Object.keys(values).map(k => k.length)) + 2;
  const lines = Object.entries(values).map(([k, v]) => `    ${pad(k + ':', w)}${JSON.stringify(v || '')},`);
  const authBlock = Object.keys(auth).length
    ? `
/* Authentication, provisioned into this package.
 *
 * ⚠  enabled:true switches on the CLIENT half only: the browser acquires a token and sends
 * it, stops asserting identity itself, and reads roles from claims. It does NOT make any
 * decision server-authoritative. Each flow must validate the token, derive the role and
 * authorise the action itself — see docs/architecture/AUTHENTICATION_CONTRACT.md §2.
 */
window.DGO_CONFIG.auth = Object.assign({
${Object.entries(auth).map(([k, v]) => `    ${pad(k + ':', 12)}${JSON.stringify(v)},`).join('\n')}
}, window.DGO_CONFIG.auth);
`
    : '';
  return `/* NITDA Folio — internal platform endpoint configuration.
 *
 * PROVISIONED INTO THIS PACKAGE by ${meta.by || 'scripts/package.mjs'}.
 *   build ${meta.buildId}   posture ${meta.posture}   ${meta.builtAt}
 *
 * Every URL below is a signed Power Automate trigger, and a signed trigger URL is a bearer
 * credential: possession alone authorises invoking the flow. This file is delivered
 * verbatim to every browser that loads the platform, so treat each URL as public from the
 * moment you deploy.
 *
 * There is no proxy in the request path, by decision. The flow behind each URL is the only
 * place authentication, authorisation, validation and rate limiting can happen, and it
 * must do all four itself.
 *
 * Rotation is the only revocation. Regenerate the signature in Power Automate, rebuild the
 * package, redeploy. Rebuilding changes the build id above, which is how a deployment can
 * be told apart from the one it replaced.
 *
 * MERGED, NOT ASSIGNED — injecting window.DGO_CONFIG before this file loads is a supported
 * way to supply endpoints, so anything already set must win.
 */
window.DGO_CONFIG = window.DGO_CONFIG || {};
window.DGO_CONFIG.endpoints = Object.assign({
${lines.join('\n')}
}, window.DGO_CONFIG.endpoints);
${authBlock}`;
}

export function renderPortalConfig(values, meta) {
  const w = Math.max(...Object.keys(values).map(k => k.length)) + 2;
  const lines = Object.entries(values).map(([k, v]) => `    ${pad(k + ':', w)}${JSON.stringify(v || '')},`);
  return `/* NITDA document portal — endpoint configuration.
 *
 * PROVISIONED INTO THIS PACKAGE by ${meta.by || 'scripts/package.mjs'}.
 *   build ${meta.buildId}   posture ${meta.posture}   ${meta.builtAt}
 *
 * ⚠  This is the PUBLIC portal. Every URL below is delivered to every visitor's browser
 * and is readable by anyone who fetches a static asset from the site. Configure only
 * endpoints whose flows are built to be invoked by an anonymous stranger: each must
 * validate its own input, rate-limit its own callers, return only what that caller is
 * entitled to see, and be rotatable on a schedule.
 *
 * With SUBMISSION empty the portal stays in DEMO MODE — everything stays on the device and
 * nothing is transmitted, which is the safe failure for a public channel.
 *
 * MERGED, NOT ASSIGNED — injecting window.PF_CONFIG before this file loads is a supported
 * way to supply endpoints, so anything already set must win.
 */
window.PF_CONFIG = window.PF_CONFIG || {};
window.PF_CONFIG.endpoints = Object.assign({
${lines.join('\n')}
}, window.PF_CONFIG.endpoints);
`;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * The build id: a digest over the provisioned endpoint set, not over the clock.
 *
 * Two builds of the same code with the same endpoints therefore carry the same id, and a
 * rotation necessarily changes it. The portal's service worker names its cache after it,
 * which is what makes rotation actually take effect for a returning visitor — see the
 * `sw.js` transform in scripts/package.mjs.
 */
export function buildIdFor(values) {
  const material = Object.keys(values).sort().map(k => `${k}=${values[k] || ''}`).join('\n');
  return sha256(material).slice(0, 16);
}
