# Module Rationalisation — overlap, duplication and confusion in the internal platform

**Question (owner, 2026-10-18).** The internal platform's modules appear to overlap and duplicate one
another. Intake, Activities and Registry are the examples given. Is that true? If so, why, and what
should the structure be?

**Revision 2 (2026-10-18), after the owner asked for a more critical pass.** The second pass found
that the overlap hides a larger problem: **most of what users do on these screens never becomes a server
record.** I ran the client's exact payloads through the repository's own flow simulator against the
package the tenant runs. 14 of 15 Dynamic Actions writes are refused (§8.4). Many other actions make no
server call at all, and the next refresh from the server wipes them (§8.5). Findings F-16 to F-24 are
new, and §11 corrects one error in revision 1: Intake's triage form doesn't work either, so the first
Phase 0 fix was wrong.

**Answer in one paragraph.** Yes. The overlap is real and the code confirms it. Under 25 sidebar
workspaces there are **two record sets**: incoming documents and tasks. Each is held twice: once as
fetched, and once as a locally enriched copy whose status never refreshes from the fetched one
(§3, reproduced in §8.1). Several screens are lists over the same records with different filters. The
clearest case is Activities: its two views are Intake's documents and My Work's tasks, and it holds no
data of its own (F-1). The same change can be made from two or three screens, and those paths differ in
what they write, who they notify, and whether the server accepts the write (F-3, F-4, F-5). Three
navigation configurations describe the platform differently (F-15). The proposed structure keeps every
action owner and every governance check as it is. It reduces the full sidebar from 25 entries to 13 by
merging screens that show the same records, and it fixes the defects found along the way first, without
changing any flow package (§6, §7).

| | |
|---|---|
| Evidence baseline | commit `e525dac` (tip of `claude/system-remediation-gaps-ahpmsy` on 2026-10-18) |
| Written on | branch `ccr-f91e43e3-84lvqh`. The owner directed that this session must not edit the default branch, so nothing here changes it. |
| Method | Every claim cites a file and line or a command. Counts were produced by script (§8.3), not estimated. Two behaviours were reproduced by running the platform's own code under Node (§8.1, §8.2). |
| What this is not | No register, package, config or module is changed. No closed register item is reopened (§9). |

---

## 1. How the platform is put together today

| Measure | Count | Source |
|---|---|---|
| Routes declared | 31 | `config/routes.config.js`; all 31 have a loader in `core/boot.js:10` |
| Sidebar workspaces (`VisibleWorkspaces`) | 25 | `config/workflow-clarity.config.js` |
| Hidden routes reached from a parent screen | 6 | same file, `HiddenTechnicalRoutes` (`single-assignment`, `bulk-assignment`, `scan-intake`, `archive`, `user-admin`, `endpoint-console`) |
| Modules with a declared boundary | 30 of 31 | `config/module-boundaries.config.js`. `endpoint-console` has none. |
| Governed actions declared | 65 | `config/action-ownership.config.js` |

The header comment of `config/workflow-clarity.config.js:2-8` still says "24 routes are primary sidebar
destinations … The remaining 5 … every one of the 29 declared routes". The file itself declares 25,
6 and 31.

**Who sees what.** Computed from `config/rbac.config.js:7-16` and `VisibleWorkspaces`:

| Role | Sidebar entries | Hidden routes the role may open |
|---|---|---|
| systemAdmin | 25 | all 6 |
| director | 15 | scan-intake |
| operator | 14 | single-assignment, bulk-assignment, scan-intake |
| executive | 13 | archive |
| viewer | 7 | — |
| userAdmin | 5 | user-admin |

Only `systemAdmin` sees all 25 entries; FastTrack SLA and the ERP–ECM Charter are open to no other role.
The overlap is therefore felt most by whoever administers the platform, and the business roles each see a
subset of it.

---

## 2. The three places that describe the structure, and how they disagree

1. **`config/workflow-clarity.config.js`**: the 25 sidebar workspaces with `purpose`, `owns` and
   `handoffs`. `config/nav.config.js` and `shared/shell.js:134-141` build the sidebar from it, so this is
   what users see.
2. **`config/module-boundaries.config.js`**: each module's role, `owns` and `mustNotOwn`. The
   governance layer reads this.
3. **`config/navigation-relationships.config.js`**: a third model. It lists **9** sidebar routes and
   treats Activities, Registry, Lookup, Acknowledgment, Comments, FastTrack, Executive, Reports, Statistics
   and others as hidden. It omits `scan-intake`, `briefs`, `meetings`, `projects` and `admin-suite`
   entirely. Its only runtime consumer is `commandsFromRelationships()` (`shared/relationship-runtime.js:54`),
   and nothing calls that function (`git grep commandsFromRelationships` finds only the definition plus
   documentation and data snapshots under `docs/`). In effect it is an orphaned description that contradicts the live sidebar.
   `scripts/process-docs.mjs:202` still lists it as a source for the generated process documentation.

Contradictions between (1) and (2), each verified line by line:

| Module | `workflow-clarity` says | `module-boundaries` / code says |
|---|---|---|
| My Work | owns "acknowledge, start work, progress, complete action, submit review" (`:47-54`) | `acknowledge` belongs to `acknowledgment` (`module-boundaries:20`, `action-ownership`). The My Work module performs only `complete-action` and `set-reminder` (`modules/orchestrator.js:48,64`). |
| Registry | "registry search across every intake channel" (`:65-72`) | must **not** own `search-retrieval`, which belongs to Lookup (`module-boundaries:14`). Its search covers registry files only (`modules/registry.js:5`). |
| Scan Intake | hidden under Registry because "it produces registry-controlled files" (`:245-248`) | it creates a **correspondence** record (`modules/scan-intake.js` header; it runs `scan-deposit` and `create-correspondence`, reads only `correspondence` and `audit`). Its boundary forbids `registry-custody` (`module-boundaries:13`). |

---

## 3. The root cause: two record sets, each held twice

`core/data-loader.js:19` fetches documents into `activities` (its aliases include `correspondence`,
`docs`, `records`) and tasks into `tracking` (aliases `tasks`, `Tracking`). `reconcileEnterprise`
(`core/enterprise-domain.js:13`) then builds a second, enriched copy of each:

| Fetched collection | What it is | Derived copy | How the copy takes its status |
|---|---|---|---|
| `activities` | incoming documents | `correspondence` | `status: old.status \|\| (treated ? 'In Treatment' : 'Received')` (`:8`) |
| `tracking` | tasks | `operations` | `status: old.status \|\| mapTaskStatus(t.status)` (`:9`) |

`old.status` wins. Once a derived record has a status, a later change on the fetched record never reaches
it. `operations` is never fetched (it isn't one of the collections in `core/data-loader.js:19`), and the
loader reconciles `{...current, ...patch}` (`:66`). So the stale copy also survives a full refresh from
the server. Both drifts are reproduced in §8.1 and §8.2.

Which screen lists which copy:

| Screen | Documents | Tasks |
|---|---|---|
| Intake & Assignment (`correspondence`) | `correspondence` (falls back to `activities`) `modules/correspondence.js:25` | — |
| Activities, "Activity records" view | `activities` (`modules/activities.js:34`) | — |
| Activities, "Work queue" view | — | `operations` (falls back to `tracking`) `modules/activities.js:18` |
| My Work (`orchestrator`) | — | `tracking`, not filtered by user in the client (`modules/orchestrator.js:14`) |
| Acknowledgment Queue | — | `tracking` |
| Tracking & Monitoring | `activities` tab | `tracking` tab (plus comments and linked tabs) |
| FastTrack SLA | `activities` (email pairs) | `tracking` (risk) |
| Command Center | `activities` | `tracking` |
| Dispatch | — | `tracking` where completed or dispatching |
| Lookup | `activities`, `emails` | `tracking` |

So at least ten screens list the same two record sets, and two of those lists read the copy that can be
out of date.

---

## 4. Findings

Each finding states the evidence, the effect on a user, and its severity. **Defect** means the
behaviour is wrong today. **Overlap** means two places do the same job. **Confusion** means naming or
placement misleads.

### F-1 Activities holds no data of its own · Overlap · High

`modules/activities.js:11-13`: "Two lenses share this workspace." The **Work queue** view is the task
list, with scopes *My work / Overdue / Escalated*. That is My Work's list, Acknowledgment's list,
Tracking's tasks tab and FastTrack's risk list over the same `tracking` records. The **Activity records**
view is the incoming-document list with *Treated / Not Treated* tabs (`config/activity-parity.config.js:27`)
and lifecycle routing to the DGOFASTTRACK queue (`:11`). Those are Intake's documents. The module's
own boundary says it is an "activity-lens" that must not own `intake-master` (`module-boundaries:8`).
That is accurate: it is a lens, and it duplicates two other lenses.

### F-2 The same task or document shows two different statuses · Defect · High

Mark a task Completed in My Work (or update it in Lookup, or acknowledge it). `updateTaskState`
(`core/enterprise-domain.js:31-37`) changes `tracking` only, so Activities' Work queue, which reads
`operations`, keeps the old status, even after a server refresh (§3, §8.1). Likewise, when the Activity
records view routes a document and marks it *Treated* (`core/activity-parity.js` `buildDgoPatch`),
Intake, which reads `correspondence`, keeps *Received* (§8.2). A user who checks two screens gets two
answers.

### F-3 Four ways to change a task, which behave differently · Defect + Overlap · High

| Path | Action (owner) | What it writes | Notifies on owner change | Server call | Server outcome |
|---|---|---|---|---|---|
| My Work, "Mark Completed" | `complete-action` (orchestrator) | `tracking` via `updateTaskState` (`modules/orchestrator.js:48-52`) | n/a | **none** | stays on the device |
| Lookup, "Update this task" | `update-task` (orchestrator, Lookup allowed) | `tracking` via `updateTaskState` | n/a | `update_task` via `WriteManager.backend` | `update-task` is implemented |
| Activities, "Update work state" | `update-operation` (activities) | `operations` **and** `tracking` directly, including `assignedTo` (`modules/activities.js:20`) | **no** | `invoke('DYNAMIC_ACTIONS',{action:'transition',…})` | **refused, 400 UNKNOWN_OPERATION** (below) |
| Assignment Desk, reassign | `assign-one` / `reassign` (single-assignment) | the assignment write | yes: `reassign` sends `StaffNotices.reassignment` | `SINGLE_ASSIGNMENT` | — (not examined here) |

- `update-operation` and `update-task` are declared with the same service, `updateTaskState`
  (`config/action-ownership.config.js:81,87`). The Activities handler doesn't call it; it patches state
  itself. `complete-action` is declared as `governedTransition` (`:42`), but the handler calls
  `updateTaskState`.
- `executeOwnedAction` audits and re-throws; it does not sync (`core/action-authority.js:67-85`).
  `State.patch` persists locally and notifies listeners only (`core/state.js:21`). I found no other code
  that sends My Work's completion to the server. Searched: `State.on(` has one listener
  (`shared/shell.js:63`, navigation refresh); `executeOwnedAction` has no backend step.
- **Why `transition` is refused.** `DataClient` sends `{action:'dynamicGlobalAction', payload}` with no
  `operation` (`core/data-client.js:29`). The flow takes `payload.action` when `operation` is empty and
  replaces `_` with `-` (`Compose_Dynamic_Operation`). The package the tenant runs is
  `packages/identification-phase4/DYNAMIC_ACTIONS__…31c0aaf0.paste.json`, per
  `registers/identification-paste-ledger.json` (2026-10-10). In that package `Compose_Dynamic_Kind`
  implements only `update, update-task, transitionstatus, logauditevent, register, upsert-record,
  open-file, move-file, link, void, reparent, merge`. It recognises `archivereference, dispatch,
  dispatchoutbound`. Everything else is `unknown` and answered **400 UNKNOWN_OPERATION**
  (`Case_Gate_Unknown`). `transition` is in neither list.
- A failed write is queued as retryable (`core/data-client.js:29`, `PendingQueue.enqueue(…retryable:true)`),
  so the retry will be refused the same way.
- `start-work` is declared (`config/action-ownership.config.js:41`) but no module, core or shared file
  invokes it (`git grep "'start-work'"` finds only config and documentation). The same is true of
  `archive-file` (`:80`).

### F-4 Two authorities set the same correspondence decision · Overlap · Medium

The Executive hub's decisions call `setCorrespondenceStatus(…, 'Accepted' | 'Declined' | 'Delegated')`
(`modules/executive.js:31`). Delegation e-mails the delegate (RN-036, `StaffNotices.delegation`).
Intake's triage form offers exactly the same statuses: `statusList=['Pending','Accepted','Declined',
'Delegated','Archived']` (`modules/correspondence.js:23`). It also writes `setCorrespondenceStatus`, and
`modules/correspondence.js` contains no staff-notice call (`grep -c StaffNotice` → 0). So a record
delegated from Intake is delegated without the e-mail the Executive path sends, and nothing in the record
says which path decided it. Each route's role gate still applies (Executive: `executive` role; Intake:
`director`, `operator`).

### F-5 Intake's quick status buttons are refused by the server · Defect · High

`quickStatus` (`modules/correspondence.js:145`) is behind "Mark Accepted" and the Archive button. It sends
`delete_record` for Archive and `update_status` for any other status. Those reach the flow as
`delete-record` and `update-status`. Neither is in the running package, so both are **400
UNKNOWN_OPERATION** (same evidence as F-3). The local change is kept and the user is told "Saved on this
device — it will reach the registry when the connection returns". That will not happen. Intake's full
triage form doesn't work either (corrected in revision 2). It sends `upsert_record`, an implemented
operation, but the flow refuses it for a missing `entityType`; see F-16 and §8.4.

**How it happened.** Release 19 (2026-10-08) removed both operations because they had "no caller
anywhere" (`registers/identification-release.json:153`, `evidence/2026-10-08-closure-operations.json:1370`,
`scripts/build-identification-phase4.mjs:1378`). The caller exists. It is spelled with underscores
(`'delete_record'`, `'update_status'`), which a search for the hyphenated names doesn't match, and it is
present in `modules/correspondence.js` in the earliest commit in this clone (`360e338`, 2026-10-06).
It is also documented in `contracts/INTERNAL_PLATFORM_FLOWS.md:374`. See §9 for how this relates to
ITEM-25.

The Archive button also says "Archive this official record" and sends `delete_record`. "Archive" means four
different things on four screens:

| Screen | Button | What it does |
|---|---|---|
| Intake | Archive | status `Archived`, and asks the server to `delete_record` |
| Activities, Activity records | archive lifecycle (`activity-archive`) | routes the document to the DGOFASTTRACK queue and marks it *Treated*. The boundary comment says this is **not** archive execution (`module-boundaries:4-7`). |
| Correspondence Email Desk | Archive | `archive-correspondence-email`, sets the letter's status to `archived` (`core/correspondence-email-service.js`, `archive`) |
| Archive Evidence | Archive this reference | `archive-reference`, the immutable closure bundle (`ArchiveService`) |

### F-6 Intake, Scan Intake and Registry: wrong placement and unreachable parents · Confusion · Medium

- Scan Intake creates a correspondence record (§2, last table), yet it is hidden under **Registry**
  rather than Intake.
- Directors may open `scan-intake` but not `registry` (`config/rbac.config.js:13`). The declared parent
  doesn't appear in their sidebar, and Intake doesn't link to Scan Intake (`modules/correspondence.js`
  links to single-assignment, bulk-assignment and registry). They can reach it only by direct link or the
  command palette.
- The same applies to Archive: hidden under Dispatch (`workflow-clarity:249`). Executives may open
  `archive` but not `dispatch` (`rbac:12`).

### F-7 "Registry" means three things · Confusion · Medium

1. The **Registry** workspace (file jackets, custody, movement).
2. The **backend data store**: "Records refreshed from the registry", "Synchronising with the registry…"
   (`shared/shell.js:246-253`), "it will reach the registry when the connection returns" (Intake, My Work,
   Lookup and others).
3. The **registry mailbox and office**: "staff notices go to the registry mailbox"
   (`core/staff-notice-service.js:36`). The bootstrap administrator is a user named "Registry"
   (`core/state.js:2`).

`grep -rnoE "(from|with|to|reach|reached) the registry" modules shared core` returns **68 matches in 26
files**. An Intake user who reads "from the registry" can't tell it doesn't mean the Registry workspace
next to it in the sidebar.

### F-8 My Work and Acknowledgment split one job · Overlap · Medium

Acknowledging is the first step of doing assigned work, but it lives on a separate screen. My Work links
to the Acknowledgment Queue (`modules/orchestrator.js:75`), and the Queue links back to `#/orchestrator`
(`modules/acknowledgment.js`). My Work's header says "The tasks
assigned to you", but its list is every `tracking` row matching the search box (`modules/orchestrator.js:14`).
Activities' *My work* scope does filter by owner. The server may scope what `FETCH_ALL` returns (not
verified here; §10). My Work's "Open Comments" goes to `#/comments`, which only `operator` (and
`systemAdmin`) may open (`rbac:12-15`). Executives, directors and viewers get the access-denied page
(`core/router.js:31`).

