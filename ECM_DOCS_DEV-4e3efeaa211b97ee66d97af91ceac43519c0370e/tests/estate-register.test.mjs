#!/usr/bin/env node
/**
 * Hold the estate register to the claim it makes about itself.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS
 *
 * The register was asked to be the primary source on the estate's lists and flows, and to guard
 * against partial, misleading or filtered representation. A register trusted that far fails in three
 * ways, and each check below exists for one of them:
 *
 *   1. SILENT INCOMPLETENESS — a source stops being read, a row loses its columns, a count drifts
 *      from the source it came from. Every total is reconciled against the source's OWN numbers
 *      rather than against a figure typed here, so the check cannot agree with a wrong register.
 *
 *   2. OVERSTATEMENT — a specification read as evidence. The one that nearly shipped mapped
 *      internal-field-evidence's `deployed` to OBSERVED, which would have asserted 52 columns as
 *      seen on the tenant when that word means a flow definition writes to them. So the taxonomy is
 *      pinned: only `tenant-observation` may claim existence, and the mapping of every source's own
 *      vocabulary is asserted.
 *
 *   3. FALSE RESOLUTION — a conflict quietly decided, or two identifier spaces joined by guesswork.
 *      GOV-06 measured zero id overlap between the exported definitions and the tenant register, so
 *      a register that reported a clean join would be reporting a fabrication.
 *
 * Usage:  node tests/estate-register.test.mjs
 * Exit:   0 = the register is what it says it is, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, DEFINITION_DIRS, CONSIDERED_AND_EXCLUDED } from '../scripts/lib/estate-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const REG = 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.json';
if (!fs.existsSync(path.join(ROOT, REG))) {
  console.error('\n  ✖  the estate register is missing. Run: npm run estateregister\n');
  process.exit(1);
}
const R = J(REG);

console.log('\nEstate register — completeness, provenance and honest totals\n');

/* ── 1 · every source is declared, read, and hashed ──────────────────────────────────────────── */

check('every declared source was read and recorded with its hash', () => {
  for (const s of SOURCES) {
    const rec = R.sources.find((x) => x.path === s.path);
    assert(rec, `${s.path} is declared and does not appear in the register's source list`);
    assert(rec.kind === s.kind, `${s.path}: kind ${rec.kind} does not match the declaration ${s.kind}`);
    assert(/^[0-9a-f]{16}$/.test(rec.sha256_16), `${s.path} carries no content hash`);
    assert(rec.authority && rec.authority.length > 30, `${s.path} has no stated authority`);
  }
  for (const d of DEFINITION_DIRS) {
    const rec = R.sources.find((x) => x.path === `${d.dir}/`);
    assert(rec, `${d.dir} is declared and does not appear in the register's source list`);
    assert(typeof rec.files === 'number', `${d.dir} does not record how many files were read`);
  }
});

