#!/usr/bin/env node
/**
 * `scripts/fetch-values-file.mjs` — the step that turns a trigger URL into a values file.
 *
 * WHY THIS SUITE EXISTS
 * The documented sequence was a shell block to paste into Termux, ending in a curl that read the
 * URL from the clipboard. On a phone that is circular — the clipboard is also how the commands
 * arrive — and run as written it pasted the instructions over the URL. curl answered
 * `empty string within braces`, which explains nothing.
 *
 * A length check was meant to catch it. The command block was 308 characters, inside the range
 * quoted for a real URL, so it passed. **Length is not a shape.** Everything below tests shape.
 *
 * Run: node tests/fetch-values-file.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { validateTriggerUrl, expectedScopeBuild, reportStaleScope } from '../scripts/fetch-values-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts/fetch-values-file.mjs');

let passed = 0, failed = 0;
const is = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

/* Assembled so this file cannot itself trip the leak ratchet, and 43 characters because that is
   what a real signature is. */
const SIG = 'S'.repeat(43);
const GOOD = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com'
  + '/powerautomate/automations/direct/cu/11/workflows/aa662769f13a4666bfadf3039cd8d247'
  + `/triggers/manual/paths/invoke?api-version=1&sp=/triggers/manual/run&sv=1.0&${['s','i','g'].join('')}=${SIG}`;

/* Verbatim shape of what was actually on the clipboard when this went wrong. */
const THE_BLOCK = [
  'cd ~/ecm_docs_dev',
  'git pull origin claude/system-remediation-gaps-ahpmsy',
  'umask 077',
  'HARVEST_URL="$(termux-clipboard-get)"',
  'echo "${#HARVEST_URL} characters"',
  'curl -sS -X POST -H \'Content-Type: application/json\' -d \'{}\' "$HARVEST_URL" -o ~/dgo-values.txt',
  'unset HARVEST_URL',
].join('\n');

console.log('\nFetching the values file\n');

section('  THE FAILURE THIS EXISTS FOR');
{
  const r = validateTriggerUrl(THE_BLOCK);
  is('the command block is refused', !r.ok);
  is('and it is refused for being multi-line, not for its length',
     r.why.some((w) => /several lines/.test(w)));
  is('and it says the clipboard held the commands, which is the actual diagnosis',
     r.why.some((w) => /command block itself/.test(w)), r.why.join(' | '));
  is('a length check alone would NOT have caught it',
     THE_BLOCK.length > 250 && THE_BLOCK.length < 400,
     `${THE_BLOCK.length} chars — inside the range quoted for a real trigger URL`);
}

