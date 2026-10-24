#!/usr/bin/env node
/**
 * Folio Administration in one step: the Central Administration Centre and the Folio Vault, started, configured,
 * filled and opened.
 *
 *   node scripts/folio-admin.mjs [--no-browser] [--no-vault-fill]
 *
 * The Administrator Toolkit's "Start Folio Administration" runs this; from the source it is `npm run admin`.
 * Each run, without a question after the first:
 *
 *   1. checks Node.js 22+ and Python 3.11+, and names the Python it found to the launcher (DGO_PYTHON);
 *   2. keeps everything in one private data folder (FOLIO_TOOLS_DATA, default ~/NITDA-Folio-Tools-Data):
 *        Vault/                    the Vault's registry and its two tokens
 *        Administration-Centre/    the Centre's database, its token, backups and evidence
 *        Microsoft/session.json    the flow owner's Microsoft sign-in, kept (refresh token only, 0600)
 *        operator.json             the accountable name recorded on every change, asked once
 *      and points the Centre at the Vault's tokens and the kept sign-in, so nothing is copied by hand;
 *   3. starts the Vault and the Centre (scripts/run-platform.mjs capsule centre), or finds them already running;
 *   4. opens the Centre in the browser already unlocked, through a one-time link (App.redeem_launch in
 *      tools/admin-centre/server.py): no token to paste;
 *   5. signs the Centre in to the tenant as the flow owner: a Microsoft device code the first time, then never again
 *      while the kept sign-in lasts (Microsoft ends it after 90 days unused, on a password change, or by policy);
 *   6. fills the Vault: reads every Folio endpoint's signed address live from the tenant (scripts/lib/config-drift.mjs,
 *      the read config:rebuild makes) and holds each one whose flow passes the identity handshake under its alias.
 *      An address the Vault already holds unchanged is left alone, so a restart costs only the read.
 *
 * Nothing is printed that is a signed address or a token. Ctrl-C stops what this started.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { keyPlan, readLive } from './lib/config-drift.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const DATA = path.resolve(process.env.FOLIO_TOOLS_DATA || path.join(os.homedir(), 'NITDA-Folio-Tools-Data'));
const D = {
  vault: path.join(DATA, 'Vault'),
  centre: path.join(DATA, 'Administration-Centre'),
  session: path.join(DATA, 'Microsoft', 'session.json'),
  operator: path.join(DATA, 'operator.json'),
};
const SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/admin-centre/config/settings.json'), 'utf8'));
const CENTRE = `http://127.0.0.1:${process.env.FOLIO_ADMIN_PORT || SETTINGS.port}`;
const VAULT = String(SETTINGS.vaultUrl).replace(/\/+$/, '');
const ENV_ID = SETTINGS.environmentId;
const TENANT = process.env.FOLIO_ADMIN_TENANT || (/^Default-([0-9a-f-]{36})$/.exec(ENV_ID) || [])[1] || 'organizations';
const LOGIN = String(process.env.FOLIO_ADMIN_LOGIN || SETTINGS.loginBase).replace(/\/+$/, '');
const FLOW_API = String(process.env.FOLIO_ADMIN_FLOW_API || SETTINGS.flowApiBase).replace(/\/+$/, '');
const ADOPTION = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json');
const LAUNCH_MINUTES = 10;   /* the Centre accepts at most 15 (LAUNCH_MAX_MINUTES) */
/* A Vault alias is <system code>.<contract key, lower case, underscores as hyphens> (server.py vault_alias_for). */
const SYSTEM = { workspace: 'runtime', portal: 'portal', mailer: 'mailer' };

