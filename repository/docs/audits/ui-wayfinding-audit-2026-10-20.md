# Folio Workspace: UI wayfinding and scrolling audit (2026-10-20)

Owner report: on Intake, the record details, triage, assignment form and assignment preview were stacked in one
column that scrolled together with the record list. Reaching any section meant scrolling past the others, there was
no way to jump to one, and scrolling felt stiff. The owner asked for the same faults, and any other UI
inefficiencies, to be found and fixed across the whole platform.

Commits on `claude/system-remediation-gaps-ahpmsy`:

| Commit | Scope |
|---|---|
| `791b90e` | Intake & Assignment |
| `293c76d` | Every Workspace screen |
| `1713889` | Phone header auto-hide |

## How the audit was done

The Workspace was run locally in demo mode with seeded records (14 per collection, long remarks). Every route in
`config/routes.config.js` (31 screens) was opened in Chromium at 1440×900, 1366×768, 1024×768 and 390×844. A script
measured, on each screen:

- page length in screens;
- whether each pane of a master-detail split scrolls on its own;
- nested scroll regions that trap the wheel;
- scrolling of the shell frame itself;
- horizontal overflow;
- panels hidden by CSS;
- `hidden` elements that still take space;
- form width and column count;
- keyboard reachability of record rows.

Screenshots were taken before and after each fix.

## Findings and fixes

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | List and record scrolled as one page. The split grew to its longest column, so scrolling a record dragged the list away (6 screens on Correspondence Email). | Intake, Activities, Registry, Briefs, Meetings, Projects, Approvals, Dispatch, Acknowledgment, My Work, Lookup, Tracking & Monitoring, Correspondence Email, DG/CEO hub | Every `[data-md]` split is exactly the visible workspace height. The header scrolls away once, then list and record scroll independently. Archive and User admin panes are capped on desktop. |
| 2 | No way to reach a section without scrolling past the others. | Intake record pane; every record pane with 3+ sections | Sticky section bar at the top of the pane. On Intake: Details · Triage · Assign · Preview · Linked. Triage and Assign open their form, close the other, move to it and focus its first field. The pressed entry follows scrolling. |
| 3 | Long pages with nothing but the scroll wheel. | Reports (10.5 screens), ERP–ECM Charter (7), Diagnostics (3.9), Admin Suite (3.7), Operator HUD, Endpoint Console, Scan Intake, User admin | "On this page" bar under the page header on any page over two screens with 3+ sections. |
| 4 | Stiff scrolling. Every inner box (remarks, lists, tables, panes) had `overscroll-behavior: contain`, so the wheel stopped dead at its end. Measured: 40 wheel ticks over the Intake remarks moved nothing. | Platform-wide | In-page regions hand vertical scroll on when they reach their end. Horizontal stays contained (no accidental back-swipe), and so do overlays (dialogs, palette, side panes). |
| 5 | The shell frame could be scrolled by script. `scrollIntoView` slid the top bar out of view and left a gap under the footer. | Shell (`core/ui.js`, scan intake and endpoint console all call `scrollIntoView`) | Frame and sideways guards use `overflow: clip`, which is not a scroll container. |
| 6 | Real panels hidden as "demo cards". A shape-matching selector hid any headed panel followed by another. | Admin Suite (11 commissioning warnings, e.g. "26 HTTP trigger(s) accept any caller"), Charter "Responsibilities", Intake "Linked Execution Tasks" | Shape selector removed. No screen renders a demo card any more; the class-based selectors remain. |
| 7 | Tables crushed to one letter per line. `overflow-wrap: anywhere` on every cell and panel shrank every column's minimum width to one character. | Reports and any table with one long column | `overflow-wrap: break-word`: long references still break, and columns keep their longest word. |
| 8 | The assignment form was squeezed to half width, one field per row, about 1,500px tall. The empty preview was `hidden` but `display:flex` overrode it. | Intake, Assignment Desk | `.assign-summary[hidden]{display:none}`. The form uses 2–3 columns, and the preview sits beside it on wide panes. Help text no longer stretches the field beside it. |
| 9 | Records could not be opened from the keyboard. Rows were `<article>`/`<tr>` elements with click handlers only. | Every list screen | Rows are focusable, open with Enter or Space, keep focus through the re-render they cause, and carry `aria-current` when selected. |
| 10 | No sign of which record is open, and no cue when it changes. | Activities never highlighted the open row; all record panes | Activities marks the open row. A brief fade marks a newly opened record (skipped under reduced motion). |
| 11 | The list jumped back to its first row on every selection. | Every master-detail screen (once the list became its own scroller) | List scroll position is kept per screen, except when paging. |
| 12 | The filter toolbar was sticky and covered the top of both panes. | Activities and other split screens with a toolbar | The toolbar stays in flow on split screens. |
| 13 | The 13-field user form sat in the narrow column, one field per row, beside empty space. | User admin | The form takes the wider column (2 fields per row, 1,216px → 775px). |
| 14 | A toolbar sentence ran past the workspace edge below 1100px. | Archive | It wraps and gives way to the controls. |
| 15 | On a phone, the header took about 150px of 844px, and "Continue in" wrapped to two rows. | Shell, phone width | Owner direction: the header can disappear. Scrolling down hides the ministry bar and top bar (+146px of workspace); scrolling up, reaching the top, changing route or tabbing into the top bar brings them back. "Continue in" is one sideways row, and the KPI strip snaps and fades at its edge. |

