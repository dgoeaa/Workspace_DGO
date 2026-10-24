/**
 * Does the phone harvester actually harvest — and does it keep 25 credentials off the screen?
 *
 * WHY THIS RUNS THE CODE RATHER THAN READING IT
 * `scripts/harvest-trigger-urls.bookmarklet.txt` is 12 KB of browser code that nobody can step
 * through where it runs: there is no devtools console on the device it was written for, which is
 * the entire reason it exists. A stale-artifact check would prove it matches the register and
 * nothing about whether it works. So the payload is executed here against a hand-built DOM —
 * no jsdom, no Playwright, nothing to install, because this suite has to run in Termux too.
 *
 * The four properties worth failing a build over:
 *
 *   1. Nothing is fetched before the reader taps through the report. That is the DRY_RUN of the
 *      console harvester, reshaped for an artifact that cannot be edited between runs, and it is
 *      only a real gate if no request goes out while the first screen is up.
 *   2. No URL is ever rendered. The whole reason the phone route puts the file on the clipboard
 *      rather than on the screen is that a screenshot, a screen recorder or a shoulder is likelier
 *      at a bus stop than at a desk. A single stray textContent would undo it silently.
 *   3. One flow failing suppresses the file. A half-complete values file wires some endpoints and
 *      leaves others answering 401 with no pattern to the failures — worse than harvesting none.
 *   4. The file it builds is the file `npm run setup` reads: every register key, in register order,
 *      and two keys sharing a flow sharing that flow's one URL.
 *
 * Run: node tests/harvest-bookmarklet.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = 'scripts/harvest-trigger-urls.bookmarklet.txt';

let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✅ ${name}`); };
const no = (name, detail) => { failed++; console.log(`  ❌ ${name}\n       ${detail}`); };
const is = (name, cond, detail) => (cond ? ok(name) : no(name, detail));

console.log('\nThe phone harvester\n');

const artifact = readFileSync(path.join(ROOT, ARTIFACT), 'utf8');
const register = JSON.parse(readFileSync(path.join(ROOT, 'docs/reference/endpoint-register.json'), 'utf8'));
const endpoints = Object.values(register.current_configuration);
const workflowIds = [...new Set(endpoints.map(e => e.workflow_id))];

/* ── the artifact ──────────────────────────────────────────────────────────── */

is('it is a single line', artifact.trimEnd().split('\n').length === 1,
  'a bookmark URL field takes one line; a wrapped artifact pastes as a broken URL');
is('it is a javascript: URL', artifact.startsWith('javascript:'),
  'Chrome runs a bookmark as script only when its URL begins javascript:');
is('it carries no signature', !/sig=[A-Za-z0-9_-]{20,}/.test(artifact),
  'the harvester fetches credentials, it must never carry one — this file is committed');

const source = decodeURIComponent(artifact.trim().slice('javascript:'.length));

/**
 * One workflow with no candidate flow, CONSTRUCTED here rather than borrowed from the estate.
 *
 * This scenario used to depend on the crosswalk having keys it could not address. Since
 * IP_Get_Docs_Endpoint was exported on 12 September it addresses all 25, so `unnamed: true`
 * stopped changing anything and the assertion it drives inverted. The discovery fallback is
 * still live code in the payload; the condition is made here so it stays covered.
 */
function sourceWithout(workflowId) {
  const re = new RegExp(`("${workflowId}":\\s*)\\[[^\\]]*\\]`);
  if (!re.test(source)) throw new Error(`cannot unaddress ${workflowId}: no CANDIDATES entry`);
  return source.replace(re, '$1[]');
}

is('every contract key is baked in', endpoints.every(e => source.includes(e.key)),
  'a console cannot read the repository, so a missing key is an endpoint that stays unwired');
is('every workflow id is baked in', workflowIds.every(id => source.includes(id)),
  'run npm run harvest:bookmarklet — the register has moved on');

/* ── a DOM, built by hand ──────────────────────────────────────────────────── */

