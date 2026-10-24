#!/usr/bin/env node
/**
 * Derive the flow request-shape catalogue the Admin Suite reads.
 *
 *   npm run flowshapes              # regenerate config/flow-shapes.data.js
 *   npm run flowshapes -- --check   # fail if the generated file has drifted (CI)
 *
 * WHY A GENERATED MODULE AND NOT A FETCH
 *
 * Same reason as `config/endpoint-atlas.data.js`: this platform has no build step and is
 * sometimes opened from `file://`, where fetching a sibling JSON is blocked outright. A module
 * the browser can `import` is the only shape that works in every context the platform ships to.
 *
 * WHAT IT DERIVES, AND FROM WHAT
 *
 * `docs/reference/flow-contracts/deployed/*.json` are exports of the tenant's own workflows,
 * produced by `scripts/export-power-automate-flows.ps1`. Each carries the complete Logic App
 * definition. Four things in there are what an administrator actually needs and cannot get
 * anywhere else:
 *
 *   1. The HTTP trigger's JSON Schema — the exact request shape the flow will accept. Without
 *      it, "compose a request for this flow" is guesswork, and the characteristic failure is a
 *      payload that is well-formed JSON, passes every client check, and is rejected by the flow
 *      for a field nobody knew was required.
 *   2. The response actions — the status code, headers and body each flow returns, so a caller
 *      can tell a flow that answered from a proxy that answered instead of it.
 *   3. The mail actions — every flow that sends email, and to whom. An operator running a probe
 *      against a flow needs to know before pressing the button whether it emails a Director.
 *   4. The connectors each flow binds. A flow whose SharePoint connection is broken fails in a
 *      way that looks like the endpoint being wrong.
 *
 * WHAT IT DELIBERATELY DOES NOT DERIVE
 *
 * The flat `$.a.b[].c` field records the suite renders forms and Inspect tables from are NOT
 * written here. `core/flow-shapes.js` computes them from the schema at read time, because the
 * schema is the same declaration the flow itself enforces: writing a second, pre-flattened
 * description of it into this file would create two records of one fact, and the one that goes
 * stale is always the derived one. The cost is a walk over 65 schemas on first read; the
 * benefit is that a field record cannot disagree with the schema it came from.
 *
 * ACTION STORAGE. The action inventory is stored as tuples with a parent pointer rather than
 * objects with a full `/actions/a/actions/b` path on each row. Written out, those paths are
 * two thirds of this file and every one of them is its parent's path plus a name that is
 * already on the row. `core/flow-shapes.js` rebuilds the path; nothing is lost and the file
 * is less than half the size.
 *
 * NO SIGNATURE MAY EVER APPEAR HERE. The definitions come from the tenant and this output is
 * committed. Every string is scanned before it is written, and the script exits non-zero if one
 * is found — deleting a committed credential does not revoke it, so the only safe posture is to
 * never write one.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const OUT = path.join(ROOT, 'config/flow-shapes.data.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/* A signature is 43 base64url characters. Anything at least 20 long after `sig=` is a
   credential or close enough to one that it must not be written to a committed file. */
const SIGNATURE = /sig=[A-Za-z0-9_-]{20,}/;

/* ------------------------------------------------------------------ *
 * Definition walking
 * ------------------------------------------------------------------ */

const connectorOf = (action) => {
  const host = action?.inputs?.host;
  if (!host || typeof host !== 'object') return '';
  const api = host.apiId || host.connectionName || '';
  return String(api).split('/').pop() || '';
};

const MAIL_OPERATIONS = /^(SendEmailV2|SendEmail|SendApprovalMail|SendMailWithOptions|SendEmailWithOptions|Mail)$/i;

/**
 * Every action in the definition, depth-first, with the index of the action that contains it.
 *
 * `parent` is an index into the same flat list, or -1 at the root. That is what lets the path
 * be rebuilt on read instead of stored on every row; `segment` carries the branch a nested
 * action sits under (`else`, `default`, `cases/Approve`) so a Response inside an error path is
 * addressable and not merged with the success one.
 */
function walkActions(actions, parent, segment, sink) {
  if (!actions || typeof actions !== 'object') return;
  for (const [name, action] of Object.entries(actions)) {
    if (!action || typeof action !== 'object') continue;
    const index = sink(name, action, parent, segment);
    walkActions(action.actions, index, '', sink);
    /* Conditions and switches nest their branches one level deeper than `actions`, and a
       Response inside an `else` is still the flow's answer. Missing those made earlier
       inventories under-report response actions on exactly the flows that have error paths. */
    for (const branch of ['else', 'default']) {
      if (action[branch]?.actions) walkActions(action[branch].actions, index, branch, sink);
    }
    for (const [caseName, body] of Object.entries(action.cases || {})) {
      if (body?.actions) walkActions(body.actions, index, `cases/${caseName}`, sink);
    }
  }
}

