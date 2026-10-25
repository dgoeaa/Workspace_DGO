/**
 * Device-code sign-in to the Flow service, the way the correspondence mailer's setup signs in
 * (scripts/mailer-package/setup.mjs): the operator opens a Microsoft page on any device, types a
 * code, and signs in with their own account. No app registration, no admin consent, no secret.
 *
 * It goes through Microsoft's own public sign-in apps, in order; if Microsoft refuses one in this
 * tenant it moves to the next and shows a new code. The list is the mailer's, for the same reason:
 * the Azure CLI app (04b07795-…) is refused in every tenant with AADSTS700016.
 *
 * Self-contained (no imports), because the build embeds it into a one-file CLI with toString().
 * `post(url, fields)` must return { status, json } and retry dropped connections itself.
 * Returns { token, user, refreshToken, client } — the tokens are only ever handed to the caller, never
 * printed. A caller that keeps a sign-in between runs (FOLIO_MS_SESSION) stores refreshToken and client.id.
 */
export async function deviceSignIn({ tenant, post, say, sleep, login = 'https://login.microsoftonline.com', pollMs = null }) {
  const CLIENTS = [
    { id: '1950a258-227b-4e31-a9cf-717495945fc2', name: 'Microsoft Azure PowerShell' },
    { id: '9cee029c-6210-4654-90bb-17e6e9d36617', name: 'Power Platform CLI' },
  ];
  const SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
  const APP_REFUSED = /AADSTS(700016|65002|65001|7000112|50059|500011|650057)\b|unauthorized_client|invalid_client/;
  const describe = (r) => {
    const e = r.json && r.json.error;
    return `HTTP ${r.status}${e ? ` — ${e}${r.json.error_description ? `: ${String(r.json.error_description).split('\r\n')[0]}` : ''}` : ''}`;
  };
  const claims = (jwt) => {
    try {
      const part = String(jwt).split('.')[1].split('-').join('+').split('_').join('/');
      return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
    } catch { return {}; }
  };
  const refusals = [];
  for (const client of CLIENTS) {
    const dc = await post(`${login}/${tenant}/oauth2/v2.0/devicecode`, { client_id: client.id, scope: SCOPE });
    if (dc.status !== 200 || !dc.json.device_code) {
      const why = describe(dc);
      if (APP_REFUSED.test(why)) { refusals.push(`${client.name}: ${why}`); continue; }
      throw new Error(`Microsoft sign-in is not available: ${why}`);
    }
    say(`\n    Open ${dc.json.verification_uri || 'https://microsoft.com/devicelogin'} and enter the code ${dc.json.user_code}`);
    say(`    Sign in with the account that owns the flows. Microsoft names the app "${client.name}". This window carries on by itself.\n`);
    const deadline = Date.now() + (dc.json.expires_in || 900) * 1000;
    let interval = pollMs ?? (dc.json.interval || 5) * 1000;
    let refused = null;
    for (;;) {
      await sleep(interval);
      const t = await post(`${login}/${tenant}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: client.id, device_code: dc.json.device_code });
      if (t.status === 200 && t.json.access_token) {
        const who = claims(t.json.access_token);
        return { token: t.json.access_token, user: { name: who.name || '', email: who.upn || who.unique_name || who.preferred_username || '' }, refreshToken: t.json.refresh_token || null, client };
      }
      const code = t.json.error;
      if (code === 'authorization_pending') { if (Date.now() > deadline) throw new Error('The sign-in code expired. Run the command again.'); continue; }
      if (code === 'slow_down') { interval += 5000; continue; }
      if (code === 'authorization_declined') throw new Error('Sign-in was declined.');
      if (code === 'expired_token') throw new Error('The sign-in code expired. Run the command again.');
      const why = describe(t);
      if (APP_REFUSED.test(why)) { refused = why; break; }
      throw new Error(`Sign-in failed: ${why}`);
    }
    refusals.push(`${client.name}: ${refused}`);
    say(`    Microsoft does not allow sign-in through ${client.name} here; trying the next app — a new code follows.`);
  }
  throw new Error(`Microsoft refused every sign-in app this tool can use:\n      ${refusals.join('\n      ')}\n    Use the browser route in docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.md.`);
}
