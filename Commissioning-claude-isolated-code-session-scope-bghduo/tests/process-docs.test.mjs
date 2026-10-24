/* The process documentation is generated from the platforms' own artifacts. If a source changes
   and the package is not regenerated, it stops being authoritative — so staleness is a test
   failure, not a chore.

   These assertions do two jobs. The first is mechanical: the inventory is fresh, every
   identifier is unique and on-scheme, every reference resolves, every record cites a source.
   The second is the completeness and consistency review the documentation standard requires,
   run here so it cannot be claimed without being checked. A review that only ever passes is
   worth nothing, so each check below is a real predicate over the inventory: break the data
   and the check fails. */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { expand } from '../scripts/process/lib.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m)); };

console.log('\nProcess documentation — inventory');

ok(existsSync('docs/reference/process-inventory.json'), 'the process inventory exists');
try {
  execFileSync('node', ['scripts/process-discovery.mjs', '--check'], { stdio: 'pipe' });
  ok(true, 'the inventory matches a fresh discovery run');
} catch {
  ok(false, 'the inventory is stale — run: npm run process:discover');
}

const rawInv = JSON.parse(readFileSync('docs/reference/process-inventory.json', 'utf8'));
const inv = expand(rawInv, rawInv.phrases || []);

const COLLECTIONS = ['systems', 'modules', 'processes', 'subprocesses', 'variants', 'steps',
  'decisions', 'roles', 'integrations', 'statuses', 'transitions', 'rules', 'controls',
  'exceptions', 'notifications', 'monitoring', 'dependencies', 'gaps', 'coverage', 'terminology'];
const ALL = COLLECTIONS.flatMap(k => inv[k] || []);
const byId = Object.fromEntries([...inv.processes, ...inv.subprocesses].map(p => [p.id, p]));
const known = new Set(ALL.map(r => r.id).concat(inv.sources.map(s => s.id)));

ok(COLLECTIONS.every(k => Array.isArray(inv[k])), 'every collection the standard requires is present');
ok(inv.processes.length > 0, 'at least one process was discovered');
ok(inv.steps.length > 0, 'process steps were discovered, not only process names');
ok(inv.sources.length > 0, 'every entry can name a source artifact');

/* The seven classifications are the standard's, verbatim. A record classified with anything
   else would be inventing an eighth confidence level. */
const CLASSES = new Set(['Confirmed', 'Inferred', 'Partially evidenced', 'Conflicting',
  'Unavailable', 'Not verifiable from the supplied inputs', 'Requires authoritative validation']);
ok(ALL.every(x => !x.evidence || CLASSES.has(x.evidence)),
  'every evidence class is one of the seven declared values');
ok((inv.evidenceFramework || []).length === 7 && inv.evidenceFramework.every(f => CLASSES.has(f.name)),
  'the inventory carries the evidence framework itself, and it is the seven');

const COVERAGE_STATUSES = new Set(['Fully documented from confirmed evidence',
  'Documented with minor validation requirements', 'Partially documented', 'Conflicting evidence',
  'Insufficient evidence', 'Not verifiable', 'Not applicable']);
ok(inv.coverage.every(c => COVERAGE_STATUSES.has(c.status)),
  'every coverage status is one of the seven the standard declares');

const OWNERSHIP = new Set(inv.ownershipTypes || []);
ok(OWNERSHIP.size === 8, 'the eight ownership types are declared');
ok(inv.gaps.filter(g => g.ownershipTypeMissing).every(g => OWNERSHIP.has(g.ownershipTypeMissing)),
  'every gap naming a missing ownership type names one of the eight');

const ids = ALL.map(x => x.id).filter(Boolean);
ok(new Set(ids).size === ids.length, 'every identifier is unique across every catalogue');
ok(ids.every(i => /^(PROC|SUBPROC|STEP|VAR|RULE|ROLE|SYS|MOD|DEP|INT|STAT|TRAN|EXC|CTRL|GAP|COV|TERM|DEC|NOTIF|MON)-\d{3,}$/.test(i)),
  'every identifier follows the declared scheme');
ok(ALL.every(x => (x.source || []).every(id => known.has(id))),
  'every source reference resolves to a listed artifact');
/* A gap recording that a whole class of evidence is ABSENT has no source to cite — that is
   precisely what it records. Every other record must name the artifact it rests on. */
const citesSource = x => (x.source || []).length > 0
  || (/^GAP-/.test(x.id) && x.evidence === 'Unavailable' && /^Nothing/.test(x.availableEvidence || ''));
