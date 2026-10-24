#!/usr/bin/env node
/**
 * The endpoint-inventory flow: does it save, does it count, and can it leak?
 *
 * WHY THIS SUITE EXISTS
 *
 * `docs/deployment/internal/flows/inventory/DGO_ENDPOINT_INVENTORY.designer-paste.json` is pasted
 * into the Power Automate designer by hand. Nothing between here and there reads it, so every
 * defect in it is discovered by an operator mid-visit, or — worse — by nobody, because the classes
 * of defect this flow is prone to are silent:
 *
 *   1. A REFERENCE TO AN ACTION THAT DOES NOT EXIST. The designer rejects the whole definition at
 *      save time with `InvalidTemplate ... are not defined in the template`. The version this
 *      package replaces named two such actions — `Get_Flow_Definition_1` and `Compose_1` — so it
 *      could not be saved at all. That is a loud failure, but only if someone tries; it costs a
 *      visit to the tenant to find out.
 *
 *   2. AN EXPRESSION THAT READS A PROPERTY THE CONNECTOR DOES NOT RETURN. `body('X')?['body']?[…]`
 *      evaluates to null rather than failing. Six fields — the flow's id, display name, resource
 *      id, state, created and last-modified times — were spelled that way and came back null on
 *      every record, in an inventory whose entire purpose is to report those fields. A report of
 *      nulls looks like an estate that answered, not like a report that never asked.
 *
 *   3. A RECORD COUNTED TWICE. See `Compose_Normalized_Callback_URL` below. Silent, and it makes
 *      the totals disagree with the record count in the direction that looks like more coverage.
 *
 *   4. A CREDENTIAL LEAVING THE RUN. `ListCallbackUrl` returns a signed trigger URL — a bearer
 *      credential. The tier addressed to a mailbox must not carry one, and "must not" is asserted
 *      here on the serialised package rather than field by field, because the guarantee people
 *      rely on is a property of the whole string.
 *
 * Every assertion below corresponds to a defect that was actually present, not to a category
 * invented to fill a suite.
 *
 * Usage:  node tests/inventory-flow.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DIR = 'docs/deployment/internal/flows/inventory';
const PACKAGE = `${DIR}/DGO_ENDPOINT_INVENTORY.designer-paste.json`;
const VARIABLES = `${DIR}/DGO_ENDPOINT_INVENTORY.variables.designer-paste.json`;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};

const pkg = read(PACKAGE);
const scope = pkg.operationDefinition;
const registry = scope.actions.Compose_Expanded_Flow_Registry.inputs;

/* Every action in the package, flattened, with the scope path that contains it. Conditions carry
   two branches and both hold actions; a walker that forgets `else` silently stops checking a
   third of the definition. */
const actions = new Map();
(function walk(map, at) {
  for (const [name, def] of Object.entries(map || {})) {
    actions.set(name, { at, def });
    walk(def.actions, [...at, name]);
    walk(def.else?.actions, [...at, `${name}/else`]);
  }
}(scope.actions, []));

/* Reads of another action's result, wherever they appear in an action's inputs, condition or
   foreach expression. */
const REFERENCE = /\b(actions|outputs|body|result)\('([^']+)'\)/g;
function referencesIn(def) {
  const out = [];
  (function scan(node) {
    if (typeof node === 'string') {
      for (const m of node.matchAll(REFERENCE)) out.push({ fn: m[1], target: m[2] });
    } else if (Array.isArray(node)) node.forEach(scan);
    else if (node && typeof node === 'object') Object.values(node).forEach(scan);
  }([def.inputs, def.expression, def.foreach]));
  return out;
}

/* ── 1. the designer will accept it ───────────────────────────────────────────────────── */

console.log('\nThe designer will accept it\n');

check('the clipboard envelope carries what the designer reads', () => {
  for (const field of ['id', 'brandColor', 'connectionReferences', 'connectorDisplayName', 'icon', 'isTrigger', 'operationName', 'operationDefinition']) {
    assert(field in pkg, `the envelope has no \`${field}\``);
  }
  assert.equal(pkg.isTrigger, false, 'the package declares itself a trigger');
  assert.equal(scope.type, 'Scope', 'the pasted operation is not a Scope');
});

