#!/usr/bin/env node
/**
 * The governance execution runbook — every step that must happen outside the repository.
 *
 * Generated from `docs/reference/governance-list-registry.json`,
 * `docs/reference/governance-estate-position.json` and the corrected flow definitions, so the
 * GUIDs, counts and finding text in the runbook cannot drift from the artefacts they came from.
 * A runbook that quotes a stale GUID is worse than none: the operator addresses a list that is
 * not the one being discussed, and every check afterwards passes.
 *
 *   npm run governance:runbook              # regenerate
 *   npm run governance:runbook -- --check   # fail if it has drifted
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { byteCompare } from './lib/stable-sort.mjs';
import { provisioningScope } from './lib/registry-provisioning-scope.mjs';
import { VERDICTS, PASS_LINE } from './lib/column-verifier-verdicts.mjs';
import { ownershipBanner } from './lib/document-ownership.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md');
const CHECK = process.argv.includes('--check');

const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const registry = J('docs/reference/governance-list-registry.json');
const position = J('docs/reference/governance-estate-position.json');
const map = J('docs/reference/flow-definition-map.json');

const SITE = registry.decision.authoritativeSite;
const SITE_NAME = SITE.split('/sites/')[1];
const httpSpec = J('docs/reference/http-flow-registry-spec.json');

/* The Power Automate environment. Every trigger payload in Steps 4 and 5 carries it, and the
   key the flows compute is `<environmentId>|<flowId>` — so a copy of it that drifted would
   produce test payloads addressing a registry row nobody registered, and a 404 that reads like
   a bug in the flow rather than a typo in the runbook. Named once, interpolated everywhere. */
const ENV_ID = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';

/* The synthetic flows the path tests register, and the key the flows derive from them.
   PATH 3 answers 409 only if the consumer row flow 07 writes carries the SAME RegistryKey that
   flow 05 composes from the retirement request. The runbook previously called flow 07 with a
   payload built from its trigger schema — `action`, `operation`, `source` — none of which the
   definition reads, so the consumer was never created, the count came back zero and the guard
   answered 200. Deriving both sides from one expression is what stops that recurring. */
const PATH_TEST_FLOW_ID = '00000000-0000-0000-0000-000000000001';
const BLOCK_TEST_FLOW_ID = '00000000-0000-0000-0000-000000000002';
const ABSENT_FLOW_ID = '00000000-0000-0000-0000-0000000000ff';
const registryKeyFor = (flowId) => `${ENV_ID}|${flowId}`;

/* Where the duplicates live — derived, never typed. Step 3 is executed against this site, and a
   runbook that names the wrong one sends an operator to delete the estate. */
const DUPLICATE_SITES = [...new Set(registry.retire.map((r) => r.site))];
if (DUPLICATE_SITES.length !== 1) {
  console.error(`\n  ✖  the duplicates span ${DUPLICATE_SITES.length} sites; Step 3 assumes one\n`);
  process.exit(2);
}
const DUPLICATE_SITE = `${SITE.split('/sites/')[0]}/sites/${DUPLICATE_SITES[0]}`;
const finding = (id) => position.openFindings.find((f) => f.id === id);

const corrections = fs.readdirSync(path.join(ROOT, 'docs/deployment/governance/flows'))
  .filter((f) => f.endsWith('.corrected.json'))
  .map((f) => J(`docs/deployment/governance/flows/${f}`))
  .sort((a, b) => byteCompare(a.flow, b.flow));

/* ── Build-time assertions ───────────────────────────────────────────────────────────────────
   The header of this runbook says it cannot quote a stale GUID, and that has been true. Nothing
   stopped it quoting figures that do not add up, a step order its own steps contradict, or a
   test payload the flow it targets would reject — all three of which it did. These checks make
   that class of defect fail `npm run test:governancerunbook` rather than ship inside a document
   whose first paragraph asserts it cannot be wrong. */
const fail = (msg) => {
  console.error(`\n  ✖  ${msg}\n`);
  process.exit(2);
};

/* GOV-06's arithmetic. 51 register rows minus 13 matched exports is 38, not the 37 the runbook
   reported — because one exported name ("Fetch Activities") matches TWO register rows, so 13
   exports match 14 rows. The figure was right and the table could not show why. */
const matchedRegisterRows = map.matched.reduce((n, m) => n + m.registerWorkflowIds.length, 0);
const ambiguousEntries = map.matched.filter((m) => m.ambiguous).length;
if (map.totals.exportedDefinitions - map.totals.matchedByName !== map.totals.unmatchedExports) {
  fail(`export side does not reconcile: ${map.totals.exportedDefinitions} exported − ${map.totals.matchedByName} matched ≠ ${map.totals.unmatchedExports} unmatched`);
}
if (map.totals.registerWorkflows - matchedRegisterRows !== map.totals.unexportedRegisterWorkflows) {
  fail(`register side does not reconcile: ${map.totals.registerWorkflows} rows − ${matchedRegisterRows} matched rows ≠ ${map.totals.unexportedRegisterWorkflows} unexported`);
}
if (ambiguousEntries !== map.totals.ambiguousMatches) {
  fail(`ambiguousMatches says ${map.totals.ambiguousMatches}; ${ambiguousEntries} matched entries are flagged ambiguous`);
}

/* `idOverlap` counts exported definitions carrying an id the register knows. It is bounded by
   the register itself, and by how many exports can supply an id at all — only those with an
   HTTP trigger have a workflow id to read. The runbook closed GOV-06 at 77, which neither bound
   permits. */
const ID_OVERLAP_CEILING = Math.min(map.totals.registerWorkflows, map.totals.exportsWithHttpTrigger);
if (ID_OVERLAP_CEILING >= map.totals.exportedDefinitions) {
  fail(`the idOverlap ceiling (${ID_OVERLAP_CEILING}) no longer bites; re-derive the GOV-06 exit criterion`);
}

/* Keep and retire must never intersect, and every duplicate must be superseded by a list that
   is actually being kept. Step 3 deletes whole lists from this data. */
const keepGuids = new Set(registry.lists.map((l) => l.listGuid));
const collide = registry.retire.filter((r) => keepGuids.has(r.listGuid));
if (collide.length) fail(`${collide.length} retirement target(s) are also in the keep set: ${collide.map((c) => c.listGuid).join(', ')}`);
const dangling = registry.retire.filter((r) => !keepGuids.has(r.supersededBy));
if (dangling.length) fail(`${dangling.length} retirement target(s) are superseded by a GUID not in the keep set`);

/* Which registry lists each corrected flow actually reads or writes, read from the definitions
   rather than asserted. Step 5 used to defer four lists that Step 4 then told the operator to
   exercise — including DGO_HTTPFlowConsumerRegistry, without which the blocked path cannot
   produce a 409 at all. */
let scope;
try {
  scope = provisioningScope({ spec: httpSpec, corrections });
} catch (err) {
  fail(err.message);
}
const {
  specLists: SPEC_LISTS, listsTouchedBy, required: REQUIRED_LISTS,
  provisionNow: PROVISION_NOW, deferred: DEFERRED,
} = scope;
if (!REQUIRED_LISTS.length) fail('no corrected flow references a registry list; the definitions or the spec titles have changed shape');
const specRow = (t) => httpSpec.lists.find((l) => l.listTitle === t);
const listNumber = (t) => SPEC_LISTS.indexOf(t) + 1;

/* Step 5's tables, built from the registry specification rather than typed. The field counts in
   them were previously hand-copied — in a document whose header says every count is read from
   its source. */
const flowNumbersFor = (title) =>
  corrections.filter((c) => listsTouchedBy(c).includes(title)).map((c) => c.flow.slice(0, 2));

const provisionRows = PROVISION_NOW.map((t) => {
  const flows = flowNumbersFor(t);
  const why = flows.length
    ? `Read or written by flow${flows.length > 1 ? 's' : ''} ${flows.join(', ')}`
    : 'The control parameters the registry flows read';
  return `| ${listNumber(t)} | \`${t}\` | ${specRow(t).customFieldCount} | \`${specRow(t).uniqueKey}\` | ${why} |`;
}).join('\n');

const deferredTable = DEFERRED.length
  ? [
    '| # | List | Fields | Deferred because |',
    '|---|---|---|---|',
    ...DEFERRED.map((t) => `| ${listNumber(t)} | \`${t}\` | ${specRow(t).customFieldCount} | No corrected flow reads or writes it |`),
  ].join('\n')
  : '_Nothing is deferred. The four corrected flows touch every list but the configuration list,\nand they read that._';

const BLOCK_TEST_KEY = registryKeyFor(BLOCK_TEST_FLOW_ID);

