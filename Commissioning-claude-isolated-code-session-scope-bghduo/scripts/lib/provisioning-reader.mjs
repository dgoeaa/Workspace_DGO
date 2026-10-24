/* Reading a flow package for everything it has been PROVISIONED with.
 *
 * scripts/lib/flow-definition-reader.mjs answers "what does this flow touch" — it walks the
 * action graph looking for SharePoint references and stops there, because that is all its two
 * callers need. This module answers a different question: what is configured on this flow,
 * all of it, exactly as the package carries it. Trigger method and authentication posture,
 * every request property the schema declares, every connection reference, every action's
 * configured inputs, every variable and its initial value, every response status code and
 * header, every runAfter edge including the failure edges, every retry policy.
 *
 * It ADDS to that reader rather than replacing it: discovery, the wrapper-shape logic and the
 * action walk are imported, so a package shape learned there is understood here too.
 *
 * NOTHING IS INTERPRETED. Every value returned is the value in the file. Where a package does
 * not carry a thing, the field is null and the caller says "not declared" — it is never filled
 * in from a sibling flow, a naming convention, or what a flow of that kind usually does.
 */

import { readFileSync } from 'node:fs';
import { collectActions, definitionRoot, identity, isFlowDocument } from './flow-definition-reader.mjs';

/* A SAS-signed trigger URL is a bearer credential. No package in this tree carries one today
   and this documentation must not become the first thing that does, so every string rendered
   from a package passes through here first. It is a safety net, not a cleanup: if this ever
   fires, the PACKAGE has a signature in it and that is the finding. */
const SIG = /(sig=)[A-Za-z0-9_-]{20,}/g;
export const redact = (s) => (typeof s === 'string' ? s.replace(SIG, '$1REDACTED') : s);

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[redact(k)] = redactDeep(v);
    return out;
  }
  return value;
}

/* True when any string anywhere under `value` carries a signature. A fresh non-global RegExp
   per test on purpose: a /g regex carries `lastIndex` between calls, so the shared SIG constant
   would answer the same question differently depending on what was asked before it. */
export function containsSignature(value) {
  if (typeof value === 'string') return /sig=[A-Za-z0-9_-]{20,}/.test(value);
  if (Array.isArray(value)) return value.some(containsSignature);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => containsSignature(k) || containsSignature(v));
  }
  return false;
}

/* ── package wrappers ───────────────────────────────────────────────────────────────────
 * Four package families live in this repository and they are not the same artefact:
 *
 *   deployed  — docs/reference/flow-contracts/deployed/*.json, taken off the live tenant by
 *               scripts/export-power-automate-flows.ps1. THIS is the provisioned state.
 *   design    — docs/deployment/power-automate-flows/NN-*.flow.json, the specified design.
 *               Its own README says plainly: "They are not what is deployed."
 *   paste     — *.designer-paste.json, a clipboard scope built by the paste builders. A
 *               fragment of a flow, not a flow: it has no trigger and no identity.
 *   capture   — flow_run_record documents, one RUN of a flow with the definition embedded.
 *
 * The family is recorded on every record so a reader is never left guessing whether a value
 * describes the tenant or a proposal for it. */
export const FAMILY = {
  deployed: 'deployed export — the live tenant',
  design: 'design package — specified, not deployed',
  paste: 'designer clipboard scope — a fragment, not a whole flow',
  capture: 'run capture — one execution, definition embedded',
};

export function packageFamily(doc, file) {
  if (doc?.telemetry_kind === 'flow_run_record' || doc?.design_definition) return 'capture';
  if (file.includes('/designer-paste/')) return 'paste';
  if (doc?.workflow_identity) return 'deployed';
  if (doc?.connectionReferences || doc?.allConnectionData) return 'design';
  return 'deployed';
}

/* ── trigger ────────────────────────────────────────────────────────────────────────────
 * Everything the caller of this flow is subject to. `triggerAuthenticationType` is read here
 * and reported ABSENT when absent rather than defaulted, because "the export does not say"
 * and "the export says All" are different facts and only one of them is a posture. */
export function readTrigger(def) {
  const entry = Object.entries(def?.triggers || {})[0];
  if (!entry) return null;
  const [name, t] = entry;
  const inputs = t?.inputs || {};
  return {
    name,
    type: t?.type ?? null,
    kind: t?.kind ?? null,
    description: t?.description ?? null,
    method: inputs.method ?? null,
    relativePath: inputs.relativePath ?? null,
    triggerAuthenticationType: Object.prototype.hasOwnProperty.call(inputs, 'triggerAuthenticationType')
      ? inputs.triggerAuthenticationType
      : undefined,
    schema: inputs.schema ?? null,
    headers: inputs.headers ?? null,
    queries: inputs.queries ?? null,
    conditions: t?.conditions ?? null,
    splitOn: t?.splitOn ?? null,
    correlation: t?.correlation ?? null,
    operationOptions: t?.operationOptions ?? null,
    recurrence: t?.recurrence ?? null,
    evaluatedRecurrence: t?.evaluatedRecurrence ?? null,
    runtimeConfiguration: t?.runtimeConfiguration ?? null,
    metadata: t?.metadata ?? null,
    inputs,
  };
}

/* Flattens a JSON Schema into one row per property, at every depth, carrying the facts a
   caller has to satisfy: the declared type, whether the PARENT marks it required, and the
   constraints the schema states. `required` is a property of the parent object in JSON Schema,
   so it is resolved against the parent's list — reading it off the property itself, which is
   where it is not, is how every field in a schema comes to be documented as optional. */
