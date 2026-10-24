/*
 * Fetch every endpoint's trigger URL from Power Automate — from a browser devtools console,
 * using the session you are already signed into.
 *
 * WHY THIS EXISTS
 *   The obvious route is PowerShell: Microsoft.PowerApps.PowerShell plus Add-PowerAppsAccount.
 *   This file needs neither, and needs no Entra app registration and no tenant admin. It is the
 *   same REST API, called by the browser that already holds a token for it — the same reasoning
 *   as scripts/provision-sharepoint-fields.browser.js, one service across.
 *
 * WHAT IT REPLACES
 *   Opening 20 flows in the portal, copying each HTTP trigger URL by hand, and pasting the
 *   signature into a values file 25 times. That is roughly half an hour of transcription, and a
 *   transcription error surfaces later as an endpoint that answers 401 for no visible reason.
 *
 * WHY VERSION 1 RESOLVED NOTHING, AND WHAT CHANGED
 *   It addressed the management API with EXECUTION ids. The 32-hex value in
 *   `endpoint-register.json` is the workflow segment of a signed invoke URL; the management API
 *   addresses a flow by a dashed GUID that is a different identifier entirely, and the dashes are
 *   not the difference — inserting them produces a GUID that answers 404. It also hardcoded
 *   api.flow.microsoft.com, which this tenant never calls.
 *
 *   So this version does three things instead of guessing:
 *
 *   1. IT WATCHES THE PORTAL rather than naming a host. It hooks fetch and XMLHttpRequest, reads
 *      the Authorization header off a request the page itself makes, and takes the origin, the
 *      base path and the api-version verbatim. The token is then correct by construction: it is
 *      the one that host just accepted, at the audience that host requires. Two shapes are
 *      recognised, and adding a third is adding a row — see FLOW_API_SHAPES.
 *
 *   2. IT ADDRESSES FLOWS BY TENANT FLOW ID, from docs/reference/flow-identity-crosswalk.json,
 *      baked in below. Seven contract keys have TWO candidate flows, so it tries each.
 *
 *   3. IT PROVES THE MATCH RATHER THAN ASSUMING IT. A callback URL is accepted for a key only if
 *      the invoke URL that comes back carries that key's application workflow id — the same
 *      32-hex value the register holds. Anything else is discarded and reported.
 *
 *   4. IT ALSO READS THE PORTAL'S ANSWERS, not just its requests. A flow's details page shows
 *      that flow's HTTP POST URL, which means the portal fetched it — and that answer goes past
 *      the same hook. The signed invoke URL in it is banked under the workflow it names, so
 *      opening a flow in the portal resolves that flow's key with NO call from this script at
 *      all. That route cannot be refused: the portal is authorised even when a replayed token
 *      is not, which is exactly the condition this tenant produced — twenty-five 401s from a
 *      session whose maker UI was working perfectly well beside them.
 *
 *   That third step is what makes the second safe. A wrong candidate cannot produce a wrong
 *   credential; it produces a mismatch, which is why this file is also willing to guess a flow by
 *   DISPLAY NAME for a key the crosswalk cannot resolve. Unverified, a name match would be how
 *   one endpoint's signature ends up under another endpoint's key — the worst failure available
 *   here, because the values file would look complete.
 *
 * HOW TO RUN
 *   1. Sign in to https://make.powerautomate.com and open ANY flow you own.
 *   2. Open devtools (F12) -> Console. Paste this entire file and press Enter.
 *   3. NOW NAVIGATE INSIDE THE PORTAL, WITHOUT RELOADING: open My flows, or switch between two
 *      flows. Each navigation makes the portal call its flow API, and the hook reads the request
 *      as it goes past.
 *
 *      DO NOT PRESS F5. A reload destroys this script along with the rest of the page's
 *      JavaScript, so the hook would be gone before the traffic it waits for happens. The portal
 *      is a single-page app: navigating inside it calls the API without reloading, which is the
 *      whole reason this works. If you do reload, paste the file again.
 *   4. It then reports what it WOULD fetch. Nothing has been fetched.
 *   5. To harvest for real:   dgoHarvest.run()
 *   6. Save the printed block as ~/dgo-values.txt, then from the repository:
 *        npm run check:values -- ~/dgo-values.txt
 *        npm run setup -- --values ~/dgo-values.txt --force
 *
 *   dgoHarvest.run()      harvest, verify, and print the values block
 *   dgoHarvest.dry()      run the read-only pass again
 *   dgoHarvest.status()   what it has found, and where
 *   dgoHarvest.seen()     every authenticated endpoint it watched, for diagnosis
 *   dgoHarvest.pending()  which flows still need opening, if the API route is refused
 *   dgoHarvest.wipe()     drop everything, banked credentials included
 *
 *   PERMISSION — you must OWN or CO-OWN each flow. This uses the same user-scoped API the portal
 *   uses, never the admin API, so a flow owned solely by a colleague is invisible until they add
 *   you as a co-owner. Tenant admin is not needed and is not used.
 *
 * WHY IT NO LONGER READS THE TOKEN OUT OF MSAL STORAGE
 *   It used to, matching a key against `service.flow.microsoft.com`. That is a guess about which
 *   audience this tenant's flow API accepts, and a wrong-audience token fails as a 401 that reads
 *   exactly like a permissions problem. A token lifted off a request the host has just answered
 *   needs no such guess. One mechanism that is provably right beats two with unclear precedence.
 *
 * THE OUTPUT IS A CREDENTIAL
 *   Every line it prints ends in a signature, and possession of one authorises invoking that
 *   flow. Save it to ~/dgo-values.txt, which is git-ignored. Never paste it into a chat, an issue,
 *   or a commit. Clear the console when you are done.
 *
 *   Nothing else this file prints can carry one: a URL is never logged, only the 32-hex workflow
 *   id parsed out of it, which is already public in the repository.
 */
