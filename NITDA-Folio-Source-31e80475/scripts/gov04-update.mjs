#!/usr/bin/env node
/*
 * Bring GOV-04 (04 - GOV - Audit HTTP Flow Registry) up to date in one command, and prove it.
 *
 *   npm run gov04:update                 check: reads the flow, shows what would change, writes nothing
 *   npm run gov04:update -- apply        check, confirm, back up, write, read back
 *   npm run gov04:update -- apply --yes  the same without asking
 *   npm run gov04:update -- restore <backup.json>   put the backed-up definition back
 *
 * GOV-04 is not built from an identification package, so `npm run flows:update` does not reach it. The changes are
 * scripts/lib/gov04-fix.mjs: release 42's registry links, the failure threshold reading its own row, and an exception
 * closing only when its condition has cleared. Sign-in is the same as flows:update (the saved Folio sign-in when
 * FOLIO_MS_SESSION names one, else a code on a Microsoft page). Backups and reports go to --out (default
 * ./flows-update-output, git-ignored); a backup holds the flow's definition and its connection references.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { deviceSignIn } from './lib/device-sign-in.mjs';
import { fixGov04 } from './lib/gov04-fix.mjs';

const env = process.env;
const args = process.argv.slice(2);
const cmd = ['check', 'apply', 'restore'].includes(args[0]) ? args[0] : 'check';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const ENVIRONMENT = `Default-${TENANT}`;
const FLOW_ID = '3e9e1342-5027-4c0f-bdd3-1e06aa7f2a3b';
const FLOW = env.FOLIO_FLOW_API || 'https://api.flow.microsoft.com';
const LOGIN = env.FOLIO_LOGIN || 'https://login.microsoftonline.com';
const OUT = path.resolve(opt('--out') || 'flows-update-output');
const SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const SESSION = env.FOLIO_MS_SESSION ? path.resolve(env.FOLIO_MS_SESSION) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'restore' && !args[1]) { console.error('usage: npm run gov04:update -- restore <backup.json>'); process.exit(2); }

const post = async (url, fields) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  let json = {}; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {} };
};
const claims = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };
function keep(clientId, refreshToken, user) {
  if (!SESSION || !refreshToken) return;
  let prior = {}; try { prior = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { /* first save */ }
  fs.mkdirSync(path.dirname(SESSION), { recursive: true, mode: 0o700 });
  fs.writeFileSync(SESSION, `${JSON.stringify({ ...prior, schema: 'folio-ms-session/1', clientId, tenant: TENANT, refreshToken, user: user || prior.user, savedAt: new Date().toISOString(), savedBy: 'gov04-update' }, null, 2)}\n`, { mode: 0o600 });
}
async function signIn() {
  if (SESSION && fs.existsSync(SESSION)) {
    let s = {}; try { s = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { /* sign in afresh */ }
    if (s.clientId && s.refreshToken) {
      const t = await post(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: SCOPE });
      if (t.status === 200 && t.json.access_token) {
        const who = claims(t.json.access_token);
        keep(s.clientId, t.json.refresh_token || s.refreshToken, { name: who.name || '', email: who.upn || who.preferred_username || '' });
        console.log(`    signed in as ${who.upn || who.preferred_username || 'the saved account'} (the saved Folio sign-in; no code needed)`);
        return t.json.access_token;
      }
    }
  }
  const r = await deviceSignIn({ tenant: TENANT, post, say: (s) => console.log(s), sleep, login: LOGIN });
  keep(r.client?.id, r.refreshToken, r.user);
  console.log(`    signed in as ${r.user?.email || 'the account you chose'}`);
  return r.token;
}

let token = null;
async function api(method, body) {
  const res = await fetch(`${FLOW}/providers/Microsoft.ProcessSimple/environments/${ENVIRONMENT}/flows/${FLOW_ID}?api-version=2016-11-01`,
    { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await res.text(); let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = { error: { message: txt.slice(0, 300) } }; }
  return { ok: res.ok, status: res.status, body: json };
}
function save(name, value) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}
async function confirm(q) {
  if (args.includes('--yes')) return true;
  if (!process.stdin.isTTY) { console.log('Not a terminal, so nothing is written without --yes.'); return false; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(q)).trim()); } finally { rl.close(); }
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log(`GOV-04 update — ${cmd}`);
token = await signIn();
const live = await api('GET');
if (!live.ok) { console.error(`Could not read GOV-04 (HTTP ${live.status}): ${live.body?.error?.message || ''}`); process.exit(2); }
const props = live.body.properties;
console.log(`    ${props.displayName} · ${props.state} · last saved ${props.lastModifiedTime}`);

if (cmd === 'restore') {
  const b = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  if (!(await confirm('Put the backed-up definition back? [y/N] '))) { console.log('Nothing written.'); process.exit(0); }
  const w = await api('PATCH', { properties: { definition: b.definition, connectionReferences: b.connectionReferences } });
  const back = await api('GET');
  const ok = w.ok && same(back.body?.properties?.definition, b.definition);
  console.log(ok ? 'RESTORED and read back.' : `Restore did not land (HTTP ${w.status}): ${w.body?.error?.message || 'the read-back differs'}`);
  process.exit(ok ? 0 : 1);
}

const r = fixGov04(props.definition);
if (r.problems.length) { console.log('\nNOT WRITTEN — GOV-04 does not look the way this change expects:'); for (const p of r.problems) console.log(`  - ${p}`); process.exit(1); }
if (r.already) { console.log('\nUP_TO_DATE — GOV-04 already carries every change.'); console.log(`Report: ${save(`gov04-${cmd}-${stamp()}.json`, { at: new Date().toISOString(), flowId: FLOW_ID, status: 'UP_TO_DATE' })}`); process.exit(0); }
console.log('\nWILL_UPDATE');
for (const c of r.changes) console.log(`  - ${c}`);
if (cmd === 'check') { console.log('\nNothing written. To write: npm run gov04:update -- apply'); process.exit(1); }

if (!(await confirm('\nWrite GOV-04? It is backed up first and read back after. [y/N] '))) { console.log('Nothing written.'); process.exit(0); }
const backup = save(`gov04-backup-${stamp()}.json`, { flowId: FLOW_ID, at: new Date().toISOString(), definition: props.definition, connectionReferences: props.connectionReferences });
console.log(`Backed up to ${backup}`);
const w = await api('PATCH', { properties: { definition: r.definition, connectionReferences: props.connectionReferences } });
const back = await api('GET');
const landed = w.ok && same(back.body?.properties?.definition, r.definition);
if (!landed) {
  console.log(`The write did not land (HTTP ${w.status}): ${w.body?.error?.message || 'the read-back differs'}. Putting the backup back.`);
  await api('PATCH', { properties: { definition: props.definition, connectionReferences: props.connectionReferences } });
}
const report = { at: new Date().toISOString(), flowId: FLOW_ID, status: landed ? 'APPLIED' : 'FAILED', changes: r.changes, backup: path.basename(backup) };
console.log(landed ? '\nAPPLIED — written and read back.' : '\nFAILED — GOV-04 is as it was.');
console.log(`Report: ${save(`gov04-apply-${stamp()}.json`, report)}`);
process.exit(landed ? 0 : 1);
