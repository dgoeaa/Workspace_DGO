#!/usr/bin/env node
/**
 * Hardening regressions.
 *
 * Every case corresponds to a finding in docs/forensic/dd2e909/findings.json and is written
 * as a negative control: revert the fix and the matching case fails. These guard changes
 * that are easy to undo by accident — a default restored, a sandbox attribute dropped, a
 * convenient entry added back to a precache list.
 *
 * Run: node tests/hardening.test.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');
/* Every .css under a tree, so a sheet added later is checked without editing a list. */
const listCss = (dir) => {
  const out = [];
  (function walk(rel) {
    for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (e.name.endsWith('.css')) out.push(next);
    }
  })(dir);
  return out.sort();
};
let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

console.log('\nHardening\n');

/* ---------------------------------------------------------------- F-023 / F-024 / D6(b)
   F-023 (a personal developer subdomain hard-coded as the default backend) and
   F-024 (an @latest CDN tag) were both fixed inside ECM_ActivityHub_Portal. Decision
   D6(b) then retired that tree entirely: 15 of its 19 pages duplicated root routes, it
   shared no backend, state, identity or code with this platform, and it had no backend at
   all. Both findings are now closed by deletion, which is stronger than the fix — there is
   no module left to regress. What must be asserted is that the deletion holds, and that the
   three capabilities it uniquely had came across. */
console.log('F-023 / F-024 / D6(b) · the ECM Activity Hub is retired, not merely unlinked');
{
  for (const f of ['ECM_ActivityHub_Portal/index.html',
                   'ECM_ActivityHub_Portal/js/core/auth.js',
                   'ECM_ActivityHub_Portal/js/core/config.js',
                   'ECM_ActivityHub_Portal/js/core/store.js']) {
    ok(`${f} is deleted`, !existsSync(path.join(ROOT, f)));
  }
  ok('the tree is gone entirely', !existsSync(path.join(ROOT, 'ECM_ActivityHub_Portal')));

  // The two credentials-shaped defects cannot return, because their files cannot.
  ok('no workers.dev host remains anywhere in the tracked source',
     !/workers\.dev/.test(read('package.json') + read('config/endpoints.config.js')));

  // Nothing may still point at it.
  for (const f of ['package.json', 'core/boot.js', 'tests/check-imports.mjs',
                   'scripts/check-links.mjs', '.gitignore']) {
    ok(`${f} no longer references the retired tree`, !/ECM_ActivityHub/.test(read(f)));
  }

  /* scripts/setup-local.mjs was in that list until the archive was removed. Its whole job was
     recovering the PILOT Power Automate endpoints out of ECM_DOCS_DEV.zip and writing them
     into config.local.js — which is precisely the credential exposure the cutover exists to
     end. A convenience that restores revoked credentials is not a convenience. */
  ok('setup-local.mjs is retired, not merely unused',
     !existsSync(path.join(ROOT, 'scripts/setup-local.mjs')));
  ok('and npm no longer offers a command that would run it',
     !/setup-local/.test(read('package.json')));

  // Its three unique capabilities are the reason the retirement is a merge, not a drop.
  for (const f of ['core/executive-register.js', 'modules/briefs.js',
                   'modules/meetings.js', 'modules/projects.js']) {
    ok(`${f} exists — the ported capability`, existsSync(path.join(ROOT, f)));
  }
  const boot = read('core/boot.js');
  for (const r of ['briefs', 'meetings', 'projects']) {
    ok(`${r} is registered as a route`, new RegExp(`'${r}':\\(\\)=>import`).test(boot));
  }
}

/* ---------------------------------------------------------------- F-014 / F-016
   srcdoc content is live HTML: escaping protects the attribute boundary, not the
   content. The sandbox attribute is the only control that stops scripts running,
   so every srcdoc iframe in the tree must carry one. */
