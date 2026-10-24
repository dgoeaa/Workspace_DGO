# Folio Workspace essentials: execution plan

**Status:** the execution and tracking plan for Workspace interface work. It carries no commissioning step;
those live in [`RUNBOOK.md`](../deployment/RUNBOOK.md).

> Generated from [`ESSENTIALS_PLAN.json`](ESSENTIALS_PLAN.json) by `npm run ux:plan -- --write`. Do not edit by hand:
> change an item's status in the JSON, then regenerate. `npm run ux:plan` prints the board; `npm run outstanding` counts
> the open items with every other register.

It carries out [`ESSENTIALS_MAP.md`](ESSENTIALS_MAP.md) and [`LAYOUT_REVIEW.md`](LAYOUT_REVIEW.md).

**28 of 32 items done.**

## Where each phase stands

| Phase | Goal | Done | In progress | Ready | Blocked |
|---|---|---|---|---|---|
| **P0 Owner decisions** | The decisions that unblock the build, each asked once. | 8/8 | 0 | 0 | 0 |
| **P1 Quick wins on today's screens** | Apply the layout standard and remove misleading and engineering controls, without changing the structure. Visible within days, and none of it is thrown away by later phases. | 10/10 | 0 | 0 | 0 |
| **P2 Foundations** | One definition of the four intakes, and the record page behind a switch. | 4/4 | 0 | 0 | 0 |
| **P3 The three places** | Inbox, Tasks and Overview, and search that opens the record. | 4/4 | 0 | 0 | 0 |
| **P4 Cut-over and decommissioning** | The new structure becomes the default; old screens redirect; removed screens and code go. | 2/4 | 0 | 1 | 1 |
| **P5 Verification and acceptance** | Measured against the targets, and accepted by the office. | 0/2 | 0 | 0 | 2 |

## Ready to act on now

