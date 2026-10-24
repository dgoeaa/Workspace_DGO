#!/usr/bin/env node
/**
 * Run the Step 3 retirement script against a fake tenant.
 *
 * WHY THIS IS EXECUTED AND NOT GREPPED
 *
 * The other browser scripts in this estate are guarded by asserting that certain strings survive
 * in the emitted file. That is enough for a script whose worst outcome is creating a column that
 * already existed. This one deletes SharePoint lists, two of which carry items, and a delete is
 * not undoable from the console. `/I_HAVE_THE_EXPORT/.test(src)` would have passed happily while
 * the check sat AFTER the delete loop — which is exactly where it first was, printing "NOTHING
 * WAS DELETED" having just deleted everything.
 *
 * A guard is only a guard if it stops the thing. So this stands up a fake SharePoint — fetch,
 * location, document, URL, Blob — runs the real emitted file in each mode, and asserts on the
 * requests it actually made.
 *
 * Usage:  node tests/governance-retirement.test.mjs
 * Exit:   0 = every guard holds, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/retire-duplicate-governance-lists.browser.js');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/governance-list-registry.json'), 'utf8'));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const SITE = `${registry.decision.authoritativeSite.split('/sites/')[0]}/sites/${registry.retire[0].site}`;
const src = fs.readFileSync(SCRIPT, 'utf8');

/**
 * Run the emitted script with the given MODE and acknowledgement, against a tenant where every
 * duplicate exists and `renamedGuids` are already prefixed.
 *
 * Returns every request it made, so an assertion can be about what it DID rather than what it
 * contains.
 */
