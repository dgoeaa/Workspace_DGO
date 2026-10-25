# PROC-015 — BULK OPS DATA RETRIEVAL HTTP

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-015 |
| Name | BULK OPS DATA RETRIEVAL HTTP |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 58 action(s) under 1 trigger(s). |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. No supplied artifact states what this workflow is for in business terms; its name and its actions are all the export carries. |
| Operational objective | Reads from and writes to Microsoft Office 365 Outlook, Microsoft Power Automate Management, Microsoft SharePoint Online. |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Flow estate |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Every action, run-after condition, branch and connector call is CONFIRMED from the tenant export and catalogued step by step. What the workflow is FOR, who owns it and how critical it is are NOT evidenced: no supplied artifact states them. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-068` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/BULK OPS DATA RETRIEVAL HTTP__5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06__full_definition.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft Power Automate Management<br>Microsoft SharePoint Online |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-0513 | Initialize variable varResponse | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0514 | Initialize variable varStatusCode | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0515 | Initialize variable varInstanceBody | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0516 | Initialize variable | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0517 | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0518 | Send Telemetry Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0519 | Compose Telemetry Attachments | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0520 | Compose Flow Run Record Schema | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0521 | Compose Flow Run Record | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0522 | Compose Redacted Headers | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0523 | Compose Redacted Queries | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0524 | Get Flow Definition | Microsoft Power Automate Management, called by the flow | Integration |
| STEP-0525 | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0526 | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0527 | Compose trigger parameter itemId | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0528 | Compose Parameter value | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0529 | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0530 | Append to string variable varInstanceBody Get Document Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0531 | Compose Doc Details Values | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0532 | Select getDoc Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0533 | Compose Response Get Document Deatils | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0534 | Append to string variable varResponse Get Documents Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0535 | Set variable varStatusCode Get Document Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0536 | Get item Document Details | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0537 | Scope Get Document not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0538 | Set variable varStatusCode not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0539 | Append to string variable varResponse  not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0540 | Compose Response  not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0541 | Scope Get Docs Activities | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0542 | Compose ODataQuery | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0543 | Send an HTTP request to SharePoint get Docs | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0544 | Select getDocs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0545 | Append to string variable varInstanceBody get Docs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0546 | Compose HTTP Request OData Query String Optimized | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0547 | Scope Get Docs Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0548 | Set variable varStatusCode Get Docs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0549 | Append to string variable varResponse getDocs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0550 | Compose Response getDocs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0551 | Scope Finalize Response State | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0552 | Set variable  varDurationMs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0553 | Set variable varCompletedAtUtc | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0554 | Set variable varStatusCode | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0555 | Compose  Standard Response Revised | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0556 | Compose Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0557 | Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0558 | Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0559 | Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0560 | Compose Request Origin BULK OPS DATA RETRIEVAL HTTP | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0561 | Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0562 | Initialize variable varReceivedAtUtc | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0563 | Initialize variable varStartTicks | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0564 | Initialize variable varErrors | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0565 | Initialize variable varData | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0566 | Initialize variable varDurationMs | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0567 | Initialize variable varCompletedAtUtc | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0568 | Initialize variable varStatusCode 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0569 | Initialize variable varRequestId | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |
| STEP-0570 | Initialize variable varFailedCount | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft Power Automate Management<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0518 | output of Compose  Standard Response Revised<br>output of Compose Telemetry Attachments |
| STEP-0519 | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Compose  Standard Response Revised |
| STEP-0521 | output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Get Flow Definition |
| STEP-0530 | output of Get item Document Details |
| STEP-0532 | output of Get item Document Details |
| STEP-0533 | output of Select getDoc Details |
| STEP-0534 | output of Compose Response Get Document Deatils |
| STEP-0536 | output of Compose Parameter value |
| STEP-0539 | output of Compose Response  not found response 1 |
| STEP-0543 | output of Compose ODataQuery |
| STEP-0544 | output of Send an HTTP request to SharePoint get Docs |
| STEP-0545 | output of Send an HTTP request to SharePoint get Docs |
| STEP-0549 | output of Compose Response getDocs |
| STEP-0550 | output of Select getDocs |
| STEP-0552 | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' |
| STEP-0554 | variable 'varFailedCount'<br>variable 'varErrors' |
| STEP-0555 | trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-0556 | variable 'varResponse' |
| STEP-0557 | variable 'varStatusCorde'<br>output of Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP<br>output of Compose Response |
| STEP-0559 | output of Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP |
| STEP-0561 | output of Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP<br>output of Compose Request Origin BULK OPS DATA RETRIEVAL HTTP |

## 5.5 Stages and activities

58 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0513 | 1 | Initialize variable varResponse | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStatusCode | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0514 | 2 | Initialize variable varStatusCode | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varResponse reaches Succeeded | Initialize variable varResponse = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varInstanceBody | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0515 | 3 | Initialize variable varInstanceBody | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varStatusCode reaches Succeeded | Initialize variable varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0516 | 4 | Initialize variable | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varInstanceBody reaches Succeeded | Initialize variable varInstanceBody = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varReceivedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0517 | 5 | Scope Flow Data Capture | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Scope Global reaches Succeeded | Scope Global = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0518 | 6 | Send Telemetry Email | Scope Flow Data Capture | Microsoft Office 365 Outlook, called by the flow | Compose Telemetry Attachments reaches Succeeded | Compose Telemetry Attachments = Succeeded | output of Compose  Standard Response Revised<br>output of Compose Telemetry Attachments | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-068 |
| STEP-0519 | 7 | Compose Telemetry Attachments | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Flow Run Record Schema reaches Succeeded | Compose Flow Run Record Schema = Succeeded | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Compose  Standard Response Revised | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Telemetry Email | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0520 | 8 | Compose Flow Run Record Schema | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Telemetry Attachments | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0521 | 9 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Get Flow Definition | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record Schema | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0522 | 10 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0523 | 11 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Get Flow Definition reaches Succeeded | Get Flow Definition = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0524 | 12 | Get Flow Definition | Scope Flow Data Capture | Microsoft Power Automate Management, called by the flow | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | — | Reads a workflow definition through the management connector. | — | Microsoft Power Automate Management returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Redacted Queries | — | Microsoft Power Automate Management | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0525 | 13 | Scope Global | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varFailedCount reaches Succeeded | Initialize variable varFailedCount = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Scope Flow Data Capture | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0526 | 14 | Condition | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope Global | None declared beyond entry into its container. | — | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@and(not(equals(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],''))),'')),or(and(startsWith(toUpper(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))),'REQ-'),equals(length(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))),7),isInt(substring(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],''))),4,3))),and( | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Scope Finalize Response State | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0527 | 15 | Compose trigger parameter itemId | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Condition | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Parameter value | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0528 | 16 | Compose Parameter value | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose trigger parameter itemId reaches Succeeded | Compose trigger parameter itemId = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get item Document Details | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0529 | 17 | Scope get Documente Details | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Get item Document Details reaches Succeeded | Get item Document Details = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0530 | 18 | Append to string variable varInstanceBody Get Document Details | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Select getDoc Details reaches Succeeded | Select getDoc Details = Succeeded | output of Get item Document Details | Appends text to a run-scoped string. | Writes 'varInstanceBody'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varInstanceBody'. | — | Compose Doc Details Values | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0531 | 19 | Compose Doc Details Values | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Append to string variable varInstanceBody Get Document Details reaches Succeeded | Append to string variable varInstanceBody Get Document Details = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Response Get Document Deatils | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0532 | 20 | Select getDoc Details | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope get Documente Details | None declared beyond entry into its container. | output of Get item Document Details | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Append to string variable varInstanceBody Get Document Details | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0533 | 21 | Compose Response Get Document Deatils | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Doc Details Values reaches Succeeded | Compose Doc Details Values = Succeeded | output of Select getDoc Details | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Append to string variable varResponse Get Documents Details | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0534 | 22 | Append to string variable varResponse Get Documents Details | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Response Get Document Deatils reaches Succeeded | Compose Response Get Document Deatils = Succeeded | output of Compose Response Get Document Deatils | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode Get Document Details | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0535 | 23 | Set variable varStatusCode Get Document Details | Scope get Documente Details | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Append to string variable varResponse Get Documents Details reaches Succeeded | Append to string variable varResponse Get Documents Details = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCorde'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCorde'. | Run-scoped outcome variable 'varStatusCorde' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0536 | 24 | Get item Document Details | Condition | Microsoft SharePoint Online, called by the flow | Compose Parameter value reaches Succeeded | Compose Parameter value = Succeeded | output of Compose Parameter value | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Scope get Documente Details | Scope Get Document not found response 1 (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0537 | 25 | Scope Get Document not found response 1 | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Get item Document Details reaches TimedOut or Failed or Skipped | Get item Document Details = TimedOut\|Failed\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-068 |
| STEP-0538 | 26 | Set variable varStatusCode not found response 1 | Scope Get Document not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Append to string variable varResponse  not found response 1 reaches Succeeded | Append to string variable varResponse  not found response 1 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCorde'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCorde'. | Run-scoped outcome variable 'varStatusCorde' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0539 | 27 | Append to string variable varResponse  not found response 1 | Scope Get Document not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Response  not found response 1 reaches Succeeded | Compose Response  not found response 1 = Succeeded | output of Compose Response  not found response 1 | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode not found response 1 | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0540 | 28 | Compose Response  not found response 1 | Scope Get Document not found response 1 | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope Get Document not found response 1 | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Append to string variable varResponse  not found response 1 | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0541 | 29 | Scope Get Docs Activities | Condition · else | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Condition · else | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Scope Get Docs Response | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0542 | 30 | Compose ODataQuery | Scope Get Docs Activities | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope Get Docs Activities | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose HTTP Request OData Query String Optimized | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0543 | 31 | Send an HTTP request to SharePoint get Docs | Scope Get Docs Activities | Microsoft SharePoint Online, called by the flow | Compose HTTP Request OData Query String Optimized reaches Succeeded | Compose HTTP Request OData Query String Optimized = Succeeded | output of Compose ODataQuery | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Append to string variable varInstanceBody get Docs | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0544 | 32 | Select getDocs | Scope Get Docs Activities | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Append to string variable varInstanceBody get Docs reaches Succeeded | Append to string variable varInstanceBody get Docs = Succeeded | output of Send an HTTP request to SharePoint get Docs | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0545 | 33 | Append to string variable varInstanceBody get Docs | Scope Get Docs Activities | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Send an HTTP request to SharePoint get Docs reaches Succeeded | Send an HTTP request to SharePoint get Docs = Succeeded | output of Send an HTTP request to SharePoint get Docs | Appends text to a run-scoped string. | Writes 'varInstanceBody'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varInstanceBody'. | — | Select getDocs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0546 | 34 | Compose HTTP Request OData Query String Optimized | Scope Get Docs Activities | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose ODataQuery reaches Succeeded | Compose ODataQuery = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send an HTTP request to SharePoint get Docs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0547 | 35 | Scope Get Docs Response | Condition · else | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Scope Get Docs Activities reaches Succeeded | Scope Get Docs Activities = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0548 | 36 | Set variable varStatusCode Get Docs | Scope Get Docs Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Append to string variable varResponse getDocs reaches Succeeded | Append to string variable varResponse getDocs = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCorde'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCorde'. | Run-scoped outcome variable 'varStatusCorde' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0549 | 37 | Append to string variable varResponse getDocs | Scope Get Docs Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Response getDocs reaches Succeeded | Compose Response getDocs = Succeeded | output of Compose Response getDocs | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode Get Docs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0550 | 38 | Compose Response getDocs | Scope Get Docs Response | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope Get Docs Response | None declared beyond entry into its container. | output of Select getDocs | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Append to string variable varResponse getDocs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0551 | 39 | Scope Finalize Response State | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Condition reaches Succeeded | Condition = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose  Standard Response Revised | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0552 | 40 | Set variable  varDurationMs | Scope Finalize Response State | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Set variable varCompletedAtUtc reaches Succeeded | Set variable varCompletedAtUtc = Succeeded | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Set variable varStatusCode | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0553 | 41 | Set variable varCompletedAtUtc | Scope Finalize Response State | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Entry of Scope Finalize Response State | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set variable  varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0554 | 42 | Set variable varStatusCode | Scope Finalize Response State | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Set variable  varDurationMs reaches Succeeded | Set variable  varDurationMs = Succeeded | variable 'varFailedCount'<br>variable 'varErrors' | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0555 | 43 | Compose  Standard Response Revised | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Scope Finalize Response State reaches Succeeded | Scope Finalize Response State = Succeeded | trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Response | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0556 | 44 | Compose Response | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose  Standard Response Revised reaches Succeeded | Compose  Standard Response Revised = Succeeded | variable 'varResponse' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0557 | 45 | Response | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP reaches Succeeded | Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP = Succeeded | variable 'varStatusCorde'<br>output of Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP<br>output of Compose Response | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCorde') returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0558 | 46 | Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP | Scope Global | Microsoft SharePoint Online, called by the flow | Compose Response reaches Succeeded | Compose Response = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0559 | 47 | Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP reaches Succeeded | Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP = Succeeded | output of Get Allowed Origins BULK OPS DATA RETRIEVAL HTTP | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin BULK OPS DATA RETRIEVAL HTTP | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0560 | 48 | Compose Request Origin BULK OPS DATA RETRIEVAL HTTP | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP reaches Succeeded | Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0561 | 49 | Compose Allowed Origin BULK OPS DATA RETRIEVAL HTTP | Scope Global | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Compose Request Origin BULK OPS DATA RETRIEVAL HTTP reaches Succeeded | Compose Request Origin BULK OPS DATA RETRIEVAL HTTP = Succeeded | output of Select Allowed Origins BULK OPS DATA RETRIEVAL HTTP<br>output of Compose Request Origin BULK OPS DATA RETRIEVAL HTTP | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0562 | 50 | Initialize variable varReceivedAtUtc | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable reaches Succeeded | Initialize variable = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0563 | 51 | Initialize variable varStartTicks | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varReceivedAtUtc reaches Succeeded | Initialize variable varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0564 | 52 | Initialize variable varErrors | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varStartTicks reaches Succeeded | Initialize variable varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varData | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0565 | 53 | Initialize variable varData | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varErrors reaches Succeeded | Initialize variable varErrors = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0566 | 54 | Initialize variable varDurationMs | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varData reaches Succeeded | Initialize variable varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0567 | 55 | Initialize variable varCompletedAtUtc | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varDurationMs reaches Succeeded | Initialize variable varDurationMs = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStatusCode 1 | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0568 | 56 | Initialize variable varStatusCode 1 | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varCompletedAtUtc reaches Succeeded | Initialize variable varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0569 | 57 | Initialize variable varRequestId | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varStatusCode 1 reaches Succeeded | Initialize variable varStatusCode 1 = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varFailedCount | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |
| STEP-0570 | 58 | Initialize variable varFailedCount | flow root | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Initialize variable varRequestId reaches Succeeded | Initialize variable varRequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Global | — | — | — | — | — | Confirmed | No external validation required | SRC-068 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-051 | Condition | Power Automate — BULK OPS DATA RETRIEVAL HTTP | `{"and":[{"equals":["@and(not(equals(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],''))),'')),or(and(startsWith(toUpper(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))),'REQ-'),equals(length(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))),7),isInt(substring(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],''))),4,3))),and(equals(length(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))),3),isInt(trim(string(coalesce(triggerOutputs()?['queries']?['taskId'],'')))))))",true]}]}` | — | true<br>false | true → Compose trigger parameter itemId, Compose Parameter value, Scope get Documente Details, Get item Document Details, Scope Get Document not found response 1<br>false → Scope Get Docs Activities, Scope Get Docs Response | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCorde'). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCorde'). |
| Alternative end states | 1 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | NOTIF-165 Send Telemetry Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-073 | Recovery after Get item Document Details | Get item Document Details reaches TimedOut or Failed or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Get Document not found response 1. | Power Automate — BULK OPS DATA RETRIEVAL HTTP | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0518 Send Telemetry Email | Sends a message; delivery is the record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
