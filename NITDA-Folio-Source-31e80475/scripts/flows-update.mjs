#!/usr/bin/env node
/**
 * Bring every live flow to its package in one command, and prove it.
 *
 *   npm run flows:update                         check: reads every flow, writes nothing
 *   npm run flows:update -- apply                check, confirm, back up, write, read back
 *   npm run flows:update -- restore <backup>     put back every flow in a backup
 *   npm run flows:update -- record <report>      file a saved report as evidence, and record in the paste ledger
 *                                                (registers/identification-paste-ledger.json) what each flow read runs
 *
 *   --only A,B   just these packages (any part of the package id, key, flow name, flow id or scope); with restore,
 *                just these flows from the backup (any part of the flow id or name)
 *   --yes        apply without asking
 *   --out DIR    backups and reports (default ./flows-update-output, git-ignored)
 *
 * check and apply save their report to --out every time. record needs no sign-in: it is the repository's half,
 * run in the clone that will commit it, because evidence filed there must be cited by the readiness register.
 *
 * Sign-in: the saved Folio sign-in when FOLIO_MS_SESSION names one (the platform suite's `folio`
 * sets it; the Administration Centre and the Mailer share it), else a code on a Microsoft page
 * (scripts/lib/device-sign-in.mjs), saved to that file for next time when the variable is set.
 * The access token stays in memory. Only the flows this account owns or co-owns can be read or written.
 *
 * Procedure: docs/folio-Master-Flows-and-Endpoints/deployment/FLOWS_UPDATE.md.
 * Runtime: scripts/lib/flow-bulk-update.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPackages, createFlowsUpdate, ledgerUpdate } from './lib/flow-bulk-update.mjs';
import { deviceSignIn } from './lib/device-sign-in.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = 'docs/folio-Master-Flows-and-Endpoints/evidence';
const LEDGER = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json';
const env = process.env;
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) || 'check';
const opt = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const USAGE = `Usage: npm run flows:update -- [check | apply | restore <backup.json> | record <report.json>] [--only A,B] [--yes] [--out DIR]
  check     read every flow and compare it with its package (the default; writes nothing)
  apply     check, confirm, back up, write each flow and read it back; stops at the first failure
  restore   put back every flow in a backup written by apply
  record    file a report written by check or apply as evidence and in the paste ledger (no sign-in)
See docs/folio-Master-Flows-and-Endpoints/deployment/FLOWS_UPDATE.md`;

if (args.includes('--help') || !['check', 'apply', 'restore', 'record'].includes(cmd)) { console.log(USAGE); process.exit(args.includes('--help') ? 0 : 2); }

const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json'), 'utf8'));
const environment = inventory.coverage.environmentName;
if (!/^Default-[0-9a-f-]{36}$/i.test(environment)) throw new Error(`unexpected environment name ${environment}`);
const TENANT = environment.replace(/^Default-/i, '');
const FLOW = env.FOLIO_FLOW_API || 'https://api.flow.microsoft.com';
const LOGIN = env.FOLIO_LOGIN || 'https://login.microsoftonline.com';
const OUT = path.resolve(opt('--out') || 'flows-update-output');
const only = (opt('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let commit = null;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a clone */ }

/* ───────────── record: the repository's half, no sign-in ───────────── */

