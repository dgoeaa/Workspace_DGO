#!/usr/bin/env node
// DGO Correspondence Mailer — automatic setup: from nothing to a published, configured mailer.
//
//   node tools/setup.mjs                  sign in once, then do everything below
//   node tools/setup.mjs --plan           sign in and report what it would do; change nothing
//   node tools/setup.mjs --origin URL     the origin the mailer is published on
//                                         (default: the platform's, https://folio-platform.page.gd)
//   node tools/setup.mjs --update-flows   also replace same-contract definitions that differ
//                                         from this package (each flow's settings and key kept)
//   node tools/setup.mjs --rotate-key     give all seven flows a new admin key
//   node tools/setup.mjs --export-flows   save all seven flows, as they are in the tenant, in ONE
//                                         file: an importable package per flow and a backup of
//                                         them all (read only; nothing in the tenant changes)
//   node tools/setup.mjs --restore-flows FILE
//                                         put the seven flows back exactly as in that export
//                                         (each read back to confirm; the state before is saved)
//   node tools/setup.mjs --refresh-mailer rewrite the published mailer.html with this package's
//                                         app, keeping the seven flow addresses already in it.
//                                         No sign-in; nothing in Power Automate or SharePoint
//                                         changes. For a release that changes only the app;
//                                         refused when the flows are older than this package's.
//   node tools/setup.mjs --manual --endpoints FILE --key KEY --operator EMAIL [--name NAME]
//                                         without Microsoft sign-in: the flows were imported and
//                                         keyed by hand (GO-LIVE "Manual setup"); FILE holds the
//                                         seven trigger URLs as MAIL_SEND=https://… lines. Does
//                                         steps 7 and 8 below with that key.
//
// What it does, in order, each step reported:
//
//   1. Signs in as the sending account with a one-time code (microsoft.com/devicelogin), the
//      way Microsoft's own command-line tools do. Nothing is stored: the sign-in lasts for this run
//      only — unless FOLIO_MS_SESSION names a session file (the platform suite's `folio` sets it),
//      in which case the refresh token is kept there, 0600, and the next run needs no code.
//   2. Finds the Power Automate environment the flows were built for.
//   3. Finds the seven DGO_MAIL_* flows. Missing ones are created from this package; ones from
//      an older contract are upgraded (their own settings and key kept); current ones are
//      adopted as they are.
//   4. Settles the admin key — the key only setup uses; browsers never hold it: the one the
//      flows already share, else a new random one.
//   5. Binds each flow to a working SharePoint / Outlook connection of the signed-in account,
//      repairing references to connections that are broken or belong to nobody here, and sets
//      the one origin whose pages may read the flows' answers.
//   6. Turns every flow on, and reads each one's trigger URL.
//   7. Checks all seven over HTTP, creates or completes the SharePoint lists and library, fills
//      the directory and template lists if they are empty, and makes the signed-in account the
//      first admin operator.
//   8. Writes the mailer ready to publish: ONE file, mailer.html, holding the whole app and the
//      seven URLs (no key), and a report without any secrets.
//
// After mailer.html is uploaded beside the platform's index.html, anyone on the operator list
// opens <origin>/mailer.html on any device and signs in with a code mailed to them. Nothing is installed or configured per device.
//
// It changes only the seven DGO_MAIL_* flows and the DGOMail* lists and library. Running it
// again is safe: what is already right is left alone.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const WEB = path.join(PKG, 'web');
const { health, verify, op } = await import(pathToFileURL(path.join(WEB, 'js', 'api.js')).href);
const { SEED_DIRECTORY } = await import(pathToFileURL(path.join(WEB, 'js', 'seed-directory.js')).href);
const { SEED_TEMPLATES } = await import(pathToFileURL(path.join(WEB, 'js', 'seed-templates.js')).href);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const PLAN = has('--plan');
const UPDATE = has('--update-flows');
const ROTATE = has('--rotate-key');
const REFRESH = has('--refresh-mailer');
const EXPORT = has('--export-flows');
const RESTORE_FILE = arg('--restore-flows', null);
const RESTORE = has('--restore-flows');
const EXPORT_DIR = path.resolve(arg('--export-dir', path.resolve(PKG, '..', 'dgo-mail-flows')));
const MANUAL = has('--manual');
const NO_BROWSER = has('--no-browser') || process.env.DGO_SETUP_NO_BROWSER === '1';
const PUBLISH_DIR = path.resolve(arg('--publish-dir', path.resolve(PKG, '..', 'dgo-mailer-publish')));
/* A refresh keeps its own report, so the full setup's report is not overwritten by it. */
const REPORT_PATH = path.resolve(arg('--report', path.resolve(PKG, '..', has('--refresh-mailer') ? 'dgo-mailer-refresh-report.txt' : 'dgo-mailer-setup-report.txt')));

/* Microsoft endpoints. Overridable only so the test suite can stand in for them. */
const LOGIN = process.env.DGO_SETUP_LOGIN_BASE || 'https://login.microsoftonline.com';
const FLOW = process.env.DGO_SETUP_FLOW_BASE || 'https://api.flow.microsoft.com';
const PAPPS = process.env.DGO_SETUP_POWERAPPS_BASE || 'https://api.powerapps.com';
/* The Microsoft public sign-in apps setup signs in through, in order. Microsoft retired the Azure
   CLI app (04b07795-…) for this: it now answers AADSTS700016 "not found in the directory" in every
   tenant. The first below is the one Microsoft's own Power Apps administration PowerShell module
   signs in with to reach these same Flow and Power Apps APIs; the second is the Power Platform
   CLI's. If Microsoft refuses one, setup moves to the next by itself. */
const CLIENTS = [
  { id: '1950a258-227b-4e31-a9cf-717495945fc2', name: 'Microsoft Azure PowerShell' },
  { id: '9cee029c-6210-4654-90bb-17e6e9d36617', name: 'Power Platform CLI' },
];
/* Microsoft's answers that mean "this app may not be used here", as opposed to a user's action. */
const APP_REFUSED = /AADSTS(700016|65002|65001|7000112|50059|500011|650057)\b|unauthorized_client|invalid_client/;
const FLOW_SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const PAPPS_SCOPE = 'https://service.powerapps.com//.default offline_access openid profile';
const API_VERSION = 'api-version=2016-11-01';
/* How long new triggers are given to start answering. Overridable only for the test suite. */
const CHECK_INTERVAL_MS = Number(process.env.DGO_SETUP_CHECK_INTERVAL_MS) || 15000;
const CHECK_WINDOW_MS = Number(process.env.DGO_SETUP_CHECK_WINDOW_MS) || 180000;

/* The Microsoft 365 tenant to sign in to. Microsoft refuses the generic "organizations"
   authority for the Power Automate service (AADSTS50059), so it is named: a default Power
   Platform environment is called "Default-<tenant id>", and the flows name theirs. */
let TENANT = arg('--tenant', '');

