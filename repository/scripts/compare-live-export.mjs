/* COMPARE A LIVE FLOW EXPORT AGAINST THE PACKAGE BUILT TO REPLACE IT.
 *
 * A package is "pasted and current" only when the tenant says so. This reads a legacy export
 * (.zip or an unpacked folder) straight from Power Automate and compares it, action by action
 * and parameter by parameter, with the designer-paste files in a package folder.
 *
 *   node scripts/compare-live-export.mjs --export <file.zip|dir> --package <package dir>
 *
 * Exit 0 when every packaged action is present and identical. Exit 1 otherwise.
 *
 * WHAT IT DELIBERATELY DOES NOT TREAT AS A DIFFERENCE
 *   - JSON key order, and operationMetadataId, which the designer reassigns on every paste.
 *   - runAfter. A package ships each scope standalone; live, it is chained to whatever precedes
 *     it. The chain is a property of where the operator pasted it, not of what was pasted. The
 *     live top-level chain is printed instead, so it can be read.
 *   - The paste-container scope (Scope_Variables_*), which the package README tells the operator
 *     to empty and delete. Its contents are still required to be present.
 *
 * WHAT IT REPORTS SEPARATELY
 *   The trigger. No designer-paste file carries it — it is configured by hand — so it is never
 *   part of the action comparison and has to be read on its own. FLOW-BUILD-WALKTHROUGH says
 *   Method = POST; a trigger with no method answers every verb.
 */
import { readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? '' : process.argv[i + 1]; };
const EXPORT = arg('--export'), PKG = arg('--package');
if (!EXPORT || !PKG) {
  console.error('usage: node scripts/compare-live-export.mjs --export <file.zip|dir> --package <dir>');
  process.exit(2);
}

/* ---- locate the export's definition.json ---- */
let root = EXPORT;
if (statSync(EXPORT).isFile()) {
  root = mkdtempSync(join(tmpdir(), 'flow-export-'));
  execFileSync('unzip', ['-o', '-q', EXPORT, '-d', root]);
}
const findDefinition = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const hit = findDefinition(p); if (hit) return hit; }
    else if (e.name === 'definition.json') return p;
  }
  return '';
};
const defPath = findDefinition(root);
if (!defPath) { console.error(`no definition.json under ${EXPORT}`); process.exit(2); }
const exported = JSON.parse(readFileSync(defPath, 'utf8'));
const live = exported.properties?.definition ?? exported.definition;
if (!live) { console.error(`${defPath} carries no definition`); process.exit(2); }

/* ---- flatten every action at every nesting level ---- */
const flatten = (actions, into = new Map()) => {
  for (const [name, a] of Object.entries(actions || {})) {
    into.set(name, a);
    if (a.actions) flatten(a.actions, into);
    if (a.else?.actions) flatten(a.else.actions, into);
    for (const c of Object.values(a.cases || {})) flatten(c.actions, into);
    if (a.default?.actions) flatten(a.default.actions, into);
  }
  return into;
};

/* Order-insensitive and metadata-insensitive. */
const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (k === 'metadata' || k === 'operationMetadataId') continue;
      o[k] = canon(v[k]);
    }
    return o;
  }
  return v;
};
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/* The action types that write a variable through `inputs.value` — the ones the designer empties
   when it cannot resolve the variable being written. See the diff loop below. */
const WRITES_VARIABLE = new Set(['SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable', 'DecrementVariable']);

const wanted = new Map();
for (const f of readdirSync(PKG).filter((f) => f.endsWith('designer-paste.json'))) {
  const n = JSON.parse(readFileSync(join(PKG, f), 'utf8'));
  for (const node of Array.isArray(n) ? n : [n]) flatten({ [node.nodeId]: node.serializedValue }, wanted);
}
const liveAll = flatten(live.actions);

/* The paste container is meant to be gone. Its contents are not. */
const CONTAINER = /^Scope_Variables_/;
const missing = [...wanted.keys()].filter((k) => !liveAll.has(k) && !CONTAINER.test(k));
const containersGone = [...wanted.keys()].filter((k) => CONTAINER.test(k) && !liveAll.has(k));
const containersLeft = [...wanted.keys()].filter((k) => CONTAINER.test(k) && liveAll.has(k));
const extra = [...liveAll.keys()].filter((k) => !wanted.has(k));

