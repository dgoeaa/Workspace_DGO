/*
 * Harvest every endpoint's trigger URL from Power Automate — on a phone, with no devtools.
 *
 * WHY THIS EXISTS
 *   `scripts/harvest-trigger-urls.browser.js` already fetches all 25 URLs in one pass, and it is
 *   the right tool on a laptop. It cannot be used on Android: Chrome for Android has no devtools
 *   console, and remote debugging needs the desktop it is meant to replace. So the phone runbook
 *   sent the reader to Power Automate twenty times — twenty designer visits, twenty copies, on a
 *   touch screen, for URLs the API will hand over in one call.
 *
 *   A bookmarklet is the one way a phone browser will run your JavaScript on a page you are
 *   signed into. Saved as a bookmark and invoked by name from the omnibox, this runs in the
 *   portal's own origin, reads the token the portal already holds, and does exactly what the
 *   console harvester does — the same two API calls per flow, in the same order, with the same
 *   refusal to print anything unless all of them resolve.
 *
 * WHAT IT DOES DIFFERENTLY, AND WHY EACH DIFFERENCE IS FORCED
 *
 *   · DRY_RUN becomes a screen, not a constant. A bookmarklet cannot be edited between runs,
 *     so "report first, fetch on a deliberate second action" is a tap rather than a source edit.
 *     Nothing is fetched until the reader has read the list of flows and tapped through it.
 *   · The output goes to the clipboard, never to the screen. On a laptop the console is the
 *     least-bad place to put 25 credentials. On a phone it is the worst: screenshots, screen
 *     recorders, and a shoulder are all likelier than they are at a desk. The values file is
 *     built in a closure variable, handed to the clipboard by an explicit tap, and dropped when
 *     the overlay closes. Nothing renders a URL at any point.
 *   · The copy happens inside the tap handler. Chrome grants clipboard access only under
 *     transient activation, and twenty awaited fetches outlive it by far — so the harvest and
 *     the copy are deliberately two taps, not one. A single "do everything" button would fail
 *     the clipboard write every time, with no way for the reader to tell why.
 *   · The UI is built in a shadow root with CSSOM only — no innerHTML, no <style> element.
 *     The portal ships a strict CSP and its own global CSS; both are reasons not to inject
 *     markup into its document.
 *
 * HOW IT IS RUN (the phone side; docs/deployment/CLEAR-THE-LAST-BLOCKER-TERMUX.md §4a)
 *   1. In Termux:  termux-clipboard-set < scripts/harvest-trigger-urls.bookmarklet.txt
 *   2. In Chrome:  bookmark any page, edit it, name it `dgo harvest`, replace the URL with the
 *      paste. Chrome strips `javascript:` when you paste into the address bar, which is why it
 *      has to be a saved bookmark rather than a paste.
 *   3. Open a flow you own at make.powerautomate.com, so the tab holds a token.
 *   4. Type `dgo harvest` in the address bar and tap the bookmark suggestion.
 *   5. Tap through the two screens, then in Termux:
 *        umask 077
 *        termux-clipboard-get > ~/dgo-values.txt
 *
 * PERMISSION — you must OWN or CO-OWN each flow. This is the same user-scoped API the portal
 * itself calls, never the admin API. No Entra app registration, no tenant admin, no PowerShell.
 *
 * DO NOT EDIT THE GENERATED FILE. `scripts/harvest-trigger-urls.bookmarklet.txt` is built from
 * this template with the endpoint register baked in: npm run harvest:bookmarklet
 */

