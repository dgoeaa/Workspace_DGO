/* The provisioning specification is the only source of truth, or this fails.
 *
 * specVersion 1.0 drifted from the tenant without anything noticing: it named seven
 * NITDA_Portal_* lists on one site while the estate held twelve "Portal <something>" lists
 * across two, and every artifact built on it — a PowerShell script and a Power Automate flow —
 * addressed names that resolved against nothing. Nothing failed loudly; runs just never
 * reached a real list.
 *
 * This is the guard that drift cannot repeat. The browser provisioner carries a baked copy of
 * the specification because a devtools console cannot read a file off disk, so the one thing
 * that could silently diverge again is that copy — and an edit to the specification that is
 * not followed by `node scripts/build-sharepoint-browser-provisioner.mjs` now stops the build. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const root = new URL('../', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('docs/deployment/sharepoint/portal-field-spec.json', root), 'utf8'));
const { targets } = JSON.parse(readFileSync(new URL('docs/deployment/sharepoint/index-targets.json', root), 'utf8'));

console.log('\nSharePoint provisioning specification');

// 1. Structural integrity — every list addressable, every column declared.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_TYPES = new Set(['Text', 'Note', 'Number', 'DateTime', 'Boolean', 'Choice']);
const fields = spec.lists.flatMap(l => l.fields.map(f => ({ ...f, list: l.listTitle })));

ok('every list is addressed by a well-formed GUID',
   spec.lists.every(l => GUID.test(l.listGuid)),
   'bad: ' + spec.lists.filter(l => !GUID.test(l.listGuid)).map(l => l.listTitle).join(', '));
ok('every list names a site the spec declares',
   spec.lists.every(l => spec.sites.some(s => s.url === l.siteUrl)),
   'orphan sites: ' + [...new Set(spec.lists.filter(l => !spec.sites.some(s => s.url === l.siteUrl)).map(l => l.siteUrl))].join(', '));
ok('no list GUID appears twice',
   new Set(spec.lists.map(l => l.listGuid.toLowerCase())).size === spec.lists.length);
ok('every column type has a schema-XML mapping',
   fields.every(f => KNOWN_TYPES.has(f.fieldType)),
   'unmapped: ' + [...new Set(fields.filter(f => !KNOWN_TYPES.has(f.fieldType)).map(f => f.fieldType))].join(', '));
ok('no list declares the same internal name twice',
   spec.lists.every(l => new Set(l.fields.map(f => f.internalName)).size === l.fields.length),
   'duplicated in: ' + spec.lists.filter(l => new Set(l.fields.map(f => f.internalName)).size !== l.fields.length).map(l => l.listTitle).join(', '));
ok('Title is never declared as a column to add',
   !fields.some(f => f.internalName === 'Title'),
   'Title is every list\'s native column');

// 2. SharePoint's own rule: a unique-value column must be indexed, or the create call fails.
ok('every unique column is also indexed',
   fields.filter(f => f.enforceUnique).every(f => f.indexed),
   fields.filter(f => f.enforceUnique && !f.indexed).map(f => `${f.list}.${f.internalName}`).join(', '));

// 3. Every Choice column can actually be built — the one type that needs more than its name.
ok('every Choice column carries its choices',
   fields.filter(f => f.fieldType === 'Choice').every(f => Array.isArray(f.choices) && f.choices.length > 0),
   fields.filter(f => f.fieldType === 'Choice' && !f.choices?.length).map(f => `${f.list}.${f.internalName}`).join(', '));
ok('every Choice default is one of its own choices',
   fields.filter(f => f.fieldType === 'Choice' && f.defaultValue).every(f => f.choices.includes(f.defaultValue)),
   fields.filter(f => f.fieldType === 'Choice' && f.defaultValue && !f.choices.includes(f.defaultValue)).map(f => `${f.list}.${f.internalName}`).join(', '));

// 4. The declared totals are the ones a reader of the runbook will quote at the gate.
const missing = fields.filter(f => f.capturedState === 'MISSING').length;
const pending = fields.filter(f => f.capturedState === 'PENDING').length;
ok('the declared totals match the lists',
   spec.totals.lists === spec.lists.length
     && spec.totals.fields === fields.length
     && spec.totals.missingAtCapture === missing
     && spec.totals.pendingProvisioning === pending
     && spec.totals.liveAtCapture === fields.length - missing - pending,
   `declared ${JSON.stringify(spec.totals)} vs actual {lists:${spec.lists.length},fields:${fields.length},missingAtCapture:${missing},pendingProvisioning:${pending}}`);
ok('every capturedState is one the reconciliation understands',
   fields.every(f => ['LIVE', 'MISSING', 'PENDING'].includes(f.capturedState)),
   'unknown: ' + [...new Set(fields.filter(f => !['LIVE', 'MISSING', 'PENDING'].includes(f.capturedState)).map(f => f.capturedState))].join(', '));

// 5. The baked copy in the browser provisioner is this specification, not an older one.
const generated = new URL('scripts/provision-sharepoint-fields.browser.js', root);
const before = readFileSync(generated, 'utf8');
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-sharepoint-browser-provisioner.mjs', root))], { stdio: 'pipe' });
const after = readFileSync(generated, 'utf8');
if (before !== after) writeFileSync(generated, before);   // a test reports drift, it does not silently fix it
ok('the browser provisioner is regenerated from the current specification',
   before === after,
   'stale — run: node scripts/build-sharepoint-browser-provisioner.mjs');

// 6. The recorded provisioning run reconciles against the specification, column for column.
//    Filing a run record proves nothing on its own — a ledger from the wrong spec, or one
//    missing rows, looks exactly like a clean one until someone reads it. This is the reading.
const run = JSON.parse(readFileSync(new URL('docs/deployment/sharepoint/evidence/2026-08-19-provisioning-run.json', root), 'utf8'));
const ledger = new Map(run.ledger.map((r) => [`${r.list}\u0000${r.field}`, r]));
const allSpecRows = spec.lists.flatMap((l) => l.fields.map((f) => ({ ...f, list: l.listTitle, site: l.site })));
/* PENDING means the column was declared AFTER this run, so the run cannot have a row for it and
   the tenant does not have the column yet. Reconciling a recorded run against columns that did
   not exist when it ran would either fail forever or force a fabricated ledger row — and a
   ledger is tenant evidence, not something a build may write. The run is therefore read against
   the columns it actually covered, and PENDING rows are held to a different requirement below:
   each one must be a tracked open item, so it cannot sit undone and unnoticed. */
