#!/usr/bin/env node
/**
 * docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json agrees with the code it is read from, and with the
 * identification standard it is held to. Checked independently of the generator: each
 * assertion re-reads the source rather than trusting what the generator wrote.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const reg = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json'));
const cat = JSON.parse(read('docs/reference/identification/identifier-catalogue.json'));
const ID = Object.fromEntries(cat.identifiers.map((i) => [i.id, i]));

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✅ ${name}`); };
const keysOf = (platform) => reg.endpoints.filter((e) => e.platform === platform).map((e) => e.key).sort();
const lineOf = (c) => read(c.file).split('\n')[c.line - 1];

console.log('\nFlow requirements — the register against the code\n');

ok('every Portal key the code calls is in the register, and nothing else', () => {
  const called = new Set();
  for (const f of readdirSync(new URL('document-portal/js/', root))) {
    for (const m of read(`document-portal/js/${f}`).matchAll(/endpointUrl\('([A-Z_]+)'\)/g)) called.add(m[1]);
  }
  assert.deepEqual(keysOf('portal'), [...called].sort());
});

ok('every Mailer key in its settings is in the register, and nothing else', () => {
  const declared = [...read('mailer/js/settings.js').matchAll(/'(MAIL_[A-Z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keysOf('mailer'), [...new Set(declared)].sort());
});

ok('every Workspace address and operation in endpoints.config.js is in the register', () => {
  const src = read('config/endpoints.config.js');
  const urls = [...src.slice(src.indexOf('export const EndpointUrls'), src.indexOf('export const DefaultEndpointSettings')).matchAll(/^\s+([A-Z][A-Z0-9_]+):\s+_url\('/gm)].map((m) => m[1]);
  const ops = [...src.slice(src.indexOf('export const EndpointContracts')).matchAll(/^\s+([A-Z][A-Z0-9_]+):\s+Object\.freeze/gm)].map((m) => m[1]);
  assert.deepEqual(keysOf('runtime'), [...new Set([...urls, ...ops])].sort());
});

ok('every citation points at a line that names what it cites', () => {
  for (const e of reg.endpoints) {
    for (const c of [...e.declared, ...e.calledBy]) assert.ok(lineOf(c).includes(e.key), `${e.key}: ${c.file}:${c.line}`);
  }
  for (const f of reg.flows) for (const c of f.requiredBy) assert.ok(lineOf(c).trim(), `${f.name}: ${c.file}:${c.line} is empty`);
});

ok('keys, registry keys and aliases follow the identification standard', () => {
  const ck = new RegExp(ID['ID-11'].pattern), frk = new RegExp(ID['ID-12'].pattern);
  const alias = new RegExp(cat.namingConventions.vaultAlias.pattern);
  for (const e of reg.endpoints.filter((x) => !x.external)) {
    assert.match(e.key, ck);
    assert.ok(cat.contractKeyProcess[e.key], `${e.key} has no process (ID-10)`);
    assert.match(e.vaultAlias, alias);
    if (e.flow?.registryKey) assert.match(e.flow.registryKey, frk);
  }
  for (const f of reg.flows) for (const k of f.registryKeys) assert.match(k, frk);
});

ok('an operation without its own address is never reported as simply served', () => {
  for (const e of reg.endpoints) if (e.flow && e.address !== e.key) assert.notEqual(e.status, 'Served', e.key);
});

ok('no signed address reaches the register', () => {
  assert.doesNotMatch(read('docs/folio-Master-Flows-and-Endpoints/reference/flow-requirements.json'), /[?&]sig=/);
  assert.doesNotMatch(read('docs/folio-Master-Flows-and-Endpoints/reference/FLOW_REQUIREMENTS.md'), /[?&]sig=/);
});

console.log(`\n✅ ${passed} passed, 0 failed\n`);
