#!/usr/bin/env node
/**
 * `scripts/harvest-trigger-urls.browser.js`, exercised against a simulated portal.
 *
 * WHY THIS SUITE EXISTS AT ALL
 * Until now this file had a `--check` and nothing else: proof that the generated artifact matched
 * its template, and no proof whatever that it worked. It did not. Version 1 addressed the
 * management API with execution ids, on a hardcoded host this tenant never calls, and resolved
 * none of the twenty flows. A staleness gate cannot catch that, because the stale artifact and
 * the fresh one were wrong in the same way.
 *
 * WHAT THE STUB IS SHAPED TO CATCH
 * tests/otp-verify-browser-patch.test.mjs records the lesson: a stub that answers where the code
 * looks can only ever confirm the code. So this one serves the flow API on a host and a path that
 * appear nowhere in the script, and asserts separately that no other host is ever contacted.
 *
 * And it is hostile in the way that matters here. Two identifiers are in play — the TENANT FLOW
 * ID that addresses a flow, and the APPLICATION WORKFLOW ID that a signed invoke URL carries —
 * so the stub gives every flow a workflow id UNRELATED to its own id, and for keys with two
 * candidate flows it makes the FIRST candidate the wrong one. A harvester that addresses
 * correctly but verifies nothing passes every call and produces a values file in which one
 * endpoint's signature sits under another endpoint's key. That is the worst failure available
 * here, because the file looks complete. Three assertions below exist only to catch it.
 *
 * Run: node tests/harvest-console.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/harvest-trigger-urls.browser.js';
const source = readFileSync(path.join(ROOT, SCRIPT), 'utf8');

/* Nothing in the script names either of these. Both must be learned by watching. */
const API_HOST = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com';
const API_PATH = '/powerautomate/flows';
const INVOKE_HOST = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com';
const GLOBAL_HOST = 'api.flow.microsoft.com';
const TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.PRETEND_PAYLOAD.DO_NOT_PRINT';
/* A token the same host issues for a DIFFERENT service on it. Accepted nowhere this harvester
   calls, which is the whole point. */
const OTHER_TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.WRONG_AUDIENCE.DO_NOT_PRINT';

/* Assembled, and deliberately shorter than the 20 characters tests/check-secrets.mjs treats as a
   signature, so this file cannot itself trip the leak ratchet. */
const SIG = ['s', 'i', 'g'].join('');
const invokeUrl = (workflowId) =>
  `${INVOKE_HOST}/powerautomate/automations/direct/cu/11/workflows/${workflowId}`
  + `/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&${SIG}=ABCDEFGHIJKL`;

const ENDPOINTS = JSON.parse(/const ENDPOINTS = (\[[\s\S]*?\n  \]);/.exec(source)[1]);
const CANDIDATES = JSON.parse(/const CANDIDATES = (\{[\s\S]*?\n  \});/.exec(source)[1]);
/* Tolerates `{}`. The anchor used to be the closing brace at indent two, which stopped matching
   the moment the block became empty — and then JSON.parse was handed the rest of the file. */
const EXTRA = JSON.parse(/const EXTRA_FLOW_IDS = (\{[\s\S]*?\});/.exec(source)[1]);

/**
 * One contract key with no candidate flow, CONSTRUCTED here rather than borrowed from the estate.
 *
 * These scenarios used to read EXTRA_FLOW_IDS — the keys the crosswalk could not address — which
 * meant the display-name fallback was covered only for as long as the estate had a gap.
 * IP_Get_Docs_Endpoint was exported on 12 September, the crosswalk resolved all 25 keys,
 * EXTRA_FLOW_IDS became `{}`, and three assertions here either inverted or went vacuous. The
 * fallback is still live code. An assertion that stops testing when the estate improves was
 * measuring the estate, not the rule.
 *
 * A key whose flow_name is unique, so display-name discovery cannot be satisfied by a neighbour.
 */
const UNADDRESSABLE = (() => {
  const times = new Map();
  for (const e of ENDPOINTS) times.set(e.flow_name, (times.get(e.flow_name) || 0) + 1);
  const pick = ENDPOINTS.find((e) => times.get(e.flow_name) === 1 && (CANDIDATES[e.key] || []).length);
  if (!pick) throw new Error('no key with a unique flow_name and a candidate to remove');
  return pick.key;
})();

