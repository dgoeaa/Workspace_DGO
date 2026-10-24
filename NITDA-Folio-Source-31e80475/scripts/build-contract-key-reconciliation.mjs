#!/usr/bin/env node
/**
 * THE MAP AGAINST THE ESTATE: WHAT IS INTENDED, WHAT IS WIRED, AND WHERE THEY DIFFER.
 *
 * WHY THIS EXISTS
 *
 * docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json says which flow each contract key SHOULD be served by.
 * docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json and the tenant evidence say which flow is serving it TODAY.
 * Fourteen of the twenty-three agree. Nine do not, and they do not disagree for one reason:
 *
 *   · four name a different flow from the one wired — a migration, not an error in either source;
 *   · four name a flow no tenant reading resolved at all — the map SUPPLYING what was missing,
 *     which is most of what GOV-06 has been waiting for;
 *   · one names a flow the 2026-09-18 capture did not return, which is a gap in the capture.
 *
 * Collapsing those into "9 mismatches" would lose the only thing that matters about them, which is
 * that three of the categories need completely different actions. So they are separated, counted,
 * and each row carries what to do about it.
 *
 * WHAT THIS FILE WILL NOT DO
 *
 * Pick a winner. Where the map names a successor and the register names the incumbent, both are
 * true statements about different moments and the difference is work for someone with tenant
 * access. Writing either one into the other would destroy the only record that a migration is
 * outstanding.
 *
 *     node scripts/build-contract-key-reconciliation.mjs            # write it
 *     node scripts/build-contract-key-reconciliation.mjs --check    # exit 1 if it drifted
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-reconciliation.json');
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const MAP = J('docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json');
const register = J('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json');
const tenant = J('docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json');
const provenance = J('docs/folio-Master-Flows-and-Endpoints/reference/flow-package-provenance.json');
/* The adoption ledger (2026-10-05) settles every key: one flow each, by the owner's selection or by the latest tenant
   evidence, which outranks the map. A row keeps its verdict, which is a fact about the map and the 2026-09-18 reading;
   `adopted` and `settled` say which flow the key runs on and what that means for the row. */
const ADOPTION = J('docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json');
const adoptedByKey = new Map(ADOPTION.adopted.flatMap((a) => (a.contractKeys || []).map((k) => [k, a])));
const retiredKeys = new Map((ADOPTION.retiredContractKeys || []).map((k) => [k.key, k]));

/* The map uses the estate's canonical key names; endpoint-register.json uses the wire names, and
   two keys differ between them. Recorded as a table rather than normalised away, because a silent
   normalisation is how two keys that genuinely differ get treated as one. */
const WIRE_NAME = {
  DYNAMIC_GLOBAL_ACTIONS: 'DYNAMIC_ACTIONS',
  CG_Status_Check: 'STATUS',
  CG_Verification: 'VERIFY',
  CG_Verification_Confirmation: 'VERIFY_CONFIRM',
  CG_Submission: 'SUBMISSION',
  CG_Support: 'SUPPORT',
  CG_Writeback: 'WRITEBACK',
  CG_Upload: 'UPLOAD',
};

const live = new Map(tenant.flows.map((f) => [f.flowId, f]));
for (const later of (tenant.laterReadings || {}).readings || []) {
  live.set(later.flowId, { ...(live.get(later.flowId) || {}), ...later });
}
const joinByKey = new Map();
for (const j of tenant.registryJoin) {
  for (const k of j.contractKeys || []) {
    if (!joinByKey.has(k)) joinByKey.set(k, new Set());
    if (j.powerAutomateFlowId) joinByKey.get(k).add(j.powerAutomateFlowId);
  }
}
const packaged = new Map(provenance.packages.filter((p) => p.flowId).map((p) => [p.flowId, p]));
const registerByKey = new Map(register.current_configuration
  .map((e) => [e.key.replace(/^DGO_ENDPOINT_|^PF_ENDPOINT_/, ''), e]));

