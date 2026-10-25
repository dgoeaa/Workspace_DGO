# PROC-016 — CG_Portal_Daily_Sweep

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-016 |
| Name | CG_Portal_Daily_Sweep |
| Alternative or legacy name | — |
| Category | Automated · Scheduled |
| Description | Power Automate workflow carrying 60 action(s) under 1 trigger(s). |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. No supplied artifact states what this workflow is for in business terms; its name and its actions are all the export carries. |
| Operational objective | Reads from and writes to Microsoft Office 365 Outlook, Microsoft SharePoint Online. |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Flow estate |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Every action, run-after condition, branch and connector call is CONFIRMED from the tenant export and catalogued step by step. What the workflow is FOR, who owns it and how critical it is are NOT evidenced: no supplied artifact states them. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-069` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Portal_Daily_Sweep__f12aec6d-1554-483d-a525-a96ddb60d06f__full_definition.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-0571 | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0572 | Compose Request Context | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0573 | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0574 | Get Notification Config | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0575 | Select Notify Config | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0576 | Compose Notify Config Xml | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0577 | Compose Notify Logo Default | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0578 | Compose Notify Config | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0579 | Get Expired Upload Tickets | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0580 | Select Expired Refs | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0581 | Compose Expired Refs | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0582 | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0583 | Get Expired Submission | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0584 | Get Submission Expired Tickets | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0585 | Select Expired File Rows | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0586 | Select Expired File Flags | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0587 | Compose Expired Upload Should Notify | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0588 | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0589 | Compose Expired Upload Fields | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0590 | Compose Expired Upload Html Part1 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0591 | Compose Expired Upload Html Part2 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0592 | Compose Expired Upload Html | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0593 | Send Expired Upload Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0594 | Foreach Mark Expired Tickets | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0595 | Mark Upload Ticket Expired | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0596 | Compose Expired Submission Outcome | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0597 | Select Expired Digest Rows | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0598 | Get Unacknowledged Submissions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0599 | Select Overdue Rows | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0600 | Compose Sweep Counts | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0601 | Compose Result Sweep 200 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0602 | Scope Catch Sweep | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0603 | Compose Result Sweep 500 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0604 | Scope Finalize Sweep | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0605 | Compose Outcome | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0606 | Compose Completed At | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0607 | Compose Duration Ms | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0608 | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0609 | Get Notification Config C5 | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0610 | Select Notify Config C5 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0611 | Compose Notify Config Xml C5 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0612 | Compose Notify Logo Default C5 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0613 | Compose Notify Config C5 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0614 | Switch Notification Event | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0615 | Compose Digest Fields | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0616 | Compose Digest Html Part1 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0617 | Compose Digest Html Part2 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0618 | Compose Digest Html Part3 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0619 | Compose Digest Html | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0620 | Send Registry Digest Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0621 | Select Failed Step Rows | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0622 | Select Failed Flags | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0623 | Compose Server Error Alert Html Part1 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0624 | Compose Server Error Alert Html Part2 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0625 | Compose Server Error Alert Html Part3 | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0626 | Compose Server Error Alert Html | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0627 | Send Server Error Alert Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0628 | Scope Flow Data Capture | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0629 | Compose Flow Run Record | Power Automate — CG_Portal_Daily_Sweep | Automated |
| STEP-0630 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | Recurrence: Recurrence |
| Trigger type | Recurrence (Recurrence) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow f12aec6d-1554-483d-a525-a96ddb60d06f |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | Recurrence: Recurrence |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0576 | output of Select Notify Config |
| STEP-0578 | output of Compose Notify Config Xml<br>output of Compose Notify Logo Default |
| STEP-0580 | output of Get Expired Upload Tickets |
| STEP-0581 | output of Select Expired Refs |
| STEP-0585 | output of Get Submission Expired Tickets |
| STEP-0586 | output of Get Submission Expired Tickets |
| STEP-0587 | output of Compose Notify Config<br>output of Get Expired Submission |
| STEP-0588 | output of Compose Expired Upload Should Notify |
| STEP-0589 | output of Get Expired Submission<br>output of Select Expired File Rows<br>output of Select Expired File Flags<br>output of Compose Notify Config |
| STEP-0590 | output of Compose Expired Upload Fields |
| STEP-0591 | output of Compose Expired Upload Fields |
| STEP-0592 | output of Compose Expired Upload Html Part1<br>output of Compose Expired Upload Html Part2 |
| STEP-0593 | output of Compose Expired Upload Fields<br>output of Compose Expired Upload Html<br>output of Compose Notify Config |
| STEP-0597 | output of Compose Expired Refs<br>output of Select Expired Refs |
| STEP-0599 | output of Get Unacknowledged Submissions |
| STEP-0600 | output of Select Overdue Rows<br>output of Select Expired Digest Rows<br>output of Get Expired Upload Tickets |
| STEP-0601 | output of Compose Sweep Counts |
| STEP-0607 | output of Compose Completed At<br>output of Compose Request Context |
| STEP-0611 | output of Select Notify Config C5 |
| STEP-0613 | output of Compose Notify Config Xml C5<br>output of Compose Notify Logo Default C5 |
| STEP-0614 | output of Compose Notify Config C5 |
| STEP-0615 | output of Select Overdue Rows<br>output of Select Expired Digest Rows |
| STEP-0616 | output of Compose Digest Fields<br>output of Compose Notify Config C5 |
| STEP-0617 | output of Compose Digest Fields |
| STEP-0619 | output of Compose Digest Html Part1<br>output of Compose Digest Html Part2<br>output of Compose Digest Html Part3 |
| STEP-0620 | output of Compose Notify Config C5<br>output of Compose Digest Fields<br>output of Compose Digest Html |
| STEP-0623 | output of Compose Request Context<br>output of Compose Notify Config C5 |
| STEP-0624 | output of Compose Request Context<br>output of Select Failed Flags<br>output of Select Failed Step Rows |
| STEP-0626 | output of Compose Server Error Alert Html Part1<br>output of Compose Server Error Alert Html Part2<br>output of Compose Server Error Alert Html Part3 |
| STEP-0627 | output of Compose Notify Config C5<br>output of Compose Request Context<br>output of Compose Server Error Alert Html |
| STEP-0629 | output of Compose Request Context |
| STEP-0630 | output of Compose Request Context<br>output of Compose Flow Run Record |

## 5.5 Stages and activities

60 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0571 | 1 | Scope Sweep Flow | flow root | Power Automate — CG_Portal_Daily_Sweep | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0572 | 2 | Compose Request Context | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Entry of Scope Sweep Flow | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Scope Global Sweep | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0573 | 3 | Scope Global Sweep | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Compose Request Context reaches Succeeded | Compose Request Context = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch Sweep (runs when this does not succeed)<br>Scope Finalize Sweep (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0574 | 4 | Get Notification Config | Scope Global Sweep | Microsoft SharePoint Online, called by the flow | Entry of Scope Global Sweep | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Notify Config (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0575 | 5 | Select Notify Config | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Get Notification Config reaches Succeeded or Failed or TimedOut or Skipped | Get Notification Config = Succeeded\|Failed\|TimedOut\|Skipped | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Notify Config Xml | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0576 | 6 | Compose Notify Config Xml | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Select Notify Config reaches Succeeded | Select Notify Config = Succeeded | output of Select Notify Config | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Notify Logo Default | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0577 | 7 | Compose Notify Logo Default | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Notify Config Xml reaches Succeeded | Compose Notify Config Xml = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Notify Config | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0578 | 8 | Compose Notify Config | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Notify Logo Default reaches Succeeded | Compose Notify Logo Default = Succeeded | output of Compose Notify Config Xml<br>output of Compose Notify Logo Default | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Expired Upload Tickets<br>Get Unacknowledged Submissions | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0579 | 9 | Get Expired Upload Tickets | Scope Global Sweep | Microsoft SharePoint Online, called by the flow | Compose Notify Config reaches Succeeded | Compose Notify Config = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Expired Refs | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0580 | 10 | Select Expired Refs | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Get Expired Upload Tickets reaches Succeeded | Get Expired Upload Tickets = Succeeded | output of Get Expired Upload Tickets | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Expired Refs | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0581 | 11 | Compose Expired Refs | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Select Expired Refs reaches Succeeded | Select Expired Refs = Succeeded | output of Select Expired Refs | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Foreach Expired Submission<br>Select Expired Digest Rows | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0582 | 12 | Foreach Expired Submission | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Refs reaches Succeeded | Compose Expired Refs = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Sweep Counts (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0583 | 13 | Get Expired Submission | Foreach Expired Submission | Microsoft SharePoint Online, called by the flow | Entry of Foreach Expired Submission | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get Submission Expired Tickets | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0584 | 14 | Get Submission Expired Tickets | Foreach Expired Submission | Microsoft SharePoint Online, called by the flow | Get Expired Submission reaches Succeeded | Get Expired Submission = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Expired File Rows | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0585 | 15 | Select Expired File Rows | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Get Submission Expired Tickets reaches Succeeded | Get Submission Expired Tickets = Succeeded | output of Get Submission Expired Tickets | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Expired File Flags | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0586 | 16 | Select Expired File Flags | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Select Expired File Rows reaches Succeeded | Select Expired File Rows = Succeeded | output of Get Submission Expired Tickets | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Expired Upload Should Notify | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0587 | 17 | Compose Expired Upload Should Notify | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Select Expired File Flags reaches Succeeded | Select Expired File Flags = Succeeded | output of Compose Notify Config<br>output of Get Expired Submission | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition Notify Expired Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0588 | 18 | Condition Notify Expired Upload | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Upload Should Notify reaches Succeeded | Compose Expired Upload Should Notify = Succeeded | output of Compose Expired Upload Should Notify | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Expired_Upload_Should_Notify')",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Foreach Mark Expired Tickets | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0589 | 19 | Compose Expired Upload Fields | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | Entry of Condition Notify Expired Upload | None declared beyond entry into its container. | output of Get Expired Submission<br>output of Select Expired File Rows<br>output of Select Expired File Flags<br>output of Compose Notify Config | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Expired Upload Html Part1 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0590 | 20 | Compose Expired Upload Html Part1 | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Upload Fields reaches Succeeded | Compose Expired Upload Fields = Succeeded | output of Compose Expired Upload Fields | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Expired Upload Html Part2 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0591 | 21 | Compose Expired Upload Html Part2 | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Upload Html Part1 reaches Succeeded | Compose Expired Upload Html Part1 = Succeeded | output of Compose Expired Upload Fields | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Expired Upload Html | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0592 | 22 | Compose Expired Upload Html | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Upload Html Part2 reaches Succeeded | Compose Expired Upload Html Part2 = Succeeded | output of Compose Expired Upload Html Part1<br>output of Compose Expired Upload Html Part2 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Expired Upload Email | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0593 | 23 | Send Expired Upload Email | Condition Notify Expired Upload | Microsoft Office 365 Outlook, called by the flow | Compose Expired Upload Html reaches Succeeded | Compose Expired Upload Html = Succeeded | output of Compose Expired Upload Fields<br>output of Compose Expired Upload Html<br>output of Compose Notify Config | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-069 |
| STEP-0594 | 24 | Foreach Mark Expired Tickets | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Condition Notify Expired Upload reaches Succeeded | Condition Notify Expired Upload = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Expired Submission Outcome (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0595 | 25 | Mark Upload Ticket Expired | Foreach Mark Expired Tickets | Microsoft SharePoint Online, called by the flow | Entry of Foreach Mark Expired Tickets | None declared beyond entry into its container. | — | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-069 |
| STEP-0596 | 26 | Compose Expired Submission Outcome | Foreach Expired Submission | Power Automate — CG_Portal_Daily_Sweep | Foreach Mark Expired Tickets reaches Succeeded or Failed or TimedOut or Skipped | Foreach Mark Expired Tickets = Succeeded\|Failed\|TimedOut\|Skipped | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0597 | 27 | Select Expired Digest Rows | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Expired Refs reaches Succeeded | Compose Expired Refs = Succeeded | output of Compose Expired Refs<br>output of Select Expired Refs | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Sweep Counts | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0598 | 28 | Get Unacknowledged Submissions | Scope Global Sweep | Microsoft SharePoint Online, called by the flow | Compose Notify Config reaches Succeeded | Compose Notify Config = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Overdue Rows | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0599 | 29 | Select Overdue Rows | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Get Unacknowledged Submissions reaches Succeeded | Get Unacknowledged Submissions = Succeeded | output of Get Unacknowledged Submissions | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Sweep Counts | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0600 | 30 | Compose Sweep Counts | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Select Overdue Rows reaches Succeeded; Select Expired Digest Rows reaches Succeeded; Foreach Expired Submission reaches Succeeded or Failed or TimedOut or Skipped | Select Overdue Rows = Succeeded<br>Select Expired Digest Rows = Succeeded<br>Foreach Expired Submission = Succeeded\|Failed\|TimedOut\|Skipped | output of Select Overdue Rows<br>output of Select Expired Digest Rows<br>output of Get Expired Upload Tickets | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Result Sweep 200 | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0601 | 31 | Compose Result Sweep 200 | Scope Global Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Sweep Counts reaches Succeeded | Compose Sweep Counts = Succeeded | output of Compose Sweep Counts | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0602 | 32 | Scope Catch Sweep | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Scope Global Sweep reaches Failed or TimedOut or Skipped | Scope Global Sweep = Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize Sweep (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0603 | 33 | Compose Result Sweep 500 | Scope Catch Sweep | Power Automate — CG_Portal_Daily_Sweep | Entry of Scope Catch Sweep | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0604 | 34 | Scope Finalize Sweep | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Scope Global Sweep reaches Succeeded or Failed or TimedOut or Skipped; Scope Catch Sweep reaches Succeeded or Skipped | Scope Global Sweep = Succeeded\|Failed\|TimedOut\|Skipped<br>Scope Catch Sweep = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Notifications (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0605 | 35 | Compose Outcome | Scope Finalize Sweep | Power Automate — CG_Portal_Daily_Sweep | Entry of Scope Finalize Sweep | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Completed At | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0606 | 36 | Compose Completed At | Scope Finalize Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Outcome reaches Succeeded | Compose Outcome = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Duration Ms | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0607 | 37 | Compose Duration Ms | Scope Finalize Sweep | Power Automate — CG_Portal_Daily_Sweep | Compose Completed At reaches Succeeded | Compose Completed At = Succeeded | output of Compose Completed At<br>output of Compose Request Context | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0608 | 38 | Scope Notifications | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Scope Finalize Sweep reaches Succeeded or Failed or TimedOut or Skipped | Scope Finalize Sweep = Succeeded\|Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0609 | 39 | Get Notification Config C5 | Scope Notifications | Microsoft SharePoint Online, called by the flow | Entry of Scope Notifications | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Notify Config C5 (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0610 | 40 | Select Notify Config C5 | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Get Notification Config C5 reaches Succeeded or Failed or TimedOut or Skipped | Get Notification Config C5 = Succeeded\|Failed\|TimedOut\|Skipped | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Notify Config Xml C5 | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0611 | 41 | Compose Notify Config Xml C5 | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Select Notify Config C5 reaches Succeeded | Select Notify Config C5 = Succeeded | output of Select Notify Config C5 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Notify Logo Default C5 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0612 | 42 | Compose Notify Logo Default C5 | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Compose Notify Config Xml C5 reaches Succeeded | Compose Notify Config Xml C5 = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Notify Config C5 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0613 | 43 | Compose Notify Config C5 | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Compose Notify Logo Default C5 reaches Succeeded | Compose Notify Logo Default C5 = Succeeded | output of Compose Notify Config Xml C5<br>output of Compose Notify Logo Default C5 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Switch Notification Event | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0614 | 44 | Switch Notification Event | Scope Notifications | Power Automate — CG_Portal_Daily_Sweep | Compose Notify Config C5 reaches Succeeded | Compose Notify Config C5 = Succeeded | output of Compose Notify Config C5 | Evaluates an expression and runs the matching case. | Discriminator: @if(equals(outputs('Compose_Notify_Config_C5')?['enabled'],true),coalesce(actions('Compose_Outcome')?['outputs']?['event'],'none'),'disabled') | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0615 | 45 | Compose Digest Fields | Switch Notification Event · case Case Digest Ready | Power Automate — CG_Portal_Daily_Sweep | Entry of Switch Notification Event · case Case Digest Ready | None declared beyond entry into its container. | output of Select Overdue Rows<br>output of Select Expired Digest Rows | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Digest Html Part1 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0616 | 46 | Compose Digest Html Part1 | Switch Notification Event · case Case Digest Ready | Power Automate — CG_Portal_Daily_Sweep | Compose Digest Fields reaches Succeeded | Compose Digest Fields = Succeeded | output of Compose Digest Fields<br>output of Compose Notify Config C5 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Digest Html Part2 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0617 | 47 | Compose Digest Html Part2 | Switch Notification Event · case Case Digest Ready | Power Automate — CG_Portal_Daily_Sweep | Compose Digest Html Part1 reaches Succeeded | Compose Digest Html Part1 = Succeeded | output of Compose Digest Fields | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Digest Html Part3 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0618 | 48 | Compose Digest Html Part3 | Switch Notification Event · case Case Digest Ready | Power Automate — CG_Portal_Daily_Sweep | Compose Digest Html Part2 reaches Succeeded | Compose Digest Html Part2 = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Digest Html | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0619 | 49 | Compose Digest Html | Switch Notification Event · case Case Digest Ready | Power Automate — CG_Portal_Daily_Sweep | Compose Digest Html Part3 reaches Succeeded | Compose Digest Html Part3 = Succeeded | output of Compose Digest Html Part1<br>output of Compose Digest Html Part2<br>output of Compose Digest Html Part3 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Registry Digest Email | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0620 | 50 | Send Registry Digest Email | Switch Notification Event · case Case Digest Ready | Microsoft Office 365 Outlook, called by the flow | Compose Digest Html reaches Succeeded | Compose Digest Html = Succeeded | output of Compose Notify Config C5<br>output of Compose Digest Fields<br>output of Compose Digest Html | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-069 |
| STEP-0621 | 51 | Select Failed Step Rows | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Entry of Switch Notification Event · case Case Server Error | None declared beyond entry into its container. | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Failed Flags | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0622 | 52 | Select Failed Flags | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Select Failed Step Rows reaches Succeeded | Select Failed Step Rows = Succeeded | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Server Error Alert Html Part1 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0623 | 53 | Compose Server Error Alert Html Part1 | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Select Failed Flags reaches Succeeded | Select Failed Flags = Succeeded | output of Compose Request Context<br>output of Compose Notify Config C5 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Server Error Alert Html Part2 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0624 | 54 | Compose Server Error Alert Html Part2 | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Compose Server Error Alert Html Part1 reaches Succeeded | Compose Server Error Alert Html Part1 = Succeeded | output of Compose Request Context<br>output of Select Failed Flags<br>output of Select Failed Step Rows | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Server Error Alert Html Part3 | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0625 | 55 | Compose Server Error Alert Html Part3 | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Compose Server Error Alert Html Part2 reaches Succeeded | Compose Server Error Alert Html Part2 = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Server Error Alert Html | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0626 | 56 | Compose Server Error Alert Html | Switch Notification Event · case Case Server Error | Power Automate — CG_Portal_Daily_Sweep | Compose Server Error Alert Html Part3 reaches Succeeded | Compose Server Error Alert Html Part3 = Succeeded | output of Compose Server Error Alert Html Part1<br>output of Compose Server Error Alert Html Part2<br>output of Compose Server Error Alert Html Part3 | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Server Error Alert Email | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0627 | 57 | Send Server Error Alert Email | Switch Notification Event · case Case Server Error | Microsoft Office 365 Outlook, called by the flow | Compose Server Error Alert Html reaches Succeeded | Compose Server Error Alert Html = Succeeded | output of Compose Notify Config C5<br>output of Compose Request Context<br>output of Compose Server Error Alert Html | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-069 |
| STEP-0628 | 58 | Scope Flow Data Capture | Scope Sweep Flow | Power Automate — CG_Portal_Daily_Sweep | Scope Notifications reaches Succeeded or Failed or TimedOut or Skipped | Scope Notifications = Succeeded\|Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-069 |
| STEP-0629 | 59 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — CG_Portal_Daily_Sweep | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | output of Compose Request Context | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-069 |
| STEP-0630 | 60 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | output of Compose Request Context<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-069 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-052 | Condition Notify Expired Upload | Power Automate — CG_Portal_Daily_Sweep | `{"and":[{"equals":["@outputs('Compose_Expired_Upload_Should_Notify')",true]}]}` | output of Compose Expired Upload Should Notify | true<br>false | true → Compose Expired Upload Fields, Compose Expired Upload Html Part1, Compose Expired Upload Html Part2, Compose Expired Upload Html, Send Expired Upload Email<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-053 | Switch Notification Event | Power Automate — CG_Portal_Daily_Sweep | `@if(equals(outputs('Compose_Notify_Config_C5')?['enabled'],true),coalesce(actions('Compose_Outcome')?['outputs']?['event'],'none'),'disabled')` | — | digest_ready<br>server_error | "digest_ready" → Compose Digest Fields, Compose Digest Html Part1, Compose Digest Html Part2, Compose Digest Html Part3, Compose Digest Html, Send Registry Digest Email<br>"server_error" → Select Failed Step Rows, Select Failed Flags, Compose Server Error Alert Html Part1, Compose Server Error Alert Html Part2, Compose Server Error Alert Html Part3, Compose Server Error Alert Html, Send Server Error Alert Email | Default branch runs: . | Not declared on the decision itself. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | Writes to the system of record. |
| Completion criteria | The last action completes. The export declares no response to a caller. |
| Successful end state | The last action completes. The export declares no response to a caller. |
| Alternative end states | 8 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-0595 Mark Upload Ticket Expired<br>STEP-0630 Create Flow Telemetry |
| Notifications issued | NOTIF-166 Send Expired Upload Email<br>NOTIF-167 Send Registry Digest Email<br>NOTIF-168 Send Server Error Alert Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-074 | Recovery after Get Notification Config | Get Notification Config reaches Failed or TimedOut or Skipped | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Notify Config. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-075 | Recovery after Foreach Mark Expired Tickets | Foreach Mark Expired Tickets reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Expired Submission Outcome. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-076 | Recovery after Select Overdue Rows, Select Expired Digest Rows, Foreach Expired Submission | Select Overdue Rows reaches ; Select Expired Digest Rows reaches ; Foreach Expired Submission reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Sweep Counts. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-077 | Recovery after Scope Global Sweep | Scope Global Sweep reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch Sweep. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-078 | Recovery after Scope Global Sweep, Scope Catch Sweep | Scope Global Sweep reaches Failed or TimedOut or Skipped; Scope Catch Sweep reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Sweep. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-079 | Recovery after Scope Finalize Sweep | Scope Finalize Sweep reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Notifications. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-080 | Recovery after Get Notification Config C5 | Get Notification Config C5 reaches Failed or TimedOut or Skipped | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Notify Config C5. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-081 | Recovery after Scope Notifications | Scope Notifications reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — CG_Portal_Daily_Sweep | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0593 Send Expired Upload Email | Sends a message; delivery is the record. |
| STEP-0595 Mark Upload Ticket Expired | Writes a list item; the write itself is the audit record. |
| STEP-0620 Send Registry Digest Email | Sends a message; delivery is the record. |
| STEP-0627 Send Server Error Alert Email | Sends a message; delivery is the record. |
| STEP-0630 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