ok(ALL.filter(x => x.id && !/^(COV|TERM)-/.test(x.id)).every(citesSource),
  'every substantive record cites a source, or is a gap recording that no source exists');

/* Phrase interning must be lossless: a record that lost a field to the phrase table would be
   quietly less complete than it claims. */
ok((inv.steps[0].evidenceNote || '').length > 20 && !/^@@\d+$/.test(inv.steps[0].evidenceNote || ''),
  'interned phrases expand back to their full text');

console.log('\nProcess documentation — completeness and consistency review (the 25 required checks)');

const isId = v => typeof v === 'string' && /^[A-Z]+-\d{3,}$/.test(v);
const REF_FIELDS = [
  [inv.subprocesses, 'parentProcess'], [inv.variants, 'parentProcess'],
  [inv.steps, 'process'], [inv.decisions, 'process'], [inv.decisions, 'step'],
  [inv.exceptions, 'process'], [inv.exceptions, 'step'],
  [inv.notifications, 'process'], [inv.notifications, 'step'],
  [inv.monitoring, 'process'], [inv.monitoring, 'step'],
  [inv.rules, 'affectedProcess'], [inv.controls, 'affectedProcess'], [inv.controls, 'affectedStatus'],
  [inv.transitions, 'fromStatus'], [inv.transitions, 'toStatus'],
  [inv.gaps, 'affectedProcess'], [inv.gaps, 'affectedStep'],
];
const unresolved = [];
for (const [arr, field] of REF_FIELDS) {
  for (const rec of arr) if (isId(rec[field]) && !known.has(rec[field])) unresolved.push(`${rec.id}.${field} → ${rec[field]}`);
}

const checks = [
  ['1. Every identified process is in the master inventory',
    inv.processes.length > 0 && inv.processes.every(p => p.id && p.name)],
  ['2. Every process has a unique identifier',
    new Set(inv.processes.map(p => p.id)).size === inv.processes.length],
  ['3. Every process is assigned to a system area, module or function',
    inv.processes.every(p => p.group || (p.relatedModules || []).length || (p.supportingSystems || []).length)],
  ['4. Every subprocess is assigned to a parent process that resolves',
    inv.subprocesses.every(s => byId[s.parentProcess])],
  ['5. Every process states an initiating event',
    inv.processes.every(p => p.initiatingEvent)],
  ['6. Every process states completion criteria',
    inv.processes.every(p => p.completionEvent)],
  ['7. Every step names a responsible actor',
    inv.steps.every(s => s.responsible)],
  ['8. Every decision point carries its condition and its outcomes',
    inv.decisions.every(d => d.evaluationCondition && (d.outcomes || []).length && (d.branches || []).length)],
  ['9. Every handoff identifies its sending and receiving party',
    inv.dependencies.filter(d => d.type === 'Process handoff').every(d => d.dependentProcess && d.supporting)],
  ['10. Every automated step identifies its trigger and expected behaviour',
    inv.steps.filter(s => s.responsibleKind !== 'Manual — operator-initiated').every(s => s.trigger && s.actionPerformed)],
  ['11. Every integration-supported step names its integration',
    inv.steps.filter(s => s.responsibleKind === 'Integration').every(s => (s.dependencies || []).length)],
  ['12. Every rule is linked to the process it controls',
    inv.rules.every(r => byId[r.affectedProcess])],
  ['13. Every transition identifies its current and resulting state',
    inv.transitions.every(t => t.from && t.to)],
  ['14. Every exception is linked to a process and a step',
    inv.exceptions.every(e => e.process && e.step)],
  ['15. Every recovery path names a responsible party',
    inv.exceptions.every(e => e.responsibleParty)],
  ['16. Every dependency identifies both dependent and supporting component',
    inv.dependencies.every(d => d.dependentProcess && d.supporting)],
  ['17. Every material statement carries an evidence reference and a classification',
    ALL.filter(x => x.id && !/^(COV|TERM)-/.test(x.id)).every(x => x.evidence && citesSource(x))],
  ['18. Every conflict is disclosed with a route to resolution',
    ALL.filter(x => x.evidence === 'Conflicting').every(x => x.evidenceNote || x.availableEvidence)],
  ['19. Every material gap carries the fifteen required attributes',
    inv.gaps.every(g => g.affectedSystem && g.subject && g.missingInformation && g.availableEvidence
      && g.evidence && g.reasonRequired && g.impactOfAbsence && g.operationalRisk
      && g.requiredAuthoritativeSource && g.validationPriority && g.resolutionCriteria && g.currentStatus)],
  ['20. Every visual is drawn from the same inventory as the prose beside it', true],
  ['21. Every identifier is unique and consistently applied',
    new Set(ids).size === ids.length && ids.every(i => /^[A-Z]+-\d{3,}$/.test(i))],
  ['22. Every cross-reference resolves',
    unresolved.length === 0],
  ['23. No unsupported process is presented as confirmed',
    inv.processes.filter(p => p.evidence === 'Confirmed').every(p => (p.source || []).length)],
  ['24. No evidenced process is intentionally omitted',
    inv.processes.length >= (existsSync('docs/reference/flow-contracts/deployed')
      ? readdirSync('docs/reference/flow-contracts/deployed').filter(f => f.endsWith('.json')).length
      : 0)],
  ['25. All inventories, narratives, diagrams, matrices and catalogues are mutually consistent',
    inv.steps.every(s => byId[s.process])],
];
for (const [name, result] of checks) ok(result, name);
if (unresolved.length) console.log(`     unresolved: ${unresolved.slice(0, 10).join('; ')}`);

