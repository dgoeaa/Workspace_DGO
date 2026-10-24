#!/usr/bin/env node
/**
 * Build docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js — one file that applies every flow package and
 * every reference-data change this repository holds, from the operator's own browser session.
 *
 * WHY ONE FILE
 *   Seventeen per-flow snippets, a separate designer paste for the directory sync, a trigger set
 *   by hand, and list rows typed into SharePoint is a procedure with twenty places to go wrong.
 *   This is one paste on the Power Automate tab (every flow) and the same paste on a SharePoint
 *   tab (the reference data). Each plans first, writes only when told, and verifies what it wrote.
 *
 * WHAT GOES IN, AND FROM WHERE
 *   packages      docs/folio-Master-Flows-and-Endpoints/surfaces/governance: the directory sync and the flow-truth
 *                 persistence scope. The replacement packages for the endpoint flows and the key moves to the owner
 *                 map's flows were retired on 2026-10-06 (registers/flow-adoption.json): every key stays on its
 *                 adopted flow, and the identification packages (docs/folio-Master-Flows-and-Endpoints/packages/identification-*) change it.
 *   targets       config/endpoint-atlas.data.js (the endpoint register) — resolved LIVE, see
 *                 scripts/lib/estate-apply-runtime.mjs
 *   environment   the 2026-09-18 tenant inventory's environmentName
 *   order         runbook §0.4 and §5.2
 *   data          config/organizational-units.config.js and the rowUnit corrections in
 *                 docs/reference/approved/dsu-key-corrections.csv
 *
 *   node scripts/build-estate-apply.mjs           # write
 *   node scripts/build-estate-apply.mjs --check   # fail if stale
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EndpointAtlas } from '../config/endpoint-atlas.data.js';
import { OrganizationalUnits } from '../config/organizational-units.config.js';
import { CategoryMatrix } from '../config/category-matrix.config.js';
import { installPackage, validateWiring } from './lib/flow-install.mjs';
import { createEstate } from './lib/estate-apply-runtime.mjs';
import { deviceSignIn } from './lib/device-sign-in.mjs';
import { estateCliMain } from './lib/estate-cli-main.mjs';
import { SURFACES, SURFACE_IDS } from './lib/endpoint-surface.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = 'docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js';
const CLI_OUT = 'docs/folio-Master-Flows-and-Endpoints/deployment/estate-apply.cli.mjs';
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const GOVERNANCE = 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance';
const ACT = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';

const environment = J('docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json').coverage.environmentName;
if (!/^Default-[0-9a-f-]{36}$/i.test(environment)) throw new Error(`unexpected environment name ${environment}`);

const keys = EndpointAtlas.keys.map((k) => ({ key: k.key, workflowId: String(k.workflowId || '').toLowerCase(), method: k.method }));

/* The directory sync: its variables come from the generator that builds it, its trigger from the
   schedule decided on 26 Sep 2026. */
const { VARIABLES } = await import('./build-userdirectory-sync.mjs');
const syncInitial = { RunId: "@{workflow()?['run']?['name']}", RequestId: '@{guid()}', StartedAt: '@{utcNow()}' };
const syncDeclarations = {};
let prev = null;
for (const [name, type] of Object.entries(VARIABLES)) {
  const t = type.toLowerCase();
  const value = name in syncInitial ? syncInitial[name] : t === 'integer' ? 0 : t === 'array' ? [] : '';
  syncDeclarations[`Initialize_variable_${name}`] = {
    type: 'InitializeVariable', inputs: { variables: [{ name, type: t, value }] },
    ...(prev ? { runAfter: { [prev]: ['Succeeded'] } } : {}),
  };
  prev = `Initialize_variable_${name}`;
}

const truthContract = J(`${GOVERNANCE}/DGO_FLOW_TRUTH_PERSISTENCE.host-contract.json`);

