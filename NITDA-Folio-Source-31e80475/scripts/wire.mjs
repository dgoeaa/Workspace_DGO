#!/usr/bin/env node
/**
 * Wire the endpoints and say whether it worked. One command.
 *
 *   npm run wire                              # values from the environment
 *   npm run wire -- --values ~/dgo-values.txt  # values from a file
 *   npm run wire -- --dry                      # report only, change nothing
 *
 * WHY THIS EXISTS
 *
 * The commissioning path is four commands in a fixed order, and three of them are easy to get
 * wrong in ways that report success:
 *
 *   - `npm run setup` without `--force` prints "already exists — left untouched" and exits 0.
 *     Read quickly, that is indistinguishable from "wired".
 *   - `npm run setup --force` with NO values rewrites both configs from nothing, so a
 *     working tree that was wired becomes a working tree that is not, and still exits 0.
 *   - `npm run check:config` has to be run twice, once per surface, and the portal one is
 *     the one people forget.
 *
 * So the order is fixed here rather than in a reader's memory, and the one destructive
 * combination — `--force` with nothing to write — is refused instead of performed.
 *
 * It composes the existing tools and replaces none of them. Every check below is the same
 * script the documented path runs; this decides what to run and in what order.
 *
 * IT NEVER PRINTS A URL. A signed trigger URL is a bearer credential. This reports key
 * names, counts and verdicts, so its output is safe to paste into a ticket.
 *
 * Exit: 0 wired and checked · 1 wired but a check objected · 2 nothing to wire
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_ENDPOINTS, PORTAL_ENDPOINTS } from './lib/endpoint-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/* `--values <file>` is the route for a workstation, where the values live in a file rather
   than the environment. Without it this command only worked where a secret had been set,
   which meant the hosted path had one command and the local path still had four. */
