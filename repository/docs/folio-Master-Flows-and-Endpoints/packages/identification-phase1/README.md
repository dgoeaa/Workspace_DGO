# P1-1: read-only SharePoint list check

Phase 1 of [IDENTIFICATION_SYSTEM.md](../../../reference/identification/IDENTIFICATION_SYSTEM.md) starts with a check
that changes nothing. This flow reads every governed dataset in the identifier catalogue (27 lists on 4 sites)
and e-mails the person who runs it a report covering:

| Per list | Why it matters for Phase 1 |
|---|---|
| Found under its catalogued title, and whether its GUID matches the catalogue | Flows and the new columns go on the right list |
| Item count, and whether it is over 5,000 | Adding an index to a large list needs care |
| Indexed columns, and free index slots (20 per list) | Phase 1 adds up to 7 indexes per list |
| Required columns (visible, editable) | Legacy flows must keep working, and VOID rows must fill these (Q2) |
| Unique columns | Unique is switched on only in Phase 6 |
| Identity columns already present | So nothing is added twice |
| Versioning | *Get changes for an item* and Rev depend on it |

It sends only GET requests. It writes nothing, not even telemetry. The report comes as HTML tables, with the full
result attached as `p1-1-list-check.json`.

Lists still to be created (DGO_RecordLinks, DGO_IdentityMap, DGO_Briefs and the rest) show as
**not found: new list, not created yet**. That is expected.

**Not covered:** how a unique column treats blank rows. That cannot be seen without writing. It matters only in
Phase 6, because Phase 1 adds every column as non-unique.

## Create and run

1. Power Automate → *Create* → **Instant cloud flow**. Name it `ID_Phase1_List_Check`, choose the trigger
   **Manually trigger a flow**, then *Create*. Add no inputs.
2. Under the trigger, add a SharePoint **Send an HTTP request to SharePoint** step and an Office 365 Outlook
   **Send an email (V2)** step. Leave both empty. They only make the two connections exist, and you delete them in step 4.
3. Click **+** under the trigger → **Paste an action** → paste `Scope_Phase1_ListCheck_Flow.paste.json`.
4. Delete the two empty steps from step 2, then **Save**. The Flow checker should show 0 errors.
5. **Test** → *Manually* → **Run flow**. The account running it needs read access to all four sites:
   NEDMS, Global_Digital_Documents_Centre, NITDADGO-EAAACTIVITYTRACKING and DGO_ECM_GOVERNANCE.
6. Open the e-mail *P1-1 SharePoint list check: N of 27 lists found* and send back the attached
   `p1-1-list-check.json`. P1-2 (adding the columns) is planned from it.

If a site refuses access, its `Get_Lists_…` step fails and the run shows *Failed*. The report is still sent, and its
**Sites** table names the site and the SharePoint error.

## Steps (19)

`Compose_Check_Context` → `Compose_Check_Targets` (the 27 catalogue datasets) → for each site
`Get_Lists_<site>` (GET `_api/web/lists?$select=…&$expand=Fields&$filter=Title eq …`) and
`Select_Rows_<site>` → `Compose_Site_Status` → `Compose_All_Rows` → `Select_Target_Status` → three
**Create HTML table** steps → `Compose_Check_Report` → `Compose_Check_Html` → `Send_Check_Report`.

## P1-1 result (run 3 October 2026, 01:20 UTC)

Evidence: [`evidence/p1-1-list-check-2026-10-03.json`](evidence/p1-1-list-check-2026-10-03.json).

- **All 4 sites answered. All 19 existing lists were found, and every catalogued list ID matches.** The 8 lists still
  to be created were not found, as expected: DGO_RecordLinks, DGO_IdentityMap, DGO_Briefs, DGO_Meetings, DGO_Projects,
  DGO_Approvals, DGO_RegistryFiles and DGO_FileMovements.
- **The catalogue had no list ID for two lists.** These are their IDs: DGO_HTTPFlowRegistry
  `d9a6eef7-cb58-497b-a478-9f526d4a9d8b`, DGO_HTTPFlowDependencies `f2cd5180-f1a0-4433-be2d-bc8ddfa0291c`.