check('every action reference names an action in the package', () => {
  const missing = [];
  for (const [name, { def }] of actions) {
    for (const { fn, target } of referencesIn(def)) {
      if (!actions.has(target)) missing.push(`${name} reads ${fn}('${target}')`);
    }
  }
  assert.equal(missing.length, 0,
    'the designer refuses the whole definition at save time when a reference names an action that '
    + `is not in it — InvalidTemplate:\n      ${missing.join('\n      ')}`);
});

check('every runAfter names a sibling', () => {
  const bad = [];
  (function walk(map, at) {
    const siblings = new Set(Object.keys(map || {}));
    for (const [name, def] of Object.entries(map || {})) {
      for (const dep of Object.keys(def.runAfter || {})) {
        if (!siblings.has(dep)) bad.push(`${[...at, name].join(' > ')} runAfter '${dep}'`);
      }
      walk(def.actions, [...at, name]);
      walk(def.else?.actions, [...at, `${name}/else`]);
    }
  }(scope.actions, []));
  assert.equal(bad.length, 0, `runAfter is resolved among siblings only:\n      ${bad.join('\n      ')}`);
});

check('the pasted scope depends on nothing outside itself', () => {
  assert.deepEqual(scope.runAfter, {},
    "the root scope's runAfter names an action the package does not carry. A clipboard package is "
    + 'pasted into a flow this repository cannot see; a dangling dependency there is a definition '
    + 'the designer will not save.');
});

check('every connector action binds to a declared connection', () => {
  const declared = new Set(Object.keys(pkg.connectionReferences));
  for (const [name, { def }] of actions) {
    if (def.type !== 'OpenApiConnection') continue;
    const conn = def.inputs?.host?.connectionName;
    assert(declared.has(conn), `${name} binds to '${conn}', which the envelope does not declare`);
    assert(def.inputs?.authentication?.value?.includes('X-MS-APIM-Tokens'),
      `${name} carries no connection authentication block`);
  }
});

check("result() is applied to a scope, never to a single action", () => {
  const SCOPE_TYPES = new Set(['Scope', 'Foreach', 'Until', 'Switch', 'If']);
  for (const [name, { def }] of actions) {
    for (const { fn, target } of referencesIn(def)) {
      if (fn !== 'result') continue;
      assert(SCOPE_TYPES.has(actions.get(target).def.type),
        `${name} calls result('${target}'), but that action is a ${actions.get(target).def.type}. `
        + "result() returns the results of the actions inside a scope; a single action's outcome is actions().");
    }
  }
});

/* ── 2. the six fields that came back null ────────────────────────────────────────────── */

console.log('\nThe expressions read what the connector returns\n');

check("no expression reads body('X')?['body'] — the spelling that returns null", () => {
  const bad = [];
  for (const [name, { def }] of actions) {
    (function scan(node, at) {
      if (typeof node === 'string') {
        if (/body\('[^']+'\)\?\['body'\]/.test(node)) bad.push(`${name}.${at.join('.')} = ${node}`);
      } else if (Array.isArray(node)) node.forEach((n, i) => scan(n, [...at, i]));
      else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) scan(v, [...at, k]);
    }(def.inputs, []));
  }
  assert.equal(bad.length, 0,
    "GetFlow's response body IS the flow object. `body('X')?['body']?[…]` addresses a property the "
    + `connector does not return and evaluates to null on every record:\n      ${bad.join('\n      ')}`);
});

check('the flow identity and lifecycle fields address the retrieved flow', () => {
  const v = actions.get('Append_Found_Flow').def.inputs.value;
  const expected = {
    'flowIdentity.id': "@body('Get_Flow_Definition')?['name']",
    'flowIdentity.displayName': "@body('Get_Flow_Definition')?['properties']?['displayName']",
    'flowIdentity.resourceId': "@body('Get_Flow_Definition')?['id']",
    'flowLifecycle.state': "@body('Get_Flow_Definition')?['properties']?['state']",
    'flowLifecycle.createdTime': "@body('Get_Flow_Definition')?['properties']?['createdTime']",
    'flowLifecycle.lastModifiedTime': "@body('Get_Flow_Definition')?['properties']?['lastModifiedTime']",
  };
  for (const [dotted, want] of Object.entries(expected)) {
    const [group, field] = dotted.split('.');
    assert.equal(v[group][field], want, `${dotted} reads ${v[group][field]}`);
  }
});

/* ── 3. one record, one outcome ───────────────────────────────────────────────────────── */

