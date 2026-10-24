#!/usr/bin/env node
/**
 * The connector register: every connection every flow action in this repository uses.
 *
 * WHY THIS EXISTS
 * Connector bindings are spread across ~200 files in eight shapes — deployed exports, recovered
 * exports, solution/package zips, designer-paste scopes, console-apply scripts, design
 * packages, run captures and generated documentation. `docs/folio-Master-Flows-and-Endpoints/provisioning/` prints
 * them one flow at a time and only for the families it reads. Nothing answered "which flows
 * use which connector, through which connection, calling which operation with which
 * parameters" for the whole estate at once. This does, and it is meant to be the master record
 * for that question.
 *
 * WHAT IS READ — EVERYTHING TRACKED
 *   · every tracked text file, parsed whole as JSON or, failing that, scanned for embedded JSON
 *     objects (Markdown fences, JavaScript constants, HTML, plain text);
 *   · every member of every tracked archive (.zip, .docx, .xlsx), read with the repository's
 *     own zip reader — so solution packages and their connectionsMap / apisMap / manifest are
 *     read, not skipped.
 * A flow artefact is recognised by SHAPE (an `actions` / `triggers` map of typed entries, a
 * known export wrapper, or a designer-paste `serializedValue`), never by where it sits. Every
 * candidate file — one that carries any connector marker — is accounted for in `sources`,
 * including the ones that turned out to hold no action map, with the reason.
 *
 * NOTHING IS FILTERED, WITH ONE EXCEPTION: CREDENTIALS
 * Every action, trigger and parameter is recorded as the file carries it. The single
 * transformation is masking: a SAS `sig=`, a bearer token, a Google / OpenRouter / OpenAI /
 * Hugging Face key, or a literal secret-named header value is replaced by
 * `[MASKED:<kind>#<sha256/8>]`. The fingerprint lets a holder of the source confirm which
 * credential stood there without this file becoming another copy of it; every masking is
 * listed in `maskings` with its location. (tests/check-secrets.mjs would fail this file were a
 * signature copied into it — and rightly.)
 *
 * Usage:
 *   node scripts/build-connector-register.mjs           write the register
 *   node scripts/build-connector-register.mjs --check   fail if it has drifted
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openZip } from './lib/zip-reader.mjs';
import { trackedFiles } from './lib/tracked-files.mjs';
import { definitionRoot, identity } from './lib/flow-definition-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';
import { refreshBlock, refreshLogos, refreshSubs } from './lib/brand-kit.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const OUT_DIR = 'docs/folio-Master-Flows-and-Endpoints/reference/connector';
const OUT_JSON = `${OUT_DIR}/connector-register.json`;
const OUT_CSV = `${OUT_DIR}/connector-register-actions.csv`;
const OUT_MD = `${OUT_DIR}/CONNECTOR_REGISTER.md`;
const OUT_HTML = `${OUT_DIR}/CONNECTOR_MATRIX.html`;
const OUT_XLSX = `${OUT_DIR}/CONNECTOR_REGISTER.xlsx`;
const OUT_DETAILS_HTML = `${OUT_DIR}/CONNECTOR_DETAILS_MATRIX.html`;
const OUT_DETAILS_XLSX = `${OUT_DIR}/CONNECTOR_DETAILS.xlsx`;
const OUTPUTS = new Set([OUT_JSON, OUT_CSV, OUT_MD, OUT_HTML, OUT_XLSX, OUT_DETAILS_HTML, OUT_DETAILS_XLSX]);

/* The estate register's outputs are excluded for the reason this file excludes its own: they are a
   register OF the artefacts, not an artefact. They also close a loop — scripts/build-estate-register.mjs
   reads connector-register.json as one of its sources, so reading its output back in here made each
   generator invalidate the other on every run, and it read the statements the estate register quotes as
   flow artefacts of their own: 98 artefacts and 2322 loose entries appeared out of nothing. Anything
   derived from this register belongs on this list. */
const DERIVED_REGISTERS = [
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json',
  'docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-fields.csv',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-flows.csv',
  'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-touches.csv',
];
for (const rel of DERIVED_REGISTERS) OUTPUTS.add(rel);

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const sortBy = (f) => (a, b) => byteCompare(f(a), f(b));
const uniq = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== ''))].sort(byteCompare);

/* ── credential masking ─────────────────────────────────────────────────────────────── */

const maskings = [];
let maskContext = '';
const SECRET_PATTERNS = [
  ['sas-signature', /(sig=)([A-Za-z0-9_%-]{20,})/g, (m, p, v) => `${p}[MASKED:sas-signature#${sha(v.slice(0, 43)).slice(0, 8)}]`, (m, p, v) => v.slice(0, 43)],
  ['google-api-key', /AIza[0-9A-Za-z_-]{30,}/g],
  ['openrouter-api-key', /sk-or-v1-[0-9a-f]{20,}/g],
  ['openai-api-key', /sk-(?:proj-)?[A-Za-z0-9]{20,}/g],
  ['huggingface-token', /hf_[A-Za-z0-9]{20,}/g],
  ['bearer-token', /(Bearer\s+)(?!REDACTED|\[MASKED|@)([A-Za-z0-9._~+/=-]{20,})/g, (m, p, v) => `${p}[MASKED:bearer-token#${sha(v).slice(0, 8)}]`, (m, p, v) => v],
];
function maskString(s, where) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [kind, re, rep, keyOf] of SECRET_PATTERNS) {
    out = out.replace(re, (...args) => {
      const m = args[0];
      const secret = keyOf ? keyOf(...args) : m;
      const fp = sha(secret).slice(0, 8);
      maskings.push({ where: where || maskContext, kind, fingerprint: fp });
      return rep ? rep(...args) : `[MASKED:${kind}#${fp}]`;
    });
  }
  return out;
}
const SECRET_KEY = /^(x-goog-api-key|api-?key|x-api-key|password|client_?secret|secret|access_?token)$/i;
function maskDeep(v, where = '') {
  if (typeof v === 'string') return maskString(v, where);
  if (Array.isArray(v)) return v.map((x, i) => maskDeep(x, `${where}[${i}]`));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const here = where ? `${where}.${k}` : k;
      if (SECRET_KEY.test(k) && typeof x === 'string' && x.length >= 12 && !/^@|^\[MASKED|REDACTED/i.test(x)) {
        const fp = sha(x).slice(0, 8);
        maskings.push({ where: here, kind: `literal-${k.toLowerCase()}`, fingerprint: fp });
        out[k] = `[MASKED:literal-${k.toLowerCase()}#${fp}]`;
      } else out[k] = maskDeep(x, here);
    }
    return out;
  }
  return v;
}

/* ── reading every tracked source ───────────────────────────────────────────────────── */

const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|otf|pdf|mp4|mp3|wav|sqlite|db)$/i;
const ARCHIVE = /\.(zip|docx|xlsx|pptx)$/i;
const MARKER = /"type"\s*:\s*"(?:Request|Response|Http|HttpWebhook|Recurrence|Workflow)"|OpenApiConnection|ApiConnection|"operationId"|"apiId"|connectionReferences|connection_references|connectionsMap|shared_[a-z0-9]+|Microsoft\.PowerApps\/apis/;

/* Archives are read to any depth: a release zip carries package zips, and a "matched
   packages" zip carries twenty. A member of a nested archive is located as
   outer.zip!inner.zip!member. The zip reader opens files, so a nested archive is staged
   to a private temporary file for the read and removed at once. */
const STAGE = mkdtempSync(join(tmpdir(), 'connector-register-'));
process.on('exit', () => { try { rmSync(STAGE, { recursive: true, force: true }); } catch { /* best effort */ } });
function* archiveTexts(rel, abs, locator, depth) {
  let zip;
  try { zip = openZip(abs); } catch (e) { yield { rel, archive: locator, member: null, loc: locator, text: null, error: `unreadable archive: ${e.message}` }; return; }
  for (const m of zip.members) {
    if (m.isDirectory || BINARY.test(m.name)) continue;
    let buf;
    const loc = `${locator}!${m.name}`;
    try { buf = m.read(); } catch (e) { yield { rel, archive: locator, member: m.name, loc, text: null, error: `unreadable member: ${e.message}` }; continue; }
    if (ARCHIVE.test(m.name)) {
      if (depth >= 4) { yield { rel, archive: locator, member: m.name, loc, text: null, error: 'archive nested deeper than 4 levels — not opened' }; continue; }
      const staged = join(STAGE, `${sha(loc).slice(0, 16)}.zip`);
      writeFileSync(staged, buf);
      yield* archiveTexts(rel, staged, loc, depth + 1);
      rmSync(staged, { force: true });
      continue;
    }
    if (buf.includes(0)) continue;
    let text = buf.toString('utf8');
    if (/\.xml$/i.test(m.name) && /\.(docx|xlsx|pptx)$/i.test(locator)) text = text.replace(/<[^>]+>/g, ' ');
    yield { rel, archive: locator, member: m.name, loc, text };
  }
}
function* sourceTexts() {
  for (const rel of trackedFiles({ root: ROOT }).sort(byteCompare)) {
    if (OUTPUTS.has(rel)) continue;
    const abs = join(ROOT, rel);
    if (!existsSync(abs) || BINARY.test(rel)) continue;
    if (ARCHIVE.test(rel)) { yield* archiveTexts(rel, abs, rel, 0); continue; }
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue;
    yield { rel, archive: null, member: null, loc: rel, text: buf.toString('utf8') };
  }
}

/* Balanced-brace scan for JSON objects embedded in non-JSON text. Strings are tracked so a
   brace inside one does not count; a slice that fails JSON.parse moves on by one character. */
function* embeddedObjects(text) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    i = text.indexOf('{', i);
    if (i < 0) return;
    let depth = 0, inStr = false, j = i, end = -1;
    for (; j < n; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) { i++; continue; }
    const slice = text.slice(i, end + 1);
    if (slice.includes('"type"') || slice.includes('connection')) {
      try { const o = JSON.parse(slice); if (o && typeof o === 'object') { yield o; i = end + 1; continue; } } catch { /* not JSON */ }
    }
    i++;
  }
}
function parsedObjects(text) {
  const t = text.replace(/^﻿/, '');
  try { const o = JSON.parse(t); return { whole: true, objects: [o] }; } catch { /* fall through */ }
  return { whole: false, objects: [...embeddedObjects(t)] };
}

/* ── artefact discovery ─────────────────────────────────────────────────────────────── */

const WDL_TYPES = new Set(['OpenApiConnection', 'ApiConnection', 'OpenApiConnectionWebhook', 'ApiConnectionWebhook',
  'OpenApiConnectionNotification', 'Http', 'HttpWebhook', 'Request', 'Response', 'Recurrence', 'Workflow', 'Function',
  'ApiManagement', 'Compose', 'SetVariable', 'InitializeVariable', 'IncrementVariable', 'DecrementVariable',
  'AppendToArrayVariable', 'AppendToStringVariable', 'Scope', 'If', 'Switch', 'Foreach', 'Until', 'Terminate', 'Wait',
  'Select', 'Query', 'Table', 'Join', 'ParseJson', 'Javascript', 'Expression', 'SlidingWindow', 'Batch', 'SendToBatch']);
const TRIGGER_TYPES = new Set(['Request', 'Recurrence', 'ApiConnectionWebhook', 'OpenApiConnectionWebhook', 'OpenApiConnectionNotification', 'HttpWebhook', 'ApiConnection', 'OpenApiConnection']);
const isActionMap = (m) => m && typeof m === 'object' && !Array.isArray(m)
  && Object.values(m).some((a) => a && typeof a === 'object' && WDL_TYPES.has(a.type));

/* An action list written as an ARRAY (a remediation spec's `newActionsRequired`) is a set of
   configured actions too; each element carrying `inputs` is lifted into a map by its name.
   Array entries WITHOUT inputs are summaries in a derived catalogue — those are cross-matched
   (see `looseEntries`) rather than registered twice. */
const isActionList = (v) => Array.isArray(v) && v.length > 0
  && v.every((a) => a && typeof a === 'object' && WDL_TYPES.has(a.type) && a.inputs !== undefined);
const listToMap = (v) => Object.fromEntries(v.map((a, i) => [a.name || a.actionName || `[${i}]`, a]));
/* docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json is the endpoint dataset, generated by build-endpoint-dataset.mjs
   from the deployed definitions this register already reads; walking it would count 72 flows twice. */
const DERIVED_CATALOGUE = /^(docs\/folio-Master-Flows-and-Endpoints\/provisioning\/provisioning-detail\.js|tools\/flow-workbench\/|config\/flow-shapes\.data\.js|docs\/folio-Master-Flows-and-Endpoints\/reference\/endpoints\.json$)/;