export function schemaRows(schema, prefix = '', requiredHere = [], out = []) {
  if (!schema || typeof schema !== 'object') return out;
  const props = schema.properties || {};
  for (const [name, spec] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${name}` : name;
    const s = spec && typeof spec === 'object' ? spec : {};
    out.push({
      path,
      type: Array.isArray(s.type) ? s.type.join(' | ') : (s.type ?? null),
      required: requiredHere.includes(name),
      format: s.format ?? null,
      enum: Array.isArray(s.enum) ? s.enum : null,
      default: Object.prototype.hasOwnProperty.call(s, 'default') ? s.default : undefined,
      minLength: s.minLength ?? null,
      maxLength: s.maxLength ?? null,
      pattern: s.pattern ?? null,
      description: s.description ?? null,
      additionalProperties: Object.prototype.hasOwnProperty.call(s, 'additionalProperties') ? s.additionalProperties : undefined,
    });
    if (s.properties) schemaRows(s, path, Array.isArray(s.required) ? s.required : [], out);
    if (s.items && typeof s.items === 'object') {
      if (s.items.properties) schemaRows(s.items, `${path}[]`, Array.isArray(s.items.required) ? s.items.required : [], out);
    }
  }
  return out;
}

/* ── actions ────────────────────────────────────────────────────────────────────────────
 * One record per action, carrying every key the action declares. `runAfter` is split into the
 * dependency and the STATUSES that dependency must end in, because the statuses are the error
 * handling: an action that runs after `["Failed","Skipped","TimedOut"]` is a catch, and a
 * catalogue that prints only the dependency name cannot tell it from the happy path. */
export function readActions(def) {
  return collectActions(def?.actions, '', []).map(({ name, action, path }) => {
    const runAfter = action.runAfter && typeof action.runAfter === 'object' ? action.runAfter : {};
    const edges = Object.entries(runAfter).map(([dep, statuses]) => ({
      after: dep,
      statuses: Array.isArray(statuses) ? statuses : [statuses],
    }));
    return {
      name,
      path,
      depth: path.split('/').length - 1,
      type: action.type ?? null,
      kind: action.kind ?? null,
      description: action.description ?? null,
      inputs: Object.prototype.hasOwnProperty.call(action, 'inputs') ? action.inputs : undefined,
      expression: Object.prototype.hasOwnProperty.call(action, 'expression') ? action.expression : undefined,
      foreach: Object.prototype.hasOwnProperty.call(action, 'foreach') ? action.foreach : undefined,
      limit: action.limit ?? null,
      runAfter: edges,
      isFirst: edges.length === 0,
      isCatch: edges.some((e) => e.statuses.some((s) => String(s) !== 'Succeeded')),
      operationOptions: action.operationOptions ?? null,
      runtimeConfiguration: action.runtimeConfiguration ?? null,
      trackedProperties: action.trackedProperties ?? null,
      metadata: action.metadata ?? null,
      raw: action,
    };
  });
}

/** host + operation for a connector call, however the export happens to have written it. */
export function connectorOf(action) {
  const host = action?.inputs?.host;
  if (!host || typeof host !== 'object') return null;
  return {
    apiId: host.apiId ?? null,
    connectionName: host.connectionName ?? null,
    connectionReferenceName: host.connection?.referenceName ?? host.connection?.name ?? null,
    operationId: host.operationId ?? null,
    connector: host.connectionName || (typeof host.apiId === 'string' ? host.apiId.split('/').pop() : null),
  };
}

/* ── package record ─────────────────────────────────────────────────────────────────── */

export function readPackage(file, repoPath) {
  let raw;
  try { raw = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { return null; }
  let doc;
  try { doc = JSON.parse(raw); } catch { return null; }

  /* A clipboard scope is not a flow document — it has no triggers and no $schema — so
     isFlowDocument rejects it, correctly. It is still a provisioning package and is read here
     by lifting its scope into an actions map of one. */
  const paste = doc?.nodeId && doc?.serializedValue?.actions ? doc : null;
  if (!paste && !isFlowDocument(doc)) return null;

  const def = paste
    ? { $schema: null, contentVersion: null, parameters: null, triggers: {}, actions: { [doc.nodeId]: doc.serializedValue } }
    : definitionRoot(doc);
  if (!def) return null;

  const id = identity(doc);
  /* A deployed export names itself; nothing else does. A clipboard scope carries only its
     nodeId — `Scope_Global`, which eleven different packages also carry — and a design package
     carries no name at all, so both are named by their FILE, which is the only thing that
     distinguishes them. Naming a paste package by its nodeId is how `Portal_SUBMISSION` and
     `CG_Submission` come to be filed under the same page. */
  const stem = repoPath.split('/').pop().replace(/\.json$/, '').replace(/\.designer-paste$/, '');
  return {
    file: repoPath,
    family: packageFamily(doc, repoPath),
    exportedBy: doc?.exportedBy ?? null,
    exportedAtUtc: doc?.exportedAtUtc ?? null,
    displayName: id.displayName || stem,
    nodeId: doc?.nodeId ?? null,
    internalName: id.internalName,
    workflowId: id.workflowId,
    environmentName: doc?.workflow_identity?.tags?.environmentName ?? null,
    fullResourceId: doc?.workflow_identity?.full_resource_id ?? null,
    definition: def,
    schemaUri: def.$schema ?? null,
    contentVersion: def.contentVersion ?? null,
    definitionDescription: def.description ?? null,
    outputs: def.outputs ?? null,
    parameters: def.parameters ?? null,
    connectionReferences: doc?.connectionReferences ?? null,
    allConnectionData: doc?.allConnectionData ?? null,
    staticResults: doc?.staticResults ?? null,
    trigger: paste ? null : readTrigger(def),
    actions: readActions(def),
  };
}