/* The origin the mailer is published on: scheme and host only, no path, no trailing slash. */
let ORIGIN = arg('--origin', '');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(PKG, 'flows', 'flows.catalogue.json'), 'utf8'));
const FLOWS = CATALOGUE.flows.map((f) => {
  const definition = JSON.parse(fs.readFileSync(path.join(PKG, 'flows', f.definition), 'utf8'));
  const apis = [...new Set([...JSON.stringify(definition).matchAll(/"connectionName":"shared_([a-z0-9]+)"/g)].map((m) => m[1]))];
  return { name: f.name, key: f.endpointKey, definition, apis };
});

ORIGIN = (ORIGIN || FLOWS[0].definition.actions.Compose_Config.inputs.allowedOrigin || '').replace(/\/+$/, '');
TENANT = TENANT || (String(FLOWS[0].definition.actions.Compose_Config.inputs.environment || '').match(/^Default-([0-9a-f-]{36})$/i)?.[1] ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(TENANT)) {
  console.error(`No Microsoft 365 tenant id: give it with --tenant <id> (got "${TENANT}").`);
  process.exit(2);
}
if (ORIGIN !== '*' && !/^https?:\/\/[^/?#\s]+$/i.test(ORIGIN)) {
  console.error(`--origin must be a scheme and host only, such as https://folio-platform.page.gd (got "${ORIGIN}").`);
  process.exit(2);
}

/* ---------------- output ---------------- */

const tty = process.stdout.isTTY && process.env.TERM !== 'dumb';
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const lines = [];
const record = (kind, text) => lines.push(`${kind.padEnd(5)} ${text}`);
const step = (t) => { console.log(`\n${c('1;32', '==>')} ${c('1', t)}`); record('', ''); record('STEP', t); };
const ok = (t) => { console.log(`    ${c('32', '✓')} ${t}`); record('OK', t); };
const info = (t) => { console.log(`    ${c('36', '·')} ${t}`); record('INFO', t); };
const warn = (t) => { console.log(`    ${c('1;33', '!')} ${t}`); record('WARN', t); };
class Stop extends Error {}
const fail = (t) => { console.log(`    ${c('1;31', '✗')} ${t}`); record('FAIL', t); throw new Stop(t); };

function openUrl(url) {
  if (NO_BROWSER) return;
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'android' ? ['termux-open-url', [url]]
    : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).on('error', () => {}).unref(); } catch { /* the URL is printed */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u) => { try { return new URL(u).host; } catch { return '?'; } };

/* ---------------- HTTP to Microsoft ---------------- */

async function form(url, fields) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }); break; }
    catch (e) { if (attempt < 3) { await sleep(3000 * (attempt + 1)); continue; } fail(`No connection to Microsoft sign-in after 4 tries (${e.message}). Check the phone's connection and run setup again.`); }
  }
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json: json || {} };
}

function describeHttp(res, json, raw) {
  const e = json?.error;
  const msg = typeof e === 'string' ? `${e}${json.error_description ? `: ${json.error_description.split('\r\n')[0]}` : ''}` : e ? `${e.code || ''} ${e.message || ''}`.trim() : raw?.slice(0, 300);
  return `HTTP ${res.status}${msg ? ` — ${msg}` : ''}`;
}

function api(token) {
  return async function call(method, url, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      /* A phone's connection can drop for a moment ("fetch failed"): try again before stopping. */
      try { res = await fetch(url, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
      catch (e) { if (attempt < 3) { await sleep(3000 * (attempt + 1)); continue; } throw new Error(`${e.message} — no connection to Microsoft after 4 tries; check the phone's connection and run setup again`); }
      const raw = await res.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { /* */ }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) { const e = new Error(describeHttp(res, json, raw)); e.status = res.status; e.json = json; throw e; }
      return json;
    }
  };
}

async function all(call, url) {
  const out = [];
  let next = url;
  while (next) { const page = await call('GET', next); out.push(...(page?.value || [])); next = page?.nextLink || page?.['@odata.nextLink'] || null; }
  return out;
}

const claims = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };

/* ---------------- 1. sign in ---------------- */

/* A saved sign-in. When FOLIO_MS_SESSION names a session file (the platform suite's `folio` sets
   ~/.folio/microsoft/session.json, which the Central Administration Centre shares), setup redeems
   the refresh token in it instead of showing a code, and writes back the one Microsoft rotates it
   to. Only the refresh token is kept, mode 0600; access tokens never leave memory. Without the
   variable nothing is read or written, and every run signs in afresh, as before. */
const SESSION = process.env.FOLIO_MS_SESSION ? path.resolve(process.env.FOLIO_MS_SESSION) : null;

