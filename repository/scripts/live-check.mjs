#!/usr/bin/env node
// Run every live check this repository can make, from the live report's confidential callback file.
//
//   npm run live:check -- <Folio-Flow-Estate-…-CONFIDENTIAL-Callback-URLs.json>
//   npm run live:check -- --deployed https://folio-portal.page.gd
//     reads the deployed config/config.local.js and document-portal/config.local.js from that host
//
// WRITES TO THE TENANT. Authorised by the platform owner on 2026-10-02. Every probe row carries
// __DGO_PROBE__ and a run id so it can be found and cleared (MANUAL-2).
//
// 1. Builds a KEY=url values file from the callback file the "Folio Flow Estate — Live Report" flow
//    files on the governance site, and wires both config.local.js files with scripts/setup.mjs.
// 2. Runs scripts/verify-endpoints.mjs --include-writes against every wired key.
// 3. Sends a GET to every endpoint trigger: a 2xx means it answers every verb (ITEM-40).
// 4. Sends OTP_VERIFY a request carrying the portal origin and reads Access-Control-Allow-Origin (ITEM-56).
// Writes live-check-<stamp>.json beside the callback file. No signature is printed or written.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ROOT } from './platforms.config.mjs';

const di = process.argv.indexOf('--deployed');
const deployed = di > -1 ? (process.argv[di + 1] || '').replace(/\/+$/, '') : null;
let file = deployed ? null : process.argv[2];
let rows = [];
if (deployed) {
  /* The deployed hosts serve the same config.local.js the browser loads, so the signed URLs they
     hold are the ones the platform calls. Read them the way the browser does. */
  const load = async (rel, globalName, prefix) => {
    const res = await fetch(`${deployed}/${rel}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.error(`  ✖ ${deployed}/${rel} answered ${res.status}`); return; }
    const sandbox = { window: {} };
    new Function('window', await res.text()).call(sandbox, sandbox.window);
    for (const [k, v] of Object.entries(sandbox.window[globalName]?.endpoints || {})) {
      if (typeof v === 'string' && /^https:\/\//.test(v)) rows.push({ ContractKeys: `${prefix}${k}`, CallbackUrl: v });
    }
  };
  await load('config/config.local.js', 'DGO_CONFIG', 'DGO_ENDPOINT_');
  await load(process.env.PORTAL_PATH || 'document-portal/config.local.js', 'PF_CONFIG', 'PF_ENDPOINT_');
  file = path.join(os.homedir(), 'deployed');
} else {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: npm run live:check -- <CONFIDENTIAL-Callback-URLs.json>\n       npm run live:check -- --deployed https://folio-portal.page.gd');
    process.exit(2);
  }
  rows = JSON.parse(fs.readFileSync(file, 'utf8'));
}
const portalOrigin = process.env.PORTAL_ORIGIN || 'https://folio-portal.page.gd';
const redact = (s) => String(s).replace(/sig=[^&"\s]+/g, 'sig=<redacted>');

const values = new Map();
for (const r of Array.isArray(rows) ? rows : []) {
  if (!r.CallbackUrl) continue;
  for (const k of String(r.ContractKeys || '').split(/;\s*/).filter(Boolean)) {
    if (/^(DGO|PF)_ENDPOINT_/.test(k)) values.set(k, r.CallbackUrl);
  }
}
if (!values.size) {
  console.error('The file names no DGO_ENDPOINT_/PF_ENDPOINT_ key with a callback URL.');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const valuesFile = path.join(os.tmpdir(), `dgo-values-${stamp}.txt`);
fs.writeFileSync(valuesFile, [...values].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
console.log(`\n  1/4  Wiring ${values.size} keys into config/config.local.js and document-portal/config.local.js`);
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/setup.mjs'), '--values', valuesFile, '--force'], { stdio: 'inherit', cwd: ROOT });
} finally {
  fs.rmSync(valuesFile, { force: true });
}

const probeJson = path.join(os.tmpdir(), `dgo-probe-${stamp}.json`);
console.log('\n  2/4  Calling every wired endpoint, writes included');
let probeExit = 0;
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/verify-endpoints.mjs'), '--include-writes', '--json', probeJson], { stdio: 'inherit', cwd: ROOT });
} catch (e) {
  probeExit = e.status ?? 1;
}

console.log('\n  3/4  GET against every endpoint trigger (ITEM-40: a trigger should refuse GET)');
const verbs = [];
for (const [key, url] of values) {
  let v;
  try {
    const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(30000) });
    await r.body?.cancel();
    v = { key, status: r.status, refusesGet: r.status >= 400 };
  } catch (e) {
    v = { key, error: e.message, refusesGet: false };
  }
  verbs.push(v);
  console.log(`     ${v.refusesGet ? '✅ refuses GET' : '❌ answers GET'}  ${key}  ${v.status ?? v.error}`);
}

console.log(`\n  4/4  OTP_VERIFY CORS for ${portalOrigin} (ITEM-56)`);
let cors = { missing: true, matches: false };
const otp = values.get('DGO_ENDPOINT_OTP_VERIFY');
if (otp) {
  try {
    const r = await fetch(otp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: portalOrigin, 'X-DGO-Probe': stamp },
      body: JSON.stringify({ action: 'verify', email: 'dgo.probe@example.invalid', code: '000000', __probe: stamp }),
      signal: AbortSignal.timeout(30000),
    });
    await r.body?.cancel();
    const allow = r.headers.get('access-control-allow-origin');
    cors = { status: r.status, allowOrigin: allow, matches: allow === portalOrigin };
  } catch (e) {
    cors = { error: e.message, matches: false };
  }
  console.log(`     ${cors.matches ? '✅' : '❌'} status ${cors.status ?? cors.error}, Access-Control-Allow-Origin: ${cors.allowOrigin ?? '(none)'}`);
} else {
  console.log('     ❌ DGO_ENDPOINT_OTP_VERIFY is not in the callback file');
}

const probes = fs.existsSync(probeJson) ? JSON.parse(fs.readFileSync(probeJson, 'utf8')) : null;
fs.rmSync(probeJson, { force: true });
const out = path.join(deployed ? os.homedir() : path.dirname(path.resolve(file)), `live-check-${stamp}.json`);
const report = { ranUtc: new Date().toISOString(), runStamp: stamp, source: deployed || path.basename(file), portalOrigin, keysWired: [...values.keys()], probes, verbs, cors };
fs.writeFileSync(out, redact(JSON.stringify(report, null, 2)));
console.log(`\n  Wrote ${out}\n  Send that file back. It carries no signature.\n`);
process.exit(probeExit || verbs.some((v) => !v.refusesGet) || !cors.matches ? 1 : 0);