check('no file that looks like a list or flow source is undeclared', () => {
  /* The failure this prevents: a new spec lands in the branch and the register goes on reporting
     totals that silently exclude it. It happened. The first version of this check read three flat
     directories and a short list of key names; a branch merge then added a 648-flow tenant export
     under docs/audits/, a connector register under docs/folio-Master-Flows-and-Endpoints/reference/connector/ and a whole platform
     under mailer/, and the check passed on all three. So it now walks every directory and tests the
     SHAPE of the data — an array or object of two or more records carrying a list or flow identifier
     — and a file that matches must be either declared as a source or written into
     CONSIDERED_AND_EXCLUDED with a reason. Silence is not an option either way. */
  const declared = new Set(SOURCES.map((s) => s.path));
  const excluded = new Map(CONSIDERED_AND_EXCLUDED.map((e) => [e.path, e.reason]));
  for (const [p, reason] of excluded) {
    assert(fs.existsSync(path.join(ROOT, p)), `${p} is excluded and does not exist — remove the exclusion`);
    assert(reason && reason.length > 40, `${p} is excluded without a stated reason`);
    assert(!declared.has(p), `${p} is both declared and excluded`);
  }
  const ID = /^(listTitle|ListTitle|listGuid|ListGuid|workflowId|workflow_id|flow_guid|flowId|FlowId|WorkflowId)$/;
  const inDefinitionDir = (rel) => DEFINITION_DIRS.some((d) => rel.startsWith(`${d.dir}/`));
  const roots = ['docs', 'mailer', 'tools', 'config'].filter((r) => fs.existsSync(path.join(ROOT, r)));
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'archive') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.json')) files.push(rel);
    }
  };
  for (const r of roots) walk(r);
  const enumerates = (v, depth) => {
    if (depth > 3 || !v || typeof v !== 'object') return false;
    const members = Array.isArray(v) ? v : Object.values(v);
    const records = members.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    if (records.length >= 2 && records.some((o) => Object.keys(o).some((k) => ID.test(k)))) return true;
    return members.some((x) => enumerates(x, depth + 1));
  };
  const undeclared = [];
  for (const rel of files) {
    if (declared.has(rel) || excluded.has(rel) || rel === REG || inDefinitionDir(rel)) continue;
    let d;
    try { d = J(rel); } catch { continue; }
    if (enumerates(d, 0)) undeclared.push(rel);
  }
  assert(!undeclared.length,
    `${undeclared.length} file(s) enumerate lists or flows and are neither declared in SOURCES nor `
    + `written into CONSIDERED_AND_EXCLUDED with a reason:\n      ${undeclared.join('\n      ')}`);
});

check('every declared source actually contributed a statement', () => {
  /* A source can be declared, hashed, read — and never reached, because the reader that was supposed
     to walk it looked for a key the file does not have. The register would then carry the source in
     its provenance list while holding nothing from it, which reads as coverage and is not. */
  const cited = new Set();
  for (const r of [...R.lists, ...R.flows]) for (const s of r.statements) cited.add(s.source);
  for (const l of R.lists) for (const f of l.fields) cited.add(f.source);
  /* A source that declares silentWhenEmpty may be silent only while that list in its file is empty. */
  const emptyNow = (s) => { if (!s.silentWhenEmpty) return false; try { const v = J(s.path)[s.silentWhenEmpty]; return Array.isArray(v) && !v.length; } catch { return false; } };
  const silent = SOURCES.filter((s) => !emptyNow(s)).map((s) => s.id).filter((id) => !cited.has(id));
  assert(!silent.length,
    `${silent.length} declared source(s) produced no statement on any row: ${silent.join(', ')}`);
});

/* ── 2 · totals reconcile against each source's own numbers ──────────────────────────────────── */

check('the list count reconciles against the tenant capture', () => {
  const cap = J('docs/reference/sharepoint-list-index.json');
  const observed = R.lists.filter((l) => l.observedInTenant).length;
  assert(observed === cap.totals.lists,
    `the register holds ${observed} observed list(s); the capture declares ${cap.totals.lists}`);
  assert(R.newestListObservation === cap.capturedUtc,
    `the register dates its newest LIST observation ${R.newestListObservation}; the capture says ${cap.capturedUtc}`);
  /* And the flow estate is dated separately, because it is observed by different sources on later
     dates. A single field set to the list capture would have dated the whole register five weeks
     before its newest evidence. */
  assert(R.newestFlowObservation && R.newestFlowObservation > cap.capturedUtc,
    `the newest FLOW observation is ${R.newestFlowObservation}, which is not later than the list capture`);
});

check('every site total reconciles against the capture', () => {
  const cap = J('docs/reference/sharepoint-list-index.json');
  for (const s of cap.sites) {
    const row = R.bySite[s.key];
    assert(row, `site ${s.key} is in the capture and not in the register`);
    assert(row.observed === s.lists,
      `${s.key}: the register observed ${row.observed}, the capture declares ${s.lists}`);
  }
});