- **Over 5,000 items:** DGO DIGITAL OPS (22,108) and Global Tracking Queue (16,071).
- **Global Tracking Queue has 20 of 20 indexes in use**, so P1-2 adds its columns without indexes. Live flows filter
  on only 4 of its indexed columns: RefIDD, DueDate, `Acknowledgement Due` and Modified. The repo's client code
  filters on none of the others. The indexes on NVERSE, RefIDDN, Reference_ID, GDSUROUT, Followuptrigger, GTQGrouping
  and `3rdAssigned` are the candidates to free. Before removing any, check that no list view or Power Apps screen
  filters on them (decision Q4).
- **DEV_OPS_Global_Tracking_Queue has 3 free index slots.** P1-2 indexes EntityKey, IdState and TaskRef there.
- **Portal Sequence Counters enforces unique values on `Year`.** A second counter row for 2026, the TASK row of
  P1-5, would be refused. Turn off *Enforce unique values* on Year before P1-5.
- **Portal Registry requires Title, ReferenceId, SenderEmail and Status**, and ReferenceId is unique. A VOID row
  must fill all four (decision Q2).
- **`FileRef` is a SharePoint system column** (the item's URL); it shows as "present" on every list. The catalogue's
  REG reference column cannot have that internal name, so DGO_RegistryFiles needs another name, such as
  `RegistryFileRef` (decision Q5, before that list is created).

## P1-2: add the identity columns

`Scope_Phase1_Columns_Flow.paste.json` adds **94 columns and 55 indexes on 14 lists**, planned from the P1-1
result and the catalogue's column rules:

- Every column is **optional and non-unique**. IdState is a choice column (ACTIVE, ARCHIVED, MERGED, VOID) whose
  default, ACTIVE, applies only to new items.
- It adds an index only where P1-1 found a free slot, so none on Global Tracking Queue. It also indexes the existing
  `SubmittedAtUtc` on Portal Registry for the duplicate check.
- Each column is looked up first and created only if absent, so running it again is safe.
- It changes no existing column, item or view.

| List | Columns (* = indexed) |
|---|---|
| Portal Registry | EntityKey*, IdState*, CreatedByRequest, Rev, SupersededBy, CorrelationId*, AttachmentHashSet, SubmittedAtUtc* (existing) |
| Portal Attachments | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef*, Rev |
| NITDA_Central_Registry | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef* |
| Portal Status Timeline | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef*, CorrelationId* |
| Portal Support Cases | EntityKey*, IdState*, CreatedByRequest, CaseRef*, Rev, SupersededBy, CorrelationId* |
| Portal Flow Telemetry | CorrelationId*, CreatedByRequest, ClientCorrelationId |
| Global Tracking Queue | EntityKey, IdState, CreatedByRequest, TaskRef, ParentKey, RootKey, RootRef, Rev, SupersededBy, CorrelationId (indexes wait for Q4) |
| DEV_OPS_Global_Tracking_Queue | EntityKey*, IdState*, CreatedByRequest, TaskRef*, ParentKey, RootKey, RootRef, SupersededBy, CorrelationId |
| DGO DIGITAL OPS | EntityKey*, IdState*, CreatedByRequest, ReferenceId*, SupersededBy, CorrelationId* |
| Task_Comments | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef*, Rev |
| AI TEXT DATA LOG | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef*, CorrelationId* |
| DGO_AuditLog | EntityKey*, IdState*, CreatedByRequest, ParentKey*, RootKey*, RootRef*, CorrelationId* |
| DGO_UserDirectory | EntityKey*, IdState*, CreatedByRequest, Rev |
| DGO_DepartmentDirectory | EntityKey*, IdState*, CreatedByRequest, UnitKey*, ParentKey*, Rev, SupersededBy |

**Create and run:**
1. Create an **Instant cloud flow** named `ID_Phase1_Add_Columns`, with the trigger **Manually trigger a flow**.
2. Add an empty **Send an HTTP request to SharePoint** step and an empty Office 365 Outlook **Send an email (V2)** step, paste `Scope_Phase1_Columns_Flow.paste.json` under the
   trigger, delete the empty steps, and **Save**.
3. Run it with an account that has **Manage Lists** (or Owner) on all four sites. It processes the 95 planned
   entries one at a time, which takes about 5–10 minutes.
4. Run **ID_Phase1_List_Check** again and send back the new `p1-1-list-check.json`. Its *identityColumnsPresent*
   and *indexedColumns* show what was added.

**Revision, 3 October (03:20).** The first run stopped at `Create_Field` with 400 BadRequest on the first column.
`createfieldasxml` needs the verbose body (`__metadata` type `SP.XmlSchemaFieldCreationInformation`), and the index
step now sends `SP.Field` the same way. The run-report e-mail added in the tenant (complete run record, branded table)
is kept, but now goes through Office 365 Outlook with the run record attached as JSON. SharePoint's
`SP.Utilities.Utility.SendEmail` had returned 400. Nothing was created by the failed run, so re-running is safe.

**Revision, 3 October (03:50).** Run `08584106116380843146636461148CU01` reported *Succeeded*, but all 94 creates
returned 400 *Not well formatted JSON stream* and created nothing. The body was written as a JSON object, and the
SharePoint HTTP step does not send that as valid JSON. Both bodies are now text, built the way the live Submission
counter claim builds its MERGE body. `SubmittedAtUtc` was found already indexed and correctly left alone.

**Revision, 3 October (04:30).** Run `08584106088704524462529689346CU18`: the JSON now parsed, but all 94 creates
returned 400 *Value cannot be null. Parameter name: parameters*, because SharePoint did not bind the verbose,
type-annotated body. Create and index now use the pattern the live Submission counter claim already runs:
`odata=nometadata` headers, a text body and no `__metadata`. Create sends `{"parameters":{"SchemaXml":…,"Options":8}}`;
index sends `{"Indexed":true}`.

**Revision, 3 October (05:00): aligned to the tenant-proven calls.** The deployed flow
*01 - GOV - Provision HTTP Flow Registry* created every DGO_HTTPFlowRegistry and DGO_HTTPFlowDependencies column that
P1-1 found, with their required, indexed and unique settings, through this same connector. P1-2 now uses that flow's
calls exactly. `Create_Field` has the same headers and the same `setProperty(json(…))` body with Options 12, and
`Set_Field_Indexed` uses its `Configure_Title_Field` MERGE pattern with `setProperty(json('{}'),'Indexed',true)`.
The column definitions now use only the attributes those definitions and the proven browser provisioner use.
Verified step by step against run `08584106088704524462529689346CU18`: the lookup returned 200, the conditions
evaluated, and the report e-mail was delivered. Only the create body was wrong.

If an index on DGO DIGITAL OPS (22,108 items) is refused, that iteration's `Set_Field_Indexed` fails with the
SharePoint message and the run continues. The re-check shows which indexes are missing.

## P1-2 result (re-check run 3 October 2026, 20:46 UTC)

Evidence: [`evidence/p1-1-list-check-2026-10-03-after-p1-2.json`](evidence/p1-1-list-check-2026-10-03-after-p1-2.json),
read against the plan in `Scope_Phase1_Columns_Flow.paste.json`.

- **94 of 94 planned columns exist** on all 14 lists. No existing required or unique setting changed: Portal
  Registry still requires Title, ReferenceId, SenderEmail and Status, and Sequence Counters is unchanged.
- **51 of 55 planned indexes are set.** The 4 missing are all on **DGO DIGITAL OPS** (22,108 items): EntityKey,
  IdState, ReferenceId and CorrelationId. Its columns exist, but SharePoint did not index them; this list was the
  known risk. Its 9 free index slots are unchanged. Nothing reads these columns until Phase 4/5, so the indexes are
  needed before the backfill and the mirror lookups, not now (open item P1-2c).
- **DEV_OPS_Global_Tracking_Queue is now at 20 of 20 indexes** (EntityKey, IdState and TaskRef added). **Global
  Tracking Queue** has its 10 columns, without indexes, as planned (Q4).

## Phase 1 completion: `Scope_Phase1_Complete_Flow.paste.json`

**Source:** [`identity-provisioning.json`](../../../reference/identification/provisioning/identity-provisioning.json),
the Phase 1 specification generated from the catalogue. P1-2 derived its column list by hand and missed part of
this file. This flow applies all of it:

| Part | Count | Detail |
|---|---|---|
| New lists | 8 | DGO_RecordLinks, DGO_IdentityMap, DGO_Briefs, DGO_Meetings, DGO_Projects, DGO_Approvals, DGO_RegistryFiles, DGO_FileMovements. Each is a custom list with versioning on (100 versions), attachments and folders off, and Title optional. |
| Columns | 188 | Every column in the specification, on existing and new lists. Each is looked up first, so the 94 P1-2 added are skipped and only the missing ones are created. All optional and non-unique (B2). |
| Indexes | 64 | Only where a slot is free. None on Global Tracking Queue or DEV_OPS_Global_Tracking_Queue (20 of 20) or DGO DIGITAL OPS (refused, P1-2c). |
| Flow Configuration rows | 55 | `ENVIRONMENT_CODE` = `prd` and every `DATASET_<KEY>_SITE_URL` / `_LIST_ID`. A row that already exists is left as it is. The 8 new lists' IDs are read after the lists are created, and the IDs of DGO_HTTPFlowRegistry and DGO_HTTPFlowDependencies come from P1-1. |

**Every SharePoint call is copied from the deployed *01 - GOV - Provision HTTP Flow Registry***, which built
DGO_HTTPFlowRegistry and DGO_HTTPFlowDependencies in this tenant: Check_List, Create_List, Configure_List,
Configure_Title_Field, Check_Field, Create_Field and Create_Seed. Headers and bodies are identical to that flow's,
apart from the loop names.

The TASK and FILE counter rows are not seeded: the specification has the identification kit create each counter row
on the first claim of its year. That needed *Enforce unique values* off on `Year`, which was done on 3 October.

**Run:** create an instant flow `ID_Phase1_Complete` (manual trigger). Add empty **Send an HTTP request to SharePoint**
and **Send an email (V2)** steps, paste this file under the trigger, delete the two empty steps, save and run. It takes
about 10–15 minutes and e-mails dgsRegistry@nitda.gov.ng a report with the step-by-step record attached. Then run
**ID_Phase1_List_Check** again.

Columns P1-2 added that the specification does not list (for example IdState on the event lists) are optional and
empty. They are left in place.

## Phase 1 completion result (4 October 2026)

Evidence: [`evidence/p1-1-list-check-2026-10-04-after-completion.json`](evidence/p1-1-list-check-2026-10-04-after-completion.json)
and [`evidence/phase1-completion-rerun-2026-10-04.summary.json`](evidence/phase1-completion-rerun-2026-10-04.summary.json).
The run reported here, `08584105247890361893396919003CU08`, is a re-run. It found every list, every column and every
Flow Configuration row already present from the first run, so it serves as a complete read-back.

- **27 of 27 datasets exist.** The 8 new lists and their IDs: DGO_RecordLinks `c3875803-8a9c-42d6-86b9-85e3f0ca5eef`,
  DGO_IdentityMap `b25086d4-15da-493a-b45e-a8d068dc6220`, DGO_Briefs `e73a701a-fbcd-4d1d-b800-9fe26d12b2b6`,
  DGO_Meetings `6987151e-f4a7-4cff-9d4b-57f92383ef0b`, DGO_Projects `38cf8739-4a63-48fb-9351-7373b797db7c`,
  DGO_Approvals `5bcb98f3-3a86-408b-aa91-a75165b8246e`, DGO_RegistryFiles `98e85c69-d72a-4e8b-b1b2-1809fec74786` and
  DGO_FileMovements `0c3d7dec-6a1a-49d8-b3c2-b21c7fd85521`.
- **188 of 188 specified columns exist.** No existing required or unique setting changed. The only change of that
  kind is *Enforce unique values* on `Year` in Portal Sequence Counters, which the operator switched off on 3 October.
- **55 of 55 Flow Configuration rows exist** (Flow Configuration now holds 58 items).
- **104 of 125 specified indexes are set. 21 are missing:**
  - Global Tracking Queue: 10. It now has 5 free slots; 5 indexes, including NVERSE and GDSUROUT, were removed since 3 October.
  - DEV_OPS_Global_Tracking_Queue: 7, with no free slot.
  - DGO DIGITAL OPS: 3, which SharePoint did not set on a 22,108-item list (P1-2c).
  - DGO_RegistryFiles `FileRef`: 1. **Decision Q5.** `FileRef` is SharePoint's own system column (the item's URL), so
    the catalogue's REG reference column was never created, and the index attempt hit the system column and failed.
    The column needs another name in the catalogue.