/* BOOKMARKLET PAYLOAD BEGINS - everything above this line is stripped by the builder. */
(function () {
  'use strict';

  var HOST_ID = 'dgo-harvest-overlay';
  // The contract keys and the APPLICATION WORKFLOW ID each expects, from
  // docs/reference/endpoint-register.json. That id is what a signed invoke URL carries, and it is
  // what every callback URL is checked against below. Baked in because a bookmarklet cannot read
  // the repository. Rebuild if the register changes.
  var ENDPOINTS = __ENDPOINTS__;
  // application workflow id -> the TENANT FLOW IDs that may serve it, from
  // docs/reference/flow-identity-crosswalk.json. A different identifier domain: this is what the
  // management API addresses, and it is not the workflow id with dashes put back.
  var CANDIDATES = __CANDIDATES__;

  var prior = document.getElementById(HOST_ID);
  if (prior) prior.remove();

  // Twenty flows serve twenty-five keys; two keys sharing a flow share its one URL.
  var byWorkflow = new Map();
  ENDPOINTS.forEach(function (e) {
    if (!byWorkflow.has(e.workflow_id)) byWorkflow.set(e.workflow_id, { flow_name: e.flow_name, keys: [] });
    byWorkflow.get(e.workflow_id).keys.push(e.key);
  });

  // The credential, once fetched. Never rendered, dropped on close.
  var valuesFile = '';
  var copyStatus = null;

  var host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.62);display:flex;align-items:flex-end;justify-content:center';
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var card = document.createElement('div');
  card.style.cssText = 'box-sizing:border-box;width:100%;max-width:560px;max-height:88vh;overflow:auto;background:#fff;color:#0f172a;border-radius:16px 16px 0 0;padding:18px 16px 24px;font:15px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';
  root.appendChild(card);
  document.documentElement.appendChild(host);

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    card.appendChild(n);
    return n;
  }
  function clear() { while (card.firstChild) card.removeChild(card.firstChild); }
  function title(t) { el('div', 'font-weight:700;font-size:17px', t); }
  function note(t) { el('div', 'margin:8px 0;color:#334155', t); }
  function mono(t) { el('div', 'margin:10px 0;padding:10px;background:#f1f5f9;border-radius:8px;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word', t); }
  function button(label, primary, onTap) {
    var b = el('button', 'display:block;width:100%;min-height:48px;margin-top:10px;border-radius:10px;font-size:16px;font-weight:600;border:1px solid ' + (primary ? '#1d4ed8' : '#cbd5e1') + ';background:' + (primary ? '#1d4ed8' : '#fff') + ';color:' + (primary ? '#fff' : '#0f172a'), label);
    b.addEventListener('click', onTap);
    return b;
  }
  function row(parent, text) {
    var n = document.createElement('div');
    n.style.cssText = 'padding:4px 0;font-size:13px';
    n.textContent = text;
    parent.appendChild(n);
    parent.scrollTop = parent.scrollHeight;
  }
  function close() { valuesFile = ''; host.remove(); }

  // WATCHING THE PORTAL, RATHER THAN GUESSING AT IT
  //
  // This used to lift a token out of MSAL storage by matching a key against
  // service.flow.microsoft.com, and to build the API URL from a hardcoded host and environment.
  // Both were guesses, and on this tenant both were wrong: its flow API is per-environment by
  // HOSTNAME with a flat /powerautomate/flows path, and no ProcessSimple host serves it.
  //
  // So the hook reads the origin, the base path, the api-version and the bearer off a request the
  // portal itself makes. The token is then right by construction — it is the one that host just
  // accepted, at the audience that host requires — and the URL is right because it was never
  // built. The second shape below is anchored on /flows so it cannot match the INVOCATION path
  // /powerautomate/automations/direct/..., which is a different service.
  //
  // The state lives on window, so tapping the bookmark again after opening a flow finds what the
  // first tap installed. That is the whole recovery path on a phone, where there is no console.
  var SHAPES = [
    ['processsimple', /^(.*\/providers\/Microsoft\.ProcessSimple\/environments\/([^/?#]+)\/flows)(?:\/|$)/i],
    ['powerautomate', /^(.*\/powerautomate\/flows)(?:\/|$)/i]
  ];
  // Bumped whenever the hook or the observed record changes shape or meaning. The state lives on
  // `window` and the operator is told not to reload, so an unbumped version silently reuses what
  // an older paste captured — under a rule that has since changed.
  var HOOK = 3;
  var S = window.__dgoHarvest || (window.__dgoHarvest = { seen: [], bank: {}, flowApi: null });
  // The gate drops what was OBSERVED, because the rules for observing it have changed. It
  // deliberately does not drop the BANK: a banked URL is verified the same way under every
  // version of this file, and discarding it would cost the operator another twenty visits.
  if (S.hookVersion !== HOOK) { S.flowApi = null; S.hookVersion = HOOK; }
  if (!S.bank) S.bank = {};

  // THE SECOND ROUTE: READ THE PORTAL'S ANSWERS, NOT JUST ITS REQUESTS.
  //
  // Replaying the portal's bearer is the fast path and it is not always available. Run against
  // this tenant every one of the twenty-five keys answered 401 while the maker UI beside them
  // kept working — a session can be authorised for the portal and refused at the management API.
  // The portal is authorised; this script is not.
  //
  // Opening a flow makes the portal fetch that flow's HTTP POST URL so it can show it, and that
  // answer passes the same hook. It is banked under the workflow id it names, which is the same
  // key this file already files everything under, and matched to a contract key only by that id
  // — so opening the wrong flow cannot produce a wrong credential.
  //
  // On a phone this is barely a cost: tapping through flows is what the operator is doing anyway.
  //
  // THE BANK HOLDS CREDENTIALS, on window, for as long as the tab lives. Nothing renders one.
  var SCANNABLE = /json|text\/plain/i;
  var SCAN_LIMIT = 4 * 1024 * 1024;
  // A signature is required: an unsigned invoke URL is not a credential, and banking one would
  // mean offering a values file that 401s on first use.
  var INVOKE_IN_TEXT = /https:\/\/[^\s"'<>\\]+\/workflows\/[0-9a-f]{32}\/[^\s"'<>\\]*[?&]sig=[^\s"'<>\\&]+/gi;

  function bankFromText(text, where) {
    if (!text || text.length > SCAN_LIMIT) return 0;
    if (text.indexOf('/workflows/') === -1 && text.indexOf('\\/workflows\\/') === -1) return 0;
    // JSON may escape its forward slashes. Unescaping first means one regex, not two that will
    // eventually disagree.
    var flat = text.indexOf('\\/') === -1 ? text : text.split('\\/').join('/');
    var added = 0, m;
    INVOKE_IN_TEXT.lastIndex = 0;
    while ((m = INVOKE_IN_TEXT.exec(flat))) {
      var id = workflowIdOf(m[0]);
      if (!id) continue;
      var had = S.bank[id];
      // Latest wins: regenerating a trigger revokes the old signature, so an older banked URL is
      // not a second opinion, it is a dead credential.
      S.bank[id] = { url: m[0], at: Date.now(), where: where };
      if (!had || had.url !== m[0]) added++;
    }
    return added;
  }

  // Read a response without disturbing the portal's copy of it. Everything is swallowed: a
  // diagnostic must never be the reason the maker UI breaks.
  function observeResponse(res) {
    try {
      if (!res || typeof res.clone !== 'function' || typeof res.text !== 'function') return;
      var type = (res.headers && typeof res.headers.get === 'function' && res.headers.get('content-type')) || '';
      // An unlabelled body is still scanned; a known binary or script body is not.
      if (type && !SCANNABLE.test(type)) return;
      res.clone().text().then(function (t) {
        try { bankFromText(t, 'fetch'); } catch (e) { /* never break the portal */ }
      }, function () {});
    } catch (e) { /* as above */ }
  }

  function record(url, auth) {
    if (!auth) return;
    var u;
    try { u = new URL(url, location.href); } catch (e) { return; }
    if (S.seen.indexOf(u.origin + u.pathname) === -1) S.seen.push(u.origin + u.pathname);
    // Only refresh the token from traffic to the flow API ITSELF. Refreshing from any request to
    // the same ORIGIN was wrong and cost a whole run on the laptop route: this tenant serves
    // several services off one hostname with different audiences, and the last one past the hook
    // won. Every call then answered 401, which reads as a permissions problem on every flow.
    var matched = false;
    for (var k = 0; k < SHAPES.length; k++) if (SHAPES[k][1].test(u.pathname)) { matched = true; break; }
    if (S.flowApi) { if (matched && S.flowApi.origin === u.origin) S.flowApi.auth = auth; return; }
    for (var i = 0; i < SHAPES.length; i++) {
      var m = SHAPES[i][1].exec(u.pathname);
      if (!m) continue;
      S.flowApi = {
        shape: SHAPES[i][0],
        origin: u.origin,
        basePath: m[1],
        environment: m[2] || u.hostname.split('.')[0],
        apiVersion: new URLSearchParams(u.search).get('api-version') || '2016-11-01',
        auth: auth
      };
      return;
    }
  }

  if (window.__dgoHarvestHooked !== HOOK) {
    window.__dgoHarvestHooked = HOOK;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var a = null;
        if (init && init.headers) a = new Headers(init.headers).get('authorization');
        if (!a && input && input.headers && typeof input.headers.get === 'function') a = input.headers.get('authorization');
        if (a && /^Bearer /i.test(a)) record(typeof input === 'string' ? input : input.url, a);
      } catch (e) { /* never break the portal */ }
      var out = nativeFetch.apply(this, arguments);
      // A SEPARATE branch of the promise chain, with its own rejection handler. The portal gets
      // its own promise back untouched, so nothing here can delay it, reject it, or consume the
      // body it is about to read.
      try { out.then(observeResponse, function () {}); } catch (e) { /* as above */ }
      return out;
    };
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__dgoUrl = url;
      var xhr = this;
      try {
        // open() can be called more than once on one XHR; the listener is wanted once.
        if (!xhr.__dgoWatched) {
          xhr.__dgoWatched = true;
          xhr.addEventListener('load', function () {
            try {
              // responseText throws for a non-text responseType, and a blob could not carry a
              // URL this could read anyway.
              var t = (xhr.responseType === '' || xhr.responseType === 'text') ? xhr.responseText : '';
              bankFromText(t, 'xhr');
            } catch (e) { /* never break the portal */ }
          });
        }
      } catch (e) { /* as above */ }
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      try { if (/^authorization$/i.test(name) && /^Bearer /i.test(value)) record(this.__dgoUrl, value); } catch (e) { /* as above */ }
      return xhrHeader.apply(this, arguments);
    };
  }

  function flowBase() { return S.flowApi.origin + S.flowApi.basePath; }
  function apiVersion() { return 'api-version=' + encodeURIComponent(S.flowApi.apiVersion); }

  // The workflow id an invoke URL addresses. The join to the endpoint register, and the only part
  // of a callback URL this file ever looks at or shows.
  function workflowIdOf(callbackUrl) {
    var m = /\/workflows\/([0-9a-f]{32})\//i.exec(String(callbackUrl));
    return m ? m[1] : null;
  }

  // Every flow the contract needs, already answered by something the portal fetched for itself.
  // When this is true there is nothing left to ask anyone for.
  function bankCoversAll() {
    var all = true;
    byWorkflow.forEach(function (v, id) { if (!S.bank[id]) all = false; });
    return all;
  }
  function flowsStillNeeded() {
    var out = [];
    byWorkflow.forEach(function (v, id) { if (!S.bank[id]) out.push(v.flow_name); });
    return out.sort();
  }

  function screenWrongSite() {
    clear();
    title('Wrong tab');
    note('This reads the Power Automate session, so it has to run on a Power Automate tab. Open make.powerautomate.com, open a flow you own, and tap the bookmark again there.');
    button('Close', false, close);
  }

  // Not an error screen: the first tap installs the hook, and the portal has to be made to call
  // its own API once before there is anything to read. Opening a flow does it. On a phone there is
  // no console to watch, so the card polls and advances by itself the moment it sees the call.
  function screenWaiting() {
    clear();
    title('Open a flow, and this will catch it');
    note('It reads the API address and the token off the portal\u2019s own traffic rather than '
       + 'guessing them. Nothing has been watched yet on this tab.');
    note('Tap Close, open any flow you own from My flows, then tap the bookmark again. Do not '
       + 'reload the page \u2014 a reload removes this.');
    note('Opening a flow is worth doing even if the API never answers: the portal fetches that '
       + 'flow\u2019s trigger URL in order to show it, and this reads the answer as it goes past. '
       + 'Enough visits and there is nothing left to ask the API for.');
    var state = el('div', 'margin:10px 0;font-weight:600;color:#334155', 'Watching\u2026');
    var stop = false;
    var until = Date.now() + 120000;
    (function poll() {
      if (stop) return;
      if (S.flowApi || bankCoversAll()) { state.textContent = 'Found it.'; return screenReport(); }
      if (Date.now() > until) {
        state.textContent = 'Nothing yet.';
        if (!S.seen.length) note('No authenticated requests seen at all \u2014 is this the Power Automate tab?');
        return;
      }
      setTimeout(poll, 500);
    }());
    button('Close', false, function () { stop = true; close(); });
  }

  function screenFailed(failed) {
    clear();
    title('Incomplete - nothing was copied');
    note(failed.length + ' of ' + byWorkflow.size + ' flows did not resolve. A half-complete values file is worse than none, so none is offered.');
    var list = el('div', 'margin:8px 0;max-height:36vh;overflow:auto');
    failed.forEach(function (f) { row(list, 'X ' + f.flow + ' - ' + f.reason); });
    note('A flow you neither own nor co-own is invisible to this API. Ask its owner to add you as a co-owner and tap the bookmark again, or take that one key through §4 of the runbook by hand.');
    var need = flowsStillNeeded();
    if (need.length) {
      note('There is also a route that asks the API for nothing at all. Open each of these flows '
         + 'in the portal \u2014 the page that shows its HTTP POST URL \u2014 and tap the bookmark '
         + 'again. The portal fetches that URL to display it, and this reads the answer.');
      var todo = el('div', 'margin:8px 0;max-height:30vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px');
      need.forEach(function (n) { row(todo, n); });
    }
    button('Close', false, close);
  }

  function screenReady() {
    clear();
    title(ENDPOINTS.length + ' keys ready');
    note('Nothing is shown on screen: every line of this file is a bearer credential. Put it on the clipboard, then read it straight into a file in Termux.');
    button('Copy the values file', true, copyToClipboard);
    copyStatus = el('div', 'margin:10px 0 0;font-weight:600;min-height:20px', '');
    mono('umask 077\ntermux-clipboard-get > ~/dgo-values.txt');
    note('The redirect matters: termux-clipboard-get on its own prints 25 credentials into your scrollback. Then npm run check:values -- ~/dgo-values.txt');
    button('Close and forget it', false, close);
  }

  // Chrome grants the clipboard only under transient activation, so this must be — and is — the
  // handler of a real tap, with the write as its first await. document.execCommand is the
  // fallback for a browser that refuses the async API; it too needs the gesture this call sits in.
  async function copyToClipboard() {
    var ok = false;
    try {
      await navigator.clipboard.writeText(valuesFile);
      ok = true;
    } catch (e) {
      ok = false;
    }
    if (!ok) ok = legacyCopy(valuesFile);
    if (!copyStatus) return;
    copyStatus.style.color = ok ? '#166534' : '#b91c1c';
    copyStatus.textContent = ok
      ? 'Copied - ' + ENDPOINTS.length + ' keys are on the clipboard. Switch to Termux now, then clear it.'
      : 'The browser refused the clipboard. Tap again, or fall back to §4 of the runbook.';
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.value = '';
    ta.remove();
    return ok;
  }

  // Ask one candidate flow for its callback URL, and accept it only if the invoke URL that comes
  // back is for the workflow this key expects. Returns a url, or a reason, never both — and never
  // a URL that failed to verify. Handing back an unverified URL "for the operator to check" is how
  // one endpoint's signature ends up under another endpoint's key, in a file that looks complete.
  // A network failure REJECTS: no status, no answer, nothing to read. Left uncaught it does not
  // fail one flow, it throws out of the whole harvest and the panel freezes mid-count with no
  // list of what went wrong — on a phone, with no console to find out. Two retries cover a DNS
  // blip; beyond that the flow is failed with a reason that says it was the network, because
  // "check your signal" and "ask to be made a co-owner" are different actions.
  async function fetchOrNull(url, init) {
    for (var attempt = 0; ; attempt++) {
      try { return await fetch(url, init); }
      catch (e) {
        if (attempt >= 2) return null;
        await new Promise(function (r) { setTimeout(r, 1000 * Math.pow(2, attempt)); });
      }
    }
  }

  async function tryCandidate(flowId, wantWorkflowId) {
    var headers = { Authorization: S.flowApi.auth, 'Content-Type': 'application/json' };
    var url = flowBase() + '/' + encodeURIComponent(flowId);
    var flowRes = await fetchOrNull(url + '?' + apiVersion(), { headers: headers });
    if (!flowRes) return { reason: 'no answer from the network' };
    if (!flowRes.ok) return { reason: 'GET flow ' + flowRes.status };
    var flow = await flowRes.json();
    // Find the Request trigger by KIND: "manual" is a convention, not a guarantee, and a
    // renamed trigger would silently miss on a name match.
    var triggers = (flow.properties && flow.properties.definition && flow.properties.definition.triggers) || {};
    var triggerName = Object.keys(triggers).find(function (n) { return triggers[n] && triggers[n].type === 'Request'; });
    if (!triggerName) return { reason: 'no Request trigger in the definition' };
    var cbRes = await fetchOrNull(url + '/triggers/' + encodeURIComponent(triggerName) + '/listCallbackUrl?' + apiVersion(), { method: 'POST', headers: headers });
    if (!cbRes) return { reason: 'no answer from the network' };
    if (!cbRes.ok) return { reason: 'listCallbackUrl ' + cbRes.status };
    var cb = await cbRes.json();
    if (!cb.value) return { reason: 'listCallbackUrl returned no value' };
    var got = workflowIdOf(cb.value);
    if (!got) return { reason: 'the callback URL names no workflow id' };
    if (got !== wantWorkflowId) return { reason: 'serves workflow ' + got + ', not ' + wantWorkflowId };
    return { url: cb.value };
  }

  // Every flow the signed-in user can see. Fetched at most once, and only when some key has no
  // candidate recorded, so the ordinary run never pays for it.
  // Returns null when the listing could not be made at all, and an array when it was. The
  // difference is the whole message: "no flow is named X" sends someone looking for a flow,
  // "the network gave no answer" sends them to look at their signal.
  async function listFlows() {
    var out = [];
    var url = flowBase() + '?' + apiVersion() + '&$top=250';
    while (url) {
      var res = await fetchOrNull(url, { headers: { Authorization: S.flowApi.auth } });
      if (!res) return null;
      if (!res.ok) return out;
      var json = await res.json();
      ((json && json.value) || []).forEach(function (r) {
        if (r && r.name) out.push({ id: r.name, displayName: (r.properties && r.properties.displayName) || '' });
      });
      url = (json && (json.nextLink || json['@odata.nextLink'])) || null;
    }
    return out;
  }

  async function startHarvest() {
    clear();
    title('Fetching');
    var urlByWorkflow = new Map();
    var failed = [];
    // What the portal has already handed over. These cost no call and cannot be refused, so they
    // are taken before anything is asked of the API.
    byWorkflow.forEach(function (v, id) { if (S.bank[id]) urlByWorkflow.set(id, S.bank[id].url); });
    var entries = [];
    byWorkflow.forEach(function (v, id) { if (!urlByWorkflow.has(id)) entries.push([id, v]); });
    if (!entries.length) return finishHarvest(urlByWorkflow, failed);
    if (!S.flowApi) return screenWaiting();
    var allFlows;   // undefined = not tried; null = tried and the network gave no answer
    var done = urlByWorkflow.size;
    var progress = el('div', 'margin:8px 0;font-weight:600', done + ' of ' + byWorkflow.size);
    var log = el('div', 'margin:8px 0;max-height:44vh;overflow:auto');
    for (var i = 0; i < entries.length; i++) {
      var workflowId = entries[i][0];
      var v = entries[i][1];
      progress.textContent = (done + 1) + ' of ' + byWorkflow.size + ' - ' + v.flow_name;
      var ids = CANDIDATES[workflowId] || [];
      // Two contract keys have no candidate flow recorded at all. Rather than fail them outright,
      // look for a flow whose display name is the one the register names — exact, never fuzzy —
      // and put it through the same verification as any other candidate. That is what makes a
      // name match safe here: a wrong guess cannot produce a wrong credential, only a mismatch.
      if (!ids.length) {
        if (allFlows === undefined) allFlows = await listFlows();
        ids = (allFlows || []).filter(function (f) { return f.displayName === v.flow_name; }).map(function (f) { return f.id; });
      }
      var tried = [];
      var hit = null;
      for (var c = 0; c < ids.length && !hit; c++) {
        // Belt to the braces in fetchOrNull. Anything that still throws fails THIS flow and no
        // other: the value of the panel is the list of what resolved and what did not.
        var attempt;
        try { attempt = await tryCandidate(ids[c], workflowId); }
        catch (e) { attempt = { reason: 'failed: ' + (e && e.message ? e.message : e) }; }
        if (attempt.url) hit = attempt; else tried.push(attempt.reason);
      }
      if (hit) {
        urlByWorkflow.set(workflowId, hit.url);
        row(log, 'OK ' + v.flow_name);
      } else {
        var reason = tried.length ? tried.join(' | ')
          : (allFlows === null ? 'no answer from the network while looking for it by name'
                               : 'no candidate flow is recorded for this key');
        failed.push({ flow: v.flow_name, reason: reason });
        row(log, 'X  ' + v.flow_name + ' - ' + reason);
      }
      done++;
      progress.textContent = done + ' of ' + byWorkflow.size;
    }
    return finishHarvest(urlByWorkflow, failed);
  }

  // Nothing is offered unless everything resolved. A half-complete values file installs and then
  // fails later under a key nobody suspects, which is worse than none at all.
  function finishHarvest(urlByWorkflow, failed) {
    if (failed.length) return screenFailed(failed);
    var lines = [
      '# DGO endpoint values - harvested from the tenant on a phone.',
      '# Environment: ' + (S.flowApi ? S.flowApi.environment : '(not observed - every URL came from the portal\u2019s own traffic)'),
      '# API host:    ' + (S.flowApi ? new URL(S.flowApi.origin).hostname : '(none called)'),
      '# Generated:   ' + new Date().toISOString(),
      '#',
      '# Every key below was verified: the invoke URL it carries names the workflow id the',
      '# endpoint register holds for that key.',
      '#',
      '# EVERY LINE BELOW ENDS IN A SIGNATURE AND IS A BEARER CREDENTIAL.',
      '# Save as ~/dgo-values.txt. Never commit it, paste it into a chat, or attach it to an issue.',
      ''
    ];
    ENDPOINTS.forEach(function (e) { lines.push(e.key + '=' + urlByWorkflow.get(e.workflow_id)); });
    valuesFile = lines.join('\n') + '\n';
    screenReady();
  }

  function screenReport() {
    clear();
    title('Harvest trigger URLs');
    var held = byWorkflow.size - flowsStillNeeded().length;
    note(byWorkflow.size + ' flows serve ' + ENDPOINTS.length + ' contract keys. Nothing has been fetched yet.');
    note(held + ' of them are already answered by URLs the portal fetched for itself on this tab.');
    note(S.flowApi
      ? 'API: ' + new URL(S.flowApi.origin).hostname + S.flowApi.basePath + ' \u2014 read off the '
        + 'portal\u2019s own traffic, not built from a guess.'
      : 'No flow API has been seen on this tab \u2014 nothing will be called, and nothing needs to be.');
    var list = el('div', 'margin:10px 0;max-height:34vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px');
    var n = 0;
    byWorkflow.forEach(function (v) {
      n++;
      row(list, n + '. ' + v.flow_name + ' (' + v.keys.length + ' key' + (v.keys.length === 1 ? '' : 's') + ')');
    });
    note('Reading each flow and asking for its trigger URL changes nothing in the tenant. It needs you to own or co-own all of them.');
    note('Each URL is checked before it is kept: the workflow it names must be the one the register '
       + 'holds for that key. A flow that answers for a different workflow is discarded, not copied.');
    button(held === byWorkflow.size ? 'Build the values file' : 'Fetch ' + (byWorkflow.size - held) + ' trigger URLs',
           true, startHarvest);
    button('Cancel', false, close);
  }

  // Three states, in order of what the operator can do about them. Wrong tab: go to the right one.
  // Right tab but nothing watched yet: open a flow, which is one tap. Otherwise: get on with it.
  if (!/(^|\.)powerautomate\.com$/i.test(location.hostname)) screenWrongSite();
  else if (!S.flowApi && !bankCoversAll()) screenWaiting();
  else screenReport();
})();
