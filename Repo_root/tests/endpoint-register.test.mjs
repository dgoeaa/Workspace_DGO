#!/usr/bin/env node
/**
 * The register path: reconcile → template → sign → check → setup.
 *
 * WHY THIS SUITE EXISTS
 *
 * `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` replaced every other source of "which workflow does
 * this key call?" in one step, and it did so because reconciliation showed **all 25 keys
 * pointing at workflows this repository had wrong**. A correction that large is only worth
 * having if the mechanism that applies it cannot itself go quietly wrong, and the three ways it
 * could are all invisible from the outside:
 *
 *   1. A signature reaching the register or the file derived from it. Both are committed. The
 *      whole reason a URL may now live in a tracked file is that the register removes the one
 *      part of it that is a credential; if that stopped being true, this repository would be
 *      publishing bearer tokens again with a green test suite.
 *   2. A URL template that does not end at `sig=`. A placeholder left after it becomes a config
 *      value that is non-empty, HTTPS and correctly shaped — it passes every existing check and
 *      fails as a 401 in production.
 *   3. The derived file drifting from the register. Nothing else in the repository would notice;
 *      `check-config-local.mjs` would go on validating configs against stale ids and reporting
 *      correct wiring as wrong.
 *
 * The signing helper is tested for the mistakes a person actually makes on a phone at the end of
 * a long day: a short paste, a whole URL pasted where a signature was asked for, a mistyped key,
 * and a command re-run from history over a key that was already right.
 *
 * Usage:  node tests/endpoint-register.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE_LENGTH = 43;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const run = (script, args, input) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args],
  { cwd: ROOT, encoding: 'utf8', input });

const sig = (tag) => (tag + 'x'.repeat(SIGNATURE_LENGTH)).slice(0, SIGNATURE_LENGTH);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-register-'));

/* ── the register itself ──────────────────────────────────────────────────────────────── */

console.log('\nThe register is safe to commit\n');

const registerRaw = read('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json');
const register = JSON.parse(registerRaw);

check('the register carries no signature', () => {
  assert(!/sig=[A-Za-z0-9_%-]+/.test(registerRaw),
    'a signature is present in a committed file — that is a published bearer credential');
});

check('it declares what it removed, so the removal is auditable rather than assumed', () => {
  const cr = register.credential_removal || {};
  assert(Array.isArray(cr.removed_query_parameters) && cr.removed_query_parameters.includes('sig'),
    'the register does not state that it removed the signature');
  assert(typeof cr.replacement_marker === 'string' && cr.replacement_marker.length > 0,
    'no replacement marker declared — the reconciler strips it by name, so it must be stated');
});

check('every configured key names a workflow that the registry also describes', () => {
  const known = new Set((register.complete_flow_registry || []).map((r) => r.workflow_id));
  const orphans = (register.current_configuration || [])
    .filter((r) => !known.has(r.workflow_id)).map((r) => r.key);
  assert(orphans.length === 0,
    `${orphans.length} key(s) point at a workflow with no record: ${orphans.join(', ')}`);
});

/* ── the derived file ─────────────────────────────────────────────────────────────────── */

console.log('\nThe derived id map\n');

const mapRaw = read('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json');
const map = JSON.parse(mapRaw);
const entries = [...Object.values(map.internal || {}), ...Object.values(map.portal || {})];

check('it is derived from the register and says so', () => {
  assert(/endpoint-register\.json$/.test(map.authority?.file || ''),
    'the map does not name the register as its authority');
  assert(/reconcile-endpoint-register/.test(map.generatedBy || ''),
    'the map does not name the generator that produces it');
});

check('every key carries a workflow id', () => {
  const missing = entries.filter((e) => !e.workflowId);
  assert(missing.length === 0, `${missing.length} key(s) have no workflow id`);
  assert(entries.length === (register.current_configuration || []).length,
    `derived ${entries.length} keys, register has ${(register.current_configuration || []).length}`);
});

check('no signature survived into the derived file', () => {
  assert(!/sig=[A-Za-z0-9_%-]+/.test(mapRaw), 'a sig= parameter has a value');
  assert(!/=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(mapRaw),
    `a ${SIGNATURE_LENGTH}-character value is present — that is the shape of a signature`);
});