function saveSession(client, refreshToken, user, tenant) {
  if (!SESSION || !refreshToken) return;
  let prior = {};
  try { prior = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { /* first save */ }
  const body = { schema: 'folio-ms-session/1', clientId: client.id, clientName: client.name, tenant, refreshToken,
    user: { name: user.name || '', email: user.email || '', objectId: user.objectId || '' },
    signedInAt: prior.clientId === client.id && prior.signedInAt ? prior.signedInAt : new Date().toISOString(),
    savedAt: new Date().toISOString(), savedBy: 'mailer-setup' };
  try {
    fs.mkdirSync(path.dirname(SESSION), { recursive: true, mode: 0o700 });
    const tmp = `${SESSION}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, SESSION);
  } catch (e) { record('WARN', `could not save the sign-in for next time: ${e.message}`); }
}

/** The saved sign-in, redeemed for both services setup calls, or null to sign in with a code. */
async function fromSession() {
  if (!SESSION || !fs.existsSync(SESSION)) return null;
  let s;
  try { s = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { return null; }
  const client = CLIENTS.find((x) => x.id === s.clientId);
  if (!client || !s.refreshToken || (s.tenant && s.tenant !== TENANT)) return null;
  const drop = (why) => { info(`The saved Microsoft sign-in can no longer be used (${why}); signing in with a code instead.`); try { fs.rmSync(SESSION, { force: true }); } catch { /* gone */ } return null; };
  const f = await form(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: client.id, refresh_token: s.refreshToken, scope: FLOW_SCOPE });
  if (f.status !== 200 || !f.json.access_token) return drop(describeHttp(f, f.json));
  const p = await form(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: client.id, refresh_token: f.json.refresh_token || s.refreshToken, scope: PAPPS_SCOPE });
  if (p.status !== 200 || !p.json.access_token) return drop(describeHttp(p, p.json));
  const who = claims(f.json.access_token);
  const user = { email: who.upn || who.unique_name || who.preferred_username || '', name: who.name || '', objectId: who.oid || '', tenant: who.tid || TENANT };
  saveSession(client, p.json.refresh_token || f.json.refresh_token || s.refreshToken, user, TENANT);
  ok(`signed in as ${user.name ? `${user.name} <${user.email}>` : user.email} — the saved sign-in, no code needed`);
  return { user, flow: () => f.json.access_token, papps: () => p.json.access_token };
}

async function signIn() {
  step('Signing in as the sending account');
  const saved = await fromSession();
  if (saved) return saved;
  const refusals = [];
  for (const client of CLIENTS) {
    const r = await signInWith(client);
    if (r.ok) return r.ok;
    refusals.push(`${client.name}: ${r.refused}`);
    record('WARN', `Microsoft refused sign-in through ${client.name}: ${r.refused}`);
    if (client !== CLIENTS[CLIENTS.length - 1]) info(`Microsoft does not allow sign-in through ${client.name} here; trying ${CLIENTS[CLIENTS.indexOf(client) + 1].name} — a new code follows.`);
  }
  fail(`Microsoft refused every sign-in app setup can use:\n      ${refusals.join('\n      ')}\n    Use "Manual setup" in GO-LIVE.html (setup --manual).`);
}

/** One device-code sign-in through one app. Returns { ok } or { refused } (the app is not allowed). */
async function signInWith(client) {
  const dc = await form(`${LOGIN}/${TENANT}/oauth2/v2.0/devicecode`, { client_id: client.id, scope: FLOW_SCOPE });
  if (dc.status !== 200 || !dc.json.device_code) {
    const why = describeHttp(dc, dc.json);
    if (APP_REFUSED.test(why)) return { refused: why };
    fail(`Microsoft sign-in is not available: ${why}`);
  }
  const url = dc.json.verification_uri || 'https://microsoft.com/devicelogin';
  console.log(`\n    ${c('1', 'Open')} ${c('1;36', url)} ${c('1', 'and enter the code')} ${c('1;33', dc.json.user_code)}`);
  console.log(`    Sign in with the account that sends the letters. Microsoft names the app "${client.name}". This window carries on by itself.\n`);
  record('INFO', `sign-in page ${url} through ${client.name} (code shown on screen)`);
  openUrl(url);
  const deadline = Date.now() + (dc.json.expires_in || 900) * 1000;
  let interval = (dc.json.interval || 5) * 1000;
  for (;;) {
    await sleep(interval);
    const t = await form(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: client.id, device_code: dc.json.device_code });
    if (t.status === 200 && t.json.access_token) {
      const who = claims(t.json.access_token);
      const tenant = who.tid || TENANT;
      const flowToken = t.json.access_token;
      const p = await form(`${LOGIN}/${tenant}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: client.id, refresh_token: t.json.refresh_token, scope: PAPPS_SCOPE });
      if (p.status !== 200) {
        const why = describeHttp(p, p.json);
        if (APP_REFUSED.test(why)) return { refused: `signed in, but refused access to connections: ${why}` };
        fail(`Signed in, but could not get access to connections: ${why}`);
      }
      const user = { email: who.upn || who.unique_name || who.preferred_username || '', name: who.name || '', tenant };
      saveSession(client, p.json.refresh_token || t.json.refresh_token, { ...user, objectId: who.oid || '' }, TENANT);
      ok(`signed in as ${user.name ? `${user.name} <${user.email}>` : user.email}${SESSION ? ' — kept for next time' : ''}`);
      return { ok: { user, flow: () => flowToken, papps: () => p.json.access_token } };
    }
    const code = t.json.error;
    if (code === 'authorization_pending') { if (Date.now() > deadline) fail('The sign-in code expired. Run setup again.'); continue; }
    if (code === 'slow_down') { interval += 5000; continue; }
    if (code === 'authorization_declined') fail('Sign-in was declined.');
    if (code === 'expired_token') fail('The sign-in code expired. Run setup again.');
    const why = describeHttp(t, t.json);
    if (APP_REFUSED.test(why)) return { refused: why };
    fail(`Sign-in failed: ${why}. If your organisation blocks sign-in with a code, use "Manual setup" in GO-LIVE.html (setup --manual).`);
  }
}

/* ---------------- helpers on flows ---------------- */

const validKey = (k) => typeof k === 'string' && !k.startsWith('__') && k.length >= 16;
const configOf = (def) => def?.actions?.Compose_Config?.inputs || null;
const withKey = (def, key) => { const d = structuredClone(def); d.actions.Compose_Config.inputs.operatorKey = key; return d; };
const withOrigin = (def, origin) => { const d = structuredClone(def); d.actions.Compose_Config.inputs.allowedOrigin = origin; return d; };

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (!['metadata', 'operationMetadataId'].includes(k)) out[k] = canon(v[k]);
    return out;
  }
  return v;
}
/* Settings in Compose_Config that belong to the package, not to the deployment: an upgrade always
   takes them from the package. "lists" is the SharePoint schema DGO_MAIL_PROVISION creates; keeping
   a 1.0 flow's own copy of it left the lists new in 2.0 uncreated on the real tenant. */
const PACKAGE_OWNED = ['endpointKey', 'flowIdentity', 'contractVersion', 'lists'];

/** The package-owned settings in which a flow differs from this package (e.g. ['lists']). */
function ownedDifferences(existing, ours) {
  const a = configOf(existing) || {};
  const b = configOf(ours) || {};
  return PACKAGE_OWNED.filter((k) => JSON.stringify(canon(a[k] ?? null)) !== JSON.stringify(canon(b[k] ?? null)));
}
/** The flow's logic, without any Compose_Config setting. */
function sameLogic(a, b) {
  const strip = (d) => { const x = structuredClone(d || {}); if (x.actions?.Compose_Config) x.actions.Compose_Config.inputs = {}; return JSON.stringify(canon(x)); };
  return strip(a) === strip(b);
}
/** Same as this package, except for the deployment's own settings (key, mailbox, origin, limits).
 *  The package-owned settings count: a flow on the current contract whose list schema is stale
 *  is NOT the same, and is brought up to date. */
const sameDefinition = (a, b) => sameLogic(a, b) && ownedDifferences(a, b).length === 0;

/** Ours, with the existing flow's own Compose_Config values kept (key, mailbox, limits). */
function mergedDefinition(ours, existing, key) {
  const d = structuredClone(ours);
  const mine = configOf(existing) || {};
  for (const [k, v] of Object.entries(mine)) if (k in d.actions.Compose_Config.inputs && !PACKAGE_OWNED.includes(k)) d.actions.Compose_Config.inputs[k] = v;
  d.actions.Compose_Config.inputs.operatorKey = key;
  return d;
}

/* The flows this package carries, as one short fingerprint. Written into mailer.html, so a later
   --refresh-mailer can tell whether the flows in Power Automate are this package's. */
const FLOWS_ID = crypto.createHash('sha256').update(JSON.stringify(FLOWS.map((f) => [f.name, f.definition]))).digest('hex').slice(0, 16);

/* ---------------- the run ---------------- */

/* --refresh-mailer: the app is new, the flows are not. The seven addresses come from the
   mailer.html setup wrote before (they are in no other file on the phone, and never in git). */
