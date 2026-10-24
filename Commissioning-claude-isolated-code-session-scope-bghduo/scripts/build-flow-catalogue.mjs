#!/usr/bin/env node
/**
 * A page per deployed flow: what triggers it, what it accepts, what it touches, what it returns,
 * and its whole structure.
 *
 * WHY THIS EXISTS
 * Fifty-seven flow definitions were exported from the tenant, and eleven of them were documented.
 * The other forty-six were present as JSON and absent as knowledge: to answer "what does
 * `Get Correspondences` do, and what does it accept" someone had to open a 1,300-line file and
 * read it. That is the state the whole estate was in before this work, and it is how a flow ends
 * up cloned from another and never rewritten without anyone noticing.
 *
 * Everything here is read out of the definition. Nothing is asserted:
 *   - the trigger's method and its request schema, property by property, with required marked
 *   - every SharePoint list touched, resolved through the list index to a real title and site
 *   - which connectors it uses, and every HTTP host it calls
 *   - the response status codes it can return
 *   - its score against the build standard
 *   - the full action tree
 *
 * The one thing not derivable is a sentence saying WHY the flow exists. Where the contract
 * register attributes a flow to a contract key, that key's purpose is used. Where it does not,
 * the flow is listed under "no stated purpose" rather than given an invented one.
 *
 * Usage:
 *   node scripts/build-flow-catalogue.mjs
 *   node scripts/build-flow-catalogue.mjs --check
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, definitionRoot, identity, isFlowDocument, collectActions } from './lib/flow-definition-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/* A repository-relative path with forward slashes, on every platform. `join` yields backslashes
   on Windows, so slicing a `${ROOT}/` prefix off it matches nothing there: the absolute path
   survives into the catalogue, and the contract register — which is keyed by forward-slash paths
   — stops resolving, so every flow reads as having no stated purpose. The file then differs from
   the committed one and `--check` reports it stale on Windows and only on Windows. */
const repoPath = (abs) => relative(ROOT, abs).split(sep).join('/');

const listIndex = read('docs/reference/sharepoint-list-index.json');
const register = read('docs/reference/internal-flow-register.json');
const listMap = read('docs/reference/flow-list-map.json');
const standard = read('docs/deployment/sharepoint/flow-standard.json');

/** GUID -> { title, site }, so a `table` parameter becomes a name a person recognises. */
const listsByGuid = new Map();
for (const [guid, l] of Object.entries(listIndex.lists || {})) {
  listsByGuid.set(String(guid).toLowerCase(), { title: l.title, site: l.site });
}

/* Purpose is cited from two places, never invented.
   Internal flows: the contract register links a key to the definition FILE, which is the only
   reliable join — flowLabel is a human label and does not match the flow's display name.
   Portal flows: the wiring specification states each endpoint's purpose. */
const purposeByFile = new Map();
for (const c of register.contractKeys || []) {
  for (const def of c.definitions || []) {
    if (!purposeByFile.has(def)) purposeByFile.set(def, []);
    purposeByFile.get(def).push({ key: c.key, label: c.flowLabel, action: c.fixedAction, physical: c.physicalFlow });
  }
}
const wiring = read('docs/deployment/sharepoint/portal-wiring.json');
const purposeByPortalFlow = new Map();
for (const e of wiring.endpoints || []) {
  for (const f of e.deployedFlowCandidates || []) {
    purposeByPortalFlow.set(f, { endpoint: e.endpoint, purpose: e.purpose });
  }
}

const scoreByFlow = new Map();
try {
  const { execFileSync } = await import('node:child_process');
  const m = JSON.parse(execFileSync(process.execPath,
    [join(ROOT, 'scripts/verify-flow-standard.mjs'), '--json'], { encoding: 'utf8' }));
  for (const f of m.flows) scoreByFlow.set(f.flow, f);
} catch { /* the catalogue still builds without conformance scores */ }

const PORTAL = new Set(standard.portalFlows || []);

/* ------------------------------------------------------------- read them */