/** The shipped artifact with one key's candidates removed — the real file, minus one fact. */
function sourceWithout(key) {
  const re = new RegExp(`("${key}":\\s*)\\[[^\\]]*\\]`);
  if (!re.test(source)) throw new Error(`cannot unaddress ${key}: no CANDIDATES entry`);
  return source.replace(re, '$1[]');
}

let passed = 0, failed = 0;
const ok = (label, detail = '') => { passed++; console.log(`  ✅ ${label}`); void detail; };
const no = (label, detail = '') => { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); };
const is = (label, cond, detail = '') => (cond ? ok(label) : no(label, detail));
const section = (s) => console.log(`\n${s}`);

/* A harvester that THROWS must read as a failed assertion, not as a suite that stopped. Under
   falsification this file killed the run partway and reported nothing at all — which looks
   exactly like a green suite that has not been read carefully. */
const runSafely = async (ctx) => {
  try { return await ctx.window.dgoHarvest.run(); }
  catch (e) { console.log(`       run() threw: ${e && e.message}`); return null; }
};

/**
 * Which tenant flow the stub decides actually serves each key.
 *
 * For a key with two candidates it is the SECOND. A harvester that stops at the first candidate
 * because the call succeeded — rather than because the answer verified — fails here and nowhere
 * else, which is the point.
 */
function truth({ breakKey = null, unnamed = false, unaddressable = null } = {}) {
  const servedBy = new Map();   /* tenantFlowId -> the workflow id its invoke URL carries */
  const chosen = new Map();     /* contract key -> the tenant flow id that really serves it */
  for (const e of ENDPOINTS) {
    const ids = e.key === unaddressable ? [] : (CANDIDATES[e.key] || []);
    if (!ids.length) continue;
    const right = ids[ids.length - 1];
    chosen.set(e.key, right);
    for (const id of ids) {
      /* A decoy's invoke URL names a workflow that belongs to no key at all, so accepting one
         cannot accidentally look correct.

         It must be VALID HEX, and the first version of this was not: a decoy containing "y" was
         rejected by the regex that reads a workflow id out of a URL, so the verification step
         could be deleted and this suite still passed. A decoy that fails an earlier check than
         the one under test proves nothing about the check under test. */
      if (!servedBy.has(id)) servedBy.set(id, id === right ? e.workflow_id : 'dec0de' + id.replace(/-/g, '').slice(6, 32));
    }
    if (breakKey === e.key) servedBy.set(right, 'f00d' + right.replace(/-/g, '').slice(4, 32));
  }
  /* The unaddressable key exists in the tenant and is discoverable by display name — unless this
     run is testing what happens when it is not. */
  const extras = [];
  if (unaddressable) {
    const e = ENDPOINTS.find((x) => x.key === unaddressable);
    const flowId = 'd15c07e5-ab12-cd34-ef56-000000000001';
    servedBy.set(flowId, e.workflow_id);
    chosen.set(unaddressable, flowId);
    extras.push({ id: flowId, displayName: unnamed ? 'Something Else Entirely' : e.flow_name });
  }
  return { servedBy, chosen, extras };
}