## Phase 1 finish: `Scope_Phase1_Finish_Flow.paste.json`

This flow does everything Phase 1 still needs in the tenant, in 23 planned steps. It uses the same tested loop as
`ID_Phase1_Complete`, with one added step that removes an index through the same proven MERGE call
(`Indexed` false).

| List | Change | Why |
|---|---|---|
| DGO_RegistryFiles | Creates and indexes `RegistryFileRef` (text 20) | Decision Q5, specification 1.2.1: `FileRef` is SharePoint's own column |
| DEV_OPS_Global_Tracking_Queue | Removes the indexes on NVERSE, RefIDDN, Reference_ID, GDSUROUT, Followuptrigger, GTQGrouping and 3rdAssigned, then indexes CorrelationId, ParentKey, RootKey, RootRef, AssigneeKey, RoutedOrgKey and ClientRequestHash | No flow or client code filters this mirror list on the removed columns, and with 2,503 items it is under the 5,000-item threshold, so no view depends on an index |
| Global Tracking Queue | Indexes EntityKey, TaskRef, IdState, RootKey and ParentKey | Its 5 free slots. CorrelationId, RootRef, AssigneeKey, RoutedOrgKey and ClientRequestHash need 5 more slots (Q4: the list holds 16,071 items, so check views before removing more) |
| DGO DIGITAL OPS | Retries EntityKey, ReferenceId and IdState | P1-2c. This time SharePoint's message is recorded if it refuses again |

