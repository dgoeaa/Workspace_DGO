# PROC-007 — 03 - GOV - Record HTTP Flow Execution

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-007 |
| Name | 03 - GOV - Record HTTP Flow Execution |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 29 action(s) under 1 trigger(s). |
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
| Sources | `SRC-060` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/03 - GOV - Record HTTP Flow Execution__0545e19a-c34a-45db-bd11-27b87a34973e__full_definition.json |

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
| STEP-0167 | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0168 | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0169 | Compose Registry Key | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0170 | Compose Execution Key | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0171 | Find Execution | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0172 | If Execution Missing | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0173 | Create Execution | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0174 | Find Registry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0175 | If Registry Found | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0176 | Update Registry Health | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0177 | Terminate Registry Not Found | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0178 | Respond Registry Not Found | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0179 | Execution Already Recorded | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0180 | Validate Input | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0181 | Input Validated | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0182 | Terminate Invalid Input | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0183 | Respond Invalid Input | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0184 | Compose Completed Utc | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0185 | Compose Duration Ms | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0186 | Compose Final Report JSON | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0187 | Compose Final Report HTML | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0188 | Send Final Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0189 | If Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0190 | Terminate Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0191 | Respond Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0192 | Terminate Execution Recording Succeeded | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0193 | Respond Execution Recording Succeeded | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |
| STEP-0194 | Create Send Final Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0195 | Compose Send Final Report Email Outcome | Power Automate — 03 - GOV - Record HTTP Flow Execution | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 0545e19a-c34a-45db-bd11-27b87a34973e |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0169 | trigger field 'environmentId'<br>trigger field 'flowId' |
| STEP-0170 | trigger field 'runId'<br>output of Compose Registry Key |
| STEP-0171 | output of Compose Execution Key |
| STEP-0172 | output of Find Execution |
| STEP-0173 | trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'runId'<br>trigger field 'correlationId'<br>trigger field 'startedUtc'<br>trigger field 'outcome'<br>trigger field 'httpStatusCode'<br>trigger field 'callerSystem'<br>trigger field 'errorCode'<br>trigger field 'errorMessage'<br>trigger field 'executionMetadata'<br>output of Compose Execution Key<br>output of Compose Registry Key<br>output of Compose Completed Utc<br>output of Compose Duration Ms |
| STEP-0174 | output of Compose Registry Key |
| STEP-0175 | output of Find Registry |
| STEP-0176 | trigger field 'outcome'<br>output of Find Registry<br>output of Compose Duration Ms<br>output of Compose Completed Utc |
| STEP-0177 | output of Compose Registry Key |
| STEP-0178 | output of Compose Registry Key |
| STEP-0179 | output of Compose Execution Key |
| STEP-0180 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'runId'<br>trigger field 'startedUtc'<br>trigger field 'outcome' |
| STEP-0184 | trigger field 'completedUtc' |
| STEP-0185 | trigger field 'durationMs'<br>trigger field 'startedUtc'<br>output of Compose Completed Utc |
| STEP-0186 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'runId'<br>trigger field 'outcome'<br>trigger field 'durationMs' |
| STEP-0187 | output of Compose Final Report JSON |
| STEP-0188 | output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0189 | output of Compose Final Report JSON |
| STEP-0190 | output of Compose Final Report JSON |
| STEP-0191 | output of Compose Final Report JSON |

## 5.5 Stages and activities

