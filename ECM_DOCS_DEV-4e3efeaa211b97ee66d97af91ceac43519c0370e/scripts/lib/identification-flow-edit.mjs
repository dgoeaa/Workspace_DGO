/**
 * Shared steps for the identification phase builders (build-identification-phase3.mjs, -phase4.mjs): find, check and
 * replace actions in a designer-clipboard package, convert a tenant capture into one, and give new SharePoint steps the
 * flow's own connection key. Every edit checks the text it expects, so a builder fails, rather than guessing, when its
 * source changes.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip } from './zip-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/* ---------------------------------------------------------------- tree helpers */
export function locate(root, name) {
  let hit = null;
  const walk = (actions) => {
    for (const [n, a] of Object.entries(actions || {})) {
      if (n === name) { if (hit) throw new Error(`${name} appears twice`); hit = { parent: actions, a }; }
      walk(a.actions); if (a.else) walk(a.else.actions);
      for (const c of Object.values(a.cases || {})) walk(c.actions);
      if (a.default) walk(a.default.actions);
    }
  };
  walk(root);
  if (!hit) throw new Error(`source has no action ${name}`);
  return hit;
}
export function names(root) {
  const out = new Set();
  const walk = (actions) => { for (const [n, a] of Object.entries(actions || {})) {
    out.add(n); walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(root);
  return out;
}
/** Replaces `find` with `replace` in one action's JSON exactly `count` times. */
export function swap(root, action, find, replace, count) {
  const { parent, a } = locate(root, action);
  const s = JSON.stringify(a);
  const n = s.split(find).length - 1;
  if (n !== count) throw new Error(`${action}: expected ${count}× ${find.slice(0, 80)}, found ${n}`);
  parent[action] = JSON.parse(s.split(find).join(replace));
}
export const jsonText = (expr) => JSON.stringify(expr).slice(1, -1);
export const ok = (name) => ({ [name]: ['Succeeded'] });
export const ALWAYS = ['Succeeded', 'Failed', 'Skipped', 'TimedOut'];
/** A directory row's role. Role is a Choice column (docs/reference/sharepoint-provisioning-spec.json), which the
 *  connector returns as an object; read as text it never matched a RoleId. Property access on a plain string fails in
 *  the service, so the value is read through its JSON text, which works for either form. */
export const ROLE_OF = (row) => `toLower(trim(string(coalesce(json(if(startsWith(string(coalesce(${row}?['Role'],'')),'{'),string(${row}?['Role']),concat('{"Value":"',replace(string(coalesce(${row}?['Role'],'')),'"',''),'"}')))?['Value'],''))))`;
export const edit = (log, why, fn) => { fn(); log.push(why); };

/** New SharePoint steps use the connection key the flow already uses, so the designer asks for no second
    connection. Returns the allConnectionData entries for the new steps. */
const REGISTRY_MAIL_CONNECTION_ID = 'c0b9e7a5b0854c39a435fd8ce92f48ad'; /* = REGISTRY_MAIL_CONNECTION, declared below */
export function adoptConnections(pkg, before) {
  const all = pkg.allConnectionData;
  const spKey = Object.values(all).map((c) => c.referenceKey).find((k) => /^shared_sharepointonline/.test(k));
  const template = Object.values(all).find((c) => c.referenceKey === spKey);
  const out = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (!before.has(n) && a.type === 'OpenApiConnection') {
      /* A new Office 365 step signs in as the registry mailbox (ITEM-77), under the flow's own Office 365 key when it has one. */
      if (a.inputs.host.connection === 'shared_office365') {
        const o365 = Object.values(all).map((c) => c.referenceKey).find((k) => /^shared_office365/.test(k)) || 'shared_office365';
        a.inputs.host.connection = o365;
        out[n] = { connectionReference: { api: { id: '/providers/Microsoft.PowerApps/apis/shared_office365' }, connection: { id: `/providers/Microsoft.PowerApps/apis/shared_office365/connections/${REGISTRY_MAIL_CONNECTION_ID}` }, connectionName: REGISTRY_MAIL_CONNECTION_ID }, referenceKey: o365 };
      } else {
        if (a.inputs.host.connection !== 'shared_sharepointonline') throw new Error(`${n}: unexpected connection ${a.inputs.host.connection}`);
        a.inputs.host.connection = spKey;
        out[n] = structuredClone(template);
      }
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(pkg.serializedValue.actions);
  return out;
}

/* ---------------------------------------------------------------- tenant exports */
/** A tenant export package (Microsoft.Flow/flows/<folder>/definition.json) → designer clipboard node of one root
 *  scope. Steps keep their connection reference keys; each key resolves through the export's connectionReferences,
 *  which a flow can hold several of for one connector. Returns the node and the flow id the definition names. */
export function fromExport(file, root) {
  const m = openZip(join(ROOT, file)).members.find((x) => /^Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/.test(x.name));
  if (!m) throw new Error(`${file}: no definition.json`);
  const d = JSON.parse(m.read().toString('utf8'));
  const refs = d.properties.connectionReferences || {};
  const scope = structuredClone(d.properties.definition.actions[root]);
  if (!scope) throw new Error(`${file}: no ${root}`);
  const all = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'OpenApiConnection') {
      const h = a.inputs.host; const key = h.connection || h.connectionName; const ref = refs[key];
      if (!ref) throw new Error(`${file}: ${n} uses connection ${key}, which the export does not reference`);
      a.inputs.host = { apiId: h.apiId, connection: key, operationId: h.operationId };
      delete a.inputs.authentication;
      all[n] = { connectionReference: { api: { id: h.apiId }, connection: { id: `${h.apiId}/connections/${ref.connectionName}` }, connectionName: ref.connectionName }, referenceKey: key };
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(scope.actions);
  scope.runAfter = {};
  return { flowId: d.name, node: { nodeId: root, serializedValue: scope, allConnectionData: all, staticResults: {}, isScopeNode: true, mslaNode: true } };
}

/* ---------------------------------------------------------------- tenant captures */
export const CAPTURES = 'docs/folio-Master-Flows-and-Endpoints/captures';
/** Full definition (as captured) → designer clipboard node; the same conversion as build-identification-conformance.mjs. */
export function fromCapture(file, root) {
  const d = JSON.parse(readFileSync(join(ROOT, CAPTURES, file), 'utf8').replace(/^﻿/, ''));
  const scope = structuredClone(d.Definition.actions[root]);
  if (!scope) throw new Error(`${file}: no ${root}`);
  const conn = Object.fromEntries((d.ConnectionReferences || []).map((c) => [c.id, c.connectionName]));
  const all = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'OpenApiConnection') {
      const h = a.inputs.host; const key = h.connection || h.connectionName;
      a.inputs.host = { apiId: h.apiId, connection: key, operationId: h.operationId };
      delete a.inputs.authentication;
      if (!conn[h.apiId]) throw new Error(`${file}: no connection reference for ${h.apiId}`);
      all[n] = { connectionReference: { api: { id: h.apiId }, connection: { id: `${h.apiId}/connections/${conn[h.apiId]}` }, connectionName: conn[h.apiId] }, referenceKey: key };
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(scope.actions);
  scope.runAfter = {};
  return { nodeId: root, serializedValue: scope, allConnectionData: all, staticResults: {}, isScopeNode: true, mslaNode: true };
}

/* ---------------------------------------------------------------- outbox receipts (ITEM-66) */
/** Portal Outbox Receipts (Global_Digital_Documents_Centre): one row per outbound message, the ledger the scheduled sweep and
 *  the tenant evidence read. */
export const RECEIPTS = { site: 'https://nitdanigeria.sharepoint.com/sites/Global_Digital_Documents_Centre', table: '88a81ca1-319a-45f5-8409-f91a24538ffa' };
const SENDS = /^(SendEmailV2|SendEmail|SendMailWithOptions|SendEmailV3)$/;
/** The message type a receipt records, from the send's step name: Send_Sender_Acknowledgement_Email → sender-acknowledgement. */
export const messageType = (send) => send.replace(/^Send_/, '').replace(/_Email$/, '').replace(/[()]/g, '').replace(/_+/g, '-').toLowerCase();
/**
 * Every mail send in the package writes a receipt to Portal Outbox Receipts: type, recipient (the send's own To), the run as
 * reference, sent or failed, and the error text on failure. The message body is never recorded (a code or a citizen's text
 * stays out of the ledger). A send already followed by a receipt write is left as it is.
 *
 * A step that runs after a send's failure handles that failure: the scope around it would end Succeeded, and the flow's catch
 * path and alerts would no longer fire. So the receipt is followed by Compose_<send>_Outcome, which fails exactly when the send
 * failed (int() of a non-number), and the scope ends as it did before the receipt was added. Returns the sends it covered.
 */
/**
 * The sign-in proof is a bearer secret: since release 9 it travels in X-DGO-Proof, which the run record's header
 * redaction (Compose_Redacted_Headers: Authorization, Cookie, x-api-key, ...) did not cover, so every telemetry row stored
 * a usable session token (tenant, 8 October 2026). Both spellings are removed and the masked value set, whichever case the
 * caller sent. Returns the steps changed.
 */
const PROOF_MASK = "'X-DGO-Proof', '***REDACTED***')";
/* setProperty only (removeProperty is not among the functions proven in the tenant): the mask is set under both spellings,
   so it holds whether the service matches header names with or without case. */
export function redactProofHeader(pkg) {
  const changed = [];
  const visit = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (/Redacted_Headers/.test(n) && a.type === 'Compose' && typeof a.inputs === 'string' && a.inputs.startsWith('@setProperty(') && a.inputs.includes("'Authorization'") && !a.inputs.includes(PROOF_MASK)) {
      a.inputs = `@setProperty(setProperty(${a.inputs.slice(1)}, 'x-dgo-proof', '***REDACTED***'), ${PROOF_MASK}`;
      changed.push(n);
    }
    visit(a.actions); if (a.else) visit(a.else.actions); for (const c of Object.values(a.cases || {})) visit(c.actions); if (a.default) visit(a.default.actions);
  } };
  visit(pkg.serializedValue.actions);
  return changed;
}

export function outboxReceipts(pkg) {
  const covered = [];
  const visit = (container) => {
    for (const [n, a] of Object.entries(container || {})) {
      if (a.type === 'OpenApiConnection' && SENDS.test(a.inputs?.host?.operationId || '')) {
        const has = Object.values(container).some((b) => b.runAfter?.[n] && b.inputs?.parameters?.table === RECEIPTS.table);
        if (!has) {
          const R = `Create_${n}_Receipt`, O = `Compose_${n}_Outcome`;
          if (container[R] || container[O]) throw new Error(`${R} already exists`);
          const st = `actions('${n}')?['status']`;
          const err = `string(coalesce(actions('${n}')?['error']?['message'],actions('${n}')?['outputs']?['body']?['message'],'send failed'))`;
          container[R] = { type: 'OpenApiConnection', runAfter: { [n]: ['Succeeded', 'Failed', 'TimedOut'] }, inputs: {
            host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'PostItem' },
            parameters: { dataset: RECEIPTS.site, table: RECEIPTS.table,
              'item/Title': `@concat('${messageType(n)}:',string(coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])),':',string(workflow()?['run']?['name']))`,
              'item/MessageType': messageType(n),
              'item/RecipientEmail': a.inputs.parameters['emailMessage/To'] ?? '',
              'item/Reference': "@string(workflow()?['run']?['name'])",
              'item/SentAtUtc': '@utcNow()',
              'item/Status': `@if(equals(${st},'Succeeded'),'sent','failed')`,
              'item/Attempts': 1,
              'item/LastError': `@if(equals(${st},'Succeeded'),'',substring(${err},0,min(length(${err}),900)))` } } };
          container[O] = { type: 'Compose', runAfter: { [R]: ALWAYS }, inputs: `@int(if(or(equals(${st},'Failed'),equals(${st},'TimedOut')),'send-failed','0'))` };
          covered.push(n);
        }
      }
      visit(a.actions); if (a.else) visit(a.else.actions);
      for (const c of Object.values(a.cases || {})) visit(c.actions); if (a.default) visit(a.default.actions);
    }
  };
  visit(pkg.serializedValue.actions);
  return covered;
}
/** Bind each receipt write that has no connection data to the package's SharePoint connection. */
export function bindReceipts(pkg) {
  const sp = Object.values(pkg.allConnectionData || {}).find((c) => /shared_sharepointonline/.test(c.connectionReference?.api?.id || ''));
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (/^Create_.+_Receipt$/.test(n) && a.inputs?.parameters?.table === RECEIPTS.table && !pkg.allConnectionData[n]) {
      if (!sp) throw new Error(`${n}: the package has no SharePoint connection to bind`);
      a.inputs.host.connection = sp.referenceKey;
      pkg.allConnectionData[n] = structuredClone(sp);
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(pkg.serializedValue.actions);
}

/* ---------------------------------------------------------------- the registry mailbox (owner decisions, 2026-10-06) */
/** Every Office 365 connection signs in as the registry mailbox (ITEM-77), and every administrative e-mail goes to it. */
export const REGISTRY_MAILBOX = 'dgsregistry@nitda.gov.ng';
export const REGISTRY_MAIL_CONNECTION = 'c0b9e7a5b0854c39a435fd8ce92f48ad';
const OFFICE365 = '/providers/Microsoft.PowerApps/apis/shared_office365';

/** Bind every Office 365 step of the package to the registry mailbox's connection. Returns the steps rebound. */
export function registryMailConnection(pkg) {
  const moved = [];
  for (const [n, c] of Object.entries(pkg.allConnectionData || {})) {
    if (c.connectionReference?.api?.id !== OFFICE365 || c.connectionReference.connectionName === REGISTRY_MAIL_CONNECTION) continue;
    c.connectionReference.connectionName = REGISTRY_MAIL_CONNECTION;
    c.connectionReference.connection = { id: `${OFFICE365}/connections/${REGISTRY_MAIL_CONNECTION}` };
    moved.push(n);
  }
  return moved;
}

/** Administrative recipients: the operations, registry and helpdesk addresses the notification config composes, and a
 *  fixed fallback, are the registry mailbox. A Flow Configuration row no longer redirects them. Returns what changed. */
export function adminRecipients(pkg) {
  const changed = [];
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    /* Compose_Notify_Config's opsTo, registryTo and helpdeskTo stay read from Flow Configuration (NOTIFY_OPS_TO,
       NOTIFY_REGISTRY_TO, NOTIFY_HELPDESK_TO; blank falls back to the registry mailbox): the owner's decision is met by
       those rows, so changing a recipient later is a row edit, not a paste (package release rule, 2026-10-06). */
    if (a.type === 'OpenApiConnection' && /SendEmail/.test(a.inputs?.host?.operationId || '')) {
      const p = a.inputs.parameters;
      for (const k of ['emailMessage/To', 'emailMessage/Cc']) {
        if (typeof p[k] !== 'string') continue;
        const v = p[k].replace(/'dgs@nitda\.gov\.ng'/g, `'${REGISTRY_MAILBOX}'`).replace(/^dgsregistry@nitda\.gov\.ng$/i, REGISTRY_MAILBOX); /* a plain dgs@nitda.gov.ng is kept: the New E-Scan notice goes to dgs@nitda.gov.ng (owner, set in the designer 2026-10-19, replacing the decision of 2026-10-18) */
        if (v !== p[k]) { p[k] = v; changed.push(`${n}.${k.split('/')[1]}`); }
      }
    }
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(pkg.serializedValue.actions);
  return changed;
}

/**
 * One package's state for the Folio Estate Console (tools/admin-console.html, "Work status") and the phase README:
 * what the tenant runs by the paste ledger, what the operator does next, which Office 365 connections it binds and how
 * many mails it sends. The next action is computed, never written by hand: no ledger entry → paste; the ledger's
 * fingerprint equals the package's → in the tenant; otherwise → re-paste.
 */
const LEDGER = 'docs/folio-Master-Flows-and-Endpoints/registers/identification-paste-ledger.json';
let ledgerCache = null;
export function ledgerEntry(file) {
  if (!ledgerCache) ledgerCache = JSON.parse(readFileSync(join(ROOT, LEDGER), 'utf8')).entries;
  return ledgerCache.find((e) => e.file === file) || null;
}
export function tenantState(file, fingerprint) {
  const e = ledgerEntry(file);
  if (!e) return { action: 'paste', tenant: 'Not pasted', evidence: null };
  if (e.fingerprint === fingerprint) return { action: 'in-tenant', tenant: `In the tenant (${e.on})`, evidence: e.evidence };
  if (e.fingerprint === null) return { action: 'paste', tenant: `Runs an earlier definition (${e.on}); this package is not pasted`, evidence: e.evidence };
  return { action: 're-paste', tenant: `Pasted ${e.on}; this package differs from what the tenant runs`, evidence: e.evidence, emptySetVariables: e.emptySetVariables || [] };
}
export function packageStatus(c, pkg, sends, fingerprint) {
  const t = tenantState(c.file, fingerprint);
  const office365 = [...new Set(Object.values(pkg.allConnectionData || {})
    .filter((x) => x.connectionReference?.api?.id === OFFICE365).map((x) => x.connectionReference.connectionName))];
  return { flow: c.target || c.name, flowId: c.id, key: c.file.split('__')[0], file: c.file, root: c.root, steps: c.steps,
    edits: c.log.length, sends, office365, onRegistryMailbox: office365.every((n) => n === REGISTRY_MAIL_CONNECTION),
    fingerprint, ...t,
    /* What must be in place before the package is written; npm run flows:update holds it until it is named. */
    ...(c.requires ? { requires: c.requires } : {}),
    /* A scope put in the package's place under another name, which npm run flows:update replaces by that name. */
    ...(c.replaces ? { replaces: c.replaces } : {}) };
}

/** Every SetVariable / AppendTo…Variable step in a package with its inputs, by name. */
export function variableSteps(pkg) {
  const out = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (/^(SetVariable|AppendTo\w*Variable)$/.test(a.type)) out[n] = JSON.stringify(a.inputs);
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(pkg.serializedValue?.actions);
  return out;
}

/**
 * The variable steps a build added or whose value it changed. The designer drops the value of such a step when the
 * package is pasted (seen on IP_Create__Task__for_received_Email_Endpoint, tenant export of 6 October 2026: the four
 * changed steps arrived empty, every unchanged one intact), so a package must carry none.
 */
export function variableStepsChanged(before, after) {
  return Object.keys(after).filter((n) => before[n] !== after[n]).sort();
}

/**
 * Hold Set variable values in a Compose step, the form that survives a designer paste.
 *
 * The tenant export of IP_Create__Task__for_received_Email_Endpoint (6 October 2026, after the package was pasted)
 * runs the package step for step except four Set variable steps, which arrived with no value: the two whose value is
 * an inline object, and two whose value the package added or changed. Its Set_variable_varData_Validation_Failure,
 * whose value is @outputs('Compose_varData_Validation_Failure'), arrived intact. So every Set variable step whose
 * value is an object or array, or that the build added or changed, takes its value from a Compose placed just before
 * it: the Compose runs when the step would have, and the step runs after the Compose.
 * `before` is variableSteps() of the package as loaded. Returns the steps changed.
 */
export function composeVariableValues(pkg, before) {
  const done = [];
  const taken = new Set();
  const collect = (o) => { for (const [n, a] of Object.entries(o || {})) { taken.add(n); collect(a.actions); if (a.else) collect(a.else.actions); for (const c of Object.values(a.cases || {})) collect(c.actions); if (a.default) collect(a.default.actions); } };
  collect(pkg.serializedValue.actions);
  const walk = (holder) => {
    for (const [n, a] of Object.entries(holder || {})) {
      walk(a.actions); if (a.else) walk(a.else.actions);
      for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
      if (a.type !== 'SetVariable' || !a.inputs || !('value' in a.inputs)) continue;
      const v = a.inputs.value;
      if (typeof v === 'string' && /^@outputs\('[^']+'\)$/.test(v)) continue;
      const inline = v !== null && typeof v === 'object';
      if (!inline && before[n] === JSON.stringify(a.inputs)) continue;
      let c = `Compose_Value_${n}`.slice(0, 80);
      for (let i = 2; taken.has(c); i++) c = `${`Compose_Value_${n}`.slice(0, 76)}_${i}`;
      taken.add(c);
      holder[c] = { type: 'Compose', inputs: v, ...(a.runAfter ? { runAfter: a.runAfter } : {}) };
      a.inputs = { ...a.inputs, value: `@outputs('${c}')` };
      a.runAfter = { [c]: ['Succeeded'] };
      done.push(n);
    }
  };
  walk(pkg.serializedValue.actions);
  return done.sort();
}

/* ---------------------------------------------------------------- list dates (tenant defect, 2026-10-18) */
/* A SharePoint date-only column comes back without a zone ('2026-09-22T00:00:00.0000000'), and convertFromUtc refuses it
   (AUTO_SCHEDULED_SWEEP run 08584093115454153780858604181CU30). Every convertFromUtc whose value is read from a list row,
   a trigger body or a connector reply reads it through utcGuard, except inside an e-mail body (the catalogue's): an empty value becomes the epoch (every branch of if()
   is evaluated, so the expression must be valid for it), and a value with no Z gets one. */
export const UTC_GUARD_MARK = "'1970-01-01T00:00:00Z'";
export const utcGuard = (v) => `if(empty(string(coalesce(${v},''))),${UTC_GUARD_MARK},if(endsWith(string(${v}),'Z'),string(${v}),concat(string(${v}),'Z')))`;
const FIELD_READ = /\?\['|\?\[\s*'/;
const FROM_DATA = /(item\(\)|items\(|triggerBody\(\)|triggerOutputs\(\)|first\(|body\('Get_|outputs\('Get_|actions\('Get_)/;
/** The first argument of each convertFromUtc( in an expression string, as [start, end) offsets. */
export function convertFromUtcArgs(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf('convertFromUtc(', i)) >= 0) {
    const start = i + 'convertFromUtc('.length; let depth = 0, q = false, j = start;
    for (; j < text.length; j++) {
      const c = text[j];
      if (q) { if (c === "'") { if (text[j + 1] === "'") j++; else q = false; } continue; }
      if (c === "'") q = true; else if (c === '(') depth++; else if (c === ')') { if (!depth) break; depth--; } else if (c === ',' && !depth) break;
    }
    out.push([start, j]); i = j;
  }
  return out;
}
/** A convertFromUtc value that is read from data and not guarded. */
export const unguardedUtcArg = (arg) => FIELD_READ.test(arg) && FROM_DATA.test(arg) && !arg.trim().startsWith('if(empty(string(coalesce(') && !arg.includes(UTC_GUARD_MARK);
/** Guard every such value in the package. Returns the number of values guarded. */
export function guardUtcInputs(pkg) {
  let n = 0;
  const fix = (s) => { let out = s; for (const [a, b] of convertFromUtcArgs(s).reverse()) { const arg = out.slice(a, b); if (unguardedUtcArg(arg)) { out = out.slice(0, a) + utcGuard(arg.trim()) + out.slice(b); n++; } } return out; };
  /* The e-mail bodies belong to the catalogue (ITEM-68: changed only there, and under review): their steps are left alone. */
  const CATALOGUE = (k) => /_Html(_Part\d+)?$/.test(k) || k === 'emailMessage/Body';
  const walk = (v) => { if (typeof v === 'string') return v.includes('convertFromUtc(') ? fix(v) : v; if (Array.isArray(v)) return v.map(walk); if (v && typeof v === 'object') { for (const k of Object.keys(v)) if (!CATALOGUE(k)) v[k] = walk(v[k]); return v; } return v; };
  pkg.serializedValue = walk(pkg.serializedValue);
  return n;
}
