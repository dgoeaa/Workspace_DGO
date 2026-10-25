# PROC-012 — 08 - GOV - Discover and Register HTTP Consumers

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-012 |
| Name | 08 - GOV - Discover and Register HTTP Consumers |
| Alternative or legacy name | — |
| Category | Automated · Scheduled |
| Description | Power Automate workflow carrying 34 action(s) under 1 trigger(s). |
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
| Sources | `SRC-065` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/08 - GOV - Discover and Register HTTP Consumers__f5e7679f-ca1b-4216-8a6e-bb6c044ed06f__full_definition.json |

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
| STEP-0356 | Get Recent | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0357 | For Each | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0358 | Key | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0359 | Find | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0360 | If New | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0361 | Create | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0362 | Compose Execution Report JSON | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0363 | Compose Execution Report HTML | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0364 | Send Execution Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0365 | Compose | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0366 | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0367 | Scope Main | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0368 | Get Recent Executions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0369 | Discover Consumers | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0370 | If Identifiable Caller | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0371 | Compose Discovered Key | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0372 | Find Active Registry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0373 | If Active Registry Found | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0374 | Find Discovered Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0375 | Upsert Discovered Consumer | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0376 | Update Discovered Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0377 | Create Discovered Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0378 | Skip Inactive Registry | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0379 | Skip Unidentifiable Caller | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0380 | Compose Final Report JSON | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0381 | Compose Final Report HTML | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0382 | Send Final Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0383 | If Discovery Failed | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0384 | Terminate Discovery Failed | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0385 | Terminate Discovery Succeeded | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0386 | Create Send Final Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0387 | Compose Send Final Report Email Outcome | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |
| STEP-0388 | Create Send Execution Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0389 | Compose Send Execution Report Email Outcome | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | Recurrence: Recurrence |
| Trigger type | Recurrence (Recurrence) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow f5e7679f-ca1b-4216-8a6e-bb6c044ed06f |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | Recurrence: Recurrence |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0359 | output of Key |
| STEP-0360 | output of Find |
| STEP-0361 | output of Key |
| STEP-0363 | output of Compose Execution Report JSON |
| STEP-0364 | output of Compose Execution Report JSON<br>output of Compose Execution Report HTML |
| STEP-0365 | output of Get Recent Executions<br>output of Find Active Registry<br>output of Compose Discovered Key<br>output of Find Discovered Consumer<br>output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0373 | output of Find Active Registry |
| STEP-0374 | output of Compose Discovered Key |
| STEP-0375 | output of Find Discovered Consumer |
| STEP-0376 | output of Find Discovered Consumer<br>output of Compose Discovered Key<br>output of Find Active Registry |
| STEP-0377 | output of Compose Discovered Key<br>output of Find Active Registry |
| STEP-0380 | output of Get Recent Executions |
| STEP-0381 | output of Compose Final Report JSON |
| STEP-0382 | output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0383 | output of Compose Final Report JSON |
| STEP-0384 | output of Compose Final Report JSON |

## 5.5 Stages and activities

