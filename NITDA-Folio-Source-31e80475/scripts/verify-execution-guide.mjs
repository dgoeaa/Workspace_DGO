#!/usr/bin/env node
/**
 * Does the execution guide still describe the packages that exist?
 *
 * WHY THIS EXISTS
 * `docs/deployment/EXECUTION_GUIDE.md` is executed by an operator against a live tenant, with no
 * way to tell a stale instruction from a current one. Its action counts drifted by one the moment
 * `Compose_Response_Body` was added to every package — silently, because prose is not built. An
 * operator who counts the pasted actions and finds one more than the guide promises has no way to
 * know whether the package is wrong or the guide is.
 *
 * So every number and path in the guide that restates something the repository already knows is
 * checked against the source of that knowledge:
 *
 *   1. every repository path the guide names exists
 *   2. every action count matches the package
 *   3. every list GUID matches the field spec or the evidence file
 *   4. every package on disk is described by the READMEs Appendix A points at
 *
 * Usage:
 *   node scripts/verify-execution-guide.mjs
 *   node scripts/verify-execution-guide.mjs --strict
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/* The guide is Part 2 of the one runbook now. This reads the GENERATOR INPUT rather than the
   assembled document, for two reasons: a failure then names the file someone would edit, and
   the assembled RUNBOOK.md carries seven other parts whose paths and counts belong to their own
   checks. `scripts/build-runbook.mjs` embeds this file verbatim, so what passes here is what a
   reader sees there.

   It was `docs/deployment/EXECUTION_GUIDE.md` until 2026-09-24. This check went with the
   consolidation and should not have: Part 2 tells an operator how many actions each package
   carries, and for one commit nothing held those numbers to the packages. That is the exact
   drift this file was written for — the counts moved by one when Compose_Response_Body was
   added to every package, silently, because prose is not built. */
const GUIDE = 'scripts/runbook-parts/10-install-route-and-reference.md';
const strict = process.argv.includes('--strict');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

const guide = readFileSync(join(ROOT, GUIDE), 'utf8');

function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.actions && typeof node.actions === 'object') {
    for (const [name, act] of Object.entries(node.actions)) { out.push([name, act]); walk(act, out); }
  }
  for (const k of ['else', 'default']) if (node[k]) walk(node[k], out);
  if (node.cases) for (const c of Object.values(node.cases)) walk(c, out);
  return out;
}

console.log('\nExecution guide — does it describe what exists?\n');

/* 1. paths.
   Two kinds of path appear in the guide: files that must already be in the repository, and
   files the guide instructs the operator to CREATE. The second kind is deliberately absent —
   config.local.js is git-ignored precisely so no trigger URL is ever committed — so it is
   exempt by name rather than by weakening the check for everything. */
const CREATED_BY_OPERATOR = new Set([
  'document-portal/config.local.js',   // §7.2, git-ignored: holds the seven signed trigger URLs
  'config/config.local.js',            // §6.7, git-ignored: the internal platform's own URLs
]);
const paths = new Set();
for (const m of guide.matchAll(/`((?:docs|scripts|config|core|tests|document-portal)\/[A-Za-z0-9_./-]+)`/g)) paths.add(m[1]);
/* The guide once named replacement packages by surface (`portal/flows/designer-paste/…`). Those packages were retired on
   2026-10-06 (registers/flow-retirement.json); a path of that form is now a reference to a retired file and fails. */
for (const m of guide.matchAll(/`((?:sharepoint|portal|internal)\/flows\/designer-paste\/[A-Za-z0-9_.-]+)`/g)) {
  fail(`names \`${m[1]}\`, a replacement package retired on 2026-10-06`);
}
for (const p of paths) {
  if (CREATED_BY_OPERATOR.has(p)) continue;
  if (!existsSync(join(ROOT, p))) fail(`names \`${p}\`, which does not exist`);
}
console.log(`  ✅ ${paths.size - [...paths].filter((p) => CREATED_BY_OPERATOR.has(p)).length} repository path(s) all exist, ${CREATED_BY_OPERATOR.size} created by the operator`);

