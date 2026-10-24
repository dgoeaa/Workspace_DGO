#!/usr/bin/env node
/**
 * Which SharePoint columns does the deployed estate actually touch, and on which list?
 *
 * WHY THIS EXISTS
 * `docs/deployment/internal/internal-field-evidence.json` is the gate that decides whether a
 * generated package may write `item/<Column>` to an internal list. That matters because the
 * designer validates every write parameter against the connector's operation definition AT SAVE
 * TIME and refuses the whole flow:
 *
 *   Flow save failed with code 'WorkflowOperationParametersExtraParameter'
 *
 * So a column recorded against the WRONG list is not a documentation slip. It is a licence to
 * generate a package that cannot be saved, discovered by an operator mid-visit. That is exactly
 * what `RoutedToDSU` was: recorded against Global Tracking Queue, written by the estate only to
 * DGO DIGITAL OPS. No package wrote it, so nothing had failed yet — the trap was armed, not
 * sprung.
 *
 * This reads the 58 exported definitions and attributes every column each one touches to the
 * list the touching action actually addresses, by GUID. Attribution is per action, never per
 * file: `Deployed - Create Task` alone writes to three different lists, so a file-wide grep
 * cannot tell you which column belongs where. That is how the mis-attribution got in.
 *
 * WHAT COUNTS AS ATTESTATION
 *   write    an `item/<Col>` parameter on an action addressing that list
 *   query    a column named in that action's `$filter`, `$orderby` or `$select`
 *   bodyref  `outputs('<that action>')?['body/<Col>']` somewhere in the same definition
 *
 * A projection KEY does not count. The fetch flows build output objects whose keys are named
 * after columns — `"RoutedToDSU": "@coalesce(item()?['GDSUROUT'],'No Route')"` — and the key is
 * the shape the client receives, not a column on the list being read. Counting those would have
 * attested the very column this script exists to catch.
 *
 * Usage:
 *   node scripts/mine-list-columns.mjs                 # report every list the estate touches
 *   node scripts/mine-list-columns.mjs --list "Global" # filter by list title or GUID prefix
 *   node scripts/mine-list-columns.mjs --check         # exit 1 if the evidence file over-claims
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const DEP = 'docs/reference/flow-contracts/deployed';
const EVIDENCE = 'docs/deployment/internal/internal-field-evidence.json';

const check = process.argv.includes('--check');
const listArg = (() => {
  const i = process.argv.indexOf('--list');
  return i > -1 ? String(process.argv[i + 1] || '').toLowerCase() : null;
})();

const tenant = read('docs/reference/sharepoint-list-index.json').lists;
const byGuid = new Map(Object.entries(tenant).map(([g, v]) => [g.toLowerCase(), v]));

/** Every action in a definition, wherever it is nested. */
function* walkActions(node) {
  if (!node || typeof node !== 'object') return;
  if (node.actions && typeof node.actions === 'object') {
    for (const [name, act] of Object.entries(node.actions)) {
      yield [name, act];
      yield* walkActions(act);
    }
  }
  if (node.else) yield* walkActions(node.else);
  if (node.cases) for (const c of Object.values(node.cases)) yield* walkActions(c);
  if (node.default) yield* walkActions(node.default);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* guid -> Map(column -> { kinds:Set, flows:Set }) */
const attested = new Map();
const note = (guid, col, kind, flow) => {
  const g = String(guid).toLowerCase();
  if (!attested.has(g)) attested.set(g, new Map());
  const m = attested.get(g);
  if (!m.has(col)) m.set(col, { kinds: new Set(), flows: new Set() });
  m.get(col).kinds.add(kind);
  m.get(col).flows.add(flow);
};

let definitions = 0;
if (existsSync(join(ROOT, DEP))) {
  for (const file of readdirSync(join(ROOT, DEP)).filter((f) => f.endsWith('.json'))) {
    let doc;
    try { doc = read(`${DEP}/${file}`); } catch { continue; }
    const flow = file.split('__')[0];
    const definition = doc.definition || {};
    const raw = JSON.stringify(definition);
    definitions++;
    for (const [name, act] of walkActions(definition)) {
      const p = act?.inputs?.parameters;
      if (!p?.table) continue;
      const guid = p.table;
      for (const k of Object.keys(p)) {
        if (k.startsWith('item/')) note(guid, k.slice(5).split('/')[0], 'write', flow);
      }
      for (const key of ['$filter', '$orderby', '$select']) {
        if (!p[key]) continue;
        for (const m of String(p[key]).matchAll(/([A-Za-z_][A-Za-z0-9_x]*)/g)) {
          note(guid, m[1], 'query', flow);
        }
      }
      /* body/<Col> read off THIS action's own outputs — the column is on this action's list. */
      const re = new RegExp(`outputs\\('${escapeRe(name)}'\\)\\?\\['body/([A-Za-z_][A-Za-z0-9_x]*)'\\]`, 'g');
      for (const m of raw.matchAll(re)) note(guid, m[1], 'bodyref', flow);
    }
  }
}

if (check) {
  /* Only the columns recorded as evidence class `deployed` are checkable here — that class means
     "a deployed definition names it". The other classes (`normaliser`, `seed`, `tenant`,
     `provisioned`) have their own provenance and no export need attest them. */
  const ev = read(EVIDENCE);
  let bad = 0;
  console.log(`\nInternal field evidence — 'deployed' columns, checked against ${definitions} exported definition(s)\n`);
  for (const [guid, list] of Object.entries(ev.lists)) {
    const a = attested.get(guid.toLowerCase()) || new Map();
    const claimed = Object.entries(list.columns || {}).filter(([, src]) => src === 'deployed');
    if (!claimed.length) continue;
    const missing = claimed.filter(([col]) => !a.has(col)).map(([col]) => col);
    for (const col of missing) {
      /* Name the list the estate DOES write it to — that is almost always the real home, and
         saying so turns a rejection into a correction. */
      const elsewhere = [...attested.entries()]
        .filter(([g, m]) => m.has(col) && g !== guid.toLowerCase())
        .map(([g]) => byGuid.get(g)?.title || g);
      console.log(`  ✗ ${list.title}.${col} is recorded as 'deployed', but no exported action`
        + ` addressing that list touches it${elsewhere.length ? ` — the estate writes it to ${[...new Set(elsewhere)].join(', ')}` : ''}`);
      bad++;
    }
    if (!missing.length) console.log(`  ✅ ${list.title.padEnd(34)} ${String(claimed.length).padStart(2)} column(s) attested`);
  }
  console.log(`\n  ${bad} over-claim(s).\n`);
  process.exit(bad ? 1 : 0);
}

console.log(`\nColumns the deployed estate touches, by list — from ${definitions} exported definition(s)\n`);
const rows = [...attested.entries()].sort((a, b) => b[1].size - a[1].size);
for (const [guid, cols] of rows) {
  const t = byGuid.get(guid);
  const title = t?.title || '(not in the tenant capture)';
  if (listArg && !title.toLowerCase().includes(listArg) && !guid.startsWith(listArg)) continue;
  const written = [...cols].filter(([, v]) => v.kinds.has('write')).map(([c]) => c).sort();
  const readOnly = [...cols].filter(([, v]) => !v.kinds.has('write')).map(([c]) => c).sort();
  console.log(`${title}  [${guid}]`);
  console.log(`  site ${t?.site ?? '?'} · adopted ${t?.adopted ?? '?'} · ${cols.size} column(s)`);
  if (written.length) console.log(`  written: ${written.join(', ')}`);
  if (readOnly.length) console.log(`  read only: ${readOnly.join(', ')}`);
  console.log('');
}