/* GOV-06 turns on one column and one trigger field, and neither exists yet. The runbook used to
   say "if your DGO_HTTPFlowRegistry does not have it, add it" — a conditional, when the answer
   is knowable here and is always no. Derived, so the wording corrects itself the day the
   specification and the flow acquire it. */
const REGISTRY_FIELDS = httpSpec.fields.filter((f) => f.listTitle === 'DGO_HTTPFlowRegistry');
const SPEC_HAS_WORKFLOW_ID = REGISTRY_FIELDS.some((f) => f.internalName === 'WorkflowId');
const flow02 = corrections.find((c) => c.flow.startsWith('02'));
const FLOW_02_TAKES_WORKFLOW_ID = /workflowId/i.test(JSON.stringify(flow02?.definition ?? {}));
const GOV06_BLOCKERS = [
  !SPEC_HAS_WORKFLOW_ID
    && `\`WorkflowId\` is not one of the ${REGISTRY_FIELDS.length} fields the registry specification defines for \`DGO_HTTPFlowRegistry\`, so Step 5 will not create it. Add it to \`docs/reference/http-flow-registry-spec.json\` — indexed, Text — and re-provision.`,
  !FLOW_02_TAKES_WORKFLOW_ID
    && `Flow 02 neither declares \`workflowId\` on its trigger nor writes it to the registry row, so "register, supplying the workflow id" cannot be carried out as written. Extend the trigger schema and \`Create_Registry_Record\`/\`Update_Registry_Record\`, then re-apply the flow.`,
  map.totals.exportsWithHttpTrigger < map.totals.exportedDefinitions
    && `Only ${map.totals.exportsWithHttpTrigger} of the ${map.totals.exportedDefinitions} exported definitions carry an HTTP trigger, and the trigger URL is the documented source of a workflow id. The remaining ${map.totals.exportedDefinitions - map.totals.exportsWithHttpTrigger} need another source — the package metadata — or they cannot be joined this way at all.`,
  ID_OVERLAP_CEILING < map.totals.exportedDefinitions
    && `\`idOverlap\` counts exported definitions carrying an id the register knows, so it cannot exceed ${ID_OVERLAP_CEILING} — the smaller of the ${map.totals.registerWorkflows}-row register and the ${map.totals.exportsWithHttpTrigger} exports that can supply an id. An exit criterion of ${map.totals.exportedDefinitions} is unreachable.`,
].filter(Boolean);
const gov06Blockers = GOV06_BLOCKERS.map((b, i) => `${i + 1}. ${b}`).join('\n');

const keepRows = registry.lists
  .map((l) => `| \`${l.listGuid}\` | \`${l.listTitle}\` | \`${l.serverRelativeUrl}\` |`).join('\n');

const retireRows = registry.retire
  .map((r) => `| \`${r.listGuid}\` | \`${r.listTitle}\` | ${r.site} | \`${r.supersededBy}\` |`).join('\n');

const correctionRows = corrections.map((c) =>
  `| ${c.flow} | \`${c.flowId}\` | ${c.corrects.join(', ')} | ${c.changes.length} | ${listsTouchedBy(c).map((t) => `\`${t}\``).join('<br>')} |`).join('\n');

const md = `# Governance tenant runbook — actions outside the repository

${ownershipBanner('docs/deployment/governance/GOVERNANCE-TENANT-RUNBOOK.md')}

**GENERATED — do not edit by hand.** Produced by \`scripts/build-governance-runbook.mjs\` from
the governance list registry, the estate position record and the corrected flow definitions.
Every GUID and count below is read from those files, so this document cannot quote a stale one.
Change the source and re-run \`npm run governance:runbook\`.

Everything in this runbook needs a tenant. Nothing here can be done from the repository. What HAS
been done in the repository is listed in [\`WHAT-WAS-DONE.md\`](./WHAT-WAS-DONE.md).

${(() => {
  /* THIS SENTENCE USED TO BE "and nothing here has been done", HARDCODED.
     It was false from 2026-09-09, when Steps 2, 2.7 and 3a-3c were executed against the tenant —
     and the document two lines above claims it "cannot quote a stale one" because every figure is
     read from the position file. Every figure was; this sentence was not. GOVERNANCE-STATUS.md,
     generated from the SAME file, marked those steps done while this one said none had started.
     Now it is derived, so the two cannot disagree again. */
  const all = [...(position.openFindings || []), ...(position.closedFindings || [])];
  const started = all.filter((f) => /\b(COMPLETE|RESOLVED|DONE)\b/i.test(f.tenantStatus || ''));
  if (!started.length) {
    return 'Nothing in this runbook has been done in the tenant yet.';
  }
  return `**Some of this has been done.** ${started.length} of ${all.length} findings record `
    + `tenant progress — ${started.map((f) => f.id).join(', ')} — and the dated detail is in each `
    + `finding's \`tenantStatus\` and in [\`GOVERNANCE-STATUS.md\`](./GOVERNANCE-STATUS.md). Read a `
    + `step's status there before running it: several are idempotent and safe to repeat, and `
    + `Step 3's delete phase is deliberately not.`;
})()}

---

## Decision on record

**GOV-01 is approved.** \`${SITE}\` is the single
authoritative site for all ten governance lists.

Rationale, from \`docs/reference/governance-list-registry.json\`:
> ${registry.decision.rationale}

---

## Prerequisites — confirm all four before starting

| # | Prerequisite | How to confirm |
|---|---|---|
| 1 | **Manage Lists** on \`${SITE_NAME}\` | Open ${SITE}, then Settings ⚙ → Site permissions. Site Owner is sufficient. Tenant administrator is **not** required. |
| 2 | **Manage Lists** on \`NITDADGO-EAAACTIVITYTRACKING\` | Needed only for Step 3 (retiring duplicates). Same check on that site. |
| 3 | **Power Automate maker** access in environment \`${ENV_ID}\` | https://make.powerautomate.com → confirm the environment selector shows it and you can open a flow for editing. Needed for Step 4, and again for Step 5.4 — the trigger URLs the path tests call are read from each flow's HTTP trigger. |
| 4 | A browser signed in to \`https://nitdanigeria.sharepoint.com\` | Any page on either site loads without a sign-in prompt. |

**Order matters, and applying a correction is not the same step as validating it.**

Step 2 before Step 3: provisioning writes only to the GUIDs it is given, so doing it first means
the duplicates are already irrelevant when you delete them.

Step 4 before Step 5: the corrected definitions must be in place before the lists they write to
exist, so an unguarded flow 05 never meets a populated registry. That is the one ordering mistake
with an irreversible outcome, and it is why Step 4 stops at the import.

Step 5 before the path tests. Every path test writes to the registry lists, and the blocked path
needs \`DGO_HTTPFlowConsumerRegistry\` in particular — with no consumer list there is no consumer
row, the active-consumer count comes back zero and the guard answers 200 instead of 409. So
validation is **Step 5.4**, after the lists exist, not inside Step 4.

---

## Step 1 — Back up, before anything

**This estate has no PowerShell path, and this step is not an exception.** Since PnP 2.x,
\`Connect-PnPOnline -Interactive\` needs an Entra app registration, which this estate has ruled
out — that is why every other script in this runbook runs in the browser console. A mandatory
first gate whose only procedure cannot be executed here is not a gate. The PowerShell below is
kept for an operator who already holds that registration; it is the alternative, not the route.

### 1.1 The browser path

1. Sign in and open any page on \`${SITE}\`.
2. **F12** → **Console**.
3. Open \`scripts/backup-governance-lists.browser.js\`, select all, copy, paste, **Enter**.

It **reads only**. It downloads one JSON file per list — every field of every item, plus the
list's custom field definitions — and a \`governance-backup-manifest.json\` naming the GUID,
title, item count, field count and capture time of each.

**Expected:** ${registry.lists.length + 1} downloads (${registry.lists.length} lists and the manifest), and a final line reading
\`${registry.lists.length} of ${registry.lists.length} captured, 0 failed\`.

**Validation.** An empty list still produces a file, holding \`"items": []\` — an empty backup and
a missing backup must not look alike. The script re-reads each list's \`ItemCount\` after the
capture and reports \`MISMATCH\` if it differs from the number of items it wrote; that means the
list was written to mid-capture, so run it again.

**What this is, and what it is not.** It is an item-and-field-definition export: enough to
reconstruct the rows and the custom columns. It does **not** capture views, content types,
permissions, attachments, version history or list settings. It is a backup of the data, not of
the list.

**Restoring is not the inverse of exporting.** The captured fields include read-only and system
values (\`Id\`, \`Created\`, \`Author\`, \`_UIVersionString\`), person and lookup values as objects
rather than ids, and — after Step 2 — at least one field whose name has changed. Re-importing a
file as-is will fail or write the wrong shape. Treat it as the evidence, and as the source values
for a controlled restore, not as a restore artefact.

### 1.2 If you do have PowerShell

\`\`\`powershell
# Requires PnP.PowerShell AND an Entra app registration for interactive sign-in:
#   Install-Module PnP.PowerShell -Scope CurrentUser -Force
$site = "${SITE}"
Connect-PnPOnline -Url $site -Interactive
New-Item -ItemType Directory -Force -Path .\\governance-backup | Out-Null

$guids = @(
${registry.lists.map((l) => `  "${l.listGuid}"   # ${l.listTitle}`).join('\n')}
)
foreach ($g in $guids) {
  $list   = Get-PnPList -Identity $g
  $items  = Get-PnPListItem -List $g -PageSize 2000
  $values = @($items | Select-Object -ExpandProperty FieldValues)
  # -InputObject, not the pipeline. A one-item array piped into ConvertTo-Json unrolls and
  # serialises as a bare object, and an empty one emits nothing at all — so an empty list
  # would leave a zero-byte file that no reader can tell from a failed capture.
  ConvertTo-Json -InputObject $values -Depth 10 |
    Out-File ".\\governance-backup\\$($list.Title).json" -Encoding utf8
  Write-Host "$($list.Title): $($values.Count) item(s) saved"
}