if (cmd === 'record') {
  const file = args[args.indexOf('record') + 1];
  if (!file || file.startsWith('--')) { console.log(USAGE); process.exit(2); }
  let report = null;
  try { report = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Cannot read ${file}: ${e.message}`); process.exit(2); }
  if (report?.schema !== 'folio-flows-update-report/v1' || !['check', 'apply'].includes(report.kind) || !Array.isArray(report.flows)) {
    console.error(`${file} is not a report written by flows:update check or apply.`); process.exit(2);
  }
  if (report.environment !== environment) { console.error(`${file} is a report on environment ${report.environment}, not ${environment}.`); process.exit(2); }
  /* FOLIO_FLOWS_RECORD_ROOT: where evidence/ and the ledger are, for the tests; the repository otherwise. */
  const AT = env.FOLIO_FLOWS_RECORD_ROOT ? path.resolve(env.FOLIO_FLOWS_RECORD_ROOT) : ROOT;
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const dir = path.join(AT, EVIDENCE);
  const same = fs.readdirSync(dir).find((f) => /-flows-(check|apply)(-\d+)?\.json$/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8') === text);
  if (same) { console.error(`This report is already recorded: ${EVIDENCE}/${same}`); process.exit(2); }
  const day = String(report.finishedUtc).slice(0, 10);
  let target, n = 1;
  do { target = path.join(dir, `${day}-flows-${report.kind}${n > 1 ? `-${n}` : ''}.json`); n++; } while (fs.existsSync(target));
  fs.writeFileSync(target, text);
  const { ledger, changed } = ledgerUpdate(JSON.parse(fs.readFileSync(path.join(AT, LEDGER), 'utf8')), report, path.relative(path.join(AT, 'docs/folio-Master-Flows-and-Endpoints'), target).split(path.sep).join('/'));
  fs.writeFileSync(path.join(AT, LEDGER), `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`Evidence: ${path.relative(AT, target).split(path.sep).join('/')}`);
  console.log(`Paste ledger: ${changed.length} entr${changed.length === 1 ? 'y' : 'ies'} recorded from the live read.`);
  console.log('Next: npm run flows:regenerate, revise the readiness register to cite the evidence, npm run test:node, commit, push.');
  process.exit(0);
}

let backup = null;
if (cmd === 'restore') {
  const file = args[args.indexOf('restore') + 1];
  if (!file || file.startsWith('--')) { console.log(USAGE); process.exit(2); }
  backup = JSON.parse(fs.readFileSync(file, 'utf8')); // fail before sign-in if the file is not JSON
  /* --only on restore: just these flows from the backup (any part of the flow id or name), the rest left as they are. */
  if (only.length && backup && backup.flows) {
    const keep = Object.entries(backup.flows).filter(([id, f]) => only.some((t) => id.includes(t.toLowerCase()) || String(f?.name || '').toLowerCase().includes(t.toLowerCase())));
    if (!keep.length) { console.error(`--only ${only.join(',')} names no flow in ${file}.`); process.exit(2); }
    backup = { ...backup, flows: Object.fromEntries(keep) };
  }
}
const packages = loadPackages(ROOT);

/* ───────────── sign-in ───────────── */

const FLOW_SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile';
const CLIENTS = { '1950a258-227b-4e31-a9cf-717495945fc2': 'Microsoft Azure PowerShell', '9cee029c-6210-4654-90bb-17e6e9d36617': 'Power Platform CLI' };
const SESSION = env.FOLIO_MS_SESSION ? path.resolve(env.FOLIO_MS_SESSION) : null;
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
const claims = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; } };
function saveSession(clientId, refreshToken, user) {
  if (!SESSION || !refreshToken) return;
  let prior = {};
  try { prior = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { /* first save */ }
  const body = { schema: 'folio-ms-session/1', clientId, clientName: CLIENTS[clientId], tenant: TENANT, refreshToken, user,
    signedInAt: prior.clientId === clientId && prior.signedInAt ? prior.signedInAt : new Date().toISOString(), savedAt: new Date().toISOString(), savedBy: 'flows-update' };
  try {
    fs.mkdirSync(path.dirname(SESSION), { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${SESSION}.tmp`, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(`${SESSION}.tmp`, 0o600);
    fs.renameSync(`${SESSION}.tmp`, SESSION);
  } catch (e) { console.log(`    could not keep the sign-in for next time: ${e.message}`); }
}
async function signIn() {
  if (SESSION && fs.existsSync(SESSION)) {
    let s = {}; try { s = JSON.parse(fs.readFileSync(SESSION, 'utf8')); } catch { /* unreadable: sign in afresh */ }
    if (CLIENTS[s.clientId] && s.refreshToken && (!s.tenant || s.tenant === TENANT)) {
      const t = await post(`${LOGIN}/${TENANT}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: FLOW_SCOPE });
      if (t.status === 200 && t.json.access_token) {
        const who = claims(t.json.access_token);
        const user = { name: who.name || '', email: who.upn || who.unique_name || who.preferred_username || '' };
        saveSession(s.clientId, t.json.refresh_token || s.refreshToken, user);
        console.log(`    signed in as ${user.email || 'the saved account'} (the saved Folio sign-in; no code needed)`);
        return t.json.access_token;
      }
      console.log('    the saved Folio sign-in can no longer be used; signing in with a code instead');
    }
  }
  const r = await deviceSignIn({ tenant: TENANT, post, say: (s) => console.log(s), sleep, login: LOGIN, pollMs: env.FOLIO_FLOWS_POLL_MS ? Number(env.FOLIO_FLOWS_POLL_MS) : null });
  saveSession(r.client?.id, r.refreshToken, r.user);
  console.log(`    signed in as ${r.user.name ? `${r.user.name} <${r.user.email}>` : r.user.email || 'the account you chose'}${SESSION ? ' (kept for next time)' : ''}`);
  return r.token;
}

