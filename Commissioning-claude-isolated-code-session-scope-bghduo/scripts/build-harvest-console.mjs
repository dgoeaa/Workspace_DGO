#!/usr/bin/env node
/**
 * Generate the devtools-console harvester, with the endpoint register and the identity crosswalk
 * baked in.
 *
 * A console script cannot read the repository, so everything it needs has to travel inside it.
 * Generating rather than hand-maintaining those blocks is what stops them drifting from
 * `docs/reference/endpoint-register.json` and `docs/reference/flow-identity-crosswalk.json`,
 * which are the authority for all three.
 *
 * WHAT TRAVELS, AND WHY EACH
 *   ENDPOINTS        the 25 contract keys, each with the APPLICATION WORKFLOW ID it expects. That
 *                    id is what the harvester verifies a callback URL against; without it the
 *                    harvester could fetch but not check, which is the failure mode that writes
 *                    one endpoint's signature under another endpoint's key.
 *   CANDIDATES       contract key -> the TENANT FLOW IDs that may serve it. A different identifier
 *                    domain, and the one the management API actually addresses. Seven keys carry
 *                    two candidates, because the crosswalk refuses to guess which is live.
 *   EXTRA_FLOW_IDS   pre-seeded, empty, with exactly the keys the crosswalk cannot resolve at all.
 *                    A blank the operator can fill is a better answer than a key that is simply
 *                    missing: it names the gap where the person who can close it will see it.
 *
 *   node scripts/build-harvest-console.mjs           # write
 *   node scripts/build-harvest-console.mjs --check    # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const TEMPLATE = 'scripts/lib/harvest-console.template.js';
const OUT = 'scripts/harvest-trigger-urls.browser.js';

const register = JSON.parse(readFileSync(join(ROOT, 'docs/reference/endpoint-register.json'), 'utf8'));
const crosswalk = JSON.parse(readFileSync(join(ROOT, 'docs/reference/flow-identity-crosswalk.json'), 'utf8'));

const endpoints = register.current_configuration
  .map(e => ({ key: e.key, workflow_id: e.workflow_id, flow_name: e.flow_name }));

const rowByContractKey = new Map(crosswalk.keys.map(k => [k.contractKey, k]));
const candidates = {};
const extra = {};
for (const e of endpoints) {
  const row = rowByContractKey.get(e.key);
  if (!row) {
    console.error(`❌ ${e.key} has no row in the crosswalk — run: npm run crosswalk`);
    process.exit(1);
  }
  /* The crosswalk is the authority on which application workflow a key expects, and the register
     is too. They are built to agree; if they ever stop, the harvester would verify against one
     and address by the other, so this refuses to emit rather than emit something subtly wrong. */
  if (row.applicationWorkflowId !== e.workflow_id) {
    console.error(`❌ ${e.key}: the register says workflow ${e.workflow_id}, the crosswalk says ${row.applicationWorkflowId}`);
    process.exit(1);
  }
  const ids = row.candidates.map(c => c.tenantFlowId);
  if (ids.length) candidates[e.key] = ids; else extra[e.key] = '';
}

const inject = (value, indent) => JSON.stringify(value, null, 4).replace(/\n/g, '\n' + ' '.repeat(indent));

const rendered = readFileSync(join(ROOT, TEMPLATE), 'utf8')
  .replace('__ENDPOINTS__', inject(endpoints, 2))
  .replace('__CANDIDATES__', inject(candidates, 2))
  .replace('__EXTRA_FLOW_IDS__', inject(extra, 2));

if (/__[A-Z_]+__/.test(rendered)) {
  console.error(`❌ ${TEMPLATE} still carries an uninjected placeholder: ${rendered.match(/__[A-Z_]+__/)[0]}`);
  process.exit(1);
}

const distinctFlows = new Set(endpoints.map(e => e.workflow_id)).size;
const withCandidates = Object.keys(candidates).length;
const summary = `${endpoints.length} keys across ${distinctFlows} flows — ${withCandidates} addressable from the crosswalk, `
  + `${Object.keys(extra).length} left for EXTRA_FLOW_IDS or discovery by name`;

if (CHECK) {
  let cur = null;
  try { cur = readFileSync(join(ROOT, OUT), 'utf8'); } catch { /* absent */ }
  if (cur !== rendered) {
    console.error(`❌ ${OUT} is stale — run: npm run harvest:console`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${summary}`);
} else {
  writeFileSync(join(ROOT, OUT), rendered);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${summary}`);
  for (const key of Object.keys(extra)) console.log(`  ⚠ ${key} has no candidate flow in the crosswalk`);
}
