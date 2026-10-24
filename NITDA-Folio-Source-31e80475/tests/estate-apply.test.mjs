#!/usr/bin/env node
/**
 * The estate orchestrator, run as shipped: docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js is executed in
 * a VM against a simulated tenant — the Flow API a maker-portal tab talks to, and the SharePoint
 * REST a SharePoint tab talks to. Nothing here stubs the runtime; the file under test is the file
 * an operator pastes.
 *
 * It proves the things that would do damage if they were wrong:
 *   · planning writes nothing, and never prints a trigger URL;
 *   · a write is backed up first and read back — a flow whose structure did not land is restored
 *     and the run stops;
 *   · the directory sync gets its 05:45 WAT trigger;
 *   · values writes every key's address from the flow that answers it, and nothing to the console;
 *   · the reference-data pass adds only the missing unit and moves only the owner's rows.
 *
 * Since 2026-10-06 the orchestrator installs only the two governance packages (the directory sync
 * and the flow-truth persistence scope). The replacement packages for the endpoint flows and the key
 * moves to the owner map's flows are retired (registers/flow-adoption.json): every key stays on its
 * adopted flow, and the identification packages change those flows.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { installPackage, validateWiring } from '../scripts/lib/flow-install.mjs';
import { EndpointAtlas } from '../config/endpoint-atlas.data.js';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const section = (t) => console.log(`\n${t}\n`);
const FILE = 'docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js';
const SOURCE = readFileSync(FILE, 'utf8');
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const wid = (key) => EndpointAtlas.keys.find((k) => k.key === key).workflowId.toLowerCase();
/* Every package the repository holds for a live flow: the governance surface and the identification packages. */
const PACKAGE_DIRS = ['docs/folio-Master-Flows-and-Endpoints/surfaces/governance',
  ...readdirSync('docs/folio-Master-Flows-and-Endpoints/packages').filter((d) => d.startsWith('identification-')).map((d) => `docs/folio-Master-Flows-and-Endpoints/packages/${d}`)];
const packageFiles = () => PACKAGE_DIRS.flatMap((d) => readdirSync(d).filter((n) => n.endsWith('.json')).map((n) => `${d}/${n}`));
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ───────────────────────────── simulated tenant ───────────────────────────── */

