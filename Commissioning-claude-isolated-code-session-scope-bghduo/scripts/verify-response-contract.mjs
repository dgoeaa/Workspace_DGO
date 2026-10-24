#!/usr/bin/env node
/**
 * Does what each flow RETURNS match what its client reads back?
 *
 * WHY THIS EXISTS
 * Three defects in this estate came from the request direction — a field read where the client
 * does not put it. The return direction has the same seam and a worse failure mode: the HTTP
 * status is still 200, so the client reads success with the field missing. A submission with no
 * reference, a correct code refused, an upload reported not stored. Nothing errors.
 *
 * Two clients read these flows and they do NOT agree on shape:
 *
 *   INTERNAL — core/contracts.js assertEnvelope() returns `response.data ?? response` and reads
 *   ok, status.http, status.message, errors, request{}, timing{}, meta{}. It needs the envelope.
 *
 *   PORTAL — document-portal/js/core.js readJson() unwraps NOTHING, and
 *   portal-data-contract.json (status: AUTHORITATIVE) names every field it reads at the TOP
 *   LEVEL, with the function that reads it. It needs the flat shape.
 *
 * So this checks each package against its own client, reading both requirements from source
 * rather than restating them:
 *
 *   1. portal packages answer the flat contract shape, and every field the contract marks
 *      `required: true` is set on some success branch
 *   2. internal packages answer the envelope, carrying every key core/contracts.js reads
 *   3. FETCH_ALL's collections are named something core/data-loader.js recognises
 *
 * Usage:
 *   node scripts/verify-response-contract.mjs
 *   node scripts/verify-response-contract.mjs --strict
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const strict = process.argv.includes('--strict');

let failures = 0;
const fail = (f, msg) => { failures++; console.log(`  ✗ ${f}: ${msg}`); };

function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.actions && typeof node.actions === 'object') {
    for (const [name, act] of Object.entries(node.actions)) { out.push([name, act]); walk(act, out); }
  }
  for (const k of ['else', 'default']) if (node[k]) walk(node[k], out);
  if (node.cases) for (const c of Object.values(node.cases)) walk(c, out);
  return out;
}

/* ---------- what the portal contract requires, and which package answers it ---------- */
const contract = read('docs/deployment/sharepoint/portal-data-contract.json');
const PACKAGE_FOR = {
  SUBMISSION: ['Portal_SUBMISSION_ECM_DOCS'],
  UPLOAD: ['Portal_UPLOAD_ECM_DOCS'],
  SUPPORT: ['Portal_SUPPORT_ECM_DOCS'],
  VERIFY: ['Portal_VERIFY_ECM_DOCS', 'Portal_VERIFY_CONFIRM_ECM_DOCS'],
  VERIFY_CONFIRM: ['Portal_VERIFY_ECM_DOCS', 'Portal_VERIFY_CONFIRM_ECM_DOCS'],
  STATUS: ['Portal_STATUS_ECM_DOCS'],
  WRITEBACK: ['Portal_WRITEBACK_ECM_DOCS'],
};
const required = new Map();
for (const c of contract.contracts) {
  if (c.key.startsWith('_') || !Array.isArray(c.response)) continue;
  /* Only the top-level, always-required fields. `uploads[].ticket` is checked through `uploads`;
     "required when stored" is conditional and belongs to a branch, not to every response. */
  const fields = c.response
    .filter((f) => f.required === true && !String(f.field).includes('.'))
    .map((f) => String(f.field).replace(/\[\]$/, ''));
  if (fields.length) required.set(c.key, fields);
}

/* ---------- what core/contracts.js reads off an internal response ---------- */
const ENVELOPE_KEYS = ['ok', 'status', 'request', 'timing', 'data', 'errors', 'meta'];
const ENVELOPE_NESTED = {
  status: ['http', 'message'],
  request: ['requestId', 'trackingId', 'action'],
  timing: ['receivedAtUtc', 'completedAtUtc', 'durationMs'],
  meta: ['runId', 'flowName', 'contractVersion'],
};

/* ---------- what core/data-loader.js will recognise in FETCH_ALL's data ---------- */
const loader = readFileSync(join(ROOT, 'core/data-loader.js'), 'utf8');
const specLine = loader.match(/const specs=\{[\s\S]*?\n/)[0];
const aliasSets = [...specLine.matchAll(/(\w+):\{[^}]*?aliases:\[([^\]]*)\]/g)]
  .map((m) => [m[1], m[2].split(',').map((a) => a.trim().replace(/^'|'$/g, ''))]);

console.log('\nResponse contract — what each flow returns vs what its client reads\n');