### F-9 "Overdue" is counted in several places, two ways · Overlap · Low–Medium

- Command Center and the Executive hub: `due < now && status !== 'Completed'` on `tracking`
  (`modules/home.js:21`, `modules/executive.js:29`). A *Closed* task past its due date counts as overdue.
- Activities: `dueDate < now && !['Completed','Closed']` on `operations` (`modules/activities.js:18`).
  Closed doesn't count, and the status comes from the copy that drifts (F-2).
- FastTrack SLA: its own `risk()` → *Breached*.

The same label can therefore show different numbers on different screens for the same tasks.

### F-10 "FastTrack" means two unrelated things · Confusion · Low

**FastTrack SLA** (route `fasttrack`) is the SLA-risk view of tasks. Its `fasttrack` action sets
`fastTracked:true, priority:'urgent'`. **DGOFASTTRACK** (`config/activity-parity.config.js:11`) is the
queue tag the Activity records view writes when routing a document to the Global Tracking Queue (SIWES,
NYSC, archive). Both are called FastTrack, but they share neither data nor purpose.

### F-11 Three outbound surfaces, two of them inside the platform · Overlap · Medium

- **Dispatch** records that something went out. Its channels are *Internal Memo, Email, Courier, Portal
  Upload* (`modules/dispatch.js:9`). It states "It sends nothing: send the letter through the DGO
  Correspondence Mailer" (`:31`).