/* 2. action counts */
/* The packages are the identification packages for the adopted flows (the replacement packages were retired on
   2026-10-06). */
const DIRS = ['docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/', 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/'];
const counts = new Map();
const readmeOf = new Map();
for (const d of DIRS) {
  for (const f of readdirSync(join(ROOT, d)).filter((x) => x.endsWith('.paste.json'))) {
    const name = f.replace('.paste.json', '');
    counts.set(name, walk(read(d + f).serializedValue).length);
    readmeOf.set(name, d + 'README.md');
  }
}
let checked = 0;
for (const [name, n] of counts) {
  /* a table row naming the package, with a number in a later cell */
  for (const m of guide.matchAll(new RegExp(`${name}[^|\\n]*\\|\\s*(\\d+)\\s*\\|`, 'g'))) {
    checked++;
    if (Number(m[1]) !== n) fail(`says ${name} has ${m[1]} actions; it has ${n}`);
  }
}
console.log(`  ✅ ${checked} action count(s) match the packages`);

/* 3. list GUIDs */
const spec = read('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json');
const evidence = read('docs/folio-Master-Flows-and-Endpoints/deployment/internal/internal-field-evidence.json');
const known = new Map();
for (const l of spec.lists) known.set(l.listGuid.toLowerCase(), l.listTitle);
for (const [g, v] of Object.entries(evidence.lists || {})) known.set(g.toLowerCase(), v.title);
let guids = 0;
for (const m of guide.matchAll(/`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`/g)) {
  const g = m[1].toLowerCase();
  /* flow ids are GUIDs too and are not list GUIDs — only check the ones in the list tables */
  const line = guide.slice(guide.lastIndexOf('\n', m.index) + 1, guide.indexOf('\n', m.index));
  if (!/sharepoint\.com\/sites\//.test(line)) continue;
  guids++;
  if (!known.has(g)) fail(`names list GUID ${m[1]}, which is in neither the field spec nor the evidence file`);
}
console.log(`  ✅ ${guids} list GUID(s) resolve`);

/* 4. every package is described. */
/* SCOPED TO APPENDIX A, WHICH IS WHAT THIS CHECK ALWAYS CLAIMED TO DO.
   It searched the whole 106 KB document, so a package mentioned anywhere — in a rationale
   paragraph, a warning, an evidence citation — counted as described. On 2026-09-11 nine flow
   packages were absent from Appendix A and this reported "all packages are described", because
   every one of the nine is named somewhere else in the guide. The appendix meanwhile claimed
   fifteen files ship when there are forty, and named a variable carrier that does not exist.
   A check that verifies the shape of a claim while the claim is false is this estate's most
   expensive recurring defect; scoping it to the section it names is the whole fix. */
const appendixA = (/## Appendix A[\s\S]*?(?=\n## |$)/.exec(guide) || [''])[0];
if (!appendixA) fail('Appendix A is gone; the package inventory has nowhere to live');
/* Appendix A delegates the inventory to the two generated package READMEs. It must link both, and each README must
   name every package in its folder: the check still fails on a package nothing describes. */
for (const d of DIRS) {
  const rel = d.replace('docs/folio-Master-Flows-and-Endpoints/', '') + 'README.md';
  if (!appendixA.includes(rel)) fail(`Appendix A does not point at ${rel}`);
}
const readmes = new Map();
for (const [name, r] of readmeOf) {
  if (!readmes.has(r)) readmes.set(r, readFileSync(join(ROOT, r), 'utf8'));
  if (!readmes.get(r).includes(name) && !readmes.get(r).includes(name + '.paste.json')) fail(`package ${name} exists but ${r} never names it`);
}
console.log(`  ✅ all ${counts.size} package(s) are named in the READMEs Appendix A points at`);

console.log(`\n  ${failures} failure(s).\n`);
process.exit(strict && failures ? 1 : 0);