console.log('\nOne registry record produces exactly one outcome\n');

check('the found branch is skipped when the definition read fails', () => {
  const after = actions.get('Compose_Normalized_Callback_URL').def.runAfter;
  assert.deepEqual(after.Get_Flow_Definition, ['Succeeded'],
    'Compose_Normalized_Callback_URL must depend on Get_Flow_Definition succeeding.\n'
    + '      Without it: the definition read fails, both lookups are skipped, this composes anyway '
    + '(it accepts Skipped from them), Append_Found_Flow files the record as FOUND with a null '
    + 'identity — and the enclosing scope, carrying an unhandled failure, also fires '
    + 'Scope_Handle_Retrieval_Failure, which files the SAME record as NOT FOUND. Both counters '
    + 'increment, and foundCount + notFoundCount exceeds inputRecordCount.');
  for (const lookup of ['List_Flow_Owners', 'List_Callback_URL']) {
    assert.deepEqual(after[lookup], ['Succeeded', 'Failed', 'TimedOut', 'Skipped'],
      `${lookup} must remain optional — a flow whose definition was read but whose ${lookup} failed `
      + 'is a partial success worth recording.');
  }
});

check('the found path and the failure path each increment exactly one counter', () => {
  const increments = [...actions].filter(([, { def }]) => def.type === 'IncrementVariable');
  const byVar = {};
  for (const [name, { def }] of increments) (byVar[def.inputs.name] ||= []).push(name);
  assert.deepEqual(byVar.FlowsFoundCount, ['Increment_Found_Count'], 'FlowsFoundCount is incremented from more than one place');
  assert.deepEqual(byVar.FlowsNotFoundCount.sort(), ['Increment_Missing_ID_Count', 'Increment_Not_Found_Count'],
    'the not-found counter is incremented from an unexpected set of places');
});

check('the foreach is sequential, because its branches all append to shared variables', () => {
  const loop = actions.get('Apply_to_each_Flow').def;
  assert.equal(loop.operationOptions, 'Sequential',
    'concurrent iterations appending to one array variable lose writes, and the loss is silent');
});

check('the unique-workflow count is computed, not asserted', () => {
  for (const tier of ['Compose_Restricted_Extraction_Result', 'Compose_Redacted_Governance_Result']) {
    const v = actions.get(tier).def.inputs.uniqueApplicationWorkflowCount;
    assert.equal(typeof v, 'string', `${tier} states uniqueApplicationWorkflowCount as the literal ${v}. `
      + 'A literal is right on the day it is typed and goes on being reported after the register stops agreeing with it.');
    assert(v.includes('union('), `${tier} does not derive the distinct count from the registry`);
  }
});

/* ── 4. what may leave the run ────────────────────────────────────────────────────────── */

console.log('\nWhat may leave the run\n');

/* The fields whose values are, or contain, a signed callback URL. A redaction that omits any of
   them is not a redaction — `completeDefinition` and the raw action results carry the same URL
   the endpoint block does. */
const CREDENTIAL_BEARING = [
  'callbackUrl', 'completeDefinition', 'connectionReferences', 'ownerRecords',
  'completeOwnerActionResult', 'completeCallbackActionResult', 'completeFlowDefinitionActionResult',
];

check('the governance tier selects fields rather than reproducing its input', () => {
  const select = actions.get('Select_Redacted_Governance_Results').def.inputs.select;
  assert.equal(typeof select, 'object', 'the select is not a field map');
  /* The defect this replaces was `{ completeRecord: '@item()' }` — a map, and still the whole
     record verbatim. What makes a Select a redaction is that every value addresses a named path. */
  const passthrough = Object.entries(select).filter(([, v]) => /^@item\(\)\s*$/.test(String(v)));
  assert.equal(passthrough.length, 0,
    `${passthrough.map(([k]) => k).join(', ')} selects \`@item()\` — the whole record, verbatim. A `
    + 'Select that reproduces its input is not a redaction, and this is the tier that gets '
    + 'addressed to a mailbox.');
  const serialised = JSON.stringify(select);
  for (const field of CREDENTIAL_BEARING) {
    assert(!serialised.includes(field), `the governance tier reads ${field}, which carries or contains a signed URL`);
  }
});