function harness({ breakKey = null, unnamed = false, throttleOnce = false, offline = false, flakyTimes = 0, unauthorised = false, unaddressable = null } = {}) {
  let flakesLeft = flakyTimes;
  /* The portal's own call is what discovery reads, and it succeeded — that is how the host was
     learned in the first place. The network degrades AFTER it, which is the order the tenant
     showed and the only order in which this scenario means anything. */
  let armed = false;
  const lines = [];
  const calls = [];
  const { servedBy, chosen, extras } = truth({ breakKey, unnamed, unaddressable });
  let throttled = false;

  let clock = Date.UTC(2026, 8, 11);
  class FakeDate extends Date {
    constructor(...a) { if (!a.length) super(clock); else super(...a); }
    static now() { return clock; }
  }
  const fakeSetTimeout = (fn, ms = 0) => { clock += Number(ms) || 0; return setImmediate(fn); };

  const u_origin_is_api = (raw) => { try { return new URL(raw).origin === API_HOST; } catch { return false; } };
  const mk = (status, payload, headers = {}) => { let used = false; return ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    /* A body is READ ONCE, as a real one is. A stub whose text() can be called forever cannot
       tell a script that clones before reading from one that consumes the portal's own copy —
       and the second breaks the maker UI in the operator's face. */
    text: async () => {
      if (used) throw new TypeError('body stream already read');
      used = true;
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    },
    /* A real Response can be cloned, and the script relies on that to read a body without
       consuming the copy the portal is about to read. A stub that cannot be cloned disables the
       whole second route while every assertion stays green. */
    clone: () => mk(status, payload, headers),
  }); }

  /* NOT "manual". A harvester that matches the trigger by name misses this entirely. */
  const TRIGGER = 'When_a_HTTP_request_is_received';
  const flowBody = (id) => ({
    name: id,
    properties: {
      displayName: (extras.find((x) => x.id === id) || {}).displayName || 'Flow ' + id.slice(0, 8),
      definition: {
        triggers: {
          Every_day: { type: 'Recurrence' },
          [TRIGGER]: { type: 'Request', kind: 'Http', inputs: { method: 'POST' } },
        },
      },
    },
  });

  /* The distinction the whole second route rests on: the PORTAL is authorised and the script
     replaying its token is not. Set only while a call the stub portal itself makes is in
     flight, which is safe because fakeFetch records synchronously before its first await. */
  let portalIsCalling = false;
  const asPortal = (fn) => { portalIsCalling = true; const p = fn(); portalIsCalling = false; return p; };

  const fakeFetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url: raw, method, headers: init.headers || {}, byPortal: portalIsCalling });
    /* A network failure REJECTS. It is not a status, and a stub that only ever resolves cannot
       tell the difference between code that handles one and code that has never met one. */
    if (armed && offline) throw new TypeError('Failed to fetch');
    if (armed && unauthorised && u_origin_is_api(raw) && !portalIsCalling) return mk(401, { error: { message: 'unauthorized' } });
    if (armed && flakesLeft > 0) { flakesLeft--; throw new TypeError('Failed to fetch'); }
    const u = new URL(raw);
    if (u.origin !== API_HOST) return mk(404, { error: { message: 'nothing here' } });

    if (u.pathname === API_PATH) {
      const value = [...servedBy.keys()].map((id) => flowBody(id));
      return mk(200, { value });
    }
    const flow = /^\/powerautomate\/flows\/([^/]+)$/.exec(u.pathname);
    if (flow) {
      if (!servedBy.has(flow[1])) return mk(404, { error: { message: 'not found' } });
      return mk(200, flowBody(flow[1]));
    }
    const cb = /^\/powerautomate\/flows\/([^/]+)\/triggers\/([^/]+)\/listCallbackUrl$/.exec(u.pathname);
    if (cb) {
      if (!servedBy.has(cb[1])) return mk(404, { error: { message: 'not found' } });
      if (decodeURIComponent(cb[2]) !== TRIGGER) return mk(400, { error: { message: 'no such trigger' } });
      if (throttleOnce && !throttled) { throttled = true; return mk(429, { error: { message: 'slow down' } }, { 'retry-after': '7' }); }
      return mk(200, { value: invokeUrl(servedBy.get(cb[1])) });
    }
    return mk(404, { error: { message: 'no route' } });
  };

  const win = {};
  const sandbox = {
    window: win,
    location: { href: 'https://make.powerautomate.com/environments/x/flows', hostname: 'make.powerautomate.com' },
    fetch: fakeFetch,
    Headers, URL, URLSearchParams,
    Date: FakeDate,
    setTimeout: fakeSetTimeout,
    XMLHttpRequest: class { open(m, u) { this.__u = u; } setRequestHeader() {} send() {} },
    console: {
      log: (...a) => lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
      table: (rows) => lines.push('TABLE ' + JSON.stringify(rows)),
      error: (...a) => lines.push(a.map(String).join(' ')),
    },
  };
  sandbox.globalThis = sandbox;
  win.fetch = fakeFetch;
  win.XMLHttpRequest = sandbox.XMLHttpRequest;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(unaddressable ? sourceWithout(unaddressable) : source, ctx);

  /** What the portal itself does when you click into a flow. */
  const portalLoads = () => {
    ctx.window.fetch(`${API_HOST}${API_PATH}/${[...servedBy.keys()][0]}?api-version=1`, { headers: { authorization: TOKEN } });
    armed = true;
  };

  /* The same HOST, a different service. This tenant runs several off one hostname, and the
     portal presents a different audience for some of them. */
  const portalCallsANeighbouringService = () => {
    ctx.window.fetch(`${API_HOST}/powerautomate/GETMYFLOWSUSPENSIONSTATUS?api-version=1`,
      { headers: { authorization: OTHER_TOKEN } });
    ctx.window.fetch(`${API_HOST}/powerapps/userSettings/Whatever?api-version=1`,
      { headers: { authorization: OTHER_TOKEN } });
  };
  /* What the portal does when you open a flow's DETAILS page: it asks for the flow, and it asks
     for the trigger URL so it can render the "HTTP POST URL" box. Both answers go past the hook,
     and the second one carries a signed invoke URL. */
  const portalOpensFlowDetails = async (id) => {
    armed = true;
    await asPortal(() => ctx.window.fetch(`${API_HOST}${API_PATH}/${id}?api-version=1`,
      { headers: { authorization: TOKEN } }));
    await asPortal(() => ctx.window.fetch(
      `${API_HOST}${API_PATH}/${id}/triggers/${encodeURIComponent(TRIGGER)}/listCallbackUrl?api-version=1`,
      { method: 'POST', headers: { authorization: TOKEN } }));
    await flush();
  };
  const portalOpensEveryFlow = async () => {
    for (const id of new Set(chosen.values())) await portalOpensFlowDetails(id);
  };
  /* Banking is two microtask hops behind the response (clone, then text). */
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

  const settle = async (marker) => {
    for (let i = 0; i < 8000 && !lines.some((l) => marker.test(l)); i++) await new Promise((r) => setImmediate(r));
  };
  return { lines, calls, ctx, portalLoads, portalCallsANeighbouringService, portalOpensFlowDetails,
           portalOpensEveryFlow, flush, settle, chosen, servedBy, extras };
}