(() => {
  'use strict';

  /* The 25 contract keys and the workflow each calls, from docs/reference/endpoint-register.json.
     Kept inline because a devtools console cannot read the repository. Regenerate this block with
     `npm run harvest:console` if the register changes. */
  const ENDPOINTS = __ENDPOINTS__;

  /* contractKey -> the tenant flow ids that may serve it, from
     docs/reference/flow-identity-crosswalk.json. More than one is normal: seven keys have two
     candidates and the crosswalk deliberately does not pick between them, because a display name
     and a modified date cannot tell a duplicate from a rename. The callback URL can. */
  const CANDIDATES = __CANDIDATES__;

  /* Fill one in if a key cannot be resolved any other way. Open the flow in the portal and copy
     the GUID out of the address bar: .../flows/<THIS>/details */
  const EXTRA_FLOW_IDS = __EXTRA_FLOW_IDS__;

  const T = { ok: 'color:#0a0;font-weight:bold', bad: 'color:#c00;font-weight:bold',
              warn: 'color:#b8860b', info: 'color:#268bd2', dim: 'color:#888' };
  const log = (...a) => console.log(...a);
  const say = (m, style) => (style ? console.log('%c' + m, style) : console.log(m));

  /* Nothing printed may carry a credential, so anything that looks like one is replaced whole
     rather than patched. A partial redaction of a string nobody checked is how the last one
     leaked. */
  const CARRIES_SECRET = /sig=|SharedAccessSignature|Bearer\s|eyJ[A-Za-z0-9_-]{20}/i;
  const safe = (v) => (CARRIES_SECRET.test(String(v)) ? '[redacted - carried a credential]' : v);

  const byKey = new Map(ENDPOINTS.map((e) => [e.key, e]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** The workflow id an invoke URL addresses. This is the join to the endpoint register, and the
      only thing about a callback URL this file is willing to look at or print. */
  const WORKFLOW_IN_INVOKE_URL = /\/workflows\/([0-9a-f]{32})\//i;
  const workflowIdOf = (callbackUrl) => (WORKFLOW_IN_INVOKE_URL.exec(String(callbackUrl)) || [])[1] || null;

  /* ---- the second route: reading the portal's own answers -----------------------------------
     Replaying the portal's bearer is the fast path, and it is not always available. Run against
     this tenant, all twenty-five keys answered 401 while the maker UI beside them kept working:
     a session can be authorised for the portal and refused at the management API, and arguing
     with that is a losing position. The portal is authorised; this script is not.

     So the hook reads RESPONSES as well as requests. Opening a flow's details page makes the
     portal fetch that flow's HTTP POST URL in order to display it, and that answer passes the
     same hook — the signed invoke URL in it is banked under the workflow id it names. One visit
     per flow, and no call from here at all.

     The verification is identical either way: a URL is matched to a contract key only when it
     carries that key's register workflow id. A banked URL is therefore exactly as trustworthy
     as a fetched one, and opening the WRONG flow cannot produce a wrong credential — it banks
     under a workflow no key claims.

     THE BANK HOLDS CREDENTIALS, on `window`, for as long as the tab lives. Nothing prints one
     but the final values block; dgoHarvest.wipe() drops them. */
  const SCANNABLE_TYPE = /json|text\/plain/i;
  const SCAN_LIMIT = 4 * 1024 * 1024;
  /* Specific enough that a false positive is not a plausible failure mode: a workflows/<32 hex>
     segment AND a signature. The signature is required deliberately — an invoke URL without one
     is not a credential, and banking it would mean printing a values file that 401s on first
     use, which is worse than printing nothing. */
  const INVOKE_URL_IN_TEXT = /https:\/\/[^\s"'<>\\]+\/workflows\/[0-9a-f]{32}\/[^\s"'<>\\]*[?&]sig=[^\s"'<>\\&]+/gi;

  /* ---- watching, rather than guessing -------------------------------------------------------
     Two shapes, matched in order. The first is the classic ProcessSimple path, which names the
     environment in a path segment. The second is this tenant's: per-environment by HOSTNAME, with
     a flat /powerautomate/flows path underneath, and it is deliberately anchored on /flows so it
     cannot match the INVOCATION path /powerautomate/automations/direct/... , a different service.

     The base path is stored exactly as the portal wrote it. Rebuilding it from an environment
     segment is what tied the previous version to one shape. */
  const FLOW_API_SHAPES = [
    ['processsimple', /^(.*\/providers\/Microsoft\.ProcessSimple\/environments\/([^/?#]+)\/flows)(?:\/|$)/i],
    ['powerautomate', /^(.*\/powerautomate\/flows)(?:\/|$)/i],
  ];

  /* How many times a rejected fetch is retried before the candidate is failed. Three attempts at
     1s and 2s covers a transient DNS blip without turning a genuinely offline tab into a
     two-minute wait per flow. */
  const NETWORK_RETRIES = 2;

  /* Bump this whenever the hook or the observed record changes shape OR meaning. Pasting a newer
     file over a live older one is the ordinary case — the operator is told not to reload — and
     the state lives on `window`, so an unbumped version silently reuses what the previous paste
     captured. That is how a run once proceeded on a token observed many minutes earlier, under a
     rule that has since changed, and reported 401 on every key. */
  const HOOK_VERSION = 3;
  const S = (window.__dgoHarvest = window.__dgoHarvest || {
    seen: [],        /* every authenticated endpoint watched, for diagnosis */
    calls: 0,        /* every request past the hook, authenticated or not */
    bank: {},        /* workflowId -> { url, at, where } - read from the portal's own answers */
    flowApi: null,   /* { shape, origin, basePath, environment, apiVersion, auth } - observed */
  });
  /* The gate drops what was OBSERVED, because the rules for observing it have changed. It
     deliberately does not drop the BANK: a banked URL is a fact about the tenant, verified the
     same way under every version of this file, and discarding harvested credentials because the
     hook changed shape would cost the operator another twenty-five visits. */
  if (S.hookVersion !== HOOK_VERSION) { S.flowApi = null; S.hookVersion = HOOK_VERSION; }
  if (!S.bank) S.bank = {};
  if (typeof S.calls !== 'number') S.calls = 0;

  /**
   * Bank every signed invoke URL in a response body, keyed by the workflow it names.
   * Returns how many entries changed, so the caller can speak only when it matters.
   */
  function bankFromText(text, where) {
    if (!text || text.length > SCAN_LIMIT) return 0;
    if (text.indexOf('/workflows/') === -1 && text.indexOf('\\/workflows\\/') === -1) return 0;
    /* A JSON string may escape its forward slashes. Unescaping first means one regex instead of
       two, and two would eventually disagree with each other. */
    const flat = text.indexOf('\\/') === -1 ? text : text.split('\\/').join('/');
    let added = 0, m;
    INVOKE_URL_IN_TEXT.lastIndex = 0;
    while ((m = INVOKE_URL_IN_TEXT.exec(flat))) {
      const id = workflowIdOf(m[0]);
      if (!id) continue;
      const had = S.bank[id];
      /* Latest wins. Regenerating a trigger issues a new signature and revokes the old one, so
         an older banked URL is not a second opinion - it is a dead credential. */
      S.bank[id] = { url: m[0], at: Date.now(), where };
      if (!had || had.url !== m[0]) added++;
    }
    if (added) {
      say('  banked ' + added + ' trigger URL(s) from the portal\'s own traffic - '
          + Object.keys(S.bank).length + ' held', T.ok);
    }
    return added;
  }

  /** Read a response without disturbing the portal's copy of it. Everything here is swallowed:
      a diagnostic must never be the reason the maker UI breaks. */
  function observeResponse(res) {
    try {
      if (!res || typeof res.clone !== 'function' || typeof res.text !== 'function') return;
      const headers = res.headers;
      const type = (headers && typeof headers.get === 'function' && headers.get('content-type')) || '';
      /* An unlabelled body is still scanned - some of this tenant's answers carry no
         content-type - but a known binary or script body is not. */
      if (type && !SCANNABLE_TYPE.test(type)) return;
      res.clone().text().then(
        (t) => { try { bankFromText(t, 'fetch'); } catch { /* never break the portal */ } },
        () => {});
    } catch { /* as above */ }
  }

  const record = (url, auth) => {
    if (!auth) return;
    let u;
    try { u = new URL(url, location.href); } catch { return; }
    const where = u.origin + u.pathname;
    if (!S.seen.includes(where)) S.seen.push(where);

    const matched = FLOW_API_SHAPES.find(([, re]) => re.test(u.pathname));

    /* Keep the token fresh from LATER traffic — but only from traffic to the flow API itself.
       Refreshing from any request to the same ORIGIN was wrong and cost a whole run: this
       tenant's environment host serves several services off one hostname
       (/powerautomate/flows, /powerautomate/GETMYFLOWSUSPENSIONSTATUS, /powerapps/…), the portal
       presents a different audience for some of them, and the last one past the hook won. Every
       call then answered 401 — which reads as a permissions problem on twenty-five flows rather
       than as one overwritten token. */
    if (S.flowApi) {
      if (matched && S.flowApi.origin === u.origin) { S.flowApi.auth = auth; S.flowApi.tokenSeenAt = Date.now(); }
      return;
    }

    for (const [shape, re] of FLOW_API_SHAPES) {
      const m = re.exec(u.pathname);
      if (!m) continue;
      const named = m[2] || '';
      S.flowApi = {
        shape,
        origin: u.origin,
        basePath: m[1],
        environment: named || u.hostname.split('.')[0],
        environmentFrom: named ? 'path' : 'host',
        apiVersion: new URLSearchParams(u.search).get('api-version') || '2016-11-01',
        auth,
        tokenSeenAt: Date.now(),
      };
      say('found the flow API on ' + u.hostname + ' - environment ' + S.flowApi.environment
          + (named ? '' : ' (from the host; this path does not name it)'), T.ok);
      return;
    }
  };

  if (window.__dgoHarvestHooked !== HOOK_VERSION) {
    window.__dgoHarvestHooked = HOOK_VERSION;
    const authOf = (input, init) => {
      try {
        let a = init && init.headers ? new Headers(init.headers).get('authorization') : null;
        if (!a && input && input.headers && typeof input.headers.get === 'function') a = input.headers.get('authorization');
        return a && /^Bearer /i.test(a) ? a : null;
      } catch { return null; }
    };
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        S.calls++;
        record(typeof input === 'string' ? input : input.url, authOf(input, init));
      } catch { /* never break the portal */ }
      const out = nativeFetch.apply(this, arguments);
      /* A SEPARATE branch of the promise chain, with its own rejection handler. The portal gets
         its own promise back untouched, so nothing here can delay it, reject it, or consume the
         body it is about to read. */
      try { out.then(observeResponse, () => {}); } catch { /* as above */ }
      return out;
    };
    const open = XMLHttpRequest.prototype.open;
    const setHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__dgoUrl = url;
      try {
        S.calls++;
        /* open() can be called more than once on one XHR; the listener is wanted once. */
        if (!this.__dgoWatched) {
          this.__dgoWatched = true;
          this.addEventListener('load', () => {
            try {
              /* responseText throws for a non-text responseType, and a blob could not carry a
                 URL this could read anyway. */
              const t = (this.responseType === '' || this.responseType === 'text') ? this.responseText : '';
              bankFromText(t, 'xhr');
            } catch { /* never break the portal */ }
          });
        }
      } catch { /* as above */ }
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try { if (/^authorization$/i.test(name) && /^Bearer /i.test(value)) record(this.__dgoUrl, value); } catch { /* as above */ }
      return setHeader.apply(this, arguments);
    };
  }

  /* ---- calling ------------------------------------------------------------------------------ */

  const flowBase = () => S.flowApi.origin + S.flowApi.basePath;
  const version = () => 'api-version=' + encodeURIComponent(S.flowApi.apiVersion);
  const headers = () => ({ Authorization: S.flowApi.auth, 'Content-Type': 'application/json' });

  /**
   * One call, with the two kinds of failure kept apart.
   *
   * A 429 is an ANSWER: the service is up, it has read the request, and it has said when to come
   * back. A rejected fetch is not an answer at all — DNS did not resolve, or the connection timed
   * out, or the tab went offline — and the difference matters to whoever is reading the output,
   * because one means wait and the other means check the network.
   *
   * It matters more than that, though. `fetch` REJECTS on a network failure rather than resolving
   * with a status, so an uncaught one does not fail a candidate, it throws out of the whole
   * harvest — twenty flows abandoned partway with nothing printed and no list of what failed.
   * This estate's own tenant produced exactly that condition, ERR_NAME_NOT_RESOLVED and
   * ERR_CONNECTION_TIMED_OUT against the flow API host, while this function had no try at all.
   */
  async function call(method, url, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
      } catch (err) {
        if (attempt >= NETWORK_RETRIES) {
          return { res: { ok: false, status: 0 }, json: null, network: String(err && err.message || err) };
        }
        const wait = 2 ** attempt;
        say('  no answer from the network - retrying in ' + wait + 's', T.warn);
        await sleep(wait * 1000);
        continue;
      }
      if (res.status !== 429 || attempt >= 3) {
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* an error page is not JSON */ }
        return { res, json };
      }
      /* The service says how long to wait. Its number beats ours. */
      const wait = Number(res.headers.get('retry-after')) || (2 ** attempt);
      say('  throttled (429) - waiting ' + wait + 's', T.warn);
      await sleep(wait * 1000);
    }
  }

  /** The Request trigger, found by KIND. "manual" is a convention, not a guarantee, and a renamed
      trigger silently misses on a name match - which then reads as "this flow has no HTTP
      trigger" when in fact it has one under another name. */
  function requestTrigger(definition) {
    const triggers = (definition && definition.triggers) || {};
    return Object.keys(triggers).find((n) => triggers[n] && triggers[n].type === 'Request') || null;
  }

  /**
   * Ask one candidate flow for its callback URL, and accept it only if the invoke URL that comes
   * back is for the workflow this key expects.
   *
   * Returns { url, workflowId } on a match, or { reason } — never both, and never a URL that
   * failed to verify. Returning an unverified URL "for the operator to check" is how it would end
   * up in a values file.
   */
  async function tryCandidate(flowId, wantWorkflowId) {
    const flow = await call('GET', flowBase() + '/' + encodeURIComponent(flowId) + '?' + version());
    if (flow.network) return { reason: 'no answer from the network (' + flow.network + ')', network: true };
    if (!flow.res.ok) return { reason: 'GET flow ' + flow.res.status };
    const trigger = requestTrigger(flow.json && flow.json.properties && flow.json.properties.definition);
    if (!trigger) return { reason: 'no Request trigger in the definition' };

    const cb = await call('POST',
      flowBase() + '/' + encodeURIComponent(flowId) + '/triggers/' + encodeURIComponent(trigger)
      + '/listCallbackUrl?' + version(), {});
    if (cb.network) return { reason: 'no answer from the network (' + cb.network + ')', network: true };
    if (!cb.res.ok) return { reason: 'listCallbackUrl ' + cb.res.status };
    if (!cb.json || !cb.json.value) return { reason: 'listCallbackUrl returned no value' };

    const got = workflowIdOf(cb.json.value);
    if (!got) return { reason: 'the callback URL names no workflow id' };
    if (got !== wantWorkflowId) return { reason: 'serves workflow ' + got + ', not ' + wantWorkflowId };
    return { url: cb.json.value, workflowId: got, trigger };
  }

  /* ---- the harvest -------------------------------------------------------------------------- */

  /** Every flow the signed-in user can see, as { id, displayName }. Used only to offer candidates
      for a key the crosswalk cannot resolve — and a guess from here is still verified like any
      other, so a wrong one costs a call, not a wrong credential. */
  async function listFlows() {
    const out = [];
    let url = flowBase() + '?' + version() + '&$top=250';
    while (url) {
      const { res, json } = await call('GET', url);
      if (!res.ok) throw new Error('listing flows returned ' + res.status);
      for (const row of (json && json.value) || []) {
        if (row && row.name) out.push({ id: row.name, displayName: (row.properties && row.properties.displayName) || '' });
      }
      url = (json && (json.nextLink || json['@odata.nextLink'])) || null;
    }
    return out;
  }
  /** Every key the bank already answers. Verified exactly as the fetched path is verified: a URL
      is matched to a key only by the workflow id it carries, so a URL banked from the wrong flow
      simply never matches anything. */
  function bankedFor(key) {
    const e = byKey.get(key);
    const hit = e && S.bank[e.workflow_id];
    return hit ? { url: hit.url, workflowId: e.workflow_id, trigger: null } : null;
  }
  const bankCoversAll = () => ENDPOINTS.every((e) => bankedFor(e.key));

  /** How long between "still waiting" lines. Silence is the hardest thing to diagnose from the
      other end of a paste: it reads as a broken script when in fact the portal is calling a
      different API entirely, and saying what DID arrive turns a blank wait into evidence. */
  const HEARTBEAT_MS = 20000;

  async function waitForPortal(seconds) {
    if (S.flowApi) return true;
    if (bankCoversAll()) return true;
    say('Navigate inside the portal now - open My flows, or open a flow’s details page. Do '
        + 'NOT press F5: a reload destroys this script. Waiting up to ' + seconds + 's for the '
        + 'portal to call the flow API...', T.warn);
    const until = Date.now() + seconds * 1000;
    let reportedSeen = S.seen.length;
    let reportedCalls = S.calls;
    let beatAt = Date.now() + HEARTBEAT_MS;
    while (!S.flowApi && !bankCoversAll() && Date.now() < until) {
      await sleep(500);
      if (Date.now() < beatAt) continue;
      beatAt = Date.now() + HEARTBEAT_MS;
      const fresh = S.seen.slice(reportedSeen);
      const newCalls = S.calls - reportedCalls;
      reportedSeen = S.seen.length;
      reportedCalls = S.calls;
      if (fresh.length) {
        say('  still waiting - ' + newCalls + ' request(s) past the hook, newly seen:', T.dim);
        for (const w of fresh.slice(0, 6)) say('    ' + w, T.dim);
      } else {
        say('  still waiting - ' + newCalls + ' request(s) past the hook, none to an API this '
            + 'recognises', T.dim);
      }
    }
    if (S.flowApi || bankCoversAll()) return true;

    say('Did not see it. Endpoints watched so far:', T.bad);
    for (const w of S.seen.slice(0, 40)) say('  ' + w, T.dim);
    if (!S.seen.length) {
      say('  (none carrying a bearer token, out of ' + S.calls + ' request(s) past the hook'
          + (S.calls ? '' : ' - is this the make.powerautomate.com tab?') + ')', T.dim);
    }
    say('Send that list - hostnames and paths only, no tokens - and run dgoHarvest.dry() again '
        + 'after navigating inside the portal. If a path in it looks like a flow API that '
        + 'FLOW_API_SHAPES does not match, adding it there is a one-line change.', T.warn);
    say('There is also a route that needs no API call from this script at all: open each flow’s '
        + 'details page in the portal and the hook reads the trigger URL out of the portal’s OWN '
        + 'answer. Run dgoHarvest.pending() for the list of flows to open.', T.info);
    return false;
  }

  /** The candidates for one key, best evidence first, with nothing repeated. */
  function candidatesFor(key) {
    const out = [];
    const add = (id, how) => { if (id && !out.some((c) => c.id === id)) out.push({ id, how }); };
    for (const id of CANDIDATES[key] || []) add(id, 'crosswalk');
    add(EXTRA_FLOW_IDS[key], 'EXTRA_FLOW_IDS');
    return out;
  }

  const describeApi = () => {
    if (!S.flowApi) {
      say('flow api        not seen in this tab yet  (' + S.calls + ' request(s) past the hook, '
          + S.seen.length + ' carrying a bearer token)', T.warn);
      return;
    }
    say('api host        ' + new URL(S.flowApi.origin).hostname + '  (observed, not assumed)');
    say('api path        ' + S.flowApi.basePath + '  (' + S.flowApi.shape + ', observed verbatim)');
    say('api-version     ' + S.flowApi.apiVersion);
    say('environment     ' + S.flowApi.environment
        + (S.flowApi.environmentFrom === 'host' ? '  (from the host - this API does not name it in the path)' : ''));
  };

  async function dry(seconds = 180) {
    /* The report comes FIRST and the wait second. It used to be the other way round, and on a
       tenant where the portal never called an API this recognised that produced two lines and
       three minutes of silence - no table, no counts, nothing to diagnose from. */
    const banked = ENDPOINTS.filter((e) => bankedFor(e.key)).length;
    say('contract keys   ' + ENDPOINTS.length);
    say('already held    ' + banked + '  (read from the portal’s own answers - needs no call)');
    describeApi();

    const rows = ENDPOINTS.map((e) => ({
      key: e.key, flow: e.flow_name,
      held: bankedFor(e.key) ? 'yes' : '',
      candidates: candidatesFor(e.key).length,
    }));
    console.table(rows);
    const none = rows.filter((r) => !r.candidates && !r.held);
    if (none.length) {
      say(none.length + ' key(s) have no candidate flow: ' + none.map((r) => r.key).join(', '), T.warn);
      say('run() will look for them by display name and verify what it finds; if that fails, put '
          + 'the flow id into EXTRA_FLOW_IDS at the top of this file and paste it again, or just '
          + 'open the flow in the portal and let the hook read its answer.', T.dim);
    }
    say('NOTHING WAS FETCHED. This was the read-only pass.', T.warn);
    say('To harvest, type:  dgoHarvest.run()', T.info);

    if (!S.flowApi && banked < ENDPOINTS.length) { if (await waitForPortal(seconds)) describeApi(); }
  }

  async function run(seconds = 180) {
    const resolved = new Map();   /* key -> { url, workflowId, flowId, how } */
    const take = (list) => {
      let took = 0;
      for (const e of list) {
        const b = bankedFor(e.key);
        if (b && !resolved.has(e.key)) { resolved.set(e.key, { ...b, flowId: null, how: 'watched' }); took++; }
      }
      return took;
    };
    take(ENDPOINTS);
    if (resolved.size) {
      say(resolved.size + ' of ' + ENDPOINTS.length + ' key(s) were already answered by URLs this '
          + 'tab watched the portal fetch. Those cost no call and cannot be refused.', T.ok);
    }
    let todo = ENDPOINTS.filter((e) => !resolved.has(e.key));
    if (!todo.length) return finish(resolved);

    const sawApi = await waitForPortal(seconds);
    /* The bank can fill DURING the wait - that is the operator clicking through flows, which is
       exactly what the wait tells them to do. */
    take(todo);
    todo = todo.filter((e) => !resolved.has(e.key));
    if (!todo.length) return finish(resolved);
    if (!sawApi || !S.flowApi) {
      return incomplete(resolved, todo.map((e) => ({
        key: e.key, flow: e.flow_name, reason: 'the flow API was never seen in this tab',
      })));
    }

    const failed = [];
    let flows = null;             /* the flow list, fetched at most once and only if needed */

    for (const e of todo) {
      let candidates = candidatesFor(e.key);

      if (!candidates.length) {
        if (flows === null) {
          say('Listing flows to look for keys the crosswalk cannot resolve...', T.info);
          try { flows = await listFlows(); }
          catch (err) { say('  could not list flows: ' + safe(err.message), T.bad); flows = []; }
        }
        /* Exact, never fuzzy - and verified afterwards like every other candidate. */
        candidates = flows.filter((f) => f.displayName === e.flow_name).map((f) => ({ id: f.id, how: 'display name' }));
      }

      if (!candidates.length) {
        failed.push({ key: e.key, flow: e.flow_name, reason: 'no candidate flow, and none is named ' + e.flow_name });
        say('  x ' + e.key + ' - no candidate flow', T.bad);
        continue;
      }

      const tried = [];
      let hit = null;
      for (const c of candidates) {
        /* Belt to the braces in call(). Anything that still throws fails THIS key and no other:
           the value of this harvest is the list of what resolved and what did not, and a run that
           dies at flow nine produces neither. */
        let attempt;
        try { attempt = await tryCandidate(c.id, e.workflow_id); }
        catch (err) { attempt = { reason: 'threw: ' + safe(String(err && err.message || err)) }; }
        if (attempt.url) { hit = { ...attempt, flowId: c.id, how: c.how }; break; }
        tried.push(c.id + ' (' + c.how + '): ' + attempt.reason);
      }

      if (hit) {
        resolved.set(e.key, hit);
        say('  ok ' + e.key + '  ' + e.flow_name + '  [' + hit.how + ' -> ' + hit.flowId + ']', T.ok);
      } else {
        failed.push({ key: e.key, flow: e.flow_name, reason: tried.join(' | ') });
        say('  x ' + e.key + ' - ' + tried.join(' | '), T.bad);
      }
    }

    if (failed.length) return incomplete(resolved, failed);
    return finish(resolved);
  }

  /** Nothing resolved is printed unless EVERYTHING resolved. A half-complete values file is
      worse than none: it installs, and fails later under a key nobody suspects. */
  function incomplete(resolved, failed) {
    say('Incomplete - nothing is printed.', T.bad);
    console.table(failed);
    const offline = failed.filter((f) => /no answer from the network/.test(f.reason)).length;
    if (offline) {
      say(offline + ' key(s) got no answer from the network at all, which is not a Power Automate '
          + 'problem: the tab could not reach the host. Nothing was changed by the calls that did '
          + 'land, so wait for the connection and run dgoHarvest.run() again.', T.bad);
    }

    /* EVERY key answering 401 is one fact, not twenty-five. A flow you cannot see answers 403
       or 404; 401 is the token, and a token that fails on every flow at once failed once. Left
       as a list it reads as a tenant-wide permissions problem and sends someone to ask twenty
       owners for co-ownership they already have. */
    const unauthorised = failed.filter((f) => /\b401\b/.test(f.reason)).length;
    /* A key with no candidate at all is collateral of the same 401 when the listing was what
       got refused — which is exactly how it looked on the tenant: twenty-three 401s and two
       "no candidate flow", because the flow listing had been refused too. Requiring EVERY
       failure to carry a 401 missed the very case this message exists for. */
    const nothingToTry = failed.filter((f) => /no candidate flow/.test(f.reason)).length;
    if (unauthorised > 0 && unauthorised + nothingToTry === failed.length && failed.length > 1) {
      const seenAt = S.flowApi && S.flowApi.tokenSeenAt;
      const age = seenAt ? Math.round((Date.now() - seenAt) / 60000) : null;
      say(unauthorised + ' key(s) answered 401 and every other failure had nothing left to try, '
          + 'so this is one expired or wrong token, not ' + failed.length
          + ' permissions problems. The token was read off portal traffic'
          + (age === null ? '' : ' ' + age + ' minute(s) ago') + '.', T.bad);
      say('Do this: run dgoHarvest.forget(), then click into a flow in the portal so it calls '
          + 'its API again — that captures a fresh token — and run dgoHarvest.run(). If it is '
          + 'still 401, the tab’s sign-in has gone stale: reload the portal, wait for My '
          + 'flows to list, then paste this file again.', T.warn);
      say('If it is STILL 401 after that, the session is authorised for the maker UI and refused '
          + 'at the management API, and no amount of re-observing will change that. Take the '
          + 'other route instead - it makes no call at all. dgoHarvest.pending() lists it.', T.warn);
    }
    say('A flow you neither own nor co-own is invisible to this API: ask its owner to add you as '
        + 'a co-owner. A candidate that resolved but "serves workflow X, not Y" is not a '
        + 'permissions problem - it is the wrong flow, and the register or the crosswalk is out '
        + 'of date. A half-complete values file is worse than none, so no block is printed until '
        + 'every key verifies.', T.warn);
    pending();
    return { resolved: resolved.size, failed: failed.length };
  }

  function finish(resolved) {
    const lines = [
      '# DGO endpoint values - harvested from the tenant via the browser console.',
      '# Environment: ' + (S.flowApi ? S.flowApi.environment : '(not observed - every URL came from the portal’s own traffic)'),
      '# API host:    ' + (S.flowApi ? new URL(S.flowApi.origin).hostname : '(none called)'),
      '# Generated:   ' + new Date().toISOString(),
      '#',
      '# Every key below was verified: the invoke URL it carries names the workflow id the',
      '# endpoint register holds for that key.',
      '#',
      '# EVERY LINE BELOW ENDS IN A SIGNATURE AND IS A BEARER CREDENTIAL.',
      '# Save as ~/dgo-values.txt. Never commit it, paste it into a chat, or attach it to an issue.',
      '',
      ...ENDPOINTS.map((e) => e.key + '=' + resolved.get(e.key).url),
    ];

    say('Copy everything between the rules into ~/dgo-values.txt', 'font-weight:bold;color:#080');
    log('--------------------------------------------------------------------');
    log(lines.join('\n'));
    log('--------------------------------------------------------------------');
    log('Then, from the repository:');
    log('  npm run check:values -- ~/dgo-values.txt');
    log('  npm run setup -- --values ~/dgo-values.txt --force');
    log('  npm run check:config && npm run check:config:portal');
    log('  npm run commission');
    say('Clear this console when you are done - it now holds ' + ENDPOINTS.length + ' credentials. '
        + 'dgoHarvest.wipe() drops the copies this script is still holding.', T.warn);
    return { resolved: resolved.size, failed: 0 };
  }

  const status = () => {
    say('flow api           ' + (S.flowApi
      ? new URL(S.flowApi.origin).hostname + S.flowApi.basePath + ' - environment ' + S.flowApi.environment
      : 'not yet - navigate inside the portal, without reloading'));
    say('requests watched   ' + S.calls + ' (' + S.seen.length + ' carrying a bearer token)');
    say('contract keys      ' + ENDPOINTS.length);
    say('already held       ' + ENDPOINTS.filter((e) => bankedFor(e.key)).length
        + ' of ' + ENDPOINTS.length + ', from the portal’s own answers');
  };
  const seen = () => { for (const w of S.seen) say('  ' + w, T.dim); return S.seen.length + ' endpoint(s)'; };

  /**
   * What is still missing, and the one action that resolves it without this script calling
   * anything. Prints flow DISPLAY NAMES and counts only — nothing here can carry a credential.
   */
  const pending = () => {
    const need = ENDPOINTS.filter((e) => !bankedFor(e.key));
    if (!need.length) { say('Nothing pending: every key has a URL. Run dgoHarvest.run().', T.ok); return 0; }
    say(need.length + ' key(s) still need a trigger URL. Every one can be had without this script '
        + 'calling anything: open each flow below in the portal, on the page that shows its HTTP '
        + 'POST URL. The portal fetches that URL in order to display it, and the hook reads the '
        + 'answer as it goes past. Navigate inside the portal - do not reload.', T.warn);
    const flows = [...new Set(need.map((e) => e.flow_name))].sort();
    for (const f of flows) say('  ' + f, T.dim);
    say(flows.length + ' flow(s) to open. Then: dgoHarvest.run()', T.info);
    return need.length;
  };

  /** Drop what was observed, so the next portal call is watched afresh. The recovery path for a
      token that has gone stale in a tab you are told not to reload. Banked URLs survive: they
      are not observations, they are the harvest. */
  const forget = () => {
    S.flowApi = null;
    say('Forgotten. Click into a flow in the portal so it calls its API, then run '
        + 'dgoHarvest.dry() or dgoHarvest.run().', T.info);
  };

  /** Drop everything, credentials included. The bank deliberately outlives a re-paste; this is
      how that ends on purpose, rather than by closing the tab and hoping. */
  const wipe = () => {
    const held = Object.keys(S.bank).length;
    S.bank = {}; S.flowApi = null;
    say('Dropped the observed API, the token, and ' + held + ' banked URL(s).', T.info);
  };

  /* Exposed so tests/harvest-console.test.mjs can exercise the rules directly rather than
     inferring them from console output, which would test the log instead of the rule. */
  const helpers = { requestTrigger, workflowIdOf, candidatesFor, bankedFor, bankFromText, safe };

  window.dgoHarvest = { dry, run, status, seen, pending, forget, wipe, helpers, ENDPOINTS, CANDIDATES, EXTRA_FLOW_IDS };
  say('dgoHarvest ready - dry() run() status() seen() pending() forget() wipe()', T.dim);
  dry();
})();