34 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0356 | 1 | Get Recent | flow root | Microsoft SharePoint Online, called by the flow | Compose reaches Succeeded | Compose = Succeeded | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | For Each | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0357 | 2 | For Each | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Get Recent reaches Succeeded | Get Recent = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Execution Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0358 | 3 | Key | For Each | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of For Each | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0359 | 4 | Find | For Each | Microsoft SharePoint Online, called by the flow | Key reaches Succeeded | Key = Succeeded | output of Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If New | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0360 | 5 | If New | For Each | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Find reaches Succeeded | Find = Succeeded | output of Find | Evaluates a condition and runs one of two branches. | Condition: {"equals":["@length(body('Find')?['value'])",0]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0361 | 6 | Create | If New | Microsoft SharePoint Online, called by the flow | Entry of If New | None declared beyond entry into its container. | output of Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0362 | 7 | Compose Execution Report JSON | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | For Each reaches Succeeded or Failed or Skipped or TimedOut | For Each = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Execution Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-065 |
| STEP-0363 | 8 | Compose Execution Report HTML | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Compose Execution Report JSON reaches Succeeded | Compose Execution Report JSON = Succeeded | output of Compose Execution Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Execution Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0364 | 9 | Send Execution Report Email | flow root | Microsoft Office 365 Outlook, called by the flow | Compose Execution Report HTML reaches Succeeded | Compose Execution Report HTML = Succeeded | output of Compose Execution Report JSON<br>output of Compose Execution Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Create Send Execution Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-065 |
| STEP-0365 | 10 | Compose | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED reaches Succeeded | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED = Succeeded | output of Get Recent Executions<br>output of Find Active Registry<br>output of Compose Discovered Key<br>output of Find Discovered Consumer<br>output of Compose Final Report JSON<br>output of Compose Final Report HTML | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Recent | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0366 | 11 | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0367 | 12 | Scope Main | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Final Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0368 | 13 | Get Recent Executions | Scope Main | Microsoft SharePoint Online, called by the flow | Entry of Scope Main | None declared beyond entry into its container. | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Discover Consumers | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0369 | 14 | Discover Consumers | Scope Main | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Get Recent Executions reaches Succeeded | Get Recent Executions = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0370 | 15 | If Identifiable Caller | Discover Consumers | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of Discover Consumers | None declared beyond entry into its container. | — | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(trim(string(item()?['RegistryKey'])))",0]},{"greater":["@length(trim(string(item()?['CallerSystem'])))",0]},{"not":{"equals":["@toLower(trim(string(item()?['CallerSystem'])))","unknown"]}},{"lessOrEquals":["@length(trim(string(item()?['CallerSystem'])))",255]},{"equals":["@contains(trim(string(item()?['CallerSystem'])),'\|')",false]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0371 | 16 | Compose Discovered Key | If Identifiable Caller | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of If Identifiable Caller | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Active Registry | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0372 | 17 | Find Active Registry | If Identifiable Caller | Microsoft SharePoint Online, called by the flow | Compose Discovered Key reaches Succeeded | Compose Discovered Key = Succeeded | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Active Registry Found | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0373 | 18 | If Active Registry Found | If Identifiable Caller | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Find Active Registry reaches Succeeded | Find Active Registry = Succeeded | output of Find Active Registry | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Active_Registry')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0374 | 19 | Find Discovered Consumer | If Active Registry Found | Microsoft SharePoint Online, called by the flow | Entry of If Active Registry Found | None declared beyond entry into its container. | output of Compose Discovered Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Upsert Discovered Consumer | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0375 | 20 | Upsert Discovered Consumer | If Active Registry Found | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Find Discovered Consumer reaches Succeeded | Find Discovered Consumer = Succeeded | output of Find Discovered Consumer | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Discovered_Consumer')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0376 | 21 | Update Discovered Consumer | Upsert Discovered Consumer | Microsoft SharePoint Online, called by the flow | Entry of Upsert Discovered Consumer | None declared beyond entry into its container. | output of Find Discovered Consumer<br>output of Compose Discovered Key<br>output of Find Active Registry | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0377 | 22 | Create Discovered Consumer | Upsert Discovered Consumer · else | Microsoft SharePoint Online, called by the flow | Entry of Upsert Discovered Consumer · else | None declared beyond entry into its container. | output of Compose Discovered Key<br>output of Find Active Registry | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0378 | 23 | Skip Inactive Registry | If Active Registry Found · else | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of If Active Registry Found · else | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0379 | 24 | Skip Unidentifiable Caller | If Identifiable Caller · else | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of If Identifiable Caller · else | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0380 | 25 | Compose Final Report JSON | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Scope Main reaches Succeeded or Failed or TimedOut or Skipped | Scope Main = Succeeded\|Failed\|TimedOut\|Skipped | output of Get Recent Executions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Final Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-065 |
| STEP-0381 | 26 | Compose Final Report HTML | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Compose Final Report JSON reaches Succeeded | Compose Final Report JSON = Succeeded | output of Compose Final Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Final Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0382 | 27 | Send Final Report Email | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Microsoft Office 365 Outlook, called by the flow | Compose Final Report HTML reaches Succeeded | Compose Final Report HTML = Succeeded | output of Compose Final Report JSON<br>output of Compose Final Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | If Discovery Failed (runs when this does not succeed)<br>Create Send Final Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-065 |
| STEP-0383 | 28 | If Discovery Failed | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | output of Compose Final Report JSON | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-065 |
| STEP-0384 | 29 | Terminate Discovery Failed | If Discovery Failed | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of If Discovery Failed | None declared beyond entry into its container. | output of Compose Final Report JSON | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0385 | 30 | Terminate Discovery Succeeded | If Discovery Failed · else | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Entry of If Discovery Failed · else | None declared beyond entry into its container. | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Succeeded'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-065 |
| STEP-0386 | 31 | Create Send Final Report Email Receipt | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Microsoft SharePoint Online, called by the flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Final Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-065 |
| STEP-0387 | 32 | Compose Send Final Report Email Outcome | Scope 08 GOV Discover and Register HTTP Consumers COMPLETE UPDATED | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Create Send Final Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Final Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-065 |
| STEP-0388 | 33 | Create Send Execution Report Email Receipt | flow root | Microsoft SharePoint Online, called by the flow | Send Execution Report Email reaches Succeeded or Failed or TimedOut | Send Execution Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Execution Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-065 |
| STEP-0389 | 34 | Compose Send Execution Report Email Outcome | flow root | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Create Send Execution Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Execution Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-065 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-034 | If New | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | `{"equals":["@length(body('Find')?['value'])",0]}` | output of Find | true<br>false | true → Create<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-035 | If Identifiable Caller | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | `{"and":[{"greater":["@length(trim(string(item()?['RegistryKey'])))",0]},{"greater":["@length(trim(string(item()?['CallerSystem'])))",0]},{"not":{"equals":["@toLower(trim(string(item()?['CallerSystem'])))","unknown"]}},{"lessOrEquals":["@length(trim(string(item()?['CallerSystem'])))",255]},{"equals":["@contains(trim(string(item()?['CallerSystem'])),'\\|')",false]}]}` | — | true<br>false | true → Compose Discovered Key, Find Active Registry, If Active Registry Found<br>false → Skip Unidentifiable Caller | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-036 | If Active Registry Found | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | `{"and":[{"greater":["@length(coalesce(body('Find_Active_Registry')?['value'],json('[]')))",0]}]}` | output of Find Active Registry | true<br>false | true → Find Discovered Consumer, Upsert Discovered Consumer<br>false → Skip Inactive Registry | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-037 | Upsert Discovered Consumer | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | `{"and":[{"greater":["@length(coalesce(body('Find_Discovered_Consumer')?['value'],json('[]')))",0]}]}` | output of Find Discovered Consumer | true<br>false | true → Update Discovered Consumer<br>false → Create Discovered Consumer | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-038 | If Discovery Failed | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | `{"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]}` | output of Compose Final Report JSON | true<br>false | true → Terminate Discovery Failed<br>false → Terminate Discovery Succeeded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | Writes to the system of record. |
| Completion criteria | The last action completes. The export declares no response to a caller. |
| Successful end state | The last action completes. The export declares no response to a caller. |
| Alternative end states | 7 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-0386 Create Send Final Report Email Receipt<br>STEP-0388 Create Send Execution Report Email Receipt |
| Notifications issued | NOTIF-158 Send Execution Report Email<br>NOTIF-159 Send Final Report Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-051 | Recovery after For Each | For Each reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Execution Report JSON. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-052 | Recovery after Scope Main | Scope Main reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Final Report JSON. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-053 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by If Discovery Failed. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-054 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Final Report Email Receipt. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-055 | Recovery after Create Send Final Report Email Receipt | Create Send Final Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Final Report Email Outcome. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-056 | Recovery after Send Execution Report Email | Send Execution Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Execution Report Email Receipt. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-057 | Recovery after Create Send Execution Report Email Receipt | Create Send Execution Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Execution Report Email Outcome. | Power Automate — 08 - GOV - Discover and Register HTTP Consumers | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0364 Send Execution Report Email | Sends a message; delivery is the record. |
| STEP-0382 Send Final Report Email | Sends a message; delivery is the record. |
| STEP-0386 Create Send Final Report Email Receipt | Writes a list item; the write itself is the audit record. |
| STEP-0388 Create Send Execution Report Email Receipt | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
