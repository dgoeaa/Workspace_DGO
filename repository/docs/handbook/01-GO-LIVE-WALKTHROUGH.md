# 1 · Go-live walkthrough

> **Completed 2026-10-19.** Every step below has been carried out and every item it names is closed (`npm run outstanding`: 0 open, 122 closed). The results, with their evidence, are in the [commissioning report](11-COMMISSIONING-REPORT.md). The steps stay here as the record of how go-live was done, and for re-commissioning.
>
> **Status:** handbook chapter, written 2026-10-10. It carries steps, and owns none: each step's procedure is owned by the readiness register item it names and by [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md).

The path from where Folio stands today to a declared go-live, as an ordered list of steps. Each step
names who acts, what they do, what they should see, what is recorded, and which register item it
closes.

> **Source of truth.** The open items come from `npm run outstanding`, which reads
> [`docs/deployment/PRODUCTION_READINESS_REGISTER.json`](../deployment/PRODUCTION_READINESS_REGISTER.json)
> (version 1.12.41 when this chapter was written: 17 open, 105 closed). If this chapter and the
> register ever disagree, the register wins. Re-run `npm run outstanding` before you start.

## 1.1 Where things stand (2026-10-10)

| Done and verified | Evidence |
| --- | --- |
| The Workspace is deployed to `https://folio-platform.page.gd/` (build of 2026-10-09 21:58 UTC: 15 signed addresses, sign-in enforced, no AI addresses). | Six key files compared byte for byte with the delivered zip; ledger `registers/config-build-ledger.json`. |
| Sign-in by e-mailed code works. | OTP_VERIFY runs at 22:41, 23:28, 23:55 and 00:02 UTC, all succeeded with a `systemadmin` proof for dgsregistry@nitda.gov.ng. |
| Data loads into the Workspace. | FETCH_ALL runs at 23:55:44 and 00:02:39 UTC from the owner's browser, carrying the proof: 200, about 6.4 MB. The Command Center showed 475 open references, 500 active tasks and 483 overdue. |
| Browsers fetch new files after every deployment. | The host answers `cache-control: no-cache, must-revalidate` for HTML, JS and CSS, set by the root `.htaccess` shipped in the build. |
| A false "NITDA Folio could not start" no longer appears while someone types their code. | Browser test `tests/deeplinks-signin.spec.js` ("waiting longer than the boot watchdog…"); commit `5b9f7ed`. |
| The Portal was then served from `https://internal-platform.rf.gd/CG/`; since 2026-10-19 it is `https://folio-portal.page.gd/` (owner). | Both answer 200. |

## 1.2 The order, at a glance

```
Stage A  Prove the deployed Workspace, one role at a time ......... owner (A1–A2)
Stage B  Prove each mail and intake path once, with a test record .. owner (B1–B4)
Stage C  Run the browser suite against the live site ............... platform team (C1)
Stage D  Retire what the new paths replace ......................... platform team (D1–D2)
Stage E  Take the go-live decisions ................................ owner (E1–E7)
Stage F  Clean the test records, record the counter, declare ........ platform team + owner (F1–F3)
Stage G  Hypercare (first two weeks) ............................... operational owner
```

Stages A to C can run on the same day. Stage D waits for B3. Stage F waits for every test in A to D,
because each test writes records that F removes. Stage E can be decided at any time before F3.

**Blocks go-live** below means "Folio cannot be declared live without it". **After go-live** means the
item is real work but does not stop staff using Folio for incoming correspondence. The register's own
category is shown for each item. Where the go-live classification is a recommendation rather than a
recorded decision, it is marked *(recommended)*.

---

## Stage A · Prove the deployed Workspace

### A1 · Sign-in and data, as an administrator (done 2026-10-10)

Recorded above. Nothing to do.

### A2 · Who sees what: the viewer test

| | |
| --- | --- |
| **Who** | Owner |
| **Why** | Role scoping (ITEM-90, closed) was proven with a test account. This proves it on the deployed site with a real viewer. |
| **Before** | You need the e-mail address of an **active viewer** in `DGO_UserDirectory` you can receive mail for. |
| **Blocks go-live** | Yes *(recommended)* |

Steps:

1. Open a **private window** and go to `https://folio-platform.page.gd/`.
2. Enter the viewer's address and press **Email me a code**. Enter the code from the e-mail.
3. Wait about 20 seconds, then press **Continue to Command Center** if the welcome screen shows.
4. Check:
   - the counts show only **that viewer's own tasks** (a viewer with no tasks sees zeros);
   - the menu offers only Command Center, SLA & Tracking, My Work, Insight and Lookup (the viewer row in
     `config/rbac.config.js`, shown as the workspaces whose tabs it opens);
   - in Lookup, other people's e-mail addresses are blank.
5. Report the result to the platform team.

Expected: as above. If the viewer sees everyone's records, stop and report it: that is a scoping defect.

### A3 · User Administration: add and change one test person

| | |
| --- | --- |
| **Who** | Owner (signed in as a System Administrator) |
| **Why** | The User Administration screen writes through the new `USER_ADMIN` service (proven by script on 2026-10-08). This proves the deployed screen. |
| **Blocks go-live** | Yes *(recommended)* |