**Run:** create an instant flow `ID_Phase1_Finish` (manual trigger). Add empty **Send an HTTP request to SharePoint**
and **Send an email (V2)** steps, paste, delete the empty steps, save and run (about 2 minutes). Then run
**ID_Phase1_List_Check** again.

## Phase 1 finish result (run 4 October 2026, 04:07–04:44 UTC)

Evidence: [`evidence/phase1-finish-2026-10-04.summary.json`](evidence/phase1-finish-2026-10-04.summary.json).

- **20 of 23 succeeded, in 20 seconds:**
  - `RegistryFileRef` was created and indexed on DGO_RegistryFiles (Q5 is closed).
  - DEV_OPS_Global_Tracking_Queue swapped its 7 unused legacy indexes for the 7 spec indexes.
  - Global Tracking Queue gained EntityKey, TaskRef, IdState, RootKey and ParentKey.
- **3 failed: every index request on DGO DIGITAL OPS** (EntityKey, ReferenceId, IdState). Each ran 11 to 13 minutes
  and failed, and the report holds no SharePoint message. This is the second failed attempt on this 22,108-item list
  (P1-2 was the first). P1-2c stays open, and the next step is one attempt in the list settings page, which shows
  SharePoint's own reason.
- After this run, **116 of 125** specified indexes should be in place. The re-check confirms it. The 9 not set are
  the 3 on DGO DIGITAL OPS, plus CorrelationId, RootRef, AssigneeKey, RoutedOrgKey and ClientRequestHash on Global
  Tracking Queue. *Correction:* "no free slot left" was arithmetic (15 indexed at the 4 October check, plus the 5
  added) rather than a reading. The operator reports removing about 9 legacy indexes in total; the check showed 5
  removed, so about 4 more were removed after it. The next list check gives the actual free slots.