check('every URL template stops exactly where the signature begins', () => {
  const t = entries.map((e) => e.urlTemplate).filter(Boolean);
  assert(t.length === entries.length, `${entries.length - t.length} key(s) have no URL template`);
  assert(t.every((u) => /[?&]sig=$/.test(u)),
    'a template carries something after sig= — it would become a config value that is non-empty, '
    + 'HTTPS and correctly shaped, and fail as a 401 much later');
  assert(!t.some((u) => u.includes(register.credential_removal.replacement_marker)),
    'the register\'s placeholder marker survived into a template');
});

check('keys sharing one workflow say so, in both directions', () => {
  const byId = new Map();
  for (const [k, e] of [...Object.entries(map.internal || {}), ...Object.entries(map.portal || {})]) {
    if (!byId.has(e.workflowId)) byId.set(e.workflowId, []);
    byId.get(e.workflowId).push(k);
  }
  for (const [, keys] of byId) {
    if (keys.length < 2) continue;
    for (const k of keys) {
      const e = (map.internal || {})[k] ?? (map.portal || {})[k];
      const peers = keys.filter((x) => x !== k).sort();
      assert(JSON.stringify((e.sharesFlowWith || []).slice().sort()) === JSON.stringify(peers),
        `${k} shares a flow with ${peers.join(', ')} but does not record it — rotating that flow `
        + 'rotates every key on it, and an operator reading one key would not know');
    }
  }
});

check('--check fails when the derived file drifts from the register', () => {
  const target = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json');
  const original = fs.readFileSync(target, 'utf8');
  try {
    const clean = run('reconcile-endpoint-register.mjs', ['--check']);
    assert(clean.status === 0, `--check failed on an up-to-date file: ${clean.stderr}`);
    const drifted = JSON.parse(original);
    drifted.internal.FETCH_ALL.workflowId = 'f'.repeat(32);
    fs.writeFileSync(target, JSON.stringify(drifted, null, 2) + '\n');
    const dirty = run('reconcile-endpoint-register.mjs', ['--check']);
    assert(dirty.status === 1, `--check passed a drifted file (exit ${dirty.status})`);
  } finally {
    fs.writeFileSync(target, original);
  }
});

/* ── template and signing ─────────────────────────────────────────────────────────────── */

console.log('\nGenerating and completing a values file\n');

const values = path.join(work, 'values.txt');

check('the template writes every key with its URL already complete', () => {
  const r = run('make-values-template.mjs', [values]);
  assert(r.status === 0, `template generation failed: ${r.stderr}`);
  const body = fs.readFileSync(values, 'utf8');
  const lines = body.match(/^(?:DGO|PF)_ENDPOINT_[A-Z_]+=.*$/gm) || [];
  assert(lines.length === entries.length, `${lines.length} lines for ${entries.length} keys`);
  assert(lines.every((l) => /[?&]sig=$/.test(l)),
    'a generated line does not end at sig= — the operator would have to edit the URL itself');
});

check('an unfilled template is reported as awaiting a signature, not as a truncated URL', () => {
  const r = run('describe-values.mjs', [values, '--strict']);
  assert(r.status === 1, 'a template with no signatures was accepted');
  assert(/signature is blank/.test(r.stdout),
    'an unfilled key was reported as a bad copy rather than an unfinished step — that sends '
    + `someone to re-copy a URL that was correct:\n${r.stdout.slice(-400)}`);
  assert(!/cut short/.test(r.stdout), 'the truncation wording was used for an unfilled key');
});

check('the template prints no signature, because it has none to print', () => {
  const body = fs.readFileSync(values, 'utf8');
  assert(!/sig=[A-Za-z0-9_-]+/.test(body), 'the generated template contains a signature');
});

check('a signature is written onto the right key and nowhere else', () => {
  const before = fs.readFileSync(values, 'utf8').split('\n');
  const r = run('set-values-signature.mjs', [values, 'FETCH_ALL'], sig('AA'));
  assert(r.status === 0, `signing failed: ${r.stderr}`);
  const after = fs.readFileSync(values, 'utf8').split('\n');
  const changed = after.map((l, i) => (l === before[i] ? null : i)).filter((i) => i !== null);
  assert(changed.length === 1, `${changed.length} lines changed, expected 1`);
  assert(/FETCH_ALL=/.test(after[changed[0]]), 'the wrong line was edited');
});

check('a whole URL pasted where a signature was asked for is reduced, not rejected', () => {
  const r = run('set-values-signature.mjs', [values, 'GET_DOCS'],
    `https://example.invalid/wf?api-version=1&si` + `g=${sig('BB')}`);
  assert(r.status === 0, `a pasted URL was rejected: ${r.stderr}`);
  const line = fs.readFileSync(values, 'utf8').split('\n').find((l) => /^DGO_ENDPOINT_GET_DOCS=/.test(l));
  assert(line.includes('powerplatform.com'),
    'the pasted URL replaced the template line — the reconciled host and workflow id were lost');
  assert(line.endsWith(sig('BB')), 'the signature was not lifted out of the pasted URL');
});

