#!/usr/bin/env node
/**
 * config.local.js checker.
 *
 * WHY THIS EXISTS
 *   Pasting seventeen signed URLs into a config file by hand has one failure mode that is
 *   invisible afterwards: a URL that is perfectly well-formed but sits under the wrong key.
 *   The platform then calls a real flow that answers a real response for the wrong endpoint,
 *   and nothing looks broken until the data is wrong. Shape checks cannot catch that. Only
 *   comparing the workflow id inside each URL against the id that key is supposed to reach
 *   can, and that is what this does.
 *
 * IT NEVER PRINTS A URL
 *   A signed Power Automate URL is a bearer credential. This reads them, and reports endpoint
 *   KEYS, workflow IDS and verdicts only. Nothing it writes to the terminal can be pasted
 *   into a browser to invoke a flow. Run it, then paste its output anywhere you like.
 *
 * USAGE
 *   node scripts/check-config-local.mjs                     # config/config.local.js
 *   node scripts/check-config-local.mjs --portal            # document-portal/config.local.js
 *   node scripts/check-config-local.mjs path/to/config.local.js
 *
 * EXIT
 *   0 = every key is present, well-formed and points where it should
 *   1 = at least one blocking problem
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = JSON.parse(readFileSync(path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json'), 'utf8'));

const args = process.argv.slice(2);
const portal = args.includes('--portal');
const explicit = args.find((a) => !a.startsWith('--'));
const FILE = explicit
  ? path.resolve(process.cwd(), explicit)
  : path.join(ROOT, portal ? 'document-portal/config.local.js' : 'config/config.local.js');

const GLOBAL = portal ? 'PF_CONFIG' : 'DGO_CONFIG';
const EXPECT = portal ? MAP.portal : MAP.internal;

/* Keys the platform tolerates as unset, and why. Everything else empty is a blocking problem:
   an endpoint with no URL is one the platform cannot call at all. */
const OPTIONAL = portal
  ? { UPLOAD: 'attachments cannot be uploaded until this is set',
      WRITEBACK: 'citizens cannot respond to their own case until this is set' }
  : { SCAN_INTAKE: 'Registry Scan Intake reports itself unconfigured until this is set' };

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const problems = [];
const warnings = [];
const say = (s = '') => console.log(s);
const fail = (key, msg) => { problems.push({ key, msg }); say(`  ${C.r}✗${C.x} ${key.padEnd(24)} ${msg}`); };
const warn = (key, msg) => { warnings.push({ key, msg }); say(`  ${C.y}!${C.x} ${key.padEnd(24)} ${msg}`); };
const pass = (key, msg) => say(`  ${C.g}✓${C.x} ${key.padEnd(24)} ${C.d}${msg}${C.x}`);

say(`${C.b}config.local.js check${C.x}`);
say(`${C.d}${portal ? 'public document portal' : 'internal platform'} · ${path.relative(process.cwd(), FILE)}${C.x}\n`);

if (!existsSync(FILE)) {
  say(`${C.r}NOT FOUND${C.x} — there is no file at that path.`);
  say(`\nThere are two places a config.local.js lives, and this checks whichever you name:`);
  say(`  · the BUILT package   dist/dgo-${portal ? 'document-portal/config.local.js' : 'internal-platform/config/config.local.js'}`);
  say(`      written by:  npm run package -- --values <file> --no-estate`);
  say(`      check with:  npm run check:package${portal ? ':portal' : ''}`);
  say(`  · the REPO copy       ${portal ? 'document-portal/config.local.js' : 'config/config.local.js'}`);
  say(`      written by hand from ${portal ? 'document-portal/config.example.js' : 'config/config.example.js'}`);
  say(`      check with:  npm run check:config${portal ? ':portal' : ''}`);
  process.exit(1);
}

