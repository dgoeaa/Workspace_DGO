#!/usr/bin/env node
/**
 * Generate the phone harvester: one `javascript:` URL, with the endpoint register baked in.
 *
 * WHY A BOOKMARKLET AND NOT THE CONSOLE HARVESTER
 *   `scripts/harvest-trigger-urls.browser.js` needs a devtools console. Chrome for Android has
 *   none, and remote debugging needs the laptop the phone runbook exists to do without. A
 *   bookmark whose URL begins `javascript:` is the one way a phone browser will run your code
 *   on a page you are signed into — so the same harvest, reshaped into one line.
 *
 * WHY GENERATED
 *   Same reason as the console harvester: the 25 keys and their workflow ids cannot be read
 *   from the repository at run time, so they travel inside the artifact. Generating that block
 *   from docs/reference/endpoint-register.json is what stops it drifting from the authority.
 *
 * WHAT THIS DOES TO THE TEMPLATE, AND WHY EACH STEP IS SAFE
 *   1. Drops everything above the payload marker — the template's header is for the reader of
 *      the template, and would otherwise be ~3 KB of percent-encoded prose in a bookmark.
 *   2. Drops whole-line comments and leading indentation. Whole-line only: a line is removed
 *      just when the entire line is a comment, so `'https://…'` inside a string is untouched —
 *      the naive `//.*$` strip would eat the API host and leave a syntax error. Nothing is
 *      joined onto anything, so there is no automatic-semicolon hazard either.
 *   3. Percent-encodes the result. That, not minification, is what makes it one line: newlines
 *      become %0A and the bookmark field takes it verbatim.
 *   4. Parses the payload before writing. A bookmarklet that does not parse fails silently in
 *      the address bar — no error, no overlay, nothing — so the build refuses to emit one.
 *
 *   node scripts/build-harvest-bookmarklet.mjs           # write
 *   node scripts/build-harvest-bookmarklet.mjs --check    # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const TEMPLATE = 'scripts/lib/harvest-bookmarklet.template.js';
const OUT = 'scripts/harvest-trigger-urls.bookmarklet.txt';
const MARKER = '/* BOOKMARKLET PAYLOAD BEGINS';

/* Chrome stores far longer URLs than this, but a bookmark nobody can paste is no use: the ceiling
   is here so that a change which doubles the payload is a build failure with a reason, not a
   bookmark that silently stops working on one device.

   RAISED FROM 24K. The payload now carries a second identifier domain — the tenant flow ids the
   management API actually addresses, which are not derivable from the workflow ids the register
   holds — and hooks the portal's traffic instead of guessing a host and a token. That is about
   6K, and it is what makes the difference between a bookmarklet that resolves twenty flows and
   the one before it, which resolved none. Squeezing under the old number by shortening flow names
   would have been optimising against a figure that was never a platform limit.

   The canary still works: the build prints its headroom, so the next change that doubles anything
   is still visible before it ships. */
const MAX_BYTES = 32 * 1024;

const register = JSON.parse(readFileSync(join(ROOT, 'docs/reference/endpoint-register.json'), 'utf8'));
const crosswalk = JSON.parse(readFileSync(join(ROOT, 'docs/reference/flow-identity-crosswalk.json'), 'utf8'));
const endpoints = Object.values(register.current_configuration)
  .map(e => ({ key: e.key, workflow_id: e.workflow_id, flow_name: e.flow_name }));

/* Keyed by APPLICATION WORKFLOW ID rather than by contract key, because the payload's loop is per
   flow: twenty flows serve twenty-five keys, and two keys on one flow share its one URL. Keys that
   share a workflow necessarily share its candidates, so the union is the same set and the block is
   twenty rows instead of twenty-five. On a bookmarklet that difference is real. */
