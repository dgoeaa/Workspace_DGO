#!/usr/bin/env node
/**
 * npm run flows:update, against a simulated tenant.
 *
 * It proves what would do damage if it were wrong:
 *   · check writes nothing, and a flow is current only when its scope hashes to the package's;
 *   · apply backs up before any write, reads every write back, restores a flow that did not store
 *     what was sent, stops at the first failure, and never writes over a flow saved since the check;
 *   · after an apply, check reads every written package as current, although the service adds
 *     inputs.authentication to each connector step it stores;
 *   · a scope the flow does not have, a variable the flow does not declare, and a package that
 *     needs something done first are not written;
 *   · restore puts a backup back;
 *   · each package is reported in the paste ledger's own terms (the fingerprint of scripts/lib/package-fingerprint.mjs),
 *     with any Set variable step a designer paste left empty (ITEM-78), and record files a report as evidence and in
 *     the ledger;
 *   · the command itself, run as an operator runs it: device-code sign-in once, the saved sign-in
 *     after that, private backups, and the exit codes.
 * And, against the tenant captures in the repository, that no package fails to install into the
 * flow it was built for, other than where its scope is added rather than replaced.
 */
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { installPackage } from '../scripts/lib/flow-install.mjs';
import { loadPackages, createFlowsUpdate, planFlow, sha256, ledgerUpdate } from '../scripts/lib/flow-bulk-update.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { openZip } from '../scripts/lib/zip-reader.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const section = (t) => console.log(`\n${t}\n`);
const clone = (v) => JSON.parse(JSON.stringify(v));
const ROOT = process.cwd();
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const OLD_MAIL = 'shared-office365-1fb94487-c973-4c56-a1f4-1ac16768a7a7';

const PACKAGES = loadPackages(ROOT);
const byId = (part) => PACKAGES.find((p) => p.id.includes(part));
/* LIB stands for a scope the flow does not have yet (the legacy library intake's packages, which played it, were removed
   with identification release 31); REFS was the second package that needs a Flow Configuration key first. */
const AI = byId('AI_DOC_ANALYSIS'), LIB = byId('GET_DOCS');
const SINGLE = byId('SINGLE_ASSIGNMENT'), BULK = byId('BULK_ASSIGNMENT'), OTP = byId('OTP_VERIFY');
const SINGLE_FP = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/identification-phase4-status.json', 'utf8')).packages.find((x) => x.file === `${SINGLE.id}.paste.json`).fingerprint;

/* ───────────────────────── the simulated tenant ───────────────────────── */

/* Each flow as the tenant would hold it before this run: its variables declared at the top, each
   package's scope in an earlier form (a description the package does not carry), its Office 365
   references on another connection, and no copy of the scopes that are added rather than replaced. */