section('  SHAPE — what separates a signed invoke URL from anything else');
{
  is('a well-formed trigger URL is accepted', validateTriggerUrl(GOOD).ok,
     JSON.stringify(validateTriggerUrl(GOOD).why || []));
  const cases = [
    ['an empty clipboard', '   ', /nothing was on the clipboard/],
    ['plain http', GOOD.replace(/^https/, 'http'), /https:\/\//],
    ['a URL with no signature', GOOD.replace(/&sig=.*$/, ''), /no signature/],
    ['a signature too short to be one', GOOD.replace(/=S+$/, '=SHORT'), /too short/],
    ['a path that names no trigger', GOOD.replace('/triggers/manual', '/nothing/manual'), /names no trigger/],
    ['a path that is not an invoke path', GOOD.replace('/paths/invoke?', '/paths/other?'), /paths\/invoke/],
    ['a URL with a space in it', GOOD.replace('?api-version', ' ?api-version'), /whitespace/],
    ['a sentence', 'please paste the url here', /https:\/\//],
  ];
  for (const [label, value, expect] of cases) {
    const r = validateTriggerUrl(value);
    is(`${label} is refused, and the reason says why`,
       !r.ok && r.why.some((w) => expect.test(w)),
       r.ok ? 'ACCEPTED' : r.why.join(' | '));
  }
}

section('  IT NEVER ECHOES A CREDENTIAL');
{
  const nearMiss = GOOD.replace('/paths/invoke?', '/paths/other?');   /* still carries the sig */
  is('a value that starts https:// is never echoed, even when refused',
     validateTriggerUrl(nearMiss).shown === null,
     'a near-miss URL still carries a live signature');
  is('a value that is not a URL at all IS echoed, briefly — that is how you diagnose it',
     (validateTriggerUrl(THE_BLOCK).shown || '').startsWith('cd ~/ecm_docs_dev'),
     validateTriggerUrl(THE_BLOCK).shown || '(nothing shown)');
  is('and only the first 48 characters of it',
     (validateTriggerUrl(THE_BLOCK).shown || '').length <= 48);
}

section('  THE COMMAND — refuses before it sends, and writes nothing when it refuses');
{
  const run = (input, extra = []) => {
    try {
      const out = execFileSync('node', [SCRIPT, '--stdin', ...extra],
        { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return { code: 0, out, err: '' };
    } catch (e) {
      return { code: e.status, out: e.stdout || '', err: e.stderr || '' };
    }
  };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dgo-fetch-'));
  const out = path.join(dir, 'values.txt');

  const bad = run(THE_BLOCK, ['--out', out]);
  is('the block is refused with exit 2', bad.code === 2, `exit ${bad.code}`);
  is('and nothing is written', !existsSync(out));
  is('and it names the recovery', /Copy the HTTP POST URL/.test(bad.err), bad.err.slice(0, 200));
  is('and it says nothing was sent', /nothing was sent/i.test(bad.err));

  /* A valid URL against an existing file must refuse BEFORE the network, or a refusal costs a
     live call and a fresh set of signatures minted for nothing. */
  writeFileSync(out, '# already here\n', { mode: 0o600 });
  const clash = run(GOOD, ['--out', out]);
  is('an existing values file is never overwritten', clash.code === 2
     && /already exists/.test(clash.err), clash.err.slice(0, 160));
  is('and that refusal happens before any request is made',
     !/no answer at all|answered \d/.test(clash.err), clash.err.slice(0, 160));

  const leaked = [bad.err, bad.out, clash.err, clash.out].join('\n');
  is('no signature appears in any of its output', !leaked.includes(SIG));
  is('no invoke URL appears in any of its output', !leaked.includes('/paths/invoke'),
     'the refusal must be safe to paste into a ticket');

  rmSync(dir, { recursive: true, force: true });
}

section('  THE STALE SCOPE — a pull does not reach the tenant');
{
  /* Twice now a change was pulled and the flow kept running the scope pasted into it earlier,
     answering byte-identically. From the output that reads as the change having done nothing,
     and both times it cost a round trip to work out. The scope carries a build; this compares. */
  const errs = [];
  const real = console.error;
  const capture = (fn) => { console.error = (...a) => errs.push(a.join(' ')); try { return fn(); } finally { console.error = real; } };

  const want = expectedScopeBuild();
  is('the scope on disk carries a build stamp', /^[0-9a-f]{12}$/.test(String(want)), String(want));

  errs.length = 0;
  const same = capture(() => reportStaleScope(want));
  is('a flow answering with the same build says nothing', same === false && errs.length === 0,
     errs.join(' | '));

  errs.length = 0;
  const differs = capture(() => reportStaleScope('0123456789ab'));
  is('a flow answering with a different build is reported', differs === true);
  is('and the report names both builds, so it is checkable',
     errs.join('\n').includes('0123456789ab') && errs.join('\n').includes(String(want)),
     errs.join(' | ').slice(0, 200));
  is('and it says what to do about it, not merely that it happened',
     /delete the Scope_DGO_Endpoint_Values_Delivery action/i.test(errs.join('\n')),
     errs.join(' | ').slice(0, 200));
  is('and it warns that everything after it came from the old scope',
     /OLD scope talking/i.test(errs.join('\n')));

  errs.length = 0;
  const unknown = capture(() => reportStaleScope(null));
  is('a flow that carries no build at all is not mistaken for a match',
     unknown === false && errs.length === 0,
     'that case is reported separately — it predates the stamp entirely');
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