- [UX-403](#ux-403) Decommission the replaced screens and their code · **Engineering**

## Order of work

```
P0 owner decisions ──┬─ UX-D0 ──► P1 quick wins (UX-101…109) ──► UX-110 measure ─────────────────┐
                     ├─ UX-D1 ──► P2 UX-201 intakes, UX-202 record page ──► P3 Inbox, Tasks,    │
                     │                      │                                Overview, Search ─┤
                     ├─ UX-D2, UX-D4 ───────┴► UX-203 closing actions, UX-204 custody ─────────┤
                     └─ UX-D3, D5, D6, D7 ──────────────────────────► P4 cut-over, decommission ─┴► P5 measure, accept
```

## Targets

| Measure | Today | Target | Measured | Source |
|---|---|---|---|---|
| Sidebar entries (systemAdmin) | 13 | 3 | — | ESSENTIALS_MAP.md §8.2 |
| Screens an officer moves between | 31 | 4 | — | ESSENTIALS_MAP.md §8.2 |
| Places a task is listed | 5 | 1 | — | ESSENTIALS_MAP.md §8.2 |
| Ways to assign | 7 | 2 | — | ESSENTIALS_MAP.md §8.2 |
| Refresh controls | 8 | 1 | — | ESSENTIALS_MAP.md §8.2 |
| Definitions of the four intakes | 3 | 1 | 1 | ESSENTIALS_MAP.md §4 E-2 |
| Median distance from the top of the window to the content at 1366x768 (px) | 386 | 176 | 165 | LAYOUT_REVIEW.md §3, §5 |
| Worst screen's visible content at 1366x768 (px) | 60 | 500 | 536 | LAYOUT_REVIEW.md §3, §5 |

## Items

### P0 · Owner decisions

The decisions that unblock the build, each asked once.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-D0](#ux-d0) Approve phase 1: the layout standard and the removal of misleading and engineering controls | Owner | DONE | — |
| [UX-D1](#ux-d1) Adopt the record-centred structure: Inbox, Tasks, Overview and one record page | Owner | DONE | — |
| [UX-D2](#ux-d2) Decide where physical file custody (Registry) lives | Owner | DONE | — |
| [UX-D3](#ux-d3) Decide on Meetings, Projects and Briefs | Owner | DONE | — |
| [UX-D4](#ux-d4) Decide the split between the Mailer and Reply on the record | Owner | DONE | — |
| [UX-D5](#ux-d5) Decide on the AI chat assistant | Owner | DONE | — |
| [UX-D6](#ux-d6) Name the report options: GTQ and the measures M1 to M10 | Owner | DONE | — |
| [UX-D7](#ux-d7) Decide on the Workspace's Endpoints tab | Owner | DONE | — |

#### UX-D0

**Approve phase 1: the layout standard and the removal of misleading and engineering controls** · Owner · DONE · from LAYOUT_REVIEW §5; ESSENTIALS_MAP E-6, E-7, E-8

Phase 1 changes how every screen looks and removes controls that fail the essentials test whatever the final structure: the AI Classification Preview, Switch user / role, the copy-link and check-link buttons, the JSON export, duplicate buttons and duplicate refresh controls.

**Done when:** The owner approves, amends or rejects phase 1, and the answer is recorded here as evidence.

**Evidence:** Owner approved phase 1 as proposed ('Approved'), 2026-10-21, in reply to the plan asking for UX-D0 first; recorded in session https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw. (2026-10-21)

#### UX-D1

**Adopt the record-centred structure: Inbox, Tasks, Overview and one record page** · Owner · DONE · from ESSENTIALS_MAP D-1

The target structure in ESSENTIALS_MAP.md §8, as drawn in the Folio Essential Workspace mockup.

**Done when:** The owner adopts, amends or rejects the structure, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): the record-centred structure: Inbox, Tasks, Overview and one record page. (2026-10-21)

#### UX-D2

**Decide where physical file custody (Registry) lives** · Owner · DONE · from ESSENTIALS_MAP D-2

A panel on the record page with a Physical files filter on the Inbox (recommended), a separate list for registry officers, or decommissioned.

**Done when:** One of the three options is chosen, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): file custody as a panel on the record, with a Physical files filter on the Inbox. (2026-10-21)

#### UX-D3

**Decide on Meetings, Projects and Briefs** · Owner · DONE · from ESSENTIALS_MAP D-3

Remove them from the Workspace (recommended unless they run through the DG's correspondence cycle), or keep each as a record type on the record page.

**Done when:** A decision for each of the three, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): Meetings, Projects and Briefs removed from the Workspace; their data stays on the server. (2026-10-21)

#### UX-D4

**Decide the split between the Mailer and Reply on the record** · Owner · DONE · from ESSENTIALS_MAP D-4

Recommended: Reply on the record answers a record; the Mailer handles mass mailings only.

**Done when:** The split is decided, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): Reply on the record answers a record; the Mailer handles mass mailings only. (2026-10-21)

#### UX-D5

**Decide on the AI chat assistant** · Owner · DONE · from ESSENTIALS_MAP D-5

Recommended: decommission the chat and keep the support request under Help.

**Done when:** Kept or decommissioned, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): the AI chat assistant removed; Ask the support team stays under Help. (2026-10-21)

#### UX-D6

**Name the report options: GTQ and the measures M1 to M10** · Owner · DONE · from ESSENTIALS_MAP D-6; ESSENTIALS_MAP §7.15

Each option needs a plain name an officer can read, or it is dropped.

**Done when:** A plain name, or 'drop', for GTQ and for each of M1 to M10, recorded here as evidence.

**Evidence:** Owner, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): GTQ was the Global Tracking Queue (the task list); M1 to M10 were canvas app variables that controlled which report variants and dimensions showed; the owner asked for a decisive redesign. Decision: GTQ, DGO and Combined and the second date range are removed (they chose between two identical date ranges and filtered nothing); M1 to M10 are removed (ten toggles over six layouts, three of them duplicates). Reports is two named reports over one period, Summary (figures and the activity table) and Full list (every record with status, acknowledgement and link), with Print, Download and one Email report. Carried out in 43c4dc35 (modules/reports.js). (2026-10-21)

#### UX-D7

**Decide on the Workspace's Endpoints tab** · Owner · DONE · from ESSENTIALS_MAP D-7

Recommended: drop it from the Workspace; the Estate Console is the endpoint tool.

**Done when:** Kept or dropped, recorded here as evidence.

**Evidence:** Owner approved the recommendation, 2026-10-21 (https://claude.ai/code/session_01MQXHQgacNwJ7xhsn5gN6mw): the Endpoints tab dropped from the Workspace; the Estate Console is the endpoint tool. (2026-10-21)

### P1 · Quick wins on today's screens

Apply the layout standard and remove misleading and engineering controls, without changing the structure. Visible within days, and none of it is thrown away by later phases.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-101](#ux-101) Size panels to their content | Engineering | DONE | UX-D0 |
| [UX-102](#ux-102) One name per screen, said once | Engineering | DONE | UX-D0 |
| [UX-103](#ux-103) Remove the Continue-in bar and the footer status line | Engineering | DONE | UX-D0 |
| [UX-104](#ux-104) Header: four controls; theme and density into the profile menu | Engineering | DONE | UX-D0 |
| [UX-105](#ux-105) Move explanations out of the work area | Engineering | DONE | UX-D0 |
| [UX-106](#ux-106) Counts on the filter chips instead of figure tiles | Engineering | DONE | UX-D0 |
| [UX-107](#ux-107) One control bar per screen, labelled filters, primary action on the right | Engineering | DONE | UX-D0 |
| [UX-108](#ux-108) Compact the sidebar brand; ministry identity on sign-in and print only | Engineering | DONE | UX-D0 |
| [UX-109](#ux-109) Remove misleading, engineering and duplicate controls | Engineering | DONE | UX-D0 |
| [UX-110](#ux-110) Measure phase 1 against the layout targets | Engineering | DONE | UX-101, UX-102, UX-103, UX-104, UX-105, UX-106, UX-107, UX-108, UX-109 |

#### UX-101

**Size panels to their content** · Engineering · DONE · from LAYOUT_REVIEW L-3

styles/app.css:19 gives every .panel a minimum height of 160px, so a one-sentence panel takes 160px.

Steps:

1. Remove min-height:160px from .panel; keep it only where a panel is a deliberate empty-state frame.
1. Re-check the Playwright visual and layout specs.

**Done when:** No panel holding less than one line of controls is taller than its content plus padding, on every route.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 6ccf41e6: .panel no longer sets min-height:160px (styles/app.css). npm run test:node passes; full Playwright suite passes (994d75ee commit message). (2026-10-21)

#### UX-102

**One name per screen, said once** · Engineering · DONE · from LAYOUT_REVIEW L-1; ESSENTIALS_MAP E-5

The header label, selected tab, page title and sidebar entry name the same screen differently; Command Center, Lookup, Projects and the Continue-in bar still use superseded names.

Steps:

1. Drop the header's 'Active workspace' label.
1. Make each page title the sidebar name, with the sub-view on the tab only.
1. Replace every superseded name (Intake & Assignment, Review & Approval, Dispatch & Archive, Tracking & Monitoring, Activities Lens, Orchestrator, FastTrack as a screen name) in on-screen text.

**Done when:** On every route, the page title equals its sidebar entry, and no superseded name appears in rendered text.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 994d75ee: core/ui.js head() and the shell's routeLabel name every screen by its sidebar workspace; the superseded names are gone from rendered text (Command Center panels, SLA risk link and line). audit-remediation 'one name per screen' passes on all 29 routes. (2026-10-21)

#### UX-103

**Remove the Continue-in bar and the footer status line** · Engineering · DONE · from LAYOUT_REVIEW L-8; ESSENTIALS_MAP E-11

61-113px of repeated navigation and a 40px status line sit at the foot of every screen.

Steps:

1. Remove the .dgo-related bar and the footer.
1. Move the last-sync time into the Sync button's tooltip.
1. Retire navigation-relationships output that only fed the bar, through its generator.

**Done when:** Nothing is fixed below the content on any route.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 6ccf41e6: the Continue-in bar and the footer are removed from shared/shell.js and the workarea grid; the last load time is the Sync button's tooltip. containment and wayfinding specs assert the screen ends inside the window. (2026-10-21)

#### UX-104

**Header: four controls; theme and density into the profile menu** · Engineering · DONE · from LAYOUT_REVIEW L-7; ESSENTIALS_MAP §7.1

Density is shown as a down-chevron and theme as a globe (shared/shell.js:97-98). Neither is a daily action.

Steps:

1. Header keeps Search, Sync, Notifications and Help (labelled).
1. Theme, density and sign-out move to the profile menu; Settings' duplicate theme and density selectors go.

**Done when:** The header shows exactly Search, Sync, Notifications, Help and the profile menu.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 6ccf41e6: the header holds Search, Sync, Notifications, Help (labelled) and the profile menu; theme and density are in the profile menu and no longer in Settings. (2026-10-21)

#### UX-105

**Move explanations out of the work area** · Engineering · DONE · from LAYOUT_REVIEW L-4

Fourteen screens put an explanatory panel, ribbon or line between the title and the work.

Steps:

1. Move guidance into the Workspace guide under Help.
1. Move each warning into the confirmation of the action it concerns (core/flow-confirmation.js).

**Done when:** No route renders explanatory prose between its title and its first control bar or content.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 994d75ee: page descriptions are title tooltips; the explanatory strips and panels on Intake, Email Desk, Archive, Bulk assignment, Users, Routed and Acknowledge are removed, each warning that mattered is in its action's confirmation or beside its button. (2026-10-21)

#### UX-106

**Counts on the filter chips instead of figure tiles** · Engineering · DONE · from LAYOUT_REVIEW L-2

Seventeen screens open with a 100-138px row of figure tiles that repeat the list or show zeros, and cannot be clicked.

Steps:

1. Remove the tile row from every list screen.
1. Show each count on the filter chip it describes, so the figure is the filter.
1. Keep large figures on Command Center only (later Overview).

**Done when:** No office list screen renders figure tiles, and every count they showed is on a clickable filter. (Revised 2026-10-21: as first worded, only Command Center could keep tiles. Statistics and the administration health screens are dashboards whose figures are their content; Statistics becomes part of Overview (UX-303) and the administration screens move with Administration (UX-402).)

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 994d75ee and 43c4dc35: tiles removed from every office list screen (13 in 994d75ee; Intake's figure row in 43c4dc35); their counts are on the filters they describe. Command Center, Statistics and the administration dashboards keep their figures as their content. (2026-10-21)

#### UX-107

**One control bar per screen, labelled filters, primary action on the right** · Engineering · DONE · from LAYOUT_REVIEW L-5, L-6

Controls are split into stacked cards; Activities alone has 7 dropdowns labelled 'All' and 2 unlabelled date fields. The primary action moves between screens.

Steps:

1. Build one control-bar component on the pattern of Intake's cc-controlbar.
1. Each filter names itself ('Owner: All').
1. The screen's primary action is the bar's last control, shown once.

**Done when:** Every list screen has one control bar of at most 56px at 1366x768; every filter has a visible label; the primary action is the bar's last control.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 43c4dc35: measured at 1366x768, every office list screen has one control bar of at most 56px (Routed's seven labelled filters on one scrolling row); every filter has a visible label (unlabelled form controls in the CSS contract: 0); the primary action is the bar's last control. (2026-10-21)

#### UX-108

**Compact the sidebar brand; ministry identity on sign-in and print only** · Engineering · DONE · from LAYOUT_REVIEW L-9

The sidebar spends 220px on branding and the ministry bar takes 26px across every screen.

Steps:

1. One 56px brand row in the sidebar.
1. Ministry bar shown on sign-in and in printed output, not in the working shell.

**Done when:** All sidebar entries fit without scrolling at 1366x768; no ministry bar in the working shell.

**Checked by:** `npm run test:brand`, `npm run test:node`, `npx playwright test`

**Evidence:** 43c4dc35: one 56px brand row; no ministry bar in the working shell; no group headings or identity block in the sidebar, so all thirteen entries fit at 1366x768 (688px of 688px), asserted by tests/layout-budget.spec.js. (2026-10-21)

#### UX-109

**Remove misleading, engineering and duplicate controls** · Engineering · DONE · from ESSENTIALS_MAP E-6, E-7, E-8

Controls that fail the essentials test in any structure.

Steps:

1. Remove the AI Classification Preview and Apply Suggestions to Metadata.
1. Remove Switch user / role from the DG/CEO screen.
1. Remove Copy this task's link details, Copy record details, Check this page's link and Export receipts (JSON).
1. Remove the second New Approval Request, New brief, Request a meeting and New project buttons.
1. Remove the seven refresh controls other than the header's Sync.
1. Merge the welcome-sequence buttons and the Admin Suite's repeated Go to links.

**Done when:** None of the listed controls renders on any route; the header's Sync is the only refresh control.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** 6ccf41e6: the listed controls are removed (AI Classification Preview, Switch user / role, copy-link, check-link, JSON export, duplicate New buttons, seven refresh controls, repeated Go to links); the header's Sync is the only refresh control. (2026-10-21)

#### UX-110

**Measure phase 1 against the layout targets** · Engineering · DONE · from LAYOUT_REVIEW §3

Re-run the layout measurement on every route at 1366x768 and 1440x900.

Steps:

1. Commit the measurement as a script (scripts/measure-layout.mjs) and its output.
1. Add a Playwright check that fails when a route's space above the content exceeds the budget.

**Done when:** On every list screen, content starts within 176px of the top of the window at 1366x768 (the header, one title row and one control bar), and the check is part of the browser suite.

**Checked by:** `npx playwright test`

**Evidence:** 43c4dc35: scripts/measure-layout.mjs (npm run ux:measure) at 1366x768: median 165px; every office list screen within 176px (Admin Suite, an administration dashboard moving with UX-402, measures 232px); tests/layout-budget.spec.js asserts the budget for 17 office list screens and the sidebar fit in the browser suite. (2026-10-21)

### P2 · Foundations

One definition of the four intakes, and the record page behind a switch.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-201](#ux-201) One definition of the four intakes; email joins the intake list | Engineering | DONE | UX-D1 |
| [UX-202](#ux-202) The record page, behind a switch | Engineering | DONE | UX-D1 |
| [UX-203](#ux-203) Record page: Reply, Record dispatch, Close & archive | Engineering | DONE | UX-202, UX-D4 |
| [UX-204](#ux-204) File custody on the record | Engineering | DONE | UX-202, UX-D2 |

#### UX-201

**One definition of the four intakes; email joins the intake list** · Engineering · DONE · from ESSENTIALS_MAP E-2

entry-points.config.js, source-views.config.js and the Intake purpose text define the intakes three ways, and email records converge on a separate collection.

Steps:

1. Make config/entry-points.config.js the only definition: Portal, Email, Counter / scan, Internal.
1. Derive source views and their labels from it.
1. Present email records in the same intake list, with Register as their first action.

**Done when:** Every on-screen source filter and label is derived from entry-points.config.js; an email record appears in the intake list.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** config/entry-points.config.js is the only definition of the four intakes (Public portal, Email, Counter / scan, Internal origination), with each one's short name, purpose and icon. Derived from it: config/source-views.config.js (every source filter, chip and badge: Activities, Tracking, Archive, Lookup, Intake), the Command Center's intake strip, the Assignment Desk's source cards, the welcome tips, the Intake workspace's purpose, the charter reference, and the channel tables of the generated architecture and visual documentation; config/product-definition.config.json points at it instead of copying it. Intake has one Source filter (Portal, Email, Counter / scan, Internal, with counts). A message not yet registered is a row of the intake list (Not registered, Email source) whose only action is Register; once registered it is the record, with its reference, in the same list (core/intake-list.js). The Emails view is removed. tests/intake-definition.test.mjs (14 checks, in npm run test:node, including that no screen, configuration or generator keeps its own names for the intakes) and tests/intake-list.spec.js. Intake's bar stays one row with four filters: its work starts at 176px at 1366x768, the budget exactly. (2026-10-21)

#### UX-202

**The record page, behind a switch** · Engineering · DONE · from ESSENTIALS_MAP E-1, E-9; ESSENTIALS_MAP §8.1

One page per record: the document, its task, one timeline (receipt, triage, assignment, acknowledgement, minutes, comments, approvals, decisions, dispatch, closure) and the actions, shown by stage and role.

Steps:

1. Build modules/record.js on the DG/CEO detail layout, reading the existing collections.
1. Wire Triage, Assign, Acknowledge receipt, Start work, Add minute or comment, Send reminder, Escalate, Request approval and Decide to the writes they use today (core/server-writes.js).
1. Gate it behind a switch; the old screens stay.
1. Notification links open the record page when the switch is on.

**Done when:** With the switch on, every action listed is performed from the record page through its existing server write, and the timeline shows each event; tests/server-writes.test.mjs passes unchanged.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** The record page is shared/record-page.js (not a routed modules/record.js: it opens over any screen and closes back to it), its model core/record-view.js and its actions core/record-actions.js. Behind the profile menu's 'Record page (preview)' switch, off by default; the old screens are unchanged. Triage, Assign (the Assignment Desk's own form, mounted on the record), Acknowledge receipt (assignee only), Start work, Mark done, Add minute, Send reminder, Escalate, Request approval and Approve / Decline / Delegate each run under their existing owner and action ID through executeOwnedAction and send the write their screen sends; Intake now records its triage through the same applyDocumentStatus. A notification link opens the record once its data has loaded. tests/record-view.test.mjs (13 checks: lookup, timeline order and content, decisions, acknowledgement, stages, orphan tasks) in npm run test:node; tests/record-page.spec.js (off by default; open from Intake; start work sends update-task; escalate sends update-task and joins the timeline; a link opens the record; Escape returns focus). tests/server-writes.test.mjs unchanged and passing. (2026-10-21)

#### UX-203

**Record page: Reply, Record dispatch, Close & archive** · Engineering · DONE · from ESSENTIALS_MAP §7.16

The closing actions move onto the record, so the cycle closes where it started.

Steps:

1. Reply composes from the record (the Email Desk's writer).
1. Record dispatch and Close & archive call their existing writes.
1. Close & archive is offered only once a response is recorded.

**Done when:** A record can be replied to, dispatched and archived from its page, and each step appears on its timeline.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** The record page's Respond and close group (shared/record-page.js): Reply writes the Correspondence Email Desk's letter against the record (template, classification, priority, Save draft, Send) and sends it through EMAIL as the desk does (core/record-actions.js reply, sendReply), a held or draft reply can be sent from the record, Record dispatch and Confirm receipt record a completed task's hand-over (core/dispatch-actions.js, extracted from modules/dispatch.js so the Dispatch screen and the record page share one implementation), and Close & archive seals the record through Archive's closure gate and evidence bundle (ArchiveService.archiveReference, archive / archive-reference), offered only once a response is recorded (a reply sent, or a task dispatched or marked as needing none) and refused with what is still open. Each step joins the timeline (Reply drafted / held / sent, Dispatched by …, No dispatch needed, Receipt confirmed, Closed and archived) and moves the stage bar (Responded, Closed). tests/record-view.test.mjs (20 checks) and tests/record-close.spec.js (reply sent through EMAIL; courier dispatch then archive; a record with open work is refused); the Dispatch and closure specs pass unchanged. (2026-10-21)

#### UX-204

**File custody on the record** · Engineering · DONE · from ESSENTIALS_MAP §7.10

Carries out the owner's decision on Registry.

Steps:

1. Implement the option chosen in UX-D2 (open-file and move-file writes are already in place).

**Done when:** Custody is shown and changed as UX-D2 decided.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** As UX-D2 decided, file custody is a panel on the record: shared/record-page.js File custody shows the record's official file (number, holder, status, awaiting receipt, last movement) and opens it (open-file, the server issues the number), routes it with an official minute (move-file), records its receipt (move-file RECEIVED) and closes it (move-file CLOSED). The actions are core/registry-actions.js, extracted from modules/registry.js so Registry and the record page share one implementation under Registry's owner and audit names; Registry keeps its own wording and every one of its notices is still in the process catalogue. The file's opening, each hand-over, each receipt and its closure are on the record's timeline. The Physical files filter on the Inbox, the other half of UX-D2, is built with the Inbox (UX-301). tests/record-view.test.mjs (23 checks) and tests/record-custody.spec.js (open, route, receive, close, each write checked); the Registry, scan-intake and closure specs pass unchanged. (2026-10-21)

### P3 · The three places

Inbox, Tasks and Overview, and search that opens the record.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-301](#ux-301) Inbox | Engineering | DONE | UX-201, UX-202 |
| [UX-302](#ux-302) Tasks | Engineering | DONE | UX-202 |
| [UX-303](#ux-303) Overview | Engineering | DONE | UX-202, UX-D6 |
| [UX-304](#ux-304) Header search opens the record | Engineering | DONE | UX-202 |

#### UX-301

**Inbox** · Engineering · DONE · from ESSENTIALS_MAP §7.3-7.6

One list over the four intakes. Replaces To triage, Counter deposit, Routed, Assignment Desk and Bulk assignment.

Steps:

1. Source and status filters with counts, one control bar.
1. Register a document: one form for counter/scan and internal records.
1. Selecting rows offers Assign selected.
1. Opening a row opens the record page.
1. A Physical files filter: the records that have an official file (owner decision UX-D2; the custody panel is UX-204).

**Done when:** Every incoming record from the four intakes is listed; no row carries an action button; the five replaced screens' jobs are all reachable from here or the record.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** The Inbox is modules/inbox.js over core/inbox-view.js: one list of every incoming record from the four intakes (every document on the device, the register and Activities joined by reference, and every e-mail not yet registered). One control bar: search, Source (All and the four intakes of config/entry-points.config.js, each counted), where it stands (Open, To triage, Unassigned, In progress, Responded, Closed, All, each counted; a row's stage is the record page's stage bar), Category, and Physical files (the records with an official file, owner decision UX-D2, counted). No row carries an action: a record's row opens its record page, where triage and assignment are; a message's row registers it through Intake's own write (modules/correspondence.js registerEmail, exported) and opens the record. Register a document is one form with the source chosen in it: Counter / scan mounts Counter deposit's deposit (modules/scan-intake.js mountEmbedded) and Internal mounts Log New Memo's registration (modules/correspondence.js mountRegisterInternal). Ticking rows offers Assign selected, which mounts Bulk assignment's form with their IDs (modules/bulk-assignment.js mountEmbedded). The five replaced screens' jobs: To triage (list, triage, assign, register an e-mail; its Portal submissions desk is now the record page's Public status panel, setting the status through core/portal-status-service.js, and a Portal Registry link opens that record), Counter deposit and Log New Memo (Register a document), Routed (Activities' records are rows of the list), the Assignment Desk (the record page's Assign) and Bulk assignment (Assign selected). Behind the essential screens' switch, at Intake's address; Intake is unchanged when it is off. tests/inbox-overview.test.mjs (24 checks, in npm run test:node through test:recordview, including that every intake is in the list, every filter's count is what it shows, a row's stage agrees with its record page, and no row carries an action) and tests/inbox-overview.spec.js. Found while building it, and left as it is: Counter deposit stamps its records with channel 'Registry', which config/entry-points.config.js counts as Internal, so a counter deposit appears under the Internal source; that is UX-201's definition, not this list's. (2026-10-22)

#### UX-302

**Tasks** · Engineering · DONE · from ESSENTIALS_MAP E-3; ESSENTIALS_MAP §7.7-7.13

The one task track. Replaces My Work, Acknowledge, Monitoring, SLA risk, the Approvals and DG/CEO inboxes and the Close & archive list.

Steps:

1. Views: Mine, Team, Not yet acknowledged, Overdue, At risk, Escalated, Awaiting decision, Ready to close, each with its count.
1. Overdue and at-risk use core/work-measures.js.
1. Opening a task opens its record.

**Done when:** Every task is reachable from this one list, and every view above is a filter on it.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** Tasks is modules/tasks.js over core/task-views.js: one list of every task (Team is all of them), with eight views, each a test on one task and each counted from the same tasks: Mine, Team, Not yet acknowledged (core/record-view.js isAcknowledged), Overdue (core/work-measures.js isOverdue), At risk (core/work-measures.js isAtRisk, new: due within a day and not yet overdue; SLA risk's Due soon now reads it instead of its own arithmetic), Escalated (the task's level or status, or the escalation log), Awaiting decision (an open task whose record has a pending approval) and Ready to close (finished, its record answered as responseOf() reads it, no pending approval, not archived). A row opens its task's record page; the list changes nothing itself, and redraws when the record page closes so what was done shows on its row, with focus back on that row. Behind a second per-device switch in the profile menu, 'Inbox, Tasks, Overview (preview)', which turns the record page on with it; while it is on, My Work's address draws Tasks, and My Work is unchanged when it is off. tests/task-views.test.mjs (18 checks, in npm run test:node through test:recordview) and tests/tasks-screen.spec.js (off: My Work unchanged; on: eight counted views, Overdue filters, a row opens the record, Start work sends update-task, closing returns to the row showing In Progress). (2026-10-22)

#### UX-303

**Overview** · Engineering · DONE · from ESSENTIALS_MAP §7.2, §7.15

Figures, incoming by intake, a needs-attention list, and Reports. Replaces Command Center, Statistics and Reports.

Steps:

1. Each figure opens the matching filtered list.
1. Reports: the two reports UX-D6 set, Summary and Full list, with Print, Download and one Email report (in place since 43c4dc35).
1. One Export to spreadsheet.

**Done when:** Every figure is a link to its list; Reports offers only named options and one email action.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** The Overview is modules/overview.js over core/overview.js. Figures: Open records, Unassigned and Responded, not closed (Inbox filters), Overdue tasks, Due within a day and Awaiting decision (Tasks views); each figure is the count its list computes and opens that list so filtered (the Inbox at Intake's address, Tasks at My Work's). Command Center's Active tasks and Dispatched are not figures: neither is a list in the essential structure (dispatch is on the record), and Responded counts the records answered by a reply or a dispatch. Incoming by intake: four figures, the Inbox's source counts, each opening the Inbox at that intake. Needs attention: the work owed soonest, overdue first, then due within a day, then not yet acknowledged; a row opens its record page. Reports is modules/reports.js drawn as a section (mountEmbedded): the two reports UX-D6 set, Summary and Full list, with Print, Download and one Email report. One Export to spreadsheet: the register as the Inbox lists it. Behind the essential screens' switch, at the Command Center's address; the Command Center is unchanged when it is off. tests/inbox-overview.test.mjs (every figure is the count of the list it opens; incoming by intake is the Inbox filtered to each intake; attention order) and tests/inbox-overview.spec.js (figures open Tasks and the Inbox so filtered; Reports' two reports and one email action; one export). (2026-10-22)

#### UX-304

**Header search opens the record** · Engineering · DONE · from ESSENTIALS_MAP §7.11

Replaces Lookup & Direct Action.

Steps:

1. Search by reference, sender or subject, grouped by documents and tasks.
1. A result opens the record page.

**Done when:** Any record Lookup finds today is found by header search and opens on its record page.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** The header's search box (Ctrl K) finds records before workspaces: core/record-search.js searches every document loaded on the device (the register and Lookup's activities, joined by reference) and every task, by reference, sender or subject, and by everything Lookup matched on (status, category, assignee, priority). Results are grouped as Documents, Tasks and Messages not yet registered (shared/shell.js renderCommandResults); a minute or an approval finds the record it was written on, and a registered e-mail finds the record it became. A document or task opens on its record page (core/record-view.js findRecord now also resolves an activity outside the register); with the record page switched off it opens where it opened before (Lookup for a task or an activity, Intake for a register record), and a message opens on Intake with Register. Enter opens the first result. tests/record-search.test.mjs (17 checks, in npm run test:node through test:recordview, including that whatever Lookup's own search found is found here and that every document and task found opens on its record page) and tests/header-search.spec.js (sender finds and opens the record page; Enter on a reference; with the switch off a task opens in Lookup and a message on Intake; no match says so). (2026-10-22)

### P4 · Cut-over and decommissioning

The new structure becomes the default; old screens redirect; removed screens and code go.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-401](#ux-401) Cut-over: the new structure by default, old addresses redirect | Engineering | DONE | UX-301, UX-302, UX-303, UX-304, UX-203 |
| [UX-402](#ux-402) Administration behind the profile menu | Engineering | DONE | UX-401, UX-D7 |
| [UX-403](#ux-403) Decommission the replaced screens and their code | Engineering | OPEN | UX-401, UX-402, UX-D3, UX-D5 |
| [UX-404](#ux-404) Regenerate the generated records | Engineering | BLOCKED | UX-403 |

#### UX-401

**Cut-over: the new structure by default, old addresses redirect** · Engineering · DONE · from ESSENTIALS_MAP §6.2, §10

The sidebar becomes Inbox, Tasks, Overview.

Steps:

1. Switch on by default.
1. Each of the 31 routes redirects to its destination in ESSENTIALS_MAP §6.2 (core/deeplink-resolver.js), so links in sent emails keep working.
1. Role rules: a role sees an entry when it may perform at least one action inside it.

**Done when:** systemAdmin's sidebar has 3 entries; every one of the 31 old routes lands on its mapped destination; deep-link specs pass.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** Owner approval, 2026-10-22 ('Approved', in reply to the question whether to cut over now that phase 3 was complete). The new structure is the only one: the record page and the essential screens are no longer behind switches (shared/record-page.js), and the preview switches are gone from the profile menu. config/workflow-clarity.config.js declares the three places, Overview (home), Inbox (correspondence) and Tasks (orchestrator), each drawn at that address (core/boot.js), and RouteRedirects: every other office route lands on the place its work moved to, as ESSENTIALS_MAP §6.2 sets, with that list's filter (core/route-redirects.js, applied by core/router.js before a route is drawn, keeping the link's parameters): Counter deposit opens Register a document, Routed the Inbox's In progress, Registry the Physical files filter, Acknowledge Tasks › Not yet acknowledged, SLA risk Tasks › At risk, Approvals and DG/CEO Tasks › Awaiting decision, the Outbound screens Tasks › Ready to close, Statistics and Reports the Overview, Lookup the header search, and Briefs, Meetings, Projects (UX-D3) and the Assistant (UX-D5) the Overview, a support link opening Ask the support team, now under Help (shared/support-form.js). A link that names a record opens it on its record page wherever it lands, and the place says when the record is still loading or has not loaded (linkedRecordNotice); a Portal Registry link opens its record. Role rules: a role sees a place when it may open at least one route whose work moved into it; the sidebar is systemAdmin 3, director 3, operator 3, executive 2, viewer 2, userAdmin 1. Jobs that lived only on replaced screens moved onto the record page through their own writes: deciding a pending approval request (core/record-actions.js decideApproval, Review & Approval's), marks (toggleFlag, Lookup's, under its owner Activities), the advisory AI suggestion at triage (D2, Intake's), and a Portal submission's public status (UX-301); the Intake Register's rows are records (core/record-search.js allDocuments), so a submission not yet in the register opens too. tests/cutover.spec.js (the sidebar; every one of the 24 redirected routes lands on its destination with its filter; Lookup opens the header search; a task link opens its record), tests/module-rationalisation.test.mjs and tests/governance.test.mjs (the declared structure); the deep-link specs (tests/boot-data-deeplinks.spec.js, tests/deeplinks-signin.spec.js, tests/notice-links.spec.js) pass against the new destinations. Specs of the replaced screens were rewritten onto the record page and the three places where their behaviour still matters (closure, document flags, D2, in-app notices, portal status, correspondence, scan intake, wayfinding, layout budget, containment, design audit); tests/lookup-commits.spec.js and tests/endpoint-console.spec.js covered only removed screens and were removed. (2026-10-22)

#### UX-402

**Administration behind the profile menu** · Engineering · DONE · from ESSENTIALS_MAP §7.17

Admin Suite, Settings, Health and Users leave the office sidebar.

Steps:

1. One Administration entry in the profile menu for systemAdmin and userAdmin.
1. Health and Runtime become one Health tab.
1. Endpoints kept or dropped per UX-D7.

**Done when:** No administration screen is reachable from the office sidebar; administrators reach all of it from the profile menu.

**Checked by:** `npm run test:node`, `npx playwright test`

**Evidence:** Administration is config/workflow-clarity.config.js AdministrationWorkspace, not a sidebar entry: the profile menu's Administration entry (shared/shell.js, data-admin-entry) is shown only to an account that may open one of its tabs (systemAdmin and userAdmin) and opens the first it may. Its tabs are Suite, Settings, Health and Users. Health and Runtime are one Health tab: System Health draws Runtime (modules/operator-hud.js mountEmbedded) below its checks, and operator-hud redirects to it. Per owner decision UX-D7 the Endpoints tab is dropped; endpoint-console redirects to Administration. tests/cutover.spec.js (the menu entry, the four tabs, Runtime in Health), tests/admin-suite.spec.js (reached from the profile menu, not the sidebar), tests/module-rationalisation.test.mjs (no administration screen is in the sidebar; Administration is for systemAdmin and userAdmin only). (2026-10-22)

#### UX-403

**Decommission the replaced screens and their code** · Engineering · OPEN · from ESSENTIALS_MAP §6, §7

Remove every element marked DECOMMISSION, and every screen whose job has moved, once nothing routes to it.

Steps:

1. Remove the replaced modules (Activities, Lookup screen, Assignment Desk and Bulk screens, Acknowledge, Comments, Monitoring, SLA risk views, Approvals, DG/CEO and Outbound screens) once their actions live on the record and lists.
1. Meetings, Projects, Briefs per UX-D3; Assistant chat per UX-D5; ERP-ECM Charter to the documents.
1. Remove config only they used, and the tests that covered only them.

**Done when:** No module, config entry or test remains for a screen marked removed; npm run test:node and the browser suite pass.

**Checked by:** `npm run test:node`, `npx playwright test`

#### UX-404

**Regenerate the generated records** · Engineering · BLOCKED · from ESSENTIALS_MAP §10 step 6

workflow-clarity, HiddenTechnicalRoutes, docs/process/, docs/PLATFORM.md and docs/visual/platform-data.js describe the old structure.

Steps:

1. Update the declared structure once, then run each generator the failing checks name.

**Done when:** Every generated record describes the new structure and every generator's check passes.

**Checked by:** `npm run test:node`

### P5 · Verification and acceptance

Measured against the targets, and accepted by the office.

| Item | Owner | Status | Depends on |
|---|---|---|---|
| [UX-501](#ux-501) Measure the result against every target | Engineering | BLOCKED | UX-404, UX-110 |
| [UX-502](#ux-502) Office acceptance walkthrough | Owner | BLOCKED | UX-501 |

#### UX-501

**Measure the result against every target** · Engineering · BLOCKED · from ESSENTIALS_MAP §8.2; LAYOUT_REVIEW §5

Re-run the control inventory and the layout measurement.

Steps:

1. Record each target's measured value in this file's targets.

**Done when:** Every target in this file is met, with the measured value recorded.

**Checked by:** `npx playwright test`

#### UX-502

**Office acceptance walkthrough** · Owner · BLOCKED

Officers from the registry, an action officer and the DG's office take one record from each intake through to closure.

Steps:

1. One record per intake: received, triaged, assigned, acknowledged, minuted, decided, replied or dispatched, closed, all from the record page.

**Done when:** The owner accepts the Workspace, recorded here as evidence, or lists what must change.

## Rules

- An item changes status only in a commit to this file. DONE needs `evidence` (the commit or command output that shows the resolution criteria are met) and `closedUtc`. DROPPED needs `evidence` naming the owner decision that dropped it.
- An item may start only when every item in its `dependencies` is DONE. An item whose dependency is an owner decision that is still open is BLOCKED, not OPEN.
- No item changes a flow package. If one turns out to need a write the running Dynamic Actions package does not implement, it stops and is raised to the owner first (CLAUDE.md, flow packages are released, then pasted once).
- Generated files (config/workflow-clarity.config.js consumers, docs/process/, docs/PLATFORM.md, docs/visual/platform-data.js) are regenerated by their generators, never edited by hand.
- Every build item is checked with npm run test:node and npx playwright test before it is marked DONE.