- **Correspondence Email Desk** does send, through `EMAIL` (`core/correspondence-email-service.js:67`),
  and then writes a `dispatches` row with channel *Email* (`:73`).
- **DGO Correspondence Mailer** is a separate application (`mailer/`, `config/platforms.data.js:79`).

Dispatch directs users to the external Mailer, not to the Email Desk in the same sidebar group. Both
in-platform screens write the same `dispatches` collection.

### F-12 Three decision screens · Overlap (UX only) · Low

Review & Approval (`approvals` records), the DGCEO hub (correspondence decisions) and Briefs (brief
packs) decide **different record types**, so the data is not duplicated. What is duplicated is the
"what is waiting for my decision" inbox, spread over three entries for the `executive` role.

### F-13 Reports and Statistics build the same reports two ways · Overlap · Medium

Both offer the identical template list `['M1' … 'M10']` (`modules/reports.js:11`,
`modules/statistics.js:10`). Both e-mail a report through `EMAIL` (`modules/reports.js:50`,
`modules/statistics.js:48`). Statistics builds rows with the shared `core/report-export-service.js`;
Reports doesn't import it. Statistics' boundary forbids `formal-report-generation`
(`module-boundaries:30`). Neither module runs a governed action. `generate-report` is only audited inside
`core/report-export-service.js` (`createJson`/`createHtml`), and neither module calls those.

### F-14 The "one interface" for administration is one of five · Overlap · Low

Admin Suite opens with "ONE INTERFACE, BECAUSE THE ALTERNATIVE WAS EIGHT" (`modules/admin-suite.js:3`).
Administration (`settings`), System Health (`diagnostics`) and Operator HUD (`operator-hud`) are still
separate sidebar entries in the same SYSTEM group; Endpoint Console and User Administration are hidden
routes. Administration mixes personal preferences (profile, theme, density) with endpoint configuration.

### F-15 Configuration hygiene · Confusion · Low

- `navigation-relationships.config.js` is an orphaned third model (§2).
- The `workflow-clarity` header counts are stale (§1).
- `endpoint-console` has no boundary entry (§1).
- The declared services in `action-ownership` don't match the handlers for `update-operation` and
  `complete-action` (F-3).

### Second pass (revision 2)

### F-16 Almost every write the screens send to the server is refused · Defect · Critical

I ran the client's own payloads, wrapped exactly as `core/data-client.js:29` sends them, through
`scripts/lib/wdl-sim.mjs` against the Dynamic Actions package the paste ledger says the tenant runs. The
harness and mocked SharePoint are the repository's own, from `tests/identification-phase4.test.mjs`.
Result (§8.4):

| Screen action | Sent as | Result |
|---|---|---|
| Intake create, Intake triage form, Scan Intake sync | `upsert_record`, `module:'DGCEO_Tracker'`, record under `data` | **400** "upsert_record needs entityType MIN, BRF, MTG, PRJ or APR." |
| Briefs create, Meetings request, Meetings actions → tasks, Projects create/update | `upsert_record`, record under `data` | **400**, same message |
| Briefs or Meetings submit/decide | `transition_status`, client id as `ref` | **404** TARGET_NOT_FOUND (the record was never created on the server) |
| Intake Mark Accepted / Archive | `update_status` / `delete_record` | **400** UNKNOWN_OPERATION |
| Activities Update work state | `transition` | **400** UNKNOWN_OPERATION |
| Registry route file | `route` | **400** UNKNOWN_OPERATION |
| DG/CEO append minute | `appendMinute` | **400** UNKNOWN_OPERATION |
| My Work set reminder | `operation:'create'` | **400** UNKNOWN_OPERATION |
| Lookup update task (control) | `WriteManager.backend`, `operation:'update-task'` | **200** |

The flow reads `entityType`, `title` and `entityKey` from the top level of the payload (`Compose_Dynamic_Input`),
and `upsert-record` accepts only MIN, BRF, MTG, PRJ and APR (`Compose_Dynamic_Invalid`). No client code sends
`entityType` in a payload (`grep -rn entityType modules core` finds only local normalisers and audit). Every
refusal happens at the gate, before any SharePoint call, so the mock's fidelity doesn't affect these results.
Each refused write is queued as retryable (F-22). The user is told "Saved locally; synchronization queued"
or similar, and the server never accepts it.

### F-17 Local-only changes are wiped at the next refresh · Defect · Critical

These actions write nothing to any server record. Some send an email notice through `EMAIL`, which
records nothing:

- My Work "Mark Completed" (`modules/orchestrator.js:48-52`)
- Comments "add" (`modules/comments.js:47`)
- Review & Approval create, approve and reject (`modules/approvals.js:32,43`)
- FastTrack apply, escalate and resolve (`modules/fasttrack.js`)
- Registry register, receive and close (`modules/registry.js`)
- Dispatch close (`modules/dispatch.js:64`)
- DG/CEO accept, decline and delegate (`modules/executive.js`, `update()`)

`tracking`, `comments` and `approvals` are fetched collections that every load **replaces**: `replace`
defaults to `true` (`core/data-loader.js:66`), no caller passes `false`, and those specs carry no `merge`
flag (`:19`). Running the real loader (§8.5): a task completed in My Work returns to *In Progress*, a new
comment disappears, and an approved request returns to *pending*, all at the next refresh. Nothing is
queued, so System Health shows nothing. Changes held only in the derived copies (`correspondence`,
`operations`) survive, but only on that device (F-2). Two officers therefore see different statuses for
the same record.

### F-18 Approval and DG/CEO decisions are emailed but never recorded · Defect · Critical

Approve or reject patches local state and sends the decision email (`StaffNotices.approvalDecision`). The
toast says "Request approved — the decision is recorded" (`modules/approvals.js:43-44`). The DG/CEO hub's
accept, decline and delegate are the same: a local patch plus, for delegation, an email
(`modules/executive.js`, `update()` and `decide`). By F-17, an approval reverts to *pending* at the next
refresh, after the requester has already been emailed the decision.

### F-19 The "immutable" archive is held in memory only · Defect · High

