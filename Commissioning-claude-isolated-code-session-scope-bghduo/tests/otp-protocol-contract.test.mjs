#!/usr/bin/env node
/**
 * The client and the OTP flows must speak one protocol.
 *
 * WHY THIS EXISTS
 * They did not, and nothing noticed. `core/data-client.js` sent action "otpGenerate"/"otpVerify"
 * with every field nested under `payload`; both flows switch on "generate"/"verify" and read
 * `identifier` and `otp_code` at the top level. The Switch matched no case, so no OTP path could
 * run at all — and it had never run, so no failure had ever been observed (ITEM-2, ITEM-44).
 *
 * This is a class of defect no unit test on either half can catch, because each half is correct
 * on its own terms. It is only visible from the seam. So the seam is asserted here, against the
 * DEPLOYED flow definitions rather than a description of them: what the client would put on the
 * wire is checked field by field against what the flow reads off it.
 *
 * Run: node tests/otp-protocol-contract.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const DEPLOYED = 'docs/reference/flow-contracts/deployed';

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

/** The body core/data-client.js builds, reproduced from the source rather than described. */
const clientSource = read('core/data-client.js');
const bodyLine = clientSource.split('\n').find((l) => l.includes('options.flatPayload?'));
ok('the client still builds its body the one way this test models',
   Boolean(bodyLine) && /\{action:contract\.action,\.\.\.payload/.test(bodyLine) &&
   /\{action:contract\.action,payload/.test(bodyLine),
   'data-client.js changed shape — re-read it before trusting anything below');

const buildBody = ({ action, payload, flat }) => flat
  ? { action, ...payload, userEmail: 'a@b.gov.ng', correlationId: 'x' }
  : { action, payload, userEmail: 'a@b.gov.ng', requestId: 'x', timestamp: 't' };

/* What the client is configured to send, read out of the config and the call sites. */
const endpoints = read('config/endpoints.config.js');
const otpIdentity = read('core/otp-identity.js');
const actionOf = (key) => (endpoints.match(new RegExp(`${key}: Object\\.freeze\\(\\{[^}]*action:"([^"]+)"`)) || [])[1];
const callOf = (alias) => {
  const m = otpIdentity.match(new RegExp(`invokeObsidianAction\\('${alias}',\\s*\\{([^}]*)\\}\\s*,\\s*\\{([^}]*)\\}`));
  return m ? { fields: [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]), opts: m[2] } : null;
};

for (const [key, alias, file] of [
  ['OTP_GENERATE', 'REQUEST_OTP', 'Web - OTP Generate'],
  ['OTP_VERIFY', 'VERIFY_OTP', 'IP_OTP_VERIFY'],
]) {
  console.log(`\n  ${key}`);
  const name = readdirSync(path.join(ROOT, DEPLOYED)).find((f) => f.startsWith(file));
  ok(`the deployed definition is on disk (${file})`, Boolean(name));
  if (!name) continue;
  const defn = JSON.parse(read(`${DEPLOYED}/${name}`)).definition;
  const flowText = JSON.stringify(defn);

  /* What the flow reads, taken from the definition. */
  const topLevel = new Set([...flowText.matchAll(/triggerBody\(\)\?\['(\w+)'\]/g)].map((m) => m[1]));
  const underPayload = new Set([...flowText.matchAll(/triggerBody\(\)\?\['payload'\]\?\['(\w+)'\]/g)].map((m) => m[1]));
  const cases = [...flowText.matchAll(/"case"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);

  const call = callOf(alias);
  ok('the call site passes flatPayload', Boolean(call) && /flatPayload:\s*true/.test(call.opts),
     call ? call.opts : 'call site not found in core/otp-identity.js');
  const body = buildBody({ action: actionOf(key), payload: Object.fromEntries((call?.fields || []).map((f) => [f, 'v'])), flat: true });

  if (cases.length) {
    ok(`the dispatch value reaches a case (${actionOf(key)} in [${cases.join(', ')}])`,
       cases.includes(body.action),
       `the Switch would fall to default and the request would answer 500`);
  }
  /* Only the fields the flow reads WITHOUT a coalesce are mandatory; a coalesced read has
     fallbacks and is not a contract violation on its own. */
  const REQUIRED = { OTP_GENERATE: ['identifier'], OTP_VERIFY: ['identifier', 'otp_code'] }[key];
  for (const f of REQUIRED) {
    ok(`the flow reads ${f} and the client sends it`,
       topLevel.has(f) && body[f] !== undefined,
       `flow reads it top-level: ${topLevel.has(f)} · client sends it: ${body[f] !== undefined}`);
  }
  ok('the flow reads nothing under payload, which is why flatPayload is required',
     underPayload.size === 0, [...underPayload].join(', '));
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
