#!/usr/bin/env node
// Start any platform in this repository, or all of them at once.
//
//   node scripts/run-platform.mjs --list        what can be run, and where it answers
//   node scripts/run-platform.mjs runtime       one platform
//   node scripts/run-platform.mjs portal console    several
//   node scripts/run-platform.mjs --all         every platform, each on its own port
//   node scripts/run-platform.mjs --group staff one group (public, staff, control)
//
// package.json exposes these as `npm run start:<id>` and `npm run start:all`; the platforms
// themselves are declared in scripts/platforms.config.mjs and nowhere else.
//
// WHAT THIS IS NOT
//
// It is not a backend and it answers no endpoint. The static platforms are served exactly as
// they sit in the tree — which is all they need, since all of them are zero-build — and the
// two Python platforms are started by their own code, unchanged. If you want the runtime and
// the portal on ONE origin with every endpoint they call answered from memory, that is
// `npm run dev` (scripts/dev-server.mjs), which is a different and complementary thing.
//
// Everything here binds loopback. The Workbench relay and the Capsule registry authenticate
// nothing and forward or hold credentials respectively; neither belongs on a routable
// interface, which is why --host is offered but warns.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { contentType } from './dev/mime.mjs';
import { Groups, Platforms, README_MARKERS, ROOT, ids, inGroup, markdownTable, platform, scriptName, url } from './platforms.config.mjs';

/* ------------------------------------------------------------------ *
 * Argument handling
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);

/* Positional arguments are platform ids. `--host` takes a value, so the token after it is
   consumed here rather than mistaken for an id — which is what a plain
   `filter(a => !a.startsWith('--'))` would do. */
const selected = [];
let HOST = process.env.DGO_RUN_HOST || 'localhost';
let GROUP = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--host') { HOST = argv[++i] ?? HOST; continue; }
  if (a === '--group') { GROUP = argv[++i] ?? ''; continue; }
  if (a.startsWith('--') || a === '-h') continue;
  selected.push(a);
}

const PROBE = !flag('--no-probe');

if (flag('--help') || flag('-h')) {
  usage();
  process.exit(0);
}

if (flag('--markdown')) {
  console.log(markdownTable());
  process.exit(0);
}

if (flag('--readme')) {
  const file = path.join(ROOT, 'README.md');
  const [begin, end] = README_MARKERS;
  const src = fs.readFileSync(file, 'utf8');
  const i = src.indexOf(begin), j = src.indexOf(end);
  if (i < 0 || j < i) { console.error('README.md has no platforms markers'); process.exit(1); }
  fs.writeFileSync(file, `${src.slice(0, i + begin.length)}\n${markdownTable()}\n${src.slice(j)}`);
  console.log('README.md platform table rewritten');
  process.exit(0);
}

if (flag('--list')) {
  list();
  process.exit(0);
}

if (GROUP !== null && !Groups.some(g => g.id === GROUP)) {
  console.error(`\n  Unknown group: ${GROUP}\n  Known: ${Groups.map(g => g.id).join(', ')}\n`);
  process.exit(2);
}

const wanted = flag('--all')
  ? [...Platforms]
  : GROUP !== null
  ? inGroup(GROUP)
  : selected.map(id => {
      const p = platform(id);
      if (!p) {
        console.error(`\n  Unknown platform: ${id}`);
        console.error(`  Known: ${ids().join(', ')}\n`);
        console.error(`  Run \`node scripts/run-platform.mjs --list\` for the full table.\n`);
        process.exit(2);
      }
      return p;
    });

if (wanted.length === 0) {
  usage();
  process.exit(2);
}

/* A Control platform never shares a group run with another group, and never binds a
   routable address as part of one. --all and explicit ids are unchanged. */
if (GROUP === 'control' && HOST !== 'localhost' && HOST !== '127.0.0.1' && HOST !== '::1') {
  console.error('\n  The control group binds loopback only. Drop --host.\n');
  process.exit(2);
}

/* A routable bind exposes an unauthenticated relay and a credential store to the network.
   Allowed, because a phone testing against a laptop is a real need, but never silently. */
if (HOST !== 'localhost' && HOST !== '127.0.0.1' && HOST !== '::1') {
  console.error(
    `\n  ⚠  Binding ${HOST}, not loopback.\n` +
    `     The Workbench relay forwards any HTTPS request it is given and checks no caller.\n` +
    `     The Capsule registry holds signed flow URLs and its bootstrap tokens.\n` +
    `     Neither authenticates. Do this on a trusted network only.\n`);
}

/* ------------------------------------------------------------------ *
 * Ports
 * ------------------------------------------------------------------ */