check('a short paste is refused, with the count', () => {
  const r = run('set-values-signature.mjs', [values, 'REFERENCE_DATA'], 'TOOSHORT');
  assert(r.status === 1, 'a truncated signature was accepted');
  assert(new RegExp(`8 characters, expected ${SIGNATURE_LENGTH}`).test(r.stderr),
    `the refusal must say what was wrong:\n${r.stderr}`);
});

check('a mistyped key is refused rather than appended as a line nothing reads', () => {
  const r = run('set-values-signature.mjs', [values, 'FETCH_AL'], sig('CC'));
  assert(r.status === 1, 'an unknown key was accepted');
  assert(/is not a key in/.test(r.stderr), 'the refusal does not say the key is unknown');
  const body = fs.readFileSync(values, 'utf8');
  assert(!/FETCH_AL=/m.test(body.replace(/FETCH_ALL=/g, '')), 'a line was appended for an unknown key');
});

check('re-running over a key that is already signed needs --replace', () => {
  const guarded = run('set-values-signature.mjs', [values, 'FETCH_ALL'], sig('DD'));
  assert(guarded.status === 1, 'an existing signature was silently overwritten');
  const forced = run('set-values-signature.mjs', [values, 'FETCH_ALL', '--replace'], sig('DD'));
  assert(forced.status === 0, `--replace was refused: ${forced.stderr}`);
});

check('a fully signed file passes the value check', () => {
  const body = fs.readFileSync(values, 'utf8').split('\n');
  let n = 0;
  const filled = body.map((l) => (/^(?:DGO|PF)_ENDPOINT_[A-Z_]+=.*[?&]sig=$/.test(l) ? l + sig('E' + (n++ % 10)) : l));
  fs.writeFileSync(values, filled.join('\n'));
  const r = run('describe-values.mjs', [values, '--strict']);
  assert(r.status === 0, `a completed values file was rejected:\n${r.stdout.slice(-600)}`);
  assert(new RegExp(`all with a complete ${SIGNATURE_LENGTH}-character signature`).test(r.stdout),
    'the completed file was not reported as complete');
  assert(!/sig=[A-Za-z0-9_-]{10,}/.test(r.stdout), 'check:values printed a signature');
});

/* ── the advertised verb is the one the browser sends ─────────────────────────────────── */

/* The register annotates every endpoint POST. Two of them are not: `SCAN_INTAKE` and portal
   `UPLOAD` are raw-bytes deposits whose deployed triggers declare PUT, and whose clients send
   PUT. Taking the register's annotation at face value put POST into the derived artefacts, from
   there into both endpoint consoles' Method column, and from there into the standalone console's
   write probe — which would POST a PUT-only trigger, be refused before the flow ran, and report
   two correctly wired keys as broken at the moment someone was deciding whether to go live.
   These assertions tie the advertised verb to the caller's transport and to the deployed
   definition, so the three cannot drift apart again. */

console.log('\nThe advertised method is the verb the caller actually sends\n');

const derived = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json'), 'utf8'));
const surface = await import(path.join(ROOT, 'scripts/lib/endpoint-surface.mjs'));
const transportOf = new Map(
  [...surface.RUNTIME_ENDPOINTS, ...surface.PORTAL_ENDPOINTS].map((e) => [e.key, e.transport]),
);
const allDerived = { ...derived.internal, ...derived.portal };

check('every key advertises the verb its transport implies', () => {
  const wrong = Object.entries(allDerived)
    .filter(([k, v]) => v.method !== (transportOf.get(k) === 'bytes' ? 'PUT' : 'POST'))
    .map(([k, v]) => `${k}: transport ${transportOf.get(k)} but method ${v.method}`);
  assert(wrong.length === 0, `advertised method contradicts transport — ${wrong.join('; ')}`);
});

check('the raw-bytes deposits advertise PUT, not the register\'s POST', () => {
  for (const k of ['SCAN_INTAKE', 'UPLOAD']) {
    assert(allDerived[k], `${k} is missing from the derived file`);
    assert(allDerived[k].method === 'PUT', `${k} advertises ${allDerived[k].method}; the deployed trigger is PUT`);
  }
});