async function run({ mode, ack = false, renamed = new Set(), href = `${SITE}/SitePages/Home.aspx` }) {
  const calls = [];
  const titleOf = (guid) => {
    const row = registry.retire.find((r) => r.listGuid === guid);
    return renamed.has(guid) ? `ZZ_RETIRED_${row.listTitle}` : row.listTitle;
  };

  const fetchStub = async (url, init = {}) => {
    const method = init.method || 'GET';
    const override = init.headers?.['X-HTTP-Method'] || '';
    calls.push({ url, method, override, body: init.body });

    if (url.includes('/contextinfo')) {
      return { ok: true, status: 200, headers: new Map(), json: async () => ({ d: { GetContextWebInformation: { FormDigestValue: 'digest' } } }) };
    }
    const guid = /lists\(guid'([0-9a-f-]{36})'\)/.exec(url)?.[1];
    if (guid && url.includes('/items')) {
      return { ok: true, status: 200, headers: new Map(), json: async () => ({ value: [{ Id: 1, Title: 'row' }] }) };
    }
    if (guid) {
      if (override === 'MERGE' || override === 'DELETE') {
        return { ok: true, status: 200, headers: new Map(), text: async () => '', json: async () => ({}) };
      }
      return {
        ok: true, status: 200, headers: new Map(),
        json: async () => ({ Title: titleOf(guid), ItemCount: 6, LastItemModifiedDate: '2026-08-01T00:00:00Z' }),
      };
    }
    return { ok: false, status: 404, headers: new Map(), text: async () => '{"odata.error":{"message":{"value":"not found"}}}' };
  };

  const logs = [];
  const sandbox = {
    fetch: fetchStub,
    location: { href, origin: SITE.split('/sites/')[0], pathname: '/x' },
    document: { createElement: () => ({ click() {}, remove() {}, set href(_) {}, set download(_) {} }), body: { appendChild() {} } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class { constructor() {} },
    setTimeout,
    console: {
      log: (...a) => logs.push(String(a[0])),
      warn: (...a) => logs.push(String(a[0])),
      error: (...a) => logs.push(String(a[0])),
      table: (rows) => logs.push(JSON.stringify(rows)),
      group: () => {}, groupEnd: () => {},
    },
  };
  sandbox.globalThis = sandbox;

  const patched = src
    .replace(/^const MODE = '[a-z]+';/m, `const MODE = '${mode}';`)
    .replace(/^const I_HAVE_THE_EXPORT = (?:true|false);/m, `const I_HAVE_THE_EXPORT = ${ack};`);

  const ctx = vm.createContext(sandbox);
  await vm.runInContext(`(async () => { ${patched} })()`, ctx, { timeout: 20_000 });
  /* the emitted IIFE is not awaited by the wrapper; drain the microtask queue */
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const writes = calls.filter((c) => c.override === 'MERGE' || c.override === 'DELETE');
  const deletes = calls.filter((c) => c.override === 'DELETE');
  return { calls, writes, deletes, logs: logs.join('\n') };
}

console.log('\nStep 3 retirement — run against a fake tenant\n');

const allGuids = new Set(registry.retire.map((r) => r.listGuid));

check('the emitted script and the registry name the same duplicates', () => {
  const named = [...src.matchAll(/"guid": "([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const targets = named.filter((g) => allGuids.has(g));
  assert(targets.length === registry.retire.length,
    `the script names ${targets.length} of the registry's ${registry.retire.length} duplicates`);
});

check('no authoritative list GUID is ever a target', () => {
  const keep = new Set(registry.lists.map((l) => l.listGuid));
  const overlap = [...allGuids].filter((g) => keep.has(g));
  assert(overlap.length === 0, `${overlap.length} GUID(s) are in both sets: ${overlap.join(', ')}`);
});

const results = {};
for (const spec of [
  ['survey', { mode: 'survey' }],
  ['export', { mode: 'export' }],
  ['deleteNoAck', { mode: 'delete', ack: false, renamed: allGuids }],
  ['deleteNotRenamed', { mode: 'delete', ack: true, renamed: new Set() }],
  ['deleteReady', { mode: 'delete', ack: true, renamed: allGuids }],
  ['rename', { mode: 'rename' }],
  ['onAuthoritative', { mode: 'delete', ack: true, renamed: allGuids, href: `${registry.decision.authoritativeSite}/x.aspx` }],
]) {
  results[spec[0]] = await run(spec[1]);
}

check('survey writes nothing', () => {
  assert(results.survey.writes.length === 0,
    `survey made ${results.survey.writes.length} write(s) — it is documented as read-only`);
});

check('export writes nothing', () => {
  assert(results.export.writes.length === 0,
    `export made ${results.export.writes.length} write(s) — it is a backup, it must not mutate`);
});

check('delete without the backup acknowledgement deletes NOTHING', () => {
  /* The defect this test was written for: the check sat after the loop, so every list was
     already gone by the time the refusal printed. */
  assert(results.deleteNoAck.deletes.length === 0,
    `${results.deleteNoAck.deletes.length} list(s) were deleted with I_HAVE_THE_EXPORT = false`);
  assert(results.deleteNoAck.writes.length === 0,
    'a write was made despite the missing acknowledgement');
  assert(/NOTHING WAS DELETED/.test(results.deleteNoAck.logs),
    'the refusal was silent — an operator would not know why nothing happened');
});

check('delete refuses a list that was never renamed', () => {
  assert(results.deleteNotRenamed.deletes.length === 0,
    `${results.deleteNotRenamed.deletes.length} un-renamed list(s) were deleted — the soak period can be skipped`);
  assert(/REFUSED — NOT RENAMED/.test(results.deleteNotRenamed.logs),
    'the refusal is not reported per list');
});

check('delete proceeds only when renamed AND acknowledged', () => {
  assert(results.deleteReady.deletes.length === registry.retire.length,
    `${results.deleteReady.deletes.length} of ${registry.retire.length} deleted when both preconditions hold`);
  /* and every delete addressed a GUID, never a title */
  const byTitle = results.deleteReady.deletes.filter((c) => !/lists\(guid'[0-9a-f-]{36}'\)/.test(c.url));
  assert(byTitle.length === 0, `${byTitle.length} delete(s) did not address a list GUID`);
});

check('rename prefixes, and never deletes', () => {
  assert(results.rename.deletes.length === 0, 'rename issued a DELETE');
  assert(results.rename.writes.length === registry.retire.length,
    `rename wrote ${results.rename.writes.length} of ${registry.retire.length} lists`);
  const bad = results.rename.writes.filter((c) => !String(c.body).includes('ZZ_RETIRED_'));
  assert(bad.length === 0, `${bad.length} rename(s) did not apply the ZZ_RETIRED_ prefix`);
});

check('pasted on the authoritative site it refuses to do anything', () => {
  assert(results.onAuthoritative.writes.length === 0,
    `${results.onAuthoritative.writes.length} write(s) were made while on the authoritative site`);
  assert(/STOP/.test(results.onAuthoritative.logs), 'the wrong-site refusal was silent');
});

check('every target is addressed by GUID, never by title', () => {
  const titled = results.survey.calls.filter((c) => /getByTitle/i.test(c.url));
  assert(titled.length === 0,
    `${titled.length} request(s) addressed a list by title — the duplicates share titles with the lists being kept`);
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