const ok = (m) => console.log(`  ✅ ${m}`);
const info = (m) => console.log(`  ·  ${m}`);
const warn = (m) => console.log(`  ⚠  ${m}`);
const die = (m) => { console.error(`\n  ✖  ${m}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const writeSecret = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/* ------------------------------------------------------------------ *
 * 1. What it needs
 * ------------------------------------------------------------------ */

function findPython() {
  let older = null;
  for (const c of [process.env.DGO_PYTHON, 'python3', 'python'].filter(Boolean)) {
    try {
      const v = execFileSync(c, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const m = /^Python 3\.(\d+)/.exec(v);
      if (m && Number(m[1]) >= 11) return { cmd: c, version: v };
      if (m) older = v;
    } catch { /* not on PATH, or the Windows Store shim */ }
  }
  return { cmd: null, older };
}

/* ------------------------------------------------------------------ *
 * 2. Who is accountable
 * ------------------------------------------------------------------ */

/* The Centre accepts 2–80 letters, digits, spaces, dots, dashes, @ or underscores. */
const ACTOR_RX = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{1,79}$/;
const cleanName = (s) => String(s || '').replace(/[^A-Za-z0-9 ._@-]/g, '').trim().slice(0, 80);

async function operatorName() {
  const fromEnv = cleanName(process.env.FOLIO_ACTOR);
  if (ACTOR_RX.test(fromEnv)) return fromEnv;
  const saved = readJson(D.operator);
  if (saved && ACTOR_RX.test(saved.name || '')) return saved.name;
  let name = cleanName(os.userInfo().username);
  if (!ACTOR_RX.test(name)) name = 'Folio administrator';
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const a = cleanName(await rl.question(`\n  Your name, recorded on every change you make in the Centre [${name}]: `)) || name;
      if (ACTOR_RX.test(a)) { name = a; break; }
      console.log('  Use 2 to 80 letters, digits, spaces, dots, dashes, @ or underscores.');
    }
    rl.close();
  }
  writeSecret(D.operator, `${JSON.stringify({ name, savedAt: new Date().toISOString() }, null, 2)}\n`);
  return name;
}

/* ------------------------------------------------------------------ *
 * 3. Running
 * ------------------------------------------------------------------ */

async function answers(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    await r.body?.cancel();
    return r.status < 500;
  } catch { return false; }
}
const bothUp = async () => (await answers(`${CENTRE}/healthz`)) && (await answers(`${VAULT}/health`));

let child = null;
async function startServices(env) {
  child = spawn(process.execPath, [path.join(HERE, 'run-platform.mjs'), 'capsule', 'centre'], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) die('The Vault and the Centre did not start; the lines above say why.');
    if (await bothUp()) return;
    await sleep(500);
  }
  die('The Vault and the Centre did not answer within a minute; the lines above say why.');
}

/* ------------------------------------------------------------------ *
 * The Centre's API, as the operator, with the token it wrote
 * ------------------------------------------------------------------ */

const centreToken = () => { try { return fs.readFileSync(path.join(D.centre, 'config', 'admin.token'), 'utf8').trim(); } catch { return null; } };
async function centre(method, route, body, actor) {
  const t = centreToken();
  if (!t) throw new Error('the Centre has written no token yet');
  const r = await fetch(`${CENTRE}${route}`, {
    method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ actor, ...body }) : undefined, signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`);
  return j;
}

/* ------------------------------------------------------------------ *
 * 4. The browser
 * ------------------------------------------------------------------ */

function openInBrowser(url) {
  const which = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }).status === 0;
  const run = (cmd, args) => { try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); return true; } catch { return false; } };
  if (process.platform === 'win32') return run('rundll32', ['url.dll,FileProtocolHandler', url]);
  if (process.platform === 'darwin') return run('open', [url]);
  if (which('termux-open-url')) return run('termux-open-url', [url]);
  if ((process.env.DISPLAY || process.env.WAYLAND_DISPLAY) && which('xdg-open')) return run('xdg-open', [url]);
  return false;
}

/** A one-time link that unlocks the Centre in the browser. The Centre keeps only its digest, and only until used. */
function launchLink(actor) {
  const code = crypto.randomBytes(32).toString('base64url');
  writeSecret(path.join(D.centre, 'config', 'launch.json'),
    `${JSON.stringify({ codeSha256: sha256(code), expiresAt: isoSeconds(Date.now() + LAUNCH_MINUTES * 60_000), actor }, null, 2)}\n`);
  return `${CENTRE}/#launch=${code}`;
}

/* ------------------------------------------------------------------ *
 * 5. The flow owner's sign-in, kept
 * ------------------------------------------------------------------ */

