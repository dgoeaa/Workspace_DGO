#!/usr/bin/env node
/**
 * ONE DEDICATED VARIABLES PACKAGE PER FLOW.
 *
 * WHY PER FLOW, AND NOT ONE SHARED CARRIER
 *   A single union carrier shipped every flow all nine declarations, six of which never read
 *   `varBulkResults`. That is defensible — an unread variable costs nothing — but it means the
 *   file cannot be checked against the flow it serves: nothing can say whether a flow's needs are
 *   met, only that the union is present. Per flow, the set is DERIVED from the package itself:
 *   every variables('x') it reads and every variable action it writes. A flow that starts using a
 *   new variable gets it the next time this runs; one that stops gets it removed. The set cannot
 *   drift from the flow because it is not written down anywhere.
 *
 * WHY A SCOPE
 *   Power Automate accepts Initialize variable only at the TOP LEVEL of a workflow. A clipboard
 *   package is a scope, so a pasted declaration lands nested and the designer refuses to SAVE.
 *   It does not refuse the paste — that distinction is what makes this legal. Paste, drag the
 *   declarations out to the top level, delete the empty scope, then paste the flow.
 *
 *     node scripts/build-flow-variables.mjs           # write
 *     node scripts/build-flow-variables.mjs --check   # exit 1 if any file is stale
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRS = [
  'docs/deployment/internal/flows/designer-paste',
  'docs/deployment/sharepoint/flows/designer-paste',
];
/* The estate's declarations, in dependency order. Name, type and initial value are the three
   things the designer requires of every variable, and every one below carries all three. */
const CATALOGUE = [
  { name: 'varStatusCode',    type: 'integer', value: 500,
    why: 'The response status. 500 until something sets it, so a path that falls through answers a server error rather than a misleading success.' },
  { name: 'varData',          type: 'object',  value: {},
    why: 'The response payload. An empty object, never null, so a reader can index it before it is filled.' },
  { name: 'varErrors',        type: 'array',   value: [],
    why: 'Collected errors. An empty array so length() is always valid.' },
  { name: 'varRequestId',     type: 'string',  value: "@coalesce(triggerBody()?['requestId'],triggerBody()?['request_id'],guid())",
    why: 'Correlates the run with the caller. Takes the id the caller supplied under either spelling, and mints one when neither is present.' },
  { name: 'varStartTicks',    type: 'integer', value: '@ticks(utcNow())',
    why: 'Run start, in ticks, so a duration can be computed without parsing a timestamp.' },
  { name: 'varReceivedAtUtc', type: 'string',  value: '@utcNow()',
    why: 'Run start as an ISO timestamp, for the telemetry row.' },
  { name: 'varCompletedAtUtc',type: 'string',  value: '',
    why: 'Run end. Empty until the run completes; the telemetry row is written after it is set.' },
  { name: 'varDurationMs',    type: 'integer', value: 0,
    why: 'Elapsed milliseconds, computed from varStartTicks at the end of the run.' },
  { name: 'varBulkResults',   type: 'array',   value: [],
    why: 'One result per item in a bulk operation. Appended inside a foreach pinned to one repetition at a time.' },
];
const BY_NAME = new Map(CATALOGUE.map((v) => [v.name, v]));

let n = 0, stale = [];
for (const dir of DIRS) {
  const full = join(ROOT, dir);
  for (const file of readdirSync(full).filter((f) => f.endsWith('.designer-paste.json') && !f.includes('.variables.')).sort()) {
    const flow = file.replace('.designer-paste.json', '');
    if (flow === 'DGO_VARIABLE_INITIALIZATION') continue;   /* superseded by these files */
    const sv = JSON.parse(readFileSync(join(full, file), 'utf8')).serializedValue;

    /* What this flow actually uses: every read, and every write. */
    const used = new Set();
    for (const m of JSON.stringify(sv).matchAll(/variables\('([^']+)'\)/g)) used.add(m[1]);
    (function walk(actions) {
      for (const v of Object.values(actions || {})) {
        if (!v || typeof v !== 'object') continue;
        if (/^(SetVariable|AppendToArrayVariable|AppendToStringVariable|IncrementVariable|DecrementVariable)$/.test(v.type || '')
            && v.inputs?.name) used.add(v.inputs.name);
        walk(v.actions); walk(v.else?.actions);
        if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
        walk(v.default?.actions);
      }
    })(sv.actions);

    const unknown = [...used].filter((u) => !BY_NAME.has(u));
    if (unknown.length) {
      console.error(`❌ ${flow} uses ${unknown.join(', ')}, which the catalogue does not define. `
        + 'Add the declaration — a variables file that omits one a flow reads fails at run time '
        + "with \"The variable 'name' is not defined\".");
      process.exit(1);
    }

    /* Emitted in catalogue order, each chained to the one before, so the designer shows them in
       a single column and dragging them out preserves the order they must be declared in. */
    const needed = CATALOGUE.filter((v) => used.has(v.name));
    const actions = {};
    let prev = null;
    needed.forEach((v, i) => {
      const key = `Initialize_variable_${v.name}`;
      actions[key] = {
        type: 'InitializeVariable',
        inputs: { variables: [{ name: v.name, type: v.type, value: v.value }] },
        metadata: { operationMetadataId: `b0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` },
        ...(prev ? { runAfter: { [prev]: ['Succeeded'] } } : {}),
      };
      prev = key;
    });

    const pkg = {
      nodeId: `Scope_Variables_${flow}`,
      serializedValue: {
        type: 'Scope',
        actions,
        runAfter: {},
        metadata: { operationMetadataId: 'b0000000-0000-4000-8000-000000000000' },
      },
      allConnectionData: {},
      staticResults: {},
      isScopeNode: true,
      mslaNode: true,
    };
    const out = join(full, `${flow}.variables.designer-paste.json`);
    const text = JSON.stringify(pkg, null, 2) + '\n';
    const current = (() => { try { return readFileSync(out, 'utf8'); } catch { return ''; } })();
    if (process.argv.includes('--check')) { if (current !== text) stale.push(`${flow} (${needed.length} variables)`); }
    else { writeFileSync(out, text); console.log(`  ${flow.padEnd(32)} ${needed.length} variable(s): ${needed.map((v) => v.name).join(', ')}`); }
    n++;
  }
}
if (process.argv.includes('--check')) {
  if (stale.length) { console.error(`❌ stale variables package(s): ${stale.join('; ')} — run: node scripts/build-flow-variables.mjs`); process.exit(1); }
  console.log(`✅ ${n} variables package(s) match the flows they serve`);
} else console.log(`\nWrote ${n} variables package(s).`);
