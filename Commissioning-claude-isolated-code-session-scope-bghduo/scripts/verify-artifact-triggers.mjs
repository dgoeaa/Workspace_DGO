#!/usr/bin/env node
/**
 * Do the remediation artifacts read the fields the portal actually sends?
 *
 * WHY THIS EXISTS
 * `PORTAL_DATA_CONTRACT.md` says what each endpoint receives, down to the field name, and it is
 * authoritative: flows conform to it. The remediation artifacts say which actions to place in
 * each flow, and their expressions name trigger fields directly — `triggerBody()?['reference']`.
 *
 * Those two were written at different times against different sources. The artifacts were
 * written against the DEPLOYED flows' existing trigger schemas; the contract was written later,
 * against `document-portal/js/`'s actual request bodies. Nobody has reconciled them.
 *
 * A field name that disagrees does not fail loudly. `triggerBody()?['reference']` on a body that
 * carries `referenceId` evaluates to null, the `$filter` becomes `Title eq ''`, and the endpoint
 * answers "no match" for every reference ever submitted. That is a flow which passes every
 * structural check in this repository and serves nobody.
 *
 * OPEN_ITEMS item 12 records one instance of this class — SUBMISSION's attachments. This
 * measures the whole surface instead of one field, because the same defect at the same layer
 * should be counted once rather than discovered one endpoint at a time.
 *
 * This REPORTS. It does not fail the build, for the same reason `npm run wiring` does not: the
 * gap is real, known, and closing it is a decision (change the artifacts, or change the client,
 * or change the contract) rather than a typo to fix in passing.
 *
 * Usage:
 *   node scripts/verify-artifact-triggers.mjs
 *   node scripts/verify-artifact-triggers.mjs --json
 *   node scripts/verify-artifact-triggers.mjs --strict   # exit 1 if anything is unreconciled
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');

const contract = read('docs/deployment/sharepoint/portal-data-contract.json');
const byKey = new Map(contract.contracts.map((c) => [c.key, c]));

/* Fields a flow legitimately reads that are not contract request fields.
 *
 * `action` is the route discriminator. Several contract keys share one physical flow —
 * SUBSIDIARY_ACTIONS serves STATUS and SUPPORT among others — and the flow switches on it
 * (D3). It is transport, not payload, so the contract does not list it and its absence here
 * is not a defect. Everything else must be justified or reconciled. */
const TRANSPORT_FIELDS = new Set(['action']);

const REMEDIATION = 'docs/deployment/sharepoint/remediation/';

/* Only the sections that become endpoint logic. `standardConformance` carries the build-standard
   remediation — redaction composes and telemetry capture — which names the trigger fields the
   EXISTING flow happens to carry so they can be blanked. Those are not the endpoint's own reads,
   and counting them reported nine fields against STATUS that were never a contract question.

   A deny-list rather than an allow-list: artifacts carry operative logic under keys that vary by
   visit — `rateLimitGate`, `codeComparison`, `alsoForVerify` — and an allow-list silently stops
   counting the moment someone adds another. */
const DESCRIPTIVE = new Set(['standardConformance', 'buildStandard', 'closes', 'residualRisk',
  'residualRisk_additional', 'remove', 'keepUnchanged', 'doNotChange', 'verification']);

/** Every trigger field an artifact reads, at any nesting depth it reads it. */
function triggerReads(artifact) {
  const raw = JSON.stringify(Object.fromEntries(
    Object.entries(artifact).filter(([k]) => !DESCRIPTIVE.has(k))));
  const flat = new Set();
  const nested = new Set();
  /* `triggerBody()?['a']?['b']` — the estate doubles its quotes inside $filter strings, so both
     forms have to match. Capture the first segment and any chained ones. */
  for (const m of raw.matchAll(/triggerBody\(\)((?:\?\[''?[A-Za-z0-9_]+''?\])+)/g)) {
    const parts = [...m[1].matchAll(/\?\[''?([A-Za-z0-9_]+)''?\]/g)].map((x) => x[1]);
    if (!parts.length) continue;
    if (parts.length === 1) flat.add(parts[0]);
    else nested.add(parts.join('.'));
  }
  return { flat, nested };
}

