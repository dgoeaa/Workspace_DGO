Contents

1. [The answer](#answer)
2. [Critical](#urgent)
3. [Server outcomes](#writes)
4. [Root cause](#cause)
5. [24 findings](#findings)
6. [What stays](#keep)
7. [Proposed structure](#target)
8. [By role](#roles)
9. [Plan](#plan)
10. [Register position](#register)
11. [Corrections](#corrections)
12. [Limitations](#limits)

Internal platform · module review · 18 October 2026

# Internal Platform Module Rationalisation

Intake, Activities and Registry do overlap, and so do eight other groups of screens. A second, more critical pass found something larger behind the overlap: most of what users do on these screens never becomes a server record.

Evidence baseline **e525dac** Source document **docs/architecture/MODULE_RATIONALISATION.md** Branch **ccr-f91e43e3-84lvqh**

## The answer

25sidebar workspaces today

2record sets underneath: documents and tasks

10screens listing those same two sets

14 / 15screen writes refused by the running flow (simulated)

24findings, 11 of them defects

13sidebar workspaces proposed

Each record set is stored twice, and the second copy keeps an old status after the original changes. The same change can be made from two or three screens, and those paths differ in what they write, who they notify, and whether the server accepts the write. The proposed structure keeps every action owner, role rule and audit record as they are. It merges screens that show the same records, and it fixes the defects first, without changing any flow package.

Every claim below cites a file and line or a command in the source document. Counts were produced by script. Two behaviours were reproduced by running the platform's own code. No register, config, module or flow package was changed.

## Critical: work that looks saved but isn't

### What users do here mostly never reaches the server

- **14 of 15 writes to the Dynamic Actions flow are refused.** I sent the client's exact payloads through the repository's own flow simulator, using the package the tenant runs. Every `upsert_record` fails for a missing `entityType`: Intake create and triage, Scan Intake, Briefs, Meetings, Projects. Six other operations are unknown to the flow. Only Lookup's task update is accepted.
- **Local-only changes are wiped at the next refresh.** A task completed in My Work returns to "In Progress", a new comment disappears, and an approved request returns to "pending". This was reproduced with the platform's own loader.
- **Approval and DG/CEO decisions are emailed but never recorded.** The requester is told the outcome, and the record reverts at the next refresh.
- **The "immutable" archive lives in memory.** It lasts until the next data load or page reload.

Users are told "Saved locally; synchronization queued", or "will reach the registry when the connection returns". Refused writes are retried for 7 days and can never succeed. See F-16 to F-19.

## What each screen action does on the server

The client's own payloads, wrapped as `core/data-client.js:29` sends them, run through `scripts/lib/wdl-sim.mjs` against the Dynamic Actions package in the paste ledger. Every refusal is decided at the flow's gate, before any SharePoint step.

| Screen action | Sent as | Result |
| --- | --- | --- |
| Intake create · Intake triage form · Scan Intake sync | `upsert_record`, record under `data` | 400 needs entityType MIN, BRF, MTG, PRJ or APR |
| Briefs create · Meetings request · Meetings actions → tasks · Projects create/update | `upsert_record` | 400 same |
| Briefs or Meetings submit/decide | `transition_status` | 404 record never created on the server |
| Intake Mark Accepted · Archive | `update_status` · `delete_record` | 400 unknown operation |
| Activities Update work state | `transition` | 400 unknown operation |
| Registry route file | `route` | 400 unknown operation |
| DG/CEO append minute | `appendMinute` | 400 unknown operation |
| My Work set reminder | `operation:'create'` | 400 unknown operation |
| Lookup update task (control) | `operation:'update-task'` | 200 accepted |
| My Work complete · Comments · Approvals · DG/CEO decisions · FastTrack · Registry register/receive/close · Dispatch close | nothing (some send an email notice) | Wiped at next refresh where the list is fetched |

Not re-tested here: actions with their own flows (Assignment Desk, Bulk Assignment, raise task from email, Acknowledge, Activities lifecycle routing, Email Desk send, User Admin).

## The root cause: two record sets, each held twice

The platform fetches documents and tasks, then builds an enriched copy of each. The copy keeps its own status once it has one (`old.status` wins in `core/enterprise-domain.js:8-9`). The task copy is never fetched, so the stale status survives a server refresh as well.

Fetchedactivitiesincoming documents

→

Derived copycorrespondenceStatus never refreshes

→

Screens reading documents

Intake (copy)Activities · recordsTrackingFastTrack SLACommand CenterLookup

Fetchedtrackingtasks

→

Derived copyoperationsNever fetched; status never refreshes

→

Screens reading tasks

Activities · work queue (copy)My WorkAcknowledgmentTrackingFastTrack SLACommand CenterDispatchLookup

Highlighted chips read the copy that can be out of date. Sources: `core/data-loader.js:19,66`, `core/enterprise-domain.js:8-13`, and each module's list function.

## Findings

**Defect:** the behaviour is wrong today. **Overlap:** two places do the same job. **Confusion:** naming or placement misleads. Open any finding for its evidence.

F-1Activities holds no data of its ownOverlapHigh

Its "Work queue" view is the task list, with scopes My work / Overdue / Escalated: the same records as My Work, Acknowledgment, Tracking and FastTrack. Its "Activity records" view is the incoming-document list with Treated / Not Treated tabs: the same records as Intake.

`modules/activities.js:11-13` ("Two lenses share this workspace"), `config/activity-parity.config.js:27`, `config/module-boundaries.config.js:8`

F-2The same task or document shows two different statusesDefectHigh

Completing, updating or acknowledging a task changes only the fetched record, so Activities keeps the old status. When Activities marks a document Treated, Intake keeps showing Received. Both cases were reproduced by running the platform's own code under Node.

`core/enterprise-domain.js:8-9, 31-37`; reproduction in §8 of the source document

F-3Four ways to change a task, which behave differentlyDefectOverlapHigh

| Path | Writes | Notifies on owner change | Server outcome |
| --- | --- | --- | --- |
| My Work · Mark Completed | tasks | n/a | No server call |
| Lookup · Update this task | tasks | n/a | Accepted (`update-task`) |
| Activities · Update work state | tasks and the copy, including owner | No | Refused, 400 (`transition`) |
| Assignment Desk · reassign | the assignment | Yes | through `SINGLE_ASSIGNMENT` |

- `start-work` and `archive-file` are declared, but no screen ever uses them.
- A refused write goes on the retry queue, where it is refused again.

`modules/orchestrator.js:48`, `modules/activities.js:20`, `config/action-ownership.config.js:41-42,80-81,87`, `core/data-client.js:29`, running package `identification-phase4/DYNAMIC_ACTIONS…paste.json`

F-4Two places set the same correspondence decisionOverlapMedium

The DG/CEO hub sets Accepted / Declined / Delegated and emails the delegate. Intake's triage form offers the same statuses, writes the same field, and sends no notice. Nothing on the record shows which path decided it.

`modules/executive.js:31`, `modules/correspondence.js:23`

F-5Intake's quick status buttons are refused by the serverDefectHigh

"Mark Accepted" and Archive send `update_status` and `delete_record`, which the running flow answers with 400. Corrected in revision 2: the full triage form fails too. It sends `upsert_record`, which the flow refuses for a missing `entityType` (F-16).

"Archive" also means four different things:

- Intake: sets the status to Archived and asks the server to delete the record.
- Activities: routes the document to the DGOFASTTRACK queue and marks it Treated.
- Email Desk: marks a letter archived.
- Archive Evidence: closes the reference permanently with an evidence bundle.

`modules/correspondence.js:145`, `registers/identification-release.json:153`, `scripts/build-identification-phase4.mjs:1378`

F-6Scan Intake is filed under Registry, and some roles can't reach itConfusionMedium

Scan Intake creates an intake record, not a registry file, yet its parent is Registry. Directors may open Scan Intake but not Registry, so there's no route to it from their sidebar. The same applies to Archive, whose parent is Dispatch: executives may open Archive but not Dispatch.

`config/workflow-clarity.config.js:245-252`, `config/rbac.config.js:12-13`

F-7"Registry" means three thingsConfusionMedium

It means the Registry workspace, the backend ("Records refreshed from the registry"), and the registry mailbox. The phrase appears 68 times across 26 files.

`shared/shell.js:246-253`, `core/staff-notice-service.js:36`; count from `grep -rnoE "(from|with|to|reach|reached) the registry" modules shared core`

F-8My Work and Acknowledgment split one jobOverlapMedium

Acknowledging is the first step of doing assigned work, but it has its own screen. My Work says "the tasks assigned to you", but in the browser it lists every task. "Open Comments" leads executives, directors and viewers to an access-denied page.

`modules/orchestrator.js:14,75`, `config/rbac.config.js:12-15`, `core/router.js:31`

F-9"Overdue" is counted in several places, two waysOverlapLow–Medium

Command Center and the DG/CEO hub count a Closed task past its due date as overdue. Activities doesn't, and it reads the copy that drifts. FastTrack SLA uses its own measure. The same label can show different numbers.

`modules/home.js:21`, `modules/executive.js:29`, `modules/activities.js:18`

F-10"FastTrack" means two unrelated thingsConfusionLow

FastTrack SLA is the deadline-risk view of tasks. DGOFASTTRACK is the queue tag used when a document is routed to SIWES, NYSC or archive. They share neither data nor purpose.

`modules/fasttrack.js`, `config/activity-parity.config.js:11`

F-11Three outbound tools, and Dispatch points to the external oneOverlapMedium

Dispatch records that something went out and says "It sends nothing: send the letter through the DGO Correspondence Mailer", a separate application. The Correspondence Email Desk, in the same sidebar group, does send letters. Both write the same dispatch records.

`modules/dispatch.js:9,31`, `core/correspondence-email-service.js:67,73`, `config/platforms.data.js:79`

F-12Three decision screensOverlapLow

Review & Approval, the DG/CEO hub and Briefs decide different kinds of record, so no data is duplicated. What is duplicated is the "what's waiting for my decision" inbox, which executives have to check in three places.

F-13Reports and Statistics build the same reports two waysOverlapMedium

Both offer the same M1–M10 templates and both email a report. They build it with different code, and Statistics is meant not to produce formal reports at all.

`modules/reports.js:11,50`, `modules/statistics.js:10,48`, `config/module-boundaries.config.js:30`

F-14The "one interface" for administration is one of fiveOverlapLow

Admin Suite opens with "ONE INTERFACE, BECAUSE THE ALTERNATIVE WAS EIGHT". Administration, System Health and Operator HUD are still separate sidebar entries next to it.

`modules/admin-suite.js:3`

F-15Three configs describe the navigation differentlyConfusionLow

- One config lists 9 sidebar routes and leaves out 5 screens. Nothing in the running platform uses it any more.
- The main navigation config says 24 / 5 / 29 in its header but declares 25 / 6 / 31.
- Endpoint Console has no boundary entry.
- The declared services for two task actions don't match their code.

`config/navigation-relationships.config.js`, `shared/relationship-runtime.js:54`, `config/workflow-clarity.config.js:2-8`

F-16Almost every write the screens send to the server is refusedDefectCritical

14 of 15 client payloads are refused by the running Dynamic Actions package; the table above lists each one. The flow reads `entityType`, `title` and `entityKey` from the top level of the payload, but the client nests the record under `data`. No client code sends `entityType`.

`Compose_Dynamic_Input`, `Compose_Dynamic_Invalid` in `identification-phase4/DYNAMIC_ACTIONS…paste.json`; harness from `tests/identification-phase4.test.mjs`

F-17Local-only changes are wiped at the next refreshDefectCritical

My Work completion, comments, approvals, FastTrack, Registry register/receive/close, Dispatch close and the DG/CEO decisions write nothing to any server record. Tasks, comments and approvals are replaced wholesale at every load, so those changes vanish without a trace. Changes held only in the derived copies survive, but only on that device, so two officers see different statuses.

`core/data-loader.js:19,66` (`replace=true`, no merge); reproduced with the real loader

F-18Approval and DG/CEO decisions are emailed but never recordedDefectCritical

Approving sends the decision email, and the toast says "the decision is recorded". At the next refresh the request is back to pending, after the requester has already been told the outcome.

`modules/approvals.js:43-44`, `modules/executive.js` `update()`

F-19The "immutable" archive is held in memory onlyDefectHigh

The hashed closure bundle is stored in an in-memory map that every data load clears. The only restore function has no caller, and the server operation isn't served. The bundle lasts until the next refresh or page reload. This is from reading the code; it wasn't executed.

`core/archive.js`, `core/entity-store.js` (`_archive`, `clear()`, `restoreSnapshot`), `core/data-loader.js:72`

F-20Six ways to create or assign a taskOverlapDefectHigh

- Three reach the server: the Assignment Desk inside Intake, Bulk Assignment, and Lookup's "raise task from email".
- Meetings "actions to tasks" is refused, so those tasks exist only on one device.
- Activities can change a task's owner, but the change is refused and no notice is sent.
- The DG/CEO "Route to Assignment" collects an assignee, department, priority and notes, then throws them away and opens the Assignment Desk. Executives aren't allowed to open that page.

`modules/executive.js:33`, `modules/single-assignment.js` (reads only `selectedId`), `config/rbac.config.js:12`

F-2125 links lead to an access-denied pageDefectMedium

No screen checks access before showing a link; only the sidebar and the "Continue in" strip do. Comparing every link with the role table gives 25 role/screen pairs that dead-end. For example, the Command Center shows "Open FastTrack" to every role, but only systemAdmin may open it.

`shared/shell.js:135,445`; `grep -l canCurrentUserAccess modules/*.js` returns nothing

F-22The retry queue treats a refusal as a lost connectionDefectMedium

A 400 is queued as retryable and replayed for 7 days. The queue keeps only the newest 250 entries and drops older ones without an audit record, so refused writes can push out writes that failed only because the network dropped.

`core/data-client.js:29`, `core/pending-queue.js:5`

F-23DG/CEO decisions write back a stale snapshotDefectLow–Medium

A decision writes back the whole task, approval and comment lists as they were when the screen was drawn. Sync doesn't redraw the screen, so press Sync and then decide, and the freshly loaded data is overwritten.

`modules/executive.js` `update()`, `shared/shell.js:244-254`

F-24Two registers of filesOverlapMedium

The server has a registry-files list and working operations for it (`register`, `open-file`, `move-file`). The Registry screen uses none of them. Its list mixes server rows that no screen created with device-local rows the server never receives.

`core/data-loader.js:26`, `modules/registry.js`, `config/platform-provisioning.config.js:179-183`

## What looks alike but should stay

**Registry, for physical files**Registering, holding, moving and closing file jackets is its own record type. No other screen does it.

**Lookup**The one place to find any record by reference and act on it. The actions it borrows keep their owners.

**Assignment inside Intake**The assignment form is already built into Intake. That merge was done correctly.

**Briefs, Meetings, Projects**Distinct record types, carried over from the retired Activity Hub.

**Each screen's own search box**Filtering a screen's own list is normal. Only search across all records belongs in Lookup.

**Command Center**A summary that sends people to the right screen.

## Proposed structure

One screen per stage of the work. Action owners, role rules and the audit trail don't change; a tab inside a screen keeps its own owner's checks. Every old address keeps working and opens the right tab.

| Workspace | Brings together | Tabs |
| --- | --- | --- |
| **Command Center** | Command Center | unchanged |
| **Intake** | Intake & Assignment, Activities records, Scan Intake | To triage (filter by source) · Counter deposit · Routed |
| **My Work** | My Work, Acknowledgment Queue, Activities work queue | Mine (acknowledge → start → update → complete) · Team · Overdue · Escalated |
| **Registry** | Registry, for file custody only | unchanged; description corrected |
| **Lookup** | Lookup & Direct Action | unchanged |
| **SLA & Tracking** | Tracking & Monitoring, FastTrack SLA | Monitoring · SLA risk |
| **Decisions** | Review & Approval, DG/CEO hub, Briefs | Approvals · DG/CEO · Briefs |
| **Meetings** | Meetings | unchanged |
| **Projects** | Projects | unchanged |
| **Outbound** | Dispatch, Correspondence Email Desk, Archive | Send by email · Record a dispatch · Close & archive |
| **Insight** | Reports, Statistics | Statistics · Reports, built by one report engine |
| **Admin Suite** | Admin Suite, Administration, System Health, Operator HUD, Endpoint Console, User Admin | existing suite tabs plus Health and Runtime |
| **Assistant** | Assistant | unchanged |

Comments becomes a panel on every record instead of a sidebar entry. Personal settings move to the profile menu. The ERP–ECM Charter, a reference page with no actions, moves to Help unless you want it kept.

## Sidebar entries by role

A role sees a new workspace when it may open at least one screen inside it. Executives would see Outbound only for its Close & archive tab.

TodayProposed

## Plan

Each phase can ship and be checked on its own. Phase 0 changes no navigation and needs no flow package release, so nothing has to be re-pasted.

0

### Fix what's wrong today

1. Decide how Intake status reaches the server. The running flow has no update for an incoming-document record through `upsert_record`, so this needs your decision on a configuration or package change before any client patch. For Briefs, Meetings, Projects and minutes, send `entityType`, `title` and `entityKey` at the top level of the payload. Prove each fix in the simulator first.
2. Give approvals, comments, My Work completion and the DG/CEO decisions a server write, or label them plainly as drafts on this device. Send a decision email only after the decision is recorded.
3. Queue only failures that can succeed later. Show a refusal to the user, and record an audit event when the queue drops an entry.
4. Stop calling the archive "immutable" while it lives in memory. Persist it, or hide the action until its server target is decided.
5. Pass the DG/CEO's routing input through; hide links a role can't open; redraw a screen after Sync.
6. Send Activities' update through the working task update; send an owner change through reassign so the notice goes out. Give My Work's completion a server write.
7. Stop the copies keeping an old status (`core/enterprise-domain.js:8-9`).
8. Make Intake send the delegation email, or remove the DG/CEO outcomes from Intake.
9. Let every role that can see a record open its comments, or hide the button.
10. Correct the stale descriptions, and Dispatch's pointer to the external Mailer.
11. Add a check that fails when the platform sends an operation the running flow doesn't implement. That check would have caught F-3 and F-5.

1

### One meaning per word

- Rename FastTrack SLA to SLA risk.
- Say "server" or "records", not "registry", when the text means the backend.
- Retire the unused navigation config, or generate it from the main one.

2

### Merge screens, lowest risk first

- Insight → Outbound → SLA & Tracking → Decisions → Admin Suite → My Work → Intake.
- Retire Activities last, once both of its views have new homes.
- Regenerate the generated docs; never edit them by hand.

3

### One copy of each record set

- Remove the stored copies, or turn them into views that aren't saved, so no screen can show a stale status.

## Register position

`npm run outstanding` on the baseline shows 6 open and 116 closed items. This review reopens none of them. ITEM-25 ("15 of 19 DYNAMIC_ACTIONS operations answer 501") stays resolved, because nothing answers 501. The Intake defect (F-5) is a separate 400 error from operations that release 19 retired on a premise the code contradicts. Whether it becomes a new item is your decision; the register sits on the default branch, which this session didn't edit.

## Corrections to the first version

| First version said | Correct position |
| --- | --- |
| Intake's triage form sends `upsert_record`, which works | It is refused with a 400 for a missing `entityType` |
| Fix the quick buttons by switching them to `upsert_record` | That would move them from one 400 to another. The fix is rewritten in Phase 0. |
| My Work completion stays on the device | Worse: the next refresh wipes it |

## Limitations

- The clone holds 50 commits, the earliest from 6 Oct 2026, so earlier history wasn't checked.
- There was no tenant access. Server behaviour comes from the flow package the paste ledger says is running, not from a live call.
- Whether the server already limits tasks to the signed-in user wasn't checked.
- Behaviour was established by reading code and two Node reproductions, not by clicking through in a browser.
- Role rules in the browser are advisory until sign-in is enforced.
- The write results come from the repository's strict simulator with mocked SharePoint, not a live call. Each refusal is decided before any SharePoint step, so the mock doesn't affect it. One live call would confirm the class.

Full evidence, reproductions and commands: `docs/architecture/MODULE_RATIONALISATION.md` on branch `ccr-f91e43e3-84lvqh`, commit `a05bb75` (revision 2).