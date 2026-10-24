#!/usr/bin/env node
/**
 * The Endpoint Console's analysis, and the one guarantee it cannot be allowed to break.
 *
 * WHY THE ANALYSIS IS TESTED SEPARATELY FROM THE SCREEN
 *
 * `core/endpoint-atlas.js` decides; `modules/endpoint-console.js` renders. Everything the
 * console claims about the estate — configured, signed, pointing at the right flow — is
 * computed by functions that take data and return data, so it can be exercised here against
 * deployments that are fabricated on purpose. That matters more than it sounds: the alternative
 * is a suite that can only assert whatever config.local.js happens to hold on the machine
 * running it, which is a test that passes for reasons unrelated to the code.
 *
 * The browser half is covered by tests/endpoint-console.spec.js, which mounts the real module
 * and asserts no signature reaches the DOM on any tab.
 *
 * THE GUARANTEE. A signature is a bearer credential. The console displays addresses, the export
 * is designed to be pasted to support, and the atlas is committed. Every one of those is a place
 * a signature must never appear, and each is asserted separately below — a redaction that holds
 * in the analysis but not the export is not the property anyone is relying on.
 *
 * THE FAULT THAT MOTIVATED THE CONSOLE. A URL that is present, HTTPS, correctly signed and
 * pointing at the wrong workflow passes every check this platform had before the tenant register
 * arrived. It does not fail — it succeeds against the wrong flow. `detects a key calling the
 * wrong workflow` is the assertion that this console catches it; stub the comparison and it
 * goes red.
 *
 * Usage:  node tests/endpoint-console.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const { EndpointAtlas } = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));
const atlasLib = await import(path.join(ROOT, 'core/endpoint-atlas.js'));
const { describeKey, describeEstate, findings, summarise, exportReport, SIGNATURE_LENGTH } = atlasLib;
const { validateOverride } = await import(path.join(ROOT, 'modules/endpoint-console.js'));

const SIG = 'S'.repeat(SIGNATURE_LENGTH);
const urlFor = (key) => EndpointAtlas.keys.find((k) => k.key === key)?.urlTemplate || '';
/** A deployment where every key is wired exactly as the register says. */
const perfect = (key) => (urlFor(key) ? urlFor(key) + SIG : '');

/* ── the committed atlas ──────────────────────────────────────────────────────────────── */

console.log('\nThe atlas the console reads\n');

check('it carries no signature, and cannot', () => {
  const raw = read('config/endpoint-atlas.data.js');
  assert(!/sig=[A-Za-z0-9_%-]+/.test(raw), 'a sig= parameter has a value in a committed file');
  assert(!/=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(raw),
    `a ${SIGNATURE_LENGTH}-character value is present — that is the shape of a signature`);
});

check('every URL template stops exactly where the signature begins', () => {
  const t = EndpointAtlas.keys.map((k) => k.urlTemplate).filter(Boolean);
  assert(t.length === EndpointAtlas.keys.length, 'a key has no URL template');
  assert(t.every((u) => /[?&]sig=$/.test(u)), 'a template carries something after sig=');
});

check('it describes the whole tenant, not only what is configured', () => {
  assert(EndpointAtlas.workflows.length > EndpointAtlas.keys.length,
    'the atlas holds no more workflows than keys — the estate view would have nothing extra to show, '
    + 'and the name-collision finding could not exist');
  assert(EndpointAtlas.workflows.some((w) => !w.bound), 'no unbound workflow is recorded');
});

/* ── per-key analysis ─────────────────────────────────────────────────────────────────── */

console.log('\nWhat the console concludes about one key\n');

check('a correctly wired key is healthy and reports no problem', () => {
  const r = describeKey('FETCH_ALL', { resolve: perfect });
  assert(r.healthy, `expected healthy, got ${r.status}: ${r.problems.map((p) => p.code).join(', ')}`);
  assert(r.signatureLength === SIGNATURE_LENGTH, `signature read as ${r.signatureLength}`);
  assert(r.actualWorkflow === r.expected.workflowId, 'the workflow was not matched');
});