/** The request field names a contract defines, normalised for comparison. */
function contractFields(key) {
  const c = byKey.get(key);
  if (!c) return null;
  const body = new Set();
  const headers = new Set();
  for (const r of c.request || []) {
    const name = String(r.field);
    /* `Content-Type` and `X-Upload-Ticket` are headers, not body fields — the contract marks
       them `type: header`. A flow reading one out of triggerBody() is reading the wrong place. */
    if (r.type === 'header') { headers.add(name); continue; }
    /* UPLOAD's `body` is the raw PUT payload, `type: bytes`. It never travels inside a JSON
       trigger body, so "nothing reads it" is the correct state rather than a gap. */
    if (r.type === 'bytes') continue;
    /* `attachments[].sha256` is reached by iterating `attachments`. The root is what a trigger
       expression names; counting each leaf separately would report one gap three times. */
    body.add(name.replace(/\[\].*$/, '').split('.')[0]);
  }
  return { body, headers };
}

const rows = [];
for (const file of readdirSync(join(ROOT, REMEDIATION)).filter((f) => f.endsWith('.json')).sort()) {
  const a = read(REMEDIATION + file);
  const endpoints = String(a.endpoint || '')
    .split(',').map((s) => s.trim()).filter((s) => /^[A-Z_]+$/.test(s));
  if (!endpoints.length) continue;

  const { flat, nested } = triggerReads(a);
  if (!flat.size && !nested.size) continue;

  /* An artifact may serve more than one endpoint. A field is satisfied if ANY of the endpoints
     it serves defines it — UPLOAD and SUPPORT share one artifact and one trigger. */
  const body = new Set();
  const headers = new Set();
  let known = false;
  for (const ep of endpoints) {
    const cf = contractFields(ep);
    if (!cf) continue;
    known = true;
    for (const f of cf.body) body.add(f);
    for (const h of cf.headers) headers.add(h);
  }
  if (!known) continue;

  const nestedRoots = new Set([...nested].map((n) => n.split('.')[0]));
  const unreconciled = [];
  for (const f of [...flat].sort()) {
    if (TRANSPORT_FIELDS.has(f)) continue;
    if (body.has(f)) continue;
    /* A flat read of a field the contract nests is a different defect from an unknown name:
       the value IS in the body, one level down, and the fix is a path rather than a rename.
       `sender.name` flattened to `senderName` is the shape this catches. */
    const camel = (a, b) => a + b.charAt(0).toUpperCase() + b.slice(1);
    const flattens = endpoints
      .flatMap((ep) => (byKey.get(ep)?.request) || [])
      .map((r) => String(r.field))
      .find((n) => n.includes('.') && camel(n.split('.')[0], n.split('.').slice(1).join('.')) === f);
    unreconciled.push({
      reads: f,
      kind: headers.has(f) ? 'header-read-as-body'
        : flattens ? 'flattened' : 'unknown-to-contract',
      shouldBe: flattens || null,
    });
  }
  /* A contract field nobody reads is the other half of the same question. */
  const unread = [...body].filter((f) => !flat.has(f) && !nestedRoots.has(f)).sort();

  rows.push({ file, endpoints, unreconciled, unread, reads: [...flat].sort(), nested: [...nested].sort() });
}

const totalUnreconciled = rows.reduce((n, r) => n + r.unreconciled.length, 0);
const totalUnread = rows.reduce((n, r) => n + r.unread.length, 0);

if (asJson) {
  console.log(JSON.stringify({ rows, totalUnreconciled, totalUnread }, null, 2));
} else {
  console.log('\nArtifact trigger fields vs PORTAL_DATA_CONTRACT.md\n');
  for (const r of rows) {
    console.log(`  ${r.file}  [${r.endpoints.join(', ')}]`);
    if (r.nested.length) console.log(`    nested reads      : ${r.nested.join(', ')}`);
    if (r.unreconciled.length) {
      for (const u of r.unreconciled) {
        const note = u.kind === 'header-read-as-body' ? 'contract defines this as a HEADER'
          : u.kind === 'flattened' ? `contract nests this as '${u.shouldBe}'`
            : 'not a contract request field';
        console.log(`    ✗ reads '${u.reads}' — ${note}`);
      }
    }
    if (r.unread.length) console.log(`    ○ contract fields no action reads: ${r.unread.join(', ')}`);
    if (!r.unreconciled.length && !r.unread.length) console.log('    ✅ reconciled');
    console.log('');
  }
  console.log(`  ${totalUnreconciled} field read(s) the contract does not define, ` +
              `${totalUnread} contract field(s) nothing reads.\n`);
  if (totalUnreconciled) {
    console.log('  A field name that disagrees does not fail loudly. It evaluates to null, the');
    console.log('  filter narrows to nothing, and the endpoint answers "no match" for every');
    console.log('  request. Closing this is a decision — artifact, client, or contract — and it');
    console.log('  belongs with OPEN_ITEMS item 12, which records one instance of it.\n');
  }
}

process.exit(strict && totalUnreconciled ? 1 : 0);
