#!/usr/bin/env node
/**
 * Automatic setup (tools/setup.mjs), run from the RELEASE package against stand-ins for
 * Microsoft sign-in, the Power Automate management API and the connections API — whose trigger
 * URLs lead to the mock flows, so every HTTP check setup makes is a real round trip.
 *
 * Scenarios:
 *   A  a tenant with nothing: five flows created, keyed, bound, started; lists, directory and
 *      templates provisioned; settings handed over; the report holds no secrets
 *   B  run again: nothing changes
 *   C  the state a manual import leaves: placeholder keys, broken connections, flows off, one
 *      flow missing — all repaired in place, nothing duplicated
 *   D  --plan changes nothing
 *   E  no Outlook connection: stops, says where to create one
 *   F  sign-in declined: stops, says so
 *   G  flows holding different keys: all given the most common one
 *   H  --update-flows replaces an out-of-date definition, keeping the flow's key and settings
 *
 * Run: node tests/mailer-setup.test.mjs      Exit: 0 = all passed
 */

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ZIP_PATH, unpack } from '../scripts/package-mailer.mjs';
import { createMockFlows } from '../scripts/mailer-mock-flows.mjs';
import { SEED_DIRECTORY } from '../mailer/js/seed-directory.js';
import { openZip } from '../scripts/lib/zip-reader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failed++; console.log(`  ❌ ${name}${detail ? `\n     ${String(detail).slice(0, 1500)}` : ''}`); }
};

