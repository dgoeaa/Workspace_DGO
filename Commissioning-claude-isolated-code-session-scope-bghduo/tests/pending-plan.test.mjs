#!/usr/bin/env node
/**
 * Two things about the pending-work machinery that have to stay true.
 *
 * ONE — `npm run pending` must see every open item.
 * It buckets the register's open items into settle-here / settle-in-a-tab / needs-a-person. It
 * loaded them by matching ids beginning `ITEM-`, which silently excluded CFG-1, CFG-2, G-04 and
 * the four MANUAL gates — three of the seven blockers. Worse, its own "no entry in this plan"
 * warning could not fire for them, because an item that never enters the map cannot be reported
 * missing from it. A filter that hides work is worse than no filter, so the shapes the register
 * actually uses are asserted here rather than left to a prefix.
 *
 * TWO — `npm run recover` must not be trusted for the portal.
 * Recovery fills a configuration from the documented corpus and is the obvious way to bootstrap.
 * For the internal runtime every key it fills matches the endpoint map. For the portal three keys
 * do not: they resolve onto INTERNAL flows, so a recovered portal config looks populated and
 * calls the wrong flows. This measures the contradiction rather than restating it, so the day
 * recovery is fixed the test says so instead of freezing yesterday's warning.
 *
 * Run: node tests/pending-plan.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const reg = JSON.parse(read('docs/deployment/PRODUCTION_READINESS_REGISTER.json'));
const runner = read('scripts/run-pending.mjs');

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

console.log('\nThe pending-work plan\n');

console.log('  THE RUNNER SEES EVERY OPEN ITEM');
const HIDDEN = new Set(['RESOLVED', 'DISCHARGED_UNTRACKABLE', 'CLOSED', 'DONE']);
const open = reg.items.filter((i) => !HIDDEN.has(String(i.status).toUpperCase()));
/* Read the runner's own id filter and apply it, rather than trusting that it matches. */
const m = runner.match(/\/\^\(([A-Z|]+)\)-\\d\+\$\//);
ok('the runner filters ids by an explicit shape', Boolean(m), 'no id pattern found in run-pending.mjs');
const accepted = m ? new RegExp(`^(${m[1]})-\\d+$`) : /^ITEM-\d+$/;
const invisible = open.filter((i) => !accepted.test(i.id));
ok(`every open item matches that shape (${open.length} open)`, invisible.length === 0,
   `invisible to the runner: ${invisible.map((i) => `${i.id} [${i.category}]`).join(', ')}`);
const blockers = open.filter((i) => i.category === 'BLOCKING');
ok(`every BLOCKING item is visible (${blockers.length})`,
   blockers.every((i) => accepted.test(i.id)),
   blockers.filter((i) => !accepted.test(i.id)).map((i) => i.id).join(', '));
const planned = new Set([...runner.matchAll(/^\s*'((?:ITEM|CFG|G|MANUAL)-\d+)':/gm)].map((x) => x[1]));
const unplanned = open.filter((i) => !planned.has(i.id));
ok('every open item has a plan entry, so none falls through to a warning',
   unplanned.length === 0, `no plan entry: ${unplanned.map((i) => i.id).join(', ')}`);
ok('and the plan names no item the register has closed',
   [...planned].every((id) => reg.items.some((i) => i.id === id)),
   [...planned].filter((id) => !reg.items.some((i) => i.id === id)).join(', '));

console.log('\n  RECOVERY IS MEASURED AGAINST THE ENDPOINT MAP');
const MAP = JSON.parse(read('docs/reference/endpoint-workflow-ids.json'));
const { recoverEndpoints } = await import(path.join(ROOT, 'scripts/lib/endpoint-recovery.mjs'));
const r = recoverEndpoints({ runtimeKeys: Object.keys(MAP.internal), portalKeys: Object.keys(MAP.portal) });
const wid = (u) => (String(u).match(/workflows\/([0-9a-f]{32})/) || [])[1] || null;
const cmp = { agree: [], contradict: [], noId: [] };
for (const [surface, scope] of [['runtime', 'internal'], ['portal', 'portal']]) {
  for (const [k, v] of Object.entries(r[surface]?.found || {})) {
    const got = wid(v.url), want = MAP[scope][k]?.workflowId || null;
    if (!want) cmp.noId.push(`${scope}.${k}`);
    else if (got === want) cmp.agree.push(`${scope}.${k}`);
    else cmp.contradict.push({ scope, key: k, got, want, flow: MAP[scope][k].flow });
  }
}
console.log(`     ${cmp.agree.length} agree · ${cmp.contradict.length} contradict · ${cmp.noId.length} the map has no id for`);
ok('the comparison resolves something at all', cmp.agree.length + cmp.contradict.length > 0);
/* Every contradiction must be one somebody decided on, not one that appeared. The set is named
   here with its reason, so a NEW one fails this test rather than joining a count. */
const KNOWN = {
  /* The three portal entries this list used to carry — STATUS, VERIFY, VERIFY_CONFIRM, each
     "the portal keys resolve onto internal flows in the corpus" — are gone because that is no
     longer true. claude/system-remediation-gaps-ahpmsy 95cae03 withdrew the portal mapping
     outright, having found that four portal keys resolved onto INTERNAL workflow ids carrying
     triggerAuthenticationType All: a portal package built from it would have handed anonymous
     visitors a working URL into the internal estate. Recovery now resolves no portal key at
     all, which the assertion below states positively so the coverage is not merely dropped.

     WHY THIS LIST GREW FROM 5 TO 17.
     It was written when docs/reference/endpoint-workflow-ids.json was stitched together from
     this repository's own older artefacts by scripts/build-endpoint-workflow-ids.mjs. That
     generator was retired in 39da997: the file is now produced by
     scripts/reconcile-endpoint-register.mjs from docs/reference/endpoint-register.json, which
     is exported from the tenant, covers all 25 contract keys, and is post-rotation. Reconciled
     against it, every key the old generator emitted pointed at a superseded workflow — so the
     five keys where the map already outranked the corpus became seventeen, which is simply
     every internal key recovery still resolves.
     The cause is one decision, not twelve, and it is asserted below rather than asserted here:
     every entry's map value is the id the register names for that key, and no id the corpus
     holds appears anywhere in the register's current configuration. Both are checked, so a
     contradiction arising from anything OTHER than "the register outranks the corpus" still
     fails this test instead of joining a count. */
  'internal.FETCH_ALL': 'the tenant map outranks the corpus (claude/fetchall-flow-error-1h94u5 ' +
    '2921b1c, 2198c8c): the map holds IP_FETCH_ALL_ENDPOINT\'s trigger-URL id and the corpus ' +
    'still holds the older flow, so recovery would wire this key to a superseded flow',
  'internal.REFERENCE_DATA': 'the tenant map outranks the corpus: the operator chose ' +
    'IP_Reference_Data_Endpoint over the corpus flow when both were put to them (a553f01)',
  'internal.SINGLE_ASSIGNMENT': 'the tenant map outranks the corpus: the id was read out of ' +
    'IP_Single_Assignment_Endpoint\'s own trigger URL by check-config-local',
  'internal.AI_DOC_ANALYSIS': 'the tenant map outranks the corpus: AI_Document_Processing\'s ' +
    'trigger-URL id, the only AI-document flow in the operator\'s map',
  'internal.OTP_VERIFY': 'the map is repointed at the hardened IP_OTP_VERIFY, which the register ' +
    'invokes at b372d45e4b2a47d88b8e8b032da67fcd; the corpus still holds ' +
    '43879c5165de439680055ab4258b3f27, an id the tenant registry does not list at all, so ' +
    'recovery here would restore the authentication bypass',
  /* The twelve the reconciliation added. Same single cause as above: the register names the
     workflow, the corpus predates it. Each is listed by name so that a key LEAVING this set
     fails the "still there" assertion below. */
  'internal.OTP_GENERATE': 'the register points this key at IP_OTP_VERIFY (b372d45e…), the same ' +
    'workflow as OTP_VERIFY; the corpus holds 314aaf27…, which the register records as ' +
    'endpoint_not_shared',
  'internal.FETCH_ACTIVITIES': 'the register names IP_Get_Docs_Endpoint; the corpus predates it',
  'internal.GET_DOCS': 'the register names IP_Get_Docs_Endpoint; the corpus predates it',
  'internal.SUBSIDIARY_ACTIONS': 'the register names IP_Dynamic_Global_Actions_Endpoint; the ' +
    'corpus predates it',
  'internal.DYNAMIC_ACTIONS': 'the register names IP_Dynamic_Global_Actions_Endpoint; the ' +
    'corpus predates it',
  'internal.FETCH_EMAIL_ATTACHMENTS': 'the register names IP_Retrieve_Email_Attachment_Endpoint; ' +
    'the corpus predates it',
  'internal.BULK_ASSIGNMENT': 'the register names BULK OPS DATA RETRIEVAL HTTP; the corpus ' +
    'predates it',
  'internal.BULK_ASSIGNMENT_DIRECT': 'the register names IP_Bulk_Assign_Endpoint; the corpus ' +
    'predates it',
  'internal.EMAIL': 'the register names IP_SEND_EMAIL; the corpus predates it',
  'internal.EMAIL_RELATED_TASK': 'the register names IP_Create_Email_Assignment_Endpoint; the ' +
    'corpus predates it',
  'internal.AI_EMAIL_ANALYSIS': 'the register names AI_Document_Processing; the corpus predates it',
  'internal.AI_CHAT': 'the register names AI_Document_Processing; the corpus predates it',
};
const seen = cmp.contradict.map((c) => `${c.scope}.${c.key}`).sort();
ok(`every contradiction is one that was decided on (${seen.length})`,
   seen.every((k) => KNOWN[k]),
   `unaccounted: ${seen.filter((k) => !KNOWN[k]).join(', ')} — recovery moved; re-read it before editing this list`);
ok('and each one that was decided on is still there',
   Object.keys(KNOWN).sort().every((k) => seen.includes(k)),
   `no longer contradicting: ${Object.keys(KNOWN).filter((k) => !seen.includes(k)).join(', ')} — if recovery was ` +
   'fixed, say so here and in the register rather than leaving a stale warning');
/* THE CAUSE, ASSERTED RATHER THAN NARRATED.
   The list above says every contradiction is "the register outranks the corpus". That claim is
   checked here against docs/reference/endpoint-register.json itself, so the list cannot drift
   into a place where an unrelated contradiction is waved through by having been typed in.
   Two properties, both of which must hold for every contradicting key:
     · the map value IS the workflow the register names for that key — the map is not carrying
       some third id of its own; and
     · the id the corpus holds appears NOWHERE in the register's current configuration — it is
       genuinely superseded, not merely attached to a different key.
   A contradiction that fails either one is not this decision and fails the build. */
const REGISTER = JSON.parse(read('docs/reference/endpoint-register.json'));
const regByKey = new Map(REGISTER.current_configuration.map((e) => [e.key.replace(/^DGO_ENDPOINT_/, ''), e.workflow_id]));
const regIds = new Set(REGISTER.current_configuration.map((e) => e.workflow_id));
const notFromRegister = cmp.contradict.filter((c) => c.scope !== 'internal' || regByKey.get(c.key) !== c.want);
ok(`every contradiction's map value is the workflow the tenant register names (${cmp.contradict.length})`,
   notFromRegister.length === 0,
   `not from the register: ${notFromRegister.map((c) => `${c.scope}.${c.key} map=${c.want} register=${regByKey.get(c.key) ?? '(absent)'}`).join(', ')}`);
const corpusStillCurrent = cmp.contradict.filter((c) => regIds.has(c.got));
ok('and no id the corpus holds is still a current endpoint in the register',
   corpusStillCurrent.length === 0,
   `still current: ${corpusStillCurrent.map((c) => `${c.scope}.${c.key}=${c.got}`).join(', ')} — that is not a ` +
   'superseded flow, so "the register outranks the corpus" is the wrong explanation for it');
/* The positive half of the withdrawal above: recovery resolving ANY portal key is the defect,
   not just resolving one onto an id that disagrees with the map. Asserted here so the three
   entries removed from KNOWN cannot come back unnoticed as agreements. */
ok('recovery resolves no portal key at all, which is what the withdrawal means',
   Object.keys(r.portal?.found || {}).length === 0,
   `portal keys resolved: ${Object.keys(r.portal?.found || {}).join(', ')} — the mapping was ` +
   'withdrawn in 95cae03 because four of them pointed at internal flows open to anonymous callers');
/* THE HARDENED FLOW'S ID CHANGED, THE FINDING DID NOT.
   This asserted the map wanted c5e314c768b54bdc89350954ef6a256d. That was the id the retired
   generator carried. The tenant register is the authority now, and it records two distinct
   workflows here: c5e314c768b54bdc89350954ef6a256d is named OTP_VERIFY and its endpoint_status
   is `endpoint_not_shared` — it has no invocable trigger — while the hardened IP_OTP_VERIFY is
   reached at b372d45e4b2a47d88b8e8b032da67fcd, `available_credentials_removed`, which is what
   current_configuration points DGO_ENDPOINT_OTP_VERIFY at. Exactly the flow-id / workflow-id
   confusion the register exists to end.
   What recovery would restore is unchanged, and worse than was recorded:
   43879c5165de439680055ab4258b3f27 does not appear in the tenant's flow registry at all. */
const otp = cmp.contradict.find((c) => c.key === 'OTP_VERIFY');
const OTP_HARDENED = 'b372d45e4b2a47d88b8e8b032da67fcd';
ok('recovery would restore the DEFECTIVE OTP flow, and that is asserted rather than assumed',
   Boolean(otp) && otp.got === '43879c5165de439680055ab4258b3f27' && otp.want === OTP_HARDENED,
   otp ? `got ${otp.got}, map needs ${otp.want}` : 'OTP_VERIFY no longer contradicts');
ok('the id recovery would restore is not a flow the tenant still lists',
   !REGISTER.complete_flow_registry.some((w) => w.workflow_id === '43879c5165de439680055ab4258b3f27'),
   'the corpus id is in the tenant registry after all — re-read what recovery would do');
ok('CFG-1 and CFG-2 both warn against recovery where it is wrong',
   /npm run recover must NOT be used/.test(runner) && /restore the defective/i.test(runner),
   'the warning has to reach whoever is about to configure EITHER surface');
ok('CFG-2 warns against recovery in its own register entry',
   /npm run recover must NOT be used here/.test(runner) ||
   JSON.stringify(reg.items.find((i) => i.id === 'CFG-2')).includes('recover'),
   'the warning has to live where someone about to configure the portal will read it');

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
