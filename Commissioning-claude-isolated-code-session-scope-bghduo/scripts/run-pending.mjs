#!/usr/bin/env node
/**
 * RUN EVERYTHING THAT CAN BE RUN, AND NAME WHAT CANNOT.
 *
 *   npm run pending            measure only — runs nothing that writes
 *   npm run pending -- --do    also performs the repo-side actions
 *
 * The register lists what stands between this estate and production. It says what each item is
 * and who owns it; it does not do any of it, and nothing else does either. So the pending work
 * has been carried in prose and re-derived by hand every time it is looked at.
 *
 * This walks the open items and puts each one in exactly one of three places:
 *
 *   RUNS HERE       a command in this repository settles it. It is run (with --do) or named.
 *   RUNS IN A TAB   SharePoint REST answers on the operator's cookies, so a generated browser
 *                   script settles it. Named, with the script to paste.
 *   NEEDS A PERSON  no automation exists or can exist. The reason is stated per item, not
 *                   waved at — an item here is a claim that it is genuinely irreducible.
 *
 * THE THIRD CATEGORY IS THE POINT. Two things in this estate cannot be automated from here and
 * saying so plainly is worth more than a script that pretends otherwise:
 *
 *   The flows are Dataverse-backed. Three attempts at an API patcher failed — the maker host
 *   moved, then the path shape was wrong, then the definitions turned out to live in a
 *   `clientdata` column rather than at any ProcessSimple path. The designer's own clipboard is
 *   the delivery mechanism, and a person has to operate it.
 *
 *   A trigger URL carries a `sig=` bearer token. Copying one out of the designer is a person
 *   handling a credential; no script here should ever hold one, and none does.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DO = process.argv.includes('--do');
const ORIGIN = (() => { const i = process.argv.indexOf('--origin'); return i === -1 ? '' : (process.argv[i + 1] || ''); })();
const rel = (p) => fileURLToPath(new URL(p, new URL('../', import.meta.url)));
const has = (p) => existsSync(rel(p));

const register = JSON.parse(readFileSync(rel('docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'));
const items = new Map();
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    /* The register's ids are not all ITEM-. Filtering on that prefix hid CFG-1, CFG-2, G-04 and
       the four MANUAL gates — three of the seven blockers — and hid them from the unplanned
       warning too, because an item that never enters this map cannot be reported missing from
       the plan. Match the shapes the register actually uses. */
    if (typeof o.id === 'string' && /^(ITEM|CFG|G|MANUAL)-\d+$/.test(o.id) && o.status) items.set(o.id, o);
    Object.values(o).forEach(walk);
  }
})(register);