if (!fs.existsSync(ZIP_PATH)) { console.log(`  ❌ ${path.relative(ROOT, ZIP_PATH)} is missing — run: npm run mailer:package`); process.exit(1); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-setup-'));
const PKG = unpack(ZIP_PATH, work);
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const USER = 'operator@nitda.gov.ng';
const INTERNAL_KEY = 'mock-internal-key-000000';
const PLACEHOLDER = '__SET_OPERATOR_KEY_AFTER_IMPORT__';
const DEFS = Object.fromEntries(fs.readdirSync(path.join(PKG, 'flows', 'definitions')).map((f) => [f.replace('.definition.json', ''), JSON.parse(fs.readFileSync(path.join(PKG, 'flows', 'definitions', f), 'utf8'))]));
const NAMES = Object.keys(DEFS);

/* ---------------- the stand-in for Microsoft ---------------- */

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const state = {
  flows: new Map(), // id -> { name, properties }
  conns: { sharepointonline: [], office365: [] },
  calls: [],
  tokenMode: 'ok', // ok | declined
  pendingOnce: true,
  nextId: 1,
};
let mockFlows = createMockFlows({ operatorKey: INTERNAL_KEY, strictLists: true });
const conn = (name, status = 'Connected', by = USER) => ({ name, properties: { displayName: `${name} (${by})`, statuses: [{ status }], createdBy: { userPrincipalName: by } } });
function reset({ conns = true } = {}) {
  state.flows.clear();
  state.calls.length = 0;
  state.tokenMode = 'ok';
  state.pendingOnce = true;
  state.appsUsed = [];
  state.deviceCodes = 0;
  state.coldCalls = 0;
  state.brokenFlows = [];
  state.refuseApps = [];
  state.runHeader = false;
  state.conns = conns ? { sharepointonline: [conn('c-sp')], office365: [conn('c-o365')] } : { sharepointonline: [], office365: [] };
  mockFlows = createMockFlows({ operatorKey: INTERNAL_KEY, strictLists: true });
}
function addFlow(displayName, { key = PLACEHOLDER, started = true, refs = null, definition = null } = {}) {
  const id = `flow-${state.nextId++}`;
  const def = structuredClone(definition || DEFS[displayName]);
  def.actions.Compose_Config.inputs.operatorKey = key;
  const apis = [...new Set([...JSON.stringify(def).matchAll(/"connectionName":"shared_([a-z0-9]+)"/g)].map((m) => m[1]))];
  state.flows.set(id, { name: id, properties: { displayName, state: started ? 'Started' : 'Stopped', lastModifiedTime: new Date().toISOString(), definition: def, connectionReferences: refs || Object.fromEntries(apis.map((a) => [`shared_${a}`, { connectionName: a === 'office365' ? 'c-o365' : 'c-sp', id: `/providers/Microsoft.PowerApps/apis/shared_${a}` }])) } });
  return id;
}
const connected = (api, name) => state.conns[api].some((c) => c.name === name && c.properties.statuses[0].status === 'Connected');

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString('utf8');
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  state.calls.push(`${req.method} ${p}`);
  if (state.dropNext && p.endsWith('/environments')) { state.dropNext--; req.socket.destroy(); return; }

  // sign-in — as Microsoft answered on the real phone: the generic authority is refused for this
  // resource, and only NITDA's own tenant (from the environment name) is accepted.
  const T = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
  if (p.startsWith('/login/organizations/') || p.startsWith('/login/common/')) {
    return send(400, { error: 'invalid_request', error_description: 'AADSTS50059: No tenant-identifying information found in either the request or implied by any provided credentials.' });
  }
  const form = new URLSearchParams(raw);
  // the app: Microsoft no longer knows the Azure CLI app in any tenant (seen on the real phone)
  const app = form.get('client_id');
  if (p.startsWith('/login/')) state.appsUsed = [...new Set([...(state.appsUsed || []), app])];
  if (p.startsWith('/login/') && !['1950a258-227b-4e31-a9cf-717495945fc2', '9cee029c-6210-4654-90bb-17e6e9d36617'].includes(app)) {
    return send(400, { error: 'unauthorized_client', error_description: `AADSTS700016: Application with identifier '${app}' was not found in the directory '${T}'.` });
  }
  if (p.startsWith('/login/') && (state.refuseApps || []).includes(app) && form.get('grant_type') !== 'refresh_token' && p.endsWith('/token')) {
    return send(400, { error: 'invalid_grant', error_description: `AADSTS65002: Consent between first party application '${app}' and first party resource must be configured via preauthorization.` });
  }
  if (p.startsWith('/login/')) state.tenantsUsed = [...new Set([...(state.tenantsUsed || []), p.split('/')[2]])];
  if (p === `/login/${T}/oauth2/v2.0/devicecode`) state.deviceCodes = (state.deviceCodes || 0) + 1;
  if (p === `/login/${T}/oauth2/v2.0/token` && form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'rt-revoked') return send(400, { error: 'invalid_grant', error_description: 'AADSTS50173: The provided grant has expired due to it being revoked.' });
  if (p === `/login/${T}/oauth2/v2.0/devicecode`) return send(200, { device_code: 'dc-1', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 1 });
  if (p === `/login/${T}/oauth2/v2.0/token` && form.get('grant_type') === 'refresh_token') return send(200, { access_token: jwt({ tid: T, upn: USER, aud: 'https://service.powerapps.com/' }) });
  if (p === `/login/${T}/oauth2/v2.0/token`) {
    if (state.tokenMode === 'declined') return send(400, { error: 'authorization_declined', error_description: 'The user declined.' });
    if (state.pendingOnce) { state.pendingOnce = false; return send(400, { error: 'authorization_pending' }); }
    return send(200, { access_token: jwt({ tid: T, upn: USER, name: 'Test Operator', aud: 'https://service.flow.microsoft.com/' }), refresh_token: 'rt-1' });
  }
  if (p.startsWith('/login/')) return send(400, { error: 'invalid_tenant', error_description: `AADSTS90002: Tenant '${p.split('/')[2]}' not found.` });

  // the flows' own trigger URLs
  const inv = p.match(/^\/invoke\/([^/]+)$/);
  if (inv) {
    const f = state.flows.get(inv[1]);
    if (!f || url.searchParams.get('sig') !== `sig-${inv[1]}`) return send(404, { error: { code: 'NotFound' } });
    if (state.coldCalls > 0) { state.coldCalls--; return send(404, { error: { code: 'TriggerNotFound', message: 'The trigger is not yet active.' } }); }
    if (state.brokenFlows?.includes(f.properties.displayName)) {
      /* Power Automate names the run a call started in x-ms-workflow-run-id; state.runHeader turns that on. */
      if (state.runHeader) { res.writeHead(502, { 'Content-Type': 'application/json', 'x-ms-workflow-run-id': 'run-1' }); return res.end(JSON.stringify({ error: { code: 'NoResponse', message: 'The server did not receive a response from an upstream server.' } })); }
      return send(502, { error: { code: 'NoResponse', message: 'The server did not receive a response from an upstream server.' } });
    }
    if (f.properties.state !== 'Started') return send(409, { error: { code: 'WorkflowTriggerIsNotEnabled' } });
    const cfg = f.properties.definition.actions.Compose_Config.inputs;
    const body = raw ? JSON.parse(raw) : {};
    if ('operatorKey' in body) body.operatorKey = body.operatorKey === cfg.operatorKey && !String(cfg.operatorKey).startsWith('__') ? INTERNAL_KEY : 'wrong';
    const [status, out] = mockFlows.handle(cfg.endpointKey, body, { lists: cfg.lists });
    return send(status, out);
  }

  // everything below needs a bearer token
  if (!/^Bearer h\./.test(req.headers.authorization || '')) return send(401, { error: { code: 'Unauthorized', message: 'no token' } });

  if (p.startsWith('/papps/providers/Microsoft.PowerApps/apis/')) {
    const api = p.match(/shared_([a-z0-9]+)\/connections$/)?.[1];
    return send(200, { value: state.conns[api] || [] });
  }
  const E = `/flow/providers/Microsoft.ProcessSimple/environments`;
  if (p === E) return send(200, { value: [{ name: ENV, properties: { displayName: 'NITDA (default)', isDefault: true } }] });
  if (p === `${E}/${ENV}/flows` && req.method === 'GET') return send(200, { value: [...state.flows.values()].map((f) => ({ name: f.name, properties: { displayName: f.properties.displayName, state: f.properties.state, lastModifiedTime: f.properties.lastModifiedTime } })) });
  const refsOk = (refs) => Object.entries(refs || {}).every(([k, v]) => connected(k.replace('shared_', ''), v.connectionName));
  if (p === `${E}/${ENV}/flows` && req.method === 'POST') {
    const b = JSON.parse(raw);
    if (!refsOk(b.properties.connectionReferences)) return send(400, { error: { code: 'ConnectionAuthorizationFailed', message: 'A connection reference is not valid.' } });
    const id = `flow-${state.nextId++}`;
    const f = { name: id, properties: { ...b.properties, lastModifiedTime: new Date().toISOString() } };
    state.flows.set(id, f);
    return send(201, f);
  }
  const one = p.match(new RegExp(`^${E}/${ENV}/flows/([^/]+)(/.*)?$`));
  if (one) {
    const f = state.flows.get(one[1]);
    if (!f) return send(404, { error: { code: 'FlowNotFound', message: 'no such flow' } });
    const rest = one[2] || '';
    if (!rest && req.method === 'GET') return send(200, f);
    if (!rest && req.method === 'PATCH') {
      const b = JSON.parse(raw);
      if (!refsOk(b.properties.connectionReferences)) return send(400, { error: { code: 'ConnectionAuthorizationFailed', message: 'A connection reference is not valid.' } });
      Object.assign(f.properties, b.properties, { lastModifiedTime: new Date().toISOString() });
      return send(200, f);
    }
    if (rest === '/start' && req.method === 'POST') { f.properties.state = 'Started'; return send(200, {}); }
    if (rest === '/runs' && req.method === 'GET') return send(200, { value: state.brokenFlows?.includes(f.properties.displayName) ? [{ name: 'run-1', properties: { status: 'Failed', error: { code: 'ActionFailed', message: 'An action failed. No dependent actions succeeded.' } } }] : [] });
    if (rest === '/runs/run-1' && req.method === 'GET') return send(200, { name: 'run-1', properties: { status: 'Failed', error: { code: 'ActionFailed', message: 'An action failed. No dependent actions succeeded.' } } });
    if (rest === '/runs/run-1/actions' && req.method === 'GET') return send(200, { value: [
      { name: 'Compose_Request', properties: { status: 'Succeeded' } },
      { name: 'Compose_Caller', properties: { status: 'Failed', code: 'InvalidTemplate', error: { code: 'InvalidTemplate', message: "Unable to process template language expressions in action 'Compose_Caller' inputs." } } },
    ] });
    if (rest === '/triggers/manual/listCallbackUrl' && req.method === 'POST') return send(200, { response: { value: `${base}/invoke/${f.name}?api-version=1&sig=sig-${f.name}`, method: 'POST' } });
  }
  return send(404, { error: { code: 'NoRoute', message: `${req.method} ${p}` } });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

/* The published file embeds its configuration in one base64 data: classic script (the design
   system's script is another); these find and edit that one by its content. */
const DATA_SCRIPTS = /<script src="data:text\/javascript;base64,([^"]+)"><\/script>/g;
const configText = (html) => [...html.matchAll(DATA_SCRIPTS)].map((m) => Buffer.from(m[1], 'base64').toString('utf8')).find((t) => t.includes('DGO_MAILER_PUBLISHED')) || '';
const editConfig = (html, fn) => html.replace(DATA_SCRIPTS, (m, b64) => {
  const t = Buffer.from(b64, 'base64').toString('utf8');
  return t.includes('DGO_MAILER_PUBLISHED') ? `<script src="data:text/javascript;base64,${Buffer.from(fn(t)).toString('base64')}"></script>` : m;
});