/* PENDING is not the only way a column can postdate this run. A column declared later can
   already EXIST in the tenant — OTP_Transactions carried its four columns before this
   specification ever named the list — and PENDING cannot say that: it means "the tenant does not
   have it yet", and the builder strips writes to a PENDING column so a save cannot fail on it.
   Marking an existing column PENDING would therefore delete a live write from every package.
   `declaredAfter` names the run a column postdates, so the exemption is explicit and narrow:
   a column without it is still reconciled in full, and one with it says which run it is exempt
   from and why in its own capturedStateNote. */
const pendingRows = allSpecRows.filter((f) => f.capturedState === 'PENDING');
const declaredLater = allSpecRows.filter((f) => typeof f.declaredAfter === 'string');
const specRows = allSpecRows.filter((f) => f.capturedState !== 'PENDING' && !f.declaredAfter);

ok('every column exempted from this run declares why it is exempt',
   declaredLater.every((f) => f.capturedState === 'PENDING'
     || (typeof f.capturedStateNote === 'string' && f.capturedStateNote.length > 40)),
   'unexplained: ' + declaredLater
     .filter((f) => f.capturedState !== 'PENDING' && !(f.capturedStateNote || '').length)
     .map((f) => `${f.list}.${f.internalName}`).join(', '));

ok('the run was recorded against this specification version', run.againstSpec.specVersion === spec.specVersion,
   `run says ${run.againstSpec.specVersion}, spec is ${spec.specVersion}`);
ok('the ledger has a row for every column the specification names',
   specRows.every((f) => ledger.has(`${f.list}\u0000${f.internalName}`)),
   'unledgered: ' + specRows.filter((f) => !ledger.has(`${f.list}\u0000${f.internalName}`)).map((f) => `${f.list}.${f.internalName}`).join(', '));
