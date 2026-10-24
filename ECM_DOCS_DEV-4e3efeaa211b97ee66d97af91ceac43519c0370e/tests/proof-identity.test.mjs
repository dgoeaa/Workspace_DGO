#!/usr/bin/env node
/**
 * WHERE AN INTERNAL ENDPOINT GETS THE CALLER'S IDENTITY.
 *
 * WHY THIS EXISTS
 *
 * FETCH_ALL served the estate to a caller with no identity because its authorisation decision
 * was pinned to a constant. That was fixed. What the fix did NOT touch is the half underneath
 * it: every internal endpoint resolved the caller's ROLE from DGO_UserDirectory and took the
 * caller's IDENTITY from `userEmail` in the request body. A correct gate over a body-supplied
 * identity refuses a caller who names nobody and authorises a caller who names an administrator.
 *
 * AUTHENTICATION_CONTRACT.md §2 says it in terms — obligation 2, derive identity from the proof
 * only; obligation 4, ignore `userEmail` entirely, an attacker controls the request body. The
 * portal half has done this since it was built. The internal half now does too, against the same
 * proof ledger, and this file is what stops it drifting back.
 *
 * WHAT IT ASSERTS
 *
 *   · An endpoint that resolves a caller against the directory derives that caller from a proof
 *     row or from the tenant-authenticated principal header. Never from the body.
 *   · The proof lookup is a real check — unconsumed, unexpired, and scoped to this estate's
 *     Purpose — rather than the mere presence of a token.
 *   · Something MINTS what everything else verifies. A ledger nobody writes to refuses every
 *     caller, which is a safe failure and a completely broken platform.
 *   · The minted row and the response agree on expiry, read from one expression. Two separate
 *     addHours() calls resolve microseconds apart and buy one inexplicable 401 per session.
 *
 * WHERE IT LOOKS
 *
 * The identification Phase 4 packages (docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4): the adopted
 * flows' root scopes with the identification changes, G-04 among them. The DGO_* replacement packages this read before
 * 2026-10-06 are retired (registers/flow-retirement.json). While Flow Configuration IDENTITY_PROOF_REQUIRED is not true a
 * package may still take the address the request names, so the assertion is that the body is read ONLY behind that switch.
 *
 * WHAT IT DOES NOT ASSERT
 *
 * That the flows are deployed. These are paste artefacts: what the operator pastes in.
 * The tenant is evidenced by run records, not by this file. Nor does it claim the proof is
 * unforgeable in a cryptographic sense — it is an opaque token in a ledger, which is what Power
 * Automate can actually enforce, and the ledger is the thing that makes it mean anything.
 *
 * Usage:  node tests/proof-identity.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4');

const failures = [];
let passed = 0;
const check = (what, ok, detail = '') => {
  if (ok) { passed++; return; }
  failures.push(detail ? `${what} — ${detail}` : what);
};

const actionsOf = (pkg) => {
  const out = [];
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    out.push([n, a]); walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(pkg.serializedValue.actions);
  return out;
};
const led = JSON.parse(readFileSync(resolve(ROOT, 'docs/reference/internal-proof-ledger.json'), 'utf8'));
const SHARED_LEDGER = 'f5c9698e-4b6c-4ec7-97ee-dc540efab8a9';
const LEDGER = led.listId || SHARED_LEDGER;
/* A mint is a PostItem into the proof ledger that writes the columns a verifier reads back. */
const mints = (acts) => acts.filter(([, a]) => a.type === 'OpenApiConnection' && a.inputs?.host?.operationId === 'PostItem' && a.inputs.parameters?.table === LEDGER
  && ['item/Title', 'item/Email', 'item/Purpose', 'item/ExpiresAtUtc'].every((c) => c in a.inputs.parameters));
/* Flows with no HTTP caller: the library intake (legacy and its ITEM-80 rebuild) runs on a file arriving, and the
   scheduled sweep (2026-10-10) and the failure watch (2026-10-18) on their schedules. */
const NO_CALLER = /^NOKEY__(DGSO_INCOMING_AI_PROCESSING|Folio_Incoming_Correspondence_Scan_Processing_Flow|AUTO_SCHEDULED_SWEEP|Folio_Failure_Watch)__/;
const MINTER = /^OTP_VERIFY__IP_OTP_VERIFY__/;
const ISSUER = /^OTP_GENERATE__IP_OTP_GENERATE__/;

const files = readdirSync(DIR).filter((f) => f.endsWith('.paste.json')).sort();
check('the identification Phase 4 packages were found', files.length > 0, DIR);

