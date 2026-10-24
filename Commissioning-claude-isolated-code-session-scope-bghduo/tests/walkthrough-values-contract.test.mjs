#!/usr/bin/env node
/**
 * The walkthrough must describe the values file the tooling actually produces.
 *
 * WHY THIS SUITE EXISTS
 *
 * GOVERNANCE-STATUS.md §A.2 tells the reader to run `npm run values:template`, and §A.3 told
 * them to "copy the HTTP POST URL and paste it after the `=`". Those two instructions contradict
 * each other, and the second is wrong: `values:template` emits every line already complete —
 * host, routing segment, workflow id — ending `&sv=1.0&sig=`, and the only thing missing is the
 * 43-character signature. Following §A.3 literally produced a value carrying two `sig=`
 * parameters: a line that looks filled in and does not authenticate.
 *
 * Nothing caught it. The generator's own checks confirmed every command it named existed and
 * every GUID resolved — the instruction was wrong about the SHAPE of what the command emits, and
 * shape is not something a name check can see.
 *
 * So this suite runs the real generator into a temporary file and asserts the document against
 * what actually came out. It is the difference between "the command exists" and "the sentence
 * about the command is true".
 *
 * Usage:  node tests/walkthrough-values-contract.test.mjs
 * Exit:   0 = the walkthrough matches the emitted template, 1 = otherwise
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-STATUS.md');
const ROTATION = path.join(ROOT, 'docs/deployment/rotation/values.template.txt');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const doc = fs.readFileSync(DOC, 'utf8');

/* Emit a real template into a temp file. It carries no signatures — every line ends at `sig=` —
   so nothing secret is written, but it goes outside the repository regardless. */
const tmp = path.join(os.tmpdir(), `dgo-values-contract-${process.pid}.txt`);
execFileSync(process.execPath, [path.join(ROOT, 'scripts/make-values-template.mjs'), tmp], { stdio: 'ignore' });
const emitted = fs.readFileSync(tmp, 'utf8');
fs.unlinkSync(tmp);

const dataLines = emitted.split('\n').filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));
const values = dataLines.map((l) => l.slice(l.indexOf('=') + 1));

console.log('\nWalkthrough ↔ values template contract\n');

check('the template emits one line per contract key', () => {
  const register = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/endpoint-register.json'), 'utf8'));
  assert(dataLines.length === register.current_configuration.length,
    `the template emits ${dataLines.length} keys; the register carries ${register.current_configuration.length}`);
});

check('every emitted line is pre-filled and ends at sig=', () => {
  const notPrefilled = dataLines.filter((l, i) => values[i].length < 40);
  assert(notPrefilled.length === 0,
    `${notPrefilled.length} line(s) are not pre-filled — the walkthrough says the URL is already there`);
  const notEndingAtSig = dataLines.filter((l, i) => !/[?&]sig=$/.test(values[i]));
  assert(notEndingAtSig.length === 0,
    `${notEndingAtSig.length} line(s) do not end at 'sig=' — the walkthrough says the signature is the only missing part`);
});

check('no emitted line carries a signature', () => {
  /* A template that shipped a real sig would make every copy of it a credential file. */
  const withSig = dataLines.filter((l, i) => /[?&]sig=.+/.test(values[i]));
  assert(withSig.length === 0, `${withSig.length} template line(s) already carry a signature`);
});

