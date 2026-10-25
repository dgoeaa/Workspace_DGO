/**
 * The identification kit (docs/folio-Master-Flows-and-Endpoints/packages/identification-kit/), against the rules of
 * IDENTIFICATION_SYSTEM.md §8 and decisions B1, B3, B8, B9 and B10.
 *
 * The rules that matter most are the ones the designer enforces at paste time and the ones that
 * keep identifiers flow-minted: no variables, no Until, no Filter array, IF-MATCH on every MERGE,
 * the Request ID always guid(), and no list addressed by a hard-coded GUID or title.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ALLOWED_TYPES } from '../scripts/lib/identification-kit.mjs';

const root = new URL('../', import.meta.url);
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-kit/';
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const cat = JSON.parse(read('docs/reference/identification/identifier-catalogue.json'));
const pattern = (id) => new RegExp(cat.identifiers.find((i) => i.id === id).pattern);

let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };

const pastes = readdirSync(new URL(DIR, root)).filter((f) => f.endsWith('.designer-paste.json'))
  .map((f) => ({ f, d: JSON.parse(read(DIR + f)) }));

/** Every action at any depth, with the sibling set it lives in. */
function* walk(actions, siblings = actions) {
  for (const [name, a] of Object.entries(actions || {})) {
    yield { name, a, siblings };
    if (a.actions) yield* walk(a.actions);
    if (a.else?.actions) yield* walk(a.else.actions);
  }
}
const all = (d) => [...walk(d.serializedValue.actions)];

ok('nine blocks are packaged, each a scope with its connections bound', () => {
  assert.equal(pastes.length, 9);
  for (const { f, d } of pastes) {
    assert.equal(d.serializedValue.type, 'Scope', f);
    assert.equal(d.isScopeNode, true, f);
    for (const { name, a } of all(d)) {
      if (a.type === 'OpenApiConnection') assert.ok(d.allConnectionData[name], `${f}: ${name} has no connection`);
    }
  }
});