function makeNode(tag) {
  const node = {
    tagName: String(tag), id: '', children: [], parent: null, shadow: null, value: '',
    style: { cssText: '' }, listeners: {}, scrollTop: 0, scrollHeight: 0, _text: '',
    appendChild(c) { c.parent = node; node.children.push(c); return c; },
    removeChild(c) { const i = node.children.indexOf(c); if (i >= 0) node.children.splice(i, 1); return c; },
    remove() { if (node.parent) node.parent.removeChild(node); },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    attachShadow() { node.shadow = makeNode('#shadow'); node.shadow.parent = node; return node.shadow; },
    select() {},
  };
  Object.defineProperty(node, 'firstChild', { get: () => node.children[0] || null });
  Object.defineProperty(node, 'textContent', {
    get: () => (node._text || node.children.map(c => c.textContent).join('')),
    set: (v) => { node.children = []; node._text = String(v); },
  });
  return node;
}

const walk = (node, out = []) => {
  if (!node) return out;
  out.push(node);
  if (node.shadow) walk(node.shadow, out);
  node.children.forEach(c => walk(c, out));
  return out;
};
const textOf = (node) => walk(node).map(n => n._text).join('\n');
const buttons = (node) => walk(node).filter(n => n.tagName === 'button');

/** Tap the first button whose label contains `label`, and await whatever the handler returns. */
async function tap(host, label) {
  const b = buttons(host).find(n => n.textContent.includes(label));
  /* A missing button is a FAILED ASSERTION, not a dead suite. Under falsification this file
     stopped partway and printed nothing further, which reads exactly like a green run nobody
     scrolled. */
  if (!b) { no(`a button matching "${label}" is on screen`, `instead: ${buttons(host).map(n => n.textContent).join(' | ')}`); return null; }
  /* A handler that THROWS is a failed assertion, not a dead suite — the same rule as the
     missing-button case above, learned the same way: under falsification this file stopped
     partway and printed nothing further. */
  try { await Promise.all((b.listeners.click || []).map(fn => fn())); }
  catch (e) { no(`tapping "${label}" completes`, `the handler threw: ${e && e.message}`); }
  return b;
}

/* Assembled, and deliberately the 43 characters a real signature runs to, because one assertion
   below is that a line of the values file ends in one. */
const SIG = 'S'.repeat(43);
const API_HOST = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com';
const API_PATH = '/powerautomate/flows';
const TOKEN = 'Bearer PRETEND.JWT.DO_NOT_PRINT';
/* A token the same host issues for a DIFFERENT service on it. Accepted nowhere this harvester
   calls, which is the whole point. */
const OTHER_TOKEN = 'Bearer WRONG.AUDIENCE.DO_NOT_PRINT';
const urlFor = (id) => `${API_HOST}:443/powerautomate/automations/direct/cu/11/workflows/${id}`
  + `/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&sig=${SIG}`;

/* The candidate block the builder injected, read back off the shipped artifact. Asserting against
   what was actually generated, rather than re-deriving it, is the point of running the artifact. */
const CANDIDATES = JSON.parse(/var CANDIDATES = (\{.*?\});/s.exec(source)[1]);

/**
 * Which tenant flow really serves each workflow, for one scenario.
 *
 * For a workflow with two candidates it is the SECOND. A harvester that stops at the first
 * candidate because the call succeeded — rather than because the answer verified — fails here and
 * nowhere else, which is exactly why the decoy is a valid 32-hex workflow id: a decoy that trips
 * an earlier check proves nothing about the check under test.
 */