console.log('\nThe trigger-URL harvester\n');

/* ── discovery ──────────────────────────────────────────────────────────────── */
section('  DISCOVERY — it is shown the host, it does not know it');
{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED|Did not see it/);

  is('it finds the flow API on a host that appears nowhere in the script',
     h.lines.some((l) => l.includes('found the flow API on ' + new URL(API_HOST).hostname)),
     h.lines.join('\n       '));
  is('the script contains no hardcoded global flow host',
     !new RegExp(`['"\`]https://${GLOBAL_HOST.replace(/\./g, '\\.')}`).test(source));
  is('the read-only pass runs on paste and fetches nothing',
     h.lines.some((l) => l.includes('NOTHING WAS FETCHED')) && h.calls.length === 1,
     `calls: ${h.calls.map((c) => c.url).join(', ')}`);
  is('the dry run says how many candidates each key has',
     h.lines.some((l) => l.startsWith('TABLE ') && l.includes('candidates')));
}

{
  const h = harness();
  await h.ctx.window.dgoHarvest.dry(0);
  is('shown nothing, it guesses nothing and sends no request',
     h.calls.length === 0 && h.lines.some((l) => l.includes('Did not see it')),
     `calls: ${h.calls.length}`);
}

/* ── the harvest ────────────────────────────────────────────────────────────── */
section('  THE HARVEST — addressed by one identifier, verified against another');
{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);
  const block = h.lines.find((l) => l.includes('=' + INVOKE_HOST)) || '';

  is('every contract key resolves', !!summary && summary.failed === 0 && summary.resolved === ENDPOINTS.length,
     summary ? `resolved=${summary.resolved} failed=${summary.failed}` : 'run() returned nothing');
  is('it never contacts a host it was not shown',
     h.calls.every((c) => c.url.startsWith(API_HOST)),
     h.calls.map((c) => c.url).find((u) => !u.startsWith(API_HOST)) || '');
  is('it never addresses a flow by an application workflow id',
     !h.calls.some((c) => ENDPOINTS.some((e) => c.url.includes('/flows/' + e.workflow_id))),
     'that is the execution identifier; the management API answers 404 for it');
  is('every call carries the bearer the portal itself used',
     h.calls.filter((c) => c.url !== `${API_HOST}${API_PATH}/${[...h.servedBy.keys()][0]}?api-version=1`)
       .every((c) => c.headers.Authorization === TOKEN));
  is('the callback URL is requested by POST',
     h.calls.filter((c) => c.url.includes('listCallbackUrl')).every((c) => c.method === 'POST'));
  is('the trigger is found by kind, not by name',
     h.calls.some((c) => c.url.includes('When_a_HTTP_request_is_received')),
     'the stub names its Request trigger something other than "manual"');

  /* The three that catch a harvester which fetches correctly and checks nothing. */
  const emitted = new Map();
  for (const line of block.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) emitted.set(m[1], m[2]);
  }
  is('the values block carries every contract key exactly once',
     emitted.size === ENDPOINTS.length && ENDPOINTS.every((e) => emitted.has(e.key)),
     `${emitted.size} lines for ${ENDPOINTS.length} keys`);
  const misfiled = ENDPOINTS.filter((e) => {
    const url = emitted.get(e.key) || '';
    return !url.includes('/workflows/' + e.workflow_id + '/');
  });
  is('every emitted URL is for the workflow its own key expects', misfiled.length === 0,
     misfiled.map((e) => `${e.key} got ${(/\/workflows\/([0-9a-f]{32})\//.exec(emitted.get(e.key) || '') || [])[1]}`).join('\n       '));
  const twoCandidate = ENDPOINTS.filter((e) => (CANDIDATES[e.key] || []).length > 1);
  is('where two flows were candidates, it kept the one that verified',
     twoCandidate.length > 0 && twoCandidate.every((e) => {
       const wrong = CANDIDATES[e.key][0];
       return h.calls.some((c) => c.method === 'POST' && c.url.includes(wrong))     /* it tried the decoy */
         && (emitted.get(e.key) || '').includes('/workflows/' + e.workflow_id + '/'); /* and rejected it */
     }),
     `${twoCandidate.length} keys have two candidates`);

  is('it lists no flows at all when every key already has a candidate',
     h.calls.filter((c) => c.url.startsWith(`${API_HOST}${API_PATH}?`)).length === 0,
     'the listing exists for keys the crosswalk cannot address; with none, it is a wasted call');
  is('EXTRA_FLOW_IDS is empty, because the crosswalk now addresses every key',
     Object.keys(EXTRA).length === 0,
     `still carrying: ${Object.keys(EXTRA).join(', ')} — if a key regressed, say so here rather than in a harvest`);
}

