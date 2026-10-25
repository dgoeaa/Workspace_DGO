# Folio Workspace: Essentials Map and Decommissioning Candidates

**Requested by the owner, 2026-10-21:** map the interface thoroughly, be rigorous and strict, and treat anything
that is not clear at sight as a candidate for decommissioning, so that only the essentials remain.

**Status: proposal.** Nothing in this document has been changed in the code. Every verdict below is a recommendation,
to be accepted or rejected by the owner. The decisions that need the owner are collected in §9.

**Relationship to earlier work.** [`MODULE_RATIONALISATION.md`](MODULE_RATIONALISATION.md) (2026-10-18, carried out
2026-10-20) merged screens and fixed the server writes behind them. It kept the old organising principle: **one screen
per stage of the work**. This map replaces that principle with the one the platform exists for: **one record, whose
whole life is in one place**. The server writes that rationalisation consolidated (`core/server-writes.js`,
`core/server-payloads.js`) are reused as they are. This map changes where actions are shown, not what they send.

---

## 1. The purpose the interface must serve

The Workspace exists so that the DG's office can coordinate correspondence, documents and tasks from end to end.
Restated as seven jobs, each one step in the life of a record:

| Job | What the office does | Evidence it is core |
|---|---|---|
| **J1 Receive** | Bring in a record from one of the four intakes | `config/entry-points.config.js` declares four: A Public portal, B Email, C Scan or physical counter, D Internal origination |
| **J2 Register and triage** | Give it a reference, classify it, decide whether it needs action | Every intake converges on a registered record |
| **J3 Assign** | Make it a task for an officer, with a deadline | Owner statement: "a single consolidated tasks management" |
| **J4 Work** | Acknowledge, act, write minutes and comments on the task | Owner statement: "all related actions, minutes, or comments are all in one place" |
| **J5 Decide** | Approval, or a DG/CEO decision, where one is needed | APR records and DG/CEO decisions (`core/server-writes.js` `recordDecision`) |
| **J6 Respond and close** | Reply or dispatch, then close and archive | Owner statement: "the entire cycle … closed within the same vicinity" |
| **J7 Oversee** | See what is waiting, late or at risk, and report on it | Command Center and Reports |

Administration of the platform (endpoints, flows, users, health) is necessary, but it is **not office work**. It
belongs to the people who run the platform, not on the screens the office uses.

## 2. The test every element was put through

An element is a platform, a workspace, a tab or a single control (button, link, tab, chip or dropdown). Each one was
asked three questions, in this order:

1. **Does it serve one of J1–J7?** If not: **DECOMMISSION**. Administration and engineering items are the exception:
   they are **RELOCATE**, out of the office's view and into administration.
2. **Is this the only place that step is done?** If not: **MERGE** into the one place where it will live.
3. **Does its label say, in the office's own words, what will happen when it is used?** If not: **RENAME**. If no
   honest label exists, because the element does nothing an officer needs: **DECOMMISSION**.

An element that passes all three questions is **KEEP**. Nothing is kept because it already exists, because it is
well built, or because a test guards it.

| Verdict | Meaning |
|---|---|
| **KEEP** | Essential, in the right place, clearly labelled |
| **RENAME** | Essential, but its label does not say what it does |
| **MERGE → X** | The job is real, but done elsewhere too. It moves into X, and this copy goes |
| **RELOCATE** | Administration or engineering. Removed from office screens, kept for administrators |
| **DECOMMISSION** | Serves no J1–J7 job, or cannot be labelled honestly. Removed |
| **OWNER** | Needs an owner decision before a verdict can be given (§9) |

## 3. How the inventory was taken

- **Method.** The Workspace was run against the seeded development store (`scripts/dev-server.mjs`, 16 documents,
  12 tasks, 5 emails), signed in as `systemAdmin`, the role that sees everything. A headless browser opened each of
  the 31 routes in turn and recorded every visible button, button-styled link, role-button, dropdown, tab and related
  link. The header bar was recorded separately.
- **Totals.** **13 sidebar workspaces, 31 routes, 517 visible controls**: 379 distinct controls per screen once
  per-row repeats are removed, and **270 distinct labels**. The figures do not include controls that appear only
  inside dialogs, inside a selected record on screens that start empty (Assignment Desk, My Work when nothing is
  assigned to the signed-in person), or in the Record a dispatch screen, which drew only its tabs with this data. The
  real totals are higher.
- **Roles.** The other roles see subsets of the same screens (`config/rbac.config.js` `RoleRouteAccess`). An operator
  has 17 routes, a director 17, an executive 15, a viewer 8.

## 4. Findings

