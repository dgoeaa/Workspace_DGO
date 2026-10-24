#!/usr/bin/env node
/**
 * The provisioning reference says what it read. This proves it.
 *
 * `scripts/build-provisioning-reference.mjs --check` proves the pages match a fresh run of the
 * generator. That is a staleness check and it is not the same claim: a generator that quietly
 * summarised, truncated or reformatted a configured value would pass it every time, because the
 * generator agrees with itself.
 *
 * What matters about this reference is the one thing it promises — that every value on a page is
 * the value the package carries, printed as it carries it. So these tests go back to the
 * packages and look for the values in the pages, verbatim: every action's configured `inputs`,
 * every trigger's request schema, every response body. Byte for byte, as an exact block. If the
 * generator ever starts paraphrasing, this is what says so.
 *
 * Run: node tests/provisioning-reference.test.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { walk } from '../scripts/lib/flow-definition-reader.mjs';
import { readPackage, redactDeep } from '../scripts/lib/provisioning-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = 'docs/reference/provisioning';

/* The same directories the generator reads. Held here deliberately rather than imported: if the
   generator drops a source, these tests must fail rather than quietly narrow with it. */
const SOURCE_DIRS = [
  'docs/reference/flow-contracts/deployed',
  'docs/deployment/power-automate-flows',
  'docs/deployment/sharepoint/flows/designer-paste',
  'docs/deployment/internal/flows/designer-paste',
  'docs/deployment/sharepoint/remediation/patched',
  'docs/reference/flow-contracts/recovered',
];

let failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${label}`); return; }
  failed++;
  console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`);
};
const section = (s) => console.log(`\n${s}`);

console.log('\nProvisioning reference');

/* ── the pages ─────────────────────────────────────────────────────────────────────────── */
function mdFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) mdFiles(p, acc);
    else if (p.endsWith('.md')) acc.push(p);
  }
  return acc;
}

section('The reference exists and is addressable');
ok('the output directory is present', existsSync(join(ROOT, OUT)));
if (!existsSync(join(ROOT, OUT))) {
  console.log('\n❌ nothing to check — run: npm run provisioning');
  process.exit(1);
}
const pages = new Map(mdFiles(join(ROOT, OUT)).map((f) => [f, readFileSync(f, 'utf8')]));
ok('every page it wrote is readable', pages.size > 0, `${pages.size} pages`);
for (const f of ['README.md', 'ENDPOINT_REGISTER.md']) {
  ok(`${f} is present`, pages.has(join(ROOT, OUT, f)));
}

/* ── one page per package ──────────────────────────────────────────────────────────────── */
section('Every package is documented, exactly once');
const packages = [];
for (const dir of SOURCE_DIRS) {
  for (const abs of walk(join(ROOT, dir))) {
    const rp = abs.slice(ROOT.length + 1).split('\\').join('/');
    const pkg = readPackage(abs, rp);
    if (pkg) packages.push(pkg);
  }
}
ok('the source directories still hold packages', packages.length > 0, `${packages.length} read`);

const pageFor = new Map();
for (const pkg of packages) {
  const citing = [...pages].filter(([, t]) => t.includes(`| Source package | \`${pkg.file}\` |`));
  ok(`documented exactly once: ${pkg.file}`, citing.length === 1,
    citing.length === 0 ? 'no page cites it' : `${citing.length} pages cite it`);
  if (citing.length === 1) pageFor.set(pkg.file, citing[0][1]);
}

/* ── verbatim fidelity ─────────────────────────────────────────────────────────────────── */
section('Configured values are printed verbatim, not summarised');
const block = (v) => `\`\`\`json\n${JSON.stringify(redactDeep(v), null, 2)}\n\`\`\``;

let inputsTotal = 0;
const inputsMissing = [];
for (const pkg of packages) {
  const text = pageFor.get(pkg.file);
  if (!text) continue;
  for (const a of pkg.actions) {
    if (a.inputs === undefined) continue;
    inputsTotal++;
    if (!text.includes(block(a.inputs))) inputsMissing.push(`${pkg.file} :: ${a.path}`);
  }
}
ok(`every action's configured inputs appear verbatim (${inputsTotal} actions)`,
  inputsMissing.length === 0, inputsMissing.slice(0, 5).join('\n       '));

let schemaTotal = 0;
const schemaMissing = [];
for (const pkg of packages) {
  const text = pageFor.get(pkg.file);
  if (!text || !pkg.trigger?.schema) continue;
  schemaTotal++;
  if (!text.includes(block(pkg.trigger.schema))) schemaMissing.push(pkg.file);
}
ok(`every trigger request schema appears verbatim (${schemaTotal} triggers)`,
  schemaMissing.length === 0, schemaMissing.slice(0, 5).join('\n       '));