const flows = [];
for (const file of walk(join(ROOT, 'docs/reference/flow-contracts/deployed'))) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { continue; }
  if (!isFlowDocument(doc)) continue;
  const id = identity(doc);
  const def = definitionRoot(doc);
  const actions = collectActions(def.actions, '', []);

  const trigger = Object.entries(def.triggers || {})[0] || [null, null];
  const [triggerName, triggerBody] = trigger;
  const schema = triggerBody?.inputs?.schema;

  const byType = new Map();
  for (const a of actions) byType.set(a.action.type, (byType.get(a.action.type) || 0) + 1);

  const connectors = new Set();
  const hosts = new Set();
  const listRefs = new Map();
  const statuses = new Set();
  for (const { action } of actions) {
    const conn = action.inputs?.host?.connectionName || action.inputs?.host?.apiId?.split('/').pop();
    if (conn) connectors.add(conn);
    const p = action.inputs?.parameters || {};
    const table = p.table || p['table'];
    if (typeof table === 'string') {
      const hit = listsByGuid.get(table.toLowerCase());
      const op = action.inputs?.host?.operationId || '?';
      const key = hit ? `${hit.site}/${hit.title}` : table;
      if (!listRefs.has(key)) listRefs.set(key, new Set());
      listRefs.get(key).add(op);
    }
    if (action.type === 'Http' && typeof action.inputs?.uri === 'string') {
      try { hosts.add(new URL(action.inputs.uri).host); } catch { /* an expression, not a URL */ }
    }
    if (action.type === 'Response') statuses.add(String(action.inputs?.statusCode ?? '?'));
  }

  flows.push({
    ...id,
    file: repoPath(file),
    portal: PORTAL.has(id.displayName),
    triggerName, triggerType: triggerBody?.type, triggerKind: triggerBody?.kind,
    method: triggerBody?.inputs?.method || (triggerBody?.type === 'Request' ? 'POST' : null),
    schema,
    actionCount: actions.length,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    connectors: [...connectors].sort(),
    hosts: [...hosts].sort(),
    listRefs: [...listRefs.entries()].sort(),
    statuses: [...statuses].sort(),
    def,
  });
}
flows.sort((a, b) =>byteCompare( String(a.displayName), String(b.displayName)));

/* ------------------------------------------------------------- render it */

const out = [];
const emit = (s = '') => out.push(s);

function tree(actions, depth = 0) {
  for (const [name, action] of Object.entries(actions || {})) {
    const after = Object.keys(action.runAfter || {});
    emit(`${'  '.repeat(depth)}- ${name} [${action.type}]${after.length ? ` after ${after.join(', ')}` : ' (first)'}`);
    if (action.actions) tree(action.actions, depth + 1);
    if (action.else?.actions) { emit(`${'  '.repeat(depth + 1)}ELSE`); tree(action.else.actions, depth + 2); }
    if (action.default?.actions) { emit(`${'  '.repeat(depth + 1)}DEFAULT`); tree(action.default.actions, depth + 2); }
    for (const [cn, br] of Object.entries(action.cases || {})) {
      emit(`${'  '.repeat(depth + 1)}CASE ${cn} = ${JSON.stringify(br.case)}`);
      tree(br.actions, depth + 2);
    }
  }
}