## Phase 1 storage: reading after the finish run (4 October 2026, 05:25 UTC)

Evidence: [`evidence/p1-1-list-check-2026-10-04-after-finish.json`](evidence/p1-1-list-check-2026-10-04-after-finish.json).

- **27 of 27 lists, 188 of 188 columns and 55 of 55 Flow Configuration rows** are present, as before.
- **117 of 125 specified indexes are set.** `RegistryFileRef` is indexed on DGO_RegistryFiles. DEV_OPS_Global_Tracking_Queue
  has all of its spec indexes (20 of 20 slots used).
- **Not set: 8.**
  - Global Tracking Queue: 5 (CorrelationId, RootRef, AssigneeKey, RoutedOrgKey, ClientRequestHash). It now has
    **4 free slots** (16 indexed), after the operator removed legacy indexes.
  - DGO DIGITAL OPS: 3 (EntityKey, ReferenceId, IdState). P1-2c, with two failed attempts.

## The last Global Tracking Queue indexes: `Scope_Phase1_GTQ_Indexes_Flow.paste.json`

This flow sets the 5 indexes Global Tracking Queue still lacks, with no manual step. It reuses the Finish flow's calls
unchanged (the read, the index MERGE and the unindex MERGE, all proven in run `08584105200478466943209931995CU20`).