function publishedConfig(html) {
  /* bundle.mjs puts the configuration in a base64 data: script; read every one, and the page itself. */
  const text = [String(html), ...[...String(html).matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'))].join('\n');
  const cfg = text.match(/window\.DGO_MAILER_CONFIG_LOCAL = (\{.*?\});/);
  let endpoints = null;
  try { endpoints = cfg ? JSON.parse(cfg[1]).endpoints || null : null; } catch { /* stays null */ }
  return { endpoints, version: text.match(/window\.DGO_MAILER_VERSION = "([^"]*)"/)?.[1] || '', flows: text.match(/window\.DGO_MAILER_FLOWS = "([^"]*)"/)?.[1] || '' };
}

async function refreshMailer() {
  console.log(c('1', 'DGO Correspondence Mailer — refresh mailer.html (no sign-in; the flows and SharePoint are not touched)'));
  record('INFO', `DGO Correspondence Mailer refresh ${new Date().toISOString()}`);
  const target = path.join(PUBLISH_DIR, 'mailer.html');
  step('Reading the flow addresses from the mailer.html setup wrote before');
  if (!fs.existsSync(target)) fail(`${target} does not exist. Run setup without --refresh-mailer: it signs in and writes mailer.html.`);
  const old = fs.readFileSync(target, 'utf8');
  const { endpoints, version: was0, flows: flowsWas } = publishedConfig(old);
  /* A trigger URL is https; loopback http is the test harness's stand-in. */
  const missing = FLOWS.filter((f) => !/^(https:\/\/|http:\/\/127\.0\.0\.1[:/])[^\s"']+$/.test(endpoints?.[f.key] || ''));
  if (missing.length) fail(`${target} does not hold the address of ${missing.map((f) => f.name).join(', ')}. Run setup without --refresh-mailer.`);
  const was = was0 || 'unknown';
  ok(`all ${FLOWS.length} flow addresses found (the file was version ${was})`);
  /* This app expects this package's flows. When the flows were last set up from another package
     (the file names no flows, or other ones), the refresh would publish an app that talks to
     flows it does not match; full setup is needed instead. */
  if (flowsWas !== FLOWS_ID) {
    fail(`The flows in Power Automate were set up from ${flowsWas ? 'another package' : 'an earlier package (version ' + was + ')'}, and this package's flows differ. `
      + 'A refresh only replaces the app. Run full setup instead: node tools/setup.mjs --plan --update-flows, then node tools/setup.mjs --update-flows. Nothing was written.');
  }
  ok('the flows in Power Automate are this package\'s');
  step('Writing the mailer, ready to publish');
  const { bundleMailer } = await import(pathToFileURL(path.join(HERE, 'bundle.mjs')).href);
  const version = fs.readFileSync(path.join(WEB, 'VERSION'), 'utf8').trim();
  const html = bundleMailer(WEB, { endpoints, version, flows: FLOWS_ID });
  if (JSON.stringify(publishedConfig(html).endpoints) !== JSON.stringify(endpoints)) fail('The new mailer.html does not carry the same flow addresses. Nothing was written.');
  fs.writeFileSync(path.join(PUBLISH_DIR, `mailer-${was}.html`), old);
  fs.writeFileSync(target, html);
  ok(`mailer.html written: ${target} (${Math.round(html.length / 1024)} KB, version ${version}, the same ${FLOWS.length} flow addresses, no key)`);
  ok(`the previous file is kept beside it as mailer-${was}.html`);
  info(`Publish it: upload mailer.html into the folder that holds the platform's index.html on ${ORIGIN}, replacing the old one`);
  return { refreshed: target };
}

/* ---------- --export-flows / --restore-flows ---------- */

const stampNow = () => new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
/** A GUID for a label; each export names its package resources afresh. */
const randomGuid = () => crypto.randomUUID();
const writePrivate = (file, data) => { fs.writeFileSync(file, data, { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch { /* not on every file system */ } };

function exportReadme(when, env, names) {
  return [
    'DGO Correspondence Mailer — the seven DGO_MAIL flows, exported ' + when,
    `Environment: ${env.properties?.displayName || env.name} (${env.name})`,
    '',
    'KEEP THIS FILE PRIVATE. Every flow carries the admin key in its Compose_Config. Do not email',
    'it, upload it to a website or paste it into a chat.',
    '',
    'packages/<FLOW>.zip   One importable package per flow. In make.powerautomate.com: My flows →',
    '                      Import → Import Package (Legacy) → Upload → choose the .zip. For each',
    '                      connection row tap "Select during import" and pick the sending account\'s',
    '                      SharePoint / Office 365 Outlook connection, then Import.',
    'flows-backup.json     All the flows as they were: definition, connections, on/off.',
    '                      Put them back exactly with:',
    '                        node tools/setup.mjs --restore-flows <this .zip>',
    '',
    'Flows: ' + names.join(', '),
    '',
  ].join('\n');
}

async function exportFlows(found, env) {
  step('Exporting the flows');
  const names = FLOWS.map((f) => f.name).filter((n) => found[n]);
  if (!names.length) fail('None of the seven DGO_MAIL flows is in this environment, so there is nothing to export.');
  const when = new Date().toISOString();
  const { buildZip } = await import(pathToFileURL(path.join(HERE, 'zip-writer.mjs')).href);
  const { flowPackageEntries } = await import(pathToFileURL(path.join(HERE, 'flow-package.mjs')).href);
  const backup = { kind: 'dgo-mail-flows-backup', exportedAt: when, environment: env.name, flows: {} };
  const entries = [];
  for (const n of names) {
    const d = found[n];
    const p = d.properties;
    backup.flows[n] = { flowId: d.name, state: p.state, properties: { displayName: p.displayName || n, definition: p.definition, connectionReferences: p.connectionReferences || {} } };
    const members = flowPackageEntries({
      name: n,
      description: p.definition?.description || '',
      definition: p.definition,
      connectionReferences: p.connectionReferences || {},
      guid: randomGuid,
      createdTime: when,
      creator: 'DGO Correspondence Mailer setup --export-flows',
      sourceEnvironment: env.name,
    });
    entries.push({ name: `packages/${n}.zip`, data: buildZip(members) });
    ok(`${n}: packaged (${p.state === 'Started' ? 'on' : p.state}; ${Object.keys(p.connectionReferences || {}).length} connection(s))`);
  }
  entries.push({ name: 'flows-backup.json', data: `${JSON.stringify(backup, null, 2)}\n` });
  entries.push({ name: 'README.txt', data: exportReadme(when, env, names) });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const file = path.join(EXPORT_DIR, `dgo-mail-flows-${stampNow()}.zip`);
  writePrivate(file, buildZip(entries));
  ok(`${names.length} flow(s) exported in one file: ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  info('It holds packages/<FLOW>.zip (importable), flows-backup.json (restorable) and README.txt.');
  warn('It carries the admin key: keep it private — do not email it, upload it or paste it anywhere.');
  return { exported: file };
}

/** The backup inside an export .zip, or a flows-backup.json on its own. */
function readFlowBackup(file) {
  if (!file || file.startsWith('--')) { console.log('Name the export to restore: node tools/setup.mjs --restore-flows <dgo-mail-flows-….zip>'); throw new Stop('no file named'); }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) { console.log(`${abs} does not exist.`); throw new Stop('file not found'); }
  let text;
  if (/\.zip$/i.test(abs)) {
    const zipped = readZipMember(abs, 'flows-backup.json');
    if (zipped === null) { console.log(`${abs} has no flows-backup.json: it is not an export made with --export-flows.`); throw new Stop('not an export'); }
    text = zipped;
  } else text = fs.readFileSync(abs, 'utf8');
  let b;
  try { b = JSON.parse(text); } catch { console.log(`${abs}: flows-backup.json is not valid JSON.`); throw new Stop('bad json'); }
  if (b?.kind !== 'dgo-mail-flows-backup' || !b.flows || !Object.keys(b.flows).length) { console.log(`${abs} is not an export made with --export-flows.`); throw new Stop('not an export'); }
  const unknown = Object.keys(b.flows).filter((n) => !FLOWS.some((f) => f.name === n));
  if (unknown.length) { console.log(`${abs} holds flows that are not the mailer's: ${unknown.join(', ')}.`); throw new Stop('not ours'); }
  return b;
}

/** One member of a zip (deflate or stored), as text; null when absent. Standard library only. */
function readZipMember(file, wanted) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + size);
      return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function restoreFlows({ backup, found, env, E, flowApi, refsFor }) {
  if (backup.environment && backup.environment !== env.name) fail(`The export is from environment ${backup.environment}, not ${env.name}. Nothing was changed.`);
  step('Saving the flows as they are now, before restoring');
  const before = { kind: 'dgo-mail-flows-backup', exportedAt: new Date().toISOString(), environment: env.name, flows: {} };
  for (const [n, d] of Object.entries(found)) before.flows[n] = { flowId: d.name, state: d.properties.state, properties: { displayName: d.properties.displayName || n, definition: d.properties.definition, connectionReferences: d.properties.connectionReferences || {} } };
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const beforeFile = path.join(EXPORT_DIR, `flows-before-restore-${stampNow()}.json`);
  writePrivate(beforeFile, `${JSON.stringify(before, null, 2)}\n`);
  ok(`saved: ${beforeFile}`);

  step('Restoring the flows');
  const same = (a, b) => JSON.stringify(canon(a || {})) === JSON.stringify(canon(b || {}));
  let created = 0;
  for (const f of FLOWS) {
    const b = backup.flows[f.name];
    if (!b) { info(`${f.name}: not in the export — left as it is`); continue; }
    const want = b.properties.definition;
    const refs = refsFor(f, b.properties.connectionReferences);
    const cur = found[f.name];
    if (cur && same(cur.properties.definition, want) && f.apis.every((a) => cur.properties.connectionReferences?.[`shared_${a}`]?.connectionName === refs[`shared_${a}`].connectionName)) {
      ok(`${f.name}: already exactly as in the export`);
      continue;
    }
    let id;
    try {
      if (cur) {
        await flowApi('PATCH', `${E}/flows/${cur.name}?${API_VERSION}`, { properties: { displayName: f.name, definition: want, connectionReferences: refs, state: cur.properties.state } });
        id = cur.name;
      } else {
        const made = await flowApi('POST', `${E}/flows?${API_VERSION}`, { properties: { displayName: f.name, definition: want, connectionReferences: refs, state: b.state === 'Started' ? 'Started' : 'Stopped' } });
        id = made?.name;
        created++;
      }
    } catch (e) { fail(`${f.name}: could not be restored: ${e.message}. Flows restored before it stay restored; ${beforeFile} holds how they were.`); }
    let back;
    try { back = await flowApi('GET', `${E}/flows/${id}?${API_VERSION}`); } catch (e) { fail(`${f.name}: restored, but could not be read back: ${e.message}`); }
    if (!same(back?.properties?.definition, want)) fail(`${f.name}: read back differently from the export. ${beforeFile} holds how it was before.`);
    ok(`${f.name}: ${cur ? 'restored' : 'created from the export'} and read back identical${b.properties.connectionReferences && refs && f.apis.some((a) => b.properties.connectionReferences[`shared_${a}`]?.connectionName !== refs[`shared_${a}`].connectionName) ? ' (a connection in the export no longer works; bound to a working one)' : ''}`);
  }
  if (created) warn(`${created} flow(s) were created anew, so their trigger addresses are new: run node tools/setup.mjs (no option) to write mailer.html with them, then upload it.`);
  return { restored: true };
}

/* --manual: the seven flows were imported by hand, each given the same admin key and the
   mailer's origin in Compose_Config, and turned on; their trigger URLs are in a file. No
   Microsoft sign-in: steps 7 and 8 run with that key. */
async function manualSetup() {
  console.log(c('1', 'DGO Correspondence Mailer — manual setup (no Microsoft sign-in; the flows were imported by hand)'));
  record('INFO', `DGO Correspondence Mailer manual setup ${new Date().toISOString()}`);
  step('Reading the flow addresses, the key and the first operator');
  const file = arg('--endpoints', '');
  if (!file || !fs.existsSync(file)) fail(`--endpoints must name the file that holds the seven trigger URLs (got "${file}").`);
  const text = fs.readFileSync(file, 'utf8');
  const endpoints = {};
  for (const m of text.matchAll(/\b(MAIL_[A-Z]+)\s*[:=]\s*['"]?((?:https:\/\/|http:\/\/127\.0\.0\.1[:/])[^'"\s,]+)/g)) endpoints[m[1]] = m[2];
  const missing = FLOWS.filter((f) => !endpoints[f.key]);
  if (missing.length) fail(`${file} does not hold the trigger URL of ${missing.map((f) => `${f.key} (${f.name})`).join(', ')}. Write one line per flow: MAIL_SEND=https://…`);
  ok(`all ${FLOWS.length} trigger URLs read from ${file}`);
  const key = arg('--key', '');
  if (!validKey(key)) fail('--key must be the admin key you set in every flow\'s Compose_Config operatorKey: 16 or more characters, not starting with "__".');
  ok('an admin key was given (it is not written anywhere)');
  const email = String(arg('--operator', '')).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('--operator must be the email address of the first admin operator (the account that signs in to the mailer).');
  ok(`the first admin operator will be ${email}`);
  const runsOf = async () => 'open this flow\'s Run history in Power Automate to see which step failed (manual setup cannot read it)';
  return finishSetup({ endpoints, key, user: { email, name: arg('--name', '') }, runsOf });
}

async function main() {
  if (REFRESH) return refreshMailer();
  if (MANUAL) return manualSetup();
  let restoreFrom = null;
  if (RESTORE) restoreFrom = readFlowBackup(RESTORE_FILE); // a wrong file stops before any sign-in
  const title = EXPORT ? 'export the seven flows (read only: nothing in the tenant changes)'
    : RESTORE ? `restore the seven flows from ${path.basename(RESTORE_FILE)}`
    : `automatic setup${PLAN ? ' (plan only: nothing will be changed)' : ''}`;
  console.log(c('1', `DGO Correspondence Mailer — ${title}`));
  if (!EXPORT && !RESTORE) info(`the mailer will be published at ${ORIGIN}/mailer.html — only ${ORIGIN} may read the flows' answers`);
  record('INFO', `DGO Correspondence Mailer setup ${new Date().toISOString()}${PLAN ? ' (plan only)' : ''}`);
  const auth = await signIn();
  const flowApi = api(auth.flow);
  const pappsApi = api(auth.papps);

  /* 2. environment */
  step('Finding the Power Automate environment');
  const wanted = configOf(FLOWS[0].definition)?.environment;
  let envs;
  try { envs = await all(flowApi, `${FLOW}/providers/Microsoft.ProcessSimple/environments?${API_VERSION}`); }
  catch (e) { fail(`Could not list environments: ${e.message}`); }
  const env = envs.find((e) => e.name === wanted) || envs.find((e) => e.properties?.isDefault);
  if (!env) fail(`No environment ${wanted} and no default environment is available to this account.`);
  ok(`${env.properties?.displayName || env.name} (${env.name})${env.name === wanted ? '' : ` — not ${wanted}, which this account cannot see`}`);
  const E = `${FLOW}/providers/Microsoft.ProcessSimple/environments/${env.name}`;

  /* 3. flows */
  step(`Finding the ${FLOWS.length} flows`);
  let listed;
  try { listed = await all(flowApi, `${E}/flows?${API_VERSION}`); } catch (e) { fail(`Could not list flows: ${e.message}`); }
  const found = {};
  for (const f of FLOWS) {
    const matches = listed.filter((x) => x.properties?.displayName === f.name);
    if (matches.length > 1) warn(`${f.name}: ${matches.length} flows have this name; using the most recently changed one. Delete the others to avoid confusion.`);
    const pick = matches.sort((a, b) => String(b.properties?.lastModifiedTime || '').localeCompare(String(a.properties?.lastModifiedTime || '')))[0];
    if (!pick) { info(`${f.name}: not in this environment${EXPORT ? ' — nothing to export for it' : RESTORE ? (restoreFrom.flows[f.name] ? ' — it will be created from the export' : '') : ' — it will be created'}`); continue; }
    let detail;
    try { detail = await flowApi('GET', `${E}/flows/${pick.name}?${API_VERSION}`); } catch (e) { fail(`${f.name}: could not read it: ${e.message}`); }
    if (!detail?.properties?.definition) {
      try { detail = await flowApi('GET', `${E}/flows/${pick.name}?${API_VERSION}&$expand=properties.definition,properties.connectionReferences`); } catch { /* */ }
    }
    if (!detail?.properties?.definition) fail(`${f.name}: its definition could not be read, so its key cannot be checked. Is it shared with this account as an owner?`);
    found[f.name] = detail;
    const same = sameDefinition(detail.properties.definition, f.definition);
    ok(`${f.name}: found, ${detail.properties.state === 'Started' ? 'on' : `state ${detail.properties.state}`}, ${same ? 'matches this package' : 'differs from this package'}`);
  }

  if (EXPORT) return exportFlows(found, env);

  /* 4. operator key */
  step('Settling the admin key (never given to browsers)');
  const keys = Object.values(found).map((d) => configOf(d.properties.definition)?.operatorKey).filter(validKey);
  const tally = keys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
  let key = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (ROTATE || !key) {
    key = crypto.randomBytes(24).toString('base64url');
    ok(ROTATE ? 'a new key was generated (--rotate-key); every flow gets it' : 'no flow has a key yet; a new random 32-character key was generated');
  } else {
    ok(`the flows already share a key (${keys.length} of ${Object.keys(found).length} found flows hold it); it is kept`);
  }
  if (tally.size > 1 && !ROTATE) warn(`${tally.size} different keys were found; every flow is given the most common one`);

  /* 5. connections */
  step('Checking the connections');
  const neededApis = [...new Set(FLOWS.flatMap((f) => f.apis))];
  const conns = {};
  for (const a of neededApis) {
    let list = [];
    try { list = await all(pappsApi, `${PAPPS}/providers/Microsoft.PowerApps/apis/shared_${a}/connections?${API_VERSION}&$filter=${encodeURIComponent(`environment eq '${env.name}'`)}`); }
    catch (e) { warn(`could not list ${a} connections: ${e.message}`); }
    const connected = list.filter((x) => (x.properties?.statuses || []).some((s) => s.status === 'Connected'));
    const mine = connected.filter((x) => [x.properties?.createdBy?.userPrincipalName, x.properties?.createdBy?.email].map((s) => String(s || '').toLowerCase()).includes(auth.user.email.toLowerCase()));
    conns[a] = { all: list, best: (mine[0] || connected[0]) || null };
    if (conns[a].best) ok(`${a}: using “${conns[a].best.properties?.displayName || conns[a].best.name}”${mine.length ? '' : ' (not created by this account)'}`);
    else warn(`${a}: no working connection for this account in this environment`);
  }
  const connOk = (a, name) => conns[a].all.some((x) => x.name === name && (x.properties?.statuses || []).some((s) => s.status === 'Connected'));
  const refsFor = (f, existing) => {
    const refs = {};
    for (const a of f.apis) {
      const cur = existing?.[`shared_${a}`];
      const keep = cur?.connectionName && connOk(a, cur.connectionName);
      const name = keep ? cur.connectionName : conns[a].best?.name;
      if (!name) {
        fail(`No working ${a === 'office365' ? 'Office 365 Outlook' : a === 'sharepointonline' ? 'SharePoint' : a} connection. Create one: open https://make.powerautomate.com/environments/${env.name}/connections, select + New connection, choose it and sign in as ${auth.user.email}. Then run setup again.`);
      }
      refs[`shared_${a}`] = { connectionName: name, source: 'Embedded', id: `/providers/Microsoft.PowerApps/apis/shared_${a}`, tier: 'NotSpecified' };
    }
    return refs;
  };

  if (RESTORE) return restoreFlows({ backup: restoreFrom, found, env, E, flowApi, refsFor });

  /* 6. create / repair / start, then URLs */
  step(PLAN ? 'What would change in the flows' : 'Creating, repairing and starting the flows');
  const endpoints = {};
  for (const f of FLOWS) {
    const cur = found[f.name];
    if (!cur) {
      if (PLAN) { info(`${f.name}: would be created, with the key and connections set`); continue; }
      const refs = refsFor(f, null);
      let made;
      try {
        made = await flowApi('POST', `${E}/flows?${API_VERSION}`, { properties: { displayName: f.name, definition: withOrigin(withKey(f.definition, key), ORIGIN), connectionReferences: refs, state: 'Started' } });
      } catch (e) {
        fail(`${f.name}: Power Automate refused to create it: ${e.message}${/premium|licen/i.test(e.message) ? ' — the account needs a Power Automate Premium licence for the HTTP trigger.' : /dlp|policy/i.test(e.message) ? ' — a data loss prevention policy blocks this combination of connectors.' : ''}`);
      }
      found[f.name] = made;
      ok(`${f.name}: created and turned on`);
    } else {
      const def = cur.properties.definition;
      const changes = [];
      let next = def;
      const theirs = configOf(def)?.contractVersion;
      const ours = configOf(f.definition)?.contractVersion;
      const outdated = theirs !== ours;
      /* Package-owned settings (the list schema above all) are always brought up to date: they
         are the package's, not the deployment's, and a stale copy leaves lists uncreated. */
      const owned = ownedDifferences(def, f.definition);
      const logic = !sameLogic(def, f.definition);
      if (outdated || (UPDATE && logic) || owned.length) {
        next = mergedDefinition(f.definition, def, key);
        if (outdated) changes.push(`upgraded from contract ${theirs || 'unknown'} to ${ours} (sign-in with a mailed code); its own settings kept`);
        else {
          if (UPDATE && logic) changes.push('definition brought up to this package; its own settings kept');
          if (owned.length) changes.push(`package settings brought up to this package: ${owned.join(', ')}`);
        }
      }
      if (configOf(next)?.operatorKey !== key) { next = withKey(next, key); changes.push('admin key set'); }
      if (configOf(next)?.allowedOrigin !== ORIGIN) { next = withOrigin(next, ORIGIN); changes.push(`only ${ORIGIN} may read its answers`); }
      const refs = refsFor(f, cur.properties.connectionReferences);
      const refsChanged = f.apis.some((a) => cur.properties.connectionReferences?.[`shared_${a}`]?.connectionName !== refs[`shared_${a}`].connectionName);
      if (refsChanged) changes.push('connections re-bound to working ones');
      if (changes.length) {
        if (PLAN) info(`${f.name}: would change — ${changes.join('; ')}`);
        else {
          try { found[f.name] = await flowApi('PATCH', `${E}/flows/${cur.name}?${API_VERSION}`, { properties: { displayName: f.name, definition: next, connectionReferences: refs, state: cur.properties.state } }); }
          catch (e) { fail(`${f.name}: could not be updated: ${e.message}`); }
          ok(`${f.name}: ${changes.join('; ')}`);
        }
      } else ok(`${f.name}: nothing to change`);
      if (logic && !UPDATE && !outdated) info(`${f.name}: its definition differs from this package; it is left as it is (run with --update-flows to replace it, keeping its settings)`);
    }
    if (PLAN) continue;
    const id = found[f.name].name;
    if (found[f.name].properties?.state !== 'Started') {
      try { await flowApi('POST', `${E}/flows/${id}/start?${API_VERSION}`); ok(`${f.name}: turned on`); } catch (e) { fail(`${f.name}: could not be turned on: ${e.message}`); }
    }
    let cb;
    try { cb = await flowApi('POST', `${E}/flows/${id}/triggers/manual/listCallbackUrl?${API_VERSION}`); } catch (e) { fail(`${f.name}: could not read its trigger URL: ${e.message}`); }
    const url = cb?.response?.value || cb?.value;
    if (!url) fail(`${f.name}: Power Automate returned no trigger URL.`);
    endpoints[f.key] = url;
    ok(`${f.name}: trigger URL read (${hostOf(url)})`);
  }
  if (PLAN) { step('Plan complete'); info('Run setup without --plan to apply this.'); return { plan: true }; }

  return finishSetup({ endpoints, key, user: auth.user, runsOf: (flowName, runId) => lastRunOf(flowApi, E, found[flowName].name, runId) });
}

/** How a flow's run failed, from Power Automate's run history (full setup only). */
async function lastRunOf(flowApi, E, id, runId = '') {
  try {
    let run = null;
    if (runId) { try { run = await flowApi('GET', `${E}/flows/${id}/runs/${runId}?${API_VERSION}`); } catch { run = null; } }
    const own = Boolean(run);
    if (!run) run = (await flowApi('GET', `${E}/flows/${id}/runs?${API_VERSION}&$top=1`))?.value?.[0];
    if (!run) return 'no run of it is recorded, so the call never started it';
    let steps = [];
    try { steps = (await flowApi('GET', `${E}/flows/${id}/runs/${run.name}/actions?${API_VERSION}`))?.value || []; } catch (e) { steps = []; record('WARN', `run steps not readable: ${e.message}`); }
    const failed = steps.filter((x) => ['Failed', 'TimedOut'].includes(x.properties?.status))
      .map((x) => `${x.name}: ${[x.properties?.error?.code || x.properties?.code, x.properties?.error?.message].filter(Boolean).join(' — ')}`.replace(/\s+/g, ' ').slice(0, 700));
    const e = run.properties?.error;
    const which = own ? `the run of this call (${run.name})` : 'latest run (not necessarily this call\'s: its answer named no run)';
    return `${which} ${run.properties?.status || ''}${e ? ` (${[e.code, e.message].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 300)})` : ''}${failed.length ? `; failed step: ${failed.join(' | ')}` : ''}`;
  } catch (e) { return `its run history could not be read: ${e.message}`; }
}

/* Steps 7 and 8, for full setup and for --manual: check the flows, provision SharePoint, fill the
   shared lists, add the first operator, write mailer.html. `runsOf(flowName, runId)` explains a
   failed call from the flow's run history. */
async function finishSetup({ endpoints, key, user, runsOf }) {
  /* 7. checks and SharePoint */
  step(`Checking all ${FLOWS.length} flows over HTTP`);
  const settings = { endpoints, operatorKey: key, operator: { email: user.email, name: user.name } };
  /* A flow saved moments ago can take a minute or two before its trigger answers, so each
     flow is asked again every 15 seconds for up to 3 minutes before anything is called failed. */
  const answer = (r) => {
    const res = r.res || {};
    if (!res.reached) return `no answer (${res.error || 'network'})`;
    const e = res.json?.error;
    const text = e ? `${e.code || ''}${e.message ? `: ${e.message}` : ''}` : String(res.raw || '').replace(/\s+/g, ' ').slice(0, 300);
    return `HTTP ${res.status}${text ? ` — ${text}` : ''}`;
  };
  const results = new Map();
  const deadline = Date.now() + CHECK_WINDOW_MS;
  /* Every flow, and both checks of each, are asked at once: a round takes as long as its slowest
     call (at most a minute), not the sum of fourteen, so the 3-minute window holds. */
  for (let round = 1; ; round++) {
    await Promise.all(FLOWS.filter((f) => !results.get(f.key)?.good).map(async (f) => {
      const [h, v] = await Promise.all([health(settings, f.key), verify(settings, f.key)]);
      results.set(f.key, { good: h.verdict === 'healthy' && v.verdict === 'verified', h, v });
    }));
    const waiting = FLOWS.filter((f) => !results.get(f.key).good);
    if (!waiting.length || Date.now() + CHECK_INTERVAL_MS > deadline) break;
    if (round === 1) info(`${FLOWS.length - waiting.length} of ${FLOWS.length} answering; waiting up to 3 minutes for the rest to activate`);
    await sleep(CHECK_INTERVAL_MS);
  }
  /* For a call that failed, the run it started says which step failed and why. The run is the
     call's own when the answer named it (x-ms-workflow-run-id, or runId in the envelope);
     otherwise the flow's latest run is shown, and said to be only the latest. */
  /** Call one operation; on failure, stop and name the step of the flow's run that failed. */
  const opOrFail = (flowName, key, operation, payload, message, opts) => op(settings, key, operation, payload, opts)
    .catch(async (e) => fail(`${message}: ${e.message}; ${await runsOf(flowName, e.res?.runId)}`));
  let bad = 0;
  for (const f of FLOWS) {
    const { good, h, v } = results.get(f.key);
    if (good) { ok(`${f.key}: healthy, verified`); continue; }
    bad++;
    warn(`${f.key}: health check ${h.verdict} (${answer(h)}); identity check ${v.verdict} (${answer(v)})`);
    const failing = h.verdict !== 'healthy' ? h : v;
    warn(`${f.key}: ${await runsOf(f.name, failing.res?.runId)}`);
  }
  if (bad) fail(`${bad} flow(s) still did not pass after 3 minutes. Copy everything above and send it to Claude.`);

  step('Creating or completing the SharePoint lists and library');
  const plan = await opOrFail('DGO_MAIL_PROVISION', 'MAIL_PROVISION', 'provision', {}, 'The key was not accepted, or SharePoint could not be reached', { validationOnly: true, timeoutMs: 240000 });
  ok('the admin key is accepted by the flows');
  const expectedLists = (configOf(FLOWS.find((f) => f.key === 'MAIL_PROVISION').definition)?.lists || []).map((l) => l.title);
  const unknown = expectedLists.filter((t) => !(plan?.lists || []).some((l) => l.list === t));
  if (unknown.length) fail(`DGO_MAIL_PROVISION does not check ${unknown.join(', ')}, although setup has just brought its list schema up to this package. Copy everything above and send it to Claude.`);
  /* Incomplete: missing, missing columns, meant to be private and not yet, or Title/Created not
     yet indexed (every look-up is by Title; past 5,000 rows an unindexed one is refused). */
  const incomplete = (l) => !l.existed || (l.missingFields || []).length || (l.private && l.isPrivate === false) || l.indexed === false;
  const todo = (plan?.lists || []).filter(incomplete);
  if (todo.length) {
    const done = await opOrFail('DGO_MAIL_PROVISION', 'MAIL_PROVISION', 'provision', {}, 'Provisioning failed', { timeoutMs: 240000 });
    for (const l of done?.lists || []) {
      const missing = (l.missingFields || []).map((f) => f.name);
      const privacy = l.private ? (l.isPrivate === false ? '; NOT private' : '; private to the flow owner') : '';
      const index = l.indexed === false ? '; Title NOT indexed' : l.indexed === true ? '; Title and Created indexed' : '';
      ok(`${l.list}: ${l.existed ? 'exists' : l.created ? 'created' : 'not created'}${missing.length ? `; ${l.fieldsCreated ?? missing.length} column(s) added` : '; all columns present'}${privacy}${index}`);
    }
    const again = await opOrFail('DGO_MAIL_PROVISION', 'MAIL_PROVISION', 'provision', {}, 'Could not re-check the lists', { validationOnly: true, timeoutMs: 240000 });
    const left = (again?.lists || []).filter(incomplete);
    if (left.length) fail(`Still incomplete after provisioning: ${left.map((l) => `${l.list}${l.private && l.isPrivate === false ? ' (not private)' : ''}${l.indexed === false ? ' (not indexed)' : ''}`).join(', ')}. The run history of DGO_MAIL_PROVISION shows why (often: the account cannot create lists on the site, or cannot change their permissions).`);
  } else ok('every list and the library exist with every column, indexed, and the private ones are private');

  step('Filling the shared directory and templates');
  const dir = await opOrFail('DGO_MAIL_DIRECTORY', 'MAIL_DIRECTORY', 'list', {}, 'Could not read the directory list');
  if ((dir?.items || []).length) ok(`the directory list already has ${dir.items.length} entries; left as it is`);
  else {
    let n = 0;
    for (const r of SEED_DIRECTORY) {
      await op(settings, 'MAIL_DIRECTORY', 'upsert', { record: { key: r.key, institution: r.institution, addressee: r.addressee, email: r.email, cc: r.cc || [], website: r.website, verification: r.verification, salutation: r.salutation, category: r.category, active: r.active !== false, notes: r.notes || '', sortOrder: r.sortOrder ?? 99 } })
        .then(() => n++, (e) => warn(`${r.key}: ${e.message}`));
    }
    ok(`${n} of ${SEED_DIRECTORY.length} institutions from the mailing guide written to the directory list`);
  }
  const tpl = await opOrFail('DGO_MAIL_TEMPLATES', 'MAIL_TEMPLATES', 'list', {}, 'Could not read the templates list');
  if ((tpl?.items || []).length) ok(`the templates list already has ${tpl.items.length} template(s); left as it is`);
  else {
    let n = 0;
    const own = SEED_TEMPLATES.filter((t) => t.kind !== 'letterhead');
    for (const t of own) {
      await op(settings, 'MAIL_TEMPLATES', 'upsert', { template: { key: t.key, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, description: t.description || '', updatedBy: user.email } })
        .then(() => n++, (e) => warn(`${t.key}: ${e.message}`));
    }
    ok(`${n} of ${own.length} mailer templates written to the templates list`);
  }

  step('Making you the first admin operator');
  const operators = (await opOrFail('DGO_MAIL_AUTH', 'MAIL_AUTH', 'listOperators', {}, 'Could not read the operator list'))?.items || [];
  const me = operators.find((o) => String(o.email).toLowerCase() === user.email.toLowerCase());
  if (me && me.active !== false && me.role === 'admin') ok(`${user.email} is already an admin operator (${operators.length} operator(s) in all)`);
  else {
    await opOrFail('DGO_MAIL_AUTH', 'MAIL_AUTH', 'upsertOperator', { operator: { email: user.email, name: user.name, role: 'admin', active: true } }, 'Could not add you as an operator');
    ok(`${user.email} added as an admin operator: you can sign in, and add others in the mailer's Settings → Operators`);
  }

  /* 8. publish: one self-contained file */
  step('Writing the mailer, ready to publish');
  const { bundleMailer } = await import(pathToFileURL(path.join(HERE, 'bundle.mjs')).href);
  const version = fs.readFileSync(path.join(WEB, 'VERSION'), 'utf8').trim();
  const html = bundleMailer(WEB, { endpoints, version, flows: FLOWS_ID });
  fs.rmSync(PUBLISH_DIR, { recursive: true, force: true });
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  const target = path.join(PUBLISH_DIR, 'mailer.html');
  fs.writeFileSync(target, html);
  ok(`mailer.html written: ${target} (${Math.round(html.length / 1024)} KB — the whole mailer and its seven flow addresses in one file, no key)`);
  info(`Publish it: upload mailer.html into the folder that holds the platform's index.html on ${ORIGIN}`);
  info(`It then opens at ${ORIGIN}/mailer.html — sign in there as ${user.email} with the code mailed to you.`);
  return { endpoints, published: target };
}

let exitCode = 0;
try {
  const result = await main();
  console.log(`\n${c('1;32', result?.plan ? 'Plan complete. Nothing was changed.' : result?.refreshed ? 'Refresh complete.' : result?.exported ? 'Export complete. Nothing in the tenant was changed.' : result?.restored ? 'Restore complete.' : 'Setup complete.')}`);
} catch (e) {
  exitCode = 1;
  if (!(e instanceof Stop)) { console.log(`    ${c('1;31', '✗')} ${e.message}`); record('FAIL', e.message); }
  console.log(`\n${c('1;31', 'Setup stopped.')} Nothing after the failed step was changed. Fix what it says, then run setup again — it picks up where it stopped.`);
}
try {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  console.log(`Report (no secrets in it): ${REPORT_PATH}`);
} catch { /* the console has it all */ }
process.exit(exitCode);
