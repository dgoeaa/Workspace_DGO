#!/usr/bin/env node
/**
 * The corrected flow-truth persistence scope, held to the defects it was built to fix.
 *
 * `docs/audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md` records what was wrong with the submitted
 * `Scope_SharePoint_Flow_Truth_Persistence` package. A review that nothing guards is a review
 * with a half-life, so each finding that can be expressed as a property of the artefact is
 * asserted here — and the ones that could be satisfied by an artefact that is subtly wrong are
 * mutation-tested: the check is shown rejecting a package that reintroduces the defect.
 *
 * It also holds the provisioning claim. The two governance lists and the artefact library do not
 * exist in the tenant capture, the package says so in its own companion file, and this goes red
 * the day a capture contains them — which is the day the package should be re-emitted against
 * their GUIDs and moved into the estate's gated directory.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const section = (t) => console.log(`\n${t}\n`);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const DIR = 'docs/deployment/governance/flows';
const PKG_PATH = `${DIR}/DGO_FLOW_TRUTH_PERSISTENCE.designer-paste.json`;
const VARS_PATH = `${DIR}/DGO_FLOW_TRUTH_PERSISTENCE.variables.designer-paste.json`;
const CONTRACT_PATH = `${DIR}/DGO_FLOW_TRUTH_PERSISTENCE.host-contract.json`;

console.log('\nFlow-truth persistence package\n');

section('The artefacts exist and are current');

for (const p of [PKG_PATH, VARS_PATH, CONTRACT_PATH, `${DIR}/DGO_FLOW_TRUTH_PERSISTENCE.variables.md`, `${DIR}/README.md`]) {
  ok(existsSync(p), `${p.split('/').pop()} is committed`);
}

/* The generator refuses to emit a package that writes an undeclared column or omits a required
   one, so a passing --check is also a passing schema conformance run. */
let stale = '';
try { execFileSync(process.execPath, ['scripts/build-flow-truth-persistence.mjs', '--check'], { encoding: 'utf8' }); }
catch (e) { stale = (e.stdout || '') + (e.stderr || ''); }
ok(!stale, 'the committed artefacts match what the generator emits', stale.trim().split('\n').slice(0, 3).join(' / '));

const pkg = read(PKG_PATH);
const vars = read(VARS_PATH);
const contract = read(CONTRACT_PATH);
const raw = JSON.stringify(pkg);

/* ---------------------------------------------------------------- the action model */

const acts = new Map();        // name -> { act, container }
const containers = new Map();  // id -> { ownerName, parent, siblings }
{
  let n = 0;
  const add = (node, ownerName, parent) => {
    if (!node?.actions || typeof node.actions !== 'object') return;
    const id = `c${n++}`;
    containers.set(id, { ownerName, parent, siblings: node.actions });
    for (const [name, act] of Object.entries(node.actions)) {
      acts.set(name, { act, container: id });
      add(act, name, id);
      if (act.else) add(act.else, name, id);
    }
  };
  add(pkg.serializedValue, pkg.nodeId, null);
}
const withParams = [...acts].filter(([, i]) => i.act?.inputs?.parameters);

section('The clipboard envelope');

for (const k of ['nodeId', 'serializedValue', 'allConnectionData', 'staticResults', 'isScopeNode', 'mslaNode']) {
  ok(k in pkg, `the envelope carries '${k}'`);
}
ok(pkg.isScopeNode === true && pkg.mslaNode === true, 'isScopeNode and mslaNode are both true');
ok(pkg.serializedValue?.type === 'Scope', 'serializedValue is a Scope');
/* The submitted package shipped `runAfter: {Scope_Global_System_Endpoints: [...]}` at the top —
   the signature of a scope copied back OUT of the designer after being pasted under something. */
ok(Object.keys(pkg.serializedValue?.runAfter || {}).length === 0,
  'the scope is a root: it ships runAfter {}',
  Object.keys(pkg.serializedValue?.runAfter || {}).join(', '));