const packages = [];
{
  const pkg = J(`${GOVERNANCE}/DGO_USERDIRECTORY_SYNC.Scope_Global.designer-paste.json`);
  packages.push({
    name: 'DGO_USERDIRECTORY_SYNC', keys: [], fingerprint: { topLevel: 'Scope_Global', contains: ['Get_existing_UserDirectory_items', 'Search_for_users_V2'] },
    whenMissing: 'create the flow once with a Scope named Scope_Global containing an action named Search_for_users_V2, or paste the package in the designer',
    mode: 'body', method: null, triggers: J(`${GOVERNANCE}/DGO_USERDIRECTORY_SYNC.trigger.json`), declarations: syncDeclarations,
    dependsOn: [], dependencyReason: null,
    pkg: { nodeId: pkg.nodeId, serializedValue: pkg.serializedValue, allConnectionData: pkg.allConnectionData },
  });
}
{
  const pkg = J(`${GOVERNANCE}/DGO_FLOW_TRUTH_PERSISTENCE.designer-paste.json`);
  packages.push({
    name: 'DGO_FLOW_TRUTH_PERSISTENCE', keys: [], fingerprint: { topLevel: pkg.nodeId },
    whenMissing: 'it is one scope inside a host flow; paste it into the host once in the designer (see its host contract), and later runs keep it current',
    mode: 'scope', method: null, triggers: null, declarations: null, hostActions: Object.keys(truthContract.actions || {}),
    dependsOn: [], dependencyReason: null,
    pkg: { nodeId: pkg.nodeId, serializedValue: pkg.serializedValue, allConnectionData: pkg.allConnectionData },
  });
}

/* Every package must install into an empty flow of its own shape, here, before it ships. */
for (const p of packages) {
  if (p.mode !== 'body') continue;
  const trig = p.triggers || (p.keys.length ? { manual: { type: 'Request', kind: 'Http', inputs: { schema: {} } } } : { Recurrence: { type: 'Recurrence', recurrence: { frequency: 'Day', interval: 1 } } });
  const r = installPackage({ definition: { triggers: trig, actions: {} }, connectionReferences: {}, pkg: p.pkg, declarations: p.declarations, mode: 'body', method: p.method, triggers: p.triggers });
  if (r.problems.length) throw new Error(`${p.name} does not install cleanly:\n  ${r.problems.join('\n  ')}`);
}

/* Reference data. Departments: every approved unit, so a unit missing from the list is added;
   rows already there are never changed. Categories: only the moves the owner decided. */
const units = OrganizationalUnits.map((u) => ({
  Title: u.title, field_1: u.key, field_2: u.email, field_3: u.headEmail, field_4: u.headshipType, field_6: u.headTitle,
}));
const parseCsv = (text) => {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rs] = rows.filter((r) => r.some((v) => v !== ''));
  return rs.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
};
const moves = parseCsv(readFileSync(join(ROOT, 'docs/reference/approved/dsu-key-corrections.csv'), 'utf8'))
  .filter((c) => c.Kind === 'rowUnit')
  .map((c) => { const [title, subcategory] = c.From.split('|'); return { title, subcategory, to: c.To }; });
for (const m of moves) {
  const row = CategoryMatrix.find((r) => r.category === m.title && r.subcategory === m.subcategory);
  if (!row || row.dsuKey !== m.to) throw new Error(`rowUnit ${m.title}|${m.subcategory} -> ${m.to} is not what config/category-matrix.config.js carries`);
}

/* No key moves: every contract key stays on its adopted flow (registers/flow-adoption.json, 2026-10-05). The moves this
   held (OTP_GENERATE to IP_OTP_Endpoint, SUBSIDIARY_ACTIONS and FETCH_ACTIVITIES to IP_Subsidiary_Actions_Endpoint,
   DYNAMIC_ACTIONS to its own flow) targeted flows that are retired or already serve the key. */
const migrations = [];
const ADOPTION = J('docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json');

/* Flow ids the repository already attributes to an endpoint key: the adopted flows and the newest live wiring read. Work that
   only concerns keys reads these directly instead of every flow in the environment; the runtime
   falls back to reading every flow when one of them no longer answers its key. */
const liveReads = readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence')).filter((f) => /live-endpoint-wiring\.json$/.test(f)).sort();
const knownFlowIds = [...new Set([
  ...ADOPTION.adopted.filter((a) => (a.contractKeys || []).length).map((a) => a.flowId),
  ...(liveReads.length ? J(`docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/${liveReads.pop()}`).rows.map((r) => r.liveFlowId) : []),
  ...migrations.flatMap((m) => m.moves.map((mv) => mv.flowId)),
].filter(Boolean).map((id) => String(id).toLowerCase()))].sort();

/* The keys each delivered package reads, with the prefix npm run package expects in a values file. */
const surfaces = SURFACE_IDS.map((id) => ({ id, prefix: SURFACES[id].envPrefixes[0], keys: SURFACES[id].endpoints.map((e) => e.key) }));

const core = {
  environment, keys, packages, migrations, surfaces, knownFlowIds,
  data: {
    departments: { site: ACT, listId: '8aab9c4e-001f-4e32-862c-8a50e750f04e', units },
    categories: { site: ACT, listId: 'f64c8b65-c921-46e9-8814-a8cef61f6016', moves },
  },
};
const digest = createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 12);
const DATA = { version: `1.0.0+${digest}`, ...core };

