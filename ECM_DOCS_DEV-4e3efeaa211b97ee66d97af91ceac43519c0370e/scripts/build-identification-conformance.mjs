#!/usr/bin/env node
/**
 * The identification system's quick conformance changes for the flows the tenant runs today
 * (IDENTIFICATION_SYSTEM.md §13, the 1.1 review's quick fixes). They need no new SharePoint column.
 *
 *   npm run idconformance             build the stage and report it (writes nothing)
 *   npm run idconformance -- --check  the same; fails if an edit no longer applies to its source
 *
 * The stage is not kept as packages (owner direction, 2026-10-21: the branch holds only the latest version of every
 * package). The tenant runs the identification release (packages/identification-phase3/ and -phase4/), which
 * build-identification-phase3.mjs builds from this stage in memory: import { conformancePackages } from here.
 *
 * Sources, never edited here:
 *   docs/folio-Master-Flows-and-Endpoints/captures/<Name>__<FlowId>.json                    tenant captures (commit 47d1fdf, 1 Oct 2026): what runs now
 *   docs/folio-Master-Flows-and-Endpoints/captures/build-sources/*.json  later builds of flows whose capture is older (Status,
 *                                                  Upload) or absent (Daily Sweep, created but not captured;
 *                                                  Registry Status Notifier, not yet created)
 *
 * Each source's root scope is converted to the designer clipboard format (nodeId, serializedValue,
 * allConnectionData, staticResults, isScopeNode, mslaNode), then a fixed list of edits is applied. Every
 * edit names the action it touches and the exact expression with the number of times it must appear,
 * so the build fails, rather than guessing, if a source changes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowArtifactName } from './lib/flow-artifact-name.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const DELIVERED = 'docs/folio-Master-Flows-and-Endpoints/captures/build-sources';
const CAPTURES = 'docs/folio-Master-Flows-and-Endpoints/captures';

const WAT = "@formatDateTime(convertFromUtc(utcNow(),'W. Central Africa Standard Time'),'yyyy')";
const CLIENT_REQ = "@string(coalesce(triggerOutputs()?['headers']?['X-Correlation-ID'],triggerBody()?['requestId'],guid()))";
const CLIENT_RAW = "string(coalesce(triggerOutputs()?['headers']?['X-Correlation-ID'],triggerBody()?['requestId'],''))";
/* take() is safe on an empty or short string; substring(x,0,min(64,length(x))) throws when x is empty. */
const CLIENT_CORR = `@take(${CLIENT_RAW},64)`;
const RECEIVED = "convertFromUtc(outputs('Compose_Request_Context')?['receivedAtUtc']";
const RUN_REQ = "@string(workflow()?['run']?['name'])";
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIGITS = (x) => `and(not(empty(${x})),empty(${'0123456789'.split('').reduce((e, d) => `replace(${e},'${d}','')`, x)}))`;

/* ---------------------------------------------------------------- shared edits */
const gatewayRequestId = [
  { why: 'S8 / ID-19: the Request ID is always minted by the flow; the client header or body value is never adopted.',
    action: 'Compose_Request_Context', find: CLIENT_REQ, replace: '@guid()', count: 1 },
  { why: 'ID-19: a client correlation value is kept, sanitised and cut to 64 characters, as clientCorrelationId only.',
    action: 'Compose_Request_Context', set: ['clientCorrelationId'], value: CLIENT_CORR },
  { why: 'ID-19: the run record carries the client correlation value beside the flow\'s own Request ID.',
    action: 'Compose_Flow_Run_Record', set: ['run_identity', 'client_correlation_id'], value: "@outputs('Compose_Request_Context')?['clientCorrelationId']" },
];
const alertTime = [
  { why: 'Failure alerts still render when Compose_Request_Context itself failed: the received time falls back to utcNow().',
    action: '*', within: true, atLeast: 1, find: RECEIVED,
    replace: "convertFromUtc(coalesce(outputs('Compose_Request_Context')?['receivedAtUtc'],utcNow())" },
];
const eventRequestId = [
  { why: 'ID-19: every run mints its Request ID with guid(); the run name stays in the run record as run_name (PA_RUN locator).',
    action: 'Compose_Request_Context', find: RUN_REQ, replace: '@guid()', count: 1 },
];
const exactReference = (scope) => ({
  why: 'S5 / V10: a reference is matched exactly. The padded variant could make a legacy NITDA-2026-217 find the unrelated NITDA-2026-00217.',
  action: 'Get_Submission_By_Reference', within: true, count: 1,
  find: `concat('(ReferenceId eq ''',replace(outputs('Compose_${scope}_Reference'),'''',''''''),''' or ReferenceId eq ''',replace(outputs('Compose_${scope}_Ref_Padded'),'''',''''''),''') and SenderEmail eq ''',`,
  replace: `concat('ReferenceId eq ''',replace(outputs('Compose_${scope}_Reference'),'''',''''''),''' and SenderEmail eq ''',`,
});

