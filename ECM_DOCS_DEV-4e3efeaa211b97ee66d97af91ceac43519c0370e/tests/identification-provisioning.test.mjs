/**
 * Phase 1 provisioning (docs/reference/identification/provisioning/, IDENTIFICATION_SYSTEM.md §13,
 * decisions B2 and B11).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const DIR = 'docs/reference/identification/provisioning/';
const cat = JSON.parse(read('docs/reference/identification/identifier-catalogue.json'));
const plan = JSON.parse(read(DIR + 'identity-provisioning.json'));
const verify = read('scripts/identity-verify.browser.js');
const provision = read('scripts/identity-provision.browser.js');

let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };

ok('every catalogue dataset has a plan, and every new dataset is created', () => {
  assert.deepEqual(plan.lists.map((l) => l.datasetKey).sort(), cat.datasets.map((d) => d.key).sort());
  for (const d of cat.datasets.filter((x) => x.new)) assert.equal(plan.lists.find((l) => l.datasetKey === d.key).create, true, d.key);
});

ok('every governed list gets an Entity Key (persons use their Entra object ID)', () => {
  for (const d of cat.datasets.filter((x) => x.entityType && x.entityType !== 'USR')) {
    const l = plan.lists.find((x) => x.datasetKey === d.key);
    assert.ok(l.addColumns.some((c) => c.name === 'EntityKey'), `${d.key} has no EntityKey`);
  }
});

ok('B2: every column is added optional and non-unique; Phase 6 holds the constraints', () => {
  for (const l of plan.lists) for (const c of l.addColumns) {
    assert.equal(c.required, false, `${l.datasetKey}.${c.name}`);
    assert.equal(c.enforceUnique, false, `${l.datasetKey}.${c.name}`);
  }
  assert.ok(plan.lists.some((l) => l.phase6.some((p) => p.name === 'EntityKey' && p.enforceUnique)));
});

ok('the human reference columns exist where the catalogue says they live', () => {
  for (const d of cat.datasets.filter((x) => x.humanRefColumn)) {
    const l = plan.lists.find((x) => x.datasetKey === d.key);
    const existing = ['ReferenceId', 'UnitKey'].includes(d.humanRefColumn) && !d.new;
    assert.ok(existing || l.addColumns.some((c) => c.name === d.humanRefColumn), `${d.key} lacks ${d.humanRefColumn}`);
  }
});

ok('Flow Configuration gets ENVIRONMENT_CODE and a site and list row for every dataset', () => {
  const t = plan.flowConfiguration.rows.map((r) => r.Title);
  assert.ok(t.includes('ENVIRONMENT_CODE'));
  for (const d of cat.datasets) for (const k of ['SITE_URL', 'LIST_ID']) assert.ok(t.includes(`DATASET_${d.key}_${k}`), `${d.key} ${k}`);
});

ok('B11: the verifier only reads', () => {
  assert.ok(!/method:\s*'(POST|PATCH|PUT|DELETE|MERGE)'/.test(verify), 'the verifier writes');
  assert.ok(!/X-HTTP-Method/.test(verify), 'the verifier writes');
  assert.match(verify, /freeIndexSlots/);
  assert.match(verify, /required/);
});

ok('the provisioner is a dry run unless told otherwise, and deletes only its own probe list', () => {
  assert.match(provision, /async function run\(\{ apply = false \} = \{\}\)/);
  const deletes = provision.match(/'DELETE'/g) || [];
  assert.equal(deletes.length, 1, 'more than one DELETE');
  const probe = provision.slice(provision.indexOf('async function probeUniqueBlanks'));
  assert.ok(probe.includes("'DELETE'"), 'the DELETE is outside the probe');
  assert.match(probe, /ZZ_IdentityProbe_/);
});

console.log(`identification-provisioning: ${passed} assertions passed`);
