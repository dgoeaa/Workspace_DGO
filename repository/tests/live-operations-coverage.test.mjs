#!/usr/bin/env node
/**
 * The live-operations console is gone, and every operation it drove is tracked somewhere else.
 *
 * WHY THIS EXISTS
 *
 * `docs/folio-Master-Flows-and-Endpoints/deployment/live-operations-console/SHA256_MANIFEST.json` declares six files. Four are
 * present and every digest matches. Two are absent — `README.md` and `index.html` — and
 * `index.html` IS the console. Nothing said so. Worse, `OUTSTANDING_SOURCES.json` explained the
 * specification as *"a specification of what exists, not a list of what is outstanding"*, which was
 * false in the one word that mattered.
 *
 * The console was a fifth view of the notification workstream, and three instruments already carry
 * that work. So it is superseded rather than rebuilt, and `coverage.json` declares where each of
 * the fourteen operations went. This holds that declaration to both documents it spans: every
 * OP in the specification is mapped, and every register entry the mapping cites exists.
 *
 * WHAT "CARRIED BY" IS NOT
 *
 * It is not closure. Every one of the fourteen is still outstanding work in the tenant — that is
 * the whole point of the P-items it maps to. A mapping that quietly counted them closed would take
 * a workstream nobody has executed and report it done, which is the failure this estate exists to
 * stop. So this asserts the opposite too: the specification stays UNCOUNTED, because counting these
 * fourteen alongside the P-items would count the same work twice.
 *
 * Usage:  node tests/live-operations-coverage.test.mjs
 * Exit:   0 = the supersession is honest, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'docs/folio-Master-Flows-and-Endpoints/deployment/live-operations-console';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const coverage = readJson(`${DIR}/coverage.json`);
const manifest = readJson(`${DIR}/SHA256_MANIFEST.json`);
const spec = read(coverage.specification);
const declared = readJson('docs/deployment/OUTSTANDING_SOURCES.json');

console.log('\nLive-operations console — superseded, and the supersession is honest\n');

check('every operation in the specification is declared in the coverage file', () => {
  const inSpec = [...spec.matchAll(/^## (OP-\d{3}):\s*(.+)$/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));
  assert(inSpec.length >= 10, `only ${inSpec.length} operations parsed from the specification — the heading shape has changed`);
  const mapped = new Set(coverage.operations.map((o) => o.id));
  const missing = inSpec.filter((o) => !mapped.has(o.id));
  assert(!missing.length,
    `${missing.length} operation(s) the specification states are in no mapping: ${missing.map((o) => o.id).join(', ')}.\n`
    + '      An unmapped operation is work that was tracked by a console nobody has.');
  const invented = coverage.operations.filter((o) => !inSpec.some((s) => s.id === o.id));
  assert(!invented.length, `${invented.length} mapped operation(s) are in no specification: ${invented.map((o) => o.id).join(', ')}`);
});

check('each operation carries the title the specification gives it', () => {
  const titles = Object.fromEntries([...spec.matchAll(/^## (OP-\d{3}):\s*(.+)$/gm)].map((m) => [m[1], m[2].trim()]));
  const wrong = coverage.operations.filter((o) => titles[o.id] !== o.title);
  assert(!wrong.length, wrong.map((o) => `${o.id}: coverage says "${o.title}", the specification says "${titles[o.id]}"`).join('\n       '));
});

check('every register entry the mapping cites actually exists', () => {
  const bodies = Object.fromEntries(Object.entries(coverage.registers).map(([k, rel]) => [k, read(rel)]));
  const dead = [];
  for (const op of coverage.operations) {
    for (const c of op.carriedBy) {
      const body = bodies[c.register];
      assert(body !== undefined, `${op.id} cites register "${c.register}", which coverage.json does not declare`);
      /* The id must appear as a heading, a bolded row or a JSON item id, not merely somewhere in prose. */
      if (!new RegExp(`(^|\\n)#{1,4}\\s*${c.id}\\b|\\*\\*${c.id}\\b|"id":\\s*"${c.id}"`).test(body)) {
        dead.push(`${op.id} → ${c.register} ${c.id} ("${c.title}") is not an entry in ${coverage.registers[c.register]}`);
      }
    }
  }
  assert(!dead.length, `${dead.length} citation(s) name nothing:\n       ${dead.join('\n       ')}`);
});

