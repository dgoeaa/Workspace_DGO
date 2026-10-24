#!/usr/bin/env node
/**
 * The designer-paste scope that makes the tenant exporter produce a values file.
 *
 * WHY THIS SUITE IS SHAPED THE WAY IT IS
 * The scope it checks exists because the exporter's own delivery scope could not run, and the
 * reasons were not exotic: a runAfter reading ["SUCCEEDED"] where Logic Apps requires
 * `Succeeded`, an attachment Compose whose inputs were malformed JSON, and a Compose whose
 * inputs were an entire action definition referencing @item() from outside the loop it resolves
 * in. Every one of those is a static property of the document. None of them was caught, because
 * nothing read the document.
 *
 * So this suite reads it. It is not a mock of Power Automate — it asserts the things that made
 * the last delivery undeliverable, plus the one invariant that makes the output safe: a URL is
 * written under a contract key only when it names that key's application workflow id.
 *
 * Run: node tests/endpoint-values-harvester.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTE = 'docs/deployment/power-automate-flows/harvester/Scope_Endpoint_Values_Delivery.designer-paste.json';
const raw = readFileSync(path.join(ROOT, PASTE), 'utf8');
const crosswalk = JSON.parse(readFileSync(path.join(ROOT, 'docs/reference/flow-identity-crosswalk.json'), 'utf8'));

let passed = 0, failed = 0;
const is = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

console.log('\nThe endpoint values delivery scope\n');

let paste = null;
try { paste = JSON.parse(raw); } catch (e) { /* asserted below */ }

section('  THE DOCUMENT — the last delivery scope was undeliverable for static reasons');
is('it is valid JSON', !!paste, 'the designer refuses a paste it cannot parse');
if (!paste) { console.log(`\n❌ ${passed} passed, ${failed} failed\n`); process.exit(1); }

/** Every action in the tree, as [name, node] with its parent action names for scope checks. */
function walk(actions, out = [], siblings = []) {
  const names = Object.keys(actions || {});
  for (const name of names) {
    const node = actions[name];
    out.push({ name, node, siblings: names });
    if (node.actions) walk(node.actions, out, names);
    if (node.else && node.else.actions) walk(node.else.actions, out, names);
  }
  return out;
}
const all = walk(paste.serializedValue.actions);
const byName = new Map(all.map((a) => [a.name, a]));
/* A missing node must read as a failed assertion, not as a suite that stopped. Under
   falsification a crash reports FEWER failures than exist, which looks like a suite that has
   simply not been read carefully — the lesson tests/harvest-console.test.mjs records. */
const nodeOf = (name) => (byName.get(name) || { node: {} }).node;
const deep = (obj, ...path) => path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

/* The defect that stopped the exporter dead: the scope was never scheduled, because no status
   ever equals "SUCCEEDED". It is a one-word difference and it produced total silence. */
const VALID_STATUS = new Set(['Succeeded', 'Failed', 'Skipped', 'TimedOut']);
const badStatus = [];
for (const { name, node } of all) {
  for (const [dep, statuses] of Object.entries(node.runAfter || {})) {
    for (const s of statuses) if (!VALID_STATUS.has(s)) badStatus.push(`${name} runAfter ${dep}: ${s}`);
  }
}
is('every runAfter status is one Logic Apps actually emits', badStatus.length === 0,
   badStatus.join('\n       ') + '\n       status values are case-sensitive; "SUCCEEDED" never matches');

const danglingDeps = [];
for (const { name, node, siblings } of all) {
  for (const dep of Object.keys(node.runAfter || {})) {
    if (!siblings.includes(dep)) danglingDeps.push(`${name} runAfter ${dep}, which is not its sibling`);
  }
}
is('every runAfter names an action in the same scope', danglingDeps.length === 0,
   danglingDeps.join('\n       '));

/* A Compose whose inputs are an action definition is what the exporter shipped. It parses, it
   deploys, and it can never resolve. */
const ACTION_SHAPED = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.values(v).some((x) => x && typeof x === 'object' && typeof x.type === 'string' && 'inputs' in x);
const nestedDefs = all.filter(({ node }) => node.type === 'Compose' && ACTION_SHAPED(node.inputs)).map((a) => a.name);
is('no Compose has an action definition as its inputs', nestedDefs.length === 0, nestedDefs.join(', '));