ok('the ledger claims no column the specification does not',
   run.ledger.length === specRows.length,
   `${run.ledger.length} ledger rows for ${specRows.length} spec columns`);
ok('every ledger row agrees with the specification on site and type',
   specRows.every((f) => {
     const r = ledger.get(`${f.list}\u0000${f.internalName}`);
     return !r || (r.site === f.site && r.type === f.fieldType);
   }),
   specRows.filter((f) => {
     const r = ledger.get(`${f.list}\u0000${f.internalName}`);
     return r && (r.site !== f.site || r.type !== f.fieldType);
   }).map((f) => `${f.list}.${f.internalName}`).join(', '));
ok('no column failed', run.ledger.every((r) => r.result === 'created' || r.result === 'present'),
   run.ledger.filter((r) => r.result !== 'created' && r.result !== 'present').map((r) => `${r.list}.${r.field}: ${r.result}`).join('; '));

/* The capture said which columns were already live. If the run disagreed with it, the capture
   was wrong about the tenant and every other number derived from it is suspect too. */
ok('the run matched the capture on every column, live and missing alike',
   specRows.every((f) => {
     const r = ledger.get(`${f.list}\u0000${f.internalName}`);
     return !r || r.result === (f.capturedState === 'LIVE' ? 'present' : 'created');
   }),
   specRows.filter((f) => {
     const r = ledger.get(`${f.list}\u0000${f.internalName}`);
     return r && r.result !== (f.capturedState === 'LIVE' ? 'present' : 'created');
   }).map((f) => `${f.list}.${f.internalName}: capture said ${f.capturedState}, run said ${ledger.get(`${f.list}\u0000${f.internalName}`).result}`).join('; '));

/* A verify pass that created something is not a verify pass — it means the apply pass left
   work behind, and the estate was never complete at the moment anyone signed it off. */
const verify = run.runs.find((r) => r.phase === 'verify');
ok('a verify run is recorded, and it created nothing', Boolean(verify) && verify.created === 0 && verify.failed === 0,
   verify ? `verify created ${verify.created}, failed ${verify.failed}` : 'no verify run recorded');
ok('the verify run found every column present', Boolean(verify) && verify.present === specRows.length,
   verify ? `verify found ${verify.present} of ${specRows.length}` : '');

/* A column the estate has not provisioned is a live prerequisite for whatever writes it, so it
   has to be visible somewhere an operator reads, and it has to say why. */
const openItems = readFileSync(new URL('docs/deployment/sharepoint/OPEN_ITEMS.md', root), 'utf8');
ok('every column pending provisioning is a tracked open item',
   pendingRows.every((f) => openItems.includes(f.internalName)),
   'untracked: ' + pendingRows.filter((f) => !openItems.includes(f.internalName)).map((f) => `${f.list}.${f.internalName}`).join(', '));
ok('every column pending provisioning says why it is pending',
   pendingRows.every((f) => typeof f.pendingReason === 'string' && f.pendingReason.length > 20),
   'unexplained: ' + pendingRows.filter((f) => !f.pendingReason).map((f) => `${f.list}.${f.internalName}`).join(', '));

/* A PENDING column that has since been provisioned must say so with evidence, not by having its
   capturedState quietly rewritten — capturedState is what the 2026-08-14 capture found, and
   editing it to mean "true today" would destroy the only record of what the estate started
   from. So a PENDING column is either still an open item, or it names a run record whose ledger
   carries a row for it. Both, in the case below, because its completion criterion is live
   traffic that has not been run. */
const provisionedPending = pendingRows.filter((f) => f.provisionedBy);
ok('every PENDING column that claims provisioning names a run record',
   provisionedPending.every((f) => existsSync(new URL(f.provisionedBy, root))),
   'missing: ' + provisionedPending.filter((f) => !existsSync(new URL(f.provisionedBy, root))).map((f) => f.provisionedBy).join(', '));

