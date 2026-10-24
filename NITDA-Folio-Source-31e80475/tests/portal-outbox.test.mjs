/**
 * The portal outbox resends each queued payload once per flush and never multiplies it.
 *
 * CG_Portal_Support_Endpoint ran 24 times in one minute on 5 October 2026 (02:47), every run the same case from one
 * phone (same body, same browser, same address, no client request ID): each failed resend had queued another copy,
 * the original stayed for five tries, and every page load resent the lot. This loads the real document-portal/js/core.js
 * with a stubbed browser and replays that.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nPortal outbox\n');

function portal(respond) {
  const store = new Map();
  const calls = [];
  const window = {
    PF: { CONFIG: { endpoints: { SUPPORT: 'https://flow.example/support', SUBMISSION: 'https://flow.example/submit' } } },
    crypto: { getRandomValues: (b) => b.fill(7) },
    addEventListener() {},
  };
  const ctx = {
    window, navigator: { onLine: true },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute() {} } },
    location: { protocol: 'https:', search: '' },
    fetch: (url, init) => { calls.push({ url, body: init.body }); return respond(calls.length, url); },
    console, Promise, JSON, Date, Math, Object, Array, String, Number, Uint32Array, setTimeout, clearTimeout, URLSearchParams,
  };
  ctx.self = ctx.globalThis = window;
  Object.assign(window, ctx);
  vm.createContext(window);
  vm.runInContext(readFileSync('document-portal/js/core.js', 'utf8'), window);
  return { PF: window.PF, calls, outbox: () => JSON.parse(store.get('nitda.portal.outbox.v2') || '[]') };
}
const res = (status, body = {}) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) });
const settle = () => new Promise((r) => setTimeout(r, 20));
const CASE = { name: 'A Citizen', email: 'dgsregistry@nitda.gov.ng', topic: 'Question about a decision', aboutReference: 'NITDA-M5CZ7R4WD', message: 'Change approved to organizational structure' };

{
  const p = portal(() => res(502));
  await p.PF.intake.support(CASE);
  await p.PF.intake.support(CASE);
  ok(p.outbox().length === 1, 'a case that fails twice is queued once', JSON.stringify(p.outbox()));
  for (let i = 0; i < 3; i++) { p.PF.outbox.flush(); await settle(); }
  ok(p.outbox().length === 1 && p.outbox()[0].tries === 3, 'three page loads resend it three times; the outbox still holds one copy, its tries counted', JSON.stringify(p.outbox()));
  ok(p.calls.length === 5, `five calls in all (two sends, three resends), not a growing burst (${p.calls.length})`);
  for (let i = 0; i < 2; i++) { p.PF.outbox.flush(); await settle(); }
  ok(p.outbox().length === 0, 'after five tries it leaves the outbox');
}
{
  const p = portal(() => res(502));
  await p.PF.intake.support(CASE);
  p.PF.outbox.flush(); p.PF.outbox.flush(); await settle();
  ok(p.calls.length === 2, 'two flushes started together (page load and the online event) resend once', String(p.calls.length));
}
{
  let n = 0;
  const p = portal(() => (++n === 1 ? Promise.reject(new Error('timeout')) : res(200, { caseRef: 'CASE-ABC234' })));
  await p.PF.intake.support(CASE);
  p.PF.outbox.flush(); await settle();
  ok(p.outbox().length === 0 && p.calls.length === 2, 'a delivered resend leaves the outbox');
}
{
  const p = portal(() => res(400, { error: 'invalid' }));
  const r = await p.PF.intake.support(CASE);
  ok(!r.delivered && p.outbox().length === 0, 'a case the endpoint refuses (4xx) is not queued: resending it gets the same answer');
}
{
  const p = portal(() => res(500));
  for (let i = 0; i < 3; i++) await p.PF.intake.support({ ...CASE, message: `${CASE.message} ${i}` });
  p.PF.outbox.flush(); await settle();
  ok(p.calls.length === 6 && p.outbox().length === 3, 'distinct cases are each kept and resent one at a time');
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
