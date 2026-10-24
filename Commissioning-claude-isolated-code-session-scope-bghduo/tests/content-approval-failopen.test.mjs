/* THE APPROVAL GATE MUST REFUSE ON EVERY ANSWER IT CANNOT READ.
 *
 * scripts/set-content-approval.browser.js turns SharePoint content approval off on a list of
 * 21,532 rows. Every row that was Pending becomes visible the moment it does. So the operator is
 * shown a count first, and the script refuses to write when that count is unknown.
 *
 * The refusal has now failed twice, both times by producing a NUMBER where it should have
 * produced "unknown", and both times that number was zero — the one answer that makes the change
 * look free.
 *
 *   First:  every state was queried with $filter on an unindexed column, which returns HTTP 500
 *           above the 5,000-item threshold. The counts were the string "unreadable (500)" and the
 *           total summed them as not-a-number: 0.
 *   Second: the rewrite paged the list instead, but read `(j.d && j.d.results) || []`. A 200
 *           carrying an OData error envelope, a throttling response, an empty body or an
 *           odata=nometadata shape has no `d.results`, so the page yielded no rows and the loop
 *           ended cleanly. Counts all zero, hidden 0 — a number — and the write proceeded.
 *
 * Both were found by review, not by a test, because the tests grepped the source for the words
 * of the fix. A guard that reads the code cannot see a value arriving through a path the code
 * does not recognise. So this one does not read the source: it RUNS the script against the
 * answers SharePoint actually gives and asserts that a write happens only on the one shape that
 * was fully counted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REAL = console;
const SRC = readFileSync(fileURLToPath(new URL('../scripts/set-content-approval.browser.js', import.meta.url)), 'utf8')
  .replace('const APPLY = false;', 'const APPLY = true;');   /* the gate only matters when APPLY is on */

const ITEM = 21532;
const rows = (n, f) => Array.from({ length: n }, (_, i) => ({ Id: i, OData__ModerationStatus: f(i) }));

/* Every one of these is a real SharePoint answer, not an invented one. */
const SHAPES = {
  'HTTP 500 — the unindexed-column refusal': { page: () => ({ ok: false, status: 500 }), write: false },
  '200 carrying an OData error envelope':    { page: () => ({ ok: true, json: async () => ({ error: { message: 'x' } }) }), write: false },
  '200 with an empty body':                  { page: () => ({ ok: true, json: async () => ({}) }), write: false },
  '200 in odata=nometadata shape':           { page: () => ({ ok: true, json: async () => ({ value: [] }) }), write: false },
  '200 but the tally is short':              { page: () => ({ ok: true, json: async () => ({ d: { results: rows(1, () => 0) } }) }), write: false },
  '200 with an unrecognised state value':    { page: () => ({ ok: true, json: async () => ({ d: { results: rows(ITEM, () => 9) } }) }), write: false },
  'fully counted — the only writable case':  { page: () => ({ ok: true, json: async () => ({ d: { results: rows(ITEM, (i) => (i < 6650 ? 0 : 2)) } }) }), write: true },
};

const run = async (page) => {
  let writes = 0; const logs = [];
  globalThis.window = {};
  globalThis.console = { log: (...a) => logs.push(a.join(' ')), group() {}, groupEnd() {} };
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (u.includes('$select=Title,EnableModeration')) return { ok: true, json: async () => ({ d: { Title: 'DGO DIGITAL OPS', EnableModeration: true, ItemCount: ITEM } }) };
    if (u.includes('contextinfo')) return { ok: true, json: async () => ({ d: { GetContextWebInformation: { FormDigestValue: 'x' } } }) };
    if (opt.headers && opt.headers['X-HTTP-Method'] === 'MERGE') { writes++; return { ok: true, text: async () => '' }; }
    if (u.includes('$select=EnableModeration')) return { ok: true, json: async () => ({ d: { EnableModeration: false } }) };
    return page();
  };
  eval(SRC);
  for (let i = 0; i < 500 && !globalThis.window.contentApproval; i++) await new Promise((r) => setTimeout(r, 0));
  globalThis.console = REAL;
  return { writes, logs };
};

let pass = 0; const failures = [];
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; REAL.log(`  ✅ ${label}`); }
  else { failures.push(label); REAL.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

REAL.log('\nContent approval refuses every answer it cannot read');

for (const [name, { page, write }] of Object.entries(SHAPES)) {
  const { writes, logs } = await run(page);
  if (write) {
    ok(`${name}: writes`, writes === 1, `expected one MERGE, saw ${writes}`);
  } else {
    ok(`${name}: no write`, writes === 0, `it turned approval off on ${ITEM} rows`);
    ok(`${name}: says UNKNOWN`, logs.some((l) => l.includes('UNKNOWN')), 'the operator was not told the count is unestablished');
    ok(`${name}: never prints a green zero`,
       !logs.some((l) => /\b0 row\(s\) are currently NOT approved/.test(l)),
       'it reported zero hidden rows without counting them');
  }
}

REAL.log(`\n${failures.length ? '❌' : '✅'} ${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