const text = `/*
 * ESTATE APPLY — every flow update and reference-data change in this repository, in one paste.
 * GENERATED by \`node scripts/build-estate-apply.mjs\` — do not edit. Version ${DATA.version}.
 *
 * NEEDS: no PowerShell, no Entra ID, no Azure, no admin rights. It uses your own signed-in
 * session: the flows it can change are the ones you own or co-own; the lists, the ones you can edit.
 *
 * ON THE POWER AUTOMATE TAB  (https://make.powerautomate.com, environment ${environment})
 *   1. Open My flows (do not reload afterwards). Devtools (F12) → Console. Paste this file.
 *      If it says it is waiting, click "My flows" in the left menu once. If it then prints the
 *      Network-tab steps, copy the authorization header of a ProcessSimple request and run
 *      ESTATE.useToken('<value>'), then await ESTATE.plan(). Never share that token.
 *      It PLANS ONLY: which flow each package goes to, what changes, what is held and why.
 *   2. await ESTATE.apply()          writes every WILL_UPDATE row, in runbook order. A backup of
 *                                    each flow is downloaded first; each write is read back and
 *                                    a flow whose structure did not land is restored at once.
 *      await ESTATE.apply({ only: ['DGO_USERDIRECTORY_SYNC'] })   a subset
 *      await ESTATE.rollback()      restores every flow this tab changed
 *      await ESTATE.values()        the values file for npm run package, read from the flow that answers each key
 *
 *   No key moves: every contract key stays on its adopted flow (registers/flow-adoption.json).
 *   A run report (JSON, no credentials) is downloaded at the end of every apply.
 *
 * ON A SHAREPOINT TAB  (https://nitdanigeria.sharepoint.com, any page)
 *   1. Paste the same file. It plans the reference data: approved units missing from the
 *      Departments list, and the owner's category moves.
 *   2. await ESTATE.data.apply()     adds and updates, then re-reads and verifies.
 *
 * It never deletes a flow, a list item or a column, never creates a flow, and never prints a
 * trigger URL. Guide: docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.md
 */
(() => {
  'use strict';
${validateWiring.toString()}
${installPackage.toString()}
${createEstate.toString()}
  const DATA = ${JSON.stringify(DATA)};
  /* Listen for the portal's own Flow-service calls (see connect() in the runtime). Installed
     once per tab; a second paste reuses it. */
  if (!window.__estateAuthV2) {
    const captured = [];
    const seen = {};
    const audienceOf = (auth) => {
      try {
        const part = String(auth).slice(7).split('.')[1] || '';
        const b64 = part.split('-').join('+').split('_').join('/');
        const body = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
        return String(body.aud || '');
      } catch (e) { return ''; }
    };
    const isFlowApi = (path) => String(path).toLowerCase().includes('/providers/microsoft.processsimple/');
    const note = (url, auth) => {
      try {
        const u = new URL(String(url), location.href);
        const s = seen[u.host] || (seen[u.host] = { host: u.host, requests: 0, bearer: 0, flowPath: false, audiences: [] });
        s.requests += 1;
        const flowPath = isFlowApi(u.pathname);
        if (flowPath) s.flowPath = true;
        if (!String(auth || '').toLowerCase().startsWith('bearer ')) return;
        s.bearer += 1;
        const aud = audienceOf(auth);
        if (aud && !s.audiences.includes(aud)) s.audiences.push(aud);
        if (captured.some((c) => c.authorization === String(auth) && c.origin === u.origin)) return;
        captured.unshift({ origin: u.origin, authorization: String(auth), aud, flowPath });
        captured.length = Math.min(captured.length, 20);
      } catch (e) { /* not a URL */ }
    };
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : input && input.url;
        const h = init && init.headers;
        let auth = h && (typeof h.get === 'function' ? h.get('Authorization') : (h.Authorization || h.authorization));
        if (!auth && input && input.headers && typeof input.headers.get === 'function') auth = input.headers.get('Authorization');
        note(url, auth);
      } catch (e) { /* never break the portal */ }
      return origFetch(input, init);
    };
    if (window.XMLHttpRequest) {
      const open = window.XMLHttpRequest.prototype.open, set = window.XMLHttpRequest.prototype.setRequestHeader;
      window.XMLHttpRequest.prototype.open = function (m, u) { this.__estateUrl = u; return open.apply(this, arguments); };
      window.XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (/^authorization$/i.test(k)) note(this.__estateUrl, v); return set.apply(this, arguments); };
    }
    window.__estateAuthV2 = { captured, seen, origFetch };
  }
  const io = {
    fetch: (u, i) => window.__estateAuthV2.origFetch(u, i),
    capturedAuth: () => window.__estateAuthV2.captured.slice(),
    authSeen: () => Object.values(window.__estateAuthV2.seen || {}).map((r) => ({ ...r, audiences: r.audiences.slice() })),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    authWaitMs: 20000,
    log: (...a) => console.log(...a),
    table: (t) => console.table(t),
    now: () => new Date().toISOString(),
    storages: () => { const s = []; try { s.push(window.sessionStorage); } catch (e) { /* blocked */ } try { s.push(window.localStorage); } catch (e) { /* blocked */ } return s; },
    observedOrigins: () => { const o = []; try { for (const e of performance.getEntriesByType('resource')) { const m = /^(https:\\/\\/[^/]+)\\/providers\\/Microsoft\\.ProcessSimple\\//i.exec(e.name); if (m && !o.includes(m[1])) o.push(m[1]); } } catch (e) { /* none */ } return o; },
    clipboard: (text) => navigator.clipboard.writeText(text),
    downloadText: (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); },
    download: (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); },
  };
  const estate = createEstate(DATA, io);
  window.ESTATE = estate;
  if (/\\.sharepoint\\.com$/i.test(location.hostname)) {
    estate.data.plan().then(() => console.log('%cPlanned. To write: await ESTATE.data.apply()', 'color:#268bd2;font-weight:bold'), (e) => console.log('%c' + e.message, 'color:#c00;font-weight:bold'));
  } else {
    estate.plan().then(() => console.log('%cPlanned. To write: await ESTATE.apply()   ·   undo this tab: await ESTATE.rollback()', 'color:#268bd2;font-weight:bold'), (e) => console.log('%c' + e.message, 'color:#c00;font-weight:bold'));
  }
})();
`;

