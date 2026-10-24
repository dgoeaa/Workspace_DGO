#!/usr/bin/env node
/**
 * The one-command wiring path does what it claims, including when it should refuse.
 *
 * WHY THIS EXISTS
 *
 * `npm run wire` exists to collapse four commands into one without losing any of their
 * checks. The risk in a convenience wrapper is precisely that it is convenient: it runs
 * `setup --force`, which rewrites both configs from whatever it can find, and if it ever
 * reached that call with nothing to write it would blank a wired working tree and exit 0.
 * That is a worse failure than the four-command path it replaces, because it looks like
 * success and destroys state.
 *
 * So the properties asserted here are not "it prints the right thing". They are:
 *
 *   1. With NO values anywhere, it refuses (exit 2) and writes nothing.
 *   2. With values, `--dry` reports them and still writes nothing.
 *   3. With values, it writes both configs and the value actually lands in them.
 *   4. It counts a key whose URL ends at a bare `sig=` as unsigned and says so.
 *   5. DGO_VALUES — one secret carrying the whole values file — is read by setup.mjs.
 *   6. Nothing it prints on the refusal path is a credential.
 *
 * Every case runs against a THROWAWAY COPY of the repository in a temp directory, so no
 * assertion here can write a config into the checkout running the suite.
 *
 * The URLs below are obviously fake — `example.logic.azure.com`, workflow id `FAKE…`, and a
 * signature of repeated 'A'. They authenticate nothing.
 *
 * Run: node tests/wiring-path.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (err) { failures.push(name); console.log(`  ❌ ${name}`); console.log(`     ${err.message}`); }
};

/* ------------------------------------------------------------------ *
 * A throwaway copy of the tree, so nothing here can touch the checkout
 * ------------------------------------------------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-wire-test-'));
execFileSync('git', ['archive', 'HEAD', '-o', path.join(tmp, 'tree.tar')], { cwd: ROOT });
execFileSync('tar', ['-xf', path.join(tmp, 'tree.tar')], { cwd: tmp });
/* `git archive HEAD` carries only committed files, and the scripts under test may not be
   committed yet when this suite first runs. Copy the working-tree versions over the top. */
for (const f of ['scripts/wire.mjs', 'scripts/setup.mjs', 'scripts/values-secret.mjs']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
}

const SIG = 'A'.repeat(43);
const url = (id, sig = SIG) =>
  `https://example.logic.azure.com:443/workflows/${id}/triggers/manual/paths/invoke` +
  `?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=${sig}`;

/** Run wire.mjs in the throwaway tree with a controlled environment. */
function wire(env = {}, args = []) {
  /* A stray DGO_* in the suite runner's own environment would silently change the result,
     so the child gets a scrubbed environment rather than an inherited one. */
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('DGO_') && !k.startsWith('PF_')),
  );
  return spawnSync(process.execPath, [path.join(tmp, 'scripts/wire.mjs'), ...args], {
    cwd: tmp, encoding: 'utf8', env: { ...clean, ...env },
  });
}

const configs = ['config/config.local.js', 'document-portal/config.local.js'];
const clearConfigs = () => {
  for (const f of configs) fs.rmSync(path.join(tmp, f), { force: true });
};
const wroteAny = () => configs.some(f => fs.existsSync(path.join(tmp, f)));

console.log('\nOne-command wiring path\n');

/* ------------------------------------------------------------------ *
 * 1. No values anywhere — refuse, and write nothing
 * ------------------------------------------------------------------ */

check('with no values it refuses rather than blanking the config', () => {
  clearConfigs();
  const r = wire();
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
  assert.equal(wroteAny(), false, 'it wrote a config despite having nothing to write');
  assert.match(r.stderr, /nothing to wire/i);
});

check('the refusal names both ways to supply values', () => {
  const r = wire();
  assert.match(r.stderr, /DGO_VALUES/, 'the one-secret route is not mentioned');
  assert.match(r.stderr, /values:template/, 'the values-file route is not mentioned');
});

check('the refusal prints no credential', () => {
  const r = wire();
  /* A bare `sig=` in the instructions is fine; a signature after it is not. */
  assert.ok(!/sig=[A-Za-z0-9._%-]+/.test(r.stderr + r.stdout),
    'something that looks like a signed URL was printed');
});

/* ------------------------------------------------------------------ *
 * 2. --dry reports and writes nothing
 * ------------------------------------------------------------------ */