const laterRuns = new Map();
for (const f of provisionedPending) {
  if (!laterRuns.has(f.provisionedBy)) {
    laterRuns.set(f.provisionedBy, JSON.parse(readFileSync(new URL(f.provisionedBy, root), 'utf8')));
  }
}
/* A RUN THAT CREATES NO COLUMN WAS INVISIBLE HERE, AND AN INDEX PASS IS EXACTLY THAT.
   Discovery above reaches a run record only through a PENDING column naming it in
   provisionedBy, which ties the evidence to column provisioning. An index-only run provisions
   nothing, so it could never be seen — and on 2026-09-05 that was not hypothetical: the run
   that closed ITEM-47 created two indexes and zero columns. The evidence directory is therefore
   also read directly, and any record carrying an indexRun joins the set. This makes the checks
   below STRICTER, never looser: more recorded outcomes to satisfy, and a later newestRun, which
   is the boundary that decides whether a missing outcome is a queue or a fault. */
for (const name of readdirSync(new URL('docs/deployment/sharepoint/evidence/', root))) {
  if (!name.endsWith('.json')) continue;
  const rel = `docs/deployment/sharepoint/evidence/${name}`;
  if (laterRuns.has(rel)) continue;
  let doc;
  try { doc = JSON.parse(readFileSync(new URL(rel, root), 'utf8')); } catch { continue; }
  if (doc && doc.indexRun && doc.againstSpec) laterRuns.set(rel, doc);
}
ok('every later run was recorded against this specification version',
   [...laterRuns.values()].every((r) => r.againstSpec.specVersion === spec.specVersion),
   [...laterRuns.entries()].filter(([, r]) => r.againstSpec.specVersion !== spec.specVersion).map(([k, r]) => `${k}: ${r.againstSpec.specVersion}`).join(', '));
ok('every provisioned PENDING column has a ledger row in the run that claims it',
   provisionedPending.every((f) => (laterRuns.get(f.provisionedBy).ledger || [])
     .some((r) => r.list === f.list && r.field === f.internalName && r.site === f.site && r.type === f.fieldType)),
   'unledgered: ' + provisionedPending.filter((f) => !(laterRuns.get(f.provisionedBy).ledger || [])
     .some((r) => r.list === f.list && r.field === f.internalName)).map((f) => `${f.list}.${f.internalName}`).join(', '));
ok('a later run claims no column outside the PENDING set',
   [...laterRuns.entries()].every(([file, r]) => (r.ledger || []).every((row) =>
     provisionedPending.some((f) => f.provisionedBy === file && f.list === row.list && f.internalName === row.field))),
   'a run ledger names a column the specification does not mark PENDING');
ok('no column failed in a later run',
   [...laterRuns.values()].every((r) => (r.ledger || []).every((row) => row.result === 'created' || row.result === 'present')));

/* The index pass is the other half of that run, and the estate treats an unindexed filtered
   column as a correctness fault rather than a slow query. Every declared target must therefore
   have an outcome — silence about one is indistinguishable from it having been skipped. */
const indexRuns = [...laterRuns.values()].filter((r) => r.indexRun);
ok('a later run records the index pass', indexRuns.length > 0);
const indexed = new Map(indexRuns.flatMap((r) => r.indexRun.ledger.map((x) => [`${x.list}\u0000${x.field}`, x])));
/* A TARGET DECLARED AFTER THE LAST RUN IS OUTSTANDING, NOT SKIPPED, AND THE DIFFERENCE IS THE
   WHOLE POINT OF THE CHECK. Silence about a target the run should have reached is the fault this
   guards against. Silence about one declared after that run is just a queue: on 2026-09-02 four
   targets were added because the live sweep hit the list view threshold, and a check that could
   not tell the two apart would have forced either a fabricated outcome or a deleted declaration.
   Both are worse than reporting the queue. */
const newestRun = [...laterRuns.keys()].map((f) => (f.match(/(\d{4}-\d{2}-\d{2})/) || [])[1])
  .filter(Boolean).sort().pop() || '0000-00-00';
const missingIndex = targets.filter((t) => !indexed.has(`${t.listTitle}\u0000${t.internalName}`));
const outstanding = missingIndex.filter((t) => String(t.declaredOn || '') > newestRun);
const skipped = missingIndex.filter((t) => !(String(t.declaredOn || '') > newestRun));
ok('every index target declared before the last run has a recorded outcome',
   skipped.length === 0,
   'no outcome: ' + skipped.map((t) => `${t.listTitle}.${t.internalName}`).join(', '));
