#!/usr/bin/env node
/**
 * The supplied export packages, and what they are evidence OF.
 *
 * scripts/build-flow-package-provenance.mjs answers one question per package — is it an export
 * of a flow a wired endpoint actually resolves to — and its own --check proves the record still
 * matches its inputs. That is drift detection, and drift detection alone would still be green on
 * a record that is internally incoherent, or on a finding nobody wrote down.
 *
 * So this file proves the properties the record has to have for anyone to act on it:
 *
 *   · every package in the archive appears exactly once in the record;
 *   · a package called an export of a deployed flow names the contract keys it serves;
 *   · the posture drift list is DERIVED from the two readings, recomputed here independently,
 *     not a sentence somebody typed;
 *   · the tenant evidence it rests on says what it was distilled from, and its counts add up;
 *   · and the drift, while it stands, is in the record of account. A security finding that
 *     lives only in a generated file is a finding that will be regenerated away.
 *
 * Usage:  node tests/flow-package-provenance.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const failures = [];
let passed = 0;
const check = (what, ok, detail = '') => {
  if (ok) { passed++; return; }
  failures.push(detail ? `${what} — ${detail}` : what);
};

const record = read('docs/folio-Master-Flows-and-Endpoints/reference/flow-package-provenance.json');
const tenant = read('docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json');
const register = read('docs/deployment/PRODUCTION_READINESS_REGISTER.json');

/* ---- the record covers the archive, once each ---- */
const names = record.packages.map((p) => p.package);
check('every package record carries a package name', names.every(Boolean));
check('no package appears twice in the record',
  new Set(names).size === names.length,
  `${names.length} record(s), ${new Set(names).size} distinct`);
check('the record read something',
  record.packages.length > 0 && record.counts.packages === record.packages.length,
  `counts.packages ${record.counts.packages} vs ${record.packages.length} record(s)`);
check('no package was unreadable',
  record.counts.unreadable === 0,
  record.packages.filter((p) => p.unreadable).map((p) => `${p.package}: ${p.unreadable}`).join('; '));

/* ---- what "an export of a deployed flow" commits the record to ---- */
for (const p of record.packages) {
  if (!p.isDeployedFlow) continue;
  check(`${p.package} names the contract key(s) it serves`,
    Array.isArray(p.contractKeys) && p.contractKeys.length > 0);
  check(`${p.package} carries the flow id the claim rests on`, Boolean(p.flowId));
}
check('the deployed/not-deployed split is exhaustive',
  record.counts.exportsOfADeployedFlow + record.counts.notExportsOfAnyDeployedFlow === record.packages.length,
  `${record.counts.exportsOfADeployedFlow} + ${record.counts.notExportsOfAnyDeployedFlow} ≠ ${record.packages.length}`);

/* GOV-06 as an assertion rather than a sentence. The claim is NOT that a package contains no
   32-hex token — it does, environment and connection ids among them, and asserting otherwise
   would fail on a true statement. It is that no package carries a workflow id any wired
   endpoint addresses, so nothing inside one resolves to the estate's own addressing. If an
   export ever does carry one, the identifier gap is closed at source and the join this record
   performs through the tenant reading stops being the only way to resolve it — at which point
   this assertion should fail and be rewritten, not silently relaxed. */
check('no package carries a workflow id a wired endpoint addresses (GOV-06 still open)',
  record.counts.carryingAWiredWorkflowId === 0
    && record.packages.every((p) => Array.isArray(p.wiredWorkflowIdsCarried) && p.wiredWorkflowIdsCarried.length === 0),
  record.packages.filter((p) => (p.wiredWorkflowIdsCarried || []).length)
    .map((p) => `${p.package}: ${p.wiredWorkflowIdsCarried.join(', ')}`).join('; '));

/* fullResourceId is present in every package and is NOT the workflow id: it restates the dashed
   flow id in resource form. Asserted so that a future reader who sees a populated field does not
   take it for the identifier GOV-06 is waiting on. */
check('fullResourceId restates the dashed flow id and resolves nothing',
  record.packages.every((p) => !p.flowId || p.fullResourceId === null || p.fullResourceId.endsWith(`/${p.flowId}`)),
  record.packages.filter((p) => p.flowId && p.fullResourceId && !p.fullResourceId.endsWith(`/${p.flowId}`))
    .map((p) => `${p.package}: ${p.fullResourceId}`).join('; '));

