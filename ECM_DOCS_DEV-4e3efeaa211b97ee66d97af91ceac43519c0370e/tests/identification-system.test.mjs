/**
 * Identification system — docs/reference/identification/.
 *
 * The catalogue is the single source for every identifier's pattern, examples and vocabulary.
 * These assertions are the design's validation: every identifier is unique in kind, every
 * reference a person can type resolves to exactly one kind, no canonical reference can be
 * mistaken for a legacy one, nothing minted at runtime carries personal data, and every
 * vocabulary agrees with the estate it names (endpoints.json, the list register, the
 * category matrix, the organisational units, the platform ids).
 *
 * Data that does not yet conform is not hidden: it must be declared in knownDataDefects with
 * a resolution, and an undeclared defect fails the run.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { CategoryMatrix } from '../config/category-matrix.config.js';
import { OrganizationalUnits } from '../config/organizational-units.config.js';
import { EntryPoints } from '../config/entry-points.config.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const cat = JSON.parse(read('docs/reference/identification/identifier-catalogue.json'));
const spec = read('docs/reference/identification/IDENTIFICATION_SYSTEM.md');

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; } catch (e) { e.message = `${name}: ${e.message}`; throw e; }
};
const re = p => new RegExp(p);
const byId = Object.fromEntries(cat.identifiers.map(i => [i.id, i]));
const types = cat.entityTypes.map(t => t.code);
const ownerIds = new Set(cat.owners.map(o => o.id));
const datasetKeys = new Set(cat.datasets.map(d => d.key));

// ── the catalogue itself ──────────────────────────────────────────────────────────────
ok('identifiers are numbered ID-01.. without gaps, and names are unique', () => {
  cat.identifiers.forEach((i, n) => assert.equal(i.id, `ID-${String(n + 1).padStart(2, '0')}`));
  assert.equal(new Set(cat.identifiers.map(i => i.name)).size, cat.identifiers.length);
  assert.equal(new Set(cat.identifiers.map(i => i.symbol)).size, cat.identifiers.length);
});

ok('every identifier specifies all twelve required attributes', () => {
  const required = ['name', 'purpose', 'appliesTo', 'format', 'components', 'pattern', 'generation',
    'uniqueness', 'permanence', 'validation', 'relationships', 'storage', 'examples', 'lifecycle', 'owner'];
  for (const i of cat.identifiers) {
    for (const k of required) {
      const v = i[k];
      assert.ok(Array.isArray(v) ? v.length : String(v ?? '').trim(), `${i.id} has no ${k}`);
    }
    assert.ok(ownerIds.has(i.owner), `${i.id} owner ${i.owner} is not a declared owner`);
    assert.doesNotThrow(() => re(i.pattern), `${i.id} pattern does not compile`);
    assert.ok(i.pattern.startsWith('^') && i.pattern.endsWith('$'), `${i.id} pattern is not anchored`);
  }
});

ok('every example matches its own pattern and every counter-example does not', () => {
  for (const i of cat.identifiers) {
    for (const e of i.examples) assert.match(e.value, re(i.pattern), `${i.id} example ${e.value}`);
    for (const e of i.invalidExamples || []) {
      assert.ok(e.reason, `${i.id} counter-example ${e.value} has no reason`);
      if (!e.patternValid) {
        assert.doesNotMatch(e.value, re(i.pattern), `${i.id} counter-example ${e.value} matches`);
        continue;
      }
      // Well-formed but unregistered: it must be absent from the vocabulary that governs it.
      const vocab = { 'ID-03': types, 'ID-17': CategoryMatrix.flatMap(r => [r.categoryCode, r.subcategoryCode]) }[i.id];
      assert.ok(vocab, `${i.id} has a pattern-valid counter-example but no vocabulary to check it against`);
      assert.ok(!vocab.includes(e.value), `${i.id} counter-example ${e.value} is registered`);
    }
  }
});

// ── entity model ──────────────────────────────────────────────────────────────────────
ok('entity type codes are unique, three letters, and never a reserved prefix', () => {
  assert.equal(new Set(types).size, types.length);
  for (const t of types) {
    assert.match(t, re(byId['ID-03'].pattern));
    assert.ok(!cat.reservedTypeCodes.includes(t), `${t} is reserved`);
  }
});

ok('the Qualified Key pattern admits exactly the registered entity types', () => {
  const alt = /^\^\(([A-Z|]+)\):/.exec(byId['ID-02'].pattern)[1].split('|');
  assert.deepEqual(alt.slice().sort(), types.slice().sort());
});

ok('every entity type has a home dataset that declares that type, and valid parents', () => {
  for (const t of cat.entityTypes) {
    const home = cat.datasets.find(d => d.key === t.homeDataset);
    assert.ok(home, `${t.code} home ${t.homeDataset} missing`);
    assert.equal(home.entityType, t.code, `${t.homeDataset} does not declare ${t.code}`);
    for (const p of t.parentTypes) assert.ok(types.includes(p), `${t.code} parent ${p}`);
    if (t.humanReference) assert.ok(byId[t.humanReference], `${t.code} reference ${t.humanReference}`);
    assert.ok(!(t.isRoot && t.parentTypes.length), `${t.code} is a root with parents`);
  }
});

ok('each non-event type has exactly one master dataset', () => {
  for (const t of types.filter(x => x !== 'EVT')) {
    const masters = cat.datasets.filter(d => d.entityType === t && d.role === 'master');
    assert.equal(masters.length, 1, `${t} has ${masters.length} master datasets`);
  }
  for (const d of cat.datasets.filter(x => x.entityType === 'EVT')) assert.equal(d.role, 'event-stream');
});

ok('link types join registered entity types', () => {
  assert.equal(new Set(cat.linkTypes.map(l => l.code)).size, cat.linkTypes.length);
  for (const l of cat.linkTypes) for (const t of [...l.from, ...l.to]) assert.ok(types.includes(t), `${l.code}: ${t}`);
});

ok('identity columns name catalogued identifiers', () => {
  for (const c of cat.identityColumns) {
    for (const id of String(c.holds).match(/ID-\d{2}/g) || []) assert.ok(byId[id], `${c.column}: ${id}`);
  }
});

// ── a typed reference resolves to exactly one kind ────────────────────────────────────
const canonical = cat.identifiers.filter(i => i.classifiable && i.id !== 'ID-25').map(i => ({ id: i.id, rx: re(i.pattern) }));
const aliases = cat.aliasKinds.map(a => ({ id: a.kind, rx: re(a.pattern) }));
const overlapAllowed = (a, b) => cat.knownAliasOverlaps.some(o => o.kinds.includes(a) && o.kinds.includes(b));
const kindsOf = v => [...canonical, ...aliases].filter(k => k.rx.test(v)).map(k => k.id);

ok('every canonical example resolves to its own kind only', () => {
  for (const { id } of canonical) {
    for (const e of byId[id].examples) assert.deepEqual(kindsOf(e.value), [id], `${e.value}`);
  }
});

ok('every legacy alias example is an alias, never a canonical reference', () => {
  for (const a of cat.aliasKinds) {
    assert.match(a.kind, re(byId['ID-25'].pattern), `${a.kind} not admitted by ID-25`);
    for (const t of a.of.split('/')) assert.ok(types.includes(t), `${a.kind} resolves to unknown type ${t}`);
    for (const v of a.examples) {
      const k = kindsOf(v);
      assert.ok(k.includes(a.kind), `${v} does not match ${a.kind}`);
      for (const other of k.filter(x => x !== a.kind)) {
        assert.ok(!canonical.some(c => c.id === other), `${v} also matches canonical ${other}`);
        assert.ok(overlapAllowed(a.kind, other), `${v}: ${a.kind} overlaps ${other} undeclared`);
      }
    }
  }
});

ok('canonical registry and task numbers can never take a legacy shape (enumerated)', () => {
  const rr = re(byId['ID-04'].pattern), tr = re(byId['ID-05'].pattern), fr = re(byId['ID-26'].pattern);
  const pad = n => (n < 100000 ? String(n).padStart(5, '0') : String(n));
  for (const y of [2023, 2026, 2099]) {
    for (let n = 1; n <= 1_200_000; n += (n < 2000 ? 1 : 97)) {
      for (const [prefix, rx] of [['NITDA', rr], ['TASK', tr], ['FILE', fr], ['ZNITDA', rr]]) {
        const v = `${prefix}-${y}-${pad(n)}`;
        assert.ok(rx.test(v), `${v} rejected`);
        for (const a of aliases) assert.ok(!a.rx.test(v), `${v} matches alias ${a.id}`);
      }
      // the legacy shapes of the same number are never canonical
      for (const v of [`NITDA-${y}-${n}`, `NITDA-${y}-${String(n).padStart(6, '0')}`, `TASK-${n}`]) {
        if (v === `NITDA-${y}-${pad(n)}`) continue; // from 5 digits up, the unpadded form IS canonical
        assert.ok(!rr.test(v) && !tr.test(v) && !fr.test(v), `${v} accepted as canonical`);
      }
    }
  }
});

ok('case references use only the unambiguous alphabet', () => {
  const rx = re(byId['ID-06'].pattern);
  for (const ch of 'IO01') assert.ok(!rx.test(`CASE-${ch}AAAAA`), ch);
  for (const ch of 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') assert.ok(rx.test(`CASE-${ch.repeat(6)}`), ch);
});

ok('locator kinds are exactly the kinds ID-24 admits, and their examples fit', () => {
  const alt = /^\^\(([A-Z_|]+)\)\$$/.exec(byId['ID-24'].pattern)[1].split('|');
  assert.deepEqual(alt.slice().sort(), cat.locatorKinds.map(l => l.kind).sort());
  const altA = /^\^\(([A-Z_|]+)\)\$$/.exec(byId['ID-25'].pattern)[1].split('|');
  assert.deepEqual(altA.slice().sort(), cat.aliasKinds.map(a => a.kind).sort());
  for (const l of cat.locatorKinds) for (const e of l.examples) assert.match(e.value, re(l.valuePattern), l.kind);
});

// ── no sensitive or mutable content in anything minted ────────────────────────────────
ok('nothing minted at runtime carries an address, phone number or IP', () => {
  for (const i of cat.identifiers.filter(x => x.mintedAtRuntime)) {
    for (const e of i.examples) {
      assert.ok(!/@/.test(e.value), `${i.id} ${e.value} contains @`);
      assert.ok(!/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(e.value), `${i.id} ${e.value} looks like an IP`);
      assert.ok(!e.value.split(/[-:]/).some(seg => /^\+?\d{10,}$/.test(seg)), `${i.id} ${e.value} looks like a phone number`);
    }
  }
});

ok('human references are built only from prefix, year and sequence or random part', () => {
  for (const id of ['ID-04', 'ID-05', 'ID-06', 'ID-26']) {
    const parts = byId[id].components.map(c => c.part);
    for (const p of parts) assert.ok(['NITDA', 'TASK', 'CASE', 'FILE', 'YYYY', 'NNNNN', 'XXXXXX'].includes(p), `${id} part ${p}`);
  }
});

ok('the longest human reference fits its 20-character column', () => {
  const longest = ['ZNITDA-2099-9999999', 'ZTASK-2099-9999999', 'ZCASE-ZZZZZZ', 'ZFILE-2099-9999999'];
  longest.forEach((v, n) => {
    assert.match(v, re(byId[['ID-04', 'ID-05', 'ID-06', 'ID-26'][n]].pattern));
    assert.ok(v.length <= 20, `${v} is ${v.length}`);
  });
});

// ── the vocabularies agree with the estate ────────────────────────────────────────────
ok('every endpoint contract key maps to a declared process', () => {
  const endpoints = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json')).endpoints.map(e => e.key);
  const procs = new Set(cat.processes.map(p => p.code));
  for (const k of endpoints) {
    assert.ok(cat.contractKeyProcess[k], `${k} has no process`);
  }
  for (const [k, p] of Object.entries(cat.contractKeyProcess)) {
    assert.match(k, re(byId['ID-11'].pattern));
    assert.ok(procs.has(p), `${k} → unknown process ${p}`);
  }
  for (const p of procs) assert.match(p, re(byId['ID-10'].pattern));
});

ok('every bound dataset is the list the estate register records, by GUID, title and site', () => {
  const csv = read('docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv').replace(/^﻿/, '').split(/\r?\n/);
  const head = csv[0].split(',');
  const col = n => head.indexOf(n);
  const rows = csv.slice(1).filter(Boolean).map(l => l.split(','));
  const guids = new Set();
  for (const d of cat.datasets) {
    assert.match(d.key, re(byId['ID-14'].pattern));
    if (!d.listGuid) { assert.ok(d.new || /^DGO_HTTPFlow/.test(d.list), `${d.key} unbound`); continue; }
    assert.ok(!guids.has(d.listGuid), `${d.listGuid} bound twice`); guids.add(d.listGuid);
    const r = rows.find(x => x[col('listGuid')] === d.listGuid);
    assert.ok(r, `${d.key}: ${d.listGuid} not in the estate register`);
    assert.equal(r[col('title')], d.list, `${d.key} title`);
    assert.equal(r[col('site')], d.site, `${d.key} site`);
  }
});

ok('Folio platform ids are system codes, unchanged', () => {
  const brand = read('config/brand.config.js');
  for (const s of cat.systems) assert.match(s.code, re(byId['ID-07'].pattern));
  for (const id of cat.systems.filter(s => s.kind === 'folio-platform').map(s => s.code)) {
    assert.ok(new RegExp(`\\b${id}\\b`).test(brand), `${id} not in brand.config.js`);
  }
});

ok('channels cover every D4 entry point', () => {
  for (const c of cat.channels) assert.match(c.code, re(byId['ID-09'].pattern));
  const d4 = new Set(cat.channels.map(c => c.d4));
  for (const e of EntryPoints) assert.ok(d4.has(e.code), `entry point ${e.code} has no channel`);
});

ok('environments give production an empty prefix and everything else Z', () => {
  for (const e of cat.environments) {
    assert.match(e.code, re(byId['ID-08'].pattern));
    assert.equal(e.humanRefPrefix, e.code === 'prd' ? '' : 'Z');
  }
});

// ── existing data: conforms, or the defect is declared with a resolution ──────────────
const declared = new Set(cat.knownDataDefects.map(d => `${d.detect}|${d.value}`));
for (const d of cat.knownDataDefects) assert.ok(d.resolution && ownerIds.has(d.owner), d.id);

ok('every org unit key conforms or is a declared defect, and keys are unique ignoring case', () => {
  const rx = re(byId['ID-16'].pattern);
  const seen = new Set();
  for (const u of OrganizationalUnits) {
    if (!rx.test(u.key)) assert.ok(declared.has(`org-key-pattern|${u.key}`), `undeclared org key ${u.key}`);
    const k = u.key.toLowerCase();
    assert.ok(!seen.has(k), `duplicate org key ${u.key}`); seen.add(k);
  }
});

ok('every classification code conforms or is a declared defect', () => {
  const rx = re(byId['ID-17'].pattern);
  const codes = {};
  for (const r of CategoryMatrix) {
    (codes[r.category] ??= new Set()).add(r.categoryCode);
    for (const c of [r.categoryCode, r.subcategoryCode]) {
      if (c && !rx.test(c)) assert.ok(declared.has(`non-code-value|${c}`), `undeclared code ${c}`);
    }
  }
  for (const [name, set] of Object.entries(codes)) {
    if (set.size > 1) assert.ok(declared.has(`category-multiple-codes|${name}`), `${name} has codes ${[...set]}`);
  }
});

// ── nothing in the code mints an identifier the catalogue has not ruled on ───────────
ok('every identifier minted in browser code is recorded with a decision, and no record is stale', () => {
  const dirs = ['core', 'modules', 'shared', 'document-portal/js', 'config'];
  const rxs = cat.clientMinterPatterns.map(p => new RegExp(p, 'g'));
  const found = new Set();
  const walk = dir => {
    for (const e of readdirSync(new URL(dir + '/', root), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.m?js$/.test(e.name)) {
        const src = read(rel);
        for (const rx of rxs) for (const m of src.matchAll(rx)) found.add(`${rel} :: ${m[0]}`);
      }
    }
  };
  for (const d of dirs) if (existsSync(new URL(d + '/', root))) walk(d);
  const recorded = new Set(cat.clientMinters.map(m => `${m.file} :: ${m.match}`));
  const missing = [...found].filter(x => !recorded.has(x));
  const stale = [...recorded].filter(x => !found.has(x));
  assert.deepEqual(missing, [], `minted in code but not ruled on in clientMinters:\n  ${missing.join('\n  ')}`);
  assert.deepEqual(stale, [], `recorded in clientMinters but no longer in code (remove them):\n  ${stale.join('\n  ')}`);
  for (const m of cat.clientMinters) {
    assert.ok(cat.clientMinterDispositions[m.disposition], `${m.file}: unknown disposition ${m.disposition}`);
    if (m.target !== '-') for (const t of m.target.split('/')) assert.ok(types.includes(t), `${m.file}: unknown target ${t}`);
    assert.ok(m.note && m.note.length > 8, `${m.file} ${m.match}: no reason given`);
  }
});

// ── naming (§17): attributes with one rule each, aligned to the codes they use ─────────
ok('the Mailer\'s endpoint keys are contract keys, each mapped to a process', () => {
  const mail = JSON.parse(read('mailer/flows/flows.catalogue.json')).flows.map(f => f.endpointKey);
  assert.equal(mail.length, 7);
  for (const k of mail) {
    assert.match(k, re(byId['ID-11'].pattern));
    assert.ok(cat.contractKeyProcess[k], `${k} has no process`);
  }
});

ok('flow display names: prefixes name real systems, examples fit, counter-examples do not', () => {
  const f = cat.namingConventions.flowDisplayName;
  const systems = new Set(cat.systems.map(x => x.code));
  const alt = /^\^\(([A-Z_|]+)\)_/.exec(f.pattern)[1].split('|');
  assert.deepEqual(alt.slice().sort(), f.prefixes.map(x => x.prefix).sort(), 'pattern and prefix table disagree');
  for (const x of f.prefixes) if (x.system) assert.ok(systems.has(x.system), `${x.prefix} → unknown system ${x.system}`);
  const fits = v => re(f.pattern).test(v) && v.length <= f.maxLength && !v.split('_').some(w => f.forbiddenWords.includes(w));
  for (const e of f.examples) assert.ok(fits(e.value), `${e.value} should be valid`);
  for (const e of f.invalidExamples) assert.ok(!fits(e.value), `${e.value} should be invalid`);
  // An endpoint flow is <prefix>_<contract key>: the Mailer's seven deployed names already are.
  const mailer = f.prefixes.find(x => x.system === 'mailer').prefix;
  for (const fl of JSON.parse(read('mailer/flows/flows.catalogue.json')).flows) {
    assert.equal(fl.name, `${mailer}_${fl.endpointKey}`);
    assert.ok(fits(fl.name), fl.name);
  }
});

ok('Vault aliases: derived from system code and key, and accepted by the Vault itself', () => {
  const v = cat.namingConventions.vaultAlias;
  const vault = /ALIAS=re\.compile\(r'([^']+)'\)/.exec(read('tools/flow-capsule/app/flowcapsule.py'))[1];
  const systems = new Set(cat.systems.map(x => x.code));
  for (const s of /^\^\(([a-z|]+)\)/.exec(v.pattern)[1].split('|')) assert.ok(systems.has(s), `${s} is not a system code`);
  for (const e of v.examples) { assert.match(e.value, re(v.pattern)); assert.match(e.value, re(vault)); }
  for (const e of v.invalidExamples) assert.doesNotMatch(e.value, re(v.pattern));
  // The Administration Centre derives the same alias the rule does.
  const centre = read('tools/admin-centre/server.py');
  assert.match(centre, /'internal': 'runtime'/, 'the Centre maps its internal scope to the runtime system code');
});

// ── the specification covers the catalogue ────────────────────────────────────────────
ok('the specification documents every identifier, type, link, dataset and defect', () => {
  for (const i of cat.identifiers) {
    assert.ok(spec.includes(`${i.id} `) || spec.includes(`${i.id}:`) || spec.includes(`${i.id}`), `${i.id} missing`);
    assert.ok(spec.includes(i.name), `${i.name} missing`);
  }
  for (const t of types) assert.ok(spec.includes(`\`${t}\``), `type ${t} missing`);
  for (const l of cat.linkTypes) assert.ok(spec.includes(l.code), `link ${l.code} missing`);
  for (const d of cat.datasets) assert.ok(spec.includes(d.key), `dataset ${d.key} missing`);
  for (const d of cat.knownDataDefects) assert.ok(spec.includes(d.id), `defect ${d.id} missing`);
  for (const a of cat.aliasKinds) assert.ok(spec.includes(a.kind), `alias ${a.kind} missing`);
  for (const l of cat.locatorKinds) assert.ok(spec.includes(l.kind), `locator ${l.kind} missing`);
});

console.log(`identification-system: ${passed} assertions passed`);