const VALUES_FILE = (() => {
  const i = process.argv.indexOf('--values');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

const node = (args, opts = {}) =>
  spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', ...opts });

/* ------------------------------------------------------------------ *
 * 1. Where are the values coming from?
 * ------------------------------------------------------------------ */

const KEYS = [...new Set([...RUNTIME_ENDPOINTS, ...PORTAL_ENDPOINTS].map(e => e.key))];

/** A key counts as supplied if it is set and carries something after `sig=`. */
const signed = (v) => typeof v === 'string' && v.length > 0 && !/[?&]sig=(?:$|&)/.test(v);

function fromEnvVars() {
  const found = {};
  for (const key of KEYS) {
    for (const name of [`DGO_ENDPOINT_${key}`, `PF_ENDPOINT_${key}`, key]) {
      if (process.env[name]) { found[key] = process.env[name]; break; }
    }
  }
  return found;
}

/**
 * The key as the endpoint surface names it, from the name a values file uses.
 *
 * `npm run values:template` writes PREFIXED names — `DGO_ENDPOINT_FETCH_ALL` for the
 * eighteen internal keys, `PF_ENDPOINT_SUBMISSION` for the seven portal ones — because
 * that is what the environment-variable route needs. setup.mjs accepts prefixed and bare
 * alike. This must too: matching only bare names means a values file produced by this
 * repository's own template reports as "no values found" and this refuses to wire it.
 */
function bareKey(name) {
  for (const prefix of ['DGO_ENDPOINT_', 'PF_ENDPOINT_']) {
    if (name.startsWith(prefix) && KEYS.includes(name.slice(prefix.length))) {
      return name.slice(prefix.length);
    }
  }
  return KEYS.includes(name) ? name : null;
}

/**
 * The values file, carried whole in one variable.
 *
 * `DGO_VALUES_B64` is the same content base64-encoded, and is the form to prefer for a
 * hosted secret: it is one line with no newlines, no `&`, no `%` and no quoting, so it
 * cannot be mangled by whatever sits between the clipboard and the container. Decoded
 * first, so a caller who sets both gets the plain one as the override.
 */
function fromBundle() {
  const raw = process.env.DGO_VALUES
    || (process.env.DGO_VALUES_B64
        ? Buffer.from(process.env.DGO_VALUES_B64, 'base64').toString('utf8')
        : '');
  if (!raw) return {};
  const found = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = bareKey(m[1]);
    if (key) found[key] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return found;
}

/** The named values file. Same format and same parser as everything else reads. */
function fromFile() {
  if (!VALUES_FILE) return {};
  const abs = path.resolve(VALUES_FILE.replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(abs)) {
    console.error(`\n  ✖  Values file not found: ${abs}\n`);
    process.exit(2);
  }
  const found = {};
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = bareKey(m[1]);
    if (key) found[key] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return found;
}

/* Ordered least to most deliberate: a secret set months ago is ambient, a file named on the
   command line right now is an instruction. Later entries win. */
const sources = [
  { name: 'DGO_ENDPOINT_* environment variables', values: fromEnvVars() },
  { name: 'DGO_VALUES / DGO_VALUES_B64 (one secret, the whole values file)', values: fromBundle() },
  { name: VALUES_FILE ? `--values ${VALUES_FILE}` : '--values', values: fromFile() },
];

const supplied = {};
for (const s of sources) Object.assign(supplied, s.values);

const present = Object.keys(supplied);
const unsigned = present.filter(k => !signed(supplied[k]));

console.log('\n  Wiring the endpoint estate\n');

for (const s of sources) {
  const n = Object.keys(s.values).length;
  if (n) console.log(`  ·  ${n.toString().padStart(2)} key(s) from ${s.name}`);
}

/* ------------------------------------------------------------------ *
 * 2. Refuse the destructive no-op
 * ------------------------------------------------------------------ */

if (present.length === 0) {
  console.error(`
  ✖  No endpoint values found, so there is nothing to wire.

     Writing the configs anyway would blank whatever is already there, so this stops
     instead. The platform still RUNS without them — it boots, renders and transmits
     nothing. That is demo mode, and it is the intended state for a fresh clone.

     To supply values, pick one:

       In a Codespace — one repository secret, set once:
         npm run values:template ~/dgo-values.txt    # on your own machine
         …fill in each signature, then paste the whole file as the secret DGO_VALUES
         https://github.com/settings/codespaces

       On your own machine — a file:
         npm run values:template ~/dgo-values.txt
         npm run values:sign -- ~/dgo-values.txt FETCH_ACTIVITIES   # once per key
         npm run check:values -- ~/dgo-values.txt
         npm run setup -- --values ~/dgo-values.txt --force

     The full procedure is docs/deployment/RUNBOOK.md.
`);
  process.exit(2);
}

console.log(`\n  ${present.length} of ${KEYS.length} keys supplied.`);
if (unsigned.length) {
  const verb = unsigned.length === 1 ? 'ends' : 'end';
  console.log(`  ${unsigned.length} still ${verb} at a bare "sig=" and will not authenticate:`);
  for (const k of unsigned) console.log(`      ·  ${k}`);
}

if (DRY) {
  console.log(`\n  --dry: nothing written. Drop --dry to wire.\n`);
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * 3. Write both configs
 * ------------------------------------------------------------------ */

/* --force, because values were found: this is an unambiguous request to write them, and
   without it setup leaves an existing config untouched and still exits 0. The refusal
   above is what makes --force safe here — it cannot be reached with nothing to write. */
console.log('\n  ── setup ──');
const setupArgs = ['scripts/setup.mjs', '--force'];
if (VALUES_FILE) setupArgs.push('--values', VALUES_FILE);
const setup = node(setupArgs, { stdio: 'inherit' });
if (setup.status !== 0) {
  console.error(`\n  ✖  setup exited ${setup.status}. Nothing further was run.\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 4. Check both surfaces — the portal one is the one people forget
 * ------------------------------------------------------------------ */

const checks = [
  { label: 'internal runtime', args: ['scripts/check-config-local.mjs'] },
  { label: 'public portal', args: ['scripts/check-config-local.mjs', '--portal'] },
];

const failed = [];
for (const c of checks) {
  console.log(`\n  ── check: ${c.label} ──`);
  const r = node(c.args, { stdio: 'inherit' });
  if (r.status !== 0) failed.push(c.label);
}

/* ------------------------------------------------------------------ *
 * 5. One verdict
 * ------------------------------------------------------------------ */

const wrote = ['config/config.local.js', 'document-portal/config.local.js']
  .filter(f => fs.existsSync(path.join(ROOT, f)));

console.log(`\n  ────────────────────────────────────────────────────────────`);
console.log(`  Wrote: ${wrote.join('  ')}`);
console.log(`  Both are git-ignored. Neither can be committed.`);

if (failed.length) {
  const missing = KEYS.length - present.length;
  console.log(`\n  ✖  ${failed.join(' and ')} did not pass ${failed.length === 1 ? 'its check' : 'their checks'}.`);
  if (missing > 0) {
    console.log(`     ${missing} of ${KEYS.length} keys were never supplied, so those endpoints are empty.`);
    console.log(`     An empty key is inert — the platform cannot call it at all.`);
  }
  console.log(`     Read the verdicts above. "WRONG FLOW" is the serious one: that key is`);
  console.log(`     wired to a real flow, which will answer a real response for the wrong`);
  console.log(`     endpoint, and nothing will look broken until the data is.\n`);
  process.exit(1);
}

console.log(`\n  ✅ Both surfaces wired and checked.\n`);
console.log(`  Next:  npm run verify:endpoints   # call each flow, report what came back`);
console.log(`         npm run commission         # readiness gate for live usage`);
console.log(`         npm run start:all          # run the platforms\n`);
process.exit(0);