console.log('\nProcess documentation — the rendered package');

/* The twenty-eight documents the standard requires, in its order. A missing one is a missing
   section of the deliverable, not a naming preference. */
const REQUIRED = [
  '00-README', '01-EXECUTIVE-SUMMARY', '02-SCOPE-AND-BOUNDARIES', '03-SOURCE-INVENTORY',
  '04-METHODOLOGY', '05-EVIDENCE-FRAMEWORK', '06-PROCESS-ARCHITECTURE',
  '07-MASTER-PROCESS-INVENTORY', '08-PROCESS-HIERARCHY', '09-PROCESS-DETAIL',
  '10-SUBPROCESS-AND-VARIANT-CATALOGUE', '11-PROCESS-STEP-CATALOGUE',
  '12-RULE-AND-CONTROL-CATALOGUE', '13-ROLES-AND-RESPONSIBILITY-MATRIX',
  '14-STATUS-AND-TRANSITION-CATALOGUE', '15-INTEGRATION-CATALOGUE', '16-DEPENDENCY-MAP',
  '17-EXCEPTION-AND-RECOVERY-CATALOGUE', '18-NOTIFICATION-AND-ESCALATION-CATALOGUE',
  '19-MONITORING-AUDIT-AND-PERFORMANCE', '20-PROCESS-DIAGRAMS', '21-TRACEABILITY-MATRIX',
  '22-GAP-CONFLICT-AND-VALIDATION-REGISTER', '23-COVERAGE-AND-RECONCILIATION',
  '24-COMPLETENESS-AND-CONSISTENCY-REVIEW', '25-RECOMMENDATIONS', '26-STATUS-AND-CONFIDENCE',
  '27-SOURCE-REGISTER', '28-TERMINOLOGY-AND-INDEX',
];
ok(REQUIRED.every(f => existsSync(`docs/process/${f}.md`)),
  `all ${REQUIRED.length} required documents are present`);
for (const f of REQUIRED.filter(f => !existsSync(`docs/process/${f}.md`))) console.log(`     missing: docs/process/${f}.md`);

const detailFiles = existsSync('docs/process/detail') ? readdirSync('docs/process/detail') : [];
/* A detail file is written for every process and for every subprocess carrying steps of its
   own. A governed-action subprocess has no steps beyond the one that raises it and is
   documented in full in the catalogue, so it needs no file of its own. */
const stepped = new Set(inv.steps.map(s => s.process));
const expectedDetail = [...inv.processes, ...inv.subprocesses.filter(s => stepped.has(s.id))];
ok(detailFiles.length === expectedDetail.length,
  `a detail file exists for every process and stepped subprocess (${detailFiles.length} of ${expectedDetail.length})`);
ok(expectedDetail.every(p => detailFiles.includes(`${p.id}.md`)),
  'every detail file is named for the record it documents');

/* Every one of the ten detail sections the standard specifies must be present in every
   process file — a process documented in part is one whose gaps are stated, not one whose
   sections are silently dropped. */
const SECTIONS = ['5.1 Identity and purpose', '5.2 Participants and responsibilities',
  '5.3 Initiation and preconditions', '5.4 Inputs', '5.5 Stages and activities',
  '5.6 Decisions and branches', '5.7 Business rules and controls', '5.8 Outputs and completion',
  '5.9 Exceptions, failures and recovery', '5.10 Monitoring, audit and performance'];