async function signInFlowOwner(actor, browser) {
  let st = await centre('GET', '/api/tenant');
  if (st.state === 'signed-in') { ok(`Tenant: signed in as ${st.user?.email || st.user?.name || 'the flow owner'} (kept sign-in)`); return true; }
  st = await centre('POST', '/api/tenant/sign-in', { reason: 'Flow-owner sign-in started by the Folio Administration launcher' }, actor);
  let shown = false;
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    if (st.device && !shown) {
      console.log(`\n  One-time Microsoft sign-in, so the Centre can watch and manage the flows as their owner:`);
      console.log(`    Open ${st.device.verificationUri} and enter the code  ${st.device.userCode}`);
      console.log(`    Sign in with the account that owns the flows. It is kept: you will not be asked again.\n`);
      if (browser) openInBrowser(st.device.verificationUri);
      shown = true;
    }
    if (st.state === 'signed-in') { ok(`Tenant: signed in as ${st.user?.email || st.user?.name || 'the flow owner'}; kept for next time`); return true; }
    if (st.state === 'error') { warn(`Tenant sign-in failed: ${st.error}. Choose "Connect as flow owner" under Flows in the Centre to try again.`); return false; }
    await sleep(3000);
    st = await centre('GET', '/api/tenant');
  }
  warn('Tenant sign-in was not completed within 15 minutes. Choose "Connect as flow owner" under Flows in the Centre when ready.');
  return false;
}

/* ------------------------------------------------------------------ *
 * 6. The Vault, filled from the tenant
 * ------------------------------------------------------------------ */

/** The Flow service as the kept sign-in (the call config:rebuild makes). The rotated refresh token is written back. */
async function flowApi() {
  const s = readJson(D.session);
  if (!s?.refreshToken || !s.clientId) throw new Error('no kept Microsoft sign-in');
  const r = await fetch(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: 'https://service.flow.microsoft.com//.default offline_access openid profile' }),
  });
  const t = await r.json().catch(() => ({}));
  if (!t.access_token) throw new Error(`Microsoft refused the kept sign-in (${t.error || r.status})`);
  if (t.refresh_token) writeSecret(D.session, `${JSON.stringify({ ...s, refreshToken: t.refresh_token, savedAt: new Date().toISOString(), savedBy: 'folio-admin' }, null, 2)}\n`);
  return async (method, p, body) => {
    const res = await fetch(`${FLOW_API}/providers/Microsoft.ProcessSimple/environments/${ENV_ID}${p}${p.includes('?') ? '&' : '?'}api-version=2016-11-01`,
      { method, headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const txt = await res.text();
    let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, body: json };
  };
}

/** Ask a flow to name itself (HEALTH_CONTRACT.md, "The identity handshake"): what the Vault checks before it holds a URL. */
async function handshake(url) {
  const correlationId = crypto.randomUUID();
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _platform: { operation: 'verify', correlationId } }), signal: AbortSignal.timeout(30000) });
    let j = null; try { j = JSON.parse(await r.text()); } catch { /* not JSON */ }
    if (!r.ok) return { ok: false, why: `answered HTTP ${r.status}` };
    if (!j || j.verified !== true) return { ok: false, why: 'does not answer the identity handshake' };
    if (j.correlationId !== correlationId) return { ok: false, why: 'answered with another correlationId' };
    for (const k of ['flowIdentity', 'environment', 'contractVersion']) if (!j[k]) return { ok: false, why: `answered without ${k}` };
    return { ok: true, flowIdentity: String(j.flowIdentity), environment: String(j.environment), contractVersion: String(j.contractVersion) };
  } catch (e) {
    return { ok: false, why: `no answer (${e.cause?.code || e.name})` };
  }
}

