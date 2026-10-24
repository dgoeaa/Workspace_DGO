/**
 * The Document Portal's Vault mode (docs/architecture/VAULT_ADOPTION.md, step 3).
 *
 * With a `vault` address and token, every endpoint goes to /invoke/<alias> with the token, and
 * no flow URL is used. Without both, the direct URLs are used exactly as before. The aliases are
 * the ones the flow register already records, so a Vault registered from the register serves the
 * portal. This loads the real document-portal/js/core.js with a stubbed browser.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const ok = (m, c, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nPortal Vault mode\n');

const KEYS = ['SUBMISSION', 'UPLOAD', 'SUPPORT', 'VERIFY', 'VERIFY_CONFIRM', 'STATUS', 'WRITEBACK'];
const DIRECT = Object.fromEntries(KEYS.map((k) => [k, `https://flow.example/${k.toLowerCase()}?sig=SECRET`]));

function portal(config) {
  const store = new Map();
  const calls = [];
  const window = {
    PF: { CONFIG: config },
    crypto: { getRandomValues: (b) => b.fill(7) },
    addEventListener() {},
  };
  const ctx = {
    window, navigator: { onLine: true },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute() {} } },
    location: { protocol: 'https:', search: '' },
    fetch: (url, init) => {
      calls.push({ url, method: init.method, headers: init.headers });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    },
    console, Promise, JSON, Date, Math, Object, Array, String, Number, Uint32Array, setTimeout, clearTimeout, URLSearchParams,
  };
  ctx.self = ctx.globalThis = window;
  Object.assign(window, ctx);
  vm.createContext(window);
  vm.runInContext(readFileSync('document-portal/js/core.js', 'utf8'), window);
  return { PF: window.PF, calls };
}

/* One call per endpoint, in KEYS order. */
async function callEvery(PF) {
  await PF.intake.submit({ localId: 'L1' }, { queue: false });
  await PF.intake.upload('ticket-1', new Uint8Array([1, 2, 3]));
  await PF.intake.support({ subject: 's' }, { queue: false });
  await PF.intake.verifyRequest('a@example.org');
  await PF.intake.verifyConfirm('a@example.org', '123456');
  await PF.intake.status('REF-1', 'a@example.org');
  await PF.intake.writeback('REF-1', 'proof', 'note', 'text');
}

// 1. Vault mode: every endpoint by alias, with the token, and no flow URL anywhere.
{
  const { PF, calls } = portal({ endpoints: DIRECT, vault: { url: 'https://vault.example/', token: 'fc_tok' } });
  await callEvery(PF);
  ok('every one of the seven endpoints was called', calls.length === KEYS.length, `${calls.length} calls`);
  ok('each endpoint goes to /invoke/portal.<name> on the Vault',
     calls.every((c, i) => c.url === `https://vault.example/invoke/${PF.vaultAlias(KEYS[i])}`),
     calls.map((c) => c.url).join(', '));
  ok('each call carries the invoke token', calls.every((c) => c.headers.Authorization === 'Bearer fc_tok'));
  ok('no flow URL or signature is used', calls.every((c) => !c.url.includes('flow.example') && !c.url.includes('sig=')));
  const up = calls[1];
  ok('UPLOAD stays a PUT of raw bytes with its ticket',
     up.method === 'PUT' && up.headers['Content-Type'] === 'application/octet-stream' && up.headers['X-Upload-Ticket'] === 'ticket-1');
  ok('WRITEBACK goes through the Vault too', calls[6].url.endsWith('/invoke/portal.writeback'));
  ok('the portal counts as configured with only a Vault', portal({ endpoints: {}, vault: { url: 'https://vault.example', token: 't' } }).PF.backendConfigured());
}

// 2. Direct mode is unchanged: without both an address and a token, the flow URLs are used.
for (const [label, vault] of [['no vault block', undefined], ['an address without a token', { url: 'https://vault.example', token: '' }]]) {
  const { PF, calls } = portal({ endpoints: DIRECT, vault });
  await callEvery(PF);
  ok(`${label}: every call goes to its direct URL`, calls.every((c, i) => c.url === DIRECT[KEYS[i]]));
  ok(`${label}: no Authorization header is sent`, calls.every((c) => !('Authorization' in c.headers)));
}

// 3. The aliases are the ones the flow register records, and the Vault accepts them.
{
  const { PF } = portal({ endpoints: {} });
  const register = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json', 'utf8'));
  const recorded = Object.fromEntries(register.endpoints.filter((e) => e.platform === 'portal').map((e) => [e.key, e.vaultAlias]));
  ok('the register records an alias for every portal endpoint', KEYS.every((k) => recorded[k]), JSON.stringify(recorded));
  ok('the portal uses the alias the register records', KEYS.every((k) => PF.vaultAlias(k) === recorded[k]),
     KEYS.filter((k) => PF.vaultAlias(k) !== recorded[k]).map((k) => `${k}: ${PF.vaultAlias(k)} ≠ ${recorded[k]}`).join('; '));
  const vaultAlias = new RegExp(/ALIAS=re\.compile\(r'([^']+)'\)/.exec(readFileSync('tools/flow-capsule/app/flowcapsule.py', 'utf8'))[1]);
  ok('every alias passes the Vault\'s own alias rule', KEYS.every((k) => vaultAlias.test(PF.vaultAlias(k))));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