`ArchiveService.archiveReference` builds a hashed, frozen closure bundle and stores it with
`Entities.archive`, in an in-memory `Map` (`core/entity-store.js`, `_archive`). `clear()` empties that map
(`core/entity-store.js`), and `hydrateFromState` calls `clear()`. The runtime load calls
`Entities.hydrateFromState` (`core/data-loader.js:72`, `loadRuntimeData`).
The only restore function, `restoreSnapshot`, has no caller (`git grep restoreSnapshot` → its definition
only). The server operation `archivereference` is recognised but not served (ITEM-25 decision). So "Archive
this reference" produces a bundle that lasts until the next refresh or page reload. This is from reading the
code; it wasn't executed.

### F-20 Six ways to create or assign a task · Overlap + Defect · High

| Path | Reaches the server | Notes |
|---|---|---|
| Intake → embedded Assignment Desk (`assign-one`) | `SINGLE_ASSIGNMENT` | the governed path |
| Bulk Assignment | `BULK_ASSIGNMENT` | OTP-protected |
| Lookup → raise task from email | `EMAIL_RELATED_TASK` | |
| Meetings → actions to tasks | refused, 400 (F-16) | tasks exist only on this device |
| Activities → change owner in "Update work state" | refused, 400 (F-3) | no notice to the new owner |
| DG/CEO → "Route to Assignment" | nothing | collects assignee, department, priority and notes, then keeps only `selectedId` and opens `#/single-assignment` (`modules/executive.js:33`). The Assignment Desk reads only `selectedId`. The executive role isn't allowed `single-assignment` (`config/rbac.config.js:12`), so it ends at the access-denied page with the input discarded. |

### F-21 Screens link to routes the role can't open · Defect · Medium

No module checks access before showing a link (`grep -l canCurrentUserAccess modules/*.js` → none). The
shell filters only the sidebar and the "Continue in" strip (`shared/shell.js:135,445`). Comparing every
`#/route` link in each module with `config/rbac.config.js` gives **25** role/screen pairs where a link leads to
the access-denied page. Examples:

- Command Center shows "Open Activities Lens" and "Open FastTrack" to every role. Only directors and
  operators may open Activities, and only systemAdmin may open FastTrack.
- My Work, Acknowledgment and Lookup link executives, directors and viewers to the Assignment Desk, which
  they can't open.
- Tracking links executives, directors and viewers to Registry.
- Scan Intake links directors and operators to System Health.

### F-22 The retry queue treats a refusal as a lost connection · Defect · Medium

`DataClient` queues every failed write as `retryable:true` (`core/data-client.js:29`), including a 400 that
will be refused identically each time. The queue keeps the newest 250 entries and drops older ones without
an audit record (`core/pending-queue.js:5`, `.slice(0,250)`). It replays an item for up to 7 days
(`REPLAY_LIMIT_MS`). With F-16 and F-17, a busy desk fills the queue with writes that can never succeed, and
those can push out writes that failed only because the network dropped.

### F-23 DG/CEO decisions write back a stale snapshot · Defect · Low–Medium

`update()` in `modules/executive.js` ends with `State.patch({correspondence: s.correspondence, tracking:
s.tracking, approvals: s.approvals, comments: s.comments, audit: s.audit})`, where `s` is the snapshot taken
when the screen was drawn. The shell's Sync (`shared/shell.js:244-254`) loads fresh data but doesn't redraw
the screen. Sync, then decide, and the newly loaded tasks, approvals and comments are overwritten with
their pre-sync copies.

### F-24 Two registers of files · Overlap · Medium

The flow implements `register`, `open-file` and `move-file`, and FETCH_ALL returns the server's registry
files (`files`, merged into `registryFiles` at `core/data-loader.js:26`). The Registry screen writes none of
them. Register, receive and close are local-only, and route sends `route`, which is refused (F-16). The
Registry list therefore mixes server rows that no screen created with device-local rows the server never
receives. `config/platform-provisioning.config.js:179-183` names actions (`register`, `move`, `receive`,
`minute`, `close-file`) that match neither the client's nor the flow's names.

---

## 5. What is not duplication

Not everything that looks alike is a problem. These stay as they are:

- **Registry as file custody.** Registering a file, recording who holds it, and moving and closing it
  (`register-file`, `route-file`, `receive-file`, `close-file`) is a distinct record type
  (`registryFiles`, `fileMovements`, `registryMinutes`). No other screen does it.
- **Lookup** as the one place to find any record by reference and act on it. The actions it borrows are
  registered `allowedInvokers` (`config/action-ownership.config.js:86-88`) and keep their owners.
- **Assignment inside Intake.** `mountAssignmentForm` from `single-assignment` is already embedded in
  Intake (`modules/correspondence.js:18,94`). That consolidation was done correctly.
- **Briefs, Meetings, Projects.** Distinct record types ported under D6(b).
- **Per-screen list filters.** A search box over a screen's own list is normal. Only cross-record search
  belongs in Lookup.
- **Command Center** as a summary that routes elsewhere.

---

## 6. Proposed structure

Principles: (1) one screen per stage of the work; (2) action owners, `allowedInvokers`, the role
table and the audit vocabulary are unchanged, so tabs inside a screen keep each owner's governance;
(3) one copy of each record set; (4) one meaning per word.

| Target workspace | Brings together (current routes) | Tabs or views, each gated by the role table |
|---|---|---|
| **Command Center** | `home` | unchanged |
| **Intake** | `correspondence` + Activities *Activity records* + `scan-intake` (+ embedded `single-assignment`, `bulk-assignment`) | *To triage* (one document list, source filter: portal / email / counter / scanned) · *Counter deposit* · *Routed* (Treated). Lifecycle routing (SIWES/NYSC) becomes a triage outcome. |
| **My Work** | `orchestrator` + `acknowledgment` + Activities *Work queue* | *Mine* (default; acknowledge → start → update → complete) · *Team* · *Overdue* · *Escalated*. One update form, one action path. |
| **Registry** (file custody only) | `registry` | unchanged; purpose text corrected (F-6, §2) |
| **Lookup** | `lookup` | unchanged |
| **SLA & Tracking** | `response-tracking` + `fasttrack` | *Monitoring* · *SLA risk* (renamed from FastTrack SLA, F-10) |
| **Decisions** | `approvals` + `executive` + `briefs` | *Approvals* · *DG/CEO* · *Briefs* |
| **Meetings** | `meetings` | unchanged |
| **Projects** | `projects` | unchanged |
| **Outbound** | `dispatch` + `correspondence-email` (+ `archive` as the closing step) | *Send by email* · *Record a dispatch* · *Close & archive* |
| **Insight** | `reports` + `statistics` | *Statistics* · *Reports*, one report engine (`core/report-export-service.js`) |
| **Admin Suite** | `admin-suite` + `settings` (endpoint part) + `diagnostics` + `operator-hud` (+ `endpoint-console`, `user-admin`) | the existing suite tabs plus *Health* and *Runtime* |
| **Assistant** | `assistant` | unchanged |