section('  ADDRESSING — one identifier addresses, the other verifies');
/* Coerced to arrays: one falsification replaces a Compose's inputs with an object, and an
   `expected.includes` against an object throws rather than failing. */
const asArray = (v) => (Array.isArray(v) ? v : []);
const registry = asArray(nodeOf('Compose_Endpoint_Values_Registry').inputs);
const expected = asArray(nodeOf('Compose_Expected_Contract_Keys').inputs);
const registerKeys = crosswalk.keys.map((k) => k.contractKey);

is('the expected-key list is exactly the register, in register order',
   JSON.stringify(expected) === JSON.stringify(registerKeys),
   `${expected.length} listed vs ${registerKeys.length} in the register`);

const wantWorkflow = new Map(crosswalk.keys.map((k) => [k.contractKey, k.applicationWorkflowId]));
const wrongWorkflow = registry.filter((r) => wantWorkflow.get(r.contractKey) !== r.applicationWorkflowId);
is('every record carries the application workflow id its own key expects', wrongWorkflow.length === 0,
   wrongWorkflow.map((r) => r.contractKey).join(', '));

const addressedByWorkflowId = registry.filter((r) => r.tenantFlowId
  && [...wantWorkflow.values()].includes(r.tenantFlowId));
is('no record addresses a flow by an application workflow id', addressedByWorkflowId.length === 0,
   'that is the execution identifier; the management API answers 404 for it');

/* Seven keys have two candidate flows. Losing one would silently halve the chance of resolving
   that key, and the run would report it "missing" with no sign that a candidate was dropped. */
const multi = crosswalk.keys.filter((k) => (k.candidates || []).length > 1);
const recordsFor = (key) => registry.filter((r) => r.contractKey === key);
is('every evidenced candidate gets a record, in crosswalk order',
   multi.length > 0 && crosswalk.keys.every((k) => {
     const mine = recordsFor(k.contractKey).filter((r) => r.evidence === 'crosswalk');
     return mine.length === (k.candidates || []).length
       && mine.every((r, i) => r.tenantFlowId === k.candidates[i].tenantFlowId);
   }),
   multi.map((k) => `${k.contractKey}: ${recordsFor(k.contractKey).length} record(s) for ${k.candidates.length} candidate(s)`).join(', '));

/* Two export packages name a flow the register does not, so the crosswalk leaves them unplaced.
   Here they are offered as extra candidates, which is only safe because every URL is verified
   against the register's workflow id before it is written — so a wrong probe yields a fact, not
   a credential. Two properties keep that true: a probe is never invented, and it never runs
   before the evidence. */
section('  PROBES — safe only because the answer is verified, so they must stay last');
const probes = registry.filter((r) => r.evidence === 'probe');
const unplacedIds = new Set((crosswalk.exports || [])
  .filter((e) => !(e.matchedContractKeys || []).length).map((e) => e.tenantFlowId));
is('every probe flow id comes from an unplaced export package, never invented',
   probes.length > 0 && probes.every((r) => unplacedIds.has(r.tenantFlowId)),
   probes.map((r) => `${r.flowName} ${r.tenantFlowId}`).join(', '));
is('a probe is tried only after every evidenced candidate for its key',
   probes.every((r) => {
     const mine = recordsFor(r.contractKey);
     const lastEvidenced = mine.map((x) => x.evidence).lastIndexOf('crosswalk');
     return mine.indexOf(r) > lastEvidenced;
   }),
   'a probe running first could resolve a key off a guess while the evidence sat untried');
is('a probe carries the workflow id its key expects, so a wrong one is rejected not written',
   probes.every((r) => wantWorkflow.get(r.contractKey) === r.applicationWorkflowId));
is('the rejection log says whether a rejected candidate was evidence or a probe',
   JSON.stringify(deep(nodeOf('Condition_Values_URL_Verifies'), 'else', 'actions',
     'Append_Endpoint_Values_Rejection', 'inputs', 'value') || {}).includes('evidence'));