check('--dry reports the keys it found and writes nothing', () => {
  clearConfigs();
  const r = wire({ DGO_VALUES: `FETCH_ALL=${url('FAKE1')}\nFETCH_ACTIVITIES=${url('FAKE2')}\n` }, ['--dry']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}`);
  assert.match(r.stdout, /2 of 26 keys supplied/);
  assert.equal(wroteAny(), false, '--dry wrote a config');
});

/* ------------------------------------------------------------------ *
 * 3. A key ending at a bare `sig=` is unsigned, and is named
 * ------------------------------------------------------------------ */

check('a URL ending at a bare sig= is reported as unsigned', () => {
  const r = wire({ DGO_VALUES: `FETCH_ALL=${url('FAKE1')}\nDYNAMIC_ACTIONS=${url('FAKE3', '')}\n` }, ['--dry']);
  assert.match(r.stdout, /1 still ends at a bare "sig="/);
  assert.match(r.stdout, /DYNAMIC_ACTIONS/);
});

/* ------------------------------------------------------------------ *
 * 4. DGO_VALUES actually reaches the written config
 * ------------------------------------------------------------------ */

check('one secret carrying the whole values file wires the endpoints', () => {
  clearConfigs();
  const r = wire({ DGO_VALUES: `FETCH_ALL=${url('FAKE1')}\nFETCH_ACTIVITIES=${url('FAKE2')}\n` });
  /* Exit 1 is correct here: it wired, and check:config then objected that the other 23 keys
     are empty. What matters is that it WROTE, and that what it wrote is what was supplied. */
  assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}`);
  assert.equal(wroteAny(), true, 'nothing was written');

  const written = fs.readFileSync(path.join(tmp, 'config/config.local.js'), 'utf8');
  assert.ok(written.includes('FAKE1'), 'the supplied workflow id is not in the config');
  assert.ok(written.includes(SIG), 'the supplied signature is not in the config');
});

check('setup.mjs names DGO_VALUES as the source it read', () => {
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts/setup.mjs'), '--force'], {
    cwd: tmp, encoding: 'utf8',
    env: { ...process.env, DGO_VALUES: `FETCH_ALL=${url('FAKE1')}\n` },
  });
  assert.match(r.stdout, /DGO_VALUES/, 'the source it read is not reported');
});

/* ------------------------------------------------------------------ *
 * 4b. The names the template ACTUALLY writes
 *
 * `npm run values:template` emits PREFIXED keys — DGO_ENDPOINT_* for the eighteen internal
 * and PF_ENDPOINT_* for the seven portal. A first cut of fromBundle() matched bare names
 * only, so a values file produced by this repository's own template reported as "no values
 * found" and wire refused it. The happy path was green throughout, because the test fed it
 * bare keys. These two cases are why that cannot recur.
 * ------------------------------------------------------------------ */

check('prefixed keys, as the template writes them, are recognised', () => {
  const bundle = [
    `DGO_ENDPOINT_FETCH_ALL=${url('FAKE1')}`,
    `DGO_ENDPOINT_FETCH_ACTIVITIES=${url('FAKE2')}`,
    `PF_ENDPOINT_SUBMISSION=${url('FAKE3')}`,
  ].join('\n');
  const r = wire({ DGO_VALUES: bundle }, ['--dry']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}`);
  assert.match(r.stdout, /3 of 26 keys supplied/,
    'prefixed names were not mapped back to their endpoint keys');
});

check('DGO_VALUES_B64 carries the same file, base64-encoded', () => {
  clearConfigs();
  const bundle = `DGO_ENDPOINT_FETCH_ALL=${url('FAKE1')}\nPF_ENDPOINT_SUBMISSION=${url('FAKE3')}\n`;
  const r = wire({ DGO_VALUES_B64: Buffer.from(bundle, 'utf8').toString('base64') }, ['--dry']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /2 of 26 keys supplied/, 'the base64 bundle was not decoded');
});

check('a base64 bundle reaches the written config', () => {
  clearConfigs();
  const bundle = `DGO_ENDPOINT_FETCH_ALL=${url('FAKE7')}\n`;
  const r = wire({ DGO_VALUES_B64: Buffer.from(bundle, 'utf8').toString('base64') });
  assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}`);
  const written = fs.readFileSync(path.join(tmp, 'config/config.local.js'), 'utf8');
  assert.ok(written.includes('FAKE7'), 'the base64-supplied value is not in the config');
});

/* ------------------------------------------------------------------ *
 * 4b-ii. --values <file>: the workstation route, needing no secret at all
 *
 * The hosted path collapsed to one command before the local one did, which left a machine
 * with no Codespaces access — or no Codespaces budget — on the four-command path. These
 * assert the file route reaches the same place.
 * ------------------------------------------------------------------ */

