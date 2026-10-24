#!/usr/bin/env node
/**
 * The provisioning console: can it say less than the markdown, and can it still be opened?
 *
 * WHY THIS SUITE EXISTS
 *
 * `docs/folio-Master-Flows-and-Endpoints/provisioning/` is now two renderings of one model: 133 markdown files and an
 * interface over the same facts. Two renderings is a liability with a specific failure mode —
 * they drift, and a reader is told two different things about the same flow. This suite exists
 * to make that impossible to do quietly.
 *
 *   1. PARITY. Every package the model holds must appear in both, with the same action counts,
 *      the same SharePoint rows and the same trigger posture. A console that quietly drops a
 *      flow is worse than one that never had it: the list looks complete.
 *
 *   2. THE FOLDER MUST STILL OPEN. `docs/visual/` documents the constraint and this directory
 *      inherits it — Firefox refuses a file:// subresource above the page's own folder, so a
 *      single `../` in a src or href is the difference between a reference you can copy to a
 *      memory stick and one that renders blank. Nothing catches that by looking at it.
 *
 *   3. THE SWEEP MUST SPARE THE CONSOLE. `build-provisioning-reference.mjs` treats its whole
 *      output directory as generated and deletes anything it did not write — which it did, to
 *      all five console files, the first time it ran after they were added. The exemption is
 *      asserted here, and so is the sweep still working, because an exemption that grows into
 *      a pattern is how the guarantee erodes.
 *
 *   4. NO CREDENTIAL. The data files are generated from packages and committed. Everything in
 *      them has been through the redactor; asserted anyway on the finished files, because
 *      "already redacted" is how the last one got in.
 *
 * Usage:  node tests/provisioning-console.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildProvisioningModel } from '../scripts/lib/provisioning-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'docs/folio-Master-Flows-and-Endpoints/provisioning';
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};

const model = await buildProvisioningModel();

/* The generated data, read the way the browser reads it: a script that assigns one global. */
function loadGlobal(rel, name) {
  const text = raw(rel);
  const at = text.indexOf(`window.${name} = `);
  assert(at !== -1, `${rel} does not assign window.${name}`);
  const json = text.slice(at + `window.${name} = `.length).replace(/;\s*$/, '');
  return JSON.parse(json);
}
const INDEX = loadGlobal(`${DIR}/provisioning-index.js`, 'DGO_PROVISIONING_INDEX');
const DETAIL = loadGlobal(`${DIR}/provisioning-detail.js`, 'DGO_PROVISIONING_DETAIL');
/* The address of a package is its directory AND its slug. `Portal_UPLOAD_ECM_DOCS` is two
   packages that share a slug by design — the deployed flow and the clipboard scope built for
   it — so anything keyed on the slug alone silently holds one of them. That is the bug this
   suite caught on its first run. */
const idOf = (pkg) => `${pkg.part === 'deployed' ? 'flows' : 'packages'}/${pkg.slug}`;

const html = raw(`${DIR}/index.html`);
const js = raw(`${DIR}/console.js`);
const css = raw(`${DIR}/console.css`);

/* ── 1. the console cannot say less than the markdown ─────────────────────────────────── */

console.log('\nThe console cannot say less than the markdown\n');

check('every package the model holds appears in both tiers', () => {
  const ids = model.packages.map(idOf).sort();
  assert.equal(new Set(ids).size, ids.length, 'two packages share a directory and a slug');
  assert.deepEqual(INDEX.index.map((r) => r.id).sort(), ids,
    'the index does not carry exactly the packages the model does');
  assert.deepEqual(Object.keys(DETAIL).sort(), ids,
    'the detail does not carry exactly the packages the model does');
});

