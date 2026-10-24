/* THE PREFLIGHT MUST ADDRESS THE LIST THE PACKAGES ADDRESS.
 *
 * scripts/preflight-internal-flows.browser.js is pasted into a browser console signed in to the
 * tenant, and an operator acts on what it says. So a seed pointing at the wrong list is worse
 * than no preflight: it reports a blocker that is not there, or clears a condition it never read.
 *
 * It happened. Both governance lists exist twice in this tenant — DGO_RoleCatalogue as 55c0daae
 * on NITDADGO-EAAACTIVITYTRACKING and as f675598b on DGO_ECM_GOVERNANCE, DGO_UserDirectory
 * likewise — and the seeds were resolved by title with `.find()`, which returns whichever comes
 * first. RoleCatalogue got the site the packages do not use; UserDirectory was right by luck.
 * The generated file then fell back to the FIRST list's siteUrl for a GUID it could not place,
 * so the query went to the wrong GUID on the wrong site and reported whatever came back.
 *
 * Duplicate titles are a property of this tenant, not a mistake to fix in it, so the rule is
 * that nothing may be addressed by title.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8');

let pass = 0; const failures = [];
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log('\nPreflight addressing');

const built = read('scripts/preflight-internal-flows.browser.js');
const m = built.match(/const SPEC = ([\s\S]*?);\n {2}const VERBOSE/);
ok('the generated preflight carries a readable SPEC', Boolean(m),
   'the file shape changed and this test is no longer reading it');
if (!m) { console.log(`\n❌ ${pass} passed, ${failures.length} failed\n`); process.exit(1); }
const SPEC = JSON.parse(m[1]);

ok('it checks something at all', SPEC.lists.length > 0 && SPEC.seeds.length > 0,
   `${SPEC.lists.length} lists, ${SPEC.seeds.length} seeds`);

/* 1. Every seed names a list the file itself carries, so the runtime can find its site. */
const byGuid = new Map(SPEC.lists.map((l) => [l.guid, l]));
const unplaceable = SPEC.seeds.filter((s) => !byGuid.has(s.guid));
ok('every seed names a GUID the preflight also carries as a list',
   unplaceable.length === 0,
   unplaceable.map((s) => `${s.title} -> ${s.guid}`).join('; '));

/* 2. And that GUID is the one the packages address, which is the only thing that settles a
      duplicated title. Checked against the tenant index rather than restated here. */
const index = JSON.parse(read('docs/reference/sharepoint-list-index.json')).lists;
const wrongSite = [];
for (const s of SPEC.seeds) {
  const chosen = index[s.guid];
  const used = byGuid.get(s.guid);
  if (!chosen || !used) continue;
  if (chosen.siteUrl !== used.siteUrl) wrongSite.push(`${s.title}: index says ${chosen.siteUrl}, preflight says ${used.siteUrl}`);
}
ok('each seed GUID sits on the site the preflight will query', wrongSite.length === 0, wrongSite.join('; '));

/* 3. The titles that are duplicated in this tenant must be addressed by GUID, and the GUID
      chosen must be one a package actually uses. */
const dupTitles = [...new Set(Object.values(index).map((l) => l.title))]
  .filter((t) => Object.values(index).filter((l) => l.title === t).length > 1);
ok('the tenant really does hold duplicate list titles, so this rule has something to protect',
   dupTitles.length > 0, 'no duplicate titles found — the index shape may have changed');
const seedsOnDupTitles = SPEC.seeds.filter((s) => dupTitles.includes(s.title));
ok('every seed on a duplicated title resolves to a list the packages address',
   seedsOnDupTitles.every((s) => byGuid.has(s.guid)),
   seedsOnDupTitles.filter((s) => !byGuid.has(s.guid)).map((s) => s.title).join(', '));
console.log(`     duplicated titles in the tenant: ${dupTitles.join(', ')}`);

/* 4. The runtime must refuse an unplaceable seed rather than guessing a site for it. The old
      fallback to SPEC.lists[0].siteUrl is what turned a build fault into a tenant reading. */