Steps:

1. Signed in as dgsregistry@nitda.gov.ng, open **Administration › User Administration**.
2. Add one person with a recognisable test name (for example `ZTEST Folio Viewer`), role **Read-only
   Viewer**, status **active**.
3. Change their role to **Operator** and save.
4. Disable them.
5. Tell the platform team the name and e-mail used, so F1 removes the row.

Expected: each save reports success; the row in `DGO_UserDirectory` shows the latest values. Granting
**System Administrator** is refused unless you are a System Administrator yourself.

---

## Stage B · Prove each mail and intake path once

### B1 · One assigned task, end to end (ITEM-87, ITEM-50, ITEM-52)

| | |
| --- | --- |
| **Who** | Owner |
| **Closes** | ITEM-87 (BLOCKING), ITEM-50 (CORRECTNESS), ITEM-52 (CORRECTNESS) |
| **Blocks go-live** | Yes |

Steps:

1. In **Intake & Assignment**, pick one test document and assign it to an officer whose mailbox you
   can read (a test mailbox is fine).
2. In that mailbox, open the assignment e-mail.
3. Press **Acknowledge Receipt** in the e-mail.

Expected:

- the e-mail arrives at the **assigned officer**, and no copy goes to a fixed mailbox (ITEM-50);
- no audit or diagnostics mail is sent alongside it (ITEM-52);
- the button opens `https://folio-platform.page.gd/` on the **Acknowledgment Queue**, on that task, after
  sign-in (ITEM-87); **Support Access** opens the Assistant.

Record: the time, the task reference and the recipient. Send them to the platform team; they file the
evidence and close the three items.

### B2 · One real scan (ITEM-80)

| | |
| --- | --- |
| **Who** | Owner (registry desk) |
| **Closes** | ITEM-80 (ARCHITECTURE), and with D1, ITEM-67 |
| **Blocks go-live** | Yes *(recommended: scanning is one of the four intake sources)* |

Steps:

1. Scan one real or test document at the registry station so it lands in **`/E-DOCUMENT STATION`**, the
   folder the scanner already uses (owner decision 2026-10-16).
2. Wait a few minutes. The flow checks the folder once a minute.
3. Tell the platform team the time and file name.

Expected: the new flow `Folio_Incoming_Correspondence_Scan_Processing_Flow` (197527c8) picks the file
up and a record appears in Folio. The platform team confirms from the flow's run history.

### B3 · The sweep's failure alert (ITEM-70)

| | |
| --- | --- |
| **Who** | Operational owner, with the platform team |
| **Closes** | ITEM-70 (BLOCKING) |
| **Blocks go-live** | Yes (register category BLOCKING) |

Steps:

1. Agree a 15-minute window with the platform team.
2. The platform team sets one value the sweep reads in `Flow Configuration` to a wrong value, so the
   next run of `AUTO_SCHEDULED_SWEEP` (8c19b45c) fails.
3. Confirm the alert e-mail reaches the named operator address.
4. The platform team restores the value at once and confirms the next run succeeds.

### B4 · Delivery proof for sent mail (ITEM-66)

| | |
| --- | --- |
| **Who** | Owner (or anyone holding an Exchange admin role) |
| **Closes** | ITEM-66 (CORRECTNESS) |
| **Blocks go-live** | No *(recommended: receipts are already written; this adds delivery evidence)* |

Choose one:

- **(a)** Run one message trace yourself: Exchange admin centre › **Mail flow › Message trace**, sender
  `dgsregistry@nitda.gov.ng`, the last 7 days. Export the CSV and send it to the platform team.
- **(b)** Give the registry account the read-only **Global Reader** role, and the platform team runs
  the traces with `Get-MessageTraceV2`.

Message trace needs one of: Exchange Administrator, Global Reader, Security Reader or Administrator,
Compliance Administrator, or the Exchange *Message Tracking* role.

---

## Stage C · The browser suite against the live site (MANUAL-3)

| | |
| --- | --- |
| **Who** | Platform team, with the owner's go-ahead |
| **Closes** | MANUAL-3 (MANUAL_GATE) |
| **Blocks go-live** | Yes |

The suite normally starts its own local server. Pointed at the deployed site, it tests what users get:

```bash
DGO_BASE_URL=https://folio-platform.page.gd \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium \
npx playwright test
```

Notes:

- Specs that need the dev server's fixed sign-in code (`000000`) start their own server and cannot run
  against production. The platform team records which specs ran against the live host and which ran
  locally, and why.
- The host shows a JavaScript challenge on the first HTTPS request; a real browser passes it.

Done 2026-10-19: 159 passed, 0 failed against folio-platform.page.gd and folio-portal.page.gd ([evidence](../folio-Master-Flows-and-Endpoints/evidence/2026-10-19-live-browser-suite-pagegd.json)); MANUAL-3 RESOLVED.

Record: the pass and fail counts and the commit tested, in the register's MANUAL-3 entry. The
register's criterion says "all ten spec files"; the suite has since grown to 17 files (192 tests on
2026-10-10). Run all of them, and record the count.

---