# Prove every file parses before trusting any of them.
Get-ChildItem .\\governance-backup\\*.json | ForEach-Object {
  try   { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null; "VALID  $($_.Name)" }
  catch { throw "INVALID JSON BACKUP: $($_.FullName)" }
}
\`\`\`

**Expected:** ${registry.lists.length} files under \`.\\governance-backup\\\`, one per list, each printing \`VALID\`.
**If it fails:** \`Get-PnPList\` returning *List does not exist* means the GUID is not on this
site — stop and re-read \`docs/reference/governance-list-registry.json\`; do not substitute a
title.

---

## Step 2 — Provision the ten governance lists on the authoritative site

This creates missing columns, indexes the columns the specification marks indexed, and seeds the
ten configuration rows. **It creates no list** — all ten exist — and it addresses every list by
GUID, so it cannot mint an eleventh copy.

### 2.1 Dry run

1. Sign in to \`https://nitdanigeria.sharepoint.com\` and open any page on \`${SITE}\`.
2. Open devtools: **F12** → **Console** tab.
3. Open \`scripts/provision-governance-lists.browser.js\` from this repository, select all, copy.
4. Paste into the console and press **Enter**.

**Expected:** a table headed \`DRY RUN — 97 columns and 10 seed rows across 10 lists\`, then one
row per column and per seed, each marked \`present\`, \`WOULD CREATE\`, \`WOULD INDEX\` or
\`WOULD SEED\`. The final line reports \`0 failed\`.

**Validation before proceeding:** every row's list name must be one of the ten, and the console
must show the site \`${SITE}\`. If any row reads \`SITE UNREACHABLE\` or
\`LIST NOT READABLE\`, you lack Manage Lists on that site — stop and resolve prerequisite 1.

### 2.2 Apply

1. In the copied text, change the line \`const DRY_RUN = true;\` to \`const DRY_RUN = false;\`.
2. Paste again and press **Enter**.

**Expected:** the same table with \`CREATED\`, \`INDEXED\` and \`SEEDED\` in place of the
\`WOULD\` verbs, and \`0 failed\`.

### 2.3 Verify

Paste the file a third time, unmodified (\`DRY_RUN\` back to \`true\` or left false — both are
safe).

**Expected:** every row reads \`present\`. \`0 created, 0 seeded\`. That is the idempotence
check: a second apply that creates anything means the first did not do what it reported.

### 2.4 If a list fails

**A count of failures at the end of a 107-row table is not a diagnosis.** The script now groups
failures by list and quotes the server's own message; read that group, not the count.

The distinction that matters is WHERE the failure lands:

| Pattern | Meaning | Action |
|---|---|---|
| \`SITE UNREACHABLE\` | No Manage Lists on the site | Resolve prerequisite 1 |
| \`LIST NOT READABLE\` | The list GUID does not resolve | Re-read the registry; do not substitute a title |
| \`FAILED\` on a column | That column could not be created | Read the message; usually a schema conflict |
| \`RESERVED NAME\` | The specification asked for a name SharePoint owns | Rename it in the specification — see below |
| \`ADOPTED\` | The tenant already had that column under a different internal name | Nothing. This is the correct outcome |
| Every failure on ONE list, all touching items | See **2.5** | Do not conclude the list is damaged |

### 2.5 The failure this runbook previously misdiagnosed

The 2026-09-09 run failed every operation on \`DGO_AccessScopes\` that reached its item store —
500 \`List does not exist. It may have been deleted by another user.\` on the seed check,
500 \`Cannot complete this action.\` on the index — while its field metadata resolved normally.
This was recorded as **GOV-07**, a damaged list. **It was not.** The list opens in a browser and
its view shows a column titled **Access Scope Id**.

The real cause is **GOV-08**. \`ScopeId\` is a SharePoint SYSTEM field: every list carries a
hidden one holding the item's security scope. The specification declared a custom column of the
same name, the presence check answered yes against SharePoint's own field, the specification's
column was never created — and then indexing a system field returned 500, and filtering a
Guid-typed system field against the string \`'all'\` returned 500 "List does not exist."

Three columns were affected, and all three are now renamed in the specification:

| List | Was | Now | Display name |
|---|---|---|---|
| \`DGO_AccessScopes\` | \`ScopeId\` | \`AccessScopeId\` | Access Scope Id |
| \`DGO_RoleCatalogue\` | \`Version\` | \`CatalogueVersion\` | Catalogue Version |
| \`DGO_EndpointRegistry\` | \`Version\` | \`EndpointVersion\` | Endpoint Version |

**This is why Step 2 must be re-run.** The previous run's report — 97 of 97 columns present —
counted at least one column that did not exist. Re-running against the corrected specification
is what replaces that report with one that means what it says.

**Expect \`ADOPTED\` on \`DGO_AccessScopes.AccessScopeId\`.** The tenant already carries a custom
column displayed as *Access Scope Id*, created by hand by someone who hit the same collision.
The script uses that column and rewrites the seed onto its real internal name rather than
creating a second column for the same fact. \`ADOPTED\` is a success, not a warning.

If a \`RESERVED NAME\` row appears for any other column, the specification is asking for a name
SharePoint will never release. Rename it in
\`docs/reference/sharepoint-provisioning-spec.json\` via \`scripts/correct-governance-fields.mjs\`
and re-run — never by hand, or the next extraction loses the fix.

**A failing list does not block the other nine.** The script writes per list; the nine that
succeed are complete and usable.

### 2.6 Read back what was actually created — do this after any apply

\`createfieldasxml\` is called with \`Options: 24\`, and 8 of that is **AddFieldInternalNameHint**:
SharePoint takes the column's internal name from the SchemaXml's \`Name\` attribute, not from
\`StaticName\` and not from the display name. A column can therefore be created under one internal
name while showing another in the view — and the run reports \`CREATED\` either way.

That is not hypothetical. The run of **2026-09-09** created three columns from a SchemaXml whose
\`Name\` still carried the old name, because the rename's last regex matched the tail of
\`DisplayName\` instead of the standalone \`Name\` attribute:

| List | Column | \`Name\` it was built with |
|---|---|---|
| \`DGO_RoleCatalogue\` | \`CatalogueVersion\` | \`Version\` — reserved |
| \`DGO_EndpointRegistry\` | \`EndpointRedacted\` | \`FlowUrl\` — the name GOV-03 removes |
| \`DGO_EndpointRegistry\` | \`EndpointVersion\` | \`Version\` — reserved |

The specification is fixed and guarded. What the tenant received is a separate question, and only
the tenant can answer it.

1. Open \`scripts/verify-governance-columns.browser.js\`, copy the whole file.
2. Console on the governance site → paste → Enter. It **reads only**.
3. Every row should read \`${VERDICTS.ok}\`, and the last line should read
   \`${PASS_LINE}\`

The script prints exactly five verdicts and no others. They are not interchangeable, and the two
that stop the step are not the two that read most alarmingly:

| Verdict | Meaning | Stops the step |
|---|---|---|
| \`${VERDICTS.ok}\` | the column exists as a custom column under the specified internal name | no |
| \`${VERDICTS.missing}\` | the specification declares it and the list does not have it under that name | **yes** |
| \`${VERDICTS.reserved}\` | a field of that name exists, but it is SharePoint's own | **yes** |
| \`${VERDICTS.unreadable}\` | the list itself could not be read | **yes** |
| \`${VERDICTS.stale}\` | a superseded name is still on the list | no — record it, do not delete it |

**If a row reads \`${VERDICTS.missing}\`:** the specified internal name is not on the list. That has
**two** causes and they need different remedies, so establish which before acting:

- the create silently did nothing — re-run Step 2; or
- the create succeeded under a **different** internal name, which is the 2026-09-09 outcome and
  leaves the column present but unfindable by its specified name.

Run \`scripts/dump-governance-columns.browser.js\` and look for the display name. If a column
carries the right display name under the wrong internal name, go to 2.7. **Do NOT delete the
column on sight** — on some lists it holds the only copy of the data.

### 2.7 Remediating a column created under the wrong internal name

This was the outcome on **2026-09-09**, and the tenant has been read back. SharePoint did not
overwrite anything: it **auto-disambiguated**, appending \`0\` and creating each new column
*beside* the original. **No data was lost.**

| List | Original — untouched | Created beside it | Holds |
|---|---|---|---|
| \`DGO_RoleCatalogue\` | \`Version\` — 6/6 populated \`R11.6-PILOT\` | \`Version0\` (Title "CatalogueVersion") | empty |
| \`DGO_EndpointRegistry\` | \`Version\` — 6/6 populated \`document-portal.1\` | \`Version0\` (Title "EndpointVersion") | empty |
| \`DGO_EndpointRegistry\` | \`FlowUrl\` — 0/6 populated, no signature | \`FlowUrl0\` (Title "EndpointRedacted") | empty |

**Two of those renames have since been WITHDRAWN.** Both \`Version\` columns are ordinary custom
columns — \`FromBaseType=false\`, \`CanBeDeleted=true\` — populated and working. \`Version\` is not a
reserved internal name on an ordinary list; SharePoint's own version field is \`_UIVersionString\`.
It was added to the reserved list by generalising from the confirmed \`ScopeId\` case instead of
checking it. **Only \`ScopeId → AccessScopeId\` was a real fix**, and the tenant has confirmed it.

So the work here is smaller than it first looked: **delete three empty columns.** Nothing is
migrated, because nothing that holds data is being renamed.

| Delete | Why it is safe |
|---|---|
| \`DGO_RoleCatalogue.Version0\` | empty, created 2026-09-09, nothing references it |
| \`DGO_EndpointRegistry.Version0\` | empty, created 2026-09-09, nothing references it |
| \`DGO_EndpointRegistry.FlowUrl0\` | empty; \`EndpointRedacted\` is recreated properly by Step 2 |

**2.7.1 — Confirm they are still empty before deleting.** Paste
\`scripts/inspect-governance-strays.browser.js\`, then \`scripts/dump-governance-columns.browser.js\`.
The first reports how many rows are populated and whether any value carries a \`sig=\`; the second
lists every custom column, so a name neither script anticipated cannot hide. **A column that has
acquired data since is no longer a stray — stop and say so.**

**2.7.2 — Delete the three.** **No PowerShell, no PnP, no install.**

1. Open \`scripts/cleanup-disambiguated-columns.browser.js\`, select all, copy.
2. Console on the governance site → paste → **Enter**. Dry run; nothing changes.
3. Read the table. Then set \`DRY_RUN = false\` at the top and paste again.

It does not carry a list of three names — a fixed list would be right once and wrong at the next
collision. It finds them by their shape on the live list. A column is a candidate only when **all
four** hold:

| | Condition |
|---|---|
| 1 | it is custom — \`FromBaseType\` false, \`CanBeDeleted\` true |
| 2 | its internal name is \`<base><digits>\` |
| 3 | a **custom** column named \`<base>\` also exists on the same list |
| 4 | every row is empty in it |

Condition 3 is what keeps a legitimately-named column safe: \`Version0\` qualifies only because
\`Version\` is beside it. A column called \`Phase2\` on a list with no \`Phase\` is never a candidate.
Condition 4 is re-read at the moment of deletion, not trusted from an earlier run — **a column
that has acquired data since is reported \`KEPT — HOLDS DATA\` and left alone.**

**2.7.2a — If a rename still needs migrating.** Open and paste
\`scripts/remediate-governance-strays.browser.js\`; it handles the case where a column must be
renamed and its values carried across. It is not needed
for the 2026-09-09 cleanup — nothing being removed holds data — but it is the tool if that
changes. Per column, in this order, and the order is the safety:

| | Step | |
|---|---|---|
| 1 | **READ** | is the correct column there? does the old one hold anything? |
| 2 | **CREATE** | the correctly-named column, from the corrected specification |
| 3 | **COPY** | every value old → new. Never over a value already in new |
| 4 | **VERIFY** | read back; every populated row must match |
| 5 | **DELETE** | the old column — only if 4 passed for every row |

Create, copy and verify all complete before anything is removed, so a failure at any point leaves
the data exactly where it was.

**It refuses to delete** a column whose copy did not verify, and a column holding a value with a
\`sig=\` in it. It skips a column that is already correct, and one whose old name is a SharePoint
system field rather than a custom column — so it will never attempt to delete SharePoint's own
\`ScopeId\`.

**2.7.3 — If it reports \`REFUSED\`: a live credential is in a list column.** That is **GOV-03**
happening for real. **Deleting the column revokes nothing** — possession of the URL is the
authentication, and any copy taken from that list still works. Regenerate the trigger in Power
Automate first (the flow → the HTTP trigger → regenerate the URL), update
\`config.local.js\` from the new URL, and only then re-run the remediation.

**2.7.4 — If it reports \`NOT DELETED\`:** the copy did not verify and the old column is still
there, with its data. Nothing was lost. Read the mismatched item ids it names before re-running.

**2.7.5 — Re-run Step 2.** Once the strays are gone, paste the provisioner again. A third paste
should report everything \`present\`.

### 2.8 \`FlowUrl\` — GOV-03's actual remaining work

\`DGO_EndpointRegistry.FlowUrl\` is **empty on all six rows and carries no signature**, so there is
no live credential in a list column and **nothing to revoke**. GOV-03 is a design defect here, not
an incident.

Retiring it is a deliberate act, separate from the cleanup above:

1. Step 2 creates \`EndpointRedacted\` (and \`EndpointFingerprint\`, already correct in the tenant).
2. Confirm \`FlowUrl\` is still empty.
3. Delete \`FlowUrl\`.

**It will come back unless the flow is corrected too.** The deployed flow *Repair the DGO
governance lists* creates \`FlowUrl\` from its own SchemaXml — deleting the column without
correcting that flow means the next run of it restores the column. That correction belongs with
the other flow work in **Step 4**.

**If you do have PowerShell** and prefer it, the equivalent is \`Add-PnPFieldFromXml\` with the
SchemaXml from the specification, then \`Set-PnPListItem\` per row, then \`Remove-PnPField\` — in
that order, never the reverse. The console script is the supported path because it takes its
SchemaXml from the specification rather than from a copy-paste, which is the defect that created
these strays.

### Rollback

**Not everything this step does is additive**, and the rollback has to know the difference. Read
the verb the run reported against each row:

| What the run reported | What it did | Undo |
|---|---|---|
| \`CREATED\` | added a column that did not exist | remove it — it held no data |
| \`SEEDED\` | added a configuration row | delete the row |
| \`INDEXED\` | changed an **existing** column's settings | set \`Indexed\` back to false; the column itself pre-dates this run |
| \`ADOPTED\` | used a column the tenant already had | **nothing.** Never remove an adopted column — it pre-dates this run and may hold data |
| 2.7.2 | deleted three empty stray columns | not undoable; they were verified empty first |
| 2.8 | deleted \`FlowUrl\` | not undoable; it was verified empty first |

To remove a column **this run created** — never an adopted one, and never one you have not
confirmed empty:

\`\`\`powershell
Connect-PnPOnline -Url "${SITE}" -Interactive
Remove-PnPField -List "<list GUID from the table below>" -Identity "<InternalName>" -Force
\`\`\`

\`Remove-PnPField\` destroys the column and every value in it, breaks any view or query naming it,
and does not ask. Confirm the column is one this run created and is still empty — 2.7.1's two
read-only scripts do exactly that — before running it.

Seed rows can be restored from \`.\\governance-backup\\<list>.json\` captured in Step 1, but read
Step 1's note on restoring first: that file is the source values for a controlled restore, not an
import artefact.

---

## Step 3 — Retire the ${registry.retire.length} duplicate list instances

**Do this only after Step 2 reports \`present\` for everything.** These are the copies recorded
as **GOV-02**: ${finding('GOV-02').detail}

### 3.1 The instances to KEEP — never touch these

All on \`${SITE}\`.

| List GUID | Title | Server-relative URL |
|---|---|---|
${keepRows}

### 3.2 The instances to RETIRE

| List GUID | Title | Site | Superseded by |
|---|---|---|---|
${retireRows}

### 3.2a STOP — the delete phase is gated. Read this before running anything.

**The survey of 2026-09-09 found something that re-orders this runbook.** Thirteen of the
seventeen duplicates are empty. Four are not:

| Duplicate | Items | Last written |
|---|---|---|
| \`DGO_RoleCatalogue\` | 6 | 2026-08-31T01:58:48Z |
| \`DGO_AuditLog\` | 5 | 2026-08-31T01:58:49Z |
| \`DGO_UserDirectory\` | 1 | 2026-08-31T01:58:48Z |
| \`DGO_PilotCohorts\` | 1 | 2026-08-31T01:58:48Z |

All four within one second — that is **one run, not four accidents**. The list capture this
runbook reasons from is dated **2026-08-18**. Something wrote seed rows into the
**non-authoritative** site **thirteen days after the audit**, and the counts match the
specification's seed set exactly: 6 role seeds, 1 bootstrap user, 1 pilot cohort.

**A live producer is still pointed at the site these lists are being retired from.** Recorded as
**GOV-09**.

Why that gates the delete and nothing else:

- Deleting a list nothing writes to is housekeeping. Deleting a list something still writes to
  breaks that producer.
- The deployed provisioning flows **create lists by title** — that is the root cause **GOV-02**
  records. This repository's provisioner was changed to address by GUID; **the deployed flows
  were not.** Delete before correcting the producer and its next run recreates the duplicates,
  restoring exactly the estate the deletion was meant to end.

**So:**

| Phase | Status |
|---|---|
| \`survey\` | run it |
| \`export\` | run it |
| \`rename\` | **run it** — this is what makes the producer fail loudly while the fix is one \`restore\` away |
| \`delete\` | **blocked** until GOV-09 is resolved — that is Step 4 |

### 3.2b Confirm nothing unique would be lost — do this before any rename or delete

**Open \`scripts/compare-duplicate-governance-lists.browser.js\`, copy the whole file, and paste it
into the console on either site.** It **reads only**, and it asks both.

It answers the one question that decides whether the data is at risk: does any row exist **only**
in a duplicate? If one does, it is the sole copy.

| Verdict | Action |
|---|---|
| No row exists only in a duplicate | Continue to 3.3 |
| Any row exists only in a duplicate | **Stop.** Deleting would destroy the only copy. Report it |

It does **not** identify the producer — nothing readable from a list says what wrote to it. That
is GOV-09, and it is Step 4.

### 3.3 The browser path — no PowerShell required

Step 3 runs entirely from the console on the duplicate site. **Sign in to
\`${DUPLICATE_SITE}\` — the DUPLICATE site, not the
authoritative one — then open \`scripts/retire-duplicate-governance-lists.browser.js\`, copy the
whole file, and paste it there.**

It is **MODE-driven, not \`DRY_RUN\`-driven**, because one boolean is not enough protection when
the mistake is unrecoverable. Edit \`MODE\` at the top and paste again for each step:

| MODE | What it does | Reversible |
|---|---|---|
| \`survey\` | read-only: what exists, item counts, current state | — |
| \`export\` | downloads every item of every list as JSON | — |
| \`rename\` | Title → \`ZZ_RETIRED_<title>\` | yes, via \`restore\` |
| **wait** | **days, not minutes** | — |
| \`delete\` | removes the list — **only if already renamed** AND \`I_HAVE_THE_EXPORT = true\` | **NO** |
| \`restore\` | strips the prefix | — |

**\`delete\` cannot touch a list \`rename\` has not already renamed.** A rename you did not do is a
rename that did not happen, so the reversible step cannot be skipped — the irreversible action is
reachable only through it.

**Why wait between rename and delete.** The rename is what surfaces a consumer nobody documented:
a flow, a view, a Power BI query silently reading one of these. Give it long enough to break
loudly while the fix is still one \`restore\` away.

**Refusals built in.** It will not run at all if any target GUID appears in the keep set. It
stops immediately if pasted on the authoritative site. It never addresses a list by title — the
duplicates share their titles with the lists being kept, which is what makes them duplicates, so
a title-addressed retirement would eventually delete the estate.

These guards are executed against a fake tenant by \`tests/governance-retirement.test.mjs\`, not
asserted by pattern-matching the file — the acknowledgement check originally sat *after* the
delete loop, where a text search still found it and it printed "NOTHING WAS DELETED" having just
deleted everything.

### 3.4 If you do have PowerShell — the survey

For each GUID in 3.2, run:

\`\`\`powershell
Connect-PnPOnline -Url "${DUPLICATE_SITE}" -Interactive
$g = "<GUID from the table above>"
$l = Get-PnPList -Identity $g
"{0}: {1} item(s), last modified {2}" -f $l.Title, $l.ItemCount, $l.LastItemUserModifiedDate
\`\`\`

**Decision rule, applied per list.** \`ItemCount\` counts rows. It does not count consumers, and
the two are not the same question: a list with no items can still be read by a flow, bound by
GUID in a view, query or report, or be the list a producer writes to next.

- \`ItemCount\` is **0** → it is a candidate for \`rename\`. It is **not** cleared for \`delete\`.
- \`ItemCount\` is **greater than 0** → export it first
  (\`Get-PnPListItem -List $g -PageSize 2000 | Select -ExpandProperty FieldValues | ConvertTo-Json -Depth 10 | Out-File .\\duplicate-$($l.Title)-$g.json\`),
  then compare against the authoritative instance in 3.1. Rows present only in the duplicate are
  the sole copy of those rows.

**Neither answer clears the delete**, and 3.2a is why: GOV-09 established that something wrote
seed rows to four of these lists thirteen days after the audit this runbook reasons from. Until
that producer is found and repointed, an empty duplicate is an empty list that something may
still be addressing. \`ItemCount = 0\` says nothing was there when you looked.

### 3.5 If you do have PowerShell — rename, then delete

Renaming is reversible. Deleting is not, beyond the recycle bin's retention.

**What a rename does and does not surface.** \`Set-PnPList -Title\` changes the display title and
nothing else: the list keeps its GUID and its server-relative URL, and Power Automate's
SharePoint actions bind by GUID. A flow reading one of these will not notice, and neither will a
weekly or monthly job that does not happen to run in the window. What a rename surfaces is a
consumer that addresses the list **by title** — which is the class that created these duplicates
in the first place, so it is worth doing. Read the quiet period as evidence about title-bound
consumers, not as proof that nothing uses the list.

\`\`\`powershell
Connect-PnPOnline -Url "${DUPLICATE_SITE}" -Interactive
$retire = @(
${registry.retire.map((r) => `  "${r.listGuid}"   # ${r.listTitle}`).join('\n')}
)
foreach ($g in $retire) {
  $l = Get-PnPList -Identity $g
  if ($l.Title -like "ZZ_RETIRED_*") { Write-Host "$($l.Title) already retired"; continue }
  Set-PnPList -Identity $g -Title ("ZZ_RETIRED_" + $l.Title)
  Write-Host "renamed $($l.Title) -> ZZ_RETIRED_$($l.Title)"
}
\`\`\`

**Expected:** ${registry.retire.length} rename confirmations.

**Then wait 14 days** — and re-read 3.2a before going further. **The delete is gated on GOV-09,
not on the quiet period.** A silent fortnight tells you no title-bound consumer broke; it does
not tell you the producer that wrote to four of these lists on 2026-08-31 has been repointed. If
it has not, the deployed provisioning flows create lists **by title** and the next run restores
exactly the estate this deletion was meant to end.

Once GOV-09 is resolved and the quiet period has passed:

\`\`\`powershell
foreach ($g in $retire) { Remove-PnPList -Identity $g -Force }
\`\`\`

### Rollback

Within 14 days, rename back:

\`\`\`powershell
foreach ($g in $retire) {
  $l = Get-PnPList -Identity $g
  if ($l.Title -like "ZZ_RETIRED_*") { Set-PnPList -Identity $g -Title ($l.Title -replace "^ZZ_RETIRED_","") }
}
\`\`\`

After deletion, restore from the site recycle bin (93 days by default):
\`Get-PnPRecycleBinItem | Where-Object { $_.Title -like "ZZ_RETIRED_*" } | Restore-PnPRecycleBinItem\`.

---

## Step 4 — Apply the flow corrections

**Do this before Step 5, and stop at the import.** Provisioning the registry lists while flow 05
can cascade unguarded is the one ordering mistake with an irreversible outcome, so the corrected
definitions go in first. The path tests are **Step 5.4**, not part of this step: every one of
them writes to a registry list that does not exist yet.

| Flow | \`FlowId\` | Corrects | Changes | Registry lists it reads or writes |
|---|---|---|---|---|
${correctionRows}

The GUID column is a **\`FlowId\`**: the 36-character Power Automate flow GUID, dashed. It is not
a \`WorkflowId\`, which is 32 hex characters with no dashes and is what the tenant register keys
on. Step 6 exists precisely because those two identifier spaces have never been recorded
together, so nothing in this runbook may use one word for both.

The last column is read from the corrected definitions themselves, and it is what Step 5
provisions. Between them the four flows touch ${REQUIRED_LISTS.length} of the ${SPEC_LISTS.length} registry lists.

### 4.1 Export the current definition — the rollback

For each of the four flows:

1. https://make.powerautomate.com → environment \`${ENV_ID}\`.
2. **My flows** → find the flow by name → **⋯** → **Export** → **Package (.zip)**.
3. Save as \`<flow name>-BEFORE-<yyyyMMdd>.zip\`. **This is the only rollback.** Do not skip it.

### 4.2 Apply the corrected definition

The corrected definitions are in \`docs/deployment/governance/flows/\`, one file per flow, each
carrying a complete \`definition\` object.

Power Automate's **Peek code** is read-only, so the definition cannot be pasted back through it.
Use the package route:

1. Unzip the \`-BEFORE-\` package from 4.1.
2. Open \`Microsoft.Flow/flows/<guid>/definition.json\`.
3. Replace its \`properties.definition\` object with the \`definition\` object from the matching
   \`*.corrected.json\`.
4. Re-zip the package with the same internal structure.
5. Power Automate → **Import** → upload the edited package → **Update** the existing flow (not
   *Create as new*).

### 4.3 Do not test yet

The path tests belong to **Step 5.4**. Every one of them writes to a registry list, and the
blocked path needs \`DGO_HTTPFlowConsumerRegistry\` — none of which exist until Step 5. Run them
now and PATH 3 answers 200 instead of 409, which is the guard failing open and reporting nothing.

What you can confirm here, without any list:

\`\`\`bash
# Invalid input must answer 400, not a silent acknowledgement. This path returns before any
# list is touched, so it is the one test that is meaningful before Step 5.
curl -sS -o /dev/null -w '%{http_code}\\n' -X POST '<flow 02 trigger URL>' \\
  -H 'Content-Type: application/json' -d '{}'
# Expected: 400
\`\`\`

**The URL contains a \`sig=\` credential: paste it into a terminal, never into a ticket, chat
message or document.** Possession of that URL is the authentication — see 2.7.3.

### Rollback

Power Automate → the flow → **⋯** → **Import** the \`-BEFORE-\` package from 4.1, choosing
**Update** on the existing flow. The previous definition is restored exactly.

---

## Step 5 — Provision the registry lists the corrected flows need, then validate

### 5.1 What is provisioned, and why that set

**${PROVISION_NOW.length === SPEC_LISTS.length ? `All ${SPEC_LISTS.length} of them` : `${PROVISION_NOW.length} of the ${SPEC_LISTS.length}`}**, and the set is not a judgement call: it is every list the four
corrected definitions read or write, plus the configuration list they take their control
parameters from. The membership is derived from the definitions at build time.

| # | List | Fields | Unique key | Why now |
|---|---|---|---|---|
${provisionRows}

**Deferred:**

${deferredTable}

### 5.2 Why the earlier deferral could not stand

A previous version of this runbook provisioned lists 1, 2 and 6 and deferred 3, 4, 5 and 7 as
"an observability layer with nothing yet to observe", then told the operator to exercise all four
corrected flows. Those two instructions cannot both be followed. Flow 03 writes to the execution
ledger; flow 07 writes to the consumer registry; flow 05 reads the consumer registry, the
dependency list and the exceptions list; and flow 02 — which the deferral explicitly permitted
running — writes to the dependency list. The deferral was of the lists the step's own tests
require.

The note that accompanied it went further:

> With lists 4 and 7 deferred, both counts return zero and every retirement takes the safe path.
> That is correct — there are no dependants to protect

**That is the guard failing open.** A missing consumer registry is not a consumer registry
holding no rows. The first is *unknown*; the second is *known to be zero*. A retirement guard
that reads the first as the second will authorise exactly the cascade it exists to prevent, and
will report a clean 200 while doing it.

### 5.3 Fail closed, whatever is provisioned

Whatever the deferral set becomes later, flow 05 must treat an unreadable dependency source as a
blocker, not as a zero:

| Condition | Required outcome |
|---|---|
| Dependency or consumer list missing | retirement **blocked** |
| Query returns an error | retirement **blocked** |
| Query returns zero rows from a list that exists | retirement **permitted** |
| Any of the above with \`force: true\` | permitted, and recorded as forced |

Only the third row is a safe zero. Until flow 05 distinguishes them, do not defer either list.

### 5.3a Provision them

**Open \`scripts/provision-flow-registry-lists.browser.js\`, copy the whole file, and paste it into
the console on the authoritative site.** It is dry-run by default.

1. Paste as-is. Every list and column should read \`WOULD CREATE\`.
2. Set \`DRY_RUN = false\` at the top and paste again.
3. **Paste a third time, unmodified.** Every row should read \`present\`, \`0 created\`. This third
   run is the pass condition — an apply that reports work on a second pass did not do what it
   claimed.

Record every list GUID it prints; \`docs/reference/governance-list-registry.json\` needs them, and
until it has them the repository still describes these lists as unprovisioned.

### 5.4 Validate every path

Now that the lists exist, test each corrected flow with its trigger URL. **The URL contains a
\`sig=\` credential: paste it into a terminal, never into a ticket, chat message or document.**

**Flow 02 — registration.**

\`\`\`bash
# Invalid input answers 400.
curl -sS -o /dev/null -w '%{http_code}\\n' -X POST '<flow 02 trigger URL>' \\
  -H 'Content-Type: application/json' -d '{}'
# Expected: 400

# A valid registration answers 200 with outcome "succeeded".
curl -sS -X POST '<flow 02 trigger URL>' -H 'Content-Type: application/json' \\
  -d '{"flowId":"${PATH_TEST_FLOW_ID}","flowName":"__PATH_TEST__","environmentId":"${ENV_ID}"}'
# Expected: 200, body "outcome":"succeeded"
\`\`\`

**Flow 03 — the execution ledger.** It writes \`DGO_HTTPFlowExecutionLedger\` and updates the
health of the registry row named in the request, so register \`__PATH_TEST__\` above first.

\`\`\`bash
# Invalid input answers 400.
curl -sS -o /dev/null -w '%{http_code}\\n' -X POST '<flow 03 trigger URL>' \\
  -H 'Content-Type: application/json' -d '{}'
# Expected: 400

# A valid execution record answers 200 with outcome "succeeded".
curl -sS -X POST '<flow 03 trigger URL>' -H 'Content-Type: application/json' \\
  -d '{"environmentId":"${ENV_ID}","flowId":"${PATH_TEST_FLOW_ID}","runId":"__PATH_TEST_RUN__","startedUtc":"2026-01-01T00:00:00Z","completedUtc":"2026-01-01T00:00:01Z","outcome":"Succeeded"}'
# Expected: 200, body "outcome":"succeeded", and one new row in DGO_HTTPFlowExecutionLedger
\`\`\`

**Flow 07 — consumer self-registration.** Read its trigger schema, then read what it consumes;
the two have nothing in common. Flows 02, 03 and 05 each declare a \`required\` array naming
exactly the fields they read. Flow 07 declares \`action\`, \`operation\` and \`source\`, requires
nothing, sets \`additionalProperties: true\` — and its definition reads none of those three. What
it reads is \`registryKey\`, \`consumerName\`, \`ownerEmail\` and a consumer identifier, and its 400
names all four:

> registryKey, consumerName, ownerEmail, and a consumer identifier are required; values must be
> 255 characters or fewer; the consumer identifier must not contain a pipe; ownerEmail must
> contain @.

A payload written from that schema returns 400 and reads like a fault in the flow. It is not —
it is the schema describing a contract the definition does not implement. **The schema is left
as it stands deliberately:** adding a \`required\` array would have Power Automate reject the
request before the flow runs, returning its own 400 body instead of the \`outcome\` contract
GOV-04 exists to establish. Build payloads for this flow from what it reads, not from what it
declares.

\`\`\`bash
# Invalid input answers 400 — and the message names the fields it wanted.
curl -sS -X POST '<flow 07 trigger URL>' -H 'Content-Type: application/json' \\
  -d '{"action":"register","operation":"consumer","source":"__PATH_TEST__"}'
# Expected: 400, "outcome":"invalid-input"

# A registryKey with no registry row answers 404.
curl -sS -o /dev/null -w '%{http_code}\\n' -X POST '<flow 07 trigger URL>' \\
  -H 'Content-Type: application/json' \\
  -d '{"registryKey":"${registryKeyFor(ABSENT_FLOW_ID)}","consumerName":"__NO_SUCH__","consumerIdentifier":"__NO_SUCH__","ownerEmail":"<your address>"}'
# Expected: 404, "outcome":"not-found"
\`\`\`

**Flow 05 — all four paths. Run them in this order.**

\`\`\`bash
URL='<flow 05 trigger URL>'

# PATH 1 — invalid input. Expect 400, outcome "invalid-input".
curl -sS -w '\\n%{http_code}\\n' -X POST "$URL" -H 'Content-Type: application/json' -d '{}'

# PATH 2 — registry row does not exist. Expect 404, outcome "not-found".
curl -sS -w '\\n%{http_code}\\n' -X POST "$URL" -H 'Content-Type: application/json' \\
  -d '{"environmentId":"${ENV_ID}","flowId":"${ABSENT_FLOW_ID}","retirementReason":"path test — no such flow"}'

# PATH 3 — BLOCKED. Register a flow, give it one ACTIVE CONSUMER, then try to retire it.
#          Expect 409, outcome "blocked", activeConsumers >= 1 in the body.
#
#          The join is RegistryKey, and RegistryKey is <environmentId>|<flowId>. Flow 05
#          composes it from the retirement request; flow 07 must be given the identical string
#          or it writes a consumer row the guard cannot see, the count comes back zero and the
#          retirement succeeds with a 200 that looks like a pass.
curl -sS -X POST '<flow 02 trigger URL>' -H 'Content-Type: application/json' \\
  -d '{"flowId":"${BLOCK_TEST_FLOW_ID}","flowName":"__BLOCK_TEST__","environmentId":"${ENV_ID}"}'

curl -sS -X POST '<flow 07 trigger URL>' -H 'Content-Type: application/json' \\
  -d '{"registryKey":"${BLOCK_TEST_KEY}","consumerName":"__BLOCK_TEST_CONSUMER__","consumerIdentifier":"__BLOCK_TEST_CONSUMER__","consumerType":"PowerAutomate","ownerEmail":"<your address>"}'
# Expected: 200, "outcome":"succeeded". If this answers 400 or 404, STOP — no consumer row was
# created, so the retirement below will answer 200 and the guard will look broken when it was
# the payload.

curl -sS -w '\\n%{http_code}\\n' -X POST "$URL" -H 'Content-Type: application/json' \\
  -d '{"environmentId":"${ENV_ID}","flowId":"${BLOCK_TEST_FLOW_ID}","retirementReason":"path test — must be blocked"}'
# Expected: 409, "outcome":"blocked", "activeConsumers":1

# PATH 4 — FORCED. The same request with force. Expect 200, outcome "succeeded".
curl -sS -w '\\n%{http_code}\\n' -X POST "$URL" -H 'Content-Type: application/json' \\
  -d '{"environmentId":"${ENV_ID}","flowId":"${BLOCK_TEST_FLOW_ID}","retirementReason":"path test — forced","force":true}'
\`\`\`

**A 200 on PATH 3 is not a smaller failure than a 500.** It is the guard reporting that a flow
with a live consumer is safe to retire, and PATH 4 would then be indistinguishable from it. If
PATH 3 answers 200, check the consumer row before anything else: open
\`DGO_HTTPFlowConsumerRegistry\` and confirm a row exists with
\`RegistryKey = ${BLOCK_TEST_KEY}\` and \`LifecycleStatus\` not \`Retired\`.

**Then confirm the forced retirement was recorded**, which is the point of the guard. Open
\`DGO_HTTPFlowRegistry\`, find \`__BLOCK_TEST__\`, and check its run history shows
\`Record_Forced_Retirement\` with \`forced: true\` and \`activeConsumersAtRetirement: 1\`. A forced
cascade that is indistinguishable from a safe one is the audit failure this guard exists to
prevent.

### 5.5 Clean up the test rows

The tests write to more than one list, and how many rows depends on what flow 02 created for each
registration. Remove them by key rather than by name — the two registry keys are:

- \`${registryKeyFor(PATH_TEST_FLOW_ID)}\` — the \`__PATH_TEST__\` flow
- \`${BLOCK_TEST_KEY}\` — the \`__BLOCK_TEST__\` flow

Then, per list:

- **\`DGO_HTTPFlowRegistry\`** — filter \`RegistryKey\` on either key. Expect **2 rows**.
- **\`DGO_HTTPFlowConsumerRegistry\`** — filter \`RegistryKey\` on the \`__BLOCK_TEST__\` key.
  Expect **1 row**, \`__BLOCK_TEST_CONSUMER__\`.
- **\`DGO_HTTPFlowExecutionLedger\`** — filter \`FlowId\` on \`${PATH_TEST_FLOW_ID}\`. Expect
  **1 row**, from the flow 03 test.
- **\`DGO_HTTPFlowContractVersions\`** — filter \`RegistryKey\` on either key. Expect **0 or more**:
  flow 02 writes a contract row only when the payload carries a contract, and these payloads do
  not.
- **\`DGO_HTTPFlowDependencies\`** — filter \`RegistryKey\` on either key. Expect **0**: these
  payloads declare no dependency.

Re-run every filter after deleting and confirm each returns nothing. **Do this before real
traffic arrives** — a synthetic flow left in the registry is a flow the audit will report on, and
\`__BLOCK_TEST__\` is a flow the registry believes was force-retired over a live consumer.

---

## Step 6 — Adopt \`WorkflowId\` as the permanent join

This closes **GOV-06**: ${finding('GOV-06').detail}

### 6.0 Three identifiers, and which one is the join

| Name | Shape | Whose id it is | Role |
|---|---|---|---|
| \`FlowId\` | 36 characters, dashed GUID | Power Automate | Identifies the flow. Read from the flow URL or the exported package's folder name. |
| \`WorkflowId\` | 32 hex characters, no dashes | Logic Apps | **The join.** What the tenant register keys on. Read from the trigger URL, between \`/workflows/\` and \`/triggers/\`. |
| \`RegistryKey\` | the environment id, a pipe, the flow id | This registry | The row key inside \`DGO_HTTPFlowRegistry\`. Computed by flow 02 — never supplied. Local to this estate; it joins nothing outside it. |

\`RegistryKey\` is written \`${registryKeyFor('<flowId>')}\` — the environment id, a pipe
character, then the flow id, with no spaces.

An earlier heading here read *Adopt \`FlowId\` + \`RegistryKey\` as the permanent join*, which names
the two identifiers that cannot do the job: \`FlowId\` is the space the register does not use, and
\`RegistryKey\` is derived from it. The join is \`WorkflowId\`, recorded beside \`FlowId\` on the same
row.

### 6.1 Current state, from \`docs/reference/flow-definition-map.json\`

| Measure | Value |
|---|---|
| Exported definitions | ${map.totals.exportedDefinitions} |
| — of those, carrying an HTTP trigger | ${map.totals.exportsWithHttpTrigger} |
| Register workflows | ${map.totals.registerWorkflows} |
| Exported definitions matched by display name | ${map.totals.matchedByName} |
| Register rows those matches cover | ${matchedRegisterRows} |
| — because this many names are reused across register rows | ${map.totals.ambiguousMatches} |
| Exported, not in the register | ${map.totals.unmatchedExports} |
| In the register, not exported | ${map.totals.unexportedRegisterWorkflows} |
| **Shared identifiers** | **${map.limits.idOverlap}** |

**Both sides reconcile, and the middle row is why.** ${map.totals.exportedDefinitions} − ${map.totals.matchedByName} = ${map.totals.unmatchedExports} on the export side.
On the register side it is ${map.totals.registerWorkflows} − ${matchedRegisterRows} = ${map.totals.unexportedRegisterWorkflows}, not ${map.totals.registerWorkflows} − ${map.totals.matchedByName}: ${map.totals.matchedByName} exported names match
${matchedRegisterRows} register rows because ${map.totals.ambiguousMatches === 1 ? 'one name is' : `${map.totals.ambiguousMatches} names are`} reused. A table that shows only "matched: ${map.totals.matchedByName}" cannot be
made to add up, and the previous version of this table could not.

### 6.2 What blocks Step 6 today

${gov06Blockers}

Until 1 and 2 are resolved there is nothing to register: the column the join lives in is not in
the specification, and the flow that writes registry rows has no field to put it in. **Neither is
a tenant action** — both are repository changes, and they belong before the next tenant window,
not inside it.

### 6.3 Then, in this order

1. Add \`WorkflowId\` to the registry specification, indexed, and re-run Step 5's provisioning so
   the column exists on the list.
2. Extend flow 02 to accept \`workflowId\`, validate its shape — 32 hex characters, no dashes —
   and write it to the row. Re-apply it through Step 4.
3. Register the exported definitions through flow 02, supplying \`flowId\` and \`workflowId\`
   together. The ${map.totals.exportedDefinitions - map.totals.exportsWithHttpTrigger} definitions with no HTTP trigger have no trigger URL to read a workflow id
   from; take theirs from the package metadata or record them as unjoinable, with the reason.
4. Export \`DGO_HTTPFlowRegistry\` to JSON and commit it to
   \`docs/reference/http-flow-registry-export.json\`.
5. Extend \`scripts/reconcile-flow-definitions.mjs\` to join on \`WorkflowId\` when that export is
   present, falling back to the name join only for rows it does not cover.

### 6.4 What closes GOV-06

**Define the measure before reporting against it.** \`idOverlap\` counts exported definitions that
carry an identifier the tenant register also holds. It is bounded above by ${ID_OVERLAP_CEILING} — the smaller
of the ${map.totals.registerWorkflows}-row register and the ${map.totals.exportsWithHttpTrigger} exports that can supply an id — so **${map.totals.exportedDefinitions} is not a target it can
reach**, and closing GOV-06 on it would record a resolution that has not happened.

GOV-06's finding is that the two corpora cannot be joined. What answers it is not a single
number but three, reported together:

| Measure | Closes at |
|---|---|
| Exported definitions carrying a \`WorkflowId\` | ${map.totals.exportsWithHttpTrigger} by trigger URL; the remaining ${map.totals.exportedDefinitions - map.totals.exportsWithHttpTrigger} from package metadata or recorded as unjoinable |
| \`idOverlap\` — exports whose id the register knows | every register row that has a definition; ${map.totals.unexportedRegisterWorkflows} register rows have none and that is the finding, not a failure of the join |
| Register rows still unaccounted for | ${map.totals.unexportedRegisterWorkflows} → 0, or each one explained |

The third is the one GOV-06 actually asked about: ${map.totals.unexportedRegisterWorkflows} workflows are in the register with no
definition held for them. An identifier join does not produce those definitions. Close GOV-06 in
\`docs/reference/governance-estate-position.json\` when all three are answered — and
\`tests/governance-estate.test.mjs\` will fail until the record matches the measurement, in either
direction.

### Doing this without disrupting active flows

Nothing in Step 6 changes what a running flow does. Registration is a write to a SharePoint list
by a flow the running estate does not call; \`WorkflowId\` is an additive column; and extending
flow 02's trigger schema with an optional field leaves every existing caller valid. The
name-based map stays in place and keeps working until the identifier join covers everything —
that is why 6.3 says *falling back*, not *replacing*.

---

## Step 7 — Measure the out-of-band flow-truth provisioning (GOV-11)

**Blocks nothing. Changes nothing. Read-only throughout.** It is the only measurement of tenant
state this estate did not author, and until it is taken the repository cannot say what is on
either site.

### 7.1 The fact to explain

Two browser scripts were reported executed on **2026-09-10**, creating two lists and a document
library — \`NITDA Flow Truth Registry\`, \`NITDA Flow Truth History\`, \`NITDA Flow Truth
Artefacts\` — with 90 columns between them. They are held verbatim at
\`docs/reference/out-of-band/\`. None of the three is in any specification this estate holds, and
none is in the 2026-08-18 capture.

Three properties make the outcome unpredictable from reading them:

- **Neither pins a site.** Both take whichever site the console was open on, and neither records
  which. Both candidates must be asked.
- **Both call \`createfieldasxml\` with \`Options: 0\`.** Without bit 8, \`AddFieldInternalNameHint\`,
  SharePoint may derive each internal name from the display name — so \`RegistryKey\` may be on the
  tenant as \`Registry_x0020_Key\`: correct in every view, invisible to every flow. See 2.6 for
  what that costs.
- **The idempotence guard depends on the bit that is missing.** If it is absent, every re-run
  re-created every column and SharePoint disambiguated by appending a digit.

### 7.2 Procedure

1. Open \`scripts/verify-flow-truth-provisioning.browser.js\`, copy the whole file.
2. Console on **either** site — it asks about both regardless. Paste. **It reads only.**
3. Copy the single relay line and report it verbatim.

| Verdict | Meaning | Action |
|---|---|---|
| \`absent\` on every resource, both sites | The provisioning reached neither candidate site | Record it. Nothing further |
| \`PRESENT\` | It exists — site, GUID, template, item count | Record. **Do not delete it** |
| \`asked-name\` | The column carries the internal name the script asked for | Record |
| \`DERIVED NAME\` | The column is there under a different internal name | Record the name found |
| \`DUPLICATED\` | More than one column answers to the same base name | Record. The script ran more than once |
| \`REQUIRED CLEARED\` | Created \`Required\`, not \`Required\` now | Record |
| \`UNIQUENESS NOT ENFORCED\` | The key column does not enforce uniqueness | Record |

**Do NOT re-run either out-of-band script.** A re-run is the duplication case, not a repair.

**Do NOT delete, rename or repair anything this reports.** Whether these three resources are
adopted into \`http-flow-registry-spec.json\` or retired in favour of the specified registry lists
is an agency decision. Report and stop.

---

## Completion checklist

Two of these rows used to contradict each other: Step 4 closed when flow 05 answered 409, and
Step 5 closed when the list that makes a 409 possible was absent by decision. They are one step
apart now, and the 409 is on the side that provisions the list.

| # | Step | Done when |
|---|---|---|
| 1 | Back up | ${registry.lists.length} list files and a manifest downloaded; each file's item count matches the list's, and empty lists produced a file too |
| 2 | Provision governance lists | Third paste reports every row \`present\`, \`0 failed\`, and 2.6's read-back reports every row \`${VERDICTS.ok}\` and ends on \`${PASS_LINE}\` |
| 3 | Retire duplicates | ${registry.retire.length} lists renamed \`ZZ_RETIRED_*\`. **Not deleted** — the delete is gated on GOV-09, not on the quiet period |
| 4 | Apply flow corrections | All four import cleanly, and \`{}\` to flow 02 answers 400. No other path test belongs here |
| 5 | Provision registry lists ${PROVISION_NOW.map(listNumber).join(', ')} and validate | Flow 05 answers 400 / 404 / 409 / 200 on its four paths, PATH 3's 409 carries \`activeConsumers\` of 1, flow 03 writes a ledger row, and every filter in 5.5 comes back empty |
| 6 | Adopt the identifier join | ${GOV06_BLOCKERS.length ? `**Blocked.** ${GOV06_BLOCKERS.length} blockers in 6.2 are open — none of them a tenant action. Nothing in Step 6 can be executed until they are closed` : '\\`WorkflowId\\` populated for every registered flow, and the three measures in 6.4 answered'} |
| 7 | Measure the out-of-band provisioning (GOV-11) | \`verify-flow-truth-provisioning.browser.js\` reports whether the three resources exist, on which site, and under which internal names. **Read-only — blocks nothing, changes nothing.** It was in the procedure and in neither checklist, which is how the one finding whose tenant state is UNMEASURED stayed that way |

After Steps 2 and 3, re-capture the tenant list index and run \`npm run test:governanceestate\`.
It will fail — GOV-01 and GOV-02 will be repaired while the record still says they are open —
and the failure message names exactly what to close.
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

console.log('\nGovernance execution runbook\n');
console.log(`  steps            6`);
console.log(`  lists to keep    ${registry.lists.length}`);
console.log(`  lists to retire  ${registry.retire.length}`);
console.log(`  flow corrections ${corrections.length}\n`);

if (CHECK) {
  if (previous !== md) {
    console.error(`\n  ✖  ${path.relative(ROOT, OUT)} has drifted. Run: npm run governance:runbook\n`);
    process.exit(2);
  }
  console.log(`  ✅ ${path.relative(ROOT, OUT)} is current\n`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)}\n`);
