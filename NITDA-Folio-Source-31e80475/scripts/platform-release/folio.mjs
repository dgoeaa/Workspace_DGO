#!/usr/bin/env node
// folio — administer the whole Folio platform suite from one command. Node 22+, no dependencies.
//
//   ./folio go                     wire the live URLs you have, start everything, check it
//   ./folio help                   every command
//
// Everything this keeps lives in FOLIO_HOME (default ~/.folio), never inside the package:
//   values.txt        the live trigger URLs, KEY=URL, mode 0600 (a URL is a credential)
//   vault/  centre/   the Vault's and the Centre's state and tokens
//   folio.log  folio.pid  wiring.json  backups/
//
// No command prints a signature. Endpoints are named by key, host and workflow id.

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Resolved from the suite's own layout, where this file is scripts/folio.mjs beside the files
   scripts/package-platform-release.mjs ships with it. (In the repository it sits in
   scripts/platform-release/, where these paths do not exist, so they are not written as static
   imports.) */
const load = (rel) => import(pathToFileURL(path.join(TOP, 'scripts', rel)).href);
const { SURFACES } = await load('lib/endpoint-surface.mjs');
const { validateSurface, validateEndpointUrl } = await load('lib/endpoint-validation.mjs');
const { renderRuntimeConfig, renderPortalConfig, buildIdFor } = await load('lib/endpoint-config-render.mjs');
const { buildZip } = await load('lib/zip-writer.mjs');
const { openZip } = await load('lib/zip-reader.mjs');
const { Platforms } = await load('platforms.config.mjs');
const HOME = path.resolve(process.env.FOLIO_HOME || path.join(os.homedir(), '.folio'));
const P = {
  values: path.join(HOME, 'values.txt'),
  vault: path.join(HOME, 'vault'),
  centre: path.join(HOME, 'centre'),
  log: path.join(HOME, 'folio.log'),
  pid: path.join(HOME, 'folio.pid'),
  wiring: path.join(HOME, 'wiring.json'),
  backups: path.join(HOME, 'backups'),
  session: path.join(HOME, 'microsoft', 'session.json'),
};
const CONFIG = {
  runtime: path.join(TOP, 'runtime', 'config', 'config.local.js'),
  portal: path.join(TOP, 'document-portal', 'config.local.js'),
};
const PORTAL_SW = path.join(TOP, 'document-portal', 'sw.js');
const SHARED = JSON.parse(fs.readFileSync(path.join(TOP, 'scripts', 'lib', 'shared-keys.json'), 'utf8'));
const TERMUX = !!process.env.TERMUX_VERSION || fs.existsSync('/data/data/com.termux');
const VAULT_URL = 'http://127.0.0.1:8787';
const CENTRE_URL = 'http://127.0.0.1:8844';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const rest = argv.slice(1);
const has = (f) => rest.includes(f);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };

const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  ·  ${m}`);
const warn = (m) => console.log(`  ⚠  ${m}`);
const head = (m) => console.log(`\n${m}`);
const die = (m, code = 1) => { console.error(`\n  ✖  ${m}\n`); process.exit(code); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const which = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'sh', process.platform === 'win32' ? [bin] : ['-c', `command -v ${bin}`], { stdio: 'ignore' }).status === 0;
const ensureHome = () => { for (const d of [HOME, P.vault, P.centre, P.backups]) fs.mkdirSync(d, { recursive: true, mode: 0o700 }); };
const writeSecret = (file, text) => { fs.writeFileSync(file, text, { mode: 0o600 }); fs.chmodSync(file, 0o600); };

/* ------------------------------------------------------------------ *
 * Values: KEY=URL, resolved per surface the way scripts/package.mjs resolves them
 * ------------------------------------------------------------------ */

function parseValues(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
const readValues = () => (fs.existsSync(P.values) ? parseValues(fs.readFileSync(P.values, 'utf8')) : {});
function saveValues(values, note) {
  ensureHome();
  if (fs.existsSync(P.values)) fs.copyFileSync(P.values, path.join(P.backups, `values-${stamp()}.txt`));
  const body = [`# Folio live endpoint values — ${note} — ${new Date().toISOString()}`,
    '# Every value is a bearer credential. Keep this file private; never commit or share it.',
    ...Object.keys(values).sort().map((k) => `${k}=${values[k]}`), ''].join('\n');
  writeSecret(P.values, body);
  for (const f of fs.readdirSync(P.backups)) if (f.startsWith('values-')) fs.chmodSync(path.join(P.backups, f), 0o600);
}

function surfaceValues(surfaceId, fileValues) {
  const s = SURFACES[surfaceId];
  return Object.fromEntries(s.endpoints.map((e) => {
    for (const n of [...s.envPrefixes.map((p) => p + e.key), e.key]) if (fileValues[n]) return [e.key, fileValues[n].trim()];
    for (const n of [...s.envPrefixes.map((p) => p + e.key), e.key]) if (process.env[n]) return [e.key, String(process.env[n]).trim()];
    return [e.key, ''];
  }));
}
const AUTH_KEYS = [
  { key: 'enabled', env: 'DGO_AUTH_ENABLED', cast: (v) => v === 'true' || v === '1' },
  { key: 'roleSource', env: 'DGO_AUTH_ROLE_SOURCE' },
];
function authValues(fileValues) {
  const out = {};
  for (const { key, env, cast } of AUTH_KEYS) {
    const raw = fileValues[env] ?? process.env[env];
    if (raw !== undefined && raw !== '') out[key] = cast ? cast(String(raw).trim()) : String(raw).trim();
  }
  return out;
}

/** The URLs currently in a config file, read the way the browser reads it. */
function configValues(surfaceId) {
  const file = CONFIG[surfaceId];
  if (!fs.existsSync(file)) return {};
  const sandbox = { window: {} };
  try { new Function('window', fs.readFileSync(file, 'utf8')).call(sandbox, sandbox.window); } catch { return {}; }
  return sandbox.window[SURFACES[surfaceId].globalName]?.endpoints || {};
}

