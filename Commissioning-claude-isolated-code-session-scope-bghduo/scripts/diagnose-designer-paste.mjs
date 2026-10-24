#!/usr/bin/env node
/**
 * What did the designer do to this scope when it was pasted?
 *
 * WHY THIS EXISTS
 * The packages in `docs/deployment/*​/flows/designer-paste/` are correct when they leave this
 * repo — `npm run test:designerpaste` proves it. What is not proven is what survives the paste,
 * because the modern designer rewrites what it cannot resolve and reports none of it. Two
 * rewrites cost a deployment visit each:
 *
 *   1. EVERY `Set variable` LOSES ITS VALUE. The Set variable action types its Value field from
 *      the declared type of the variable named in it. Paste a scope into a flow that has no
 *      matching `Initialize variable` at the top level and the name resolves to nothing, the
 *      value has no type to be edited as, and the designer drops it — `inputs` keeps `name` and
 *      nothing else. Nothing is flagged: the actions render with an empty Value box. The run
 *      then answers with `varStatusCode` still at its initial 500 and `varData` still `{}`, or
 *      fails outright with `The variable 'varStatusCode' is not defined`. `Append to array
 *      variable` is untyped and keeps its value, which is why a corrupted paste looks partly
 *      intact.
 *
 *   2. THE SCOPE IS ANCHORED TO ITS NEW NEIGHBOUR. A package always ships `runAfter: {}` — it is
 *      a root. After a paste the designer writes in the action it landed under. That name says
 *      which flow it was pasted into, and a name belonging to another flow's variable set
 *      (`Initialize_variable_varBulkResults` is DGO_BULK_ASSIGNMENT's alone) says the scope went
 *      into the wrong flow — where its shared action names collide with the ones already there
 *      and its Response competes with the Response already in the definition.
 *
 * So: copy the scope back out of the designer, save it to a file, and run this against it. It
 * says what the designer changed, measured against the package the repo shipped.
 *
 * Usage:
 *   node scripts/diagnose-designer-paste.mjs <copied.json>
 *   node scripts/diagnose-designer-paste.mjs <copied.json> --package DGO_FETCH_ALL
 *   node scripts/diagnose-designer-paste.mjs <copied.json> --fix repaired.json
 *
 * Exits 1 when the definition differs from the package it was cut from.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRS = [
  'docs/deployment/sharepoint/flows/designer-paste/',
  'docs/deployment/internal/flows/designer-paste/',
];

const argv = process.argv.slice(2);
const OPTIONS = ['--package', '--fix'];
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };
const input = argv.find((a, i) => !a.startsWith('--') && !OPTIONS.includes(argv[i - 1]));

if (!input) {
  console.error('usage: node scripts/diagnose-designer-paste.mjs <copied.json> [--package <NAME>] [--fix <out.json>]');
  process.exit(2);
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/* Every package this repo ships, by flow name, each with the variable declarations that belong
   to it. The corrupted definition is measured against these rather than against a schema: the
   question is not "is this shape legal" — the designer only ever emits legal shapes — but "what
   is different from what we handed over". */
const packages = new Map();
for (const dir of DIRS) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) continue;
  for (const f of readdirSync(full).filter((f) => f.endsWith('.designer-paste.json') && !f.endsWith('.variables.designer-paste.json'))) {
    const flow = f.replace('.designer-paste.json', '');
    const varsPath = join(full, `${flow}.variables.designer-paste.json`);
    packages.set(flow, {
      path: dir + f,
      pkg: readJson(join(full, f)),
      declares: existsSync(varsPath) ? new Set(Object.keys(readJson(varsPath).serializedValue?.actions || {})) : new Set(),
    });
  }
}

/** Walk every action in a scope, yielding [name, action]. */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.actions && typeof node.actions === 'object') {
    for (const [name, act] of Object.entries(node.actions)) { visit(name, act); walk(act, visit); }
  }
  if (node.else) walk(node.else, visit);
  if (node.cases) for (const c of Object.values(node.cases)) walk(c, visit);
  if (node.default) walk(node.default, visit);
}

const actionsOf = (scope) => { const out = new Map(); walk(scope, (n, a) => out.set(n, a)); return out; };

const supplied = readJson(resolve(input));
/* Accept the clipboard envelope the designer produces and a bare scope alike — an operator who
   copies out of the "Peek code" pane has the second, not the first. */
const suppliedScope = supplied.serializedValue ?? supplied;
const suppliedActions = actionsOf(suppliedScope);

/* Which package is this? The nodeId is the designer's own name for the scope and survives a
   paste, so it identifies the package outright. Where it has been renamed, the action names do:
   the package sharing the most of them is the one this was cut from. */
