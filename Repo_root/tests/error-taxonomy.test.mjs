#!/usr/bin/env node
/**
 * The internal platform's error taxonomy, held to its own declaration.
 *
 * WHY THIS EXISTS
 *
 * `core/errors.js` declares fifteen error classes in a frozen object and `normalizeError()`
 * falls back to `UNKNOWN_ERROR` for anything it does not recognise. That fallback is correct
 * behaviour for a genuinely unknown error and a silent swallow for a typo: `ErrorClass.DISPATCH_FAILD`
 * is `undefined`, `createError(undefined, …)` produces an `ObsidianError` whose `errorClass` is
 * `undefined`, and `normalizeError` then reports it as `UNKNOWN_ERROR` with the right message
 * attached. Nothing throws, nothing logs, and an error that had a name loses it — which matters
 * because `errorClass` is what the UI branches on and what the audit log records.
 *
 * Fifteen classes across twenty-three call sites is small enough that this has not happened yet.
 * It is also small enough that checking costs a second.
 *
 * SCOPE — THE INTERNAL PLATFORM ONLY, DELIBERATELY
 *
 * `document-portal/` has no taxonomy to check. It reports failures as ad-hoc strings —
 * `data.error`, `data.reason`, `'refused'`, `'registry-error'` — and never imports `ErrorClass`.
 * That is not an oversight this test should paper over by pretending a shared vocabulary exists:
 * the two platforms are independently deployable and do not share code, and giving the portal a
 * taxonomy is a product decision for its owner, not something a test can assert into being.
 * Enumerating the portal's failure reasons is DOC-3006's subject. This file checks what is
 * actually declared, where it is actually declared.
 *
 * Run: node tests/error-taxonomy.test.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = 'core/errors.js';
/** The internal platform's trees. `document-portal/` is out of scope — see the header. */
const SCAN = ['core', 'modules', 'shared', 'config'];

const failures = [];
let passed = 0;
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Every .js file under the scanned trees, as repository-relative POSIX paths. */
function sources(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(rel, out);
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const files = SCAN.flatMap((d) => sources(d));
const { ErrorClass } = await import(pathToFileURL(join(ROOT, SOURCE)).href);
const declared = new Set(Object.keys(ErrorClass));

console.log('\nError taxonomy\n');

check('the taxonomy is frozen', () => {
  assert(Object.isFrozen(ErrorClass),
    `${SOURCE} exports ErrorClass without Object.freeze. A taxonomy a caller can extend at run `
    + `time is not a taxonomy.`);
});

check('every declared class maps to its own name', () => {
  const wrong = Object.entries(ErrorClass).filter(([k, v]) => k !== v).map(([k, v]) => `${k} -> '${v}'`);
  assert(!wrong.length,
    `${wrong.length} class(es) do not equal their own key, so the value that reaches the audit log `
    + `is not the name the code reads:\n      ${wrong.join('\n      ')}`);
});

check('every ErrorClass reference resolves to a declared class', () => {
  const bad = [];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const re = /\bErrorClass\.([A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (!declared.has(m[1])) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${rel}:${line}  ErrorClass.${m[1]}`);
      }
    }
  }
  assert(!bad.length,
    `${bad.length} reference(s) name a class ${SOURCE} does not declare. Each resolves to `
    + `undefined, and normalizeError() then reports it as UNKNOWN_ERROR — the error keeps its `
    + `message and loses its name:\n      ${bad.join('\n      ')}`);
});

check('every declared class is used', () => {
  const body = files.map((rel) => readFileSync(join(ROOT, rel), 'utf8')).join('\n');
  const unused = [...declared].filter((k) => !new RegExp(`\\bErrorClass\\.${k}\\b`).test(body));
  assert(!unused.length,
    `${unused.length} declared class(es) are never referenced. Either the code that raised them `
    + `is gone — in which case remove them — or a call site is spelling one of them differently:\n`
    + `      ${unused.join('\n      ')}`);
});

check('every error is constructed from the taxonomy, not a string', () => {
  const bad = [];
  for (const rel of files) {
    if (rel === SOURCE) continue;   // the factories themselves take the class as a parameter
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const re = /\b(?:createError|new ObsidianError)\s*\(\s*(['"`])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(`${rel}:${line}`);
    }
  }
  assert(!bad.length,
    `${bad.length} call site(s) pass a string literal as the error class instead of an ErrorClass `
    + `member. A literal cannot be checked by this test or by a reader:\n      ${bad.join('\n      ')}`);
});

console.log('');
console.log(`  declared classes   ${declared.size}`);
console.log(`  files scanned      ${files.length}  (${SCAN.join(', ')})`);
console.log('');
console.log('  document-portal/ is out of scope: it has no taxonomy to check. See DOC-3006.');

if (failures.length) {
  console.error(`\n❌ ${passed} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log(`\n✅ ${passed} passed, 0 failed\n`);