/**
 * Is this port already taken?
 *
 * Checked before anything is started, for every platform, because the readiness probe
 * cannot tell the difference between "the platform I just started is answering" and
 * "someone else's process was already on that port". Without this the Python platforms
 * report ready while their child is dying of EADDRINUSE in the background — observed, and
 * the reason this function exists rather than leaving it to each server's error handler.
 */
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, HOST === 'localhost' ? undefined : HOST);
  });
}

/* ------------------------------------------------------------------ *
 * Static platforms — served in this process, one http server per port
 * ------------------------------------------------------------------ */

/**
 * A static file server rooted at one directory, with the containment check that keeps a
 * request path from escaping it. No caching: a dev server that hands back a stale module
 * costs more time than it saves.
 */
function serveStatic(p) {
  const base = path.resolve(ROOT, p.serveFrom);

  const server = http.createServer((req, res) => {
    /* A malformed escape — `%zz`, a lone `%` — makes decodeURIComponent throw, and an
       uncaught throw in a request handler takes the whole server down. Anything that can
       reach this port can send one, so it is answered rather than raised. */
    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bad request: the path is not valid percent-encoding');
    }

    const full = path.resolve(base, urlPath.replace(/^\/+/, '') || 'index.html');

    if (full !== base && !full.startsWith(base + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }

    let target = full;
    try {
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    } catch {
      return notFound(res, urlPath);
    }

    fs.readFile(target, (err, buf) => {
      if (err) return notFound(res, urlPath);
      res.writeHead(200, {
        'Content-Type': contentType(target),
        'Cache-Control': 'no-store',
        'X-DGO-Platform': p.id,
      });
      res.end(buf);
    });
  });

  return new Promise((resolve) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        fail(p, `port ${p.port} is already in use — something else is serving it`);
      } else {
        fail(p, err.message);
      }
      resolve(null);
    });
    server.listen(p.port, HOST === 'localhost' ? undefined : HOST, () => resolve(server));
  });
}

function notFound(res, urlPath) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Not found: ${urlPath}`);
}

/* ------------------------------------------------------------------ *
 * Python platforms — started by their own code, in a child process
 * ------------------------------------------------------------------ */

/**
 * The interpreter to run the Workbench relay and the Capsule with.
 *
 * `python3` on everything but a default Windows install, where the launcher is `python` and
 * `python3` may be a Store shim that prints an advert and exits 9009. So each candidate is
 * asked for its version and must answer 3.x.
 */
let pythonCache;
function findPython() {
  if (pythonCache !== undefined) return pythonCache;
  for (const candidate of [process.env.DGO_PYTHON, 'python3', 'python'].filter(Boolean)) {
    try {
      const out = execFileSync(candidate, ['--version'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/^Python 3\./.test(out.trim())) return (pythonCache = candidate);
    } catch { /* not on PATH, or the Store shim — try the next one */ }
  }
  return (pythonCache = null);
}

function startChild(p) {
  /* A node platform runs on the interpreter running this script, so it needs no lookup. */
  const python = p.kind === 'node' ? process.execPath : findPython();
  if (!python) {
    skip(p, `${p.needs} not found on PATH (set DGO_PYTHON to name the interpreter)`);
    return null;
  }

  /* The interpreter named in `command` is nominal — findPython() decides what actually
     runs, so `python3` there is documentation of what the platform needs, not a path. */
  const [, args] = p.command;
  const cwd = path.resolve(ROOT, p.serveFrom);

  /* Whatever the platform declares it needs in its environment. A function gets the run
     context; a plain object is taken as-is. Nothing here knows which platform this is —
     see the `env` and `ensureEnvDirs` notes in scripts/platforms.config.mjs. */
  const declared = typeof p.env === 'function' ? p.env({ host: HOST }) : (p.env || {});
  const env = { ...process.env, DGO_RUN_HOST: HOST, ...declared };

  /* A service handed a path for its data will not necessarily create it, and the ones that
     do may create it world-readable. 0700 because what lands there is credentials. */
  for (const key of p.ensureEnvDirs || []) {
    if (env[key]) fs.mkdirSync(env[key], { recursive: true, mode: 0o700 });
  }

  const child = spawn(python, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  prefix(child.stdout, p.id);
  prefix(child.stderr, p.id);

  child.on('error', (err) => fail(p, err.message));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0 && code !== null) fail(p, `exited with code ${code}`);
    else if (signal) fail(p, `killed by ${signal}`);
  });

  return child;
}

/** Tag every line a child writes, so `--all` output stays readable with five of them. */
function prefix(stream, id) {
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (carry + chunk).split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) console.log(`  [${id}] ${line}`);
  });
  stream.on('end', () => { if (carry.trim()) console.log(`  [${id}] ${carry}`); });
}

/* ------------------------------------------------------------------ *
 * Readiness
 * ------------------------------------------------------------------ */

/**
 * Ask each platform for its entry point until it answers or the budget runs out.
 *
 * A listening socket is not the same as a working platform: a Python process can bind and
 * then die on an import, and a static root can be served with its entry file missing. The
 * probe is what turns "started" into "answers".
 */
async function probe(p, budgetMs = 8000) {
  const target = url(p, HOST);
  const deadline = Date.now() + budgetMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(2000) });
      /* The Capsule answers /health without a token; anything else it may 401, which still
         proves the service is up and routing. Only a transport failure means not ready. */
      if (res.status < 500) return { ok: true, status: res.status };
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.name === 'TimeoutError' ? 'timed out' : (err.cause?.code || err.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return { ok: false, detail: last };
}

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

const problems = [];
const skipped = [];
const fail = (p, detail) => { problems.push(`${p.name}: ${detail}`); console.error(`  ✖  ${p.name} — ${detail}`); };
const skip = (p, detail) => { skipped.push(`${p.name}: ${detail}`); console.error(`  –  ${p.name} — ${detail}`); };

function list() {
  console.log('\n  Platforms in this repository\n');
  const w = Math.max(...Platforms.map(p => p.id.length));
  for (const p of Platforms) {
    console.log(`  ${p.id.padEnd(w)}  ${String(p.port).padEnd(5)}  ${p.name}`);
    console.log(`  ${' '.repeat(w)}  ${' '.repeat(5)}  ${p.summary}`);
    console.log(`  ${' '.repeat(w)}  ${' '.repeat(5)}  npm run ${scriptName(p.id)}  →  ${url(p)}   (${p.needs})`);
    if (p.note) console.log(`  ${' '.repeat(w)}  ${' '.repeat(5)}  ${p.note}`);
    console.log('');
  }
  console.log(`  npm run start:all   starts all ${Platforms.length} at once.\n`);
}

function usage() {
  console.log(`
  Start a platform from this repository.

    node scripts/run-platform.mjs <id> [<id>...]   start the named platforms
    node scripts/run-platform.mjs --all            start every platform
    node scripts/run-platform.mjs --group <g>      start one group: public, staff or control
    node scripts/run-platform.mjs --list           what can be run, and where

  Options
    --host <name>   bind something other than localhost (warns; see the header of this file)
    --no-probe      do not wait for each platform to answer before reporting

  Platforms: ${ids().join(', ')}