check('--values reads a file and reports it as the source', () => {
  clearConfigs();
  const vf = path.join(tmp, '..', `dgo-file-${process.pid}.txt`);
  fs.writeFileSync(vf, `DGO_ENDPOINT_FETCH_ALL=${url('FAKE5')}\nPF_ENDPOINT_SUBMISSION=${url('FAKE6')}\n`);
  const r = wire({}, ['--values', vf, '--dry']);
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}`);
  assert.match(r.stdout, /2 of 26 keys supplied/);
  assert.match(r.stdout, /--values/, 'the file was not named as the source');
  fs.rmSync(vf, { force: true });
});

check('--values wires the config with no environment variable set', () => {
  clearConfigs();
  const vf = path.join(tmp, '..', `dgo-file2-${process.pid}.txt`);
  fs.writeFileSync(vf, `DGO_ENDPOINT_FETCH_ALL=${url('FAKE8')}\n`);
  const r = wire({}, ['--values', vf]);
  assert.ok(r.status === 0 || r.status === 1, `unexpected exit ${r.status}`);
  const written = fs.readFileSync(path.join(tmp, 'config/config.local.js'), 'utf8');
  assert.ok(written.includes('FAKE8'), 'the file-supplied value is not in the config');
  fs.rmSync(vf, { force: true });
});

check('--values naming a missing file stops rather than wiring nothing', () => {
  clearConfigs();
  const r = wire({}, ['--values', path.join(tmp, '..', 'definitely-not-here.txt')]);
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
  assert.equal(wroteAny(), false, 'it wrote a config after being given a path that does not exist');
});

/* ------------------------------------------------------------------ *
 * 4c. values:secret produces something a secret box cannot mangle
 * ------------------------------------------------------------------ */

check('values:secret emits exactly one line, and no comments', () => {
  const vf = path.join(tmp, '..', `dgo-values-${process.pid}.txt`);
  fs.writeFileSync(vf, [
    '# a comment that must not be encoded',
    '',
    `DGO_ENDPOINT_FETCH_ALL=${url('FAKE1')}`,
    `PF_ENDPOINT_SUBMISSION=${url('FAKE3')}`,
  ].join('\n') + '\n');

  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts/values-secret.mjs'), vf],
    { cwd: tmp, encoding: 'utf8' });
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stderr}`);

  const blob = r.stdout.trim();
  assert.ok(blob.length > 0, 'nothing was printed');
  assert.equal(blob.split('\n').length, 1, 'the blob is not a single line');
  assert.match(blob, /^[A-Za-z0-9+/]+=*$/, 'the blob is not plain base64');

  const decoded = Buffer.from(blob, 'base64').toString('utf8');
  assert.ok(!decoded.includes('#'), 'a comment survived into the secret');
  assert.ok(decoded.includes('DGO_ENDPOINT_FETCH_ALL'), 'a key was dropped');
  assert.ok(decoded.includes('PF_ENDPOINT_SUBMISSION'), 'a portal key was dropped');

  fs.rmSync(vf, { force: true });
});

check('values:secret refuses a values file inside the repository', () => {
  const inside = path.join(tmp, 'dgo-values.txt');
  fs.writeFileSync(inside, `DGO_ENDPOINT_FETCH_ALL=${url('FAKE1')}\n`);
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts/values-secret.mjs'), inside],
    { cwd: tmp, encoding: 'utf8' });
  assert.equal(r.status, 1, 'it encoded a credentials file sitting inside the checkout');
  assert.match(r.stderr, /inside the repository/);
  fs.rmSync(inside, { force: true });
});

/* ------------------------------------------------------------------ *
 * 5. Per-key env vars still work — the single secret did not replace them
 * ------------------------------------------------------------------ */

check('per-key DGO_ENDPOINT_* variables are still honoured', () => {
  clearConfigs();
  const r = wire({ DGO_ENDPOINT_FETCH_ALL: url('FAKE9') }, ['--dry']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /1 of 26 keys supplied/);
  assert.match(r.stdout, /DGO_ENDPOINT_\* environment variables/);
});

/* ------------------------------------------------------------------ *
 * 6. The configs it writes cannot be committed
 * ------------------------------------------------------------------ */

check('both files it writes are git-ignored', () => {
  for (const f of configs) {
    const r = spawnSync('git', ['check-ignore', f], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `${f} is NOT git-ignored — a wired config could be committed`);
  }
});

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n  ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`    ✖ ${f}`);
  console.log('');
  process.exit(1);
}
console.log(`\n  ✅ ${passed}/${passed} assertions hold\n`);
process.exit(0);
