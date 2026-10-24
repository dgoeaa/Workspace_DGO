#!/usr/bin/env node
/**
 * Which SharePoint lists does each Power Automate flow touch?
 *
 * WHY THIS EXISTS
 * The full-scope provisioning gate is blocked on one thing: "Internal operations — 7 of ~20
 * flow definitions available." The estate's list footprint was established by sweeping flow
 * definitions for connector actions naming a list, and that sweep is only as complete as the
 * definitions it was given. Until now it was a one-off run against a hand-picked set, so the
 * answer aged the moment a flow was exported or changed.
 *
 * This is that sweep as a command. Point it at the repository and it reads every Power
 * Automate definition it can find; point it at a single freshly-exported definition and it
 * reads that one. Either way the footprint is derived from the definition, never asserted, so
 * it cannot drift from what the flows actually do.
 *
 * WHAT IT READS
 *   - `OpenApiConnection` actions on the SharePoint connector: `parameters.dataset` is the
 *     site, `parameters.table` the list (a GUID in this tenant — see SPOT correction SC-004).
 *   - `SendHttpRequest` / `HttpRequest` REST calls on the same connector, where the list is
 *     named inside the URI as `lists(guid'…')` or `getbytitle('…')`.
 *   - Bare `Http` actions whose URI is a SharePoint `_api` call.
 * Every list GUID resolves against docs/reference/sharepoint-list-index.json — all 326 lists
 * across the five captured sites — so no fresh tenant capture is needed to name what a newly
 * exported flow touches. A GUID that does not resolve is reported unresolved, never guessed.
 *
 * Usage:
 *   node scripts/flow-list-sweep.mjs                      # sweep the repository, print a summary
 *   node scripts/flow-list-sweep.mjs --write              # also write docs/reference/flow-list-map.json
 *   node scripts/flow-list-sweep.mjs --check              # exit 1 if the written map is stale
 *   node scripts/flow-list-sweep.mjs --json               # machine-readable, to stdout
 *   node scripts/flow-list-sweep.mjs path/to/export.json  # sweep one newly-exported definition
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

/* The reader lives in one place so this and verify-portal-wiring.mjs cannot disagree about
 * what a definition says. See scripts/lib/flow-definition-reader.mjs. */
import {
  walk, definitionRoot, identity, isFlowDocument, collectActions,
  sharePointReferences, resolveRef, flowName,
} from './lib/flow-definition-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INDEX_PATH = join(ROOT, 'docs/reference/sharepoint-list-index.json');
const MAP_PATH = join(ROOT, 'docs/reference/flow-list-map.json');
const REGISTER_PATH = join(ROOT, 'docs/reference/internal-flow-register.json');

/* ── run ────────────────────────────────────────────────────────────────────────────────*/

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const paths = args.filter((a) => !a.startsWith('--'));

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));

/* A named argument may be a single export or the directory an exporter just filled. Reading
 * only files would make `flow-list-sweep.mjs ./exported` report zero definitions and exit
 * clean, which reads as "nothing here" rather than "you pointed me at a folder". */
const candidates = paths.length
  ? paths.flatMap((p) => {
      const abs = resolve(p);
      try { return statSync(abs).isDirectory() ? walk(abs) : [abs]; }
      catch { return [abs]; }
    })
  : walk(ROOT);

/* Sorted by codepoint, not by readdir order and not by locale. Two things depend on it:
 * which of several byte-identical copies becomes the primary path below, and the order of
 * the map itself. readdirSync returns filesystem order — alphabetical on NTFS, hash order
 * on ext4 — so without this the same tree yields a different map on Windows than on the
 * runner, and `--check` fails for nobody's mistake. */
candidates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const flows = [];
const unreadable = [];

/* Several definitions are byte-identical copies filed under two conventions —
 * docs/reference/flow-contracts/ and docs/reference/foundational/flows/definitions/ hold the
 * same six exports. Counting both would double every list they touch and overstate how much
 * of the estate is actually covered, so identical content is one flow with several paths. */
const byContent = new Map();

