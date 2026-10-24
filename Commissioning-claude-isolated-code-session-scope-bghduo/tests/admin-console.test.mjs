#!/usr/bin/env node
/**
 * The standalone console is a COMMITTED ARTEFACT. That changes what has to be checked.
 *
 * `tools/admin-console.html` is not built on demand by the person using it. It is generated once,
 * committed, and then copied — onto a USB stick, into an email, onto a phone, into a handover
 * folder. Three consequences follow, and each is an assertion here:
 *
 *   1. **A credential in it is published.** Not "could be exposed" — published, to everyone who
 *      ever receives a copy, permanently, with no way to recall it. The generator refuses to
 *      write a file carrying a signature; this checks the file that is actually committed,
 *      because those are different things and only the second one gets distributed.
 *
 *   2. **A syntax error in it is a blank page, silently.** The whole console is one inline
 *      script. There is no bundler to fail, no server to log, and no reason for anyone to open
 *      the console until the moment they need it — which is the moment it must not be blank.
 *      This happened: stripping `export` from the analysis turned `export default X;` into
 *      `default X;`, and the generator wrote it out happily because it only scanned for
 *      signatures. It is parsed here as well as at build time.
 *
 *   3. **It must not drift from the platform's console.** Both answer "is this endpoint
 *      healthy?" and they must not answer differently. The analysis is embedded from
 *      `core/endpoint-atlas.js` rather than reimplemented, and `npm run console -- --check`
 *      fails when the committed file no longer matches what the sources produce now.
 *
 * The browser half — that it opens from file://, that every tab renders, and that a signature
 * loaded at runtime is redacted rather than displayed — is tests/admin-console.spec.js.
 *
 * Usage:  node tests/admin-console.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'tools/admin-console.html';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* `html.includes('function foo')` is satisfied by `function fooX` — renaming a function would
   slip past it, which is exactly what a mutation test caught. Defined AND called, both anchored
   on a word boundary, so a rename breaks the assertion the way it breaks the console. */
const defines = (name) => new RegExp('function\\s+' + name + '\\s*\\(').test(html);
const calls = (name) => new RegExp('(?<!function\\s)\\b' + name + '\\s*\\(').test(html);
const provides = (name) => defines(name) && calls(name);

console.log('\nStandalone administrative console\n');

const html = read(OUT);

check('it is committed, and it is one self-contained file', () => {
  assert(html.length > 20_000, `only ${html.length} bytes — the console cannot be complete`);
  /* No external resource of any kind. A <script src>, a <link rel=stylesheet> or a webfont would
     each turn "opens from a USB stick on a plane" into "opens if you happen to be online". */
  assert(!/<script[^>]+\bsrc=/i.test(html), 'an external script is referenced — it would not run offline');
  assert(!/<link[^>]+stylesheet/i.test(html), 'an external stylesheet is referenced');
  assert(!/https?:\/\/(?!defaultca6a4b3f|prod-)[a-z0-9.-]+\/[^"'\s]*\.(js|css|woff2?)/i.test(html),
    'a remote asset is referenced');
});

check('no signature is present in the artefact that gets distributed', () => {
  const withValue = html.match(/sig=[A-Za-z0-9_%-]+/g) || [];
  assert(withValue.length === 0,
    `${withValue.length} sig= parameter(s) carry a value — this file is copied onto USB sticks and emailed`);
  /* Length-shaped too, in case a signature arrives under some other parameter name. `sig=` on
     its own is the deliberate template ending and is expected. */
  assert(!/=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(html),
    'a 43-character value is present — that is the shape of a signature');
});

check('no personal data travels with it', () => {
  const emails = [...new Set(html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi) || [])];
  assert(emails.length === 0, `${emails.length} email address(es) are embedded: ${emails.slice(0, 3).join(', ')}`);
});

check('the inline script parses, so it cannot open as a blank page', () => {
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  assert(open !== -1 && close > open, 'no inline script found — the console has no logic in it');
  const src = html.slice(open + '<script>'.length, close);
  try { new Function(src); }
  catch (e) { throw new Error(`the console does not parse: ${e.message}`); }
});

check('it embeds the whole estate, both surfaces', () => {
  const m = /const EndpointAtlas = (\{[\s\S]*?\n\});\n/.exec(html);
  assert(m, 'the atlas is not embedded — the console would have nothing to show');
  const atlas = JSON.parse(m[1]);
  assert(atlas.keys.length === 25, `${atlas.keys.length} keys embedded, expected 25`);
  assert(atlas.workflows.length > atlas.keys.length,
    'no more workflows than keys — the estate view and the name-collision finding need the rest');
  assert(atlas.keys.some((k) => k.surface === 'portal'),
    'the portal keys are absent, and they are visible from nowhere else');
  assert(atlas.keys.every((k) => /[?&]sig=$/.test(k.urlTemplate || '')),
    'a URL template does not stop at sig=');
});

check('the analysis is the platform\'s, embedded rather than reimplemented', () => {
  /* Named functions from core/endpoint-atlas.js. If the console ever grew its own copy of these,
     the two consoles could disagree about whether an endpoint is healthy — which is worse than
     having only one of them. */
  for (const fn of ['function describeKey', 'function describeEstate', 'function findings',
                    'function summarise', 'function exportReport']) {
    assert(html.includes(fn), `${fn} is not embedded — the console is not using the shared analysis`);
  }
  assert(html.includes('function redact'), 'redact() is not embedded, so nothing guarantees the display is safe');
  /* And it must be the real one, not a stub. */
  assert(/\['sig', 'sv', 'sp', 'code'\]/.test(html), 'the embedded redact() does not redact the signature parameter');
});

