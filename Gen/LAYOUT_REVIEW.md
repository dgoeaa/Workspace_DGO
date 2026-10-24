# Folio Workspace: Layout Review of the Space Above the Content

**Requested by the owner, 2026-10-21:** review the arrangement, grouping and layout of the controls, and how much space
those controls take up between the header and the main content of each screen.

**Status: findings and a proposed standard.** No code has changed. This review applies to the Workspace as it runs
today, and the standard in §5 is meant to apply equally to the essential Workspace proposed in
[`ESSENTIALS_MAP.md`](ESSENTIALS_MAP.md).

---

## 1. Summary

**On a standard 1366×768 laptop, the median screen spends 296px, 39% of the window, between the header and the first
line of work.** Four screens show less than 90px of their actual list, two or three rows, before the officer has to
scroll: Email Desk, Acknowledge, Activities (Intake › Routed) and Reports.

The space is not used by one large element. It is used by a stack of medium ones, the same five or six on almost every
screen, each needing only a little space by itself:

| Layer | Height | Where |
|---|---|---|
| Ministry bar | 26px | Every screen |
| Header bar | 64px | Every screen |
| Workspace tabs | 51px | Every workspace with more than one tab |
| Page title and description | 55–90px | Every screen |
| Explanatory panel or ribbon | 44–280px | 14 screens |
| Figure tiles | 101–138px | 17 screens |
| Toolbars, each in its own card | 60–197px, one to three stacked | 24 screens |
| *Continue in* bar at the foot | 61–113px | 11 screens |
| Footer status line | 40px | Every screen |

At 1366×768, the fixed layers alone (ministry bar, header, tabs and footer, plus the *Continue in* bar where it shows)
take **181 to 294px of the 768px window, 24–38%**, before a screen draws anything of its own.

## 2. How it was measured

The Workspace was run against the seeded development store, signed in as `systemAdmin`. A headless browser opened all
30 office and administration screens at 1440×900 and at 1366×768 and recorded the position and height of each layer
of the shell and each top-level block of the screen. **"Content starts"** is the top of the first block that holds the
screen's real work: the list, the record, the form, or on a dashboard the figures. It was chosen by inspection for
each screen. The vertical layout is the same at both widths, so the content starts at the same point at both sizes,
and only the space left below it differs. Screenshots of the six worst screens at 1366×768 were checked by eye.

## 3. Space before the content, by screen

*Band* is the space between the bottom of the header bar and the start of the content. *Visible* is the height of
content showing above the fold before any scrolling, at each window size.

| Screen | Band | Visible at 1366×768 | Visible at 1440×900 | What fills the band |
|---|---|---|---|---|
| Outbound › Send by email | 517px | **60px (8%)** | 192px | Tabs, title, 4 figure tiles (all 0), a 160px panel holding one sentence, a toolbar card |
| My Work › Acknowledge | 557px | **81px (11%)** | 213px | Tabs, title, 4 figure tiles, a 280px *Receipts and linked task* panel with five engineering buttons |
| Intake › Routed | 554px | **84px (11%)** | 216px | Tabs, title, a ribbon card, 4 figure tiles, a chip toolbar, a two-row filter toolbar |
| Insight › Reports | 553px | **85px (11%)** | 217px | Tabs, title, report tabs, 4 figure tiles, a 215px control panel with 22 controls |
| SLA & Tracking › Monitoring | 466px | 111px (14%) | 243px | Tabs, title, 4 figure tiles, a 197px filter section |
| Outbound › Close & archive | 476px | 162px (21%) | 294px | Tabs, title, 4 figure tiles, source switcher, a warning toolbar |
| SLA & Tracking › SLA risk | 435px | 203px (26%) | 335px | Tabs, title, 4 figure tiles, a 6-button ribbon, a 7-control toolbar |
| Admin › Endpoints | 411px | 227px (30%) | 359px | Tabs, two-line title, 138px tiles, a view selector |
| Registry, Meetings, Projects | 296px | 281px (37%) | 413px | Title, 4 figure tiles (all 0), a toolbar card |
| Decisions › DG/CEO, Briefs | 347px | 291px (38%) | 423px | Tabs, title, 4 figure tiles, a toolbar card |
| Intake › To triage | 278px | 299px (39%) | 431px | Tabs, title, an explanatory line, one combined control bar |
| Bulk assignment | 318px | 320px (42%) | 452px | Tabs, title, a 160px explanatory panel |
| Admin › Users | 318px | 320px (42%) | 452px | Tabs, title, a 160px restriction notice |
| Admin › Suite | 306px | 332px (43%) | 464px | Tabs, two-line title, a section menu, a chip menu |
| My Work › My tasks | 235px | 342px (45%) | 474px | Tabs, title, one toolbar card |
| Decisions › Approvals | 235px | 342px (45%) | 474px | Tabs, title, one toolbar card |
| Intake › Counter deposit | 286px | 352px (46%) | 484px | Tabs, title, 3 figure tiles |
| Command Center | 165px | 360px (47%) | 492px | Tabs, title (the figures are the content) |
| Outbound › Record a dispatch | 261px | 377px (49%) | 509px | Tabs, two-line title, a status toolbar |
| My Work › Comments | 226px | 412px (54%) | 544px | Tabs, title, a toolbar holding a count and Refresh |
| Admin › Health, Runtime | 225px | 413px (54%) | 545px | Tabs, title, a section menu |
| Admin › Administration | 205px | 433px (56%) | 565px | Tabs, title, a status strip |
| Assistant | 114px | 463px (60%) | 595px | Title |
| Lookup | 97px | 480px (63%) | 612px | Title (the search box is the content) |
| Assignment Desk, Statistics | 148px | 490px (64%) | 622px | Tabs, title |

