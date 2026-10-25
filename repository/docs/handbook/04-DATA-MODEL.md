# 4 · Data model

All business data lives in **SharePoint Online lists** on four sites. The browser holds a working copy
for the session only. This chapter names every list Folio's adopted flows touch (25, read from 74 flow
definitions by `scripts/flow-list-sweep.mjs` into
`docs/folio-Master-Flows-and-Endpoints/registers/flow-list-map.json`), what each is for, and the
columns that matter.

> **Column names are internal names.** SharePoint shows display names in the browser, but flows
> read and write **internal names** (for example `CC_x0027_dTo` for "CC'd To"). The complete,
> verified column lists are in [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md) §1.2 and
> §1.4. Use those when writing a flow.

## 4.1 Sites

| Site (`https://nitdanigeria.sharepoint.com/sites/…`) | Holds |
| --- | --- |
| `NITDADGO-EAAACTIVITYTRACKING` | The operational records: documents, tasks, comments, categories, departments, Flow Configuration, sign-in codes |
| `DGO_ECM_GOVERNANCE` | People, roles, sign-in proofs, the audit log |
| `NEDMS` | The Portal's submissions, attachments, status timeline, upload tickets; the Central Registry |
| `Global_Digital_Documents_Centre` | The Portal's verification, rate limits, sequence counters, support cases; telemetry and mail receipts for all flows |

## 4.2 Workspace lists

