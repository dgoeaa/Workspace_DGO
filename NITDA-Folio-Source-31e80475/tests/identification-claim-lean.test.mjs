/**
 * The lean Claim Reference (ITEM-79) gives the same result as the full one, in fewer actions.
 *
 * DYNAMIC_ACTIONS was refused by the service at 551 actions (limit 500); its two claims now use claimReference({ lean }).
 * Each case runs the full and the lean block on the same counter list and compares Compose_Claim_<tag>:
 *   1. a counter row exists: the next number
 *   2. no row for the year: attempt 1 creates it
 *   3. a contested claim: the first two claims are refused (412), the third wins
 *   4. a floor above the counter: the claim issues above the floor
 *   5. every attempt fails: ok false, no references (the host answers 503)
 * and checks the lean block's action count.
 */
import { Simulator } from '../scripts/lib/wdl-sim.mjs';
import { claimReference } from '../scripts/lib/identification-kit.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nLean Claim Reference (ITEM-79)\n');

const SEQ = 'seq-list', REG = 'reg-list';
const bindings = { DATASET_SEQUENCE_COUNTERS_SITE_URL: 'https://site', DATASET_SEQUENCE_COUNTERS_LIST_ID: SEQ,
  DATASET_INTAKE_REGISTER_SITE_URL: 'https://site', DATASET_INTAKE_REGISTER_LIST_ID: REG };
const count = (a) => Object.values(a || {}).reduce((n, x) => n + 1 + count(x.actions) + (x.else ? count(x.else.actions) : 0), 0);

function run(lean, seed, { refuse = 0, failAll = false, floor = false } = {}) {
  const db = structuredClone(seed);
  let refused = 0, id = 100;
  const http = (p) => {
    const method = p['parameters/method'], uri = decodeURIComponent(p['parameters/uri']), h = p['parameters/headers'] || {};
    let body = p['parameters/body']; if (typeof body === 'string') body = JSON.parse(body);
    if (failAll) return { ok: false, statusCode: 503, message: 'simulated outage' };
    const m = /lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?(?:\?(.*))?$/.exec(uri);
    const [, table, itemId, query] = m;
    if (method === 'GET') {
      const f = decodeURIComponent((/\$filter=([^&]+)/.exec(query || '') || [])[1] || '');
      const prefix = (/Prefix eq '([^']+)'/.exec(f) || [])[1];
      const rows = (db[table] || []).filter((r) => (prefix ? r.Prefix === prefix : true));
      if (table === REG) { const top = rows.map((r) => r.ReferenceId).sort().reverse(); return { body: { value: top.slice(0, 1).map((ReferenceId) => ({ ReferenceId })) } }; }
      return { body: { value: rows.map((r) => ({ ...r })) } };
    }
    if (method === 'POST' && itemId) {
      const row = db[table].find((r) => String(r.ID) === itemId);
      if (refused < refuse) { refused++; row['odata.etag'] = `"${Number(row['odata.etag'].replace(/"/g, '')) + 1}"`; return { ok: false, statusCode: 412, message: 'etag' }; }
      if (h['IF-MATCH'] !== row['odata.etag']) return { ok: false, statusCode: 412, message: 'etag' };
      Object.assign(row, body); row['odata.etag'] = `"${Number(row['odata.etag'].replace(/"/g, '')) + 1}"`;
      return { statusCode: 204, body: null };
    }
    if (method === 'POST') { if ((db[table] || []).some((r) => r.Title === body.Title)) return { ok: false, statusCode: 400, message: 'duplicate' }; const row = { ID: ++id, ...body, 'odata.etag': '"1"' }; (db[table] = db[table] || []).push(row); return { statusCode: 201, body: row }; }
    throw new Error(`not modelled: ${method} ${uri}`);
  };
  const claim = claimReference({ tag: 'T', prefix: 'NITDA', lean, ...(floor ? { floor: { dataset: 'INTAKE_REGISTER', column: 'ReferenceId' } } : {}) });
  const actions = {
    Compose_Dataset_Bindings: { type: 'Compose', inputs: bindings },
    Compose_Environment_Prefix: { type: 'Compose', inputs: '', runAfter: { Compose_Dataset_Bindings: ['Succeeded'] } },
    ...claim,
  };
  const first = Object.keys(claim)[0];
  actions[first] = { ...actions[first], runAfter: { Compose_Environment_Prefix: ['Succeeded'] } };
  const pkg = { nodeId: 'Scope_T', serializedValue: { type: 'Scope', actions } };
  const connectors = { 'shared_sharepointonline.HttpRequest': http };
  const sim = new Simulator({ connectors, clock: () => '2026-10-07T09:00:00Z', rand: () => 0, workflow: { name: 'w', run: { name: 'RUN' } }, trigger: { outputs: { body: {} } } });
  sim.declare(pkg).run(pkg);
  const rec = sim.global.get('Compose_Claim_T') || null;
  return { out: rec ? rec.outputs : null, actions: count(claim), errors: sim.templateErrors || [], db };
}

const row = (n) => ({ ID: 7, Title: 'NITDA-2026', Prefix: 'NITDA', Year: '2026', CurrentSequence: n, 'odata.etag': '"1"' });
const cases = [
  ['a counter row exists: the next number', { [SEQ]: [row(41)] }, {}],
  ['no row for the year: attempt 1 creates it', { [SEQ]: [] }, {}],
  ['a contested claim: two refusals, the third attempt wins', { [SEQ]: [row(10)] }, { refuse: 2 }],
  ['a floor above the counter: the claim issues above it', { [SEQ]: [row(3)], [REG]: [{ ReferenceId: 'NITDA-2026-00050' }] }, { floor: true }],
  ['every attempt fails: ok false and no references', { [SEQ]: [row(5)] }, { failAll: true }],
];
for (const [label, seed, opt] of cases) {
  const full = run(false, seed, opt), lean = run(true, seed, opt);
  ok(full.out && lean.out && JSON.stringify(full.out) === JSON.stringify(lean.out) && !lean.errors.length,
    `${label} — lean equals full (${JSON.stringify(lean.out?.references || lean.out?.ok)})`, `full ${JSON.stringify(full.out)} lean ${JSON.stringify(lean.out)} ${JSON.stringify(lean.errors).slice(0, 300)}`);
}
const a = run(false, { [SEQ]: [row(1)] }), b = run(true, { [SEQ]: [row(1)] });
ok(b.actions <= a.actions - 25, `the lean block keeps 10 attempts in ${b.actions} actions (full: ${a.actions})`);

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
