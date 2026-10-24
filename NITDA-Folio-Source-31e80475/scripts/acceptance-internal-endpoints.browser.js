/*
 * FIRST EXECUTION — the acceptance test for the internal endpoints.
 *
 * WHY THIS EXISTS
 *   Thirteen flows are verified current against the tenant, action by action and parameter by
 *   parameter. Not one of them has ever been RUN. Everything known about this estate is known
 *   from definitions; nothing is known from a response. That is open item 2, and no amount of
 *   further checking closes it — only a call does.
 *
 *   This makes the call. It reads the endpoint URLs from the platform's own runtime config
 *   (window.DGO_CONFIG.endpoints), so no signed URL passes through a repository, a file or a
 *   chat message. It never prints one either: a signed Power Automate URL is a bearer
 *   credential, and this reports endpoint KEYS and response shapes only.
 *
 * THE BODIES ARE THE PLATFORM'S OWN BODIES
 *   Every request below is the exact envelope core/data-client.js builds:
 *     { action, payload, userEmail, requestId, timestamp }
 *   with `action` taken from config/endpoints.config.js. That matters. Each flow resolves its
 *   caller as
 *     coalesce(triggerBody()?['payload']?['userEmail'], triggerBody()?['userEmail'], '')
 *   then looks that address up in DGO_UserDirectory with `Status eq 'active'`. A body without
 *   userEmail resolves to the empty string, matches no row, and is refused — so a test that
 *   omitted it would report six authorisation failures that were the test's own fault.
 *
 * IT ALSO ANSWERS THE CORS QUESTION PROPERLY
 *   Flow Configuration holds an allowed origin. Whether it MATCHES this platform has been an open
 *   question answered by comparing strings. It does not need to be: if the browser lets this
 *   script read a response body, the origin matched. If it does not, the fetch fails as a network
 *   error and the console says CORS. That is the definitive test and it runs here.
 *
 *   CORS and acceptance are reported separately. A 401 that the browser could read still proves
 *   the origin is right; it does not prove the endpoint works. This never conflates the two.
 *
 * WHAT IT DOES AND DOES NOT CALL
 *   By default: the three READ endpoints only. They create no correspondence, assign nothing,
 *   and send no email. Each writes one Portal Flow Telemetry row, which is the point.
 *   INCLUDE_WRITES adds two calls chosen to be refused by design — an assignment with no
 *   reference and no assignee (400 from the input guard) and an unknown operation on the
 *   dynamic endpoint (400 from the known-operation guard). Neither writes a business row.
 *   INCLUDE_OTP sends a real email to the address you name. Both are off.
 *
 * HOW TO RUN
 *   1. Set CALLER_EMAIL below.
 *   2. Open THE INTERNAL PLATFORM in a browser, signed in as you normally would.
 *      NOT a SharePoint page. This script needs window.DGO_CONFIG, which only the platform sets;
 *      the telemetry snippet it prints at the END is the part that runs from SharePoint, and the
 *      two are easy to mix up. If you are on the wrong page this says so outright.
 *   3. devtools (F12) -> Console -> paste this file.
 *
 *   Everything blocking a run is reported in ONE pass, so one paste tells you everything that
 *   needs fixing rather than one fault per round-trip.
 *
 * IT RESOLVES THE CALLER ITSELF
 *   CALLER_EMAILS takes a list. The first address is probed against FETCH_ALL; if that endpoint
 *   answers ok, it is used for everything else. If it answers a refusal, the next address is
 *   tried. So one paste settles which account the estate actually accepts, instead of costing a
 *   round-trip per guess. A network failure stops the search at once — that is CORS or an
 *   unreachable flow, and no other address would fare differently.
 */