const differ = [];
for (const [k, a] of wanted) {
  const b = liveAll.get(k);
  if (!b) continue;
  const diffs = [];
  if (a.type !== b.type) diffs.push(`type: package ${a.type}, live ${b.type}`);
  if (!same(a.inputs, b.inputs)) {
    const pa = a.inputs?.parameters, pb = b.inputs?.parameters;
    /* A VARIABLE WRITE THAT ARRIVED LIVE WITH NO VALUE HAS ONE CAUSE, SO NAME IT.
       The designer types a Set variable's Value field from the declared type of the variable
       named in it. Paste the scope before the top-level Initialize variable actions exist and
       the name resolves to nothing, the value has no type to be edited as, and it is dropped —
       leaving `{"name":"varStatusCode"}` and an empty Value box, with no error anywhere. The
       flow saves, reads every list correctly, and answers with varStatusCode still at its
       initial 500 and varData still {}. Creating the declarations afterwards does not bring the
       values back: they are already gone from the definition. Reported as `inputs` alone this
       cost a diagnosis; it is the same ten lines either way, so they may as well say so. */
    if (WRITES_VARIABLE.has(a.type) && a.inputs?.value !== undefined && b.inputs?.value === undefined) {
      diffs.push(`writes ${b.inputs?.name ?? a.inputs?.name} with NO VALUE — the designer stripped it, the scope was pasted before the variables existed`);
      diffs.push(`  package value: ${JSON.stringify(a.inputs.value)}`);
    } else if (pa && pb) {
      for (const key of [...new Set([...Object.keys(pa), ...Object.keys(pb)])].sort()) {
        if (!same(pa[key], pb[key])) diffs.push(`inputs.parameters/${key}`);
      }
    } else diffs.push('inputs');
  }
  if (diffs.length) differ.push({ action: k, diffs });
}

console.log(`\n${exported.properties?.displayName || '(unnamed)'}  ←  ${PKG}`);

/* THE FLOW ID, PRINTED, BECAUSE THE OBVIOUS PLACE TO READ IT IS THE WRONG PLACE.
   A legacy package stores each flow under `Microsoft.Flow/flows/<GUID>/`, and that GUID is
   NOT the flow — `Microsoft.Flow/flows/manifest.json` calls it an assetPath, it names the
   package directory, and it appears nowhere in the tenant. The flow id is the definition's own
   `name` / `id`, and that is the value a trigger URL carries in `/workflows/<id>/triggers/
   manual/paths/invoke`, which is what check-config-local.mjs compares a config against.
   Reading the folder instead put a wrong id into the register and into config.example.js, so
   the id is reported here rather than left to be inferred from a path. */
const flowId = (exported.name || exported.id?.split('/').pop() || '').replace(/-/g, '').toLowerCase();
const assetPath = defPath.split('/').slice(-2)[0];
if (flowId) {
  console.log(`  flow id ${flowId}`);
  if (assetPath.replace(/-/g, '').toLowerCase() !== flowId) {
    console.log(`  ${' '.repeat(0)}(the export's folder is ${assetPath} — an assetPath, not the flow id; do not use it)`);
  }
} else {
  console.log('  flow id: the export declares no name — read it from the flow in Power Automate');
}
console.log(`  packaged actions ${wanted.size} · live actions ${liveAll.size}`);
console.log(`  in the package but not live : ${missing.length}${missing.map((m) => `\n      ${m}`).join('')}`);
console.log(`  live but not in the package : ${extra.length}${extra.map((m) => `\n      ${m}`).join('')}`);
console.log(`  present but different       : ${differ.length}`);
for (const d of differ) console.log(`      ${d.action}\n        ${d.diffs.join('\n        ')}`);
if (containersGone.length) console.log(`  paste container removed as instructed: ${containersGone.join(', ')}`);
if (containersLeft.length) console.log(`  ⚠ paste container still in the flow — the README says delete it: ${containersLeft.join(', ')}`);

console.log('\n  live top-level order:');
for (const [k, a] of Object.entries(live.actions || {})) {
  console.log(`      ${k}  ←  ${Object.keys(a.runAfter || {}).join(', ') || '(first)'}`);
}

/* The trigger is configured by hand and is in no paste file, so read it out loud. */
const trig = Object.entries(live.triggers || {})[0];
if (trig) {
  const [tn, t] = trig;
  const i = t.inputs || {};
  const props = Object.keys(i.schema?.properties || {});
  console.log(`\n  trigger ${tn}: ${t.type}/${t.kind || '-'} · auth=${i.triggerAuthenticationType || '(none)'}`
            + ` · method=${i.method || '(none — answers every verb)'} · schema properties=${props.length}`);
  if (!i.method) console.log('      ⚠ FLOW-BUILD-WALKTHROUGH sets Method = POST. This trigger restricts nothing.');
}

const ok = !missing.length && !differ.length && !containersLeft.length;
console.log(`\n${ok ? '✅ pasted and current' : '❌ not current'} — ${missing.length} missing, ${differ.length} different, ${extra.length} extra\n`);
process.exit(ok ? 0 : 1);