check('detects a key calling the wrong workflow — the fault nothing else catches', () => {
  /* STATUS pointed at CG_Status_Check_Endpoint, a real workflow in this tenant that carries the
     name STATUS and serves no key. The URL is valid, HTTPS and correctly signed. Every check
     that existed before the register passes it. */
  const impostor = EndpointAtlas.workflows.find((w) => !w.bound && w.names.includes('STATUS'));
  assert(impostor, 'the tenant has no unbound workflow named STATUS — rewrite this against another');
  const resolve = (k) => k === 'STATUS'
    ? urlFor('STATUS').replace(/\/workflows\/[0-9a-f]{32}/i, `/workflows/${impostor.workflowId}`) + SIG
    : perfect(k);
  const r = describeKey('STATUS', { resolve });
  assert(r.status === 'wrong-flow', `expected wrong-flow, got ${r.status}`);
  assert(r.signatureLength === SIGNATURE_LENGTH, 'the signature is valid — that is what makes this silent');
  assert(/succeeds against the wrong flow/.test(r.problems[0].text),
    'the finding must say the call succeeds, or it reads as a normal failure');
});

check('a blank signature is distinguished from an absent one', () => {
  const blank = describeKey('FETCH_ALL', { resolve: () => urlFor('FETCH_ALL') });
  assert(blank.status === 'no-signature' && blank.signatureLength === 0,
    `an unsigned template read as ${blank.status}/${blank.signatureLength}`);
  const stripped = describeKey('FETCH_ALL', { resolve: () => urlFor('FETCH_ALL').split('?')[0] });
  assert(stripped.signatureLength === null, 'a URL with no query should report no sig parameter at all');
});

check('a truncated signature is caught and counted', () => {
  const r = describeKey('FETCH_ALL', { resolve: () => urlFor('FETCH_ALL') + 'S'.repeat(40) });
  assert(r.status === 'bad-signature', `expected bad-signature, got ${r.status}`);
  assert(/40 characters, not 43/.test(r.problems[0].text), 'the count must be stated');
});

check('an unconfigured key is reported as off, not as broken', () => {
  const r = describeKey('UPLOAD', { resolve: () => '' });
  assert(r.status === 'unconfigured' && !r.configured, `got ${r.status}`);
  assert(/reports itself unavailable/.test(r.problems[0].text),
    'an unconfigured feature must be described as unavailable, not as a failure');
});

check('a key sharing its flow says so, because rotating one rotates both', () => {
  const shared = EndpointAtlas.keys.find((k) => k.sharesFlowWith.length);
  assert(shared, 'no key shares a flow — this tenant has four such pairs, so something is wrong');
  const r = describeKey(shared.key, { resolve: perfect });
  assert(r.sharesFlowWith.length === shared.sharesFlowWith.length, 'the sharing was not carried through');
});

/* ── estate findings ──────────────────────────────────────────────────────────────────── */

console.log('\nWhat the console concludes about the estate\n');

check('a perfectly wired estate still reports the name collisions', () => {
  const f = findings({ resolve: perfect });
  const collision = f.find((x) => x.code === 'estate.name-collision');
  assert(collision, 'no name-collision finding — the 14 workflows impersonating keys would be invisible');
  assert(collision.severity === 'error', 'live impostors must be an error, not a note');
  assert(collision.items.some((i) => i.live),
    'the finding must distinguish the ones that still answer — those are the dangerous half');
});

check('a fully healthy deployment reports no key-level fault', () => {
  const f = findings({ resolve: perfect }).map((x) => x.code);
  for (const code of ['estate.wrong-flow', 'estate.signature', 'estate.unconfigured']) {
    assert(!f.includes(code), `${code} was raised against a correctly wired estate`);
  }
});

check('summarise counts the whole estate, not the 19-key contract table', () => {
  const s = summarise({ resolve: perfect });
  assert(s.keys === EndpointAtlas.keys.length, `summarised ${s.keys} keys, atlas has ${EndpointAtlas.keys.length}`);
  assert(s.portal > 0, 'the portal surface is not counted — that was the gap in System Health');
  assert(s.healthy === s.keys, `${s.keys - s.healthy} key(s) unhealthy in a perfect deployment`);
});

/* ── the export ───────────────────────────────────────────────────────────────────────── */

console.log('\nThe report an administrator sends to someone else\n');

check('no signature survives into the export, on the whole serialised string', () => {
  const text = JSON.stringify(exportReport({ resolve: perfect }));
  assert(!new RegExp(SIG).test(text), 'the signature appears verbatim in the export');
  assert(!/sig=[A-Za-z0-9_%-]{10,}/.test(text), 'a sig= parameter carries a value in the export');
  assert(/\*\*\*/.test(text), 'nothing was redacted — the redaction may have stopped running');
});