/* The same runtime and data as a one-file command for Termux or any machine with Node 18+. It signs
   in with a device code (as the correspondence mailer's setup does) instead of borrowing a tab. */
const cliText = `#!/usr/bin/env node
/*
 * ESTATE APPLY — command-line route. GENERATED by \`node scripts/build-estate-apply.mjs\` — do not edit.
 * Version ${DATA.version}. Same runtime, packages and safety checks as ESTATE_APPLY.console.js.
 *
 * NEEDS: Node.js 18+ (Termux: pkg install nodejs). No admin rights, no app registration: you sign
 * in with a code on a Microsoft page, as the correspondence mailer's setup does.
 *
 *   node estate-apply.cli.mjs plan                      read only
 *   node estate-apply.cli.mjs apply                     back up, write, read back
 *   node estate-apply.cli.mjs apply --only DGO_USERDIRECTORY_SYNC
 *   node estate-apply.cli.mjs restore <estate-backup-….json>
 *   node estate-apply.cli.mjs values                    the values file for npm run package (0600)
 *
 * Files (backups, run reports, repoint values) go to ./estate-apply-output, or --out <dir>.
 * The SharePoint reference data is applied from a SharePoint tab: see docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
${validateWiring.toString()}
${installPackage.toString()}
${createEstate.toString()}
${deviceSignIn.toString()}
${estateCliMain.toString()}
const DATA = ${JSON.stringify(DATA)};
estateCliMain(DATA, { createEstate, deviceSignIn, fs, path, argv: process.argv, env: process.env })
  .then((code) => { process.exitCode = code; }, (e) => { console.error('\\n' + e.message); process.exitCode = 1; });
`;

const outputs = [[OUT, text], [CLI_OUT, cliText]];
if (CHECK) {
  let stale = false;
  for (const [file, body] of outputs) {
    const cur = existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : '';
    if (cur !== body) { console.error(`❌ ${file} is stale — run: node scripts/build-estate-apply.mjs`); stale = true; }
  }
  if (stale) process.exit(1);
  console.log(`✅ ${OUT} and ${CLI_OUT} are current — ${packages.length} packages, ${units.length} units, ${moves.length} category move(s)`);
} else {
  for (const [file, body] of outputs) writeFileSync(join(ROOT, file), body);
  console.log(`wrote ${OUT} (${Math.round(text.length / 1024)} KB) and ${CLI_OUT} (${Math.round(cliText.length / 1024)} KB) — ${packages.length} packages, ${units.length} units, ${moves.length} category move(s), version ${DATA.version}`);
}