Also:

- **Comments** becomes a panel on every record and leaves the sidebar. The route stays for deep links,
  and its role list is widened to the roles that can see the record (fixes F-8).
- **Personal preferences** (profile, theme, density) move to the identity menu.
- **ERP–ECM Charter** is a reference document (`modules/ecm-erp-charter.js` runs no action and reads no
  state). It moves to help or reference, unless the owner wants it kept in START HERE.

**Result.** The full (`systemAdmin`) sidebar goes from 25 entries to 13. Per role, computed by
showing a target workspace when the role may open at least one route inside it: director 15 → 11,
operator 14 → 10, executive 13 → 10, viewer 7 → 5, userAdmin 5 → 2. Executives see Outbound only
because `archive` moves into it, so they would see only its *Close & archive* tab. Every route stays
loadable, so existing deep links keep working, and each old route redirects to its new tab.

---

## 7. Sequence

Each phase can ship and be checked on its own. Phase 0 changes no navigation.

**Phase 0: fix what is wrong today, with no package release.** All of these are client-side, in line
with the rule that a package is released only for a defect found in the tenant (CLAUDE.md).

1. F-5 and F-16 (corrected in revision 2): an incoming document is a REC record, and the running flow has no
   update for one through `upsert-record`, which accepts only MIN, BRF, MTG, PRJ and APR. Changing
   Intake's status needs an owner decision between two options: a Flow Configuration or package change that
   gives REC status an operation, or Intake writing through an operation that already exists for it. That
   choice belongs ahead of any client patch. For Briefs, Meetings, Projects and minutes, the client fix is
   to send `entityType`, `title` and `entityKey` at the top level of the payload, which the flow already
   accepts. Each fix is confirmed with the simulator harness in §8.4 before it ships.
2. F-3: route Activities' update through `updateTaskState` and an implemented operation (`update-task`). If
   the owner changes, send it through `reassign` so the notice goes out. Give My Work's completion the same
   server write Lookup's update already has.
3. F-2: stop `old.status` overriding the fetched status in `enrichOperation` and `enrichCorrespondence`
   (`core/enterprise-domain.js:8-9`). Alternatively, retire the derived copies once Phase 2 has removed
   their only readers.
4. F-4: require the delegation notice on Intake's *Delegated*, or remove the executive outcomes from
   Intake's list.
5. F-8: widen `comments` access, or hide "Open Comments" for roles that can't open it.
6. Correct the stale text: `workflow-clarity` header, Registry and Scan Intake purposes, and Dispatch's
   pointer to the Mailer.
7. F-17, F-18 (revision 2): give approvals, comments, My Work completion and the DG/CEO decisions a server
   write, or label them plainly as drafts on this device. A decision email is sent only after the decision is
   recorded on the server.
8. F-22: queue only failures that can succeed later (network, timeout, 5xx). Show a 4xx to the user and
   don't retry it. Record an audit event when the 250 cap drops an entry.
9. F-19: stop calling a bundle "immutable" while it lives in memory. Persist it, or don't offer the action
   until `archivereference` has a target (ITEM-25 decision).
10. F-20, F-21, F-23: pass the DG/CEO's routing input through, and show the button only to roles that can
    assign; hide links a role can't open; redraw a screen after Sync, or patch only what changed.

Checks: `npm run test:node`, the Playwright suite, and a `DYNAMIC_ACTIONS` operation-name check that
fails when a client sends an operation the running package doesn't implement. That check would have caught
F-3 and F-5. `docs/folio-Master-Flows-and-Endpoints/deployment/internal/dynamic-operations.json` already
derives the client's operation list, but only from `WriteManager.backend` calls
(`scripts/derive-dynamic-operations.mjs:16-19`). Its 19 operations include none of the spellings sent by
direct `invoke('DYNAMIC_ACTIONS', {action: …})` calls: `upsert_record`, `update_status`, `delete_record`
and `transition` are all absent. That gap fits how release 19's "no caller" search missed the Intake
caller, though this report can't show which search that release used.

**Phase 1: one meaning per word.** Rename the screen *FastTrack SLA* to *SLA risk*, and use "server" or
"records" instead of "registry" for the backend in user-facing text (F-7, F-10). Retire
`navigation-relationships.config.js`, or make it the generated output of `workflow-clarity` (F-15).

**Phase 2: merge screens** in this order, smallest risk first: Insight → Outbound → SLA & Tracking →
Decisions → Admin Suite → My Work → Intake. Activities is retired last, once both of its views live in
Intake and My Work. Each merge updates `workflow-clarity`, `HiddenTechnicalRoutes`, the role table and the
generated `docs/process/` set through its generator, never by hand.

**Phase 3: one copy of each record set.** Remove `operations` and `correspondence` as separate stored
collections, or make them non-persisted views. No screen then reads a copy that can drift.

---

## 8. Reproductions and how the counts were made

All scripts ran against `e525dac` with Node 22. They import the platform's own modules and change nothing.

### 8.1 Task status drift (F-2)

```js
// run from the repository root
globalThis.localStorage={getItem(){return null},setItem(){},removeItem(){}};
globalThis.window=globalThis; globalThis.document={addEventListener(){},querySelector(){return null}};
const ED=await import(process.cwd()+'/core/enterprise-domain.js');
let st={activities:[],tracking:[{id:'T1',referenceId:'R1',title:'x',status:'In Progress',due:'2026-01-01'}],correspondence:[],operations:[],audit:[]};
let r=ED.reconcileEnterprise(st); st.operations=r.operations;
const u=ED.updateTaskState(st,'T1',{status:'Completed'},'a@b',{surface:'orchestrator'}); st={...st,...u.patch};
r=ED.reconcileEnterprise(st); st.operations=r.operations;
console.log(st.tracking[0].status, st.operations[0].status);
```

