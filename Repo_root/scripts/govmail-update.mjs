#!/usr/bin/env node
/*
 * Bring the e-mail bodies of GOV-01 to GOV-08 to the e-mail template package's GV-* designs in one command, and prove it
 * (finding F3, ITEM-92).
 *
 *   npm run govmail:update                         check: reads every GOV flow, shows what would change, writes nothing
 *   npm run govmail:update -- apply                check, confirm, back up, write, read back (flow by flow)
 *   npm run govmail:update -- apply --yes          the same without asking
 *   npm run govmail:update -- --only 04,06         just these flows (their number or any part of their id)
 *   npm run govmail:update -- restore <backup.json> put one backed-up definition back
 *
 * The GOV flows are not built from identification packages, so `npm run flows:update` does not reach them. The change is
 * scripts/lib/govmail-fix.mjs; it refuses a flow that does not look as it expects (GOV-04 needs npm run gov04:update
 * first). Sign-in is the same as flows:update (the saved Folio sign-in when FOLIO_MS_SESSION names one, else a code on
 * a Microsoft page). Backups and reports go to --out (default ./flows-update-output, git-ignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { deviceSignIn } from './lib/device-sign-in.mjs';
import { fixGovMail, storedDiff, FLOWS } from './lib/govmail-fix.mjs';

const env = process.env;
const args = process.argv.slice(2);
const cmd = ['check', 'apply', 'restore'].includes(args[0]) ? args[0] : 'check';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const ENVIRONMENT = `Default-${TENANT}`;
const FLOW = env.FOLIO_FLOW_API || 'https://api.flow.microsoft.com';
const LOGIN = env.FOLIO_LOGIN || 'https://login.microsoftonline.com';
const OUT = path.resolve(opt('--out') || 'flows-update-output');
const SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const SESSION = env.FOLIO_MS_SESSION ? path.resolve(env.FOLIO_MS_SESSION) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'restore' && !args[1]) { console.error('usage: npm run govmail:update -- restore <backup.json>'); process.exit(2); }

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
  fs.writeFileSync(SESSION, `${JSON.stringify({ ...prior, schema: 'folio-ms-session/1', clientId, tenant: TENANT, refreshToken, user: user || prior.user, savedAt: new Date().toISOString(), savedBy: 'govmail-update' }, null, 2)}\n`, { mode: 0o600 });
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
async function api(flowId, method, body) {
  const res = await fetch(`${FLOW}/providers/Microsoft.ProcessSimple/environments/${ENVIRONMENT}/flows/${flowId}?api-version=2016-11-01`,
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

console.log(`GOV e-mail update — ${cmd}`);
token = await signIn();

if (cmd === 'restore') {
  const b = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  if (!FLOWS[b.flowId]) { console.error(`${args[1]} is not a GOV flow backup`); process.exit(2); }
  if (!(await confirm(`Put the backed-up definition of ${FLOWS[b.flowId]} back? [y/N] `))) { console.log('Nothing written.'); process.exit(0); }
  const w = await api(b.flowId, 'PATCH', { properties: { definition: b.definition, connectionReferences: b.connectionReferences } });
  const back = await api(b.flowId, 'GET');
  const diff = w.ok ? storedDiff(back.body?.properties?.definition, b.definition) : null;
  const ok = w.ok && !diff;
  console.log(ok ? 'RESTORED and read back.' : `Restore did not land (HTTP ${w.status}): ${w.body?.error?.message || `stored with a difference at ${diff}`}`);
  process.exit(ok ? 0 : 1);
}

const only = (opt('--only') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const chosen = Object.entries(FLOWS).filter(([id, name]) => !only.length || only.some((o) => id.includes(o) || name.toLowerCase().startsWith(o.padStart(2, '0'))));
const report = { at: new Date().toISOString(), command: cmd, flows: [] };
let failed = 0;
for (const [flowId, name] of chosen) {
  const live = await api(flowId, 'GET');
  if (!live.ok) { console.log(`\n${name}: could not read it (HTTP ${live.status}): ${live.body?.error?.message || ''}`); report.flows.push({ flowId, name, status: 'UNREADABLE' }); failed++; continue; }
  const props = live.body.properties;
  const r = fixGovMail(props.definition, flowId);
  console.log(`\n${name} · ${props.state} · last saved ${props.lastModifiedTime}`);
  if (r.problems.length) { console.log('  NOT WRITTEN — it does not look the way this change expects:'); for (const p of r.problems) console.log(`    - ${p}`); report.flows.push({ flowId, name, status: 'REFUSED', problems: r.problems }); failed++; continue; }
  if (r.already) { console.log('  UP_TO_DATE'); report.flows.push({ flowId, name, status: 'UP_TO_DATE' }); continue; }
  console.log('  WILL_UPDATE'); for (const c of r.changes) console.log(`    - ${c}`);
  if (cmd === 'check') { report.flows.push({ flowId, name, status: 'WILL_UPDATE', changes: r.changes }); continue; }
  if (!(await confirm(`  Write ${name}? It is backed up first and read back after. [y/N] `))) { console.log('  Nothing written.'); report.flows.push({ flowId, name, status: 'SKIPPED' }); continue; }
  const backup = save(`govmail-backup-${flowId}-${stamp()}.json`, { flowId, name, at: new Date().toISOString(), definition: props.definition, connectionReferences: props.connectionReferences });
  console.log(`  Backed up to ${backup}`);
  const w = await api(flowId, 'PATCH', { properties: { definition: r.definition, connectionReferences: props.connectionReferences } });
  const back = await api(flowId, 'GET');
  const diff = w.ok ? storedDiff(back.body?.properties?.definition, r.definition) : null;
  const landed = w.ok && !diff;
  let restored = null;
  if (!landed) {
    console.log(`  The write did not land (HTTP ${w.status}): ${w.body?.error?.message || `stored with a difference at ${diff}`}. Putting the backup back.`);
    const u = await api(flowId, 'PATCH', { properties: { definition: props.definition, connectionReferences: props.connectionReferences } });
    const again = await api(flowId, 'GET');
    restored = u.ok && !storedDiff(again.body?.properties?.definition, props.definition);
    console.log(restored ? '  Backup put back and read back.' : `  THE BACKUP DID NOT GO BACK: npm run govmail:update -- restore ${backup}`);
    failed++;
  } else console.log('  APPLIED — written and read back.');
  report.flows.push({ flowId, name, status: landed ? 'APPLIED' : 'FAILED', changes: r.changes, backup: path.basename(backup),
    ...(landed ? {} : { difference: diff || `HTTP ${w.status}`, restored }) });
}
console.log(`\nReport: ${save(`govmail-${cmd}-${stamp()}.json`, report)}`);
if (cmd === 'check' && report.flows.some((f) => f.status === 'WILL_UPDATE')) console.log('Nothing written. To write: npm run govmail:update -- apply');
process.exit(failed ? 1 : 0);
