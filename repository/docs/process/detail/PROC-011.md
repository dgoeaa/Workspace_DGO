# PROC-011 — 07 - GOV - Consumer HTTP Self-Registration Template

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-011 |
| Name | 07 - GOV - Consumer HTTP Self-Registration Template |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 25 action(s) under 1 trigger(s). |
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
| Sources | `SRC-064` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/07 - GOV - Consumer HTTP Self-Registration Template__c6a011c5-7b11-4241-82ae-a45b88ebf276__full_definition.json |

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
| STEP-0331 | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0332 | Scope Main | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0333 | Compose Consumer Key | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0334 | Validate Input | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0335 | Input Validated | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0336 | Terminate Invalid Input | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0337 | Respond Invalid Input | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0338 | Find Registry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0339 | If Registry Active | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0340 | Find Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0341 | Upsert Consumer | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0342 | Update Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0343 | Create Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0344 | Terminate Registry Unavailable | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0345 | Respond Registry Unavailable | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0346 | Compose Final Report JSON | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0347 | Compose Final Report HTML | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0348 | Send Final Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0349 | If Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0350 | Terminate Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0351 | Respond Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0352 | Terminate Consumer Registration Succeeded | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0353 | Respond Consumer Registration Succeeded | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |
| STEP-0354 | Create Send Final Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0355 | Compose Send Final Report Email Outcome | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow c6a011c5-7b11-4241-82ae-a45b88ebf276 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0333 | trigger field 'registryKey'<br>trigger field 'consumerIdentifier'<br>trigger field 'consumerName' |
| STEP-0334 | trigger field 'registryKey'<br>trigger field 'consumerName'<br>trigger field 'ownerEmail'<br>trigger field 'consumerIdentifier' |
| STEP-0338 | trigger field 'registryKey' |
| STEP-0339 | output of Find Registry |
| STEP-0340 | output of Compose Consumer Key |
| STEP-0341 | output of Find Consumer |
| STEP-0342 | trigger field 'consumerName'<br>trigger field 'registryKey'<br>trigger field 'consumerType'<br>trigger field 'consumerIdentifier'<br>trigger field 'ownerEmail'<br>trigger field 'expectedAuthentication'<br>output of Find Consumer<br>output of Compose Consumer Key<br>output of Find Registry |
| STEP-0343 | trigger field 'consumerName'<br>trigger field 'registryKey'<br>trigger field 'consumerType'<br>trigger field 'consumerIdentifier'<br>trigger field 'ownerEmail'<br>trigger field 'expectedAuthentication'<br>output of Compose Consumer Key<br>output of Find Registry |
| STEP-0344 | trigger field 'registryKey' |
| STEP-0345 | trigger field 'registryKey' |
| STEP-0346 | trigger field 'registryKey'<br>trigger field 'consumerIdentifier'<br>trigger field 'consumerName'<br>trigger field 'consumerType'<br>trigger field 'ownerEmail' |
| STEP-0347 | output of Compose Final Report JSON |
| STEP-0348 | output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0349 | output of Compose Final Report JSON |
| STEP-0350 | output of Compose Final Report JSON |
| STEP-0351 | output of Compose Final Report JSON |

## 5.5 Stages and activities