console.log('\nF-014 / F-016 · every srcdoc iframe is sandboxed');
{
  const files = ['shared/components.js', 'modules/lookup.js', 'modules/correspondence-email.js'];
  let frames = 0;
  for (const f of files) {
    for (const tag of read(f).match(/<iframe[^>]*srcdoc=[^>]*>/g) || []) {
      frames++;
      const where = `${f}: ${tag.slice(0, 70)}…`;
      ok(`sandbox present — ${f}`, /\ssandbox=/.test(tag), where);
      ok(`allow-scripts absent — ${f}`, !/allow-scripts/.test(tag), where);
      ok(`allow-same-origin absent — ${f}`, !/allow-same-origin/.test(tag), where);
    }
  }
  ok('all srcdoc frames were found and checked', frames >= 4, `found ${frames}, expected >= 4`);
}

/* ---------------------------------------------------------------- I-06
   The boot watchdog is the one screen in the platform that renders when nothing else can,
   so nothing can render it in a normal test run — the smoke suite only asserts it stayed
   away (tests/smoke.spec.js: `#app .fatal` has count 0). It was verified by hand instead:
   `core/state.js` was renamed in a copy of the tree so the static module graph behind
   `core/boot.js` fails to resolve, the copy was served over HTTP, and the rendered screen
   was read back after the 15s watchdog. Observed, with the disclosure closed:

     "DGO Digital Operations could not start / The workspace did not finish loading. This is
      usually temporary. / [Try again] / If it happens again, contact IT support and tell
      them the time you saw this message. / ▸ Technical details (for IT support)"

   — and behind the disclosure, the 15-second statement, the failing resource URL, and the
   HTTP/module-presence instructions. That is exactly what I-06 asks for, so nothing was
   changed. What follows is the negative control for it: the finding is that developer
   language reached the operator, so the assertion that matters is that the jargon exists
   ONLY after `<details`. Move one sentence out of the disclosure and this fails. */
console.log('\nI-06 · the boot-failure screen speaks to the operator first');
{
  const html = read('index.html');
  const block = (html.match(/host\.innerHTML\s*=([\s\S]*?)\}, 15000\);/) || [, ''])[1];
  const cut = block.indexOf('<details');
  const plain = cut === -1 ? block : block.slice(0, cut);
  const tech = cut === -1 ? '' : block.slice(cut);
  ok('the watchdog renders a failure screen', /class="fatal"/.test(block));
  ok('the diagnostics sit behind a disclosure', cut !== -1);
  ok('the operator is told the platform did not start, in plain words',
     /could not start/.test(plain) && /did not finish loading/.test(plain));
  ok('there is a retry affordance above the disclosure',
     /fatal__retry/.test(plain) && /Try again/.test(plain) && /location\.reload/.test(plain));
  ok('there is a support contact above the disclosure', /contact IT support/i.test(plain));
  ok('the disclosure names its audience', /Technical details \(for IT support\)/.test(tech));
  for (const jargon of ['ES module', 'file://', '<code>config/</code>', 'HTTP']) {
    ok(`"${jargon}" is reachable only through the disclosure`,
       !plain.includes(jargon), `leaked into the operator notice: ${plain.slice(0, 120)}…`);
  }
  // The failing-resource list is the whole reason the watchdog records load errors at all.
  // It is built into `detail` above the assignment and spliced in inside the disclosure.
  ok('the failing resources are named for IT',
     /failed to load/.test(html) && /\+\s*detail\s*\+/.test(tech));
}

/* ---------------------------------------------------------------- F-020
   The service worker precached the file holding the workflow endpoints, writing
   them durably into Cache Storage, and precached the staff console for offline
   use. Neither belongs in the install-time shell. */
console.log('\nF-020 · service worker precache');
{
  const sw = read('document-portal/sw.js');
  const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1];
  ok('js/data.js is not precached', !/data\.js/.test(shell));
  ok('admin.html is not precached', !/admin\.html/.test(shell));
  ok('the cache version was bumped past v2', !/CACHE\s*=\s*'nitda-portal-v2'/.test(sw));
  ok('rotation ordering is documented next to CACHE', /rotat/i.test(sw));
}

/* ---------------------------------------------------------------- F-017
   The secret scanner skipped every file containing a NUL byte, so the archive
   was never read. Nine signatures lived only there. */
