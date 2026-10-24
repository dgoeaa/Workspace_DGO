#!/usr/bin/env node
/**
 * Run the GOV-11 verifier against a fake tenant.
 *
 * WHY THIS IS EXECUTED AND NOT GREPPED
 *
 * The verifier's whole reason for existing is that a column can be present and unaddressable at
 * the same time: the out-of-band scripts called `createfieldasxml` with `Options: 0`, so
 * SharePoint was free to derive each internal name from the display name instead of taking the
 * `Name` the script asked for. A column created as `Registry_x0020_Key` looks correct in every
 * view and is invisible to every flow that addresses `RegistryKey`.
 *
 * A verifier that answered present/absent would report that column as present, and the report
 * would be worse than no report — it is the "checks that verify shape while the meaning is wrong"
 * failure, which this estate has now paid for three times. Asserting that the emitted file
 * *contains* the string `DERIVED NAME` does not establish that it ever *reaches* it.
 *
 * So this stands up a fake SharePoint and asserts on the verdicts the script actually produces
 * for four tenants that differ only in what the fields came back as.
 *
 * Usage:  node tests/flow-truth-verifier.test.mjs
 * Exit:   0 = every guard holds, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/verify-flow-truth-provisioning.browser.js');
const SOURCE = path.join(ROOT, 'docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_BROWSER_CONSOLE1.js');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

if (!fs.existsSync(SCRIPT)) {
  console.error('\n  ✖  scripts/verify-flow-truth-provisioning.browser.js is missing. Run: npm run governance:flowtruthverifier\n');
  process.exit(1);
}
const src = fs.readFileSync(SCRIPT, 'utf8');

/** SharePoint's internal-name encoding for a display name, when the Name hint is not given. */
const derive = (displayName) => displayName.replace(/[^A-Za-z0-9]/g, (c) => `_x${c.charCodeAt(0).toString(16).padStart(4, '0')}_`);

/**
 * Run the emitted verifier against a tenant described by `shape`.
 *
 * @param {'asked'|'derived'|'duplicated'|'absent-lists'} shape how the fake tenant answers
 * @param {{requiredCleared?: boolean}} [opts]
 * @returns {Promise<{ledger: object[], lines: string[]}>}
 */
async function run(shape, opts = {}) {
  const lines = [];

  const fieldsFor = (fieldDefs) => {
    const out = [];
    for (const f of fieldDefs) {
      const common = {
        Title: f.displayName,
        Required: opts.requiredCleared ? false : f.required,
        Indexed: true,
        EnforceUniqueValues: f.askedFor === 'RegistryKey' || f.askedFor === 'HistoryKey',
        FromBaseType: false,
        CanBeDeleted: true,
      };
      if (shape === 'derived') out.push({ ...common, InternalName: derive(f.displayName) });
      else if (shape === 'duplicated') {
        out.push({ ...common, InternalName: f.askedFor });
        out.push({ ...common, InternalName: `${f.askedFor}0` });
      } else out.push({ ...common, InternalName: f.askedFor });
    }
    return out;
  };

  const fetchStub = async (url) => {
    const ok = (body) => ({ ok: true, status: 200, headers: new Map(), json: async () => body });
    if (shape === 'absent-lists') return { ok: false, status: 404, headers: new Map(), json: async () => ({}) };

    const title = /getbytitle\('([^']+)'\)/.exec(url)?.[1];
    if (title) {
      return ok({ Id: '11111111-2222-3333-4444-555555555555', Title: title, BaseTemplate: 100, ItemCount: 0, Created: '2026-09-10T00:00:00Z' });
    }
    if (url.includes('/fields')) {
      const resource = context.RESOURCES[fetchStub._n++ % context.RESOURCES.length];
      return ok({ value: fieldsFor(resource.fields) });
    }
    throw new Error(`unexpected request ${url}`);
  };
  fetchStub._n = 0;

  const captured = [];
  const context = vm.createContext({
    fetch: fetchStub,
    setTimeout,
    console: {
      log: (...a) => { lines.push(a.map(String).join(' ')); },
      warn: () => {},
      error: (...a) => { lines.push(a.map(String).join(' ')); },
      table: (rows) => { captured.push(...rows); },
    },
  });

  /* The emitted file is an IIFE. Evaluating it exposes nothing, so RESOURCES is lifted out of the
     same source rather than retyped — the fake tenant must answer with the columns the real
     script asks for, or the test proves nothing about the real script. */
  const resourcesJson = /const RESOURCES = (\[[\s\S]*?\n\]);/.exec(src);
  assert(resourcesJson, 'RESOURCES could not be read out of the emitted verifier');
  context.RESOURCES = JSON.parse(resourcesJson[1]);

  await vm.runInContext(`(async () => { ${src} })()`, context, { timeout: 20000 });
  await new Promise((r) => setImmediate(r));
  return { ledger: captured, lines };
}

