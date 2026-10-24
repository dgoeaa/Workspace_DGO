/*
 * Harvest flow DEFINITIONS and PROPERTIES from Power Automate — from a browser devtools
 * console, using the session you are already signed into. Emits Excel-ready CSVs with the
 * definition and properties chunked into cells a spreadsheet can actually hold.
 *
 * RELATIONSHIP TO scripts/harvest-trigger-urls.browser.js — READ THIS FIRST
 *   That file fetches the 25 signed TRIGGER URLS for the values file. It is the credential
 *   harvester, it knows the endpoint register by heart, and nothing here replaces it.
 *   This one answers a different question: what is IN each flow. It takes flow ids (or
 *   discovers them), reads definition and properties, and writes the datasets an auditor
 *   opens in Excel. It defaults to NOT retrieving trigger URLs at all — see the credential
 *   position below.
 *
 * WHY IT DOES NOT HARDCODE A HOSTNAME
 *   Not because the global host is known to be wrong — it is not known to be either way, and
 *   that is precisely the point. What the estate does record, in
 *   tests/otp-verify-browser-patch.test.mjs, is two failures caused by deciding in advance:
 *
 *     v1 hardcoded api.flow.microsoft.com and failed. The root cause turned out not to be the
 *        host at all: that flow is stored in Dataverse, so no ProcessSimple host would have
 *        served it.
 *     v2 stopped assuming the host and constructed candidate PATHS instead. Also wrong, for
 *        the same underlying reason.
 *
 *   Which host serves the ordinary, non-solution flows here has never been confirmed against
 *   the tenant: nothing in the repository records a successful management-API call, and the
 *   invocation host in config/ (…environment.api.powerplatform.com/powerautomate/…) is a
 *   different service — it is where a flow is RUN, not where its definition is read.
 *
 *   Watching the host was necessary and, on its own, not sufficient. v3 — this file's first
 *   version — watched for a ProcessSimple PATH and so learned nothing on a tenant that never
 *   calls one: run here it watched 120 authenticated endpoints and reported "Did not see it"
 *   while the portal was calling its flow API throughout. The shape was the assumption that
 *   was left. So the path shapes are a list (FLOW_API_SHAPES), the base path is stored exactly
 *   as the portal wrote it rather than rebuilt from an environment segment, and a tenant whose
 *   API is per-environment by HOSTNAME with a flat /powerautomate/flows path is now a row
 *   rather than a rewrite.
 *
 *   So this does not pick a side. It constructs nothing until it has watched the portal do it
 *   first, which is correct whichever host this tenant turns out to use, and stays correct if
 *   that changes. It hooks fetch
 *   and XMLHttpRequest, reads the Authorization header off requests the page itself makes,
 *   and takes the origin, the environment segment and the api-version verbatim from a URL
 *   the portal actually called. The token is correct by construction: it is the token that
 *   host just accepted, at the audience that host requires.
 *
 *   Cookies are not the mechanism here. SharePoint REST authenticates on cookies, so a
 *   console fetch there is already signed in; the Power Automate API does not. A fetch with
 *   `credentials: "include"` and no Authorization header answers 401 on every route.
 *
 * HOW TO RUN
 *   1. Sign in to https://make.powerautomate.com and open ANY flow you own, so the page
 *      acquires a token for the Flow service. Be on the flow's own page.
 *   2. F12 -> Console. Paste this whole file. Press Enter.
 *   3. NOW NAVIGATE INSIDE THE PORTAL, WITHOUT RELOADING: go to My flows and open a flow, or
 *      switch between two flows. Each navigation makes the portal call the flow API, and the
 *      hook reads the request as it goes past. It then reports what it WOULD harvest.
 *      Nothing is fetched.
 *
 *      DO NOT PRESS F5. A reload destroys this script along with the rest of the page's
 *      JavaScript, so the hook would be gone before the traffic it is waiting for happens.
 *      The portal is a single-page app: navigating within it calls the API without reloading,
 *      which is the whole reason this works. If you do reload, just paste the file again.
 *   4. To harvest for real:   flowHarvest.run()
 *
 *      flowHarvest.run()      harvest, then download the datasets
 *      flowHarvest.dry()      run the read-only pass again
 *      flowHarvest.status()   what it has found, and where
 *      flowHarvest.seen()     every authenticated endpoint it watched, for diagnosis
 *      flowHarvest.save()     re-download the last result without re-fetching
 *
 *   PERMISSION — you must OWN or CO-OWN each flow. This is the same user-scoped API the
 *   portal uses, never the admin API, so a flow owned solely by a colleague is invisible
 *   until they add you as a co-owner. Tenant admin is not needed and is not used.
 *
 * THE CREDENTIAL POSITION
 *   A signed trigger URL is a bearer credential. Possession of one authorises invoking that
 *   flow, and tests/secret-exposure.test.mjs is blunt about the consequence: deleting the
 *   file does not revoke it and neither does rewriting history — only regenerating the
 *   trigger in Power Automate does.
 *
 *   Therefore, by default:
 *     - INCLUDE_TRIGGER_URLS is false. Trigger metadata (name, kind, method, whether a
 *       Request trigger exists) is captured; the signed URL is not requested.
 *     - REDACT_SIGNATURES is true, so any signature already sitting INSIDE a definition or
 *       in properties.flowTriggerUri is redacted before it reaches a cell. The patterns
 *       match scripts/redact-signed-urls.ps1 so the two agree on what a credential is.
 *     - Nothing this script prints to the console can carry a signature or a token.
 *
 *   Turn INCLUDE_TRIGGER_URLS on and the downloaded files become credentials. They land in
 *   your Downloads folder, which — unlike ~/dgo-values.txt — is not git-ignored, and
 *   `npm run test:secrets` is a ratchet that will fail if one reaches the tree.
 *
 * IT DOES NOT WRITE. Every call is a GET, except listCallbackUrl, which is a POST only
 * because the API models it that way; it changes no flow. Nothing is saved or published.
 */