check('the governance tier still answers the questions the inventory exists to answer', () => {
  const select = actions.get('Select_Redacted_Governance_Results').def.inputs.select;
  for (const field of ['state', 'lastModifiedTime', 'ownerCount', 'endpointAvailable', 'triggerFound',
    'observedHttpMethod', 'expectedHttpMethod', 'signatureLength', 'redactedCallbackUrl', 'applicationWorkflowId']) {
    assert(field in select, `the governance tier drops \`${field}\`, which is not a credential and is the point of the run`);
  }
});

check('a redacted callback URL ends at the marker the register uses', () => {
  const expr = actions.get('Compose_Redacted_Callback_URL').def.inputs;
  assert(expr.includes("'sig=<CREDENTIAL_REMOVED>'"),
    'the redaction does not use the marker docs/reference/endpoint-register.json declares');
  assert(expr.includes("first(split("), 'the redaction keeps text after `sig=` rather than cutting at it');
});

check('the signature is reported by length and never by value', () => {
  const expr = actions.get('Compose_Signature_Length').def.inputs;
  assert(expr.startsWith('@if(contains(') && expr.includes('length('),
    'Compose_Signature_Length does not compute a length');
  const select = actions.get('Select_Redacted_Governance_Results').def.inputs.select;
  assert.equal(select.signatureLength, "@item()?['endpoint']?['signatureLength']",
    'the governance tier does not carry the signature length');
});

check('the email attaches the governance tier, not the restricted one', () => {
  const attach = actions.get('Compose_Governance_Attachment').def;
  const targets = referencesIn(attach).map((r) => r.target);
  assert(targets.includes('Compose_Redacted_Governance_Result'),
    'the attachment does not read the governance tier');
  assert(!targets.includes('Compose_Restricted_Extraction_Result'),
    'the attachment reads the restricted tier, which carries every signed callback URL retrieved');

  const mail = actions.get('Send_Governance_Report_Email').def;
  assert(!JSON.stringify(mail.inputs).includes('Compose_Restricted_Extraction_Result'),
    'the mail action reads the restricted tier');
});

check('the restricted tier is read by nothing that sends, writes, or responds', () => {
  const EGRESS = new Set(['OpenApiConnection', 'Http', 'Response', 'ApiConnection', 'ApiConnectionWebhook']);
  for (const [name, { def }] of actions) {
    if (!EGRESS.has(def.type)) continue;
    for (const { target } of referencesIn(def)) {
      assert.notEqual(target, 'Compose_Restricted_Extraction_Result',
        `${name} is an egress action and it reads the restricted tier`);
    }
  }
});

check('the attachment is base64, and named the way the filename policy requires', () => {
  const [attachment] = actions.get('Compose_Governance_Attachment').def.inputs;
  assert(attachment.ContentBytes.startsWith('@base64('),
    'ContentBytes is not base64 — the Office 365 connector encodes an attachment that way, and the '
    + 'definition this replaces passed the raw output of an action that did not exist');
  assert(/\.json'\)}?$/.test(attachment.Name) || attachment.Name.includes(".json'"),
    'the attachment holds JSON and is not named .json');
  /* config/filename-policy.config.js: lowercase, underscore-separated, optional terminal ISO date. */
  assert(/endpoint_inventory_governance_/.test(attachment.Name),
    'the attachment name does not follow the agency filename policy');
});

check('no signature appears anywhere in the package', () => {
  assert(!/sig=[A-Za-z0-9_-]{20,}/.test(raw(PACKAGE)), 'the package carries a signature');
  assert(!/sig=[A-Za-z0-9_-]{20,}/.test(raw(VARIABLES)), 'the variables package carries a signature');
});

/* ── 5. the registry cannot drift from the register ───────────────────────────────────── */

console.log('\nThe registry cannot drift from the register that governs the estate\n');

const ids = read('docs/reference/endpoint-workflow-ids.json');
const authority = new Map();
for (const surface of ['internal', 'portal']) {
  for (const [key, v] of Object.entries(ids[surface] || {})) authority.set(key, { ...v, surface });
}

check('every contract key in the register appears in the registry, and none other', () => {
  const covered = new Set(registry.flatMap((r) => r.contractKeys));
  const missing = [...authority.keys()].filter((k) => !covered.has(k));
  const extra = [...covered].filter((k) => !authority.has(k));
  assert.equal(missing.length, 0, `the inventory would not look up: ${missing.join(', ')}`);
  assert.equal(extra.length, 0, `the registry names keys the register does not: ${extra.join(', ')}`);
  assert.equal(covered.size, authority.size, `${covered.size} keys covered, ${authority.size} in the register`);
});