console.log('\nF-017 · secret scanner reads archive members');
{
  const s = read('tests/check-secrets.mjs');
  ok('archives are routed to a member scan', /\\.zip\$\/i\.test\(file\)/.test(s) || /zip/i.test(s));
  ok('a signaturesInArchive path exists', /signaturesInArchive/.test(s));
  ok('an unscannable archive fails rather than passing silently',
     /unscannable/.test(s) && /unscannable\.length \? 1 : 0|\|\| unscannable\.length/.test(s));
  ok('the archive is baselined so its scope stays visible',
     /ECM_DOCS_DEV\.zip/.test(read('tests/secrets-baseline.txt')));
}

/* ---------------------------------------------------------------- F-028
   Two fixes, in sequence. Step 1 made the portal dispatch every attachment
   instead of only files[0]. Step 5 then removed the base64-in-JSON transport
   entirely, which is what created the 4 MB ceiling in the first place — so the
   assertions below describe the CURRENT shape, not the intermediate one. */
console.log('\nF-028 · every attachment is transmitted, and not inside a JSON payload');
{
  const s = read('document-portal/js/submit.js');
  const fn = (s.match(/function dispatchToWorkflow[\s\S]*?\n  \}/) || [''])[0];

  ok('dispatchToWorkflow was located', fn.length > 200);
  ok('no single-file dispatch remains', !/files\[0\]/.test(fn));
  ok('every attachment with bytes is declared', /withBytes/.test(fn));
  ok('uploads are redeemed one ticket at a time', /uploadAll/.test(s));
  ok('undelivered attachments are written to the audit trail', /PF\.store\.log/.test(s));
  ok('the submitter is told when something did not go', /PF\.toast\('warn'/.test(s));
  ok('attachments restored from a draft are reported, not skipped silently',
     /bytes were not available after a draft restore/.test(s));

  // The two shapes this replaced, neither of which may return.
  ok('no early return substitutes an empty payload for an oversize file',
     !/size > 4 \* 1048576\) return send\(''\)/.test(s));
  ok('no base64 transport remains', !/FileContentBase64|readAsDataURL/.test(s),
     'bytes must travel as bytes; base64-in-JSON is what forced the 4 MB limit');
}

/* ---------------------------------------------------------------- F-013 / F-001
   The portal held three SAS-signed Power Automate URLs COMMITTED in its bundle.
   It calls the flows directly again, with no proxy in the path — but nothing is
   hardcoded: every URL is supplied at deploy time through PF.CONFIG.endpoints. */