check('a slug shared by two packages addresses both, not one of them', () => {
  const bySlug = new Map();
  for (const pkg of model.packages) {
    if (!bySlug.has(pkg.slug)) bySlug.set(pkg.slug, []);
    bySlug.get(pkg.slug).push(pkg);
  }
  const shared = [...bySlug.values()].filter((v) => v.length > 1);
  /* No slug has been shared since the duplicate flows were retired (2026-10-05, registers/flow-retirement.json).
     A package dropped by that is caught by the check above, which compares every tier with the model; this one
     guards the case where two packages come to share a slug again. */
  for (const group of shared) {
    for (const pkg of group) {
      assert.equal(DETAIL[idOf(pkg)].actions.length, pkg.actions.length,
        `${idOf(pkg)} does not carry its own actions — a sibling has overwritten it`);
    }
  }
});

check('every flow in the index has a markdown page on disk', () => {
  for (const r of INDEX.index) {
    assert(exists(r.page), `${r.slug} points at ${r.page}, which is not on disk`);
  }
});

check('action counts agree with the model, flow by flow', () => {
  for (const pkg of model.packages) {
    const row = INDEX.index.find((r) => r.id === idOf(pkg));
    assert.equal(row.actionCount, pkg.actions.length, `${idOf(pkg)}: index says ${row.actionCount}`);
    assert.equal(DETAIL[idOf(pkg)].actions.length, pkg.actions.length, `${idOf(pkg)}: detail says ${DETAIL[idOf(pkg)].actions.length}`);
  }
});

check('trigger posture agrees with the model, flow by flow', () => {
  for (const pkg of model.packages) {
    const row = INDEX.index.find((r) => r.id === idOf(pkg));
    assert.equal(row.method, pkg.trigger?.method ?? null, `${idOf(pkg)}: method`);
    assert.equal(row.auth, pkg.trigger?.triggerAuthenticationType ?? null, `${idOf(pkg)}: auth`);
    assert.equal(row.triggerType, pkg.trigger?.type ?? null, `${idOf(pkg)}: trigger type`);
    assert.equal(row.estate, pkg.estate, `${idOf(pkg)}: estate`);
  }
});

check('the SharePoint rows match what the markdown page prints', () => {
  /* §10 is the section the console nearly lost: its first version read only the api id and
     dropped the resolved-list column the markdown carries. Counted against the page itself. */
  let compared = 0;
  for (const pkg of model.packages) {
    const page = raw(pkg.page);
    const at = page.indexOf('## 10. SharePoint operations');
    if (at === -1) continue;
    const body = page.slice(at, page.indexOf('\n## 11.', at));
    const inMarkdown = body.includes('performs no SharePoint operation')
      ? 0
      : body.split('\n').filter((l) => l.startsWith('| `')).length;
    assert.equal(DETAIL[idOf(pkg)].sharepoint.length, inMarkdown,
      `${idOf(pkg)}: console has ${DETAIL[idOf(pkg)].sharepoint.length} SharePoint rows, the page prints ${inMarkdown}`);
    compared++;
  }
  assert(compared > 50, `only ${compared} pages compared — the section heading may have moved`);
});

check('a resolved list name is carried, so a search can find a flow by the list it writes to', () => {
  const resolved = Object.values(DETAIL).flatMap((d) => d.sharepoint).filter((r) => r.resolved);
  assert(resolved.length > 100, `only ${resolved.length} SharePoint rows resolve to a named list`);
  const haystack = INDEX.index.map((r) => r.q).join(' ');
  assert(haystack.includes('dgo_userdirectory'),
    'the search haystack does not carry list names — searching for a list by name would find nothing');
});

check('the totals the console prints are the model\'s own', () => {
  const t = INDEX.meta.totals;
  assert.equal(t.packages, model.packages.length, 'packages');
  assert.equal(t.actions, model.packages.reduce((n, p) => n + p.actions.length, 0), 'actions');
  assert.equal(t.deployedFlows, model.packages.filter((p) => p.part === 'deployed').length, 'deployed flows');
  /* The register holds the INTERNAL keys. Named as such on the page, because the estate has 25
     and a card reading "20 contract keys" would be read as all of them. */
  assert.equal(t.internalContractKeys, (model.register.contractKeys || []).length, 'internal contract keys');
  assert(!('contractKeys' in t), 'a bare `contractKeys` total is ambiguous — name the surface');
});