**Median band: 296px.** Only 3 of the 30 screens show more than 60% of the window as content at 1366×768.

## 4. Findings

### L-1 The screen's name is shown three times, and the three often disagree · High

Each screen shows its name in the header ("ACTIVE WORKSPACE Activities"), in the selected tab ("Routed") and as the
page title ("Activities"). The sidebar shows a fourth ("Intake"). On Intake › Routed all four differ. On
Outbound › Send by email the header and title say "Correspondence Email Desk", the tab says "Send by email", and the
sidebar says "Outbound". The repetition costs about 75px per screen (a 55–90px title block plus the header label) and
makes the officer wonder whether they are where they meant to be.

### L-2 Figure tiles take 100–138px to show one number each · High

Seventeen screens open with a row of four large tiles. Many repeat the list directly below them ("Records 16 · In view
16"), show zeros ("Drafts 0 · Waiting to go out 0 · Sent 0 · All emails 0"), or show something no officer acts on
("SLA compliance 0%" beside "Acknowledged tasks 0"). The tiles cannot be clicked to filter the list, so the same
groups are offered again as chips a few lines lower (Activities: tiles *Treated 5*, *Not treated 11*; chips *All*,
*Treated*, *Not Treated*).

### L-3 Every panel is at least 160px tall, whatever it holds · High

`styles/app.css:19` sets `.panel{min-height:160px}`. A panel holding one sentence (Email Desk's *Official email
correspondence register*, Bulk assignment's explanation, Users' restriction notice, Health's *Failed notices*) still
takes 160px, most of it empty white space. Only panels marked `panel--inline` escape it. This one rule accounts for
about 100px of wasted space on each of at least nine screens.

### L-4 Explanations sit in the work area · Medium

Fourteen screens put an explanation between the title and the work: "Records are assigned from this screen. Two other
assignment modes open from here." (Intake), "This desk sends real letters out of the office by email…" (Email Desk),
"FastTrack owns urgent assignment, escalation and notification actions." (SLA risk), "Closing a reference here is
final…" (Archive). A sentence an officer needs once belongs in Help. A warning that matters at the moment of action
belongs in that action's confirmation, which exists already for every write (`core/flow-confirmation.js`).

### L-5 Controls are split across several stacked cards instead of one bar · High

Toolbars are drawn as separate bordered cards, each at least 60px with its own padding and margin, and one screen can
have three of them. Activities stacks a ribbon card, a chip card and a two-row filter card: 231px of controls, and 7
dropdowns labelled only "All", plus 2 date fields with no label at all. Monitoring's *Source view* switcher and its
view chips take 197px. Intake › To triage is the counter-example: its figures, search, status, category, view toggle,
primary action and overflow menu share **one 74px bar**. That screen has the best band of any list screen.

### L-6 The primary action moves from screen to screen · Medium

The button that starts the screen's main job sits top right on Intake (*Log New Memo*), inside the toolbar card on
Approvals (*New Approval Request*), Briefs, Meetings and Projects (where it is also repeated in the empty state), at
the foot of a long form on Counter deposit (*Deposit and create correspondence*, 751px down), and in a lower panel on
Archive. An officer cannot learn one place to look for "do the thing this screen is for".

### L-7 The header's icon buttons do not say what they do · Medium

The header shows five identical square icon buttons. Two have misleading symbols: **density is a downward chevron**,
which reads as "open a menu", and **theme is a globe**, which reads as "language" (`shared/shell.js:97-98`). Neither
is a daily action; both belong in the profile menu. The other three (Help, Sync, Notifications) are clear enough once
learned, but they are not labelled.

### L-8 The foot of the screen is taken by navigation and a status line · Medium

The *Continue in* bar (61px, 113px on Command Center when it wraps) repeats the sidebar on 11 screens. Below it, a 40px
footer shows "NITDA Folio" and a timestamp. Together they take 101–153px at the bottom of a window whose top is already
taken by 141px of shell.

### L-9 The sidebar spends 220px on branding · Low

Two logos, the product name and a sub-title take the top 220px of the sidebar. At 768px tall the sidebar's own items
then need scrolling: Meetings, Projects, Insight, Outbound, Admin Suite and Assistant are below its fold. The ministry
bar repeats the government identity in a further 26px across the whole window.

### L-10 Engineering panels take the top of office screens · High

Acknowledge opens with a 280px panel of engineering detail and engineering buttons (*Export receipts (JSON)*, *Copy
this task's link details*, *Load latest records*) **above** the list of tasks to acknowledge. The essentials map
already removes these (E-6); this review notes that they also cost the screen its working space.

## 5. Proposed layout standard

Every screen is held to one budget and one arrangement.

**Budget.** At 1366×768, no more than **120px of shell** above the content and **no shell at all below it**, and no
more than **one control bar, at most 56px**, between the shell and the content. The content then starts within 176px
of the top of the window on every screen, against a median of 386px today.

**Arrangement, top to bottom:**

```
┌ Header (56px)   [Folio]  [ Search………………… ]                 [Sync] [Notifications] [Help] [Profile ▾]
├ Title row (48px)  Inbox                          Needs triage 3 · Assigned · Closed     ← tabs or view chips, with counts
├ Control bar (≤56px) [Filter ▾] [Source ▾] [Date ▾]  [Search in list]      … [Primary action] [⋯]
└ Content: list, record or form, filling the rest of the window. No footer, no Continue-in bar.
```

| Rule | Replaces |
|---|---|
| **One name, said once.** The page title is the sidebar's name. Sub-views are chips or tabs on the same row as the title. The header carries no "Active workspace" label | L-1. Saves ~75px |
| **Counts live on the filter chips.** "Not treated 11" is both the figure and the filter. Large figure tiles appear only on Overview | L-2. Saves 100–138px on 17 screens |
| **Panels take the height of their content.** Remove `min-height:160px` from `.panel` | L-3. Saves up to ~100px per panel |
| **No explanations in the work area.** Guidance goes to Help; warnings go in the confirmation of the action they concern | L-4. Saves 44–280px on 14 screens |
| **One control bar per screen**, never a card per group. Filters are compact dropdown buttons, each named ("Owner: All", not "All") | L-5 |
| **The primary action is always the last control on the right of the control bar**, shown once | L-6 |
| **The header holds four controls: Search, Sync, Notifications, Help.** Theme, density and Administration go in the profile menu | L-7 |
| **Nothing is fixed at the foot of the screen.** The *Continue in* bar is removed; the sync time moves into the Sync button's tooltip | L-8. Saves 101–153px |
| **The sidebar brand is one 56px row.** The ministry identity appears on the sign-in screen and in printed output, not as a permanent bar | L-9. Saves ~190px of sidebar and 26px of window |

**Effect at 1366×768**, applying only the budget above:

| Screen | Visible content today | Under the standard |
|---|---|---|
| Outbound › Send by email | 60px | ~590px |
| My Work › Acknowledge | 81px | ~590px |
| Intake › Routed | 84px | ~590px |
| Insight › Reports | 85px | ~590px |
| Median screen | 342px | ~590px |

For the screens the essentials map keeps (Inbox, Tasks, Overview and the record page), this means about 14 rows of a
list visible without scrolling at 1366×768, where today Intake › Routed shows two.

## 6. The essentials mockup, checked against the same standard

The mockup published for the essentials map
([Folio Essential Workspace](https://claude.ai/artifact/JLtxJSLxT3sShruS8eV8wf)) already removes L-1, L-2, L-3, L-4,
L-7, L-8 and L-9. It does not yet meet L-5: its Inbox stacks a title row, two filter rows and a selection bar, and its
Tasks screen puts its eight view chips on their own row. Both are to be brought into the single title row and single
control bar of §5 in the mockup's next revision.

## 7. Limits

- One role (`systemAdmin`) and one data set. A role with fewer tabs loses the 51px tab row on single-tab workspaces,
  as Registry, Lookup, Meetings, Projects and Assistant show today.
- "Content starts" was judged screen by screen; the measurements and the judgement are both in §3.
- Phone widths were not measured here. The standard's single control bar must wrap into a filter sheet below 600px.