ok('the runtime no longer guesses a site for a seed it cannot place',
   !/siteUrl:\s*SPEC\.lists\[0\]\.siteUrl/.test(built),
   'the first list’s site is being used as a fallback again');
ok('an unplaceable seed is reported as a build fault',
   /is not a list any package addresses/.test(built),
   'nothing tells the operator the preflight itself was built wrong');

/* ---- what a real run against the tenant taught this file ---- */

/* 1. A column no caller may supply is not a column the flow failed to supply. The first real run
      reported `_ModerationStatus` — SharePoint's content-approval field, hidden, read-only and
      sealed — as BLOCKS PASTE against DGO DIGITAL OPS and Global Tracking Queue, the two largest
      lists in the estate, with advice ("the flow must supply them") nobody can act on. */
ok('the field query asks whether a column is writable at all',
   /\$select=InternalName[^`'"]*Hidden[^`'"]*ReadOnlyField/.test(built),
   'Hidden and ReadOnlyField are not requested, so every required system field reads as a blocker');
ok('a hidden, read-only or sealed column is excluded from the required check',
   /!f\.Hidden && !f\.ReadOnlyField && !f\.Sealed/.test(built),
   'the required-column filter does not exclude columns a create cannot carry');

/* 2. Every list examined must say what was found. The same run printed NOTHING for
      DGO_RoleCatalogue and DGO_UserDirectory — six and seven of the seven flows depend on them —
      because the ok line was gated on a condition the blocking line did not share. Their filter
      columns had been checked and were present; silence read as "not checked". */
ok('a list with required columns and no writes still reports a result',
   /const blockedHere =/.test(built) && !/!unwrittenRequired\.length && !missingOptional\.length\) \{\n\s*record\('ok'/.test(built),
   'the ok line and the blocking line are gated on different conditions, so a list can print nothing');
ok('a required column on a read-only list is reported rather than dropped',
   /and no package writes to this list at all/.test(built),
   'a required column on a list nothing writes to vanishes from the report entirely');

/* 3. Content approval turns a successful write into an invisible one, and every check here would
      still pass. Required `_ModerationStatus` raised the question; EnableModeration answers it. */
ok('content approval is checked on every list a package writes to',
   /\$select=EnableModeration/.test(built) && /lands Pending/.test(built),
   'nothing asks whether a created row would be visible');

/* 4. A row is not the same as a row that means anything. The second real run found
      ConfigValue = "*" and the preflight passed it. The resolver answers an unlisted caller with
      the FIRST listed value, so one row holding "*" gives every caller
      Access-Control-Allow-Origin: * through all fourteen packages — the posture the control
      exists to remove, with every check green. */
ok('a wildcard allowed-origin is refused, not passed',
   /a wildcard, not an origin/.test(built),
   'ConfigValue = "*" would still read as a satisfied condition');
ok('an allowed origin must be scheme://host, not merely non-empty',
   /\^https\?:\\\/\\\/\[a-z0-9\.-\]\+/.test(built) && /is not an origin/.test(built),
   'any non-empty string still counts as an origin');

/* 5. The verdict has to be readable where the operator is. Two runs came back with nothing but
      DevTools' own noise — Autofill.enable failing with -32601 on a remote target, the SharePoint
      page re-registering 1,769 icons — and on a phone the console is the wrong place to look for
      an answer. The result is drawn on the page as well. Tenant text goes through an escaper: a
      list title or ConfigValue is data from someone else's system, and it is not going into
      innerHTML raw. */
ok('the result is rendered on the page, not only to the console',
   /dgo-preflight-panel/.test(built) && /document\.body\.appendChild/.test(built),
   'the verdict exists only in the console stream');
ok('tenant-supplied text is escaped before it reaches innerHTML',
   /const esc = \(t\) =>/.test(built) && /esc\(r\.area\)/.test(built) && /esc\(r\.detail\)/.test(built),
   'a list title or ConfigValue would be interpolated into the page unescaped');
ok('the panel cannot take the run down with it',
   /The on-page panel could not be drawn/.test(built),
   'a DOM failure would lose the result instead of falling back to the console');

/* 6. A run that measured nothing has found nothing. On a real run every request failed at the
      network layer and the report read "15 blocking issues — pasting now produces flows that
      fail on the first call", listing twelve unreadable lists and three unqueryable seeds. Every
      one of those statements was about the browser, not the tenant, and together they looked
      like a catastrophically broken estate. */
ok('a network failure is distinguished from SharePoint answering',
   /never left the page/.test(built) && /isNetwork = true/.test(built),
   'a blocked request and a 404 read identically in the report');
ok('a run where nothing succeeded reports as inconclusive, not as findings',
   /INCONCLUSIVE/.test(built) && /const allNetwork =/.test(built) && /Nothing was measured/.test(built),
   'a run that measured nothing still produces a list of blockers against the tenant');
ok('the inconclusive path names what actually causes it',
   /Brave Shields/.test(built) && /captive-portal|offline/.test(built),
   'the operator is told nothing about how to make the run work');
/* And it must NOT swallow a partial failure: one unreachable site among many is a real finding
   about that site, and still has to be reported per list. */
ok('the inconclusive rule only fires when nothing at all succeeded',
   /rows\.some\(\(r\) => r\.severity === 'ok'\)/.test(built),
   'a partially successful run could be collapsed into one message and lose its findings');

/* ---- the acceptance test must never emit a credential ---- */
{
  const acc = read('scripts/acceptance-internal-endpoints.browser.js');
  console.log('\nAcceptance test');
  const ok2 = (label, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  /* A signed Power Automate URL is a bearer credential. This script HOLDS them — it reads the
     platform's runtime config to make the calls — so the rule is that none may ever be printed,
     stored on window, or otherwise leave the page. Verified against a stub whose URLs carry a
     sentinel; the guard here is that the code has no path that could. */
  ok2('it reads endpoints from the platform runtime, not from a file',
     /window\.DGO_CONFIG/.test(acc) && !/sig=/.test(acc),
     'a URL is embedded in the script itself');
  ok2('no console line prints a URL',
     !/console\.log\([^)]*\b(url|cfg\[)/.test(acc),
     'a log statement interpolates an endpoint URL');
  ok2('what it leaves on window carries no URL',
     /window\.acceptance = \{[^}]*rows, requestIds \}/.test(acc),
     'the stored result may contain an endpoint URL');
  ok2('writes and the OTP email are off by default',
     /const INCLUDE_WRITES = false;/.test(acc) && /const INCLUDE_OTP {4}= false;/.test(acc),
     'the default run would write data or send mail');
  ok2('a CORS refusal is reported as a CORS refusal',
     /this is CORS/.test(acc) && /allowed origin does not match/.test(acc),
     'a blocked response would read as an endpoint failure');

  /* ---- the body has to be the body the flows actually read ---- */
  /* Six of the seven internal flows resolve their caller as
       coalesce(triggerBody()?['payload']?['userEmail'], triggerBody()?['userEmail'], '')
     and then require an ACTIVE DGO_UserDirectory row for that address. A request without the
     field resolves to '' , matches nothing, and is refused — six authorisation failures caused
     entirely by the test. This is a real defect this script shipped with; these guard it. */
  ok2('the request carries the caller address the flows resolve on',
     /userEmail: email/.test(acc) && /const payload = \{ \.\.\.c\.payload, userEmail: email/.test(acc),
     'no body sends userEmail — every gated endpoint would answer with a refusal');
  /* Still the same property, asserted against the restructured code: an empty caller is a
     blocker, and the blocker list returns before a single call is made. */
  ok2('it refuses to run at all without a caller address',
     /if \(!CANDIDATES\.length\) blockers\.push\(/.test(acc)
     && /if \(blockers\.length\) \{[\s\S]*?\n    return;\n  \}/.test(acc)
     && acc.indexOf('if (blockers.length) {') < acc.indexOf('await fetch('),
     'a run with no caller would fire six calls that cannot succeed');

  /* The `action` each call sends must be the contract the platform itself sends, or the run is
     not a rehearsal of production. Read from the contracts rather than restated here, so a
     contract change breaks this test instead of silently diverging. */
  {
    const contracts = read('config/endpoints.config.js');
    const contractAction = (key) => {
      const m = new RegExp(`\\n  ${key}: Object\\.freeze\\(\\{[^}]*?action:"([^"]+)"`).exec(contracts);
      return m ? m[1] : null;
    };
    const scriptAction = (key) => {
      const m = new RegExp(`key: '${key}',\\s*action: '([^']+)'`).exec(acc);
      return m ? m[1] : null;
    };
    for (const key of ['FETCH_ALL', 'REFERENCE_DATA', 'GET_DOCS', 'SINGLE_ASSIGNMENT',
                       'DYNAMIC_ACTIONS', 'OTP_GENERATE']) {
      const want = contractAction(key), got = scriptAction(key);
      ok2(`${key} sends the platform's own action string`,
         want !== null && want === got,
         `contract says ${want}, the acceptance test sends ${got}`);
    }
  }

  /* An endpoint that answers 401 has proved the origin and nothing else. Reporting that as a
     pass — which the first version of this script did — would hand back a green run for an
     estate where every read was refused. */
  ok2('an authorisation refusal is its own verdict, not a pass',
     /verdict = r\.body\.ok === true \? 'PASS' : 'REFUSED'/.test(acc),
     'a refused endpoint would be counted as working');
  ok2('the success line cannot be printed while anything was refused',
     /passes\.length && !fails\.length && !refused\.length/.test(acc),
     'a run with refusals could still announce that every endpoint did its work');
  ok2('CORS is concluded from readable responses, separately from acceptance',
     /reached\.length\) \{/.test(acc) && /CORS is correct for/.test(acc)
     && !/CORS is correct[\s\S]{0,200}EVERY ENDPOINT CALLED DID ITS WORK/.test(acc),
     'the CORS verdict is entangled with the acceptance verdict');

  /* The two write-tier calls exist to be refused. If a guard stops firing, that is a finding
     about the flow, and it must not be reported as the expected refusal. */
  /* ---- every blocker in one pass ---- */
  /* The first live paste landed on a SharePoint page, where window.DGO_CONFIG does not exist.
     The script reported only the empty CALLER_EMAIL and stopped, hiding the larger fault — so a
     second paste with the email filled in would have produced six "no URL configured" failures
     and burned another round-trip. Faults are now collected and reported together. */
  /* Assert the CONDITION, not just the wording — a message that is present but unreachable
     because its test was disabled is exactly the kind of guard that cannot fail. */
  ok2('a run on the wrong page says so, instead of failing six calls',
     /if \(!window\.DGO_CONFIG \|\| !window\.DGO_CONFIG\.endpoints\) \{\s*\n\s*blockers\.push\(/.test(acc)
     && /This is not the internal platform/.test(acc)
     && /window\.DGO_CONFIG is not defined on/.test(acc),
     'pasting into a SharePoint console would report six unconfigured endpoints instead');
  ok2('the wrong-page message names the page that IS right',
     /config\/config\.local\.js/.test(acc) && /SharePoint is only for the telemetry snippet/.test(acc),
     'the operator is told what is wrong but not where to go');
  ok2('blockers are collected and reported together, not one per paste',
     /const blockers = \[\];/.test(acc)
     && /blockers\.forEach\(/.test(acc)
     && (acc.match(/blockers\.push\(/g) || []).length >= 2,
     'each fault would cost its own paste, run and round-trip');
  ok2('an unconfigured read endpoint is a blocker, not a per-call failure',
     /read endpoints \$\{missing\.length === 1 \? 'has' : 'have'\} no URL configured/.test(acc),
     'a missing URL would surface once per call rather than once up front');

  /* ---- resolving the caller in one paste ---- */
  /* Two addresses were offered and neither could be confirmed against the tenant from here. A
     script that took one guess would cost a paste per guess, so it probes them in order. */
  ok2('it tries each candidate address rather than taking one guess',
     /const CANDIDATES = \(Array\.isArray\(CALLER_EMAILS\)/.test(acc)
     && /for \(const email of CANDIDATES\) \{/.test(acc),
     'an unconfirmed address would cost a round-trip per guess');
  ok2('the probe sends the same body as the run it precedes',
     /const callOnce = async \(c, email\) => \{/.test(acc)
     && (acc.match(/await callOnce\(/g) || []).length >= 2,
     'a probe that sent a different body would prove nothing about the run that follows');
  ok2('a network failure stops the search instead of retrying every address',
     /if \(r\.netErr\) \{[\s\S]{0,400}?stopped = true;/.test(acc),
     'a CORS failure would be retried once per candidate for no reason');
  ok2('an answer that is not this estate is a failure, not an authorisation refusal',
     /if \(!r\.shaped\) \{[\s\S]{0,600}?verdict: 'FAIL'/.test(acc)
     && /not this estate/.test(acc),
     'a wrong-URL response would send the operator to the directory instead');
  ok2('when no address is accepted, every attempt is listed with what it answered',
     /if \(!CALLER && attempts\.some\(\(a\) => a\.outcome === 'refused'\)\) \{/.test(acc)
     && /attempts\.forEach\(\(a\) => console\.log/.test(acc),
     'the operator would be told a refusal happened but not which addresses were tried');

  ok2('the probe calls fail when their guard does NOT fire',
     /c\.expectRefusal\) verdict = r\.body\.ok === false \? 'PASS' : 'FAIL'/.test(acc),
     'an assignment that succeeded with no assignee would be reported as expected');
}

/* ---- the rotation templates ---- */
/* config.example.js IS the template — there is one per platform, not a second parallel file,
   so the two cannot drift. A template is the file an operator copies to config.local.js. Two properties must hold: it
   must carry no signature (it is tracked, and a signature here is a leak), and it must cover
   every key the platform actually reads — a missing key is an endpoint that silently reports
   itself unconfigured after a rotation. */
{
  console.log('\nRotation templates');
  const ok3 = (label, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  const SIG = /sig=[A-Za-z0-9_-]{20,}/;
  for (const f of ['config/config.example.js', 'document-portal/config.example.js']) {
    const t = read(f);
    ok3(`${f} carries no signature`, !SIG.test(t), 'a signed URL is committed in a tracked file');
    ok3(`${f} has no pre-filled value`,
       ![...t.matchAll(/^\s*([A-Z_]+):\s*"(.+)"/gm)].length,
       'a value is filled in where the operator should paste their own');
  }
  const urlsBlock = read('config/endpoints.config.js')
    .split('export const EndpointUrls')[1].split('});')[0];
  const want = [...urlsBlock.matchAll(/^\s*([A-Z_]+):\s*_url\(/gm)].map((m) => m[1]);
  const got = [...read('config/config.example.js').matchAll(/^\s*([A-Z_]+):\s*""/gm)].map((m) => m[1]);
  const missing = want.filter((k) => !got.includes(k));
  ok3('the internal template covers every key the platform reads',
     want.length > 0 && !missing.length,
     `missing: ${missing.join(', ')}`);
  ok3('the template names the keys that share another key\'s URL',
     /also served by this URL, no entry needed: DISPATCH_OUTBOUND, ARCHIVE_REFERENCE/.test(
       read('config/config.example.js')),
     'a reader would think two contract keys had been left out');
  ok3('both templates put the revoke last',
     /revoke the old signature/.test(read('config/config.example.js'))
     && /revoke the old signature/.test(read('document-portal/config.example.js')),
     'rotating before confirming takes the endpoint down in between');
}

/* ---- the config.local.js checker ---- */
/* This tool reads seventeen bearer credentials. The one rule it must never break is printing
   one, so the guards below assert against the source: no path may put a URL or a signature on
   the terminal. The rest is about the check that actually matters — a well-formed URL under
   the wrong key, which no shape test can catch. */
{
  console.log('\nconfig.local.js checker');
  const chk = read('scripts/check-config-local.mjs');
  const ok4 = (label, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  ok4('it compares each URL against the workflow id that key must reach',
     /points at the WRONG FLOW/.test(chk) && /const want = EXPECT\[key\]\.workflowId;/.test(chk),
     'a URL pasted under the wrong key would pass every other check');
  ok4('no output path prints a URL or a signature',
     !/say\([^)]*\b(v|raw|u\.href|u\.search)\b/.test(chk)
     && !/\$\{v\}/.test(chk) && !/searchParams\.get\('sig'\)\}/.test(chk),
     'a credential could reach the terminal');
  ok4('an unverifiable key is reported as unverifiable, not as correct',
     /no id on record for this key, so it cannot be verified/.test(chk),
     'a key with no recorded id would read as confirmed');
  ok4('an unrecorded shared URL is a warning, not a pass',
     /nothing on record says they should/.test(chk),
     'the same URL pasted under two keys would be reported as correctly shared');
  /* 43 characters is what every signature in this estate measures, but that was measured on
     one URL form and the checker now accepts three. A wrong length is therefore reported, not
     used to reject a URL that may be perfectly valid on a form we have not sampled. */
  ok4('a signature of the wrong length is reported',
     /\{43\}\$\//.test(chk) && /every signature measured in this/.test(chk)
     && /copied before its end/.test(chk),
     'a URL copied before its end would pass unremarked — the commonest paste error');
  ok4('a signature with non-base64url characters is still a hard failure',
     /has characters outside base64url/.test(chk)
     && /\/\^\[A-Za-z0-9_-\]\+\$\/\.test\(sig\)/.test(chk),
     'a mangled signature would be accepted');
  ok4('every Power Automate trigger path form is accepted, not just one',
     /\\\/workflows\\\/\(\[0-9a-fA-F\]\{32\}\)/.test(chk)
     && /logic\.azure\.com/.test(chk) && /flow\.microsoft\.com/.test(chk),
     'valid URLs from another form would be rejected as not a manual-trigger path');
  ok4('the values-file template refuses to be written inside the repository',
     /is inside the repository/.test(read('scripts/make-values-template.mjs'))
     && /startsWith\(ROOT \+ path\.sep\)/.test(read('scripts/make-values-template.mjs')),
     'a file of bearer credentials could be created where it may be committed');
  /* THIS ASSERTED --no-estate UNTIL 2026-09-14, WHEN THE FLAG STOPPED MEANING ANYTHING.
     The estate fallback was opt-out: a key left blank was filled from docs/reference/foundational/
     and --no-estate turned that off, so the template had to say so. ITEM-22 revoked every
     signature in that corpus, the fallback was retired, and --no-estate became the only
     behaviour — at which point telling an operator to pass it is noise that implies an
     alternative exists. What the template must still do is the thing the old flag was FOR: make
     clear that a blank key ships unprovisioned rather than being quietly filled. */
  ok4('the template says a blank key ships unprovisioned, with no fallback',
     /ONLY what is in this file is used/i.test(read('scripts/make-values-template.mjs'))
     && /retired/.test(read('scripts/make-values-template.mjs'))
     && /reports itself unconfigured/.test(read('scripts/make-values-template.mjs')),
     'an operator could believe a blank key is filled in for them from somewhere');
  ok4('the template leads with the command the runbook that sends people here actually uses',
     /npm run setup -- --values/.test(read('scripts/make-values-template.mjs')),
     'the file on the operator\'s screen would name a different command than the runbook beside it');

  ok4('it names the specific paste mistakes, not just "invalid"',
     /truncated when copied/.test(chk) && /curly quote/.test(chk)
     && /pasted broken across lines/.test(chk),
     'an operator would be told something is wrong but not what to do');
  const map = JSON.parse(read('docs/reference/endpoint-workflow-ids.json'));
  /* Assert the OUTPUT, not the generator's wording: every id must say where it came from, and
     an id read back from the deployed config must not look as authoritative as one captured
     independently. */
  const withId = Object.values(map.internal).filter((e) => e.workflowId);
  ok4('every recorded id says where it came from',
     withId.length > 0 && withId.every((e) => typeof e.source === 'string' && e.source),
     'an id with no provenance is indistinguishable from a guess');
  ok4('ids read back from the deployed config are marked as uncorroborated',
     withId.filter((e) => e.source.startsWith('deployed-config'))
       .every((e) => /not independently corroborated/.test(e.note || '')),
     'an id read from the config it is meant to check would look independently verified');
  /* This assertion used to read "the id map carries no URL", and forbade the substring
     `powerautomate/automations` outright. That was the right guard while the only reason a URL
     could appear in this file was a mistake.

     It is now deliberately there. `docs/reference/endpoint-register.json` supplies each key's
     complete trigger URL with `sig` removed, and carrying that through lets
     `npm run values:template` emit all 25 URLs ready to complete, so the operator pastes a
     43-character signature per key instead of a 300-character URL. That change removes the
     single most common commissioning failure — a URL truncated on copy.

     So the property being protected is restated rather than dropped, because it was never
     really "no URL": a trigger URL without its signature authorises nothing. Possession of the
     host, the path and the workflow id calls no flow. **The signature is the credential**, and
     that is what must never be committed. Asserted three ways below — no `sig=` with a value
     after it, no base64url run of signature length anywhere in the file, and every URL that is
     present ending at a bare `sig=`. Weaken any one and a real credential could land here. */
  const rawMap = read('docs/reference/endpoint-workflow-ids.json');
  /* A signature reaches a file as the VALUE OF A QUERY PARAMETER — that is the only shape it
     can take and still work. Anchoring on `=` rather than scanning for any 43-character run is
     what keeps this checking credentials instead of identifiers: the run that a blanket scan
     flags here is `CG_Portal_Verification_Confirmation_Endpoin`, a flow name, and a check that
     cries wolf on flow names is a check someone deletes. */
  ok4('the id map carries no signature, which is the part that is a credential',
     !/sig=[A-Za-z0-9_%-]+/.test(rawMap) && !/=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(rawMap),
     'a trigger signature is recorded in a tracked file — that is a published bearer credential');
  const templates = [...Object.values(map.internal), ...Object.values(map.portal)]
    .map((e) => e.urlTemplate).filter(Boolean);
  ok4('every URL template stops exactly where the signature begins',
     templates.length > 0 && templates.every((u) => /[?&]sig=$/.test(u)),
     'a URL template carries something after sig= — a placeholder there becomes a config value '
     + 'that is non-empty, HTTPS and correctly shaped, and fails as a 401 much later');

  /* The predecessor of this assertion required `portalDiscrepancies > 0` — it existed because
     two sources disagreed about the portal ids and the file had to keep saying so rather than
     picking a winner silently. There is now a single authority, so a recorded disagreement is
     no longer the honest state; naming the authority is. What must not regress is the ability
     to notice drift, so that is what is asserted: the file says what it was derived from, and
     the reconciler fails when the file no longer matches it. */
  ok4('the id map names the authority it was derived from',
     map.authority && /endpoint-register\.json$/.test(map.authority.file || '')
     && typeof map.authority.note === 'string' && map.authority.note.length > 0,
     'an id map with no stated authority is indistinguishable from a hand-edit');
  /* Asserted by RUNNING it, not by grepping its source. The first version of this checked the
     reconciler for the literal string "has drifted from the register", and broke the moment that
     message was reworded to name which of the two generated files was stale — a test failing on
     a message change while the behaviour was intact. What matters is the behaviour: --check must
     exit non-zero when the derived file no longer matches the register. */
  ok4('drift from the register is caught rather than silently tolerated',
     (() => {
       const target = fileURLToPath(new URL('docs/reference/endpoint-workflow-ids.json', root));
       const original = readFileSync(target, 'utf8');
       try {
         const clean = spawnSync(process.execPath, ['scripts/reconcile-endpoint-register.mjs', '--check'],
           { cwd: fileURLToPath(root), encoding: 'utf8' });
         if (clean.status !== 0) return false;
         const drifted = JSON.parse(original);
         drifted.internal.FETCH_ALL.workflowId = 'f'.repeat(32);
         writeFileSync(target, JSON.stringify(drifted, null, 2) + '\n');
         const dirty = spawnSync(process.execPath, ['scripts/reconcile-endpoint-register.mjs', '--check'],
           { cwd: fileURLToPath(root), encoding: 'utf8' });
         return dirty.status === 1;
       } finally { writeFileSync(target, original); }
     })(),
     'npm run reconcile -- --check must fail on drift, or the derived file can rot unnoticed');
}

/* ---- generated files must not depend on the host's locale ---- */
/* localeCompare orders by the host's locale and ICU build, so a file generated on Linux and
   re-generated on Windows can differ with nothing changed — and every --check stage then
   reports it stale. That is exactly what happened: npm test passed on Linux and failed on
   Windows with "flow-list-map.json is stale". Any generator that writes a tracked file must
   sort by code unit. */
{
  console.log('\nDeterministic generated files');
  const ok5 = (label, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  const dir = fileURLToPath(new URL('scripts/', root));
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => {
      const src = readFileSync(dir + f, 'utf8');
      return /writeFileSync/.test(src) && /localeCompare/.test(src);
    });
  ok5('no generator that writes a tracked file sorts by locale',
     offenders.length === 0,
     `localeCompare in: ${offenders.join(', ')}`);
  ok5('the shared comparator exists and orders by code unit',
     existsSync(fileURLToPath(new URL('scripts/lib/stable-sort.mjs', root)))
     && /x < y \? -1 : x > y \? 1 : 0/.test(read('scripts/lib/stable-sort.mjs')),
     'scripts/lib/stable-sort.mjs is missing or does not compare by code unit');
}

/* ---- an unreadable count must never be reported as a number ---- */
/* It happened. scripts/set-content-approval.browser.js counted moderation states with
   $filter=OData__ModerationStatus eq N. That column is not indexed, and on lists over the
   5,000-item threshold — both targets are, at 21,532 and 15,936 — SharePoint answers HTTP 500.
   Every state came back as the string "unreadable (500)", and the total was computed with
   `typeof counts[k] === 'number' ? counts[k] : 0`, which summed those strings to zero and
   printed, in green, "0 row(s) are currently NOT approved and would become visible."

   Zero was the one answer that made turning approval off look free. The true figure could have
   been any number up to 21,532 rows becoming public at once. So: no arithmetic over counts that
   may not be counts, and no write while the number is unknown. */
{
  console.log('\nContent approval reports a count or says it has none');
  const ok6 = (label, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { failures.push(label); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };
  /* Read the code, not the header that explains why the code is the way it is: the comment
     names the failed query verbatim so the next reader knows what not to go back to. */
  const ca = read('scripts/set-content-approval.browser.js').replace(/\/\*[\s\S]*?\*\//g, '');

  ok6('it does not count with the filter that HTTP 500s above the threshold',
     !/\$filter=OData__ModerationStatus/.test(ca),
     'the unindexed-column filter is back; it cannot succeed on these lists');

  ok6('it never treats a non-number count as zero',
     !/typeof\s+counts\[[^\]]+\]\s*===\s*'number'\s*\?/.test(ca),
     'a count that could not be read would be summed as 0');

  ok6('a page that does not return 200 makes the tally unknown, not partial',
     /if\s*\(!r\.ok\)\s*return\s*\{\s*unknown:/.test(ca),
     'tally() must abandon the pass, not return the rows it happened to get');

  ok6('the hidden-row total is null when the tally is unknown',
     /let counts = null, hidden = null/.test(ca) && /hidden = HIDES\.reduce/.test(ca),
     'hidden must start unknown and only become a number from a complete tally');

  /* The refusal has to sit between APPLY and the write, or it is decoration. */
  const refuse = ca.indexOf('if (hidden === null)');
  const write  = ca.indexOf("'X-HTTP-Method': 'MERGE'");
  ok6('it refuses to turn approval off while the hidden-row count is unknown',
     refuse !== -1 && write !== -1 && refuse < write,
     refuse === -1 ? 'no refusal on an unknown count' : 'the refusal is after the write');

  ok6('it tells the operator where to read the count instead',
     /Approve\/reject Items/.test(ca),
     'an unknown count must come with the way to establish it');
}

console.log(`\n${failures.length ? '❌' : '✅'} ${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
