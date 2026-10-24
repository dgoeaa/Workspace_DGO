#!/usr/bin/env node
/**
 * Apply the GOV-04 change of docs/folio-Master-Flows-and-Endpoints/deployment/NOTICE_LINKS.md to the tenant: the five
 * registry alerts of 04 - GOV - Audit HTTP Flow Registry link to the Admin Suite instead of the SharePoint list item.
 * GOV-04 is not built from a package, so npm run flows:update cannot do it; this edits only those links.
 *
 *   npm run gov04:noticelinks              dry run: reads the flow and says what would change
 *   npm run gov04:noticelinks -- --yes     back up, write, read back
 *   npm run gov04:noticelinks -- restore <backup.json>
 *
 * Refuses unless the flow holds exactly the five addresses and three labels (scripts/lib/gov04-notice-links.mjs).
 * Backups and reports go to --out (default ./flows-update-output, git-ignored); the report is evidence to file.
 * Sign-in: the saved Folio sign-in when FOLIO_MS_SESSION names one, else a code on a Microsoft page, as flows:update.
 * Behind a proxy, run with NODE_USE_ENV_PROXY=1.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rewriteGov04 } from './lib/gov04-notice-links.mjs';
import { deviceSignIn } from './lib/device-sign-in.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FLOW = '3e9e1342-5027-4c0f-bdd3-1e06aa7f2a3b';
const NAME = '04 - GOV - Audit HTTP Flow Registry';
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const API = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}`;
const OUT = resolve(arg('--out') || 'flows-update-output');
const RESTORE = process.argv.includes('restore') ? arg('restore') : null;

/* Sign-in as npm run flows:update does it: the saved Folio sign-in when FOLIO_MS_SESSION names a usable one, else a
   code to enter on a Microsoft page (kept in that file for next time when the variable is set). */
const SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const SESSION = process.env.FOLIO_MS_SESSION ? resolve(process.env.FOLIO_MS_SESSION) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (url, fields) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
      let json = {}; try { json = await res.json(); } catch { /* not JSON */ }
      return { status: res.status, json: json || {} };
    } catch (e) {
      if (attempt >= 3) throw new Error(`No connection to Microsoft sign-in after 4 tries (${e.message}). Check the connection and run the command again.`);
      await sleep(3000 * (attempt + 1));
    }
  }
};
const keep = (clientId, refreshToken) => {
  if (!SESSION || !clientId || !refreshToken) return;
  let prior = {}; try { prior = JSON.parse(readFileSync(SESSION, 'utf8')); } catch { /* first save */ }
  writeFileSync(SESSION, `${JSON.stringify({ ...prior, schema: 'folio-ms-session/1', clientId, tenant: TENANT, refreshToken, savedAt: new Date().toISOString(), savedBy: 'gov04-notice-links' }, null, 2)}\n`, { mode: 0o600 });
};
async function signIn() {
  if (SESSION && existsSync(SESSION)) {
    let s = {}; try { s = JSON.parse(readFileSync(SESSION, 'utf8')); } catch { /* unreadable: sign in afresh */ }
    if (s.clientId && s.refreshToken) {
      const t = await post(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: SCOPE });
      if (t.status === 200 && t.json.access_token) { keep(s.clientId, t.json.refresh_token || s.refreshToken); console.log('signed in with the saved Folio sign-in'); return t.json.access_token; }
      console.log('the saved Folio sign-in can no longer be used; signing in with a code instead');
    }
  }
  const r = await deviceSignIn({ tenant: TENANT, post, say: (m) => console.log(m), sleep });
  keep(r.client?.id, r.refreshToken);
  console.log(`signed in as ${r.user?.email || 'the account you chose'}`);
  return r.token;
}
const token = await signIn();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const api = async (method, path, body) => { const r = await fetch(`${API}${path}?api-version=2016-11-01`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null }; };

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT, { recursive: true });
const report = { flow: NAME, flowId: FLOW, readUtc: new Date().toISOString(), change: 'deployment/NOTICE_LINKS.md (GOV-04)' };
const save = () => { const f = join(OUT, `gov04-notice-links-${stamp}.json`); writeFileSync(f, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 1)); console.log(`report: ${f}`); };

const live = await api('GET', `/flows/${FLOW}`);
if (live.status !== 200) { report.error = `read ${live.status}`; save(); process.exit(1); }
const props = live.json.properties;

if (RESTORE) {
  const b = JSON.parse(readFileSync(RESTORE, 'utf8'));
  if (b.flowId !== FLOW) throw new Error(`${RESTORE} is a backup of ${b.flowId}, not GOV-04`);
  const w = await api('PATCH', `/flows/${FLOW}`, { properties: { definition: b.definition, connectionReferences: b.connectionReferences } });
  report.restore = { from: RESTORE, write: w.status };
  report.restore.state = rewriteGov04((await api('GET', `/flows/${FLOW}`)).json.properties.definition).state;
  save(); process.exit(w.status < 300 ? 0 : 1);
}

const r = rewriteGov04(props.definition);
report.state = r.state; report.counts = r.counts; if (r.reason) report.reason = r.reason;
if (r.state !== 'change') { save(); process.exit(r.state === 'applied' ? 0 : 1); }
if (!process.argv.includes('--yes')) { report.dryRun = true; save(); console.log('Dry run. Add --yes to write.'); process.exit(0); }

writeFileSync(join(OUT, `gov04-backup-${stamp}.json`), JSON.stringify({ flowId: FLOW, ...props }, null, 2), { mode: 0o600 });
const w = await api('PATCH', `/flows/${FLOW}`, { properties: { definition: r.definition, connectionReferences: props.connectionReferences } });
report.write = w.status;
if (w.status >= 300) { report.error = JSON.stringify(w.json).slice(0, 800); save(); process.exit(1); }
const back = rewriteGov04((await api('GET', `/flows/${FLOW}`)).json.properties.definition);
report.readBack = { state: back.state, counts: back.counts };
save();
process.exit(back.state === 'applied' ? 0 : 1);
