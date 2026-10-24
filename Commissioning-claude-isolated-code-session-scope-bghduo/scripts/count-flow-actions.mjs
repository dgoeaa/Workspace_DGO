#!/usr/bin/env node
/**
 * How many actions does each exported flow definition actually contain?
 *
 * WHY THIS EXISTS
 * Session 4 of the operator walkthrough replaces the body of seven live flows by pasting a
 * package into the designer. The obvious check — "did it take?" — has no answer in the Power
 * Automate UI: the modern designer shows no action count anywhere, so an operator can paste,
 * save, see no error, and still have no way to tell whether the flow now holds what the package
 * describes. Asking them to read a count off the screen was not answerable, which is why this
 * exists instead: export the flow and count what the tenant returned.
 *
 * Run it BEFORE pasting to record what each flow held, and AFTER to see what it holds now. The
 * package's own count comes from `npm run designerpaste`, and a paste that worked makes the two
 * agree. A count that did not move is the signal that a save reported success and changed
 * nothing.
 *
 * The count includes every nested action — an action inside a Scope, a Condition branch or a
 * Switch case is an action — because that is what the package count means too.
 *
 * Usage:
 *   node scripts/count-flow-actions.mjs                      # docs/reference/flow-contracts/exported
 *   node scripts/count-flow-actions.mjs <directory>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, collectActions, definitionRoot, identity, isFlowDocument } from './lib/flow-definition-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = process.argv[2] ? resolve(process.argv[2]) : resolve(ROOT, 'docs/reference/flow-contracts/exported');

let files;
try { files = walk(dir); } catch { console.error(`Not found: ${dir}`); process.exit(1); }

const rows = [];
for (const file of files) {
  let doc;
  /* The BOM strip is not decoration: an export written by Windows PowerShell 5.1 carries one,
     and JSON.parse rejects a leading byte-order mark outright. */
  try { doc = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { continue; }
  if (!isFlowDocument(doc)) continue;
  const def = definitionRoot(doc);
  if (!def || !def.actions) continue;
  const id = identity(doc);
  rows.push({
    name: id.displayName || file.split(/[\\/]/).pop(),
    id: id.workflowId || '',
    actions: collectActions(def.actions, '', []).length,
  });
}

if (!rows.length) {
  console.error(`\nNo flow definition found in ${dir}\n`);
  process.exit(1);
}

rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
const w = Math.max(...rows.map((r) => String(r.name).length));
console.log(`\nAction counts — ${rows.length} definition(s) in ${dir}\n`);
for (const r of rows) console.log(`  ${String(r.name).padEnd(w)}  ${String(r.actions).padStart(4)}`);
console.log(`\n  Nested actions are counted: an action inside a Scope, a Condition branch or a`);
console.log(`  Switch case is an action, which is what the package counts mean too.\n`);
