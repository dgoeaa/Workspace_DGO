#!/usr/bin/env node
/**
 * The flows and endpoints NITDA Folio requires, read from the code — and what the tenant evidence
 * says about each.
 *
 *   npm run flowreq              write docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json and FLOW_REQUIREMENTS.md
 *   npm run flowreq -- --check   fail if either is out of date
 *
 * TWO KINDS OF REQUIREMENT, KEPT APART
 *
 * Part A is read from the code: every endpoint a platform calls, found where it is declared and
 * where it is called, with the file and line. Nothing in Part A is typed in here.
 *
 * Part B is the flows no code calls — scheduled, mailbox-triggered, set-up and governance flows.
 * Code cannot reveal those, so each is listed here once, with the specification in this
 * repository that requires it. Every citation is re-read on each run: if the text it quotes is no
 * longer in that file, the build fails rather than keep a requirement nobody states.
 *
 * WHAT "AVAILABLE" MEANS HERE
 *
 * This repository cannot see the tenant. It holds dated evidence of it, and every status below
 * names the evidence it rests on:
 *   - the newest docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/*-live-endpoint-wiring.json: which flow
 *     answers each Workspace and Portal web address, read live;
 *   - docs/folio-Master-Flows-and-Endpoints/captures/: definitions captured from the tenant (file name = display name + flow GUID);
 *   - the newest docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-*.json: every flow the flow-owner account can
 *     see, with its state;
 *   - docs/folio-Master-Flows-and-Endpoints/contracts/deployed/: older exports.
 * The captures and the usage list see only flows the exporting account owns. "No evidence" means
 * no evidence in these files — not that the flow is absent from the tenant.
 *
 * Naming and identity follow IDENTIFICATION_SYSTEM.md: Flow Registry Key (ID-12), Contract Key
 * (ID-11), and the §17 rules for display names and Vault aliases.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const OUT_JSON = 'docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json';
const OUT_MD = 'docs/folio-Master-Flows-and-Endpoints/reference/FLOW_REQUIREMENTS.md';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const lines = (p) => read(p).split('\n');
const newest = (dir, rx) => readdirSync(join(ROOT, dir)).filter((f) => rx.test(f)).sort().pop();
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const fail = (msg) => { console.error(`flow-requirements: ${msg}`); process.exit(1); };

/** Every line of a file that matches, as file:line. */
function find(file, test, limit = Infinity) {
  const out = [];
  lines(file).forEach((l, i) => { if (out.length < limit && test(l)) out.push({ file, line: i + 1 }); });
  return out;
}
/** Files under a directory, recursively, with one of the extensions. */
function walk(dir, exts) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out.sort();
}

/* ── the standards this register is held to ─────────────────────────────────────────────── */
const cat = json('docs/reference/identification/identifier-catalogue.json');
const ID = Object.fromEntries(cat.identifiers.map((i) => [i.id, i]));
const FRK = new RegExp(ID['ID-12'].pattern);
const CK = new RegExp(ID['ID-11'].pattern);
const NAME = cat.namingConventions.flowDisplayName;
const ALIAS = cat.namingConventions.vaultAlias;
const PROCESSES = new Set(cat.processes.map((p) => p.code));
const PREFIX_OF = Object.fromEntries(NAME.prefixes.filter((x) => x.system).map((x) => [x.system, x.prefix]));
const shape = (name) => new RegExp(NAME.pattern).test(name) && name.length <= NAME.maxLength
  && !name.split('_').some((w) => NAME.forbiddenWords.includes(w));
/** §17 in full: one key → exactly <PREFIX>_<KEY>; several keys or none → <PREFIX>_<PROCESS>_<SUBJECT>. */
function followsRule(name, { platform = null, keys = [] } = {}) {
  if (!shape(name)) return false;
  if (keys.length === 1) return name === `${PREFIX_OF[platform]}_${keys[0]}`;
  const prefix = NAME.prefixes.map((x) => x.prefix).sort((a, b) => b.length - a.length).find((x) => name.startsWith(`${x}_`));
  const rest = name.slice(prefix.length + 1).split('_');
  return rest.length >= 2 && PROCESSES.has(rest[0]);
}
const registryKey = (guid) => (guid ? `DGO:${guid}` : null);
const aliasFor = (system, key) => `${system}.${key.toLowerCase().replace(/_/g, '-')}`;