function truth({ breakFlow = null, unnamed = false, unaddressable = null } = {}) {
  const servedBy = new Map();
  const displayNames = new Map();
  let n = 0;
  for (const id of workflowIds) {
    const name = endpoints.find(e => e.workflow_id === id).flow_name;
    let ids = id === unaddressable ? [] : (CANDIDATES[id] || []);
    if (!ids.length) {
      /* The flows the crosswalk cannot address. They exist in the tenant and are findable by
         display name, which is the fallback under test — so the stub has to hold one. */
      const discovered = `d15c07e5-ab12-cd34-ef56-${String(n).padStart(12, '0')}`;
      displayNames.set(discovered, unnamed ? 'Something Else Entirely' : name);
      ids = [discovered];
    }
    const right = ids[ids.length - 1];
    for (const c of ids) {
      servedBy.set(c, c === right ? id : 'dec0de' + c.replace(/-/g, '').slice(6, 32));
      if (!displayNames.has(c)) displayNames.set(c, name);
    }
    if (breakFlow === id && right) servedBy.set(right, 'f00dfeed' + right.replace(/-/g, '').slice(8, 32));
    n++;
  }
  return { servedBy, displayNames };
}

/**
 * Execute the payload against stubs. The globals it names are passed in as parameters rather than
 * assigned anywhere global, so one scenario cannot leak into the next.
 *
 * `window.fetch` is the stub too, and deliberately: in a browser the payload's hook wraps the same
 * function the portal calls. Hooking one and calling another would make the observation step
 * untestable, and it is the step this version turns on.
 */