/* The converse of the rule above, and the one that forces a decision: an unplaced package must
   be offered as a probe or the build fails. Silently ignoring one would leave evidence sitting
   in the repository doing nothing, which is exactly what happened to these two for a day. A
   future package with no plausible key SHOULD fail here — that is a person's call, as the
   crosswalk's refusal to place it already says. */
const unplacedPkgs = (crosswalk.exports || []).filter((e) => !(e.matchedContractKeys || []).length);
is('every unplaced export package is offered as a probe, not left sitting unused',
   unplacedPkgs.length > 0
   && unplacedPkgs.every((e) => probes.some((r) => r.tenantFlowId === e.tenantFlowId)),
   unplacedPkgs.filter((e) => !probes.some((r) => r.tenantFlowId === e.tenantFlowId))
     .map((e) => `${e.displayName} (${e.tenantFlowId}) is unplaced and unprobed — decide which key it serves, or say it serves none`)
     .join('\n       ') || `${unplacedPkgs.length} unplaced, ${probes.length} probed`);
section('  ADDRESSING, continued');

/* Stated as an invariant rather than against the current evidence. It used to require at least
   one unevidenced key, which was true until IP_Get_Docs_Endpoint was exported on 12 September
   and then made the assertion fail for the best possible reason. An assertion that inverts when
   the estate improves was measuring the estate, not the rule. */
const unevidenced = crosswalk.keys.filter((k) => !(k.candidates || []).length).map((k) => k.contractKey);
const orphanKeys = crosswalk.keys.filter((k) => !registry.some((r) => r.contractKey === k.contractKey));
const shapeBreaks = registry.filter((r) => (r.tenantFlowId === null) !== (r.evidence === 'none'));
is('every contract key gets a record, and one with no evidence is listed with a null flow id '
   + 'rather than dropped',
   orphanKeys.length === 0 && shapeBreaks.length === 0 && registry.length >= crosswalk.keys.length,
   `keys with no record: ${orphanKeys.map((k) => k.contractKey).join(', ') || 'none'}; `
   + `records whose null-ness and evidence disagree: ${shapeBreaks.map((r) => r.contractKey).join(', ') || 'none'}`
   + `\n       (currently ${unevidenced.length} unevidenced key(s) — a key dropped instead of `
   + `listed is reported as resolved-by-omission, which is the failure this catches)`);

section('  VERIFICATION — a candidate that answers is not a candidate that matches');
const cond = nodeOf('Condition_Values_URL_Verifies');
const clauses = JSON.stringify(cond.expression || {});
is('the URL must name the workflow id the register holds for that key',
   clauses.includes("Compose_Values_Observed_Workflow_Id") && clauses.includes("['applicationWorkflowId']"),
   clauses);
is('a URL with no signature is refused — it is not a credential',
   clauses.includes("'sig='"), clauses);
is('a key already resolved by another candidate is not written twice',
   clauses.includes("ValuesResolvedKeys"), clauses);
is('the matching branch writes KEY=URL and nothing else',
   deep(cond, 'actions', 'Append_Endpoint_Values_Line', 'inputs', 'value') === "@concat(@items('Apply_to_each_Endpoint_Values_Record')?['contractKey'],'=',outputs('Compose_Values_Callback_URL'))".replace('@items', "items"),
   String(deep(cond, 'actions', 'Append_Endpoint_Values_Line', 'inputs', 'value')));

section('  THE OUTPUT IS A CREDENTIAL — everything but the 200 must be safe to read');
const CARRIES_SECRET = /sig=[A-Za-z0-9_%-]{8,}|SharedAccessSignature|eyJ[A-Za-z0-9_-]{20}/;
is('the committed scope carries no credential of its own', !CARRIES_SECRET.test(raw));