25 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0331 | 1 | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | flow root | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0332 | 2 | Scope Main | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Final Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0333 | 3 | Compose Consumer Key | Scope Main | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Validate Input reaches Succeeded | Validate Input = Succeeded | trigger field 'registryKey'<br>trigger field 'consumerIdentifier'<br>trigger field 'consumerName' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Registry | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0334 | 4 | Validate Input | Scope Main | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of Scope Main | None declared beyond entry into its container. | trigger field 'registryKey'<br>trigger field 'consumerName'<br>trigger field 'ownerEmail'<br>trigger field 'consumerIdentifier' | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(trim(string(triggerBody()?['registryKey'])))",0]},{"greater":["@length(trim(string(triggerBody()?['consumerName'])))",0]},{"greater":["@length(trim(string(triggerBody()?['ownerEmail'])))",0]},{"greater":["@length(trim(string(coalesce(triggerBody()?['consumerIdentifier'],triggerBody()?['consumerName']))))",0]},{"lessOrEquals":["@length(trim(string(triggerBody | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Consumer Key | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0335 | 5 | Input Validated | Validate Input | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of Validate Input | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0336 | 6 | Terminate Invalid Input | Validate Input · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Respond Invalid Input reaches Succeeded | Respond Invalid Input = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0337 | 7 | Respond Invalid Input | Validate Input · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of Validate Input · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 400 returned to the caller. | Terminate Invalid Input | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0338 | 8 | Find Registry | Scope Main | Microsoft SharePoint Online, called by the flow | Compose Consumer Key reaches Succeeded | Compose Consumer Key = Succeeded | trigger field 'registryKey' | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Registry Active | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0339 | 9 | If Registry Active | Scope Main | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Find Registry reaches Succeeded | Find Registry = Succeeded | output of Find Registry | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]},{"equals":["@first(body('Find_Registry')?['value'])?['LifecycleStatus']","Active"]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0340 | 10 | Find Consumer | If Registry Active | Microsoft SharePoint Online, called by the flow | Entry of If Registry Active | None declared beyond entry into its container. | output of Compose Consumer Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Upsert Consumer | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0341 | 11 | Upsert Consumer | If Registry Active | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Find Consumer reaches Succeeded | Find Consumer = Succeeded | output of Find Consumer | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Consumer')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0342 | 12 | Update Consumer | Upsert Consumer | Microsoft SharePoint Online, called by the flow | Entry of Upsert Consumer | None declared beyond entry into its container. | trigger field 'consumerName'<br>trigger field 'registryKey'<br>trigger field 'consumerType'<br>trigger field 'consumerIdentifier'<br>trigger field 'ownerEmail'<br>trigger field 'expectedAuthentication'<br>output of Find Consumer<br>output of Compose Consumer Key<br>output of Find Registry | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0343 | 13 | Create Consumer | Upsert Consumer · else | Microsoft SharePoint Online, called by the flow | Entry of Upsert Consumer · else | None declared beyond entry into its container. | trigger field 'consumerName'<br>trigger field 'registryKey'<br>trigger field 'consumerType'<br>trigger field 'consumerIdentifier'<br>trigger field 'ownerEmail'<br>trigger field 'expectedAuthentication'<br>output of Compose Consumer Key<br>output of Find Registry | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0344 | 14 | Terminate Registry Unavailable | If Registry Active · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Respond Registry Unavailable reaches Succeeded | Respond Registry Unavailable = Succeeded | trigger field 'registryKey' | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0345 | 15 | Respond Registry Unavailable | If Registry Active · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of If Registry Active · else | None declared beyond entry into its container. | trigger field 'registryKey' | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 404 returned to the caller. | Terminate Registry Unavailable | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0346 | 16 | Compose Final Report JSON | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Scope Main reaches Succeeded or Failed or TimedOut or Skipped | Scope Main = Succeeded\|Failed\|TimedOut\|Skipped | trigger field 'registryKey'<br>trigger field 'consumerIdentifier'<br>trigger field 'consumerName'<br>trigger field 'consumerType'<br>trigger field 'ownerEmail' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Final Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-064 |
| STEP-0347 | 17 | Compose Final Report HTML | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Compose Final Report JSON reaches Succeeded | Compose Final Report JSON = Succeeded | output of Compose Final Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Final Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0348 | 18 | Send Final Report Email | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Microsoft Office 365 Outlook, called by the flow | Compose Final Report HTML reaches Succeeded | Compose Final Report HTML = Succeeded | output of Compose Final Report JSON<br>output of Compose Final Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | If Consumer Registration Failed (runs when this does not succeed)<br>Create Send Final Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-064 |
| STEP-0349 | 19 | If Consumer Registration Failed | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | output of Compose Final Report JSON | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-064 |
| STEP-0350 | 20 | Terminate Consumer Registration Failed | If Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Respond Consumer Registration Failed reaches Succeeded | Respond Consumer Registration Failed = Succeeded | output of Compose Final Report JSON | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0351 | 21 | Respond Consumer Registration Failed | If Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of If Consumer Registration Failed | None declared beyond entry into its container. | output of Compose Final Report JSON | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 500 returned to the caller. | Terminate Consumer Registration Failed | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0352 | 22 | Terminate Consumer Registration Succeeded | If Consumer Registration Failed · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Respond Consumer Registration Succeeded reaches Succeeded | Respond Consumer Registration Succeeded = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Succeeded'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0353 | 23 | Respond Consumer Registration Succeeded | If Consumer Registration Failed · else | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Entry of If Consumer Registration Failed · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 200 returned to the caller. | Terminate Consumer Registration Succeeded | — | — | — | — | — | Confirmed | No external validation required | SRC-064 |
| STEP-0354 | 24 | Create Send Final Report Email Receipt | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Microsoft SharePoint Online, called by the flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Final Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-064 |
| STEP-0355 | 25 | Compose Send Final Report Email Outcome | Scope 07 GOV Consumer HTTP Self Registration Template COMPLETE UPDATED | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Create Send Final Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Final Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-064 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-030 | Validate Input | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | `{"and":[{"greater":["@length(trim(string(triggerBody()?['registryKey'])))",0]},{"greater":["@length(trim(string(triggerBody()?['consumerName'])))",0]},{"greater":["@length(trim(string(triggerBody()?['ownerEmail'])))",0]},{"greater":["@length(trim(string(coalesce(triggerBody()?['consumerIdentifier'],triggerBody()?['consumerName']))))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['registryKey'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['consumerName'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['ownerEmail'])))",255]},{"lessOrEquals":["@length(` | trigger field 'registryKey'<br>trigger field 'consumerName'<br>trigger field 'ownerEmail'<br>trigger field 'consumerIdentifier' | true<br>false | true → Input Validated<br>false → Terminate Invalid Input, Respond Invalid Input | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-031 | If Registry Active | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | `{"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]},{"equals":["@first(body('Find_Registry')?['value'])?['LifecycleStatus']","Active"]}]}` | output of Find Registry | true<br>false | true → Find Consumer, Upsert Consumer<br>false → Terminate Registry Unavailable, Respond Registry Unavailable | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-032 | Upsert Consumer | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | `{"and":[{"greater":["@length(coalesce(body('Find_Consumer')?['value'],json('[]')))",0]}]}` | output of Find Consumer | true<br>false | true → Update Consumer<br>false → Create Consumer | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-033 | If Consumer Registration Failed | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | `{"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]}` | output of Compose Final Report JSON | true<br>false | true → Terminate Consumer Registration Failed, Respond Consumer Registration Failed<br>false → Terminate Consumer Registration Succeeded, Respond Consumer Registration Succeeded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

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
| Records created or updated | STEP-0354 Create Send Final Report Email Receipt |
| Notifications issued | NOTIF-157 Send Final Report Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-047 | Recovery after Scope Main | Scope Main reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Final Report JSON. | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-048 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by If Consumer Registration Failed. | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-049 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Final Report Email Receipt. | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-050 | Recovery after Create Send Final Report Email Receipt | Create Send Final Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Final Report Email Outcome. | Power Automate — 07 - GOV - Consumer HTTP Self-Registration Template | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0348 Send Final Report Email | Sends a message; delivery is the record. |
| STEP-0354 Create Send Final Report Email Receipt | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