/* ---------------------------------------------------------------- Support: CASE-XXXXXX, 5 draws */
const draw = () => `concat('CASE-',${Array.from({ length: 6 }, () => `substring('${ALPHA}',rand(0,32),1)`).join(',')})`;
const C = (i) => `outputs('Compose_Support_Minted_Ref')[${i}]`;
const TAKEN = (i) => `contains(string(coalesce(outputs('Get_Existing_Case')?['body/value'],json('[]'))),concat('"',${C(i)},'"'))`;

/* ---------------------------------------------------------------- DYNAMIC_ACTIONS: interim target (B10) */
const REF = "outputs('Compose_Dynamic_Input')?['ref']";
const DOC = "outputs('Compose_Dynamic_Input')?['docId']";
const SPO = `startsWith(toLower(${REF}),'spo:')`;
const SPO_ID = `last(split(${REF},'/'))`;
const target = (guid) => `@if(if(${SPO},and(equals(toLower(first(split(${REF},'/'))),'spo:${guid}'),${DIGITS(SPO_ID)}),${DIGITS(DOC)}),concat('ID eq ',if(${SPO},${SPO_ID},${DOC})),'ID eq 0')`;
const oldTarget = (guid) => `@if(${DIGITS(DOC)},concat('ID eq ',${DOC}),concat('RefIDD eq ''',replace(${REF},'''',''''''),''''))`;
const DIGITAL_OPS = '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3';
const TASK_QUEUE = 'ee82725a-c408-45e2-a8e8-facf7a092047';

