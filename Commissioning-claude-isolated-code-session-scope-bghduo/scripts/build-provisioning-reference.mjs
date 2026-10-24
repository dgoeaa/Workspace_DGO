#!/usr/bin/env node
/**
 * The provisioning reference: what every flow and every endpoint is ACTUALLY configured with.
 *
 * WHY THIS EXISTS
 * `docs/reference/FLOW_CATALOGUE.md` answers "what is this flow and what does it touch" — a
 * page per flow with its trigger, its request properties, its lists and its action tree. That
 * is a catalogue, and a catalogue is not a provisioning record. It does not print the
 * configured value of a single action input, the status code and headers a Response returns,
 * the initial value of a variable, the connection each connector call is bound to, the retry
 * policy on a call, or which actions run on failure rather than success. Those are the things
 * an operator needs when the question is "what is deployed", and until now the only way to
 * answer them was to open a 1,300-line export and read it.
 *
 * WHAT IS IN HERE, AND FROM WHERE
 * Everything is read out of the packages in this repository. Every value printed is the value
 * the package carries, rendered verbatim. Nothing is defaulted, inferred, normalised, or
 * carried across from a sibling flow: where a package does not declare a thing, the page says
 * it is not declared. That distinction is the whole point — "the export says All" and "the
 * export does not say" are different facts about a flow's authentication posture, and only
 * one of them is a posture.
 *
 * The packages are not equivalent and are never mixed:
 *   docs/reference/flow-contracts/deployed/   the live tenant, exported by
 *                                             scripts/export-power-automate-flows.ps1. This is
 *                                             the provisioned state and it is Part 2.
 *   docs/deployment/power-automate-flows/     DESIGNS. Their own README says "They are not
 *                                             what is deployed." Part 3, labelled as such.
 *   any designer-paste/ directory           clipboard scopes — fragments of a flow, with no
 *                                             trigger and no identity. Part 3, labelled.
 *
 * CREDENTIALS
 * A SAS-signed trigger URL is a bearer credential and no page here may become the first place
 * one is written down. No package in the tree carries one today; every string rendered still
 * passes through the redactor, and a package that does carry one is reported by name.
 *
 * Usage:
 *   node scripts/build-provisioning-reference.mjs           write the reference
 *   node scripts/build-provisioning-reference.mjs --check   fail if it has drifted
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemaRows, connectorOf, redact, redactDeep, FAMILY } from './lib/provisioning-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';
import { buildProvisioningModel, slug } from './lib/provisioning-model.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const OUT_DIR = 'docs/reference/provisioning';
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const repoPath = (abs) => relative(ROOT, abs).split(sep).join('/');

/* ── the model ────────────────────────────────────────────────────────────────────────
   Every package read once and joined to the registers once, in
   `scripts/lib/provisioning-model.mjs`. It lives there rather than here because the
   interface in `build-provisioning-console.mjs` renders the same analysis: two readers
   would put this reference and that interface one register-change apart, and the
   difference would reach a reader as two answers to the same question. */
const {
  register, wiring, standard, portalIds, internalIds, EndpointContracts,
  listsByGuid, keysByFile, wiringByEndpoint, portalByInternalName,
  packages, signatureCarriers, excludedCounts, EXCLUDED,
} = await buildProvisioningModel();


/* ── markdown helpers ────────────────────────────────────────────────────────────────── */

/* A pipe or a newline inside a cell ends the cell, and a value that contains one is exactly
   the kind of value worth documenting — an expression, a body template, a header list. They
   are escaped rather than dropped, so what is printed stays the value that is configured.
   A backtick is not escapable inside a code span, so the span is fenced with one more
   backtick than the longest run in the value — the alternative, substituting the character,
   would print a value the platform does not hold. */
