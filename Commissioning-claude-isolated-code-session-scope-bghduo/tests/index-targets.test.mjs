#!/usr/bin/env node
/* Every column the flows filter on, on a list big enough for it to matter, must be declared as
 * an index target — and every declared target must name a list the tenant capture actually has.
 *
 * This is the check that stops the estate re-acquiring open items 23, 31 and 33. A `$filter` on
 * an unindexed column FAILS past SharePoint's 5,000-item view threshold rather than slowing, so
 * a new filter added to a large list is a correctness defect the moment it ships, and nothing
 * before this looked. */
import { readFileSync, readdirSync } from 'node:fs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const targets = read('docs/deployment/sharepoint/index-targets.json').targets;
const lists = read('docs/reference/sharepoint-list-index.json').lists;
const spec = read('docs/deployment/sharepoint/portal-field-spec.json');

console.log('\nIndex targets');

ok('every target names a list in the tenant capture',
   targets.every((t) => lists[t.listGuid.toLowerCase()]),
   'unknown: ' + targets.filter((t) => !lists[t.listGuid.toLowerCase()]).map((t) => t.listTitle).join(', '));

ok('every target agrees with the capture on title and site',
   targets.every((t) => {
     const l = lists[t.listGuid.toLowerCase()];
     return !l || (l.title === t.listTitle && l.siteUrl === t.siteUrl);
   }),
   targets.filter((t) => {
     const l = lists[t.listGuid.toLowerCase()];
     return l && (l.title !== t.listTitle || l.siteUrl !== t.siteUrl);
   }).map((t) => t.listTitle).join(', '));

ok('every target says why it is one',
   targets.every((t) => typeof t.reason === 'string' && t.reason.length > 30));

ok('no target duplicates another',
   new Set(targets.map((t) => `${t.listGuid} ${t.internalName}`)).size === targets.length);

/* SharePoint's own ceiling: twenty indexed columns per list. */
const perList = {};
for (const t of targets) perList[t.listGuid] = (perList[t.listGuid] || 0) + 1;
const specIndexed = {};
for (const l of spec.lists) {
  for (const f of l.fields) if (f.indexed) specIndexed[l.listGuid] = (specIndexed[l.listGuid] || 0) + 1;
}
ok('no list is asked for more than 20 indexed columns',
   Object.entries(perList).every(([g, n]) => n + (specIndexed[g] || 0) <= 20));

/* The real guard: a filter on a big list that nobody declared. */
const THRESHOLD = 5000;
const declared = new Set(targets.map((t) => `${t.listGuid.toLowerCase()} ${t.internalName}`));
for (const l of spec.lists) {
  for (const f of l.fields) if (f.indexed) declared.add(`${l.listGuid.toLowerCase()} ${f.internalName}`);
}

const undeclared = [];
const DIRS = [
  'docs/deployment/internal/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste/correspondence-gateway',
];
for (const dir of DIRS) {
  let entries;
  try { entries = readdirSync(dir); } catch { continue; }
  for (const file of entries.filter((x) => x.endsWith('.json'))) {
    const pkg = read(`${dir}/${file}`);
    const sv = typeof pkg.serializedValue === 'string' ? JSON.parse(pkg.serializedValue) : pkg.serializedValue;
    (function walk(actions) {
      for (const [name, v] of Object.entries(actions || {})) {
        if (!v || typeof v !== 'object') continue;
        const flt = v.inputs?.parameters?.$filter;
        const ord = v.inputs?.parameters?.$orderby;
        const guid = String(v.inputs?.parameters?.table || '').toLowerCase();
        const list = lists[guid];
        if (list && (list.itemsAtCapture || 0) >= THRESHOLD) {
          /* EVERY OPERATOR, AND THE SORT COLUMN.
             This read `<Col> eq ` only, so the scheduled sweep's `DueDate lt …` and
             `Acknowledgement_x0020_Due_x0020_ lt …` passed a check written to catch exactly
             them, on a list of 15,804 items. The flow was imported and its first live run
             returned the list view threshold 400 on both queries. Past the threshold SharePoint
             refuses to SORT on an unindexed column as firmly as it refuses to filter on one, so
             $orderby is read here too — three packages sort these lists on `Modified`. */
          const cols = new Set();
          if (typeof flt === 'string') {
            for (const m of flt.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s+(?:eq|ne|lt|le|gt|ge)\s/g)) cols.add(m[1]);
            for (const m of flt.matchAll(/\b(?:startswith|substringof)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g)) cols.add(m[1]);
          }
          if (typeof ord === 'string') {
            for (const part of ord.split(',')) {
              const col = part.trim().split(/\s+/)[0];
              if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) cols.add(col);
            }
          }
          for (const col of cols) {
            if (!declared.has(`${guid} ${col}`)) {
              undeclared.push(`${file.replace('.designer-paste.json', '')} / ${name}: ${list.title}.${col} (${list.itemsAtCapture} items)`);
            }
          }
        }
        walk(v.actions);
        walk(v.else?.actions);
        if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
        walk(v.default?.actions);
      }
    })(sv.actions);
  }
}
ok(`no package filters or sorts a list over ${THRESHOLD} items on an undeclared column`,
   undeclared.length === 0, [...new Set(undeclared)].join('\n     '));

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