function makeRun({ hostname = 'make.powerautomate.com', breakFlow = null, unresolvable = false, unnamed = false, offline = false, unauthorised = false, unsignedCallbacks = false, unaddressable = null } = {}) {
  /* The portal's own call is what discovery reads, and it succeeded. The network degrades after
     it — which is the order the tenant showed, and the only order in which this means anything. */
  let armed = false;
  const documentElement = makeNode('html');
  const body = makeNode('body');
  const document = {
    documentElement, body,
    createElement: makeNode,
    getElementById: (id) => walk(documentElement).find(n => n.id === id) || null,
    execCommand: () => true,
  };
  const { servedBy, displayNames } = truth({ breakFlow, unnamed, unaddressable });
  const calls = [];
  const clipboard = { writes: [] };

  /* A response, shaped like a real one: its body is READ ONCE, and it can be cloned. Both
     matter. The payload reads the portal's own answers in order to bank the trigger URLs in
     them, and it must clone before reading — a stub whose body can be read forever cannot tell
     that apart from one that consumes the copy the portal is about to read, which would break
     the maker UI in the operator's face. A stub with no clone() at all silently disables the
     whole route while every assertion stays green. */
  const mk = (status, payload) => {
    let used = false;
    const body = () => {
      if (used) throw new TypeError('body stream already read');
      used = true;
      return payload;
    };
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: () => null },
      json: async () => body(),
      text: async () => JSON.stringify(body()),
      clone: () => mk(status, payload),
    };
  };

  /* The distinction the second route rests on: the PORTAL is authorised and the payload
     replaying its token is not. Set only while a call the stub portal makes is in flight, which
     is safe because fetchStub records synchronously before its first await. */
  let portalIsCalling = false;
  const asPortal = (fn) => { portalIsCalling = true; const p = fn(); portalIsCalling = false; return p; };

  const fetchStub = async (url, init = {}) => {
    const raw = String(url);
    calls.push({ url: raw, auth: (init.headers || {}).Authorization, method: init.method || 'GET', byPortal: portalIsCalling });
    /* A network failure REJECTS. A stub that only ever resolves cannot tell code that handles one
       from code that has never met one. */
    if (armed && offline) throw new TypeError('Failed to fetch');
    if (armed && unauthorised && !portalIsCalling && raw.startsWith(API_HOST)) return mk(401, { error: 'unauthorized' });
    const u = new URL(raw);
    if (u.origin !== API_HOST) return mk(404, {});
    const cb = /^\/powerautomate\/flows\/([^/]+)\/triggers\/([^/]+)\/listCallbackUrl$/.exec(u.pathname);
    if (cb) {
      if (!servedBy.has(cb[1])) return mk(404, {});
      /* Some shapes of this API hand back the URL without its signature. It is not a
         credential then, and banking it would mean offering a values file that 401s on first
         use — which is worse than offering none. */
      const full = urlFor(servedBy.get(cb[1]));
      return mk(200, { value: unsignedCallbacks ? full.split('&sig=')[0] : full });
    }
    if (u.pathname === API_PATH) {
      return mk(200, { value: [...servedBy.keys()].map(id => ({ name: id, properties: { displayName: displayNames.get(id) } })) });
    }
    const flow = /^\/powerautomate\/flows\/([^/]+)$/.exec(u.pathname);
    if (flow) {
      if (!servedBy.has(flow[1]) || unresolvable) return mk(403, {});
      /* NOT "manual". A harvester matching the trigger by name misses this entirely. */
      return mk(200, { properties: { definition: { triggers: { 'When a HTTP request is received': { type: 'Request' } } } } });
    }
    return mk(404, {});
  };

  const navigator = { clipboard: { writeText: async (t) => { clipboard.writes.push(t); } } };
  const location = { hostname, href: `https://${hostname}/environments/x/flows` };
  const window = {
    fetch: fetchStub,
    Headers, URL, URLSearchParams,
    XMLHttpRequest: class { open(m, u) { this.__u = u; } setRequestHeader() {} send() {} },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(Number(ms) || 0, 1)),
    sessionStorage: { length: 0, key: () => null, getItem: () => null },
    localStorage: { length: 0, key: () => null, getItem: () => null },
  };

  /** One tap of the bookmark. */
  const tapBookmark = () => {
    // eslint-disable-next-line no-new-func
    new Function('document', 'window', 'location', 'navigator', 'fetch', 'Headers', 'URL', 'URLSearchParams', 'XMLHttpRequest', 'setTimeout',
      unaddressable ? sourceWithout(unaddressable) : source)(
      document, window, location, navigator, fetchStub, Headers, URL, URLSearchParams, window.XMLHttpRequest, window.setTimeout);
    return documentElement.children[documentElement.children.length - 1];
  };

  /** What the portal itself does when someone opens a flow. Routed through `window.fetch`, so it
      passes through whatever hook the payload installed — which is the whole mechanism. */
  const portalOpensAFlow = async () => {
    const first = [...servedBy.keys()][0];
    await window.fetch(`${API_HOST}${API_PATH}/${first}?api-version=1`, { headers: { authorization: TOKEN } });
    calls.length = 0;   /* the portal's own call is not the harvester's */
    armed = true;
  };

  /* What the portal does when someone opens a flow's DETAILS page: it asks for the flow, and it
     asks for the trigger URL so it can render the "HTTP POST URL" box. Both answers pass the
     hook, and the second carries a signed invoke URL. */
  const portalOpensFlowDetails = async (id) => {
    armed = true;
    await asPortal(() => window.fetch(`${API_HOST}${API_PATH}/${id}?api-version=1`,
      { headers: { authorization: TOKEN } }));
    await asPortal(() => window.fetch(
      `${API_HOST}${API_PATH}/${id}/triggers/When%20a%20HTTP%20request%20is%20received/listCallbackUrl?api-version=1`,
      { method: 'POST', headers: { authorization: TOKEN } }));
    /* Banking is two microtask hops behind the response: clone, then text. */
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
  };
  const portalOpensEveryFlow = async () => {
    for (const id of new Set(workflowIds.map((w) => {
      const ids = CANDIDATES[w] || [];
      return ids.length ? ids[ids.length - 1] : [...servedBy.keys()].find((k) => servedBy.get(k) === w);
    }).filter(Boolean))) await portalOpensFlowDetails(id);
  };

  /* The same HOST, a different service, a different audience. */
  const portalCallsANeighbouringService = async () => {
    await window.fetch(`${API_HOST}/powerautomate/GETMYFLOWSUSPENSIONSTATUS?api-version=1`,
      { headers: { authorization: OTHER_TOKEN } });
    calls.length = 0;
  };

  return { tapBookmark, portalOpensAFlow, portalOpensFlowDetails, portalOpensEveryFlow,
           portalCallsANeighbouringService, calls, clipboard, window, servedBy };
}

