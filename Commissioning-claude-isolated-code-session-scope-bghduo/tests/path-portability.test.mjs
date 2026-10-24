#!/usr/bin/env node
/**
 * Do the build scripts produce the same bytes on Windows as on Linux?
 *
 * WHY THIS EXISTS
 * `scripts/build-flow-catalogue.mjs` made a repository-relative path by slicing a `${ROOT}/`
 * prefix off the absolute path `join()` had returned. On Linux that works. On Windows `join()`
 * returns backslashes, so the prefix — built with a forward slash — matched nothing, and the
 * absolute `C:\Users\...` path survived into two places at once: the `| Definition |` row of
 * every flow page, and the lookup key into the contract register, which is keyed by
 * forward-slash paths. Every flow lost its stated purpose and gained a machine-specific path.
 * The committed catalogue then differed from a freshly built one, so `npm run test:catalogue`
 * failed on Windows and passed everywhere else — a full estate's test run red for a reason
 * that reproduced nowhere the reader could look.
 *
 * The rule below is narrow on purpose. It bans the one idiom that caused it: stripping a path
 * root off a path with string replacement. `node:path`'s `relative()` already does this
 * correctly on both platforms, and `.split(sep).join('/')` makes the result POSIX.
 *
 * Run: node tests/path-portability.test.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { trackedFiles as askGit } from '../scripts/lib/tracked-files.mjs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCAN = ['scripts', 'tests'];

let pass = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); }
};

/** Every .mjs and .js under the scanned directories, as repository-relative POSIX paths. */
function sources(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sources(rel, out);
    else if (/\.m?js$/.test(e.name)) out.push(rel);
  }
  return out;
}

/* This file carries the banned idiom twice, as string fixtures proving the rule can fire.
   Scanning itself would make those fixtures indistinguishable from a real offence. */
const SELF = relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join('/');
const files = SCAN.flatMap((d) => sources(d)).filter((f) => f !== SELF);

/* A path root sliced off with string replacement. The capture is deliberately loose about the
   variable's name — ROOT, root, REPO and dir have all been used for this in the estate. */
const SLICE = /\.replace\(\s*(?:`\$\{\s*\w+\s*\}\/`|\w+\s*\+\s*['"]\/['"])\s*,/;

console.log('\nCross-platform path handling\n');

ok('there are sources to scan', files.length > 0, `scanned ${SCAN.join(', ')}`);

const offenders = [];
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (SLICE.test(line)) offenders.push(`${f}:${i + 1} — ${line.trim()}`);
  });
}
ok(`no script slices a path root off with string replacement (${files.length} files)`,
   offenders.length === 0,
   offenders.join('\n     ') + '\n     use: relative(ROOT, p).split(sep).join(\'/\')');

/* The rule is worthless if the pattern cannot fire, so prove it on the exact text it was
   written for — the line that shipped the Windows-only failure. */
ok('the rule matches the idiom it was written to ban',
   SLICE.test("    file: file.replace(`${ROOT}/`, ''),"));
ok('the rule matches the concatenated form too',
   SLICE.test("const rel = abs.replace(ROOT + '/', '');"));
ok('the rule does not fire on an ordinary replacement',
   !SLICE.test("const t = title.replace(/[\\\\/:*?\"<>|&#%]/g, '_');"));

/* And the replacement idiom must actually be the portable one. */
const catalogue = readFileSync(join(ROOT, 'scripts/build-flow-catalogue.mjs'), 'utf8');
ok('the catalogue builds its paths with relative() and normalises the separator',
   /relative\(ROOT,\s*\w+\)\.split\(sep\)\.join\('\/'\)/.test(catalogue));
ok('sep and relative are imported where they are used',
   /import \{[^}]*\brelative\b[^}]*\bsep\b[^}]*\} from 'node:path'/.test(catalogue));

/* The second form the same defect takes: a relative path built with `join()` and written
   straight into a generated artifact. `derive-dynamic-operations.mjs` did this — on Windows the
   committed `core/api.js` came out as `core\\api.js`, so `--check` called the artifact stale
   there and nowhere else. Source rules cannot see that; the data can. No committed JSON under
   docs/ may name a repository source file with a backslash. Prose is excluded deliberately: the
   operator guides quote PowerShell commands with Windows separators on purpose. */
const WIN_PATH = /\b(core|modules|config|scripts|tests|shared)\\[A-Za-z0-9_.-]+\.(js|mjs|json|ps1)\b/;
const tracked = askGit({ root: ROOT, pathspec: ['docs'], what: 'documents to scan for Windows paths' })
  .filter((f) => f.endsWith('.json'));
const winPaths = [];
for (const f of tracked) {
  const m = readFileSync(join(ROOT, f), 'utf8').match(WIN_PATH);
  if (m) winPaths.push(`${f} — ${m[0]}`);
}
ok(`no generated artifact names a source file with a backslash (${tracked.length} JSON files)`,
   winPaths.length === 0, winPaths.join('\n     '));
ok('that rule matches the string the bug wrote',
   WIN_PATH.test('{"sources":["core\\api.js"]}'));
ok('that rule leaves a forward-slash path alone',
   !WIN_PATH.test('{"sources":["core/api.js"]}'));

/* The register is keyed by forward-slash paths; that is what made the bug silent rather than
   loud. Assert the shape, so a future change to the register's keys is caught here. */
const register = JSON.parse(readFileSync(join(ROOT, 'docs/reference/internal-flow-register.json'), 'utf8'));
const defPaths = (register.contractKeys || []).flatMap((c) => c.definitions || []);
ok('the contract register keys definitions by forward-slash paths',
   defPaths.length > 0 && defPaths.every((p) => !p.includes('\\')),
   `${defPaths.length} definition path(s)`);

/* Guard the helper itself: on this platform it must return the committed form. */
const sample = join(ROOT, 'docs', 'reference', 'flow-contracts', 'deployed');
ok('relative()+sep yields a forward-slash repository path on this platform',
   relative(ROOT, sample).split(sep).join('/') === 'docs/reference/flow-contracts/deployed');

console.log(`\n${failures.length ? `❌ ${failures.length} failed` : `✅ ${pass} passed`}\n`);
process.exit(failures.length ? 1 : 0);