const code = (raw) => {
  const s = redact(String(raw)).replace(/\|/g, '\\|').replace(/\r?\n/g, '↵');
  const longest = (s.match(/`+/g) || []).reduce((n, r) => Math.max(n, r.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${s}${pad}${fence}`;
};
const cell = (v) => {
  if (v === undefined) return '_not declared_';
  if (v === null) return '`null`';
  if (v === '') return '`""` (empty string)';
  return code(typeof v === 'string' ? v : JSON.stringify(v));
};
const plain = (v) => (v === undefined || v === null ? '—' : String(redact(String(v))).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '));

/* A configured value can be a forty-kilobyte HTML template or a page-long expression. Printing
   one inside a table cell destroys the table without making the value readable, so beyond this
   length the cell states the size and points at §13, where that same action's inputs are
   printed verbatim on this page. Nothing is lost and nothing is summarised — the reader is
   told where the value is, not what it says. */
const INLINE_LIMIT = 300;
const short = (v, path) => {
  if (v === undefined) return '_not declared_';
  if (v === null || v === '') return cell(v);
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s.length > INLINE_LIMIT) return `_${s.length} characters — printed verbatim in §13 under_ ${code(path)}`;
  return cell(v);
};

const table = (out, headers, rows) => {
  if (!rows.length) return;
  out.push(`| ${headers.join(' | ')} |`);
  out.push(`|${headers.map(() => '---').join('|')}|`);
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  out.push('');
};

/* Verbatim, and pretty-printed. A configured value is documented by printing it, not by
   describing it — the whole complaint this reference answers is that the values were only
   ever available by opening the export. */
const jsonBlock = (out, value, label) => {
  if (label) { out.push(`${label}`); out.push(''); }
  out.push('```json');
  out.push(JSON.stringify(redactDeep(value), null, 2));
  out.push('```');
  out.push('');
};

const isEmpty = (v) => v === undefined || v === null
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  || (Array.isArray(v) && v.length === 0);



/* ── per-flow page ───────────────────────────────────────────────────────────────────── */

function responseActions(pkg) { return pkg.actions.filter((a) => a.type === 'Response'); }
function terminateActions(pkg) { return pkg.actions.filter((a) => a.type === 'Terminate'); }

function variableWrites(pkg) {
  const rows = [];
  for (const a of pkg.actions) {
    if (a.type === 'InitializeVariable') {
      for (const v of a.inputs?.variables || []) {
        rows.push({
          op: 'Initialize', path: a.path, variable: v?.name ?? null, vtype: v?.type ?? null,
          value: Object.prototype.hasOwnProperty.call(v || {}, 'value') ? v.value : undefined,
        });
      }
    } else if (['SetVariable', 'AppendToStringVariable', 'AppendToArrayVariable', 'IncrementVariable', 'DecrementVariable'].includes(a.type)) {
      rows.push({
        op: a.type, path: a.path, variable: a.inputs?.name ?? null, vtype: null,
        value: Object.prototype.hasOwnProperty.call(a.inputs || {}, 'value') ? a.inputs.value : undefined,
      });
    }
  }
  return rows;
}

function sharePointRows(pkg) {
  const rows = [];
  for (const a of pkg.actions) {
    const c = connectorOf(a);
    const hostText = `${c?.apiId || ''} ${c?.connectionName || ''} ${c?.connectionReferenceName || ''}`;
    if (!/sharepointonline/i.test(hostText)) continue;
    const p = a.inputs?.parameters || {};
    const tbl = p.table ?? p['table'] ?? null;
    const hit = typeof tbl === 'string' ? listsByGuid.get(tbl.toLowerCase()) : null;
    rows.push({
      path: a.path, operationId: c?.operationId ?? null, connection: c?.connectionName ?? null,
      dataset: p.dataset ?? null, table: tbl,
      resolved: hit ? `${hit.title} — ${hit.site}` : null,
      params: p,
    });
  }
  return rows;
}

function httpRows(pkg) {
  return pkg.actions.filter((a) => a.type === 'Http' || a.type === 'HttpWebhook').map((a) => ({
    path: a.path, method: a.inputs?.method ?? null, uri: a.inputs?.uri ?? null,
    headers: a.inputs?.headers ?? null, queries: a.inputs?.queries ?? null,
    body: Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body') ? a.inputs.body : undefined,
    authentication: a.inputs?.authentication ?? null,
    retryPolicy: a.runtimeConfiguration?.retryPolicy ?? null,
  }));
}

function renderFlowPage(pkg) {
  const out = [];
  const title = pkg.displayName || pkg.file.split('/').pop();
  out.push(`# ${title}`);
  out.push('');
  out.push(`> **${FAMILY[pkg.family]}.** Every value below is read from`);
  out.push(`> [\`${pkg.file}\`](${relative(dirname(join(ROOT, pkg.page)), join(ROOT, pkg.file)).split(sep).join('/')}) and printed as that package carries it.`);
  out.push('> Generated by `scripts/build-provisioning-reference.mjs` — do not edit by hand.');
  out.push('');

  /* identity */
  out.push('## 1. Identity');
  out.push('');
  const idRows = [
    ['Display name', cell(pkg.displayName)],
    ['Internal name', cell(pkg.internalName)],
    ...(pkg.nodeId ? [['Clipboard `nodeId`', cell(pkg.nodeId)]] : []),
    ['Workflow id', pkg.workflowId ? cell(pkg.workflowId) : '_not carried by this package_'],
    ['Environment', cell(pkg.environmentName)],
    ['Full resource id', pkg.fullResourceId === null ? '`null` — the export records the field and leaves it null' : cell(pkg.fullResourceId)],
    ['Estate', `${pkg.portal ? 'Document portal — reachable by anonymous callers' : 'Internal platform'} — ${pkg.estateBasis}`],
    ['Package family', FAMILY[pkg.family]],
    ['Exported at (UTC)', cell(pkg.exportedAtUtc)],
    ['Exported by', cell(pkg.exportedBy)],
    ['Source package', `\`${pkg.file}\``],
  ];
  table(out, ['Field', 'As provisioned'], idRows.map(([a, b]) => [a, b]));

  const attributed = keysByFile.get(pkg.file) || [];
  if (attributed.length) {
    out.push('**Endpoint contract keys attributed to this flow** by');
    out.push('`docs/reference/internal-flow-register.json`:');
    out.push('');
    table(out, ['Contract key', 'Physical flow', 'Fixed action', 'Workflow id'],
      attributed.map((c) => [cell(c.key), cell(c.physicalFlow), cell(c.fixedAction), cell(c.workflowId)]));
  }
  const portalRow = pkg.internalName ? portalByInternalName.get(pkg.internalName) : null;
  if (portalRow) {
    out.push('**Portal endpoint** this workflow answers, per `docs/reference/portal-endpoint-workflow-ids.json`:');
    out.push('');
    table(out, ['Endpoint key', 'Endpoint flow name', 'Workflow id', 'Note'],
      [[cell(portalRow.key), cell(portalRow.flow), portalRow.workflowId ? cell(portalRow.workflowId) : '_unresolved in that register_', plain(portalRow.note)]]);
  }

  /* envelope */
  out.push('## 2. Definition envelope');
  out.push('');
  table(out, ['Field', 'As provisioned'], [
    ['`$schema`', cell(pkg.schemaUri)],
    ['`contentVersion`', cell(pkg.contentVersion)],
    ['`description`', pkg.definitionDescription === null ? '_not declared_' : cell(pkg.definitionDescription)],
    ['`outputs`', isEmpty(pkg.outputs) ? (pkg.outputs === null || pkg.outputs === undefined ? '_not declared_' : '`{}` — declared and empty') : 'declared — printed below'],
    ['Actions', String(pkg.actions.length)],
  ]);
  if (!isEmpty(pkg.outputs)) jsonBlock(out, pkg.outputs, '**Definition `outputs`, verbatim:**');

  /* parameters */
  out.push('## 3. Definition parameters');
  out.push('');
  if (isEmpty(pkg.parameters)) {
    out.push('_This package declares no definition parameters._');
    out.push('');
  } else {
    table(out, ['Parameter', 'Type', 'Default value'],
      Object.entries(pkg.parameters).map(([n, p]) => [
        cell(n), cell(p?.type),
        Object.prototype.hasOwnProperty.call(p || {}, 'defaultValue')
          ? (isEmpty(p.defaultValue) && typeof p.defaultValue === 'object' ? '`{}`' : cell(p.defaultValue))
          : '_not declared_',
      ]));
  }

  /* connections */
  out.push('## 4. Connections and references');
  out.push('');
  const connRows = new Map();
  for (const a of pkg.actions) {
    const c = connectorOf(a);
    if (!c || (!c.apiId && !c.connectionName && !c.connectionReferenceName)) continue;
    const key = `${c.connectionName || c.connectionReferenceName || ''}|${c.apiId || ''}`;
    if (!connRows.has(key)) connRows.set(key, { ...c, ops: new Map() });
    const e = connRows.get(key);
    e.ops.set(c.operationId || a.type, (e.ops.get(c.operationId || a.type) || 0) + 1);
  }
  if (connRows.size) {
    out.push('**Connections the actions are bound to**, read from each action\'s `inputs.host`:');
    out.push('');
    table(out, ['Connection name', 'API id', 'Reference name', 'Operations used'],
      [...connRows.values()].sort((a, b) => byteCompare(String(a.connectionName), String(b.connectionName))).map((c) => [
        cell(c.connectionName), cell(c.apiId), c.connectionReferenceName ? cell(c.connectionReferenceName) : '—',
        [...c.ops.entries()].sort().map(([o, n]) => `\`${o}\`×${n}`).join(', '),
      ]));
  } else {
    out.push('_No action in this package binds to a connector._');
    out.push('');
  }
  if (!isEmpty(pkg.connectionReferences)) {
    jsonBlock(out, pkg.connectionReferences, '**`connectionReferences`, verbatim:**');
  }
  if (!isEmpty(pkg.allConnectionData)) {
    out.push('**`allConnectionData`** — the connection each named action is bound to:');
    out.push('');
    table(out, ['Action', 'Reference key', 'Connection name', 'API', 'Connection id'],
      Object.entries(pkg.allConnectionData).map(([action, d]) => [
        cell(action), cell(d?.referenceKey), cell(d?.connectionReference?.connectionName),
        cell(d?.connectionReference?.api?.name ?? d?.connectionReference?.api?.id),
        cell(d?.connectionReference?.connection?.id ?? d?.connectionReference?.connection?.name),
      ]));
  }
  if (!isEmpty(pkg.staticResults)) jsonBlock(out, pkg.staticResults, '**`staticResults`, verbatim:**');

  /* trigger */
  out.push('## 5. Trigger — the endpoint this flow exposes');
  out.push('');
  const t = pkg.trigger;
  if (!t) {
    out.push('_This package carries no trigger. It is a clipboard scope: a fragment pasted into a');
    out.push('flow that already has one._');
    out.push('');
  } else {
    table(out, ['Field', 'As provisioned'], [
      ['Trigger name', cell(t.name)],
      ['`type`', cell(t.type)],
      ['`kind`', t.kind === null ? '_not declared_' : cell(t.kind)],
      ['`method`', t.method === null ? '_not declared_' : cell(t.method)],
      ['`relativePath`', t.relativePath === null ? '_not declared — the trigger accepts the bare invoke path_' : cell(t.relativePath)],
      ['`triggerAuthenticationType`', t.triggerAuthenticationType === undefined
        ? '_absent from the export — no posture is recorded_' : cell(t.triggerAuthenticationType)],
      ['`operationOptions`', t.operationOptions === null ? '_not declared_' : cell(t.operationOptions)],
      ['`conditions`', isEmpty(t.conditions) ? '_not declared_' : cell(t.conditions)],
      ['`splitOn`', t.splitOn === null ? '_not declared_' : cell(t.splitOn)],
      ['`correlation`', isEmpty(t.correlation) ? '_not declared_' : cell(t.correlation)],
      ['`recurrence`', isEmpty(t.recurrence) ? '_not declared_' : cell(t.recurrence)],
      ['Declared request headers', isEmpty(t.headers) ? '_not declared_' : cell(t.headers)],
      ['Declared query parameters', isEmpty(t.queries) ? '_not declared_' : cell(t.queries)],
      ['`description`', t.description === null ? '_not declared_' : cell(t.description)],
    ]);
    if (!isEmpty(t.evaluatedRecurrence)) jsonBlock(out, t.evaluatedRecurrence, '**`evaluatedRecurrence`, verbatim:**');
    if (!isEmpty(t.runtimeConfiguration)) jsonBlock(out, t.runtimeConfiguration, '**Trigger `runtimeConfiguration`, verbatim:**');

    out.push('### 5.1 Request payload — declared properties');
    out.push('');
    const rows = t.schema ? schemaRows(t.schema, '', Array.isArray(t.schema.required) ? t.schema.required : []) : [];
    if (!t.schema) {
      out.push('_The trigger declares no schema. Any JSON body is accepted and nothing is validated at');
      out.push('the boundary._');
      out.push('');
    } else if (!rows.length) {
      out.push('_The trigger declares a schema with no properties._');
      out.push('');
    } else {
      table(out, ['Property', 'Type', 'Required', 'Format', 'Enum', 'Default', 'Constraints', 'Description'],
        rows.map((r) => [
          code(r.path), r.type === null ? '_not declared_' : code(r.type),
          r.required ? '**yes**' : 'no',
          r.format ? code(r.format) : '—',
          r.enum ? cell(r.enum) : '—',
          r.default === undefined ? '—' : cell(r.default),
          [r.minLength !== null ? `minLength ${r.minLength}` : null,
            r.maxLength !== null ? `maxLength ${r.maxLength}` : null,
            r.pattern !== null ? `pattern ${code(r.pattern)}` : null].filter(Boolean).join(', ') || '—',
          plain(r.description),
        ]));
      const req = Array.isArray(t.schema.required) ? t.schema.required : [];
      out.push(`Root \`required\`: ${req.length ? req.map((x) => code(x)).join(', ') : '_empty — the schema marks nothing mandatory_'}. `
        + `Root \`additionalProperties\`: ${Object.prototype.hasOwnProperty.call(t.schema, 'additionalProperties') ? cell(t.schema.additionalProperties) : '_not declared_'}.`);
      out.push('');
    }
    if (t.schema) {
      out.push('### 5.2 Request payload — schema as provisioned');
      out.push('');
      jsonBlock(out, t.schema);
    }
  }

  /* responses */
  out.push('## 6. Responses returned to the caller');
  out.push('');
  const responses = responseActions(pkg);
  if (!responses.length) {
    out.push('_No `Response` action. This flow returns nothing to its caller beyond the platform\'s');
    out.push('own acknowledgement._');
    out.push('');
  } else {
    table(out, ['Action', 'Status code', 'Runs after', 'On statuses'],
      responses.map((a) => [
        code(a.path),
        a.inputs?.statusCode === undefined ? '_not declared_' : cell(a.inputs.statusCode),
        a.runAfter.length ? a.runAfter.map((e) => code(e.after)).join(', ') : '_first action_',
        a.runAfter.length ? a.runAfter.map((e) => e.statuses.join('/')).join(', ') : '—',
      ]));
    for (const a of responses) {
      out.push(`### 6.${responses.indexOf(a) + 1} ${code(a.path)}`);
      out.push('');
      table(out, ['Field', 'As provisioned'], [
        ['`statusCode`', a.inputs?.statusCode === undefined ? '_not declared_' : cell(a.inputs.statusCode)],
        ['`operationOptions`', a.operationOptions === null ? '_not declared_' : cell(a.operationOptions)],
      ]);
      if (isEmpty(a.inputs?.headers)) {
        out.push('_No response headers are configured._');
        out.push('');
      } else if (typeof a.inputs.headers === 'object' && !Array.isArray(a.inputs.headers)) {
        table(out, ['Header', 'Configured value'], Object.entries(a.inputs.headers).map(([h, v]) => [cell(h), cell(v)]));
      } else {
        jsonBlock(out, a.inputs.headers, '**Response headers, verbatim:**');
      }
      if (Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body')) {
        jsonBlock(out, a.inputs.body, '**Response body, verbatim:**');
      } else {
        out.push('_No response body is configured._');
        out.push('');
      }
      if (!isEmpty(a.inputs?.schema)) jsonBlock(out, a.inputs.schema, '**Declared response schema, verbatim:**');
    }
  }

  /* termination */
  const terminates = terminateActions(pkg);
  out.push('## 7. Termination');
  out.push('');
  if (!terminates.length) {
    out.push('_No `Terminate` action. The run ends when the action graph does._');
    out.push('');
  } else {
    table(out, ['Action', '`runStatus`', 'Error code', 'Error message', 'Runs after'],
      terminates.map((a) => [
        code(a.path), cell(a.inputs?.runStatus),
        a.inputs?.runError?.code === undefined ? '—' : cell(a.inputs.runError.code),
        a.inputs?.runError?.message === undefined ? '—' : cell(a.inputs.runError.message),
        a.runAfter.map((e) => `${code(e.after)} (${e.statuses.join('/')})`).join(', ') || '_first action_',
      ]));
  }

  /* error handling */
  out.push('## 8. Error handling and run-time configuration');
  out.push('');
  const catches = pkg.actions.filter((a) => a.isCatch);
  if (catches.length) {
    out.push('**Actions wired to run on something other than success.** These are the flow\'s catch');
    out.push('paths — an action that runs after `Failed`, `Skipped` or `TimedOut` is error handling,');
    out.push('whatever it is named.');
    out.push('');
    table(out, ['Action', 'Type', 'Runs after', 'On statuses'],
      catches.map((a) => [
        code(a.path), cell(a.type),
        a.runAfter.map((e) => code(e.after)).join(', '),
        a.runAfter.map((e) => e.statuses.join(', ')).join(' · '),
      ]));
  } else {
    out.push('_No action is wired to run on `Failed`, `Skipped` or `TimedOut`. Every dependency in');
    out.push('this flow is a success edge._');
    out.push('');
  }
  const runtime = pkg.actions.filter((a) => !isEmpty(a.runtimeConfiguration) || a.operationOptions || !isEmpty(a.trackedProperties) || a.limit);
  if (runtime.length) {
    out.push('**Run-time configuration set on individual actions** — retry policy, secure data,');
    out.push('operation options, tracked properties and loop limits, as configured:');
    out.push('');
    table(out, ['Action', 'Type', '`runtimeConfiguration`', '`operationOptions`', '`trackedProperties`', '`limit`'],
      runtime.map((a) => [
        code(a.path), cell(a.type),
        isEmpty(a.runtimeConfiguration) ? '—' : short(a.runtimeConfiguration, a.path),
        a.operationOptions ? cell(a.operationOptions) : '—',
        isEmpty(a.trackedProperties) ? '—' : short(a.trackedProperties, a.path),
        a.limit ? cell(a.limit) : '—',
      ]));
  } else {
    out.push('_No action carries a retry policy, secure-data setting, operation option, tracked');
    out.push('property or loop limit. Every call runs on the platform defaults._');
    out.push('');
  }

  /* variables */
  out.push('## 9. Variables');
  out.push('');
  const vars = variableWrites(pkg);
  const inits = vars.filter((v) => v.op === 'Initialize');
  if (inits.length) {
    out.push('**Declared, with the initial value each is provisioned with:**');
    out.push('');
    table(out, ['Variable', 'Type', 'Initial value', 'Declared by'],
      inits.map((v) => [cell(v.variable), cell(v.vtype), v.value === undefined ? '_no initial value_' : short(v.value, v.path), code(v.path)]));
  } else {
    out.push('_This package initialises no variables._');
    out.push('');
  }
  const writes = vars.filter((v) => v.op !== 'Initialize');
  if (writes.length) {
    out.push('**Every write, with the expression or literal assigned:**');
    out.push('');
    table(out, ['Action', 'Operation', 'Variable', 'Assigned value'],
      writes.map((v) => [code(v.path), cell(v.op), cell(v.variable), v.value === undefined ? '_not declared_' : short(v.value, v.path)]));
  }

  /* sharepoint */
  out.push('## 10. SharePoint operations');
  out.push('');
  const sp = sharePointRows(pkg);
  if (!sp.length) {
    out.push('_This package performs no SharePoint operation._');
    out.push('');
  } else {
    out.push('Each row is one connector call. `table` is printed as configured; the resolved column');
    out.push('names the list that GUID belongs to per `docs/reference/sharepoint-list-index.json`,');
    out.push('and says so plainly when the index does not carry it.');
    out.push('');
    table(out, ['Action', 'Operation', 'Connection', '`dataset` (site)', '`table` (list)', 'Resolves to'],
      sp.map((r) => [
        code(r.path), cell(r.operationId), cell(r.connection), cell(r.dataset), short(r.table, r.path),
        r.resolved ? plain(r.resolved) : (typeof r.table === 'string' && /@/.test(r.table)
          ? '_chosen at run time by an expression_'
          : '_not in the list index_'),
      ]));
  }

  /* outbound http */
  out.push('## 11. Outbound HTTP calls');
  out.push('');
  const https = httpRows(pkg);
  if (!https.length) {
    out.push('_This package makes no raw HTTP call._');
    out.push('');
  } else {
    for (const h of https) {
      out.push(`### ${code(h.path)}`);
      out.push('');
      table(out, ['Field', 'As provisioned'], [
        ['`method`', h.method === null ? '_not declared_' : cell(h.method)],
        ['`uri`', h.uri === null ? '_not declared_' : short(h.uri, h.path)],
        ['`authentication`', isEmpty(h.authentication) ? '_not declared_' : cell(h.authentication)],
        ['`retryPolicy`', isEmpty(h.retryPolicy) ? '_not declared — platform default_' : cell(h.retryPolicy)],
      ]);
      if (!isEmpty(h.headers) && typeof h.headers === 'object' && !Array.isArray(h.headers)) {
        table(out, ['Request header', 'Configured value'], Object.entries(h.headers).map(([k, v]) => [cell(k), cell(v)]));
      }
      if (!isEmpty(h.queries)) jsonBlock(out, h.queries, '**Query parameters, verbatim:**');
      if (h.body !== undefined) jsonBlock(out, h.body, '**Request body, verbatim:**');
    }
  }

  /* dependency register */
  out.push('## 12. Action dependency register');
  out.push('');
  out.push('Every action in the package, in graph order, with the edge that starts it. `↳` marks');
  out.push('nesting depth; the path is the address used everywhere else on this page.');
  out.push('');
  table(out, ['Action path', 'Type', 'Kind', 'Runs after', 'On statuses'],
    pkg.actions.map((a) => [
      `${'↳'.repeat(a.depth)}${code(a.path)}`, cell(a.type), a.kind ? cell(a.kind) : '—',
      a.runAfter.length ? a.runAfter.map((e) => code(e.after)).join(', ') : '_first in its scope_',
      a.runAfter.length ? a.runAfter.map((e) => e.statuses.join('/')).join(' · ') : '—',
    ]));

  /* configured inputs */
  out.push('## 13. Configured values, action by action');
  out.push('');
  out.push('The configured input of every action, verbatim. An action with no `inputs` key — a');
  out.push('`Scope`, an `If`, a `Foreach` — is documented by its control expression instead.');
  out.push('');
  for (const a of pkg.actions) {
    out.push(`### ${code(a.path)}`);
    out.push('');
    const meta = [
      ['Type', cell(a.type)],
      ['Kind', a.kind ? cell(a.kind) : '—'],
      ['Description', a.description === null ? '_not declared_' : cell(a.description)],
      ['Runs after', a.runAfter.length ? a.runAfter.map((e) => `${code(e.after)} (${e.statuses.join('/')})`).join(', ') : '_first in its scope_'],
    ];
    const c = connectorOf(a);
    if (c) {
      meta.push(['Connector', cell(c.connectionName ?? c.apiId)]);
      meta.push(['Operation', c.operationId ? cell(c.operationId) : '—']);
    }
    table(out, ['Field', 'As provisioned'], meta);
    if (a.inputs !== undefined) {
      jsonBlock(out, a.inputs, '**`inputs`, verbatim:**');
    } else {
      out.push('_This action declares no `inputs`._');
      out.push('');
    }
    if (a.expression !== undefined) jsonBlock(out, a.expression, '**`expression`, verbatim:**');
    if (a.foreach !== undefined) jsonBlock(out, a.foreach, '**`foreach`, verbatim:**');
    if (!isEmpty(a.runtimeConfiguration)) jsonBlock(out, a.runtimeConfiguration, '**`runtimeConfiguration`, verbatim:**');
    if (!isEmpty(a.trackedProperties)) jsonBlock(out, a.trackedProperties, '**`trackedProperties`, verbatim:**');
  }

  return `${out.join('\n')}\n`;
}

/* ── endpoint register ───────────────────────────────────────────────────────────────── */

function renderEndpointRegister() {
  const out = [];
  const deployed = packages.filter((p) => p.part === 'deployed');
  const byInternalName = new Map(deployed.filter((p) => p.internalName).map((p) => [p.internalName, p]));
  const byDisplayName = new Map(deployed.map((p) => [p.displayName, p]));
  const link = (p) => `[${code(p.displayName)}](flows/${p.slug}.md)`;

  out.push('# Endpoint provisioning register');
  out.push('');
  out.push('> Generated by `scripts/build-provisioning-reference.mjs` — do not edit by hand.');
  out.push('> Every row is read from a package or a register in this repository; each section names');
  out.push('> which one.');
  out.push('');
  out.push('An endpoint on either platform is one HTTP-triggered Power Automate flow, invoked');
  out.push('directly by the browser at its signed trigger URL. `config/endpoints.config.js` states');
  out.push('the arrangement in the tree itself: *"Every URL below is invoked directly by the');
  out.push('browser. There is no proxy, broker or other intermediary in the request path… The flow');
  out.push('behind each URL is therefore the only place authentication, authorisation and');
  out.push('validation can be enforced — it must enforce them itself."* What each flow does enforce');
  out.push('is in section 4 and on its own page.');
  out.push('');
  out.push('**No trigger URL appears anywhere in this reference.** A signed URL is a bearer');
  out.push('credential; the workflow id it addresses is not, and is what is recorded.');
  out.push('');

  /* 1 — internal contracts */
  out.push('## 1. Internal platform — endpoint contracts');
  out.push('');
  out.push('Read from `config/endpoints.config.js#EndpointContracts`, which is what the application');
  out.push('actually sends. Workflow ids are joined from `docs/reference/endpoint-workflow-ids.json`.');
  out.push('');
  table(out, ['Contract key', 'Method', '`action` sent', 'Access', 'Timeout (ms)', '`sourceKey`', 'Workflow id', 'Flow named by the register'],
    Object.entries(EndpointContracts).map(([key, c]) => {
      const wid = internalIds.internal?.[key];
      return [
        code(key), cell(c.method), cell(c.action),
        c.readOnly ? 'read-only' : (c.write ? 'write' : '_not declared_'),
        c.timeoutMs === undefined ? '_not declared — client default_' : cell(c.timeoutMs),
        cell(c.sourceKey),
        wid?.workflowId ? cell(wid.workflowId) : '_not in that register_',
        wid?.flow ? plain(wid.flow) : '—',
      ];
    }));
  const routed = Object.entries(EndpointContracts).filter(([, c]) => Array.isArray(c.routeKeys) && c.routeKeys.length);
  for (const [key, c] of routed) {
    out.push(`${code(key)} multiplexes **${c.routeKeys.length}** operations over the single trigger, sent as the`);
    out.push(`\`action\` field: ${c.routeKeys.map((k) => code(k)).join(', ')}.`);
    out.push('');
  }
  out.push('The URL side of every key is empty in the tracked tree by design — it is supplied at');
  out.push('deploy time from `config/config.local.js`, which is git-ignored. An unset key degrades');
  out.push('to offline mode rather than failing.');
  out.push('');

  /* 2 — internal physical flows */
  out.push('## 2. Internal platform — the physical flow behind each key');
  out.push('');
  out.push('Read from `docs/reference/internal-flow-register.json`. Several contract keys share one');
  out.push('physical flow, which is why the key count and the flow count differ.');
  out.push('');
  table(out, ['Contract key', 'Physical flow', 'Flow label', 'Fixed `action`', 'Workflow id', 'Provisioning page'],
    (register.contractKeys || []).map((c) => {
      const pages = (c.definitions || []).map((d) => {
        const p = packages.find((x) => x.file === d);
        return p ? link(p) : `\`${d}\``;
      });
      return [
        code(c.key), cell(c.physicalFlow), plain(c.flowLabel), cell(c.fixedAction),
        c.workflowId ? cell(c.workflowId) : '_not recorded_',
        pages.join('<br>') || '_no definition attached_',
      ];
    }));

  /* 3 — portal endpoints */
  out.push('## 3. Document portal — endpoint provisions');
  out.push('');
  out.push('Read from `docs/reference/portal-endpoint-workflow-ids.json` (keys, flows and workflow');
  out.push('ids, captured from flow run records) and `docs/deployment/sharepoint/portal-wiring.json`');
  out.push('(the purpose and the list operations each endpoint requires).');
  out.push('');
  table(out, ['Endpoint key', 'Endpoint flow', 'Internal name', 'Workflow id', 'Deployed definition', 'Purpose'],
    (portalIds.endpoints || []).map((e) => {
      const p = e.internalName ? byInternalName.get(e.internalName) : null;
      const w = wiringByEndpoint.get(e.key);
      return [
        code(e.key), cell(e.flow), cell(e.internalName),
        e.workflowId ? cell(e.workflowId) : '_unresolved — see the note below_',
        p ? link(p) : '_no export in this tree carries that internal name_',
        w ? plain(w.purpose) : '—',
      ];
    }));
  const notes = (portalIds.endpoints || []).filter((e) => e.note);
  if (notes.length) {
    out.push('Notes carried by that register, verbatim:');
    out.push('');
    for (const e of notes) out.push(`- ${code(e.key)} — ${plain(e.note)}`);
    out.push('');
  }
  out.push(`Register note: ${plain(portalIds.note)}`);
  out.push('');
  out.push('### 3.1 List operations each portal endpoint is specified to perform');
  out.push('');
  out.push('From `docs/deployment/sharepoint/portal-wiring.json`. This is the requirement the');
  out.push('endpoint is wired against; what a deployed flow actually calls is section 10 of its own');
  out.push('page.');
  out.push('');
  for (const e of wiring.endpoints || []) {
    const ops = e.requiredOperations || [];
    out.push(`**${code(e.endpoint)}** — design ${code(e.designFlow)}; deployed candidates `
      + `${(e.deployedFlowCandidates || []).map((f) => (byDisplayName.has(f) ? link(byDisplayName.get(f)) : code(f))).join(', ') || '—'}.`);
    out.push('');
    table(out, ['List', 'Site', 'List GUID', 'Operation'],
      ops.map((o) => [plain(o.list), plain(o.site), cell(o.listGuid), cell(o.operation)]));
  }

  /* 4 — trigger posture */
  out.push('## 4. Trigger posture across the deployed estate');
  out.push('');
  out.push('Read from the deployed definitions themselves — one row per exported flow, printing the');
  out.push('trigger exactly as it is provisioned. `triggerAuthenticationType` governs who may invoke');
  out.push('the trigger; where the export does not carry the field the row says so rather than');
  out.push('assuming a default.');
  out.push('');
  table(out, ['Flow', 'Estate', 'Trigger', 'Type', 'Method', 'Relative path', '`triggerAuthenticationType`', 'Request schema', 'Response codes'],
    deployed.map((p) => {
      const t = p.trigger;
      const codes = responseActions(p).map((a) => a.inputs?.statusCode).filter((x) => x !== undefined);
      const rows = t?.schema ? schemaRows(t.schema, '', Array.isArray(t.schema.required) ? t.schema.required : []) : [];
      return [
        link(p), p.portal ? 'Portal' : 'Internal',
        t ? cell(t.name) : '—', t ? cell(t.type) : '—',
        t?.method ? cell(t.method) : '_not declared_',
        t?.relativePath ? cell(t.relativePath) : '—',
        t?.triggerAuthenticationType === undefined ? '_absent from the export_' : cell(t.triggerAuthenticationType),
        t?.schema ? `${rows.length} properties` : '_none declared_',
        codes.length ? [...new Set(codes.map((c) => JSON.stringify(c).replace(/^"|"$/g, '')))].map((c) => cell(c)).join(', ') : '_no Response action_',
      ];
    }));

  /* 5 — the sanctioned crossing */
  out.push('## 5. The one sanctioned crossing between the estates');
  out.push('');
  const asserted = read('docs/reference/flow-trigger-auth.json').asserted;
  out.push('`docs/reference/flow-trigger-auth.json` records one assertion about this estate, quoted');
  out.push('verbatim:');
  out.push('');
  table(out, ['Field', 'Value'], Object.entries(asserted).map(([k, v]) => [`\`${k}\``, plain(v)]));
  const tenant = deployed.filter((p) => p.trigger?.triggerAuthenticationType === 'Tenant');
  out.push(`Read back from the definitions in this reference, **${tenant.length}** deployed flows carry`);
  out.push('`triggerAuthenticationType: "Tenant"`:');
  out.push('');
  for (const p of tenant) out.push(`- ${link(p)} — ${code(p.trigger.method)}`);
  out.push('');

  return `${out.join('\n')}\n`;
}

/* ── index ───────────────────────────────────────────────────────────────────────────── */

function renderIndex() {
  const out = [];
  const deployed = packages.filter((p) => p.part === 'deployed');
  const other = packages.filter((p) => p.part !== 'deployed');
  const totals = {
    actions: packages.reduce((n, p) => n + p.actions.length, 0),
    deployedActions: deployed.reduce((n, p) => n + p.actions.length, 0),
    responses: deployed.reduce((n, p) => n + responseActions(p).length, 0),
    schemas: deployed.filter((p) => p.trigger?.schema).length,
    noAuth: deployed.filter((p) => p.trigger && p.trigger.triggerAuthenticationType === undefined).length,
  };

  out.push('# Provisioning reference — flows and endpoints, as configured');
  out.push('');
  out.push('> Generated by `scripts/build-provisioning-reference.mjs`. Do not edit by hand — run');
  out.push('> `npm run provisioning`. `npm test` fails if any page here has drifted from the');
  out.push('> packages it was read from.');
  out.push('');
  out.push('## What this is');
  out.push('');
  out.push('The configuration of every flow and every endpoint across both platforms, read out of');
  out.push('the packages in this repository and printed as those packages carry it. For each flow:');
  out.push('its identity, definition envelope and parameters, the connections its actions are bound');
  out.push('to, its trigger — method, path, authentication posture and full request schema — every');
  out.push('response it returns with status code, headers and body, its termination and error');
  out.push('handling, every variable and initial value, every SharePoint operation and outbound HTTP');
  out.push('call, the full dependency graph, and the configured input of every action, verbatim.');
  out.push('');
  out.push('## What this is not');
  out.push('');
  out.push('It is not an account of what the flows are *for*. A definition cannot state its own');
  out.push('purpose, and a purpose invented here would read as knowledge. Where a register attributes');
  out.push('a flow to a contract key or a portal endpoint, that attribution is cited and named as');
  out.push('such; where nothing does, nothing is said.');
  out.push('');
  out.push('It is also not [`../FLOW_CATALOGUE.md`](../FLOW_CATALOGUE.md), which remains the place to');
  out.push('go for a flow\'s shape at a glance — what triggers it, what it touches, how it scores');
  out.push('against the build standard, and its action tree. This reference answers the next');
  out.push('question: what is that action actually configured with.');
  out.push('');
  out.push('## Sources, and the difference between them');
  out.push('');
  out.push('The package families in this repository are not the same artefact and are never mixed.');
  out.push('Only the first is a statement about the tenant. Every page names the family it was read');
  out.push('from, in its own first line.');
  out.push('');
  const inDir = (d) => String(packages.filter((p) => p.file.startsWith(d)).length);
  table(out, ['Family', 'Location', 'What it is', 'Pages'], [
    ['**Deployed export**', '`docs/reference/flow-contracts/deployed/`',
      'The live tenant, exported by `scripts/export-power-automate-flows.ps1`. **This is the provisioned state.**',
      inDir('docs/reference/flow-contracts/deployed/')],
    ['Design package', '`docs/deployment/power-automate-flows/`',
      'What a portal flow was specified to do. Its own README: *"They are not what is deployed."*',
      inDir('docs/deployment/power-automate-flows/')],
    ['Clipboard scope — portal', '`docs/deployment/sharepoint/flows/designer-paste/`',
      'A scope built for pasting into the designer, with a companion package holding the top-level variables the designer will not accept inside a scope. A fragment: no trigger, no identity.',
      inDir('docs/deployment/sharepoint/flows/designer-paste/')],
    ['Clipboard scope — internal', '`docs/deployment/internal/flows/designer-paste/`',
      'The same, for the internal platform.',
      inDir('docs/deployment/internal/flows/designer-paste/')],
    ['Patched definition', '`docs/deployment/sharepoint/remediation/patched/`',
      'A definition with a remediation applied, held for the PATCH back to the tenant. Not yet the tenant.',
      inDir('docs/deployment/sharepoint/remediation/patched/')],
    ['Recovered definition', '`docs/reference/flow-contracts/recovered/`',
      'A definition recovered from a run rather than exported from the flow.',
      inDir('docs/reference/flow-contracts/recovered/')],
  ]);
  out.push('');
  table(out, ['Counted across the deployed estate', ''], [
    ['Flows documented', String(deployed.length)],
    ['Actions documented', String(totals.deployedActions)],
    ['`Response` actions documented', String(totals.responses)],
    ['Flows declaring a request schema', `${totals.schemas} of ${deployed.length}`],
    ['Flows whose export carries no `triggerAuthenticationType`', String(totals.noAuth)],
    ['Non-deployed packages also documented', String(other.length)],
  ]);
  out.push('');
  out.push('## Start here');
  out.push('');
  out.push('- [**Open the provisioning console**](index.html) — the same material as an interface:');
  out.push('  search across every flow at once (by contract key, action name, connection, or the');
  out.push('  SharePoint list a call targets), filter to the set you mean, and jump to a section or');
  out.push('  to one action out of 252. No server and no build step — open the file. The pages below');
  out.push('  remain the record a git history shows.');
  out.push('- [**Endpoint provisioning register**](ENDPOINT_REGISTER.md) — every endpoint on both');
  out.push('  platforms: contract keys and what the applications send, the flow behind each key, the');
  out.push('  portal endpoints and their required list operations, and the trigger posture of the');
  out.push('  whole deployed estate in one table.');
  out.push('');
  out.push('## Deployed flows — the provisioned state');
  out.push('');
  table(out, ['Flow', 'Estate', 'Trigger', 'Method', 'Auth', 'Actions', 'Responses', 'Page'],
    deployed.map((p) => {
      const t = p.trigger;
      return [
        code(p.displayName), p.portal ? 'Portal' : 'Internal',
        t ? cell(t.type) : '—', t?.method ? cell(t.method) : '—',
        t?.triggerAuthenticationType === undefined ? '_absent_' : cell(t.triggerAuthenticationType),
        String(p.actions.length), String(responseActions(p).length),
        `[open](flows/${p.slug}.md)`,
      ];
    }));

  out.push('## Other provisioning packages — not the deployed state');
  out.push('');
  out.push('Documented to the same depth, and separated from the estate above on purpose. A design or');
  out.push('a clipboard scope describes what someone intends a flow to become; only an export');
  out.push('describes what it is.');
  out.push('');
  table(out, ['Package', 'Family', 'Estate', 'Source', 'Actions', 'Page'],
    other.map((p) => [
      code(p.displayName), FAMILY[p.family].split(' — ')[0], p.estate,
      code(p.file), String(p.actions.length), `[open](packages/${p.slug}.md)`,
    ]));

  out.push('## Flow-shaped documents this reference does not cover');
  out.push('');
  out.push('Both trees below hold documents with a workflow definition inside them, and neither is a');
  out.push('statement of what is provisioned. They are listed so the boundary of this reference is a');
  out.push('stated one rather than an assumed one.');
  out.push('');
  table(out, ['Tree', 'Documents', 'Why it is not documented here'],
    EXCLUDED.map((e) => [
      code(e.prefix),
      String(excludedCounts.get(e.prefix) || 0),
      e.why,
    ]));
  out.push('');
  out.push('## Credentials');
  out.push('');
  out.push('No signed trigger URL appears in this reference. Every string rendered passes through a');
  out.push('redactor that replaces a `sig=` token with `sig=REDACTED`, and the generator reports any');
  out.push('package that carries one by name.');
  out.push('');
  if (signatureCarriers.length) {
    out.push('**Packages carrying a signature at the time this was generated:**');
    out.push('');
    for (const f of signatureCarriers) out.push(`- \`${f}\` — rotate the trigger in Power Automate; removing the file revokes nothing.`);
    out.push('');
  } else {
    out.push('At the time this was generated, **no package read here carried one**.');
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

/* ── emit ────────────────────────────────────────────────────────────────────────────── */

const files = new Map();
files.set(`${OUT_DIR}/README.md`, renderIndex());
files.set(`${OUT_DIR}/ENDPOINT_REGISTER.md`, renderEndpointRegister());
for (const pkg of packages) files.set(pkg.page, renderFlowPage(pkg));

/* An orphan is a page for a flow that no longer exists, and it is worse than a missing page:
   it reads as current. The whole output directory is treated as generated, so a file in it
   that this run did not produce is stale by definition.

   THE ONE EXCEPTION, AND WHY IT IS NAMED RATHER THAN PATTERNED.
   The console lives in this directory too: `index.html`, `console.css` and `console.js` are
   authored, and the two data files are written by `build-provisioning-console.mjs`. None of
   them is produced by this run, so the sweep above deletes them — which it did, silently,
   the first time this generator ran after they were added. They are listed by name rather
   than matched by extension so that a stray `.js` in here is still swept: the point of the
   sweep is that nothing survives in this directory by accident, and an exception that is a
   pattern is how that guarantee erodes. */
const CONSOLE_FILES = new Set([
  `${OUT_DIR}/index.html`,
  `${OUT_DIR}/console.css`,
  `${OUT_DIR}/console.js`,
  `${OUT_DIR}/provisioning-index.js`,
  `${OUT_DIR}/provisioning-detail.js`,
]);
const onDisk = new Set();
const outAbs = join(ROOT, OUT_DIR);
if (existsSync(outAbs)) {
  for (const abs of walkAll(outAbs)) onDisk.add(repoPath(abs));
}
function walkAll(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkAll(p, acc); else acc.push(p);
  }
  return acc;
}

const stale = [...onDisk].filter((f) => !files.has(f) && !CONSOLE_FILES.has(f)).sort();
const changed = [];
for (const [rel, text] of files) {
  const abs = join(ROOT, rel);
  const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (now !== text) changed.push(rel);
}

if (!changed.length && !stale.length) {
  console.log(check ? '\n✅ the provisioning reference matches the packages\n' : '\n  unchanged\n');
  process.exit(0);
}
if (check) {
  console.error(`\n❌ ${OUT_DIR} is stale — run: npm run provisioning`);
  for (const f of changed.slice(0, 10)) console.error(`   changed: ${f}`);
  if (changed.length > 10) console.error(`   … and ${changed.length - 10} more`);
  for (const f of stale.slice(0, 10)) console.error(`   orphaned: ${f}`);
  console.error('');
  process.exit(1);
}
for (const f of stale) rmSync(join(ROOT, f));
let bytes = 0;
for (const [rel, text] of files) {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  bytes += Buffer.byteLength(text);
}
console.log(`\n  wrote ${files.size} pages to ${OUT_DIR} — ${packages.length} packages, `
  + `${packages.reduce((n, p) => n + p.actions.length, 0)} actions, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (stale.length) console.log(`  removed ${stale.length} orphaned page(s)`);
if (signatureCarriers.length) console.log(`  ⚠  ${signatureCarriers.length} package(s) carry a SAS signature — see the index`);
console.log('');