## Where the code is

| File | What |
|---|---|
| `core/workspace-enhance.js` | New. Runs after each screen renders, started by `core/router.js`. Adds the record section bar, the "On this page" bar, list memory, keyboard rows, the record-change cue and the phone header auto-hide. Screens need no change to get these. |
| `modules/correspondence.js` | The Intake section bar with open/close behaviour, list memory and section anchors. |
| `modules/activities.js` | The open record is highlighted. |
| `styles/app.css` | Independent panes, scroll chaining, frame clip, demo-rule fix, table wrapping, form layout, toolbar, phone header and strips. Each block carries a dated comment saying what it fixes. |
| `tests/wayfinding.spec.js` | New. 11 browser tests, one per fault above. |

Regenerated with the repository's own generators, not edited by hand:

- architecture data and the `core/` count on the components page;
- process inventory and process docs;
- visual platform data;
- flow requirements (line references only).

No flow package, endpoint or config file changed. Nothing needs re-pasting and no config rebuild is due.

## Verification

- Browser suite: 224 of 224 passed on `293c76d`. The suites touching the frame, phone layout and touch targets
  (wayfinding, containment, smoke, audit remediation, deep links: 76 tests) passed again on `1713889`.
- Full gate `npm run test:node`, 173 scripts: all pass except `test:readiness` and `test:functionproof`. Both fail
  identically on the branch without these changes. `test:readiness` reports the readiness register pinned to
  `228af9b7` while two files it cites have since changed. They are not part of this work and were left as they are.
- The CSS contract ratchet (`test:css`) passes with no metric worse than its baseline.

## Release package

`releases/folio-platform-suite-1.0.2.zip` (`npm run platform:release`) carries these changes, and the staff e-mail links of `7a3658a`. It replaces 1.0.0 (and 1.0.1, built before `7a3658a`), which
was already out of date before this work: it lacked 16 files now in the tree, among them eight core Workspace modules
(`server-writes.js`, `server-payloads.js`, `link-guard.js`, `failure-health.js`, …). 1.0.1 removes nothing and adds
those 16 files. It is built in demo posture with no signed trigger URLs. `test:platformrelease` unpacks it and starts
all eight platforms from it.

The Mailer release (`dgo-correspondence-mailer-2.1.5.zip`) already matched a fresh build and is unchanged. Registers
that read the release were regenerated: the connector register and workbooks, the estate register, its views and its
artifact. `tests/folio-admin.test.mjs` counted the Workspace's endpoints as a fixed 18, which held only while the
package was stale. The Workspace declares 19, so the check now asserts the keys that are set, not the total.

## Not changed

- On a phone the ministry name still wraps to two lines and the top bar to two rows *while visible*. Earlier commits
  chose that layout deliberately and tests depend on it. With auto-hide it is now out of the way while working.
- Very long phone pages remain long (Archive at 14 records, the Charter): the content itself is long, and the
  "On this page" bar is the way through it.