/* ---- the drift list is derived, not asserted ---- */
const liveAuth = new Map(tenant.flows.map((f) => [f.flowId, f.triggerAuthenticationType]));
const recomputed = record.postureDrift.filter(
  (d) => liveAuth.get(d.flowId) === d.deployedAs.triggerAuthenticationType
    && d.recordedAs.triggerAuthenticationType !== d.deployedAs.triggerAuthenticationType);
check('every recorded drift is a real disagreement against the tenant reading',
  recomputed.length === record.postureDrift.length,
  `${record.postureDrift.length} listed, ${recomputed.length} reproduce`);
for (const d of record.postureDrift) {
  check(`drift on ${d.flowId} cites the file it was recorded from`,
    typeof d.recordedAs.file === 'string' && d.recordedAs.file.startsWith('docs/'));
}

/* ---- the evidence underneath says what it is ---- */
check('the tenant evidence names its source file and fingerprint',
  Boolean(tenant.source?.file) && /^[0-9a-f]{64}$/.test(tenant.source?.sha256 || ''),
  JSON.stringify(tenant.source?.sha256));
check('the tenant evidence records its own coverage',
  tenant.coverage.found === tenant.flows.length && tenant.coverage.notFound === tenant.notFound.length,
  `found ${tenant.coverage.found} vs ${tenant.flows.length}, notFound ${tenant.coverage.notFound} vs ${tenant.notFound.length}`);
check('the tenant evidence counts every flow it read',
  Object.values(tenant.triggerAuthenticationTypeCounts).reduce((a, b) => a + b, 0) === tenant.flows.length);
check('the tenant evidence states what it does NOT establish',
  Array.isArray(tenant.whatItExplicitlyDoesNotEstablish) && tenant.whatItExplicitlyDoesNotEstablish.length > 0);

/* ---- a live finding belongs in the record of account ---- */
const cites = (item, ref) => (item.evidence || []).some((e) => String(e.ref || '').includes(ref));
if (record.postureDrift.length) {
  const owner = (register.items || []).filter((i) => cites(i, 'flow-package-provenance.json'));
  check('the posture drift is carried by an item in the readiness register',
    owner.length > 0,
    'no register item cites docs/folio-Master-Flows-and-Endpoints/reference/flow-package-provenance.json');
  for (const i of owner) {
    check(`${i.id} is still open while the drift stands`,
      i.status !== 'CLOSED' && i.status !== 'ACCEPTED',
      `status ${i.status}`);
  }
}

/* The estate's one sanctioned crossing is named in DECISIONS.md and guarded by
   scripts/audit-trigger-auth.mjs, which reads the repository's exports. While the deployed
   reading disagrees with those exports, that guard is measuring something that is not what is
   running, and a reader who does not know that will take its green tick for the estate's. */
const scanDrift = record.postureDrift.find((d) => (d.contractKeys || []).includes('SCAN_INTAKE'));
if (scanDrift) {
  check('the SCAN_INTAKE drift records both postures and when the deployed flow last moved',
    Boolean(scanDrift.recordedAs.triggerAuthenticationType)
      && Boolean(scanDrift.deployedAs.triggerAuthenticationType)
      && Boolean(scanDrift.deployedAs.lastModifiedTimeUtc));
  check('the SCAN_INTAKE drift is recorded as wired, not as a stray flow',
    scanDrift.wired === true);
}

/* ---- the import hazard is stated where someone about to import would look ---- */
const doc = readFileSync(resolve(ROOT, 'docs/folio-Master-Flows-and-Endpoints/deployment/FLOW_PACKAGE_PROVENANCE.md'), 'utf8');
for (const h of record.importHazards) {
  check(`${h.package} is named as an import hazard in the generated page`, doc.includes(h.package));
}
check('every import hazard is a package that is not a deployed flow',
  record.importHazards.every((h) => {
    const p = record.packages.find((x) => x.package === h.package);
    return p && p.isDeployedFlow === false;
  }));

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.error(`   · ${f}`)); process.exit(1); }
process.exit(0);