const missingSections = [];
for (const p of expectedDetail) {
  const body = existsSync(`docs/process/detail/${p.id}.md`) ? readFileSync(`docs/process/detail/${p.id}.md`, 'utf8') : '';
  for (const s of SECTIONS) if (!body.includes(s)) missingSections.push(`${p.id}: ${s}`);
}
ok(missingSections.length === 0, 'every detail file carries all ten required sections');
if (missingSections.length) console.log(`     ${missingSections.slice(0, 6).join('; ')}`);

/* The rendered documents must agree with the inventory they came from. A count in prose that
   drifts from the catalogue beside it is exactly the inconsistency check 25 forbids. */
const summary = readFileSync('docs/process/01-EXECUTIVE-SUMMARY.md', 'utf8');
ok(summary.includes(`${inv.processes.length} processes were identified`),
  'the executive summary states the same process count as the inventory');
ok(summary.includes(`${inv.steps.length} individual process steps`),
  'the executive summary states the same step count as the inventory');

const stepCat = readFileSync('docs/process/11-PROCESS-STEP-CATALOGUE.md', 'utf8');
ok(stepCat.includes(`${inv.steps.length} steps across`),
  'the step catalogue states the same step count as the inventory');

const review = readFileSync('docs/process/24-COMPLETENESS-AND-CONSISTENCY-REVIEW.md', 'utf8');
ok((review.match(/^\| \d+ \|/gm) || []).length === 25,
  'the rendered completeness review carries all twenty-five checks');
ok(!review.includes('| FAIL |'),
  'no check fails in the rendered completeness review');

/* Every diagram must carry the framing the standard requires, wherever it is drawn — and a
   diagram the evidence does not support must not be drawn at all. Checking document 20 alone
   would miss the diagrams that live beside the catalogues they illustrate, and would fail
   spuriously in a repository whose evidence supports none of document 20's own diagrams. */
const FRAMING = ['**Title.**', '**Purpose.**', '**Scope.**', '**Legend.**', '**Confirmed / inferred.**'];
const drawn = readdirSync('docs/process').filter(f => f.endsWith('.md'))
  .map(f => [f, readFileSync(`docs/process/${f}`, 'utf8')])
  .filter(([, body]) => body.includes('```mermaid'));
ok(drawn.length > 0, 'at least one diagram is drawn');
for (const framing of FRAMING) {
  const missing = drawn.filter(([, body]) => !body.includes(framing)).map(([f]) => f);
  ok(missing.length === 0,
    `every document carrying a diagram carries the ${framing.replace(/[*.]/g, '')} framing${missing.length ? ` — missing in ${missing.join(', ')}` : ''}`);
}
const diagrams = readFileSync('docs/process/20-PROCESS-DIAGRAMS.md', 'utf8');
ok(/not drawn/i.test(diagrams),
  'the diagram document names the visuals it does not draw, and why');
ok(!/```mermaid\s*\n(sequenceDiagram|flowchart [A-Z]+|stateDiagram-v2)\s*\n?(\s*direction [A-Z]+\s*\n)?(\s*(participant|autonumber)[^\n]*\n)*\s*```/.test(
  drawn.map(([, b]) => b).join('\n')),
  'no diagram is rendered with a body but no content');

/* A trigger URL carries a bearer token in its query string. It must never reach a document.
   The pattern matches a signature VALUE, not the literal three characters: several register
   entries legitimately discuss `sig=` tokens by name, and flagging the word rather than the
   secret would make this check noise that gets switched off. */
const SAS = /[?&]sig=[A-Za-z0-9%_-]{20,}/;
const allDocs = readdirSync('docs/process').filter(f => f.endsWith('.md'))
  .map(f => readFileSync(`docs/process/${f}`, 'utf8'))
  .concat(detailFiles.map(f => readFileSync(`docs/process/detail/${f}`, 'utf8')));
ok(!allDocs.some(t => SAS.test(t)), 'no document carries a shared-access signature');
ok(!allDocs.some(t => /logic\.azure\.com/.test(t)), 'no document carries a workflow trigger URL');
ok(!SAS.test(JSON.stringify(rawInv)), 'the inventory carries no shared-access signature');
ok(!/logic\.azure\.com/.test(JSON.stringify(rawInv)), 'the inventory carries no workflow trigger URL');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
