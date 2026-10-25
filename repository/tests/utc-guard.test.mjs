/* List dates are read with a zone (tenant defect, 2026-10-18: AUTO_SCHEDULED_SWEEP run 08584093115454153780858604181CU30,
 * Select_Digest_Ack failed because convertFromUtc refused '2026-09-22T00:00:00.0000000', a date-only column with no Z).
 * No released package converts a value read from a list row, a trigger body or a connector reply without
 * scripts/lib/identification-flow-edit.mjs utcGuard; e-mail bodies are the catalogue's and are checked there (ITEM-68). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertFromUtcArgs, unguardedUtcArg, utcGuard } from '../scripts/lib/identification-flow-edit.mjs';
import { Simulator } from '../scripts/lib/wdl-sim.mjs';

const ROOT = new URL('../', import.meta.url);
const rel = JSON.parse(readFileSync(new URL('docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json', ROOT), 'utf8'));
let pass = 0; const ok = (c, m, d = '') => { assert.ok(c, `${m}${d ? `: ${d}` : ''}`); pass++; console.log(`  ✅ ${m}`); };
const CATALOGUE = (k) => /_Html(_Part\d+)?$/.test(k) || k === 'emailMessage/Body';

console.log('List dates');
const bad = []; let guarded = 0;
for (const p of Object.keys(rel.packages)) {
  const pkg = JSON.parse(readFileSync(new URL(`docs/folio-Master-Flows-and-Endpoints/packages/${p}`, ROOT), 'utf8'));
  const walk = (v, at) => { if (typeof v === 'string') { for (const [a, b] of convertFromUtcArgs(v)) { const arg = v.slice(a, b); if (unguardedUtcArg(arg)) bad.push(`${p.split('/').pop()} ${at}: ${arg.slice(0, 80)}`); else if (arg.includes("'1970-01-01T00:00:00Z'")) guarded++; } return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!CATALOGUE(k)) walk(x, k); };
  walk(pkg.serializedValue, pkg.nodeId);
}
ok(!bad.length, 'no released package converts a list, trigger or connector date without the guard', bad.slice(0, 5).join(' | '));
ok(guarded >= 4, `the guard is in place where dates are read (${guarded} values)`);

/* The guard in the simulator, on the value the tenant refused, an ordinary UTC value and an empty one. */
const v = "triggerBody()?['d']";
const pkg = { nodeId: 'Scope_T', serializedValue: { type: 'Scope', runAfter: {}, actions: { Compose_T: { type: 'Compose', runAfter: {}, inputs: `@formatDateTime(convertFromUtc(${utcGuard(v)},'W. Central Africa Standard Time'),'yyyy-MM-dd')` } } } };
const run = (d) => { const sim = new Simulator({ variables: {}, connectors: {}, clock: () => '2026-10-18T06:00:00.000Z', workflow: { name: 't', run: { name: 'r' } }, trigger: { startTime: '2026-10-18T06:00:00.000Z', outputs: { body: { d } } } }); sim.run(pkg); return { out: sim.global.get('Compose_T')?.outputs, err: sim.templateErrors.map((e) => e.message).join(' | ') }; };
const a = run('2026-09-22T00:00:00.0000000'), b = run('2026-09-22T09:30:00Z'), c = run(null);
ok(!a.err && a.out === '2026-09-22', 'a date-only value with no zone converts (the run that failed)', `${a.out} ${a.err}`);
ok(!b.err && b.out === '2026-09-22', 'a UTC value converts as before', `${b.out} ${b.err}`);
ok(!c.err, 'an empty value does not fail the step', c.err);
console.log(`\n✅ ${pass} passed, 0 failed`);