async function fillVault() {
  const creds = readJson(path.join(D.vault, 'bootstrap-credentials.json'));
  if (!creds?.adminToken) throw new Error('the Vault has written no tokens yet');
  const vault = async (method, p, body) => {
    const r = await fetch(`${VAULT}${p}`, { method, headers: { Authorization: `Bearer ${creds.adminToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  };
  const live = await readLive(await flowApi(), keyPlan(JSON.parse(fs.readFileSync(ADOPTION, 'utf8'))));
  const held = new Map(((await vault('GET', '/admin/flows')).body.flows || []).map((f) => [f.alias, f]));
  const names = new Map();   /* one handshake per address: several keys can share a flow */
  const tally = { held: 0, unchanged: 0, refused: [], unread: [] };
  for (const row of live) {
    const alias = `${SYSTEM[row.variant]}.${row.key.toLowerCase().replace(/_/g, '-')}`;
    if (row.status === 'EMPTY_BY_DECISION') continue;
    if (row.status !== 'READ') { tally.unread.push(`${alias} (${row.status}${row.flow ? `, ${row.flow}` : ''})`); continue; }
    const have = held.get(alias);
    if (have && have.enabled && have.fingerprint === sha256(row.url)) { tally.unchanged++; continue; }
    if (!names.has(row.url)) names.set(row.url, await handshake(row.url));
    const h = names.get(row.url);
    if (!h.ok) { tally.refused.push(`${alias}: ${h.why}`); continue; }
    const r = await vault('POST', '/admin/flows', { alias, url: row.url, flowIdentity: h.flowIdentity, environment: h.environment, contractVersion: h.contractVersion });
    if (r.ok) tally.held++;
    else tally.refused.push(`${alias}: ${r.body.message || `HTTP ${r.status}`}`);
  }
  return tally;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

async function main() {
  console.log('\n  Folio Administration\n');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) die(`Node.js 22 or later is needed (this is ${process.versions.node}): https://nodejs.org/`);
  const py = findPython();
  if (!py.cmd) die(`Python 3.11 or later is needed${py.older ? ` (found ${py.older})` : ''}: https://www.python.org/downloads/`);
  ok(`Node.js ${process.versions.node}, ${py.version}`);

  for (const d of [DATA, D.vault, D.centre, path.dirname(D.session)]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const actor = await operatorName();
  ok(`Data folder ${DATA}; changes are recorded as ${actor}`);

  const env = {
    ...process.env,
    DGO_PYTHON: py.cmd,
    FLOWCAP_DATA_DIR: D.vault,
    FOLIO_ADMIN_HOME: D.centre,
    FOLIO_VAULT_TOKEN_FILE: path.join(D.vault, 'bootstrap-credentials.json'),
    FOLIO_MS_SESSION: D.session,
    /* The Workspace, Portal and Mailer run at their published addresses, not on this computer. */
    FOLIO_ADMIN_LOCAL_PLATFORMS: process.env.FOLIO_ADMIN_LOCAL_PLATFORMS || 'vault',
  };
  delete env.FOLIO_VAULT_ADMIN_TOKEN;
  delete env.FOLIO_VAULT_INVOKE_TOKEN;

  if (await bothUp()) info('The Vault and the Centre are already running; opening them.');
  else {
    await startServices(env);
    /* The Centre checks every platform the moment it starts, before the Vault answers; checking again clears that alarm. */
    try { await centre('POST', '/api/probe', { reason: 'Post-start probe by the Folio Administration launcher' }, actor); } catch { /* its monitor will */ }
  }
  ok(`Vault       ${VAULT}/health`);

  const browser = !has('--no-browser');
  const link = launchLink(actor);
  if (browser && openInBrowser(link)) ok(`Centre      ${CENTRE}/  opened in your browser, unlocked`);
  else ok(`Centre      open this once to sign in (it works once, for ${LAUNCH_MINUTES} minutes):\n       ${link}`);

  let signedIn = false;
  try { signedIn = await signInFlowOwner(actor, browser); } catch (e) {
    warn(`The Centre stopped answering during the tenant sign-in (${e.cause?.code || e.message}).`);
  }
  if (signedIn && !has('--no-vault-fill')) {
    try {
      const t = await fillVault();
      ok(`Vault filled from the tenant: ${t.held} address(es) newly held, ${t.unchanged} already held unchanged`);
      if (t.refused.length) { warn(`${t.refused.length} not held (the Vault holds only a flow that names itself):`); for (const x of t.refused) console.log(`       ${x}`); }
      if (t.unread.length) { warn(`${t.unread.length} could not be read from the tenant:`); for (const x of t.unread) console.log(`       ${x}`); }
    } catch (e) {
      warn(`The Vault was not filled: ${e.message}. Everything else is running.`);
    }
  }

  if (!child) { console.log(''); return; }
  console.log(`\n  Folio Administration is running. Close this window or press Ctrl-C to stop it.\n`);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (child && child.exitCode === null) child.kill(sig); else process.exit(0); });
await main();
if (child) {
  if (child.exitCode !== null) process.exit(child.exitCode);
  child.on('exit', (code) => process.exit(code ?? 0));
}
