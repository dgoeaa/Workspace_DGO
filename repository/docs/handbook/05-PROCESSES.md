# 5 · Processes

How work moves through Folio, end to end, and which screen, service and list each step uses. The
exhaustive, evidence-graded catalogue (process hierarchy, step catalogue, rules, roles, status
transitions, exceptions) is generated in [`docs/process/`](../process/00-README.md). This chapter is
the readable view.

The identification system names eleven processes (`identifier-catalogue.json`):
INTAKE, CLASSIFY, ASSIGN, ACTION, RESPOND, DISPATCH, VERIFY, SUPPORT, TRACK, ARCHIVE and GOVERN.

## 5.1 The correspondence lifecycle

```
 INTAKE ──▶ CLASSIFY ──▶ ASSIGN ──▶ ACKNOWLEDGE ──▶ ACTION ──▶ REVIEW ──▶ DISPATCH ──▶ ARCHIVE
 4 sources  Intake &     Intake &   Acknowledgment  My Work    Review &   Dispatch +   Archive
            Assignment   Assignment Queue / e-mail             Approval   Mailer       Evidence
```

### Step 1 · Intake: four sources

| Source | How it arrives | Service or flow | Lands in | State today |
| --- | --- | --- | --- | --- |
| **Public portal** | A member of the public submits on the Portal (`/CG/submit.html`) after verifying their e-mail | SUBMISSION, UPLOAD, VERIFY, VERIFY_CONFIRM | Portal Registry, Portal Attachments | Live |
| **Physical documents, scanned** | (a) The registry scanner saves into `/E-DOCUMENT STATION`. (b) Registry staff lodge a scan from **Registry Scan Intake**. | (a) `Folio_Incoming_Correspondence_Scan_Processing_Flow` (every minute). (b) SCAN_INTAKE. | DGO DIGITAL OPS (and the intake register) | (a) Live: first scan processed 2026-10-16 (ITEM-80). (b) Live. |
| **Customer-service e-mail** | Mail to the monitored mailboxes | EMAIL_RELATED_TASK creates a task from an e-mail | Global Tracking Queue | **Not available at go-live**: the build has no e-mail source (ITEM-74, decision E2) |
| **DGCEO outgoing correspondence** | Raised internally | Workspace screens | DGO DIGITAL OPS | Live |

Every new record receives a Registry Reference (`NITDA-YYYY-NNNNN`) and an Entity Key.

### Step 2 · Classify and triage

**Screen:** Intake & Assignment (`#/correspondence`). **Who:** operators and directors.

Choose the category and sub-category from `Organizational_Categories_Matrix`. The category supplies
the default responsible unit, the supporting units, the units to inform, the priority and the timeline.
AI classification is switched off in the go-live build (ITEM-88); classification is by a person.

### Step 3 · Assign

**Screens:** Intake & Assignment (assign in place), Assignment Desk, Bulk Assignment.
**Services:** SINGLE_ASSIGNMENT, BULK_ASSIGNMENT. **Writes:** a task row in Global Tracking Queue
(`AssignedTo`, `AssignedBy`, `GDSUROUT`, `DueDate`, `Priority`, `TaskRef`), linked to the document by
`RefIDD`.

The assignee receives an e-mail with two buttons: **Acknowledge Receipt** (opens the Acknowledgment
Queue on that task) and **Support Access** (opens the Assistant). Links open at
`https://folio-platform.page.gd/` (ITEM-87, proven 2026-10-12: the Acknowledge Receipt button opened the task in the Acknowledgment Queue).

Not yet sent: notices to supporting and copy-to parties, and notices for approvals, escalations,
delegations and reminders (ITEM-51, which waits on decisions E4 and E5).

### Step 4 · Acknowledge

**Screen:** Acknowledgment Queue (`#/acknowledgment`), or the e-mail's button. **Service:**
SUBSIDIARY_ACTIONS (`config/acknowledgement-flow.config.js`), which resolves to the same flow as
DYNAMIC_ACTIONS. Records who acknowledged and when; the SLA clock is shown.

### Step 5 · Act

**Screen:** My Work (`#/orchestrator`). The assignee starts, updates, comments on and completes the
task. **Service:** DYNAMIC_ACTIONS (`update-task`, `transitionstatus`). A task's status is its
`Progress`. Comments go to Task_Comments.

