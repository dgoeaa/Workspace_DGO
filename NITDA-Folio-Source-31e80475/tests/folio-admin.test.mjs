#!/usr/bin/env node
/**
 * `folio`, the suite's admin command (scripts/platform-release/folio.mjs), run end to end from an
 * unpacked copy of the committed release against a stand-in Power Automate.
 *
 *   A  values import → values show: every key resolved per surface, no signature printed
 *   B  wire: both configs carry the URLs, the Portal's cache id changes, verify-release says intact
 *   C  a malformed URL is refused and nothing is written
 *   D  check: the live checker runs against the wired configs and reaches the flows
 *   E  start → status → centre probe → stop, with state under FOLIO_HOME (skipped if ports are taken)
 *   F  backup → unwire → restore into a fresh home → wire: the same URLs come back
 *   G  doctor reports the values and the wiring agree
 *   H  no output of any command carries a signature
 *   I  signin keeps the Microsoft sign-in (refresh token only, 0600); whoami renews it; signout deletes it
 *
 * Run: node tests/folio-admin.test.mjs      Exit: 0 = all passed
 */

import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';

import { ZIP_PATH, unpack } from '../scripts/package-platform-release.mjs';
import { Platforms } from '../scripts/platforms.config.mjs';

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${!ok && detail ? `\n       ${String(detail).split('\n').slice(0, 12).join('\n       ')}` : ''}`);
  if (!ok) failed++;
};
const note = (m) => console.log(`  –  ${m}`);

console.log('\n  folio — the suite admin command\n');
if (!fs.existsSync(ZIP_PATH)) { check('the committed release exists', false, 'run: npm run platform:release'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-admin-test-'));
const top = unpack(ZIP_PATH, tmp);
const home = path.join(tmp, 'home');

/* A stand-in Power Automate on loopback, in its own process (folio is run synchronously, which
   would freeze a server in this one), and a preload that routes the Power Automate hosts to it in
   folio and in every process folio starts. */
const fakeFile = path.join(tmp, 'fake-pa.mjs');
fs.writeFileSync(fakeFile, `import http from 'node:http';
const jwt = (c) => ['e30', Buffer.from(JSON.stringify(c)).toString('base64url'), 'x'].join('.');
const who = { name: 'Flow Owner', upn: 'owner@nitda.gov.ng', tid: 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1', oid: 'o-1' };
const s = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/login/')) {   // a stand-in for Microsoft's device-code sign-in
    const f = new URLSearchParams(b);
    if (req.url.endsWith('/devicecode')) return res.end(JSON.stringify({ device_code: 'dc', user_code: 'TEST-CODE', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1 }));
    if (f.get('grant_type') === 'refresh_token') return res.end(JSON.stringify({ access_token: jwt(who), refresh_token: 'rt-B', expires_in: 3600 }));
    return res.end(JSON.stringify({ access_token: jwt(who), refresh_token: 'rt-A', expires_in: 3600 }));
  }
  res.end(JSON.stringify({ tasks: [], docs: [], emails: [], record: null }));
}); });
s.listen(0, '127.0.0.1', () => console.log(s.address().port));\n`);
const fake = spawn(process.execPath, [fakeFile], { stdio: ['ignore', 'pipe', 'inherit'] });
const fakePort = await new Promise((r) => fake.stdout.once('data', (d) => r(Number(String(d).trim()))));
const preload = path.join(tmp, 'route-pa.mjs');
fs.writeFileSync(preload, `const real = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (/(logic\\.azure\\.com|powerplatform\\.com)$/.test(u.hostname)) return real('http://127.0.0.1:${fakePort}' + u.pathname + u.search, init);
  return real(input, init);
};\n`);

const sigs = [];
const url = (i) => {
  const sig = crypto.randomBytes(32).toString('base64url');
  sigs.push(sig);
  return `https://prod-0${i}.westeurope.logic.azure.com:443/workflows/${crypto.randomBytes(16).toString('hex')}/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=${sig}`;
};
const values = { DGO_ENDPOINT_FETCH_ALL: url(0), DGO_ENDPOINT_GET_DOCS: url(1), DGO_ENDPOINT_DYNAMIC_ACTIONS: url(2), PF_ENDPOINT_SUBMISSION: url(3), PF_ENDPOINT_STATUS: url(4) };
const valuesFile = path.join(tmp, 'values-in.txt');
fs.writeFileSync(valuesFile, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

const transcript = [];
const folio = (args, extraEnv = {}) => {
  const r = spawnSync(process.execPath, [path.join(top, 'scripts', 'folio.mjs'), ...args], {
    cwd: top, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, FOLIO_HOME: home, NODE_OPTIONS: `--import ${preload}`, ...extraEnv },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  transcript.push(out);
  return { status: r.status, out };
};
const cfg = (rel) => fs.readFileSync(path.join(top, rel), 'utf8');

try {
  let r = folio(['values', 'import', valuesFile]);
  check('A  values import files every key', r.status === 0 && /5 key\(s\) filed/.test(r.out), r.out);
  check('A  values.txt is private (0600)', (fs.statSync(path.join(home, 'values.txt')).mode & 0o777) === 0o600);
  r = folio(['values']);
  check('A  values show resolves 3 Workspace and 2 Portal keys', /Internal operations platform: 3 of \d+ set/.test(r.out) && /Public document portal: 2 of \d+ set/.test(r.out), r.out);

  const swBefore = /const BUILD = '([^']*)'/.exec(cfg('document-portal/sw.js'))[1];
  r = folio(['wire']);
  check('B  wire succeeds', r.status === 0, r.out);
  check('B  the Workspace config carries its 3 URLs', ['FETCH_ALL', 'GET_DOCS', 'DYNAMIC_ACTIONS'].every((k) => cfg('runtime/config/config.local.js').includes(values[`DGO_ENDPOINT_${k}`])));
  check('B  the Portal config carries its 2 URLs', cfg('document-portal/config.local.js').includes(values.PF_ENDPOINT_SUBMISSION) && cfg('document-portal/config.local.js').includes(values.PF_ENDPOINT_STATUS));
  check('B  the Portal cache id changed with the endpoint set', /const BUILD = '([^']*)'/.exec(cfg('document-portal/sw.js'))[1] !== swBefore);
  const vr = spawnSync(process.execPath, [path.join(top, 'scripts', 'verify-release.mjs')], { encoding: 'utf8' });
  check('B  verify-release: intact, the wired files reported as expected changes', vr.status === 0 && /intact/.test(vr.stdout), vr.stdout);

  const bad = path.join(tmp, 'bad.txt');
  fs.writeFileSync(bad, `DGO_ENDPOINT_FETCH_ALL=${values.DGO_ENDPOINT_FETCH_ALL.slice(0, -5)}\n`);
  const before = cfg('runtime/config/config.local.js');
  folio(['values', 'import', bad]);
  r = folio(['wire']);
  check('C  a truncated signature is refused', r.status !== 0 && /Refused/.test(r.out), r.out);
  check('C  and nothing was written', cfg('runtime/config/config.local.js') === before);
  folio(['values', 'import', valuesFile]);

  r = folio(['check']);
  check('D  check runs the live checker against the wired configs', /endpoint\(s\) configured/.test(r.out) && /FETCH_ALL\s+✅ 200/.test(r.out), r.out);

  const busy = [];
  for (const p of Platforms) {
    const free = await new Promise((res) => { const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true))); s.listen(p.port, '127.0.0.1'); });
    if (!free) busy.push(p.port);
  }
  let python = false;
  try { python = /^Python 3\./.test(execFileSync('python3', ['--version'], { encoding: 'utf8' })); } catch { /* none */ }
  if (busy.length || !python) {
    note(`E  start/stop skipped — ${busy.length ? `ports in use: ${busy.join(', ')}` : 'Python 3 not on PATH'}`);
  } else {
    r = folio(['start']);
    check('E  start brings all eight up in the background', r.status === 0 && (r.out.match(/✅ {2}/g) || []).length === 8, r.out);
    r = folio(['status']);
    check('E  status: eight up, wiring 3 and 2', (r.out.match(/✅ up/g) || []).length === 8 && /3 of \d+ endpoints wired/.test(r.out) && /2 of \d+ endpoints wired/.test(r.out), r.out);
    check('E  the Vault and the Centre keep their state under FOLIO_HOME', fs.existsSync(path.join(home, 'vault', 'bootstrap-credentials.json')) && fs.existsSync(path.join(home, 'centre', 'config', 'admin.token')));
    r = folio(['centre']);
    check('E  centre: no open alert once everything is up', /✅ 0 open alert/.test(r.out), r.out);
    r = folio(['stop']);
    check('E  stop', r.status === 0 && /stopped/.test(r.out), r.out);
  }

  r = folio(['backup']);
  const backup = fs.readdirSync(path.join(home, 'backups')).find((f) => f.startsWith('folio-backup-'));
  check('F  backup written, private', r.status === 0 && !!backup && (fs.statSync(path.join(home, 'backups', backup)).mode & 0o777) === 0o600, r.out);
  folio(['unwire']);
  check('F  unwire empties the configs', !cfg('runtime/config/config.local.js').includes('logic.azure.com'));
  const home2 = path.join(tmp, 'home2');
  r = folio(['restore', path.join(home, 'backups', backup)], { FOLIO_HOME: home2 });
  folio(['wire'], { FOLIO_HOME: home2 });
  check('F  restore into a fresh home, then wire: the same URLs come back', r.status === 0 && cfg('runtime/config/config.local.js').includes(values.DGO_ENDPOINT_FETCH_ALL), r.out);

  r = folio(['doctor']);
  check('G  doctor: values and wiring agree', /Internal operations platform: 3 wired, values hold 3/.test(r.out) && /Public document portal: 2 wired, values hold 2/.test(r.out), r.out);

  /* I — the kept Microsoft sign-in (device code once, then remembered) */
  const msEnv = { FOLIO_MS_LOGIN: `http://127.0.0.1:${fakePort}/login`, FOLIO_MS_POLL_MS: '50' };
  r = folio(['signin'], msEnv);
  const session = path.join(home, 'microsoft', 'session.json');
  check('I  signin shows a code once and keeps the sign-in, private', r.status === 0 && /TEST-CODE/.test(r.out) && fs.existsSync(session) && (fs.statSync(session).mode & 0o777) === 0o600, r.out);
  const kept = fs.existsSync(session) ? fs.readFileSync(session, 'utf8') : '';
  check('I  only the refresh token is kept, never the access token', /"refreshToken": "rt-A"/.test(kept) && !kept.includes('e30.'));
  r = folio(['signin'], msEnv);
  check('I  signing in again is not needed', r.status === 0 && /already signed in as owner@nitda\.gov\.ng/.test(r.out) && !/TEST-CODE/.test(r.out), r.out);
  r = folio(['whoami', '--check'], msEnv);
  check('I  whoami --check: Microsoft accepts it, and the rotated token is saved back', r.status === 0 && /Microsoft accepts it/.test(r.out) && /"refreshToken": "rt-B"/.test(fs.readFileSync(session, 'utf8')), r.out);
  check('I  no command printed the refresh token', !transcript.some((t) => /rt-A|rt-B/.test(t)));
  r = folio(['status']);
  check('I  status names the signed-in account', /Microsoft sign-in\s+owner@nitda\.gov\.ng/.test(r.out), r.out);
  r = folio(['signout']);
  check('I  signout deletes it', r.status === 0 && !fs.existsSync(session), r.out);

  const leaked = sigs.filter((s) => transcript.some((t) => t.includes(s)));
  check('H  no command printed a signature', leaked.length === 0, `${leaked.length} signature(s) appeared in output`);
} finally {
  spawnSync(process.execPath, [path.join(top, 'scripts', 'folio.mjs'), 'stop'], { cwd: top, env: { ...process.env, FOLIO_HOME: home }, timeout: 30_000 });
  fake.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n  ${failed} failed\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