function identify() {
  const named = flag('--package');
  if (named) {
    if (!packages.has(named)) { console.error(`no package named ${named} — known: ${[...packages.keys()].join(', ')}`); process.exit(2); }
    return named;
  }
  for (const [name, { pkg }] of packages) if (pkg.nodeId === supplied.nodeId) return name;
  let best = null; let bestScore = 0;
  for (const [name, { pkg }] of packages) {
    const theirs = actionsOf(pkg.serializedValue);
    const score = [...suppliedActions.keys()].filter((k) => theirs.has(k)).length;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  if (!best || bestScore < 3) { console.error('cannot tell which package this came from — name it with --package'); process.exit(2); }
  return best;
}

const flow = identify();
const { path: canonPath, pkg: canon } = packages.get(flow);
const canonActions = actionsOf(canon.serializedValue);

console.log(`\nPasted definition vs ${canonPath}\n`);

const findings = [];
const report = (headline, detail) => {
  findings.push(headline);
  console.log(`  ✗ ${headline}`);
  for (const d of detail) console.log(`      ${d}`);
  console.log('');
};

/* 1. VARIABLE WRITES THE DESIGNER EMPTIED.
      `value` is not optional on any of these action types. Logic Apps rejects a Set variable
      without one at save time; the designer only holds such an action because it has not been
      saved yet. */
const WRITES = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);
const emptied = [];
for (const [name, act] of suppliedActions) {
  if (!WRITES.has(act?.type) || act?.inputs?.value !== undefined) continue;
  emptied.push({ name, variable: act?.inputs?.name, original: canonActions.get(name)?.inputs?.value });
}
if (emptied.length) {
  report(`${emptied.length} variable writes lost their value`, [
    'Cause: the flow had no top-level Initialize variable for these when the scope was pasted.',
    `Fix: create the declarations listed in ${canonPath.replace('.designer-paste.json', '.variables.md')} FIRST, then paste the scope again.`,
    '',
    ...emptied.map(({ name, variable, original }) => `${name} — sets ${variable}, should be ${original === undefined ? '(absent from the package too)' : JSON.stringify(original)}`),
  ]);
}

/* 2. WHERE THE SCOPE LANDED.
      A package is a root. An anchor names the action it was dropped under, and a declaration
      belonging to another flow's variable set names the flow it is now inside. */
const anchors = Object.keys(suppliedScope.runAfter || {});
const foreign = anchors.filter((a) => !canonActions.has(a));
const host = [...packages].find(([name, { declares }]) => name !== flow && foreign.some((a) => declares.has(a)))?.[0] ?? null;
if (anchors.length) {
  report(`the scope is anchored to ${anchors.join(', ')} — the package ships runAfter: {}`, [
    'Cause: it was pasted underneath an existing action instead of into an empty flow.',
    ...(host
      ? [`${foreign.filter((a) => packages.get(host).declares.has(a)).join(', ')} is declared only by ${host} — this scope was pasted into that flow, not into ${flow}.`]
      : foreign.map((a) => `${a} is not part of ${flow}.`)),
  ]);
}

/* 3. WHAT THAT BREAKS IN THE HOST FLOW.
      Action names are unique per workflow, and every endpoint package carries the same response
      and telemetry scaffolding under the same names — so two of them cannot share a flow. */
if (host) {
  const theirs = actionsOf(packages.get(host).pkg.serializedValue);
  const clash = [...canonActions.keys()].filter((k) => theirs.has(k)).sort();
  if (clash.length) {
    report(`${clash.length} of ${flow}'s action names already exist in ${host}`, [
      'A workflow cannot hold two actions with the same name, and both packages answer with their own Response.',
      `Fix: ${flow} is its own flow. Delete the pasted scope from ${host} and build ${flow} separately.`,
      '',
      ...clash,
    ]);
  }
}

/* 4. ANYTHING ELSE THAT MOVED.
      Reported last and without a cause: an intentional edit and a designer rewrite look
      identical here, and only the operator knows which this is. */
function flatten(o, p = '', into = new Map()) {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flatten(v, `${p}/${k}`, into);
  else into.set(p, o);
  return into;
}
const strip = (scope) => {
  const c = JSON.parse(JSON.stringify(scope));
  delete c.runAfter; delete c.metadata;
  walk(c, (_, act) => { delete act.metadata; });
  return c;
};
const a = flatten(strip(suppliedScope));
const b = flatten(strip(canon.serializedValue));
const emptiedPaths = new Set(emptied.flatMap(({ name }) => [...b.keys()].filter((k) => k.includes(`/${name}/inputs/value`))));
/* The designer stores a bare condition as a single-clause `and`: `{equals:[x,y]}` comes back as
   `{and:[{equals:[x,y]}]}`. Same expression, its own spelling. A path is only excused by that
   rewrite if its twin on the other side holds the SAME value — a condition the designer both
   reshaped and changed is still a change. */
const twin = (k) => (k.includes('/expression/and/0/')
  ? k.replace('/expression/and/0/', '/expression/')
  : k.replace('/expression/', '/expression/and/0/'));
const reshaped = (k) => {
  const t = twin(k);
  if (t === k) return false;
  const [mine, theirs] = a.has(k) ? [a, b] : [b, a];
  return theirs.has(t) && theirs.get(t) === mine.get(k);
};
const moved = [...new Set([...a.keys(), ...b.keys()])]
  .filter((k) => !emptiedPaths.has(k) && a.get(k) !== b.get(k))
  .filter((k) => !reshaped(k));
if (moved.length) {
  report(`${moved.length} other values differ from the package`, moved.slice(0, 40).map((k) => `${k}\n        pasted: ${JSON.stringify(a.get(k))}\n        repo  : ${JSON.stringify(b.get(k))}`));
}

const out = flag('--fix');
if (out) {
  /* The repair is the package itself. Restoring the stripped values in place would leave the
     scope anchored where it should not be, and the operator still has to delete it and paste
     again — so hand back the thing to paste, not a mended copy of the broken one. */
  writeFileSync(resolve(out), JSON.stringify(canon));
  console.log(`  → wrote ${out}: ${canonPath} verbatim.`);
  console.log(`    Create ${flow}'s variables first, then paste this into an empty ${flow} flow.\n`);
}

if (!findings.length) console.log(`  ✅ identical to ${canonPath} — the paste survived intact\n`);
process.exit(findings.length ? 1 : 0);
