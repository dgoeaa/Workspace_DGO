#!/usr/bin/env node
/**
 * Does the provisioned estate hold everything the portal's data contract requires?
 *
 * WHY THIS EXISTS
 * The contract is the specification: what the portal sends, what it reads back, and which
 * column each value lands in. Flows conform to it. But a contract that names a column which
 * was never provisioned is not a specification — it is a wish, and the flow built from it
 * fails at run time with a field the connector cannot find.
 *
 * So every `persistence` target is resolved against portal-field-spec.json, which is the
 * record of the 97 columns actually created in the tenant. A target naming a list that does
 * not exist, or a column that was not provisioned, is a hard failure. A field the contract
 * requires with `persistence: null` is a deliberate gap and is reported, not failed.
 *
 * Usage:
 *   node scripts/verify-portal-data-contract.mjs
 *   node scripts/verify-portal-data-contract.mjs --strict   # exit 1 on gaps as well as errors
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const contract = read('docs/deployment/sharepoint/portal-data-contract.json');
const spec = read('docs/deployment/sharepoint/portal-field-spec.json');
const strict = process.argv.includes('--strict');

/* list title -> set of provisioned internal names. Title is used because the contract is
   written for people; the GUID join is portal-field-spec's job, not this file's. */
const columns = new Map();
for (const l of spec.lists) {
  columns.set(l.listTitle, new Set(l.fields.map((f) => f.internalName)));
}
/* Every list carries Title and ID whether or not they were provisioned by us. */
for (const set of columns.values()) { set.add('Title'); set.add('ID'); }

const errors = [];
const gaps = [];
const targets = [];

function checkTarget(where, field, persistence) {
  if (persistence === null || persistence === undefined) {
    gaps.push(`${where} · ${field} — required, no provisioned column holds it`);
    return;
  }
  const [list, column] = String(persistence).split('/');
  if (!columns.has(list)) {
    errors.push(`${where} · ${field} → list "${list}" is not in the provisioned specification`);
    return;
  }
  if (!columns.get(list).has(column)) {
    errors.push(`${where} · ${field} → ${list} has no provisioned column "${column}"`);
    return;
  }
  targets.push(`${list}/${column}`);
}

for (const c of contract.contracts) {
  const where = c.key;
  for (const group of ['request', 'derived', 'response']) {
    for (const f of c[group] || []) {
      if (!('persistence' in f)) continue;
      checkTarget(`${where}.${group}`, f.field, f.persistence);
    }
  }
}

/* Which provisioned columns does nothing in the contract ever write? A column nobody fills is
   either a gap in the contract or a column that should not have been provisioned; either way
   it should be visible rather than quietly empty. */
const used = new Set(targets);
const unwritten = [];
for (const l of spec.lists) {
  /* The governance estate is not the portal's to fill — the trust boundary is the whole point.
     Only portal-estate columns are expected to have a writer in a portal data contract. */
  if (l.estate !== 'Document portal') continue;
  for (const f of l.fields) {
    if (!used.has(`${l.listTitle}/${f.internalName}`)) unwritten.push(`${l.listTitle}/${f.internalName}`);
  }
}

/* A CONTRACT'S OWN STATUS, READ BY MEANING RATHER THAN BY EXACT STRING.
   This filtered on `c.status === 'SPECIFIED, NOT PROVISIONED'`. No contract in this file has
   ever carried that exact string — WRITEBACK, the only entry with a status at all, read
   'IN SCOPE — specified, client built, no flow' — so the branch below never printed a line and
   the report has always been silently empty. A status nothing can read is a status nothing
   enforces, which is how 'no flow' survived in this file long after CG_Writeback_Endpoint was
   deployed and was then carried into the independent review brief as a disclosed defect.
   Matched on meaning now, and a status neither pattern recognises is reported rather than
   dropped, so the next unreadable value is visible instead of silent. Whether the estate agrees
   with what a status claims is scripts/verify-contract-key-implementation.mjs's question. */
const NOT_PROVISIONED = /\bnot provisioned\b|\bno flow\b|\bunbuilt\b/i;
const PROVISIONED = /\bflow (?:exists|deployed)\b|\bdeployed\b|\bprovisioned\b/i;
const withStatus = contract.contracts.filter((c) => typeof c.status === 'string' && c.status.trim());
const notProvisioned = withStatus.filter((c) => NOT_PROVISIONED.test(c.status));
const unreadableStatus = withStatus.filter((c) => !NOT_PROVISIONED.test(c.status) && !PROVISIONED.test(c.status));
const statusErrors = unreadableStatus.map((c) => `${c.key} — status "${c.status}" states neither `
  + 'that it is provisioned nor that it is not; this check cannot read it');

console.log(`\nPortal data contract ${contract.contractVersion} — ${contract.contracts.length} contracts, ${targets.length} persistence targets\n`);

if (errors.length) {
  console.log(`  ❌ ${errors.length} target(s) name something that was never provisioned:\n`);
  for (const e of errors) console.log(`      ${e}`);
  console.log('');
} else {
  console.log('  ✅ every persistence target resolves to a provisioned column\n');
}

if (gaps.length) {
  console.log(`  ${gaps.length} field(s) the contract requires with nowhere to put them:\n`);
  for (const g of gaps) console.log(`      ${g}`);
  console.log('');
}

if (notProvisioned.length) {
  console.log(`  ${notProvisioned.length} contract(s) specified but not provisioned:\n`);
  for (const c of notProvisioned) console.log(`      ${c.key} — ${c.implementedBy || 'no implementation'}`);
  console.log('');
}

if (statusErrors.length) {
  console.log(`  ❌ ${statusErrors.length} contract status(es) this check cannot read:\n`);
  for (const s of statusErrors) console.log(`      ${s}`);
  console.log('');
}

if (unwritten.length) {
  console.log(`  ${unwritten.length} provisioned column(s) nothing in the contract writes:\n`);
  const byList = new Map();
  for (const u of unwritten) {
    const [l, c] = u.split('/');
    if (!byList.has(l)) byList.set(l, []);
    byList.get(l).push(c);
  }
  for (const [l, cs] of byList) console.log(`      ${l}: ${cs.join(', ')}`);
  console.log('');
}

const failed = errors.length || statusErrors.length || (strict && gaps.length);
console.log(`${failed ? '❌' : '✅'} ${errors.length + statusErrors.length} error(s), ${gaps.length} gap(s), ${unwritten.length} unwritten column(s)\n`);
process.exit(failed ? 1 : 0);