const FLOWS = [
  { name: 'CG_Submission_Endpoint', source: 'capture', edits: [
    ...gatewayRequestId,
    { why: 'ID-04: the year of issue is the West Africa Time year, so an item received at 00:30 on 1 January (WAT) is numbered in the new year.',
      action: 'Compose_Submission_Year', find: "@formatDateTime(utcNow(),'yyyy')", replace: WAT, count: 1 },
    ...['Get_Sequence_Counter', 'Get_Sequence_Counter_Current_1', 'Get_Sequence_Counter_Current_2', 'Get_Sequence_Counter_Current_3'].map((a) => ({
      why: 'ID-04 / §8.2: the counter row is read by Prefix and Year, as IP_SCAN_INTAKE reads it, so both channels share one number line.',
      action: a, find: "@concat('Year eq ''',outputs('Compose_Submission_Year'),'''')",
      replace: "@concat('Year eq ''',outputs('Compose_Submission_Year'),''' and Prefix eq ''NITDA''')", count: 1 })),
    { why: 'S6: duplicate detection is a query on indexed attributes (sender, subject, attachment count, 24-hour window), not the client\'s localId. AttachmentHashSet joins it when Phase 1 adds the column (B5).',
      action: 'Get_Existing_Submission', count: 1,
      find: "@if(empty(outputs('Compose_Submission_LocalId')),'ID eq 0',concat('LocalId eq ''',replace(outputs('Compose_Submission_LocalId'),'''',''''''),''' and SenderEmail eq ''',replace(outputs('Compose_Submission_SenderEmail'),'''',''''''),''''))",
      replace: "@concat('SenderEmail eq ''',replace(outputs('Compose_Submission_SenderEmail'),'''',''''''),''' and Subject eq ''',replace(outputs('Compose_Submission_Subject'),'''',''''''),''' and AttachmentCount eq ',string(length(outputs('Compose_Submission_Attachments'))),' and SubmittedAtUtc ge ''',formatDateTime(addHours(utcNow(),-24),'yyyy-MM-ddTHH:mm:ssZ'),'''')" },
    { why: 'Stored file name (§11.5): no part of the upload ticket. The fragment is 8 hex characters of a flow guid(), which becomes the ATT Entity Key when Phase 1 adds the column.',
      // twice: the name itself and the length() that caps it at 255; both fragments are 8 characters, so the cap is exact
      action: 'Compose_Ticket_Stored_Name', within: true, count: 2,
      find: "substring(string(outputs('Compose_Ticket_Token')),0,6)", replace: "substring(replace(guid(),'-',''),0,8)" },
    { why: '§8.2: when every claim attempt loses the race the flow answers 503 RETRY_LATER; nothing is issued or written.',
      action: 'Compose_Result_Submission_409', set: ['status'], value: 503 },
    { why: '§8.2.', action: 'Compose_Result_Submission_409', set: ['data', 'code'], value: 'RETRY_LATER' },
  ] },
  { name: 'CG_Upload_Endpoint', source: 'delivered', edits: [...gatewayRequestId] },
  { name: 'CG_Portal_Status_Check_Endpoint', source: 'delivered', edits: [...gatewayRequestId, exactReference('Status')] },
  { name: 'CG_Portal_Verification_Endpoint', source: 'capture', edits: [
    ...gatewayRequestId,
    { why: 'The one-time code is drawn with rand(100000,1000000), uniformly, as every legacy OTP flow draws it (§11.5).',
      action: 'Compose_Verify_Code', count: 1,
      find: "@substring(replace(replace(replace(replace(replace(replace(replace(outputs('Compose_Verify_Code_Seed'),'a','1'),'b','3'),'c','5'),'d','7'),'e','9'),'f','2'),'-',''),0,6)",
      replace: '@string(rand(100000,1000000))' },
  ] },
  { name: 'CG_Portal_Verification_Confirmation_Endpoint', source: 'capture', edits: [...gatewayRequestId] },
  { name: 'CG_Portal_Support_Endpoint', source: 'capture', edits: [
    ...gatewayRequestId,
    { why: 'S4 / ID-06: any reference sent by the client is ignored.',
      action: 'Compose_Support_Client_Ref', find: "@toUpper(trim(string(coalesce(triggerBody()?['ref'],''))))", replace: "@trim(' ')", count: 1 },
    { why: 'S4 / ID-06: CASE- plus 6 characters from the unambiguous alphabet, drawn with rand(); five candidates are drawn at once.',
      action: 'Compose_Support_Minted_Ref', count: 1,
      find: "@concat('CASE-',formatDateTime(utcNow(),'yyyyMMdd'),'-',toUpper(substring(replace(guid(),'-',''),0,6)))",
      replace: `@createArray(${draw()},${draw()},${draw()},${draw()},${draw()})` },
    { why: 'ID-06.', action: 'Compose_Support_Requested_Ref', count: 1,
      find: "@if(empty(outputs('Compose_Support_Client_Ref')),outputs('Compose_Support_Minted_Ref'),outputs('Compose_Support_Client_Ref'))",
      replace: `@${C(0)}` },
    { why: 'ID-06: one query checks all five candidates against the cases already issued.',
      action: 'Get_Existing_Case', count: 1, find: "@concat('Title eq ''',replace(outputs('Compose_Support_Requested_Ref'),'''',''''''),'''')",
      replace: `@concat(${[0, 1, 2, 3, 4].map((i) => `'${i ? ' or ' : ''}Title eq ''',${C(i)},''''`).join(',')})` },
    { why: 'ID-06.', action: 'Get_Existing_Case', set: ['parameters', '$top'], value: 5 },
    { why: 'ID-06: "new" unless all five candidates are taken (redrawn up to 5 times, §8.3).', action: 'Compose_Support_Case_State', count: 1,
      find: "@if(empty(first(coalesce(outputs('Get_Existing_Case')?['body/value'],json('[]')))),'new',if(equals(toLower(string(first(coalesce(outputs('Get_Existing_Case')?['body/value'],json('[]')))?['Email'])),outputs('Compose_Support_Email')),'replay','conflict'))",
      replace: `@if(and(${[0, 1, 2, 3, 4].map(TAKEN).join(',')}),'conflict','new')` },
    { why: 'ID-06: the case takes the first candidate not already issued.', action: 'Compose_Support_Case_Ref', count: 1,
      find: "@if(equals(outputs('Compose_Support_Case_State'),'conflict'),outputs('Compose_Support_Minted_Ref'),outputs('Compose_Support_Requested_Ref'))",
      replace: `@${[0, 1, 2, 3].reduceRight((e, i) => `if(not(${TAKEN(i)}),${C(i)},${e})`, C(4))}` },
  ] },
  { name: 'CG_Portal_Writeback_Endpoint', source: 'capture', edits: [...gatewayRequestId, exactReference('Writeback')] },
  { name: 'CG_Registry_Status_Notifier', source: 'delivered', edits: [...eventRequestId] },
  { name: 'CG_Portal_Daily_Sweep', source: 'delivered', edits: [...eventRequestId] },
  { name: 'AUTO_SCHEDULED_SWEEP', source: 'capture', edits: [...eventRequestId] },
  { name: 'IP_Dynamic_Global_Actions_Endpoint', source: 'capture', root: 'Scope_Dynamic_Flow', edits: [
    ...gatewayRequestId,
    ...[['Get_Dynamic_Document', DIGITAL_OPS], ['Get_Dynamic_Status_Document', DIGITAL_OPS], ['Get_Dynamic_Task', TASK_QUEUE]].map(([a, g]) => ({
      why: 'B10 / R-NO-ROWNUM: a target is located by spo:<listGuid>/<itemId> on the operation\'s own list, or by the item ID Folio sends for that list (the same locator). RefIDD and titles are never used to locate a record.',
      action: a, find: oldTarget(g), replace: target(g), count: 1 })),
    { why: 'B10: a target that is neither an spo: locator nor an item ID is refused with TARGET_UNRESOLVED.',
      action: 'Compose_Dynamic_Invalid', within: true, count: 1,
      find: `and(contains(createArray('update','update-task','transitionstatus'),outputs('Compose_Dynamic_Operation')),empty(${REF}),empty(${DOC})),'A record reference or item ID is required.'`,
      replace: `and(contains(createArray('update','update-task','transitionstatus'),outputs('Compose_Dynamic_Operation')),not(or(and(${SPO},${DIGITS(SPO_ID)}),${DIGITS(DOC)}))),'TARGET_UNRESOLVED: send the record as spo:<listGuid>/<itemId> or its item ID; a RefIDD or title is not accepted.'` },
  ] },
];

/* ---------------------------------------------------------------- sources */
const captures = Object.fromEntries(readdirSync(join(ROOT, CAPTURES)).filter((f) => f.endsWith('.json')).map((f) => {
  const d = JSON.parse(readFileSync(join(ROOT, CAPTURES, f), 'utf8').replace(/^﻿/, ''));
  return [d.Name, { file: `${CAPTURES}/${f}`, d }];
}));

function children(a) {
  return [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions].filter(Boolean);
}
function* walk(acts) {
  for (const [n, a] of Object.entries(acts || {})) { yield [n, a]; for (const c of children(a)) yield* walk(c); }
}

/* Full definition (as captured) → designer clipboard node. */
function fromCapture(cap, rootName) {
  const defs = cap.d.Definition.actions;
  const root = rootName || Object.keys(defs).find((k) => defs[k].type === 'Scope' && /^Scope_.*_Flow$/.test(k));
  if (!root) throw new Error(`${cap.d.Name}: no root scope in ${cap.file}`);
  const scope = structuredClone(defs[root]);
  const conn = Object.fromEntries((cap.d.ConnectionReferences || []).map((c) => [c.id, c.connectionName]));
  const all = {};
  for (const [n, a] of walk(scope.actions)) {
    if (a.type !== 'OpenApiConnection') continue;
    const h = a.inputs.host;
    const key = h.connection || h.connectionName;
    a.inputs.host = { apiId: h.apiId, connection: key, operationId: h.operationId };
    delete a.inputs.authentication;
    if (!conn[h.apiId]) throw new Error(`${cap.d.Name}: no connection reference for ${h.apiId}`);
    all[n] = { connectionReference: { api: { id: h.apiId }, connection: { id: `${h.apiId}/connections/${conn[h.apiId]}` }, connectionName: conn[h.apiId] }, referenceKey: key };
  }
  scope.runAfter = {};
  return { nodeId: root, serializedValue: scope, allConnectionData: all, staticResults: {}, isScopeNode: true, mslaNode: true };
}

function load(f) {
  if (f.source === 'capture') {
    const cap = captures[f.name];
    if (!cap || !cap.d.Definition) throw new Error(`${f.name}: no capture with a definition under ${CAPTURES}/`);
    return { node: fromCapture(cap, f.root), from: cap.file, flowId: cap.d.FlowGuid, modified: cap.d.Modified };
  }
  const p = `${DELIVERED}/${f.name}.build-source.json`;
  return { node: JSON.parse(readFileSync(join(ROOT, p), 'utf8')), from: p, flowId: captures[f.name]?.d.FlowGuid || '(not captured)', modified: captures[f.name]?.d.Modified || '' };
}

/* ---------------------------------------------------------------- take(): no substring that can run past the end */
/* substring(X,0,min(length(X),N)) throws when X is empty; take(X,N) returns the same text and never throws. */
function argsAt(s, open) {
  const out = []; let depth = 0, q = false, start = open + 1;
  for (let k = open; k < s.length; k++) {
    const ch = s[k];
    if (q) { if (ch === "'") { if (s[k + 1] === "'") k++; else q = false; } continue; }
    if (ch === "'") q = true;
    else if (ch === '(') depth++;
    else if (ch === ')') { if (--depth === 0) { out.push(s.slice(start, k)); return { args: out, end: k }; } }
    else if (ch === ',' && depth === 1) { out.push(s.slice(start, k)); start = k + 1; }
  }
  throw new Error('unbalanced expression');
}
function takeSafe(s, counter) {
  let out = '', i = 0;
  for (;;) {
    const j = s.indexOf('substring(', i);
    if (j < 0) return out + s.slice(i);
    if (j > 0 && /[A-Za-z_]/.test(s[j - 1])) { out += s.slice(i, j + 10); i = j + 10; continue; }
    const { args, end } = argsAt(s, j + 9);
    const [x, from, len] = args;
    const m = args.length === 3 && from === '0' && (len.match(/^min\((\d+),length\((.*)\)\)$/s) || len.match(/^min\(length\((.*)\),(\d+)\)$/s));
    const n = m && (/^\d+$/.test(m[1]) ? m[1] : m[2]);
    const inner = m && (/^\d+$/.test(m[1]) ? m[2] : m[1]);
    if (m && inner === x) { counter.n++; out += s.slice(i, j) + `take(${takeSafe(x, counter)},${n})`; }
    else out += s.slice(i, j) + 'substring(' + args.map((a) => takeSafe(a, counter)).join(',') + ')';
    i = end + 1;
  }
}
const deepTake = (v, c) => typeof v === 'string' ? takeSafe(v, c) : Array.isArray(v) ? v.map((x) => deepTake(x, c))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepTake(x, c)])) : v;

/* ---------------------------------------------------------------- edit engine */
function replaceIn(node, e, counter) {
  if (typeof node === 'string') {
    if (e.within ? node.includes(e.find) : node === e.find) {
      counter.n += e.within ? node.split(e.find).length - 1 : 1;
      return e.within ? node.split(e.find).join(e.replace) : e.replace;
    }
    return node;
  }
  if (Array.isArray(node)) return node.map((x) => replaceIn(x, e, counter));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, replaceIn(v, e, counter)]));
  return node;
}
function apply(flow, node, e) {
  if (e.action === '*') {
    const counter = { n: 0 };
    for (const [, a] of walk(node.serializedValue.actions)) a.inputs = replaceIn(a.inputs, e, counter);
    if (counter.n < e.atLeast) throw new Error(`${flow}: expected at least ${e.atLeast} occurrence(s), found ${counter.n}.\n  ${e.find}`);
    return;
  }
  const hit = [...walk(node.serializedValue.actions)].find(([n]) => n === e.action);
  if (!hit) throw new Error(`${flow}: action ${e.action} not found`);
  const a = hit[1];
  if (e.set) {
    let o = a.inputs;
    for (const k of e.set.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) throw new Error(`${flow}: ${e.action} has no ${k}`); o = o[k]; }
    o[e.set.at(-1)] = e.value;
    return;
  }
  const counter = { n: 0 };
  a.inputs = replaceIn(a.inputs, e, counter);
  if (counter.n !== e.count) throw new Error(`${flow}: ${e.action}: expected ${e.count} occurrence(s), found ${counter.n}. The source changed; review the edit.\n  ${e.find}`);
}

const files = {};
const sheet = [];
for (const f of FLOWS) {
  const { node, from, flowId, modified } = load(f);
  for (const e of [...f.edits, ...alertTime]) apply(f.name, node, e);
  const took = { n: 0 };
  node.serializedValue = deepTake(node.serializedValue, took);
  /* Flow artefact name (catalogue namingConventions.flowArtifactFile): <KEY>__<flow>__<flow id8>; one package per flow
     here, so no part. */
  const out = flowArtifactName({ flowName: f.name, kind: 'paste.json' });
  files[out] = JSON.stringify(node, null, 2) + '\n';
  sheet.push({ ...f, edits: [...f.edits, ...alertTime], took: took.n, out, from, flowId, modified, root: node.nodeId, steps: [...walk(node.serializedValue.actions)].length });
}

/* The stage, by package file name, for build-identification-phase3.mjs and the tests. Nothing is written. */
export const conformancePackages = Object.fromEntries(Object.entries(files).map(([n, t]) => [n, JSON.parse(t)]));
export const conformanceSheet = sheet;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`identification conformance: ${Object.keys(files).length} packages built in memory (${FLOWS.length} flows)${CHECK ? '; every edit applied to its source' : ''}`);
}