check('every runbook section the mapping names is a real heading', () => {
  /* Any heading level, not just `##`. The mapping names sections of what was a standalone
     notification runbook; on 2026-09-24 that document became Part 4 of the one runbook, and
     the embedder demotes every heading one level so the parts nest under it rather than
     competing with it. `## §1 · Baseline and connections` is therefore `### §1 · …` now, and
     matching on `##` alone reported all four sections as missing while every one was there. */
  const headings = (read(coverage.runbook).match(/^#{2,5} .+$/gm) || [])
    .map((h) => h.replace(/^#{2,5} /, '').trim());
  const dead = [...new Set(coverage.operations.map((o) => o.runbookSection))].filter((s) => !headings.includes(s));
  assert(!dead.length, `${dead.length} section(s) do not exist in ${coverage.runbook}: ${dead.join(' | ')}`);
});

check('the absent files are declared absent, and the present ones still match their digests', () => {
  const absent = new Set(coverage.consoleIsAbsent.declaredByManifest);
  /* A file the delivered package carried, lost, and since re-created under the same name. It is a
     DIFFERENT document, so it must NOT match the manifest's digest — and saying so is the point.
     Silently letting it match would mean somebody had restored the original, which nobody can. */
  const replaced = new Map((coverage.consoleIsAbsent.replacedInPlace || []).map((r) => [r.file, r]));

  for (const f of manifest.files) {
    const abs = path.join(ROOT, DIR, f.file);
    const there = fs.existsSync(abs);

    if (!there) {
      assert(absent.has(f.file),
        `${f.file} is named by the manifest, is not on disk, and coverage.json does not declare it absent. `
        + 'A file that silently disappears is how the console went missing in the first place.');
      assert(!replaced.has(f.file), `${f.file} is declared replaced in place and is not there`);
      continue;
    }

    const sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

    if (replaced.has(f.file)) {
      assert(absent.has(f.file), `${f.file} is declared replaced in place but not declared lost — one of the two is wrong`);
      assert(sha !== f.sha256,
        `${f.file} matches the digest the manifest records, and coverage.json says the delivered file was lost `
        + 'and this one is a replacement. If the original really is back, remove the replacedInPlace entry.');
      assert((replaced.get(f.file).why || '').length > 40, `${f.file}'s replacedInPlace entry does not say why`);
      continue;
    }

    assert(!absent.has(f.file), `${f.file} is declared absent and is present — the declaration has gone stale`);
    assert(sha === f.sha256, `${f.file} no longer matches the digest the manifest records. It is a record; it is not edited.`);
  }
});

check('the console is still absent, so the supersession still applies', () => {
  assert(!fs.existsSync(path.join(ROOT, DIR, 'index.html')),
    'index.html is present. The console is back, and this supersession is now false — '
    + 'delete coverage.json, restore the source declaration, and gate the console instead.');
});

check('the specification stays uncounted, so the work is not counted twice', () => {
  const src = declared.sources.find((s) => s.path === coverage.specification);
  assert(src, `${coverage.specification} is no longer declared in OUTSTANDING_SOURCES.json`);
  assert(src.counted === false,
    'the specification is counted. Its fourteen operations are already counted as P-items and F-items; '
    + 'counting them here reports the same tenant work twice.');
  assert(!/specification of what exists/i.test(src.notCountedBecause || ''),
    'the reason still says the console is "a specification of what exists". The console does not exist here.');
  assert((src.carriedBy || '').includes('coverage.json'),
    'the source does not point at the coverage file, so a reader of the register cannot find where the work went');
});

check('the directory says, in its own README, what happened to the console', () => {
  const rel = `${DIR}/README.md`;
  assert(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing — the manifest names it and it is where a reader lands first`);
  const t = read(rel);
  for (const [what, re] of [
    ['that index.html is absent', /index\.html/],
    ['that it is not reconstructable', /not reconstructable|cannot be rebuilt|never committed/i],
    ['where the operations went', /coverage\.json/],
    ['that the remaining files are a record', /record/i],
  ]) assert(re.test(t), `the README does not say ${what}`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error('Failures:\n');
  for (const f of failures) console.error(`  ✖  ${f}\n`);
  process.exit(1);
}