check('column rows reconcile against every contributing specification', () => {
  const expected = {
    'governance-spec': J('docs/reference/sharepoint-provisioning-spec.json').fields.length,
    'registry-spec': J('docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json').fields.length,
    'portal-spec': J('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-field-spec.json').lists
      .reduce((n, l) => n + (l.fields || []).length, 0),
    'internal-evidence': Object.values(J('docs/folio-Master-Flows-and-Endpoints/deployment/internal/internal-field-evidence.json').lists)
      .reduce((n, l) => n + Object.keys(l.columns || {}).length, 0),
    'proof-ledger': (J('docs/reference/internal-proof-ledger.json').listToProvision.columns || []).length,
    'mailer-catalogue': (J('mailer/flows/flows.catalogue.json').lists || [])
      .reduce((n, l) => n + (l.fields || []).length, 0),
  };
  const got = {};
  for (const l of R.lists) for (const f of l.fields) got[f.source] = (got[f.source] || 0) + 1;
  for (const [src, n] of Object.entries(expected)) {
    assert(got[src] === n, `${src}: the register carries ${got[src] ?? 0} column row(s), the source declares ${n}`);
  }
  const total = Object.values(expected).reduce((a, b) => a + b, 0);
  assert(R.totals.fields.rows === total,
    `the register's field total is ${R.totals.fields.rows}; its sources sum to ${total}`);
});

check('flow→list references reconcile against the flow-list map', () => {
  const map = J('docs/folio-Master-Flows-and-Endpoints/registers/flow-list-map.json');
  const expected = map.flows.reduce((n, f) => n + (f.references || []).length, 0);
  const got = R.flows.reduce((n, f) => n + f.listsTouched.length, 0);
  assert(got === expected, `the register carries ${got} reference(s); the map declares ${expected}`);
});

check('every definition file on disk was read', () => {
  let onDisk = 0;
  for (const d of DEFINITION_DIRS) {
    onDisk += fs.readdirSync(path.join(ROOT, d.dir))
      .filter((f) => f.endsWith('.json'))
      .filter((f) => (d.match ? d.match.test(f) : true)).length;
  }
  assert(R.totals.definitionFilesRead === onDisk,
    `the register read ${R.totals.definitionFilesRead} definition file(s); ${onDisk} match the declared directories`);
});

/* ── 3 · nothing overstates what it knows ────────────────────────────────────────────────────── */

check('only tenant-observation is allowed to evidence existence', () => {
  const bases = R.howToReadIt.evidenceBasis;
  assert(bases['tenant-observation'] && /only basis that evidences existence/i.test(bases['tenant-observation']),
    'the register no longer states that tenant-observation is the only basis evidencing existence');
  for (const [b, text] of Object.entries(bases)) {
    if (b === 'tenant-observation') continue;
    assert(/not evidence|expects it|Generated from/i.test(text),
      `evidence basis \`${b}\` does not disclaim evidencing existence: "${text}"`);
  }
});

check("internal-field-evidence's `deployed` is NOT counted as a tenant observation", () => {
  /* The specific overstatement that nearly shipped. `deployed` means a flow definition writes to
     the column; mapping it to observed would assert 52 unverified columns as seen on the tenant. */
  const rows = R.lists.flatMap((l) => l.fields)
    .filter((f) => f.source === 'internal-evidence' && f.evidenceState === 'deployed');
  assert(rows.length, 'no internal-evidence `deployed` rows found — the source shape changed');
  const wrong = rows.filter((f) => f.evidenceBasis === 'tenant-observation');
  assert(!wrong.length,
    `${wrong.length} column(s) marked \`deployed\` are counted as tenant observations. That source's own `
    + 'note says `deployed` means harvested from flow definitions, which is not evidence of existence.');
  assert(rows.every((f) => f.evidenceBasis === 'flow-definition'),
    '`deployed` columns are no longer mapped to the flow-definition basis');
});

check('a specification-only list is never reported as observed', () => {
  const reg = J('docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json');
  for (const l of reg.lists) {
    const row = R.lists.find((x) => x.titles.includes(l.listTitle));
    assert(row, `${l.listTitle} is in the registry spec and not in the register`);
    if (row.observedInTenant) {
      const flagged = row.conflicts.some((c) => c.about === 'existence');
      assert(flagged,
        `${l.listTitle} is marked observed while the spec declares it unbuilt, and no existence conflict is recorded`);
    }
  }
});