`);
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

let shuttingDown = false;
const servers = [];
const children = [];
/* platform id -> child process, so readiness can ask whether the process is still alive. */
const childOf = new Map();

async function main() {
  console.log(`\n  Starting ${wanted.length} platform${wanted.length === 1 ? '' : 's'}\n`);

  /* An entry point that is not on disk is worth saying out loud before a port is bound:
     a served-but-empty root produces a 404 in a browser and no explanation anywhere. */
  const started = [];
  for (const p of wanted) {
    if (!fs.existsSync(path.resolve(ROOT, p.entry))) {
      fail(p, `${p.entry} is missing from the checkout`);
      continue;
    }
    if (await portInUse(p.port)) {
      fail(p, `port ${p.port} is already in use — stop whatever holds it, or run the others`);
      continue;
    }
    if (p.kind === 'static') {
      const server = await serveStatic(p);
      if (server) { servers.push(server); started.push(p); }
    } else {
      const child = startChild(p);
      if (child) { children.push(child); childOf.set(p.id, child); started.push(p); }
    }
  }

  if (started.length === 0) {
    console.error('\n  Nothing started.\n');
    process.exit(1);
  }

  const results = PROBE
    ? await Promise.all(started.map(async (p) => {
        /* A child that has already exited cannot be the thing answering on its port, so
           there is nothing worth probing — say what happened instead of asking the socket. */
        const child = childOf.get(p.id);
        if (child && child.exitCode !== null) {
          return { p, r: { ok: false, detail: `the process exited with code ${child.exitCode}` } };
        }
        return { p, r: await probe(p) };
      }))
    : started.map(p => ({ p, r: { ok: true, status: null } }));

  console.log('');
  for (const { p, r } of results) {
    if (r.ok) console.log(`  ✅  ${p.name.padEnd(28)} ${url(p, HOST)}`);
    else fail(p, `started but did not answer at ${url(p, HOST)} (${r.detail})`);
  }

  if (skipped.length) {
    console.log(`\n  Not started (${skipped.length}):`);
    for (const s of skipped) console.log(`    – ${s}`);
  }

  console.log(`\n  Ctrl-C to stop ${started.length === 1 ? 'it' : 'them all'}.\n`);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  ${signal} — stopping ${servers.length + children.length}…`);
  for (const s of servers) s.close();
  for (const c of children) c.kill('SIGTERM');
  /* Give a child a moment to close its listener, then stop waiting for it. */
  setTimeout(() => {
    for (const c of children) if (!c.killed) c.kill('SIGKILL');
    process.exit(problems.length ? 1 : 0);
  }, 1500).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await main();
