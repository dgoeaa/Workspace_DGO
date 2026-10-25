/**
 * liftEnvelope — the seam between what a flow returns and what the OBSIDIAN callers read.
 *
 * core/otp-identity.js reads res.sent, res.verification and res.claims off the top level;
 * core/dispatch-service.js reads res.ok. `invoke()` hands back the envelope, where all of those
 * sit one level down under `data`. Getting this wrong is silent — the HTTP status is 200, so the
 * caller reads success with the field missing and tells a citizen their correct code was refused.
 */
import { liftEnvelope } from '../core/contracts.js';

let passed = 0, failed = 0;
const is = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}\n       expected ${e}\n       actual   ${a}`); }
};

const envelope = (data, http = 200) => ({
  ok: http < 400,
  status: { http, code: http < 400 ? 'OK' : `ERR${http}`, message: http < 400 ? 'Success' : 'Failed' },
  request: { requestId: 'r1', trackingId: '', action: 'otpVerify' },
  timing: { receivedAtUtc: '', completedAtUtc: '', durationMs: 0 },
  data, errors: [], meta: { runId: '', flowName: '', contractVersion: 'x' },
});

console.log('\nliftEnvelope\n');

// The two reads that were broken.
is('the proof reaches the top level',
  liftEnvelope(envelope({ ok: true, verification: 'PROOF-123', expiresAt: 'Z' })).verification, 'PROOF-123');
is('claims reach the top level',
  liftEnvelope(envelope({ ok: true, claims: { roles: ['operator'] } })).claims, { roles: ['operator'] });
is('a truthful sent:false survives',
  liftEnvelope(envelope({ sent: false, expiresAt: 'Z' })).sent, false);

// The envelope decides ok, not the payload — otherwise a 501 whose payload omits `ok` reads
// as success, and dispatch-service.js records a dispatch that never happened.
is('a 501 is a failure even when the payload says nothing about it',
  liftEnvelope(envelope({ code: 'NOT_IMPLEMENTED', applied: false }, 501)).ok, false);
is('a payload cannot upgrade a failed envelope',
  liftEnvelope(envelope({ ok: true }, 500)).ok, false);
is('a payload ok:false is honoured on a 200',
  liftEnvelope(envelope({ ok: false, reason: 'refused' })).ok, false);
is('ok defaults to true on a successful envelope',
  liftEnvelope(envelope({ caseRef: 'CASE-ABC' })).ok, true);

// Shapes that must pass through untouched rather than throw.
is('a response with no data is returned as-is', liftEnvelope({ ok: true }), { ok: true });
is('null survives', liftEnvelope(null), null);
is('a non-object payload is not lifted', liftEnvelope(envelope('plain')).data, 'plain');
is('an array payload is not lifted', liftEnvelope(envelope([1, 2])).data, [1, 2]);

// errors must survive: assertEnvelope's callers report them to the operator.
is('errors are carried through',
  liftEnvelope({ ...envelope({}, 400), errors: [{ message: 'bad' }] }).errors, [{ message: 'bad' }]);

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