/* ── tenant evidence ─────────────────────────────────────────────────────────────────────── */
const LIVE_FILE = `docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/${newest('docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence', /-live-endpoint-wiring\.json$/)}`;
const live = json(LIVE_FILE);
const liveByKey = Object.fromEntries(live.rows.map((r) => [r.key, r]));
const USAGE_FILE = `docs/folio-Master-Flows-and-Endpoints/audits/${newest('docs/folio-Master-Flows-and-Endpoints/audits', /^flow-usage-analysis-\d{4}-\d{2}-\d{2}\.json$/)}`;
const usage = json(USAGE_FILE);
const captures = readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures')).filter((f) => f.endsWith('.json')).map((f) => {
  const m = /^(.*)__(?:unread_)?([0-9a-f-]{32,36})\.json$/.exec(f);
  return m && { file: `docs/folio-Master-Flows-and-Endpoints/captures/${f}`, name: m[1].replace(/^_+|_+$/g, ''), guid: m[2].length === 36 ? m[2] : null };
}).filter(Boolean);
const deployed = readdirSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed')).map((f) => {
  const m = /^(.*)__([0-9a-f-]{36})__full_definition\.json$/.exec(f);
  return m && { file: `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/${f}`, name: m[1], guid: m[2] };
}).filter(Boolean);
const CAPTURE_DATE = '2026-10-01';   // flows/ was added from the tenant in 47d1fdf on this date
const usageDate = /(\d{4}-\d{2}-\d{2})/.exec(USAGE_FILE)[1];
const liveDate = live.capturedUtc ? String(live.capturedUtc).slice(0, 10) : /(\d{4}-\d{2}-\d{2})/.exec(LIVE_FILE)[1];

/** Everything the evidence says about one flow, by its names and/or a content fingerprint. */
function evidenceFor({ names = [], guid = null, fingerprint = null }) {
  const ns = new Set(names.map(norm));
  const hit = (n, g) => ns.has(norm(n)) || (guid && g === guid);
  const out = [];
  for (const c of captures) {
    let byContent = false;
    if (fingerprint && !hit(c.name, c.guid)) byContent = fingerprint.every((s) => read(c.file).includes(s));
    if (hit(c.name, c.guid) || byContent) out.push({ source: 'tenant capture', date: CAPTURE_DATE, name: c.name.replace(/_-_/g, ' - '), guid: c.guid, file: c.file, ...(byContent ? { matchedBy: 'content' } : {}) });
  }
  for (const f of usage.allFlows) if (hit(f.flow_name, f.flow_guid)) out.push({ source: 'flow-owner list', date: usageDate, name: f.flow_name, guid: f.flow_guid, state: f.state, file: USAGE_FILE });
  for (const d of deployed) if (hit(d.name, d.guid)) out.push({ source: 'deployed export', name: d.name, guid: d.guid, file: d.file });
  return out;
}

/* ── open readiness items that name a key or a flow ──────────────────────────────────────── */
const register = json('docs/deployment/PRODUCTION_READINESS_REGISTER.json');
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const openItems = register.items.filter((i) => !CLOSED.has(i.status));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A key with an underscore is distinctive as a word; a one-word key (STATUS, EMAIL) only in backticks. */
function itemsNaming(token, isKey) {
  const rx = isKey && !token.includes('_') ? new RegExp('`' + esc(token) + '`') : new RegExp(`(^|[^A-Za-z0-9_])${esc(token)}([^A-Za-z0-9_]|$)`);
  return openItems.filter((i) => rx.test(`${i.title}\n${i.description}\n${i.whyOpen}`)).map((i) => i.id);
}

/* ══ PART A — endpoints, read from the code ════════════════════════════════════════════════ */
const partA = [];