### E-1 There is no single record page · Critical

No screen shows a record together with its task, its minutes and comments, its decisions and its closure. One record
passes through up to eight workspaces: Intake → Assignment Desk → My Work → My Work › Comments → Decisions → Meetings
→ Outbound → Close & archive. A search of `modules/` and `shared/` for a record or case view found only partial
detail panes: Intake's *Record details*, the DG/CEO screen's *Correspondence Details*, Acknowledge's task panel, and
Lookup's result. They overlap one another, and none is complete. **This is the root cause of the confusion.** Every
other finding below follows from it.

### E-2 The four intakes are defined three ways, and email is not in the intake list · High

| Source | What it calls the four intakes |
|---|---|
| `config/entry-points.config.js` | Public portal · Email · Scan / physical counter · Internal origination |
| `config/source-views.config.js`, Command Center, filter chips | Physical scans · Customer service emails · Public portal · **DGCEO Outgoing** |
| Intake workspace purpose (`config/workflow-clarity.config.js`) | portal · e-mail · **the counter and the scanner** (two intakes), with internal origination missing |

Email records converge on a separate collection (`converges: 'emails'`), so Intake shows them behind a separate
**Emails (5)** button, not in its list. The portal has its own **Portal submissions** button. Counter and scan intake
is a separate tab. The *single* intake list does not exist on screen.

### E-3 Tasks are listed in five places · High

My Work (Mine / Team / Overdue / Escalated), Intake › Routed, SLA & Tracking › Monitoring › Tasks, SLA risk › Queue,
and Lookup › Tasks. Each has its own filters and its own row actions. The owner's requirement is one track.

### E-4 Six ways to assign, on one screen · High

On Intake › To triage, with a record selected, the following are all visible at once: the **Assign** detail tab, the
**Assign** button, the **Assignment Desk** button, the **Bulk Assignment** button, and the **Assignment Desk** and
**Bulk assignment** tabs. A seventh, *Route / Assign Task*, is on the DG/CEO screen. The screen explains itself with
"Records are assigned from this screen. Two other assignment modes open from here.", text that is needed only because
the design is unclear.

### E-5 Three generations of names are on screen at the same time · High

