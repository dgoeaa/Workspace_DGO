// DGO R11.6 — flow request shapes: the catalogue, the validator, and the alignment report.
//
// WHAT THIS ANSWERS THAT NOTHING ELSE IN THE PLATFORM DOES
//
// The endpoint atlas answers "which flow does this key call, and is the address right?". It
// says nothing about what the flow will *accept*. That is a different question with a different
// failure mode, and the failure is quiet: a payload that is valid JSON, carries every field the
// caller believed in, passes the browser, reaches the tenant, and is refused for a required
// property nobody knew about — or worse, is accepted with a misspelt field silently dropped.
//
// `config/flow-shapes.data.js` carries the HTTP trigger's own JSON Schema for all 65 exported
// workflows. This module turns that into three things:
//
//   · a field index — every addressable path with its type, requiredness and constraints, so a
//     form can be rendered for a flow this code has never seen;
//   · a validator that enforces the schema the flow itself enforces;
//   · an alignment report — a signed-off artefact stating which flow, which source export, which
//     payload, and whether it conforms. That is the thing an operator attaches to a change
//     record; "I tested it and it worked" is not.
//
// WHY THE FIELD INDEX IS COMPUTED HERE AND NOT GENERATED
//
// It used to be written into the data file alongside the schema. Two records of one fact, and
// the derived one is always the one that goes stale — a schema edited without regenerating
// leaves a field list describing a shape the flow no longer accepts, which is precisely the
// class of quiet wrongness this module exists to catch. So the schema is the only record, and
// everything else is derived from it on read and memoised.
//
// WHAT THIS MODULE WILL NOT DO. It does not send anything. Composing and validating is pure
// analysis over committed data; the call is made by the Admin Suite, through the same governed
// path as every other outbound request, and only after this module has said the payload
// conforms.

import { FlowShapes } from '../config/flow-shapes.data.js';
import { EndpointFormation } from './endpoint-formation.js';

/* ------------------------------------------------------------------ *
 * Field index
 * ------------------------------------------------------------------ */

/**
 * Walk a draft-07 object schema into one record per addressable field.
 *
 * Arrays contribute `path[]` for the item schema rather than an index, because this describes a
 * shape and not an instance: `$.items[].reference` is the field: there is no `$.items[0]` until
 * someone composes a payload.
 */
export function flattenSchema(schema, prefix = '$', required = false, out = []) {
  if (!schema || typeof schema !== 'object') return out;
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);

  if (prefix !== '$') {
    out.push(Object.freeze({
      path: prefix,
      name: prefix.split('.').pop().replace(/\[\]$/, ''),
      depth: prefix.split('.').length - 1,
      types,
      required,
      /* A field typed `["string","null"]` and not listed in `required` is optional twice over.
         One typed `["string","null"]` and required must still be *present* — it may be null.
         Conflating those is how a caller ends up omitting a key the flow branches on. */
      nullable: types.includes('null'),
      format: schema.format || '',
      enum: Array.isArray(schema.enum) ? schema.enum.map(String) : null,
      minLength: schema.minLength ?? null,
      maxLength: schema.maxLength ?? null,
      minimum: schema.minimum ?? null,
      maximum: schema.maximum ?? null,
      pattern: schema.pattern || '',
      description: String(schema.description || ''),
    }));
  }

  const req = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const [key, child] of Object.entries(schema.properties || {})) {
    flattenSchema(child, `${prefix}.${key}`, req.has(key), out);
  }
  if (schema.items) flattenSchema(schema.items, `${prefix}[]`, false, out);
  return out;
}

/* Field walks are pure over frozen input, so the result for a given schema object can never
   change. Memoised by identity: the atlas is frozen at module load, so every call for the same
   trigger returns the same array rather than re-walking a 40-property schema per keystroke. */