function readSecretInput(label) {
  if (has('--stdin') || !process.stdin.isTTY) {
    try { return fs.readFileSync(0, 'utf8').trim(); } catch { return ''; }
  }
  if (which('termux-clipboard-get')) {
    try { return execFileSync('termux-clipboard-get', { encoding: 'utf8' }).trim(); } catch { /* fall through */ }
  }
  die(`Copy the ${label} to the clipboard (Termux, with termux-api) or pipe it in:  ./folio … --stdin < file`, 2);
}

/** Rows of the "Folio Flow Estate — Live Report" callback file → KEY=URL (scripts/live-check.mjs). */
function fromCallbackRows(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.CallbackUrl) continue;
    for (const k of String(r.ContractKeys || '').split(/;\s*/).filter(Boolean)) if (/^(DGO|PF)_ENDPOINT_/.test(k)) out[k] = r.CallbackUrl;
  }
  return out;
}

async function valuesCommand() {
  const sub = rest[0];
  const current = readValues();
  if (sub === 'fetch') {
    /* The harvester flow returns the whole values file. scripts/fetch-values-file.mjs does the
       call, the shape checks and the stale-scope diagnosis; this files the result. */
    ensureHome();
    const tmp = path.join(HOME, `values-fetch-${stamp()}.txt`);
    const r = spawnSync(process.execPath, [path.join(TOP, 'scripts', 'fetch-values-file.mjs'), '--out', tmp, ...(has('--stdin') ? ['--stdin'] : [])], { stdio: 'inherit' });
    if (r.status !== 0 || !fs.existsSync(tmp)) process.exit(r.status || 1);
    const got = parseValues(fs.readFileSync(tmp, 'utf8'));
    fs.rmSync(tmp, { force: true });
    saveValues({ ...current, ...got }, 'fetched from the harvester flow');
    ok(`${Object.keys(got).length} key(s) filed in ${P.values}. Next: ./folio wire`);
    return;
  }
  if (sub === 'import') {
    const file = rest[1];
    if (!file || !fs.existsSync(file)) die('Usage: ./folio values import <values.txt | Live-Report-CONFIDENTIAL-Callback-URLs.json>', 2);
    const text = fs.readFileSync(file, 'utf8');
    let got;
    try { got = fromCallbackRows(JSON.parse(text)); } catch { got = parseValues(text); }
    if (!Object.keys(got).length) die(`${file} names no KEY=URL value.`, 2);
    saveValues({ ...current, ...got }, `imported from ${path.basename(file)}`);
    ok(`${Object.keys(got).length} key(s) filed in ${P.values}. Next: ./folio wire`);
    if (has('--delete-source')) { fs.rmSync(file, { force: true }); info(`deleted ${file}`); }
    return;
  }
  if (sub === 'pull') {
    const host = (rest[1] || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(host)) die('Usage: ./folio values pull https://<deployed host>   (reads the configs the deployed platforms serve)', 2);
    const got = {};
    for (const [rel, g, prefix] of [['config/config.local.js', 'DGO_CONFIG', 'DGO_ENDPOINT_'], [process.env.PORTAL_PATH || 'document-portal/config.local.js', 'PF_CONFIG', 'PF_ENDPOINT_']]) {
      let res;
      try { res = await fetch(`${host}/${rel}`, { signal: AbortSignal.timeout(30000) }); } catch (e) { bad(`${host}/${rel}: ${e.message}`); continue; }
      if (!res.ok) { bad(`${host}/${rel} answered ${res.status}`); continue; }
      const sandbox = { window: {} };
      try { new Function('window', await res.text()).call(sandbox, sandbox.window); } catch (e) { bad(`${rel} does not evaluate: ${e.message}`); continue; }
      let n = 0;
      for (const [k, v] of Object.entries(sandbox.window[g]?.endpoints || {})) if (typeof v === 'string' && /^https:\/\//.test(v)) { got[prefix + k] = v; n++; }
      ok(`${rel}: ${n} URL(s)`);
    }
    if (!Object.keys(got).length) die('No URL was read from that host.');
    saveValues({ ...current, ...got }, `pulled from ${host}`);
    ok(`${Object.keys(got).length} key(s) filed in ${P.values}. Next: ./folio wire`);
    return;
  }
  if (sub === 'set') {
    const key = rest[1];
    const found = key && Object.entries(SURFACES).find(([, s]) => s.endpoints.some((e) => e.key === key.replace(/^(DGO_ENDPOINT_|PF_ENDPOINT_)/, '')));
    if (!found) die(`Usage: ./folio values set <KEY>   (URL from the clipboard, or --stdin). Keys: ${Object.values(SURFACES).flatMap((s) => s.endpoints.map((e) => e.key)).join(' ')}`, 2);
    const bare = key.replace(/^(DGO_ENDPOINT_|PF_ENDPOINT_)/, '');
    const name = `${found[0] === 'portal' ? 'PF_ENDPOINT_' : 'DGO_ENDPOINT_'}${bare}`;
    const url = readSecretInput(`trigger URL for ${bare}`);
    const v = validateEndpointUrl(url, { key: bare, required: true });
    if (!v.ok) die(`${bare}: ${v.message}. Nothing was changed.`, 2);
    const next = { ...current };
    for (const p of [...found[1].envPrefixes, '']) delete next[p + bare];
    next[name] = url;
    saveValues(next, `${bare} set`);
    ok(`${bare} → ${v.host}, workflow ${v.workflowId}. Next: ./folio wire`);
    return;
  }
  if (sub === 'show' || !sub) {
    head(`Values in ${P.values}${fs.existsSync(P.values) ? '' : ' — none yet'}`);
    for (const [id, s] of Object.entries(SURFACES)) {
      const vals = surfaceValues(id, current);
      const v = validateSurface(vals, s.endpoints, { required: [], shared: SHARED });
      console.log(`\n  ${s.label}: ${v.provisioned} of ${s.endpoints.length} set`);
      for (const r of v.results) console.log(`    ${r.provisioned ? (r.ok ? '✅' : '❌') : '– '} ${r.key.padEnd(24)} ${r.provisioned ? `${r.host || ''} ${r.workflowId || ''}${r.ok ? '' : `  ${r.message}`}` : 'not set'}`);
    }
    console.log('');
    return;
  }
  die('Usage: ./folio values [show | fetch | import <file> | pull <https://host> | set <KEY>]', 2);
}

/* ------------------------------------------------------------------ *
 * Wire: write the URLs into the Workspace and Portal, exactly as scripts/package.mjs would
 * ------------------------------------------------------------------ */

function wire({ empty = false, dry = has('--dry'), quiet = false } = {}) {
  const say = (fn) => (m) => { if (!quiet) fn(m); };
  const [hd, bd, inf] = [say(head), say(bad), say(info)];
  const fileValues = empty ? {} : readValues();
  if (!empty && !Object.keys(fileValues).length) die(`No values yet. Get them first:\n       ./folio values fetch            (harvester flow URL on the clipboard)\n       ./folio values import <file>     (a values file or the Live Report callback file)\n       ./folio values pull https://<deployed host>\n       ./folio values set <KEY>`, 2);
  hd(empty ? 'Unwiring — back to demo mode' : `Wiring from ${P.values}${dry ? '  (dry run — nothing is written)' : ''}`);
  const record = { at: new Date().toISOString(), surfaces: {} };
  let refused = false;
  const out = {};
  for (const [id, s] of Object.entries(SURFACES)) {
    const vals = empty ? Object.fromEntries(s.endpoints.map((e) => [e.key, ''])) : surfaceValues(id, fileValues);
    const v = validateSurface(vals, s.endpoints, { required: [], shared: SHARED });
    for (const e of v.errors) { bd(`${s.label} · ${e.key}: ${e.message}`); refused = true; }
    for (const c of v.collisions) { bd(`${s.label} · ${c.keys.join(' and ')} resolve to the same flow (${c.workflowId}) — the second would silently inherit the first's flow`); refused = true; }
    const buildId = buildIdFor(vals);
    const meta = { buildId, builtAt: record.at, posture: Object.values(vals).some(Boolean) ? 'live' : 'demo', by: 'folio wire (scripts/folio.mjs)' };
    out[id] = { body: id === 'runtime' ? renderRuntimeConfig(vals, authValues(fileValues), meta) : renderPortalConfig(vals, meta), buildId };
    record.surfaces[id] = { wired: v.provisioned, of: s.endpoints.length, buildId, posture: meta.posture, keys: v.results.filter((r) => r.provisioned && r.ok).map((r) => ({ key: r.key, host: r.host, workflowId: r.workflowId })) };
    inf(`${s.label}: ${v.provisioned} of ${s.endpoints.length} endpoints${v.warnings.some((w) => w.provisioned) ? `, ${v.warnings.filter((w) => w.provisioned).length} with notes` : ''}`);
  }
  record.refused = refused;
  if (refused && quiet) return record;
  if (refused) die('Refused: fix the values above (./folio values set <KEY>), then wire again. Nothing was written.');
  if (dry) return record;
  fs.writeFileSync(CONFIG.runtime, out.runtime.body);
  fs.writeFileSync(CONFIG.portal, out.portal.body);
  /* The Portal's service worker names its cache after the build id, so a returning visitor
     picks up new URLs instead of the cached ones (the transform scripts/package.mjs applies). */
  const sw = fs.readFileSync(PORTAL_SW, 'utf8');
  const next = sw.replace(/^const BUILD = '[^']*';/m, `const BUILD = '${out.portal.buildId}';`);
  if (next === sw && !sw.includes(`const BUILD = '${out.portal.buildId}';`)) die('document-portal/sw.js no longer carries its BUILD line; the Portal cache would not refresh.');
  fs.writeFileSync(PORTAL_SW, next);
  ensureHome();
  writeSecret(P.wiring, `${JSON.stringify(record, null, 2)}\n`);
  ok(`wrote runtime/config/config.local.js and document-portal/config.local.js (${record.surfaces.runtime.posture} / ${record.surfaces.portal.posture})`);
  if (running()) info('Reload the pages in the browser to pick the new configuration up (the servers do not cache).');
  return record;
}

/* ------------------------------------------------------------------ *
 * Running the platforms
 * ------------------------------------------------------------------ */

function running() {
  if (!fs.existsSync(P.pid)) return null;
  const pid = Number(fs.readFileSync(P.pid, 'utf8'));
  try { process.kill(pid, 0); return pid; } catch { fs.rmSync(P.pid, { force: true }); return null; }
}
const portOpen = (port) => new Promise((resolve) => {
  const s = net.connect({ port, host: '127.0.0.1' }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
  s.setTimeout(1500, () => { s.destroy(); resolve(false); });
});
function platformEnv() {
  return { ...process.env, FLOWCAP_DATA_DIR: P.vault, FOLIO_ADMIN_HOME: P.centre, FOLIO_VAULT_TOKEN_FILE: path.join(P.vault, 'bootstrap-credentials.json'), FOLIO_MS_SESSION: P.session };
}

async function start(args = rest) {
  ensureHome();
  const pid = running();
  if (pid) { info(`already running (pid ${pid}) — ./folio status, or ./folio restart`); return; }
  const ids = args.filter((a) => !a.startsWith('--'));
  const groupIdx = args.indexOf('--group');
  const launch = groupIdx >= 0 ? ['--group', args[groupIdx + 1]] : ids.length ? ids : ['--all'];
  if (TERMUX && which('termux-wake-lock')) { spawnSync('termux-wake-lock'); info('wake lock on — Android will not put Termux to sleep'); }
  const from = fs.existsSync(P.log) ? fs.statSync(P.log).size : 0;
  const log = fs.openSync(P.log, 'a', 0o600);
  fs.writeSync(log, `\n===== ${new Date().toISOString()} start ${launch.join(' ')}\n`);
  const child = spawn(process.execPath, [path.join(TOP, 'scripts', 'run-platform.mjs'), ...launch], { cwd: TOP, env: platformEnv(), detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
  fs.writeFileSync(P.pid, String(child.pid));
  head(`Starting ${launch.join(' ')} in the background (pid ${child.pid}); log ${P.log}`);
  const deadline = Date.now() + 45_000;
  let text = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    text = fs.readFileSync(P.log, 'utf8').slice(from);
    if (/Ctrl-C to stop|Nothing started/.test(text)) break;
    try { process.kill(child.pid, 0); } catch { break; }
  }
  for (const line of text.split('\n')) if (/^\s*(✅|✖|–)/.test(line)) console.log(line);
  if (/Nothing started/.test(text) || !running()) die(`Nothing is running. See ${P.log}`);
  /* The Centre checks every platform the moment it starts, which is before the others are
     listening, and raises an alert for each one it found down. Checking again now that all
     are up resolves those alerts instead of leaving a false alarm for five minutes. */
  if (centreToken() && await portOpen(8844)) { try { await centreCall('POST', '/api/probe', { reason: 'Post-start probe by folio' }); info('Centre re-checked every platform after start'); } catch { /* the Centre's own monitor will */ } }
  console.log(`\n  Open the Platform Hub: http://localhost:8079/   (./folio stop to stop)\n`);
}

async function stop() {
  const pid = running();
  if (!pid) { info('not running'); return; }
  try { process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  for (let i = 0; i < 20 && running(); i++) await new Promise((r) => setTimeout(r, 250));
  if (running()) { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
  fs.rmSync(P.pid, { force: true });
  if (TERMUX && which('termux-wake-unlock')) spawnSync('termux-wake-unlock');
  ok('stopped');
}

async function status() {
  const pid = running();
  head(`Folio — ${pid ? `running (pid ${pid})` : 'not running'}   home ${HOME}`);
  for (const p of Platforms) {
    let state = '–  down';
    try {
      const r = await fetch(`http://127.0.0.1:${p.port}${p.probe || p.openPath}`, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
      await r.body?.cancel();
      state = r.status < 500 ? '✅ up  ' : `⚠  HTTP ${r.status}`;
    } catch { /* down */ }
    console.log(`  ${state}  ${p.name.padEnd(38)} http://localhost:${p.port}${p.openPath}`);
  }
  head('Wiring');
  for (const [id, s] of Object.entries(SURFACES)) {
    const n = Object.values(configValues(id)).filter(Boolean).length;
    console.log(`  ${n ? '✅' : '– '} ${s.label.padEnd(30)} ${n} of ${s.endpoints.length} endpoints wired${n ? '' : ' (demo mode)'}`);
  }
  console.log(`  ·  Correspondence Mailer          ${fs.existsSync(path.join(TOP, 'mailer', 'web', 'config.local.js')) ? 'configured' : 'simulation — ./folio mailer to set it up'}`);
  { const ms = readSession(); console.log(`  ${ms ? '✅' : '– '} Microsoft sign-in             ${ms ? `${ms.user?.email || ms.user?.name} (kept; renewed ${ms.savedAt})` : 'none — ./folio signin (needed only for ./folio mailer and the Centre\'s flow view)'}`); }
  const token = (f, k) => { try { const t = fs.readFileSync(f, 'utf8'); return k ? JSON.parse(t)[k] : t.trim(); } catch { return null; } };
  const ct = token(path.join(P.centre, 'config', 'admin.token'));
  if (ct) {
    try {
      const s = await (await fetch(`${CENTRE_URL}/api/summary`, { headers: { Authorization: `Bearer ${ct}` }, signal: AbortSignal.timeout(3000) })).json();
      head('Central Administration Centre');
      console.log(`  ${s.open?.alerts ? '⚠ ' : '✅'} ${s.open?.alerts || 0} open alert(s), ${s.open?.incidents || 0} incident(s), ${s.changesAwaitingDecision || 0} change(s) awaiting decision · ${s.endpoints} endpoints governed`);
    } catch { /* not up */ }
  }
  const vt = token(path.join(P.vault, 'bootstrap-credentials.json'), 'adminToken');
  if (vt) {
    try {
      const v = await (await fetch(`${VAULT_URL}/admin/flows`, { headers: { Authorization: `Bearer ${vt}` }, signal: AbortSignal.timeout(3000) })).json();
      head('Vault');
      console.log(`  ·  ${(v.flows || []).length} alias(es) held`);
    } catch { /* not up */ }
  }
  console.log(`\n  Tokens (read them locally; they are never printed):\n    Centre  ${path.join(P.centre, 'config', 'admin.token')}\n    Vault   ${path.join(P.vault, 'bootstrap-credentials.json')}\n`);
}

/* ------------------------------------------------------------------ *
 * Live checks, the Vault, the Mailer
 * ------------------------------------------------------------------ */

function check() {
  const wired = Object.keys(SURFACES).reduce((n, id) => n + Object.values(configValues(id)).filter(Boolean).length, 0);
  if (!wired) die('Nothing is wired, so there is nothing live to check. ./folio wire first.', 2);
  if (has('--include-writes')) warn('--include-writes creates real records, each tagged __DGO_PROBE__ and a run id so they can be found and cleared.');
  const r = spawnSync(process.execPath, [path.join(TOP, 'scripts', 'verify-endpoints.mjs'), '--config', CONFIG.runtime, '--portal-config', CONFIG.portal, ...rest], { cwd: TOP, stdio: 'inherit' });
  return r.status ?? 1;
}

/** Ask a flow to name itself (HEALTH_CONTRACT.md, "The identity handshake"). */
async function handshake(url) {
  const correlationId = crypto.randomUUID();
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _platform: { operation: 'verify', correlationId } }), signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* not JSON */ }
    if (!r.ok) return { ok: false, why: `answered HTTP ${r.status}` };
    if (!j || j.verified !== true) return { ok: false, why: 'does not implement the identity handshake (no verified:true in its answer)' };
    if (j.correlationId !== correlationId) return { ok: false, why: 'answered with a different correlationId — a cached or replayed answer' };
    for (const k of ['flowIdentity', 'environment', 'contractVersion']) if (!j[k]) return { ok: false, why: `answered without ${k}` };
    return { ok: true, flowIdentity: String(j.flowIdentity), environment: String(j.environment), contractVersion: String(j.contractVersion) };
  } catch (e) {
    return { ok: false, why: `no answer (${e.cause?.code || e.name})` };
  }
}

async function vault() {
  let creds;
  try { creds = JSON.parse(fs.readFileSync(path.join(P.vault, 'bootstrap-credentials.json'), 'utf8')); } catch { die('The Vault has not started yet under ./folio (no bootstrap credentials). Run ./folio start first.', 2); }
  try { await (await fetch(`${VAULT_URL}/health`, { signal: AbortSignal.timeout(3000) })).body?.cancel(); } catch { die('The Vault is not answering on 127.0.0.1:8787. Run ./folio start first.', 2); }
  const dry = has('--dry');
  head(`Registering the wired endpoints in the Vault${dry ? ' (dry run: handshake only)' : ''}`);
  info('The Vault holds a URL only for a flow that proves which flow it is; one that does not is reported and left out.');
  let held = 0, skipped = 0;
  for (const [id, s] of Object.entries(SURFACES)) {
    for (const [key, url] of Object.entries(configValues(id))) {
      if (!url) continue;
      const alias = `${id}.${key.toLowerCase().replace(/_/g, '-')}`;
      const h = await handshake(url);
      if (!h.ok) { console.log(`  –  ${alias.padEnd(32)} ${h.why}`); skipped++; continue; }
      if (dry) { ok(`${alias.padEnd(32)} names itself ${h.flowIdentity}`); continue; }
      const r = await fetch(`${VAULT_URL}/admin/flows`, { method: 'POST', headers: { Authorization: `Bearer ${creds.adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alias, url, ...h, ok: undefined }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { ok(`${alias.padEnd(32)} held (${h.flowIdentity})`); held++; } else { bad(`${alias.padEnd(32)} refused: ${j.error?.message || j.message || r.status}`); skipped++; }
    }
  }
  console.log(`\n  ${held} held, ${skipped} not held.\n`);
}

function mailer() {
  head(`Correspondence Mailer setup (mailer/tools/setup.mjs) — ${fs.existsSync(P.session) ? 'using the saved Microsoft sign-in' : 'sign in once as the sending account; the sign-in is kept for next time'}`);
  const r = spawnSync(process.execPath, [path.join(TOP, 'mailer', 'tools', 'setup.mjs'), ...rest], { cwd: path.join(TOP, 'mailer'), stdio: 'inherit', env: { ...process.env, FOLIO_MS_SESSION: P.session } });
  return r.status ?? 1;
}

/* ------------------------------------------------------------------ *
 * The Microsoft sign-in, kept: one device-code sign-in shared by the Centre and the Mailer
 *
 * Microsoft's device-code flow through its own public sign-in apps (the same two the Centre and
 * the Mailer's setup use; no app registration, no secret). Only the refresh token is kept, in
 * ~/.folio/microsoft/session.json, mode 0600. The Centre (started by ./folio) and ./folio mailer
 * redeem it instead of asking for a code, and save back the token Microsoft rotates it to, so the
 * sign-in lasts as long as it is used: Microsoft ends it after 90 days unused, on a password
 * change or revocation, or when tenant policy says so. ./folio signout deletes it everywhere.
 * ------------------------------------------------------------------ */

const MS_CLIENTS = [
  { id: '1950a258-227b-4e31-a9cf-717495945fc2', name: 'Microsoft Azure PowerShell' },
  { id: '9cee029c-6210-4654-90bb-17e6e9d36617', name: 'Power Platform CLI' },
];
const MS_SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const MS_REFUSED = /AADSTS(700016|65002|65001|7000112|50059|500011|650057)\b|unauthorized_client|invalid_client/;
const MS_LOGIN = process.env.FOLIO_MS_LOGIN || 'https://login.microsoftonline.com';

function msTenant() {
  if (opt('--tenant')) return opt('--tenant');
  try {
    const env = JSON.parse(fs.readFileSync(path.join(TOP, 'tools', 'admin-centre', 'config', 'settings.json'), 'utf8')).environmentId;
    const m = /^Default-([0-9a-f-]{36})$/i.exec(env || '');
    if (m) return m[1];
  } catch { /* fall through */ }
  die('No tenant id: pass --tenant <tenant id>.', 2);
}
async function msForm(url, fields) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(30000) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const msWhy = (r) => `HTTP ${r.status}${r.json.error ? ` — ${r.json.error}: ${String(r.json.error_description || '').split('\r\n')[0]}` : ''}`;
const msClaims = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };
const readSession = () => { try { return JSON.parse(fs.readFileSync(P.session, 'utf8')); } catch { return null; } };
function saveSession(client, refreshToken, claims, tenant) {
  fs.mkdirSync(path.dirname(P.session), { recursive: true, mode: 0o700 });
  const body = { schema: 'folio-ms-session/1', clientId: client.id, clientName: client.name, tenant, refreshToken,
    user: { name: claims.name || '', email: claims.upn || claims.unique_name || claims.preferred_username || '', objectId: claims.oid || '' },
    signedInAt: new Date().toISOString(), savedAt: new Date().toISOString(), savedBy: 'folio signin' };
  const tmp = `${P.session}.tmp`;
  writeSecret(tmp, `${JSON.stringify(body, null, 2)}\n`);
  fs.renameSync(tmp, P.session);
  return body.user;
}

async function signin() {
  const existing = readSession();
  if (existing && !has('--again')) { info(`already signed in as ${existing.user?.email || existing.user?.name} — ./folio whoami --check to test it, ./folio signin --again to replace it`); return; }
  const tenant = msTenant();
  head('Microsoft sign-in (device code) — kept for the Centre and the Mailer');
  const refusals = [];
  for (const client of MS_CLIENTS) {
    const dc = await msForm(`${MS_LOGIN}/${tenant}/oauth2/v2.0/devicecode`, { client_id: client.id, scope: MS_SCOPE });
    if (dc.status !== 200 || !dc.json.device_code) {
      if (MS_REFUSED.test(msWhy(dc))) { refusals.push(`${client.name}: ${msWhy(dc)}`); continue; }
      die(`Microsoft sign-in is not available: ${msWhy(dc)}`);
    }
    const uri = dc.json.verification_uri || 'https://microsoft.com/devicelogin';
    console.log(`\n  Open ${uri} and enter the code  ${dc.json.user_code}\n  Sign in as the account that owns the flows (Microsoft names the app "${client.name}"). Waiting…\n`);
    if (TERMUX && which('termux-open-url')) spawnSync('termux-open-url', [uri]);
    const deadline = Date.now() + (dc.json.expires_in || 900) * 1000;
    let interval = Number(process.env.FOLIO_MS_POLL_MS) || (dc.json.interval || 5) * 1000;
    let refused = null;
    for (;;) {
      await new Promise((r) => setTimeout(r, interval));
      const t = await msForm(`${MS_LOGIN}/${tenant}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: client.id, device_code: dc.json.device_code });
      if (t.status === 200 && t.json.access_token) {
        if (!t.json.refresh_token) die('Microsoft signed you in but issued no refresh token, so the sign-in cannot be kept.');
        const user = saveSession(client, t.json.refresh_token, msClaims(t.json.access_token), msClaims(t.json.access_token).tid || tenant);
        ok(`signed in as ${user.name ? `${user.name} <${user.email}>` : user.email} — kept in ${P.session} (0600)`);
        if (await portOpen(8844)) { try { await centreCall('GET', '/api/tenant'); info('the running Centre has picked the sign-in up'); } catch { /* it will on its next call */ } }
        return;
      }
      const code = t.json.error;
      if (code === 'authorization_pending') { if (Date.now() > deadline) die('The code expired. Run ./folio signin again.'); continue; }
      if (code === 'slow_down') { interval += 5000; continue; }
      if (code === 'authorization_declined') die('Sign-in was declined.');
      if (code === 'expired_token') die('The code expired. Run ./folio signin again.');
      if (MS_REFUSED.test(msWhy(t))) { refused = msWhy(t); break; }
      die(`Sign-in failed: ${msWhy(t)}`);
    }
    refusals.push(`${client.name}: ${refused}`);
    info(`Microsoft does not allow ${client.name} here; trying the next app — a new code follows.`);
  }
  die(`Microsoft refused every public sign-in app in this tenant:\n       ${refusals.join('\n       ')}`);
}

async function signout() {
  const had = fs.existsSync(P.session);
  if (await portOpen(8844) && centreToken()) { try { await centreCall('POST', '/api/tenant/sign-out', { reason: 'Signed out through folio' }); } catch { /* not signed in there */ } }
  fs.rmSync(P.session, { force: true });
  ok(had ? 'signed out: the kept Microsoft sign-in is deleted, and the Centre has let go of it' : 'no kept sign-in');
  info('To end it at Microsoft as well: https://myaccount.microsoft.com → Devices / Sign out everywhere.');
}

async function whoami() {
  const s = readSession();
  if (!s) { info('not signed in — ./folio signin'); return; }
  head('Kept Microsoft sign-in');
  console.log(`  ·  ${s.user?.name ? `${s.user.name} <${s.user.email}>` : s.user?.email}  through ${s.clientName}\n  ·  signed in ${s.signedInAt}, last renewed ${s.savedAt} (${s.savedBy})\n  ·  ${P.session}`);
  if (has('--check')) {
    const r = await msForm(`${MS_LOGIN}/${s.tenant}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: MS_SCOPE });
    if (r.status === 200 && r.json.access_token) {
      if (r.json.refresh_token) { const kept = { ...s, refreshToken: r.json.refresh_token, savedAt: new Date().toISOString(), savedBy: 'folio whoami' }; const tmp = `${P.session}.tmp`; writeSecret(tmp, `${JSON.stringify(kept, null, 2)}\n`); fs.renameSync(tmp, P.session); }
      ok('Microsoft accepts it');
    } else {
      bad(`Microsoft refuses it: ${msWhy(r)} — run ./folio signin --again`);
      process.exitCode = 1;
    }
  }
  console.log('');
}

/* ------------------------------------------------------------------ *
 * The Central Administration Centre: probe, flow-owner sign-in, tenant sync
 * ------------------------------------------------------------------ */

/* The Centre accepts 2–80 letters, digits, spaces, dots, dashes, @ or underscores. */
const ACTOR = (process.env.FOLIO_ACTOR || `folio ${os.userInfo().username}`).replace(/[^A-Za-z0-9 .@_-]/g, '').slice(0, 80).padEnd(2, '_');
function centreToken() { try { return fs.readFileSync(path.join(P.centre, 'config', 'admin.token'), 'utf8').trim(); } catch { return null; } }
async function centreCall(method, route, body) {
  const t = centreToken();
  if (!t) throw new Error('the Centre has not started under ./folio yet (no token)');
  const r = await fetch(`${CENTRE_URL}${route}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify({ actor: ACTOR, ...body }) : undefined, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
  return j;
}

async function centre() {
  const sub = rest[0] || 'status';
  if (sub === 'probe') {
    const r = await centreCall('POST', '/api/probe', { reason: 'Platform probe requested through folio' });
    for (const x of r.results || []) console.log(`  ${x.state === 'Healthy' ? '✅' : '⚠ '} ${String(x.platform).padEnd(14)} ${x.state}${x.state === 'Healthy' ? '' : `  ${x.message || ''}`}`);
    return;
  }
  if (sub === 'signin') {
    head('Signing the Centre in as the flow owner (Microsoft device code)');
    let st = await centreCall('POST', '/api/tenant/sign-in', { reason: 'Flow-owner sign-in started through folio' });
    let shown = false;
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      if (st.device && !shown) {
        console.log(`\n  Open ${st.device.verificationUri} and enter the code  ${st.device.userCode}\n  Sign in as the account that owns the flows. Waiting…`);
        if (TERMUX && which('termux-open-url')) spawnSync('termux-open-url', [st.device.verificationUri]);
        shown = true;
      }
      if (st.state === 'signed-in') { ok(`signed in as ${st.user?.email || st.user?.name || 'the flow owner'}; the first flow sync has started`); return; }
      if (st.state === 'error') die(`sign-in failed: ${st.error}`);
      await new Promise((r) => setTimeout(r, 3000));
      st = await centreCall('GET', '/api/tenant');
    }
    die('sign-in was not completed within 15 minutes');
  }
  if (sub === 'sync') {
    await centreCall('POST', '/api/tenant/sync', { reason: 'Flow sync requested through folio' });
    ok('flow sync started — ./folio centre shows the result');
    return;
  }
  const s = await centreCall('GET', '/api/summary');
  const t = await centreCall('GET', '/api/tenant');
  head('Central Administration Centre');
  console.log(`  ${s.open?.alerts ? '⚠ ' : '✅'} ${s.open?.alerts || 0} open alert(s), ${s.open?.incidents || 0} incident(s), ${s.changesAwaitingDecision || 0} change(s) awaiting decision`);
  console.log(`  ·  ${s.endpoints} endpoints governed (${Object.entries(s.endpointsByScope || {}).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  console.log(`  ${t.state === 'signed-in' ? '✅' : '– '} flow owner: ${t.state === 'signed-in' ? (t.user?.email || t.user?.name) : 'not signed in — ./folio centre signin'} · ${t.flowsKnown} flows, ${t.runsKnown} runs known${t.lastSyncResult ? ` · last sync ${t.lastSyncResult.ok === false ? `failed: ${t.lastSyncResult.error}` : 'ok'}` : ''}`);
  console.log(`\n  Full console: ${CENTRE_URL}/  (token: ${path.join(P.centre, 'config', 'admin.token')})\n`);
}

/* ------------------------------------------------------------------ *
 * Backup, restore, autostart, doctor
 * ------------------------------------------------------------------ */

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? walk(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  });
}

function backup() {
  ensureHome();
  if (running()) warn('Taken while the platforms run. For a guaranteed-consistent copy of the Vault and Centre databases: ./folio stop, ./folio backup, ./folio start.');
  const entries = [];
  for (const rel of walk(HOME)) if (!rel.startsWith('backups/') && !/^folio\.(log|pid)$/.test(rel)) entries.push({ name: `home/${rel}`, data: fs.readFileSync(path.join(HOME, rel)) });
  for (const [id, f] of Object.entries(CONFIG)) if (fs.existsSync(f)) entries.push({ name: `config/${id}.config.local.js`, data: fs.readFileSync(f) });
  const out = path.join(P.backups, `folio-backup-${stamp()}.zip`);
  writeSecret(out, buildZip(entries));
  ok(`${out} — ${entries.length} files. It holds credentials (URLs, tokens): keep it private.`);
}

async function restore() {
  const file = rest[0];
  if (!file || !fs.existsSync(file)) die('Usage: ./folio restore <folio-backup-….zip>', 2);
  if (running()) die('Stop first: ./folio stop', 2);
  ensureHome();
  let n = 0;
  for (const m of openZip(path.resolve(file)).members) {
    if (m.isDirectory) continue;
    let dest = null;
    if (m.name.startsWith('home/')) dest = path.join(HOME, m.name.slice(5));
    else if (m.name === 'config/runtime.config.local.js') dest = CONFIG.runtime;
    else if (m.name === 'config/portal.config.local.js') dest = CONFIG.portal;
    if (!dest || !path.resolve(dest).startsWith(path.resolve(dest.startsWith(HOME) ? HOME : TOP))) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    writeSecret(dest, m.read());
    n++;
  }
  ok(`restored ${n} files. Run ./folio wire to bring the Portal's cache id in line, then ./folio start.`);
}

function autostart() {
  const on = rest[0] !== 'off';
  const folio = path.join(TOP, 'scripts', 'folio.mjs');
  if (TERMUX) {
    const dir = path.join(os.homedir(), '.termux', 'boot');
    const file = path.join(dir, 'folio-start.sh');
    if (!on) { fs.rmSync(file, { force: true }); ok('autostart off'); return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\nexport FOLIO_HOME='${HOME}'\nnode '${folio}' start >> '${P.log}' 2>&1\n`, { mode: 0o700 });
    ok(`${file} written. Install the Termux:Boot app and open it once; Folio then starts when the phone boots.`);
    return;
  }
  if (process.platform === 'win32') {
    const file = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'folio-start.cmd');
    if (!on) { fs.rmSync(file, { force: true }); ok('autostart off'); return; }
    fs.writeFileSync(file, `@echo off\r\nset FOLIO_HOME=${HOME}\r\nnode "${folio}" start\r\n`);
    ok(`${file} written: Folio starts when you sign in to Windows.`);
    return;
  }
  const line = `@reboot FOLIO_HOME='${HOME}' '${process.execPath}' '${folio}' start # folio-autostart`;
  if (!which('crontab')) { warn(`No crontab here. Add this to your init system instead:\n     ${line}`); return; }
  const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const kept = (cur.status === 0 ? cur.stdout : '').split('\n').filter((l) => l && !l.includes('# folio-autostart'));
  const r = spawnSync('crontab', ['-'], { input: `${[...kept, ...(on ? [line] : [])].join('\n')}\n`, encoding: 'utf8' });
  if (r.status !== 0) die(`crontab refused: ${r.stderr}`);
  ok(on ? 'autostart on: Folio starts at boot (crontab @reboot)' : 'autostart off');
}

async function doctor() {
  head('Folio doctor');
  const major = Number(process.versions.node.split('.')[0]);
  (major >= 22 ? ok : bad)(`Node ${process.versions.node}${major >= 22 ? '' : ' — 22 or later is required'}`);
  let py = null;
  for (const c of [process.env.DGO_PYTHON, 'python3', 'python'].filter(Boolean)) {
    try { const v = execFileSync(c, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); if (/^Python 3\./.test(v)) { py = v; break; } } catch { /* next */ }
  }
  const pyOk = py && Number(py.split('.')[1]) >= 11;
  (pyOk ? ok : warn)(py ? `${py}${pyOk ? '' : ' — the Vault needs 3.11+'}` : 'Python 3 not found — the Workbench, Vault and Centre will not start');
  const v = spawnSync(process.execPath, [path.join(TOP, 'scripts', 'verify-release.mjs')], { encoding: 'utf8' });
  (v.status === 0 ? ok : bad)(`package files: ${v.status === 0 ? 'intact' : `damaged\n${v.stdout}`}`);
  ok(`home ${HOME}${fs.existsSync(P.values) ? `, values for ${Object.keys(readValues()).length} key(s)` : ', no values yet'}`);
  if (fs.existsSync(P.values)) {
    try { const mode = fs.statSync(P.values).mode & 0o777; (mode & 0o077 ? warn : ok)(`values.txt mode ${mode.toString(8)}${mode & 0o077 ? ' — others can read it: chmod 600' : ''}`); } catch { /* windows */ }
    const want = wire({ dry: true, quiet: true });
    for (const [id, s] of Object.entries(SURFACES)) {
      const have = Object.values(configValues(id)).filter(Boolean).length;
      (have === want.surfaces[id].wired ? ok : warn)(`${s.label}: ${have} wired, values hold ${want.surfaces[id].wired}${have === want.surfaces[id].wired ? '' : ' — run ./folio wire'}`);
    }
  }
  const pid = running();
  for (const p of Platforms) {
    if (!pid && await portOpen(p.port)) warn(`port ${p.port} (${p.name}) is taken by something else`);
  }
  if (TERMUX) {
    (which('termux-wake-lock') ? ok : warn)(`termux-api ${which('termux-wake-lock') ? 'installed' : 'missing — pkg install termux-api (and the Termux:API app)'}`);
    (fs.existsSync(path.join(os.homedir(), '.termux', 'boot', 'folio-start.sh')) ? ok : info)(`autostart ${fs.existsSync(path.join(os.homedir(), '.termux', 'boot', 'folio-start.sh')) ? 'on' : 'off — ./folio autostart'}`);
  }
  info(pid ? `running (pid ${pid})` : 'not running — ./folio start');
  console.log('');
}

/* ------------------------------------------------------------------ *
 * go: the whole path in one command
 * ------------------------------------------------------------------ */

async function go() {
  head('Folio — go live');
  if (opt('--values')) { rest.splice(0, rest.length, 'import', opt('--values')); await valuesCommand(); }
  else if (opt('--pull')) { rest.splice(0, rest.length, 'pull', opt('--pull')); await valuesCommand(); }
  else if (has('--fetch')) { rest.splice(0, rest.length, 'fetch', ...(argv.includes('--stdin') ? ['--stdin'] : [])); await valuesCommand(); }
  const haveValues = Object.keys(readValues()).length > 0;
  if (haveValues) { rest.length = 0; wire(); } else warn('No live values yet — starting in demo mode. Get them with ./folio values fetch | import | pull | set, then ./folio go again.');
  if (running()) await stop();
  await start([]);
  if (argv.includes('--autostart')) { rest.splice(0, rest.length, 'on'); autostart(); }
  if (haveValues) { head('Live check (read-only endpoints)'); rest.length = 0; check(); }
  await status();
  console.log(`  Next, once each:\n    ./folio mailer           set up the Mailer's seven flows and publish it (sign in once)\n    ./folio centre signin    let the Centre manage the live flows as their owner\n    ./folio vault            hold the wired URLs in the Vault\n    ./folio autostart        start Folio at boot\n    ./folio backup           keep a copy of the values and state\n`);
}

const HELP = `
  folio — administer the Folio platform suite        home: ${HOME}

  Going live
    ./folio go [--values FILE | --pull https://HOST | --fetch] [--autostart]
                                 values → wire → start → live check → status, in one go
    ./folio values               what is set, per endpoint (never the URL)
    ./folio values fetch         the whole set from the harvester flow (its URL on the clipboard, or --stdin)
    ./folio values import FILE   a KEY=URL values file, or the Live Report callback JSON [--delete-source]
    ./folio values pull URL      read the URLs a deployed site already serves
    ./folio values set KEY       one URL (clipboard, or --stdin): adding or rotating a single endpoint
    ./folio wire [--dry]         write the values into the Workspace and Portal configuration
    ./folio unwire               back to demo mode
    ./folio check [--include-writes] [--only K1,K2]
                                 call every wired endpoint live and report what came back
    ./folio vault [--dry]        hold each wired URL in the Vault (flows that pass the identity handshake)
    ./folio mailer [--plan ...]  the Mailer's own setup: sign in once, flows, lists, mailer.html
    ./folio signin [--again]     sign in to Microsoft once (device code); kept for the Centre and the Mailer
    ./folio whoami [--check]     who is signed in, and whether Microsoft still accepts it
    ./folio signout              delete the kept sign-in everywhere
    ./folio centre [signin | sync | probe]
                                 the Centre: alerts and flow owner; sign it in to the tenant (device code); sync flows and runs

  Running
    ./folio start [ids | --group public|staff|control]     in the background, survives closing the terminal
    ./folio stop | restart | status | logs [-n 80]
    ./folio autostart [on|off]   start at boot (Termux:Boot, crontab @reboot, or Windows Startup)

  Keeping it safe
    ./folio backup               values, Vault and Centre state and configs → ${path.join(P.backups, 'folio-backup-….zip')}
    ./folio restore FILE         put a backup back (stopped first)
    ./folio doctor               Node, Python, package integrity, values vs wiring, ports, permissions
`;

process.on('unhandledRejection', (e) => die(e?.message || String(e)));
process.on('uncaughtException', (e) => die(e?.message || String(e)));

switch (cmd) {
  case 'go': await go(); break;
  case 'values': await valuesCommand(); break;
  case 'wire': wire(); break;
  case 'unwire': wire({ empty: true }); break;
  case 'check': process.exitCode = check(); break;
  case 'vault': await vault(); break;
  case 'mailer': process.exitCode = mailer(); break;
  case 'centre': await centre(); break;
  case 'signin': await signin(); break;
  case 'signout': await signout(); break;
  case 'whoami': await whoami(); break;
  case 'start': await start(); break;
  case 'stop': await stop(); break;
  case 'restart': await stop(); await start(); break;
  case 'status': await status(); break;
  case 'logs': {
    const n = Number(opt('-n') || 60);
    console.log(fs.existsSync(P.log) ? fs.readFileSync(P.log, 'utf8').split('\n').slice(-n).join('\n') : 'no log yet');
    break;
  }
  case 'autostart': autostart(); break;
  case 'backup': backup(); break;
  case 'restore': await restore(); break;
  case 'doctor': await doctor(); break;
  case 'help': case '--help': case '-h': console.log(HELP); break;
  default: console.log(HELP); process.exitCode = 2;
}
