// DGO R11.6 — endpoint URL formation rules.
//
// WHAT THIS ADDS TO WHAT WAS ALREADY CHECKED
//
// `core/endpoint-atlas.js` judges a URL against the tenant register: is it configured, is it
// HTTPS, is the signature the right length, does it address the workflow the register names.
// Those are the questions that matter once a URL is broadly right. They do not catch a URL that
// is malformed in a way that still parses.
//
// This module carries the formation rules the flow-capsule registry enforces server-side, moved
// to where an administrator pastes the URL rather than where it is first used. Each rule exists
// because of a specific way a copied trigger URL goes wrong:
//
//   · trailing whitespace or a newline — the commonest paste defect, invisible on screen, and
//     it makes the signature wrong by one character with no visible cause;
//   · a fragment (`#…`) — appended by a browser that was showing the URL, never sent to the
//     server, and it silently truncates everything a naive splitter reads after it;
//   · userinfo or a non-standard port — a URL that was rewritten by something in between;
//   · a host outside the approved suffixes — the shape of a URL redirected to a look-alike;
//   · a missing or duplicated `api-version` / `sp` / `sv` / `sig` — what a URL truncated at the
//     first `&`, or concatenated from two copies, looks like;
//   · a path that does not end at `/triggers/manual/paths/invoke` — a URL copied from the
//     designer's address bar rather than from the trigger's own field.
//
// Each of those produces a URL that looks plausible in a text box. Every one of them fails at
// the tenant, later, as an opaque 401 or 404 — which is why they are worth catching here.
//
// NO SIGNATURE IS RETURNED OR LOGGED. `sig` is read for its length and its presence and is
// never carried out of this module; `mask()` is what everything else displays.

/** A Power Automate signature is base64url of an HMAC-SHA256: 32 bytes, 43 unpadded characters. */
export const SIGNATURE_LENGTH = 43;

/** The query parameters a signed Power Automate trigger URL must carry, exactly once each. */
export const REQUIRED_PARAMS = Object.freeze(['api-version', 'sp', 'sv', 'sig']);

/** The invocation path every direct-call trigger URL ends at. */
export const INVOKE_PATH = '/triggers/manual/paths/invoke';

/**
 * Hosts a trigger URL may address.
 *
 * A suffix list rather than an allow-list of exact hosts: the environment-specific prefix
 * changes per tenant and per region, and pinning it would make this module wrong for every
 * deployment but the one it was written on.
 */
export const ALLOWED_HOST_SUFFIXES = Object.freeze(['.api.powerplatform.com', '.logic.azure.com']);

const PLACEHOLDER = /YOUR_|REPLACE_ME|CHANGEME|ROTATE_ME|example\.(?:com|org|invalid)|<[^>]*>/i;