const candidates = {};
const rowByContractKey = new Map(crosswalk.keys.map(k => [k.contractKey, k]));
for (const e of endpoints) {
  const row = rowByContractKey.get(e.key);
  if (!row) {
    console.error(`❌ ${e.key} has no row in the crosswalk — run: npm run crosswalk`);
    process.exit(1);
  }
  /* The register and the crosswalk are built to agree about which application workflow a key
     expects. If they ever stop, this would address by one and verify against the other, so it
     refuses to emit rather than emit something subtly wrong. */
  if (row.applicationWorkflowId !== e.workflow_id) {
    console.error(`❌ ${e.key}: the register says workflow ${e.workflow_id}, the crosswalk says ${row.applicationWorkflowId}`);
    process.exit(1);
  }
  const ids = candidates[e.workflow_id] || (candidates[e.workflow_id] = []);
  for (const c of row.candidates) if (!ids.includes(c.tenantFlowId)) ids.push(c.tenantFlowId);
}

const template = readFileSync(join(ROOT, TEMPLATE), 'utf8');
const markerAt = template.indexOf(MARKER);
if (markerAt === -1) {
  console.error(`❌ ${TEMPLATE} has no payload marker — expected a line beginning "${MARKER}"`);
  process.exit(1);
}
const afterMarker = template.slice(template.indexOf('\n', markerAt) + 1);

const payload = afterMarker
  .split('\n')
  .filter(line => !/^\s*(\/\/|\/\*.*\*\/\s*$)/.test(line))
  .map(line => line.replace(/^[ \t]+/, ''))
  .filter(line => line.trim() !== '')
  .join('\n')
  .replace('__ENDPOINTS__', JSON.stringify(endpoints))
  .replace('__CANDIDATES__', JSON.stringify(candidates));

if (/__[A-Z_]+__/.test(payload) || !payload.includes(endpoints[0].workflow_id)) {
  const left = (payload.match(/__[A-Z_]+__/) || ['the endpoint block'])[0];
  console.error(`❌ ${left} was not substituted into ${TEMPLATE}`);
  process.exit(1);
}

/* Parse it. `new Function` compiles without running, which is the whole check: the browser
   APIs it names are never touched here. */
try {
  new Function(payload); // eslint-disable-line no-new-func
} catch (err) {
  console.error(`❌ the generated payload does not parse: ${err.message}`);
  process.exit(1);
}

/* `void 0` keeps the completion value undefined. A `javascript:` URL that evaluates to a string
   replaces the document with it — the classic way a bookmarklet blanks the page it was run on. */
const rendered = `javascript:${encodeURIComponent(`${payload.replace(/;\s*$/, '')};void 0;`)}\n`;

const size = Buffer.byteLength(rendered);
if (size > MAX_BYTES) {
  console.error(`❌ ${OUT} would be ${size} bytes, over the ${MAX_BYTES} ceiling`);
  process.exit(1);
}
const headroom = MAX_BYTES - size;

const distinct = new Set(endpoints.map(e => e.workflow_id)).size;
const addressable = Object.values(candidates).filter(ids => ids.length).length;
const unaddressable = Object.entries(candidates).filter(([, ids]) => !ids.length).map(([id]) => id);

if (CHECK) {
  let cur = null;
  try { cur = readFileSync(join(ROOT, OUT), 'utf8'); } catch { /* absent */ }
  if (cur !== rendered) {
    console.error(`❌ ${OUT} is stale — run: npm run harvest:bookmarklet`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${endpoints.length} keys across ${distinct} flows, ${Buffer.byteLength(rendered)} bytes, no devtools needed`);
} else {
  writeFileSync(join(ROOT, OUT), rendered);
  console.log(`Wrote ${OUT}`);
  console.log(`  contract keys : ${endpoints.length}`);
  console.log(`  distinct flows: ${distinct}`);
  console.log(`  bookmark size : ${size} bytes (${headroom} under the ${MAX_BYTES} ceiling)`);
  console.log(`\n  On the phone:  termux-clipboard-set < ${OUT}`);
  console.log('                 then paste it into a bookmark\'s URL field in Chrome.');
}