function schemaRows(schema, prefix = '', rows = []) {
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  for (const [name, spec] of Object.entries(props)) {
    rows.push({
      name: prefix + name,
      type: Array.isArray(spec.type) ? spec.type.join(' | ') : (spec.type || 'any'),
      required: required.has(name),
      note: spec.description || (spec.enum ? `one of ${spec.enum.map((e) => `\`${e}\``).join(', ')}` : ''),
    });
    if (spec.type === 'object' && spec.properties) schemaRows(spec, `${prefix}${name}.`, rows);
    if (spec.type === 'array' && spec.items?.properties) schemaRows(spec.items, `${prefix}${name}[].`, rows);
  }
  return rows;
}

emit('# Flow catalogue');
emit();
emit('> Generated by `scripts/build-flow-catalogue.mjs`. Do not edit by hand — run');
emit('> `npm run catalogue`. `npm test` fails if this file has drifted from the definitions.');
emit();
emit(`Every flow exported from the tenant: **${flows.length} definitions**. For each one, read out of`);
emit('its own definition — what triggers it, what it accepts, what it touches, what it returns, and');
emit('its full structure.');
emit();
emit('**Purpose is the one thing a definition cannot state.** Where the contract register attributes');
emit('a flow to a contract key, that key is cited. Where it does not, the flow is marked *no stated');
emit('purpose* rather than given an invented one — an invented purpose is worse than an absent one,');
emit('because it reads as knowledge.');
emit();

const withPurpose = flows.filter((f) => (purposeByFile.get(f.file) || []).length || purposeByPortalFlow.has(f.displayName)).length;
const withSchema = flows.filter((f) => f.schema?.properties && Object.keys(f.schema.properties).length).length;
emit('| | |');
emit('|---|---|');
emit(`| Definitions catalogued | ${flows.length} |`);
emit(`| Portal flows | ${flows.filter((f) => f.portal).length} |`);
emit(`| Attributed to a contract key | ${withPurpose} |`);
emit(`| Declaring a request schema | ${withSchema} |`);
emit(`| **No stated purpose** | **${flows.length - withPurpose}** |`);
emit();

emit('## Index');
emit();
emit('| Flow | Trigger | Actions | Lists touched | Standard |');
emit('|---|---|---|---|---|');
for (const f of flows) {
  const s = scoreByFlow.get(f.displayName);
  emit(`| [\`${f.displayName}\`](#${anchor(f.displayName)}) | ${f.triggerType || '—'} | ${f.actionCount} | ${f.listRefs.length} | ${s ? `${s.pct}%` : '—'} |`);
}
emit();

function anchor(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

for (const f of flows) {
  emit('---');
  emit();
  emit(`## ${f.displayName}`);
  emit();

  const keys = purposeByFile.get(f.file) || [];
  const portal = purposeByPortalFlow.get(f.displayName);
  if (portal) {
    emit(`**Purpose** — serves the **${portal.endpoint}** endpoint of the document portal. ${portal.purpose}`);
    emit();
    emit('_Cited from `docs/deployment/sharepoint/portal-wiring.json`._');
  } else if (keys.length) {
    emit(`**Purpose** — ${keys[0].label}.`);
    emit();
    emit(`Serves ${keys.length === 1 ? 'contract key' : 'contract keys'} ${keys.map((k) => `\`${k.key}\`${k.action ? ` (action \`${k.action}\`)` : ''}`).join(', ')}, as physical flow \`${keys[0].physical}\`.`);
    emit();
    emit('_Cited from `docs/reference/internal-flow-register.json`._');
  } else {
    emit('**Purpose** — _no stated purpose._ Nothing attributes this flow to a contract key or a');
    emit('portal endpoint, and a definition cannot say why it exists. What it *does* is below. Until');
    emit('someone who knows writes a sentence here, treat it as unowned.');
  }
  emit();

  emit('| | |');
  emit('|---|---|');
  emit(`| Internal name | \`${f.internalName || '—'}\` |`);
  if (f.workflowId) emit(`| Workflow id | \`${f.workflowId}\` |`);
  emit(`| Estate | ${f.portal ? 'Document portal — **anonymous callers**' : 'Internal platform'} |`);
  emit(`| Trigger | \`${f.triggerName}\` — ${f.triggerType}${f.triggerKind ? ` (${f.triggerKind})` : ''}${f.method ? `, ${f.method}` : ''} |`);
  emit(`| Actions | ${f.actionCount} |`);
  emit(`| Connectors | ${f.connectors.length ? f.connectors.map((c) => `\`${c}\``).join(', ') : '—'} |`);
  if (f.hosts.length) emit(`| Outbound HTTP | ${f.hosts.map((h) => `\`${h}\``).join(', ')} |`);
  if (f.statuses.length) emit(`| Response codes | ${f.statuses.map((s) => `\`${s}\``).join(', ')} |`);
  const s = scoreByFlow.get(f.displayName);
  if (s) emit(`| Build standard | ${s.pct}%${s.missing.length ? ` — missing ${s.missing.map((m) => `\`${m}\``).join(', ')}` : ' — conforms fully'} |`);
  emit(`| Definition | \`${f.file}\` |`);
  emit();

  const rows = f.schema ? schemaRows(f.schema) : [];
  if (rows.length) {
    emit('### Request parameters');
    emit();
    emit('| Property | Type | Required | Note |');
    emit('|---|---|---|---|');
    for (const r of rows) emit(`| \`${r.name}\` | ${r.type} | ${r.required ? '**yes**' : 'no'} | ${r.note} |`);
    emit();
  } else if (f.triggerType === 'Request') {
    emit('### Request parameters');
    emit();
    emit('_The trigger declares no schema, so any JSON body is accepted and nothing is validated at');
    emit('the boundary._');
    emit();
  }

  if (f.listRefs.length) {
    emit('### SharePoint lists');
    emit();
    emit('| List | Operations |');
    emit('|---|---|');
    for (const [name, ops] of f.listRefs) emit(`| ${name} | ${[...ops].sort().join(', ')} |`);
    emit();
  }

  emit('### Action inventory');
  emit();
  emit(f.byType.map(([t, n]) => `${n} × \`${t}\``).join(' · '));
  emit();

  emit('<details><summary>Full structure</summary>');
  emit();
  emit('```');
  tree(f.def.actions);
  emit('```');
  emit();
  emit('</details>');
  emit();
}

const text = `${out.join('\n')}\n`;
const path = join(ROOT, 'docs/reference/FLOW_CATALOGUE.md');
const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
if (now === text) { console.log(check ? '\n✅ the flow catalogue matches the definitions\n' : '\n  unchanged\n'); process.exit(0); }
if (check) { console.error('\n❌ docs/reference/FLOW_CATALOGUE.md is stale — run: npm run catalogue\n'); process.exit(1); }
writeFileSync(path, text);
console.log(`\n  wrote docs/reference/FLOW_CATALOGUE.md — ${flows.length} flows, ${flows.length - withPurpose} with no stated purpose\n`);