ok('B1: no variables, no Until, no Filter array; only the allowed action types', () => {
  for (const { f, d } of pastes) {
    for (const { name, a } of all(d)) assert.ok(ALLOWED_TYPES.has(a.type), `${f}: ${name} is ${a.type}`);
    const text = JSON.stringify(d);
    assert.ok(!/variables\('/.test(text), `${f} reads a variable`);
  }
});

ok('every run-after names a sibling, and action names are unique within a paste', () => {
  for (const { f, d } of pastes) {
    const names = all(d).map((x) => x.name);
    assert.equal(new Set(names).size, names.length, `${f}: duplicate action names`);
    for (const { name, a, siblings } of all(d)) {
      for (const dep of Object.keys(a.runAfter || {})) assert.ok(siblings[dep], `${f}: ${name} runs after missing ${dep}`);
    }
  }
});

ok('B9: every MERGE carries IF-MATCH taken from the row it just read', () => {
  let merges = 0;
  for (const { f, d } of pastes) {
    for (const { name, a } of all(d)) {
      const h = a.inputs?.parameters?.['parameters/headers'];
      if (h?.['X-HTTP-Method'] === 'MERGE') {
        merges++;
        assert.match(h['IF-MATCH'] || '', /odata\.etag/, `${f}: ${name} has no IF-MATCH`);
      }
    }
  }
  assert.ok(merges >= 8, `only ${merges} guarded writes found`);
});

ok('S8: the Request ID is always guid(), and the client value is only a correlation', () => {
  const head = pastes.find((p) => p.f.startsWith('00-')).d.serializedValue.actions.Compose_Request_Context.inputs;
  assert.equal(head.requestId, '@guid()');
  assert.match(head.clientCorrelationId, /substring\(/);
  for (const { f, d } of pastes) {
    for (const { name, a } of all(d)) {
      if (/EntityKey/.test(name) && a.type === 'Compose') assert.equal(a.inputs, '@guid()', `${f}: ${name}`);
    }
  }
});

ok('no list is addressed by a hard-coded GUID or title, except Flow Configuration', () => {
  for (const { f, d } of pastes) {
    for (const { name, a } of all(d)) {
      const uri = a.inputs?.parameters?.['parameters/uri'];
      if (!uri) continue;
      assert.ok(!/guid'[0-9a-f]{8}-/i.test(uri), `${f}: ${name} hard-codes a list GUID`);
      if (/getbytitle/.test(uri)) assert.match(uri, /getbytitle\('Flow(%20| )Configuration'\)/, `${f}: ${name}`);
    }
  }
});

ok('claims: ten flat attempts with a 1 to 5 s Delay, each after the previous one failed, with the WAT year', () => {
  for (const [file, tag] of [['01-', 'Registry'], ['02-', 'Task'], ['03-', 'File']]) {
    const a = pastes.find((p) => p.f.startsWith(file)).d.serializedValue.actions;
    for (let k = 1; k <= 10; k++) assert.ok(a[`Scope_Claim_${tag}_${k}`], `${tag} attempt ${k}`);
    assert.ok(!a[`Scope_Claim_${tag}_11`], `${tag}: more than 10 attempts`);
    for (let k = 2; k <= 10; k++) {
      assert.deepEqual(Object.values(a[`Scope_Claim_${tag}_${k}`].runAfter)[0], ['Failed', 'TimedOut']);
      assert.equal(a[`Scope_Claim_${tag}_${k}`].actions[`Delay_Claim_${tag}_${k}`].inputs.interval.count, '@rand(1, 6)');
    }
    assert.match(a[`Compose_Claim_${tag}_Year`].inputs, /W\. Central Africa Standard Time/);
    assert.ok(a[`Condition_Claim_${tag}_Failed`], `${tag}: no 503 RETRY_LATER`);
  }
});

ok('the reference the kit formats is the one the catalogue defines (formatNumber 00000)', () => {
  const fmt = (n) => (n < 100000 ? String(n).padStart(5, '0') : String(n)); // formatNumber(n,'00000')
  for (const [prefix, id] of [['NITDA', 'ID-04'], ['TASK', 'ID-05'], ['FILE', 'ID-26']]) {
    for (const n of [1, 11, 99999, 100000, 1234567]) {
      for (const env of ['', 'Z']) assert.match(`${env}${prefix}-2026-${fmt(n)}`, pattern(id));
    }
  }
  const text = pastes.map((p) => JSON.stringify(p.d)).join('');
  assert.ok(text.includes("formatNumber(item(), '00000')"));
});

ok('case references draw from the unambiguous alphabet and redraw on collision', () => {
  const a = pastes.find((p) => p.f.startsWith('04-')).d.serializedValue.actions;
  for (let k = 1; k <= 5; k++) {
    const s = a[`Scope_Case_Case_${k}`];
    assert.ok(s, `attempt ${k}`);
    assert.match(JSON.stringify(s), /ABCDEFGHJKLMNPQRSTUVWXYZ23456789/);
    assert.match(JSON.stringify(s), /CASE_REFERENCE_COLLISION/);
  }
});

ok('B8: the VOID row fills the register\'s required columns', () => {
  const body = pastes.find((p) => p.f.startsWith('06-')).d.serializedValue.actions.Create_Void_Registry.inputs.parameters['parameters/body'];
  assert.equal(typeof body, 'string', 'the VOID body is a setProperty expression, not an object literal');
  for (const c of ['Title', 'ReferenceId', 'Status', 'SenderEmail', 'IdState', 'VoidReason']) assert.ok(body.includes(`, '${c}', `), `missing ${c}`);
  assert.ok(body.includes(", 'Status', 'void')") && body.includes(", 'Title', 'VOID')"), 'owner decision Q2: Title VOID, Status void');
});

ok('every connector call is in designer-paste form: host.connection, no authentication', () => {
  const walk = (a) => Object.values(a || {}).flatMap((x) => [x, ...walk(x.actions), ...walk(x.else && x.else.actions)]);
  for (const p of pastes) {
    for (const a of walk(p.d.serializedValue.actions).filter((x) => x.type === 'OpenApiConnection')) {
      assert.deepEqual(Object.keys(a.inputs.host).sort(), ['apiId', 'connection', 'operationId'], p.f);
      assert.ok(!('authentication' in a.inputs), `${p.f}: authentication in a paste`);
    }
  }
});

ok('every Select map is one expression or an object (the designer refuses text with @{…} in it)', () => {
  const walk = (a) => Object.values(a || {}).flatMap((x) => [x, ...walk(x.actions), ...walk(x.else && x.else.actions)]);
  for (const p of pastes) {
    for (const a of walk(p.d.serializedValue.actions).filter((x) => x.type === 'Select')) {
      const m = a.inputs.select;
      assert.ok(typeof m === 'object' || (m.startsWith('@') && !m.startsWith('@{')), `${p.f}: Select map is text: ${String(m).slice(0, 60)}`);
    }
  }
});

ok('claims: the flat attempts are the only retry (connector retry policy none on every counter call)', () => {
  const walk = (a) => Object.values(a || {}).flatMap((x) => [x, ...walk(x.actions), ...walk(x.else && x.else.actions)]);
  for (const p of pastes.filter((x) => /^0[123]-/.test(x.f))) {
    const calls = walk(p.d.serializedValue.actions).filter((x) => x.type === 'OpenApiConnection');
    assert.equal(calls.length, 30, p.f); // 3 per attempt (read, claim, create) x 10
    for (const a of calls) assert.deepEqual(a.inputs.retryPolicy, { type: 'none' }, p.f);
  }
});

ok('no SharePoint request body is an object literal (proven failure, 3 October 2026)', () => {
  const walk = (a) => Object.values(a || {}).flatMap((x) => [x, ...walk(x.actions), ...walk(x.else && x.else.actions)]);
  for (const p of pastes) {
    for (const a of walk(p.d.serializedValue.actions)) {
      const b = a.inputs && a.inputs.parameters && a.inputs.parameters['parameters/body'];
      if (b === undefined) continue;
      assert.equal(typeof b, 'string', `${p.f}: a body is an object literal`);
      assert.ok(b.startsWith('@setProperty('), `${p.f}: a body is not a setProperty expression: ${b.slice(0, 60)}`);
    }
  }
});

ok('B3 and B10: replay check over 7 days; targets are an Entity Key or an spo: locator only', () => {
  const r = JSON.stringify(pastes.find((p) => p.f.startsWith('07-')).d).replace(/%20/g, ' ');
  assert.match(r, /ClientRequestHash eq/);
  assert.match(r, /addDays\(utcNow\(\), -7\)/);
  const t = JSON.stringify(pastes.find((p) => p.f.startsWith('08-')).d);
  assert.match(t, /'entityKey'/);
  assert.match(t, /'spo:'/);
  assert.match(t, /'unresolved'/);
  assert.ok(!/RefIDD/.test(t));
});

console.log(`identification-kit: ${passed} assertions passed`);