check('every row carries provenance for every statement about it', () => {
  for (const l of R.lists) {
    assert(l.statements.length, `list ${l.titles[0] ?? l.key} carries no statement`);
    for (const s of l.statements) {
      assert(s.source && s.kind && s.says, `a statement on ${l.titles[0] ?? l.key} is missing source, kind or says`);
    }
    for (const f of l.fields) {
      assert(f.source && f.evidenceBasis && f.internalName,
        `a column on ${l.titles[0] ?? l.key} is missing source, evidence basis or internal name`);
    }
  }
  for (const f of R.flows) {
    assert(f.statements.length, `flow ${f.names[0] ?? f.key} carries no statement`);
    for (const s of f.statements) {
      assert(s.source && s.kind && s.says, `a statement on ${f.names[0] ?? f.key} is missing source, kind or says`);
    }
  }
});

check('every statement is attributed to a source that declared itself', () => {
  /* One reader passed a payload key of its own called `source`, and with the provenance spread first
     it overwrote it: 15 statements read as though a different source had made them. Nothing catches
     that by eye — the value was a real source id, just the wrong one. */
  const ids = new Set([...SOURCES.map((s) => s.id), ...DEFINITION_DIRS.map((d) => d.id)]);
  for (const r of [...R.lists, ...R.flows]) {
    for (const s of r.statements) {
      assert(ids.has(s.source),
        `a statement on ${r.names?.[0] ?? r.titles?.[0] ?? r.key} is attributed to "${s.source}", which is not a declared source`);
    }
  }
  for (const l of R.lists) {
    for (const f of l.fields) {
      assert(ids.has(f.source), `a column on ${l.titles[0] ?? l.key} is attributed to "${f.source}", which is not a declared source`);
    }
  }
});

check('every flow the 2026-09-26 tenant export read is represented', () => {
  /* The widest tenant reading in the branch. Two of its flows were lost for one build, because the
     register kept only the first dashed id a row was paired with, and dropped the second — which was
     the only place those two flows appeared. This asserts the whole export, flow by flow, and
     reconciles in the export's own units, where rows and flows are not the same thing. */
  const usage = J('docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-2026-09-26.json');
  const held = new Set();
  for (const f of R.flows) for (const id of [f.flowGuid, ...(f.otherFlowGuids ?? [])]) if (id) held.add(id);
  const missing = usage.allFlows.filter((u) => !held.has(String(u.flow_guid).toLowerCase()));
  assert(!missing.length,
    `${missing.length} of ${usage.totals.flows} exported flow(s) are absent from the register: `
    + missing.slice(0, 6).map((m) => m.flow_name).join(', '));
  const units = R.totals.flows.byEstateUse.inTheExportsOwnUnits;
  assert(units.flowsInTheExport === usage.totals.flows
    && units.flowsRepresentedInThisRegister === usage.totals.flows
    && units.usedFlowsInTheExport === usage.totals.used
    && units.usedFlowsRepresentedInThisRegister === usage.totals.used,
    `the export-unit reconciliation does not match the analysis: ${JSON.stringify(units)}`);
});

check('no two rows claim the same identifier', () => {
  /* Keying on the workflow id where both identifiers were present split 32 flows across two rows
     carrying the SAME dashed id, and every flow total was 32 too high. Rows that share an identifier
     are one flow by identity, not by inference, and are merged. */
  for (const field of ['workflowId', 'flowGuid']) {
    const seen = new Map();
    for (const f of R.flows) {
      if (!f[field]) continue;
      assert(!seen.has(f[field]),
        `${field} ${f[field]} is on two rows: ${seen.get(f[field])} and ${f.names[0] ?? f.key}`);
      seen.set(f[field], f.names[0] ?? f.key);
    }
  }
  const lk = new Set();
  for (const l of R.lists) {
    if (!l.listGuid) continue;
    assert(!lk.has(l.listGuid), `list GUID ${l.listGuid} is on two rows`);
    lk.add(l.listGuid);
  }
});

