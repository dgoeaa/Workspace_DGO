#!/usr/bin/env node
/**
 * LEARN WHAT THE SHAREPOINT CONNECTOR ACCEPTS, FROM DEFINITIONS IT HAS ACCEPTED.
 *
 * WHY THIS EXISTS
 *   Three packages failed at SAVE time in the designer, and an operator found all three by
 *   pasting them: an unknown column (WorkflowOperationParametersExtraParameter), a Choice column
 *   addressed as item/Severity instead of item/Severity/Value, and a PatchItem missing the
 *   required item/Title. Every validator here passed all three, because they check the LIST
 *   schema and a set of rules written by hand. None of them had the connector's operation
 *   definition, which is the thing that actually refuses the save.
 *
 *   That definition is not in this repository and cannot be fetched from here. But the estate
 *   holds hundreds of SharePoint operations inside definitions Power Automate has already
 *   accepted and saved, and every one of those is a positive example of what the connector
 *   permits. This derives the rules from them: which parameters each operation carries, which it
 *   carries EVERY time, and which columns are addressed through /Value.
 *
 *   It is evidence, not a specification. A rule learned from 40 examples is stronger than one
 *   learned from 2, so every rule records how many it rests on, and the checker weighs them.
 *
 *     node scripts/learn-connector-shape.mjs [extra-dirs...]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs/reference/connector/sharepoint-operation-shape.json');
const SOURCES = [join(ROOT, 'docs/reference/flow-contracts/deployed'), ...process.argv.slice(2)];

const files = [];
(function walk(d) {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json') && (e.name === 'definition.json' || d.includes('deployed'))) files.push(p);
  }
})(SOURCES[0]);
for (const s of SOURCES.slice(1)) (function walk(d) {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name === 'definition.json') files.push(p);
  }
})(s);

const ops = new Map();          // operationId -> { n, keys: Map<key,count> }
const writeSets = new Map();    // listGuid -> { PatchItem: [Set<col>], PostItem: [Set<col>] }
const listCols = new Map();     // listGuid -> Map<column, {n, viaValue}>
let definitions = 0, operations = 0;

for (const f of files) {
  let doc; try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  const def = doc.properties?.definition || doc.definition;
  if (!def?.actions) continue;
  definitions++;
  (function w(a) {
    for (const v of Object.values(a || {})) {
      if (!v || typeof v !== 'object') continue;
      const h = v.inputs?.host;
      if (h?.operationId && /sharepoint/i.test(h.apiId || h.connection || '')) {
        operations++;
        const o = ops.get(h.operationId) || { n: 0, keys: new Map() };
        o.n++;
        const params = v.inputs?.parameters || {};
        for (const k of Object.keys(params)) {
          /* item/<Column> and item/<Column>/Value collapse to one key shape so the counts
             describe the OPERATION, not the particular list it ran against. */
          const shape = k.startsWith('item/') ? 'item/*' : k;
          o.keys.set(shape, (o.keys.get(shape) || 0) + 1);
        }
        ops.set(h.operationId, o);

        const guid = String(params.table || '').toLowerCase();
        if (guid) {
          const cols = listCols.get(guid) || new Map();
          for (const k of Object.keys(params)) {
            if (!k.startsWith('item/')) continue;
            const rest = k.slice(5);
            const col = rest.split('/')[0];
            const viaValue = rest.endsWith('/Value');
            const c = cols.get(col) || { n: 0, viaValue: 0, direct: 0 };
            c.n++; if (viaValue) c.viaValue++; else c.direct++;
            cols.set(col, c);
          }
          listCols.set(guid, cols);
          if (/^(PatchItem|PostItem)$/.test(h.operationId)) {
            const written = new Set(Object.keys(params).filter((k) => k.startsWith('item/')).map((k) => k.slice(5).split('/')[0]));
            if (written.size) {
              const e = writeSets.get(guid) || { PatchItem: [], PostItem: [] };
              e[h.operationId].push(written);
              writeSets.set(guid, e);
            }
          }
        }
      }
      w(v.actions); w(v.else?.actions);
      if (v.cases) for (const c of Object.values(v.cases)) w(c.actions);
      w(v.default?.actions);
    }
  })(def.actions);
}

const out = {
  schema: 'dgo-sharepoint-connector-shape/v1',
  learnedUtc: new Date().toISOString().slice(0, 10),
  whatThisIs: 'What the SharePoint connector accepts, derived from operations inside flow definitions Power '
    + 'Automate has already saved. Evidence, not a specification: a rule resting on many observations is '
    + 'strong, one resting on two is a hint. Every rule carries its count so a checker can weigh it.',
  corpus: { definitions, operations },
  operations: Object.fromEntries([...ops].sort().map(([id, o]) => [id, {
    observed: o.n,
    parameters: Object.fromEntries([...o.keys].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, {
      seen: n,
      inEveryInstance: n === o.n,
    }])),
    alwaysPresent: [...o.keys].filter(([, n]) => n === o.n).map(([k]) => k).sort(),
  }])),
  /* A column written through /Value somewhere is a Choice, Lookup or Person column, and writing
     it directly is the OpenApiOperationParameterValidationFailed the estate has already hit. */
  columnsAddressedByValue: Object.fromEntries([...listCols].map(([guid, cols]) => [guid,
    [...cols].filter(([, c]) => c.viaValue > 0).map(([col, c]) => ({ column: col, viaValue: c.viaValue, direct: c.direct })),
  ]).filter(([, v]) => v.length)),
  columnsSeenPerList: Object.fromEntries([...listCols].map(([guid, cols]) => [guid, [...cols.keys()].sort()])),
  /* WHAT A PATCH MUST CARRY, PER LIST.
     'The API operation PatchItem is missing required property item/OTP_Code' — the connector
     demands every REQUIRED column of the list on an update, not just Title. Narrowing a patch to
     the fields that change is therefore not an optimisation, it is a save-time failure, and this
     generator shipped three of them: OTP_Code and Expires_At off the OTP patches, Year, Prefix
     and CurrentSequence off the sequence counter, ReferenceId and SenderEmail off the registry.
     Which columns are required lives in the list schema, which this repository does not hold for
     every list — but a column present in EVERY accepted write to a list is required, or so close
     to it that omitting it is not worth the risk. Recorded with its count so a thin rule can be
     told from a strong one. */
  requiredByList: Object.fromEntries([...writeSets].map(([guid, ops]) => [guid,
    Object.fromEntries(Object.entries(ops).filter(([, sets]) => sets.length >= 3).map(([op, sets]) => [op, {
      observed: sets.length,
      alwaysPresent: [...sets[0]].filter((c) => sets.every((s) => s.has(c))).sort(),
    }])),
  ]).filter(([, v]) => Object.keys(v).length)),
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`Learned from ${definitions} definitions, ${operations} SharePoint operations.`);
for (const [id, o] of [...ops].sort((a, b) => b[1].n - a[1].n))
  console.log(`  ${id.padEnd(16)} ${String(o.n).padStart(4)} observed · always present: ${[...o.keys].filter(([, n]) => n === o.n).map(([k]) => k).join(', ') || '(none)'}`);