check('the walkthrough tells the reader to paste the signature, not the URL', () => {
  assert(/only the part after \\?`?sig=/.test(doc) || /copy \*\*only the part after/.test(doc),
    'the walkthrough does not say to copy only the part after sig=');
  assert(/Do not replace the whole line/i.test(doc),
    'the walkthrough does not warn against replacing the whole line — the mistake it is correcting');
  assert(/43 characters/.test(doc), 'the walkthrough does not state the 43-character signature length');
  assert(!/copy the \*\*HTTP POST URL\*\* → paste\s*\n?it after the/.test(doc),
    'the walkthrough still instructs pasting the whole HTTP POST URL after the "=" — that produces two sig= parameters');
});

check('the walkthrough states the exact tail the reader will see', () => {
  const tail = /&sv=1\.0&sig=$/.test(values[0]) ? '&sv=1.0&sig=' : null;
  assert(tail, 'the emitted template no longer ends &sv=1.0&sig= — the walkthrough quotes that tail verbatim');
  assert(doc.includes(tail),
    `the walkthrough does not quote the tail the template actually emits (${tail})`);
});

check('the walkthrough reconciles the second, competing values template', () => {
  assert(fs.existsSync(ROTATION), 'the rotation values template is gone — the walkthrough still describes it');
  assert(doc.includes('rotation/values.template.txt'),
    'the walkthrough does not mention the rotation worksheet. Two templates for one job, unreconciled, '
    + 'is how this estate produced fifteen competing commissioning documents.');
  assert(/bare/.test(doc) && /accepts \*\*both\*\* key forms/.test(doc),
    'the walkthrough does not state that setup accepts both key forms');
});

check('no bare key name is ambiguous across the two surfaces', () => {
  /* The claim the walkthrough makes about the rotation worksheet being usable rests on this. */
  const names = dataLines.map((l) => l.split('=')[0]);
  const runtime = names.filter((k) => k.startsWith('DGO_ENDPOINT_')).map((k) => k.slice('DGO_ENDPOINT_'.length));
  const portal = names.filter((k) => k.startsWith('PF_ENDPOINT_')).map((k) => k.slice('PF_ENDPOINT_'.length));
  const collide = runtime.filter((k) => portal.includes(k));
  assert(collide.length === 0,
    `${collide.length} bare key name(s) exist on both surfaces: ${collide.join(', ')}. `
    + 'A bare-key values file would be ambiguous, and the walkthrough says it is not.');
});

check('setup really does accept a bare key', () => {
  /* The walkthrough cites scripts/setup.mjs for this. If the fallback is removed, the rotation
     worksheet silently stops working and the document goes on saying it does. */
  const setup = fs.readFileSync(path.join(ROOT, 'scripts/setup.mjs'), 'utf8');
  assert(/\[\.\.\.prefixes\.map\(p => p \+ key\), key\]/.test(setup),
    'setup.mjs no longer falls back to the bare key name — the walkthrough claims it does');
});

check('the rotation worksheet header agrees with the rotation register', () => {
  /* The pasted-from-an-old-clone case: a stale copy reads 12/9/4 and sends an operator to rotate
     twelve flows that do not need it. The walkthrough quotes the current counts, so they must be
     the current counts. */
  const rot = fs.readFileSync(ROTATION, 'utf8');
  const need = /(\d+) keys need a NEW url/.exec(rot);
  const unaffected = /(\d+) keys are unaffected/.exec(rot);
  const unknown = /(\d+) keys have no workflow id recorded/.exec(rot);
  assert(need && unaffected && unknown, 'the rotation worksheet no longer states its three counts');
  assert(doc.includes(`\`${need[1]} keys need a NEW url\``),
    `the walkthrough quotes a different disclosure count than the worksheet's ${need[1]}`);
  assert(doc.includes(`\`${unaffected[1]} keys are unaffected\``),
    `the walkthrough quotes a different unaffected count than the worksheet's ${unaffected[1]}`);
});

check('every generated browser script that writes carries a relay block', () => {
  /* Under the paired posture the agent's only view of the tenant is what a human copies out of a
     console. console.table copies as one unbroken string, and a whole-console paste also contains
     the pasted script — whose source mentions every verdict its ledger can produce. Both misreads
     happened during this estate's own execution. The relay line is one line of JSON carrying its
     own provenance, so it survives the copy and cannot be confused with the script. */
  const WRITERS = [
    'provision-governance-lists.browser.js',
    'cleanup-disambiguated-columns.browser.js',
    'retire-duplicate-governance-lists.browser.js',
    'provision-flow-registry-lists.browser.js',
    'compare-duplicate-governance-lists.browser.js',
    'remediate-governance-strays.browser.js',
  ];
  const missing = [];
  for (const f of WRITERS) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    const has = /RELAY: COPY THE SINGLE LINE BELOW/.test(src)
      && /END RELAY/.test(src)
      && /JSON\.stringify\(_payload\)/.test(src);
    if (!has) missing.push(f);
  }
  assert(missing.length === 0,
    `${missing.length} script(s) have no relay block: ${missing.join(', ')}. `
    + 'Their output cannot be relayed reliably by a human operator.');
});

check('the brief documents the relay protocol it depends on', () => {
  const brief = fs.readFileSync(path.join(ROOT, 'docs/deployment/governance/EXECUTION-AGENT-BRIEF.md'), 'utf8');
  assert(/0\.B Working under option 2/.test(brief), 'the brief has no pairing protocol');
  assert(/COPY THE SINGLE LINE BELOW/.test(brief),
    'the brief does not quote the relay marker the scripts actually print');
  assert(/Never infer a count from a pasted table/.test(brief),
    'the brief does not forbid reading counts from a pasted table');
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