ok('every index target declares when it was added, so an unreached one is distinguishable from a skipped one',
   targets.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t.declaredOn || ''))),
   'undated: ' + targets.filter((t) => !/^\d{4}-\d{2}-\d{2}$/.test(String(t.declaredOn || ''))).map((t) => `${t.listTitle}.${t.internalName}`).join(', '));
if (outstanding.length) {
  console.log(`  \u2139\ufe0f  ${outstanding.length} index target(s) declared after the ${newestRun} run and not yet applied `
    + `\u2014 run the provisioner's index pass: ${outstanding.map((t) => `${t.listTitle}.${t.internalName}`).join(', ')}`);
}
ok('every index target agrees with its declaration on the site',
   targets.every((t) => {
     const r = indexed.get(`${t.listTitle}\u0000${t.internalName}`);
     return !r || r.site === t.site;
   }));
ok('no index target failed',
   [...indexed.values()].every((r) => r.result === 'indexed' || r.result === 'already indexed'),
   [...indexed.values()].filter((r) => r.result !== 'indexed' && r.result !== 'already indexed').map((r) => `${r.list}.${r.field}: ${r.result}`).join('; '));

/* A run that provisioned columns but was never re-run has not proved the estate complete — it
   has proved its own arithmetic. The record must say so in its own words rather than leave a
   reader to infer completeness from a single pass. */
ok('a run with no verify pass declares that outstanding',
   [...laterRuns.values()].every((r) => r.runs.some((x) => x.phase === 'verify') || (r.noVerifyRun && r.noVerifyRun.state === 'OUTSTANDING')),
   'a later run records neither a verify pass nor its absence');

/* And where a verify pass IS recorded, it has to reconcile — against the whole specification, not
   against the handful of columns its own run touched. A verify pass that created something is not
   a verify pass: it means the apply pass left work behind and the estate was never complete at the
   moment anyone signed it off. A DRY_RUN verify satisfies this and is the stronger form, because a
   pass that cannot write cannot mask an incomplete estate by quietly finishing the job. */
for (const [file, r] of laterRuns) {
  const v = r.runs.find((x) => x.phase === 'verify');
  if (!v) continue;
  const where = file.split('/').pop();
  ok(`${where}: the verify pass created nothing`, v.created === 0 && v.failed === 0,
     `verify created ${v.created}, failed ${v.failed}`);
  /* Reconciled against the specification AS IT STOOD FOR THIS RUN, not as it stands today.
     A run record is a record of what was true when it ran; a column declared afterwards cannot
     have been found by it, and holding the record to a later specification would either force a
     rewrite of the evidence — the thing capturedState exists to prevent — or make every new
     column fail a historical pass. "Declared afterwards" is exactly PENDING with no
     provisionedBy: PENDING says the capture did not see it, and the absence of provisionedBy
     says no run has created it since. The moment one does, it gains provisionedBy, the expected
     count rises, and a run record has to account for it. */
  const notYetRun = allSpecRows.filter((f) =>
    (f.capturedState === 'PENDING' && !f.provisionedBy) || f.declaredAfter);
  const expected = allSpecRows.length - notYetRun.length;
  ok(`${where}: the verify pass found every column the specification named at the time`,
     v.present === expected,
     `verify found ${v.present} of ${expected}` +
     (notYetRun.length ? ` (${notYetRun.length} declared since: ${notYetRun.map((f) => `${f.list}.${f.internalName}`).join(', ')})` : ''));
  ok(`${where}: a DRY_RUN verify says so, so nobody reads it as an apply pass`,
     v.mode === undefined || v.mode === 'DRY_RUN');
}

// 7. The superseded specification says so, so nobody provisions from it by accident.
const v1 = JSON.parse(readFileSync(new URL('docs/deployment/power-automate-flows/sharepoint-lists.json', root), 'utf8'));
ok('specVersion 1.0 is marked superseded', typeof v1.supersededBy === 'string' && v1.supersededBy.includes('portal-field-spec.json'));
ok('the two specifications share no list title',
   !v1.lists.some(a => spec.lists.some(b => b.listTitle === a.listTitle)),
   'a shared title would mean one of the two is wrong about the tenant');

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