const fieldCache = new WeakMap();
export function fieldsOf(trigger) {
  if (!trigger?.schema) return [];
  const hit = fieldCache.get(trigger);
  if (hit) return hit;
  const fields = Object.freeze(flattenSchema(trigger.schema));
  fieldCache.set(trigger, fields);
  return fields;
}

/** The fields a form can render directly: one level down from the root. */
export const topLevelFields = (trigger) => fieldsOf(trigger).filter((f) => f.depth === 1);

/* ------------------------------------------------------------------ *
 * Action paths
 * ------------------------------------------------------------------ */

/**
 * Rebuild the `/actions/a/actions/b` path of one action from the tuple list.
 *
 * The generator stores a parent index instead of a path because every path is its parent's path
 * plus a name already on the row — two thirds of the file, spent restating something derivable.
 */
export function actionPath(flow, index) {
  const parts = [];
  let at = index;
  let guard = 0;
  while (at >= 0 && at < (flow.actions?.length || 0) && guard++ < 64) {
    const [name, , , , parent, segment] = flow.actions[at];
    parts.unshift(`${segment ? `${segment}/` : ''}actions/${name}`);
    at = parent;
  }
  return `/${parts.join('/')}`;
}

/** One action as a record, for a table that wants names rather than tuple positions. */
export function actionRecord(flow, index) {
  const [name, type, operationId, connector] = flow.actions[index] || [];
  return { index, name: name || '', type: type || '', operationId: operationId || '', connector: connector || '', path: actionPath(flow, index) };
}

export const actionRecords = (flow) => (flow.actions || []).map((_, i) => actionRecord(flow, i));

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** JSON's type names, plus the integer/number distinction JSON Schema draws and JSON does not. */
function actualType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

/**
 * Validate a value against a draft-07 subset, collecting every failure rather than the first.
 *
 * EVERY failure, deliberately. A validator that stops at the first error turns one round trip
 * into five: fix a field, resubmit, discover the next. The flows this validates are called by
 * hand during commissioning, against a tenant that may be a plane ride away.
 *
 * The subset is the one these definitions actually use — type (including union types and the
 * integer/number widening), required, minLength/maxLength, minimum/maximum, pattern, enum,
 * format:email, additionalProperties:false, and recursion through properties and items. An
 * unrecognised keyword is ignored rather than treated as a failure: the flow does not enforce
 * what this cannot check, and inventing a rule the tenant does not apply would block payloads
 * that would have succeeded.
 */