/* ---------------- running setup ---------------- */

async function setup(args = [], label = 'run', { into, env = {} } = {}) {
  const dir = into || fs.mkdtempSync(path.join(work, `${label}-`));
  const child = spawn(process.execPath, ['tools/setup.mjs', '--publish-dir', path.join(dir, 'publish'), '--report', path.join(dir, 'report.txt'), ...args], {
    cwd: PKG,
    env: { ...process.env, DGO_SETUP_LOGIN_BASE: `${base}/login`, DGO_SETUP_FLOW_BASE: `${base}/flow`, DGO_SETUP_POWERAPPS_BASE: `${base}/papps`, DGO_SETUP_NO_BROWSER: '1', DGO_SETUP_CHECK_INTERVAL_MS: '100', DGO_SETUP_CHECK_WINDOW_MS: '2000', TERM: 'dumb', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((r) => child.on('exit', r));
  const htmlFile = path.join(dir, 'publish', 'mailer.html');
  let published = null;
  let html = '';
  if (fs.existsSync(htmlFile)) {
    html = fs.readFileSync(htmlFile, 'utf8');
    /* The embedded configuration is the first data: classic script. */
    const cfg = configText(html);
    const w = {}; new Function('window', cfg)(w); published = w.DGO_MAILER_CONFIG_LOCAL;
  }
  return {
    code, out, dir,
    published, html,
    publishedFiles: fs.existsSync(path.join(dir, 'publish')) ? fs.readdirSync(path.join(dir, 'publish')) : [],
    report: fs.existsSync(path.join(dir, 'report.txt')) ? fs.readFileSync(path.join(dir, 'report.txt'), 'utf8') : '',
  };
}
const byName = () => Object.fromEntries([...state.flows.values()].map((f) => [f.properties.displayName, f]));
const keyOf = (f) => f.properties.definition.actions.Compose_Config.inputs.operatorKey;
const writes = () => state.calls.filter((c) => /^(POST|PATCH) \/flow\/.*\/flows(\/[^/]+)?(\/start)?$/.test(c));

console.log('\nAutomatic setup (tools/setup.mjs, from the release package)\n');

/* A — nothing in the tenant yet */
reset();
const a = await setup([], 'A');
const fa = byName();
ok('A: a tenant with nothing — setup completes', a.code === 0 && /Setup complete/.test(a.out), a.out.slice(-1500));
ok('A: it signs in to NITDA\'s own tenant, taken from the environment name — never the generic authority Microsoft refuses',
  JSON.stringify(state.tenantsUsed) === JSON.stringify(['ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1']), JSON.stringify(state.tenantsUsed));
ok('A: it signs in through the app Microsoft\'s Power Apps admin PowerShell uses — never the retired Azure CLI app',
  JSON.stringify(state.appsUsed) === JSON.stringify(['1950a258-227b-4e31-a9cf-717495945fc2']), JSON.stringify(state.appsUsed));
ok('A: it shows the sign-in page and the code, and waits for the sign-in', /microsoft\.com\/devicelogin/.test(a.out) && /ABCD-EFGH/.test(a.out) && /signed in as Test Operator <operator@nitda\.gov\.ng>/.test(a.out));
ok(`A: all ${NAMES.length} flows are created, once each, and turned on`, NAMES.length === 7 && NAMES.every((n) => fa[n]?.properties.state === 'Started') && state.flows.size === NAMES.length);
const keyA = keyOf(fa[NAMES[0]]);
ok('A: they share one new random key of 32 characters', /^[A-Za-z0-9_-]{32}$/.test(keyA) && NAMES.every((n) => keyOf(fa[n]) === keyA));
ok('A: each is bound to the account\'s working connections',
  NAMES.every((n) => Object.values(fa[n].properties.connectionReferences).every((r) => ['c-sp', 'c-o365'].includes(r.connectionName) && r.source === 'Embedded')));
ok('A: the flows are the package\'s definitions, with only the key and the allowed origin filled in', NAMES.every((n) => {
  const d = structuredClone(fa[n].properties.definition); d.actions.Compose_Config.inputs.operatorKey = PLACEHOLDER;
  return JSON.stringify(d) === JSON.stringify(DEFS[n]) && fa[n].properties.definition.actions.Compose_Config.inputs.allowedOrigin === 'https://folio-platform.page.gd';
}));
ok('A: every SharePoint list and the library are provisioned', mockFlows.provisioned.size === 8);
ok('A: the directory list gets the mailing guide\'s institutions, and the templates list the mailer\'s templates',
  mockFlows.lists.directory.size === SEED_DIRECTORY.length && mockFlows.lists.templates.size === 3, `${mockFlows.lists.directory.size} / ${mockFlows.lists.templates.size}`);
ok('A: every flow passed health, identity and key checks over HTTP', /MAIL_SEND: healthy, verified/.test(a.out) && /MAIL_AUTH: healthy, verified/.test(a.out) && /the admin key is accepted/.test(a.out));
ok('A: the signed-in account becomes the first admin operator', mockFlows.lists.operators.get(USER)?.role === 'admin' && mockFlows.lists.operators.get(USER)?.active === true);
ok('A: the mailer is written ready to publish as ONE file, mailer.html, with all seven URLs and no key',
  JSON.stringify(a.publishedFiles) === JSON.stringify(['mailer.html'])
  && a.published && Object.keys(a.published.endpoints).length === 7 && Object.values(a.published.endpoints).every((u) => u.startsWith(`${base}/invoke/`))
  && !a.html.includes(keyA) && !Buffer.from(a.html).toString('latin1').includes(keyA) && a.html.includes('<script type="importmap">'));
ok('A: it says exactly where to upload it and where it then opens',
  /upload mailer\.html into the folder that holds the platform's index\.html on https:\/\/folio-platform\.page\.gd/.test(a.out) && /It then opens at https:\/\/folio-platform\.page\.gd\/mailer\.html/.test(a.out));
ok('A: the report is written and holds no key and no trigger URL', a.report.includes('STEP') && !a.report.includes(keyA) && !/sig=/.test(a.report) && !a.out.includes(keyA));

/* B — run again */
state.calls.length = 0;
const b = await setup([], 'B');
ok('B: running again completes and changes no flow', b.code === 0 && writes().filter((c) => !/listCallbackUrl/.test(c)).length === 0 && state.flows.size === NAMES.length, writes().join(', '));
ok('B: the same key is kept and the same URLs are published', keyOf(byName()[NAMES[0]]) === keyA && JSON.stringify(b.published?.endpoints) === JSON.stringify(a.published?.endpoints));
ok('B: the first admin is not added twice', /is already an admin operator/.test(b.out) && mockFlows.lists.operators.size === 1);
ok('B: the directory and templates in SharePoint are left as they are', /already has 25 entries; left as it is/.test(b.out) && mockFlows.lists.directory.size === SEED_DIRECTORY.length);

/* C — what a manual import leaves behind */
reset();
state.conns.sharepointonline.push(conn('c-sp-broken', 'Error'));
const brokenRefs = (n) => Object.fromEntries([...new Set([...JSON.stringify(DEFS[n]).matchAll(/"connectionName":"shared_([a-z0-9]+)"/g)].map((m) => m[1]))].map((a) => [`shared_${a}`, { connectionName: a === 'office365' ? 'shared-office365-imported' : 'c-sp-broken', id: `/providers/Microsoft.PowerApps/apis/shared_${a}` }]));
const idsBefore = NAMES.slice(0, 4).map((n) => addFlow(n, { started: n !== 'DGO_MAIL_LOG', refs: brokenRefs(n) }));
const c = await setup([], 'C');
const fc = byName();
ok('C: imported flows with placeholder keys, broken connections, one off and one missing — setup completes', c.code === 0, c.out.slice(-1500));
ok('C: the four existing flows are repaired in place (same flows, nothing duplicated) and the missing ones created',
  state.flows.size === NAMES.length && idsBefore.every((id) => state.flows.has(id)) && NAMES.every((n) => Boolean(fc[n])));
ok('C: every flow now holds the same real key', NAMES.every((n) => keyOf(fc[n]) === keyOf(fc[NAMES[0]])) && !String(keyOf(fc[NAMES[0]])).startsWith('__'));
ok('C: broken connection references are re-bound to working ones', NAMES.every((n) => Object.values(fc[n].properties.connectionReferences).every((r) => connected(r.id.split('shared_')[1], r.connectionName))) && /connections re-bound to working ones/.test(c.out));
ok('C: the flow that was off is turned on', fc.DGO_MAIL_LOG.properties.state === 'Started' && /DGO_MAIL_LOG: turned on/.test(c.out));

/* D — plan only */
reset();
const d = await setup(['--plan'], 'D');
ok('D: --plan reports what it would do and changes nothing', d.code === 0 && /would be created/.test(d.out) && /Plan complete. Nothing was changed./.test(d.out) && !/Setup complete/.test(d.out) && state.flows.size === 0 && !d.published && writes().length === 0, d.out.slice(-800));

/* E — no Outlook connection */
reset();
state.conns.office365 = [];
const e = await setup([], 'E');
ok('E: with no Outlook connection it stops, and says where to create one', e.code === 1 && /No working Office 365 Outlook connection/.test(e.out) && /make\.powerautomate\.com\/environments\/Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1\/connections/.test(e.out) && /Setup stopped/.test(e.out) && !e.published, e.out.slice(-800));

/* F — sign-in declined */
reset();
state.tokenMode = 'declined';
const f = await setup([], 'F');
ok('F: a declined sign-in stops setup with a clear message and changes nothing', f.code === 1 && /Sign-in was declined/.test(f.out) && state.flows.size === 0);

/* G — different keys */
reset();
NAMES.forEach((n, i) => addFlow(n, { key: i < 2 ? 'key-a-aaaaaaaaaaaaaaaa' : 'key-b-bbbbbbbbbbbbbbbb' }));
const g = await setup([], 'G');
ok('G: flows with different keys all get the most common one', g.code === 0 && NAMES.every((n) => keyOf(byName()[n]) === 'key-b-bbbbbbbbbbbbbbbb') && /2 different keys were found/.test(g.out), g.out.slice(-800));

/* H — --update-flows */
reset();
const old = structuredClone(DEFS.DGO_MAIL_SEND);
old.actions.Old_Step = { type: 'Compose', inputs: 'from an older package', runAfter: {} };
old.actions.Compose_Config.inputs.siteUrl = 'https://nitdanigeria.sharepoint.com/sites/Custom';
NAMES.forEach((n) => addFlow(n, { key: 'kept-key-000000000000', definition: n === 'DGO_MAIL_SEND' ? old : null }));
const h1 = await setup([], 'H1');
ok('H: without --update-flows an out-of-date flow is reported and left alone', h1.code === 0 && /DGO_MAIL_SEND: its definition differs from this package; it is left as it is/.test(h1.out) && Boolean(byName().DGO_MAIL_SEND.properties.definition.actions.Old_Step));
const h2 = await setup(['--update-flows'], 'H2');
const send = byName().DGO_MAIL_SEND.properties.definition;
ok('H: with --update-flows it is replaced, keeping its key and its own settings',
  h2.code === 0 && !send.actions.Old_Step && send.actions.Compose_Config.inputs.operatorKey === 'kept-key-000000000000' && send.actions.Compose_Config.inputs.siteUrl === 'https://nitdanigeria.sharepoint.com/sites/Custom', h2.out.slice(-800));

/* I — the state NITDA is in today: the five flows of the first contract, keyed and live */
reset();
const FIRST = ['DGO_MAIL_SEND', 'DGO_MAIL_LOG', 'DGO_MAIL_DIRECTORY', 'DGO_MAIL_TEMPLATES', 'DGO_MAIL_PROVISION'];
const firstContract = (n) => {
  const d = structuredClone(DEFS[n]);
  d.actions.Compose_Config.inputs.contractVersion = 'dgo-mail/1.0';
  delete d.actions.Compose_Config.inputs.allowedOrigin;
  d.actions.Compose_Config.inputs.sharedMailbox = n === 'DGO_MAIL_SEND' ? 'dgo@nitda.gov.ng' : d.actions.Compose_Config.inputs.sharedMailbox;
  delete d.actions.Condition_Check_Session; delete d.actions.Compose_Caller;
  if (d.actions.Compose_Config.inputs.lists) d.actions.Compose_Config.inputs.lists = d.actions.Compose_Config.inputs.lists.filter((l) => ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].includes(l.title));
  return d;
};
['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].forEach((t) => mockFlows.provisioned.add(t));
const liveIds = FIRST.map((n) => addFlow(n, { key: 'the-key-nitda-uses-now', definition: firstContract(n) }));
const i1 = await setup([], 'I');
const fi = byName();
ok('I: the five flows of the first contract are upgraded in place, and the two new flows created',
  i1.code === 0 && liveIds.every((id) => state.flows.has(id)) && state.flows.size === 7 && FIRST.every((n) => new RegExp(`${n}: upgraded from contract dgo-mail/1.0 to dgo-mail/2.0`).test(i1.out)), i1.out.slice(-1500));
ok('I: the upgraded flows have the new sign-in check, and keep their own settings and key',
  FIRST.every((n) => fi[n].properties.definition.actions.Compose_Caller && keyOf(fi[n]) === 'the-key-nitda-uses-now')
  && fi.DGO_MAIL_SEND.properties.definition.actions.Compose_Config.inputs.sharedMailbox === 'dgo@nitda.gov.ng');
ok('I: the upgraded provisioning flow takes the package\'s list schema, not the first contract\'s three lists',
  JSON.stringify(fi.DGO_MAIL_PROVISION.properties.definition.actions.Compose_Config.inputs.lists) === JSON.stringify(DEFS.DGO_MAIL_PROVISION.actions.Compose_Config.inputs.lists));
ok('I: the lists new in 2.0 are created, and the first admin operator is added',
  ['DGOMailOperators', 'DGOMailSessions', 'DGOMailCampaigns', 'DGOMailReports', 'DGOMailFiles'].every((t) => mockFlows.provisioned.has(t) && new RegExp(`${t}: created`).test(i1.out)) && /(added as|is already) an admin operator/.test(i1.out) && /Setup complete/.test(i1.out), i1.out.slice(-1500));
/* I2 — today's tenant after 2.0.4: all seven on 2.0, but DGO_MAIL_PROVISION still holds the three 1.0 lists */
const iKey = keyOf(fi.DGO_MAIL_PROVISION);
fi.DGO_MAIL_PROVISION.properties.definition.actions.Compose_Config.inputs.lists = fi.DGO_MAIL_PROVISION.properties.definition.actions.Compose_Config.inputs.lists.filter((l) => ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].includes(l.title));
mockFlows.provisioned.clear(); ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].forEach((t) => mockFlows.provisioned.add(t));
const i2 = await setup([], 'I2');
ok('I: a 2.0 provisioning flow holding the old list schema is seen as different and brought up to the package, without --update-flows',
  i2.code === 0 && /DGO_MAIL_PROVISION: found, on, differs from this package/.test(i2.out) && /DGO_MAIL_PROVISION: package settings brought up to this package: lists/.test(i2.out)
  && /DGOMailOperators: created/.test(i2.out) && /Setup complete/.test(i2.out) && keyOf(byName().DGO_MAIL_PROVISION) === iKey, i2.out.slice(-2000));
ok('I: the new flows share the same key', keyOf(fi.DGO_MAIL_AUTH) === 'the-key-nitda-uses-now' && keyOf(fi.DGO_MAIL_DATA) === 'the-key-nitda-uses-now');
ok('I: only the platform host may read any flow\'s answers', NAMES.every((n) => fi[n].properties.definition.actions.Compose_Config.inputs.allowedOrigin === 'https://folio-platform.page.gd'));

/* J — another origin */
reset();
const j = await setup(['--origin', 'https://mailer.nitda.gov.ng'], 'J');
ok('J: --origin sets the one origin allowed, and the publishing instructions follow it', j.code === 0 && NAMES.every((n) => byName()[n].properties.definition.actions.Compose_Config.inputs.allowedOrigin === 'https://mailer.nitda.gov.ng') && /https:\/\/mailer\.nitda\.gov\.ng\/mailer\.html/.test(j.out));
const bad = await setup(['--origin', 'https://folio-platform.page.gd/mailer/'], 'J2');
ok('J: an origin with a path is refused before anything happens', bad.code === 2 && /scheme and host only/.test(bad.out) && state.flows.size === NAMES.length);

/* K — Microsoft refuses the first sign-in app after the code is entered */
reset();
state.refuseApps = ['1950a258-227b-4e31-a9cf-717495945fc2'];
const k = await setup(['--plan'], 'K');
ok('K: a refused sign-in app is replaced by the next one, with a new code, and the plan completes',
  k.code === 0 && /trying Power Platform CLI — a new code follows/.test(k.out) && /signed in as Test Operator/.test(k.out) && /Plan complete/.test(k.out)
  && JSON.stringify(state.appsUsed) === JSON.stringify(['1950a258-227b-4e31-a9cf-717495945fc2', '9cee029c-6210-4654-90bb-17e6e9d36617']), k.out.slice(-1200));
state.refuseApps = ['1950a258-227b-4e31-a9cf-717495945fc2', '9cee029c-6210-4654-90bb-17e6e9d36617'];
const k2 = await setup(['--plan'], 'K2');
ok('K: when every app is refused, setup stops, names each refusal and changes nothing',
  k2.code === 1 && /refused every sign-in app/.test(k2.out) && /AADSTS65002/.test(k2.out) && state.flows.size === 0, k2.out.slice(-1200));

/* L — the triggers are not answering at first, then are; and a flow that keeps failing */
reset();
state.coldCalls = 10;
const l = await setup([], 'L');
ok('L: setup waits for new triggers to activate, then completes', l.code === 0 && /answering; waiting up to 3 minutes/.test(l.out) && /MAIL_DATA: healthy, verified/.test(l.out) && /Setup complete/.test(l.out), l.out.slice(-1500));
reset();
state.brokenFlows = ['DGO_MAIL_AUTH'];
const l2 = await setup([], 'L2');
ok('L: a flow that keeps failing is named with Power Automate\'s own answer, and setup stops',
  l2.code === 1 && /MAIL_AUTH: health check refused \(HTTP 502 — NoResponse: The server did not receive/.test(l2.out) && /MAIL_SEND: healthy, verified/.test(l2.out) && /still did not pass/.test(l2.out) && !l2.published, l2.out.slice(-1500));
ok('L: with no run named in the answer, it reads the flow\'s latest run, says so, and names the step that failed, with its error',
  /MAIL_AUTH: latest run \(not necessarily this call's: its answer named no run\) Failed \(ActionFailed: An action failed\. No dependent actions succeeded\.\); failed step: Compose_Caller: InvalidTemplate — Unable to process template language expressions/.test(l2.out), l2.out.slice(-1500));
reset();
state.brokenFlows = ['DGO_MAIL_AUTH'];
state.runHeader = true;
const l3 = await setup([], 'L3');
ok('L: when the answer names its run, that run is the one read (not merely the latest)',
  l3.code === 1 && /MAIL_AUTH: the run of this call \(run-1\) Failed \(ActionFailed/.test(l3.out) && /failed step: Compose_Caller/.test(l3.out), l3.out.slice(-1500));
const lt0 = Date.now();
reset();
state.brokenFlows = NAMES.slice();
const l4 = await setup([], 'L4');
ok('L: the checks of all seven flows run at once, so a round is not seven flows\' timeouts end to end',
  l4.code === 1 && /still did not pass/.test(l4.out) && state.calls.filter((c) => c.startsWith('POST /invoke/')).length >= 14 && Date.now() - lt0 < 20000, l4.out.slice(-800));

/* M — the state NITDA is in after 2.0.4: all seven flows on contract 2.0, one key, but the
   provisioning flow still holding the first contract's three lists, and only those lists exist. */
const staleProvision = () => {
  const d = structuredClone(DEFS.DGO_MAIL_PROVISION);
  d.actions.Compose_Config.inputs.lists = d.actions.Compose_Config.inputs.lists.filter((l) => ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].includes(l.title));
  return d;
};
const tenantNow = () => {
  reset();
  ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].forEach((t) => mockFlows.provisioned.add(t));
  NAMES.forEach((n) => addFlow(n, { key: 'the-key-nitda-uses-now', definition: n === 'DGO_MAIL_PROVISION' ? staleProvision() : null }));
};
tenantNow();
const m1 = await setup(['--plan', '--update-flows'], 'M1');
ok('M: --plan reports that the provisioning flow\'s stale list schema would be brought up to date',
  m1.code === 0 && /DGO_MAIL_PROVISION: would change — package settings brought up to this package: lists/.test(m1.out) && /the flows already share a key \(7 of 7 found flows hold it\)/.test(m1.out)
  && !/upgraded from contract|not in this environment/.test(m1.out) && writes().length === 0, m1.out.slice(-1500));
const m2 = await setup(['--update-flows'], 'M2');
const fm = byName();
ok('M: with --update-flows the stale list schema is replaced by the package\'s, keeping the key',
  m2.code === 0 && JSON.stringify(fm.DGO_MAIL_PROVISION.properties.definition.actions.Compose_Config.inputs.lists) === JSON.stringify(DEFS.DGO_MAIL_PROVISION.actions.Compose_Config.inputs.lists)
  && keyOf(fm.DGO_MAIL_PROVISION) === 'the-key-nitda-uses-now', m2.out.slice(-1500));
ok('M: the lists 2.0 needs are created, the private ones made private, and setup completes',
  ['DGOMailOperators', 'DGOMailSessions', 'DGOMailCampaigns', 'DGOMailReports', 'DGOMailFiles'].every((t) => mockFlows.provisioned.has(t) && new RegExp(`${t}: created`).test(m2.out))
  && ['DGOMailLog', 'DGOMailTemplates', 'DGOMailOperators', 'DGOMailSessions', 'DGOMailCampaigns'].every((t) => new RegExp(`${t}: [^\n]*private to the flow owner`).test(m2.out))
  && /(added as|is already) an admin operator/.test(m2.out) && /Setup complete/.test(m2.out), m2.out.slice(-2000));
tenantNow();
const m3 = await setup([], 'M3');
ok('M: even without --update-flows, the package-owned list schema is brought up to date and setup completes',
  m3.code === 0 && /DGO_MAIL_PROVISION: package settings brought up to this package: lists/.test(m3.out) && /DGOMailOperators: created/.test(m3.out) && /Setup complete/.test(m3.out), m3.out.slice(-1500));

/* M — the phone's connection drops for a moment, as on the tenant ("fetch failed") */
reset();
state.dropNext = 2;
const m = await setup(['--plan'], 'M');
ok('M: a dropped connection is tried again, and setup carries on', m.code === 0 && /Plan complete/.test(m.out) && state.dropNext === 0, m.out.slice(-800));

/* X — --export-flows saves all seven flows in one file; --restore-flows puts them back exactly. */
{
  reset();
  const base0 = await setup([], 'X0');
  const xdir = fs.mkdtempSync(path.join(work, 'X-'));
  const flowsNow = () => Object.fromEntries([...state.flows.values()].map((f) => [f.properties.displayName, JSON.stringify(f.properties.definition)]));
  const before = flowsNow();
  state.calls.length = 0;
  const x = await setup(['--export-flows', '--export-dir', xdir], 'X');
  const files = fs.readdirSync(xdir);
  ok('X: --export-flows completes and writes ONE file', base0.code === 0 && x.code === 0 && /Export complete/.test(x.out) && files.length === 1 && /^dgo-mail-flows-.*\.zip$/.test(files[0]), x.out.slice(-1500));
  ok('X: it changes nothing in the tenant', writes().length === 0 && JSON.stringify(flowsNow()) === JSON.stringify(before), writes().join(', '));
  const outer = openZip(path.join(xdir, files[0]));
  const names = outer.members.map((m) => m.name).sort();
  ok('X: the file holds an importable package per flow, the backup and a README',
    NAMES.every((n) => names.includes(`packages/${n}.zip`)) && names.includes('flows-backup.json') && names.includes('README.txt') && names.length === NAMES.length + 2, names.join(', '));
  const tmp = path.join(xdir, 'one.zip');
  fs.writeFileSync(tmp, outer.members.find((m) => m.name === 'packages/DGO_MAIL_SEND.zip').read());
  const pkg = openZip(tmp);
  const pnames = pkg.members.map((m) => m.name);
  const defMember = pkg.members.find((m) => /^Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/.test(m.name));
  const live = [...state.flows.values()].find((f) => f.properties.displayName === 'DGO_MAIL_SEND');
  const packed = JSON.parse(defMember.read().toString('utf8'));
  ok('X: each package has the import-package shape, with the flow exactly as it is in the tenant',
    pnames.includes('manifest.json') && pnames.includes('Microsoft.Flow/flows/manifest.json') && pnames.some((n) => n.endsWith('/apisMap.json')) && pnames.some((n) => n.endsWith('/connectionsMap.json'))
    && JSON.stringify(packed.properties.definition) === JSON.stringify(live.properties.definition) && packed.properties.displayName === 'DGO_MAIL_SEND'
    && JSON.stringify(Object.keys(JSON.parse(pkg.members.find((m) => m.name.endsWith('/connectionsMap.json')).read().toString('utf8')))) === JSON.stringify(Object.keys(live.properties.connectionReferences)));
  const mode = fs.statSync(path.join(xdir, files[0])).mode & 0o777;
  ok('X: the export is private to its owner (0600), and says it carries the admin key', (process.platform === 'win32' || mode === 0o600) && /carries the admin key/.test(x.out), mode.toString(8));

  /* Something changes the flows; restore puts them back. */
  const sendFlow = [...state.flows.values()].find((f) => f.properties.displayName === 'DGO_MAIL_SEND');
  sendFlow.properties.definition = { ...sendFlow.properties.definition, description: 'changed by hand' };
  const logFlow = [...state.flows.values()].find((f) => f.properties.displayName === 'DGO_MAIL_LOG');
  state.flows.delete(logFlow.name);
  state.calls.length = 0;
  const r = await setup(['--restore-flows', path.join(xdir, files[0]), '--export-dir', xdir], 'XR');
  const after = flowsNow();
  ok('X: --restore-flows puts every flow back exactly as exported, and creates one that was deleted',
    r.code === 0 && /Restore complete/.test(r.out) && NAMES.every((n) => after[n] === before[n]) && /DGO_MAIL_SEND: restored and read back identical/.test(r.out) && /DGO_MAIL_LOG: created from the export/.test(r.out), r.out.slice(-1500));
  ok('X: flows already as exported are left alone, and a recreated flow is said to need a new mailer.html',
    /DGO_MAIL_AUTH: already exactly as in the export/.test(r.out) && /run node tools\/setup\.mjs \(no option\)/.test(r.out));
  ok('X: the state before the restore is saved first', fs.readdirSync(xdir).some((f) => /^flows-before-restore-.*\.json$/.test(f)));
  const bad = path.join(xdir, 'not-an-export.json');
  fs.writeFileSync(bad, '{"hello":1}');
  state.calls.length = 0;
  const rb = await setup(['--restore-flows', bad], 'XB');
  ok('X: a file that is not an export is refused before any sign-in', rb.code === 1 && /is not an export made with --export-flows/.test(rb.out) && state.calls.length === 0, rb.out.slice(-600));
}

/* R — a release that changes only the app: --refresh-mailer rewrites mailer.html from the one
   setup wrote before, with no sign-in and nothing changed in the tenant. */
{
  const rdir = fs.mkdtempSync(path.join(work, 'R-'));
  fs.mkdirSync(path.join(rdir, 'publish'));
  /* The version and addresses sit in a base64 data: script; rewrite it the way an older setup wrote it. */
  const oldHtml = editConfig(a.html, (t) => t.replace(/window\.DGO_MAILER_VERSION = "[^"]*"/, 'window.DGO_MAILER_VERSION = "2.0.10"'));
  fs.writeFileSync(path.join(rdir, 'publish', 'mailer.html'), oldHtml);
  state.calls.length = 0;
  const r = await setup(['--refresh-mailer'], 'R', { into: rdir });
  const version = fs.readFileSync(path.join(PKG, 'web', 'VERSION'), 'utf8').trim();
  ok('R: --refresh-mailer rewrites mailer.html with the same seven flow addresses, and completes',
    r.code === 0 && /Refresh complete/.test(r.out) && JSON.stringify(r.published?.endpoints) === JSON.stringify(a.published?.endpoints), r.out.slice(-1200));
  ok('R: it needs no sign-in and touches nothing in Power Automate or SharePoint', state.calls.length === 0 && !/devicelogin|signed in as/.test(r.out), state.calls.join(', '));
  ok('R: the new file is this package\'s version, and the old one is kept beside it',
    r.html.includes(`window.DGO_MAILER_VERSION = ${JSON.stringify(version)}`) || configText(r.html).includes(`window.DGO_MAILER_VERSION = ${JSON.stringify(version)}`));
  ok('R: ... as mailer-2.0.10.html', fs.existsSync(path.join(rdir, 'publish', 'mailer-2.0.10.html')) && /was version 2\.0\.10/.test(r.out), fs.readdirSync(path.join(rdir, 'publish')).join());
  const none = await setup(['--refresh-mailer'], 'R2');
  ok('R: with no earlier mailer.html it stops and says to run setup without --refresh-mailer', none.code === 1 && /Run setup without --refresh-mailer/.test(none.out) && state.calls.length === 0, none.out.slice(-600));
}

/* R3 — a mailer.html whose flows are not this package's: the refresh stops. */
{
  const rdir = fs.mkdtempSync(path.join(work, 'R3-'));
  fs.mkdirSync(path.join(rdir, 'publish'));
  const unmark = (html) => editConfig(html, (t) => t.replace(/window\.DGO_MAILER_FLOWS = "[^"]*";/, ''));
  fs.writeFileSync(path.join(rdir, 'publish', 'mailer.html'), unmark(a.html));
  state.calls.length = 0;
  const r3 = await setup(['--refresh-mailer'], 'R3', { into: rdir });
  ok('R: a mailer.html written for other flows is not refreshed: it says to run full setup, and writes nothing',
    r3.code === 1 && /Run full setup instead/.test(r3.out) && /--update-flows/.test(r3.out) && fs.readdirSync(path.join(rdir, 'publish')).length === 1 && state.calls.length === 0, r3.out.slice(-900));
  ok('R: full setup marks the mailer.html it writes with the flows it installed',
    /window\.DGO_MAILER_FLOWS = "[0-9a-f]{16}"/.test(configText(a.html)));
  ok('R: a refresh keeps its own report, so the setup report is not overwritten', /dgo-mailer-refresh-report\.txt/.test(fs.readFileSync(path.join(PKG, 'tools', 'setup.mjs'), 'utf8')));
}

/* X — manual setup: the flows were imported and keyed by hand; no Microsoft sign-in. */
{
  reset();
  const base0 = await setup([], 'X0');
  const key = keyOf(byName()[NAMES[0]]);
  const xdir = fs.mkdtempSync(path.join(work, 'X-'));
  const file = path.join(xdir, 'endpoints.txt');
  fs.writeFileSync(file, Object.entries(base0.published.endpoints).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  state.calls.length = 0;
  const x = await setup(['--manual', '--endpoints', file, '--key', key, '--operator', 'Colleague@nitda.gov.ng', '--name', 'A Colleague'], 'X', { into: xdir });
  ok('X: --manual reads the seven URLs, checks the flows, provisions, adds the operator and writes mailer.html, with no Microsoft sign-in',
    x.code === 0 && /all 7 trigger URLs read/.test(x.out) && /healthy, verified/.test(x.out) && /colleague@nitda\.gov\.ng (added as|is already) an admin operator/.test(x.out) && /Setup complete/.test(x.out)
    && JSON.stringify(x.published?.endpoints) === JSON.stringify(base0.published.endpoints) && !state.calls.some((c) => c.includes('/login/') || c.includes('/flow/')), x.out.slice(-1500));
  const xbad = await setup(['--manual', '--endpoints', file, '--key', 'short', '--operator', 'a@b.gov.ng'], 'X2');
  ok('X: --manual refuses a key that could not be a flow key, before calling anything', xbad.code === 1 && /--key must be/.test(xbad.out), xbad.out.slice(-600));
  fs.writeFileSync(file, 'MAIL_SEND=https://example.invalid/x\n');
  const xmiss = await setup(['--manual', '--endpoints', file, '--key', key, '--operator', 'a@b.gov.ng'], 'X3');
  ok('X: --manual names every flow whose URL is missing', xmiss.code === 1 && /MAIL_LOG \(DGO_MAIL_LOG\)/.test(xmiss.out) && /MAIL_DATA/.test(xmiss.out), xmiss.out.slice(-600));
  ok('X: a blocked sign-in points to Manual setup', /Manual setup" in GO-LIVE\.html \(setup --manual\)/.test(fs.readFileSync(path.join(PKG, 'tools', 'setup.mjs'), 'utf8'))
    && /id="manual"/.test(fs.readFileSync(path.join(PKG, 'GO-LIVE.html'), 'utf8')));
}

/* Y — lists that exist but are not indexed are indexed by the next setup. */
{
  reset();
  ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates'].forEach((t) => mockFlows.provisioned.add(t));
  const y = await setup([], 'Y');
  ok('Y: every list is reported with Title and Created indexed, and setup completes',
    y.code === 0 && ['DGOMailLog', 'DGOMailDirectory', 'DGOMailTemplates', 'DGOMailOperators', 'DGOMailSessions', 'DGOMailCampaigns', 'DGOMailReports', 'DGOMailFiles'].every((t) => new RegExp(`${t}: [^\\n]*Title and Created indexed`).test(y.out)) && /Setup complete/.test(y.out), y.out.slice(-1800));
}

/* S — FOLIO_MS_SESSION: the first run signs in with a code and keeps the sign-in; the next needs none. */
{
  const session = path.join(work, 'ms', 'session.json');
  reset();
  const s1 = await setup([], 'S1', { env: { FOLIO_MS_SESSION: session } });
  const saved = fs.existsSync(session) ? JSON.parse(fs.readFileSync(session, 'utf8')) : null;
  ok('S: the first run signs in with a code and keeps the sign-in, private', s1.code === 0 && state.deviceCodes === 1 && saved?.refreshToken === 'rt-1'
    && (fs.statSync(session).mode & 0o777) === 0o600 && /kept for next time/.test(s1.out), s1.out.slice(-800));
  ok('S: only the refresh token is kept — no access token reaches the file', saved && !JSON.stringify(saved).includes('eyJ'));
  reset();
  const s2 = await setup([], 'S2', { env: { FOLIO_MS_SESSION: session } });
  ok('S: the next run uses the saved sign-in — no code is shown', s2.code === 0 && (state.deviceCodes || 0) === 0 && /the saved sign-in, no code needed/.test(s2.out) && !/ABCD-EFGH/.test(s2.out), s2.out.slice(-800));
  fs.writeFileSync(session, JSON.stringify({ ...saved, refreshToken: 'rt-revoked' }), { mode: 0o600 });
  reset();
  const s3 = await setup([], 'S3', { env: { FOLIO_MS_SESSION: session } });
  ok('S: a revoked saved sign-in falls back to a code, and is replaced', s3.code === 0 && state.deviceCodes === 1 && /can no longer be used/.test(s3.out)
    && JSON.parse(fs.readFileSync(session, 'utf8')).refreshToken === 'rt-1', s3.out.slice(-800));
  reset();
  const s4 = await setup([], 'S4');
  ok('S: without FOLIO_MS_SESSION nothing is read: every run signs in afresh', s4.code === 0 && state.deviceCodes === 1);
}

server.close();
fs.rmSync(work, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
