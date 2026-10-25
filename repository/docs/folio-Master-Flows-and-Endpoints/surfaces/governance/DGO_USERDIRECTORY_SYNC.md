# DGO_USERDIRECTORY_SYNC — corrected `Scope_Global` (v5.2.0)

Keeps `DGO_UserDirectory` in step with Microsoft 365 and reports every run. It replaces the
submitted `Scope_Global` v4.0.1, which could not sync: its four decision conditions were
placeholders, it matched only on `UserId`, so every app-enrolled user was duplicated and then
disabled, it wrote choice values the lists don't have, and it used `Terminate`, which skipped the
failure report.

| File | What it is |
|---|---|
| `DGO_USERDIRECTORY_SYNC.Scope_Global.designer-paste.json` | The scope, ready to paste. **Generated. Don't edit by hand.** |
| `scripts/build-userdirectory-sync.mjs` | The generator (`--check` fails if the package is stale) |
| `scripts/lib/wdl-sim.mjs` | A local simulator for the flow expression language |
| `tests/userdirectory-sync.test.mjs` | Static checks plus six simulated runs (`npm run test:userdirsync`) |

## Pasting it

1. Keep the trigger and the `Initialize variable` actions. The scope uses exactly these:

   | Variable | Type | Initial value |
   |---|---|---|
   | `RunId`, `RequestId` | String | any id (falls back to the run id if empty) |
   | `StartedAt` | String | `utcNow()` (falls back to `utcNow()` if empty) |
   | `CreatedCount`, `UpdatedCount`, `DisabledCount`, `SkippedCount` | Integer | `0` |
   | `Errors` | Array | `[]` |
   | `DecisionLog` | Array | `[]` — **new in 5.1.0; add one Initialize variable for it** |

   `ErrorCount` is no longer read. You can keep it or delete it. The designer refuses to save the
   scope until `DecisionLog` is declared.
2. Delete the old `Scope_Global`, then paste this one in the same place (after the last
   `Initialize variable`).
3. Check each connector action is bound to its connection. The package carries the original
   connection names.
4. Check the one setting you may want to change, in `Compose_Settings` (see below).

**Prerequisites:** `DGO_UserDirectory` needs the `CreatedAt`, `CreatedBy`, `UpdatedAt` and
`UpdatedBy` columns from the provisioning spec, which the create/update actions write. The
flow-management and SharePoint connections need access to Portal Flow Telemetry on
`Global_Digital_Documents_Centre`, as the other platform flows already have.

## Settings (`Compose_Settings`)

| Setting | Default | Meaning |
|---|---|---|
| `NotifyTo` | `dgsregistry@nitda.gov.ng` | Report recipients, separated by `;` |
| `TelemetryTo` | `dgsregistry@nitda.gov.ng` | Recipient of the standard flow run record email |
| `NewUserStatus` | `active` | Status for newly found enabled accounts. Use `staged` to review people before they get access |
| `IncludeGuests` | `true` | **Decided 26 Sep 2026: guests are kept.** External guests with a mailbox are part of the directory. Set `false` to exclude them; their existing rows are then disabled as *excluded* (within the disable limit) and re-activated if you switch back |
| `NewUserRole` / `NewUserPersona` / `NewUserCohort` | `viewer` / `general` / `directory-sync` | Defaults for new rows |
| `MaxDisablePerRun` / `MaxDisablePercent` | `25` / `5` | Disabling is withheld when more rows than the larger of these are absent |
| `EmailRowLimit` | `25` | Rows shown per table in the email. The attached report shows all of them |
| `M365PageCap` / `ListPageCap` | `5000` / `5000` | Completeness caps. **Must equal** the pagination thresholds on the Get actions. 5000 is the most the service accepts (a save with 10000 was refused on 2026-09-27: `InvalidPaginationPolicy`, "Maximum: '5000'"). A read that reaches a cap stops the run with nothing written |

## Access it needs: no Entra ID, no Azure, no admin rights

