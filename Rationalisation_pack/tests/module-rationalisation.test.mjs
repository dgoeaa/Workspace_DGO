import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { ModuleBoundaries } from '../config/module-boundaries.config.js';
import { RationalisationGroups, ModuleRationalisation, ActionContractFields } from '../config/module-rationalisation.config.js';

const moduleFiles=(await readdir(new URL('../modules/',import.meta.url)))
  .filter(n=>n.endsWith('.js')).map(n=>n.slice(0,-3)).sort();
const registered=Object.keys(ModuleRationalisation).sort();
assert.deepEqual(registered,moduleFiles,'Every runtime module must have exactly one rationalisation entry');
assert.equal(new Set(registered).size,registered.length,'Module IDs must be unique');
const dispositions=new Set(['retain-refine','merge','split','move-out']);
for(const [id,item] of Object.entries(ModuleRationalisation)){
  assert.ok(RationalisationGroups[item.group],`${id}: unknown capability group`);
  assert.ok(dispositions.has(item.disposition),`${id}: invalid disposition`);
  assert.ok(item.target && !item.target.startsWith('/'),`${id}: target must be a relative canonical path`);
  assert.ok(item.owner,`${id}: owner is required`);
  assert.ok(ModuleBoundaries[id],`${id}: existing module boundary is required during migration`);
}
const primary=Object.entries(RationalisationGroups).filter(([,g])=>g.primaryNav).map(([id])=>id);
assert.deepEqual(primary,['workspace','correspondence','work','decisions','records','oversight','administration']);
assert.equal(RationalisationGroups.administration.roleGated,true);
assert.equal(ModuleRationalisation.registry.target,'records/registry');
assert.equal(ModuleRationalisation.archive.target,'records/archive');
assert.notEqual(ModuleRationalisation.registry.target,ModuleRationalisation.archive.target,'Registry and archive writes must remain separate');
assert.equal(ModuleRationalisation.orchestrator.owner,'oversight');
assert.equal(ModuleRationalisation['single-assignment'].target,ModuleRationalisation['bulk-assignment'].target);
assert.equal(ModuleRationalisation.reports.target,ModuleRationalisation.statistics.target);
assert.equal(new Set(ActionContractFields).size,ActionContractFields.length);
assert.ok(ActionContractFields.includes('permission') && ActionContractFields.includes('auditCategory'));
console.log(`module rationalisation: ${registered.length} modules, ${Object.keys(RationalisationGroups).length} groups — PASS`);