// Workspace: config/endpoints.config.js declares each address and each operation; the code calls them.
{
  const CFG = 'config/endpoints.config.js';
  const src = read(CFG);
  const urlKeys = [...src.slice(src.indexOf('export const EndpointUrls'), src.indexOf('export const DefaultEndpointSettings'))
    .matchAll(/^\s+([A-Z][A-Z0-9_]+):\s+_url\('/gm)].map((m) => m[1]);
  const contractBlock = src.slice(src.indexOf('export const EndpointContracts'));
  const contracts = [...contractBlock.matchAll(/^\s+([A-Z][A-Z0-9_]+):\s+Object\.freeze\(\{[^\n]*?url:EndpointUrls\.([A-Z0-9_]+)/gm)].map((m) => ({ key: m[1], address: m[2] }));
  const ops = new Map(contracts.map((c) => [c.key, c.address]));
  for (const k of urlKeys) if (!ops.has(k)) ops.set(k, k);    // an address with no JSON contract (SCAN_INTAKE)
  const codeFiles = [...walk('core', ['.js']), ...walk('modules', ['.js']), ...walk('shared', ['.js'])];
  for (const [key, address] of ops) {
    const declared = find(CFG, (l) => new RegExp(`^\\s+${key}:\\s`).test(l)).slice(0, 2);
    const rx = new RegExp(`['"\`]${key}['"\`]|\\.${key}\\b`);
    const calledBy = codeFiles.flatMap((f) => find(f, (l) => rx.test(l), 1)).slice(0, 3);
    partA.push({ platform: 'runtime', key, address, declared, calledBy });
  }
}
// Portal: document-portal/js resolves every call through endpointUrl('<KEY>').
{
  const keys = [...read('document-portal/config.example.js').matchAll(/^\s+([A-Z][A-Z0-9_]+)\s*:/gm)].map((m) => m[1]);
  const files = walk('document-portal/js', ['.js']);
  for (const key of keys) {
    const declared = find('document-portal/config.example.js', (l) => new RegExp(`^\\s+${key}\\s*:`).test(l));
    const calledBy = files.flatMap((f) => find(f, (l) => l.includes(`endpointUrl('${key}')`))).slice(0, 3);
    partA.push({ platform: 'portal', key, address: key, declared, calledBy });
  }
}
// Mailer: mailer/js/settings.js lists every endpoint; the modules call them by key.
const mailerCatalogue = json('mailer/flows/flows.catalogue.json').flows;
{
  const files = walk('mailer/js', ['.js']).filter((f) => !f.endsWith('settings.js') && !f.includes('.generated.'));
  for (const fl of mailerCatalogue) {
    const key = fl.endpointKey;
    const declared = find('mailer/js/settings.js', (l) => l.includes(`'${key}'`), 1);
    const calledBy = files.flatMap((f) => find(f, (l) => l.includes(`'${key}'`), 1)).slice(0, 3);
    partA.push({ platform: 'mailer', key, address: key, declared, calledBy, catalogueName: fl.name });
  }
}
// Administration Centre: two Microsoft services, from its settings.
{
  const S = 'tools/admin-centre/config/settings.json';
  const set = json(S);
  for (const [setting, what] of [['loginBase', 'The flow owner\'s Microsoft sign-in'], ['flowApiBase', 'Power Automate: flow state, run history, turn on or off']]) {
    partA.push({ platform: 'centre', key: setting, address: set[setting], declared: find(S, (l) => l.includes(`"${setting}"`)), calledBy: find('tools/admin-centre/server.py', (l) => l.includes(`'${setting}'`), 2), external: what });
  }
}

for (const e of partA) {
  if (!e.declared.length) fail(`${e.platform} ${e.key}: declaration not found`);
  if (e.external) { e.status = 'External service'; e.flow = null; continue; }
  if (!CK.test(e.key)) fail(`${e.key} is not a Contract Key (ID-11)`);
  e.vaultAlias = aliasFor(e.platform, e.key);
  if (!new RegExp(ALIAS.pattern).test(e.vaultAlias)) fail(`${e.vaultAlias} breaks the Vault alias rule`);
  const r = liveByKey[e.address];
  if (e.platform === 'mailer') {
    const ev = evidenceFor({ names: [e.catalogueName] });
    const cap = ev.find((x) => x.source === 'tenant capture');
    e.flow = cap ? { name: e.catalogueName, guid: cap.guid, source: `tenant capture ${CAPTURE_DATE}` } : null;
  } else if (r && r.liveFlowId) {
    e.flow = { name: r.liveFlowName, guid: r.liveFlowId, source: `live reading ${liveDate}` };
  } else e.flow = null;
  if (e.flow) {
    e.flow.registryKey = registryKey(e.flow.guid);
    if (e.flow.registryKey && !FRK.test(e.flow.registryKey)) fail(`${e.flow.registryKey} is not a Flow Registry Key`);
    e.flow.nameFollowsRule = null;   // set once every key's flow is known (below)
    e.flow.captured = captures.some((c) => c.guid === e.flow.guid);
  }
  e.status = !e.flow ? 'No flow in the evidence' : e.address !== e.key ? `Shares the ${e.address} address` : 'Served';
  e.openItems = itemsNaming(e.key, true);
}

// A flow's name is judged against every key it serves.
{
  const keysOf = new Map();
  for (const e of partA) if (e.flow?.guid && e.address === e.key) keysOf.set(e.flow.guid, [...(keysOf.get(e.flow.guid) || []), e.key]);
  for (const e of partA) if (e.flow) {
    const keys = e.flow.guid ? keysOf.get(e.flow.guid) || [e.address] : [e.key];
    e.flow.servesKeys = keys;
    e.flow.nameFollowsRule = followsRule(e.flow.name, { platform: e.platform, keys });
  }
}

/* ══ PART B — flows no code calls, each with the specification that requires it ═══════════ */
const SPEC = [
  { name: 'ECM_DOCS_INTAKE', kind: 'Bridge', what: 'Portal submissions into the Workspace, and status written back',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/DECISIONS.md', 'the triage write-back extends `ECM_DOCS_INTAKE`']] },
  { name: 'AUTO_SCHEDULED_SWEEP', kind: 'Scheduled', what: 'Hourly sweep: status, overdue and due-date mails, retries',
    requiredBy: [['config/notification-matrix.config.js', 'AUTO_SCHEDULED_SWEEP (8c19b45c) · Foreach_Ack_Overdue']] },
  { name: 'CG_Portal_Daily_Sweep', kind: 'Scheduled', what: 'The Portal\'s daily sweep',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/README.md', '| CG_Portal_Daily_Sweep |']],
    note: ['scripts/build-identification-conformance.mjs', 'Daily Sweep, created but not captured'] },
  { name: 'CG_Registry_Status_Notifier', kind: 'Event', what: 'Tells a citizen when their submission\'s status changes',
    requiredBy: [['docs/reference/identification/IDENTIFICATION_SYSTEM.md', '| B7 | The notifier'], ['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/README.md', 'CG_Registry_Status_Notifier']] },
  { name: 'Folio_Incoming_Correspondence_Scan_Processing_Flow', kind: 'File', what: 'Turns scans saved to /E-DOCUMENT STATION into records (replaced DGSO INCOMING AI PROCESSING, turned off 2026-10-16)',
    requiredBy: [['config/notification-matrix.config.js', "carrier: 'Folio_Incoming_Correspondence_Scan_Processing_Flow"]] },
  { name: 'Notification processor', kind: 'Scheduled', what: 'Sends queued notifications with retries',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/deployment/notification-instrument/notification-processor/processor-spec.json', '"schema": "nitda-notification-processor/v1"']] },
  { name: 'DGO_USERDIRECTORY_SYNC', kind: 'Scheduled', what: 'Keeps the staff directory current',
    fingerprint: ['Get_existing_UserDirectory_items', 'Search_for_users_V2'], requiredBy: [['scripts/build-estate-apply.mjs', "name: 'DGO_USERDIRECTORY_SYNC'"]] },
  { name: 'DGO_FLOW_TRUTH_PERSISTENCE', kind: 'Called by flows', what: 'Saves each flow run\'s record',
    fingerprint: ['Scope_Global_Flow_Truth_Persistence'], requiredBy: [['scripts/build-estate-apply.mjs', "name: 'DGO_FLOW_TRUTH_PERSISTENCE'"]] },
  { name: '01 - GOV - Provision HTTP Flow Registry', kind: 'Governance', what: 'Creates the flow registry lists',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json', '"flowDisplayName": "01 - GOV - Provision HTTP Flow Registry"']] },
  { name: '02 - GOV - Register HTTP Flow Truth', kind: 'Governance', what: 'Registers a flow and its contract',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '"flow": "02 - GOV - Register HTTP Flow Truth"']] },
  { name: '03 - GOV - Record HTTP Flow Execution', kind: 'Governance', what: 'Records each run',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '"flow": "03 - GOV - Record HTTP Flow Execution"']] },
  { name: '04 - GOV - Audit HTTP Flow Registry', aliases: ['04 - GOV - Audit HTTP Flow Registry Flow Update'], kind: 'Governance', what: 'Audits the registry for stale and failing flows',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '04 Audit HTTP Flow Registry']] },
  { name: '05 - GOV - Retire HTTP Flow', kind: 'Governance', what: 'Retires a flow and its relationships',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '"flow": "05 - GOV - Retire HTTP Flow"']] },
  { name: '06 - GOV - Registry Exception Notification', aliases: ['06 - GOV - Registry Exception'], kind: 'Governance', what: 'Mails open registry exceptions to their owner',
    requiredBy: [['config/notification-matrix.config.js', 'in 06 - GOV - Registry Exception']] },
  { name: '07 - GOV - Consumer HTTP Self-Registration Template', kind: 'Governance', what: 'Lets a consumer register itself',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '"flow": "07 - GOV - Consumer HTTP Self-Registration Template"']] },
  { name: '08 - GOV - Discover and Register HTTP Consumers', kind: 'Governance', what: 'Discovers consumers and registers them',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json', '08 Discover and Register HTTP Consumers']] },
  { name: 'DGO_ENDPOINT_INVENTORY', kind: 'Set-up', what: 'Asks the tenant which flow answers each endpoint',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/deployment/internal/ENDPOINT_INVENTORY_FLOW.md', '# DGO_ENDPOINT_INVENTORY']] },
  { name: 'ID_Phase1_List_Check', kind: 'Set-up', what: 'Checks lists before the identity columns go in',
    runs: ['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-03.json', 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-03-after-p1-2.json'],
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/README.md', 'Name it `ID_Phase1_List_Check`']] },
  { name: 'ID_Phase1_Add_Columns', kind: 'Set-up', what: 'Adds the identity columns',
    runs: ['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/evidence/p1-1-list-check-2026-10-03-after-p1-2.json'],
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/README.md', 'named `ID_Phase1_Add_Columns`']] },
  { name: 'ID_Phase1_Complete', kind: 'Set-up', what: 'Completes Phase 1: 8 new lists, every specified column, free-slot indexes and the configuration rows',
    requiredBy: [['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase1/README.md', 'create an instant flow `ID_Phase1_Complete`']] },
];

const partB = SPEC.map((s) => {
  const requiredBy = s.requiredBy.map(([file, text]) => {
    if (!existsSync(join(ROOT, file))) fail(`${s.name}: ${file} does not exist`);
    const at = find(file, (l) => l.includes(text), 1)[0];
    if (!at) fail(`${s.name}: "${text}" is no longer in ${file} — re-read the requirement before keeping it`);
    return at;
  });
  let note = null;
  if (s.note) {
    const at = find(s.note[0], (l) => l.includes(s.note[1]), 1)[0];
    if (!at) fail(`${s.name}: note "${s.note[1]}" is no longer in ${s.note[0]}`);
    note = { text: s.note[1], ...at };
  }
  const evidence = evidenceFor({ names: [s.name, ...(s.aliases || [])], fingerprint: s.fingerprint || null });
  for (const r of s.runs || []) {
    if (!existsSync(join(ROOT, r))) fail(`${s.name}: run record ${r} does not exist`);
    evidence.push({ source: 'run record', date: /(\d{4}-\d{2}-\d{2})/.exec(r)?.[1], name: r.split('/').pop(), file: r });
  }
  const guids = [...new Set(evidence.map((e) => e.guid).filter(Boolean))];
  const states = [...new Set(evidence.filter((e) => e.state).map((e) => `${e.name}: ${e.state}`))];
  return {
    name: s.name, kind: s.kind, what: s.what, requiredBy, note,
    evidence, registryKeys: guids.map(registryKey), states,
    status: evidence.some((e) => e.source === 'tenant capture') ? 'Captured from the tenant'
      : evidence.some((e) => e.source === 'flow-owner list') ? 'In the flow-owner list'
      : evidence.some((e) => e.source === 'run record') ? 'Run recorded'
      : evidence.length ? 'Deployed export only' : 'No tenant evidence',
    nameFollowsRule: followsRule(s.name),
    openItems: itemsNaming(s.name, false),
  };
});

/* ── platforms that need no flow of their own ───────────────────────────────────────────── */
const platformsCfg = read('scripts/platforms.config.mjs');
const platformIds = [...platformsCfg.matchAll(/^\s+id: '([a-z]+)',/gm)].map((m) => m[1]);
const withFlows = new Set(partA.map((e) => e.platform));
const noFlows = platformIds.filter((id) => !withFlows.has(id));

/* ── required notifications that no artifact carries ─────────────────────────────────────── */
const { RequiredNotifications } = await import(join(ROOT, 'config/notification-matrix.config.js'));
const unsent = RequiredNotifications.filter((r) => r.status === 'ABSENT').map((r) => ({ id: r.id, event: r.event, platform: r.platform }));

/* ── output ─────────────────────────────────────────────────────────────────────────────── */
const data = {
  schema: 'folio-flow-requirements/v1',
  generatedBy: 'scripts/build-flow-requirements.mjs',
  standards: 'docs/reference/identification/IDENTIFICATION_SYSTEM.md (ID-11, ID-12, ID-24, §17)',
  evidence: { liveReading: LIVE_FILE, liveDate, captures: 'docs/folio-Master-Flows-and-Endpoints/captures/', captureDate: CAPTURE_DATE, flowOwnerList: USAGE_FILE, deployedExports: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/' },
  totals: {
    endpoints: partA.length,
    endpointsServed: partA.filter((e) => e.status === 'Served').length,
    endpointsSharingAnAddress: partA.filter((e) => /^Shares the /.test(e.status)).length,
    endpointsWithNoFlow: partA.filter((e) => e.status === 'No flow in the evidence').length,
    externalServices: partA.filter((e) => e.external).length,
    flowsNotCalledByCode: partB.length,
    flowsWithTenantEvidence: partB.filter((f) => f.status !== 'No tenant evidence').length,
    notificationsWithNoCarrier: unsent.length,
  },
  endpoints: partA, flows: partB, platformsWithoutFlows: noFlows, notificationsWithNoCarrier: unsent,
};
const jsonOut = JSON.stringify(data, null, 2) + '\n';
if (/[?&]sig=/.test(jsonOut)) fail('a signed address reached the output');

const at = (a) => a.map((x) => `\`${x.file}:${x.line}\``).join('<br>');
const PLAT = { runtime: 'Folio Workspace', portal: 'NITDA Document Portal', mailer: 'DGO Correspondence Mailer', centre: 'Folio Central Administration Centre' };
const md = [];
md.push('# Flows and endpoints NITDA Folio requires', '',
  '> **Generated by `scripts/build-flow-requirements.mjs` — do not edit by hand.** `npm run flowreq -- --check` fails when it drifts.', '',
  '**Part A is read from the code**: every endpoint a platform calls, with the line that declares it and the lines that call it.',
  '**Part B is the flows no code calls** (scheduled, mailbox, set-up, governance). Code cannot reveal them, so each one cites the specification in this repository that requires it, and the build fails if that text is removed.', '',
  '**What "served" and "evidence" mean.** This repository cannot see the tenant; it holds dated evidence of it, and every status names its source:',
  `the live reading of ${liveDate} (\`${LIVE_FILE}\`), the tenant captures of ${CAPTURE_DATE} (\`docs/folio-Master-Flows-and-Endpoints/captures/\`), the flow-owner list of ${usageDate} (\`${USAGE_FILE}\`) and the older deployed exports.`,
  'The captures and the list see only flows the exporting account owns, so **"no tenant evidence" means none in these files, not that the flow is absent**. "Served" means a flow answers the address; it does not mean every operation behind it works. "Shares the X address" means the operation has no address of its own and goes to that flow, which may or may not implement it. The open readiness items say where something does not work; they are matched by name (a one-word key only in backticks), so an item that describes an endpoint only in words is not listed.', '',
  'Identity and naming follow `IDENTIFICATION_SYSTEM.md`: the Flow Registry Key `DGO:<flow GUID>` (ID-12), the Contract Key (ID-11), and the §17 rules. A flow name marked *legacy* is kept: existing names are not renamed (`PLATFORM_NAMING.md`).', '',
  '## Totals', '',
  '| | Count |', '|---|---:|',
  `| Endpoints the code calls | ${data.totals.endpoints} |`,
  `| … served by a flow in the evidence | ${data.totals.endpointsServed} |`,
  `| … with no address of their own, sharing a served one | ${data.totals.endpointsSharingAnAddress} |`,
  `| … with no flow in the evidence | ${data.totals.endpointsWithNoFlow} |`,
  `| … external Microsoft services | ${data.totals.externalServices} |`,
  `| Flows no code calls, required by a specification | ${data.totals.flowsNotCalledByCode} |`,
  `| … with tenant evidence | ${data.totals.flowsWithTenantEvidence} |`,
  `| Required notifications no artifact carries | ${data.totals.notificationsWithNoCarrier} |`, '');
md.push('## Part A — endpoints the code calls', '');
for (const p of ['runtime', 'portal', 'mailer', 'centre']) {
  const rows = partA.filter((e) => e.platform === p);
  md.push(`### ${PLAT[p]} (\`${p}\`) — ${rows.length}`, '');
  if (p === 'centre') {
    md.push('| Setting | Service | What for | Declared | Used |', '|---|---|---|---|---|');
    for (const e of rows) md.push(`| \`${e.key}\` | \`${e.address}\` | ${e.external} | ${at(e.declared)} | ${at(e.calledBy)} |`);
    md.push('');
    continue;
  }
  md.push('| Key | Address used | Declared | Called by | Status | Served by | Flow Registry Key | Name | Vault alias | Open items |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const e of rows) {
    const f = e.flow;
    md.push(`| \`${e.key}\` | ${e.address === e.key ? '—' : `\`${e.address}\``} | ${at(e.declared)} | ${e.calledBy.length ? at(e.calledBy) : '*no call site found*'} | ${e.status} | ${f ? `${f.name} (${f.source})` : '—'} | ${f?.registryKey ? `\`${f.registryKey}\`` : '—'} | ${f ? (f.nameFollowsRule ? 'follows §17' : 'legacy') : '—'} | \`${e.vaultAlias}\` | ${e.openItems.join(', ') || '—'} |`);
  }
  md.push('');
}
md.push('## Part B — flows no code calls', '');
md.push('| Flow | Kind | What it does | Required by | Status | Evidence | Flow Registry Key | Name | Open items |', '|---|---|---|---|---|---|---|---|---|');
for (const f of partB) {
  const ev = f.evidence.map((e) => `${e.source}${e.date ? ` ${e.date}` : ''}: ${e.name}${e.state ? ` (${e.state})` : ''}${e.matchedBy ? ' — matched by content' : ''}`);
  const uniq = [...new Set(ev)];
  md.push(`| ${f.name} | ${f.kind} | ${f.what} | ${at(f.requiredBy)} | ${f.status} | ${uniq.join('<br>') || '—'}${f.note ? `<br>*Note:* "${f.note.text}" (\`${f.note.file}:${f.note.line}\`)` : ''} | ${f.registryKeys.map((k) => `\`${k}\``).join('<br>') || '—'} | ${f.nameFollowsRule ? 'follows §17' : 'legacy'} | ${f.openItems.join(', ') || '—'} |`);
}
md.push('', '## Platforms that need no flow of their own', '',
  `${noFlows.map((p) => `\`${p}\``).join(', ')}: no endpoint is declared or called in their code. The Estate Console and the Flow Workbench send to the addresses an operator gives them, and Folio Vault holds addresses rather than calling flows.`, '',
  '## Required notifications that no artifact carries', '',
  'From `config/notification-matrix.config.js`, rows whose status is `ABSENT`: no flow sends them yet.', '',
  '| Row | Platform | Event |', '|---|---|---|', ...unsent.map((u) => `| ${u.id} | ${u.platform} | ${u.event} |`), '');
const mdOut = md.join('\n');

if (CHECK) {
  const same = (p, s) => existsSync(join(ROOT, p)) && read(p) === s;
  if (!same(OUT_JSON, jsonOut) || !same(OUT_MD, mdOut)) fail(`${OUT_MD} is out of date — run: npm run flowreq`);
  console.log(`flow requirements: current — ${data.totals.endpoints} endpoints (${data.totals.endpointsServed} served), ${partB.length} flows not called by code`);
} else {
  writeFileSync(join(ROOT, OUT_JSON), jsonOut);
  writeFileSync(join(ROOT, OUT_MD), mdOut);
  console.log(`wrote ${OUT_MD} — ${data.totals.endpoints} endpoints (${data.totals.endpointsServed} served), ${partB.length} flows not called by code, ${data.totals.flowsWithTenantEvidence} with tenant evidence`);
}