/** A short, readable rendering of a Logic App expression or literal for a table cell. */
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 397)}…` : s;
};

function describeFlow(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const doc = JSON.parse(raw);
  const definition = doc.definition || {};
  const identity = doc.workflow_identity || {};

  const triggers = [];
  for (const [name, trigger] of Object.entries(definition.triggers || {})) {
    if (!trigger || typeof trigger !== 'object') continue;
    const schema = trigger.inputs?.schema || null;
    triggers.push({
      name,
      type: String(trigger.type || ''),
      kind: String(trigger.kind || ''),
      method: String(trigger.inputs?.method || (trigger.kind === 'Http' ? 'POST' : '')),
      /* `Http` triggers with no `authentication` inherit Power Automate's default, which is
         "anyone with the URL". Recording it as the empty string and letting a reader assume
         it means "secured" is how this estate ended up with anonymous endpoints nobody had
         decided to publish. It is reported as the literal `All` the platform applies. */
      authentication: String(trigger.inputs?.authentication ?? (trigger.kind === 'Http' ? 'All' : '')),
      allowsAdditionalProperties: schema ? schema.additionalProperties !== false : null,
      relativePath: String(trigger.inputs?.relativePath || ''),
      schema,
    });
  }

  /* Tuples, in the order core/flow-shapes.js unpacks them:
     [ name, type, operationId, connector, parentIndex, branchSegment ] */
  const actions = [];
  const responses = [];
  const mail = [];
  const connectors = new Set();

  walkActions(definition.actions, -1, '', (name, action, parent, segment) => {
    const connector = connectorOf(action);
    if (connector) connectors.add(connector);
    const operationId = String(action?.inputs?.host?.operationId || '');
    const index = actions.push([name, String(action.type || ''), operationId, connector, parent, segment]) - 1;

    if (action.type === 'Response') {
      responses.push({
        action: index,
        statusCode: cell(action.inputs?.statusCode),
        headers: cell(action.inputs?.headers),
        body: cell(action.inputs?.body),
      });
    }
    if (MAIL_OPERATIONS.test(operationId)) {
      const p = action.inputs?.parameters || {};
      mail.push({
        action: index,
        to: cell(p['emailMessage/To'] ?? p.To ?? p['Message/To']),
        cc: cell(p['emailMessage/Cc'] ?? p.Cc ?? ''),
        bcc: cell(p['emailMessage/Bcc'] ?? p.Bcc ?? ''),
        subject: cell(p['emailMessage/Subject'] ?? p.Subject ?? p['Message/Subject']),
        importance: cell(p['emailMessage/Importance'] ?? p.Importance ?? ''),
      });
    }
    return index;
  });

  const httpTrigger = triggers.find((t) => t.kind === 'Http' && t.type === 'Request');

  return {
    name: path.basename(file).split('__')[0].trim(),
    workflowId: String(identity.internal_name || '').replace(/-/g, '').toLowerCase(),
    displayName: String(identity.tags?.flowDisplayName || ''),
    environmentName: String(identity.tags?.environmentName || ''),
    sourcePath: rel(file),
    sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
    sourceBytes: Buffer.byteLength(raw),
    exportedAtUtc: String(doc.exportedAtUtc || ''),
    exportedBy: String(doc.exportedBy || ''),
    callable: Boolean(httpTrigger),
    triggers,
    actionCount: actions.length,
    actions,
    responses,
    mailActions: mail,
    connectors: [...connectors].sort(),
  };
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

if (!fs.existsSync(SOURCE_DIR)) fail(`${rel(SOURCE_DIR)} is missing — it is the authority for every shape below.`);

const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => path.join(SOURCE_DIR, f));
if (!files.length) fail(`${rel(SOURCE_DIR)} holds no flow definitions.`);

const flows = files.map(describeFlow);

/* Two flows exported from the same workflow is not a merge problem to solve quietly: it means
   the export ran twice against a renamed flow, and picking one silently would hide which. */
const byId = new Map();
for (const f of flows) {
  if (!f.workflowId) continue;
  if (byId.has(f.workflowId)) byId.get(f.workflowId).push(f.name);
  else byId.set(f.workflowId, [f.name]);
}
const duplicates = [...byId.entries()].filter(([, names]) => names.length > 1);

/* The addressable-field count, for the report line and for the totals the suite shows. It
   counts the same nodes core/flow-shapes.js will produce at read time; a mismatch between the
   two is what tests/flow-shapes.test.mjs asserts against, so the count cannot quietly become a
   different measure from the records it describes. */
function countFields(schema) {
  if (!schema || typeof schema !== 'object') return 0;
  let n = 0;
  for (const child of Object.values(schema.properties || {})) n += 1 + countFields(child);
  if (schema.items) n += 1 + countFields(schema.items);
  return n;
}

const totals = {
  flows: flows.length,
  callable: flows.filter((f) => f.callable).length,
  triggerFields: flows.reduce((n, f) => n + f.triggers.reduce((m, t) => m + countFields(t.schema), 0), 0),
  actions: flows.reduce((n, f) => n + f.actionCount, 0),
  responseActions: flows.reduce((n, f) => n + f.responses.length, 0),
  mailActions: flows.reduce((n, f) => n + f.mailActions.length, 0),
  connectors: [...new Set(flows.flatMap((f) => f.connectors))].sort(),
  anonymousHttpTriggers: flows.filter((f) => f.triggers.some((t) => t.kind === 'Http' && t.authentication === 'All')).length,
};

const payload = {
  schema: 'dgo-flow-shapes/v1',
  generatedBy: 'scripts/build-flow-shapes.mjs',
  authority: {
    directory: rel(SOURCE_DIR),
    note: 'Derived from the tenant\'s own workflow exports. Where this and any hand-written '
      + 'description of a request shape disagree, the export is correct — it is what the flow '
      + 'will actually accept.',
  },
  totals,
  duplicateWorkflowIds: duplicates.map(([workflowId, names]) => ({ workflowId, names })),
  flows,
};

/* The header is indented so it can be read; the flow bodies are not, because they are machine
   output nobody reviews line by line and indenting 3,439 action tuples triples the file for no
   reader's benefit. One flow per line keeps a `git diff` legible: a changed flow is one changed
   line naming itself. */
const serialised = [
  '{',
  ...Object.entries(payload).filter(([k]) => k !== 'flows')
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split('\n').join('\n  ')},`),
  '  "flows": [',
  ...payload.flows.map((f, i) => `    ${JSON.stringify(f)}${i === payload.flows.length - 1 ? '' : ','}`),
  '  ]',
  '}',
].join('\n');