const URL_OUTPUT = 'Compose_Values_Callback_URL';
const rejection = JSON.stringify(deep(cond, 'else', 'actions', 'Append_Endpoint_Values_Rejection', 'inputs', 'value') || {});
is('the rejection log records ids and statuses, never the URL',
   !/['"]@?outputs\('Compose_Values_Callback_URL'\)['"]/.test(rejection)
   && rejection.includes('observedApplicationWorkflowId'),
   rejection);

const incomplete = JSON.stringify(nodeOf('Response_Endpoint_Values_Incomplete').inputs || {});
is('the incomplete response returns no URL and no partial file',
   !incomplete.includes(URL_OUTPUT) && !incomplete.includes('ValuesLines')
   && !incomplete.includes('Compose_Endpoint_Values_File'),
   incomplete);
is('and it is a 409, not a 200 with a short file',
   deep(nodeOf('Response_Endpoint_Values_Incomplete'), 'inputs', 'statusCode') === 409);

const complete = nodeOf('Response_Endpoint_Values_Complete').inputs || { headers: {} };
is('the complete response is the file, as plain text',
   complete.statusCode === 200 && complete.body === "@outputs('Compose_Endpoint_Values_File')"
   && /text\/plain/.test(String(deep(complete, 'headers', 'Content-Type'))));

const file = String(nodeOf('Compose_Endpoint_Values_File').inputs || '');
is('the file joins its lines with a real newline, not a backslash and an n',
   file.includes("decodeUriComponent('%0A')") && !/\\n/.test(file),
   'a Logic Apps string literal cannot carry a newline, so \\n would emit two characters');
is('the file warns that every line is a bearer credential',
   file.includes('BEARER CREDENTIAL') && file.includes('revokes nothing'));

/* The first live run refused four keys and every refusal needed a round trip to explain. The
   sharpest was IP_SCAN_INTAKE: workflow id matched exactly, signature absent — because it is
   the estate's one tenant-authenticated trigger, whose callback URL carries no signature by
   design. A correct refusal with an incomprehensible reason is a defect in the report. */
section('  THE DIAGNOSIS — a refusal has to say which of four things happened');
{
  const known = registry.filter((r) => r.triggerAuthentication && r.triggerAuthentication !== 'Unknown');
  is('each record carries the authentication its trigger actually uses',
     known.length > 0 && known.every((r) => ['All', 'Tenant'].includes(r.triggerAuthentication)),
     `${known.length} of ${registry.length} records have a known authentication type`);

  /* The package's own definition is the authority: triggerAuthenticationType is read out of it
     directly, where the catalogue is a report of one. A record whose flow has a package must
     agree with that package. */
  const byFlow = new Map((crosswalk.exports || [])
    .filter((e) => e.requestTriggerAuthentication)
    .map((e) => [e.tenantFlowId, e.requestTriggerAuthentication]));
  const disagree = registry.filter((r) => byFlow.has(r.tenantFlowId)
    && r.triggerAuthentication !== byFlow.get(r.tenantFlowId));
  is('where an export package states the authentication, the record agrees with it',
     byFlow.size > 0 && disagree.length === 0,
     `${byFlow.size} flow(s) have a package; disagreeing: `
     + disagree.map((r) => `${r.flowName} record=${r.triggerAuthentication} package=${byFlow.get(r.tenantFlowId)}`).join(', '));
  const tenantAuth = registry.filter((r) => r.triggerAuthentication === 'Tenant');
  is('the tenant-authenticated trigger is marked as such, not left to be rediscovered',
     tenantAuth.length === 1 && tenantAuth[0].tenantFlowId === '5504d7f9-cc96-470c-be79-217582faf415',
     tenantAuth.map((r) => `${r.contractKey} ${r.tenantFlowId}`).join(', ') || 'none marked');

  const rejection = JSON.stringify(deep(nodeOf('Condition_Values_URL_Verifies'), 'else', 'actions',
    'Append_Endpoint_Values_Rejection', 'inputs', 'value') || {});
  is('the rejection carries a computed diagnosis, not just raw fields',
     rejection.includes('diagnosis'), rejection.slice(0, 160));
  for (const [what, marker] of [
    ['the call itself failed', 'THE_CALLBACK_CALL_ITSELF_FAILED'],
    ['the flow serves a different workflow', 'SERVES_A_DIFFERENT_WORKFLOW'],
    ['the URL is unsigned because the trigger is tenant-authenticated', 'CARRIES_NO_SIGNATURE'],
    ['another candidate already answered', 'RESOLVED_BY_ANOTHER_CANDIDATE'],
  ]) {
    is(`it distinguishes: ${what}`, rejection.includes(marker), marker + ' is not in the diagnosis');
  }
  is('and the unsigned case names the setting that fixes it',
     rejection.includes('Who can trigger the flow'),
     'an operator reading a 409 should not have to ask what to change');
  is('the diagnosis still carries no URL',
     !/outputs\('Compose_Values_Callback_URL'\)[^,]*,\s*$/.test(rejection)
     && !rejection.includes('"callbackUrl"'),
     'it reads the URL to test for sig=, which must not become printing it');
}

section('  THE BUILD STAMP — so a stale paste says so instead of looking unchanged');
{
  const build = deep(nodeOf('Response_Endpoint_Values_Incomplete'), 'inputs', 'body', 'scopeBuild');
  is('the 409 carries a build id', /^[0-9a-f]{12}$/.test(String(build)), String(build));
  is('the values file header carries the same one',
     String(nodeOf('Compose_Endpoint_Values_File').inputs || '').includes(`'${build}'`),
     'a file with no provenance cannot be told from one produced by an older scope');
  is('the build is not a constant someone can forget to change',
     String(build) !== '000000000000' && String(build).length === 12);
}

section('  THE CONNECTOR — only operations this tenant is known to answer');
const PROVEN = new Set(['ListCallbackUrl']);
const opIds = all.filter(({ node }) => node.type === 'OpenApiConnection')
  .map(({ name, node }) => ({ name, op: deep(node, 'inputs', 'host', 'operationId'), api: deep(node, 'inputs', 'host', 'apiId') }));
is('every connector call uses an operation observed working in this tenant',
   opIds.length > 0 && opIds.every((o) => PROVEN.has(o.op)),
   opIds.map((o) => `${o.name}: ${o.op}`).join(', ')
   + '\n       ListCallbackUrl is proven by the exporter; adding a guessed operationId is how the last two harvesters failed');
is('every connector call declares a connection the paste carries',
   opIds.every((o) => deep(paste.allConnectionData, o.name, 'connectionReference', 'api', 'id') === o.api),
   Object.keys(paste.allConnectionData).join(', '));
is('it uses the flowmanagement connection this estate already runs on',
   Object.values(paste.allConnectionData || {}).every((c) =>
     deep(c, 'connectionReference', 'connectionName') === 'shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2'
     && String(deep(c, 'connectionReference', 'connection', 'id'))
          .endsWith('shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2')),
   JSON.stringify(Object.values(paste.allConnectionData || {}).map((c) => deep(c, 'connectionReference', 'connectionName'))));

section('  THE LOOP — a parallel foreach that writes variables loses writes');
const loop = nodeOf('Apply_to_each_Endpoint_Values_Record');
is('the record loop is sequential',
   loop.operationOptions === 'Sequential' && deep(loop, 'runtimeConfiguration', 'concurrency', 'repetitions') === 1,
   `operationOptions=${loop.operationOptions}`);
const appends = all.filter(({ node }) => node.type === 'AppendToArrayVariable');
is('every variable append happens inside it', appends.length > 0
   && appends.every(({ node }) => JSON.stringify(loop).includes(JSON.stringify(node))),
   appends.map((a) => a.name).join(', '));
is('one record failing does not end the run',
   !!byName.get('Scope_Endpoint_Values_Record_Failed')
   && JSON.stringify(nodeOf('Scope_Endpoint_Values_Record_Failed').runAfter || {}).includes('Failed'),
   'without it, one unreachable flow abandons the other twenty-four');
is('the summary still runs when records failed',
   JSON.stringify(nodeOf('Filter_Missing_Contract_Keys').runAfter || {}).includes('Failed'));

/* Every variable the scope reads has to exist, and InitializeVariable is illegal inside a
   scope — so the operator adds them at the top level. Naming them wrong is a runtime failure
   on a flow that has already fetched twenty-five credentials. */
section('  VARIABLES — the scope cannot declare them, so the build note must');
const used = [...new Set([...raw.matchAll(/variables\('([^']+)'\)/g)].map((m) => m[1]))].sort();
const build = readFileSync(path.join(ROOT, 'docs/deployment/power-automate-flows/harvester/HARVEST-THE-VALUES-FILE.md'), 'utf8');
const undocumented = used.filter((v) => !build.includes(v));
is('every variable the scope reads is named in the build note', undocumented.length === 0,
   `used: ${used.join(', ')}\n       undocumented: ${undocumented.join(', ')}`);

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
