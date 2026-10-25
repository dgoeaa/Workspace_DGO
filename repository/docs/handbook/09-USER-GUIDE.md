# 9 · User guide

> **Status:** handbook chapter, 2026-10-10; navigation and recording revised 2026-10-20 (module rationalisation). It carries steps for using the Workspace, and owns none of the tenant procedures.

For everyone who uses the Folio Workspace to handle correspondence. Find your role in §9.3 and read the
tasks for it.

## 9.1 Signing in

1. Open **https://folio-platform.page.gd/** in an up-to-date browser (Chrome, Edge, Firefox or Safari).
2. The **Sign in to continue** box opens. Type your **work e-mail address** and press **Email me a code**.
3. Open the e-mail from the registry mailbox and type the **6-digit code**.
   - A wrong code is refused. After five wrong tries, request a new code.
   - If no e-mail arrives within a few minutes, check junk mail, then ask a User Administrator to check that
     your address is in Folio and **active**.
4. Folio loads your work. **Allow about 20 seconds** the first time: the first screen fills when the data
   arrives.
5. A welcome card may appear. Press **Continue to Command Center**, or **Skip for now**.

You stay signed in for **4 hours**, in every tab of the same browser: a link from a task e-mail, or a second tab,
opens without a new code, and so does the browser after it is closed and reopened. After 4 hours Folio asks for a new
code. To end it sooner, open your profile (top right) and press **Sign out**: every Folio tab in that browser signs out.
On a shared computer, always sign out. Folio never asks for a password.

## 9.2 Finding your way

- **The menu** (☰, top left) lists the workspaces your role can open, in groups: START HERE, OPERATIONS,
  CONTROL, CLOSURE, and SYSTEM for administrators. There are 13 workspaces, one for each stage of the work.
- **Tabs**: a workspace that does more than one job shows its tabs across the top of the screen, for example
  **Decisions › Approvals · DG/CEO · Briefs**. You see only the tabs your role can open.
- **The header buttons**: search, help (?), **refresh (⟳)** to fetch the latest records, more options,
  language, notifications (bell), and your profile.
- **The Command Center** is the start page. Its tiles count open references, unassigned items, active
  tasks, overdue items and dispatched items. Each "Recommended next action" card opens the workspace that
  deals with it.
- **Continue in** (bottom bar) offers the next workspace for what you are doing.
- **Lookup** finds any record by reference (for example `NITDA-2026-00123`), sender or subject.

| Workspace | Tabs |
| --- | --- |
| Command Center | Overview · ERP–ECM Charter |
| Intake | To triage · Counter deposit · Routed · Assignment Desk · Bulk assignment |
| My Work | My tasks · Acknowledge · Comments |
| Registry | File custody |
| Lookup | Lookup & Direct Action |
| SLA & Tracking | Monitoring · SLA risk |
| Decisions | Approvals · DG/CEO · Briefs |
| Meetings | Meetings |
| Projects | Projects |
| Insight | Statistics · Reports |
| Outbound | Send by email · Record a dispatch · Close & archive |
| Admin Suite | Suite · Administration · Health · Runtime · Endpoints · Users |
| Assistant | Assistant |

What you see depends on your role. If you need a workspace you cannot see, ask a User Administrator. Every
address that worked before still opens: it is now a tab of its workspace.

## 9.3 Tasks by role

### Registry and operators (role: Operator)

| You want to | Go to | Then |
| --- | --- | --- |
| See what came in | **Intake › To triage** | New records from the Portal, e-mail, the counter and the scanner appear here |
| Lodge a paper document | **Intake › Counter deposit** | Upload the scan; or scan to the registry scanner, which files into `/E-DOCUMENT STATION` and appears within a few minutes |
| Log a memo | **Intake › To triage › Log New Memo** | Folio registers it and issues its reference |
| Triage it | **Intake › To triage** | Set the status (Pending, In Treatment, Accepted, Declined, Archived). The status is recorded on the server; priority, category and remarks are kept with your device's copy of the record |
| Assign it to an officer | **Intake** (assign in place), or **Intake › Assignment Desk** | Choose the officer and due date, and confirm. The officer gets an e-mail. |
| Assign many at once | **Intake › Bulk assignment** | Select the items, choose the officer, confirm |
| Route to SIWES, NYSC or archive | **Intake › Routed** | The routed records, Treated and Not Treated |
| Keep the files in order | **Registry › File custody** | Open a file (the server issues its file number), route it, record receipt, close it. Every move is recorded on the server |
| Send official e-mail | **Outbound › Send by email** | Drafts, branded templates, the sent register |
| Record a dispatch | **Outbound › Record a dispatch** | An e-mail dispatch is sent through the Email Desk; any other channel is recorded here. Folio marks the document as treated |