check('what the register said is preserved rather than overwritten in silence', () => {
  assert(derived.totals.methodDisagreements === 2,
    `expected 2 reconciled method disagreements, found ${derived.totals.methodDisagreements}`);
  for (const k of ['SCAN_INTAKE', 'UPLOAD']) {
    assert(allDerived[k].registerMethod === 'POST',
      `${k} does not record that the register annotated it POST`);
  }
});

check('the advertised verb matches the deployed trigger definition', () => {
  const dir = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed');
  for (const [key, flowPrefix] of [['SCAN_INTAKE', 'IP_SCAN_INTAKE__'], ['UPLOAD', 'CG_Upload_Endpoint__']]) {
    const file = fs.readdirSync(dir).find((f) => f.startsWith(flowPrefix));
    assert(file, `no exported definition for ${key}`);
    const def = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const triggers = def.properties?.definition?.triggers ?? def.definition?.triggers ?? def.triggers ?? {};
    const methods = Object.values(triggers).map((t) => t?.inputs?.method).filter(Boolean);
    assert(methods.includes(allDerived[key].method),
      `${key} advertises ${allDerived[key].method}; its definition declares ${methods.join(', ') || '(none)'}`);
  }
});

/* ── the Correspondence Mailer's endpoints ────────────────────────────────────────────── */

/* The register holds every endpoint the deployed front ends call, the Mailer's seven included
   (owner approval, 2026-10-22). Each of these ties that section to an independent record, so a
   Mailer flow recreated, renamed or re-keyed in one place and not the other fails here. */

console.log('\nThe Correspondence Mailer\'s endpoints are in the register, and agree with every other record of them\n');

const { MAILER_ENDPOINTS } = await import(path.join(ROOT, 'scripts/lib/endpoint-surface.mjs'));
const mailerRows = register.mailer_configuration || [];
const mailerKeysDeclared = MAILER_ENDPOINTS.map((e) => e.key);

check('the register holds exactly the endpoints the Mailer declares, in the same order', () => {
  assert(mailerRows.map((r) => r.key).join(',') === mailerKeysDeclared.join(','),
    `register [${mailerRows.map((r) => r.key).join(', ')}]; endpoint-surface [${mailerKeysDeclared.join(', ')}]`);
  assert(register.summary?.mailer_configuration_keys === mailerRows.length, 'summary.mailer_configuration_keys does not count the section');
  const example = read('mailer/config.local.example.js');
  const exampleKeys = [...example.matchAll(/^\s+(MAIL_[A-Z_]+):/gm)].map((m) => m[1]);
  assert(exampleKeys.join(',') === mailerKeysDeclared.join(','),
    `mailer/config.local.example.js declares [${exampleKeys.join(', ')}]`);
});

check('each endpoint\'s flow and operations are the ones the Mailer package builds', () => {
  const cat = JSON.parse(read('mailer/flows/flows.catalogue.json')).flows || [];
  for (const e of MAILER_ENDPOINTS) {
    const c = cat.find((f) => f.endpointKey === e.key);
    assert(c, `${e.key} is not in mailer/flows/flows.catalogue.json`);
    assert(c.name === e.flow, `${e.key}: the catalogue builds ${c.name}, endpoint-surface names ${e.flow}`);
    assert(c.operations.join(',') === e.actions.join(','), `${e.key}: operations differ from the catalogue`);
    assert(/\(POST\)/.test(c.trigger) && /triggerAuthenticationType: All/.test(c.trigger), `${e.key}: trigger is ${c.trigger}`);
  }
  assert(cat.length === MAILER_ENDPOINTS.length, `the catalogue builds ${cat.length} flows`);
});

check('each row carries no signature, and its URL addresses the workflow the row names', () => {
  for (const r of mailerRows) {
    assert(/[?&]sig=<CREDENTIAL_REMOVED>$/.test(r.sanitized_endpoint_url), `${r.key}: the URL does not end at the removed signature`);
    assert(r.sanitized_endpoint_url.includes(`/workflows/${r.workflow_id}/`), `${r.key}: the URL addresses another workflow`);
    assert(r.method === 'POST' && r.trigger_authentication === 'All', `${r.key}: ${r.method} / ${r.trigger_authentication}`);
  }
});