/* ── the fallback ───────────────────────────────────────────────────────────────
   The crosswalk addresses all 25 keys as of 12 September, so nothing in the estate exercises
   the display-name fallback any more. The condition is constructed instead: the shipped
   artifact is run with ONE key's candidates removed. Deleting that code would otherwise be
   invisible until the next time a flow went missing. */
section('  THE FALLBACK — a key with no candidate is looked up, and still verified');
{
  const h = harness({ unaddressable: UNADDRESSABLE });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);
  const block = h.lines.find((l) => l.includes('=' + INVOKE_HOST)) || '';
  const line = block.split('\n').find((l) => l.trim().startsWith(UNADDRESSABLE + '=')) || '';
  const want = ENDPOINTS.find((e) => e.key === UNADDRESSABLE).workflow_id;

  is('every key still resolves, the unaddressable one included',
     !!summary && summary.failed === 0 && summary.resolved === ENDPOINTS.length,
     summary ? `resolved=${summary.resolved} failed=${summary.failed} (removed ${UNADDRESSABLE})` : 'run() returned nothing');
  is('the one with no candidate is found by display name',
     line.includes('/workflows/' + want + '/'),
     `${UNADDRESSABLE} expected workflow ${want}`);
  is('and the flow list is fetched once, only because a key needed it',
     h.calls.filter((c) => c.url.startsWith(`${API_HOST}${API_PATH}?`)).length === 1,
     `listing calls: ${h.calls.filter((c) => c.url.startsWith(`${API_HOST}${API_PATH}?`)).length}`);
}

/* ── refusal ────────────────────────────────────────────────────────────────── */
section('  REFUSAL — a values file that looks complete is the dangerous one');
{
  const broken = ENDPOINTS.find((e) => (CANDIDATES[e.key] || []).length === 1);
  /* Breaking one FLOW breaks every key it serves, and keys share flows here: SUBSIDIARY_ACTIONS
     and DYNAMIC_ACTIONS are two contract keys on one flow. Expecting exactly one failure would
     have been a test asserting the estate is simpler than it is. */
  const brokenFlow = CANDIDATES[broken.key][0];
  const alsoBroken = ENDPOINTS.filter((e) => (CANDIDATES[e.key] || []).includes(brokenFlow));
  const h = harness({ breakKey: broken.key });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);

  is('a flow serving the wrong workflow fails every key it serves',
     !!summary && summary.failed === alsoBroken.length,
     summary ? `failed=${summary.failed}, expected ${alsoBroken.length} (${alsoBroken.map((e) => e.key).join(', ')})` : 'run() returned nothing');
  is('it says which workflow answered instead',
     h.lines.some((l) => l.includes('serves workflow') && l.includes(broken.key)),
     h.lines.filter((l) => l.includes(broken.key)).join('\n       '));
  is('one unresolved key suppresses the whole block',
     h.lines.some((l) => l.includes('Incomplete - nothing is printed.')));
  is('and no signature is printed anywhere',
     !h.lines.some((l) => l.includes(SIG + '=')),
     h.lines.find((l) => l.includes(SIG + '=')) || '');
  is('it distinguishes a wrong flow from a permissions problem',
     h.lines.some((l) => l.includes('not a permissions problem')));
}