/** The ordinary path: tap, open a flow, tap again. */
async function ready(opts) {
  const r = makeRun(opts);
  r.tapBookmark();
  await r.portalOpensAFlow();
  r.host = r.tapBookmark();
  return r;
}

/* ── it watches rather than guesses ────────────────────────────────────────── */

is('the payload names no flow API host', !/['"`]https:\/\/[a-z0-9.-]*api\.flow\.microsoft\.com/i.test(source),
  'a hardcoded host is what made version 1 resolve nothing on this tenant');
is('it no longer reads a token out of MSAL storage', !/accesstoken/i.test(source),
  'guessing which audience this tenant accepts is how a 401 gets mistaken for a permissions problem');

{
  const r = makeRun();
  const host = r.tapBookmark();
  is('shown nothing, the first tap asks for a flow to be opened rather than guessing',
    /Open a flow/i.test(textOf(host)) && r.calls.length === 0,
    `calls: ${r.calls.length}; screen: ${textOf(host).slice(0, 120)}`);
}

{
  const r = await ready();
  is('after the portal calls its API, the report screen appears',
    textOf(r.host).includes('Harvest trigger URLs'), textOf(r.host).slice(0, 200));
  is('the report names the API it observed',
    textOf(r.host).includes(new URL(API_HOST).hostname + API_PATH),
    'an operator who cannot see which host it will call cannot tell a wrong one from a right one');
}

/* ── the report screen is a gate, not a courtesy ───────────────────────────── */

const report = await ready();
is('the first screen lists every flow', workflowIds.every(id => {
  const name = endpoints.find(e => e.workflow_id === id).flow_name;
  return textOf(report.host).includes(name);
}), 'the reader is asked to approve a fetch they cannot see the scope of');
is('nothing is fetched before the tap', report.calls.length === 0,
  'this is the DRY_RUN of the console harvester — a fetch here makes the first screen decorative');
is('the fetch button names the count', textOf(report.host).includes(`Fetch ${workflowIds.length} trigger URLs`),
  `${workflowIds.length} flows serve the ${endpoints.length} keys, and the button should say so`);

/* ── the harvest ───────────────────────────────────────────────────────────── */

const harvest = await ready();
await tap(harvest.host, 'Fetch');

is('it never addresses a flow by an application workflow id',
  !harvest.calls.some(c => workflowIds.some(id => c.url.includes('/flows/' + id))),
  'that is the execution identifier; the management API answers 404 for it');
is('every candidate tried is a tenant flow id from the crosswalk',
  harvest.calls.every(c => {
    const m = /\/flows\/([^/?]+)/.exec(c.url);
    return !m || harvest.servedBy.has(m[1]);
  }), harvest.calls.map(c => c.url).find(u => { const m = /\/flows\/([^/?]+)/.exec(u); return m && !harvest.servedBy.has(m[1]); }) || '');
is('every call is bearer-authorised from the page session',
  harvest.calls.length > 0 && harvest.calls.every(c => c.auth === TOKEN),
  'the token is the one the portal itself sent, at the audience that host accepts');
is('the callback URL is requested by POST',
  harvest.calls.filter(c => c.url.includes('listCallbackUrl')).every(c => c.method === 'POST'));
is('the trigger is found by kind, not by name',
  harvest.calls.some(c => c.url.includes('When%20a%20HTTP%20request%20is%20received')),
  'the stub names its Request trigger something other than "manual"');

/* ── the file ──────────────────────────────────────────────────────────────── */

await tap(harvest.host, 'Copy');
const file = harvest.clipboard.writes[0] || '';
const lines = file.split('\n').filter(l => l && !l.startsWith('#'));

is('the file carries all 25 keys in register order',
  lines.length === endpoints.length && lines.every((l, i) => l.startsWith(endpoints[i].key + '=')),
  `${lines.length} lines for ${endpoints.length} keys`);
is('every line ends in a 43-character signature', lines.every(l => l.endsWith('sig=' + SIG)));

const emitted = new Map(lines.map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const misfiled = endpoints.filter(e => !(emitted.get(e.key) || '').includes(`/workflows/${e.workflow_id}/`));
is('every emitted URL is for the workflow its own key expects', misfiled.length === 0,
  misfiled.map(e => e.key).join(', ') + ' — the failure that produces a values file which looks complete');

const twoCandidate = workflowIds.filter(id => (CANDIDATES[id] || []).length > 1);
is('where two flows were candidates, it kept the one that verified',
  twoCandidate.length > 0 && twoCandidate.every(id => {
    const decoy = CANDIDATES[id][0];
    const key = endpoints.find(e => e.workflow_id === id).key;
    return harvest.calls.some(c => c.method === 'POST' && c.url.includes(decoy))
      && (emitted.get(key) || '').includes(`/workflows/${id}/`);
  }), `${twoCandidate.length} flows have two candidates`);

is('keys that share a flow share its one URL', (() => {
  const byFlow = new Map();
  for (const e of endpoints) (byFlow.get(e.workflow_id) || byFlow.set(e.workflow_id, []).get(e.workflow_id)).push(emitted.get(e.key));
  return [...byFlow.values()].every(urls => new Set(urls).size === 1);
})(), 'one flow has one trigger URL; two keys on it must not diverge');

is('no URL is rendered anywhere', !textOf(harvest.host).includes('sig=' + SIG),
  'the whole reason the phone route uses the clipboard is that the screen is the exposed surface');
is('the copy screen says what is on the clipboard', /clipboard/i.test(textOf(harvest.host)));
is('it names the command that reads the clipboard into the file',
  textOf(harvest.host).includes('termux-clipboard-get'));

/* ── the fallback ───────────────────────────────────────────────────────────────
   Nothing in the estate exercises the display-name discovery any more: the crosswalk addresses
   all 25 keys since 12 September. The condition is constructed — the shipped payload runs with
   ONE workflow's candidates removed — because deleting that code would otherwise be invisible
   until the next time a flow went missing, which is precisely when it is needed. */
{
  const missing = workflowIds[0];
  const key = endpoints.find(e => e.workflow_id === missing).key;
  const r = await ready({ unaddressable: missing });
  await tap(r.host, 'Fetch');
  await tap(r.host, 'Copy');
  const got = (r.clipboard.writes[0] || '').split('\n')
    .find(l => l.startsWith(key + '=')) || '';

  is('a flow with no candidate is found by display name and the file is still produced',
    !/Incomplete/i.test(textOf(r.host)) && r.clipboard.writes.length === 1,
    textOf(r.host).slice(0, 200));
  is('and the URL it found is verified against the workflow that key expects',
    got.includes(`/workflows/${missing}/`),
    `${key} expected workflow ${missing}`);
  is('the flow list is fetched, and only because a key needed it',
    r.calls.some(c => /\/powerautomate\/flows\?/.test(c.url)),
    'with every key addressable the listing is a wasted call, so it must not happen otherwise');
}

/* ── refusal ───────────────────────────────────────────────────────────────── */

{
  const broken = workflowIds.find(id => (CANDIDATES[id] || []).length === 1);
  const r = await ready({ breakFlow: broken });
  await tap(r.host, 'Fetch');
  is('a flow serving the wrong workflow suppresses the whole file',
    /Incomplete/i.test(textOf(r.host)), textOf(r.host).slice(0, 200));
  is('it says which workflow answered instead', /serves workflow/i.test(textOf(r.host)));
  is('and no copy button is offered', !buttons(r.host).some(b => b.textContent.includes('Copy')));
  is('no signature reaches the screen', !textOf(r.host).includes('sig=' + SIG));
}

{
  const r = await ready({ unaddressable: workflowIds[0], unnamed: true });
  await tap(r.host, 'Fetch');
  is('a key with no candidate and no name match fails rather than guessing',
    /Incomplete/i.test(textOf(r.host)), textOf(r.host).slice(0, 200));
  is('and it does not fall back to some other flow that happened to be listed',
    !buttons(r.host).some(b => b.textContent.includes('Copy')),
    'a discovery fallback that settles for any flow is worse than no fallback');
}

{
  const r = await ready({ unresolvable: true });
  await tap(r.host, 'Fetch');
  is('a flow that cannot be read at all suppresses the file too', /Incomplete/i.test(textOf(r.host)));
  is('it names the flow that failed',
    textOf(r.host).includes(endpoints[0].flow_name), textOf(r.host).slice(0, 200));
}

/* ── the token ─────────────────────────────────────────────────────────────────
   The laptop route hit this for real: one hostname, several services, different audiences, and
   a hook that refreshed its token from any of them. Every call then answered 401. */
{
  const r = await ready();
  await r.portalCallsANeighbouringService();
  await tap(r.host, 'Fetch');
  is('a neighbouring service on the same host does not overwrite the flow API token',
    r.calls.length > 0 && r.calls.every(c => c.auth === TOKEN),
    `${r.calls.filter(c => c.auth === OTHER_TOKEN).length} call(s) carried the wrong audience`);
  is('and the file is still produced', buttons(r.host).some(b => b.textContent.includes('Copy')),
    textOf(r.host).slice(0, 200));
}

/* ── the network ───────────────────────────────────────────────────────────────
   Run against this estate's tenant the console filled with ERR_NAME_NOT_RESOLVED and
   ERR_CONNECTION_TIMED_OUT against the flow API host. `fetch` REJECTS on those, and on a phone
   an uncaught rejection freezes the panel mid-count with no list of what went wrong and no
   console to find out from. */
{
  const r = await ready({ offline: true });
  await tap(r.host, 'Fetch');
  is('an unreachable host suppresses the file rather than freezing the panel',
    /Incomplete/i.test(textOf(r.host)), textOf(r.host).slice(0, 200));
  is('it says the network gave no answer, not that permission was refused',
    /no answer from the network/i.test(textOf(r.host)),
    textOf(r.host).slice(0, 300));
  is('and no copy button is offered', !buttons(r.host).some(b => b.textContent.includes('Copy')));
  is('it retried before giving up',
    r.calls.filter(c => c.url.includes('/flows/')).length > workflowIds.length,
    `${r.calls.length} calls for ${workflowIds.length} flows — one each means it never retried`);
}

/* ── the second route ──────────────────────────────────────────────────────────
   Run against the tenant on the laptop route, all twenty-five keys answered 401 while the maker
   UI beside them kept working. A session can be authorised for the portal and refused at the
   management API. So the hook reads RESPONSES too: the portal fetches each flow's trigger URL in
   order to display it, and that answer is banked under the workflow it names. On a phone the
   cost is nil — tapping through flows is what the operator is doing anyway. */
{
  const r = makeRun({ unauthorised: true });
  r.tapBookmark();
  await r.portalOpensEveryFlow();
  const before = r.calls.length;
  const host = r.tapBookmark();
  /* Read before tapping: the tap replaces the screen, and the button's own wording is the thing
     under test. */
  const reportText = textOf(host);
  await tap(host, 'Build the values file');
  const mine = r.calls.slice(before).filter(c => !c.byPortal);
  const file = r.clipboard.writes[0] || (await (async () => {
    await tap(host, 'Copy the values file'); return r.clipboard.writes[0] || '';
  })());

  is('with every call refused 401, the file is still built from what the portal fetched',
    buttons(host).some(b => b.textContent.includes('Copy')) && !/Incomplete/i.test(textOf(host)),
    textOf(host).slice(0, 220));
  is('and it made no call of its own to do it', mine.length === 0, mine.map(c => c.url).join(', '));
  is('the button says build, not fetch, when nothing needs fetching',
    reportText.includes('Build the values file') && !/Fetch \d+ trigger URLs/.test(reportText),
    'offering to fetch what it already holds would send the operator back into the 401');
  is('and the report says how many the portal already handed over',
    /\d+ of them are already answered by URLs the portal fetched/.test(reportText),
    reportText.slice(0, 240));

  const emitted = new Map();
  for (const line of String(file).split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) emitted.set(m[1], m[2]);
  }
  const misfiled = endpoints.filter(e => !(emitted.get(e.key) || '').includes('/workflows/' + e.workflow_id + '/'));
  is('every banked URL still lands under the key whose workflow id it carries',
    emitted.size === endpoints.length && misfiled.length === 0,
    `${emitted.size} lines for ${endpoints.length} keys; misfiled: ${misfiled.map(e => e.key).join(', ')}`);
  is('and no URL reaches the screen on the way', !textOf(host).includes('sig=' + SIG));
}

{
  /* Half the flows visited, the API refusing the rest: the file is suppressed, and the screen
     names the flows still to open rather than leaving the operator to work it out. */
  const r = makeRun({ unauthorised: true });
  r.tapBookmark();
  const first = [...r.servedBy.keys()][0];
  await r.portalOpensFlowDetails(first);
  const host = r.tapBookmark();
  await tap(host, 'Fetch');
  const covered = endpoints.filter(e => r.servedBy.get(first) === e.workflow_id).map(e => e.flow_name);
  const stillNeeded = endpoints.map(e => e.flow_name).filter(n => !covered.includes(n));

  is('a partial bank suppresses the file, as a partial fetch does', /Incomplete/i.test(textOf(host)),
    textOf(host).slice(0, 200));
  /* Anchored on the todo list itself, not on the screen. The failure screen already lists every
     flow that did not resolve, so "the name appears somewhere" is green whether the todo list
     exists or not — the same trap the metadata harvester's assertions fell into. */
  const todoList = textOf(host).split('asks the API for nothing at all')[1] || '';
  is('and the screen names the flows still to open',
    !!todoList && stillNeeded.every(n => todoList.includes(n)),
    todoList ? todoList.slice(0, 300) : 'the second route is not offered at all');
  is('the flow already banked is not in that list',
    covered.length > 0 && !covered.some(n => todoList.includes(n)),
    `already held: ${covered.join(', ')}`);
}

{
  /* A URL the portal hands over WITHOUT a signature is not a credential. Banking it would mean
     offering a values file that looks complete and 401s on first use. */
  const r = makeRun({ unauthorised: true, unsignedCallbacks: true });
  r.tapBookmark();
  await r.portalOpensEveryFlow();
  const host = r.tapBookmark();
  await tap(host, 'Fetch');
  is('an invoke URL with no signature is not banked - it is not a credential',
    /Incomplete/i.test(textOf(host)) && !buttons(host).some(b => b.textContent.includes('Copy')),
    textOf(host).slice(0, 200));
}

{
  /* Reading a body must not consume the portal's copy. If it did, the maker UI would break in
     the operator's face and this would be the cause. */
  const r = makeRun();
  r.tapBookmark();
  const res = await r.window.fetch(`${API_HOST}${API_PATH}?api-version=1`, { headers: { authorization: TOKEN } });
  let body = null;
  try { body = await res.json(); } catch { /* left null */ }
  is('reading a response does not consume the copy the portal is about to read',
    !!body && Array.isArray(body.value) && body.value.length > 0,
    body ? 'the portal read its own response back empty' : 'the portal could not read its own response at all');
}

/* ── the wrong tab ─────────────────────────────────────────────────────────── */

{
  const r = makeRun({ hostname: 'example.com' });
  const host = r.tapBookmark();
  is('a tab that is not Power Automate is refused',
    /Wrong tab/i.test(textOf(host)) && r.calls.length === 0);
}

/* ── the clipboard rule ────────────────────────────────────────────────────── */

is('clipboard access lives only in the tap handler',
  /async function copyToClipboard\(\)[\s\S]{0,400}?navigator\.clipboard\.writeText/.test(source),
  'Chrome grants clipboard access on transient activation; an await before it loses the gesture');
is('the handler is reached by a click listener', /addEventListener\('click'/.test(source));

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
