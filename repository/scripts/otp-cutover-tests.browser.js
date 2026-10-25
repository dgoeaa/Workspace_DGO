/*
 * THE FOUR CUTOVER TESTS — run from the platform, so the origin fix is tested too.
 *
 * WHY FROM THE PLATFORM AND NOT AN HTTP CLIENT
 *   Two things need proving and only a browser on the platform proves both. An HTTP client
 *   proves the flow's logic but never touches CORS, so the https://your-host replacement in
 *   step A would go unverified until a real user hit it. Running here exercises the origin
 *   header on every call: if step A is wrong, the very first test fails with a CORS error
 *   rather than a result, and that is the answer, not a nuisance.
 *
 *   It also means the trigger URL is never pasted anywhere. This reads it out of the deployed
 *   configuration, which is the thing the cutover just changed — so a run that works is also
 *   proof the deployed config carries the new flow.
 *
 * WHAT IT CANNOT DECIDE, AND SAYS SO
 *   Test 3 asks whether a mail was sent. No browser can see the tenant's outbound mail, so the
 *   script performs the call and tells you exactly which mailbox to look in. It reports that
 *   test as REQUIRES YOU rather than scoring it, because a test that grades itself on a
 *   question it cannot ask is how "0 rows are not approved" happened earlier in this estate.
 *
 * BEFORE YOU RUN IT
 *   Steps A, B, C and D are done: the origin is replaced, the URL is in the values file, the
 *   package is built and uploaded, and check:package named c5e314c7.
 *
 * HOW TO RUN
 *   1. Open https://activityweb.page.gd and hard-reload (Ctrl+F5) so you are not on a cached
 *      configuration.
 *   2. F12 -> Console. Set the two identities below to mailboxes you control. Paste this file.
 *   3. Read the report. Then go and read the OTP_Transactions rows it names.
 */