29 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0167 | 1 | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | flow root | Power Automate — 03 - GOV - Record HTTP Flow Execution | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0168 | 2 | Scope Main | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Final Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0169 | 3 | Compose Registry Key | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Validate Input reaches Succeeded | Validate Input = Succeeded | trigger field 'environmentId'<br>trigger field 'flowId' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Execution Key | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0170 | 4 | Compose Execution Key | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Compose Registry Key reaches Succeeded | Compose Registry Key = Succeeded | trigger field 'runId'<br>output of Compose Registry Key | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Completed Utc | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0171 | 5 | Find Execution | Scope Main | Microsoft SharePoint Online, called by the flow | Compose Duration Ms reaches Succeeded | Compose Duration Ms = Succeeded | output of Compose Execution Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Execution Missing | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0172 | 6 | If Execution Missing | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Find Execution reaches Succeeded | Find Execution = Succeeded | output of Find Execution | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@length(coalesce(body('Find_Execution')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0173 | 7 | Create Execution | If Execution Missing | Microsoft SharePoint Online, called by the flow | Entry of If Execution Missing | None declared beyond entry into its container. | trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'runId'<br>trigger field 'correlationId'<br>trigger field 'startedUtc'<br>trigger field 'outcome'<br>trigger field 'httpStatusCode'<br>trigger field 'callerSystem'<br>trigger field 'errorCode'<br>trigger field 'errorMessage'<br>trigger field 'executionMetadata'<br>output of Compose Execution Key<br>output of Compose Registry Key<br>output of Compose Completed Utc<br>output of Compose Duration Ms | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Find Registry | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0174 | 8 | Find Registry | If Execution Missing | Microsoft SharePoint Online, called by the flow | Create Execution reaches Succeeded | Create Execution = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Registry Found | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0175 | 9 | If Registry Found | If Execution Missing | Power Automate — 03 - GOV - Record HTTP Flow Execution | Find Registry reaches Succeeded | Find Registry = Succeeded | output of Find Registry | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0176 | 10 | Update Registry Health | If Registry Found | Microsoft SharePoint Online, called by the flow | Entry of If Registry Found | None declared beyond entry into its container. | trigger field 'outcome'<br>output of Find Registry<br>output of Compose Duration Ms<br>output of Compose Completed Utc | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0177 | 11 | Terminate Registry Not Found | If Registry Found · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Respond Registry Not Found reaches Succeeded | Respond Registry Not Found = Succeeded | output of Compose Registry Key | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0178 | 12 | Respond Registry Not Found | If Registry Found · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of If Registry Found · else | None declared beyond entry into its container. | output of Compose Registry Key | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 404 returned to the caller. | Terminate Registry Not Found | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0179 | 13 | Execution Already Recorded | If Execution Missing · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of If Execution Missing · else | None declared beyond entry into its container. | output of Compose Execution Key | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0180 | 14 | Validate Input | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of Scope Main | None declared beyond entry into its container. | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'runId'<br>trigger field 'startedUtc'<br>trigger field 'outcome' | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['runId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['startedUtc'])))",0]},{"greater":["@length(trim(string(triggerBody()?['outcome'])))",0]},{"lessOrEquals":["@length(trim(string(tr | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Registry Key | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0181 | 15 | Input Validated | Validate Input | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of Validate Input | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0182 | 16 | Terminate Invalid Input | Validate Input · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Respond Invalid Input reaches Succeeded | Respond Invalid Input = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0183 | 17 | Respond Invalid Input | Validate Input · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of Validate Input · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 400 returned to the caller. | Terminate Invalid Input | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0184 | 18 | Compose Completed Utc | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Compose Execution Key reaches Succeeded | Compose Execution Key = Succeeded | trigger field 'completedUtc' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Duration Ms | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0185 | 19 | Compose Duration Ms | Scope Main | Power Automate — 03 - GOV - Record HTTP Flow Execution | Compose Completed Utc reaches Succeeded | Compose Completed Utc = Succeeded | trigger field 'durationMs'<br>trigger field 'startedUtc'<br>output of Compose Completed Utc | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Execution | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0186 | 20 | Compose Final Report JSON | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Scope Main reaches Succeeded or Failed or TimedOut or Skipped | Scope Main = Succeeded\|Failed\|TimedOut\|Skipped | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'runId'<br>trigger field 'outcome'<br>trigger field 'durationMs' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Final Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-060 |
| STEP-0187 | 21 | Compose Final Report HTML | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Compose Final Report JSON reaches Succeeded | Compose Final Report JSON = Succeeded | output of Compose Final Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Final Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0188 | 22 | Send Final Report Email | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Microsoft Office 365 Outlook, called by the flow | Compose Final Report HTML reaches Succeeded | Compose Final Report HTML = Succeeded | output of Compose Final Report JSON<br>output of Compose Final Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | If Execution Recording Failed (runs when this does not succeed)<br>Create Send Final Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-060 |
| STEP-0189 | 23 | If Execution Recording Failed | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | output of Compose Final Report JSON | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-060 |
| STEP-0190 | 24 | Terminate Execution Recording Failed | If Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | Respond Execution Recording Failed reaches Succeeded | Respond Execution Recording Failed = Succeeded | output of Compose Final Report JSON | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0191 | 25 | Respond Execution Recording Failed | If Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of If Execution Recording Failed | None declared beyond entry into its container. | output of Compose Final Report JSON | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 500 returned to the caller. | Terminate Execution Recording Failed | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0192 | 26 | Terminate Execution Recording Succeeded | If Execution Recording Failed · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Respond Execution Recording Succeeded reaches Succeeded | Respond Execution Recording Succeeded = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Succeeded'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0193 | 27 | Respond Execution Recording Succeeded | If Execution Recording Failed · else | Power Automate — 03 - GOV - Record HTTP Flow Execution | Entry of If Execution Recording Failed · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 200 returned to the caller. | Terminate Execution Recording Succeeded | — | — | — | — | — | Confirmed | No external validation required | SRC-060 |
| STEP-0194 | 28 | Create Send Final Report Email Receipt | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Microsoft SharePoint Online, called by the flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Final Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-060 |
| STEP-0195 | 29 | Compose Send Final Report Email Outcome | Scope 03 GOV Record HTTP Flow Execution COMPLETE UPDATED | Power Automate — 03 - GOV - Record HTTP Flow Execution | Create Send Final Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Final Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-060 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-013 | If Execution Missing | Power Automate — 03 - GOV - Record HTTP Flow Execution | `{"and":[{"equals":["@length(coalesce(body('Find_Execution')?['value'],json('[]')))",0]}]}` | output of Find Execution | true<br>false | true → Create Execution, Find Registry, If Registry Found<br>false → Execution Already Recorded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-014 | If Registry Found | Power Automate — 03 - GOV - Record HTTP Flow Execution | `{"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]}]}` | output of Find Registry | true<br>false | true → Update Registry Health<br>false → Terminate Registry Not Found, Respond Registry Not Found | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-015 | Validate Input | Power Automate — 03 - GOV - Record HTTP Flow Execution | `{"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['runId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['startedUtc'])))",0]},{"greater":["@length(trim(string(triggerBody()?['outcome'])))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['environmentId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['runId'])))",255]},{"equals":["@contains(trim` | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'runId'<br>trigger field 'startedUtc'<br>trigger field 'outcome' | true<br>false | true → Input Validated<br>false → Terminate Invalid Input, Respond Invalid Input | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-016 | If Execution Recording Failed | Power Automate — 03 - GOV - Record HTTP Flow Execution | `{"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]}` | output of Compose Final Report JSON | true<br>false | true → Terminate Execution Recording Failed, Respond Execution Recording Failed<br>false → Terminate Execution Recording Succeeded, Respond Execution Recording Succeeded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 4 response action(s); status codes 200, 400, 404, 500. |
| Successful end state | A Response action returns to the caller. 4 response action(s); status codes 200, 400, 404, 500. |
| Alternative end states | 4 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-0194 Create Send Final Report Email Receipt |
| Notifications issued | NOTIF-146 Send Final Report Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-013 | Recovery after Scope Main | Scope Main reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Final Report JSON. | Power Automate — 03 - GOV - Record HTTP Flow Execution | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-014 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by If Execution Recording Failed. | Power Automate — 03 - GOV - Record HTTP Flow Execution | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-015 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Final Report Email Receipt. | Power Automate — 03 - GOV - Record HTTP Flow Execution | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-016 | Recovery after Create Send Final Report Email Receipt | Create Send Final Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Final Report Email Outcome. | Power Automate — 03 - GOV - Record HTTP Flow Execution | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0188 Send Final Report Email | Sends a message; delivery is the record. |
| STEP-0194 Create Send Final Report Email Receipt | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
