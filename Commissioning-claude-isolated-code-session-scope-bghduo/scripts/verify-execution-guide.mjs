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
 *   4. every package on disk is described in Appendix A
 *
 * Usage:
 *   node scripts/verify-execution-guide.mjs
 *   node scripts/verify-execution-guide.mjs --strict
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GUIDE = 'docs/deployment/EXECUTION_GUIDE.md';
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
for (const m of guide.matchAll(/`((?:sharepoint|internal)\/flows\/designer-paste\/[A-Za-z0-9_.-]+)`/g)) paths.add('docs/deployment/' + m[1]);
for (const p of paths) {
  if (CREATED_BY_OPERATOR.has(p)) continue;
  if (!existsSync(join(ROOT, p))) fail(`names \`${p}\`, which does not exist`);
}
console.log(`  ✅ ${paths.size - [...paths].filter((p) => CREATED_BY_OPERATOR.has(p)).length} repository path(s) all exist, ${CREATED_BY_OPERATOR.size} created by the operator`);

/* 2. action counts */
const DIRS = ['docs/deployment/sharepoint/flows/designer-paste/', 'docs/deployment/internal/flows/designer-paste/'];
const counts = new Map();
for (const d of DIRS) {
  for (const f of readdirSync(join(ROOT, d)).filter((x) => x.endsWith('.json'))) {
    counts.set(f.replace('.designer-paste.json', ''), walk(read(d + f).serializedValue).length);
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
const spec = read('docs/deployment/sharepoint/portal-field-spec.json');
const evidence = read('docs/deployment/internal/internal-field-evidence.json');
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

/* 4. every package is described.
   A variables package is covered by the PATTERN the guide states — `<FLOW>.variables.designer-
   paste.json`, with the four-step drag-out procedure that governs all of them — rather than by
   fourteen individual mentions. Naming each one would be noise a reader skips, which is a worse
   outcome than the rule it satisfies. The pattern must actually be stated, though: if that
   sentence is ever removed, every variables package is unmentioned again and this fails. */
const VARIABLES_PATTERN = '<FLOW>.variables.designer-paste.json';
const patternStated = guide.includes(VARIABLES_PATTERN);

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
let describedByPattern = 0;
for (const name of counts.keys()) {
  if (appendixA.includes(name)) continue;
  if (name.endsWith('.variables') && patternStated) { describedByPattern++; continue; }
  fail(`package ${name} exists but Appendix A never names it`
    + (name.endsWith('.variables') ? ` (and the guide no longer states the ${VARIABLES_PATTERN} pattern)` : ''));
}
console.log(`  ✅ all ${counts.size} package(s) are named in Appendix A`
  + (describedByPattern ? ` (${describedByPattern} by the ${VARIABLES_PATTERN} pattern)` : ''));

console.log(`\n  ${failures} failure(s).\n`);
process.exit(strict && failures ? 1 : 0);