check('every name is a name', () => {
  /* A reader handed the row an object — {flowId, name, confidence} — where a name was expected, and
     it was written into the names array, where every view then rendered it as a flow name. */
  for (const f of R.flows) {
    for (const n of f.names) {
      assert(typeof n === 'string' && n.length,
        `a flow name on ${f.key} is not a string: ${JSON.stringify(n).slice(0, 120)}`);
    }
  }
  for (const l of R.lists) {
    for (const t of l.titles) assert(typeof t === 'string' && t.length, `a list title on ${l.key} is not a string`);
  }
});

/* ── 4 · no conflict is resolved and no identity is invented ─────────────────────────────────── */

check('the two flow identifier spaces are never inferred from each other', () => {
  const HEX32 = /^[0-9a-f]{32}$/;
  const GUID36 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const f of R.flows) {
    if (f.workflowId) assert(HEX32.test(f.workflowId), `${f.names[0]}: workflowId is not 32 hex — ${f.workflowId}`);
    if (f.flowGuid) assert(GUID36.test(f.flowGuid), `${f.names[0]}: flowGuid is not a 36-char GUID — ${f.flowGuid}`);
  }
  /* GOV-06 is that the join does not exist. If the register suddenly reported most rows carrying
     both, something invented one from the other. */
  const both = R.flows.filter((f) => f.workflowId && f.flowGuid).length;
  assert(both < R.flows.length / 2,
    `${both} of ${R.flows.length} flow rows carry both identifiers. GOV-06 measured zero id overlap between `
    + 'the exported definitions and the tenant register; a high figure here means one was inferred from the other.');
});

check('the flow count is published as bounds, not as a single number', () => {
  const t = R.totals.flows;
  assert(typeof t.distinctFlowsLowerBound === 'number' && typeof t.distinctFlowsUpperBound === 'number',
    'the register no longer publishes bounds on the distinct flow count');
  assert(t.distinctFlowsLowerBound <= t.distinctFlowsUpperBound, 'the bounds are inverted');
  assert(t.rowsAreUpperBound && /identity/i.test(t.rowsAreUpperBound),
    'the register no longer warns that a row is an identity rather than a proven flow');
});

check('every conflict is recorded unresolved, with both values and a note', () => {
  const all = [...R.lists.flatMap((l) => l.conflicts), ...R.flows.flatMap((f) => f.conflicts)];
  assert(all.length, 'no conflicts at all — the sources agreed completely, which has never been true here');
  for (const c of all) {
    assert(c.about, 'a conflict does not say what it is about');
    assert(c.values && Object.keys(c.values).length >= 2, `conflict about ${c.about} does not carry both values`);
    assert(c.note && c.note.length > 20, `conflict about ${c.about} carries no explanation`);
    assert(!('resolvedTo' in c) && !('winner' in c), `conflict about ${c.about} has been resolved; it must stay open`);
  }
});

check('multiple names and titles are aliases, not conflicts', () => {
  /* Counting an alias as a conflict inflated the flow conflict count 22-fold in one draft — 45
     where there were 2 — and a conflict count nobody can trust is a conflict count nobody reads. */
  const nameConflicts = R.flows.flatMap((f) => f.conflicts).filter((c) => c.about === 'name');
  assert(!nameConflicts.length, `${nameConflicts.length} flow conflict(s) are about the name; those are aliases`);
  const titleConflicts = R.lists.flatMap((l) => l.conflicts).filter((c) => c.about === 'title');
  assert(!titleConflicts.length, `${titleConflicts.length} list conflict(s) are about the title; those are alternate titles`);
});

check('the known divergences are stated on the register itself', () => {
  const ids = R.knownDivergences.map((d) => d.id);
  for (const want of ['GOV-06', 'capture-age', 'governance-field-count']) {
    assert(ids.includes(want), `the register no longer states the ${want} divergence`);
  }
  for (const d of R.knownDivergences) {
    assert(d.statement && d.consequence && d.measuredIn,
      `divergence ${d.id} is missing a statement, a consequence or the file it was measured in`);
  }
});