for (const file of candidates) {
  let raw;
  try { raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
  catch (err) { if (paths.length) unreadable.push({ file, reason: err.message }); continue; }
  let doc;
  try { doc = JSON.parse(raw); }
  catch (err) { if (paths.length) unreadable.push({ file, reason: err.message }); continue; }
  if (!isFlowDocument(doc)) {
    if (paths.length) unreadable.push({ file, reason: 'not a Power Automate definition — no actions alongside a $schema or triggers' });
    continue;
  }

  /* Recorded with forward slashes whatever the platform. path.relative() gives
     backslashes on Windows, and this string is committed in flow-list-map.json and
     compared byte-for-byte by --check: a Windows operator running --write would
     otherwise rewrite every path in the map and fail the check on a POSIX runner. */
  const rel = relative(ROOT, file).split(sep).join('/');
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const existing = byContent.get(hash);
  if (existing) { existing.duplicatePaths.push(rel); continue; }

  const def = definitionRoot(doc);
  byContent.set(hash, {
    file: rel,
    /* A run-record export is always called definition.json, so the directory is the only
       thing that names the flow; a contract export carries the name in the file itself. */
    flow: flowName(file),
    ...identity(doc),
    contentHash: hash,
    duplicatePaths: [],
    actions: collectActions(def.actions, '', []).length,
    references: sharePointReferences(def).map((r) => resolveRef(r, index)),
  });
}

flows.push(...byContent.values());
flows.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
for (const f of flows) f.sharePointActions = f.references.length;

/* Coverage against the declared contract. A key is covered when a definition attributed to it
 * in the register was actually read in this run — this script never infers which flow serves
 * which contract key from a filename. */
const readFiles = new Set(flows.map((f) => f.file));
const coverage = register.contractKeys.map((k) => {
  const definitionsRead = (k.definitions || []).filter((d) => readFiles.has(d));
  return { ...k, definitionsRead, covered: definitionsRead.length > 0 };
});

const distinctLists = new Map();
for (const f of flows) {
  for (const r of f.references) {
    if (!r.listGuid) continue;
    const cur = distinctLists.get(r.listGuid)
      || { listGuid: r.listGuid, site: r.site, listTitle: r.listTitle, adopted: r.adopted, touchedBy: new Set() };
    cur.touchedBy.add(f.flow);
    distinctLists.set(r.listGuid, cur);
  }
}

const covered = coverage.filter((c) => c.covered).length;
const allRefs = flows.flatMap((f) => f.references.map((r) => ({ ...r, flow: f.flow })));
const unresolvedGuids = [...new Set(allRefs.filter((r) => r.resolved.startsWith('UNRESOLVED GUID')).map((r) => r.listGuid))];
const unresolvedNames = [...new Set(allRefs.filter((r) => r.resolved.startsWith('UNRESOLVED NAME')).map((r) => r.listTitle))].sort();
const unresolvedNameFlows = [...new Set(allRefs.filter((r) => r.resolved.startsWith('UNRESOLVED NAME')).map((r) => r.flow))].sort();

/* The gate counts contract keys, but keys are not the unit of work — a flow is. Four keys
 * ride on DYNAMIC_GLOBAL_ACTIONS and two on SUBSIDIARY_ACTIONS, so 20 keys are served by 16
 * flows and every export closes one flow, not one key. */
const physical = register.physicalFlows.map((p) => ({
  ...p,
  /* One definition covers the whole flow, and every key on that flow rides the same
     definition — so a single covered key means the flow itself is covered. */
  covered: p.servesContractKeys.some((k) => coverage.find((c) => c.key === k)?.covered),
}));
const physicalCovered = physical.filter((p) => p.covered).length;

const result = {
  generatedBy: 'scripts/flow-list-sweep.mjs',
  listIndex: { version: index.indexVersion, capturedUtc: index.capturedUtc, lists: index.totals.lists },
  register: { version: register.registerVersion },
  totals: {
    definitionsRead: flows.length,
    sharePointActions: flows.reduce((n, f) => n + f.sharePointActions, 0),
    distinctListsTouched: distinctLists.size,
    unresolvedGuids: unresolvedGuids.length,
    unresolvedNames: unresolvedNames.length,
    contractKeys: coverage.length,
    contractKeysCovered: covered,
    physicalFlows: physical.length,
    physicalFlowsCovered: physicalCovered,
  },
  unresolved: { guids: unresolvedGuids, names: unresolvedNames, namedBy: unresolvedNameFlows },
  coverage,
  physicalFlows: physical,
  listsTouched: [...distinctLists.values()]
    .map((l) => ({ ...l, touchedBy: [...l.touchedBy].sort() }))
    .sort((a, b) => byteCompare(a.site || '', b.site || '') || byteCompare(a.listTitle || '', b.listTitle || '')),
  flows,
};

if (flags.has('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\nFlow → list sweep — ${flows.length} definition(s) read, list index ${index.indexVersion} (${index.totals.lists} lists, captured ${index.capturedUtc})\n`);
  for (const f of flows) {
    const named = f.references.filter((r) => r.listGuid || r.listTitle);
    const distinct = new Set(named.map((r) => r.listGuid || r.listTitle)).size;
    console.log(`  ${f.flow}`);
    console.log(`    ${f.actions} actions · ${f.sharePointActions} SharePoint action(s) · ${distinct} distinct list(s)`);
    const seen = new Set();
    for (const r of named) {
      const key = `${r.operation}|${r.listGuid || r.listTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const where = r.site ? `${r.site} / ${r.listTitle}` : (r.listTitle || r.listGuid);
      const warn = /^(UNRESOLVED|AMBIGUOUS)/.test(r.resolved) ? `   ⚠ ${r.resolved}` : '';
      console.log(`      ${r.operation.padEnd(11)} ${where}${warn}`);
    }
  }
  /* Coverage is a statement about the whole estate. A sweep of one hand-named file has not
     looked at the estate, so printing "15 flows still to export" there would be an artefact
     of the argument list, not a finding. */
  if (paths.length) {
    console.log('  Sweep of a named file — estate coverage not reported. To fold this into the');
    console.log('  estate map, file the definition under docs/reference/flow-contracts/, attribute');
    console.log('  it in docs/reference/internal-flow-register.json, then run with --write.\n');
  }
  if (!paths.length) console.log(`\n  Coverage: ${covered}/${coverage.length} contract keys · ${physicalCovered}/${physical.length} physical flows`);
  const missingFlows = paths.length ? [] : physical.filter((p) => !p.covered);
  if (missingFlows.length) {
    console.log(`  Still to export — ${missingFlows.length} flow(s), not ${coverage.length - covered} keys:`);
    for (const m of missingFlows) {
      const keys = m.servesContractKeys.length > 1 ? `  (serves ${m.servesContractKeys.length} keys)` : '';
      console.log(`    - ${m.physicalFlow.padEnd(24)} ${m.workflowId ? `workflow ${m.workflowId}` : 'workflow id not recorded'}${keys}`);
    }
  }
  if (unresolvedNames.length) {
    console.log(`\n  ⚠ ${unresolvedNames.length} list name(s) match no list anywhere in the estate:`);
    for (const n of unresolvedNames) console.log(`      ${n}`);
    console.log(`    Named by: ${unresolvedNameFlows.join(', ')}`);
    console.log('    No tenant capture can resolve these — the definitions address lists that do not exist.');
  }
  if (unresolvedGuids.length) {
    console.log(`\n  ⚠ ${unresolvedGuids.length} list GUID(s) are not in the index — recapture the site holding them:`);
    for (const g of unresolvedGuids) console.log(`      ${g}`);
  }
  console.log(`\n  ${result.totals.distinctListsTouched} distinct list(s) touched across every definition read.\n`);
}

for (const u of unreadable) console.error(`  ! ${relative(ROOT, u.file)} — ${u.reason}`);

if (flags.has('--write')) {
  writeFileSync(MAP_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`Wrote ${relative(ROOT, MAP_PATH)}`);
}

if (flags.has('--check')) {
  let onDisk = null;
  try { onDisk = readFileSync(MAP_PATH, 'utf8'); } catch { /* reported below */ }
  const fresh = JSON.stringify(result, null, 2) + '\n';
  if (onDisk !== fresh) {
    console.error(`\n❌ ${relative(ROOT, MAP_PATH)} is ${onDisk === null ? 'missing' : 'stale'} — run: node scripts/flow-list-sweep.mjs --write`);
    /* Say WHAT differs. A byte comparison that only reports "stale" sends the reader looking
       for a content change when the cause may be the platform: line endings, ordering, or a
       path separator. Twice this failed on Windows and passed on Linux with nothing changed,
       and both times the cause had to be guessed. */
    if (onDisk !== null) {
      const norm = (t) => t.replace(/\r\n/g, '\n');
      if (norm(onDisk) === norm(fresh)) {
        console.error('   The only difference is LINE ENDINGS — the checkout is CRLF and the');
        console.error('   generator writes LF. Fix the checkout, not the file:');
        console.error('     git config core.autocrlf false');
        console.error('     git rm --cached -r . ; git reset --hard');
      } else {
        const a = onDisk.split('\n'), b = fresh.split('\n');
        let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
        console.error(`   First difference at line ${i + 1} of ${b.length}:`);
        console.error(`     on disk : ${JSON.stringify((a[i] ?? '<end of file>').slice(0, 110))}`);
        console.error(`     fresh   : ${JSON.stringify((b[i] ?? '<end of file>').slice(0, 110))}`);
        if (a.length !== b.length) console.error(`   Line counts differ: on disk ${a.length}, fresh ${b.length}.`);
      }
    }
    process.exit(1);
  }
  console.log(`✅ ${relative(ROOT, MAP_PATH)} matches the definitions in the tree`);
}

if (unreadable.length && paths.length) process.exit(1);