check('every record agrees with the register on workflow, category, method and flow name', () => {
  for (const rec of registry) {
    for (const key of rec.contractKeys) {
      const a = authority.get(key);
      assert.equal(rec.applicationWorkflowId, a.workflowId, `${rec.registryRecordId}/${key}: workflow id`);
      assert.equal(rec.category, a.category, `${rec.registryRecordId}/${key}: category`);
      assert.equal(rec.httpMethod, a.method, `${rec.registryRecordId}/${key}: method`);
      assert.equal(rec.canonicalFlowName, a.flow, `${rec.registryRecordId}/${key}: canonical flow name`);
    }
  }
});

check('a workflow with no evidenced flow GUID is recorded, not omitted', () => {
  const unevidenced = registry.filter((r) => !r.powerAutomateFlowId);
  assert(unevidenced.length > 0, 'no record carries an absence — check this against the candidates file');
  for (const r of unevidenced) {
    assert.equal(r.mappingType, 'NOT_EVIDENCED', `${r.registryRecordId} has no GUID but claims ${r.mappingType}`);
    assert.equal(r.endpointStatus, 'POWER_AUTOMATE_FLOW_ID_NOT_EVIDENCED', `${r.registryRecordId} misstates its status`);
  }
  /* An absence must be visible in the flow's own output too, not just in this file. */
  const missing = actions.get('Append_Missing_ID_Record').def.inputs.value;
  assert.equal(missing.status, 'POWER_AUTOMATE_FLOW_ID_NOT_EVIDENCED_OR_INVALID', 'the flow files an absence under an unexpected status');
});

check('record ids and candidate counts are internally consistent', () => {
  const seen = new Map();
  registry.forEach((r, i) => {
    assert.equal(r.registryRecordId, `REG-${String(i + 1).padStart(4, '0')}`, `record ${i} is out of sequence`);
    (seen.get(r.applicationWorkflowId) ?? seen.set(r.applicationWorkflowId, []).get(r.applicationWorkflowId)).push(r);
  });
  for (const [wf, rows] of seen) {
    for (const r of rows) {
      assert.equal(r.candidateCount, rows.length, `${wf}: ${r.registryRecordId} claims ${r.candidateCount} candidates, there are ${rows.length}`);
      assert.equal(r.registrySequence, rows[0].registrySequence, `${wf}: candidates disagree on registrySequence`);
    }
    assert.deepEqual(rows.map((r) => r.candidateSequence), rows.map((_, i) => i + 1), `${wf}: candidateSequence is not 1..n`);
  }
});

check('the committed package is what a rebuild produces', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-inventory-flow.mjs'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `the generated artefacts have drifted from their sources:\n${r.stderr || r.stdout}`);
});

/* ── 6. the variables the scope cannot run without ────────────────────────────────────── */

console.log('\nThe variables the scope cannot run without\n');

check('the variables package initialises exactly the variables the scope uses', () => {
  const used = new Set();
  (function scan(node) {
    if (typeof node === 'string') for (const m of node.matchAll(/variables\('([^']+)'\)/g)) used.add(m[1]);
    else if (Array.isArray(node)) node.forEach(scan);
    else if (node && typeof node === 'object') Object.values(node).forEach(scan);
  }(scope));
  for (const [, { def }] of actions) {
    if (['AppendToArrayVariable', 'IncrementVariable', 'SetVariable'].includes(def.type)) used.add(def.inputs.name);
  }

  const vars = read(VARIABLES).serializedValue.actions;
  const initialised = new Set(Object.values(vars).flatMap((a) => a.inputs.variables.map((v) => v.name)));
  assert.deepEqual([...initialised].sort(), [...used].sort(),
    "a variable the scope reads but nothing initialises fails at run time with `The variable 'name' "
    + 'is not defined`, and one initialised but unused is a claim about the flow that is not true');
});

check('no Initialize variable travels inside the scope package', () => {
  for (const [name, { def }] of actions) {
    assert.notEqual(def.type, 'InitializeVariable',
      `${name} initialises a variable inside the scope. Power Automate accepts Initialize variable `
      + 'only at the top level of a workflow; the designer will not save this.');
  }
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