check('flow ids agree with the adoption ledger, workflow ids with the last delivered build', () => {
  const adopted = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json')).adopted || [];
  const built = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json')).variants?.mailer || {};
  for (const r of mailerRows) {
    const a = adopted.find((x) => x.name === r.flow_name);
    assert(a, `${r.flow_name} is not an adopted flow`);
    assert(a.flowId === r.flow_id, `${r.key}: register flow ${r.flow_id}, adoption ${a.flowId}`);
    assert(built[r.key], `${r.key} is not in the config-build ledger`);
    assert(built[r.key].workflowId === r.workflow_id && built[r.key].flowId === r.flow_id,
      `${r.key}: the last build reached ${built[r.key].workflowId}; the register names ${r.workflow_id}. Update the register from the build.`);
  }
});

check('each row\'s cited evidence exists and names the same workflow', () => {
  for (const r of mailerRows) {
    assert(Array.isArray(r.source_files) && r.source_files.length, `${r.key} cites no evidence`);
    for (const f of r.source_files) assert(fs.existsSync(path.join(ROOT, f)), `${r.key}: ${f} does not exist`);
    const cap = r.source_files.find((f) => f.includes('/captures/'));
    assert(cap, `${r.key} cites no tenant capture`);
    const c = JSON.parse(read(cap));
    assert(c.FlowGuid === r.flow_id && String(c.CallbackUrlRedacted).includes(`/workflows/${r.workflow_id}/`),
      `${r.key}: ${cap} records another flow or workflow`);
  }
});

check('no Mailer workflow also serves a contract key', () => {
  const contract = new Set((register.current_configuration || []).map((r) => r.workflow_id));
  const both = mailerRows.filter((r) => contract.has(r.workflow_id)).map((r) => r.key);
  assert(both.length === 0, `shared with a contract key: ${both.join(', ')}`);
});

check('the derived map and the atlas carry the section, outside the contract keys', () => {
  for (const r of mailerRows) {
    const m = map.mailer?.[r.key];
    assert(m && m.workflowId === r.workflow_id && /[?&]sig=$/.test(m.urlTemplate), `${r.key}: missing or wrong in endpoint-workflow-ids.json`);
    assert(!map.internal?.[r.key] && !map.portal?.[r.key], `${r.key} leaked into the contract keys`);
  }
  assert(map.totals?.mailerKeys === mailerRows.length && map.totals?.keys === (register.current_configuration || []).length,
    'totals count the Mailer into the contract keys, or not at all');
  const atlas = read('config/endpoint-atlas.data.js');
  for (const r of mailerRows) assert(atlas.includes(`"key": "${r.key}",\n      "surface": "mailer"`), `${r.key} is not in the atlas mailerKeys`);
});

check('the endpoint dataset lists every Mailer endpoint, with a definition that exists', () => {
  const d = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json'));
  assert((d.mailerEndpoints || []).map((e) => e.key).join(',') === mailerKeysDeclared.join(','), 'endpoints.json mailerEndpoints differs');
  assert(!(d.endpoints || []).some((e) => mailerKeysDeclared.includes(e.key)), 'a Mailer key leaked into endpoints[]');
  for (const e of d.mailerEndpoints) {
    assert(e.workflowId === mailerRows.find((r) => r.key === e.key).workflow_id, `${e.key}: workflow differs from the register`);
    assert(e.definition && fs.existsSync(path.join(ROOT, e.definition)), `${e.key}: definition ${e.definition} does not exist`);
  }
});

const { MAILER_KEYS } = await import(path.join(ROOT, 'scripts/lib/config-drift.mjs'));
check('config drift reads the Mailer\'s keys from the same declaration', () => {
  assert(MAILER_KEYS.join(',') === mailerKeysDeclared.join(','), `config-drift keys [${MAILER_KEYS.join(', ')}]`);
});

/* ── the retired paths stay retired ───────────────────────────────────────────────────── */

console.log('\nSuperseded paths refuse rather than producing a dead estate\n');

check('--recover refuses, and names what to use instead', () => {
  const r = run('setup.mjs', ['--recover', '--force', '--quiet']);
  assert(r.status === 2, `--recover ran (exit ${r.status}) — it would wire revoked signatures on `
    + 'superseded workflows, producing a config that looks complete and 401s on every call');
  assert(/values:template/.test(r.stderr), 'the refusal does not name the replacement');
});

check('the superseded id generator refuses rather than competing for its output file', () => {
  const r = run('build-endpoint-workflow-ids.mjs', []);
  assert(r.status === 2, `the retired generator ran (exit ${r.status})`);
  assert(/npm run reconcile/.test(r.stderr), 'the refusal does not name the replacement');
});

fs.rmSync(work, { recursive: true, force: true });

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