/* ───────────── the Flow service ───────────── */

const RETRY_MS = env.FOLIO_FLOWS_RETRY_MS ? env.FOLIO_FLOWS_RETRY_MS.split(',').map(Number) : [2000, 4000, 8000];
let token = null;
/* Reads are retried when throttled or dropped. A write is not: the runtime reads the flow back to
   learn whether it landed. */
async function api(method, p, body) {
  const url = `${FLOW}/providers/Microsoft.ProcessSimple/environments/${environment}${p}${p.includes('?') ? '&' : '?'}api-version=2016-11-01`;
  const delays = method === 'GET' ? RETRY_MS : [];
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const txt = await res.text();
      let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = { error: { message: txt.slice(0, 300) } }; }
      if ([429, 502, 503, 504].includes(res.status) && attempt < delays.length) { await sleep(delays[attempt]); continue; }
      return { ok: res.ok, status: res.status, body: json };
    } catch (e) {
      if (attempt >= delays.length) return { ok: false, status: 0, network: true, body: { error: { message: `the connection dropped (${e.message})` } } };
      await sleep(delays[attempt]);
    }
  }
}

/* ───────────── files and screen ───────────── */

function save(name, value, { private: secret = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, secret ? { mode: 0o600 } : undefined);
  if (secret) fs.chmodSync(file, 0o600);
  return file;
}
/* One package per line, its reason under it: readable on a phone. */
function table(rows) {
  for (const r of rows) {
    console.log(`  ${String(r.status).padEnd(12)} ${r.package || r.flow}${r.package && r.flow ? `  (${r.flow})` : ''}`);
    if (r.detail) console.log(`  ${' '.repeat(12)} ${r.detail}`);
  }
}
async function confirm(question) {
  if (!process.stdin.isTTY) { console.log('Not a terminal, so nothing is written without --yes.'); return false; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(question)).trim()); } finally { rl.close(); }
}
function record(kind, report) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`Report: ${save(`flows-${kind}-${stamp}.json`, report)}`);
}

/* ───────────── run ───────────── */

console.log(`Flows update — ${cmd} · ${packages.length} packages in ${new Set(packages.map((p) => p.flowId)).size} flows${commit ? ` · repository ${commit.slice(0, 8)}` : ''}`);
token = await signIn();
const run = createFlowsUpdate({ packages, environment, commit }, { api, log: (s) => console.log(s), table, now: () => new Date().toISOString(), save, confirm });
let code = 0;
try {
  if (cmd === 'check') {
    const r = await run.check({ only: only.length ? only : null });
    record('check', r.report);
    code = r.current ? 0 : 1;
  } else if (cmd === 'apply') {
    const r = await run.apply({ only: only.length ? only : null, yes: args.includes('--yes') });
    if (!r.declined) record('apply', r.report);
    code = r.failed ? 1 : 0;
    /* A write can change a trigger's address; the deployed config files must then be rebuilt (scripts/config-build.mjs). */
    if (!r.declined) {
      try {
        const { keyPlan, readLive, compare, verdict } = await import('./lib/config-drift.mjs');
        const ledgerFile = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json');
        const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : null;
        const plan = keyPlan(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json'), 'utf8')));
        console.log(`\n${verdict(compare(await readLive(api, plan), ledger))}`);
      } catch (e) { console.log(`\nConfig drift check not run (${e.message}); run npm run config:drift.`); }
    }
  } else {
    const rows = await run.restore(backup);
    code = rows.some((x) => x.status !== 'RESTORED') ? 1 : 0;
  }
} catch (e) {
  console.error(`\n${e.message}`);
  code = 2;
}
process.exit(code);