### Step 6 · Review and approve

**Screen:** Review & Approval (`#/approvals`). Review, return, reject or approve, with escalation to
the executive (DGCEO Hub, `#/executive`).

### Step 7 · Dispatch

**Screen:** Dispatch (`#/dispatch`). **The letter itself is sent from the DGO Correspondence Mailer**
(`/mailer.html`), one personalised e-mail per addressee with its signed attachment, and the Mailer logs
each send. Folio's Dispatch screen **records** the dispatch: DYNAMIC_ACTIONS sets the document's
`Status` to *Treated* (ITEM-25, owner decision 2026-10-08).

### Step 8 · Archive

**Screen:** Archive Evidence (`#/archive`, reached from Dispatch). DYNAMIC_ACTIONS sets `Status` to
*Treated* and `IdState` to *ARCHIVED*. The record stays readable and its references do not change.

### Throughout · Track

Tracking & Monitoring (SLA ageing, responses, exports), SLA risk (items at risk), Reports,
Statistics, Lookup & Direct Action (find anything by reference, sender or subject).

## 5.2 Telling the public submitter

A Portal submitter tracks progress on `/CG/track.html` with their reference and e-mail
(STATUS service). An officer changes what they see from Folio; the WRITEBACK service writes the
status and a Portal Status Timeline row. The labels they see are the governed vocabulary in the
[Data model §4.8](04-DATA-MODEL.md#48-status-vocabularies).

## 5.3 Signing in

1. Open the Workspace. If no proof is held, the **Sign in to continue** dialog opens.
2. Enter your work e-mail and press **Email me a code** (OTP_GENERATE).
3. Enter the 6-digit code from the e-mail (OTP_VERIFY). Five wrong attempts lock that code.
4. The Workspace loads your data (about 20 seconds for a full view) and opens the Command Center.
5. The proof lasts 4 hours and ends when you close the tab. After that you sign in again.

Detail: [Architecture §2.3](02-ARCHITECTURE.md#23-identity-sign-in-by-e-mailed-code).

## 5.4 Giving someone access

1. A User Administrator or System Administrator opens **Administration › User Administration**.
2. Adds the person: name, work e-mail, directorate, department, **role**, status **active**
   (USER_ADMIN writes `DGO_UserDirectory` and records the change).
3. The person can sign in at once.
4. To remove access, set the status to **disabled**. Their next request is refused.

Only a System Administrator can make someone a System Administrator.

## 5.5 Support

The public raises a case on `/CG/support.html` (SUPPORT service; case reference `CASE-XXXXXX`,
stored in Portal Support Cases). Staff help is the Assistant (`#/assistant`) and the support routes in
`config/support-routing.config.js`.

## 5.6 Scheduled work

| Flow | Runs | Does |
| --- | --- | --- |
| `Folio_Incoming_Correspondence_Scan_Processing_Flow` | every minute | Picks up new files in `/E-DOCUMENT STATION` |
| `AUTO_SCHEDULED_SWEEP` | on its schedule | Housekeeping; alerts the operator on failure (to be proven, ITEM-70) |
| `CG_Portal_Daily_Sweep` | on a recurrence | Portal housekeeping; its records are in the master folder's `provisioning/packages/` |

## 5.7 Where the processes are specified in full

| Need | Document |
| --- | --- |
| Every process, sub-process and step, with evidence | [`docs/process/`](../process/00-README.md) (generated: `npm run process:docs`) |
| Status transitions | [`docs/process/14-STATUS-AND-TRANSITION-CATALOGUE.md`](../process/14-STATUS-AND-TRANSITION-CATALOGUE.md) |
| Who is responsible for what | [`docs/process/13-ROLES-AND-RESPONSIBILITY-MATRIX.md`](../process/13-ROLES-AND-RESPONSIBILITY-MATRIX.md) |
| Notifications and escalation | [`docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md`](../process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md) |
| Exceptions and recovery | [`docs/process/17-EXCEPTION-AND-RECOVERY-CATALOGUE.md`](../process/17-EXCEPTION-AND-RECOVERY-CATALOGUE.md) |