const rows = MAP.map.map((r) => {
  const wire = WIRE_NAME[r.contractKey] || r.contractKey;
  const wired = [...(joinByKey.get(wire) || [])].sort(byteCompare);
  const pkg = packaged.get(r.flowId) || null;
  const reg = registerByKey.get(wire) || null;
  const row = {
    sequence: r.sequence,
    contractKey: r.contractKey,
    wireKey: wire === r.contractKey ? null : wire,
    surface: r.contractKey.startsWith('CG_') ? 'portal' : 'internal',
    intendedFlow: { flowId: r.flowId, name: r.expectedFlowName, confidence: r.mappingConfidence },
    wiredWorkflowId: reg ? reg.workflow_id : null,
    wiredFlowIds: wired,
    inTenantReading: live.has(r.flowId),
    packageHeld: pkg ? { package: pkg.package, tier: pkg.tier } : null,
  };
  const ad = adoptedByKey.get(wire) || adoptedByKey.get(r.contractKey) || null;
  row.adopted = ad ? { flowId: ad.flowId, name: ad.name } : null;
  if (retiredKeys.has(wire)) row.settled = `RETIRED: ${retiredKeys.get(wire).why}`;
  else if (!ad) row.settled = null;
  else if (ad.flowId === r.flowId) {
    row.settled = wired.length && !wired.includes(r.flowId)
      ? 'the adopted flow is the one the map names; the 2026-09-27 live read (ITEM-65) has the key on it'
      : 'the adopted flow is the one the map names';
  }
  else row.settled = `the adopted flow is ${ad.name} (${ad.flowId}), not the map's ${r.expectedFlowName}; the map's flow is retired`;
  if (wired.includes(r.flowId)) {
    row.verdict = 'CONFIRMED';
    row.action = null;
  } else if (!wired.length) {
    row.verdict = 'SUPPLIED_BY_THE_MAP';
    row.action = 'No tenant reading resolved this key to any flow. The map is the only source that '
      + 'names one, so it is the answer for this key and GOV-06 narrows by one.';
  } else {
    row.verdict = 'MIGRATION';
    row.action = `The map names ${r.expectedFlowName} (${r.flowId}); the estate is wired to `
      + `${wired.join(', ')}. Both are true of different moments. Installing the package into the `
      + 'intended flow does not move the endpoint: the trigger URL belongs to the wired flow, so '
      + 'the endpoint must be repointed or the intended flow must take over that workflow id.';
  }
  return row;
});
rows.sort((a, b) => a.sequence - b.sequence);

const by = (v) => rows.filter((r) => r.verdict === v);
const built = JSON.stringify({
  schema: 'dgo-contract-key-reconciliation/v1',
  generatedBy: 'scripts/build-contract-key-reconciliation.mjs',
  readFrom: ['docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json', 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json',
    'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json',
    'docs/folio-Master-Flows-and-Endpoints/reference/flow-package-provenance.json', 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json'],
  whatThisIs: 'Every contract key the map names, set against what the estate is wired to, with the '
    + 'difference classified rather than counted. It picks no winner: where the map names a '
    + 'successor and the register names the incumbent, both are true of different moments.',
  counts: {
    keys: rows.length,
    confirmed: by('CONFIRMED').length,
    suppliedByTheMap: by('SUPPLIED_BY_THE_MAP').length,
    migrations: by('MIGRATION').length,
    migrationsUnsettled: by('MIGRATION').filter((r) => !r.settled).length,
    mapFlowsRetired: rows.filter((r) => r.adopted && r.adopted.flowId !== r.intendedFlow.flowId).length,
    intendedFlowsThisRepositoryHoldsAPackageFor: rows.filter((r) => r.packageHeld).length,
  },
  reads: `${by('CONFIRMED').length} of ${rows.length} keys are already wired to the flow the map names. `
    + `${by('SUPPLIED_BY_THE_MAP').length} were unresolved by any tenant reading and the map answers them. `
    + `${by('MIGRATION').length} name a different flow from the one serving the key today. `
    + `The adoption ledger settles all of them: ${by('MIGRATION').filter((r) => !r.settled).length} migration(s) unsettled.`,
  rows,
}, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
  console.log('\nContract key reconciliation\n');
  if (current !== built) {
    console.log(`  ❌ ${relative(ROOT, OUT)} drifted. Run: npm run keymap\n`);
    process.exit(1);
  }
  console.log(`  ✅ ${rows.length} key(s) reconciled`);
  console.log(`     ${by('CONFIRMED').length} confirmed · ${by('SUPPLIED_BY_THE_MAP').length} supplied by the map · ${by('MIGRATION').length} migration(s)`);
  for (const r of by('MIGRATION').filter((x) => !x.settled)) {
    console.log(`     ⚠ ${r.contractKey}: intended ${r.intendedFlow.flowId.slice(0, 8)} (${r.intendedFlow.name}), wired ${r.wiredFlowIds.map((f) => f.slice(0, 8)).join(', ')}`);
  }
  console.log('');
  process.exit(0);
}

writeFileSync(OUT, built);
console.log(`Wrote ${relative(ROOT, OUT)} — ${by('CONFIRMED').length} confirmed, `
  + `${by('SUPPLIED_BY_THE_MAP').length} supplied by the map, ${by('MIGRATION').length} migration(s).`);
