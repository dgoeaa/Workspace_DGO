#!/usr/bin/env node
/**
 * Every open register item, with the party that can close it and the exact condition that does.
 *
 * This exists because "open" is not a disposition. An item with no named closer and no stated
 * closing condition is indistinguishable from one nobody has looked at, and this estate has
 * carried both. The generator refuses to invent either: it reads `owner` and
 * `resolutionCriteria` from the register and fails if a row has neither, rather than filling
 * the gap with a plausible sentence.
 *
 *   node scripts/build-closure-disposition.mjs           # write
 *   node scripts/build-closure-disposition.mjs --check    # fail if stale or incomplete
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const REGISTER = 'docs/deployment/PRODUCTION_READINESS_REGISTER.json';
const OUT_JSON = 'docs/deployment/closure-disposition.json';

/* Until 2026-09-24 this generator also wrote CLOSURE_DISPOSITION.md — the same rows as a set of
   tables. `docs/deployment/PLAN.md` renders the same open items from the same register, with
   their steps, and the estate now keeps exactly one plan. So the markdown went and the JSON
   stayed: three scripts read the JSON, and no reader needs a second prose copy of PLAN.md. */

const register = JSON.parse(readFileSync(join(ROOT, REGISTER), 'utf8'));
/* DISCHARGED_UNTRACKABLE counts as closed: done, evidenced once, and unverifiable from
   this repository because the proof is a credential or a git-ignored file. See
   statusVocabulary in the register. */
const CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const open = register.items.filter(i => !CLOSED.has(i.status));

/* Which authority can close it. Derived from the item's own criteria, not assigned by hand:
   a criterion that names rotation or a key is the security authority's; one that asks for a
   recorded decision is the agency's; everything else needs the tenant exercised. */
function authority(item) {
  const t = `${item.resolutionCriteria} ${item.title}`.toLowerCase();
  if (/rotat|token|api key|401/.test(t)) return 'SECURITY_AUTHORITY';
  if (/recorded decision|approval exists|decided rather|amend|approved by/.test(t)) return 'AGENCY_DECISION';
  return 'TENANT_EXECUTION';
}

const incomplete = open.filter(i => !i.owner || !i.resolutionCriteria);
if (incomplete.length) {
  console.error(`❌ ${incomplete.length} open item(s) carry no owner or no resolution criteria: ${incomplete.map(i => i.id).join(', ')}`);
  console.error('   This generator will not invent either. Fix the register.');
  process.exit(1);
}

const rows = open.map(i => ({
  id: i.id,
  status: i.status,
  title: i.title,
  authority: authority(i),
  accountable: i.owner,
  closes: i.resolutionCriteria,
  riskAcceptanceRequired: true,
}));

const byAuthority = k => rows.filter(r => r.authority === k);
const disposition = {
  generatedFrom: REGISTER,
  registerVersion: register.registerVersion,
  totals: {
    registerItems: register.items.length,
    closed: register.items.length - open.length,
    open: open.length,
    securityAuthority: byAuthority('SECURITY_AUTHORITY').length,
    agencyDecision: byAuthority('AGENCY_DECISION').length,
    tenantExecution: byAuthority('TENANT_EXECUTION').length,
  },
  rule: 'Every open item carries a named accountable party and a stated closing condition. None is closable from this repository; each requires the authority named. P-17 requires one risk-acceptance record per row that is still open at authorisation.',
  items: rows,
};

const files = { [OUT_JSON]: JSON.stringify(disposition, null, 2) + '\n' };

if (CHECK) {
  const stale = Object.entries(files).filter(([p, c]) => {
    try { return readFileSync(join(ROOT, p), 'utf8') !== c; } catch { return true; }
  }).map(([p]) => p);
  if (stale.length) {
    console.error(`❌ closure disposition is stale — run: npm run disposition\n   ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ closure disposition is current — ${open.length} open, all with a named accountable party and a closing condition`);
} else {
  for (const [p, c] of Object.entries(files)) writeFileSync(join(ROOT, p), c);
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`  open items      : ${open.length}`);
  console.log(`  security        : ${byAuthority('SECURITY_AUTHORITY').length}`);
  console.log(`  agency decision : ${byAuthority('AGENCY_DECISION').length}`);
  console.log(`  tenant          : ${byAuthority('TENANT_EXECUTION').length}`);
}