let verifying = 0, minting = 0;
for (const file of files) {
  const pkg = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const acts = actionsOf(pkg);
  const byName = Object.fromEntries(acts);
  if (NO_CALLER.test(file)) {
    check(`${file} resolves no caller, as a file-triggered or scheduled flow should`, !acts.some(([n]) => /_Caller$/.test(n)));
    continue;
  }
  if (MINTER.test(file)) {
    const m = mints(acts);
    check(`${file} mints a proof row into the ledger`, m.length === 1, `${m.length} mint(s)`);
    check(`${file} does not require a proof to be presented`, !acts.some(([n]) => /_Proof_Mode$|_Gate_Proof$/.test(n)), 'sign-in would be impossible if the step that issues a proof demanded one');
    if (m.length) {
      const p = m[0][1].inputs.parameters;
      check(`${file} stamps Purpose internal-session`, p['item/Purpose'] === 'internal-session');
      check(`${file} writes the proof unconsumed`, p['item/Consumed'] === false);
      check(`${file} takes the expiry from one Compose, not an inline expression`, p['item/ExpiresAtUtc'] === "@outputs('Compose_Otp_Proof_Expires')", p['item/ExpiresAtUtc']);
      minting++;
    }
    const reply = JSON.stringify(acts.filter(([n]) => n === 'Append_to_string_variable_Verification_Successful').map(([, a]) => a.inputs.value));
    check(`${file} returns the token the client reads (core/otp-identity.js data.token)`, reply.includes(`"token":"@outputs('Compose_Otp_Proof_Token')"`), reply.slice(0, 200));
    check(`${file}: the row and the reply read one expiry expression`, reply.includes(`"expiresAt":"@outputs('Compose_Otp_Proof_Expires')"`));
    /* The value is held in a Compose step (composeVariableValues: the paste drops inline Set variable values). */
    const held = /^@outputs\('([^']+)'\)$/.exec(String(byName.Set_variable_varData?.inputs?.value));
    const dataValue = held ? byName[held[1]]?.inputs : byName.Set_variable_varData?.inputs?.value;
    check(`${file} answers with an object Folio can read`, String(dataValue).startsWith('@json('), String(dataValue));
    continue;
  }
  /* The code issuer (ITEM-82, owner decision 2026-10-07: generation on its own flow) runs before sign-in: it can neither
     demand a proof nor issue one. */
  if (ISSUER.test(file)) {
    check(`${file} does not require a proof to be presented`, !acts.some(([n]) => /_Proof_Mode$|_Gate_Proof$/.test(n)), 'sign-in would be impossible if the step that sends the code demanded a proof');
    check(`${file} mints no proof: only verification issues one`, mints(acts).length === 0);
    continue;
  }
  const callers = acts.filter(([n]) => /^Compose_\w+_Gate_Caller$/.test(n));
  check(`${file} resolves a caller through the gate`, callers.length === 1, callers.map(([n]) => n).join(', '));
  for (const [name, a] of callers) {
    const tag = name.replace(/^Compose_/, '').replace(/_Caller$/, '');
    const expr = String(a.inputs);
    const identity = String(byName[`Compose_${tag}_Identity`]?.inputs?.proofValid || '');
    const required = String(byName[`Compose_${tag}_Identity`]?.inputs?.proofRequired || '');
    const lookup = String(byName[`Get_${tag}_Proof`]?.inputs?.parameters?.$filter || '');
    const table = byName[`Get_${tag}_Proof`]?.inputs?.parameters?.table;
    /* The proof's address first; the body only when the switch is off; nobody when it is on. */
    check(`${file}.${name} takes the proof's address when the proof is valid`, expr.startsWith(`@if(outputs('Compose_${tag}_Identity')?['proofValid'],`) && expr.includes(`outputs('Get_${tag}_Proof')`), expr.slice(0, 140));
    check(`${file}.${name} reads the request only while IDENTITY_PROOF_REQUIRED is off`, expr.includes(`if(outputs('Compose_${tag}_Identity')?['proofRequired'],'',`), expr.slice(0, 200));
    check(`${file}: the switch is IDENTITY_PROOF_REQUIRED from Flow Configuration`, /Title eq 'IDENTITY_PROOF_REQUIRED'/.test(String(byName[`Get_${tag}_Proof_Mode`]?.inputs?.parameters?.$filter)) && /'true'/.test(required));
    check(`${file}: the proof must be present`, /not\(empty\(/.test(identity), identity.slice(0, 140));
    check(`${file}: the proof row must exist`, /greater\(length\(/.test(identity), identity.slice(0, 140));
    check(`${file}: the proof must be unexpired`, /ExpiresAtUtc/.test(identity) && /ticks\(/.test(identity), identity.slice(0, 140));
    check(`${file}: only an unconsumed proof is accepted`, /Consumed eq 0/.test(lookup), lookup.slice(0, 160));
    check(`${file}: only a proof issued for this estate is accepted`, /Purpose eq ''internal-session''/.test(lookup), lookup.slice(0, 160));
    check(`${file}: the proof is read from the internal ledger`, table === LEDGER, String(table));
    verifying++;
  }
}
check('at least one internal endpoint verifies a proof', verifying > 0, `${verifying}`);
/* The asymmetry that would break everything quietly: all verifiers, no minter. */
check('something mints the proof the others verify', minting === 1, `${minting} minter(s)`);

/* ---- the ledger the internal estate reads, and the decision behind it ---- */
check('the ledger decision is recorded', typeof led.decision === 'string' && led.decision.length > 40);
check('the list to provision names every column a verifier reads back',
  ['Title', 'Email', 'Purpose', 'ExpiresAtUtc', 'Consumed'].every((c) => (led.listToProvision.columns || []).some((x) => x.internalName === c)));
const usesShared = files.some((f) => readFileSync(join(DIR, f), 'utf8').includes(SHARED_LEDGER));
if (led.listId) {
  /* Once the list exists, using the shared one is a regression, not a fallback. */
  check('the internal flows read the provisioned internal ledger, not the shared one', !usesShared, `listId is ${led.listId} but a package still names the shared ledger`);
  check('the ledger record no longer says it is waiting', led.status !== 'AWAITING_PROVISIONING');
} else {
  /* The fallback is allowed and must stay visible; its safety rests on the Purpose filter, asserted above per package. */
  check('the interim is declared while the list is unprovisioned', led.status === 'AWAITING_PROVISIONING' && typeof led.untilThen === 'string');
}

/* EVERY INTERNAL ENDPOINT KEY IS COVERED (readiness register ITEM-76). Each contract key the internal platform calls
   (config/endpoints.config.js) is served by one adopted flow (registers/flow-adoption.json); that flow has a package here
   that resolves its caller through the gate. OTP_GENERATE and OTP_VERIFY establish the identity rather than verify it;
   SCAN_INTAKE is the scanning station's intake, packaged with the portal flows (identification-phase3); DISPATCH_OUTBOUND
   and ARCHIVE_REFERENCE call DYNAMIC_ACTIONS's URL. */
{
  const cfg = readFileSync(resolve(ROOT, 'config/endpoints.config.js'), 'utf8');
  const block = cfg.slice(cfg.indexOf('export const EndpointContracts'));
  const keys = [...block.matchAll(/^  ([A-Z_]+): Object\.freeze\(/gm)].map((m) => m[1]);
  const ESTABLISH = new Set(['OTP_GENERATE', 'OTP_VERIFY']);
  const ELSEWHERE = { SCAN_INTAKE: 'identification-phase3', DISPATCH_OUTBOUND: 'DYNAMIC_ACTIONS', ARCHIVE_REFERENCE: 'DYNAMIC_ACTIONS' };
  const adopted = JSON.parse(readFileSync(resolve(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json'), 'utf8')).adopted;
  const gated = new Set(files.filter((f) => actionsOf(JSON.parse(readFileSync(join(DIR, f), 'utf8'))).some(([n]) => /^Compose_\w+_Gate_Caller$/.test(n))).map((f) => (/__([0-9a-f]{8})(?:__|\.)/.exec(f) || [])[1]));
  const uncovered = [];
  for (const k of keys) {
    if (ESTABLISH.has(k) || ELSEWHERE[k] === 'identification-phase3') continue;
    const key = ELSEWHERE[k] || k;
    const flow = adopted.find((a) => (a.contractKeys || []).includes(key));
    if (!flow) { uncovered.push(`${k}: no adopted flow`); continue; }
    if (!gated.has(flow.flowId.slice(0, 8))) uncovered.push(`${k}: ${flow.name} (${flow.flowId.slice(0, 8)}) has no package that resolves the caller`);
  }
  check(`every internal endpoint key (${keys.length}) is served by an adopted flow whose package resolves the caller from the proof`, keys.length > 15 && !uncovered.length, uncovered.join('; '));
}

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.error(`   · ${f}`)); process.exit(1); }
process.exit(0);