const leaked = serialised.match(new RegExp(SIGNATURE.source, 'g')) || [];
if (leaked.length) {
  fail(`${leaked.length} signature(s) would be written to ${rel(OUT)}. Rotate the trigger in `
    + 'Power Automate and re-export the definition; deleting the file revokes nothing.');
}

const file = `/**
 * GENERATED — do not edit. Produced by \`npm run flowshapes\` from
 * ${rel(SOURCE_DIR)}.
 *
 * The request shape of every workflow this tenant has exported: ${totals.flows} flows,
 * ${totals.callable} HTTP-callable, ${totals.triggerFields} trigger field records,
 * ${totals.actions} actions, ${totals.responseActions} response actions and
 * ${totals.mailActions} mail actions.
 *
 * Imported by core/flow-shapes.js, which has no other way to read the definitions — the
 * platform has no build step and is sometimes opened from file://, where fetching a sibling
 * JSON is blocked.
 *
 * NO SIGNATURE IS PRESENT OR MAY EVER BE. scripts/build-flow-shapes.mjs refuses to write one
 * and tests/flow-shapes.test.mjs fails if that stops being true.
 */
export const FlowShapes = Object.freeze(${serialised});
export default FlowShapes;
`;

if (CHECK) {
  if (!fs.existsSync(OUT)) fail(`${rel(OUT)} is missing. Run: npm run flowshapes`);
  if (fs.readFileSync(OUT, 'utf8') !== file) {
    fail(`${rel(OUT)} has drifted from ${rel(SOURCE_DIR)}. Run: npm run flowshapes`);
  }
  console.log(`  ✓  ${rel(OUT)} matches ${totals.flows} flow definition(s).`);
  process.exit(0);
}

fs.writeFileSync(OUT, file);
console.log(`\n  Wrote ${rel(OUT)}\n`);
console.log(`    flows             ${totals.flows} (${totals.callable} HTTP-callable)`);
console.log(`    trigger fields    ${totals.triggerFields}`);
console.log(`    actions           ${totals.actions}`);
console.log(`    response actions  ${totals.responseActions}`);
console.log(`    mail actions      ${totals.mailActions}`);
console.log(`    connectors        ${totals.connectors.join(', ')}`);
if (totals.anonymousHttpTriggers) {
  console.log(`\n    ${totals.anonymousHttpTriggers} HTTP trigger(s) accept authentication "All" —`);
  console.log('    anyone holding the URL may call them. The Admin Suite reports this per flow.');
}
if (duplicates.length) {
  console.log(`\n    ${duplicates.length} workflow id(s) exported more than once:`);
  duplicates.forEach(([id, names]) => console.log(`      ${id}  ${names.join(', ')}`));
}
console.log('');