const DIRS = ['docs/deployment/sharepoint/flows/designer-paste/', 'docs/deployment/internal/flows/designer-paste/'];
for (const dir of DIRS) {
  if (!existsSync(join(ROOT, dir))) continue;
  for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.json')).sort()) {
    /* DGO_VARIABLE_INITIALIZATION carries nine variable declarations and nothing else. It has no
       Response because it is not an endpoint — it is pasted into a flow, emptied out to the top
       level and deleted. There is no response contract to hold it to. */
    if (f.endsWith('.variables.designer-paste.json')) continue;   /* declarations, not an endpoint */
    /* A scheduled flow is not an endpoint either. It is woken by a clock and answers nobody, so
       there is no caller to hold a response contract with — checking one here would report a
       missing Response as a defect and invite someone to add an unreachable Response to a
       Recurrence flow purely to satisfy a checker. Declared by name, so an HTTP package that
       lost its Response still fails. */
    if (f === 'DGO_SCHEDULED_SWEEP.designer-paste.json') {
      console.log(`  \u2014 ${f.padEnd(46)} scheduled: no caller, no response contract`);
      continue;
    }
    const pkg = read(dir + f);
    const base = f.replace('.designer-paste.json', '');
    const acts = walk(pkg.serializedValue);
    const byName = Object.fromEntries(acts);
    /* FLAT-BODY PACKAGES, WHICH IS NOT THE SAME QUESTION AS "IS IT A PORTAL FLOW".
       What decides the required shape is whether the CLIENT reads the envelope. The portal
       packages answer flat because document-portal/js/core.js reads the body directly. One
       internal package answers flat for the same reason and must not be failed for it:
       SCAN_INTAKE has no EndpointContracts entry by design, never passes through DataClient or
       assertEnvelope, and core/scan-intake-service.js reads referenceId, attachmentLink, stored,
       depositedBy, sha256 and bytes off the TOP level of the JSON. Wrapping them in the envelope
       would put every field a level below the only caller there is.
       Named rather than pattern-matched: a second internal flow answering flat should have to
       argue its way onto this list, not inherit the exception from a directory name. */
    const FLAT_BODY_INTERNAL = new Set(['DGO_SCAN_INTAKE']);
    const portal = dir.includes('/sharepoint/') || FLAT_BODY_INTERNAL.has(base);
    const before = failures;

    const bodyExpr = acts.filter(([, a]) => a?.type === 'Response').map(([, a]) => a.inputs?.body)[0];
    const source = byName.Compose_Response_Body?.inputs;
    if (bodyExpr !== "@outputs('Compose_Response_Body')") {
      fail(f, 'the Response body does not come from Compose_Response_Body');
    }

    /* every key set on varData anywhere in the package, with the branch that sets it */
    const setKeys = new Set();
    for (const [name, a] of acts) {
      if (a?.type !== 'SetVariable' || a.inputs?.name !== 'varData') continue;
      const v = a.inputs.value;
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) setKeys.add(k);
      else setKeys.add(`«${name} sets a non-object»`);
    }

    if (portal) {
      // 1. flat shape
      if (source !== "@coalesce(variables('varData'),json('{}'))") {
        fail(f, `answers ${source} — the portal reads the body directly, so it must answer varData flat`);
      }
      // 2. every always-required contract field is set somewhere
      for (const [key, fields] of required) {
        if (!(PACKAGE_FOR[key] || []).includes(base)) continue;
        for (const field of fields) {
          if (!setKeys.has(field)) fail(f, `${key} requires '${field}' in the response and no branch sets it`);
        }
      }
    } else {
      // 3. the envelope, whole
      if (source !== "@outputs('Compose__Standard_Response_Revised')") {
        fail(f, `answers ${source} — core/contracts.js assertEnvelope needs the envelope`);
      }
      const env = byName.Compose__Standard_Response_Revised?.inputs;
      if (!env || typeof env !== 'object') fail(f, 'no standard response envelope to check');
      else {
        for (const k of ENVELOPE_KEYS) if (!(k in env)) fail(f, `the envelope has no '${k}' — core/contracts.js reads it`);
        for (const [parent, kids] of Object.entries(ENVELOPE_NESTED)) {
          for (const kid of kids) {
            if (env[parent] && typeof env[parent] === 'object' && !(kid in env[parent])) {
              fail(f, `the envelope has no ${parent}.${kid} — core/contracts.js reads it`);
            }
          }
        }
      }
      // 4. FETCH_ALL's collections must be names data-loader recognises
      if (base === 'DGO_FETCH_ALL') {
        for (const [target, aliases] of aliasSets) {
          if (!aliases.some((a) => setKeys.has(a))) {
            fail(f, `nothing in the response is named for '${target}' — core/data-loader.js looks for ${aliases.join(' | ')}`);
          }
        }
      }
    }
    console.log(`  ${failures > before ? '✗' : '✅'} ${f.padEnd(46)} ${portal ? 'flat, per the portal contract' : 'envelope, per core/contracts.js'}`);
  }
}

console.log(`\n  ${failures} failure(s).\n`);
process.exit(strict && failures ? 1 : 0);
