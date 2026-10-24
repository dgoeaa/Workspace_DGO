#!/usr/bin/env node
/**
 * Which operation discriminators does the client actually send to DYNAMIC_ACTIONS?
 *
 * WHY THIS EXISTS
 * `DGO_DYNAMIC_GLOBAL_ACTIONS` answers `400 UNKNOWN_OPERATION` to anything it does not recognise,
 * which is correct — a silent `200` makes the client record a write that never happened. But it
 * makes the recognised set load-bearing: a discriminator missing from it is a feature that fails
 * in production and nowhere else. The set was previously written by hand, and it was wrong — it
 * carried names from `action-ownership.config.js` while the wire carries the `action` passed to
 * `WriteManager.backend()`, which is not the same vocabulary.
 *
 * So it is derived from the code instead, and `npm run test:dynamicops` fails when the two drift.
 *
 * WHERE THE WIRE VALUE COMES FROM
 * `WriteManager.backend({ action, payload })` calls
 * `DataClient.request(endpoint, { operation: action, ref, idempotencyKey, ...payload })`.
 * The payload is spread *after* `operation`, so a payload carrying its own `operation` overrides
 * the action — which is exactly what `modules/activities.js` does to send step discriminators.
 * Both forms are collected here.
 *
 * Usage:
 *   node scripts/derive-dynamic-operations.mjs           # write the file
 *   node scripts/derive-dynamic-operations.mjs --check   # exit 1 if it is stale
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs/deployment/internal/dynamic-operations.json');
const check = process.argv.includes('--check');

/** Every .js under the client source roots, named the way the committed artifact names them.
    `join` uses the platform separator, so on Windows these came out as `core\api.js` and were
    written into dynamic-operations.json verbatim — the file then differed from the committed one
    and `--check` reported it stale on Windows and only there. */
function sources(dir, acc = []) {
  for (const e of readdirSync(join(ROOT, dir))) {
    const p = join(dir, e).split(sep).join('/');
    if (statSync(join(ROOT, p)).isDirectory()) sources(p, acc);
    else if (e.endsWith('.js')) acc.push(p);
  }
  return acc;
}
const files = ['core', 'modules', 'config'].flatMap((d) => sources(d));

const ops = new Map();
const add = (op, source, note) => {
  if (!op) return;
  const key = String(op).toLowerCase();
  if (!ops.has(key)) ops.set(key, { operation: key, sources: [], note });
  const e = ops.get(key);
  if (!e.sources.includes(source)) e.sources.push(source);
};

/* 1. WriteManager.backend / .optimistic call sites whose endpoint is DYNAMIC_ACTIONS — either
      named explicitly or left to the default, which is DYNAMIC_ACTIONS. */
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/WriteManager\.(?:backend|optimistic)\(\{([\s\S]{0,400}?)\}\)/g)) {
    const call = m[1];
    const endpoint = call.match(/endpoint\s*:\s*'([A-Z_]+)'/);
    if (endpoint && endpoint[1] !== 'DYNAMIC_ACTIONS') continue;   // EMAIL, EMAIL_RELATED_TASK, …
    if (!endpoint && /endpoint\s*:/.test(call)) continue;          // a variable — cannot resolve here
    /* The payload is spread AFTER `operation: action`, so a payload that carries its own
       `operation` is what actually reaches the flow. Resolve that first; the action is only the
       wire value when the payload does not override it. */
    const inline = call.match(/payload\s*:\s*\{([\s\S]*?)\}/);
    /* `payload` is often passed as shorthand — `{ …, payload, ref }` — as well as `payload: name`. */
    const payloadVar = call.match(/payload\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/)
      || (/[,{]\s*payload\s*[,}]/.test(call) ? [null, 'payload'] : null);
    let override = inline?.[1]?.match(/\boperation\s*:\s*'([^']+)'/)?.[1] || null;
    if (!override && payloadVar) override = resolvePayloadOperation(src, payloadVar[1]);

    const action = call.match(/action\s*:\s*'([^']+)'/);
    if (override) add(override, f, `payload.operation overrides action '${action?.[1] ?? '?'}'`);
    else if (action) add(action[1], f, 'action passed to WriteManager.backend');
  }
}

/**
 * A payload passed by name: find what built it, and whether that builder stamps a literal
 * `operation`. `core/document-flags.js` does exactly this — `flagPayload()` returns
 * `operation: 'update'`, so a `flag-document` action reaches the flow as `update`.
 */
function resolvePayloadOperation(src, name) {
  const assign = src.match(new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*([\\s\\S]{0,200})`));
  if (!assign) return null;
  const objLit = assign[1].match(/^\{([\s\S]*?)\}/);
  if (objLit) return objLit[1].match(/\boperation\s*:\s*'([^']+)'/)?.[1] || null;
  const callee = assign[1].match(/^([A-Za-z_$][\w$]*)\s*\(/);
  if (!callee) return null;
  for (const g of files) {
    const other = readFileSync(join(ROOT, g), 'utf8');
    const fn = other.match(new RegExp(`function\\s+${callee[1]}\\s*\\([\\s\\S]*?\\n\\}`));
    if (fn) return fn[0].match(/\boperation\s*:\s*'([^']+)'/)?.[1] || null;
  }
  return null;
}

/* 2. The aliases core/api.js maps straight onto DYNAMIC_ACTIONS. */
{
  const src = readFileSync(join(ROOT, 'core/api.js'), 'utf8');
  for (const m of src.matchAll(/endpoint:'DYNAMIC_ACTIONS',operation:'([^']+)'/g)) {
    add(m[1], 'core/api.js', 'ObsidianActionAliases');
  }
}

/* 3. The activities-parity steps. `modules/activities.js` puts `operation` in the payload, and the
      spread puts it over the action — so these step names, not the three action names, are what
      reaches the flow. Both are registered: the sequence name is what an operator sees. */
const { ActivityLifecycleActions, ActivityLifecycleOperations } =
  await import(new URL('../config/dynamic-actions.config.js', import.meta.url));
for (const a of ActivityLifecycleActions) add(a, 'config/dynamic-actions.config.js', 'activity lifecycle sequence');
for (const o of ActivityLifecycleOperations) add(o, 'config/dynamic-actions.config.js', 'activity lifecycle step — sent in payload.operation');

const derived = {
  $comment: 'Generated by scripts/derive-dynamic-operations.mjs. Do not edit by hand — run the script.',
  generatedFrom: 'core/, modules/, config/',
  operations: [...ops.values()].sort((a, b) =>byteCompare( a.operation, b.operation)),
};

const next = JSON.stringify(derived, null, 2) + '\n';
let prev = '';
try { prev = readFileSync(OUT, 'utf8'); } catch { /* first run */ }

if (check) {
  if (prev !== next) {
    console.log('✗ dynamic-operations.json is stale — run `node scripts/derive-dynamic-operations.mjs`');
    process.exit(1);
  }
  console.log(`✅ ${derived.operations.length} DYNAMIC_ACTIONS discriminator(s), in sync with the client`);
} else {
  writeFileSync(OUT, next);
  for (const o of derived.operations) console.log(`  ${o.operation.padEnd(38)} ${o.sources.join(', ')}`);
  console.log(`\n  ${derived.operations.length} discriminator(s) → ${relative(ROOT, OUT)}\n`);
}