## Stage D · Retire what the new paths replace

### D1 · Turn off the legacy scan flow (ITEM-80, ITEM-67)

After B2 succeeds, the platform team turns off `DGSO INCOMING AI PROCESSING` (b6d92bae). That flow is
the only one still sending mail as `dgs@nitda.gov.ng`, so turning it off also closes ITEM-67
(BLOCKING): every remaining mail connection then signs in as `dgsregistry@nitda.gov.ng`.

### D2 · Close the AI items on the delivered build (ITEM-88, ITEM-75)

The owner decided (2026-10-08) that the go-live Workspace carries no AI address. The deployed build
(2026-10-09 21:58 UTC) carries none: `AI_CHAT`, `AI_DOC_ANALYSIS` and `AI_EMAIL_ANALYSIS` are empty
in its `config/config.local.js`. ITEM-88's own resolution criterion is "the go-live build delivered
without the AI addresses by decision", and ITEM-75 closes with ITEM-88. The platform team records this
evidence in a register revision. In the Workspace, AI buttons say the service is unavailable and
change nothing.

---

## Stage E · Decisions for the owner

Each decision is the owner's alone. The platform team acts on the answer.

| # | Item | The question | Options | Recommendation | Blocks go-live |
| --- | --- | --- | --- | --- | --- |
| E1 | ITEM-25 (DECISION_REQUIRED) | Do staff still route activities to **SIWES** or **NYSC**, or archive activities, from Folio? These three operations still answer 501. | (a) Needed: build them. (b) Not needed: retire them from the client and close the item. | Answer per operation, from a needs assessment. | No |
| E2 | ITEM-74 (APPLIED_UNVERIFIED) | Raising a task from an e-mail needs an e-mail source in Folio, and the go-live build has none. | (a) Build an e-mail read. (b) Defer e-mail-to-task past go-live. | (b) for go-live. | No, if (b) |
| E3 | ITEM-91 (SPECIFIED_NOT_APPLIED) | Directors see only their own items until one task-list index is freed. | (a) Drop one of CorrelationId, AssigneeKey or RoutedOrgKey. (b) Keep the current behaviour. | (b) now; (a) when the first director is added. | No (no director in the directory today) |
| E4 | ITEM-71 (BLOCKED) | Notification release gates: baseline, cutover and hypercare records in the tenant-execution pack. Agency approvals are recorded as not applicable (2026-10-07). | Sign off each record. | Sign off with Stage F. | No *(recommended)* |
| E5 | ITEM-51 (SPECIFIED_NOT_APPLIED) | Who is copied on officer notices: the primary assignee only, or supporting and copy-to parties too? | Primary only, or all parties. | Decide with E4; the sends are built after. | No |
| E6 | ITEM-68 (READY) | Accept the e-mail template library after a person has looked at it in Outlook, Gmail, iOS Mail, dark mode, with images off and with a screen reader. | Accept, or list changes. | Accept after B1, using the real e-mails B1 produced. | No |
| E7 | Hosting (2026-10-09) | Chrome flagged `rf.gd`; the owner moved the Workspace and Portal to folio-platform.page.gd and folio-portal.page.gd (2026-10-19). Hosting is the owner's, outside the commissioning scope. | — | Decided by the owner. | No |

---

## Stage F · Clean, record, declare

### F1 · Remove the test records (MANUAL-2)

| | |
| --- | --- |
| **Who** | Platform team (cleaning approved by the owner, 2026-10-08) |
| **When** | After every test in A to D |
| **Closes** | MANUAL-2 (READY) |

The platform team lists every row created by commissioning (test documents, tasks, the A3 test
person, test proofs and telemetry), removes them, and records each removal. It then records the
**sequence counter's starting value** (`Portal Sequence Counters`), so the first real reference number is
known.

### F2 · Re-check the register

`npm run outstanding` must show no open item that blocks go-live. Items left open must be the ones
the owner accepted as after-go-live in Stage E.

### F3 · Declare go-live

The owner tells staff:

- the address, `https://folio-platform.page.gd/`;
- that they sign in with their work e-mail and the code it receives;
- whom to contact for access: a User Administrator adds people in User Administration;
- the [User guide](09-USER-GUIDE.md).

---

## Stage G · Hypercare (first two weeks)

Daily, the operational owner or platform team checks:

| Check | Where | Act when |
| --- | --- | --- |
| Failed runs | Power Automate › My flows › each Folio flow › Run history | Any `Failed` run: open it and read the failed action. |
| 401 replies | FETCH_ALL and DYNAMIC_ACTIONS run history | A 401 on a real user's request (not the System Health probe): the person's proof expired after 4 hours or they are not active in the directory. |
| Sweep | `AUTO_SCHEDULED_SWEEP` run history | Not run for longer than its schedule, or failed. |
| Telemetry | SharePoint `Portal Flow Telemetry` | Rows with an error status. |
| Access requests | User Administration | New staff waiting for a role. |

**Rollback.** The Workspace is static files. To roll back, upload the previous zip. The flows are
untouched by a Workspace rollback. A flow change is rolled back by re-applying the previous
released package (`npm run flows:update`), which the platform team holds in git.