(() => {
  'use strict';

  const CONFIG = {
    /* Flow ids to read. Leave empty to list every flow in the environment you can see. */
    FLOW_IDS: [],

    /* Off by default. Reading this turns the downloads into bearer credentials. */
    INCLUDE_TRIGGER_URLS: false,

    /* Redact signatures found inside definitions and properties. Leave true. */
    REDACT_SIGNATURES: true,

    /* Excel's hard cell limit is 32,767 characters. 32,000 leaves room for the quoting a
       cell needs and keeps the arithmetic legible when a part count is checked by hand. */
    CHUNK_SIZE: 32000,

    DOWNLOAD_CSV: true,
    DOWNLOAD_JSON: true,

    /* Pace between flows. The service throttles; 429s are also retried with backoff. */
    DELAY_MS: 150,
    MAX_RETRIES: 3,
    LIST_PAGE_SIZE: 250,
  };

  /* ================================================================================== */

  const T = { ok: 'color:#859900;font-weight:bold', bad: 'color:#dc322f;font-weight:bold',
              warn: 'color:#b58900', info: 'color:#268bd2', dim: 'color:#888' };

  /* Redaction, in two jobs that must not be confused.

     `safe` guards the CONSOLE. Nothing printed may carry a credential, so a string that
     looks like one is replaced wholesale rather than patched.

     `redact` guards the DATA. A definition legitimately contains the surrounding text, so
     here only the secret itself is replaced and the shape is left readable. The patterns are
     the ones in scripts/redact-signed-urls.ps1; `sig=` is deliberately not anchored on the
     character before it, because captured run records store the trigger as a relative
     X-Original-URL and a scheme-anchored pattern misses those entirely. */
  const CARRIES_SECRET = /sig=|SharedAccessSignature|Bearer\s|eyJ[A-Za-z0-9_-]{20}/i;
  const safe = (v) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return CARRIES_SECRET.test(s || '') ? '[redacted — carried a credential]' : v;
  };
  const say = (msg, style) => (style ? console.log('%c' + safe(msg), style) : console.log(safe(msg)));

  const REDACTIONS = [
    [/(sig=)[A-Za-z0-9_%-]{8,}/gi, '$1REDACTED'],
    /* The estate's own Compose_Redacted_Queries blanks `code` as well as `sig`: a one-time
       password in a captured query string is a credential for as long as it is unconsumed. */
    [/([?&]code=)[A-Za-z0-9_%-]{4,}/gi, '$1REDACTED'],
    [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'REDACTED-BEARER-TOKEN'],
  ];
  function redact(text) {
    if (!CONFIG.REDACT_SIGNATURES || typeof text !== 'string') return text;
    let out = text;
    for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
    return out;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowIso = () => new Date().toISOString();

  /* Bumped whenever the hook or the discovery record changes shape. Pasting a newer file over
     an older one that is still hooked is the ordinary case — the operator is told NOT to
     reload — so a stale hook, which holds a closure over the old record(), has to be replaced
     rather than trusted. */
  const HOOK_VERSION = 2;

  const S = (window.__flowHarvest = window.__flowHarvest || {
    tokenByOrigin: new Map(),  /* origin -> the most recent Bearer the page sent it */
    seen: [],                  /* every authenticated endpoint watched, for diagnosis */
    flowApi: null,             /* { shape, origin, basePath, environment, apiVersion } — observed */
    dataverse: null,           /* origin of a Dataverse instance the page talked to */
    result: null,              /* the last harvest, so save() need not re-fetch */
  });
  if (S.hookVersion !== HOOK_VERSION) { S.flowApi = null; S.hookVersion = HOOK_VERSION; }

  /* ---- watching, rather than guessing ------------------------------------------------
     A ProcessSimple URL names the environment in its path. Taking the segment VERBATIM,
     without decoding and re-encoding it, is deliberate: the two environment spellings in
     this estate (Default-ca6a4b3f-… and defaultca6a4b3f…) both appear in portal traffic and
     a round-trip through decodeURIComponent is how one becomes the other by accident.

     THERE IS MORE THAN ONE SHAPE, and the second one is why this is a list. This estate's
     tenant never calls a ProcessSimple path at all: its flow API is per-environment by
     HOSTNAME — <environment>.<region>.environment.api.powerplatform.com — with a flat
     /powerautomate/flows path underneath. A detector that knew only the ProcessSimple shape
     watched 120 authenticated endpoints on that tenant and still reported "Did not see it",
     which reads as "the portal never called the flow API" when in truth it called it
     constantly. So the shapes are rows, matched in order, and adding a third is adding a row.

     What is stored is the observed base path ITSELF, never one rebuilt from an environment
     segment: rebuilding is what tied the previous version to a single shape.

     Where the path does not name the environment, the host's first label does — recorded as
     derived rather than observed, so a display or a Maker URL cannot pass it off as a segment
     the portal actually wrote. */
  const FLOW_API_SHAPES = [
    ['processsimple', /^(.*\/providers\/Microsoft\.ProcessSimple\/environments\/([^/?#]+)\/flows)(?:\/|$)/i],
    /* Deliberately NOT /powerautomate/, which would also match the invocation path
       /powerautomate/automations/direct/cu/11/workflows/<id>/… — a different service. */
    ['powerautomate', /^(.*\/powerautomate\/flows)(?:\/|$)/i],
  ];
  const DATAVERSE = /\/api\/data\/v[\d.]+\//i;

  const record = (url, auth) => {
    let u;
    try { u = new URL(url, location.href); } catch { return; }
    if (!auth) return;
    S.tokenByOrigin.set(u.origin, auth);
    const where = u.origin + u.pathname;
    if (!S.seen.includes(where)) S.seen.push(where);

    if (!S.flowApi) {
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
          /* Take the version the portal is using rather than pinning one this file believes in. */
          apiVersion: new URLSearchParams(u.search).get('api-version') || '2016-11-01',
        };
        say('found the flow API on ' + u.hostname + ' — environment ' + S.flowApi.environment
            + (named ? '' : ' (from the host; this path does not name it)'), T.ok);
        break;
      }
    }
    if (DATAVERSE.test(u.pathname) && !S.dataverse) S.dataverse = u.origin;
  };

  /* Re-hook when the version moves. The wrapper closes over the OLD record(), so a stale hook
     keeps writing the old shape however new the rest of this file is. Wrapping an
     already-wrapped fetch is harmless: record() dedupes everything it stores. */
  if (window.__flowHarvestHooked !== HOOK_VERSION) {
    window.__flowHarvestHooked = HOOK_VERSION;
    const authOf = (input, init) => {
      try {
        let a = init && init.headers ? new Headers(init.headers).get('authorization') : null;
        if (!a && input && input.headers && typeof input.headers.get === 'function') a = input.headers.get('authorization');
        return a && /^Bearer /i.test(a) ? a : null;
      } catch { return null; }
    };
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const auth = authOf(input, init);
      /* Only the request is inspected. Unlike the OTP patcher this never needs to read a
         response body, so there is no clone() and no chance of disturbing the page. */
      if (auth) { try { record(url, auth); } catch { /* a hook must never break the page */ } }
      return nativeFetch.apply(this, arguments);
    };
    const open = XMLHttpRequest.prototype.open;
    const setHeader = XMLHttpRequest.prototype.setRequestHeader;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) { this.__fhUrl = url; return open.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
      try { if (String(n).toLowerCase() === 'authorization' && /^Bearer /i.test(v)) this.__fhAuth = v; } catch { /* as above */ }
      return setHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try { if (this.__fhAuth) record(this.__fhUrl || '', this.__fhAuth); } catch { /* as above */ }
      return send.apply(this, arguments);
    };
  }

  /* ---- talking to whatever answered --------------------------------------------------- */

  /** A 429 is not a failure, it is a pace instruction. Treating it as a failure is how a
      harvest of 200 flows reports 60 of them unreadable and sends someone hunting for a
      permission problem that does not exist. */
  async function call(method, url, body, extra) {
    const origin = new URL(url).origin;
    const token = S.tokenByOrigin.get(origin);
    if (!token) throw new Error('no token observed for ' + new URL(url).hostname);

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: Object.assign({
          Authorization: token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }, extra || {}),
        body: body ? JSON.stringify(body) : undefined,
      });
      if ((res.status === 429 || res.status === 503) && attempt < CONFIG.MAX_RETRIES) {
        const after = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(after) && after > 0 ? after * 1000 : Math.pow(2, attempt) * 1000;
        say('  throttled (' + res.status + ') — waiting ' + Math.round(waitMs / 1000) + 's', T.dim);
        await sleep(waitMs);
        continue;
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* an error page is not JSON */ }
      return { res, json, text };
    }
  }

  /* Verbatim: origin and path exactly as the portal wrote them. */
  const flowBase = () => S.flowApi.origin + S.flowApi.basePath;
  const flowVersion = () => 'api-version=' + encodeURIComponent(S.flowApi.apiVersion);

  /** Every flow the signed-in user can see, following nextLink to the end. */
  async function listFlows() {
    const ids = [];
    let url = flowBase() + '?' + flowVersion() + '&$top=' + CONFIG.LIST_PAGE_SIZE;
    while (url) {
      const { res, json } = await call('GET', url);
      if (!res.ok) throw new Error('listing flows returned ' + res.status);
      for (const row of (json && json.value) || []) if (row && row.name) ids.push(row.name);
      url = (json && (json.nextLink || json['@odata.nextLink'])) || null;
    }
    return ids;
  }

  /** The observed flow API first, then Dataverse if this flow is solution-aware and lives
      there. The two store the same definition in different envelopes, so the caller gets one
      shape. `storage` carries the shape that answered, so a row says where it came from. */
  async function readFlow(flowId) {
    const apiUrl = flowBase() + '/' + encodeURIComponent(flowId) + '?' + flowVersion();
    const api = await call('GET', apiUrl);
    if (api.res.ok && api.json && api.json.properties) {
      return { storage: S.flowApi.shape, body: api.json, properties: api.json.properties, endpoint: apiUrl };
    }
    if (api.res.status !== 404 || !S.dataverse) {
      const detail = api.res.status === 404 && !S.dataverse
        /* The distinction matters: a 404 here usually means the flow is solution-aware and
           lives in Dataverse, and this script has simply not been shown a Dataverse origin
           to look in. Reporting a bare 404 sends someone hunting for a deleted flow. */
        ? 'not at ' + S.flowApi.basePath + ', and no Dataverse origin was observed — open a ' +
          'solution-aware flow in the portal so the page calls Dataverse, then run again'
        : (api.json && api.json.error && api.json.error.message) || ('HTTP ' + api.res.status);
      const err = new Error(safe(detail));
      err.status = api.res.status;
      throw err;
    }
    /* Dataverse keeps the definition in clientdata, as a JSON STRING. */
    const dvUrl = S.dataverse + '/api/data/v9.2/workflows(' + encodeURIComponent(flowId) + ')';
    const dv = await call('GET', dvUrl, null, { 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' });
    if (!dv.res.ok) {
      const err = new Error('not at ' + S.flowApi.basePath + ', and Dataverse returned ' + dv.res.status);
      err.status = dv.res.status;
      throw err;
    }
    if (!dv.json) throw new Error('Dataverse answered with something that is not JSON');
    let clientData = {};
    try { clientData = JSON.parse(dv.json.clientdata); } catch { /* handled by the empty default */ }
    const properties = Object.assign({}, clientData.properties, {
      displayName: dv.json.name || '',
      state: dv.json.statecode === 1 ? 'Started' : 'Stopped',
      createdTime: dv.json.createdon || '',
      lastModifiedTime: dv.json.modifiedon || '',
    });
    return { storage: 'dataverse', body: dv.json, properties, endpoint: dvUrl };
  }

  /** The Request trigger, found by KIND. "manual" is a convention, not a guarantee, and a
      renamed trigger silently misses on a name match — which then reads as "this flow has no
      HTTP trigger" when in fact it has one under another name. */
  function requestTrigger(definition) {
    const triggers = (definition && definition.triggers) || {};
    const name = Object.keys(triggers).find((n) => triggers[n] && triggers[n].type === 'Request');
    return name ? { name, trigger: triggers[name] } : null;
  }

  /* ---- shaping the output ------------------------------------------------------------- */

  /** Split without ever ending a part on a high surrogate.

      A naive slice at a fixed index splits astral characters — an emoji in a flow's display
      name is enough — leaving a lone surrogate at each side of the seam. Lone surrogates
      cannot be encoded as UTF-8, so the Blob that becomes the download turns both halves
      into U+FFFD and the character is destroyed: "ab<emoji>cd" reassembles as "ab??cd".
      Rejoining the parts no longer reproduces the definition, which is the one property
      chunking exists to preserve. */
  function chunks(text, size) {
    if (!(size > 1)) throw new RangeError('CHUNK_SIZE must be greater than 1');
    const out = [];
    let i = 0;
    while (i < text.length) {
      let end = Math.min(i + size, text.length);
      const last = text.charCodeAt(end - 1);
      if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
      out.push(text.slice(i, end));
      i = end;
    }
    return out.length ? out : [''];
  }

  function stringify(value) {
    try { return redact(JSON.stringify(value ?? {})); }
    catch { return JSON.stringify({ serializationError: true }); }
  }

  /** Excel and Sheets read a leading = + - @ (or tab, or CR) as the start of a formula, and
      will evaluate it on open. A flow definition is saturated with @{...} expressions and a
      chunk boundary lands wherever the arithmetic puts it, so parts beginning with @ are
      routine rather than exotic. The leading apostrophe is the standard neutraliser: it is
      consumed by the spreadsheet and does not appear in the cell. */
  const FORMULA_LEAD = /^[=+\-@\t\r]/;
  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    if (FORMULA_LEAD.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(rows) {
    if (!rows.length) return '';
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const body = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))];
    /* A BOM, because Excel on Windows reads a CSV as the system codepage without one and
       every non-ASCII display name arrives mojibaked. */
    return '﻿' + body.join('\r\n');
  }

  /** Chrome gates multiple automatic downloads from one origin: fire six in a tight loop and
      the user is asked once, and files two onward are dropped if they dismiss it — silently,
      with the script still reporting success. Spacing them keeps each one a separate,
      visible download. */
  async function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    await sleep(400);
  }

  /* ---- the harvest -------------------------------------------------------------------- */

  async function waitForPortal(seconds) {
    if (S.flowApi) return true;
    say('Navigate inside the portal now — open My flows, or switch to another flow. Do NOT ' +
        'press F5: a reload destroys this script. Waiting up to ' + seconds + 's for the ' +
        'portal to call the flow API…', T.warn);
    const until = Date.now() + seconds * 1000;
    while (!S.flowApi && Date.now() < until) await sleep(500);
    if (S.flowApi) return true;
    say('Did not see it. Endpoints watched so far:', T.bad);
    for (const w of S.seen.slice(0, 40)) say('  ' + w, T.dim);
    if (!S.seen.length) say('  (none — is this the make.powerautomate.com tab?)', T.dim);
    say('Send me that list — hostnames and paths only, no tokens — and run flowHarvest.dry() ' +
        'again after navigating inside the portal. If a path in it looks like a flow API that ' +
        'FLOW_API_SHAPES does not yet match, adding it there is a one-line change.', T.warn);
    return false;
  }

  async function dry(seconds = 180) {
    if (!(await waitForPortal(seconds))) return;
    say('environment     ' + S.flowApi.environment +
        (S.flowApi.environmentFrom === 'host' ? '  (from the host — this API does not name it in the path)' : ''));
    say('api host        ' + new URL(S.flowApi.origin).hostname + '  (observed, not assumed)');
    say('api path        ' + S.flowApi.basePath + '  (' + S.flowApi.shape + ', observed verbatim)');
    say('api-version     ' + S.flowApi.apiVersion);
    say('dataverse       ' + (S.dataverse ? new URL(S.dataverse).hostname : '(not seen — solution flows will report their status)'));
    say('flows           ' + (CONFIG.FLOW_IDS.length ? CONFIG.FLOW_IDS.length + ' from CONFIG.FLOW_IDS' : 'every flow you can see (discovered at run time)'));
    say('trigger URLs    ' + (CONFIG.INCLUDE_TRIGGER_URLS ? 'INCLUDED — the downloads will be CREDENTIALS' : 'not requested'),
        CONFIG.INCLUDE_TRIGGER_URLS ? T.bad : T.dim);
    say('signatures      ' + (CONFIG.REDACT_SIGNATURES ? 'redacted inside definitions and properties' : 'NOT REDACTED'),
        CONFIG.REDACT_SIGNATURES ? T.dim : T.bad);
    say('chunk size      ' + CONFIG.CHUNK_SIZE + ' characters per cell');
    say('────────────────────────────────────', T.dim);
    say('NOTHING WAS FETCHED. This was the read-only pass.', T.warn);
    say('To harvest, type:  flowHarvest.run()', T.info);
  }

  async function run(seconds = 180) {
    if (!(await waitForPortal(seconds))) return;

    const runId = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(16).slice(2);

    let flowIds = CONFIG.FLOW_IDS.map((x) => String(x).trim()).filter(Boolean);
    if (!flowIds.length) {
      say('Listing flows…', T.info);
      try { flowIds = await listFlows(); }
      catch (e) { say('Could not list flows: ' + safe(e.message), T.bad); return; }
    }
    flowIds = [...new Set(flowIds)];
    if (!flowIds.length) { say('No flows to read.', T.bad); return; }

    const out = {
      schemaVersion: '1.0.0-browser',
      run: {
        runId, startedUtc: nowIso(), finishedUtc: null,
        environmentName: S.flowApi.environment,
        apiHost: new URL(S.flowApi.origin).hostname,
        triggerUrlsIncluded: CONFIG.INCLUDE_TRIGGER_URLS,
        signaturesRedacted: CONFIG.REDACT_SIGNATURES,
        inputRows: flowIds.length, flowsDetailed: 0, flowsFailed: 0,
        definitionRows: 0, propertiesRows: 0, ownerRows: 0, errorRows: 0,
        status: 'Running',
      },
      flows: [], owners: [], definitionParts: [], propertiesParts: [], errors: [],
    };

    for (let i = 0; i < flowIds.length; i++) {
      const flowId = flowIds[i];
      say('[' + (i + 1) + '/' + flowIds.length + '] ' + flowId, T.dim);
      try {
        const read = await readFlow(flowId);
        const properties = read.properties || {};
        const definition = properties.definition || {};
        const req = requestTrigger(definition);

        /* Owners are a separate, optional read: the route lives on the flow management API,
           not on Dataverse, and a flow you co-own but do not administer answers 403. That is
           not a harvest failure, so it is recorded per flow rather than thrown.

           The gate is "not Dataverse", never "is ProcessSimple": written the second way it
           silently skipped owners and callback URLs on every tenant whose flow API is not
           ProcessSimple-shaped, and reported "not attempted" as though asked not to. */
        let owners = [];
        let ownerStatus = 'not attempted';
        if (read.storage !== 'dataverse') {
          const permUrl = flowBase() + '/' + encodeURIComponent(flowId) + '/permissions?' + flowVersion();
          const perm = await call('GET', permUrl);
          if (perm.res.ok) {
            owners = (perm.json && perm.json.value) || [];
            ownerStatus = 'ok';
          } else {
            ownerStatus = 'HTTP ' + perm.res.status;
          }
        }

        let callbackUrl = '';
        let callbackStatus = CONFIG.INCLUDE_TRIGGER_URLS ? 'no Request trigger' : 'not requested';
        if (CONFIG.INCLUDE_TRIGGER_URLS && req && read.storage !== 'dataverse') {
          const cbUrl = flowBase() + '/' + encodeURIComponent(flowId) +
            '/triggers/' + encodeURIComponent(req.name) + '/listCallbackUrl?' + flowVersion();
          const cb = await call('POST', cbUrl, {});
          if (cb.res.ok && cb.json && cb.json.value) { callbackUrl = cb.json.value; callbackStatus = 'ok'; }
          else callbackStatus = 'HTTP ' + cb.res.status;
        }

        const definitionString = stringify(definition);
        const propertiesString = stringify(properties);
        const definitionParts = chunks(definitionString, CONFIG.CHUNK_SIZE);
        const propertiesParts = chunks(propertiesString, CONFIG.CHUNK_SIZE);

        out.flows.push({
          RunId: runId,
          CollectedUtc: nowIso(),
          EnvironmentName: S.flowApi.environment,
          FlowName: flowId,
          /* The flow management API's `name` is the flow's id in that API. Parsing an id out
             of a callback URL, as an earlier version did, made it depend on a credential this
             script no longer fetches.

             Whether that id is also the 32-hex workflow id the endpoint register keys on is a
             question of the tenant, not of this script: under ProcessSimple the two are the
             same value, and this estate's tenant serves dashed GUIDs here that do NOT resolve
             the register's ids. So this column is what the API calls the flow, and joining it
             to the register is the trigger harvester's job, on the invoke URL it gets back.

             The two stores disagree about `name`: in Dataverse it is the DISPLAY name and
             the id is `workflowid`, so the storage decides which field is read. Taking
             whichever is truthy would put "Solution aware flow" in an id column. */
          WorkflowId: read.storage === 'dataverse'
            ? (read.body.workflowid || flowId)
            : (read.body.name || flowId),
          Storage: read.storage,
          FlowResourceId: read.body.id || '',
          DisplayName: properties.displayName || '',
          State: properties.state || '',
          CreatedTime: properties.createdTime || '',
          LastModifiedTime: properties.lastModifiedTime || '',
          CreatorObjectId: (properties.creator && properties.creator.objectId) || '',
          CreatorTenantId: (properties.creator && properties.creator.tenantId) || '',
          TemplateName: properties.templateName || '',
          ProvisioningMethod: properties.provisioningMethod || '',
          FlowFailureAlertSubscribed: String(properties.flowFailureAlertSubscribed ?? ''),
          FlowSuspensionReason: properties.flowSuspensionReason || '',
          ApiId: properties.apiId || '',
          DefinitionSchema: definition.$schema || '',
          DefinitionContentVersion: definition.contentVersion || '',
          TriggerName: req ? req.name : '',
          TriggerType: req ? req.trigger.type : Object.keys(definition.triggers || {}).map((n) => definition.triggers[n].type).join('|'),
          TriggerKind: req ? (req.trigger.kind || '') : '',
          TriggerMethod: req ? ((req.trigger.inputs && req.trigger.inputs.method) || '') : '',
          ActionCount: Object.keys(definition.actions || {}).length,
          DefinitionChars: definitionString.length,
          DefinitionParts: definitionParts.length,
          PropertiesChars: propertiesString.length,
          PropertiesParts: propertiesParts.length,
          CallbackUrl: callbackUrl,
          CallbackStatus: callbackStatus,
          OwnerStatus: ownerStatus,
          OwnerCount: owners.length,
          MakerUrl: 'https://make.powerautomate.com/environments/' + S.flowApi.environment +
                    '/flows/' + encodeURIComponent(flowId) + '/details',
          /* Says what actually happened, rather than "ok" regardless. The flows sheet is the
             one a person reads; a partial read that claims success is worse than a failure. */
          DetailStatus: ownerStatus === 'ok' || ownerStatus === 'not attempted' ? 'ok' : 'ok (owners ' + ownerStatus + ')',
        });

        definitionParts.forEach((part, n) => out.definitionParts.push({
          RunId: runId, FlowName: flowId, PartNo: n + 1, PartCount: definitionParts.length,
          PartChars: part.length, DefinitionPart: part,
        }));
        propertiesParts.forEach((part, n) => out.propertiesParts.push({
          RunId: runId, FlowName: flowId, PartNo: n + 1, PartCount: propertiesParts.length,
          PartChars: part.length, PropertiesPart: part,
        }));
        owners.forEach((owner) => {
          const p = (owner && owner.properties && owner.properties.principal) || {};
          out.owners.push({
            RunId: runId, FlowName: flowId,
            PrincipalObjectId: p.id || p.objectId || '',
            PrincipalType: p.type || '',
            PrincipalDisplayName: p.displayName || '',
            PrincipalEmail: p.email || '',
            RoleType: (owner.properties && (owner.properties.roleName || owner.properties.roleType)) || '',
          });
        });
        out.run.flowsDetailed++;
      } catch (error) {
        out.errors.push({
          RunId: runId, OccurredUtc: nowIso(), Stage: 'detail', FlowName: flowId,
          StatusCode: String(error.status || 'RetrievalFailed'),
          Message: String(safe(error.message)),
        });
        out.run.flowsFailed++;
        say('  failed: ' + safe(error.message), T.bad);
      }
      await sleep(CONFIG.DELAY_MS);
    }

    out.run.finishedUtc = nowIso();
    out.run.definitionRows = out.definitionParts.length;
    out.run.propertiesRows = out.propertiesParts.length;
    out.run.ownerRows = out.owners.length;
    out.run.errorRows = out.errors.length;
    out.run.status = out.run.flowsFailed === 0 ? 'Succeeded' : 'CompletedWithErrors';
    S.result = out;

    say('────────────────────────────────────', T.dim);
    say(out.run.status + ' — ' + out.run.flowsDetailed + ' read, ' + out.run.flowsFailed + ' failed, ' +
        out.run.definitionRows + ' definition parts, ' + out.run.propertiesRows + ' properties parts',
        out.run.flowsFailed ? T.warn : T.ok);
    await save();
    return out.run;
  }

  async function save() {
    const out = S.result;
    if (!out) { say('Nothing harvested yet — run flowHarvest.run() first.', T.bad); return; }
    const prefix = 'Flow_Metadata_' + out.run.runId;
    /* Empty datasets are not written. A zero-byte Owners.csv in a folder of six files reads
       as a broken export; its absence, with OwnerStatus in the flows sheet, does not. */
    const sets = [
      ['_Flows.csv', out.flows], ['_Owners.csv', out.owners],
      ['_DefinitionParts.csv', out.definitionParts], ['_PropertiesParts.csv', out.propertiesParts],
      ['_Errors.csv', out.errors],
    ];
    if (CONFIG.DOWNLOAD_JSON) await download(prefix + '.json', JSON.stringify(out, null, 2), 'application/json;charset=utf-8');
    if (CONFIG.DOWNLOAD_CSV) {
      for (const [suffix, rows] of sets) {
        if (!rows.length) { say('  (no rows for ' + suffix.replace(/^_|\.csv$/g, '') + ')', T.dim); continue; }
        await download(prefix + suffix, toCsv(rows), 'text/csv;charset=utf-8');
      }
    }
    say('Downloaded as ' + prefix + '.*', T.ok);
    if (CONFIG.INCLUDE_TRIGGER_URLS) {
      say('THOSE FILES ARE CREDENTIALS. Every CallbackUrl authorises invoking its flow. Keep ' +
          'them out of the repository, out of chat and out of email; they are revoked only by ' +
          'regenerating the trigger in Power Automate.', T.bad);
    }
  }

  const status = () => {
    const hosts = [...S.tokenByOrigin.keys()].map((o) => new URL(o).hostname);
    say('origins with a token   ' + (hosts.length ? hosts.join(', ') : '(none yet)'));
    say('flow api               ' + (S.flowApi
      ? new URL(S.flowApi.origin).hostname + S.flowApi.basePath + ' — environment ' + S.flowApi.environment
      : 'not yet — navigate inside the portal, without reloading'));
    say('dataverse              ' + (S.dataverse ? new URL(S.dataverse).hostname : '(not seen)'));
    say('endpoints watched      ' + S.seen.length);
    say('result held            ' + (S.result ? S.result.run.flowsDetailed + ' flow(s)' : 'no'));
  };

  const seen = () => { for (const w of S.seen) say('  ' + w, T.dim); return S.seen.length + ' endpoint(s)'; };

  /* Exposed so tests/flow-metadata-harvest.test.mjs can exercise the shaping directly.
     Inferring chunk and CSV behaviour from console output would test the log, not the rule. */
  const helpers = { chunks, csvEscape, toCsv, redact, requestTrigger, safe };

  window.flowHarvest = { dry, run, save, status, seen, helpers, CONFIG };
  say('flowHarvest ready — dry() run() save() status() seen()', T.dim);
  dry();
})();