const run = (cmd, args) => {
  try {
    const out = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`.trim() || e.message }; }
};
const npm = (script, ...rest) => run('npm', ['run', script, '--silent', ...(rest.length ? ['--', ...rest] : [])]);

/* The estate RECORDS https://activityweb.page.gd in ALLOWED_ORIGIN_1. Nobody has confirmed it
   against the running platform — that is ITEM-8. So it is printed for comparison and never used:
   writing an unconfirmed origin into tracked files produces a portal that looks indexable and
   indexes nothing, which is the failure ITEM-8 exists to prevent. --origin is how it gets in. */
const RECORDED_ORIGIN = 'https://activityweb.page.gd';

/* One entry per open item. `kind` is where it can be settled; `act` runs only with --do. */
const PLAN = {
  'ITEM-43': { kind: 'person', order: 2,
    who: 'operator, in the Power Automate designer and then here',
    why: 'the new flow answers with the literal https://your-host, and its trigger URL has to be copied out of the designer by hand. Both are person-only: the flows are Dataverse-backed so no API here reaches them, and a signed URL is a bearer credential no script should hold.',
    then: 'docs/deployment/power-automate-flows/fresh-flow/CUTOVER.md — then `npm run pending -- --do` settles the repository half',
    act: () => {
      const cfg = 'dist/dgo-internal-platform/config/config.local.js';
      if (!has(cfg)) return { note: 'no built package yet — nothing to check' };
      const r = npm('check:package');
      const live = /OTP_VERIFY[^\n]*c5e314c7/.test(r.out);
      const old = /OTP_VERIFY[^\n]*3e201620/.test(r.out);
      return { note: live ? 'the built package points at the hardened flow' : old ? 'the built package still points at the DEFECTIVE flow 3e201620' : 'check:package did not name a flow for OTP_VERIFY' };
    } },
  'ITEM-8': { kind: 'person', order: 2,
    who: 'operator, one line in the platform console',
    why: 'only the running page can say what its origin is. Every other item that needs an origin is waiting on this one value.',
    then: 'open the platform, F12, run `location.origin`, and compare it to ' + RECORDED_ORIGIN },
  'ITEM-42': { kind: 'repo', order: 9,
    act: () => {
      if (!ORIGIN) {
        const c = npm('portal:seo', '--check');
        return { ok: null, note: c.ok ? 'already absolute' : `waiting on ITEM-8 — rerun with --origin <the value location.origin printed>. Recorded, unconfirmed: ${RECORDED_ORIGIN}` };
      }
      const r = npm('portal:seo', '--origin', ORIGIN);
      return { ok: r.ok, note: r.out.trim().split('\n').slice(-1)[0] };
    } },
  'ITEM-22': { kind: 'person', order: 5,
    who: 'a security authority — not the operator alone',
    why: 'rotation regenerates live credentials and invalidates every published copy. It is an authority decision with a blast radius, and the worksheet is the most a script may do.',
    act: () => { const r = npm('rotation'); return { ok: r.ok, note: r.ok ? 'worksheet regenerated — the flows to rotate, in order' : r.out.split('\n').slice(-1)[0] }; } },
  'ITEM-2':  { kind: 'person', order: 1, who: 'operator', why: 'no flow has ever been invoked against the tenant. Only a real call closes it, and only a person can make the first one.' },
  'ITEM-3':  { kind: 'person', order: 11, who: 'operator, designer paste', why: 'Dataverse-backed flow; the patch is on disk and verified, delivery is the designer clipboard.' },
  'ITEM-4':  { kind: 'person', order: 11, who: 'operator, designer paste', why: 'same as ITEM-3, two submission flows.' },
  'ITEM-6':  { kind: 'person', order: 11, who: 'operator, designer paste', why: 'same as ITEM-3, ECM_DOCS_INTAKE write-back.' },
  'ITEM-11': { kind: 'person', order: 11, who: 'operator, designer paste', why: 'same as ITEM-3.' },
  'ITEM-12': { kind: 'person', order: 11, who: 'operator, designer paste', why: 'same as ITEM-3.' },
  'ITEM-17': { kind: 'person', order: 12, who: 'operator, designer build', why: 'the WRITEBACK flow does not exist yet; a flow cannot be created from here.' },
  'ITEM-23': { kind: 'tenant', order: 4, script: 'scripts/provision-sharepoint-fields.browser.js', note: 'sets the five index targets; SharePoint REST answers on your cookies' },
  'ITEM-30': { kind: 'tenant', order: 4, script: 'scripts/provision-sharepoint-fields.browser.js', note: 'provisions Portal Flow Telemetry.RunRecordJson' },
  'ITEM-40': { kind: 'repo', order: 12,
    act: () => {
      const dir = 'docs/reference/flow-contracts/deployed';
      const n = run('sh', ['-c', `ls "${rel(dir)}" | grep -c full_definition.json || true`]).out.trim();
      const r = npm('test:triggerauth');
      const m = r.out.match(/(\d+)\s+All\s+·\s+(\d+)\s+Tenant\s+·\s+(\d+)/);
      return { ok: r.ok, note: m ? `${n} contracts on disk · ${m[1]} anonymous, ${m[2]} tenant-scoped, ${m[3]} not stated in the export` : 'trigger audit ran; posture line not found' };
    } },
  'ITEM-25': { kind: 'repo', order: 12, act: () => { const r = npm('dynamicops'); return { ok: r.ok, note: r.out.trim().split('\n').slice(-1)[0] || 'operations re-derived' }; } },
  'ITEM-44': { kind: 'person', order: 3,
    who: 'the author for the reconciliation, then the agency for the delivery question',
    why: 'SETTLED 2026-09-04 and implemented on the client: both flows already agreed with each other, so the client was the single outlier and one change fixed both. npm run test:otpprotocol now asserts the seam against the deployed definitions. What remains is a live call — no OTP request has ever been made — and the recipient decision: Case_Generate mails the code to a literal registry address rather than to the requester.',
    then: 'docs/deployment/sharepoint/evidence/2026-09-04-otp-client-flow-mismatch.json — it does NOT block the ITEM-43 cutover, only the four tests as written' },
  /* Carried in by the 2026-09-05 consolidation from claude/system-notifications-provisioning-h5h1gy,
     which had no runner of its own, so these items had never been given plan entries. Renumbered
     from ITEM-38..44 there — those numbers name other items here. */
  'ITEM-48': { kind: 'person', order: 8,
    who: 'the platform technical owner for the sends; the agency if a promise is to be withdrawn instead',
    why: 'the portal promises citizens four emails the estate does not send. The SUBMISSION and WRITEBACK packages carry no SendEmailV2 action at all.',
    then: 'either build the sends or stop making the promise — the portal copy is the commitment' },
  'ITEM-50': { kind: 'person', order: 9,
    who: 'the platform technical owner',
    why: 'verification codes, correspondence, reports and assignment notices all go to a fixed mailbox. SN-005 records the OTP case read off the deployed definition.',
    then: 'reporting delivery to a correspondent who was never written to is worse than a visible failure' },
  'ITEM-51': { kind: 'person', order: 10,
    who: 'the platform technical owner, with the correspondence lifecycle process owner for the copy-to decision',
    why: 'officers are never told of assignments, approvals, escalations, delegations or reminders, while two clocks start on every assignment.',
    then: 'the two actions that claim to notify someone do not' },
  'ITEM-52': { kind: 'person', order: 11,
    who: 'the agency for SN-001 alongside MANUAL-4; the platform technical owner for SN-002 to SN-006',
    why: 'read endpoints and AI flows email record payloads to a shared mailbox. Surplus messages, not missing ones, and the decision is not technical.',
    then: 'same posture decision as MANUAL-4 — roughly 785 individuals are in scope for the data' },
  'ITEM-56': { kind: 'person', order: 2,
    who: 'the operator',
    why: "the ALLOWED_ORIGIN row is set (2026-09-05). What is not established is that it is the origin the browser actually sends — scheme and host, no trailing slash. Nothing here can read the list, and an origin that does not match fails exactly as the placeholder did, and just as silently.",
    then: 'the first live OTP verify call proves it: the response must carry that origin back' },
  'ITEM-57': { kind: 'person', order: 20,
    who: 'the agency, with whoever owns the platform\'s visual design',
    why: 'the archived DGO_OPS design system is more complete than the live one and predates it. Nothing fails while it stands, but an unlabelled second specification is what someone eventually builds against.',
    then: 'either mark it superseded in its README, or scope what is worth promoting — last, because nothing depends on it' },
  'ITEM-41': { kind: 'person', order: 14, who: 'the agency', why: 'turning approval off publishes 12,079 rows at once. That is a decision with an audience, not a task.' },
  'ITEM-37': { kind: 'person', order: 14, who: 'the agency', why: 'restore the crossing or amend D1 and D6 — a policy choice either way.' },
  'ITEM-7':  { kind: 'person', order: 13, who: 'whoever holds the third-party accounts', why: 'the keys are not issued by this tenant; nothing here can rotate them.' },
  'ITEM-9':  { kind: 'person', order: 13, who: 'someone who knows the estate', why: '27 flows have no stated purpose. A purpose cannot be inferred from a definition without inventing it.' },
  'ITEM-18': { kind: 'accepted', order: 11, note: 'accepted by the author: the digest is recorded, not enforced' },

  /* Not ITEM-. These were invisible until the id filter above was widened. */
  'CFG-1': { kind: 'person', order: 6,
    who: 'operator, once the rotated URLs exist',
    why: 'config/config.local.js does not exist, so every internal endpoint resolves to an empty string. The platform boots and transmits nothing. ITEM-22 has regenerated the URLs it needs; what is missing is the values file carrying them. npm run recover is retired and refuses to run — it wired from the pre-rotation corpus, and for OTP_VERIFY it would have restored the defective flow, the map having been repointed at the hardened IP_OTP_VERIFY. Use npm run values:template.',
    next: 'npm run setup -- --values <file> --force, then node scripts/check-config-local.mjs' },
  'CFG-2': { kind: 'person', order: 7,
    who: 'operator',
    why: 'the portal config does not exist either. Four of its seven keys point at flows carrying no disclosed token, so they did not wait on rotation; three have no workflow id recorded at all, which is a bounded task rather than a dependency. npm run recover is retired and refuses to run, which is just as well here — it wired three portal keys to internal flows.',
    next: 'record the workflow id for SUBMISSION, SUPPORT and UPLOAD, npm run rotation, then setup --force and check-config-local --portal' },
  'G-04': { kind: 'person', order: 14,
    who: 'the agency for the posture, then Power Automate for the implementation',
    why: 'the authenticating proxy was built and removed rather than deployed, so every obligation it carried — token validation, role derivation, per-action authorisation — belongs to each flow and no flow does it. Caller identity is a userEmail read from localStorage. No code in this repository can close it.' },
  'MANUAL-1': { kind: 'person', order: 14,
    who: 'the agency',
    why: 'the routing table decides who sees what. Approving it is a governance act, not a task.' },
  'MANUAL-2': { kind: 'person', order: 8,
    who: 'operator',
    why: 'test records have to be cleared before real correspondence arrives. Only someone who can tell a test row from a real one may delete it.' },
  'MANUAL-3': { kind: 'person', order: 10,
    who: 'operator',
    why: 'the browser suite must run against the deployed build, and there is no deployed build until CFG-1 and CFG-2 are done.' },
  'MANUAL-4': { kind: 'person', order: 14,
    who: 'the agency',
    why: 'personal data of roughly 785 individuals is in scope. That is a data-protection decision with an accountable owner.' },
};

/* THE ORDER, AND WHY IT IS NOT THE OBVIOUS ONE.
   `order` sequences by leverage and by the four constraints EXECUTION_GUIDE.md §0.4 already
   states, which are not deducible from the register's dependency graph:

     ITEM-2 first, though it is neither urgent nor exciting. It is a dry run that SENDS NOTHING
     and exists to prove tenant connectivity — and G-04, ITEM-3, ITEM-4, ITEM-6 and ITEM-11 all
     name it as a dependency. One no-write command unblocks five items; nothing else here has
     that ratio.

     ITEM-43 second because it is the only item where something exploitable is live, and it only
     became testable when ITEM-44 reconciled the protocol. Before that, repointing would have
     moved the portal from a flow with an authentication bypass to a flow it could not reach.

     "Decisions before pasting" (§0.4) puts the agency items LAST in this list but FIRST in wall
     time: the CORS origin and the mail connection are set inside each flow, so a decision taken
     after the pastes means opening all fourteen flows a second time. They are ordered late here
     because nobody in this repository can do them — not because they should be started late. */
/* ACCEPTED IS CLOSED. It was missing from this list, so ITEM-18 — a risk the author accepted on
   2026-09-03, recorded, and guarded by npm run test:claims — was counted as outstanding work.
   This command reported 25 open items while the register, ACTION_PLAN.md and npm run readiness
   all reported 24, and the one it added back was an accepted risk. An acceptance that keeps
   reappearing as pending is an acceptance nobody trusts, which is how it gets re-litigated. The
   register declares exactly two closed statuses; both belong here. CLOSED and DONE are kept
   because they cost nothing and a register that grew either would otherwise be miscounted. */
const REGISTER_CLOSED = ['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE', 'CLOSED', 'DONE'];
const open = [...items.values()].filter((i) => !REGISTER_CLOSED.includes(String(i.status).toUpperCase()));
const unplanned = open.filter((i) => !PLAN[i.id]).map((i) => i.id);

const bucket = { repo: [], tenant: [], person: [], accepted: [] };
for (const item of open.sort((a, b) => (PLAN[a.id]?.order ?? 99) - (PLAN[b.id]?.order ?? 99) || a.id.localeCompare(b.id))) {
  const p = PLAN[item.id];
  if (!p) continue;
  let result = null;
  if (p.act && (DO || p.kind !== 'repo')) result = p.act();
  bucket[p.kind === 'accepted' ? 'accepted' : p.kind].push({ item, p, result });
}

const W = (s, n) => String(s).padEnd(n);
console.log(`\n${DO ? 'RUNNING' : 'MEASURING (nothing is written — add --do to run the repo actions)'}`);
console.log(`${open.length} open items in the register\n`);

console.log('── RUNS HERE ' + '─'.repeat(56));
for (const { item, p, result } of bucket.repo) {
  /* ok:null means the action ran and declined to act — waiting on something, not done. */
  const state = !result ? '·' : result.ok === false ? '✗' : result.ok === null ? '⏸' : '✓';
  console.log(`  ${state} ${W(item.id, 9)} ${item.title.slice(0, 62)}`);
  if (result?.note) console.log(`      ${result.note}`);
  if (!result && !DO) console.log(`      not run — add --do`);
}
if (!bucket.repo.length) console.log('  (none)');

console.log('\n── RUNS IN A TAB ' + '─'.repeat(52));
const byScript = new Map();
for (const { item, p } of bucket.tenant) {
  if (!byScript.has(p.script)) byScript.set(p.script, []);
  byScript.get(p.script).push({ item, p });
}
for (const [script, group] of byScript) {
  console.log(`  paste ${script}`);
  for (const { item, p } of group) console.log(`      ${W(item.id, 9)} ${p.note}`);
}
if (!bucket.tenant.length) console.log('  (none)');

console.log('\n── NEEDS A PERSON ' + '─'.repeat(51));
for (const { item, p, result } of bucket.person) {
  console.log(`  ${W(item.id, 9)} ${item.title.slice(0, 64)}`);
  console.log(`      who : ${p.who}`);
  console.log(`      why : ${p.why}`);
  if (p.then) console.log(`      next: ${p.then}`);
  if (result?.note) console.log(`      now : ${result.note}`);
}

if (bucket.accepted.length) {
  console.log('\n── ACCEPTED ' + '─'.repeat(57));
  for (const { item, p } of bucket.accepted) console.log(`  ${W(item.id, 9)} ${p.note}`);
}

if (unplanned.length) {
  console.log(`\n❌ ${unplanned.length} open item(s) have no entry in this plan: ${unplanned.join(', ')}`);
  console.log('   An item with no entry is an item nobody has decided how to settle. Add it to PLAN.');
  process.exit(1);
}
console.log(`\n${bucket.repo.length} settle here · ${bucket.tenant.length} in a tab · ${bucket.person.length} need a person · ${bucket.accepted.length} accepted\n`);