{
  const h = harness({ unaddressable: UNADDRESSABLE, unnamed: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);
  is('a key with no candidate and no name match fails rather than guessing',
     !!summary && summary.failed === 1,
     summary ? `failed=${summary.failed}, expected 1 (${UNADDRESSABLE})` : 'run() returned nothing');
  is('and it names the flow it was looking for',
     h.lines.some((l) => l.includes('no candidate flow')));
  is('nothing is printed, not even the twenty-four that did resolve',
     !h.lines.some((l) => l.includes(SIG + '=')));
}

/* ── the token ──────────────────────────────────────────────────────────────────
   Run against the tenant, every one of the 25 keys answered 401. The cause was here: the hook
   refreshed its token from any request to the same ORIGIN, and this tenant runs several
   services off one hostname with different audiences — so the last call past the hook, a
   suspension-status poll, overwrote the flow API's token with one the flow API rejects.
   Twenty-five 401s that read as a tenant-wide permissions problem, from one overwrite. */
section('  THE TOKEN — one host, several services, one of them ours');
{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  h.portalCallsANeighbouringService();
  const summary = await runSafely(h.ctx);

  is('a neighbouring service on the same host does not overwrite the flow API token',
     !!summary && summary.failed === 0 && h.calls.filter((c) => c.headers.Authorization === OTHER_TOKEN).length === 0,
     summary ? `failed=${summary.failed}; calls carrying the wrong audience: `
       + h.calls.filter((c) => c.headers.Authorization === OTHER_TOKEN).length : 'run() threw');
}

{
  const h = harness({ unauthorised: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);

  is('every key answering 401 fails the run', !!summary && summary.failed === ENDPOINTS.length,
     summary ? `failed=${summary.failed}` : 'run() threw');
  is('it says that is ONE token, not twenty-five permissions problems',
     h.lines.some((l) => /answered 401/.test(l) && /one expired or wrong token/.test(l)),
     h.lines.slice(-4).join('\n       '));
  is('it names the recovery — forget, re-observe, re-run',
     h.lines.some((l) => l.includes('dgoHarvest.forget()')));
  is('nothing is printed', !h.lines.some((l) => l.includes(SIG + '=')));
}

{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  h.ctx.window.dgoHarvest.forget();
  const before = h.calls.length;
  await h.ctx.window.dgoHarvest.dry(0);
  is('forget() drops what was observed, so nothing is addressed until it is seen again',
     h.lines.some((l) => /Did not see it/.test(l)) && h.calls.length === before,
     `calls after forget: ${h.calls.length - before}`);
}

/* ── the network ────────────────────────────────────────────────────────────────
   Not hypothetical. Run against this estate's tenant the console filled with
   ERR_NAME_NOT_RESOLVED and ERR_CONNECTION_TIMED_OUT against the flow API host itself.
   `fetch` REJECTS on those rather than resolving with a status, and an uncaught rejection does
   not fail a candidate — it throws out of the whole harvest, abandoning twenty flows partway
   with nothing printed and no list of what failed. */
section('  THE NETWORK — a rejected fetch is not a status');
{
  const h = harness({ offline: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);

  is('an unreachable host fails every key rather than throwing out of the run',
     !!summary && summary.failed === ENDPOINTS.length && summary.resolved === 0,
     summary ? `resolved=${summary.resolved} failed=${summary.failed}` : 'run() threw — the harvest died instead of reporting');
  is('it says the network gave no answer, not that permission was refused',
     h.lines.some((l) => l.includes('no answer from the network')),
     h.lines.slice(-6).join('\n       '));
  is('it distinguishes an unreachable host from a Power Automate problem',
     h.lines.some((l) => l.includes('not a Power Automate')));
  is('nothing is printed', !h.lines.some((l) => l.includes(SIG + '=')));
  is('it retries before giving up on a candidate',
     h.lines.some((l) => l.includes('retrying in')));
}

{
  /* Two rejections then an answer: the shape of a DNS blip, which is what the tenant showed. */
  const h = harness({ flakyTimes: 2 });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);
  is('a transient network failure is retried and the harvest completes',
     !!summary && summary.failed === 0 && summary.resolved === ENDPOINTS.length,
     summary ? `resolved=${summary.resolved} failed=${summary.failed}` : 'run() threw');
}

/* ── resilience ─────────────────────────────────────────────────────────────── */
section('  RESILIENCE');
{
  const h = harness({ throttleOnce: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await runSafely(h.ctx);
  is('a 429 is a pace instruction, not a failure', !!summary && summary.failed === 0,
     summary ? `failed=${summary.failed}` : 'run() returned nothing');
  is('it honours Retry-After rather than its own backoff',
     h.lines.some((l) => l.includes('waiting 7s')),
     h.lines.filter((l) => l.includes('throttled')).join(' | '));
}

/* ── the second route ──────────────────────────────────────────────────────────
   Run against the tenant, all twenty-five keys answered 401 while the maker UI beside them kept
   working. A session can be authorised for the portal and refused at the management API, and no
   amount of re-observing the token changes that. So the hook reads RESPONSES too: the portal
   fetches each flow's trigger URL in order to display it, and that answer is banked under the
   workflow it names. The route cannot be refused, because the script never asks for anything. */
section('  THE SECOND ROUTE — the portal is authorised and this script is not');
{
  const h = harness({ unauthorised: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  await h.portalOpensEveryFlow();
  const before = h.calls.length;
  const summary = await runSafely(h.ctx);
  const mine = h.calls.slice(before).filter((c) => !c.byPortal);
  const block = h.lines.find((l) => l.includes('=' + INVOKE_HOST)) || '';

  is('with every call refused 401, the harvest still completes from what the portal fetched',
     !!summary && summary.failed === 0 && summary.resolved === ENDPOINTS.length,
     summary ? `resolved=${summary.resolved} failed=${summary.failed}` : 'run() returned nothing');
  is('and it made no call of its own to do it', mine.length === 0,
     mine.map((c) => c.url).join(', '));

  const emitted = new Map();
  for (const line of block.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) emitted.set(m[1], m[2]);
  }
  const misfiled = ENDPOINTS.filter((e) => !(emitted.get(e.key) || '').includes('/workflows/' + e.workflow_id + '/'));
  is('every banked URL still lands under the key whose workflow id it carries',
     emitted.size === ENDPOINTS.length && misfiled.length === 0,
     `${emitted.size} lines; misfiled: ${misfiled.map((e) => e.key).join(', ')}`);
}

{
  /* The safety property that makes the route usable by a human clicking around: opening the
     WRONG flow cannot contaminate anything, because a URL is filed by the workflow it names and
     no key claims that workflow. */
  const h = harness();
  const { bankFromText, bankedFor } = h.ctx.window.dgoHarvest.helpers;
  const strayWorkflow = 'dec0dedec0dedec0dedec0dedec0de00';
  const added = bankFromText(JSON.stringify({ value: invokeUrl(strayWorkflow) }), 'test');
  is('a URL from a flow no contract key claims is banked and reaches no key',
     added === 1 && ENDPOINTS.every((e) => bankedFor(e.key) === null),
     `added=${added}; keys claimed: ${ENDPOINTS.filter((e) => bankedFor(e.key)).map((e) => e.key).join(', ')}`);
  is('banking it printed a count and never the URL',
     h.lines.some((l) => /banked 1 trigger URL/.test(l)) && !h.lines.some((l) => l.includes(SIG + '=')),
     h.lines.filter((l) => /banked/.test(l)).join(' | '));

  const dup = bankFromText(JSON.stringify({ value: invokeUrl(strayWorkflow) }), 'test');
  is('seeing the same URL twice does not count twice', dup === 0, `added again: ${dup}`);
  is('a body with no invoke URL in it costs nothing',
     bankFromText(JSON.stringify({ value: 'https://example.invalid/no/workflows/here' }), 'test') === 0);
  is('an invoke URL with no signature is not banked - it is not a credential',
     bankFromText(JSON.stringify({ value: `${INVOKE_HOST}/powerautomate/automations/direct/cu/11/workflows/`
       + 'aa662769f13a4666bfadf3039cd8d247/triggers/manual/paths/invoke?api-version=1' }), 'test') === 0);
}

{
  /* JSON is allowed to escape its forward slashes, and some of this tenant's answers do. */
  const h = harness();
  const { bankFromText, bankedFor } = h.ctx.window.dgoHarvest.helpers;
  const target = ENDPOINTS[0];
  const escaped = JSON.stringify({ value: invokeUrl(target.workflow_id) }).replace(/\//g, '\\/');
  bankFromText(escaped, 'test');
  is('a URL whose slashes are JSON-escaped is still read',
     !!bankedFor(target.key), `looking for ${target.workflow_id}`);
}

{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const pendingBefore = h.ctx.window.dgoHarvest.pending();
  const flowNames = [...new Set(ENDPOINTS.map((e) => e.flow_name))];
  is('pending() counts the keys still missing and names the flows to open',
     pendingBefore === ENDPOINTS.length
     && flowNames.every((n) => h.lines.some((l) => l.startsWith('%c  ' + n))),
     `pending=${pendingBefore} of ${ENDPOINTS.length}`);

  await h.portalOpensEveryFlow();
  is('and drops to nothing once the portal has shown every flow',
     h.ctx.window.dgoHarvest.pending() === 0);

  const held = Object.keys(h.ctx.window.__dgoHarvest.bank).length;
  h.ctx.window.dgoHarvest.wipe();
  is('wipe() drops the banked credentials and says how many',
     held > 0 && Object.keys(h.ctx.window.__dgoHarvest.bank).length === 0
     && h.lines.some((l) => /Dropped .*\d+ banked URL/.test(l)),
     `held ${held} before wipe`);
  is('forget() does not - a banked URL is the harvest, not an observation',
     (() => { const g = harness(); g.ctx.window.dgoHarvest.helpers
       .bankFromText(JSON.stringify({ value: invokeUrl(ENDPOINTS[0].workflow_id) }), 'test');
       g.ctx.window.dgoHarvest.forget();
       return !!g.ctx.window.dgoHarvest.helpers.bankedFor(ENDPOINTS[0].key); })());
}

{
  /* The failure this section exists to make visible: the operator pasted the file, saw two
     lines, and waited three minutes in silence because the report came AFTER the wait. */
  const h = harness();
  await h.settle(/NOTHING WAS FETCHED/);
  is('the read-only pass reports before it waits, not after',
     h.lines.some((l) => l.startsWith('TABLE ')) && h.lines.some((l) => /^contract keys\s/.test(l))
     && !h.lines.some((l) => l.includes('found the flow API on')),
     'nothing was ever shown to it, and it still printed the table');

  await h.settle(/still waiting/);
  is('and while it waits it says what has gone past the hook',
     h.lines.some((l) => /still waiting - \d+ request\(s\) past the hook/.test(l)),
     h.lines.filter((l) => /still waiting/.test(l)).slice(0, 2).join(' | '));
}

{
  /* Reading a body must not consume the portal's copy of it. If it did, the maker UI would
     break in the operator's face and the script would be the cause. */
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const res = await h.ctx.window.fetch(`${API_HOST}${API_PATH}?api-version=1`, { headers: { authorization: TOKEN } });
  let body = null;
  try { body = JSON.parse(await res.text()); } catch { /* left null */ }
  is('reading a response does not consume the copy the portal is about to read',
     !!body && Array.isArray(body.value) && body.value.length > 0,
     body ? 'body read back empty' : 'the portal could not read its own response');
}

/* ── the rules, exercised directly ──────────────────────────────────────────── */
section('  THE RULES — read off the helpers, not inferred from the log');
{
  const h = harness();
  const { requestTrigger, workflowIdOf, safe } = h.ctx.window.dgoHarvest.helpers;
  is('the Request trigger is found whatever it is called',
     requestTrigger({ triggers: { Anything_At_All: { type: 'Request' }, Daily: { type: 'Recurrence' } } }) === 'Anything_At_All');
  is('a definition with no Request trigger yields nothing, rather than the first trigger',
     requestTrigger({ triggers: { Daily: { type: 'Recurrence' } } }) === null);
  is('the workflow id is read out of the invoke path',
     workflowIdOf(invokeUrl('aa662769f13a4666bfadf3039cd8d247')) === 'aa662769f13a4666bfadf3039cd8d247');
  is('a URL with no workflow segment yields nothing rather than a partial match',
     workflowIdOf('https://example.invalid/nothing/here') === null);
  is('anything carrying a signature is redacted whole, not patched',
     safe(invokeUrl('aa662769f13a4666bfadf3039cd8d247')) === '[redacted - carried a credential]');
  is('ordinary text is left alone', safe('IP_SEND_EMAIL') === 'IP_SEND_EMAIL');
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