(async () => {
  /* Addresses to try, in order. Each must have a row in DGO_UserDirectory with Status = active,
     and that row's role must grant either "*" in AllowedRoutesJson or `user:view` in
     PermissionsJson (the write tier additionally needs `bulk:assign`). Anything else is answered,
     correctly, with a refusal — and the next address is tried.

     dgsregistry@ is the Registry Bootstrap Administrator the provisioning spec seeds with role
     systemAdmin, which carries "*" and both permissions. That is the spec, not the tenant: it
     says what should have been seeded, not that the seed ran. Which is why this probes rather
     than assumes. A single string still works if you prefer to name one. */
  const CALLER_EMAILS  = ['dgsregistry@nitda.gov.ng', 'hkani@nitda.gov.ng'];

  const INCLUDE_WRITES = false;   /* SINGLE_ASSIGNMENT, DYNAMIC_ACTIONS — refused by design, see above */
  const INCLUDE_OTP    = false;   /* OTP_GENERATE — this sends a real email */
  const OTP_EMAIL      = '';      /* required if INCLUDE_OTP: the address to send the code to.
                                     It must also be an active DGO_UserDirectory row — the OTP
                                     flow refuses to mail a code to an unknown user. */

  const cfg = (window.DGO_CONFIG && window.DGO_CONFIG.endpoints) || {};
  const rows = [];
  const NEEDED = ['FETCH_ALL', 'REFERENCE_DATA', 'GET_DOCS'];
  const rid = () => 'acc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const COLOUR = { PASS: 'color:#0b6b3a', REFUSED: 'color:#8a6d00;font-weight:bold',
                   SKIP: 'color:#888', FAIL: 'color:#a4262c;font-weight:bold' };
  const MARK   = { PASS: '✓', REFUSED: '!', SKIP: '–', FAIL: '✗' };
  const record = (r) => { rows.push(r);
    console.log(`%c${MARK[r.verdict]} ${r.endpoint} — ${r.detail}`, COLOUR[r.verdict]); };

  console.log('%cFirst execution — internal endpoint acceptance', 'font-weight:bold;font-size:14px');
  console.log(`Origin: ${location.origin}`);

  /* EVERY blocker is reported in ONE pass. Checking them one at a time costs a paste, a run and a
     round-trip per fault — which is the exact waste this whole exercise exists to stop. */
  const blockers = [];

  /* 1. Wrong page. window.DGO_CONFIG is set by the internal platform's own runtime config and by
        nothing else, so its absence means this console is not the platform's console. Pasting on
        a SharePoint page is the easy mistake to make, because the telemetry snippet this script
        prints at the end is meant to be run from SharePoint. They are two different pages. */
  if (!window.DGO_CONFIG || !window.DGO_CONFIG.endpoints) {
    blockers.push({
      what: 'This is not the internal platform.',
      why: `window.DGO_CONFIG is not defined on ${location.origin}, so there are no endpoint URLs to call.`,
      fix: 'Open the internal platform itself (the page that loads config/config.local.js) and paste this '
         + 'there. SharePoint is only for the telemetry snippet printed at the END of a successful run.'
    });
  } else {
    /* 2. Right page, but an endpoint the run needs is unconfigured — the platform cannot call it either. */
    const missing = NEEDED.filter((k) => !String(cfg[k] || '').trim());
    if (missing.length) blockers.push({
      what: `${missing.length} of the ${NEEDED.length} read endpoints ${missing.length === 1 ? 'has' : 'have'} no URL configured.`,
      why: `Missing: ${missing.join(', ')}. The platform itself cannot call these either.`,
      fix: 'Fill them in config/config.local.js, reload the page, and paste this again.'
    });
  }

  /* 3. No caller. Six of these flows gate on it; a run without one is six refusals that say
        nothing about the estate. */
  const CANDIDATES = (Array.isArray(CALLER_EMAILS) ? CALLER_EMAILS : [CALLER_EMAILS])
    .map((e) => String(e || '').trim()).filter(Boolean);

  if (!CANDIDATES.length) blockers.push({
    what: 'CALLER_EMAILS is empty.',
    why: "Every endpoint resolves its caller from the request body and looks that address up in "
       + "DGO_UserDirectory with Status eq 'active'. An empty value matches no row and is refused.",
    fix: 'Put at least one address in CALLER_EMAILS at the top of this file — one with an active '
       + 'directory row whose role carries "*" in AllowedRoutesJson or user:view in PermissionsJson.'
  });

  if (blockers.length) {
    console.log(`%cNOT RUN — ${blockers.length} thing${blockers.length > 1 ? 's' : ''} to fix first.`,
      'color:#a4262c;font-weight:bold;font-size:13px');
    console.log('%cAll of them are listed below. Fix them together, then paste once.', 'color:#888');
    blockers.forEach((b, i) => {
      console.log(`%c${i + 1}. ${b.what}`, 'color:#a4262c;font-weight:bold');
      console.log(`   ${b.why}`);
      console.log(`%c   → ${b.fix}`, 'color:#0b6b3a');
    });
    return;
  }

  console.log(`Candidates: ${CANDIDATES.join(' → ')}`);
  console.log(`Reads always. Writes ${INCLUDE_WRITES ? 'INCLUDED' : 'skipped'}. OTP email ${INCLUDE_OTP ? 'INCLUDED' : 'skipped'}.\n`);

  /* `action` values are the platform's own contracts (config/endpoints.config.js), so each flow
     sees exactly what it sees in production. `payload.operation` is what the dynamic endpoint
     switches on and what the read flows echo. */
  const CALLS = [
    { key: 'FETCH_ALL',      action: 'fetchAll',
      payload: { operation: 'read', source: 'acceptance' }, tier: 'read' },
    { key: 'REFERENCE_DATA', action: 'lookups',
      payload: { operation: 'read', source: 'acceptance' }, tier: 'read' },
    { key: 'GET_DOCS',       action: 'getDocs',
      payload: { operation: 'read', source: 'acceptance' }, tier: 'read' },

    { key: 'SINGLE_ASSIGNMENT', action: 'singleassignment',
      payload: { operation: 'assign', source: 'acceptance', ref: '', assignee: '' },
      tier: 'write', expectRefusal: true,
      expect: 'a 400 from Condition_Assign_Input_Valid — the guard exercised without assigning anything' },
    { key: 'DYNAMIC_ACTIONS', action: 'dynamicGlobalAction',
      payload: { operation: 'acceptance-probe', source: 'acceptance' },
      tier: 'write', expectRefusal: true,
      expect: 'a 400 from Condition_Dynamic_Operation_Known — an unknown operation writes nothing' },

    { key: 'OTP_GENERATE',   action: 'generate',
      payload: { operation: 'requestOtp', source: 'acceptance', email: OTP_EMAIL },
      email: OTP_EMAIL, tier: 'otp' },
  ];

  const requestIds = [];

  /* One call, made exactly the way core/data-client.js makes it. Extracted so the caller probe
     and the run proper cannot drift apart — a probe that sent a different body would prove
     nothing about the run that follows it. */
  const callOnce = async (c, email) => {
    const requestId = rid();
    requestIds.push({ endpoint: c.key, requestId, caller: email });
    const payload = { ...c.payload, userEmail: email, trackingId: requestId };
    const sent = { action: c.action, payload, userEmail: email,
                   requestId, timestamp: new Date().toISOString() };
    if (c.email) sent.email = c.email;

    const t0 = performance.now();
    let res, body, netErr = null;
    try {
      res = await fetch(cfg[c.key], { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent) });
    } catch (e) { netErr = e.message; }
    const ms = Math.round(performance.now() - t0);
    if (!netErr) { try { body = await res.json(); } catch { body = null; } }

    /* The envelope every package returns. A response that is not this shape is not this estate's. */
    const shaped = !netErr && body && typeof body === 'object'
      && 'ok' in body && body.status && body.request && body.timing;
    return { requestId, ms, netErr, res, body, shaped,
             echoed: shaped && body.request.requestId === requestId };
  };

  const describe = (c, r) => `HTTP ${r.res.status} · ${r.ms}ms`
    + (r.shaped ? ` · envelope ok=${r.body.ok} code=${r.body.status.code}` : ' · NOT the standard envelope')
    + (r.echoed ? ' · requestId echoed' : r.shaped ? ' · requestId NOT echoed' : '')
    + (r.shaped && r.body.status.message ? ` · ${r.body.status.message}` : '');

  const netFail = (c, r) => ({ endpoint: c.key, verdict: 'FAIL', ms: r.ms, requestId: r.requestId,
    reached: false,
    detail: `the response could not be read (${r.netErr}). If the flow answered, this is CORS: `
      + `Flow Configuration's allowed origin does not match ${location.origin}.` });

  /* ---- resolve the caller ------------------------------------------------
     Probe FETCH_ALL with each candidate until one is accepted. A refusal moves to the next
     address; a network failure stops the search, because that is CORS or an unreachable flow and
     no other address would fare differently. */
  const probe = CALLS[0];                       /* FETCH_ALL — a read that writes no business row */
  let CALLER = null, probeResult = null, stopped = false, stopReason = '';
  const attempts = [];

  if (!cfg[probe.key]) {
    record({ endpoint: probe.key, verdict: 'FAIL',
      detail: 'no URL configured for this key — the platform cannot call it either' });
    stopped = true; stopReason = 'the first endpoint has no URL configured';
  } else for (const email of CANDIDATES) {
    const r = await callOnce(probe, email);
    if (r.netErr) {
      attempts.push({ email, outcome: 'unreachable', detail: r.netErr });
      record(netFail(probe, r));
      stopped = true; stopReason = 'the first call could not be read';
      break;
    }
    if (r.shaped && r.body.ok === true) {
      attempts.push({ email, outcome: 'accepted', http: r.res.status });
      CALLER = email; probeResult = r;
      break;
    }
    if (!r.shaped) {
      /* Something answered, and it was not this estate's envelope. That is not an authorisation
         problem and trying another address would not change it — so the search stops here and
         says what actually happened, rather than sending the operator to the directory. */
      attempts.push({ email, outcome: 'not-this-estate', http: r.res.status });
      record({ endpoint: probe.key, verdict: 'FAIL', ms: r.ms, requestId: r.requestId, reached: true,
        http: r.res.status,
        detail: describe(probe, r)
          + '  [something answered, but not this estate\'s envelope — check the URL configured for '
          + 'this key points at the rebuilt flow]' });
      stopped = true; stopReason = 'the first answer was not this estate\'s envelope';
      break;
    }
    attempts.push({ email, outcome: 'refused', http: r.res.status, code: r.body.status.code });
    console.log(`%c– ${probe.key} — ${email} refused · ${describe(probe, r)}`, COLOUR.SKIP);
  }

  if (CALLER) {
    if (attempts.length > 1) console.log(`%cCaller resolved: ${CALLER}`, 'color:#0b6b3a;font-weight:bold');
    record({ endpoint: probe.key, verdict: 'PASS', ms: probeResult.ms, requestId: probeResult.requestId,
      reached: true, http: probeResult.res.status, ok: probeResult.body.ok,
      code: probeResult.body.status.code, caller: CALLER, detail: describe(probe, probeResult) });
  } else if (!stopped) {
    /* Every candidate answered with this estate's envelope, and every one was refused. That is a
       finding about the directory, not about the endpoints — and it is reported as one. */
    const last = attempts[attempts.length - 1];
    record({ endpoint: probe.key, verdict: 'REFUSED', reached: true, http: last.http, ok: false,
      code: last.code,
      detail: `all ${CANDIDATES.length} candidate address(es) were refused — see the note below` });
  }

  /* ---- the rest of the run, with the resolved caller ---------------------- */
  for (const c of CALLS) {
    if (c === probe) continue;                                  /* already done above */
    if (stopped)                              { record({ endpoint: c.key, verdict: 'SKIP', detail: `stopped — ${stopReason}` }); continue; }
    if (!CALLER)                              { record({ endpoint: c.key, verdict: 'SKIP', detail: 'no caller was accepted' }); continue; }
    if (c.tier === 'write' && !INCLUDE_WRITES) { record({ endpoint: c.key, verdict: 'SKIP', detail: 'write tier not enabled' }); continue; }
    if (c.tier === 'otp' && !INCLUDE_OTP)     { record({ endpoint: c.key, verdict: 'SKIP', detail: 'OTP tier not enabled' }); continue; }
    if (c.tier === 'otp' && !OTP_EMAIL)       { record({ endpoint: c.key, verdict: 'FAIL', detail: 'OTP tier enabled but OTP_EMAIL is empty' }); continue; }
    if (!cfg[c.key]) { record({ endpoint: c.key, verdict: 'FAIL', detail: 'no URL configured for this key — the platform cannot call it either' }); continue; }

    const r = await callOnce(c, CALLER);
    if (r.netErr) { record(netFail(c, r)); continue; }

    /* Three outcomes, kept apart. The browser reading ANY body proves the origin; only ok===true
       proves the endpoint did its work; ok===false on a probe call is the guard doing its job. */
    let verdict;
    if (!r.shaped) verdict = 'FAIL';
    else if (c.expectRefusal) verdict = r.body.ok === false ? 'PASS' : 'FAIL';
    else verdict = r.body.ok === true ? 'PASS' : 'REFUSED';

    record({ endpoint: c.key, verdict, ms: r.ms, requestId: r.requestId, reached: true,
      http: r.res.status, ok: r.body?.ok, code: r.body?.status?.code, caller: CALLER,
      detail: describe(c, r)
        + (c.expectRefusal && verdict === 'FAIL' && r.shaped ? '  [the guard did NOT fire — it should have refused this]' : '')
        + (c.expect ? `  [expected: ${c.expect}]` : '') });
  }

  /* ---- verdict ---- */
  const fails    = rows.filter((r) => r.verdict === 'FAIL');
  const refused  = rows.filter((r) => r.verdict === 'REFUSED');
  const passes   = rows.filter((r) => r.verdict === 'PASS');
  const reached  = rows.filter((r) => r.reached === true);
  console.log('%c────────────────────────────────────────', 'color:#888');

  /* CORS first, and on its own evidence. */
  if (reached.length) {
    console.log(`%cCORS is correct for ${location.origin}.`, 'color:#0b6b3a;font-weight:bold');
    console.log(`The browser read ${reached.length} response ${reached.length === 1 ? 'body' : 'bodies'} — that is what proves it.`);
  } else {
    console.log('%cCORS IS NOT PROVEN — no response body was readable.', 'color:#a4262c;font-weight:bold');
    console.log(`Either the flows did not answer, or Flow Configuration's allowed origin is not ${location.origin}.`);
  }

  /* Acceptance second, and never borrowing the CORS result. */
  if (passes.length && !fails.length && !refused.length) {
    console.log('%cEVERY ENDPOINT CALLED DID ITS WORK.', 'color:#0b6b3a;font-weight:bold;font-size:13px');
  } else if (refused.length && !fails.length) {
    console.log(`%c${passes.length} succeeded, ${refused.length} answered with a refusal.`, 'color:#8a6d00;font-weight:bold;font-size:13px');
    console.log(`A refusal here is the authorisation gate, not a broken endpoint. Check that ${CALLER || 'the caller'}`);
    console.log("has a DGO_UserDirectory row with Status = 'active', and that its role in DGO_RoleCatalogue");
    console.log('carries "*" in AllowedRoutesJson or user:view in PermissionsJson (bulk:assign for the write tier).');
  } else if (!passes.length) {
    console.log('%cNOTHING SUCCEEDED.', 'color:#a4262c;font-weight:bold;font-size:13px');
  } else {
    console.log(`%c${passes.length} succeeded, ${refused.length} refused, ${fails.length} failed.`, 'color:#a4262c;font-weight:bold;font-size:13px');
  }

  /* Which addresses were tried, and what each answered. This prints whenever no caller was
     accepted, independently of which summary line above fired — a first version put it inside a
     branch that this state never reaches, so it never appeared when it was most needed. */
  if (!CALLER && attempts.some((a) => a.outcome === 'refused')) {
    console.log('%cEvery candidate address answered, and every one was refused:', 'color:#8a6d00;font-weight:bold');
    attempts.forEach((a) => console.log(`   ${a.email} → HTTP ${a.http}${a.code ? ' ' + a.code : ''} (${a.outcome})`));
    console.log('That is a finding about DGO_UserDirectory, not about the endpoints — they answered.');
    console.log("Check each address for a row with Status = 'active', and that its role in");
    console.log('DGO_RoleCatalogue carries "*" in AllowedRoutesJson or user:view in PermissionsJson.');
  }

  console.log('\nEach call above wrote one Portal Flow Telemetry row. To confirm they landed, run the');
  console.log('snippet below FROM A SHAREPOINT PAGE (this page cannot read SharePoint cross-origin):\n');
  console.log(`const IDS = ${JSON.stringify(requestIds.map((r) => r.requestId))};
fetch("https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre/_api/web/lists(guid'726c210d-09d5-45d9-952d-7a506b644b13')/items?$top=50&$orderby=Id desc&$select=Title,Flow,RunId,Outcome,DurationMs,StartedAtUtc,RunRecordJson",
  { credentials: "include", headers: { Accept: "application/json;odata=verbose" } })
  .then(r => r.json()).then(j => {
    const rows = j.d.results;
    console.table(rows.map(r => ({ Flow: r.Flow, Outcome: r.Outcome, ms: r.DurationMs, started: r.StartedAtUtc, runRecord: r.RunRecordJson ? r.RunRecordJson.length + " chars" : "EMPTY" })));
    console.log("rows carrying a run record:", rows.filter(r => r.RunRecordJson).length, "of", rows.length);
  });`);

  window.acceptance = { ranUtc: new Date().toISOString(), origin: location.origin,
                       candidates: CANDIDATES, caller: CALLER, callerSearch: attempts,
                       rows, requestIds };
  console.log('\nFile this run: copy(JSON.stringify(acceptance, null, 2))  — it contains no URLs.');
})();