| Sidebar says | The same thing is also called, on screen |
|---|---|
| Intake | *Intake & Assignment* (the screen's own heading and the header bar), *Intake* |
| Decisions › Approvals | *Review & Approval* (Command Center, Meetings, Continue-in bar) |
| Outbound | *Dispatch*, *Dispatch & Archive* (Command Center workflow text) |
| SLA & Tracking | *Tracking & Monitoring* (Command Center, Lookup, Projects) |
| Intake › Routed | *Activities*, *Open Activities Lens* (Command Center) |
| My Work | *Orchestrator* (SLA risk: "Open Orchestrator") |
| SLA risk | *FastTrack* (its per-row button, and "FastTrack owns urgent assignment…") |

An officer who follows a link reaches a screen whose title doesn't match the link they clicked.

### E-6 Engineering controls are on office screens · High

SLA risk carries 14 views, including *Doc-Email Pairs*, *Matched Docs*, *Response Matrix* and *Telemetry*.
Acknowledge carries *Copy this task's link details*, *Check this page's link*, *Copy record details* and *Export
receipts (JSON)*. The DG/CEO screen carries *Switch user / role*. Settings, reachable from the office's sidebar for an
administrator, carries *Empty every connection address* and *Clear this device's saved data* next to the theme
selector.

### E-7 A control misrepresents what it does · High

The DG/CEO screen shows an **AI Classification Preview**. Its "Suggested Category" and "Suggested Priority" are the
record's **existing** category and priority (`modules/executive.js` `detail()`), not a suggestion. **Apply Suggestions
to Metadata** sends a request to `AI_DOC_ANALYSIS` and applies nothing on screen. A control that shows existing data
as an AI suggestion cannot be labelled honestly: **DECOMMISSION**.

### E-8 The same control is repeated · Medium

*New Approval Request*, *New brief*, *Request a meeting* and *New project* each appear twice on their own screens.
*Load latest records* appears twice on Acknowledge. *Retry acknowledgements*, *Deep-link inspector* and *Receipt &
offline action health* each appear on both Health and Runtime. *Show the welcome sequence again* and *Start the welcome
sequence again* are two buttons on Settings that do the same thing. Admin Suite's overview has *Go to Endpoints* six
times, *Go to Commissioning* three times and *Go to Flow shapes* three times. Theme and density are set both in the
header and in Settings. Refresh exists as the header's *Synchronize data*, Intake's *Refresh from the server*,
Statistics' *Refresh rows from the server*, DG/CEO's *Refresh*, Archive's *Refresh*, Comments' *Refresh*, Acknowledge's
*Load latest records* and SLA risk's *Reload All*: eight controls for one action.

### E-9 Minutes and comments are separated from the record · High

Comments are a tab of My Work. Minutes are written from Meetings, or as comments on a task. Decisions are recorded
under Decisions. Receipts are in Acknowledge's *Receipt Ledger*. Each is a separate list, so the record's history
cannot be read in one place.

### E-10 Eight platforms are presented as one estate; three of them are the product · Medium

The README and the Platform Hub present eight platforms. The office uses three: the **Workspace**, the **Document
Portal** (intake A) and, for outbound letters, the **Mailer**. The other five are administration or engineering tools.
Administration itself is spread over four surfaces: Workspace › Admin Suite, the Estate Console, the Central
Administration Centre and the Flow Workbench.

### E-11 Every screen carries navigation that repeats the sidebar · Medium

The *Continue in* bar at the foot of each screen, Command Center's *Guided internal routes*, its *Recommended next
actions* and its *Plain-language workflow* each repeat the sidebar, using the old names from E-5. Command Center alone
offers 11 navigation controls and the sidebar.

---

## 5. Platform map

| Platform | Audience | Job served | Verdict |
|---|---|---|---|
| Folio Workspace (`index.html`) | Office staff | J1–J7 | **KEEP**, reduced as in §7 |
| NITDA Document Portal | Public | J1 (intake A) | **KEEP** |
| DGO Correspondence Mailer | Office staff | J6 (outbound letters) | **OWNER** (D-4): it overlaps Outbound › Send by email |
| Platform Hub | Staff, admin, engineering | Navigation between tools | **RELOCATE**: an administration landing page, not an office entry point |
| Folio Estate Console | Administration | None | **RELOCATE** (already administration only) |
| Folio Central Administration Centre | Administration | None | **RELOCATE** (already administration only) |
| Folio Flow Workbench | Engineering | None | **RELOCATE** (already engineering only) |
| Folio Vault | Engineering | None | **RELOCATE** (an API, already engineering only) |
| `index_Bulk.html`, `acknowledge.html`, `support.html` | Old email links | Link forwarders | **KEEP**, invisible. They carry old notification links into the Workspace |

## 6. Workspace and route map

### 6.1 Sidebar workspaces (13)

| Workspace | Verdict | Destination |
|---|---|---|
| Command Center | **MERGE** | **Overview** (J7), reduced to figures and the attention list |
| Intake | **KEEP**, rebuilt | **Inbox** (J1–J3): one list across all four intakes |
| My Work | **KEEP**, rebuilt | **Tasks** (J3–J5): the one task track |
| Registry | **OWNER** (D-2) | *File custody* panel on the record, plus a *Physical files* filter on Inbox |
| Lookup | **MERGE** | Header search, which opens the record |
| SLA & Tracking | **MERGE** | Tasks filters *Overdue* and *At risk*; Overview figures |
| Decisions | **MERGE** | Tasks filter *Awaiting decision*; decide on the record |
| Meetings | **OWNER** (D-3) | Decommission, or a record type |
| Projects | **OWNER** (D-3) | Decommission, or a record type |
| Insight | **MERGE** | Overview › Reports |
| Outbound | **MERGE** | The record's closing actions: *Reply*, *Record dispatch*, *Close & archive* |
| Admin Suite | **RELOCATE** | Administration, outside the office sidebar |
| Assistant | **DECOMMISSION** | The support request moves to the header's Help menu (D-5) |

### 6.2 Routes (31)

Every route stays loadable and **redirects** to its destination, so links already sent in notification emails keep
working (`core/deeplink-resolver.js`).

| Route | Today | Verdict | Destination |
|---|---|---|---|
| `home` | Command Center › Overview | MERGE | Overview |
| `ecm-erp-charter` | Command Center › ERP–ECM Charter | RELOCATE | A reference document; it runs no action and reads no state |
| `correspondence` | Intake › To triage | KEEP | Inbox |
| `scan-intake` | Intake › Counter deposit | MERGE | Inbox › *Register a document* form (intake C) |
| `activities` | Intake › Routed | DECOMMISSION | Inbox status filter *Assigned* |
| `single-assignment` | Intake › Assignment Desk | MERGE | Record › *Assign* |
| `bulk-assignment` | Intake › Bulk assignment | MERGE | Inbox › select rows › *Assign selected* |
| `orchestrator` | My Work › My tasks | KEEP | Tasks |
| `acknowledgment` | My Work › Acknowledge | MERGE | Record › *Acknowledge receipt* (first task action); receipts in the record timeline |
| `comments` | My Work › Comments | MERGE | Record timeline › *Add minute or comment* |
| `registry` | Registry › File custody | OWNER (D-2) | Record › *File custody* |
| `lookup` | Lookup | MERGE | Header search |
| `response-tracking` | SLA & Tracking › Monitoring | MERGE | Tasks filters; Overview |
| `fasttrack` | SLA & Tracking › SLA risk | MERGE | Tasks filter *At risk*; Record › *Escalate* |
| `approvals` | Decisions › Approvals | MERGE | Tasks filter *Awaiting decision*; Record › *Request approval*, *Decide* |
| `executive` | Decisions › DG/CEO | MERGE | Tasks filter *Awaiting decision*, scoped to DG/CEO; Record › *Decide* |
| `briefs` | Decisions › Briefs | OWNER (D-3) | Decommission, or a record type |
| `meetings` | Meetings | OWNER (D-3) | Decommission, or a record type |
| `projects` | Projects | OWNER (D-3) | Decommission, or a record type |
| `statistics` | Insight › Statistics | MERGE | Overview |
| `reports` | Insight › Reports | MERGE | Overview › Reports |
| `correspondence-email` | Outbound › Send by email | MERGE | Record › *Reply* (D-4) |
| `dispatch` | Outbound › Record a dispatch | MERGE | Record › *Record dispatch* |
| `archive` | Outbound › Close & archive | MERGE | Record › *Close & archive* |
| `admin-suite` | Admin Suite › Suite | RELOCATE | Administration |
| `settings` | Admin Suite › Administration | RELOCATE | Administration; theme and density to the profile menu |
| `diagnostics` | Admin Suite › Health | RELOCATE | Administration › Health |
| `operator-hud` | Admin Suite › Runtime | RELOCATE | Administration › Health (merged with Health) |
| `endpoint-console` | Admin Suite › Endpoints | RELOCATE | Administration |
| `user-admin` | Admin Suite › Users | RELOCATE | Administration › Users |
| `assistant` | Assistant | DECOMMISSION | Header › Help › *Ask the support team* |

---

## 7. Control-by-control map

Repeated row controls are listed once. *Tab strip* means the workspace's own tabs, which go with the workspace.

### 7.1 Header bar (on every screen)

| Control | Verdict | Reason |
|---|---|---|
| Search references, tasks, people (Ctrl K) | **KEEP** | The one search; Lookup merges into it |
| Workspace guide | **RENAME** → *Help* | Becomes the Help menu, holding the guide and *Ask the support team* |
| Synchronize data | **KEEP** | The single refresh. The other seven refresh controls (E-8) go |
| Toggle density | **MERGE** → profile menu | A preference, not an action |
| Switch theme | **MERGE** → profile menu | A preference, not an action |
| Activity and notifications | **KEEP** | J4: what has changed on my work |
| Profile (name, role) | **KEEP** | Holds preferences and sign-out |
| *Continue in* bar (foot of every screen) | **DECOMMISSION** | Repeats the sidebar, with old names (E-11) |

### 7.2 Command Center → Overview

| Control | Verdict | Reason |
|---|---|---|
| Figures: Open references, Unassigned, Active tasks, Overdue, Dispatched | **KEEP** | J7. Each figure opens the matching filtered list |
| *Four ingestion sources* chips | **MERGE** → Inbox source filter | Labels follow the wrong definition (E-2) |
| *Recommended next actions* (Intake, My Work cards) | **MERGE** → figures | Repeats *Unassigned* and *Active tasks* |
| *Guided internal routes*: Open Activities Lens, Open SLA risk, Open Assistant | **DECOMMISSION** | Repeats the sidebar; old names; two targets are themselves decommissioned |
| *Plain-language workflow* panel | **DECOMMISSION** | Names five screens, four of them by superseded names |
| *Module rule* panel | **DECOMMISSION** | Describes the code's structure, not the office's work |
| ERP–ECM Charter tab and its 8 section links | **RELOCATE** | A reference document |

### 7.3 Intake → Inbox

| Control | Verdict | Reason |
|---|---|---|
| Tab strip: To triage, Counter deposit, Routed, Assignment Desk, Bulk assignment | **DECOMMISSION** | The Inbox is one list; see the routes in §6.2 |
| Heading "Intake & Assignment" | **RENAME** → *Inbox* | E-5 |
| Explanatory line "Records are assigned from this screen. Two other assignment modes open from here." | **DECOMMISSION** | Needed only because of E-4 |
| Bulk Assignment, Assignment Desk (header buttons) | **DECOMMISSION** | E-4 |
| Chips Received, Pending, Accepted, High, Dupes | **KEEP** as filters | J2. *Dupes* renamed *Possible duplicates* |
| Search records | **KEEP** | |
| Status dropdown | **KEEP** | |
| Category dropdown | **KEEP** | |
| Tracker / Emails (n) / Portal submissions (n) | **MERGE** → one *Source* filter: Portal, Email, Counter/scan, Internal | E-2. Email records join the list |
| Log New Memo | **MERGE** → *Register a document* | One form for intakes C and D, with the source chosen in the form |
| More actions › Refresh from the server | **DECOMMISSION** | Header *Synchronize data* |
| More actions › Export to spreadsheet | **MERGE** → Overview › Reports | One export point |
| Row selection | **KEEP**, extended | Selecting several rows offers *Assign selected* (replaces Bulk assignment) |
| Detail tabs: Details, Triage, Assign, Linked | **MERGE** → the record page | E-1 |
| Triage / Update | **MERGE** → Record › *Triage* | Same as the Triage tab |
| Mark Accepted | **MERGE** → Record › *Triage* | A triage outcome, not a separate action |
| Assign | **MERGE** → Record › *Assign* | E-4 |
| Send to Registry | **OWNER** (D-2) | Depends on whether physical file custody stays |
| Bulk Assignment (in detail) | **DECOMMISSION** | Bulk applies to several rows, not to one record |
| Open Document | **KEEP** on the record | J2 |
| Archive | **RENAME** → *Close: no action needed* | At intake, the honest meaning is "this needs no work" |
| Related links Registry, My Work | **DECOMMISSION** | E-11 |

### 7.4 Counter deposit → Inbox › Register a document

| Control | Verdict | Reason |
|---|---|---|
| Category, Priority, Classification dropdowns | **KEEP** in the form | J2 |
| Deposit and create correspondence | **RENAME** → *Register* | Office words |
| Clear tray | **KEEP** in the form | |

### 7.5 Routed (`activities`)

| Control | Verdict | Reason |
|---|---|---|
| All / Treated / Not Treated chips | **MERGE** → Inbox status filter | Same records as Inbox |
| Four filter dropdowns (assignee, category, status, assignment) | **MERGE** → Inbox filters | |
| Reset filters | **MERGE** → Inbox | |
| The screen | **DECOMMISSION** | Holds no data of its own (F-1 of the rationalisation) |

### 7.6 Assignment Desk and Bulk assignment

| Control | Verdict | Reason |
|---|---|---|
| Assignment Desk form | **MERGE** → Record › *Assign* | One assign form, prefilled from the record |
| Bulk: category, subcategory, lead unit, supporting unit, priority, Check and apply | **MERGE** → Inbox › *Assign selected* | The same form, applied to the selected rows |

### 7.7 My Work → Tasks

| Control | Verdict | Reason |
|---|---|---|
| Tab strip: My tasks, Acknowledge, Comments | **DECOMMISSION** | One list; acknowledgement and comments are on the record |
| Mine, Team, Overdue, Escalated | **KEEP** | J3–J4. Add *At risk* (from SLA risk) and *Awaiting decision* (from Decisions) |
| Export to spreadsheet | **MERGE** → Overview › Reports | One export point |
| Open Assignment Desk | **DECOMMISSION** | Assign is on the record |
| Lookup & Direct Action link | **DECOMMISSION** | Header search |
| Start work, Mark done, Set reminder, Open comments (per task) | **MERGE** → the record's task actions | E-1 |

### 7.8 Acknowledge

| Control | Verdict | Reason |
|---|---|---|
| Acknowledge Receipt | **MERGE** → Record › first task action | J4 |
| Send reminder | **MERGE** → Record › *Send reminder* | Also absorbs SLA risk's *Notify owner* |
| Track History | **MERGE** → the record timeline | E-9 |
| Respond | **MERGE** → Record › *Add minute or comment* | E-9 |
| Reassign or Forward | **MERGE** → Record › *Assign* | E-4 |
| Attachments | **MERGE** → Record › documents | |
| Receipt Ledger panel | **MERGE** → the record timeline | E-9 |
| Panels: Who may acknowledge, Who is acknowledging, What happens on acknowledgement, Acknowledgment Notice | **DECOMMISSION** | One line of confirmation text replaces four panels |
| Send acknowledgements that are waiting | **RELOCATE** → Administration › Health | A queue operation |
| Export receipts to spreadsheet | **RELOCATE** → Administration | |
| Export receipts (JSON) | **DECOMMISSION** | Engineering format |
| Copy this task's link details | **DECOMMISSION** | Engineering |
| Copy record details | **DECOMMISSION** | Engineering |
| Check this page's link | **DECOMMISSION** | Engineering |
| Load latest records (×2) | **DECOMMISSION** | Header *Synchronize data* |

### 7.9 Comments

| Control | Verdict | Reason |
|---|---|---|
| Post Comment | **MERGE** → Record › *Add minute or comment* | E-9 |
| Refresh | **DECOMMISSION** | Header *Synchronize data* |

### 7.10 Registry (**OWNER**, D-2)

| Control | Verdict if custody stays | Reason |
|---|---|---|
| Status dropdown | **MERGE** → Inbox filter *Physical files* | |
| Unregistered queue, Open the unregistered queue | **MERGE** → one filter; the duplicate goes | E-8 |
| Register (per row) | **MERGE** → Record › *File custody* › *Open file* | |
| Related links Registry Scan Intake, Intake & Assignment | **DECOMMISSION** | E-5, E-11 |

### 7.11 Lookup

| Control | Verdict | Reason |
|---|---|---|
| Scope dropdown and chips All, Activities, Tasks, Emails, Comments, Approvals | **MERGE** → header search result groups | One search |
| Direct Lookup, Reset, Start a search, Search for a record | **DECOMMISSION** | Four controls for one action |
| Related links Dispatch, Tracking & Monitoring | **DECOMMISSION** | E-5 |

### 7.12 SLA & Tracking: Monitoring and SLA risk

| Control | Verdict | Reason |
|---|---|---|
| Tab strip: Monitoring, SLA risk | **DECOMMISSION** | |
| Source chips All, Physical, Email, Portal, Outgoing | **MERGE** → the Tasks source filter | Third copy of the same filter (also on Inbox and Archive) |
| Matrix, All, Tasks, Comments, Linked | **DECOMMISSION** | *Tasks* is Tasks; *Comments* is the record timeline; *Matrix* and *Linked* cannot be read at sight |
| Search tasks | **MERGE** → Tasks search | |
| Export to spreadsheet | **MERGE** → Overview › Reports | |
| Acknowledge, Forward to Registry, Open task (per row) | **MERGE** → the record | |
| SLA risk figures: Breached, Due within 24h, Unassigned, Tracked | **MERGE** → Overview figures | |
| Reload All | **DECOMMISSION** | E-8 |
| Views Docs, Tasks, Emails, Dashboard, References, Queue | **DECOMMISSION** | Each repeats a list available elsewhere |
| Views Matched Docs, Doc-Email Pairs, Response Matrix | **DECOMMISSION** | Engineering correlation views, not readable at sight |
| Telemetry | **RELOCATE** → Administration › Health | Engineering |
| Escalations (n) | **MERGE** → Tasks filter *Escalated* | Already exists in My Work |
| FastTrack (per row) | **DECOMMISSION** | Sets the priority to urgent, which *Escalate* also does; the name means nothing to an officer |
| Escalate (per row) | **MERGE** → Record › *Escalate* | J4 |
| Notify owner (per row) | **MERGE** → Record › *Send reminder* | Same as Acknowledge's *Send reminder* |
| Open Orchestrator | **DECOMMISSION** | E-5 |
| Related links Reports, Statistics, Projects | **DECOMMISSION** | E-11 |

### 7.13 Decisions: Approvals, DG/CEO, Briefs

| Control | Verdict | Reason |
|---|---|---|
| Tab strip | **DECOMMISSION** | |
| Pending (n), Decided (n) | **MERGE** → Tasks filter *Awaiting decision* and the record timeline | |
| New Approval Request (×2) | **MERGE** → Record › *Request approval* | Approval is about a record, so it starts from the record. Duplicate goes |
| DG/CEO: Correspondence Details, Linked Execution Tasks, Communication Threads, Record history | **MERGE** → the record page | The fullest of the partial record views today; its layout is the starting point |
| DG/CEO: AI Classification Preview, Apply Suggestions to Metadata | **DECOMMISSION** | E-7: shows existing values as an AI suggestion |
| DG/CEO: Route / Assign Task, its four fields, Open in the Assignment Desk | **MERGE** → Record › *Assign* | E-4 |
| DG/CEO: Refresh | **DECOMMISSION** | E-8 |
| DG/CEO: Switch user / role | **DECOMMISSION** | A development affordance on the DG/CEO's own screen |
| Briefs: status filter, New brief (×2) | **OWNER** (D-3) | |
| Related links Meetings, Dispatch | **DECOMMISSION** | E-11 |

### 7.14 Meetings and Projects (**OWNER**, D-3)

| Control | Verdict | Reason |
|---|---|---|
| Status filter; Request a meeting (×2); New project (×2) | **OWNER** | Neither is a step in the correspondence cycle. Duplicates go in any case |
| Related links My Work, Review & Approval, Tracking & Monitoring, Reports | **DECOMMISSION** | E-5, E-11 |

### 7.15 Insight → Overview › Reports

| Control | Verdict | Reason |
|---|---|---|
| Statistics tab, Refresh rows from the server | **MERGE** → Overview; refresh goes (E-8) | |
| Document Summary, Activity Summary, Progress report | **KEEP** | J7 |
| DGO / GTQ / Combined dropdown | **RENAME** | "GTQ" is not readable at sight; the owner names it (D-6) |
| M1–M10, All, None | **RENAME or DECOMMISSION** (D-6) | Ten unlabelled codes. Each needs its measure's name, or it goes |
| Print, Download HTML | **KEEP** as *Print*, *Download* | |
| DGO Email, GTQ Email, Dual Report Email | **MERGE** → one *Email report* with recipients | Three buttons for one action |

### 7.16 Outbound → the record's closing actions

| Control | Verdict | Reason |
|---|---|---|
| Tab strip | **DECOMMISSION** | |
| Send by email: Source Correspondence | **DECOMMISSION** | Replying starts from the record, so its source is already known |
| Send by email: Drafts / Outbox, Sent Register | **MERGE** → the record timeline; Overview for the office-wide view | |
| Send by email: Templates | **RELOCATE** → Administration | Templates are maintained by administrators |
| Send by email: category, classification, priority, Save draft | **MERGE** → Record › *Reply* | D-4 |
| Record a dispatch | **MERGE** → Record › *Record dispatch* | J6 |
| Close & archive: source chips | **DECOMMISSION** | Fourth copy of the source filter |
| Close & archive: Ready / Blocked / Archived filter | **MERGE** → Tasks filter *Ready to close* | |
| Close & archive: Inspect, Archive this reference | **MERGE** → Record › *Close & archive* | J6 |
| Close & archive: Refresh | **DECOMMISSION** | E-8 |
| Related link Lookup & Direct Action | **DECOMMISSION** | E-5 |

### 7.17 Admin Suite → Administration (all **RELOCATE**)

Removed from the office sidebar for every role. Kept for `systemAdmin` and `userAdmin` behind one *Administration*
entry in the profile menu. While relocating, the following are decommissioned or merged:

| Control | Verdict | Reason |
|---|---|---|
| Go to Endpoints (×6), Go to Commissioning (×3), Go to Flow shapes (×3), Open Endpoints, Open Flow shapes | **MERGE** → one link each | E-8 |
| Health and Runtime as two tabs | **MERGE** → one *Health* tab | Three controls appear on both (E-8) |
| Settings: role, theme and density selectors | **MERGE** → profile menu | Preferences |
| Settings: Show the welcome sequence again, Start the welcome sequence again | **MERGE** → one, under Help | E-8 |
| Settings: Empty every connection address, Clear this device's saved data | **KEEP** in Administration only, behind a confirmation | Destructive; never next to a theme selector |
| Health: Certified viewport contract, Activities parity certification, Activity lifecycle backend readiness | **RELOCATE** → engineering (the test suite and the Estate Console) | Certification output, not an administrative action |
| Users: Add this person, Edit, Withdraw access | **KEEP** in Administration | |
| Endpoints tab | **OWNER** (D-7) | It duplicates the Estate Console |

### 7.18 Assistant

| Control | Verdict | Reason |
|---|---|---|
| Ask a question, Send (AI chat over `AI_CHAT`) | **DECOMMISSION** (D-5) | Not a J1–J7 job; header search covers finding a record |
| Support request: category, Send support request | **MERGE** → Help › *Ask the support team* | Keep the support channel, lose the screen |
| Related link Command Center | **DECOMMISSION** | |

---

## 8. The essential Workspace

### 8.1 Structure

```
Header:   [ Search ]                                  [ Sync ] [ Notifications ] [ Help ] [ Profile ▾ ]
                                                                                   └ Theme, density, Administration*, Sign out
Sidebar:  Inbox        every incoming record, all four intakes, one list
          Tasks        every task, one track
          Overview     figures, attention list, reports            (roles with reports today)

Record page (opens from Inbox, Tasks, Search, or a notification link)
  ┌ The document: reference, source, sender, category, priority, original file, file custody (D-2)
  ├ The task(s): owner, deadline, status
  ├ Timeline, oldest first: received → triaged → assigned → acknowledged → minutes and comments →
  │                          approval or DG/CEO decision → reply or dispatch → closed
  └ Actions, shown only when the record's state and the role allow them:
      Triage · Assign · Acknowledge receipt · Start work · Add minute or comment · Send reminder ·
      Escalate · Request approval · Decide · Reply · Record dispatch · Close & archive

* systemAdmin and userAdmin only
```

### 8.2 Before and after

| Measure | Today | Essential | Change |
|---|---|---|---|
| Sidebar entries (systemAdmin) | 13 | 3 | −77% |
| Sidebar entries (operator / director / executive / viewer) | 10 / 11 / 10 / 5 | 2–3 | |
| Routes an officer navigates | 31 | 4 (Inbox, Tasks, Overview, Record) | −87% |
| Places a task is listed | 5 | 1 | |
| Ways to assign | 7 | 2 (one record, or selected rows) | |
| Refresh controls | 8 | 1 | |
| Definitions of the four intakes | 3 | 1 (`entry-points.config.js`) | |
| Record actions | Spread across 8 workspaces | 12, on one page | |

The record page's twelve actions are the only buttons that change a record. Lists only filter and open records.
That one rule removes most of the duplication in §7.

### 8.3 What does not change

- **Server writes.** Every record action calls the write it calls today (`core/server-writes.js`). No flow package
  changes, so nothing needs re-pasting (CLAUDE.md, *Flow packages are released, then pasted once*). If an owner
  decision in §9 needs a write the running package lacks, that is raised before any build.
- **Role rules and action owners.** `config/rbac.config.js`, `config/action-ownership.config.js` and the audit
  vocabulary decide what each role may do. The record page shows an action only to a role that may perform it today.
- **Links.** Every one of the 31 routes stays loadable and redirects to its destination.
- **The Portal and its public intake**, which are outside this map.

## 9. Decisions required from the owner

Each is asked once. A verdict marked **OWNER** above waits on the matching decision.

| # | Decision | Recommendation |
|---|---|---|
| **D-1** | Adopt the record-centred structure in §8 (Inbox, Tasks, Overview, Record page) as the target | **Adopt.** It is the structure the platform's purpose describes |
| **D-2** | Physical file custody (Registry): a panel on the record, a separate list for registry officers, or decommissioned | **A panel on the record**, plus an Inbox filter *Physical files*. Custody belongs to the record |
| **D-3** | Meetings, Projects and Briefs: decommission, or keep as record types on the same record page | **Decommission from the Workspace** unless the office runs them through the DG's correspondence cycle. Their data stays on the server |
| **D-4** | Outbound email: the Mailer, the Workspace's *Reply*, or both | **Workspace *Reply* for a reply to a record; the Mailer for mass mailings.** Two tools, two different jobs, no overlap |
| **D-5** | The AI chat assistant | **Decommission.** Keep the support request under Help |
| **D-6** | Reports: what "GTQ" and M1–M10 are | Name each one, or drop the ones nobody can name |
| **D-7** | Workspace › Administration › Endpoints, which duplicates the Estate Console | **Drop from the Workspace**; the Estate Console is the endpoint tool |

## 10. Sequence

Each step ships and is checked on its own. Office screens are removed only once their replacement is in use.

1. **Record page**, behind a switch, built from the DG/CEO screen's detail layout (the most complete today) and the
   existing write paths. The old screens stay.
2. **Inbox**: one list over the four intakes using `entry-points.config.js`, with email records included; *Register a
   document* replaces Counter deposit and Log New Memo; *Assign selected* replaces Bulk assignment.
3. **Tasks**: one list with the filters Mine, Team, Overdue, At risk, Escalated, Awaiting decision, Ready to close.
4. **Overview**: figures, attention list, Reports.
5. **Cut-over**: switch on by default; the 31 routes redirect; the sidebar becomes Inbox · Tasks · Overview;
   Administration moves to the profile menu; everything marked DECOMMISSION is removed in the same release.
6. **Generated records**: `config/workflow-clarity.config.js`, `HiddenTechnicalRoutes`, `docs/process/` and the
   platform documents are regenerated through their generators, never by hand.

Checks at every step: `npm run test:node`, `npx playwright test`, and `tests/server-writes.test.mjs`, which already
fails when a screen sends an operation the running package does not implement.

## 11. Limits of this map

- Counts are from one role (`systemAdmin`) on the seeded development store. Controls inside dialogs, and on screens
  that start empty, were not counted. They are covered by the verdict on their parent screen.
- The Document Portal's public interface, the Mailer's interface and the five administration and engineering tools
  were mapped at platform level only.
- The repository's documentation and tooling, which also need reducing, are outside this map. This map covers what an
  officer sees.