The platform uses no Entra ID configuration, no Azure resources and no step that needs a tenant
or Power Platform administrator. The flow runs entirely on standard connectors, under the
flow owner's own ordinary account:

| Connector | Operation | What the owner needs |
|---|---|---|
| Office 365 Users | Search for users (V2) | A Microsoft 365 licence. Reads the organisation's address list, as Outlook does |
| SharePoint | Get items, Create item, Update item, Add attachment | Edit rights on `DGO_UserDirectory`, `DGO_AuditLog` and `DGO_PilotCohorts` (DGO_ECM_GOVERNANCE) and on Portal Flow Telemetry (Global_Digital_Documents_Centre) |
| Office 365 Outlook | Send an email (V2) | Its own mailbox |
| Power Automate Management | Get flow | Ownership of this flow (not the *as admin* operations) |

"Administrator" elsewhere in this guide means the platform's own administrator role (User
Administration), not a Microsoft 365 administrator.

## Schedule: daily at 05:45 WAT

Decided 26 Sep 2026. The trigger cannot travel in the pasted scope, so it is set in the designer;
`DGO_USERDIRECTORY_SYNC.trigger.json` is its reference definition. Nothing in the scope or the
variables reads the manual trigger's inputs, so swapping it changes nothing else.

1. Open the flow and select **Edit**.
2. Select the trigger **Manually trigger a flow**, open its **…** menu and choose **Delete**.
   (If the new designer does not offer Delete on the trigger, switch off **New designer**, delete
   it there, and switch back.)
3. **Add a trigger** → search **Recurrence** (Schedule) → set **Interval** `1`, **Frequency**
   `Day`, **Time zone** `(UTC+01:00) West Central Africa`, **At these hours** `5`, **At these
   minutes** `45`.
4. On the trigger's **Settings**, turn **Concurrency control** on with **Degree of parallelism**
   `1`, so two runs never overlap.
5. **Save**. A scheduled flow can still be started on demand with **Run**.

A run takes under a minute. Each run sends the run report and the telemetry email to the
registry mailbox; the report's Run details then show the trigger as `Recurrence`, with its
scheduled time.

## What it does

**Sync** (`Scope_UserDirectory_Synchronization`)
1. Reads Microsoft 365 users and `DGO_UserDirectory` in parallel. Stops without writing anything if
   the Microsoft 365 read is empty or either read hits its cap.