/* ── 2. the folder still opens from a memory stick ────────────────────────────────────── */

console.log('\nThe folder still opens from a file path\n');

check('all five console files are present', () => {
  for (const f of ['index.html', 'console.css', 'console.js', 'provisioning-index.js', 'provisioning-detail.js']) {
    assert(exists(`${DIR}/${f}`), `${f} is missing`);
  }
});

check('nothing reaches above this folder, and nothing reaches the network', () => {
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  for (const r of refs) {
    if (r.startsWith('#') || r.startsWith('data:')) continue;
    assert(!r.startsWith('../') && !r.includes('/../'),
      `index.html references ${r} — Firefox refuses a file:// subresource above the page's folder`);
    assert(!/^https?:|^\/\//.test(r), `index.html loads ${r} from the network`);
  }
  /* The script that injects tier two is the one reference not in the markup. */
  const injected = [...js.matchAll(/\.src\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  for (const r of injected) {
    assert(!r.startsWith('../') && !/^https?:/.test(r), `console.js injects ${r}`);
  }
  assert(injected.includes('provisioning-detail.js'), 'console.js does not inject the detail tier');
  for (const [label, text] of [['console.js', js], ['console.css', css]]) {
    assert(!/https?:\/\/(?!schema\.management|nitdanigeria|www\.w3\.org)/.test(text),
      `${label} references a network origin`);
  }
});

check('tier one is small enough to load in the head, and tier two is split out', () => {
  const idx = fs.statSync(path.join(ROOT, `${DIR}/provisioning-index.js`)).size;
  const det = fs.statSync(path.join(ROOT, `${DIR}/provisioning-detail.js`)).size;
  assert(idx < 1_500_000, `the index tier is ${(idx / 1024 / 1024).toFixed(1)} MB — it blocks first paint`);
  assert(det > idx, 'the detail tier is not the larger of the two — the split has inverted');
  assert(html.includes('provisioning-index.js'), 'index.html does not load the index tier');
  assert(!html.includes('provisioning-detail.js'),
    'index.html loads the detail tier in the markup — it must be injected after first paint');
});

check('the page works, and says what to do, without scripting', () => {
  assert(html.includes('<noscript>'), 'no noscript fallback');
  const at = html.indexOf('<noscript>');
  const block = html.slice(at, html.indexOf('</noscript>'));
  assert(block.includes('README.md'), 'the fallback does not point at the markdown index');
});

/* ── 3. every section the outline offers is a section the page renders ────────────────── */

console.log('\nThe outline cannot offer a section the page does not render\n');

check('every id the outline navigates to is rendered by console.js', () => {
  const outline = js.match(/var SECTIONS = \[([\s\S]*?)\];/);
  assert(outline, 'SECTIONS is not declared where this test expects it');
  const ids = [...outline[1].matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
  assert.equal(ids.length, 13, `the outline offers ${ids.length} sections; a flow page has 13`);
  for (const id of ids) {
    assert(new RegExp(`section\\(\\d+, '[^']+', '${id}'\\)`).test(js),
      `the outline links to #${id}, which console.js never renders`);
  }
});

check('the section numbering matches the markdown\'s', () => {
  /* A reader moves between the two. "§10" meaning different things in each is the cheapest
     possible way to make them disagree. */
  const pairs = [...js.matchAll(/section\((\d+), '([^']+)', '([a-z]+)'\)/g)].map((m) => [Number(m[1]), m[2]]);
  const sample = raw(model.packages.find((p) => p.part === 'deployed' && p.actions.length > 40).page);
  for (const [num, title] of pairs) {
    const head = new RegExp(`^## ${num}\\. ${title.split(' —')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    assert(head.test(sample), `console section ${num} "${title}" has no matching "## ${num}." in the markdown`);
  }
});

/* ── 4. the sweep spares the console, and still sweeps ────────────────────────────────── */

console.log('\nThe generator sweeps its directory without deleting the console\n');

check('the markdown generator names the console files as its one exception', () => {
  const gen = raw('scripts/build-provisioning-reference.mjs');
  const block = gen.match(/const CONSOLE_FILES = new Set\(\[([\s\S]*?)\]\);/);
  assert(block, 'build-provisioning-reference.mjs has no CONSOLE_FILES exemption — its sweep '
    + 'treats the whole output directory as generated and will delete the console, as it did once');
  for (const f of ['index.html', 'console.css', 'console.js', 'provisioning-index.js', 'provisioning-detail.js']) {
    assert(block[1].includes(f), `the exemption does not name ${f}`);
  }
  assert(/!CONSOLE_FILES\.has\(f\)/.test(gen), 'the exemption is declared but the sweep does not consult it');
  /* Named, not patterned: a stray file in this directory must still be swept. */
  assert(!/\.endsWith\(['"]\.js['"]\)/.test(block.input.slice(block.index, block.index + 800)),
    'the exemption is matched by extension, which would spare any stray file dropped here');
});

check('the markdown index links the console', () => {
  const readme = raw(`${DIR}/README.md`);
  assert(readme.includes('(index.html)'), 'README.md does not link the console — nobody will find it');
});

/* ── 5. no credential ─────────────────────────────────────────────────────────────────── */

console.log('\nNo credential reaches a generated file\n');

check('neither data file carries a signature', () => {
  for (const f of ['provisioning-index.js', 'provisioning-detail.js']) {
    assert(!/sig=[A-Za-z0-9_-]{20,}/.test(raw(`${DIR}/${f}`)), `${f} carries a signature`);
  }
});

check('the generator refuses to write one', () => {
  const gen = raw('scripts/build-provisioning-console.mjs');
  assert(/SIG\s*=\s*\/sig=/.test(gen), 'the generator does not check its own output for a signature');
  assert(/Refusing to write it/.test(gen), 'the generator detects a signature without refusing to write');
});

/* ── 6. selective export ──────────────────────────────────────────────────────────────
 *
 * `--only=` narrows an export to one flow, several, or a category. Two properties make that
 * safe rather than dangerous, and neither is visible by looking at the output:
 *
 *   · A NARROWED RUN MUST NOT TOUCH THE COMMITTED DATA. docs/folio-Master-Flows-and-Endpoints/provisioning/ is the
 *     whole estate by definition. A --only run that wrote there would leave the console
 *     showing one flow while still calling itself the reference.
 *   · A PARTIAL EXPORT MUST DESCRIBE ITSELF. Every count has to be over the selection, and the
 *     file has to say it is partial. A two-flow export whose header reads "77 deployed flows"
 *     is a document that misdescribes itself to whoever it was mailed to.
 */

console.log('\nSelective export\n');

const runGen = (args) => spawnSync(process.execPath,
  [path.join(ROOT, 'scripts/build-provisioning-console.mjs'), ...args],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DGO_STANDALONE_OUT: path.join(ROOT, 'dist-console/__test.html') } });

check('a narrowed run never writes the committed data', () => {
  const before = ['provisioning-index.js', 'provisioning-detail.js']
    .map((f) => fs.statSync(path.join(ROOT, DIR, f)).mtimeMs + ':' + fs.statSync(path.join(ROOT, DIR, f)).size);
  const r = runGen(['--standalone', '--only=flows/ip-scan-intake']);
  assert.equal(r.status, 0, `the narrowed run failed:\n${r.stderr}`);
  const after = ['provisioning-index.js', 'provisioning-detail.js']
    .map((f) => fs.statSync(path.join(ROOT, DIR, f)).mtimeMs + ':' + fs.statSync(path.join(ROOT, DIR, f)).size);
  assert.deepEqual(after, before,
    'a --only run rewrote the committed data. The committed console would then show a subset '
    + 'of the estate while still presenting itself as the whole reference.');
});

check('a narrowed export carries only what was asked for, and counts only that', () => {
  const r = runGen(['--standalone', '--only=flows/ip-scan-intake']);
  assert.equal(r.status, 0, r.stderr);
  const one = fs.readFileSync(path.join(ROOT, 'dist-console/__test.html'), 'utf8');
  const at = one.indexOf('window.DGO_PROVISIONING_INDEX = ');
  const json = JSON.parse(one.slice(at + 'window.DGO_PROVISIONING_INDEX = '.length, one.indexOf('</script>', at)).replace(/;\s*$/, ''));
  assert.equal(json.index.length, 1, `the export carries ${json.index.length} packages, not 1`);
  assert.equal(json.index[0].id, 'flows/ip-scan-intake', 'the wrong package was selected');
  assert.equal(json.meta.totals.packages, 1, 'totals.packages describes the estate, not the export');
  assert.equal(json.meta.selection.complete, false, 'a narrowed export claims to be complete');
  assert.equal(json.meta.selection.estateTotal, INDEX.index.length, 'the export misstates the estate size');
  assert.deepEqual(json.meta.selection.terms, ['flows/ip-scan-intake'], 'the selection is not recorded');
});

check('the page announces a partial export, and says so from the data', () => {
  assert(html.includes('id="partial"'), 'index.html has no partial-export band');
  assert(/SEL\.complete/.test(js), 'console.js does not consult meta.selection');
  assert(/data-partial/.test(js) && /data-partial/.test(css),
    'the band is never switched on, or has no style to switch');
  /* And the full export must NOT claim to be partial. */
  assert.equal(INDEX.meta.selection.complete, true,
    'the committed data declares itself a partial export');
});

check('a selector that matches nothing fails the build', () => {
  const r = runGen(['--standalone', '--only=NoSuchFlowAnywhere']);
  assert.notEqual(r.status, 0, 'an unmatched selector produced an export anyway — it would be '
    + 'silently empty, and an empty export is indistinguishable from a correct one once mailed');
  assert(/matched nothing/.test(r.stderr), `the refusal does not say what went wrong:\n${r.stderr}`);
});

check('--only refuses the flag combinations that would corrupt or mislead', () => {
  const withCheck = runGen(['--check', '--only=portal']);
  assert.notEqual(withCheck.status, 0, '--only with --check was accepted');
  assert(/contradictory/.test(withCheck.stderr), '--check refusal does not explain itself');

  const noStandalone = runGen(['--only=portal']);
  assert.notEqual(noStandalone.status, 0, '--only without --standalone was accepted');
  assert(/--standalone/.test(noStandalone.stderr), 'the refusal does not name the missing flag');
});

check('one, several, and a whole category are the same operation', () => {
  for (const [term, atLeast] of [['SUBMISSION', 1], ['SUBMISSION,UPLOAD,STATUS', 3], ['portal', 10], ['cg-*', 5]]) {
    const r = runGen(['--standalone', `--only=${term}`]);
    assert.equal(r.status, 0, `--only=${term} failed:\n${r.stderr}`);
    const m = /(\d+) of \d+ packages/.exec(r.stdout);
    assert(m, `--only=${term} reported no count:\n${r.stdout}`);
    assert(Number(m[1]) >= atLeast, `--only=${term} selected ${m[1]}, expected at least ${atLeast}`);
    assert(Number(m[1]) < INDEX.index.length, `--only=${term} selected everything — it is not narrowing`);
  }
});

check('a portal endpoint key selects, not just an internal contract key', () => {
  /* The internal register names 20 keys; the seven portal endpoints are named elsewhere. A
     matcher that saw only the first refused `--only=SUBMISSION` for a flow that plainly
     serves SUBMISSION — which is how this was found. */
  const r = runGen(['--standalone', '--only=SUBMISSION']);
  assert.equal(r.status, 0, `--only=SUBMISSION was refused:\n${r.stderr}`);
  assert(/[1-9]\d* of \d+ packages/.test(r.stdout), 'a portal key selected nothing');
});

fs.rmSync(path.join(ROOT, 'dist-console/__test.html'), { force: true });

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