/* ---- 1 · does it load, and does it set the right global? ---- */
const raw = readFileSync(FILE, 'utf8');
const sandbox = { window: {} };
let cfg;
try {
  new Function('window', raw).call(sandbox, sandbox.window);
  const g = sandbox.window[GLOBAL];
  if (!g) throw new Error(`the file ran but never set window.${GLOBAL}`);
  cfg = g.endpoints;
  if (!cfg || typeof cfg !== 'object') throw new Error(`window.${GLOBAL} has no endpoints object`);
} catch (e) {
  say(`${C.r}THE FILE DOES NOT LOAD${C.x} — ${e.message}`);
  say(`\nMost common causes:`);
  say(`  · a missing comma between two entries, or a trailing comma after the last one`);
  say(`  · a URL pasted without its surrounding "quotes"`);
  say(`  · curly quotes from a word processor instead of straight ones`);
  say(`  · the file sets a different global — this platform needs window.${GLOBAL}`);
  process.exit(1);
}
pass('file', `loads and sets window.${GLOBAL}.endpoints`);

/* ---- 2 · per-key checks ---- */
/* Power Automate serves manual triggers under more than one path, and the estate's own record
   happens to contain only one of them. Hard-coding that one rejected perfectly valid URLs from
   the other forms, which is a checker defect, not a configuration error. All three are accepted:
     powerplatform.com   /powerautomate/automations/direct/workflows/<id>/triggers/manual/paths/invoke
     logic.azure.com     /workflows/<id>/triggers/manual/paths/invoke
     flow.microsoft.com  /providers/Microsoft.Flow/.../workflows/<id>/triggers/manual/paths/invoke
   The workflow id is what matters, and every form carries it in the same place. */
const SHAPE = /\/workflows\/([0-9a-fA-F]{32})\/triggers\/manual\/paths\/invoke\/?$/;
const NEEDED_QUERY = ['api-version', 'sp', 'sv', 'sig'];
/* A Power Automate trigger signature is ALWAYS 43 base64url characters — verified against all
   22 URLs in the live configs, and the same rule scripts/lib/endpoint-recovery.mjs applies.
   A shorter one is a URL that was copied before its end, which is the commonest paste error
   and the one that leaves a URL still looking plausible. */
const SIG = /^[A-Za-z0-9_-]{43}$/;
const seenHosts = new Set();
const idByKey = new Map();

say(`\n${C.b}Every key the platform reads${C.x}`);
for (const key of Object.keys(EXPECT)) {
  const v = cfg[key];

  if (v === undefined) { fail(key, 'missing from the file entirely'); continue; }
  if (typeof v !== 'string') { fail(key, `is a ${typeof v}, not a string`); continue; }
  if (v !== v.trim()) { fail(key, 'has leading or trailing whitespace inside the quotes'); continue; }
  if (/[\s ]/.test(v)) { fail(key, 'contains a space or line break — the URL was pasted broken across lines'); continue; }
  if (/[‘’“”]/.test(v)) { fail(key, 'contains a curly quote — retype the quotes as straight ones'); continue; }

  if (v === '') {
    if (OPTIONAL[key]) warn(key, `empty — ${OPTIONAL[key]}`);
    else fail(key, 'empty — the platform cannot call this endpoint at all');
    continue;
  }

  let u;
  try { u = new URL(v); } catch { fail(key, 'is not a URL — check it was pasted whole'); continue; }
  if (u.protocol !== 'https:') { fail(key, `uses ${u.protocol.replace(':', '')}, not https`); continue; }

  const m = SHAPE.exec(u.pathname);
  if (!m) {
    fail(key, `the path carries no /workflows/<id>/triggers/manual/paths/invoke — got `
      + `"${u.pathname.replace(/\/[0-9a-fA-F]{32}\//g, '/<id>/')}". Copy the URL from the flow's `
      + `"When an HTTP request is received" trigger, not from the browser address bar`);
    continue;
  }
  const id = m[1].toLowerCase();
  idByKey.set(key, id);
  seenHosts.add(u.host);

  const missingQ = NEEDED_QUERY.filter((q) => !u.searchParams.get(q));
  if (missingQ.length) { fail(key, `the URL is missing ?${missingQ.join(' and ?')} — it was truncated when copied`); continue; }
  const sig = u.searchParams.get('sig');
  if (!/^[A-Za-z0-9_-]+$/.test(sig)) {
    fail(key, 'the sig= value has characters outside base64url — something mangled it in transit');
    continue;
  }
  /* 43 characters is what every signature in this estate measures. A shorter one is almost
     always a URL copied before its end. It is reported as a warning rather than a failure,
     because that length was measured on one URL form and this now accepts three. */
  if (!SIG.test(sig)) {
    warn(key, `the sig= value is ${sig.length} characters; every signature measured in this `
      + `estate is 43. If this endpoint refuses the call, the URL was ${sig.length < 43
        ? 'copied before its end' : 'copied with something after it'}`);
  }

  const want = EXPECT[key].workflowId;
  if (!want) { warn(key, `points at ${id} · no id on record for this key, so it cannot be verified`); continue; }
  if (want !== id) {
    const owner = Object.entries({ ...MAP.internal, ...MAP.portal })
      .find(([, e]) => e.workflowId === id);
    fail(key, `points at the WRONG FLOW — expected ${want}, got ${id}`
      + (owner ? ` (that is ${owner[0]})` : ''));
    continue;
  }
  pass(key, `${EXPECT[key].flow || 'flow'} · ${id}`);
}

