/**
 * Do the portal probes carry the contract's field names?
 *
 * scripts/verify-endpoints.mjs is what an operator runs against a live tenant to answer "do
 * these flows work?". Its probe table is hand-written, so it can drift from the contract while
 * still looking plausible — and it had. It carried the pre-reconciliation names
 * (`SubmitterName`, `EmailAddress`, `DocumentType`, and `subject` where SUPPORT's contract says
 * `topic`) and sent an explicit `action` to VERIFY and VERIFY_CONFIRM, which the portal never
 * sends and which a correct flow refuses with 400. A probe that fails a working flow is worse
 * than no probe: it sends the operator hunting a defect that is in the probe.
 *
 * So every field a portal probe sends must be a field the contract defines for that endpoint.
 */
import { readFileSync } from 'node:fs';
import { probeTables } from '../scripts/lib/endpoint-probes.mjs';

const contract = JSON.parse(readFileSync(new URL('../docs/deployment/sharepoint/portal-data-contract.json', import.meta.url), 'utf8'));
const byKey = Object.fromEntries(contract.contracts.filter(c => !c.key.startsWith('_')).map(c => [c.key, c]));
const { PORTAL_PROBES } = probeTables({ probeEmail: 'probe@example.invalid', runId: 'RUN' });

let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✅ ${name}`); };
const no = (name, detail) => { failed++; console.log(`  ❌ ${name}\n       ${detail}`); };

console.log('\nPortal probes against the authoritative contract\n');

/* Every endpoint the contract defines is probed. */
for (const key of Object.keys(byKey)) {
  if (PORTAL_PROBES[key]) ok(`${key} is probed`);
  else no(`${key} is probed`, 'the contract defines this endpoint and no probe exercises it');
}

/* Every field a probe sends is a field the contract defines. */
for (const [key, probe] of Object.entries(PORTAL_PROBES)) {
  const spec = byKey[key];
  if (!spec) { no(`${key} is in the contract`, 'the probe table names an endpoint the contract does not'); continue; }
  if (!probe.body) { ok(`${key} sends only headers and bytes`); continue; }

  const defined = new Set();
  for (const f of spec.request || []) {
    const field = String(f.field).replace(/\[\]$/, '');
    defined.add(field);
    if (field.includes('.')) defined.add(field.split('.')[0]);   // sender.name -> sender
  }
  const sent = Object.keys(probe.body);
  const strays = sent.filter(k => !defined.has(k));
  if (strays.length === 0) ok(`${key} sends only contract fields (${sent.length})`);
  else no(`${key} sends only contract fields`, `sends ${strays.join(', ')}; the contract defines ${[...defined].sort().join(', ')}`);

  /* Every field the contract marks required:true is sent, so a probe cannot pass by
     under-sending and getting a 400 that looks like a working validation. */
  const required = (spec.request || [])
    .filter(f => f.required === true)
    .map(f => String(f.field).split('.')[0].replace(/\[\]$/, ''));
  const missing = [...new Set(required)].filter(k => !sent.includes(k));
  if (missing.length === 0) ok(`${key} sends every required field`);
  else no(`${key} sends every required field`, `omits ${missing.join(', ')}`);
}

/* VERIFY and VERIFY_CONFIRM must not send `action` — the flow routes on `code`. */
for (const key of ['VERIFY', 'VERIFY_CONFIRM']) {
  if (PORTAL_PROBES[key]?.body && 'action' in PORTAL_PROBES[key].body) {
    no(`${key} does not send 'action'`, 'the portal never sends it and a correct flow refuses an action outside {generate, verify}');
  } else ok(`${key} does not send 'action'`);
}

/* Every portal probe is marked flat, so the shape check rejects an enveloped answer. */
for (const [key, probe] of Object.entries(PORTAL_PROBES)) {
  if (probe.flat === true) ok(`${key} expects a flat response`);
  else no(`${key} expects a flat response`, 'without `flat: true` an enveloped answer passes, which is the defect the portal set had');
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