Output: `after load: tracking= In Progress operations= In Progress` → `after My Work complete: tracking=
Completed operations= In Progress` → `after re-reconcile: tracking= Completed operations= In Progress`.

### 8.2 Document status drift (F-2)

Same harness: an activity `Not Treated` → Intake `Received`. Set the activity to `Treated` (what
`buildDgoPatch` writes) and reconcile → activity `Treated`, Intake still `Received`.

### 8.4 Client payloads through the flow simulator (F-16)

Take lines 1–422 of `tests/identification-phase4.test.mjs`, which set up the phase-4 Dynamic Actions package,
the mocked SharePoint and `runDA`, with import paths made absolute. Then append:

```js
const W = (payload) => ({ action: 'dynamicGlobalAction', payload });            // core/data-client.js:29
const WM = (action, ref, p) => W({ operation: action, ref, idempotencyKey: 'idem-' + action, ...p }); // WriteManager.backend
for (const [label, body] of [
  ['Intake triage form', W({ action: 'upsert_record', module: 'DGCEO_Tracker', data: { id: 'NITDA-2026-00019', subject: 'Letter', status: 'Accepted' } })],
  ['Intake Mark Accepted', W({ action: 'update_status', data: { id: 'NITDA-2026-00019', status: 'Accepted' } })],
  ['Activities Update work state', W({ action: 'transition', ref: 'TASK-2026-00421', status: 'In Progress' })],
  ['Registry route file', W({ action: 'route', ref: 'NITDA-2026-00012', to: 'DSU-1' })],
  ['Briefs create', W({ action: 'upsert_record', module: 'DGCEO_Briefs', data: { id: 'BRF-1', title: 'Brief' } })],
  ['Lookup update task', WM('update-task', 'TASK-2026-00421', { action: 'update_task', id: '9', status: 'In Progress' })],
  // … the full list is in F-16
]) { const x = runDA(body, { keep: false }); console.log(label, x.r.statusCode, x.d.code, x.d.message); }
```

Output, one line per probe: 400 INVALID_REQUEST "upsert_record needs entityType…" for every `upsert_record`;
400 UNKNOWN_OPERATION for `update-status`, `delete-record`, `transition`, `route`, `appendminute` and `create`;
404 TARGET_NOT_FOUND for `transition_status` on a client id; 200 for Lookup's `update-task`.

### 8.5 Local-only changes against the real loader (F-17)

Import `core/state.js` and `core/data-loader.js` with browser globals stubbed. Then:
`applyFetchAll({status:200, data:server})`; complete the task with `updateTaskState`, as My Work does; add a
comment and approve an approval, as their screens do; call `applyFetchAll` again with the same server data.

Output: `task Completed → In Progress`, `comments 1 → 0`, `approval approved → pending`.

### 8.3 Counts

| Count | Command or method |
|---|---|
| 31 / 25 / 6 / 30 / 65 | import `routes`, `workflow-clarity`, `module-boundaries`, `action-ownership` and count keys; compare with the loaders in `core/boot.js` |
| sidebar entries per role | `VisibleWorkspaces` filtered by `RoleRouteAccess` |
| actions each module performs | for each `modules/*.js`, every `action-ownership` key appearing as a quoted literal; cross-checked against `executeOwnedAction(` call sites |
| 68 matches / 26 files | `grep -rnoE "(from\|with\|to\|reach\|reached) the registry" modules shared core` |
| running `DYNAMIC_ACTIONS` operation sets | `Compose_Dynamic_Kind` and `Case_Gate_Unknown` read from the phase4 package named by the paste ledger |

---

## 9. Register position

The register of record is `docs/deployment/PRODUCTION_READINESS_REGISTER.json`. `npm run outstanding`
on `e525dac` reports **6 open, 116 closed** across three sources. This document reopens nothing:

- **ITEM-25** ("15 of 19 DYNAMIC_ACTIONS operations answer 501") is RESOLVED, as of 2026-10-12. Its
  statement, that no operation answers 501, is still true and is not contradicted here.