check('it depends on neither platform', () => {
  /* Dependency means LOADING something, not naming it. The console necessarily says
     "document-portal/config.local.js" — that is the file it generates for you, and a check that
     forbade the words would forbid telling the operator where to put it. What must not exist is
     an import, a fetch, or a src/href reaching into either platform. */
  const loads = [
    [/\bimport\s*\(?\s*['"][^'"]*(?:core|config|modules|document-portal)\//, 'an import'],
    [/\bfetch\s*\(\s*['"][^'"]*(?:core|config|modules|document-portal)\//, 'a fetch'],
    [/(?:src|href)\s*=\s*["'][^"']*(?:\.\.\/|core\/|modules\/|document-portal\/)/, 'a src or href'],
  ];
  for (const [re, what] of loads) {
    assert(!re.test(html), `${what} reaches into a platform this console must stand outside of`);
  }
  /* And the positive form: everything it needs is already inside it. */
  assert(html.includes('const EndpointAtlas = {'), 'the estate is not inlined, so it must be loading it from somewhere');
});

check('it stores nothing — a signature loaded into it dies with the tab', () => {
  /* The whole point of a standalone tool is that it is opened on machines nobody controls. A
     signature written to localStorage there outlives the tab, the session, and the person's
     memory of having pasted it. */
  /* Matched as USE, not as mention: `localStorage.setItem`, `localStorage[...]`, `indexedDB.open`.
     A bare word-scan fails on the comment in the console that says localStorage is deliberately
     not used — and a check that forbids documenting a decision is a check people delete. */
  for (const api of ['localStorage', 'sessionStorage', 'indexedDB']) {
    const used = new RegExp(`\\b${api}\\s*[.\\[]`).test(html);
    assert(!used, `${api} is written to — a loaded credential could outlive the tab`);
  }
  assert(!/document\.cookie\s*=/.test(html), 'a cookie is set — a loaded credential could outlive the tab');
});

check('it commissions — it generates both config files, not just a report', () => {
  /* The first version of this console was read-only, and that limit was never asked for. An
     administrator holding it could SEE that a key was unsigned and could do nothing about it
     without a checkout, Node and a terminal — the exact situation a standalone tool exists to
     serve. These assert the capability is present and complete. */
  assert(provides('renderRuntimeConfig'), 'the internal config generator is missing or never called');
  assert(provides('renderPortalConfig'), 'the portal config generator is missing or never called');
  assert(html.includes('window.DGO_CONFIG.endpoints = Object.assign({'),
    'the generated internal config assigns rather than merges — that silently breaks every harness '
    + 'that injects window.DGO_CONFIG before the module graph evaluates');
  assert(html.includes('window.PF_CONFIG.endpoints = Object.assign({'),
    'the generated portal config assigns rather than merges');
  assert(provides('applySignature'), 'signatures cannot be entered');
  assert(provides('valuesFileText'), 'it cannot produce a values file');
  assert(provides('readiness'), 'it does not apply the commissioning gate');
});

check('it reaches no server that could change an estate', () => {
  /* Generating a file the operator downloads is the deliverable. Reaching out and CHANGING
     something from an unaudited machine is not — the only outbound calls are the probes. */
  assert(!/method:\s*['"](PUT|PATCH|DELETE)['"]/i.test(html), 'a mutating HTTP method is used');
  assert(html.includes('readOnly === true'),
    'the probe does not filter to read-only contracts — it could dispatch correspondence as a side effect');
  /* Write probes exist, because withholding a capability the administrator needs is what the
     first version got wrong. They are off by default and confirmed, because they create real
     correspondence in a live registry. */
  assert(html.includes('view.includeWrites'), 'write endpoints cannot be probed at all — that is a withheld capability');
  assert(/!view\.includeWrites/.test(html), 'write probes are not gated behind the opt-in');
  assert(/confirm\('Probe ' \+ writes\.length \+ ' WRITE endpoint/.test(html),
    'write probes are not confirmed — they create real records');
});

check('it carries the full administrative surface, not a subset', () => {
  /* Named so a capability cannot quietly disappear in a later build. Each is a tab an
     administrator was told they have. */
  for (const [fn, what] of [
    ['overviewPanel', 'the readiness overview'],
    ['commissionPanel', 'the commissioning workspace'],
    ['endpointsPanel', 'the endpoint inventory'],
    ['estatePanel', 'the flow estate'],
    ['workflowPanel', 'workflow drill-down'],
    ['findingsPanel', 'findings'],
    ['healthPanel', 'live health'],
    ['rotationPanel', 'the rotation plan'],
    ['comparePanel', 'deployment comparison'],
    ['exportPanel', 'export'],
    ['referencePanel', 'reference'],
  ]) assert(provides(fn), `${what} is missing or never rendered`);
  assert(provides('estateCsv') && html.includes('window.print()'), 'CSV or print export is missing');
  assert(/hashchange/.test(html), 'tabs are not deep-linkable');
});

check('--check fails when the committed file drifts from its sources', () => {
  const clean = spawnSync(process.execPath, ['scripts/build-admin-console.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert(clean.status === 0, `--check failed on an up-to-date file:\n${clean.stderr || clean.stdout}`);

  const target = path.join(ROOT, OUT);
  const original = fs.readFileSync(target, 'utf8');
  try {
    fs.writeFileSync(target, original.replace('<title>', '<title>DRIFTED '));
    const dirty = spawnSync(process.execPath, ['scripts/build-admin-console.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert(dirty.status === 1, `--check passed a drifted file (exit ${dirty.status})`);
  } finally { fs.writeFileSync(target, original); }
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