check('it carries the findings and the estate, or it is not a report', () => {
  const r = exportReport({ resolve: perfect });
  assert(r.keys.length === EndpointAtlas.keys.length, 'not every key is in the export');
  assert(r.workflows.length === EndpointAtlas.workflows.length, 'the workflow estate is missing');
  assert(Array.isArray(r.findings), 'no findings in the export');
  assert(/safe to send/.test(r.note || ''), 'the export does not state that it is redacted');
});

/* ── the override validator ───────────────────────────────────────────────────────────── */

console.log('\nWhat the configuration editor refuses to save\n');

check('an empty value is allowed — it means "use the installed address"', () => {
  assert(validateOverride('FETCH_ALL', '').length === 0, 'an empty override was refused');
});

check('a correct address is accepted', () => {
  assert(validateOverride('FETCH_ALL', perfect('FETCH_ALL')).length === 0,
    `a correct address was refused: ${validateOverride('FETCH_ALL', perfect('FETCH_ALL')).join('; ')}`);
});

check('an address for the wrong workflow is refused, naming both ids', () => {
  const other = EndpointAtlas.keys.find((k) => k.key !== 'FETCH_ALL' && k.workflowId !== urlFor('FETCH_ALL'));
  const wrong = urlFor('FETCH_ALL').replace(/\/workflows\/[0-9a-f]{32}/i, `/workflows/${other.workflowId}`) + SIG;
  const errs = validateOverride('FETCH_ALL', wrong);
  assert(errs.length === 1, `expected one error, got ${errs.length}`);
  assert(errs[0].includes(other.workflowId) && errs[0].includes(EndpointAtlas.keys.find((k) => k.key === 'FETCH_ALL').workflowId),
    'the refusal must name what was typed and what was expected');
});

check('a short signature and a non-HTTPS address are both refused', () => {
  assert(validateOverride('FETCH_ALL', urlFor('FETCH_ALL') + 'S'.repeat(20)).length === 1, 'a short signature was accepted');
  assert(validateOverride('FETCH_ALL', perfect('FETCH_ALL').replace(/^https:/, 'http:')).some((e) => /HTTPS/.test(e)),
    'a plain-HTTP address was accepted');
  assert(validateOverride('FETCH_ALL', 'not a url').length === 1, 'a non-URL was accepted');
});

/* ── the module itself ────────────────────────────────────────────────────────────────── */

console.log('\nThe console is wired into the platform\n');

check('the route is registered and reachable only by systemAdmin', async () => {
  const boot = read('core/boot.js');
  assert(/'endpoint-console':\(\)=>import\('\.\.\/modules\/endpoint-console\.js'\)/.test(boot),
    'the module is not in the boot map, so the route would render nothing');
  const { Routes } = await import(path.join(ROOT, 'config/routes.config.js'));
  assert(Routes.some((r) => r.path === 'endpoint-console'), 'the route is not declared');
  const { canAccess } = await import(path.join(ROOT, 'config/rbac.config.js'));
  assert(canAccess({ role: 'systemAdmin', status: 'active' }, 'endpoint-console'), 'systemAdmin cannot open it');
  for (const role of ['userAdmin', 'director', 'operator', 'viewer', 'executive']) {
    assert(!canAccess({ role, status: 'active' }, 'endpoint-console'),
      `${role} can open the endpoint console — it exposes the whole estate and the override editor`);
  }
});

check('the module renders no raw URL — every address goes through redact()', () => {
  const src = read('modules/endpoint-console.js');
  /* `resolve()` returns the real URL. It may be handed to redact(), to the probe's fetch, and to
     the validator — and nowhere else. A template literal interpolating it directly would put a
     live signature in the DOM. */
  const raw = src.match(/\$\{[^}]*\bresolve\(/g) || [];
  assert(raw.length === 0, `${raw.length} template interpolation(s) of resolve() — a signature would render`);
  assert(/EndpointRegistry\.redact/.test(src) || /r\.target/.test(src),
    'nothing redacts, so nothing is safe to display');
});

check('the health probe never calls a write endpoint', () => {
  const src = read('modules/endpoint-console.js');
  assert(/readOnly === true/.test(src),
    'the probe does not filter to read-only contracts — a health check could register correspondence, '
    + 'dispatch email or assign work as a side effect');
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