/* ── 5 · the views and the page hold everything the register does ────────────────────────────── */

check('every view exists and holds exactly the register\'s own row counts', () => {
  const expect = {
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv': R.lists.length,
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-fields.csv': R.lists.reduce((n, l) => n + l.fields.length, 0),
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-flows.csv': R.flows.length,
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-touches.csv': R.flows.reduce((n, f) => n + f.listsTouched.length, 0),
  };
  for (const [rel, rows] of Object.entries(expect)) {
    const p = path.join(ROOT, rel);
    assert(fs.existsSync(p), `${rel} is missing. Run: npm run estateviews`);
    const text = fs.readFileSync(p, 'utf8');
    assert(text.charCodeAt(0) === 0xfeff, `${rel} has no UTF-8 BOM; Excel will mangle the display names`);
    /* Count records, not lines: a quoted field may contain newlines. */
    let records = 0, inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { if (inQuotes && text[i + 1] === '"') i++; else inQuotes = !inQuotes; }
      else if (ch === '\n' && !inQuotes) records++;
    }
    assert(records - 1 === rows, `${rel} holds ${records - 1} record(s); the register holds ${rows}`);
  }
  assert(fs.existsSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md')),
    'the report is missing. Run: npm run estateviews');
});

check('the report names every list and every flow', () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md'), 'utf8');
  const missingLists = R.lists.filter((l) => l.titles[0] && !md.includes(l.titles[0]));
  assert(!missingLists.length,
    `${missingLists.length} list(s) are in the register and not in the report: ${missingLists.slice(0, 5).map((l) => l.titles[0]).join(', ')}`);
  const missingFlows = R.flows.filter((f) => f.names[0] && !md.includes(f.names[0]));
  assert(!missingFlows.length,
    `${missingFlows.length} flow(s) are in the register and not in the report: ${missingFlows.slice(0, 5).map((f) => f.names[0]).join(', ')}`);
});

check('the interactive page embeds the whole register, not a sample', () => {
  const p = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html');
  assert(fs.existsSync(p), 'the interactive register is missing. Run: npm run estateartifact');
  const html = fs.readFileSync(p, 'utf8');
  const m = /<script type="application\/json" id="register">([\s\S]*?)<\/script>/.exec(html);
  assert(m, 'the page carries no embedded register block');
  let embedded;
  try { embedded = JSON.parse(m[1]); } catch (e) { throw new Error(`the embedded register does not parse: ${e.message}`); }
  assert(embedded.lists.length === R.lists.length,
    `the page embeds ${embedded.lists.length} list(s); the register holds ${R.lists.length}`);
  assert(embedded.flows.length === R.flows.length,
    `the page embeds ${embedded.flows.length} flow(s); the register holds ${R.flows.length}`);
  const ef = embedded.lists.reduce((n, l) => n + l.fields.length, 0);
  const rf = R.lists.reduce((n, l) => n + l.fields.length, 0);
  assert(ef === rf, `the page embeds ${ef} column row(s); the register holds ${rf}`);
  const et = embedded.flows.reduce((n, f) => n + f.listsTouched.length, 0);
  const rt = R.flows.reduce((n, f) => n + f.listsTouched.length, 0);
  assert(et === rt, `the page embeds ${et} reference(s); the register holds ${rt}`);
  assert(Buffer.byteLength(html) < 16 * 1024 * 1024, 'the page exceeds the 16 MB artifact cap');
});

check('no credential reaches any output', () => {
  const SIG = /sig=[A-Za-z0-9_-]{20,}/;
  for (const rel of [
    REG, 'docs/folio-Master-Flows-and-Endpoints/reference/ESTATE-REGISTER.md', 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register.html',
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-lists.csv', 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-fields.csv',
    'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-flows.csv', 'docs/folio-Master-Flows-and-Endpoints/reference/estate-register-touches.csv',
  ]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    assert(!SIG.test(text), `${rel} contains what looks like a live signature`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error(failures.map((f) => `  ✖  ${f}`).join('\n\n'));
  process.exit(1);
}