/** Remove signature material before a URL is shown, logged or exported. */
export function mask(url) {
  const raw = String(url || '');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    for (const name of [...parsed.searchParams.keys()]) {
      if (/^(sig|sv|sp|code|token|key)$/i.test(name)) parsed.searchParams.set(name, '***');
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/[0-9a-f]{16,}/gi, '/***')}?${parsed.searchParams.toString()}`;
  } catch {
    /* The fallback runs on exactly the strings `new URL()` refuses — a relative URL, a value
       with a stray space, a half-pasted line. Those are the ones most likely to be shown while
       an operator is fixing them, so the pattern must not require the `?` or `&` that a
       well-formed query would have put in front of the parameter: `/invoke?sig=…` fails to
       parse, and a delimiter-anchored pattern would have left its signature intact. */
    return raw.replace(/\b(sig|code|token|key)=[^&\s]*/gi, '$1=***');
  }
}

/**
 * Inspect one URL against every formation rule, collecting all failures.
 *
 * Returns `{ valid, issues, workflowId, signatureLength, masked }`. `issues` carries a stable
 * `code` for tests and for the suite's grouping, and a sentence naming the paste defect it
 * corresponds to — an administrator holding a rejected URL needs to know what to look for in it,
 * not which rule number fired.
 */
export function inspect(url, { allowedHostSuffixes = ALLOWED_HOST_SUFFIXES, requireSignature = true } = {}) {
  const raw = String(url ?? '');
  const issues = [];
  const add = (code, message) => issues.push({ code, message });

  if (!raw) {
    return { valid: false, issues: [{ code: 'empty', message: 'No URL was supplied.' }], workflowId: '', signatureLength: null, masked: '' };
  }
  if (raw !== raw.trim()) add('whitespace', 'The URL has leading or trailing whitespace. It is invisible on screen and makes the signature wrong by one character.');
  if (/[\r\n\t]/.test(raw)) add('control-whitespace', 'The URL contains a line break or tab — it was pasted across two lines.');
  if (raw.includes('#')) add('fragment', 'The URL carries a # fragment. A browser adds these; the server never receives one, and anything after it is lost.');
  if (PLACEHOLDER.test(raw)) add('placeholder', 'The URL still contains template text. It was never filled in.');

  let parsed;
  try { parsed = new URL(raw.trim()); }
  catch {
    add('unparseable', 'This is not a complete absolute URL.');
    return { valid: false, issues, workflowId: '', signatureLength: null, masked: mask(raw) };
  }

  if (parsed.protocol !== 'https:') add('not-https', 'The URL is not HTTPS. The browser calls this flow directly, so the request would be in clear text.');
  const host = parsed.hostname.toLowerCase();
  if (!host) add('no-host', 'The URL has no hostname.');
  else if (!allowedHostSuffixes.some((s) => host.endsWith(s))) {
    add('host-not-allowed', `${host} is not a Power Automate host. Approved hosts end in ${allowedHostSuffixes.join(' or ')}.`);
  }
  if (parsed.username || parsed.password) add('userinfo', 'The URL carries a username or password in front of the host. A trigger URL never does; this one was rewritten.');
  if (parsed.port && parsed.port !== '443') add('port', `The URL addresses port ${parsed.port}. A trigger URL is served on 443.`);
  if (!parsed.pathname.endsWith(INVOKE_PATH)) {
    add('path', `The path does not end at ${INVOKE_PATH}. This looks like a URL copied from the designer's address bar rather than from the trigger's own field.`);
  }

  /* Counted rather than read. `searchParams.get()` returns the first of a duplicated pair and
     hides the duplicate entirely — and a URL carrying `sig` twice is two copies concatenated,
     which is a real and silent paste defect. */
  const counts = new Map();
  for (const [k] of parsed.searchParams) {
    const key = k.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const name of REQUIRED_PARAMS) {
    const n = counts.get(name) || 0;
    const value = parsed.searchParams.get(name);
    if (name === 'sig' && !requireSignature) continue;
    if (!n) add('missing-param', `The URL has no ${name}= parameter. A URL truncated at the first & looks exactly like this.`);
    else if (n > 1) add('duplicate-param', `${name}= appears ${n} times. Two copies of the URL were joined together.`);
    else if (!value) add('empty-param', `${name}= is present but empty.`);
  }

  const signatureLength = counts.get('sig') ? (parsed.searchParams.get('sig') || '').length : null;
  if (requireSignature && signatureLength !== null && signatureLength > 0 && signatureLength !== SIGNATURE_LENGTH) {
    add('signature-length', `The signature is ${signatureLength} characters, not ${SIGNATURE_LENGTH}. `
      + (signatureLength < SIGNATURE_LENGTH ? 'It was truncated on copy.' : 'Something was pasted onto the end of it.'));
  }

  const workflow = /\/workflows\/([0-9a-f]{32})\b/i.exec(parsed.pathname);

  return {
    valid: issues.length === 0,
    issues,
    workflowId: workflow ? workflow[1].toLowerCase() : '',
    signatureLength,
    masked: mask(raw),
  };
}

/**
 * A stable, non-reversible fingerprint of the exact URL string.
 *
 * The flow-capsule registry stores this beside the URL and recomputes it before every call, so a
 * stored URL that has been altered in the database is refused rather than invoked. The same
 * value computed here lets an administrator confirm that the URL in this browser is byte-for-byte
 * the one the registry holds, without either side transmitting the URL.
 *
 * SHA-256 detects mutation. It is not encryption and it does not replace the SAS signature —
 * anyone holding the URL can compute this too.
 */
export async function fingerprint(url) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  const bytes = new TextEncoder().encode(String(url || ''));
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const EndpointFormation = Object.freeze({
  inspect, mask, fingerprint, SIGNATURE_LENGTH, REQUIRED_PARAMS, INVOKE_PATH, ALLOWED_HOST_SUFFIXES,
});
export default EndpointFormation;