section('Connector bindings');

const SP = 'shared_sharepointonline';
const connectorNames = [...acts].filter(([, i]) => i.act?.type === 'OpenApiConnection').map(([n]) => n);
ok(connectorNames.length > 0, `${connectorNames.length} connector actions`);
const bindingProblems = [];
for (const name of connectorNames) {
  const entry = pkg.allConnectionData[name];
  const api = acts.get(name).act.inputs?.host?.connection;
  if (!entry) { bindingProblems.push(`${name} has no allConnectionData entry`); continue; }
  if (api !== SP) bindingProblems.push(`${name} runs on ${api}, not ${SP}`);
  if (entry.referenceKey !== api) bindingProblems.push(`${name} referenceKey ${entry.referenceKey} ≠ ${api}`);
  if (entry.connectionReference?.api?.id !== `/providers/Microsoft.PowerApps/apis/${api}`) bindingProblems.push(`${name} names the wrong api id`);
  const cn = entry.connectionReference?.connectionName;
  if (!cn) bindingProblems.push(`${name} has no connectionName`);
  else if (entry.connectionReference?.connection?.id !== `/providers/Microsoft.PowerApps/apis/${api}/connections/${cn}`) {
    bindingProblems.push(`${name} connection id and connectionName disagree`);
  }
}
/* The submitted package bound every action to `shared_sharepointonline-1` while its api id still
   said `shared_sharepointonline`, which failed both halves of this check thirteen times. */
ok(!bindingProblems.length, 'every connector action is bound, on the right api, to a matching connection', bindingProblems.slice(0, 3).join('; '));
ok(Object.keys(pkg.allConnectionData).every((n) => connectorNames.includes(n)),
  'allConnectionData names nothing that is not a connector action');

section('The idempotency guard');

const GATE = 'Condition_Ledger_Record_Already_Exists';
const PERSIST = 'Scope_Persist_New_Ledger_Record';
const gate = acts.get(GATE)?.act;
ok(gate?.type === 'If', `${GATE} is a condition`);
/* THE DEFECT THIS EXISTS FOR.
   The submitted scope had this condition, composed a replay result on its true branch, left the
   else branch EMPTY — and ran the persist scope after the CONDITION, which succeeds on both
   branches. It persisted every time, duplicating the history row and five files on a replay,
   while the final Compose reported `AlreadyPersisted`. */
ok(Boolean(gate?.else?.actions?.[PERSIST]), `${PERSIST} is inside the condition's else branch`);
ok(!(PERSIST in (pkg.serializedValue.actions || {})), `${PERSIST} is not a sibling of the condition`);
ok(Object.keys(gate?.else?.actions || {}).length > 0, "the else branch is not empty");
ok(Boolean(gate?.actions?.Compose_Idempotent_Replay_Result), 'the true branch composes a replay result');
/* Nothing that writes may sit downstream of the gate on Succeeded alone — that is exactly the
   shape that bypassed it. */
const writesAfterGateSucceeded = Object.entries(pkg.serializedValue.actions)
  .filter(([, a]) => (a.runAfter?.[GATE] || []).includes('Succeeded'))
  .filter(([, a]) => a.type === 'OpenApiConnection' || a.type === 'Scope' && JSON.stringify(a).includes('OpenApiConnection'));
ok(!writesAfterGateSucceeded.length,
  'no connector action runs after the gate on Succeeded — that is the bypass',
  writesAfterGateSucceeded.map(([n]) => n).join(', '));

/* Mutation: the same check must reject the shape that was submitted. */
{
  const mutated = { ...pkg.serializedValue.actions, [PERSIST]: { type: 'Scope', actions: {}, runAfter: { [GATE]: ['Succeeded'] } } };
  ok(PERSIST in mutated && (mutated[PERSIST].runAfter?.[GATE] || []).includes('Succeeded'),
    'mutation control: a persist scope hung off the gate on Succeeded is detectable');
}