console.log('\nF-013 / F-001 · document portal commits no credential');
{
  const data = read('document-portal/js/data.js');
  ok('no SAS signature remains in the portal bundle', !/sig=[A-Za-z0-9_-]{20,}/.test(data));
  ok('PF.ENDPOINTS is gone', !/PF\.ENDPOINTS\s*=/.test(data));
  ok('the portal reads its endpoints from deployment configuration instead',
     /PF\.CONFIG = Object\.assign\(\{ endpoints: \{\} \}/.test(data));
  ok('the committed default is empty, so an unconfigured portal transmits nothing',
     !/endpoints:\s*\{\s*[A-Z]/.test(data));
  ok('the public exposure of a configured URL is stated where it is configured',
     /PUBLIC\s+portal/.test(data) && /anonymous\s+stranger/.test(data),
     'a signed URL served to a public browser is readable by anyone who fetches it');

  const core = read('document-portal/js/core.js');
  ok('PF.flow is gone', !/PF\.flow\s*=\s*function/.test(core));
  ok('PF.intake replaces it', /PF\.intake\s*=/.test(core));
  ok('submission targets the configured submission endpoint',
     /endpointUrl\('SUBMISSION'\)/.test(core));
  ok('uploads target the configured upload endpoint', /endpointUrl\('UPLOAD'\)/.test(core));
  ok('no proxy base URL is joined to a path any more', !/proxyBaseUrl/.test(core),
     'a base URL plus a path is what required an intermediary to exist');
  ok('an unconfigured endpoint yields no URL rather than a default host',
     /return String\(endpoints\[name\] \|\| ''\)\.trim\(\);/.test(core));

  for (const f of ['submit.js', 'support.js', 'track.js', 'home.js']) {
    const src = read(`document-portal/js/${f}`);
    ok(`${f} makes no PF.flow call`, !/PF\.flow\(/.test(src));
    ok(`${f} carries no signed URL`, !/sig=[A-Za-z0-9_-]{20,}/.test(src));
  }

  const submit = read('document-portal/js/submit.js');
  ok('attachments are no longer base64-encoded into a payload',
     !/FileContentBase64/.test(submit),
     'bytes must travel as bytes, not inside JSON');
  ok('a per-attachment digest is declared so the upload flow can verify it',
     /crypto\.subtle\.digest/.test(submit));

  // Comment lines explain why the portal was removed, so only entries count.
  const baselineEntries = read('tests/secrets-baseline.txt')
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  ok('the portal is no longer a baselined credential file',
     !baselineEntries.some(l => l.startsWith('document-portal')),
     `entries: ${baselineEntries.join(', ')}`);
}

/* ---------------------------------------------------------------- F-012
   The external portal shipped a staff console gated by three username/password
   pairs held in js/data.js and compared in the browser. It is retired, not
   fixed — an external submission channel has no business carrying staff triage,
   and the internal platform already enforces identity server-side. */
console.log('\nF-012 · the staff console is retired, not merely hidden');
{
  const gone = ['document-portal/admin.html', 'document-portal/js/admin.js', 'document-portal/js/admin-panels.js'];
  for (const f of gone) ok(`${f} is deleted`, !existsSync(path.join(ROOT, f)));

  const data = read('document-portal/js/data.js');
  ok('PF.STAFF is gone', !/PF\.STAFF\s*=/.test(data));
  ok('no demo password literal survives', !/pass:\s*['"]/.test(data));
  ok('the deletion is explained where the credentials used to be', /PF\.STAFF is deleted/.test(data));

  const core = read('document-portal/js/core.js');
  ok('PF.store.admin is gone', !/^\s*admin:\s*\{/m.test(core));
  ok('the command palette no longer routes to the console', !/admin\.html/.test(core));
  ok('a session left by the retired console is cleared on load',
     /sessionStorage\.removeItem\('nitda\.portal\.admin'\)/.test(core));

  const sw = read('document-portal/sw.js');
  ok('the console files are out of the precache shell', !/admin/.test((sw.match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1]),
     'a deleted file left in SHELL fails addAll and takes the whole offline shell down');

  for (const p of ['index.html', 'submit.html', 'track.html', 'support.html', '404.html']) {
    ok(`${p} does not link to the console`, !/admin\.html/.test(read(`document-portal/${p}`)));
  }
}

/* ---------------------------------------------------------------- D-C2
   The tracking page reported whatever this browser's localStorage said. It
   could not show a decision the registry had taken, and a submission made on
   one device did not exist on another. */
console.log('\nD-C2 · the portal reads status back from the registry');
{
  const core = read('document-portal/js/core.js');
  ok('PF.intake.status exists', /status:\s*function\s*\(referenceId, email/.test(core));
  ok('it targets the configured status endpoint', /endpointUrl\('STATUS'\)/.test(core));
  ok('a 404 is treated as authoritative, not as a reason to fall back',
     /r\.status === 404/.test(core));

  /* The client half of verified status lookup, provisioned dormant. The portal gated
     SUBMISSION behind a verified address and left STATUS ungated — but the reference and
     email pair is the entire gate on reading a record back, and a forwarded receipt is the
     ordinary way a correct pair reaches someone it does not belong to.

     The client cannot close that; only the flow can. What the client must do is be capable
     when the flow asks, so that turning it on is a configuration event rather than a
     development one — the same pattern as auth.enabled. */
  ok('the status call carries a proof when it has one, and drops the email when it does',
     /opts\.verification\s*\?\s*\{ referenceId: referenceId, verification: opts\.verification \}/.test(core)
     && /:\s*\{ referenceId: referenceId, email: email \}/.test(core));
  ok('a verification demand is distinct from a denial',
     /verification_required/.test(core) && /resolution: 'verification-required'/.test(core));
  ok('both halves of the round-trip are required before it is offered',
     /verificationAvailable:\s*function/.test(core)
     && /endpointUrl\('VERIFY'\)\s*&&\s*!!endpointUrl\('VERIFY_CONFIRM'\)/.test(core));
  const track = read('document-portal/js/track.js');
  ok('the tracking page answers a verification demand rather than reporting no match',
     /resolution === 'verification-required'/.test(track)
     && /function requireVerification/.test(track));
  /* Comments stripped first. The obvious form of this assertion — "no line mentions both
     localStorage and proof" — passed against the code and failed against the sentence
     explaining why the code is right, which is a test measuring prose. */
  const trackCode = track.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('the proof is discarded once it is spent',
     /proof = null;/.test(trackCode));
  ok('the proof never reaches persistent storage',
     !/(?:localStorage|sessionStorage|setItem|PF\.store)[^;]*proof/i.test(trackCode)
     && !/proof[^;]*(?:localStorage|sessionStorage|setItem)/i.test(trackCode));
  ok('the tracking page asks the registry first', /PF\.intake\.status\(/.test(track));
  ok('a registry answer is rendered as such', /'registry'/.test(track));
  ok('device data is labelled when it is used', /Shown from this device/.test(track));
  ok('an unreachable registry is not reported as not-found',
     /Status is unavailable right now/.test(track));

  // The enumeration oracle: the old page told a caller that a reference existed but
  // belonged to someone else. The status flow returns one uniform denial; the page must
  // not put the distinction back.
  ok('no separate wrong-email message remains',
     !/does not match this request|registered to a different address/.test(track));

  // The service-desk framing step 2 retired, which survived in this one block and read
  // "Closed after 14 of 3 working days" on a closed record.
  // Matched as it appears in the emitted markup, so the comment recording why it was
  // changed does not itself trip the check.
  ok('the acknowledgement block is not framed as a service-level target',
     !/>Service-level target</.test(track));
  ok('it reports acknowledgement of receipt instead', />Acknowledgement of receipt</.test(track));

  // Public copy that outlived the model change: the FAQ promised per-service decision
  // SLAs ("up to 30 working days for accreditation") the platform never enforced and no
  // longer even claims to have.
  const data = read('document-portal/js/data.js');
  ok('the FAQ no longer promises a per-service decision SLA', !/service-level target/i.test(data));
  ok('the FAQ states the acknowledgement commitment instead', /acknowledges receipt within/i.test(data));
  ok('no page advertises published working-day targets',
     !['index.html', 'submit.html', 'track.html', 'support.html']
       .some(p => /working-day target/i.test(read(`document-portal/${p}`))));

  // Fields renamed by step 2 that two render paths kept reading, interpolating
  // "undefined" into the page with no error anywhere.
  ok('the record view does not read the retired type fields',
     !/\bs\.name\b|\bs\.code\b/.test(track));
  ok('the home page reads label, not the retired name field',
     !/\bs\.name\b/.test(read('document-portal/js/home.js')));
  ok('metrics bucket on the field records actually carry',
     /byType/.test(core) && !/byService/.test(read('document-portal/js/home.js')));
}

/* ---------------------------------------------------------------- X-M1 · offline shell
   The runtime removed its render-blocking Google Fonts @import because it stalled boot
   ~13s wherever fonts.googleapis.com is unreachable. The portal — the public one, the one
   that advertises an offline shell and precaches its stylesheets — kept two copies of the
   same @import for weeks after. Nothing caught it: the design-token drift gate compares
   tokens/*.css only, so base.css and colors_and_type.css were outside every check.

   Asserted for both trees so the fix cannot be undone on either side, and asserted over
   the CSS of both delivered platforms rather than the two files that happened to carry it. */
console.log('\nX-M1 · neither delivered platform fetches CSS or fonts from an external host');
{
  const sheets = [
    ...listCss('styles'),
    ...listCss('document-portal'),
    'index.html',
    ...['index.html', 'submit.html', 'track.html', 'support.html', '404.html']
      .map(f => `document-portal/${f}`),
  ];
  ok('both stylesheet trees were found', sheets.length > 20, `found ${sheets.length}`);

  /* Comments may name the host — that is how the removal documents itself. What may not
     come back is a live fetch of it: an @import, a <link>, or a url() in a declaration. */
  const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const REMOTE_FETCH = /(@import[^;]*|<link\b[^>]*|\burl\(\s*['"]?)https?:\/\/(?!www\.w3\.org)/i;

  let checked = 0;
  for (const f of sheets) {
    const live = strip(read(f));
    const hit = REMOTE_FETCH.exec(live);
    ok(`${f} fetches nothing off-origin`, !hit, hit ? hit[0].slice(0, 120) : '');
    checked++;
  }
  ok('every sheet and page was checked', checked === sheets.length);

  /* The specific regression, named, so the failure says what to do rather than only where.
     Read through `strip` as well: each of these three files documents the removal in a
     comment that names the host, and a check that cannot tell a comment from an @import
     would fail on the very note explaining why the @import is gone. */
  for (const f of ['document-portal/ds/styles/base.css',
                   'document-portal/ds/colors_and_type.css',
                   'styles/dgo-design-system/base.css']) {
    ok(`${f} carries no Google Fonts @import`,
       !/@import[^;]*fonts\.googleapis\.com/.test(strip(read(f))),
       'self-host the face in fonts/ instead — the sheet is precached and the host may be unreachable');
    ok(`${f} still explains why it does not`,
       /fonts\.googleapis\.com/.test(read(f)),
       'the removal note is the only thing stopping the next author from adding it back');
  }
}

/* ---------------------------------------------------------------- X-M1(b) · focus parity
   reset.css clears the UA focus outline on every element in BOTH trees. components.css
   restores a ring for buttons, inputs, checks, radios, switches and menu items. Links are
   restored in base.css and nowhere else — and the portal's copy of base.css did not carry
   the rule, so a keyboard visitor to the public portal had no focus indication on any of
   the ~100 links across its five pages. */
console.log('\nX-M1(b) · a focused link is visible in both trees');
{
  /* The reset that makes everything below necessary: it clears the UA outline on
     :focus-visible for EVERY element in both trees, so anything that does not restore an
     affordance of its own has none at all. */
  for (const f of ['styles/dgo-design-system/reset.css', 'document-portal/ds/styles/reset.css']) {
    ok(`${f} is still the file that clears the UA outline`,
       /:focus-visible\s*\{\s*outline:\s*none/.test(read(f)));
  }

  /* The ring is the load-bearing half, and it must be on `a`, not on `.dgo-link`.
     The colour rule below was the whole fix at first, and measuring it in Chromium showed
     it did nothing: most links on both platforms carry no class, and the portal's footer
     link is white on a dark surface where a colour swap is invisible regardless. Focusing
     any content link on any of the portal's five pages changed no computed property at
     all — not colour, decoration, outline or shadow.

     The runtime has always had the ring, in styles/app.css. The portal had no equivalent
     file and so no ring; it is now in document-portal/portal.css, which is that platform's
     app.css by another name. Both use --dgo-focus-ring, the same token .dgo-btn uses. */
  const RING = /a:focus-visible\s*\{[^}]*box-shadow:\s*var\(--dgo-focus-ring\)/;
  for (const f of ['styles/app.css', 'document-portal/portal.css']) {
    ok(`${f} gives a bare <a> a focus ring`, RING.test(read(f)),
       'without it a keyboard visitor cannot tell which link is focused — WCAG 2.4.7');
  }

  /* And the colour parity, which is real but secondary: it is what a sighted mouse user
     gets on hover, mirrored for the keyboard. Identical in both trees so base.css does not
     drift apart again. */
  for (const f of ['styles/dgo-design-system/base.css', 'document-portal/ds/styles/base.css']) {
    ok(`${f} mirrors the hover colour onto .dgo-link:focus-visible`,
       /\.dgo-link:focus-visible\s*\{[^}]*color:\s*var\(--dgo-color-fg-link-hover\)/.test(read(f)));
  }
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