| List | Site | What one row is | Key columns |
| --- | --- | --- | --- |
| **DGO DIGITAL OPS** (`1f1cb303…`) | activity tracking | A document or piece of correspondence (a *reference*) | `Title`, `RefIDD` (reference), `Category0`, `Status`, `OverallStatus`, `AssignedTo`, `RoutedToDSU`, `CC_x0027_dTo`, `StartDate`, `BodyExtract`, plus identity columns `EntityKey`, `ReferenceId`, `IdState` |
| **Global Tracking Queue** (`ee82725a…`) | activity tracking | A task assigned to an officer | `Title`, `RefIDD` (the document), `Reference_ID`, `AssignedTo` (indexed), `AssignedBy`, `GDSUROUT` (the unit routed to), `DueDate`, `Priority`, `Progress` (the task's status), `TaskType`, `Acknowledge_x0020_Task`, `AcknowledgedBy`, plus `TaskRef`, `EntityKey`, `ParentKey`, `RootKey`, `IdState`, `Rev` |
| **Task_Comments** (`1932d687…`) | activity tracking | A comment on a document or task | `Title`, `RefIDD`, `Description`, `Created`, `EntityKey`, `AuthorKey` |
| **Organizational_Categories_Matrix** (`f64c8b65…`) | activity tracking | A correspondence category and its default routing | `Category`, `Subcategory`, `DSU_KEY`, `Priority`, `Timeline`, default primary and supporting units, units to inform |
| **Organizaitonal_Departments_Information** (`8aab9c4e…`) | activity tracking | A department or unit (spelling as in the tenant) | `Title`, `DSU_KEY`, `DSU_Email`, `DSU_HeadEmail`, `DSU_HeadTitle` |
| **Flow Configuration** (`9bc168c3…`) | activity tracking | One server-side setting | `Title` (the key), `ConfigValue` |
| **OTP_Transactions** (`9421d473…`) | activity tracking | A sign-in code issued to an address | `Title` (address), `OTP_Code`, `Expires_At`, `Is_Verified` |
| **DGO_UserDirectory** (`3d591f5b…`) | governance | A person who may use Folio | `Email`, `FullName`, `Directorate`, `Department`, `JobTitle`, `Role`, `Persona`, `Status`, `AccessScope`, `PilotCohort`, `DisabledReason`, `UserId` |
| **DGO_RoleCatalogue** (`f675598b…`) | governance | A role definition | `RoleId`, `Persona`, `PermissionsJson`, `AllowedRoutesJson`, `Active`, `Version` |
| **DGO_SessionProofs** (`444102d6…`) | governance | A sign-in proof | `Title` (the token), `Email`, `Purpose` (`internal-session`), `ExpiresAtUtc`, `CreatedAtUtc`, `Consumed` |
| **DGO_AuditLog** (`be0c7af1…`) | governance | A governed change | written by DYNAMIC_ACTIONS and USER_ADMIN |
| **DGO_UserRoleHistory** (`9fe1872f…`) | governance | A role change | written on role assignment |
| **NITDA_Central_Registry** (`f553959f…`) | NEDMS | A registry file | `Title` |

Two facts that catch people out:

- **Global Tracking Queue has no `Status` column.** A task's status is `Progress`
  (`core/domain.js`). A document's status is `DGO DIGITAL OPS/Status`. They are different lists
  and different columns.
- **Global Tracking Queue uses all 20 indexed columns SharePoint allows.** Filters that must be fast
  use indexed columns (`AssignedTo` for "my tasks"). Adding a filter on an unindexed column to a list
  this size (about 16,000 rows) gets throttled. ITEM-91 records the trade-off.

`DEV_OPS_Global_Tracking_Queue` (`22c4e38d…`) is a **test list**. Folio does not read it, and no
production flow should write to it (ITEM-74).

## 4.3 Portal lists

| List | Site | What one row is |
| --- | --- | --- |
| **Portal Registry** | NEDMS | A public submission: reference, sender, subject, category, channel, status, submitted, updated, acknowledged and closed times |
| **Portal Attachments** | NEDMS | A file attached to a submission (declared name, stored name, size, SHA-256, link) |
| **Portal Status Timeline** | NEDMS | One status event a submitter can see (`SubmissionRef`, `AtUtc`, `Status`, `Label`, `Actor`, `Note`) |
| **Portal Upload Tickets** | NEDMS | A single-use permission to upload one file |
| **Portal OTP Codes** | Documents Centre | A Portal e-mail verification code (with attempt count) |
| **Portal Verification Proofs** | Documents Centre | A verified Portal e-mail (the Portal's equivalent of `DGO_SessionProofs`) |
| **Portal Rate Limits** | Documents Centre | A per-IP, per-service counter for a 60-minute window |
| **Portal Sequence Counters** | Documents Centre | The counter that mints reference numbers (`Prefix`, `Year`, `CurrentSequence`, `LastReferenceId`, `LockToken`) |
| **Portal Support Cases** | Documents Centre | A support request (case reference in `Title`) |
| **Portal Audit Events** | Documents Centre | A Portal audit event |

## 4.4 Operational lists (all flows)

| List | What one row is |
| --- | --- |
| **Portal Flow Telemetry** (`726c210d…`) | One flow run: flow, run ID, start, end, outcome, duration, error, and an attached run record with secrets masked |
| **Portal Outbox Receipts** (`88a81ca1…`) | One e-mail a flow sent: type, recipient, reference, time, status, attempts, last error |
| **AI TEXT DATA LOG** (`d46a2be7…`) | Text extracted by the legacy AI intake flow (retires with ITEM-80) |

## 4.5 Identifiers

Defined by the identification system ([`docs/reference/identification/IDENTIFICATION_SYSTEM.md`](../reference/identification/IDENTIFICATION_SYSTEM.md),
catalogue version 1.2.6). The ones people meet:

| Identifier | Format | On |
| --- | --- | --- |
| Registry Reference | `NITDA-YYYY-NNNNN` (non-production: `ZNITDA-…`) | Correspondence |
| Task Reference | `TASK-YYYY-NNNNN` (`ZTASK-…`) | Tasks |
| Case Reference | `CASE-XXXXXX`, letters and digits without I, O, 0 or 1 (`ZCASE-…`) | Support cases |
| File Reference | `FILE-YYYY-NNNNN` (`ZFILE-…`) | Registry files |

And the ones the system uses:

| Identifier | Format | Purpose |
| --- | --- | --- |
| Entity Key (`EntityKey`) | lower-case GUID v4 | The permanent machine identity of every governed record. Relationships point at it; it is never shown as the reference. |
| Qualified Key | `<TYPE>:<entity key>`, where TYPE is one of REC, ATT, TSK, MIN, CAS, EVT, LNK, MAP, USR, ORG, BRF, MTG, PRJ, APR, REG | An entity key with its type |
| Identity state (`IdState`) | `ACTIVE`, `ARCHIVED`, `MERGED`, `VOID` | Whether an identifier resolves to itself (ACTIVE, ARCHIVED read-only), to another record (MERGED, see `SupersededBy`), or to nothing (VOID). It is independent of business status. |
| Revision (`Rev`) | positive integer | Optimistic concurrency: a write names the revision it read |
| Contract Key | `UPPER_SNAKE` | Names a service (`FETCH_ALL`) |
| Request ID / Correlation ID | GUID v4 | One request; sent as `X-Correlation-Id` |

All 26 identifiers, with patterns and owners, are in
[`identifier-catalogue.json`](../reference/identification/identifier-catalogue.json).

## 4.6 The Workspace's working copy (client state)

`core/state.js` holds one object. FETCH_ALL fills it at sign-in and on every refresh:

| State key | Filled from FETCH_ALL `data.` | Holds |
| --- | --- | --- |
| `activities` | `docs` | Documents (newest 500, or your own for the "own" tier) |
| `tracking` | `tasks` | Tasks (newest 500, or yours) |
| `comments` | `comments` | Comments |
| `users` | `users` | The directory (e-mail addresses: all for the "all" tier, only your own otherwise) |
| `categories`, `departments` | same names | Reference data |
| `portalRegister` | `register` | Public submissions (the "all" tier only) |
| `approvals` | `approvals` | Approvals (empty for the "own" tier) |
| `emails` | `emails` | Always empty in the go-live build (ITEM-74) |

FETCH_ALL also returns `briefs`, `meetings`, `projects` and `files`; `core/data-loader.js` does not
map those four keys into state.

Other keys (`settings`, `profile`, `pending`, `audit`, `notifications`, `dispatches`, …) belong to
the browser. Everything except `runtime` persists in `localStorage` under
`dgo.r11.viewport.runtime.state`. `runtime` holds the outcome of the last load in
`runtime.lastLoad` (`ok`, `key`, `counts`, `message`).

## 4.7 Roles, personas and statuses

From `config/rbac.config.js`. The role decides the screens and the server-side data scope.

| Role | Label | Persona | Data scope (server) | Permissions |
| --- | --- | --- | --- | --- |
| `systemAdmin` | System Administrator | admin | all | every permission |
| `userAdmin` | User Administrator | admin | all | user:view, create, update, disable; role:assign, role:view; audit:view |
| `executive` | Executive | executive | all | executive:view, executive:export, audit:view |
| `director` | Director / Directorate Lead | registry | directorate (own items until ITEM-91) | executive:view, route:manage, dispatch:approve, bulk:assign |
| `operator` | Operator | registry | all | route:manage, bulk:assign |
| `viewer` | Read-only Viewer | general | own | none |

Screens each role may open:

The menu shows each role the workspaces whose tabs it may open ([Components §3.3](03-COMPONENTS.md)); the screens are:

| Role | Screens |
| --- | --- |
| systemAdmin | all |
| userAdmin | Command Center, Administration, User Administration, System Health, Operator HUD, Admin Suite |
| executive | Command Center, DGCEO Hub, Tracking & Monitoring, Acknowledgment Queue, My Work, Comments, Review & Approval, Briefs, Meetings, Projects, Reports, Statistics, Lookup, Assistant, Archive Evidence |
| director | Command Center, Activities, Intake & Assignment, Tracking & Monitoring, Acknowledgment Queue, My Work, Comments, Review & Approval, Dispatch, Registry Scan Intake, Briefs, Meetings, Projects, Reports, Statistics, Lookup, Assistant |
| operator | Command Center, Activities, Intake & Assignment, Tracking & Monitoring, Acknowledgment Queue, My Work, Assignment Desk, Bulk Assignment, Registry Scan Intake, Registry, Comments, Dispatch, Correspondence Email Desk, Meetings, Projects, Lookup, Assistant |
| viewer | Command Center, Tracking & Monitoring, Acknowledgment Queue, My Work, Comments, Reports, Statistics, Lookup |

Directory **statuses**: `staged`, `active`, `disabled`, `unregistered`. Only `active` can sign in
or receive data.

Only a **System Administrator** may grant the System Administrator role (enforced in the USER_ADMIN flow).

## 4.8 Status vocabularies

**What a Portal submitter sees** (`config/status-vocabulary.config.js`):

| Key | Label | Stage | Meaning |
| --- | --- | --- | --- |
| `received` | Received | 1 | Logged in the registry and queued for validation |
| `validation` | Validation | 2 | Documents are being checked for completeness |
| `review` | Under review | 3 | With the assigned unit for technical assessment |
| `action-required` | Action required | 3 | Something is needed from the submitter |
| `approved` | Approved | 4 | Decision issued; outcome sent to the submitter |
| `declined` | Declined | 4 | Not approved on this submission |
| `withdrawn` | Withdrawn | 4 | Closed at the request of the submitter |

Internal statuses map onto these: Pending → received; Accepted and Delegated → review;
Declined → declined; Archived → approved.

**Documents** carry `Status` on DGO DIGITAL OPS; dispatch and archive set it to *Treated*.
**Tasks** carry `Progress` on Global Tracking Queue.