function findArtefactRoots(doc, rel) {
  const def = definitionRoot(doc);
  if (def && (isActionMap(def.actions) || isActionMap(def.triggers))) return [{ shape: 'definition', def }];
  if (doc?.serializedValue && typeof doc.serializedValue === 'object' && doc.serializedValue.type) {
    return [{ shape: 'designer-paste scope', origin: doc.serializedValue, def: { triggers: {}, actions: { [doc.nodeId || 'serializedValue']: doc.serializedValue } } }];
  }
  if (DERIVED_CATALOGUE.test(rel)) return [];
  const out = [];
  (function walk(o, kp, depth) {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (!Array.isArray(o) && (isActionMap(o.actions) || isActionMap(o.triggers))) {
      out.push({ shape: o.$schema || o.triggers ? 'definition (embedded)' : 'action-map fragment', def: o, keyPath: kp });
      return;
    }
    /* A file holding only a flow's trigger block — `{"Recurrence": {"type": "Recurrence", …}}`,
       written to be pasted into the trigger — is a trigger map with no wrapper. */
    if (depth === 0 && !Array.isArray(o) && isActionMap(o)
      && Object.values(o).every((t) => t && typeof t === 'object' && TRIGGER_TYPES.has(t.type))) {
      out.push({ shape: 'standalone trigger map', origin: o, def: { triggers: o, actions: {} }, keyPath: kp });
      return;
    }
    if (!Array.isArray(o) && o.type === 'Request' && o.kind && o.inputs === undefined && ('schema' in o || 'triggerAuthenticationType' in o) && !/^docs\/folio-Master-Flows-and-Endpoints\/provisioning\//.test(rel)) {
      out.push({ shape: depth ? `trigger configuration recorded as evidence (${kp})` : 'standalone trigger specification', origin: o, def: { triggers: { [o.name || (depth ? kp.split('.').pop() : 'manual')]: { ...o, inputs: { schema: o.schema, method: o.method, triggerAuthenticationType: o.triggerAuthenticationType } } }, actions: {} }, keyPath: kp });
      return;
    }
    /* One configured action standing alone — a remediation's `alsoForVerify.action`. Not taken
       from generated documentation, which prints every deployed action this way and would
       register each twice; those snippets are cross-matched instead. */
    if (!Array.isArray(o) && depth > 0 && CONNECTOR_TYPES.has(o.type) && o.inputs && typeof o.inputs === 'object' && !/^docs\/folio-Master-Flows-and-Endpoints\/provisioning\//.test(rel)) {
      out.push({ shape: `single action specification (${kp})`, origin: o, def: { actions: { [o.name || kp.split('.').pop()]: o } }, keyPath: kp });
      return;
    }
    if (isActionList(o)) { out.push({ shape: `action list${kp ? ` (${kp})` : ''}`, origin: o, def: { actions: listToMap(o) }, keyPath: kp }); return; }
    for (const [k, v] of Array.isArray(o) ? o.entries() : Object.entries(o)) if (k !== 'schema') walk(v, kp ? `${kp}.${k}` : String(k), depth + 1);
  })(doc, '', 0);
  return out;
}

/* Connector-typed entries outside every artefact root: derived catalogue summaries, run-time
   copies, evidence notes. Collected so each can be matched to a registered row. Copies a run
   capture holds of its own definition are skipped — capturedCopies() proves them identical. */
const CONNECTOR_TYPES = new Set(['OpenApiConnection', 'ApiConnection', 'OpenApiConnectionWebhook', 'ApiConnectionWebhook', 'Http', 'HttpWebhook', 'Request', 'Response', 'Recurrence', 'Workflow']);
function looseEntries(doc, roots) {
  const rootSet = new Set(roots.flatMap((r) => [r.def, r.origin]).filter(Boolean));
  const out = [];
  (function walk(o, kp, key, depth) {
    if (!o || typeof o !== 'object' || depth > 60 || rootSet.has(o)) return;
    if (!Array.isArray(o) && CONNECTOR_TYPES.has(o.type) && (o.inputs || o.runAfter || o.operationId || o.kind || o.recurrence)) {
      out.push({ keyPath: kp, name: o.name || o.actionName || key, type: o.type, operationId: o.operationId || o.inputs?.host?.operationId || null });
    }
    for (const [k, v] of Array.isArray(o) ? o.entries() : Object.entries(o)) {
      if (['get_flow_body', 'action_definitions', 'definitionSummary', 'schema'].includes(k)) continue;
      walk(v, kp ? `${kp}.${k}` : String(k), Array.isArray(o) ? key : k, depth + 1);
    }
  })(doc, '', null, 0);
  return out;
}

/* Every action and trigger, depth first: actions nest under actions, else.actions,
   default.actions and cases.*.actions. A flow can also hold a whole scope as DATA — a
   designer-paste `serializedValue` inside a Compose's inputs, kept for re-pasting. Those
   actions never run, but they name connections, so they are walked too and marked inert. */
function embeddedInInputs(inputs) {
  const out = [];
  (function walk(o, kp, depth) {
    if (!o || typeof o !== 'object' || depth > 30) return;
    if (!Array.isArray(o)) {
      if (o.serializedValue && typeof o.serializedValue === 'object' && (o.serializedValue.actions || o.serializedValue.type)) {
        out.push({ keyPath: kp, actions: { [o.nodeId || 'serializedValue']: o.serializedValue } }); return;
      }
      if (isActionMap(o.actions)) { out.push({ keyPath: kp, actions: o.actions }); return; }
      if (o.type && WDL_TYPES.has(o.type) && (o.actions || o.inputs) && kp) { out.push({ keyPath: kp, actions: { [kp.split('.').pop()]: o } }); return; }
    }
    for (const [k, v] of Array.isArray(o) ? o.entries() : Object.entries(o)) walk(v, kp ? `${kp}.${k}` : String(k), depth + 1);
  })(inputs, '', 0);
  return out;
}
function walkActions(def) {
  const out = [];
  for (const [name, t] of Object.entries(def.triggers || {})) {
    if (t && typeof t === 'object') out.push({ role: 'trigger', name, action: t, path: name });
  }
  (function rec(actions, path, inert) {
    if (!actions || typeof actions !== 'object') return;
    for (const [name, a] of Object.entries(actions)) {
      if (!a || typeof a !== 'object') continue;
      const here = path ? `${path}/${name}` : name;
      out.push({ role: inert ? 'inert action (held as data, never executed)' : 'action', name, action: a, path: here });
      rec(a.actions, here, inert);
      rec(a.else?.actions, `${here}/else`, inert);
      if (a.else && !a.else.actions && isActionMap(a.else)) rec(a.else, `${here}/else`, inert);
      rec(a.default?.actions, `${here}/default`, inert);
      for (const [c, b] of Object.entries(a.cases || {})) rec(b?.actions, `${here}/case:${c}`, inert);
      if (a.inputs && typeof a.inputs === 'object' && !/Connection|^Http$|^Response$/.test(a.type || '')) {
        for (const e of embeddedInInputs(a.inputs)) rec(e.actions, `${here}/inputs:${e.keyPath || '.'}`, true);
      }
    }
  })(def.actions, '', false);
  return out;
}

/* ── classification ─────────────────────────────────────────────────────────────────── */

