#!/usr/bin/env node
/**
 * The three published pages render the registers, and the walkthrough renders the stated order.
 *
 * WHY THIS EXISTS
 *
 * `npm run pages -- --check` proves a page matches what the generator would emit. It cannot prove
 * that what the generator emits is the right thing: a data function that silently produced an empty
 * phase, or dropped half the register, would regenerate cleanly and check green forever.
 *
 * The walkthrough is the page this matters most for. It does not hold an order of its own — it reads
 * the one `HOW-TO-USE-THIS-BUNDLE.md` states, so that a page and the entry document cannot give an
 * operator two different sequences. That property is worth an assertion, because the failure it
 * prevents is silent: a page that looks complete and is missing a phase.
 *
 * Usage:  node tests/artifact-pages.test.mjs
 * Exit:   0 = the pages carry what they claim, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const PAGES = ['commissioning-matrix', 'field-guide', 'walkthrough']
  .map((id) => ({ id, target: `docs/deployment/pages/${id}.html`, template: `docs/deployment/pages/${id}.template.html` }));

/** The data a page carries, out of its own <script type="application/json"> block. */
const payload = (rel) => {
  const html = read(rel);
  const m = html.match(/<script id="[\w-]+" type="application\/json">([\s\S]*?)<\/script>/);
  assert(m, `${rel} carries no JSON payload block`);
  return JSON.parse(m[1].replace(/<\\\//g, '</'));
};

console.log('\nPublished pages — they carry what they claim\n');

for (const p of PAGES) {
  check(`${p.id} — the template and the built page are both in the branch`, () => {
    for (const rel of [p.template, p.target]) {
      assert(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing — the page would exist only on a host`);
    }
    assert(!read(p.target).includes('__DATA__'), `${p.target} still carries the __DATA__ token: nothing was injected`);
  });
}

check('every page names itself in a title, so a tab and a gallery card are readable', () => {
  for (const p of PAGES) {
    const t = read(p.target).match(/<title>([^<]+)<\/title>/);
    assert(t && t[1].trim().length > 2, `${p.target} has no usable <title>`);
  }
});

check('every page defines its palette on bare :root and in both dark blocks', () => {
  for (const p of PAGES) {
    const css = read(p.target);
    assert(/:root\{/.test(css), `${p.id}: no bare :root palette — a viewer on the system default would get nothing`);
    assert(/@media \(prefers-color-scheme: dark\)/.test(css), `${p.id}: no prefers-color-scheme block`);
    assert(/:root\[data-theme="dark"\]/.test(css), `${p.id}: an explicit dark choice would not win`);
  }
});

check('the walkthrough is self-contained, and the generator still says so', () => {
  const gen = read('scripts/build-artifact-pages.mjs');
  const entry = gen.slice(gen.indexOf("id: 'walkthrough'"));
  assert(/selfContained:\s*true/.test(entry.slice(0, 2000)),
    'the walkthrough is no longer declared self-contained — it ships inside the export and is opened '
    + 'from a file path, possibly with no route out of the network');
  const loaders = [...read('docs/deployment/pages/walkthrough.html').matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/gi)];
  assert(!loaders.length, `it loads ${loaders.length} thing(s) from the network: ${loaders.map((m) => m[1]).join(', ')}`);
});

check('the walkthrough carries the phases the entry document states, in that order', () => {
  const guide = read('docs/deployment/HOW-TO-USE-THIS-BUNDLE.md');
  const diagram = guide.split('\n## 1.')[1]?.split('```')[1];
  assert(diagram, 'the entry document no longer carries a §1 order diagram');
  const stated = [...diagram.matchAll(/[├└]── ([A-E])\./g)].map((m) => m[1]);
  assert(stated.length >= 5, `only ${stated.length} phases parsed from the entry document`);

  const page = payload('docs/deployment/pages/walkthrough.html');
  const carried = page.phases.map((x) => x.id);
  assert(carried[0] === '0', `the page's first phase is "${carried[0]}" — arrival must come before A`);
  assert(carried.slice(1).join('') === stated.join(''),
    `the page walks ${carried.slice(1).join('')} and the entry document states ${stated.join('')}. `
    + 'Two sequences for one operator is the failure this page exists to prevent.');
});

check('no phase of the walkthrough is empty', () => {
  const page = payload('docs/deployment/pages/walkthrough.html');
  for (const ph of page.phases) {
    const n = ph.kind === 'register'
      ? ph.tracks.reduce((a, t) => a + t.steps.length, 0)
      : ph.steps.length;
    assert(n > 0, `phase ${ph.id} (${ph.title}) carries no steps — it would render as a heading over nothing`);
  }
});

check('the walkthrough carries every open item, and invents none', () => {
  const page = payload('docs/deployment/pages/walkthrough.html');
  const register = readJson('docs/deployment/EXTERNAL_EXECUTION.json');
  const declared = new Set(register.tracks.flatMap((t) => t.steps.map((s) => s.id)));
  const carried = new Set(page.phases.filter((p) => p.kind === 'register')
    .flatMap((p) => p.tracks.flatMap((t) => t.steps.map((s) => s.id))));

  const missing = [...declared].filter((id) => !carried.has(id));
  const extra = [...carried].filter((id) => !declared.has(id));
  assert(!missing.length, `${missing.length} open item(s) the register declares are not on the page: ${missing.slice(0, 6).join(', ')}`);
  assert(!extra.length, `${extra.length} item(s) on the page are in no register: ${extra.slice(0, 6).join(', ')}`);
  assert(carried.size === register.totals.open,
    `the page carries ${carried.size} items and the register totals ${register.totals.open}`);
});

check('every value that must come back is marked on the page as one', () => {
  const page = payload('docs/deployment/pages/walkthrough.html');
  const register = readJson('docs/deployment/EXTERNAL_EXECUTION.json');
  const declared = register.tracks.flatMap((t) => t.steps.filter((s) => s.carryBack).map((s) => s.id));
  const marked = page.phases.filter((p) => p.kind === 'register')
    .flatMap((p) => p.tracks.flatMap((t) => t.steps.filter((s) => s.carryBack).map((s) => s.id)));
  assert(marked.length === declared.length && declared.every((id) => marked.includes(id)),
    `${declared.length} step(s) produce a value the repository needs and ${marked.length} are marked on the page. `
    + 'A carry-back that is not visible is a value nobody sends.');
});

check('the walkthrough keeps progress in the browser, not in a runtime it may not have', () => {
  const html = read('docs/deployment/pages/walkthrough.html');
  assert(/localStorage/.test(html), 'it no longer persists anything — an operator would lose a day of ticks on a refresh');
  assert(!/window\.claude/.test(html),
    'it reaches for a page runtime. This one is opened from a file path inside an export, where there is none.');
  assert(/try\s*\{[^}]*localStorage/.test(html) || /catch/.test(html),
    'localStorage is accessed without a guard — it throws in a private window and takes the page with it');
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error('Failures:\n');
  for (const f of failures) console.error(`  ✖  ${f}\n`);
  process.exit(1);
}