2. Keeps only eligible accounts (has an id and a mailbox address, and isn't an external guest),
   then normalises them.
3. Skips users whose row already holds exactly what would be written (fingerprint match), so a
   steady-state run takes almost no actions.
4. For each remaining user, matches by object id first and then by email:
   - **create**: new row as `viewer`, status `NewUserStatus`, or `staged` if Microsoft 365 doesn't
     report the account state. Disabled accounts with no row are ignored.
   - **update**: only when a value differs. When the match is by email (an app-enrolled row), the
     row is adopted: the object id is written and Role, Persona, AccessScope and PilotCohort are
     kept.
   - **conflict**: more than one match. Recorded as an issue and not written.
   - **protected**: the bootstrap row is never changed.
5. A value Microsoft 365 leaves blank never erases one already on the row: Department, JobTitle
   and Phone are kept when Microsoft 365 has none, and a real Directorate is kept over the
   `Unassigned` fallback. A value Microsoft 365 does have still wins.
6. Status changes only when Microsoft 365 decides it. An account disabled there is disabled here,
   and a row the sync disabled is re-activated when the account comes back. A status an
   administrator set is kept.
7. Rows absent from the complete read (or outside the directory, see `IncludeGuests`) (by id and by email) are disabled, unless there are more
   than the disable limit. In that case nothing is disabled and the report lists them.
8. Each write fails soft: a rejected row is recorded with SharePoint's message and the loop
   carries on.

9. Rows that share an email are listed and raised as a data-quality issue (the run is a warning).
   The platform signs a person in with the first row holding their email, so duplicates decide
   access by accident. The sync never deletes or merges rows; that is an administrator's call.

**Report** (`Scope_Report_And_Notify`, runs whatever the sync outcome)
- One `DGO_AuditLog` row. Severity is `info`, `warning` or `error`, and `MetaJson` holds the
  summary and metrics.
- An interactive HTML report and a JSON run record, attached to the audit row and to the email.
- One email. The subject gives the outcome (`SUCCEEDED`, `WARNING` or `FAILED`) and the counts.
  The body has buttons to the run, the list and the audit record; count tiles; charts; the
  changes; issues; absent accounts; and run details. It is laid out for Outlook, and the tiles,
  tables and buttons adapt to phone width.
- The HTML report adds a sticky section navigation; search boxes, filter buttons and sortable
  columns on every table; the steps timeline; inputs; deliverables; flow facts; raw JSON with
  copy buttons; and a print / save-as-PDF button.

- **Changes this run** shows every row created, updated or disabled with each changed field as
  old → new. **Users reviewed** lists every account the loop looked at, plus every row
  reconciliation acted on, with the decision (Created, Updated, Disabled, Unchanged, Protected,
  Ignored, Conflict, Failed), how it was matched and why. Both come from the `DecisionLog`
  variable. Accounts that already matched exactly are counted, not listed.

**Flow data capture** (`Scope_Flow_Data_Capture`, the estate standard, runs after the report)
- `Compose_Flow_Run_Record`: capture v2.0.0 with every standard section (capture_metadata,
  workflow_identity, run_identity, trigger_record, request, design_definition, response_record,
  outcome, timing), and `Compose_Flow_Run_Record_Schema`, copied verbatim from the estate.
- A Portal Flow Telemetry row (Flow, RunId, StartedAtUtc, CompletedAtUtc, Outcome, DurationMs,
  ErrorMessage, and RunRecordJson, which is the record without its design definition, capped at
  60,000 characters).
- `Send_Telemetry_Email` with the five standard attachments: `<Flow>__<RunId>__flow_run_record.json`,
  `…flow_run_record_schema.json`, `…trigger_input_schema.json`, `…full_definition.json`,
  `…varResponse.json`.
- Adapted for a scheduled flow: the request section is empty (a Recurrence trigger has no headers
  or body), `response_record` describes the run report email, `varResponse.json` is
  `Compose_Run_Response`, and step results are listed without outputs so the staff directory
  never enters telemetry.

**Outcome gate:** if the sync, the report or the data capture didn't succeed, the run ends
`Failed`. The report, email and telemetry are always delivered first.

## Verifying a change

```bash
node scripts/build-userdirectory-sync.mjs          # regenerate after editing the generator
npm run test:userdirsync                           # static checks + six simulated runs
UDSYNC_RENDER_DIR=/tmp/udsync npm run test:userdirsync   # also writes each scenario's email/report HTML
```

## First live run: reconciliation (run `08584112298349534230210797255CU20`, 25 Sep 2026)

Reviewed from the run's report, sync data, flow run record, full definition and an export of
`DGO_UserDirectory` taken after it. People are identified by list item ID only.

**The run itself is sound.** The deployed definition is this package (5.1.0) action for action;
the differences are export formatting only. All 49 steps succeeded, the flow run record carries
every v2.0.0 section with no directory data in it, the audit row (DGO_AuditLog item 4) and both
attachments were written, and every figure in the report matches the list export: 852 Microsoft
365 accounts, 855 rows, 823 active, 32 disabled, 3 extra rows sharing an email. The simulator,
replaying the export, reproduces the same figures (661 eligible against the live 660; the export
cannot show the one account the live read excluded).

**It changed nothing, because an earlier run had already written the list.** The 852 synced rows
were created about 90 minutes before, by the old v4 flow; two rows carry its disable text
("…completed paginated…extraction"). What that run left behind:

| Finding | Items | Effect | Resolution |
|---|---|---|---|
| An administrator-enrolled operator was disabled as "absent" (its UserId held an email), and a second, viewer row was created for the same person | 3 (enrolled, disabled), 360 (viewer) | The platform reads the first row for an email, so this person is likely refused as disabled | **Delete item 360.** The next run adopts item 3 by email, writes the Microsoft 365 id, re-activates it and keeps its role. Replayed: confirmed |
| The registry mailbox has three rows | 1 (bootstrap), 2 (hand-made systemAdmin, disabled), 256 (viewer) | Item 1 wins today; the others are noise that could win after a re-order | **Delete items 256 and 2.** The mailbox is then matched to the bootstrap row, which the sync never changes. Replayed: confirmed |
| 191 external guest rows exist, but 5.1.0 excluded guests, so they were neither updated nor reconciled | guests | Unmanaged: they would stay active even after their accounts were disabled | 5.2.0 `IncludeGuests` (default on) brings them under management. Turn it off to disable them instead |
| 30 rows exist for accounts disabled in Microsoft 365 | — | None: they are disabled | Kept. 5.2.0 does not create such rows, but keeps them in step |
| 780 of 855 rows have Directorate `Unassigned` | — | Microsoft 365 holds no Department for most staff, and changing that would need a Microsoft 365 administrator | Set Directorate on the rows themselves, in `DGO_UserDirectory` or through User Administration: no admin rights needed. From 5.2.0 the sync keeps a value it has no replacement for |

After the three deletions, the replay gives: 1 row updated (the adoption), the registry mailbox
protected, no duplicates, and a clean run the time after.

**Remediation run** (`08584112212251967275351842833CU07`, 26 Sep 2026, package 5.2.0, after items
360, 256 and 2 were deleted): exactly as replayed. 852 accounts against 852 rows; item 3 adopted by
email (Microsoft 365 id written, disabled → active, role and directorate kept); the registry mailbox
matched to bootstrap item 1 and left unchanged; no duplicates, no absent rows, no issues; 822
active, 30 disabled. Audit record DGO_AuditLog item 5.

## How the platform reads the directory (fixed 26 Sep 2026)

A correct directory was not enough: the flows that serve it disagreed with the client that reads
it. Found once the list grew from one bootstrap row to 852 people:

| Defect | Effect | Fix |
|---|---|---|
| `DGO_FETCH_ALL` and `DGO_REFERENCE_DATA` passed Role, Persona and Status through as SharePoint Choice objects (`{ Value }`) | The client read status as `[object Object]` and refused **every** user (`status-unknown`) | `USER_SEL` in `scripts/build-internal-designer-paste.mjs` serves `?['Value']`, as the other lists' mappings already did |
| Both read the directory with `$top: 500` and no paging | About 350 people were missing from `users` and treated as unregistered | Both reads page to 100,000 rows |
| `DGO_OTP_VERIFY` stated the role only as an object inside `roles`, with no `email`; `core/auth.js` reads a `role` string and `email` | Enforced sign-in would resolve no role and no email for anyone | The proof now carries `role`, `roles`, `email` and `persona` as text |

The client also no longer depends on the flows getting this right: `normalizeUser` (core/domain.js)
unwraps a Choice object, and `verifiedRole` / `getIdentity` (core/auth.js) accept `roles[0]` and
`preferred_username`, still returning no role when the proof carries none.
`tests/directory-served-shape.test.mjs` runs the packages' own expressions over SharePoint-shaped
rows through the client, and fails on the old packages.

**To deploy:** repaste `DGO_FETCH_ALL`, `DGO_REFERENCE_DATA` and `DGO_OTP_VERIFY` from
`docs/folio-Master-Flows-and-Endpoints/surfaces/internal/designer-paste/`, and publish the client (core/domain.js,
core/auth.js).

## Alignment with the branch's own structures (26 Sep 2026)

Everything the sync writes, and everything that reads `DGO_UserDirectory`, checked against the
structures this branch defines. Nothing outside this branch was used as reference.

**Aligned**

| Structure | Where it is defined | Finding |
|---|---|---|
| `DGO_UserDirectory` columns, types, required flags, Status / Role / Persona choices | `docs/reference/sharepoint-provisioning-spec.json` | The sync writes only provisioned columns and real choice values (tested) |
| List location | `governanceSiteDecision` (GOV-01) in the same spec; `docs/reference/sharepoint-list-index.json` marks `3d591f5b…` adopted | The sync and the read flows use the adopted list on DGO_ECM_GOVERNANCE |
| Roles and personas | `config/rbac.config.js` (`RolePersonaMap`), `docs/reference/role-catalogue-seed.json` | New rows are `viewer` / `general`, the map's own pairing |
| Status gating | `config/rbac.config.js` `explainAccess` | Only `active` is admitted; `staged` and `disabled` are refused, as intended |
| `AccessScope` | spec (Note) and `core/domain.js` `scopeList` | `[]`, the JSON-array form the normaliser reads |
| Microsoft 365 source | Office 365 Users *Search for users (V2)* | Standard connector, owner's own account |
| `DGO_AuditLog` row | `auditRow()` in `scripts/build-internal-designer-paste.mjs` and the list's seed row | **Corrected** (see below) |
| Flow telemetry | `Scope_Flow_Data_Capture` in the fresh-flow package, Portal Flow Telemetry in `portal-field-spec.json` | Schema copied verbatim; test fails on drift |

**Corrected**

| Misalignment | Which side was wrong | Fix |
|---|---|---|
| The gate in every internal flow read `Role` as the Choice object, so it matched no `DGO_RoleCatalogue` row and refused **every** caller | Existing structure (defective) | `Compose_<flow>_Role` and the audit `ActorPersona` read `?['Value']`. 7 flows rebuilt |
| `FETCH_ALL` / `REFERENCE_DATA` served Role / Persona / Status as objects and only 500 users; `OTP_VERIFY` stated no `role` or `email` | Existing structure (defective) | Fixed earlier the same day |
| The sync's audit row used its own vocabulary (`UserDirectorySync`, `system` role) | Ours | Now `audit:user-directory-synced…`, module `user-directory`, `systemAdmin` / `admin`, AuditId `user-directory:<event>:<requestId>` |

**Decided 26 Sep 2026 and implemented**

1. **Who may read: any active member.** `FETCH_ALL`, `GET_DOCS`, `REFERENCE_DATA` and
   `SCAN_INTAKE` admit any caller with an active `DGO_UserDirectory` row (`membership` now means
   exactly that). The full `users` rows (role, persona, status, scope) go only to a role with
   `user:view` or `"*"`. Everyone else receives name, email, directorate and department for the
   directory, plus their own full row first, so the client still resolves their role. The
   assignment flows keep `bulk:assign` and `DYNAMIC_GLOBAL_ACTIONS` keeps `user:view`.
2. **Directorate: approved unit keys.** The sync writes a unit key from
   `config/organizational-units.config.js` into Directorate, resolving Microsoft 365's department
   (then company) case-insensitively, with `&` read as `and`, from:
   - each unit's key and title;
   - the agency's adopted corrections in `docs/reference/approved/dsu-key-corrections.csv`
     (for example `HRA` → `HRM`);
   - the rows of `docs/reference/directorate-aliases.csv` whose Status is `confirmed`.

   A department that resolves to nothing leaves a row's existing unit key in place, or sets
   `Unassigned`, and the report lists the name under *Departments with no unit key*. Microsoft
   365's own text stays in Department. The owner decided all 27 aliases on 26 Sep 2026 through the
   Directorate Mapping Matrix; every row is `confirmed`. To add or change one, edit the CSV
   (Status `confirmed` applies it, `proposed` or `rejected` does not) and rebuild
   (`node scripts/build-userdirectory-sync.mjs`); the build refuses a key that is not approved.
   Against the live export, keys, titles and adopted corrections alone resolve 13 of the 72
   accounts that have a Microsoft 365 department; with the confirmed aliases, 71. The one left is
   `SSZO` (1 account), which the owner left undecided.
3. **Pilot cohort: registered.** The sync adds its `NewUserCohort` (`directory-sync`) to
   `DGO_PilotCohorts` the first time it is missing (status `active`), fail-soft.