let bodyTotal = 0;
const bodyMissing = [];
for (const pkg of packages) {
  const text = pageFor.get(pkg.file);
  if (!text) continue;
  for (const a of pkg.actions.filter((x) => x.type === 'Response')) {
    if (!Object.prototype.hasOwnProperty.call(a.inputs || {}, 'body')) continue;
    bodyTotal++;
    if (!text.includes(block(a.inputs.body))) bodyMissing.push(`${pkg.file} :: ${a.path}`);
  }
}
ok(`every response body appears verbatim (${bodyTotal} responses)`,
  bodyMissing.length === 0, bodyMissing.slice(0, 5).join('\n       '));

/* ── the trigger posture is reported, not defaulted ────────────────────────────────────── */
section('An absent authentication posture is reported as absent');
const postureWrong = [];
for (const pkg of packages) {
  const text = pageFor.get(pkg.file);
  if (!text || !pkg.trigger) continue;
  const declared = pkg.trigger.triggerAuthenticationType;
  const expected = declared === undefined
    ? '| `triggerAuthenticationType` | _absent from the export — no posture is recorded_ |'
    : `| \`triggerAuthenticationType\` | \`${declared}\` |`;
  if (!text.includes(expected)) postureWrong.push(`${pkg.file} — expected ${JSON.stringify(declared)}`);
}
ok('each trigger page states the posture its export carries, or says none is recorded',
  postureWrong.length === 0, postureWrong.slice(0, 5).join('\n       '));

/* ── every endpoint reaches the register ───────────────────────────────────────────────── */
section('Every endpoint on both platforms is in the register');
const registerText = pages.get(join(ROOT, OUT, 'ENDPOINT_REGISTER.md')) || '';
const { EndpointContracts } = await import(new URL('../config/endpoints.config.js', import.meta.url));
const missingKeys = Object.keys(EndpointContracts).filter((k) => !registerText.includes(`\`${k}\``));
ok(`every internal contract key is present (${Object.keys(EndpointContracts).length} keys)`,
  missingKeys.length === 0, missingKeys.join(', '));

const portalIds = JSON.parse(readFileSync(join(ROOT, 'docs/reference/portal-endpoint-workflow-ids.json'), 'utf8'));
const missingPortal = (portalIds.endpoints || []).filter((e) => !registerText.includes(`\`${e.flow}\``));
ok(`every portal endpoint flow is present (${(portalIds.endpoints || []).length} endpoints)`,
  missingPortal.length === 0, missingPortal.map((e) => e.key).join(', '));

/* ── credentials ───────────────────────────────────────────────────────────────────────── */
section('No page carries a bearer credential');
const leaked = [...pages].filter(([, t]) => /sig=[A-Za-z0-9_-]{20,}/.test(t)).map(([f]) => f);
ok('no signed trigger URL appears in the reference', leaked.length === 0, leaked.join('\n       '));

/* ── tables render ─────────────────────────────────────────────────────────────────────── */
section('The pages render');
/* A pipe inside a value ends the cell it sits in, and the values documented here are full of
   them — expressions, header lists, JSON bodies. A row with the wrong number of cells is a
   table that silently loses a column, so every row is counted against its own header. */
function cellCount(s) {
  let i = 0, inCode = false, fence = 0, parts = 1;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '`') {
      let r = 0;
      while (s[i + r] === '`') r++;
      if (!inCode) { inCode = true; fence = r; } else if (r === fence) { inCode = false; fence = 0; }
      i += r; continue;
    }
    if (s[i] === '|' && !inCode) parts++;
    i++;
  }
  return parts;
}
let rows = 0;
const ragged = [];
for (const [f, text] of pages) {
  const lines = text.split('\n');
  let inFence = false, headerCells = null;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (/^```/.test(L)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^\|/.test(L) && /\|\s*$/.test(L)) {
      if (headerCells === null) { headerCells = cellCount(L); continue; }
      if (/^\|[-|]+\|$/.test(L.replace(/\s/g, ''))) continue;
      rows++;
      if (cellCount(L) !== headerCells) ragged.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
    } else headerCells = null;
  }
}
ok(`every table row has the columns its header declares (${rows} rows)`,
  ragged.length === 0, ragged.slice(0, 5).join('\n       '));

let unbalanced = [];
for (const [f, text] of pages) {
  if ((text.match(/^```/gm) || []).length % 2 !== 0) unbalanced.push(f.slice(ROOT.length + 1));
}
ok('every code fence is closed', unbalanced.length === 0, unbalanced.slice(0, 5).join('\n       '));

/* ── and it is current ─────────────────────────────────────────────────────────────────── */
section('The reference is current');
let fresh = true, out = '';
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-provisioning-reference.mjs'), '--check'], { stdio: 'pipe' });
} catch (err) {
  fresh = false;
  out = String(err.stderr || err.stdout || err.message).trim();
}
ok('the pages match a fresh run of the generator', fresh, out);

console.log(failed ? `\n❌ ${failed} failed\n` : '\n✅ all passed\n');
process.exit(failed ? 1 : 0);