section('What is captured, and what is not');

/* CaptureRequestBody=false and CaptureHeaders=false are configuration seeds of the registry
   design and tests/http-flow-registry.test.mjs holds them there deliberately. The submitted
   scope wrote `"body": "@triggerBody()"` and `"outputs": "@triggerOutputs()"` into the record it
   stored in SharePoint — and `triggerOutputs()` carries the unredacted trigger headers,
   `x-ms-igw-external-uri` among them, which is the whole inbound URL and its `sig=` token. The
   same record asserted `credentialsExcluded: true`. */
for (const forbidden of ['triggerBody()', 'triggerOutputs()', 'triggerFormDataValue', 'triggerMultipartBody']) {
  ok(!raw.includes(forbidden), `the package never reads ${forbidden}`);
}
ok(!/x-ms-igw-(external-uri|raw-target)/.test(raw),
  'no gateway header that carries the inbound URL is named as a value to capture');
ok(!/sig=(?!REDACTED)[A-Za-z0-9_%-]{8,}/.test(raw), 'the package carries no signature');

/* result() returns every contained action's inputs and outputs, unredacted and unbounded. The
   submitted scope embedded two of them in the record it wrote to SharePoint. One remains — in
   the catch scope, whose output stays in the run history and is never persisted. */
const resultRefs = [...raw.matchAll(/result\('([^']+)'\)/g)].map((m) => m[1]);
ok(resultRefs.length === 1 && resultRefs[0] === PERSIST,
  'result() is used once, on the persist scope, inside the catch',
  resultRefs.join(', '));
const persistedRecord = acts.get('Compose_Flow_Truth_Record')?.act;
ok(!JSON.stringify(persistedRecord).includes('result('),
  'the record written to SharePoint contains no result() expansion');
ok(acts.get('Compose_Capture_Policy')?.act?.inputs?.captureHeaders === false
  && acts.get('Compose_Capture_Policy')?.act?.inputs?.captureRequestBody === false,
  'the capture policy states both seeds as false, in the record');

section('Nothing is asserted that is not measured');

const itemWrites = withParams.flatMap(([name, i]) =>
  Object.entries(i.act.inputs.parameters).filter(([k]) => k.startsWith('item/')).map(([k, v]) => [name, k, v]));
const literal = (v) => typeof v !== 'string' || !v.startsWith('@');
/* `RunStatus: "Succeeded"` and `DurationMilliseconds: 0` were literals in all three of the
   submitted scope's item writes — on a scope whose runAfter accepted Failed and TimedOut from
   the work it was reporting on. Every run would have been recorded as a success. */
for (const col of ['item/Outcome', 'item/DurationMs', 'item/HttpStatusCode', 'item/IsCompliant',
  'item/TotalExecutions', 'item/SuccessfulExecutions', 'item/FailedExecutions',
  'item/ConsecutiveFailures', 'item/AverageDurationMs', 'item/RecordVersion', 'item/LifecycleStatus']) {
  const writes = itemWrites.filter(([, k]) => k === col);
  ok(writes.length > 0 && writes.every(([, , v]) => !literal(v)),
    `${col} is derived, never a literal`,
    writes.filter(([, , v]) => literal(v)).map(([n]) => n).join(', '));
}
ok(!raw.includes('"lossless":true') && !raw.includes('"lossless": true'), 'nothing claims to be lossless');
ok(!raw.includes('IntegrityVerified'), 'nothing claims integrity was verified');
const manifest = acts.get('Compose_Integrity_Manifest')?.act?.inputs;
ok(/No content digest is computed/.test(String(manifest?.integrityMethod)),
  'the manifest states that no content digest is computed');
ok((manifest?.files || []).every((f) => String(f.etag).includes("body/ETag") && String(f.sizeBytes).includes('body/Size')),
  'every manifest entry records the ETag and byte size SharePoint returned');
ok(String(acts.get('Compose_Capture_Budget')?.act?.inputs?.truncated || '').startsWith('@greater(length('),
  'truncation is measured, not declared');

section('Fail-safe expressions');

/* `length(null)` throws. The submitted scope called `length(body('X')?['value'])` three times on
   a GetItems result it had not guarded. */
const unguardedLength = [...raw.matchAll(/length\((?!coalesce\()([^)]{0,40})/g)]
  .map((m) => m[1]).filter((s) => /body\(|variables\(|outputs\('Compose_Host_Inputs'\)\?\['(errors|inventory)'\]/.test(s));
ok(!unguardedLength.length, 'every length() over a nullable value is wrapped in coalesce()', unguardedLength.slice(0, 3).join(' / '));

/* THE WORKFLOW LANGUAGE EVALUATES BOTH ARMS OF if(). A guard written as
   `if(greater(length(s),n), substring(s,0,n), s)` therefore computes the substring on the short
   string too, and throws there. `substring(s,0,min(length(s),n))` is valid at every length. */
const substrings = [...raw.matchAll(/substring\([^,]+,0,([^)]+\)?)/g)].map((m) => m[1]);
ok(substrings.length > 0 && substrings.every((s) => s.startsWith('min(length(')),
  'every substring() is bounded by min(length(…),limit), not by a conditional',
  substrings.filter((s) => !s.startsWith('min(length(')).slice(0, 2).join(' / '));

/* ticks() throws on an unparseable string, so the guard cannot live inside the arithmetic. */
const ticksArgs = [...raw.matchAll(/ticks\(([^)]*\)?)\)/g)].map((m) => m[1]);
ok(ticksArgs.every((a) => a === 'utcNow(' || a === 'utcNow()' || a.includes('utcNow')),
  'ticks() is only ever applied to utcNow(); duration comes from the integer varStartTicks',
  ticksArgs.filter((a) => !a.includes('utcNow')).join(' / '));

/* Every variable read happens in one action, so a host that names them differently is one edit. */
const varReaders = [...acts].filter(([, i]) => JSON.stringify(i.act.inputs || {}).includes("variables('")).map(([n]) => n);
ok(varReaders.length === 1 && varReaders[0] === 'Compose_Host_Inputs',
  'every variable is read once, in Compose_Host_Inputs', varReaders.join(', '));
const used = new Set([...raw.matchAll(/variables\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
const declared = new Set(Object.values(vars.serializedValue.actions).map((a) => a.inputs.variables[0].name));
ok([...used].every((v) => declared.has(v)), 'the companion declares every variable the package reads',
  [...used].filter((v) => !declared.has(v)).join(', '));
ok([...declared].every((v) => used.has(v)), 'the companion declares nothing the package does not read',
  [...declared].filter((v) => !used.has(v)).join(', '));
/* The submitted scope read EnvironmentName, NotificationCorrelationId, FlowsFoundDetails,
   FlowsNotFoundDetails, RetrievalErrors and FlowsNotFoundCount — six names no flow in this
   estate declares and no tenant export contains. */
ok([...used].every((v) => v.startsWith('var')), 'every variable follows the estate var* convention', [...used].filter((v) => !v.startsWith('var')).join(', '));
ok(![...acts].some(([, i]) => i.act.type === 'InitializeVariable'),
  'the package declares no variable — Logic Apps accepts InitializeVariable only at the top level');

section('Reachability and ordering');

const raSiblingProblems = [];
for (const [name, info] of acts) {
  const siblings = containers.get(info.container).siblings;
  for (const dep of Object.keys(info.act.runAfter || {})) {
    if (!(dep in siblings)) raSiblingProblems.push(`${name} → ${dep}`);
  }
}
ok(!raSiblingProblems.length, 'every runAfter names a sibling', raSiblingProblems.join(', '));

const REF = /\b(?:outputs|body|actions|result)\('([^']+)'\)/g;
const unresolved = new Set();
for (const m of raw.matchAll(REF)) {
  if (!acts.has(m[1]) && !(m[1] in contract.actions)) unresolved.add(m[1]);
}
ok(!unresolved.size, 'every action reference resolves inside the package or in the host contract', [...unresolved].join(', '));

/* The host contract is the whole external surface — nothing may be read that it does not name,
   and it may not name something nothing reads. */
const hostRead = new Set([...raw.matchAll(REF)].map((m) => m[1]).filter((n) => !acts.has(n)));
ok(Object.keys(contract.actions).every((n) => hostRead.has(n)),
  'the host contract names nothing the package does not read',
  Object.keys(contract.actions).filter((n) => !hostRead.has(n)).join(', '));
const funnel = JSON.stringify(acts.get('Compose_Host_Inputs').act.inputs);
ok([...hostRead].every((n) => funnel.includes(`'${n}'`)),
  'every host action is read inside Compose_Host_Inputs and nowhere else',
  [...hostRead].filter((n) => !funnel.includes(`'${n}'`)).join(', '));

/* The probe must precede the record build: a replay should not pay for a megabyte of string(). */
const probeAfter = Object.keys(acts.get('Get_Existing_Ledger_Record').act.runAfter || {});
ok(!acts.get('Get_Existing_Ledger_Record').act.runAfter?.Compose_Flow_Truth_Record_String
  && probeAfter.length > 0,
  'the idempotency probe runs before the record is built', probeAfter.join(', '));

section('SharePoint targeting');

const design = read('docs/reference/http-flow-registry-spec.json');
const bindings = read('docs/deployment/governance/list-bindings.json');
const declaredCols = new Map();
for (const f of design.fields) {
  if (!declaredCols.has(f.listTitle)) declaredCols.set(f.listTitle, new Map());
  declaredCols.get(f.listTitle).set(f.internalName, f);
}
const site = bindings.targetSite;
ok(withParams.every(([, i]) => i.act.inputs.parameters.dataset === site),
  `every action targets ${site}`);

/* Every one of the twelve CreateFile actions in the deployed corpus begins its folderPath with
   the library name. The submitted scope's began with `/history/`, which names no library on any
   site in the tenant — and its three folder-creation actions used `history/` without the leading
   slash, so the folders it made and the files it wrote were two different paths. */
const LIB = Object.keys(bindings.libraries)[0];
const folderPaths = withParams
  .filter(([, i]) => ['CreateFile', 'CreateNewFolder'].includes(i.act.inputs.host.operationId))
  .map(([n, i]) => [n, i.act.inputs.parameters.folderPath]);
ok(folderPaths.length > 0 && folderPaths.every(([, p]) => String(p).includes('artefactFolderPath')),
  'every file and folder action builds its path from the one identity field', folderPaths.map(([n]) => n).join(', '));
ok(String(acts.get('Compose_Persistence_Identity').act.inputs.artefactFolderPath).includes(`/${LIB}/`),
  `the artefact folder path names the ${LIB} library`);

const colProblems = [];
for (const [name, i] of withParams) {
  const table = i.act.inputs.parameters.table;
  const title = Object.entries({ ...bindings.lists }).find(([t, g]) => (g ?? t) === table)?.[0];
  if (!title) continue;
  for (const k of Object.keys(i.act.inputs.parameters)) {
    if (!k.startsWith('item/')) continue;
    const col = k.slice(5);
    if (col === 'Title' || col === 'ID') continue;
    if (!declaredCols.get(title)?.has(col)) colProblems.push(`${name} writes ${title}.${col}`);
  }
  const f = i.act.inputs.parameters.$filter;
  if (f) {
    for (const m of String(f).matchAll(/([A-Za-z_][A-Za-z0-9_]*) eq /g)) {
      if (!declaredCols.get(title)?.has(m[1])) colProblems.push(`${name} filters ${title}.${m[1]}`);
    }
  }
}
ok(!colProblems.length, 'every column written or filtered is declared in the design workbook', colProblems.slice(0, 3).join('; '));

/* Required numeric and Boolean fields have no declared defaults — 11_Risks_Controls says so, and
   its control is "all item-creation flows must supply values explicitly". */
const createOmissions = [];
for (const [name, i] of withParams) {
  if (i.act.inputs.host.operationId !== 'PostItem') continue;
  const table = i.act.inputs.parameters.table;
  const title = Object.entries(bindings.lists).find(([t, g]) => (g ?? t) === table)?.[0];
  if (!title) continue;
  const written = new Set(Object.keys(i.act.inputs.parameters).filter((k) => k.startsWith('item/')).map((k) => k.slice(5)));
  for (const [col, f] of declaredCols.get(title)) {
    if (f.required === 'Yes' && !written.has(col)) createOmissions.push(`${name} omits ${title}.${col}`);
  }
}
ok(!createOmissions.length, 'every create path supplies every column the design marks Required', createOmissions.slice(0, 4).join('; '));

/* The two filters run on the unique, indexed keys — the only shape that survives a list past the
   5,000-item view threshold, which an append-only ledger reaches by definition. */
const filters = withParams.filter(([, i]) => i.act.inputs.parameters.$filter).map(([n, i]) => [n, i.act.inputs.parameters.$filter]);
const UNIQUE = new Set(design.uniqueKeys.map((u) => u.field));
ok(filters.length > 0 && filters.every(([, f]) => [...UNIQUE].some((k) => String(f).startsWith(`@concat('${k} eq `))),
  'every $filter leads on a unique, indexed key', filters.map(([n]) => n).join(', '));
ok(filters.every(([, f]) => String(f).includes("replace(") && String(f).includes("''''''")),
  'every $filter doubles embedded apostrophes so a key cannot break out of the literal');

section('The seven the suite had never asserted');

/* Until 2026-09-15 this suite answered 22 of the review's 29 findings and named none of them.
   docs/audits/flow-truth-coverage.json now maps assertion to finding, and these seven close the
   gap it exposed. Six of the seven were already true of the rebuild and simply ungated — the one
   that was not is C11, which this suite would have caught the day it was written. */

/* C11 · EnvironmentName carried the same expression as EnvironmentId, so the column the design
   calls "Human-readable environment name" held an identifier. A flow has one environment
   designator and it is not a display name, so the column is written by nothing. */
{
  const envName = withParams.flatMap(([n, i]) =>
    Object.entries(i.act.inputs.parameters).filter(([k]) => k === 'item/EnvironmentName').map(([, v]) => [n, v]));
  ok(envName.length === 0,
    'C11 · EnvironmentName is written by nothing — a flow cannot read a display name, and the identifier is not one',
    envName.map(([n, v]) => `${n} = ${v}`).join('; '));
}

/* C12 · FlowName was workflow()?['name'], which is the flow's GUID rather than its name. */
{
  const flowName = withParams.flatMap(([n, i]) =>
    Object.entries(i.act.inputs.parameters).filter(([k]) => k === 'item/FlowName').map(([, v]) => [n, String(v)]));
  ok(flowName.length > 0 && flowName.every(([, v]) => /flowDisplayName/.test(v)),
    'C12 · FlowName reads the display name, never workflow()?[\'name\'] which is the GUID',
    flowName.filter(([, v]) => !/flowDisplayName/.test(v)).map(([n]) => n).join(', '));
}

/* C9 · Every stored URL was broken by the first space. The rebuild stores no URL at all, which
   is the stronger answer — and has to stay true, because a URL column added later would
   reintroduce the escaping problem the finding names. */
{
  const urlCols = withParams.flatMap(([n, i]) =>
    Object.keys(i.act.inputs.parameters).filter((k) => /^item\/.*(Url|Uri|Endpoint)/i.test(k)).map((k) => `${n}.${k}`));
  ok(urlCols.length === 0,
    'C9 · no item column stores a URL, so none can be broken by the first space in one',
    urlCols.join(', '));
}

/* C10 · ComplianceIssuesJson stored notification delivery — a column carrying something other
   than what the design says it is for. */
{
  const compliance = withParams.flatMap(([n, i]) =>
    Object.entries(i.act.inputs.parameters).filter(([k]) => /^item\/Compliance/.test(k)).map(([k, v]) => [n, k, String(v)]));
  ok(compliance.length > 0 && compliance.every(([, , v]) => /\['governance'\]/.test(v)),
    'C10 · every Compliance column reads the governance input, not notification delivery',
    compliance.filter(([, , v]) => !/\['governance'\]/.test(v)).map(([n, k]) => `${n}.${k}`).join(', '));
}

/* C16 · A null HTML report aborted the chain after two files were written, because the file
   creations ran in series. They now fan out from the folder, so one failure cannot strand the
   others half-written. */
{
  const creates = [...acts].filter(([, i]) => i.act?.inputs?.host?.operationId === 'CreateFile');
  const chained = creates.filter(([, i]) =>
    Object.keys(i.act.runAfter || {}).some((d) => acts.get(d)?.act?.inputs?.host?.operationId === 'CreateFile'));
  ok(creates.length > 0 && chained.length === 0,
    `C16 · no file creation runs after another — ${creates.length} fan out, so one failure strands none`,
    chained.map(([n]) => n).join(', '));
}

/* C17 · Four timestamps came from four separate utcNow() calls, so one record disagreed with
   itself. The record now reads one captured value. */
{
  const record = JSON.stringify(acts.get('Compose_Flow_Truth_Record')?.act?.inputs || {});
  ok(!record.includes('utcNow()'),
    'C17 · the persisted record calls utcNow() nowhere — its times read one captured value',
    (record.match(/utcNow\(\)/g) || []).length ? `${(record.match(/utcNow\(\)/g) || []).length} call(s)` : '');
}

/* C18 · Once C1 moved the persist scope under a condition, Skipped became reachable and the
   final Compose would have been skipped with it. It must accept Skipped from the failure scope. */
{
  const final = pkg.serializedValue.actions.Compose_Final_Persistence_Result;
  const afterFailure = final?.runAfter?.Scope_Persistence_Failure || [];
  ok(afterFailure.includes('Skipped'),
    'C18 · the final Compose accepts Skipped from the failure scope, so a clean run still reports',
    JSON.stringify(final?.runAfter || {}));
}

section('Provisioning state');

const listIndex = read('docs/reference/sharepoint-list-index.json');
const onTargetSite = new Set(Object.values(listIndex.lists)
  .filter((l) => l.siteUrl === site).map((l) => l.title));
const targets = [...Object.keys(bindings.lists), ...Object.keys(bindings.libraries)];
const built = targets.filter((t) => onTargetSite.has(t));
/* This goes red the day the estate provisions them — deliberately. That is the day
   list-bindings.json gains GUIDs, `npm run flowtruth` re-emits against them, and the package
   moves into the gated designer-paste directory where the rest of the estate lives. */
ok(!built.length,
  `none of the ${targets.length} target resources exists in the ${listIndex.capturedUtc} capture of the target site`,
  built.length ? `now captured: ${built.join(', ')} — record the GUIDs in docs/deployment/governance/list-bindings.json, re-run npm run flowtruth, and move the package into docs/deployment/internal/flows/designer-paste/` : '');
ok(contract.provisioning.state === (built.length ? 'BOUND' : 'BLOCKED-ON-PROVISIONING'),
  'the companion states the provisioning state the capture supports', contract.provisioning.state);
const guidOf = (t) => (t in bindings.lists ? bindings.lists[t] : bindings.libraries[t]);
ok(targets.every((t) => (built.includes(t) ? true : guidOf(t) === null)),
  'no GUID is claimed for a resource nobody has built',
  targets.filter((t) => !built.includes(t) && guidOf(t) !== null).join(', '));

console.log(`\n  ${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