/* ---- 3 · keys the file sets that the platform never reads ---- */
const unknown = Object.keys(cfg).filter((k) => !(k in EXPECT));
if (unknown.length) {
  say(`\n${C.b}Keys in the file the platform does not read${C.x}`);
  for (const k of unknown) warn(k, 'not a key this platform reads — a typo, or left over from an older config');
}

/* ---- 4 · relationships between keys ---- */
say(`\n${C.b}How the keys relate${C.x}`);
if (seenHosts.size > 1) {
  const norm = new Set([...seenHosts].map((h) => h.replace(/:443$/, '')));
  if (norm.size > 1) fail('hosts', `keys point at ${norm.size} different environments — they should all be one`);
  else warn('hosts', 'some URLs carry :443 and some do not — harmless, but inconsistent');
} else if (seenHosts.size === 1) {
  pass('hosts', 'every key points at the same environment');
}

const shared = new Map();
for (const [k, id] of idByKey) {
  if (!shared.has(id)) shared.set(id, []);
  shared.get(id).push(k);
}
const expectedShared = new Map();
for (const [k, e] of Object.entries(EXPECT)) {
  if (!e.workflowId) continue;
  if (!expectedShared.has(e.workflowId)) expectedShared.set(e.workflowId, []);
  expectedShared.get(e.workflowId).push(k);
}
const confirmed = [];
let relOk = true;
for (const [id, ks] of shared) {
  if (ks.length < 2) continue;
  const want = (expectedShared.get(id) || []).filter((k) => idByKey.has(k)).sort().join(',');
  const got = [...ks].sort().join(',');
  if (!want) {
    /* Two keys share a URL and nothing on record says they should. That is either a deliberate
       reuse nobody wrote down, or the same URL pasted twice by mistake — and the second is the
       likelier. Reporting it as "correctly shared", which an earlier version of this check did,
       would hide exactly the error this tool exists to find. */
    relOk = false;
    warn('sharing', `${got} share one URL (${id}), and nothing on record says they should — `
      + 'check you did not paste the same URL under two keys');
  } else if (want !== got) {
    relOk = false;
    fail('sharing', `${got} share ${id} but the record says that flow serves ${want}`);
  } else {
    confirmed.push(ks.join(' + '));
  }
}
if (relOk) {
  pass('sharing', confirmed.length
    ? `${confirmed.length} URL(s) shared exactly as the record says: ${confirmed.join(' · ')}`
    : 'no two keys share a URL, as expected');
} else if (confirmed.length) {
  pass('sharing', `${confirmed.length} correctly shared: ${confirmed.join(' · ')}`);
}

/* ---- 5 · verdict ---- */
say(`\n${'─'.repeat(60)}`);
if (!problems.length && !warnings.length) {
  say(`${C.g}${C.b}READY.${C.x} Every key is present, well-formed, and points at the flow it should.`);
} else if (!problems.length) {
  say(`${C.y}${C.b}USABLE, with ${warnings.length} thing(s) to note.${C.x} Nothing blocks the platform.`);
} else {
  say(`${C.r}${C.b}${problems.length} problem(s) to fix.${C.x}${warnings.length ? ` ${warnings.length} note(s) besides.` : ''}`);
  say(`\nFix these first:`);
  for (const p of problems) say(`  · ${p.key} — ${p.msg}`);
}
say(`\n${C.d}Nothing above is a credential — no URL or signature was printed.${C.x}`);
process.exit(problems.length ? 1 : 0);
