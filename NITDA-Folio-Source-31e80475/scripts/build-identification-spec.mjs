#!/usr/bin/env node
/**
 * Renders the catalogue sections of the identification system specification.
 *
 *   npm run idsystem
 *   npm run idsystem -- --check
 *
 * docs/reference/identification/identifier-catalogue.json is the single source of every
 * identifier's pattern, rules, examples and vocabulary. The specification's prose sections are
 * written by hand; its catalogue sections, between the GENERATED markers, are rendered from the
 * JSON by this script. --check fails when the two have drifted, so a pattern can't change in
 * one place and not the other.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const DIR = 'docs/reference/identification';
const SPEC = join(ROOT, DIR, 'IDENTIFICATION_SYSTEM.md');
const cat = JSON.parse(readFileSync(join(ROOT, DIR, 'identifier-catalogue.json'), 'utf8'));

const owner = Object.fromEntries(cat.owners.map(o => [o.id, o]));
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = s => '`' + String(s).replace(/`/g, "'") + '`';
const list = a => a.map(x => `- ${x}`).join('\n');
const yes = v => (v === true ? 'yes' : v === false ? 'no' : v);

const sections = {
  summary: () => [
    '| ID | Name | Layer | Format | Applies to | Owner |',
    '|---|---|---|---|---|---|',
    ...cat.identifiers.map(i =>
      `| ${i.id} | **${i.name}** | ${i.layer} | ${cell(i.format)} | ${cell(i.appliesTo.split('.')[0])} | ${owner[i.owner].role} |`),
  ].join('\n'),

  entries: () => cat.identifiers.map(i => [
    `### ${i.id} ${i.name} (${code(i.symbol)})`,
    '',
    `| Attribute | Specification |`,
    `|---|---|`,
    `| 1. Name and purpose | **${i.name}.** ${cell(i.purpose)} |`,
    `| 2. Applies to | ${cell(i.appliesTo)} |`,
    `| 3. Format and components | ${cell(i.format)}<br>${i.components.map(c => `${code(c.part)}: ${cell(c.rule)}`).join('<br>')}<br>Pattern: ${code(i.pattern)} |`,
    `| 4. Generation | ${cell(i.generation)} |`,
    `| 5. Uniqueness boundary | ${cell(i.uniqueness)} |`,
    `| 6. Permanence and mutability | ${cell(i.permanence)} |`,
    `| 7. Validation | ${i.validation.map(cell).join('<br>')} |`,
    `| 8. Relationships | ${i.relationships.map(cell).join('<br>')} |`,
    `| 9. Storage and mapping | ${i.storage.map(cell).join('<br>')} |`,
    `| 10. Examples | ${i.examples.map(e => `${code(e.value)}: ${cell(e.scenario)}`).join('<br>')}${(i.invalidExamples || []).length ? '<br>**Not valid:** ' + i.invalidExamples.map(e => `${code(e.value)}: ${cell(e.reason)}`).join('<br>') : ''} |`,
    `| 11. Lifecycle and retirement | ${cell(i.lifecycle)} |`,
    `| 12. Governance owner | ${owner[i.owner].role} (${owner[i.owner].unit}) |`,
    '',
  ].join('\n')).join('\n'),

  entityTypes: () => [
    '| Code | Entity | Applies to | Home dataset | Human reference | Parent may be | Root |',
    '|---|---|---|---|---|---|---|',
    ...cat.entityTypes.map(t =>
      `| ${code(t.code)} | ${t.name} | ${cell(t.appliesTo)} | ${t.homeDataset} | ${t.humanReference ?? '—'} | ${t.parentTypes.length ? t.parentTypes.map(code).join(', ') : '—'} | ${yes(t.isRoot)} |`),
    '',
    `Reserved prefixes (never entity types): ${cat.reservedTypeCodes.map(code).join(', ')}.`,
  ].join('\n'),

  linkTypes: () => [
    '| Link type | From | To | Symmetric | Meaning |',
    '|---|---|---|---|---|',
    ...cat.linkTypes.map(l => `| ${code(l.code)} | ${l.from.map(code).join(', ')} | ${l.to.map(code).join(', ')} | ${yes(l.symmetric)} | ${cell(l.meaning)} |`),
  ].join('\n'),

  idStates: () => [
    '| IdState | Resolves | Meaning |',
    '|---|---|---|',
    ...cat.idStates.map(s => `| ${code(s.state)} | ${s.resolves} | ${cell(s.meaning)} |`),
  ].join('\n'),

  datasets: () => [
    '| Dataset Key | List (prd binding) | Site | List GUID | Entity type | Role |',
    '|---|---|---|---|---|---|',
    ...cat.datasets.map(d => `| ${code(d.key)} | ${d.list}${d.new ? ' *(new)*' : ''} | ${d.site} | ${d.listGuid ? code(d.listGuid) : '*bound at provisioning*'} | ${d.entityType ? code(d.entityType) : '—'} | ${d.role} |`),
  ].join('\n'),

  vocabularies: () => [
    '**Channels (ID-09)**', '',
    '| Code | D4 | Name | Legacy values mapped |', '|---|---|---|---|',
    ...cat.channels.map(c => `| ${code(c.code)} | ${c.d4} | ${c.name} | ${c.legacyValues.map(code).join(', ')} |`),
    '', '**Systems (ID-07)**', '',
    '| Code | Kind | Name |', '|---|---|---|',
    ...cat.systems.map(s => `| ${code(s.code)} | ${s.kind} | ${s.name} |`),
    '', '**Environments (ID-08)**', '',
    '| Code | Name | Human-reference prefix |', '|---|---|---|',
    ...cat.environments.map(e => `| ${code(e.code)} | ${e.name} | ${e.humanRefPrefix ? code(e.humanRefPrefix) : '*(none)*'} |`),
    '', '**Processes (ID-10) and the contract keys they own (ID-11)**', '',
    '| Process | Name | Creates | Contract keys |', '|---|---|---|---|',
    ...cat.processes.map(p => `| ${code(p.code)} | ${p.name} | ${p.creates.map(code).join(', ') || '—'} | ${Object.entries(cat.contractKeyProcess).filter(([, v]) => v === p.code).map(([k]) => code(k)).join(', ') || '—'} |`),
  ].join('\n'),

  locators: () => [
    '| Kind | System | Container | Value pattern | Example | Stability |',
    '|---|---|---|---|---|---|',
    ...cat.locatorKinds.map(l => `| ${code(l.kind)} | ${code(l.system)} | ${l.container} | ${code(l.valuePattern)} | ${code(l.examples[0].value)} in ${code(l.examples[0].container)} | ${cell(l.stability)} |`),
  ].join('\n'),

  aliases: () => [
    '| Alias kind | Of | Pattern | Examples | Origin | Issued outside the Agency |',
    '|---|---|---|---|---|---|',
    ...cat.aliasKinds.map(a => `| ${code(a.kind)} | ${code(a.of)} | ${code(a.pattern)} | ${a.examples.map(code).join(', ')} | ${cell(a.origin)} | ${yes(a.externallyIssued)} |`),
    '',
    ...cat.knownAliasOverlaps.map(o => `**Overlap ${o.kinds.join(' / ')}.** ${o.resolution}`),
  ].join('\n'),

  columns: () => [
    '| Column | Type | Required | Indexed | Unique | On | Holds |',
    '|---|---|---|---|---|---|---|',
    ...cat.identityColumns.map(c => `| ${code(c.column)} | ${c.type} | ${yes(c.required)} | ${yes(c.indexed)} | ${yes(c.unique)} | ${c.on} | ${c.holds} |`),
  ].join('\n'),

  exclusions: () => [
    '| Not an identifier | Handling |', '|---|---|',
    ...cat.exclusions.map(e => `| ${cell(e.item)} | ${cell(e.why)} |`),
  ].join('\n'),

  defects: () => [
    '| ID | Where | Finding | Resolution | Owner |', '|---|---|---|---|---|',
    ...cat.knownDataDefects.map(d => `| ${d.id} | ${code(d.source)} | ${cell(d.finding)} | ${cell(d.resolution)} | ${owner[d.owner].role} |`),
  ].join('\n'),

  minters: () => [
    '| Decision | Meaning |', '|---|---|',
    ...Object.entries(cat.clientMinterDispositions).map(([k, v]) => `| ${code(k)} | ${cell(v)} |`),
    '',
    `Patterns searched: ${cat.clientMinterPatterns.map(code).join(' · ')}`,
    '',
    '| File | Mints | Decision | Becomes | Why |', '|---|---|---|---|---|',
    ...cat.clientMinters.map(m => `| ${code(m.file)} | ${code(m.match)} | ${m.disposition} | ${m.target === '-' ? '—' : m.target.split('/').map(code).join(', ')} | ${cell(m.note)} |`),
  ].join('\n'),

  naming: () => {
    const f = cat.namingConventions.flowDisplayName, v = cat.namingConventions.vaultAlias;
    const sys = Object.fromEntries(cat.systems.map(x => [x.code, x.name]));
    return [
      '**Flow display name**', '',
      `Format: ${f.format} Pattern: ${code(f.pattern)}, at most ${f.maxLength} characters.`, '',
      `Applies to: ${f.appliesTo}`, '',
      '| Prefix | Platform | Why |', '|---|---|---|',
      ...f.prefixes.map(x => `| ${code(x.prefix)} | ${x.system ? `${sys[x.system]} (${code(x.system)})` : '—'} | ${cell(x.why)} |`),
      '', list(f.rules), '',
      `Words never used in a name: ${f.forbiddenWords.map(code).join(' ')}`, '',
      '| Valid | Scenario |', '|---|---|', ...f.examples.map(e => `| ${code(e.value)} | ${cell(e.scenario)} |`), '',
      '| Not valid | Why |', '|---|---|', ...f.invalidExamples.map(e => `| ${code(e.value)} | ${cell(e.reason)} |`), '',
      '**Vault alias**', '',
      `Format: ${v.format} Pattern: ${code(v.pattern)}.`, '',
      `Applies to: ${v.appliesTo}`, '',
      list(v.rules), '',
      '| Valid | Scenario |', '|---|---|', ...v.examples.map(e => `| ${code(e.value)} | ${cell(e.scenario)} |`), '',
      '| Not valid | Why |', '|---|---|', ...v.invalidExamples.map(e => `| ${code(e.value)} | ${cell(e.reason)} |`), '',
      '**Flow artefact file**', '',
      `${cell(cat.namingConventions.flowArtifactFile.what)}`, '',
      `Format: ${code(cat.namingConventions.flowArtifactFile.format)}. Pattern: ${code(cat.namingConventions.flowArtifactFile.pattern)}. Implemented by ${cat.namingConventions.flowArtifactFile.implementation}.`, '',
      `Applies to: ${cat.namingConventions.flowArtifactFile.appliesTo}`, '',
      list(cat.namingConventions.flowArtifactFile.rules), '',
      '| Valid | Scenario |', '|---|---|', ...cat.namingConventions.flowArtifactFile.examples.map(e => `| ${code(e.value)} | ${cell(e.scenario)} |`), '',
      '| Not valid | Why |', '|---|---|', ...cat.namingConventions.flowArtifactFile.invalidExamples.map(e => `| ${code(e.value)} | ${cell(e.reason)} |`),
    ].join('\n');
  },

  owners: () => [
    '| Owner ID | Role | Unit | Accountable for |', '|---|---|---|---|',
    ...cat.owners.map(o => `| ${o.id} | ${o.role} | ${o.unit} | ${cell(o.accountableFor)} |`),
  ].join('\n'),
};

const current = readFileSync(SPEC, 'utf8');
let next = current;
for (const [name, render] of Object.entries(sections)) {
  const rx = new RegExp(`(<!-- BEGIN GENERATED: ${name} -->\\n)[\\s\\S]*?(<!-- END GENERATED: ${name} -->)`);
  if (!rx.test(next)) { console.error(`marker missing: ${name}`); process.exit(1); }
  next = next.replace(rx, (_, open, close) => `${open}${render()}\n${close}`);
}

if (CHECK) {
  if (next !== current) {
    console.error('IDENTIFICATION_SYSTEM.md is out of date with identifier-catalogue.json — run npm run idsystem');
    process.exit(1);
  }
  console.log('identification spec: up to date');
} else {
  writeFileSync(SPEC, next);
  console.log(`identification spec: ${Object.keys(sections).length} sections rendered`);
}