1. It indexes **CorrelationId, RootRef, AssigneeKey and RoutedOrgKey** in the 4 free slots.
2. It reads the list's views and frees one slot by removing a legacy index **that no view filters, sorts or groups
   on**: `_x0033_rdAssigned` first, otherwise `Reference_ID`. No flow in the repo filters this list on either (searched
   4 October 2026). `DueDate` and `Acknowledgement_x0020_Due_x0020_` are not candidates, because AUTO_SCHEDULED_SWEEP
   filters on them.
3. It indexes **ClientRequestHash** in the freed slot. If both candidates are used by a view, it removes nothing and
   indexes nothing, and the report says so.

**Run:** create an instant flow `ID_Phase1_GTQ_Indexes` (manual trigger). Add an empty **Send an HTTP request to
SharePoint** step and an empty **Send an email (V2)** step, paste, delete the empty steps, check that *Send GTQ Report*
shows the Outlook connection, then save and run. It takes under a minute. Send back the
`phase1-gtq-indexes-<run>.json` attachment.

## Global Tracking Queue indexes result (run 4 October 2026, report e-mailed 18:53 WAT)

The operator ran `ID_Phase1_GTQ_Indexes`. The run screenshot,
[`evidence/phase1-gtq-indexes-2026-10-04-run.jpg`](evidence/phase1-gtq-indexes-2026-10-04-run.jpg), shows
*Your flow ran successfully*: every step is green, `Foreach Planned Column` ran 6 iterations, and *Send GTQ Report*
succeeded. Iteration 1 of 6 is the one on screen: *Create Field* and *Remove Field Index* were skipped, and
*Set Field Indexed* succeeded. The report e-mail is in the operator's inbox
([`evidence/phase1-gtq-report-and-notifier-email-2026-10-04.jpg`](evidence/phase1-gtq-report-and-notifier-email-2026-10-04.jpg),
message at 18:53).

**Report** (run `08584104704691006016038196723CU26`, 17:53:36–17:53:45 UTC; supplied 5 October 2026):
[`evidence/phase1-gtq-indexes-2026-10-04.summary.json`](evidence/phase1-gtq-indexes-2026-10-04.summary.json).
All six planned changes succeeded. CorrelationId, RootRef, AssigneeKey, RoutedOrgKey and ClientRequestHash were
unindexed before the run and are now indexed. `_x0033_rdAssigned`, which none of the list's 24 views uses, was
unindexed to free the fifth slot. No column had to be created.

## DGO DIGITAL OPS indexes (P1-2c): done from the list settings page

The operator reported on 5 October 2026 that EntityKey, ReferenceId and IdState are indexed on DGO DIGITAL OPS, created
from the list settings page as set out below. With the Global Tracking Queue report above, **all 125 specified indexes
are set**, and Phase 1 storage is complete. The next run of the read-only P1-1 list check will show the same.

### Why a flow could not do this one

Two flow runs asked SharePoint's REST API to index EntityKey, ReferenceId and IdState on this 22,108-item list. Each
request waited 11 to 13 minutes and failed. The same call indexed Global Tracking Queue (16,071 items) in under a
second. SharePoint Online allows indexes on lists of any size from the **list settings page** (List settings →
Indexed columns → Create a new index). Microsoft's guidance is that creating an index reads every item, so on a large
list it can be blocked over the list view threshold. A REST request has to finish inside the connector's time limit,
so a flow cannot do this; the settings page is the supported way. It takes three index creations, one per column, and
the list has 9 free slots.
