# PROC-009 — 05 - GOV - Retire HTTP Flow

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-009 |
| Name | 05 - GOV - Retire HTTP Flow |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 52 action(s) under 1 trigger(s). |
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
| Sources | `SRC-062` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/05 - GOV - Retire HTTP Flow__493b4ab7-8f63-4fab-8121-746c2cac7f98__full_definition.json |

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
| STEP-0262 | Key | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0263 | Find | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0264 | If Found | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0265 | Retire | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0266 | Compose Execution Report JSON | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0267 | Compose Execution Report HTML | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0268 | Send Execution Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0269 | Compose | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0270 | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0271 | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0272 | Compose Registry Key | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0273 | Find Registry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0274 | Validate Input | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0275 | Input Validated | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0276 | Terminate Invalid Input | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0277 | Respond Invalid Input | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0278 | If Registry Found | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0279 | Registry Found | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0280 | Terminate Registry Not Found | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0281 | Respond Registry Not Found | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0282 | Count Active Consumers | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0283 | Count Active Dependencies | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0284 | Compose Active Counts | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0285 | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0286 | Find Current Contracts | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0287 | Close Contracts | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0288 | Close Contract | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0289 | Find Dependencies | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0290 | Retire Dependencies | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0291 | Retire Dependency | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0292 | Find Consumers | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0293 | Retire Consumers | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0294 | Retire Consumer | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0295 | Find Open Exceptions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0296 | Resolve Open Exceptions | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0297 | Resolve Exception | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0298 | Retire Registry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0299 | Record Forced Retirement | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0300 | Respond Retirement Blocked | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0301 | Terminate Retirement Blocked | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0302 | Compose Final Report JSON | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0303 | Compose Final Report HTML | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0304 | Send Final Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0305 | If Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0306 | Terminate Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0307 | Respond Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0308 | Terminate Retirement Succeeded | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0309 | Respond Retirement Succeeded | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0310 | Create Send Final Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0311 | Compose Send Final Report Email Outcome | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |
| STEP-0312 | Create Send Execution Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0313 | Compose Send Execution Report Email Outcome | Power Automate — 05 - GOV - Retire HTTP Flow | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 493b4ab7-8f63-4fab-8121-746c2cac7f98 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0262 | trigger field 'environmentId'<br>trigger field 'flowId' |
| STEP-0263 | output of Key |
| STEP-0264 | output of Find |
| STEP-0265 | trigger field 'retirementReason'<br>output of Find |
| STEP-0267 | output of Compose Execution Report JSON |
| STEP-0268 | output of Compose Execution Report JSON<br>output of Compose Execution Report HTML |
| STEP-0272 | trigger field 'environmentId'<br>trigger field 'flowId' |
| STEP-0273 | output of Compose Registry Key |
| STEP-0274 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'reason' |
| STEP-0278 | output of Find Registry |
| STEP-0279 | output of Compose Registry Key |
| STEP-0280 | output of Compose Registry Key |
| STEP-0281 | output of Compose Registry Key |
| STEP-0282 | output of Compose Registry Key |
| STEP-0283 | output of Compose Registry Key |
| STEP-0284 | trigger field 'force'<br>output of Count Active Consumers<br>output of Count Active Dependencies |
| STEP-0285 | output of Compose Active Counts |
| STEP-0286 | output of Compose Registry Key |
| STEP-0289 | output of Compose Registry Key |
| STEP-0292 | output of Compose Registry Key |
| STEP-0295 | output of Compose Registry Key |
| STEP-0297 | trigger field 'reason' |
| STEP-0298 | trigger field 'reason'<br>output of Find Registry |
| STEP-0299 | trigger field 'retirementReason'<br>output of Compose Active Counts |
| STEP-0300 | output of Compose Active Counts |
| STEP-0302 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'reason'<br>output of Find Current Contracts<br>output of Find Dependencies<br>output of Find Consumers<br>output of Find Open Exceptions |
| STEP-0303 | output of Compose Final Report JSON |
| STEP-0304 | output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0305 | output of Compose Final Report JSON |
| STEP-0306 | output of Compose Final Report JSON |
| STEP-0307 | output of Compose Final Report JSON |

## 5.5 Stages and activities