export function validateValue(value, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;
  const declared = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
  const actual = actualType(value);

  if (value === null) {
    if (declared.length && !declared.includes('null')) {
      errors.push({ path, code: 'type', message: `${path} must not be null — declared as ${declared.join(' or ')}.` });
    }
    return errors;
  }

  /* `integer` satisfies a `number` declaration. Reporting 3 as "integer, not number" is the
     kind of correct-but-useless verdict that makes people stop reading a validator. */
  const widened = actual === 'integer' && declared.includes('number') ? 'number' : actual;
  if (declared.length && !declared.includes(widened)) {
    errors.push({ path, code: 'type', message: `${path} is ${actual}; the flow declares ${declared.join(' or ')}.` });
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      errors.push({ path, code: 'minLength', message: `${path} is ${value.length} character(s); at least ${schema.minLength} required.` });
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      errors.push({ path, code: 'maxLength', message: `${path} is ${value.length} character(s); at most ${schema.maxLength} allowed.` });
    }
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ path, code: 'format', message: `${path} is declared as an email address and this is not one.` });
    }
    if (schema.pattern) {
      /* A malformed pattern in the tenant's own export is the tenant's defect, not the
         operator's. Reported as its own finding rather than swallowed, because silently not
         checking a constraint reads on screen as the constraint having passed. */
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push({ path, code: 'pattern', message: `${path} does not match the pattern the flow declares (${schema.pattern}).` });
        }
      } catch {
        errors.push({ path, code: 'pattern-invalid', message: `${path} declares a pattern this browser cannot compile (${schema.pattern}); it was not checked.` });
      }
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) {
      errors.push({ path, code: 'minimum', message: `${path} is ${value}; the minimum is ${schema.minimum}.` });
    }
    if (schema.maximum != null && value > schema.maximum) {
      errors.push({ path, code: 'maximum', message: `${path} is ${value}; the maximum is ${schema.maximum}.` });
    }
  }

  if (schema.enum && !schema.enum.map(String).includes(String(value))) {
    errors.push({ path, code: 'enum', message: `${path} must be one of: ${schema.enum.join(', ')}.` });
  }

  if (actual === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push({ path: `${path}.${key}`, code: 'required', message: `${path}.${key} is required and was not supplied.` });
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateValue(child, schema.properties[key], `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, code: 'additional', message: `${path}.${key} is not declared by this flow and additional properties are refused — it would be rejected, not ignored.` });
      }
    }
  }

  if (actual === 'array' && schema.items) {
    value.forEach((item, i) => validateValue(item, schema.items, `${path}[${i}]`, errors));
  }

  return errors;
}

/**
 * Validate a composed request against one flow's trigger.
 *
 * `conforms` is about shape and nothing else. It is not authority, not tenant state, and not
 * permission to send — the suite states that where the verdict is shown, because "ALIGNED" in
 * a green box is exactly the kind of label a tired operator reads as "safe".
 */
export function validateRequest(flow, body, { triggerName = '' } = {}) {
  const trigger = triggerName
    ? (flow?.triggers || []).find((t) => t.name === triggerName)
    : (flow?.triggers || []).find((t) => t.kind === 'Http') || flow?.triggers?.[0];
  if (!trigger) return { conforms: false, checked: false, errors: [{ path: '$', code: 'no-trigger', message: 'This flow declares no trigger, so there is no shape to check against.' }], trigger: null };
  if (!trigger.schema) {
    return {
      conforms: true,
      checked: false,
      trigger,
      errors: [],
      note: 'This trigger declares no request schema, so nothing was checked. A payload that '
        + 'conforms to nothing can still be refused by the flow.',
    };
  }
  const errors = validateValue(body, trigger.schema, '$');
  return { conforms: errors.length === 0, checked: true, trigger, errors };
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

/**
 * Coerce one form field's text into the type its schema declares.
 *
 * A form yields strings; a schema wants numbers, booleans and objects. Where the text cannot be
 * coerced, the raw string is returned rather than a silent null — so the validator reports
 * "$.count is string; the flow declares integer", which names the mistake, instead of the field
 * disappearing and the flow reporting it missing.
 */
export function coerce(text, types = []) {
  const raw = String(text ?? '');
  if (!raw.length) return undefined;
  if (types.includes('integer') || types.includes('number')) {
    const n = Number(raw);
    if (Number.isFinite(n) && (!types.includes('integer') || Number.isInteger(n))) return n;
    return raw;
  }
  if (types.includes('boolean')) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }
  if (types.includes('object') || types.includes('array')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

/** Build a request body from `{ fieldName: text }`, dropping fields left blank. */
export function composeBody(trigger, values = {}) {
  const body = {};
  for (const field of topLevelFields(trigger)) {
    const v = coerce(values[field.name], field.types);
    if (v !== undefined) body[field.name] = v;
  }
  return body;
}

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

const byWorkflowId = new Map(FlowShapes.flows.filter((f) => f.workflowId).map((f) => [f.workflowId, f]));

export const flows = () => FlowShapes.flows;
export const flowByWorkflowId = (id) => byWorkflowId.get(String(id || '').replace(/-/g, '').toLowerCase()) || null;
export const flowByName = (name) => FlowShapes.flows.find((f) => f.name === name) || null;

/** Free-text search across the fields an administrator actually types: name, id, connector. */
export function searchFlows(query, { callableOnly = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return FlowShapes.flows.filter((f) => {
    if (callableOnly && !f.callable) return false;
    if (!q) return true;
    return `${f.name} ${f.displayName} ${f.workflowId} ${f.connectors.join(' ')}`.toLowerCase().includes(q);
  });
}

/**
 * Conditions of the flow estate that only the definitions can show, and that no endpoint check
 * reaches.
 *
 * These are properties of what the flows *are*, not of how they are addressed — which is why
 * the endpoint console cannot report them however correct its addresses become.
 */
export function shapeFindings({ shapes = FlowShapes } = {}) {
  const out = [];

  /* 1. Anonymous HTTP triggers. `authentication: All` means possession of the URL is the whole
        access control. That is the tenant's chosen posture for this estate and is recorded as
        such in the commissioning gate — but it must be visible where the flows are listed, or
        the only place it is written down is a document nobody opens. */
  const anonymous = shapes.flows.filter((f) => f.triggers.some((t) => t.kind === 'Http' && t.authentication === 'All'));
  if (anonymous.length) {
    out.push({
      code: 'shapes.anonymous-trigger',
      severity: 'warn',
      title: `${anonymous.length} HTTP trigger(s) accept any caller`,
      detail: 'These flows declare authentication "All": anyone holding the URL may invoke them, '
        + 'and the signed URL reaches the browser by design. Authorisation for these can only be '
        + 'enforced inside the flow. This is the estate\'s recorded posture, not a new defect — '
        + 'it is listed here because the flow list is where it is actionable.',
      items: anonymous.map((f) => ({ key: f.name, workflowId: f.workflowId })),
    });
  }

  /* 2. Callable flows with no request schema. Nothing can be validated against these, so every
        client claim of "aligned" for them is vacuous, and the suite says so rather than showing
        a green tick that means only "we checked nothing". */
  const unschema = shapes.flows.filter((f) => f.callable && !f.triggers.some((t) => t.kind === 'Http' && t.schema));
  if (unschema.length) {
    out.push({
      code: 'shapes.no-schema',
      severity: 'warn',
      title: `${unschema.length} callable flow(s) declare no request schema`,
      detail: 'A payload cannot be checked against these before it is sent. The composer will '
        + 'still send one; it reports the request as unchecked rather than as aligned.',
      items: unschema.map((f) => ({ key: f.name, workflowId: f.workflowId })),
    });
  }

  /* 3. Flows that send mail. Not a defect — a fact an operator must hold before probing one,
        because the probe is indistinguishable from real traffic once it reaches the flow. */
  const mailers = shapes.flows.filter((f) => f.mailActions.length);
  if (mailers.length) {
    out.push({
      code: 'shapes.sends-mail',
      severity: 'info',
      title: `${mailers.length} flow(s) send email when they run`,
      detail: 'Invoking one of these from the composer sends real mail to real recipients. There '
        + 'is no validation-only mode unless the flow implements the health contract.',
      items: mailers.map((f) => ({ key: f.name, workflowId: f.workflowId, recipients: [...new Set(f.mailActions.map((m) => m.to).filter(Boolean))].length })),
    });
  }

  /* 4. One workflow id, two exports. Both describe the same live flow under different names, so
        a reader searching by name finds a record that may be the older of the two. */
  if (shapes.duplicateWorkflowIds?.length) {
    out.push({
      code: 'shapes.duplicate-export',
      severity: 'info',
      title: `${shapes.duplicateWorkflowIds.length} workflow(s) were exported more than once`,
      detail: 'The same workflow id appears under more than one flow name — the export ran across '
        + 'a rename. Both records describe one live flow; compare their export timestamps before '
        + 'trusting either shape.',
      items: shapes.duplicateWorkflowIds.map((d) => ({ key: d.names.join(' / '), workflowId: d.workflowId })),
    });
  }

  return out;
}

/**
 * The evidence artefact for one composed request.
 *
 * Carries the source export's SHA-256 so a reader can prove which definition the shape was
 * checked against — a report that says "aligned" without naming the definition it aligned to is
 * an assertion, not evidence.
 */
export function alignmentReport(flow, body, { triggerName = '', generatedAt = new Date().toISOString() } = {}) {
  const result = validateRequest(flow, body, { triggerName });
  return {
    schema: 'dgo-request-alignment/v1',
    generatedAt,
    flow: {
      name: flow?.name || '',
      displayName: flow?.displayName || '',
      workflowId: flow?.workflowId || '',
      sourcePath: flow?.sourcePath || '',
      sourceSha256: flow?.sourceSha256 || '',
      exportedAtUtc: flow?.exportedAtUtc || '',
    },
    trigger: result.trigger ? {
      name: result.trigger.name,
      method: result.trigger.method,
      authentication: result.trigger.authentication,
      allowsAdditionalProperties: result.trigger.allowsAdditionalProperties,
      schema: result.trigger.schema,
    } : null,
    requestBody: body,
    checked: result.checked,
    conforms: result.conforms,
    errors: result.errors,
    /* Said in the artefact and not only on screen, because the artefact is what gets attached
       to a change record and read months later by someone who did not run it. */
    scope: 'Shape only. This report states that the payload conforms to the trigger schema in '
      + 'the named export. It asserts nothing about authority to call the flow, the state of the '
      + 'tenant, or whether the flow should be called at all.',
  };
}

/* ------------------------------------------------------------------ *
 * Tabular export
 * ------------------------------------------------------------------ */

/**
 * One CSV cell, quoted the way a spreadsheet will read it back.
 *
 * Every value here can contain a comma, a quote or a newline — a flow's mail subject is a Logic
 * App expression, a response body is JSON, a field description is a sentence. So everything is
 * quoted unconditionally and internal quotes are doubled, which is the only escaping RFC 4180
 * defines and the only one Excel and LibreOffice both honour. Newlines are folded to a space:
 * they are legal inside a quoted field, and they still break enough downstream readers that a
 * table nobody can open is worse than one that lost its line breaks.
 */
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
const csv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

/**
 * The five tables the provisioning documentation shipped, rebuilt from the live catalogue.
 *
 * They matter because JSON is what a machine reads and a spreadsheet is what a review meeting
 * reads. The column contracts are the originals' — an analyst with last quarter's workbook can
 * diff this against it — but the rows are derived from `config/flow-shapes.data.js` rather than
 * frozen at export time, so they cannot describe an estate the repository no longer has.
 *
 * A BOM leads each file. Excel reads a UTF-8 CSV as the local codepage without one, which turns
 * every en-dash in a description into mojibake — the original tables carried it for exactly this
 * reason and dropping it would be a silent regression in the one program these are opened in.
 */
export const CSV_BOM = '﻿';

export function flowSummaryCsv({ shapes = FlowShapes } = {}) {
  return CSV_BOM + csv(
    ['Flow name', 'Workflow ID', 'Callable', 'Trigger types', 'Methods', 'Authentication', 'Actions', 'Responses', 'Mail actions', 'Connectors', 'Source SHA-256', 'Source path'],
    shapes.flows.map((f) => [
      f.name, f.workflowId, f.callable,
      [...new Set(f.triggers.map((t) => t.type))].join('; '),
      [...new Set(f.triggers.map((t) => t.method).filter(Boolean))].join('; '),
      [...new Set(f.triggers.map((t) => t.authentication).filter(Boolean))].join('; '),
      f.actionCount, f.responses.length, f.mailActions.length,
      f.connectors.join('; '), f.sourceSha256, f.sourcePath,
    ]),
  );
}

export function requestFieldsCsv({ shapes = FlowShapes } = {}) {
  const rows = [];
  for (const f of shapes.flows) {
    for (const t of f.triggers) {
      for (const x of fieldsOf(t)) {
        rows.push([
          f.name, f.workflowId, t.name, x.path, x.types.join(' | '), x.required,
          x.format, x.enum ? x.enum.join('; ') : '',
          x.minimum ?? '', x.maximum ?? '', x.minLength ?? '', x.maxLength ?? '',
          x.pattern, x.description,
        ]);
      }
    }
  }
  return CSV_BOM + csv(
    ['Flow', 'Workflow ID', 'Trigger', 'Path', 'Types', 'Required', 'Format', 'Enum', 'Min', 'Max', 'MinLength', 'MaxLength', 'Pattern', 'Description'],
    rows,
  );
}

export function responseActionsCsv({ shapes = FlowShapes } = {}) {
  const rows = [];
  for (const f of shapes.flows) {
    for (const r of f.responses) {
      rows.push([f.name, f.workflowId, actionRecord(f, r.action).name, actionPath(f, r.action), r.statusCode, r.headers, r.body]);
    }
  }
  return CSV_BOM + csv(['Flow', 'Workflow ID', 'Response action', 'Path', 'Status code', 'Headers JSON', 'Body JSON'], rows);
}

export function mailActionsCsv({ shapes = FlowShapes } = {}) {
  const rows = [];
  for (const f of shapes.flows) {
    for (const m of f.mailActions) {
      rows.push([f.name, f.workflowId, actionRecord(f, m.action).name, m.to, m.cc, m.bcc, m.subject, m.importance, actionPath(f, m.action)]);
    }
  }
  return CSV_BOM + csv(['Flow', 'Workflow ID', 'Action', 'To', 'Cc', 'Bcc', 'Subject', 'Importance', 'Path'], rows);
}

/**
 * The endpoint-key table.
 *
 * `Current packaged value` is deliberately a STATE and never a URL. The original shipped this
 * column empty because the packages carried no runtime values; here the column could be filled,
 * and must not be — a CSV is the artefact most likely to be mailed, and a signature in a
 * spreadsheet is a published credential. The caller supplies `resolve` only so the table can say
 * *whether* a key is wired, never what it is wired to.
 */
export function endpointKeysCsv({ keys = [], resolve = () => '' } = {}) {
  return CSV_BOM + csv(
    ['Platform', 'Key', 'Current packaged value', 'State', 'Context'],
    keys.map((k) => [
      k.surface === 'portal' ? 'Public portal' : 'Internal DGO',
      k.key,
      '',
      resolve(k.key) ? 'CONFIGURED' : 'EMPTY_RUNTIME_VALUE',
      `${k.flow || ''}${k.workflowId ? ` — workflow ${k.workflowId}` : ''}`,
    ]),
  );
}

/* ------------------------------------------------------------------ *
 * cURL and example payloads
 * ------------------------------------------------------------------ */

/**
 * The composed request as a `curl` command.
 *
 * The reason this is worth having: the composer runs in a browser, and a browser cannot read a
 * Power Automate response — the endpoints send no CORS headers, so the call succeeds and the
 * answer is unreadable. Handing the operator a command they can paste into a terminal is the
 * shortest path from "the payload validates" to "and here is what the flow said".
 *
 * THE SIGNATURE IS REDACTED, and the command therefore does not run as pasted. That is the
 * correct trade: a runnable command carrying a bearer credential is a credential in the clipboard,
 * in the shell history, and in whatever ticket it gets pasted into. The placeholder says where
 * the operator must put the URL they already hold.
 */
export function toCurl(flow, body, { url = '', triggerName = '' } = {}) {
  const trigger = triggerName
    ? (flow?.triggers || []).find((t) => t.name === triggerName)
    : (flow?.triggers || []).find((t) => t.kind === 'Http') || flow?.triggers?.[0];
  const method = trigger?.method || 'POST';
  const target = url ? EndpointFormation.mask(url) : '<the signed trigger URL for this flow>';
  const payload = JSON.stringify(body ?? {}, null, 2).replace(/'/g, `'\\''`);
  return [
    `# ${flow?.name || 'flow'}${flow?.workflowId ? ` — workflow ${flow.workflowId}` : ''}`,
    '# The signature below is redacted. Replace the *** with the value you hold before running.',
    `curl --fail-with-body -X ${method} '${target}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${payload}'`,
  ].join('\n');
}

/**
 * A payload that conforms to the trigger schema, for a flow the operator has never called.
 *
 * WHICH FIELDS IT INCLUDES, AND WHY IT IS NOT SIMPLY "THE REQUIRED ONES"
 *
 * Required-only is the right default where a schema declares requirements: an example carrying
 * all forty properties of a trigger teaches nothing about which ones the flow insists on, and the
 * first thing anyone does with it is delete most of it.
 *
 * In this estate that rule alone produces an empty object for 42 of 53 schemas — only 9 declare a
 * `required` array at all, which is a property of how these flows were authored rather than a
 * statement that they accept nothing. `{}` is a technically conforming example and a useless one,
 * so where a schema names no required field the example falls back to every top-level property.
 * The operator gets a skeleton to delete from instead of a blank they must build from, and the
 * shape they see is the shape the trigger actually declares.
 *
 * Where the schema constrains a value — an enum, a format, a minimum — the example takes a value
 * that satisfies the constraint, so `validateRequest()` on it returns a pass rather than a list
 * of things to fix before the example is usable.
 */
export function exampleFor(trigger, { required = true } = {}) {
  /* Only the ROOT falls back. A nested object that declares no requirements inside an otherwise
     required-driven example would otherwise pull its whole subtree in, which is the sprawl the
     required-only rule exists to prevent. */
  const rootDeclaresRequired = Array.isArray(trigger?.schema?.required) && trigger.schema.required.length > 0;
  const requiredOnly = required && rootDeclaresRequired;

  const build = (schema, isRoot = false) => {
    if (!schema || typeof schema !== 'object') return null;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : ['string']);
    const type = types.find((t) => t !== 'null') || 'string';
    if (type === 'object') {
      const out = {};
      const req = new Set(schema.required || []);
      /* The root under fallback takes everything; a nested object still honours the rule. */
      const takeAll = isRoot ? !requiredOnly : !required;
      for (const [k, child] of Object.entries(schema.properties || {})) {
        if (!takeAll && !req.has(k)) continue;
        out[k] = build(child);
      }
      return out;
    }
    if (type === 'array') return schema.items ? [build(schema.items)] : [];
    if (type === 'integer' || type === 'number') {
      const min = schema.minimum ?? 0;
      return schema.maximum != null ? Math.min(min, schema.maximum) : min;
    }
    if (type === 'boolean') return false;
    if (schema.format === 'email') return 'name@nitda.gov.ng';
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
    /* A pattern this cannot satisfy by construction is left as the pattern itself rather than as
       a value that looks right and is not — the validator then names it, which is more useful
       than an example that silently fails at the tenant. */
    if (schema.pattern) return `<matching ${schema.pattern}>`;
    const base = schema.description ? '' : '';
    return base || 'x'.repeat(Math.max(schema.minLength || 1, 1));
  };
  return build(trigger?.schema, true) ?? {};
}

export const totals = () => FlowShapes.totals;
export const authority = () => FlowShapes.authority;

export const FlowShapeCatalogue = Object.freeze({
  flows, flowByWorkflowId, flowByName, searchFlows, fieldsOf, topLevelFields,
  validateRequest, validateValue, composeBody, coerce, alignmentReport, shapeFindings,
  actionRecords, actionRecord, actionPath, totals, authority,
  flowSummaryCsv, requestFieldsCsv, responseActionsCsv, mailActionsCsv, endpointKeysCsv,
  toCurl, exampleFor, CSV_BOM,
});
export default FlowShapeCatalogue;