const FAMILIES = [
  [/^docs\/folio-Master-Flows-and-Endpoints\/contracts\/deployed\//, 'deployed export (live tenant)', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/contracts\/recovered\//, 'recovered export', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/exports\/.*\.zip$/, 'solution package export (zip)', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/artifacts\/matched-flow-packages\//, 'matched flow package set (zip of solution packages)', false],
  [/^releases\//, 'release bundle (zip)', false],
  [/^mailer\/flows\/packages\//, 'mailer solution package (zip)', false],
  [/^mailer\/flows\//, 'mailer flow definition', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/surfaces\/internal\/import-package\//, 'import package (build output)', false],
  [/\/console-apply\//, 'console-apply script (generated from designer-paste)', true],
  [/designer-paste|\/fresh-flow\/|\/harvester\/|\/inventory\//, 'designer-paste scope (build output)', false],
  [/flow_run_record|\/run-records\//, 'run capture (definition embedded)', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/packages\//, 'design package / patched definition', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/surfaces\/governance\//, 'governance corrected definition', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/deployment\/sharepoint\/remediation\//, 'remediation patched definition', false],
  [/^docs\/folio-Master-Flows-and-Endpoints\/provisioning\//, 'generated documentation (derived)', true],
  [/^docs\/reference\/foundational\//, 'foundational reference corpus (superseded estate, D5)', false],
  [/^scripts\//, 'script-embedded definition', true],
  [/^tests\//, 'test fixture', true],
  [/\/evidence\//, 'evidence record', false],
  [/./, 'other', false],
];
function familyOf(rel, loc) {
  for (const [re, label, derived] of FAMILIES) if (re.test(rel) || re.test(loc || '')) return { family: label, derived };
  return { family: 'other', derived: false };
}

const DISPLAY_EVIDENCE = new Map(); // apiName -> Set(display names seen in the repo)
const noteDisplay = (api, name) => {
  if (!api || !name) return;
  if (!DISPLAY_EVIDENCE.has(api)) DISPLAY_EVIDENCE.set(api, new Set());
  DISPLAY_EVIDENCE.get(api).add(name);
};
const apiNameOf = (apiId) => (typeof apiId === 'string' ? apiId.split('/').pop() : null);
const baseApiFromKey = (k) => (typeof k === 'string' ? k.replace(/[-_]\d+$/, '') : null);

/* Connection references the document itself declares, in all the places an export puts them. */
function docConnectionReferences(doc, pkg) {
  const refs = [];
  const add = (key, v, where) => {
    const apiId = v?.id || v?.apiId || v?.api?.id || null;
    refs.push({
      key: key ?? null,
      apiId,
      apiName: apiNameOf(apiId) || baseApiFromKey(key),
      connectionName: v?.connectionName ?? v?.connection?.connectionReferenceLogicalName ?? v?.connectionId ?? null,
      displayName: v?.displayName ?? v?.api?.displayName ?? null,
      source: v?.source ?? null,
      tier: v?.tier ?? null,
      runtimeSource: v?.runtimeSource ?? null,
      declaredIn: where,
    });
    noteDisplay(apiNameOf(apiId), v?.displayName);
  };
  const seen = new Set();
  (function walk(o, path, depth) {
    if (!o || typeof o !== 'object' || depth > 12 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const here = path ? `${path}.${k}` : k;
      if (k === 'connectionReferences' && v && typeof v === 'object') {
        if (Array.isArray(v)) v.forEach((x, i) => add(x?.key ?? null, x, `${here}[${i}]`));
        else for (const [rk, rv] of Object.entries(v)) add(rk, rv, `${here}.${rk}`);
      } else if (k === 'connection_references' && Array.isArray(v)) {
        v.forEach((x, i) => add(null, x, `${here}[${i}]`));
      } else if (k === '$connections' && v?.defaultValue && typeof v.defaultValue === 'object') {
        for (const [rk, rv] of Object.entries(v.defaultValue)) add(rk, rv, `${here}.defaultValue.${rk}`);
      } else if (k === 'value' && path.endsWith('$connections') && v && typeof v === 'object') {
        for (const [rk, rv] of Object.entries(v)) add(rk, rv, `${here}.${rk}`);
      } else if (k !== 'actions' && k !== 'triggers' && k !== 'action_definitions') walk(v, here, depth + 1);
    }
  })(doc, '', 0);
  if (pkg) for (const r of pkg) refs.push(r);
  return refs;
}

/* ── per-action description ─────────────────────────────────────────────────────────── */

const SP_INDEX = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'docs/reference/sharepoint-list-index.json'), 'utf8')).lists || {}; } catch { return {}; }
})();
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const isExpr = (v) => typeof v === 'string' && /@\{|^@[a-z]/i.test(v);

function resolveList(table) {
  if (typeof table !== 'string' || !table) return { listResolution: 'not declared' };
  if (isExpr(table)) return { listResolution: 'dynamic — chosen at run time by an expression' };
  const g = table.match(GUID);
  if (g) {
    const hit = SP_INDEX[g[0].toLowerCase()];
    return hit
      ? { listGuid: g[0].toLowerCase(), listTitle: hit.title, listSite: hit.siteUrl || hit.site, listResolution: 'by GUID (sharepoint-list-index.json)' }
      : { listGuid: g[0].toLowerCase(), listResolution: 'GUID not in sharepoint-list-index.json' };
  }
  return { listTitle: table, listResolution: 'named literally' };
}

function paramOf(inputs, name) {
  const p = inputs?.parameters;
  if (p && p[name] !== undefined) return p[name];
  if (p && p[`parameters/${name}`] !== undefined) return p[`parameters/${name}`];
  return undefined;
}

function describe(entry, docRefs) {
  const { role, name, action: a, path } = entry;
  const inputs = a.inputs && typeof a.inputs === 'object' ? a.inputs : null;
  const host = inputs?.host && typeof inputs.host === 'object' ? inputs.host : null;
  const rec = {
    role, name, path, type: a.type ?? null, kind: a.kind ?? null,
    connectorClass: null, apiId: null, apiName: null, apiNameProvenance: null,
    connectionReference: null, connectionReferenceForm: null, connectionResource: null, connectionResourceProvenance: null, operationId: null,
    method: null, target: null,
    sharePoint: null,
    parameters: null, inputs: null,
    runAfter: a.runAfter ?? null,
    runtimeConfiguration: a.runtimeConfiguration ?? null,
    retryPolicy: inputs?.retryPolicy ?? null,
    authentication: inputs?.authentication ?? null,
    operationOptions: a.operationOptions ?? null,
    limit: a.limit ?? null,
    description: a.description ?? null,
    trackedProperties: a.trackedProperties ?? null,
    secureData: a.runtimeConfiguration?.secureData ?? null,
    operationMetadataId: a.metadata?.operationMetadataId ?? null,
  };
  const t = a.type;
  if (/Connection/.test(t || '') || (host && (host.apiId || host.connection || host.connectionName))) {
    rec.connectorClass = 'managed connector';
    const refKey = host?.connectionName
      ?? (typeof host?.connection === 'string' ? host.connection : null)
      ?? host?.connection?.referenceName
      ?? (typeof host?.connection?.name === 'string' ? (host.connection.name.match(/\['([^']+)'\]/)?.[1] ?? host.connection.name) : null);
    rec.connectionReference = refKey ?? null;
    rec.connectionReferenceForm = !host ? 'no host block'
      : host.connectionName !== undefined ? 'host.connectionName'
        : typeof host.connection === 'string' ? 'host.connection (string)'
          : host.connection?.referenceName !== undefined ? 'host.connection.referenceName'
            : host.connection?.name !== undefined ? 'host.connection.name ($connections expression)' : 'not named';
    rec.operationId = host?.operationId ?? null;
    if (!host) rec.apiNameProvenance = 'no host block in the artefact — connector not declared';
    if (host?.apiId) { rec.apiId = host.apiId; rec.apiName = apiNameOf(host.apiId); rec.apiNameProvenance = 'host.apiId'; }
    else {
      const ref = docRefs.find((r) => r.key === refKey && r.apiName);
      if (ref) { rec.apiId = ref.apiId; rec.apiName = ref.apiName; rec.apiNameProvenance = `connection reference (${ref.declaredIn})`; }
      else if (refKey) { rec.apiName = baseApiFromKey(refKey); rec.apiNameProvenance = 'inferred from the connection key (no apiId in the artefact)'; }
      else { rec.apiName = '(connector not declared)'; rec.apiNameProvenance ??= 'no connection named'; }
    }
    const ref = refKey ? docRefs.find((r) => r.key === refKey && r.connectionName) : null;
    rec.connectionResource = ref ? ref.connectionName : null;
    if (t === 'ApiConnection' || t === 'ApiConnectionWebhook') {
      rec.method = inputs?.method ?? null;
      rec.target = inputs?.path ?? null;
      if (!rec.operationId && inputs?.method) {
        rec.operationId = `${String(inputs.method).toUpperCase()} ${String(inputs.path || '').replace(/@\{[^}]*\}/g, '{…}')}`;
      }
      const { host: _h, ...rest } = inputs || {};
      rec.parameters = rest;
      if (!rec.operationId && !host) rec.operationId = `(no host) ${inputs?.path ?? ''}`.trim();
    } else {
      rec.parameters = inputs?.parameters ?? null;
    }
    if (/sharepointonline/.test(rec.apiName || '')) {
      let dataset = paramOf(inputs, 'dataset');
      let table = paramOf(inputs, 'table');
      if (dataset === undefined && typeof inputs?.path === 'string') {
        dataset = inputs.path.match(/datasets\/@\{encodeURIComponent\(encodeURIComponent\('([^']+)'\)\)\}/)?.[1];
        table = inputs.path.match(/tables\/@\{encodeURIComponent\(encodeURIComponent\('([^']+)'\)\)\}/)?.[1];
      }
      const uri = paramOf(inputs, 'uri');
      if (table === undefined && typeof uri === 'string') {
        table = uri.match(/lists\s*\(\s*guid'+([0-9a-f-]{36})'+\s*\)/i)?.[1] ?? uri.match(/getbytitle\s*\(\s*'+([^'()]+)'+\s*\)/i)?.[1];
      }
      rec.sharePoint = { site: typeof dataset === 'string' ? dataset : null, table: typeof table === 'string' ? table : null, restUri: typeof uri === 'string' ? uri : null, ...resolveList(table) };
    }
    rec.target = rec.target ?? paramOf(inputs, 'uri')
      ?? (rec.sharePoint && (rec.sharePoint.site || rec.sharePoint.table) ? `${rec.sharePoint.site ?? '(site not declared)'} :: ${rec.sharePoint.listTitle ?? rec.sharePoint.table ?? '(no list)'}` : null);
  } else if (t === 'Http' || t === 'HttpWebhook') {
    rec.connectorClass = 'built-in HTTP';
    rec.apiName = t === 'Http' ? 'builtin:http' : 'builtin:httpwebhook';
    rec.apiNameProvenance = 'action type';
    rec.method = inputs?.method ?? null;
    rec.target = inputs?.uri ?? inputs?.subscribe?.uri ?? null;
    rec.operationId = `${rec.method || ''} ${typeof rec.target === 'string' ? (rec.target.match(/^https?:\/\/([^/]+)/)?.[1] || '(expression)') : ''}`.trim();
    rec.parameters = inputs;
  } else if (t === 'Request') {
    rec.connectorClass = 'built-in trigger';
    rec.apiName = 'builtin:request';
    rec.apiNameProvenance = 'trigger type';
    rec.method = inputs?.method ?? null;
    rec.target = inputs?.relativePath ?? null;
    rec.operationId = `${a.kind || 'Request'} trigger`;
    const { schema, ...rest } = inputs || {};
    rec.parameters = { ...rest, schemaTopLevelProperties: schema?.properties ? Object.keys(schema.properties) : null, schemaRequired: schema?.required ?? null, schemaSha256: schema ? sha(JSON.stringify(schema)).slice(0, 16) : null };
  } else if (t === 'Response') {
    rec.connectorClass = 'built-in response';
    rec.apiName = 'builtin:response';
    rec.apiNameProvenance = 'action type';
    rec.operationId = `Response ${inputs?.statusCode ?? ''}`.trim();
    rec.parameters = inputs;
  } else if (t === 'Recurrence') {
    rec.connectorClass = 'built-in trigger';
    rec.apiName = 'builtin:recurrence';
    rec.apiNameProvenance = 'trigger type';
    rec.operationId = 'Recurrence';
    rec.parameters = { recurrence: a.recurrence ?? null, evaluatedRecurrence: a.evaluatedRecurrence ?? null };
  } else if (t === 'Workflow' || t === 'Function' || t === 'ApiManagement') {
    rec.connectorClass = 'built-in call';
    rec.apiName = `builtin:${t.toLowerCase()}`;
    rec.apiNameProvenance = 'action type';
    rec.operationId = host?.workflowReferenceName || host?.triggerName || t;
    rec.parameters = inputs;
  } else {
    return null; // control / data operation — counted in the artefact's type inventory
  }
  rec.inputs = inputs;
  return rec;
}

/* ── zip package side-files: connectionsMap / apisMap / manifest ────────────────────── */

function packageConnectionIndex(members) {
  // members: [{member, obj}] for one archive
  const manifest = members.find((m) => /(^|\/)manifest\.json$/.test(m.member) && m.obj?.resources)?.obj;
  const byRes = manifest?.resources || {};
  const out = [];
  for (const m of members) {
    const base = basename(m.member);
    if (base !== 'connectionsMap.json' && base !== 'apisMap.json') continue;
    for (const [key, resId] of Object.entries(m.obj || {})) {
      const r = byRes[resId];
      out.push({ map: base, key, resourceId: resId, resourceType: r?.type ?? null, displayName: r?.details?.displayName ?? null, apiId: r?.id ?? null, creationType: r?.creationType ?? r?.suggestedCreationType ?? null, member: m.member });
      if (base === 'apisMap.json') noteDisplay(key, r?.details?.displayName);
    }
  }
  const connectionsByKey = {};
  for (const e of out) {
    connectionsByKey[e.key] ??= { key: e.key };
    if (e.map === 'connectionsMap.json') Object.assign(connectionsByKey[e.key], { connectionResourceId: e.resourceId, connectionDisplayName: e.displayName, connectionCreationType: e.creationType });
    else Object.assign(connectionsByKey[e.key], { apiResourceId: e.resourceId, apiDisplayName: e.displayName, apiId: e.apiId });
  }
  return { entries: out, byKey: connectionsByKey, packageName: manifest?.details?.displayName ?? null, createdTime: manifest?.details?.createdTime ?? null };
}

/* A run capture carries the same definition up to three times (design_definition.definition,
   get_flow_body.properties.definition, action_definitions) plus a platform definitionSummary.
   It is counted once; the copies are compared so that "counted once" is shown to be safe. */
function capturedCopies(doc, def) {
  const dd = doc?.design_definition;
  if (!dd || typeof dd !== 'object') return null;
  const h = (x) => (x ? sha(JSON.stringify(x)).slice(0, 16) : null);
  const gfb = dd.get_flow_body?.properties?.definition;
  return {
    counted: 'design_definition.definition',
    getFlowBodyDefinition: gfb ? (h(gfb) === h(def) ? 'identical — not counted again' : 'DIFFERS from the counted definition') : 'absent',
    actionDefinitions: dd.action_definitions ? (h(dd.action_definitions) === h(def.actions) ? 'identical to definition.actions — not counted again' : 'DIFFERS from definition.actions') : 'absent',
    definitionSummaryEntries: Array.isArray(dd.get_flow_body?.properties?.definitionSummary?.actions) ? dd.get_flow_body.properties.definitionSummary.actions.length : null,
  };
}

/* ── the build ──────────────────────────────────────────────────────────────────────── */

const sources = [];
const artefacts = [];
const actions = [];
const mentions = [];
const archiveGroups = new Map();
const loose = [];
const TOKEN = /shared_[A-Za-z0-9_-]+|\/providers\/Microsoft\.PowerApps\/apis\/[A-Za-z0-9_-]+/g;

for (const src of sourceTexts()) {
  const loc = src.loc;
  if (src.error) { sources.push({ source: loc, candidate: true, parsed: false, artefacts: 0, note: src.error }); continue; }
  const text = src.text;
  const tokens = text.match(TOKEN);
  if (tokens) {
    const counts = {};
    for (const tk of tokens) { const k = tk.replace(/^\/providers\/Microsoft\.PowerApps\/apis\//, ''); counts[k] = (counts[k] || 0) + 1; }
    mentions.push({ source: loc, tokens: counts });
  }
  const candidate = MARKER.test(text) || /"actions"\s*:|"triggers"\s*:|"serializedValue"/.test(text);
  if (!candidate) continue;
  const { whole, objects } = parsedObjects(text);
  const fam = familyOf(src.rel, src.loc);
  let found = 0;
  if (src.archive) {
    archiveGroups.set(src.archive, archiveGroups.get(src.archive) || []);
    for (const o of objects) archiveGroups.get(src.archive).push({ member: src.member, obj: o });
  }
  objects.forEach((doc, docIndex) => {
    const roots = findArtefactRoots(doc, src.rel);
    for (const le of looseEntries(doc, roots)) loose.push({ source: loc, objectIndex: whole ? null : docIndex, ...le });
    for (const root of roots) {
      const entries = walkActions(root.def);
      if (!entries.length) continue;
      found++;
      const id = identity(doc);
      const stem = basename(src.member || src.rel).replace(/\.(json|js|mjs|md|txt|html)$/i, '').replace(/\.designer-paste$|\.console-apply$/, '');
      const jsFlow = /const FLOW_ID = "([0-9a-f]{32})"/.exec(text)?.[1] ?? null;
      const label = id.displayName || doc?.properties?.displayName || doc?.display_name
        || (root.shape === 'designer-paste scope' || fam.family.startsWith('console-apply') ? `${stem} (scope ${doc?.nodeId || Object.keys(root.def.actions || {})[0]})` : null)
        || (/^(definition|definition_raw|flow|standard)$/i.test(stem) ? basename(join((src.member || src.rel).replace(/\\/g, '/'), '..')) || stem : stem);
      const artefactId = `A${String(artefacts.length + 1).padStart(4, '0')}`;
      maskContext = `${artefactId} ${loc}`;
      const docRefs = docConnectionReferences(doc);
      const typeInventory = {};
      for (const e of entries) typeInventory[e.action.type ?? '(untyped)'] = (typeInventory[e.action.type ?? '(untyped)'] || 0) + 1;
      const rows = [];
      for (const e of entries) {
        const r = describe(e, docRefs);
        if (!r) continue;
        const rowId = `${artefactId}.${String(rows.length + 1).padStart(3, '0')}`;
        maskContext = `${rowId} ${loc} :: ${r.path}`;
        rows.push({ rowId, artefactId, flow: label, source: loc, ...maskDeep(r, `${rowId}`) });
      }
      maskContext = `${artefactId} ${loc}`;
      artefacts.push({
        artefactId, flow: label, source: loc, family: fam.family, derived: fam.derived,
        shape: root.shape, keyPathInObject: root.keyPath || null, objectIndexInSource: whole ? null : docIndex,
        displayName: id.displayName ?? null, internalName: id.internalName ?? doc?.name ?? null, workflowId: id.workflowId ?? jsFlow,
        environment: doc?.workflow_identity?.tags?.environmentName ?? doc?.properties?.environment?.name ?? null,
        exportedAtUtc: doc?.exportedAtUtc ?? doc?.capture_metadata?.captured_at_utc ?? null,
        flowApiId: doc?.properties?.apiId ?? doc?.design_definition?.get_flow_body?.properties?.apiId ?? null,
        nodeId: doc?.nodeId ?? null,
        connectionReferences: maskDeep(docRefs),
        typeInventory, totalEntries: entries.length, connectorRows: rows.length,
        definitionSha256: sha(JSON.stringify(root.def)).slice(0, 16),
        duplicateCopiesInSource: capturedCopies(doc, root.def),
      });
      actions.push(...rows);
    }
  });
  sources.push({ source: loc, candidate: true, parsed: whole ? 'whole-file JSON' : `embedded objects (${objects.length})`, artefacts: found,
    family: fam.family, note: found ? null : (objects.length ? 'JSON present but no action/trigger map — reference data, schema, side-file or single-action snippet' : 'connector markers in prose/code; no JSON object parsed') });
}

/* package side-files → attach to the artefacts from the same archive */
const packages = [];
for (const [rel, members] of [...archiveGroups.entries()].sort(sortBy(([k]) => k))) {
  const idx = packageConnectionIndex(members);
  if (!idx.entries.length) continue;
  packages.push({ archive: rel, packageName: idx.packageName, createdTime: idx.createdTime, connections: Object.values(idx.byKey).sort(sortBy((x) => x.key)) });
  for (const a of artefacts.filter((x) => x.source.startsWith(`${rel}!`) && !x.source.slice(rel.length + 1).includes('!'))) {
    a.packageConnections = Object.values(idx.byKey);
    for (const r of actions.filter((x) => x.artefactId === a.artefactId)) {
      const pc = idx.byKey[r.connectionReference];
      if (pc) {
        if (!r.connectionResource) { r.connectionResource = pc.connectionResourceId; r.connectionResourceProvenance = 'solution package connectionsMap.json (package resource id)'; }
        r.connectionAccount = pc.connectionDisplayName;
      }
    }
    for (const cr of a.connectionReferences) { const pc = idx.byKey[cr.key]; if (pc) cr.connectionAccount = pc.connectionDisplayName; }
  }
}
/* every row carries its backing connection where the artefact declares one */
for (const r of actions) {
  if (r.connectionResource) { r.connectionResourceProvenance ??= 'declared for this key in the artefact'; continue; }
  if (r.connectorClass !== 'managed connector' || !r.apiName) continue;
  const a = artefacts.find((x) => x.artefactId === r.artefactId);
  const cr = r.connectionReference ? a?.connectionReferences.find((c) => c.key === r.connectionReference && c.connectionName) : null;
  if (cr) {
    r.connectionResource = cr.connectionName; r.connectionResourceProvenance = 'declared for this key in the artefact';
    r.connectionAccount ??= cr.connectionAccount ?? null;
    continue;
  }
  /* A run capture lists its connections without the keys actions use. Where the capture
     declares exactly ONE connection for this connector, every key of that connector in the
     flow can only be bound to it — recorded, and labelled as inferred. */
  const sole = uniq((a?.connectionReferences || []).filter((c) => c.key === null && c.apiName === r.apiName).map((c) => c.connectionName));
  if (sole.length === 1) { r.connectionResource = sole[0]; r.connectionResourceProvenance = 'inferred: the only connection this artefact declares for this connector'; }
  else if (sole.length > 1) r.connectionResourceProvenance = `ambiguous: the artefact declares ${sole.length} unkeyed connections for this connector (${sole.join(', ')})`;
  else r.connectionResourceProvenance = 'not declared: the artefact carries no connection reference for this key';
}
for (const r of actions) r.connectionAccount ??= null;

/* ── catalogues ─────────────────────────────────────────────────────────────────────── */

const byApi = new Map();
for (const r of actions) {
  const k = r.apiName || '(unresolved)';
  if (!byApi.has(k)) byApi.set(k, []);
  byApi.get(k).push(r);
}
const artefactOf = new Map(artefacts.map((a) => [a.artefactId, a]));
const connectors = [...byApi.entries()].sort(sortBy(([k]) => k)).map(([api, rows]) => {
  const ops = {};
  for (const r of rows) ops[r.operationId || '(none)'] = (ops[r.operationId || '(none)'] || 0) + 1;
  const refsDeclared = api.startsWith('builtin:') ? [] : artefacts.flatMap((a) => a.connectionReferences.filter((c) => c.apiName === api));
  return {
    apiName: api,
    connectorClass: uniq(rows.map((r) => r.connectorClass)),
    displayNamesEvidenced: uniq([...(DISPLAY_EVIDENCE.get(api) || [])]),
    apiIds: uniq(rows.map((r) => r.apiId)),
    connectionReferenceKeys: uniq([...rows.map((r) => r.connectionReference), ...refsDeclared.map((c) => c.key)]),
    connectionResources: uniq([...rows.map((r) => r.connectionResource), ...refsDeclared.map((c) => c.connectionName)]),
    connectionAccounts: uniq([...rows.map((r) => r.connectionAccount), ...refsDeclared.map((c) => c.connectionAccount)]),
    uses: rows.length,
    usesInPrimaryArtefacts: rows.filter((r) => !artefactOf.get(r.artefactId).derived).length,
    artefacts: uniq(rows.map((r) => r.artefactId)).length,
    flows: uniq(rows.map((r) => r.flow)),
    families: uniq(rows.map((r) => artefactOf.get(r.artefactId).family)),
    operations: Object.fromEntries(Object.entries(ops).sort(sortBy(([k]) => k))),
  };
});

const opMap = new Map();
for (const r of actions) {
  const k = `${r.apiName}\u0000${r.operationId}`;
  if (!opMap.has(k)) opMap.set(k, []);
  opMap.get(k).push(r);
}
const operations = [...opMap.entries()].sort(sortBy(([k]) => k)).map(([k, rows]) => {
  const [apiName, operationId] = k.split('\u0000');
  const keys = {};
  for (const r of rows) {
    const p = r.parameters && typeof r.parameters === 'object' ? r.parameters : {};
    for (const pk of Object.keys(p)) keys[pk] = (keys[pk] || 0) + 1;
  }
  return {
    apiName, operationId, uses: rows.length,
    parameterKeys: Object.fromEntries(Object.entries(keys).sort(sortBy(([x]) => x))),
    connectionReferenceKeys: uniq(rows.map((r) => r.connectionReference)),
    flows: uniq(rows.map((r) => r.flow)),
    rows: rows.map((r) => r.rowId),
  };
});

const connMap = new Map();
const noteConn = (res, info) => {
  if (!res) return;
  if (!connMap.has(res)) connMap.set(res, { connectionResource: res, apiNames: new Set(), keys: new Set(), accounts: new Set(), displayNames: new Set(), artefacts: new Set(), flows: new Set(), declaredOnly: true });
  const c = connMap.get(res);
  if (info.apiName) c.apiNames.add(info.apiName);
  if (info.key) c.keys.add(info.key);
  if (info.account) c.accounts.add(info.account);
  if (info.displayName) c.displayNames.add(info.displayName);
  if (info.artefactId) c.artefacts.add(info.artefactId);
  if (info.flow) c.flows.add(info.flow);
  if (info.used) c.declaredOnly = false;
};
for (const a of artefacts) for (const cr of a.connectionReferences) noteConn(cr.connectionName, { apiName: cr.apiName, key: cr.key, account: cr.connectionAccount, displayName: cr.displayName, artefactId: a.artefactId, flow: a.flow });
for (const r of actions) noteConn(r.connectionResource, { apiName: r.apiName, key: r.connectionReference, account: r.connectionAccount, artefactId: r.artefactId, flow: r.flow, used: true });
const connections = [...connMap.values()].sort(sortBy((c) => c.connectionResource)).map((c) => ({
  connectionResource: c.connectionResource, apiNames: uniq([...c.apiNames]), referenceKeys: uniq([...c.keys]),
  accounts: uniq([...c.accounts]), displayNames: uniq([...c.displayNames]), artefacts: c.artefacts.size, flows: uniq([...c.flows]),
  boundToAnAction: !c.declaredOnly,
}));

const refKeyMap = new Map();
for (const r of actions.filter((x) => x.connectorClass === 'managed connector')) {
  const k = `${r.apiName}\u0000${r.connectionReference}`;
  if (!refKeyMap.has(k)) refKeyMap.set(k, []);
  refKeyMap.get(k).push(r);
}
const connectionReferenceKeys = [...refKeyMap.entries()].sort(sortBy(([k]) => k)).map(([k, rows]) => {
  const [apiName, key] = k.split('\u0000');
  return { apiName, key, uses: rows.length, connectionResources: uniq(rows.map((r) => r.connectionResource)), accounts: uniq(rows.map((r) => r.connectionAccount)), operations: uniq(rows.map((r) => r.operationId)), flows: uniq(rows.map((r) => r.flow)) };
});

const spMap = new Map();
for (const r of actions.filter((x) => x.sharePoint)) {
  const s = r.sharePoint;
  const k = `${s.site || s.listSite || '(site not declared)'}\u0000${s.listGuid || s.listTitle || s.table || '(no list)'}`;
  if (!spMap.has(k)) spMap.set(k, []);
  spMap.get(k).push(r);
}
const sharePointTargets = [...spMap.entries()].sort(sortBy(([k]) => k)).map(([k, rows]) => {
  const [site, list] = k.split('\u0000');
  const s = rows[0].sharePoint;
  return { site, list, listTitle: s.listTitle ?? null, listResolution: s.listResolution, uses: rows.length, operations: uniq(rows.map((r) => r.operationId)), flows: uniq(rows.map((r) => r.flow)) };
});

const httpTargets = [];
{
  const m = new Map();
  for (const r of actions.filter((x) => x.connectorClass === 'built-in HTTP')) {
    const k = `${r.method}\u0000${r.target}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  for (const [k, rows] of [...m.entries()].sort(sortBy(([x]) => x))) {
    const [method, target] = k.split('\u0000');
    httpTargets.push({ method, target, uses: rows.length, headerNames: uniq(rows.flatMap((r) => Object.keys(r.parameters?.headers || {}))), flows: uniq(rows.map((r) => r.flow)), rows: rows.map((r) => r.rowId) });
  }
}

/* flows: every artefact grouped under its label */
const flowMap = new Map();
for (const a of artefacts) {
  const k = a.flow;
  if (!flowMap.has(k)) flowMap.set(k, []);
  flowMap.get(k).push(a);
}
const flows = [...flowMap.entries()].sort(sortBy(([k]) => k.toLowerCase())).map(([flow, arts]) => {
  const rows = actions.filter((r) => r.flow === flow);
  return { flow, artefacts: arts.map((a) => ({ artefactId: a.artefactId, family: a.family, source: a.source })), connectors: uniq(rows.map((r) => r.apiName)), connectorRows: rows.length };
});

/* every token mention outside artefact-bearing sources is still indexed */
const artefactSources = new Set(artefacts.map((a) => a.source));
const usedApis = new Set(actions.map((r) => r.apiName));
const declaredApis = new Set(artefacts.flatMap((a) => a.connectionReferences.map((c) => c.apiName)));
const allTokens = {};
for (const m of mentions) for (const [tk, n] of Object.entries(m.tokens)) {
  allTokens[tk] ??= { token: tk, occurrences: 0, files: 0 };
  allTokens[tk].occurrences += n; allTokens[tk].files += 1;
}
const tokenIndex = Object.values(allTokens).sort(sortBy((t) => t.token)).map((t) => {
  const base = baseApiFromKey(t.token);
  const cls = usedApis.has(t.token) ? 'connector API bound to at least one action'
    : declaredApis.has(t.token) ? 'connector API declared in a connection reference'
      : actions.some((r) => r.connectionReference === t.token) ? 'connection reference key bound to at least one action'
        : (usedApis.has(base) || declaredApis.has(base)) ? 'connection reference key variant of a known connector API (not bound in any parsed artefact)'
          : t.token === 'shared_logicflows' ? 'the flow resource\'s own apiId (Power Automate) — not an action connector'
            : 'identifier sharing the shared_ prefix — no connector binding found for it';
  return { ...t, classification: cls };
});

/* ── integrity cross-check against the generated provisioning pages ────────────────── */
const reconciliation = [];
for (const s of sources.filter((x) => x.source.startsWith('docs/folio-Master-Flows-and-Endpoints/provisioning/flows/'))) {
  const md = readFileSync(join(ROOT, s.source), 'utf8');
  const srcPkg = md.match(/Source package \| `([^`]+)`/)?.[1];
  const table = md.split('## 4. Connections and references')[1]?.split('\n## ')[0] || '';
  const claimed = {};
  for (const line of table.split('\n')) {
    const m = line.match(/^\| `([^`]+)` \| `([^`]+)` \| [^|]* \| (.+) \|$/);
    if (!m) continue;
    for (const op of m[3].matchAll(/`([^`]+)`×(\d+)/g)) claimed[`${m[1]} ${op[1]}`] = Number(op[2]);
  }
  const arts = artefacts.filter((a) => a.source === srcPkg);
  const actual = {};
  for (const r of actions.filter((x) => arts.some((a) => a.artefactId === x.artefactId) && x.connectorClass === 'managed connector' && x.role === 'action')) {
    const k = `${r.connectionReference} ${r.operationId}`;
    actual[k] = (actual[k] || 0) + 1;
  }
  const keys = uniq([...Object.keys(claimed), ...Object.keys(actual)]);
  const diffs = keys.filter((k) => claimed[k] !== actual[k]).map((k) => ({ binding: k, page: claimed[k] ?? 0, register: actual[k] ?? 0 }));
  reconciliation.push({ page: s.source, sourcePackage: srcPkg ?? null, sourceInRegister: arts.length > 0, bindingsCompared: keys.length, agrees: arts.length > 0 && diffs.length === 0, differences: diffs });
}

/* ── every connector-typed entry outside an artefact, matched to a registered row ────── */
const rowIndex = new Map();
for (const r of actions) {
  for (const k of [`${r.name}|${r.type}|${r.operationId}`, `${r.name}|${r.type}|`]) {
    if (!rowIndex.has(k)) rowIndex.set(k, []);
    rowIndex.get(k).push(r.rowId);
  }
}
const looseChecked = loose.map((e) => {
  const hits = rowIndex.get(`${e.name}|${e.type}|${e.operationId || ''}`) || rowIndex.get(`${e.name}|${e.type}|`) || [];
  return { ...e, matchedRows: hits.length, exampleRow: hits[0] ?? null };
});
const looseBySource = {};
for (const e of looseChecked) {
  looseBySource[e.source] ??= { source: e.source, entries: 0, matched: 0, unmatched: [] };
  const b = looseBySource[e.source];
  b.entries++;
  if (e.matchedRows) b.matched++; else b.unmatched.push({ keyPath: e.keyPath, name: e.name, type: e.type, operationId: e.operationId });
}
const looseCrossCheck = Object.values(looseBySource).sort(sortBy((b) => b.source));

/* ── assemble ───────────────────────────────────────────────────────────────────────── */

const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(sortBy(([k]) => k)));
const maskSummary = [];
{
  const seen = new Set();
  for (const m of maskings) { const k = `${m.where}|${m.kind}|${m.fingerprint}`; if (!seen.has(k)) { seen.add(k); maskSummary.push(m); } }
  maskSummary.sort(sortBy((m) => `${m.where}|${m.kind}`));
}
const summary = {
  sourcesScanned: 'every tracked file and every member of every tracked archive',
  candidateSources: sources.length,
  sourcesWithArtefacts: sources.filter((s) => s.artefacts > 0).length,
  artefacts: artefacts.length,
  artefactsByFamily: sortObj(count(artefacts, (a) => a.family)),
  distinctFlowLabels: flows.length,
  totalActionsAndTriggersWalked: artefacts.reduce((n, a) => n + a.totalEntries, 0),
  connectorRows: actions.length,
  connectorRowsByClass: sortObj(count(actions, (r) => r.connectorClass)),
  connectorRowsByApi: sortObj(count(actions, (r) => r.apiName)),
  connectors: connectors.length,
  operations: operations.length,
  connectionReferenceKeys: connectionReferenceKeys.length,
  connectionResources: connections.length,
  sharePointTargets: sharePointTargets.length,
  httpTargets: httpTargets.length,
  solutionPackages: packages.length,
  maskedCredentials: maskSummary.length,
  maskedByKind: sortObj(count(maskSummary, (m) => m.kind)),
  entriesOutsideArtefacts: looseChecked.length,
  entriesOutsideArtefactsMatchedToARow: looseChecked.filter((e) => e.matchedRows).length,
  provisioningPagesReconciled: reconciliation.length,
  provisioningPagesAgreeing: reconciliation.filter((r) => r.agrees).length,
};

const register = {
  schema: 'dgo-connector-register/v1',
  whatThisIs: 'Master register of every connector and connection used by every flow action and trigger found in this repository. Generated by scripts/build-connector-register.mjs from every tracked file and archive member — do not edit by hand.',
  howToRead: {
    artefact: 'One flow definition, package, scope or fragment as a file carries it. The same flow can appear in several artefacts (deployed export, package zip, designer-paste, run capture); each is recorded separately and `family` says which kind it is. `derived: true` marks artefacts generated from another artefact in this repository.',
    actionRow: 'One action or trigger that binds a connector: managed connectors (OpenApiConnection / ApiConnection / webhooks) and the built-in network surfaces (HTTP, Request trigger, Response, Recurrence, child-flow calls). Control and data operations are not rows; they are counted in each artefact\'s typeInventory so the walk is shown complete.',
    connectionReference: 'The key an action names (e.g. shared_office365-1). connectionResource is the tenant connection it is bound to where the artefact declares it; connectionAccount is the account shown for that connection in a solution package manifest.',
    masking: 'Credentials are replaced by [MASKED:<kind>#<sha256 first 8 hex>]. Nothing else is altered. See `maskings`.',
    displayNames: 'displayNamesEvidenced lists only names found in the repository (connection references, package manifests) — none is supplied from outside.',
  },
  summary,
  connectors,
  operations,
  connectionReferenceKeys,
  connections,
  solutionPackages: packages,
  sharePointTargets,
  httpTargets,
  flows,
  artefacts,
  actions,
  mentionTokens: tokenIndex,
  mentions: mentions.sort(sortBy((m) => m.source)).map((m) => ({ ...m, holdsArtefact: artefactSources.has(m.source) })),
  sources: sources.sort(sortBy((s) => s.source)),
  reconciliation,
  entriesOutsideArtefacts: looseCrossCheck,
  maskings: maskSummary,
};

/* ── renderers ──────────────────────────────────────────────────────────────────────── */

const J = (v) => JSON.stringify(v);
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : J(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const CSV_COLS = ['rowId', 'artefactId', 'flow', 'family', 'source', 'role', 'path', 'name', 'type', 'kind', 'connectorClass', 'apiName', 'apiId', 'apiNameProvenance',
  'connectionReference', 'connectionReferenceForm', 'connectionResource', 'connectionResourceProvenance', 'connectionAccount', 'operationId', 'method', 'target', 'sharePoint.site', 'sharePoint.table', 'sharePoint.listTitle', 'sharePoint.listResolution',
  'runAfter', 'retryPolicy', 'runtimeConfiguration', 'authentication', 'secureData', 'operationMetadataId', 'parameters'];
function toCsv() {
  const lines = [CSV_COLS.join(',')];
  for (const r of actions) {
    const a = artefactOf.get(r.artefactId);
    lines.push(CSV_COLS.map((c) => {
      if (c === 'family') return csvCell(a.family);
      if (c.startsWith('sharePoint.')) return csvCell(r.sharePoint?.[c.slice(11)]);
      return csvCell(r[c]);
    }).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const code = (s) => (s === null || s === undefined || s === '' ? '—' : `\`${esc(s).replace(/`/g, 'ˋ')}\``);
function toMd() {
  const L = [];
  const p = (...xs) => L.push(...xs);
  p('# Connector & Connection Register', '',
    '> **Master register.** Every connector, connection reference and connection bound by every action and trigger in every flow artefact tracked in this repository.',
    '> Generated by `scripts/build-connector-register.mjs` (`npm run connectors`) — do not edit by hand. `npm run test:connectors` fails if this drifts from the sources.',
    `> Full machine-readable data: [\`connector-register.json\`](connector-register.json) · one row per connector-bound action: [\`connector-register-actions.csv\`](connector-register-actions.csv).`,
    '> Styled workbook (22 sheets, filterable tables, live-formula matrices): [`CONNECTOR_REGISTER.xlsx`](CONNECTOR_REGISTER.xlsx) · interactive flow × connector matrix: [`CONNECTOR_MATRIX.html`](CONNECTOR_MATRIX.html) (open in a browser).',
    '> Connector details, one value per cell: [`CONNECTOR_DETAILS.xlsx`](CONNECTOR_DETAILS.xlsx) (13 sheets) · connector profiles and matrices: [`CONNECTOR_DETAILS_MATRIX.html`](CONNECTOR_DETAILS_MATRIX.html) (open in a browser).',
    '', '> **Credentials are masked, nothing else is.** A signature, bearer token or API key is printed as `[MASKED:<kind>#<fingerprint>]`; §12 lists every one. Every other value is as the source file carries it.', '');
  p('## Contents', '', '1. Summary', '2. Connector catalogue', '3. Operation catalogue', '4. Connection reference keys', '5. Connections (tenant resources)', '6. Solution packages',
    '7. SharePoint targets', '8. HTTP / external endpoints', '9. Flow index', '10. Artefacts and every connector-bound action, with parameters', '11. Coverage: sources, mentions and reconciliation', '12. Masked credentials', '');

  p('## 1. Summary', '', '| Measure | Value |', '|---|---|');
  for (const [k, v] of Object.entries(summary)) p(`| ${k} | ${typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${esc(a)}: **${b}**`).join('<br>') : esc(v)} |`);
  p('');

  p('## 2. Connector catalogue', '', '| Connector (apiName) | Class | Display names (evidenced) | apiId | Reference keys | Connections | Accounts | Uses (primary) | Artefacts | Flows | Operations |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of connectors) {
    p(`| ${code(c.apiName)} | ${esc(c.connectorClass.join(', '))} | ${esc(c.displayNamesEvidenced.join(', ') || '—')} | ${c.apiIds.map(code).join('<br>') || '—'} | ${c.connectionReferenceKeys.map(code).join('<br>') || '—'} | ${c.connectionResources.map(code).join('<br>') || '—'} | ${esc(c.connectionAccounts.join(', ') || '—')} | ${c.uses} (${c.usesInPrimaryArtefacts}) | ${c.artefacts} | ${c.flows.length} | ${Object.entries(c.operations).map(([o, n]) => `${code(o)}×${n}`).join('<br>')} |`);
  }
  p('');

  p('## 3. Operation catalogue', '', 'Each operation with every parameter key it is called with (and how many calls carry that key).', '', '| Connector | Operation | Uses | Parameter keys (calls) | Reference keys | Flows |', '|---|---|---|---|---|---|');
  for (const o of operations) p(`| ${code(o.apiName)} | ${code(o.operationId)} | ${o.uses} | ${Object.entries(o.parameterKeys).map(([k, n]) => `${code(k)} ${n}`).join('<br>') || '—'} | ${o.connectionReferenceKeys.map(code).join('<br>') || '—'} | ${o.flows.map(esc).join('<br>')} |`);
  p('');

  p('## 4. Connection reference keys', '', '| Connector | Reference key | Uses | Bound connection(s) | Account(s) | Operations | Flows |', '|---|---|---|---|---|---|---|');
  for (const k of connectionReferenceKeys) p(`| ${code(k.apiName)} | ${code(k.key)} | ${k.uses} | ${k.connectionResources.map(code).join('<br>') || '_not declared in the artefact_'} | ${esc(k.accounts.join(', ') || '—')} | ${k.operations.map(code).join('<br>')} | ${k.flows.map(esc).join('<br>')} |`);
  p('');

  p('## 5. Connections (tenant resources)', '', '| Connection | Connector(s) | Reference keys | Account / display | Bound to an action | Artefacts | Flows |', '|---|---|---|---|---|---|---|');
  for (const c of connections) p(`| ${code(c.connectionResource)} | ${c.apiNames.map(code).join('<br>')} | ${c.referenceKeys.map(code).join('<br>') || '—'} | ${esc([...c.accounts, ...c.displayNames].join(', ') || '—')} | ${c.boundToAnAction ? 'yes' : 'declared only'} | ${c.artefacts} | ${c.flows.map(esc).join('<br>')} |`);
  p('');

  p('## 6. Solution packages', '');
  for (const pk of packages) {
    p(`### ${esc(pk.packageName || pk.archive)}`, '', `Archive ${code(pk.archive)} · created ${code(pk.createdTime)}`, '', '| Key | API | API resource | Connection resource | Connection account | Creation |', '|---|---|---|---|---|---|');
    for (const c of pk.connections) p(`| ${code(c.key)} | ${esc(c.apiDisplayName || '—')} ${code(c.apiId)} | ${code(c.apiResourceId)} | ${code(c.connectionResourceId)} | ${esc(c.connectionDisplayName || '—')} | ${esc(c.connectionCreationType || '—')} |`);
    p('');
  }

  p('## 7. SharePoint targets', '', '| Site | List / table | Title | Resolution | Uses | Operations | Flows |', '|---|---|---|---|---|---|---|');
  for (const s of sharePointTargets) p(`| ${code(s.site)} | ${code(s.list)} | ${esc(s.listTitle || '—')} | ${esc(s.listResolution)} | ${s.uses} | ${s.operations.map(code).join('<br>')} | ${s.flows.map(esc).join('<br>')} |`);
  p('');

  p('## 8. HTTP / external endpoints', '', '| Method | URI | Header names | Uses | Flows | Rows |', '|---|---|---|---|---|---|');
  for (const h of httpTargets) p(`| ${code(h.method)} | ${code(h.target)} | ${h.headerNames.map(code).join('<br>')} | ${h.uses} | ${h.flows.map(esc).join('<br>')} | ${h.rows.join(', ')} |`);
  p('');

  p('## 9. Flow index', '', '| Flow | Artefacts (family) | Connectors | Connector rows |', '|---|---|---|---|');
  for (const f of flows) p(`| ${esc(f.flow)} | ${f.artefacts.map((a) => `[${a.artefactId}](#${a.artefactId.toLowerCase()}) ${esc(a.family)}`).join('<br>')} | ${f.connectors.map(code).join('<br>')} | ${f.connectorRows} |`);
  p('');

  p('## 10. Artefacts and every connector-bound action', '',
    'Each artefact lists its identity, the connection references it declares, its full action-type inventory, and then every connector-bound action with every parameter it is configured with.', '');
  for (const a of artefacts) {
    p(`### ${a.artefactId}`, '', `**${esc(a.flow)}** — ${esc(a.family)}${a.derived ? ' _(derived)_' : ''} · shape: ${esc(a.shape)}`, '',
      `| Field | Value |`, '|---|---|',
      `| Source | ${code(a.source)}${a.objectIndexInSource !== null ? ` (embedded object #${a.objectIndexInSource})` : ''} |`,
      `| Display name | ${code(a.displayName)} |`, `| Internal name | ${code(a.internalName)} |`, `| Workflow id | ${code(a.workflowId)} |`,
      `| Environment | ${code(a.environment)} |`, `| Exported / captured (UTC) | ${code(a.exportedAtUtc)} |`, `| Flow apiId | ${code(a.flowApiId)} |`, `| Node id | ${code(a.nodeId)} |`,
      `| Definition sha256/16 | ${code(a.definitionSha256)} |`,
      `| Actions + triggers walked | ${a.totalEntries} — ${Object.entries(a.typeInventory).sort(sortBy(([k]) => k)).map(([k, n]) => `${esc(k)} ${n}`).join(', ')} |`,
      `| Connector-bound rows | ${a.connectorRows} |`, '');
    if (a.connectionReferences.length) {
      p('Connection references declared:', '', '| Key | Connector | apiId | Connection | Display | Account | Source | Tier | Declared at |', '|---|---|---|---|---|---|---|---|---|');
      for (const c of a.connectionReferences) p(`| ${code(c.key)} | ${code(c.apiName)} | ${code(c.apiId)} | ${code(c.connectionName)} | ${esc(c.displayName || '—')} | ${esc(c.connectionAccount || '—')} | ${esc(c.source || '—')} | ${esc(c.tier || '—')} | ${code(c.declaredIn)} |`);
      p('');
    } else p('_No connection references declared in this artefact._', '');
    const rows = actions.filter((r) => r.artefactId === a.artefactId);
    if (!rows.length) { p('_No connector-bound actions._', ''); continue; }
    p('| Row | Role | Path | Type | Connector | Reference → connection | Operation | Target |', '|---|---|---|---|---|---|---|---|');
    for (const r of rows) p(`| ${r.rowId} | ${r.role} | ${code(r.path)} | ${code(r.type)}${r.kind ? ` ${code(r.kind)}` : ''} | ${code(r.apiName)} | ${code(r.connectionReference)}${r.connectionResource ? ` → ${code(r.connectionResource)}` : ''}${r.connectionAccount ? ` (${esc(r.connectionAccount)})` : ''} | ${code(r.operationId)} | ${code(r.target)} |`);
    p('');
    for (const r of rows) {
      p(`<details><summary>${r.rowId} · <code>${esc(r.name).replace(/</g, '&lt;')}</code> — parameters and settings</summary>`, '');
      const meta = { method: r.method, sharePoint: r.sharePoint, runAfter: r.runAfter, retryPolicy: r.retryPolicy, runtimeConfiguration: r.runtimeConfiguration, authentication: r.authentication, operationOptions: r.operationOptions, limit: r.limit, description: r.description, trackedProperties: r.trackedProperties, operationMetadataId: r.operationMetadataId, apiNameProvenance: r.apiNameProvenance, connectionReferenceForm: r.connectionReferenceForm, connectionResourceProvenance: r.connectionResourceProvenance };
      const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null && v !== undefined));
      p('```json', JSON.stringify({ parameters: r.parameters, ...clean }, null, 2), '```', '', '</details>', '');
    }
  }

  p('## 11. Coverage', '', '### 11.1 Every candidate source', '', 'A candidate is any tracked file or archive member carrying a connector marker or an action/trigger map. Every one is listed, including those that yielded no artefact, with the reason.', '',
    '| Source | Parsed as | Artefacts | Family | Note |', '|---|---|---|---|---|');
  for (const s of register.sources) p(`| ${code(s.source)} | ${esc(s.parsed)} | ${s.artefacts} | ${esc(s.family || '—')} | ${esc(s.note || '—')} |`);
  p('', '### 11.2 Connector tokens anywhere in the repository', '', '| Token | Occurrences | Files | Classification |', '|---|---|---|---|');
  for (const t of tokenIndex) p(`| ${code(t.token)} | ${t.occurrences} | ${t.files} | ${esc(t.classification)} |`);
  p('', '### 11.3 Files mentioning connector tokens', '', '| Source | Tokens | Holds a parsed artefact |', '|---|---|---|');
  for (const m of register.mentions) p(`| ${code(m.source)} | ${Object.entries(m.tokens).sort(sortBy(([k]) => k)).map(([k, n]) => `${code(k)}×${n}`).join(' ')} | ${m.holdsArtefact ? 'yes' : 'no'} |`);
  p('', '### 11.4 Reconciliation with the generated provisioning pages', '',
    'Each page in `docs/folio-Master-Flows-and-Endpoints/provisioning/flows/` states the connection bindings of the package it documents. The register re-derives them independently and compares.', '',
    '| Page | Source package | Package in register | Bindings compared | Agrees | Differences (page / register) |', '|---|---|---|---|---|---|');
  for (const r of reconciliation) p(`| ${code(r.page)} | ${code(r.sourcePackage)} | ${r.sourceInRegister ? 'yes' : 'no'} | ${r.bindingsCompared} | ${r.agrees ? 'yes' : '**no**'} | ${r.differences.map((d) => `${code(d.binding)} ${d.page}/${d.register}`).join('<br>') || '—'} |`);
  p('', '### 11.5 Connector-typed entries outside every artefact', '',
    'Derived catalogues (workbench catalogue, provisioning detail, flow shapes), run-time copies inside captures and evidence notes carry summaries of actions. They are not registered twice; each entry is matched by name, type and operation to a registered row, and any that matches none is listed.', '',
    '| Source | Entries | Matched to a row | Unmatched (key path · name · type · operation) |', '|---|---|---|---|');
  for (const b of looseCrossCheck) p(`| ${code(b.source)} | ${b.entries} | ${b.matched} | ${b.unmatched.map((u) => `${code(u.keyPath)} · ${code(u.name)} · ${code(u.type)} · ${code(u.operationId)}`).join('<br>') || '—'} |`);
  p('', '## 12. Masked credentials', '', 'Every credential found inside a connector action and masked in this register. The fingerprint is the first 8 hex of the SHA-256 of the credential (for a SAS signature, of its 43 credential characters).', '',
    '| Location | Kind | Fingerprint |', '|---|---|---|');
  for (const m of maskSummary) p(`| ${code(m.where)} | ${esc(m.kind)} | ${code(m.fingerprint)} |`);
  p('');
  return `${L.join('\n')}\n`;
}


/* The matrix page: every flow against every connector, operation or connection key, with the
   rows behind each cell one click away. Self-contained — no network, no external script — so it
   opens from a checkout, an attachment or a file share alike. Only register data is embedded. */
function toMatrixHtml() {
  const fams = uniq(artefacts.map((a) => a.family));
  const famIx = new Map(fams.map((f, i) => [f, i]));
  const flowNames = flows.map((f) => f.flow);
  const flowIx = new Map(flowNames.map((f, i) => [f, i]));
  const dims = {
    connector: uniq(actions.map((r) => r.apiName)),
    operation: operations.map((o) => `${o.apiName} · ${o.operationId}`),
    key: uniq(actions.map((r) => (r.connectionReference ? `${r.apiName} · ${r.connectionReference}` : null))),
    connection: uniq(actions.map((r) => (r.connectionResource ? `${r.connectionResource}${r.connectionAccount ? ` (${r.connectionAccount})` : ''}` : null))),
  };
  const ix = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, new Map(v.map((x, i) => [x, i]))]));
  const rows = actions.map((r) => [
    r.rowId, flowIx.get(r.flow), famIx.get(artefactOf.get(r.artefactId).family), artefactOf.get(r.artefactId).derived ? 1 : 0,
    ix.connector.get(r.apiName), ix.operation.get(`${r.apiName} · ${r.operationId}`) ?? -1,
    r.connectionReference ? ix.key.get(`${r.apiName} · ${r.connectionReference}`) : -1,
    r.connectionResource ? ix.connection.get(`${r.connectionResource}${r.connectionAccount ? ` (${r.connectionAccount})` : ''}`) : -1,
    r.path, r.type, r.role === 'action' ? '' : r.role, typeof r.target === 'string' ? r.target : (r.target == null ? '' : JSON.stringify(r.target)),
    r.source, r.connectionResourceProvenance || '',
  ]);
  const flowFams = flows.map((f) => uniq(f.artefacts.map((a) => a.family)).map((x) => famIx.get(x)));
  const data = { generated: summary, fams, flows: flowNames, flowFams, dims, rows };
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en" data-platform="dgo-ops">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connector Matrix — NITDA Folio</title>
<!-- brand:kit:start -->
<!-- brand:kit:end -->
<meta name="description" content="Every flow against every connector, operation, connection key and connection in the DGO flow estate. Generated by scripts/build-connector-register.mjs — do not edit by hand.">
<style>
:root{
  /* Every value is a design-system name, from the brand kit block above (npm run brand:sync). The
     heat scale runs from the card to brand green; --h-ink is the text on its two darkest steps. */
  --bg:var(--dgo-color-surface-sunken);--panel:var(--dgo-color-surface-raised);--ink:var(--dgo-color-fg-default);--muted:var(--dgo-color-fg-muted);
  --rule:var(--dgo-color-border-default);--head:var(--dgo-color-surface-brand);--headInk:var(--dgo-color-fg-on-brand);--accent:var(--dgo-color-fg-brand);
  --h0:var(--dgo-color-surface-raised);
  --h1:color-mix(in srgb,var(--dgo-color-fg-brand) 14%,var(--dgo-color-surface-raised));
  --h2:color-mix(in srgb,var(--dgo-color-fg-brand) 34%,var(--dgo-color-surface-raised));
  --h3:color-mix(in srgb,var(--dgo-color-fg-brand) 72%,var(--dgo-color-surface-raised));
  --h4:var(--dgo-color-fg-brand);--h-ink:var(--dgo-color-fg-on-brand);
  --sel:var(--dgo-warn-400);--zebra:color-mix(in srgb,var(--dgo-color-fg-default) 3%,var(--dgo-color-surface-raised));
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--h-ink:var(--dgo-green-950)}}
:root[data-theme="dark"]{--h-ink:var(--dgo-green-950)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 var(--dgo-family-sans)}
h1,h2{font-family:var(--dgo-family-display)}
.intro{padding:20px 24px 8px;max-width:100%}
h1{margin:0 0 4px;font-size:22px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0 0 14px;max-width:980px}
.kpis{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:8px 14px;min-width:120px}
.kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums}
.kpi span{color:var(--muted);font-size:12px}
.bar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:10px 24px;background:var(--panel);border-block:1px solid var(--rule);position:sticky;top:0;z-index:5}
.seg{display:inline-flex;flex-wrap:wrap;max-width:100%;border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.seg button{border:0;background:transparent;color:var(--ink);padding:6px 12px;font:inherit;cursor:pointer}
.seg button{transition:background .15s ease,color .15s ease}
.seg button[aria-pressed="true"]{background:var(--dgo-color-action-primary);color:var(--dgo-color-fg-on-brand)}
input[type=search],select{max-width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--rule);border-radius:8px;padding:6px 10px}
input[type=search]{min-width:220px}
label.chk{display:inline-flex;gap:6px;align-items:center;color:var(--muted)}
.legend{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:12px}
.legend i{width:18px;height:12px;border:1px solid var(--rule);display:inline-block}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:0;min-height:60vh}
@media (max-width:1100px){.grid{grid-template-columns:1fr}#detail{border-left:0;border-top:1px solid var(--rule)}}
/* The matrix scrolls both ways inside its own frame, its header row and flow column pinned;
   the page around it never moves sideways. */
.wrap{overflow:auto;overscroll-behavior:contain;max-height:calc(100dvh - var(--bk-header-h) - 64px);scrollbar-width:thin}
table.m{border-collapse:separate;border-spacing:0;font-size:12px}
.m th,.m td{border-right:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.m thead th{position:sticky;top:0;background:var(--head);color:var(--headInk);z-index:3;font-weight:600}
.m thead th.col{height:210px;width:30px;min-width:30px;padding:6px 0;vertical-align:bottom;cursor:pointer}
.m thead th.col div{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;margin:0 auto;max-height:200px;overflow:hidden;text-overflow:ellipsis}
.m th.rowh{position:sticky;left:0;background:var(--panel);z-index:2;text-align:left;font-weight:500;padding:4px 10px;min-width:280px;max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.m thead th.corner{left:0;z-index:4;text-align:left;padding:10px;vertical-align:bottom;min-width:280px}
.m tbody tr:nth-child(even) th.rowh{background:var(--zebra)}
.m td{width:30px;min-width:30px;height:24px;text-align:center;font-variant-numeric:tabular-nums;cursor:pointer}
.m td.z{cursor:default;color:transparent}
.m td.tot,.m th.tot{background:var(--zebra);font-weight:700;color:var(--ink)}
.m thead th.tot{background:var(--head);color:var(--headInk)}
.m td.on,.m th.on{outline:2px solid var(--sel);outline-offset:-2px}
.m tfoot td,.m tfoot th{position:sticky;bottom:0;background:var(--panel);font-weight:700;border-top:2px solid var(--rule)}
.fam{display:block;color:var(--dgo-color-fg-on-brand-soft);font-size:11px;font-weight:400;white-space:normal;margin-top:4px}
#detail{border-left:1px solid var(--rule);background:var(--panel);padding:16px 18px;max-height:calc(100dvh - var(--bk-header-h) - 64px);overflow:auto;overscroll-behavior:contain}
#detail h2{font-size:15px;margin:0 0 6px}
#detail .muted{color:var(--muted)}
#detail ol{padding-left:18px;margin:8px 0}
#detail li{margin:0 0 10px;word-break:break-word}
#detail code{font:12px var(--dgo-family-mono);background:var(--bg);padding:1px 4px;border-radius:4px}
.tag{display:inline-block;font-size:11px;border:1px solid var(--rule);border-radius:999px;padding:0 7px;color:var(--muted);margin-right:4px}
footer{padding:14px 24px;color:var(--muted);font-size:12px}
@media (max-width:640px){.intro,.bar,footer{padding-inline:16px}input[type=search]{min-width:0;width:100%}}
</style>
</head>
<body class="bk-app-body">
<a class="bk-skip" href="#bk-main">Skip to content</a>
<div class="bk-app">
<header class="bk-header">
<a class="bk-brand" href="#"><img class="bk-logo--on-dark" data-bk-logo="white" src="" alt="National Information Technology Development Agency" width="544" height="254"><img class="bk-logo--on-light" data-bk-logo="colour" src="" alt="National Information Technology Development Agency" width="572" height="260"><span class="bk-sub" data-bk-sub><!--/bk-sub--></span><span class="bk-brand__text"><span class="bk-brand__title">Connector Matrix</span><span class="bk-brand__sub">NITDA Folio · connector register</span></span></a>
<span class="bk-header__spacer"></span>
<div class="bk-header__actions"><button class="bk-btn bk-btn--on-brand bk-btn--icon" type="button" data-bk-theme-toggle aria-label="Switch theme"><svg class="bk-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="bk-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg></button></div>
</header>
<div class="bk-body">
<main class="bk-main" id="bk-main" tabindex="-1" data-bk-top>
<div class="intro">
<h1>Connector Matrix</h1>
<p class="sub">Every flow in the estate against every connector, operation, connection reference key or tenant connection. Each cell counts the connector-bound actions and triggers behind it; select a cell, row or column for every row it counts. Built from <code>connector-register.json</code> — credentials masked there, nothing else altered.</p>
<div class="kpis" id="kpis"></div>
</div>
<div class="bar" role="toolbar" aria-label="Matrix controls">
<div class="seg" id="dim" role="group" aria-label="Columns">
<button data-d="connector" aria-pressed="true">Connectors</button><button data-d="operation" aria-pressed="false">Operations</button><button data-d="key" aria-pressed="false">Connection keys</button><button data-d="connection" aria-pressed="false">Connections</button>
</div>
<select id="fam" aria-label="Artefact family"><option value="-1">All artefact families</option></select>
<label class="chk"><input type="checkbox" id="primary"> Primary artefacts only</label>
<input type="search" id="q" placeholder="Filter flows…" aria-label="Filter flows">
<span class="legend" aria-hidden="true">0 <i style="background:var(--h0)"></i><i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i> most</span>
</div>
<div class="grid">
<div class="wrap"><table class="m" id="m"></table></div>
<aside id="detail" aria-live="polite"><h2>Select a cell</h2><p class="muted">Pick any count to list every action behind it — path, operation, connection, target and source file. Rows and column headers select the whole line.</p></aside>
</div>
<footer>Generated by <code>scripts/build-connector-register.mjs</code> (<code>npm run connectors</code>) — do not edit by hand. Companion files: <code>CONNECTOR_REGISTER.md</code>, <code>CONNECTOR_REGISTER.xlsx</code>, <code>connector-register.json</code>, <code>connector-register-actions.csv</code>.</footer>
</main>
</div>
</div>
<script id="data" type="application/json">${payload}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const R = D.rows; // [rowId, flow, fam, derived, connector, operation, key, connection, path, type, role, target, source, connProv]
  const COLI = { connector: 4, operation: 5, key: 6, connection: 7 };
  const st = { dim: 'connector', fam: -1, primary: false, q: '', sel: null };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const k = D.generated;
  $('kpis').innerHTML = [[k.artefacts, 'artefacts'], [k.connectorRows, 'connector-bound actions'], [D.flows.length, 'flows'], [k.connectors, 'connectors'], [k.operations, 'operations'], [k.connectionResources, 'tenant connections'], [k.solutionPackages, 'solution packages']]
    .map(([n, l]) => '<div class="kpi"><b>' + Number(n).toLocaleString() + '</b><span>' + l + '</span></div>').join('');
  D.fams.forEach((f, i) => { const o = document.createElement('option'); o.value = i; o.textContent = f; $('fam').appendChild(o); });
  const shade = (n, max) => { if (!n) return 'var(--h0)'; const t = Math.log(n + 1) / Math.log(max + 1); return t < .25 ? 'var(--h1)' : t < .5 ? 'var(--h2)' : t < .75 ? 'var(--h3)' : 'var(--h4)'; };
  const inkFor = (bg) => (bg === 'var(--h3)' || bg === 'var(--h4)' ? 'var(--h-ink)' : 'var(--ink)');
  function live() { return R.filter((r) => (st.fam < 0 || r[2] === st.fam) && (!st.primary || !r[3])); }
  function render() {
    const rows = live(); const ci = COLI[st.dim]; const cols = D.dims[st.dim];
    const q = st.q.toLowerCase();
    const grid = new Map(); const rt = new Map(); const ct = new Array(cols.length).fill(0);
    for (const r of rows) { if (r[ci] < 0) continue; const key = r[1] * 100000 + r[ci]; grid.set(key, (grid.get(key) || 0) + 1); rt.set(r[1], (rt.get(r[1]) || 0) + 1); ct[r[ci]]++; }
    const flowList = D.flows.map((f, i) => i).filter((i) => rt.get(i) && (!q || D.flows[i].toLowerCase().includes(q)));
    const colList = cols.map((c, j) => j).filter((j) => ct[j]);
    let max = 0; for (const v of grid.values()) max = Math.max(max, v);
    let h = '<thead><tr><th class="corner">Flow <span class="fam">' + flowList.length + ' of ' + D.flows.length + ' flows have a connector-bound action under this filter</span></th>';
    for (const j of colList) h += '<th class="col" data-c="' + j + '" title="' + esc(cols[j]) + '"><div>' + esc(cols[j]) + '</div></th>';
    h += '<th class="col tot"><div>Total</div></th></tr></thead><tbody>';
    let grand = 0;
    for (const i of flowList) {
      const fams = D.flowFams[i].map((x) => D.fams[x]).join(', ');
      h += '<tr><th class="rowh" data-r="' + i + '" title="' + esc(D.flows[i] + ' — ' + fams) + '">' + esc(D.flows[i]) + '</th>';
      let t = 0;
      for (const j of colList) { const n = grid.get(i * 100000 + j) || 0; t += n; const bg = shade(n, max);
        h += n ? '<td data-r="' + i + '" data-c="' + j + '" style="background:' + bg + ';color:' + inkFor(bg) + '" title="' + esc(D.flows[i] + ' × ' + cols[j] + ': ' + n) + '">' + n + '</td>' : '<td class="z"></td>'; }
      grand += t; h += '<td class="tot" data-r="' + i + '">' + t + '</td></tr>';
    }
    h += '</tbody><tfoot><tr><th class="rowh">Total</th>';
    for (const j of colList) { let n = 0; for (const i of flowList) n += grid.get(i * 100000 + j) || 0; h += '<td data-c="' + j + '">' + n + '</td>'; }
    h += '<td class="tot">' + grand + '</td></tr></tfoot>';
    $('m').innerHTML = h;
  }
  function show(ri, cj) {
    const ci = COLI[st.dim]; const cols = D.dims[st.dim];
    const hits = live().filter((r) => (ri == null || r[1] === ri) && (cj == null || r[ci] === cj) && (cj != null || r[ci] >= 0));
    const title = [ri != null ? D.flows[ri] : null, cj != null ? cols[cj] : null].filter(Boolean).join(' × ');
    let h = '<h2>' + esc(title) + '</h2><p class="muted">' + hits.length + ' connector-bound action' + (hits.length === 1 ? '' : 's') + '</p><ol>';
    for (const r of hits) {
      h += '<li><code>' + esc(r[0]) + '</code> <span class="tag">' + esc(D.fams[r[2]]) + '</span>' + (r[10] ? '<span class="tag">' + esc(r[10]) + '</span>' : '') +
        '<br><b>' + esc(r[8]) + '</b><br>' + esc(r[9]) + ' · ' + esc(D.dims.connector[r[4]]) + (r[5] >= 0 ? ' · <code>' + esc(D.dims.operation[r[5]].split(' · ').slice(1).join(' · ')) + '</code>' : '') +
        (r[6] >= 0 ? '<br>key <code>' + esc(D.dims.key[r[6]].split(' · ').slice(1).join(' · ')) + '</code>' : '') +
        (r[7] >= 0 ? '<br>connection <code>' + esc(D.dims.connection[r[7]]) + '</code> <span class="muted">(' + esc(r[13]) + ')</span>' : '') +
        (r[11] ? '<br><span class="muted">target</span> ' + esc(r[11]) : '') + '<br><span class="muted">' + esc(r[12]) + '</span></li>';
    }
    $('detail').innerHTML = h + '</ol>';
  }
  $('m').addEventListener('click', (e) => {
    const el = e.target.closest('td,th'); if (!el || el.classList.contains('z')) return;
    const r = el.dataset.r != null ? +el.dataset.r : null; const c = el.dataset.c != null ? +el.dataset.c : null;
    if (r == null && c == null) return;
    document.querySelectorAll('#m .on').forEach((x) => x.classList.remove('on')); el.classList.add('on'); show(r, c);
  });
  $('dim').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.dim = b.dataset.d;
    $('dim').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); });
  $('fam').addEventListener('change', (e) => { st.fam = +e.target.value; render(); });
  $('primary').addEventListener('change', (e) => { st.primary = e.target.checked; render(); });
  $('q').addEventListener('input', (e) => { st.q = e.target.value; render(); });
  render();
})();
</script>
</body>
</html>
`;
}

/* The connector details page: the twelve connectors side by side, each connector against every
   artefact family, and a full profile of any one — keys, connections, accounts, operations,
   parameter keys, flows, status codes, endpoints. Self-contained; register data only. */
function toDetailsHtml() {
  const famList = Object.keys(summary.artefactsByFamily);
  const byApi = new Map();
  for (const r of actions) { if (!byApi.has(r.apiName)) byApi.set(r.apiName, []); byApi.get(r.apiName).push(r); }
  const NAMES = { 'builtin:response': 'HTTP Response (built-in)', 'builtin:request': 'Request trigger (built-in)', 'builtin:http': 'HTTP action (built-in)', 'builtin:recurrence': 'Recurrence schedule (built-in)', '(connector not declared)': 'No connector declared' };
  const cons = [...connectors].sort((a, b) => b.uses - a.uses || byteCompare(a.apiName, b.apiName)).map((c) => {
    const rows = byApi.get(c.apiName) || [];
    const fam = {}; for (const r of rows) { const f = artefactOf.get(r.artefactId).family; fam[f] = (fam[f] || 0) + 1; }
    const flowCount = {}; for (const r of rows) flowCount[r.flow] = (flowCount[r.flow] || 0) + 1;
    const accounts = uniq([...c.connectionAccounts]);
    return {
      api: c.apiName, name: c.displayNamesEvidenced.join(', ') || NAMES[c.apiName] || 'Not stated in the repository', cls: c.connectorClass.join(', '),
      apiIds: c.apiIds, uses: c.uses, primary: c.usesInPrimaryArtefacts, artefacts: c.artefacts, flows: c.flows.length, families: c.families.length, fam,
      keys: connectionReferenceKeys.filter((k) => k.apiName === c.apiName).map((k) => ({ key: k.key, uses: k.uses, conns: k.connectionResources, accounts: k.accounts, ops: k.operations.length, flows: k.flows.length })),
      conns: connections.filter((x) => x.apiNames.includes(c.apiName)).map((x) => ({ id: x.connectionResource, keys: x.referenceKeys, accounts: x.accounts, bound: x.boundToAnAction, calls: rows.filter((r) => r.connectionResource === x.connectionResource).length, artefacts: x.artefacts, flows: x.flows.length })),
      accounts,
      ops: operations.filter((o) => o.apiName === c.apiName).sort((a, b) => b.uses - a.uses).map((o) => ({ op: o.operationId, uses: o.uses, flows: o.flows.length, params: Object.entries(o.parameterKeys).sort((a, b) => b[1] - a[1]) })),
      flowUse: Object.entries(flowCount).sort((a, b) => b[1] - a[1] || byteCompare(a[0], b[0])),
      http: c.apiName === 'builtin:http' ? httpTargets.map((h) => ({ method: h.method, uri: h.target, uses: h.uses, headers: h.headerNames, flows: h.flows })) : null,
    };
  });
  const data = { summary: { connectors: cons.length, calls: actions.length, keys: connectionReferenceKeys.length, conns: connections.length, ops: operations.length, flows: flows.length }, famList, cons };
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en" data-platform="dgo-ops">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connector Details — NITDA Folio</title>
<!-- brand:kit:start -->
<!-- brand:kit:end -->
<meta name="description" content="Every connector in the DGO flow estate with its keys, connections, accounts, operations, parameters and flows. Generated by scripts/build-connector-register.mjs — do not edit by hand.">
<style>
:root{
  /* Every value is a design-system name, from the brand kit block above (npm run brand:sync). The
     heat scale runs from the card to brand green; --h-ink is the text on its two darkest steps. */
  --bg:var(--dgo-color-surface-sunken);--panel:var(--dgo-color-surface-raised);--ink:var(--dgo-color-fg-default);--muted:var(--dgo-color-fg-muted);
  --rule:var(--dgo-color-border-default);--head:var(--dgo-color-surface-brand);--headInk:var(--dgo-color-fg-on-brand);--accent:var(--dgo-color-fg-brand);
  --h0:var(--dgo-color-surface-raised);
  --h1:color-mix(in srgb,var(--dgo-color-fg-brand) 14%,var(--dgo-color-surface-raised));
  --h2:color-mix(in srgb,var(--dgo-color-fg-brand) 34%,var(--dgo-color-surface-raised));
  --h3:color-mix(in srgb,var(--dgo-color-fg-brand) 72%,var(--dgo-color-surface-raised));
  --h4:var(--dgo-color-fg-brand);--h-ink:var(--dgo-color-fg-on-brand);
  --sel:var(--dgo-color-warning-subtle-bg);--bar:color-mix(in srgb,var(--dgo-color-fg-brand) 70%,var(--dgo-color-surface-raised));
  --managed:var(--dgo-color-info-subtle-bg);--resp:var(--dgo-color-success-subtle-bg);--trig:var(--dgo-color-warning-subtle-bg);--http:var(--dgo-color-danger-subtle-bg);--none:var(--dgo-color-status-archived-bg);--zebra:color-mix(in srgb,var(--dgo-color-fg-default) 3%,var(--dgo-color-surface-raised));
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--h-ink:var(--dgo-green-950)}}
:root[data-theme="dark"]{--h-ink:var(--dgo-green-950)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 var(--dgo-family-sans)}
h1,h2{font-family:var(--dgo-family-display)}
.page{max-width:1500px;margin:0 auto;padding:22px 24px 40px}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.01em}
h2{font-size:17px;margin:30px 0 8px}
h3{font-size:14px;margin:18px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.sub{color:var(--muted);margin:0 0 16px;max-width:980px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:0 0 8px}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:10px 14px}
.kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:12px}
.card{background:var(--panel);border:1px solid var(--rule);border-radius:12px;overflow:hidden}
.scroll{overflow:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:7px 10px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
thead th{background:var(--head);color:var(--headInk);font-weight:600;position:sticky;top:0;z-index:1;white-space:nowrap}
tbody tr:nth-child(even) td{background:var(--zebra)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code,.mono{font:12px var(--dgo-family-mono)}
tr.pick{cursor:pointer}#main tr.pick:hover td,#main tr.on td{background:var(--sel)}.hm tr.pick:hover td:first-child,.hm tr.on td:first-child{background:var(--sel)}.hm tr.on td{box-shadow:inset 0 2px 0 var(--accent),inset 0 -2px 0 var(--accent)}
.cls{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;border:1px solid var(--rule);white-space:nowrap}
.c-managed{background:var(--managed)}.c-resp{background:var(--resp)}.c-trig{background:var(--trig)}.c-http{background:var(--http)}.c-none{background:var(--none)}
.bar{display:flex;align-items:center;gap:8px;min-width:150px}.bar i{display:block;height:10px;border-radius:3px;background:var(--bar)}
.hm td.v{text-align:center;font-variant-numeric:tabular-nums;min-width:44px;border-left:1px solid var(--rule)}
.hm thead th.rot{height:190px;vertical-align:bottom;padding:6px 2px;width:44px}
.hm thead th.rot div{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;margin:0 auto;font-weight:500}
.hm td.v.z{color:transparent}.hm thead th:first-child{vertical-align:bottom;min-width:220px}
tfoot td{font-weight:700;background:var(--zebra)}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.grid2>div{min-width:0}
@media (max-width:960px){.grid2{grid-template-columns:minmax(0,1fr)}}
.prof-head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;padding:14px 16px;border-bottom:1px solid var(--rule)}
.prof-head h2{margin:0}
.prof-body{padding:4px 16px 18px}
.muted{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--rule);border-radius:999px;padding:2px 10px;font-size:12px;background:var(--bg);overflow-wrap:anywhere}
.prof-head code,.prof-body>code{overflow-wrap:anywhere}
.tall{max-height:460px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--rule);border-radius:8px}
td.nm{min-width:170px}
select,button{max-width:100%;font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:6px 10px}
button{cursor:pointer}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 10px}
details summary{cursor:pointer;color:var(--accent)}
footer{color:var(--muted);font-size:12px;margin-top:30px}
@media (max-width:640px){.page{padding:16px}}
</style>
</head>
<body class="bk-app-body">
<a class="bk-skip" href="#bk-main">Skip to content</a>
<div class="bk-app">
<header class="bk-header">
<a class="bk-brand" href="#"><img class="bk-logo--on-dark" data-bk-logo="white" src="" alt="National Information Technology Development Agency" width="544" height="254"><img class="bk-logo--on-light" data-bk-logo="colour" src="" alt="National Information Technology Development Agency" width="572" height="260"><span class="bk-sub" data-bk-sub><!--/bk-sub--></span><span class="bk-brand__text"><span class="bk-brand__title">Connector Details</span><span class="bk-brand__sub">NITDA Folio · connector register</span></span></a>
<span class="bk-header__spacer"></span>
<div class="bk-header__actions"><button class="bk-btn bk-btn--on-brand bk-btn--icon" type="button" data-bk-theme-toggle aria-label="Switch theme"><svg class="bk-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="bk-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg></button></div>
</header>
<div class="bk-body">
<main class="bk-main" id="bk-main" tabindex="-1" data-bk-top>
<div class="page">
<div class="toolbar"><h1 style="margin:0">Connector Details</h1></div>
<p class="sub">Every connector the flow estate uses, taken apart: identity, class, usage, reference keys, tenant connections, accounts, operations, parameter keys and the flows that call it. Select a connector to open its full profile. Built from <code>connector-register.json</code> — credentials are masked there and nothing else is altered.</p>
<div class="kpis" id="kpis"></div>

<h2>1 · Connector matrix</h2>
<div class="card scroll"><table id="main"></table></div>
<p class="muted" style="font-size:12px">Calls count every artefact copy of a flow; primary leaves out copies generated from other files in the repository. Artefacts, flows and families are distinct counts.</p>

<h2>2 · Connector × artefact family</h2>
<div class="card scroll"><table class="hm" id="fam"></table></div>

<h2>3 · Connector profile</h2>
<div class="toolbar"><label for="pick" class="muted">Connector</label><select id="pick"></select></div>
<div class="card" id="profile"></div>

<footer>Generated by <code>scripts/build-connector-register.mjs</code> (<code>npm run connectors</code>) — do not edit by hand. Workbook companion: <code>CONNECTOR_DETAILS.xlsx</code>. Estate-wide matrix: <code>CONNECTOR_MATRIX.html</code>.</footer>
</div>
</main>
</div>
</div>
<script id="data" type="application/json">${payload}</script>
<script>
(() => {
  const D = JSON.parse(document.getElementById('data').textContent);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n).toLocaleString();
  const clsTag = (c) => { const k = /managed/.test(c) ? 'managed' : /response/.test(c) ? 'resp' : /trigger/.test(c) ? 'trig' : /HTTP/.test(c) ? 'http' : 'none'; return '<span class="cls c-' + k + '">' + esc(c) + '</span>'; };
  const S = D.summary;
  $('kpis').innerHTML = [[S.connectors, 'connectors'], [S.calls, 'connector-bound calls'], [S.keys, 'reference keys'], [S.conns, 'tenant connections'], [S.ops, 'operations'], [S.flows, 'flow labels']]
    .map(([n, l]) => '<div class="kpi"><b>' + fmt(n) + '</b><span>' + l + '</span></div>').join('');
  const total = D.cons.reduce((a, c) => a + c.uses, 0); const max = Math.max(...D.cons.map((c) => c.uses));
  let h = '<thead><tr><th>#</th><th>Connector</th><th>Display name</th><th>Class</th><th>API id</th><th class="n">Calls</th><th>Share</th><th class="n">Primary</th><th class="n">Artefacts</th><th class="n">Flows</th><th class="n">Keys</th><th class="n">Connections</th><th class="n">Accounts</th><th class="n">Operations</th><th class="n">Families</th></tr></thead><tbody>';
  D.cons.forEach((c, i) => {
    h += '<tr class="pick" data-i="' + i + '"><td class="n">' + (i + 1) + '</td><td><code>' + esc(c.api) + '</code></td><td class="nm"><b>' + esc(c.name) + '</b></td><td>' + clsTag(c.cls) + '</td><td class="mono">' + (c.apiIds.map(esc).join('<br>') || '<span class="muted">—</span>') + '</td><td class="n"><b>' + fmt(c.uses) + '</b></td><td><div class="bar"><i style="width:' + Math.max(2, 120 * c.uses / max) + 'px"></i>' + (100 * c.uses / total).toFixed(2) + '%</div></td><td class="n">' + fmt(c.primary) + '</td><td class="n">' + c.artefacts + '</td><td class="n">' + c.flows + '</td><td class="n">' + c.keys.length + '</td><td class="n">' + c.conns.length + '</td><td class="n">' + c.accounts.length + '</td><td class="n">' + c.ops.length + '</td><td class="n">' + c.families + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td></td><td>Total</td><td></td><td></td><td></td><td class="n">' + fmt(total) + '</td><td>100.00%</td><td class="n">' + fmt(D.cons.reduce((a, c) => a + c.primary, 0)) + '</td><td colspan="7"></td></tr></tfoot>';
  $('main').innerHTML = h;
  // family heatmap
  let fmax = 0; D.cons.forEach((c) => D.famList.forEach((f) => { fmax = Math.max(fmax, c.fam[f] || 0); }));
  const shade = (n) => { if (!n) return 'var(--h0)'; const t = Math.log(n + 1) / Math.log(fmax + 1); return t < .25 ? 'var(--h1)' : t < .5 ? 'var(--h2)' : t < .75 ? 'var(--h3)' : 'var(--h4)'; };
  let f = '<thead><tr><th>Connector</th>' + D.famList.map((x) => '<th class="rot"><div>' + esc(x) + '</div></th>').join('') + '<th class="rot"><div>Total</div></th></tr></thead><tbody>';
  const colTot = D.famList.map(() => 0);
  D.cons.forEach((c, i) => {
    f += '<tr class="pick" data-i="' + i + '"><td><code>' + esc(c.api) + '</code></td>';
    D.famList.forEach((x, j) => { const n = c.fam[x] || 0; colTot[j] += n; const bg = shade(n); f += n ? '<td class="v" style="background:' + bg + ';color:' + (bg === 'var(--h4)' ? 'var(--h-ink)' : 'var(--ink)') + '" title="' + esc(c.api + ' × ' + x + ': ' + n) + '">' + n + '</td>' : '<td class="v z" title="' + esc(c.api + ' × ' + x + ': 0') + '"></td>'; });
    f += '<td class="v"><b>' + fmt(c.uses) + '</b></td></tr>';
  });
  f += '</tbody><tfoot><tr><td>Total</td>' + colTot.map((n) => '<td class="v">' + fmt(n) + '</td>').join('') + '<td class="v">' + fmt(total) + '</td></tr></tfoot>';
  $('fam').innerHTML = f;
  // profile
  D.cons.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = c.api + ' — ' + c.name; $('pick').appendChild(o); });
  const tbl = (head, rows, num = []) => rows.length ? '<div class="scroll"><table><thead><tr>' + head.map((x, i) => '<th' + (num.includes(i) ? ' class="n"' : '') + '>' + x + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((x, i) => '<td' + (num.includes(i) ? ' class="n"' : '') + '>' + x + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<p class="muted">None recorded in any artefact.</p>';
  function show(i) {
    const c = D.cons[i];
    document.querySelectorAll('tr.pick').forEach((tr) => tr.classList.toggle('on', +tr.dataset.i === i));
    $('pick').value = i;
    const opMax = Math.max(1, ...c.ops.map((o) => o.uses));
    let p = '<div class="prof-head"><h2><code>' + esc(c.api) + '</code></h2><b>' + esc(c.name) + '</b>' + clsTag(c.cls) + '<span class="muted">' + fmt(c.uses) + ' calls · ' + fmt(c.primary) + ' primary · ' + c.artefacts + ' artefacts · ' + c.flows + ' flows · ' + c.families + ' families</span></div><div class="prof-body">';
    p += '<h3>API id</h3>' + (c.apiIds.length ? c.apiIds.map((x) => '<code>' + esc(x) + '</code>').join('<br>') : '<p class="muted">None — built-in or undeclared.</p>');
    p += '<div class="grid2"><div><h3>Reference keys (' + c.keys.length + ')</h3>' + tbl(['Key', 'Calls', 'Bound connection(s)', 'Operations', 'Flows'], c.keys.map((k) => ['<code>' + esc(k.key == null ? '(none named)' : k.key) + '</code>', fmt(k.uses), k.conns.length ? k.conns.map((x) => '<code>' + esc(x) + '</code>').join('<br>') : '<span class="muted">not declared</span>', k.ops, k.flows]), [1, 3, 4]) + '</div>';
    p += '<div><h3>Accounts and labels (' + c.accounts.length + ')</h3>' + (c.accounts.length ? '<div class="chips">' + c.accounts.map((a) => '<span class="chip">' + esc(a) + '</span>').join('') + '</div>' : '<p class="muted">None recorded in any artefact.</p>') + '</div></div>';
    p += '<h3>Tenant connections (' + c.conns.length + ')</h3>' + tbl(['Connection', 'Reference keys', 'Accounts', 'Status', 'Calls bound', 'Artefacts', 'Flows'], c.conns.map((x) => ['<code>' + esc(x.id) + '</code>', x.keys.map((k) => '<code>' + esc(k) + '</code>').join('<br>') || '—', esc(x.accounts.join(', ') || '—'), x.bound ? 'Bound to actions' : 'Declared only', fmt(x.calls), x.artefacts, x.flows]), [4, 5, 6]);
    p += '<h3>Operations (' + c.ops.length + ')</h3>' + tbl(['Operation', 'Calls', '', 'Flows', 'Parameter keys (calls carrying each)'], c.ops.map((o) => ['<code>' + esc(o.op) + '</code>', fmt(o.uses), '<div class="bar"><i style="width:' + Math.max(2, 140 * o.uses / opMax) + 'px"></i></div>', o.flows, o.params.length ? '<details><summary>' + o.params.length + ' keys</summary>' + o.params.map(([k, n]) => '<code>' + esc(k) + '</code> ' + n).join('<br>') + '</details>' : '—']), [1, 3]);
    if (c.http) p += '<h3>External endpoints</h3>' + tbl(['Method', 'URI', 'Calls', 'Header names', 'Flows'], c.http.map((x) => [esc(x.method), '<code>' + esc(x.uri) + '</code>', x.uses, x.headers.map(esc).join(', '), x.flows.map(esc).join('<br>')]), [2]);
    p += '<h3>Flows using this connector (' + c.flowUse.length + ')</h3><div class="tall">' + tbl(['Flow', 'Calls'], c.flowUse.map(([fl, n]) => [esc(fl), fmt(n)]), [1]) + '</div>';
    $('profile').innerHTML = p + '</div>';
  }
  document.addEventListener('click', (e) => { const tr = e.target.closest('tr.pick'); if (tr) { show(+tr.dataset.i); $('profile').scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
  $('pick').addEventListener('change', (e) => show(+e.target.value));
  show(0);
})();
</script>
</body>
</html>
`;
}

const outputs = {
  [OUT_JSON]: `${JSON.stringify(register, null, 1)}\n`,
  [OUT_CSV]: toCsv(),
  [OUT_MD]: toMd(),
  /* Both pages carry the brand kit, written in here exactly as `npm run brand:sync` would. */
  [OUT_HTML]: refreshSubs(refreshLogos(refreshBlock(toMatrixHtml()))),
  [OUT_DETAILS_HTML]: refreshSubs(refreshLogos(refreshBlock(toDetailsHtml()))),
};

/* A register that carries a credential is a leak, whatever else it is. */
for (const [f, body] of Object.entries(outputs)) {
  const leak = /sig=[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-or-v1-[0-9a-f]{20,}|hf_[A-Za-z0-9]{20,}/.exec(body);
  if (leak) { console.error(`✖ ${f} would carry a credential (${leak[0].slice(0, 8)}…) — refusing to write.`); process.exit(1); }
}

/* The workbook is built from the JSON by scripts/build-connector-register-xlsx.py (openpyxl), so
   it is not rewritten here. It records the SHA-256 of the JSON it was built from, and a workbook
   built from any other register is stale. */
function workbookFingerprintCheck(jsonBody, xlsx = OUT_XLSX) {
  const script = xlsx === OUT_XLSX ? 'build-connector-register-xlsx.py' : 'build-connector-details-xlsx.py';
  const abs = join(ROOT, xlsx);
  if (!existsSync(abs)) return `${xlsx} is missing — run: python3 scripts/${script}`;
  const want = sha(Buffer.from(jsonBody, 'utf8'));
  let text = '';
  try { for (const m of openZip(abs).members) if (/sharedStrings\.xml$|core\.xml$/.test(m.name)) text += m.read().toString('utf8'); } catch (e) { return `${xlsx} is unreadable: ${e.message}`; }
  return text.includes(want) ? null : `${xlsx} was built from a different register — run: python3 scripts/${script}`;
}

if (check) {
  const stale = Object.entries(outputs).filter(([f, body]) => !existsSync(join(ROOT, f)) || readFileSync(join(ROOT, f), 'utf8') !== body).map(([f]) => f);
  if (stale.length) { console.error(`✖ connector register is stale: ${stale.join(', ')}\n  Run: npm run connectors`); process.exit(1); }
  for (const wb of [OUT_XLSX, OUT_DETAILS_XLSX]) {
    const wbStale = workbookFingerprintCheck(outputs[OUT_JSON], wb);
    if (wbStale) { console.error(`✖ ${wbStale}`); process.exit(1); }
  }
  console.log(`✔ connector register is current — ${summary.artefacts} artefacts, ${summary.connectorRows} connector rows, ${summary.connectors} connectors.`);
} else {
  mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
  for (const [f, body] of Object.entries(outputs)) writeFileSync(join(ROOT, f), body);
  for (const wb of [OUT_XLSX, OUT_DETAILS_XLSX]) {
    const wbStale = workbookFingerprintCheck(outputs[OUT_JSON], wb);
    if (wbStale) console.log(`ℹ ${wbStale}`);
  }
  console.log(JSON.stringify(summary, null, 1));
}