function tenant() {
  const flows = new Map();
  const groups = new Map();
  for (const p of PACKAGES) groups.set(p.flowId, [...(groups.get(p.flowId) || []), p]);
  for (const [id, pkgs] of groups) {
    const vars = new Set();
    for (const p of pkgs) {
      for (const m of JSON.stringify(p.pkg.serializedValue).matchAll(/variables\(\s*'([^']+)'\s*\)/g)) vars.add(m[1]);
      JSON.stringify(p.pkg.serializedValue, (k, v) => { if (v && /Variable$/.test(v.type || '') && v.inputs?.name) vars.add(v.inputs.name); return v; });
    }
    const actions = {};
    let prev = null;
    for (const v of vars) { actions[`Initialize_${v}`] = { type: 'InitializeVariable', inputs: { variables: [{ name: v, type: 'string', value: '' }] }, ...(prev ? { runAfter: { [prev]: ['Succeeded'] } } : {}) }; prev = `Initialize_${v}`; }
    let def = { triggers: { manual: { type: 'Request', kind: 'Http', inputs: { schema: {} } } }, actions };
    let refs = {};
    for (const p of pkgs) {
      if (p === LIB) continue;
      def.actions[p.scope] = { type: 'Scope', actions: {}, ...(prev ? { runAfter: { [prev]: ['Succeeded'] } } : {}) };
      const r = installPackage({ definition: def, connectionReferences: refs, pkg: p.pkg, mode: 'scope' });
      def = r.definition; refs = r.connectionReferences;
      def.actions[p.scope].description = 'an earlier build';
      prev = p.scope;
    }
    for (const r of Object.values(refs)) if (/office365/.test(r.id || '')) r.connectionName = OLD_MAIL;
    flows.set(id, { name: id, properties: { displayName: pkgs[0].flow, state: 'Started', lastModifiedTime: '2026-10-06T08:00:00Z', definition: def, connectionReferences: refs } });
  }
  return flows;
}

/* The Flow API over a tenant. `faults` changes what the service does: refuse a write, store
   something other than what was sent, drop the connection after storing, or have someone save a
   flow in the designer between the check and the write. */
function service(flows, faults = {}) {
  const calls = [];
  let clock = 0;
  const store = (id, props) => {
    const f = flows.get(id);
    const definition = clone(props.definition);
    /* What the real service does on every save: inputs.authentication on each connector step. */
    JSON.stringify(definition, (k, v) => { if (v && v.type === 'OpenApiConnection' && v.inputs) v.inputs.authentication = "@parameters('$authentication')"; return v; });
    f.properties = { ...f.properties, definition, connectionReferences: clone(props.connectionReferences), lastModifiedTime: `2026-10-06T09:${String(++clock).padStart(2, '0')}:00Z` };
  };
  const api = async (method, path, body) => {
    calls.push(`${method} ${path}`);
    const id = (path.match(/^\/flows\/([0-9a-f-]+)$/) || [])[1];
    if (!id || !flows.has(id)) return { ok: false, status: 404, body: { error: { code: 'FlowNotFound', message: 'not found' } } };
    if (method === 'GET') {
      if (faults.saveBetween === id && calls.filter((c) => c === `GET ${path}`).length === 2) flows.get(id).properties.lastModifiedTime = '2026-10-06T10:00:00Z';
      return { ok: true, status: 200, body: clone(flows.get(id)) };
    }
    if (method === 'PATCH') {
      const writes = calls.filter((c) => c.startsWith('PATCH ')).length - 1; // this write's place, from 0
      if (faults.refuseWrite === writes) return { ok: false, status: 400, body: { error: { code: 'InvalidTemplate', message: 'The template validation failed' } } };
      const props = clone(body.properties);
      if (faults.dropStep === writes) { const s = Object.values(props.definition.actions).find((a) => a.type === 'Scope' && a.actions && Object.keys(a.actions).length); delete s.actions[Object.keys(s.actions)[0]]; }
      store(id, props);
      if (faults.dropConnection === writes) return { ok: false, status: 0, network: true, body: { error: { message: 'socket hang up' } } };
      return { ok: true, status: 200, body: clone(flows.get(id)) };
    }
    return { ok: false, status: 405, body: null };
  };
  return { api, calls };
}

function runtime(flows, faults, { confirm = true } = {}) {
  const svc = service(flows, faults);
  const saved = [];
  const io = {
    api: svc.api, log: () => {}, table: () => {}, now: () => '2026-10-06T12:00:00.000Z',
    save: (name, value, o = {}) => { saved.push({ name, value: clone(value), private: Boolean(o.private) }); return `/out/${name}`; },
    confirm: async () => confirm,
  };
  return { run: createFlowsUpdate({ packages: PACKAGES, environment: ENV, commit: 'abc' }, io), svc, saved };
}
const rowsOf = (report) => report.flows.flatMap((f) => f.packages.map((p) => ({ ...p, flowId: f.flowId })));
const statusOf = (report, pkg) => rowsOf(report).find((r) => r.id === pkg.id)?.status;

/* ───────────────────────── the packages ───────────────────────── */

section('The packages it applies');
ok(PACKAGES.length >= 23, `${PACKAGES.length} packages read from the identification status registers`);
ok(new Set(PACKAGES.map((p) => p.id)).size === PACKAGES.length, 'every package has its own id');
ok(PACKAGES.every((p) => /^[0-9a-f-]{36}$/.test(p.flowId)), 'every package names its flow by the flow id (the 36-character name the Flow service addresses)');
ok(AI.requires && PACKAGES.filter((p) => p.requires).length === 1, 'the package that needs a Flow Configuration key first says so (requires)');
ok(PACKAGES.some((p) => p.flow === 'Folio_Failure_Watch' && p.flowId === 'c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6'), 'the failure watch, created 2026-10-18 by scripts/write-failure-watch-flow.mjs, is kept current by flows:update');

/* ───────────────────────── check ───────────────────────── */

section('check: reads, compares, writes nothing');
{
  const flows = tenant();
  const { run, svc } = runtime(flows);
  const { report, current } = await run.check();
  ok(!svc.calls.some((c) => !c.startsWith('GET ')), 'only reads');
  ok(!current, 'not current while any package differs');
  ok(statusOf(report, SINGLE) === 'WILL_UPDATE', 'a scope in an earlier form is WILL_UPDATE');
  const s = rowsOf(report).find((r) => r.id === SINGLE.id);
  ok(/differs at description \(only in the flow\)/.test(s.detail), 'the reason names where it differs, and no value', s.detail);
  ok(s.rebinds.some((b) => b.from === OLD_MAIL && b.to === 'c0b9e7a5b0854c39a435fd8ce92f48ad'), 'an Office 365 reference on another connection is rebound to the registry mailbox (ITEM-77)');
  ok(statusOf(report, LIB) === 'BLOCKED' && /added, not replaced/.test(rowsOf(report).find((r) => r.id === LIB.id).detail), 'a scope the flow does not have yet is BLOCKED: placement is never guessed');
  ok(statusOf(report, AI) === 'HELD', 'a package that needs something done first is HELD');
  ok(/OPENROUTER_API_KEY/.test(rowsOf(report).find((r) => r.id === AI.id).detail), 'and says what, and how to name it');
  const install = installPackage({ definition: { actions: { [SINGLE.scope]: {} } }, connectionReferences: {}, pkg: SINGLE.pkg, mode: 'scope' }).definition.actions[SINGLE.scope];
  const { runAfter, ...body } = install;
  ok(s.packageHash === sha256(body), 'the package hash can be recomputed from the package file alone');
  ok(report.schema === 'folio-flows-update-report/v1' && report.commit === 'abc' && report.environment === ENV, 'the report names the environment and the commit');
  ok(!JSON.stringify(report).includes('"definition"'), 'the report holds no flow definition');
  const status = Object.fromEntries([3, 4].flatMap((n) => JSON.parse(readFileSync(`docs/folio-Master-Flows-and-Endpoints/registers/identification-phase${n}-status.json`, 'utf8')).packages.map((x) => [x.file, x.fingerprint])));
  ok(rowsOf(report).every((r) => r.fingerprint === status[r.file]), 'each package carries the fingerprint its status register gives (the paste ledger\'s terms)');
  ok(s.liveFingerprint === s.fingerprint && s.liveHash !== s.packageHash, 'and the fingerprint of what the flow runs: a description or a connection, which the fingerprint sets aside, still shows in the hash');
  ok(rowsOf(report).find((r) => r.id === LIB.id).liveFingerprint === null, 'a scope the flow does not have has no live fingerprint');
}

section('check: a Set variable step a designer paste left empty (ITEM-78)');
{
  const flows = tenant();
  const f = flows.get(SINGLE.flowId);
  const scope = f.properties.definition.actions[SINGLE.scope];
  delete scope.description;
  const find = (acts) => { for (const [n, a] of Object.entries(acts || {})) { if (a.type === 'SetVariable') return [n, a]; const x = find(a.actions) || find(a.else?.actions); if (x) return x; } return null; };
  const [name, step] = find(scope.actions);
  delete step.inputs.value;
  const { run } = runtime(flows);
  const { report } = await run.check({ only: [SINGLE.id] });
  const r = rowsOf(report)[0];
  ok(r.status === 'WILL_UPDATE' && r.emptySetVariables.includes(name), `the empty step is named in the report (${name})`);
  ok(/ITEM-78/.test(r.detail), 'and in the line under the package', r.detail);
  const { run: fix } = runtime(flows);
  await fix.apply({ only: [SINGLE.id] });
  const { run: again } = runtime(flows);
  const after = rowsOf((await again.check({ only: [SINGLE.id] })).report)[0];
  ok(after.status === 'UP_TO_DATE' && !after.emptySetVariables.length && after.liveFingerprint === after.fingerprint, 'apply writes the value back; the flow then runs its package');
}

section('The paste ledger from a report');
{
  const rep = (rows) => ({ kind: 'check', finishedUtc: '2026-10-07T09:00:00.000Z', flows: [{ flow: 'F', packages: rows }] });
  const row = (file, fingerprint, liveFingerprint, emptySetVariables = []) => ({ file, fingerprint, liveFingerprint, emptySetVariables });
  const ledger = { schema: 'dgo-paste-ledger/v1', entries: [{ file: 'A.paste.json', fingerprint: 'old', on: '2026-10-05', evidence: 'owner report' }, { file: 'B.paste.json', fingerprint: null, on: '2026-10-05', evidence: 'export' }] };
  const { ledger: out, changed } = ledgerUpdate(ledger, rep([row('A.paste.json', 'pkgA', 'pkgA'), row('B.paste.json', 'pkgB', 'other'), row('C.paste.json', 'pkgC', 'otherC', ['Set_x']), row('D.paste.json', 'pkgD', null)]), 'evidence/2026-10-07-flows-check.json');
  const e = (f) => out.entries.find((x) => x.file === f);
  ok(e('A.paste.json').fingerprint === 'pkgA' && e('A.paste.json').on === '2026-10-07' && /runs this package/.test(e('A.paste.json').evidence), 'a flow that runs its package records the package\'s fingerprint, dated, with the evidence named');
  ok(e('B.paste.json').fingerprint === null, 'a flow never pasted that runs something else stays null');
  ok(e('C.paste.json').fingerprint === null && e('C.paste.json').emptySetVariables[0] === 'Set_x', 'a new entry for a flow running something else is null, with its empty Set variable steps');
  ok(!e('D.paste.json') && changed.length === 3, 'nothing is recorded for a scope that was not read');
  ok(ledger.entries[0].fingerprint === 'old', 'the ledger passed in is not changed');
  const { ledger: out2 } = ledgerUpdate(out, rep([row('A.paste.json', 'pkgA2', 'live')]), 'evidence/x.json');
  ok(out2.entries.find((x) => x.file === 'A.paste.json').fingerprint === 'live', 'a flow pasted before that now runs something else records what it runs');
}

/* ───────────────────────── apply ───────────────────────── */

section('apply: back up, write, read back, then check is clean');
{
  const flows = tenant();
  const before = clone([...flows.values()]);
  const { run, svc, saved } = runtime(flows);
  const { report, failed, backup } = await run.apply();
  const applied = rowsOf(report).filter((r) => r.status === 'APPLIED');
  const writes = svc.calls.filter((c) => c.startsWith('PATCH '));
  ok(!failed && applied.length === PACKAGES.length - 2, `${applied.length} packages written and read back; the held one and the added scope are not`);
  ok(writes.length === new Set(applied.map((r) => r.flowId)).size, 'one write per flow, however many of its packages change');
  const firstWrite = svc.calls.findIndex((c) => c.startsWith('PATCH '));
  ok(saved[0]?.name.startsWith('flows-backup-') && saved[0].private && firstWrite > 0, 'the backup is saved, privately, before the first write');
  ok(Object.keys(saved[0].value.flows).length === writes.length, 'the backup holds every flow written');
  const bk = saved[0].value.flows[SINGLE.flowId].properties.definition;
  ok(JSON.stringify(bk) === JSON.stringify(before.find((f) => f.name === SINGLE.flowId).properties.definition), 'and holds the flow as it was');
  ok(backup === `/out/${saved[0].name}`, 'apply returns where the backup is');
  const stored = flows.get(SINGLE.flowId).properties;
  ok(stored.connectionReferences['shared_office365-1'].connectionName === 'c0b9e7a5b0854c39a435fd8ce92f48ad', 'the Office 365 reference now names the registry mailbox connection');
  ok(JSON.stringify(stored.definition.triggers) === JSON.stringify(before.find((f) => f.name === SINGLE.flowId).properties.definition.triggers), 'the trigger is untouched, so its URL does not move');
  ok(JSON.stringify(stored.definition).includes('authentication'), 'the service added inputs.authentication on save (simulated)');

  const { run: again } = runtime(flows);
  const second = await again.check();
  ok(rowsOf(second.report).filter((r) => r.status === 'UP_TO_DATE').length === applied.length, 'check then reads every written package as UP_TO_DATE');
  ok(rowsOf(second.report).every((r) => r.status === 'UP_TO_DATE' || ['HELD', 'BLOCKED'].includes(r.status)), 'and nothing else changed state');

  const { run: named, svc: s2 } = runtime(flows);
  const r3 = await named.apply({ only: [AI.id] });
  ok(statusOf(r3.report, AI) === 'APPLIED' && s2.calls.filter((c) => c.startsWith('PATCH ')).length === 1, 'a held package is written when it is named with --only, and nothing else is');

  const { run: partial } = runtime(tenant());
  const r5 = await partial.check({ only: ['AI_DOC'] });
  ok(statusOf(r5.report, AI) === 'HELD', 'part of a name selects a package, but does not release one that needs something first');

  const { run: noop, svc: s3 } = runtime(flows);
  const r4 = await noop.apply({ only: [SINGLE.id] });
  ok(!s3.calls.some((c) => c.startsWith('PATCH ')) && statusOf(r4.report, SINGLE) === 'UP_TO_DATE', 'a current flow is not written again');
}

section('apply: declined, nothing written');
{
  const flows = tenant();
  const { run, svc, saved } = runtime(flows, {}, { confirm: false });
  const r = await run.apply();
  ok(r.declined && !svc.calls.some((c) => c.startsWith('PATCH ')) && !saved.length, 'answering no writes nothing and saves no backup');
}

section('apply: stops at the first failure');
{
  const flows = tenant();
  const { run } = runtime(flows, { refuseWrite: 1 });
  const { report, failed } = await run.apply();
  const rows = rowsOf(report);
  const order = [...new Set(rows.filter((r) => ['APPLIED', 'FAILED', 'NOT_RUN'].includes(r.status)).map((r) => r.flowId))];
  ok(failed, 'the run reports failure');
  ok(rows.filter((r) => r.flowId === order[0]).every((r) => r.status === 'APPLIED'), 'the flow written before the failure stays written');
  const f = rows.find((r) => r.status === 'FAILED');
  ok(f && /refused the write \(400\): InvalidTemplate/.test(f.detail), 'the refused flow is FAILED with the service\'s reason', f?.detail);
  ok(rows.filter((r) => r.status === 'NOT_RUN').length > 0 && !rows.some((r) => r.status === 'WILL_UPDATE'), 'every later flow is NOT_RUN');
}

section('apply: a write that did not store what was sent is restored');
{
  const flows = tenant();
  const id = [...flows.keys()][0];
  const before = clone(flows.get(id).properties.definition);
  const { run } = runtime(flows, { dropStep: 0 });
  const { report, failed } = await run.apply();
  const f = rowsOf(report).find((r) => r.status === 'FAILED');
  ok(failed && f && /not the steps sent/.test(f.detail) && /restored from the backup and confirmed/.test(f.detail), 'FAILED, restored, and the restore confirmed', f?.detail);
  const now = flows.get(id).properties.definition;
  ok(JSON.stringify(Object.keys(now.actions)) === JSON.stringify(Object.keys(before.actions)) && JSON.stringify(now).includes('an earlier build'), 'the flow holds its earlier scope again');
}

section('apply: a dropped connection after the write is settled by reading back');
{
  const flows = tenant();
  const { run } = runtime(flows, { dropConnection: 0 });
  const { failed, report } = await run.apply();
  ok(!failed && rowsOf(report).filter((r) => r.status === 'APPLIED').length === PACKAGES.length - 2, 'the write landed, so it is APPLIED');
}

section('apply: a flow saved since the check is not written over');
{
  const flows = tenant();
  const id = PACKAGES[0].flowId;
  const { run, svc } = runtime(flows, { saveBetween: id });
  const { report, failed } = await run.apply();
  ok(failed && rowsOf(report).filter((r) => r.flowId === id).every((r) => r.status === 'CHANGED'), 'CHANGED, and the run stops');
  ok(!svc.calls.includes(`PATCH /flows/${id}`), 'nothing was written to it');
}

section('check: what it refuses');
{
  const flows = tenant();
  const f = flows.get(OTP.flowId);
  const decl = Object.keys(f.properties.definition.actions).find((n) => n.startsWith('Initialize_'));
  delete f.properties.definition.actions[decl];
  for (const a of Object.values(f.properties.definition.actions)) if (a.runAfter?.[decl]) a.runAfter = {};
  const r = planFlow(f, [OTP]);
  ok(r.rows[0].status === 'BLOCKED' && /does not declare/.test(r.rows[0].detail), 'a package using a variable the flow does not declare', r.rows[0].detail);
  flows.delete(SINGLE.flowId);
  const { run } = runtime(flows);
  const { report } = await run.check({ only: [SINGLE.id] });
  ok(statusOf(report, SINGLE) === 'BLOCKED' && /not visible|no flow with this id/.test(rowsOf(report)[0].detail), 'a flow this account cannot see');
  let threw = false; try { await run.check({ only: ['NO_SUCH_PACKAGE'] }); } catch { threw = true; }
  ok(threw, '--only naming no package is an error, not an empty success');
}

section('check: the service\'s 500-action limit');
{
  /* Tenant, 2026-10-08: DYNAMIC_ACTIONS with user-admin reached 524 actions and the service refused the write. */
  const flows = tenant();
  const f = flows.get(OTP.flowId);
  const big = clone(OTP); big.pkg = clone(OTP.pkg);
  const sc = big.pkg.serializedValue;
  sc.actions = { ...sc.actions };
  for (let i = 0; i < 520; i++) sc.actions[`Compose_Padding_${i}`] = { type: 'Compose', inputs: 'x', runAfter: {} };
  const r = planFlow(f, [big]);
  ok(r.rows[0].status === 'BLOCKED' && /would hold \d+ actions; the service allows 500/.test(r.rows[0].detail) && !r.desired, 'a package that takes its flow past 500 actions is BLOCKED before anything is written', r.rows[0].detail);
  const longPkg = clone(OTP); longPkg.pkg = clone(OTP.pkg);
  longPkg.pkg.serializedValue.actions = { ...longPkg.pkg.serializedValue.actions, Compose_Too_Long: { type: 'Compose', inputs: `@concat('${'x'.repeat(9000)}')`, runAfter: {} } };
  const r2 = planFlow(f, [longPkg]);
  ok(r2.rows[0].status === 'BLOCKED' && /exceed the service's 8192 characters/.test(r2.rows[0].detail) && /Compose_Too_Long/.test(r2.rows[0].detail), 'a package with an expression over 8,192 characters is BLOCKED before anything is written', r2.rows[0].detail);
}

section('replaces: a scope put in the package\'s place under another name');
{
  const flows = tenant();
  const f = flows.get(OTP.flowId);
  const acts = f.properties.definition.actions;
  const renamed = {};
  for (const [n, a] of Object.entries(acts)) {
    const b = clone(a);
    if (b.runAfter && OTP.scope in b.runAfter) { b.runAfter.Scope_Stand_In = b.runAfter[OTP.scope]; delete b.runAfter[OTP.scope]; }
    renamed[n === OTP.scope ? 'Scope_Stand_In' : n] = b;
  }
  f.properties.definition.actions = renamed;
  const blocked = planFlow(f, [OTP]);
  ok(blocked.rows[0].status === 'BLOCKED', 'without `replaces`, a scope under another name is not guessed at', blocked.rows[0].detail);
  const r = planFlow(f, [{ ...OTP, replaces: ['Scope_Stand_In'] }]);
  ok(r.rows[0].status === 'WILL_UPDATE' && /replaces Scope_Stand_In/.test(r.rows[0].detail), 'with `replaces`, the package takes its place', r.rows[0].detail);
  const order = Object.keys(r.desired.definition.actions);
  ok(order.includes(OTP.scope) && !order.includes('Scope_Stand_In') && order.indexOf(OTP.scope) === Object.keys(renamed).indexOf('Scope_Stand_In'),
    'the package sits where the stand-in sat, and the stand-in is gone');
  ok(Object.keys(r.original.definition.actions).includes('Scope_Stand_In'), 'the original kept for the restore is the flow as stored');
}

section('restore');
{
  const flows = tenant();
  const before = clone(flows.get(BULK.flowId).properties.definition);
  const { run, saved } = runtime(flows);
  await run.apply({ only: [BULK.id] });
  ok(JSON.stringify(flows.get(BULK.flowId).properties.definition) !== JSON.stringify(before), 'applied');
  const { run: back } = runtime(flows);
  const rows = await back.restore(saved[0].value);
  ok(rows.length === 1 && rows[0].status === 'RESTORED', 'every flow in the backup is RESTORED and read back');
  ok(JSON.stringify(flows.get(BULK.flowId).properties.definition).includes('an earlier build'), 'the flow holds what the backup holds');
  let threw = false; try { await back.restore({ flows: {} }); } catch { threw = true; }
  ok(threw, 'a file that is not a flows backup is refused');
}

/* ───────────────────────── against the tenant captures ───────────────────────── */

section('Every package installs into the flow it was built for (tenant captures)');
{
  const dir = 'docs/folio-Master-Flows-and-Endpoints/captures';
  const files = readdirSync(dir);
  const groups = new Map();
  for (const p of PACKAGES) groups.set(p.flowId, [...(groups.get(p.flowId) || []), p]);
  let checked = 0;
  for (const [id, pkgs] of groups) {
    const f = files.find((x) => x.includes(id));
    if (!f) continue;
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const keys = new Set(); JSON.stringify(c.Definition).replace(/"connectionName":"([^"]+)"/g, (_, k) => keys.add(k));
    const live = { name: id, properties: { displayName: c.Name, definition: c.Definition, connectionReferences: Object.fromEntries([...keys].map((k) => [k, { connectionName: 'captured', id: 'x' }])) } };
    for (const r of planFlow(live, pkgs).rows) {
      checked++;
      /* The action limit is a fact about the live flow, not a capture: a capture can predate the flow (DYNAMIC_ACTIONS'
         carries some 165 steps outside its scope that the live flow no longer has). The limit is tested above. */
      ok(r.status !== 'BLOCKED' || /added, not replaced|the service allows 500/.test(r.detail), `${r.id}: ${r.status}`, r.detail);
    }
  }
  ok(checked >= 18, `${checked} packages checked against their captures`);
}

section('Against the tenant exports in the repository (with their real connection references)');
{
  const dir = 'docs/folio-Master-Flows-and-Endpoints/exports';
  const ledger = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json', 'utf8'));
  let read = 0;
  for (const z of readdirSync(dir).filter((f) => /__[0-9a-f]{8}__Export_\d{14}\.zip$/.test(f))) {
    const id = z.match(/__([0-9a-f]{8})__Export_/)[1];
    const pkgs = PACKAGES.filter((p) => p.flowId.startsWith(id));
    if (!pkgs.length) continue;
    const m = openZip(join(ROOT, dir, z)).members.find((x) => /\/definition\.json$/.test(x.name));
    const props = JSON.parse(m.read().toString('utf8')).properties;
    const plan = planFlow({ name: pkgs[0].flowId, properties: { displayName: props.displayName, definition: props.definition, connectionReferences: props.connectionReferences } }, pkgs);
    for (const r of plan.rows) {
      read++;
      ok(r.status !== 'BLOCKED', `${z.replace(/_Export_.*/, '')}: ${r.status}`, r.detail);
      const recorded = ledger.entries.find((e) => e.file === r.file && (e.evidence || '').includes(z));
      if (recorded?.emptySetVariables) ok(JSON.stringify(r.liveEmptySetVariables) === JSON.stringify(recorded.emptySetVariables), `the empty Set variable steps it finds are the ones the ledger records from that export (${recorded.emptySetVariables.length})`);
    }
  }
  ok(read >= 3, `${read} packages checked against tenant exports`);
}

/* ───────────────────────── the command, end to end ───────────────────────── */

section('npm run flows:update, as an operator runs it');
{
  const flows = tenant();
  const svc = service(flows);
  let deviceCodes = 0, refreshes = 0;
  const jwt = (o) => `x.${Buffer.from(JSON.stringify(o)).toString('base64url')}.y`;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url.endsWith('/oauth2/v2.0/devicecode')) { deviceCodes++; return send(200, { device_code: 'dc', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', interval: 1, expires_in: 60 }); }
    if (req.url.endsWith('/oauth2/v2.0/token')) {
      const f = new URLSearchParams(raw);
      if (f.get('grant_type') === 'refresh_token') refreshes++;
      return send(200, { access_token: jwt({ upn: 'owner@nitda.gov.ng', name: 'Flow Owner' }), refresh_token: `rt-${deviceCodes}-${refreshes}` });
    }
    const m = req.url.match(/^\/providers\/Microsoft\.ProcessSimple\/environments\/([^/]+)(\/flows\/[^?]+)\?api-version=2016-11-01$/);
    if (!m || m[1] !== ENV || req.headers.authorization !== `Bearer ${jwt({ upn: 'owner@nitda.gov.ng', name: 'Flow Owner' })}`) return send(401, { error: { code: 'Unauthorized' } });
    const r = await svc.api(req.method, m[2], raw ? JSON.parse(raw) : undefined);
    send(r.status || 500, r.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tmp = mkdtempSync(join(tmpdir(), 'flows-update-'));
  const session = join(tmp, 'session.json');
  const cli = (...a) => new Promise((resolve) => {
    const p = spawn(process.execPath, ['scripts/flows-update.mjs', ...a, '--out', join(tmp, 'out')], {
      env: { ...process.env, FOLIO_FLOW_API: base, FOLIO_LOGIN: base, FOLIO_FLOWS_POLL_MS: '1', FOLIO_FLOWS_RETRY_MS: '1', FOLIO_MS_SESSION: session }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  try {
    const c1 = await cli('check', '--only', SINGLE.id);
    ok(c1.code === 1 && /WILL_UPDATE\s+SINGLE_ASSIGNMENT/.test(c1.out), 'check: exit 1 while the flow differs', c1.out.slice(-600));
    ok(/enter the code ABCD-EFGH/.test(c1.out) && deviceCodes === 1, 'the first run signs in with a code');
    ok(existsSync(session) && (statSync(session).mode & 0o777) === 0o600, 'and keeps the sign-in in the session file, mode 0600');
    ok(!c1.out.includes('rt-') && !c1.out.includes('Bearer'), 'no token is printed');
    const a = await cli('apply', '--only', SINGLE.id);
    ok(a.code === 0 && /Nothing written/.test(a.out) && !svc.calls.some((x) => x.startsWith('PATCH ')), 'apply without a terminal or --yes writes nothing', a.out.slice(-400));
    const a2 = await cli('apply', '--only', SINGLE.id, '--yes');
    ok(a2.code === 0 && /APPLIED\s+SINGLE_ASSIGNMENT/.test(a2.out), 'apply --yes: written and read back, exit 0', a2.out.slice(-600));
    ok(deviceCodes === 1 && refreshes >= 2, 'later runs use the saved sign-in: no new code');
    const out = readdirSync(join(tmp, 'out'));
    const bk = out.find((f) => f.startsWith('flows-backup-'));
    ok(bk && (statSync(join(tmp, 'out', bk)).mode & 0o777) === 0o600, 'the backup is written mode 0600');
    ok(out.some((f) => f.startsWith('flows-apply-')) && out.some((f) => f.startsWith('flows-check-')), 'each run writes its report');
    const c2 = await cli('check', '--only', SINGLE.id);
    ok(c2.code === 0 && /UP_TO_DATE\s+SINGLE_ASSIGNMENT/.test(c2.out), 'check: exit 0 once the flow carries its package', c2.out.slice(-400));
    const none = await cli('restore', join(tmp, 'out', bk), '--only', 'no-such-flow');
    ok(none.code === 2 && /names no flow/.test(none.out), 'restore --only naming no flow in the backup is refused before sign-in');
    /* A backup of two flows; restore --only puts back the one named and leaves the other alone. */
    const two = JSON.parse(readFileSync(join(tmp, 'out', bk), 'utf8'));
    const bulkNow = flows.get(BULK.flowId).properties;
    two.flows[BULK.flowId] = { name: bulkNow.displayName, properties: { definition: bulkNow.definition, connectionReferences: bulkNow.connectionReferences } };
    writeFileSync(join(tmp, 'two-flow-backup.json'), JSON.stringify(two));
    const patchesBefore = svc.calls.filter((c) => c === `PATCH /flows/${BULK.flowId}`).length;
    const rs = await cli('restore', join(tmp, 'two-flow-backup.json'), '--only', SINGLE.flowId.slice(0, 8));
    ok(rs.code === 0 && /RESTORED/.test(rs.out) && JSON.stringify(flows.get(SINGLE.flowId).properties.definition).includes('an earlier build'), 'restore puts the backup back', rs.out.slice(-400));
    ok(svc.calls.filter((c) => c === `PATCH /flows/${BULK.flowId}`).length === patchesBefore, 'restore --only leaves the other flows in the backup alone');
    const rec = mkdtempSync(join(tmpdir(), 'flows-record-'));
    mkdirSync(join(rec, 'docs/folio-Master-Flows-and-Endpoints/evidence'), { recursive: true });
    mkdirSync(join(rec, 'docs/folio-Master-Flows-and-Endpoints/registers'), { recursive: true });
    writeFileSync(join(rec, 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json'), readFileSync('docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json'));
    const applied = join(tmp, 'out', readdirSync(join(tmp, 'out')).find((f) => f.startsWith('flows-apply-')));
    const before = deviceCodes + refreshes;
    const recordCli = (...a) => new Promise((resolve) => {
      const p = spawn(process.execPath, ['scripts/flows-update.mjs', ...a], { env: { ...process.env, FOLIO_FLOWS_RECORD_ROOT: rec, FOLIO_LOGIN: base, FOLIO_FLOW_API: base }, stdio: ['ignore', 'pipe', 'pipe'] });
      let o = ''; p.stdout.on('data', (d) => { o += d; }); p.stderr.on('data', (d) => { o += d; });
      p.on('close', (code) => resolve({ code, out: o }));
    });
    const r1 = await recordCli('record', applied);
    const filed = readdirSync(join(rec, 'docs/folio-Master-Flows-and-Endpoints/evidence'));
    const led = JSON.parse(readFileSync(join(rec, 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json'), 'utf8'));
    const entry = led.entries.find((x) => x.file === `${SINGLE.id}.paste.json`);
    ok(r1.code === 0 && filed.length === 1 && /^\d{4}-\d{2}-\d{2}-flows-apply\.json$/.test(filed[0]), `record files the report as evidence (${filed[0]})`, r1.out);
    ok(entry && entry.fingerprint === SINGLE_FP && entry.evidence.includes(`evidence/${filed[0]}`), 'and records in the paste ledger that the flow runs its package, citing the evidence');
    ok(deviceCodes + refreshes === before, 'record signs in to nothing');
    const r2 = await recordCli('record', applied);
    ok(r2.code === 2 && /already recorded/.test(r2.out), 'the same report is not filed twice');
    const r3 = await recordCli('record', join(tmp, 'session.json'));
    ok(r3.code === 2 && /not a report/.test(r3.out), 'a file that is not a report is refused');
    rmSync(rec, { recursive: true, force: true });
    const bad = await cli('frobnicate');
    ok(bad.code === 2 && /Usage/.test(bad.out), 'an unknown command prints the usage, exit 2');
  } finally {
    server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