### Officers with assigned tasks

| You want to | Go to | Then | Roles that can open it |
| --- | --- | --- | --- |
| Confirm you received a task | The task e-mail's **Acknowledge Receipt** button, or **My Work › Acknowledge** | Folio records who acknowledged and when; the deadline clock is shown | every role |
| Work on it | **My Work › My tasks** | It opens on your own tasks (Mine); Team, Overdue and Escalated are beside it. **Start work**, then **Mark Completed**: each is recorded on the server | Operator, Director, Executive, Read-only Viewer, System Administrator |
| Set a reminder | **My Work › My tasks** | The reminder is recorded on the server and e-mailed to the assignee on the day | as above |
| Discuss it | **My Work › Comments** | A comment is recorded on the server against the record's task, for everyone on the record. A record with no task keeps the comment on your device, and says so | Operator, Director, Executive, Read-only Viewer, System Administrator |
| Check deadlines | **SLA & Tracking › Monitoring**; **SLA & Tracking › SLA risk** | Items at risk of missing their target | Monitoring: every role except User Administrator; SLA risk: System Administrator |

> A **Read-only Viewer** or **Executive** can update and complete the tasks assigned to them in **My Work**,
> but not other people's tasks (2026-10-10).

### Directors (role: Director)

As officers, plus **Intake**, **Decisions › Approvals** (review, return, reject, approve, escalate),
**Outbound › Record a dispatch**, **Decisions › Briefs**, **Meetings**, **Projects** and **Insight**.
A director sees the tasks assigned to them and the tasks routed to their directorate (ITEM-91).

### Executives (role: Executive)

**Decisions › DG/CEO** for correspondence decisions (each is recorded on the server before anyone is e-mailed);
**Decisions › Approvals**; **Decisions › Briefs**; **Meetings**; **Projects**; **Insight**;
**Outbound › Close & archive**.

### Read-only viewers (role: Read-only Viewer)

Command Center, SLA & Tracking, **My Work** (My tasks, Acknowledge, Comments), Insight and Lookup. You see
your own tasks and the documents they belong to.

## 9.4 Confirmations and messages

- Before Folio changes anything, it shows what it will do and asks you to confirm. Nothing is saved until you do.
- A green message confirms a change. Most say **recorded on the server**: the change is held by the server and
  every officer sees it. A message that says **on this device only** means the record has not reached the
  server, so the change is kept in your browser alone.
- A red message means nothing was saved: read it, then try again or ask for help. A change the server refuses
  is not retried; the message says why.
- **"The server could not be reached, so nothing was reloaded"** after pressing ⟳: your screen still shows
  the records you had. Try once more; if it persists, press **Sign out** in your profile, then sign in again.
- **"NITDA Folio could not start"**: press **Try again**. If it repeats, tell IT support the time you saw it.
- AI buttons say the service is **unavailable**: AI analysis is switched off at go-live, by decision.

## 9.5 The public Document Portal

Members of the public use **https://folio-portal.page.gd/** to:

- **submit** correspondence with attachments, after confirming their e-mail with a code;
- **track** a submission with its reference and their e-mail;
- **ask for support** (they receive a case reference, `CASE-…`).

What they see as the status (Received, Validation, Under review, Action required, Approved, Declined,
Withdrawn) is set by staff in Folio.

## 9.6 Getting help

| Problem | Who |
| --- | --- |
| No code e-mail, cannot sign in, missing a workspace | Your User Administrator |
| Data missing or wrong | Registry (Operator) for the record; IT support for system faults |
| Anything else | The **Assistant** in Folio, then IT support |

When you report a fault, give the time, the screen, the reference you were working on and the exact message.