(async () => {
  const A = '';   /* <-- an address you control, e.g. 'you@nitda.gov.ng' */
  const B = '';   /* <-- a DIFFERENT address you control */

  const red = 'color:#dc322f;font-weight:bold', grn = 'color:#859900;font-weight:bold', amb = 'color:#b58900;font-weight:bold';
  const LIST = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING/_layouts/15/viewlsts.aspx';
  const results = [];

  const blockers = [];
  if (!A || !B) blockers.push('A and B are empty — set both to addresses you control, at the top of this file.');
  if (A && A === B) blockers.push('A and B are the same address. Test 1 needs two different identities to mean anything.');
  const url = window.DGO_CONFIG && window.DGO_CONFIG.endpoints && window.DGO_CONFIG.endpoints.OTP_VERIFY;
  if (!window.DGO_CONFIG) blockers.push('window.DGO_CONFIG does not exist — this is not the platform, or the config did not load.');
  else if (!url) blockers.push('OTP_VERIFY is empty in the deployed configuration — step C or D did not take. Nothing below would test the new flow.');
  if (url && !/c5e314c7/i.test(url)) blockers.push(`OTP_VERIFY does not point at the hardened flow (expected c5e314c7…). The cutover is not in place; testing now would test the flow you are replacing.`);
  if (blockers.length) {
    console.log('%cNOT RUN', red);
    blockers.forEach((b) => console.log('  · ' + b));
    return;
  }

  const call = async (body) => {
    const started = Date.now();
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = await r.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { status: r.status, json, text: text.slice(0, 200), ms: Date.now() - started };
    } catch (e) {
      /* A CORS failure lands here with an opaque message — the browser will not say more. */
      return { status: 0, error: e.message, ms: Date.now() - started, cors: true };
    }
  };
  const corsDied = (r) => {
    if (!r.cors) return false;
    console.log('%c✗ the request never returned a readable response.', red);
    console.log('  That is what a CORS refusal looks like from here. Step A replaced');
    console.log('  Access-Control-Allow-Origin on IP_OTP_VERIFY with this page\'s origin:');
    console.log(`      this page is  ${location.origin}`);
    console.log('  Open the flow, check the Response action\'s header matches that exactly, and run this again.');
    return true;
  };
  const record = (n, name, verdict, detail) => { results.push({ n, name, verdict, detail }); console.log(`  ${verdict === 'PASS' ? '✅' : verdict === 'FAIL' ? '❌' : '🟡'} ${name} — ${detail}`); };

  console.log(`%cOTP cutover tests · ${location.origin} · ${new Date().toISOString()}`, 'color:#268bd2;font-weight:bold');
  console.log(`  endpoint carries workflow c5e314c7 ✓`);

  /* ---- 1 · a code issued to A must not verify a session claimed for B ---- */
  console.group('1 · a code issued to A must not verify B');
  const g1 = await call({ action: 'generate', identifier: A });
  if (corsDied(g1)) return;
  console.log(`  generate for A → HTTP ${g1.status}`);
  console.log(`%c  READ A'S CODE NOW: it is NOT mailed to A. Case_Generate mails dgsregistry@nitda.gov.ng.`, amb);
  console.log(`  Or read the newest OTP_Transactions row where Title = ${A}: ${LIST}`);
  const code = window.prompt(`Test 1 — enter the code just issued for ${A}:`, '');
  if (!code) { console.log('%c  skipped — no code entered', amb); console.groupEnd(); }
  else {
    const v1 = await call({ action: 'verify', identifier: B, otp_code: String(code).trim() });
    const verified = v1.json && (v1.json.verified === true || /verification successful/i.test(v1.text));
    record(1, 'A\'s code claimed as B', verified ? 'FAIL' : 'PASS',
      verified ? `HTTP ${v1.status} and it VERIFIED — the bypass is still open` : `HTTP ${v1.status}, not verified — the lookup is bound to the caller`);
    console.groupEnd();

    /* ---- 2 · the same code must verify A ---- */
    console.group('2 · the same code must verify A');
    const v2 = await call({ action: 'verify', identifier: A, otp_code: String(code).trim() });
    const ok2 = v2.json && (v2.json.verified === true || /verification successful/i.test(v2.text));
    record(2, 'A\'s code as A', ok2 ? 'PASS' : 'FAIL',
      ok2 ? `HTTP ${v2.status}, verified` : `HTTP ${v2.status} — ${v2.text || 'no body'}. If test 1 passed and this failed, the identity the platform sends does not match what Case_Generate wrote to Title.`);
    console.groupEnd();
  }

  /* ---- 3 · a verify call must not send mail ---- */
  console.group('3 · a verify call must not send mail');
  const v3 = await call({ action: 'verify', identifier: B, otp_code: '000000' });
  console.log(`  verify with a wrong code for B → HTTP ${v3.status}`);
  record(3, 'no mail on a verify call', 'REQUIRES YOU',
    `no browser can see the tenant's outbound mail. Check ${B} and dgsregistry@nitda.gov.ng: NOTHING may have arrived from this call. Before the hardening, one did.`);
  console.groupEnd();

  /* ---- 4 · the fifth attempt must be refused ---- */
  console.group('4 · the attempt cap refuses at five');
  await call({ action: 'generate', identifier: B });
  console.log('  issued a fresh code for B, then guessing wrong six times…');
  const codes = [];
  for (let i = 1; i <= 6; i++) {
    const r = await call({ action: 'verify', identifier: B, otp_code: String(100000 + i) });
    codes.push(r.status);
    console.log(`    attempt ${i} → HTTP ${r.status}`);
  }
  const capped = codes.slice(4).includes(429);
  record(4, 'the cap fires', capped ? 'PASS' : 'FAIL',
    capped ? `429 returned on attempt ${codes.indexOf(429) + 1}` : `no 429 in ${codes.join(', ')} — check OTP_Transactions.Attempts is incrementing on B's row`);
  console.groupEnd();

  console.log('%c────────────────────────────────────────', 'color:#888');
  const failed = results.filter((r) => r.verdict === 'FAIL');
  const manual = results.filter((r) => r.verdict === 'REQUIRES YOU');
  console.log(`%c${failed.length ? `${failed.length} FAILED` : 'nothing failed'} · ${manual.length} need you to check a mailbox`, failed.length ? red : grn);
  if (!failed.length) console.log('Do NOT treat the cutover as finished until step F: the old flow is turned off and its URL refuses.');
  window.otpCutoverTests = { ranUtc: new Date().toISOString(), origin: location.origin, results };
})();