52 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0262 | 1 | Key | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED reaches Succeeded | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED = Succeeded | trigger field 'environmentId'<br>trigger field 'flowId' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0263 | 2 | Find | flow root | Microsoft SharePoint Online, called by the flow | Compose reaches Succeeded | Compose = Succeeded | output of Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Found | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0264 | 3 | If Found | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Find reaches Succeeded | Find = Succeeded | output of Find | Evaluates a condition and runs one of two branches. | Condition: {"greater":["@length(body('Find')?['value'])",0]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Execution Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0265 | 4 | Retire | If Found | Microsoft SharePoint Online, called by the flow | Entry of If Found | None declared beyond entry into its container. | trigger field 'retirementReason'<br>output of Find | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0266 | 5 | Compose Execution Report JSON | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | If Found reaches Succeeded or Failed or Skipped or TimedOut | If Found = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Execution Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-062 |
| STEP-0267 | 6 | Compose Execution Report HTML | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Compose Execution Report JSON reaches Succeeded | Compose Execution Report JSON = Succeeded | output of Compose Execution Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Execution Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0268 | 7 | Send Execution Report Email | flow root | Microsoft Office 365 Outlook, called by the flow | Compose Execution Report HTML reaches Succeeded | Compose Execution Report HTML = Succeeded | output of Compose Execution Report JSON<br>output of Compose Execution Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Create Send Execution Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-062 |
| STEP-0269 | 8 | Compose | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Key reaches Succeeded | Key = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0270 | 9 | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Key | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0271 | 10 | Scope Main | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Final Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0272 | 11 | Compose Registry Key | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Validate Input reaches Succeeded | Validate Input = Succeeded | trigger field 'environmentId'<br>trigger field 'flowId' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Registry | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0273 | 12 | Find Registry | Scope Main | Microsoft SharePoint Online, called by the flow | Compose Registry Key reaches Succeeded | Compose Registry Key = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | If Registry Found | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0274 | 13 | Validate Input | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of Scope Main | None declared beyond entry into its container. | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'reason' | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['reason'])))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['environmentId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowId'])))",255]},{"lessOrEquals":["@leng | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Registry Key | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0275 | 14 | Input Validated | Validate Input | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of Validate Input | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0276 | 15 | Terminate Invalid Input | Validate Input · else | Power Automate — 05 - GOV - Retire HTTP Flow | Respond Invalid Input reaches Succeeded | Respond Invalid Input = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0277 | 16 | Respond Invalid Input | Validate Input · else | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of Validate Input · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 400 returned to the caller. | Terminate Invalid Input | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0278 | 17 | If Registry Found | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Find Registry reaches Succeeded | Find Registry = Succeeded | output of Find Registry | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Count Active Consumers | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0279 | 18 | Registry Found | If Registry Found | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of If Registry Found | None declared beyond entry into its container. | output of Compose Registry Key | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0280 | 19 | Terminate Registry Not Found | If Registry Found · else | Power Automate — 05 - GOV - Retire HTTP Flow | Respond Registry Not Found reaches Succeeded | Respond Registry Not Found = Succeeded | output of Compose Registry Key | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0281 | 20 | Respond Registry Not Found | If Registry Found · else | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of If Registry Found · else | None declared beyond entry into its container. | output of Compose Registry Key | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 404 returned to the caller. | Terminate Registry Not Found | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0282 | 21 | Count Active Consumers | Scope Main | Microsoft SharePoint Online, called by the flow | If Registry Found reaches Succeeded | If Registry Found = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Count Active Dependencies | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0283 | 22 | Count Active Dependencies | Scope Main | Microsoft SharePoint Online, called by the flow | Count Active Consumers reaches Succeeded | Count Active Consumers = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Active Counts | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0284 | 23 | Compose Active Counts | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Count Active Dependencies reaches Succeeded | Count Active Dependencies = Succeeded | trigger field 'force'<br>output of Count Active Consumers<br>output of Count Active Dependencies | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | If Safe To Retire | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0285 | 24 | If Safe To Retire | Scope Main | Power Automate — 05 - GOV - Retire HTTP Flow | Compose Active Counts reaches Succeeded | Compose Active Counts = Succeeded | output of Compose Active Counts | Evaluates a condition and runs one of two branches. | Condition: {"or":[{"and":[{"equals":["@outputs('Compose_Active_Counts')?['activeConsumers']",0]},{"equals":["@outputs('Compose_Active_Counts')?['activeDependencies']",0]}]},{"equals":["@outputs('Compose_Active_Counts')?['force']",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0286 | 25 | Find Current Contracts | If Safe To Retire | Microsoft SharePoint Online, called by the flow | Entry of If Safe To Retire | None declared beyond entry into its container. | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Close Contracts<br>Record Forced Retirement | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0287 | 26 | Close Contracts | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Find Current Contracts reaches Succeeded | Find Current Contracts = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Find Dependencies | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0288 | 27 | Close Contract | Close Contracts | Microsoft SharePoint Online, called by the flow | Entry of Close Contracts | None declared beyond entry into its container. | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0289 | 28 | Find Dependencies | If Safe To Retire | Microsoft SharePoint Online, called by the flow | Close Contracts reaches Succeeded | Close Contracts = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Retire Dependencies | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0290 | 29 | Retire Dependencies | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Find Dependencies reaches Succeeded | Find Dependencies = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Find Consumers | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0291 | 30 | Retire Dependency | Retire Dependencies | Microsoft SharePoint Online, called by the flow | Entry of Retire Dependencies | None declared beyond entry into its container. | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0292 | 31 | Find Consumers | If Safe To Retire | Microsoft SharePoint Online, called by the flow | Retire Dependencies reaches Succeeded | Retire Dependencies = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Retire Consumers | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0293 | 32 | Retire Consumers | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Find Consumers reaches Succeeded | Find Consumers = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Find Open Exceptions | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0294 | 33 | Retire Consumer | Retire Consumers | Microsoft SharePoint Online, called by the flow | Entry of Retire Consumers | None declared beyond entry into its container. | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0295 | 34 | Find Open Exceptions | If Safe To Retire | Microsoft SharePoint Online, called by the flow | Retire Consumers reaches Succeeded | Retire Consumers = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Resolve Open Exceptions | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0296 | 35 | Resolve Open Exceptions | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Find Open Exceptions reaches Succeeded | Find Open Exceptions = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0297 | 36 | Resolve Exception | Resolve Open Exceptions | Microsoft SharePoint Online, called by the flow | Entry of Resolve Open Exceptions | None declared beyond entry into its container. | trigger field 'reason' | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0298 | 37 | Retire Registry | If Safe To Retire | Microsoft SharePoint Online, called by the flow | Entry of If Safe To Retire | None declared beyond entry into its container. | trigger field 'reason'<br>output of Find Registry | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0299 | 38 | Record Forced Retirement | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | Find Current Contracts reaches Succeeded | Find Current Contracts = Succeeded | trigger field 'retirementReason'<br>output of Compose Active Counts | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0300 | 39 | Respond Retirement Blocked | If Safe To Retire · else | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of If Safe To Retire · else | None declared beyond entry into its container. | output of Compose Active Counts | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 409 returned to the caller. | Terminate Retirement Blocked | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0301 | 40 | Terminate Retirement Blocked | If Safe To Retire · else | Power Automate — 05 - GOV - Retire HTTP Flow | Respond Retirement Blocked reaches Succeeded | Respond Retirement Blocked = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0302 | 41 | Compose Final Report JSON | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Scope Main reaches Succeeded or Failed or TimedOut or Skipped | Scope Main = Succeeded\|Failed\|TimedOut\|Skipped | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'reason'<br>output of Find Current Contracts<br>output of Find Dependencies<br>output of Find Consumers<br>output of Find Open Exceptions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Final Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-062 |
| STEP-0303 | 42 | Compose Final Report HTML | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Compose Final Report JSON reaches Succeeded | Compose Final Report JSON = Succeeded | output of Compose Final Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Final Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0304 | 43 | Send Final Report Email | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Microsoft Office 365 Outlook, called by the flow | Compose Final Report HTML reaches Succeeded | Compose Final Report HTML = Succeeded | output of Compose Final Report JSON<br>output of Compose Final Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | If Retirement Failed (runs when this does not succeed)<br>Create Send Final Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-062 |
| STEP-0305 | 44 | If Retirement Failed | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | output of Compose Final Report JSON | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-062 |
| STEP-0306 | 45 | Terminate Retirement Failed | If Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | Respond Retirement Failed reaches Succeeded | Respond Retirement Failed = Succeeded | output of Compose Final Report JSON | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0307 | 46 | Respond Retirement Failed | If Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of If Retirement Failed | None declared beyond entry into its container. | output of Compose Final Report JSON | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 500 returned to the caller. | Terminate Retirement Failed | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0308 | 47 | Terminate Retirement Succeeded | If Retirement Failed · else | Power Automate — 05 - GOV - Retire HTTP Flow | Respond Retirement Succeeded reaches Succeeded | Respond Retirement Succeeded = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Succeeded'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0309 | 48 | Respond Retirement Succeeded | If Retirement Failed · else | Power Automate — 05 - GOV - Retire HTTP Flow | Entry of If Retirement Failed · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 200 returned to the caller. | Terminate Retirement Succeeded | — | — | — | — | — | Confirmed | No external validation required | SRC-062 |
| STEP-0310 | 49 | Create Send Final Report Email Receipt | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Microsoft SharePoint Online, called by the flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Final Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-062 |
| STEP-0311 | 50 | Compose Send Final Report Email Outcome | Scope 05 GOV Retire HTTP Flow COMPLETE UPDATED | Power Automate — 05 - GOV - Retire HTTP Flow | Create Send Final Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Final Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-062 |
| STEP-0312 | 51 | Create Send Execution Report Email Receipt | flow root | Microsoft SharePoint Online, called by the flow | Send Execution Report Email reaches Succeeded or Failed or TimedOut | Send Execution Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Execution Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-062 |
| STEP-0313 | 52 | Compose Send Execution Report Email Outcome | flow root | Power Automate — 05 - GOV - Retire HTTP Flow | Create Send Execution Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Execution Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-062 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-024 | If Found | Power Automate — 05 - GOV - Retire HTTP Flow | `{"greater":["@length(body('Find')?['value'])",0]}` | output of Find | true<br>false | true → Retire<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-025 | Validate Input | Power Automate — 05 - GOV - Retire HTTP Flow | `{"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['reason'])))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['environmentId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['reason'])))",4000]},{"equals":["@contains(trim(string(triggerBody()?['environmentId'])),'\\|')",false]},{"equals":["@contains(trim(string(triggerBody()?['flowId'])),'\\|')",false]}]}` | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'reason' | true<br>false | true → Input Validated<br>false → Terminate Invalid Input, Respond Invalid Input | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-026 | If Registry Found | Power Automate — 05 - GOV - Retire HTTP Flow | `{"and":[{"greater":["@length(coalesce(body('Find_Registry')?['value'],json('[]')))",0]}]}` | output of Find Registry | true<br>false | true → Registry Found<br>false → Terminate Registry Not Found, Respond Registry Not Found | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-027 | If Safe To Retire | Power Automate — 05 - GOV - Retire HTTP Flow | `{"or":[{"and":[{"equals":["@outputs('Compose_Active_Counts')?['activeConsumers']",0]},{"equals":["@outputs('Compose_Active_Counts')?['activeDependencies']",0]}]},{"equals":["@outputs('Compose_Active_Counts')?['force']",true]}]}` | output of Compose Active Counts | true<br>false | true → Find Current Contracts, Close Contracts, Find Dependencies, Retire Dependencies, Find Consumers, Retire Consumers, Find Open Exceptions, Resolve Open Exceptions, Retire Registry, Record Forced Retirement<br>false → Respond Retirement Blocked, Terminate Retirement Blocked | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-028 | If Retirement Failed | Power Automate — 05 - GOV - Retire HTTP Flow | `{"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]}` | output of Compose Final Report JSON | true<br>false | true → Terminate Retirement Failed, Respond Retirement Failed<br>false → Terminate Retirement Succeeded, Respond Retirement Succeeded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 5 response action(s); status codes 200, 400, 404, 409, 500. |
| Successful end state | A Response action returns to the caller. 5 response action(s); status codes 200, 400, 404, 409, 500. |
| Alternative end states | 7 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-0310 Create Send Final Report Email Receipt<br>STEP-0312 Create Send Execution Report Email Receipt |
| Notifications issued | NOTIF-153 Send Execution Report Email<br>NOTIF-154 Send Final Report Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-034 | Recovery after If Found | If Found reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Execution Report JSON. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-035 | Recovery after Scope Main | Scope Main reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Final Report JSON. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-036 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by If Retirement Failed. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-037 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Final Report Email Receipt. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-038 | Recovery after Create Send Final Report Email Receipt | Create Send Final Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Final Report Email Outcome. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-039 | Recovery after Send Execution Report Email | Send Execution Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Execution Report Email Receipt. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-040 | Recovery after Create Send Execution Report Email Receipt | Create Send Execution Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Execution Report Email Outcome. | Power Automate — 05 - GOV - Retire HTTP Flow | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0268 Send Execution Report Email | Sends a message; delivery is the record. |
| STEP-0304 Send Final Report Email | Sends a message; delivery is the record. |
| STEP-0310 Create Send Final Report Email Receipt | Writes a list item; the write itself is the audit record. |
| STEP-0312 Create Send Execution Report Email Receipt | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