- **F-5 is a separate defect.** It is a 400 on two operations that release 19 retired, on a premise ("no
  caller") that `modules/correspondence.js:145` contradicts. This file and that line are committed
  evidence dated after the retirement. Under the repository's rules the owner decides whether it becomes a
  new item or a revision. Nothing here edits the register, and the default branch is off-limits to this
  session.
- **Dispatch and archive operations answering 501** were decided under ITEM-25 (owner, 2026-10-07: keep
  them; record a target before serving them). They are mentioned here only as context for F-11 and are not
  re-raised.

---

## 10. Limitations

- **Shallow clone.** 50 commits; the earliest is `360e338` (2026-10-06). "Present since" dates can't go
  further back than that.
- **No tenant access.** Server behaviour is read from the package the paste ledger says the tenant runs,
  not from a live call. A live probe of `update_status`, `delete_record` and `transition` would confirm
  F-3 and F-5, but under the repository's rules it isn't needed to raise them.
- **Server-side scoping not verified.** Whether `FETCH_ALL` already limits `tracking` to the signed-in
  user's records isn't settled here. F-8 says only what the client does.
- **Read from code, not clicked through.** Behaviour was established by reading the code and by the two
  Node reproductions. The browser suite wasn't run against these paths.
- **Role gates in the browser are advisory until sign-in is enforced** (`shared/shell.js`, platform menu
  note). F-6 and F-8 describe what the role table shows and refuses, not a security boundary.
- **Simulator, not tenant.** F-16 comes from the repository's strict simulator and mocked SharePoint, not
  a live call. Every refusal listed is decided at the flow's gate (unknown operation, or validation), before
  any SharePoint step, so the mock doesn't affect them. A live call with one payload would confirm the class.
- **Own flows not re-tested.** `SINGLE_ASSIGNMENT`, `BULK_ASSIGNMENT`, `EMAIL_RELATED_TASK`,
  `ACKNOWLEDGEMENT`, `ACTIVITY_LIFECYCLE`, `EMAIL` and `USER_ADMIN` have their own flows and their own tests.
  They weren't re-run here.

---

## 11. Corrections to revision 1

| Revision 1 said | Correct position | Evidence |
|---|---|---|
| "Intake's full triage form sends `upsert_record`, which is implemented" (F-5) | It is implemented, but refused: 400 for a missing `entityType` | §8.4 |
| Phase 0 step 1: switch the quick buttons to `upsert_record` "should restore" them | It would not. It moves them from one 400 to another. Phase 0 step 1 is rewritten. | §8.4 |
| My Work completion "stays on the device" | Worse: the next refresh wipes it | §8.5 |

---

## 12. Disposition (2026-10-20)

The owner accepted every recommendation and directed that all of it be carried out (2026-10-20). This section records
what was done, on `claude/system-remediation-gaps-ahpmsy`. **No flow package changed** and nothing needs re-pasting: every
write uses an operation the Dynamic Actions package the tenant runs already implements.

### 12.1 How the decisions in Phase 0 were taken

| Open question in §7 | Decision |
| --- | --- |
| How Intake's status reaches the server (step 1) | Three writes the running package accepts, chosen by what the role may write (`core/server-writes.js` `recordDecision`): the document's Treated / Not Treated state (`transition-status`, roles with the correspondence route); an APR decision record naming the document as `OPS:<key>` or `REC:<key>`, with Accepted, Declined, Delegated or Archived (roles with the approvals route); otherwise an audit event. FETCH_ALL returns approvals, so a decision recorded on one device is read back on every other. The record's title says which screen decided it (F-4). |
| Approvals, comments, completion, DG/CEO decisions: server write or draft label (step 2) | Server writes: APR create and decide; a comment is a minute (MIN) on the record's task; completion and start are `update-task`; DG/CEO decisions as above. A comment on a record with no task on the server, and an action on a record that never reached it, is kept and marked **on this device only**. Every decision e-mail goes after the server accepts the decision. |
| Archive bundle (step 4) | Persisted in `state.archives` and restored at every load; the sealing is also written to the audit log. `archivereference` keeps its ITEM-25 position. |
| Intake's Delegated (step 8) | Removed from Intake's choices. Delegation is the DG/CEO hub's, which e-mails the delegate; a delegated record still shows as Delegated in Intake. |
| Comments access (step 9) | Widened to every role that reads records (executive, director, viewer). The server's minute write needs only My Work, which those roles have. |

### 12.2 Findings

| Finding | Disposition |
| --- | --- |
| F-1 Activities holds no data | Retired as a workspace. Its work queue is My Work (Mine, Team, Overdue, Escalated); its record queue is Intake › Routed, which the `activities` route now is. |
| F-2 Two statuses for one record | Fixed. `operations` and `correspondence` are recomputed from the fetched records on every change (`core/state.js`); the server's status decides, and a finer status set on a device stands only while it agrees with it. `operations` is no longer stored. |
| F-3 Four task paths | One path: `update-task` by item ID for My Work, Activities, Lookup and SLA risk. Owner changes go through the Assignment Desk, which notifies. `start-work` is now used (My Work › Start work). |
| F-4 Two decision authorities | One recorder for both, which names the deciding screen; Delegated left Intake. |
| F-5 Intake's quick buttons | Fixed: Mark Accepted and Archive record the decision (no `update_status`, no `delete_record`). Archive no longer says Delete. |
| F-6 Placement | Scan Intake is Intake › Counter deposit; Archive is Outbound › Close & archive, which executives reach. Descriptions corrected. |
| F-7 "Registry" | On-screen text that meant the backend says "the server" (126 lines in 33 files). Registry is the workspace; the registry mailbox keeps its name. |
| F-8 My Work and Acknowledgment | One workspace (My tasks · Acknowledge · Comments); My Work opens on the officer's own tasks; Open Comments shows only where it opens. |
| F-9 Overdue | One definition, `core/work-measures.js`, used by Command Center, the DG/CEO hub, My Work, Activities and SLA risk. |
| F-10 FastTrack | The screen is **SLA risk**; DGOFASTTRACK keeps its name as the routing queue. |
| F-11 Outbound | One workspace (Send by email · Record a dispatch · Close & archive). Dispatch already sent e-mail through the Email Desk (RN-022). |
| F-12 Three decision inboxes | One workspace, Decisions (Approvals · DG/CEO · Briefs); document decisions also appear among the decided approvals. |
| F-13 Reports and Statistics | One engine: Statistics shows trends only and sends formal reports to Insight › Reports. |
| F-14 Administration | One workspace, Admin Suite, with Administration, Health, Runtime, Endpoints and Users as its tabs. |
| F-15 Configuration | `navigation-relationships.config.js` is derived from `workflow-clarity.config.js`; header counts are right; the Endpoint Console has a boundary; declared services match the handlers. |
| F-16 Refused writes | Every screen write is built by `core/server-payloads.js`. `tests/server-writes.test.mjs` runs each through the strict simulator against the running package (35 checks), and fails when any screen sends an operation the package does not know, or calls `invoke('DYNAMIC_ACTIONS')` directly. |
| F-17 Wiped at refresh | Each listed action now writes to the server first; dispatch state is kept in the dispatch records, which a load does not replace; device-only rows are kept and labelled. |
| F-18 Decisions e-mailed, not recorded | Recorded first, e-mailed after. |
| F-19 Archive in memory | Persisted (12.1). |
| F-20 Six ways to make a task | Meetings' agreed actions are reminders (RMD) for their owner, e-mailed on the due date; the DG/CEO routing input travels to the Assignment Desk as its draft, and the button shows only to roles that may open it. |
| F-21 Dead-end links | `core/link-guard.js` hides, on every screen, links and buttons to routes the role cannot open. |
| F-22 Retry queue | A 4xx is shown and not queued or retried; an entry pushed out of the 250-entry queue is audited. |
| F-23 Stale snapshot | Decisions patch the current state, not the screen's snapshot; screens redraw after each load. |
| F-24 Two file registers | Registry opens files with `open-file` (the server issues the file number) and records every route, receipt and closure with `move-file`. |

### 12.3 The sidebar

| Role | Before | After |
| --- | --- | --- |
| systemAdmin | 25 | 13 |
| director | 15 | 11 |
| operator | 14 | 10 |
| executive | 13 | 10 |
| viewer | 7 | 5 |
| userAdmin | 5 | 2 |

Each role sees a workspace when it may open at least one of its tabs (`shared/shell.js`); the other 18 routes are tabs,
so every address still opens.