console.log('\nGOV-11 flow-truth verifier — behaviour against a fake tenant\n');

const verdicts = (ledger) => new Set(ledger.map((r) => r.verdict));
const countOf = (ledger, v) => ledger.filter((r) => r.verdict === v).length;

const asked = await run('asked');
const derived = await run('derived');
const duplicated = await run('duplicated');
const absent = await run('absent-lists');
const cleared = await run('asked', { requiredCleared: true });

check('a tenant that honoured the Name attribute reports asked-name and nothing worse', () => {
  assert(countOf(asked.ledger, 'asked-name') > 0, 'no column reported under the asked name');
  for (const bad of ['DERIVED NAME', 'DUPLICATED', 'REQUIRED CLEARED', 'absent']) {
    assert(!verdicts(asked.ledger).has(bad), `a clean tenant produced ${bad}`);
  }
});

check('a tenant that DERIVED the internal names is not reported as correct', () => {
  assert(countOf(derived.ledger, 'DERIVED NAME') > 0,
    'every column came back under a SharePoint-derived name and the verifier did not say so — this is the defect the verifier exists to catch');

  /* Two of the ninety columns — `Criticality` on each list — are declared with a display name
     identical to their internal name, so SharePoint derives the same string either way and there
     is nothing to report. Every other column must be flagged. Asserting "zero asked-name" would
     fail on those two and would be asserting something untrue. */
  const resources = JSON.parse(/const RESOURCES = (\[[\s\S]*?\n\]);/.exec(src)[1]);
  const unaffected = new Set(
    resources.flatMap((r) => r.fields.filter((f) => derive(f.displayName) === f.askedFor).map((f) => f.askedFor)),
  );
  for (const row of derived.ledger) {
    if (row.verdict !== 'asked-name') continue;
    assert(unaffected.has(row.column),
      `${row.column} came back under a derived internal name and was reported as correct`);
  }
});

check('the derived-name row names the internal name actually found', () => {
  const row = derived.ledger.find((r) => r.verdict === 'DERIVED NAME');
  assert(/_x0020_/.test(row.detail), `the detail does not carry the name found: ${row.detail}`);
});

check('a re-run leaves digit-suffixed siblings and is reported as DUPLICATED', () => {
  assert(countOf(duplicated.ledger, 'DUPLICATED') > 0, 'a second run produced no DUPLICATED verdict');
  assert(countOf(duplicated.ledger, 'asked-name') === 0, 'a duplicated column was also counted as clean');
});

check('a tenant without the resources reports absent and concludes nothing else', () => {
  const whole = absent.ledger.filter((r) => r.column === '(whole resource)');
  assert(whole.length > 0 && whole.every((r) => r.verdict === 'absent'), 'a 404 was not reported as absent');
  assert(absent.lines.some((l) => /did not reach this tenant/.test(l)), 'the empty case did not say so plainly');
});

check("RESUME_FIX's cleared Required flag is detected", () => {
  assert(countOf(cleared.ledger, 'REQUIRED CLEARED') > 0,
    'a tenant whose Required flags were cleared reported nothing');
});

check('both sites are asked, not just the authoritative one', () => {
  const sites = new Set(asked.ledger.map((r) => r.site));
  assert(sites.size >= 2, `only ${sites.size} site(s) were asked; neither script recorded which it used`);
});

check('the emitted verifier writes nothing', () => {
  assert(!/method:\s*'POST'/.test(src) && !/X-RequestDigest/.test(src),
    'the verifier issues a write; it is declared read-only in the brief and in GOV-11');
});

check('the expected columns are derived from the executed script, not typed', () => {
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/build-flow-truth-verifier.mjs'), 'utf8');
  assert(gen.includes('vm.runInContext'), 'the generator no longer evaluates the executed script');
  const source = fs.readFileSync(SOURCE, 'utf8');
  const resources = JSON.parse(/const RESOURCES = (\[[\s\S]*?\n\]);/.exec(src)[1]);
  for (const r of resources) {
    for (const f of r.fields) {
      assert(source.includes(`"${f.askedFor}"`), `${f.askedFor} is not in the executed script; the verifier is checking something that was never asked for`);
    }
  }
});

check('the out-of-band evidence is held verbatim', () => {
  for (const f of [
    'docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_BROWSER_CONSOLE1.js',
    'docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_RESUME_FIX.js',
  ]) {
    assert(fs.existsSync(path.join(ROOT, f)), `${f} is missing; GOV-11 cannot be measured without it`);
  }
  const console1 = fs.readFileSync(SOURCE, 'utf8');
  assert(/Options:\s*0\b/.test(console1),
    'the executed script no longer calls createfieldasxml with Options: 0 — it has been edited, and it is evidence');
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error(failures.map((f) => `  ✖  ${f}`).join('\n\n'));
  process.exit(1);
}
