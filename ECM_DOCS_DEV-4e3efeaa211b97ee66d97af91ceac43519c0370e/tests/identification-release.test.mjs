/**
 * The identification package release (owner rule, 2026-10-06): packages are frozen at the release and pasted once.
 *
 *   1. every package's fingerprint equals the release's; a rebuild that changes a flow fails here until it is reverted
 *      or released (npm run idrelease -- --reason "…")
 *   2. the release names every package, and no package that no longer exists
 *   3. every paste-ledger entry names a package, and the status files agree with the ledger
 *   4. no package carries a Set variable step with an inline object, array or changed value (the paste drops it)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { packageFingerprint, packageScope } from '../scripts/lib/package-fingerprint.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nIdentification package release\n');
const MF = 'docs/folio-Master-Flows-and-Endpoints';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rel = J(`${MF}/registers/identification-release.json`);
const ledger = J(`${MF}/registers/identification-paste-ledger.json`).entries;
const pkgs = {};
for (const d of ['identification-phase3', 'identification-phase4']) for (const f of readdirSync(`${MF}/packages/${d}`).filter((x) => x.endsWith('.paste.json'))) pkgs[`${d}/${f}`] = J(`${MF}/packages/${d}/${f}`);

const drift = Object.entries(pkgs).filter(([f, p]) => rel.packages[f] && rel.packages[f] !== packageFingerprint(p)).map(([f]) => f);
ok(!drift.length, `every package is the one frozen in release ${rel.release}`, `${drift.join('; ')} changed since the release — revert, or cut a release: npm run idrelease -- --reason "…"`);
const missing = Object.keys(pkgs).filter((f) => !rel.packages[f]), gone = Object.keys(rel.packages).filter((f) => !pkgs[f]);
ok(!missing.length && !gone.length, 'the release names every package and only those', [...missing.map((f) => `not released: ${f}`), ...gone.map((f) => `released but absent: ${f}`)].join('; '));

const names = new Set(Object.keys(pkgs).map((f) => f.split('/')[1]));
const stray = ledger.filter((e) => !names.has(e.file)).map((e) => e.file);
ok(!stray.length, `every paste-ledger entry (${ledger.length}) names a package`, stray.join('; '));
const status = [3, 4].flatMap((p) => J(`${MF}/registers/identification-phase${p}-status.json`).packages);
const wrong = status.filter((s) => {
  const e = ledger.find((x) => x.file === s.file);
  const want = !e || e.fingerprint === null ? 'paste' : e.fingerprint === s.fingerprint ? 'in-tenant' : 're-paste';
  return s.action !== want;
}).map((s) => s.file);
ok(!wrong.length, 'each package\'s next action follows from the ledger and its fingerprint', wrong.join('; '));

const inline = [];
for (const [f, p] of Object.entries(pkgs)) {
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    if (a.type === 'SetVariable' && a.inputs && 'value' in a.inputs && a.inputs.value !== null && typeof a.inputs.value === 'object') inline.push(`${f.split('/')[1]}: ${n}`);
    walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(packageScope(p).actions);
}
ok(!inline.length, 'no Set variable step carries an inline object or array value (the designer drops it on paste)', inline.slice(0, 5).join('; '));
const byFile = Object.fromEntries(Object.entries(pkgs).map(([f, p]) => [f.split('/')[1], p]));
const loose = status.flatMap((s) => (s.variableStepsChanged || []).filter((n) => {
  let v; const walk = (o) => { for (const [k, a] of Object.entries(o || {})) { if (k === n) v = a; walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions); } };
  walk(packageScope(byFile[s.file]).actions);
  return v && v.type === 'SetVariable' && !/^@outputs\('[^']+'\)$/.test(String(v.inputs?.value));
}).map((n) => `${s.file}: ${n}`));
ok(!loose.length, 'every Set variable step a build added or changed takes its value from a Compose step', loose.slice(0, 5).join('; '));

/* Power Automate refuses a flow of more than 500 actions (DYNAMIC_ACTIONS at 551, 2026-10-07: ITEM-79). A package's
   flow is its scope plus the flow's other steps, read from the flow's deployed definition. */
{
  const count = (a) => Object.values(a || {}).reduce((n, x) => n + 1 + count(x.actions) + (x.else ? count(x.else.actions) : 0)
    + Object.values(x.cases || {}).reduce((m, c) => m + count(c.actions), 0) + (x.default ? count(x.default.actions) : 0), 0);
  const DEP = `${MF}/contracts/deployed`;
  const deployed = readdirSync(DEP).filter((f) => f.endsWith('.json'));
  const over = [];
  const byFlow = {};
  for (const st of status) (byFlow[st.flowId] = byFlow[st.flowId] || []).push(st);
  for (const [flowId, sts] of Object.entries(byFlow)) {
    const f = deployed.find((x) => x.includes(flowId));
    const def = f ? J(`${DEP}/${f}`) : null;
    const acts = def ? (def.definition?.properties?.definition || def.properties?.definition || def.definition || {}).actions || {} : {};
    const mine = new Set(sts.flatMap((s) => [s.root, ...(s.replaces || [])]));
    const others = count(Object.fromEntries(Object.entries(acts).filter(([n]) => !mine.has(n))));
    const scopes = sts.reduce((n, s) => n + 1 + count(packageScope(byFile[s.file]).actions), 0);
    if (others + scopes > 500) over.push(`${sts[0].flow}: ${others + scopes}`);
  }
  ok(!over.length, 'no flow exceeds 500 actions with its packages in place', over.join('; '));
}

/* The service refuses an expression longer than 8192 characters (DYNAMIC_ACTIONS, 2026-10-07). */
{
  const long = [];
  for (const [f, p] of Object.entries(pkgs)) {
    const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
      const scan = (v) => { if (typeof v === 'string') { if (v.startsWith('@') && !v.startsWith('@{') && v.length - 1 > 8192) long.push(`${f.split('/')[1]}: ${n} (${v.length - 1})`);
        for (const m of v.matchAll(/@\{/g)) { let d = 0, i = m.index + 1; for (; i < v.length; i++) { if (v[i] === '{') d++; else if (v[i] === '}' && --d === 0) break; } if (i - m.index - 2 > 8192) long.push(`${f.split('/')[1]}: ${n} (${i - m.index - 2})`); } }
        else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
      scan(a.inputs); scan(a.expression);
      walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
    } };
    walk(packageScope(p).actions);
  }
  ok(!long.length, 'no expression exceeds 8192 characters', long.slice(0, 5).join('; '));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