const OLD_BODY = { Compose_Old: { type: 'Compose', inputs: 'old' } };
const httpFlow = (id, name, workflowId, actions = OLD_BODY) => ({
  id, workflowId,
  flow: { name: id, properties: { displayName: name, connectionReferences: { shared_sharepointonline: { connectionName: 'live-sp', id: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', source: 'Embedded' } },
    definition: { triggers: { manual: { type: 'Request', kind: 'Http', inputs: { schema: {} } } }, actions: clone(actions) } } },
});

function tenant() {
  const flows = [
    httpFlow('f-verify', 'CG_Portal_Verification_Endpoint', wid('VERIFY')),
    httpFlow('f-confirm', 'CG_Portal_Verification_Confirmation_Endpoint', wid('VERIFY_CONFIRM')),
    httpFlow('f-submit', 'CG_Submission_Endpoint', wid('SUBMISSION')),
    httpFlow('f-status-1', 'CG_Portal_Status_Check_Endpoint', wid('STATUS')),
    httpFlow('f-support', 'CG_Portal_Support_Endpoint', wid('SUPPORT')),
    httpFlow('f-writeback', 'CG_Portal_Writeback_Endpoint', wid('WRITEBACK')),
    httpFlow('f-otp', 'IP_OTP_Endpoint', wid('OTP_GENERATE')),
    httpFlow('f-fetchall', 'IP_FETCH_ALL_BOOTSTRAP', wid('FETCH_ALL')),
    httpFlow('f-docs', 'IP_Get_Docs_Endpoint', wid('GET_DOCS')),
    httpFlow('f-unrelated', 'Some other flow', '0123456789abcdef0123456789abcdef'),
  ];
  // The directory sync: a manual trigger and an older Scope_Global.
  flows.push({ id: 'f-sync', workflowId: null, flow: { name: 'f-sync', properties: { displayName: 'DGO User Directory Microsoft 365 Synchronization', connectionReferences: {},
    definition: { triggers: { manual: { type: 'Request', kind: 'Button', inputs: {} } }, actions: { Scope_Global: { type: 'Scope', actions: { Search_for_users_V2: { type: 'OpenApiConnection', inputs: {} } } } } } } } });
  return { flows, writes: [], calls: [], failPatch: new Set(), corruptPatch: new Set(), sp: spTenant(), acceptAuth: 'Bearer TOKEN' };
}

function spTenant() {
  const units = JSON.parse(JSON.stringify([
    ['Cybersecurity Department', 'CS'], ['Special Duties Office', 'SDO'], ['Stakeholders Management and Partnerships Department', 'SMP'],
  ])).map(([Title, field_1], i) => ({ Id: i + 1, Title, field_1 }));
  const cats = [
    { Id: 1, Title: 'GOV TO GOV', field_2: 'StakeHolder Engagements', field_4: 'SMP' },
    { Id: 2, Title: 'GOV TO GOV', field_2: 'Inter Agency Collaborations', field_4: 'SDO' },
    { Id: 3, Title: 'GOV TO GOV', field_2: 'Something Else', field_4: 'SMP' },
  ];
  return { units, cats, posts: [], merges: [] };
}

function makeFetch(T) {
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    T.calls.push(`${method} ${url}`);
    const u = new URL(url);
    if (u.hostname.endsWith('sharepoint.com')) return spFetch(T.sp, u, method, init, json);
    // A run's action outputs sit behind a signed link that needs no sign-in.
    if (u.hostname === 'outputs.example') return json(200, (T.outputs || {})[u.pathname] || {});
    const auth = init.headers?.Authorization || init.headers?.authorization;
    if (auth !== T.acceptAuth) return json(401, { error: { message: 'unauthorized' } });
    const rm = /\/environments\/[^/]+\/flows\/([^/]+)\/runs(?:\/([^/]+)\/actions|\/[^/]+)?$/.exec(u.pathname);
    if (rm) {
      const runs = (T.runs || {})[rm[1]];
      if (!runs) return json(404, { error: { message: 'no such flow' } });
      if (!rm[2]) {
        const one = /\/runs\/([^/]+)$/.exec(u.pathname);
        if (one && runs.expanded?.[one[1]]) return json(200, { name: one[1], properties: { actions: runs.expanded[one[1]] } });
        return json(200, { value: runs.list });
      }
      return runs.actions[rm[2]] ? json(200, { value: runs.actions[rm[2]] }) : json(404, {});
    }
    const m = /\/environments\/([^/]+)\/flows(?:\/([^/?]+))?(\/triggers\/([^/]+)\/listCallbackUrl)?/.exec(u.pathname);
    if (!m || m[1] !== ENV) return json(404, { error: { message: 'no such environment' } });
    if (!m[2]) {
      if (T.listRefusal) return json(403, { error: { code: 'Forbidden', message: 'simulated refusal' } });
      // As the live service answered on 2026-09-27: $top=250 is refused with 400.
      if (u.searchParams.has('$top')) return json(400, { error: { code: 'InvalidQuery', message: 'simulated $top refusal' } });
      if ((u.searchParams.get('$filter') || '').includes('team')) return T.rejectTeam ? json(400, { error: { message: 'no team search' } }) : json(200, { value: [] });
      return json(200, { value: T.flows.map((f) => ({ name: f.id, properties: { displayName: f.flow.properties.displayName } })) });
    }
    const f = T.flows.find((x) => x.id === m[2]);
    if (!f) return json(404, {});
    // A trigger set to demand a Microsoft sign-in has an address with no signature.
    if (m[3]) return f.workflowId ? json(200, { response: { value: `https://prod.example/workflows/${f.workflowId}/triggers/manual/paths/invoke?api-version=1${T.unsigned?.has(f.id) ? '' : `&sig=SIGNED-SECRET-${f.id}`}` } }) : json(400, {});
    if (method === 'GET') return json(200, clone(f.flow));
    if (method === 'PATCH') {
      if (T.failPatch.has(f.id)) return json(400, { error: { message: 'simulated refusal' } });
      const body = JSON.parse(init.body);
      T.writes.push({ id: f.id, definition: clone(body.properties.definition) });
      f.flow.properties.definition = clone(body.properties.definition);
      f.flow.properties.connectionReferences = clone(body.properties.connectionReferences);
      if (T.corruptPatch.has(f.id)) { // the service stores less than was written: a nested step is lost
        T.corruptPatch.delete(f.id);
        const drop = (actions) => { for (const a of Object.values(actions || {})) { if (a.actions && Object.keys(a.actions).length) { delete a.actions[Object.keys(a.actions).at(-1)]; return true; } } return false; };
        drop(f.flow.properties.definition.actions);
      }
      return json(200, clone(f.flow));
    }
    return json(405, {});
  };
}

function spFetch(S, u, method, init, json) {
  const p = decodeURIComponent(u.pathname);
  if (p.endsWith('/_api/contextinfo')) return json(200, { FormDigestValue: 'digest' });
  const list = /lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?/.exec(p);
  if (!list) return json(404, {});
  const rows = list[1].startsWith('8aab9c4e') ? S.units : S.cats;
  if (method === 'GET') return json(200, { value: clone(rows) });
  if (method === 'POST' && init.headers?.['X-HTTP-Method'] === 'MERGE') {
    const row = rows.find((r) => r.Id === Number(list[2])); Object.assign(row, JSON.parse(init.body)); S.merges.push({ id: row.Id, ...JSON.parse(init.body) });
    return { ok: true, status: 204, text: async () => '' };
  }
  if (method === 'POST') { const b = JSON.parse(init.body); rows.push({ Id: rows.length + 100, ...b }); S.posts.push(b); return json(201, b); }
  return json(405, {});
}

/* Run the shipped file in a VM, exactly as a console paste would. */
async function paste(T, hostname, { storageToken = true } = {}) {
  const logs = [], downloads = [], blobs = new Map(), clip = [];
  const tokenStore = { length: 1, key: () => 'msal.x-accesstoken-service.flow.microsoft.com', getItem: () => JSON.stringify({ secret: 'TOKEN', target: 'https://service.flow.microsoft.com//.default', expiresOn: 9e12 }) };
  const empty = { length: 0, key: () => null, getItem: () => null };
  const window = { fetch: makeFetch(T), sessionStorage: storageToken ? tokenStore : empty, localStorage: { length: 0, key: () => null, getItem: () => null } };
  const ctx = {
    window, console: { log: (...a) => logs.push(a.map(String).join(' ')), table: (t) => logs.push(JSON.stringify(t)) },
    navigator: { clipboard: { writeText: async (t) => { clip.push(t); } } },
    location: { hostname, href: `https://${hostname}/` }, setTimeout, atob, performance: { getEntriesByType: () => [] }, Blob,
    URL: Object.assign(function (...a) { return new URL(...a); }, { createObjectURL: (b) => { const id = `blob:${blobs.size}`; blobs.set(id, b); return id; } }),
    document: { body: { appendChild() {} }, createElement: () => ({ click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); }, remove() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  const settle = async (p) => { const v = await p; for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); return v; };
  return { estate: window.ESTATE, window, logs, downloads, clip, settle, read: async (d) => JSON.parse(await d.blob.text()) };
}

/* ───────────────────────────── tests ───────────────────────────── */

section('The shipped file');
ok(execFileSync('node', ['scripts/build-estate-apply.mjs', '--check'], { encoding: 'utf8' }).includes('are current'), 'ESTATE_APPLY.console.js and estate-apply.cli.mjs are current against their sources');
ok(!/sig=[A-Za-z0-9%_-]{10,}/.test(SOURCE) && !SOURCE.includes('urlTemplate'), 'it carries no trigger URL and no signature');
ok(SOURCE.includes(installPackage.toString()) && SOURCE.includes(validateWiring.toString()), 'it embeds the same installer the CLI uses, byte for byte');
ok(!/\/scopes\/admin\//.test(SOURCE), 'it calls no admin-scoped Flow API path');

section('Wiring: the defect is reading an unfinished branch, not running in parallel');
{
  const parallel = { actions: { A: { type: 'Compose', inputs: 1 }, B: { type: 'Compose', inputs: 2 }, C: { type: 'Compose', inputs: "@outputs('A')", runAfter: { A: ['Succeeded'] } } } };
  ok(validateWiring(parallel).length === 0, 'two independent branches are accepted');
  const race = { actions: { A: { type: 'Compose', inputs: 1 }, B: { type: 'Compose', inputs: "@outputs('A')" } } };
  ok(validateWiring(race).some((p) => p.includes('B reads A')), 'a branch that reads the other branch is refused');
  const nested = { actions: { A: { type: 'Compose', inputs: 1 }, S: { type: 'Scope', runAfter: { A: ['Succeeded'] }, actions: { X: { type: 'Compose', inputs: "@outputs('A')" } } }, L: { type: 'Foreach', foreach: '@x', actions: { Y: { type: 'Compose', inputs: "@items('L')" } } } } };
  ok(validateWiring(nested).length === 0, 'a nested action may read what its enclosing action waited for, and its own loop');
}

section('Session from the portal\'s own request (no readable token in storage)');
{
  const T = tenant();
  T.acceptAuth = 'Bearer PORTAL';
  const { window, logs } = await paste(T, 'make.powerautomate.com', { storageToken: false });
  ok(logs.some((l) => l.includes('click "My flows"')), 'with no session seen yet, it asks for "My flows" and waits');
  ok(!logs.some((l) => l.startsWith('[{"package"')), 'it plans nothing before it has a session');
  // The portal lists flows through the hooked fetch, as it does when "My flows" is clicked.
  await window.fetch(`https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}/flows?api-version=1`, { headers: { Authorization: 'Bearer PORTAL' } });
  const deadline = Date.now() + 10000;
  while (!logs.some((l) => l.startsWith('[{"package"')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  ok(logs.some((l) => l.startsWith('[{"package"')), 'it picks up the portal\'s session and plans');
  ok(!logs.some((l) => l.includes('PORTAL')), 'it never prints the captured token');
  ok(!T.calls.some((c) => c.startsWith('PATCH')), 'the plan still writes nothing');
}

section('A Flow-service token seen on another host is used on the Flow API');
{
  const T = tenant();
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').split('=').join('').split('+').join('-').split('/').join('_');
  const jwt = `Bearer ${b64u({ alg: 'none' })}.${b64u({ aud: 'https://service.flow.microsoft.com/' })}.sig`;
  const other = `Bearer ${b64u({ alg: 'none' })}.${b64u({ aud: 'https://graph.microsoft.com' })}.sig`;
  T.acceptAuth = jwt;
  const { window, logs, estate } = await paste(T, 'make.powerautomate.com', { storageToken: false });
  // The portal calls other services; one of those calls carries a token issued for the Flow service.
  await window.fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: other } }).catch(() => {});
  await window.fetch('https://tenant.api.powerplatform.com/powerapps/userSettings/x', { headers: { Authorization: jwt } }).catch(() => {});
  const deadline = Date.now() + 10000;
  while (!logs.some((l) => l.startsWith('[{"package"')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  ok(logs.some((l) => l.startsWith('[{"package"')), 'it recognises the token by its audience and plans');
  ok(!T.calls.some((c) => c.includes('graph.microsoft.com') && c.includes('ProcessSimple')), 'a token for another service is not tried on the Flow API');
  const before = logs.length;
  const rows = estate.diagnose();
  const printed = logs.slice(before).join('\n');
  ok(rows.some((r) => r.host === 'tenant.api.powerplatform.com' && r.tokenAudiences.includes('service.flow.microsoft.com')), 'diagnose() lists hosts and token audiences');
  ok(!printed.includes(jwt.slice(7)) && !printed.includes('.sig'), 'diagnose() prints no token');
}

section('Session handed over by hand: ESTATE.useToken()');
{
  const T = tenant();
  const secret = 'eyJhbGciOi.MANUALTOKENVALUE0123456789.sig';
  T.acceptAuth = `Bearer ${secret}`;
  const { estate, logs, settle } = await paste(T, 'make.powerautomate.com', { storageToken: false });
  let err = null;
  try { await settle(estate.useToken('Bearer eyJhbGciOi.EXPIREDTOKEN0123456789.sig')); } catch (e) { err = e; }
  ok(err && err.message.includes('refused that token'), 'a token the Flow service refuses is reported, not used');
  err = null;
  try { await settle(estate.useToken('not a token')); } catch (e) { err = e; }
  ok(err && err.message.includes('not an authorization header value'), 'a value that is not a token is refused before any request');
  ok(await settle(estate.useToken(`authorization: Bearer ${secret}`)) === true, 'the header as copied from DevTools (with "authorization:" and "Bearer") is accepted');
  const before = logs.length;
  await settle(estate.plan());
  ok(logs.slice(before).some((l) => l.startsWith('[{"package"')), 'plan() then runs on that session');
  ok(!logs.some((l) => l.includes('MANUALTOKENVALUE') || l.includes('EXPIREDTOKEN')), 'no token, accepted or refused, is ever printed');
  ok(!T.calls.some((c) => c.startsWith('PATCH')), 'handing over a token writes nothing');
}

section('Flow listing: no $top, and a refused listing is an error, not "no flows"');
{
  const T = tenant();
  T.rejectTeam = true;
  const { logs } = await paste(T, 'make.powerautomate.com');
  ok(T.calls.some((c) => /GET \S+\/flows\?api-version/.test(c)), 'a refused page size falls back to the plain listing the live service accepts');
  ok(logs.some((l) => l.includes('shared-flow listing skipped')) && logs.some((l) => l.startsWith('[{"package"')), 'a refused shared-flow pass is noted and planning continues');
  const T2 = tenant();
  const { estate } = await paste(T2, 'make.powerautomate.com');
  T2.listRefusal = true;
  let err = null;
  try { await estate.plan(); } catch (e) { err = e; }
  ok(err && err.message.includes('Listing your flows was refused') && err.message.includes('403'), 'a refused listing stops the plan with the service message');
}

section('A dropped connection is retried; a dropped write is resolved by reading the flow back');
{
  const T = tenant();
  const { estate, window, logs, settle } = await paste(T, 'make.powerautomate.com');
  const real = window.__estateAuthV2.origFetch;
  let drops = 1;
  window.__estateAuthV2.origFetch = (u, i) => (drops-- > 0 && String(u).includes('/flows?') ? Promise.reject(new TypeError('Failed to fetch')) : real(u, i));
  const before = logs.length;
  await settle(estate.plan());
  ok(logs.slice(before).some((l) => l.includes('connection dropped; retrying')), 'a dropped listing is retried');
  ok(logs.slice(before).some((l) => l.startsWith('[{"package"')), 'and the plan completes');
  // A write whose response is lost after the service applied it.
  let lost = 1;
  window.__estateAuthV2.origFetch = async (u, i) => {
    const r = await real(u, i);
    if (lost > 0 && String((i || {}).method).toUpperCase() === 'PATCH') { lost--; throw new TypeError('Failed to fetch'); }
    return r;
  };
  const rep = await settle(estate.apply({ only: ['DGO_USERDIRECTORY_SYNC'] }));
  const row = rep.rows.find((r) => r.package === 'DGO_USERDIRECTORY_SYNC');
  ok(row.status === 'APPLIED', 'a write that landed despite the dropped response is confirmed by read-back, not reported as failed');
  ok(T.calls.filter((c) => c.startsWith('PATCH')).length === 1, 'the write is not sent twice');
}

section('plan() waits for a useToken() that was not awaited');
{
  const T = tenant();
  T.acceptAuth = 'Bearer eyJhbGciOi.NOTAWAITED0123456789.sig';
  const { estate, logs, settle } = await paste(T, 'make.powerautomate.com', { storageToken: false });
  estate.useToken('Bearer eyJhbGciOi.NOTAWAITED0123456789.sig');
  const before = logs.length;
  await settle(estate.plan());
  ok(logs.slice(before).some((l) => l.startsWith('[{"package"')) && !logs.slice(before).some((l) => l.includes('Waiting 20 seconds')), 'it plans on the handed-over session without the 20-second wait');
}

section('No session anywhere: it stops and gives the hand-over steps');
{
  const T = tenant();
  T.acceptAuth = 'Bearer NEVER';
  const { logs } = await paste(T, 'make.powerautomate.com', { storageToken: false });
  const deadline = Date.now() + 30000;
  while (!logs.some((l) => l.includes('ESTATE.useToken(')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  ok(logs.some((l) => l.includes('Network tab') && l.includes('ESTATE.useToken(')), 'after the short wait it prints the DevTools steps for useToken()');
  ok(logs.some((l) => l.includes('await ESTATE.plan()')), 'and says what to run next');
}

section('Planning reads only');
{
  const T = tenant();
  const { logs } = await paste(T, 'make.powerautomate.com');
  ok(logs.some((l) => /read \d+ of \d+ flows/.test(l)), 'it reports progress while it reads the flows');
  const rows = JSON.parse(logs.find((l) => l.startsWith('[{"package"')));
  const st = Object.fromEntries(rows.map((r) => [r.package, r]));
  ok(!T.calls.some((c) => c.startsWith('PATCH')), 'the plan writes nothing');
  ok(!logs.join('\n').includes('SIGNED-SECRET'), 'no trigger URL reaches the console');
  ok(rows.map((r) => r.package).sort().join() === 'DGO_FLOW_TRUTH_PERSISTENCE,DGO_USERDIRECTORY_SYNC', 'it plans the two governance packages and no replacement package for an endpoint flow', rows.map((r) => r.package).join());
  ok(st.DGO_USERDIRECTORY_SYNC.status === 'WILL_UPDATE' && /trigger updated/.test(st.DGO_USERDIRECTORY_SYNC.detail), 'the directory sync is found by its own actions and gets its trigger');
  ok(st.DGO_FLOW_TRUTH_PERSISTENCE.status !== 'WILL_UPDATE', 'a scope with no host flow in the tenant is not written', st.DGO_FLOW_TRUTH_PERSISTENCE.status);
}

section('Applying: backup first, every write read back');
{
  const T = tenant();
  const { estate, downloads, settle, read } = await paste(T, 'make.powerautomate.com');
  const before = clone(T.flows.find((f) => f.id === 'f-sync').flow.properties.definition);
  const firstPatch = () => T.calls.findIndex((c) => c.startsWith('PATCH'));
  const out = await settle(estate.apply());
  const st = Object.fromEntries(out.rows.map((r) => [r.package, r.status]));
  ok(downloads[0]?.name.startsWith('estate-backup-') && firstPatch() > -1, 'a backup is downloaded before the first write');
  const backup = await read(downloads[0]);
  ok(JSON.stringify(backup.flows['f-sync'].properties.definition) === JSON.stringify(before), 'the backup holds the flow exactly as it was');
  ok(T.writes.map((w) => w.id).join() === 'f-sync' && st.DGO_USERDIRECTORY_SYNC === 'APPLIED', 'only the directory sync is written, and it is verified as applied', T.writes.map((w) => w.id).join());
  const sync = T.writes.find((w) => w.id === 'f-sync').definition;
  ok(sync.triggers.Recurrence?.recurrence?.schedule?.hours?.[0] === '5' && sync.triggers.Recurrence.recurrence.schedule.minutes[0] === 45 && !sync.triggers.manual, 'the sync runs daily at 05:45 WAT and the manual trigger is gone');
  ok(Object.keys(sync.actions).includes('Initialize_variable_DecisionLog'), 'the sync gets every variable its scope reads, DecisionLog included');
  ok(!JSON.stringify(sync).includes('"connection":'), 'every connector host is in the definition spelling');
  ok(downloads.at(-1).name.startsWith('estate-apply-report-'), 'a run report is downloaded');
  const report = JSON.stringify(await read(downloads.at(-1)));
  ok(!report.includes('SIGNED-SECRET') && !report.includes('TOKEN'), 'the report carries no credential');
  const again = await settle(estate.plan({ quiet: true }));
  ok(again.rows.find((r) => r.package === 'DGO_USERDIRECTORY_SYNC').status === 'UP_TO_DATE', 'a second plan finds the written flow current');
  /* What the service does to a stored flow (2026-09-27): it adds inputs.authentication to every connector action. */
  const addAuth = (acts) => { for (const a of Object.values(acts || {})) {
    if (a?.type === 'OpenApiConnection' && a.inputs) a.inputs.authentication = "@parameters('$authentication')";
    addAuth(a?.actions); addAuth(a?.else?.actions); for (const c of Object.values(a?.cases || {})) addAuth(c?.actions); addAuth(a?.default?.actions);
  } };
  addAuth(T.flows.find((f) => f.id === 'f-sync').flow.properties.definition.actions);
  const third = await settle(estate.plan({ quiet: true }));
  ok(third.rows.find((r) => r.package === 'DGO_USERDIRECTORY_SYNC').status === 'UP_TO_DATE', 'a flow that differs only by the service-added authentication field is still UP_TO_DATE, not rewritten');
  await settle(estate.rollback());
  ok(JSON.stringify(T.flows.find((f) => f.id === 'f-sync').flow.properties.definition) === JSON.stringify(before), 'rollback restores the flow this tab changed');
}

section('A refused write stops the run');
{
  const T = tenant(); T.failPatch.add('f-sync');
  const { estate, settle } = await paste(T, 'make.powerautomate.com');
  const out = await settle(estate.apply());
  const st = Object.fromEntries(out.rows.map((r) => [r.package, r]));
  ok(st.DGO_USERDIRECTORY_SYNC.status === 'FAILED' && /simulated refusal/.test(st.DGO_USERDIRECTORY_SYNC.detail), 'the refusal is reported with the service message');
}

section('A write whose structure did not land is restored');
{
  const T = tenant(); T.corruptPatch.add('f-sync');
  const before = clone(T.flows.find((f) => f.id === 'f-sync').flow.properties.definition);
  const { estate, settle } = await paste(T, 'make.powerautomate.com');
  const out = await settle(estate.apply());
  const r = out.rows.find((x) => x.package === 'DGO_USERDIRECTORY_SYNC');
  ok(r.status === 'FAILED' && /restored from the backup/.test(r.detail), 'a step the service did not store is caught on read-back', r.detail);
  ok(JSON.stringify(T.flows.find((f) => f.id === 'f-sync').flow.properties.definition) === JSON.stringify(before), 'the flow is back exactly as it was');
}

section('values, on the estate as the live run of 2026-09-27 found it');
{
  /* Read live: IP_Dynamic_Global_Actions_Endpoint answers the workflow id DYNAMIC_ACTIONS and SUBSIDIARY_ACTIONS share
     (both adopted on it); IP_OTP_VERIFY answers the one OTP_GENERATE and OTP_VERIFY share; IP_SCAN_INTAKE's trigger
     demands a sign-in. */
  const T = tenant();
  const DYN = '31c0aaf0-ddbb-478c-9a98-bc013265c4c7', OTP_VER = '4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61', OTP_GEN = 'e5632336-641f-4b9b-bd93-99185b5eb975';
  T.flows = T.flows.filter((f) => f.id !== 'f-otp');
  T.flows.push(httpFlow(DYN, 'IP_Dynamic_Global_Actions_Endpoint', wid('DYNAMIC_ACTIONS')));
  /* Since 2026-10-07 OTP_GENERATE has a flow of its own (IP_OTP_GENERATE, flow-adoption.json); IP_OTP_VERIFY only verifies. */
  T.flows.push(httpFlow(OTP_VER, 'IP_OTP_VERIFY', wid('OTP_VERIFY')));
  T.flows.push(httpFlow(OTP_GEN, 'IP_OTP_GENERATE', wid('OTP_GENERATE')));
  T.flows.push(httpFlow('f-scan', 'IP_SCAN_INTAKE', wid('SCAN_INTAKE')));
  T.unsigned = new Set(['f-scan']);
  ok(wid('DYNAMIC_ACTIONS') === wid('SUBSIDIARY_ACTIONS'), 'the register wires DYNAMIC_ACTIONS and SUBSIDIARY_ACTIONS to one workflow id');
  const { estate, downloads, logs, settle } = await paste(T, 'make.powerautomate.com');
  const v = await settle(estate.values());
  const file = downloads.find((d) => d.name === 'dgo-values.txt');
  const text = file ? await file.blob.text() : '';
  const line = (k) => (text.match(new RegExp(`^DGO_ENDPOINT_${k}=(.*)$`, 'm')) || [])[1] || '';
  ok(/SIGNED-SECRET-31c0aaf0/.test(line('DYNAMIC_ACTIONS')) && /SIGNED-SECRET-31c0aaf0/.test(line('SUBSIDIARY_ACTIONS')), 'DYNAMIC_ACTIONS and SUBSIDIARY_ACTIONS both get the address of the one flow they share');
  ok(/SIGNED-SECRET-e5632336/.test(line('OTP_GENERATE')) && /SIGNED-SECRET-4dbe6dde/.test(line('OTP_VERIFY')), 'each OTP key gets the address of its own flow (IP_OTP_GENERATE, IP_OTP_VERIFY)');
  const table = JSON.parse(logs.filter((l) => l.startsWith('[{"surface"')).pop() || '[]');
  const scan = table.find((r) => r.key === 'SCAN_INTAKE');
  ok(scan && scan.status === 'MISSING' && /no signature/.test(scan.detail) && /IP_SCAN_INTAKE \(f-scan\)/.test(scan.detail) && !line('SCAN_INTAKE'), 'a trigger that demands a sign-in is named as the reason, with the flow id, and left out', scan && scan.detail);
  ok(table.filter((r) => r.status === 'WRITTEN').every((r) => /\([0-9a-z-]+\)$/.test(r.detail)), 'every written row names the flow id it was read from');
  ok(v.missing.includes('SCAN_INTAKE') && !logs.join('\n').includes('SIGNED-SECRET'), 'no address reaches the console');
}

section('Key-only work reads the flows attributed to keys, not every flow');
{
  const live = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-27-live-endpoint-wiring.json', 'utf8')).rows;
  const T = tenant();
  T.flows = [];
  /* OTP_GENERATE was on IP_OTP_VERIFY at that read; it has moved to its own flow, added below. */
  for (const r of live) if (r.key !== 'OTP_GENERATE' && EndpointAtlas.keys.some((k) => k.key === r.key) && !T.flows.some((f) => f.id === r.liveFlowId)) T.flows.push(httpFlow(r.liveFlowId, r.liveFlowName, wid(r.key)));
  /* Flows created after that read, each adopted for its key in flow-adoption.json. */
  for (const [id, name, key] of [['e5632336-641f-4b9b-bd93-99185b5eb975', 'IP_OTP_GENERATE', 'OTP_GENERATE'], ['e3e5c825-55ba-447e-88c1-96b7e89fd013', 'IP_User_Admin_Endpoint', 'USER_ADMIN'], ['b4db02d8-02a0-4bc9-b9d3-06e2aae2448c', 'IP_Activity_Lifecycle_Endpoint', 'ACTIVITY_LIFECYCLE']])
    if (!T.flows.some((f) => f.id === id)) T.flows.push(httpFlow(id, name, wid(key)));
  for (let i = 0; i < 40; i++) T.flows.push(httpFlow(`unrelated-${i}`, `Unrelated ${i}`, `${String(i).padStart(2, '0')}`.repeat(16)));
  const readsOf = (calls) => calls.filter((c) => /^GET .*\/flows\/[^/?]+\?/.test(c)).map((c) => /\/flows\/([^/?]+)/.exec(c)[1]);
  const { estate, logs, settle } = await paste(T, 'make.powerautomate.com');
  await settle(new Promise((r) => setTimeout(r, 50)));
  T.calls.length = 0; // pasting runs a full plan first, by design; count only what values reads
  await settle(estate.values());
  const read = readsOf(T.calls);
  ok(read.length && read.every((id) => !id.startsWith('unrelated-')), `values reads only the flows attributed to keys (${new Set(read).size} of ${T.flows.length})`, read.filter((id) => id.startsWith('unrelated-')).slice(0, 3).join());
  ok(logs.some((l) => /reading the \d+ flow\(s\) the repository attributes to endpoint keys, not all \d+/.test(l)), 'and says so');

  /* A key whose flow moved to one the repository has never attributed: nothing may be missed. */
  const moved = T.flows.find((f) => f.id === live.find((r) => r.key === 'REFERENCE_DATA').liveFlowId);
  moved.workflowId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  T.flows.push(httpFlow('unrelated-new-home', 'Moved reference data', wid('REFERENCE_DATA')));
  T.calls.length = 0; logs.length = 0;
  const v = await settle(estate.values());
  ok(readsOf(T.calls).includes('unrelated-new-home') && logs.some((l) => /not answered by those flows; reading the other/.test(l)), 'when a wired workflow id is not answered by a known flow, every other flow is read');
  ok(!v.missing.includes('REFERENCE_DATA'), 'and the key is still found');
}

section('No package asks the service for more than it accepts');
{
  /* Refused live on 2026-09-27: "The value specified for property 'minimumItemsCount' exceeds the
     maximum allowed. Actual: '10000'. Maximum: '5000'" (InvalidPaginationPolicy). */
  const over = [];
  const walk = (v, file) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, file));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'minimumItemCount' && Number(x) > 5000) over.push(`${file}: ${x}`); walk(x, file); }
  };
  for (const f of packageFiles()) walk(JSON.parse(readFileSync(f, 'utf8')), f);
  ok(!over.length, `every pagination threshold in every package (${packageFiles().length} files) is at most 5000`, over.join('; '));
}

section('run: why a flow run failed, read only');

{
  const T = tenant();
  const FLOW = 'de9ef13b-ae4c-42b0-9afa-20e71a180759';
  const link = 'https://outputs.example/create-record?sv=1&sig=OUTPUTS-SECRET';
  T.runs = { [FLOW]: {
    list: [
      { name: 'RUN-OK', properties: { status: 'Succeeded', startTime: '2026-09-27T21:40:00Z' } },
      { name: 'RUN-BAD', properties: { status: 'Failed', startTime: '2026-09-27T21:51:21Z', code: 'ActionFailed' } },
    ],
    actions: { 'RUN-BAD': [
      { name: 'Scope_Global_Submission', properties: { status: 'Failed', code: 'ActionFailed', error: { code: 'ActionFailed', message: 'An action failed. No dependent actions succeeded.' } } },
      { name: 'Create_Submission_Record', properties: { status: 'Failed', code: 'BadRequest', error: { code: 'BadRequest', message: 'generic' }, outputsLink: { uri: link } } },
      { name: 'Scope_Catch_Submission', properties: { status: 'Succeeded' } },
    ] },
  } };
  T.outputs = { '/create-record': { statusCode: 400, body: { status: 400, message: "Column 'SenderPhone' does not exist. It may have been deleted by another user." } } };
  const { estate, logs, settle } = await paste(T, 'make.powerautomate.com');
  const r = await settle(estate.run({ flowId: FLOW }));
  ok(r.runId === 'RUN-BAD', 'with no run named, it reads the newest failed run');
  ok(r.failed.length === 1 && r.failed[0].action === 'Create_Submission_Record' && r.failed[0].http === 400 && /SenderPhone/.test(r.failed[0].detail), 'it names the action that failed on its own account, with the service\'s message', JSON.stringify(r.failed));
  ok(!logs.join('\n').includes('OUTPUTS-SECRET') && !logs.join('\n').includes('outputs.example'), 'the signed outputs link is never shown');
  ok(!T.calls.some((c) => /^(PATCH|POST|PUT|DELETE) .*\/runs/.test(c)), 'it only reads');
  // Where the service does not answer .../actions, the run is read with its actions expanded.
  T.runs[FLOW].expanded = { 'RUN-BAD': Object.fromEntries(T.runs[FLOW].actions['RUN-BAD'].map((a) => [a.name, a.properties])) };
  delete T.runs[FLOW].actions['RUN-BAD'];
  const r2 = await settle(estate.run({ flowId: FLOW, runId: 'RUN-BAD' }));
  ok(r2.failed.length === 1 && /SenderPhone/.test(r2.failed[0].detail), 'the expanded form gives the same answer');
}

section('No package calls padLeft');
{
  /* Refused live on 2026-09-28: "The template function 'padLeft' is not defined or not valid" (CG_Submission_Endpoint). */
  const any = packageFiles().filter((f) => readFileSync(f, 'utf8').includes('padLeft('));
  ok(!any.length, 'no package calls padLeft', any.join(', '));
}

section('Reference data on a SharePoint tab');
{
  const T = tenant();
  const { estate, logs, settle } = await paste(T, 'nitdanigeria.sharepoint.com');
  const planned = JSON.parse(logs.find((l) => l.startsWith('[{"kind"')));
  ok(!T.sp.posts.length && !T.sp.merges.length, 'the plan writes nothing');
  ok(planned.filter((r) => r.status === 'WILL_ADD').some((r) => r.item.startsWith('CSP')), 'Compliance & Supervision is planned as a new unit');
  const out = await settle(estate.data.apply());
  ok(out.verified, 'every item matches after the write');
  const csp = T.sp.posts.find((p) => p.field_1 === 'CSP');
  ok(csp && csp.Title === 'Compliance & Supervision Department' && csp.field_4 === 'Acting' && !('field_2' in csp), 'CSP is added with the values the memo states and no invented mailbox');
  ok(!T.sp.posts.some((p) => ['CS', 'SDO', 'SMP'].includes(p.field_1)), 'units already in the list are not touched');
  ok(T.sp.merges.length === 1 && T.sp.merges[0].id === 1 && T.sp.merges[0].field_4 === 'SDO', 'only the decided row moves to SDO; a row already there and an undecided SMP row are left');
}

section('Command-line route (Termux): device-code sign-in, plan, apply, restore');
{
  const T = tenant();
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').split('=').join('').split('+').join('-').split('/').join('_');
  const jwt = `${b64u({ alg: 'none' })}.${b64u({ aud: 'https://service.flow.microsoft.com/', name: 'Registry', upn: 'registry@example.test' })}.CLISECRETSIG`;
  T.acceptAuth = `Bearer ${jwt}`;
  const flowFetch = makeFetch(T);
  let polls = 0, dropOnce = true;
  const signins = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.includes('/oauth2/v2.0/devicecode')) { signins.push(new URLSearchParams(body).get('client_id')); return send(200, { device_code: 'DC', user_code: 'CODE123', verification_uri: 'https://microsoft.com/devicelogin', interval: 1, expires_in: 60 }); }
    if (req.url.includes('/oauth2/v2.0/token')) { polls += 1; return polls < 2 ? send(400, { error: 'authorization_pending' }) : send(200, { access_token: jwt, refresh_token: 'R' }); }
    if (dropOnce && req.url.includes('/flows?') && !req.url.includes('$top')) { dropOnce = false; req.socket.destroy(); return; } // a dropped connection
    const r = await flowFetch(`https://api.flow.microsoft.com${req.url}`, { method: req.method, headers: { Authorization: req.headers.authorization }, body: body || undefined });
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(await r.text());
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = mkdtempSync(join(tmpdir(), 'estate-cli-'));
  const run = (...a) => new Promise((resolve) => {
    const p = spawn(process.execPath, ['docs/folio-Master-Flows-and-Endpoints/deployment/estate-apply.cli.mjs', ...a, '--out', out], { env: { ...process.env, DGO_ESTATE_FLOW_BASE: base, DGO_ESTATE_LOGIN_BASE: base, DGO_ESTATE_POLL_MS: '10', DGO_ESTATE_RETRY_MS: '10,10,10' } });
    let text = ''; p.stdout.on('data', (d) => { text += d; }); p.stderr.on('data', (d) => { text += d; });
    p.on('close', (code) => resolve({ code, text }));
  });
  const plan = await run('plan');
  ok(plan.code === 0 && plan.text.includes('CODE123') && plan.text.includes('signed in as Registry <registry@example.test>'), 'it shows the sign-in code and who signed in');
  ok(signins[0] === '1950a258-227b-4e31-a9cf-717495945fc2', 'it signs in through the same Microsoft app as the mailer setup');
  ok(plan.text.includes('WILL_UPDATE') && !T.calls.some((c) => c.startsWith('PATCH')), 'plan reads only');
  ok(plan.text.includes('connection dropped; retrying') || plan.text.includes('flow(s) visible'), 'a dropped connection does not stop it');
  const applied = await run('apply', '--only', 'DGO_USERDIRECTORY_SYNC');
  const files = readdirSync(out);
  const backup = files.find((f) => f.startsWith('estate-backup-'));
  ok(applied.code === 0 && T.writes.length === 1 && T.writes[0].id === 'f-sync', 'apply --only writes that one flow');
  ok(backup && files.some((f) => f.startsWith('estate-apply-report-')), 'the backup and the run report are written to --out');
  const before = JSON.parse(readFileSync(join(out, backup), 'utf8')).flows['f-sync'].properties.definition;
  const restored = await run('restore', join(out, backup));
  const live = T.flows.find((f) => f.id === 'f-sync').flow.properties.definition;
  ok(restored.code === 0 && restored.text.includes('RESTORED') && JSON.stringify(live) === JSON.stringify(before), 'restore puts the backed-up definition back and confirms it');
  const vals = await run('values');
  const vfile = join(out, 'dgo-values.txt');
  const vtext = existsSync(vfile) ? readFileSync(vfile, 'utf8') : '';
  ok(existsSync(vfile) && (statSync(vfile).mode & 0o777) === 0o600, 'values writes dgo-values.txt readable by the owner only');
  ok(/^PF_ENDPOINT_[A-Z_]+=https?:\/\/\S+$/m.test(vtext) && vtext.split('\n').filter((l) => l && !l.startsWith('#')).every((l) => /^(PF_ENDPOINT_|DGO_ENDPOINT_)[A-Z0-9_]+=\S+$/.test(l)), 'every line is <PREFIX><KEY>=<address> as npm run package reads it', vtext.slice(0, 200));
  ok(vals.text.includes('npm run package -- --values') && vals.text.includes('--surface portal'), 'it prints the package command to run next');
  const all = plan.text + applied.text + restored.text + vals.text;
  ok(!all.includes('CLISECRETSIG') && !all.includes(jwt.split('.')[1]) && !/sig=SIGNED-SECRET/.test(all), 'no token and no signed URL is printed');
  ok(!all.includes('ESTATE.') && /node estate-apply\.cli\.mjs apply/.test(plan.text), 'next steps are given as command-line commands, not browser calls');
  const bad = await run('launch');
  ok(bad.code === 2 && bad.text.includes('Usage:'), 'an unknown command prints the usage and changes nothing');
  server.close();
  rmSync(out, { recursive: true, force: true });
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
