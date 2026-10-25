# PROC-006 — 02 - GOV - Register HTTP Flow Truth

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-006 |
| Name | 02 - GOV - Register HTTP Flow Truth |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 35 action(s) under 1 trigger(s). |
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
| Sources | `SRC-059` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/02 - GOV - Register HTTP Flow Truth__651ae389-eeed-4bf0-9799-67bd964ebe71__full_definition.json |

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
| STEP-0132 | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0133 | Scope Main | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0134 | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0135 | Compose Registry Key | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0136 | Find Registry Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0137 | Upsert Registry Record | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0138 | Update Registry Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0139 | Create Registry Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0140 | Compose Contract Key | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0141 | Find Contract | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0142 | If New Contract | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0143 | Create Contract | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0144 | Contract Already Exists | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0145 | Set Existing Contract Current | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0146 | Apply Dependencies | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0147 | Compose Dependency Key | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0148 | Find Dependency | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0149 | Upsert Dependency | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0150 | Update Dependency | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0151 | Create Dependency | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0152 | Find Current Contracts | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0153 | Close Current Contracts | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0154 | Close Current Contract | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0155 | Terminate Invalid Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0156 | Respond Invalid Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0157 | Compose Final Report JSON | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0158 | Compose Final Report HTML | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0159 | Send Final Report Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-0160 | If Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0161 | Terminate Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0162 | Respond Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0163 | Terminate Registration Succeeded | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0164 | Respond Registration Succeeded | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |
| STEP-0165 | Create Send Final Report Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0166 | Compose Send Final Report Email Outcome | Power Automate — 02 - GOV - Register HTTP Flow Truth | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 651ae389-eeed-4bf0-9799-67bd964ebe71 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0134 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'flowName'<br>trigger field 'workflowId' |
| STEP-0135 | trigger field 'environmentId'<br>trigger field 'flowId' |
| STEP-0136 | output of Compose Registry Key |
| STEP-0137 | output of Find Registry Record |
| STEP-0138 | trigger field 'flowName'<br>trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'environmentName'<br>trigger field 'systemName'<br>trigger field 'businessProcess'<br>trigger field 'flowDescription'<br>trigger field 'technicalOwnerEmail'<br>trigger field 'businessOwnerEmail'<br>trigger field 'supportEmail'<br>trigger field 'httpMethod'<br>trigger field 'endpoint'<br>trigger field 'endpointFingerprint'<br>trigger field 'authenticationMode'<br>trigger field 'dataClassification'<br>trigger field 'criticality'<br>trigger field 'lifecycleStatus'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'isCompliant'<br>trigger field 'complianceIssues'<br>trigger field 'workflowId'<br>output of Find Registry Record<br>output of Compose Registry Key |
| STEP-0139 | trigger field 'flowName'<br>trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'environmentName'<br>trigger field 'systemName'<br>trigger field 'businessProcess'<br>trigger field 'flowDescription'<br>trigger field 'technicalOwnerEmail'<br>trigger field 'businessOwnerEmail'<br>trigger field 'supportEmail'<br>trigger field 'httpMethod'<br>trigger field 'endpoint'<br>trigger field 'endpointFingerprint'<br>trigger field 'authenticationMode'<br>trigger field 'dataClassification'<br>trigger field 'criticality'<br>trigger field 'lifecycleStatus'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'isCompliant'<br>trigger field 'complianceIssues'<br>trigger field 'workflowId'<br>output of Compose Registry Key |
| STEP-0140 | trigger field 'definitionFingerprint'<br>trigger field 'definitionVersion'<br>output of Compose Registry Key |
| STEP-0141 | output of Compose Contract Key |
| STEP-0142 | output of Find Contract |
| STEP-0143 | trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'dependencies'<br>trigger field 'endpoint'<br>trigger field 'technicalOwnerEmail'<br>output of Compose Contract Key<br>output of Compose Registry Key |
| STEP-0145 | output of Find Contract |
| STEP-0147 | output of Compose Registry Key |
| STEP-0148 | output of Compose Dependency Key |
| STEP-0149 | output of Find Dependency |
| STEP-0150 | output of Find Dependency<br>output of Compose Dependency Key<br>output of Compose Registry Key |
| STEP-0151 | output of Compose Dependency Key<br>output of Compose Registry Key |
| STEP-0152 | output of Compose Registry Key |
| STEP-0157 | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'flowName'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint' |
| STEP-0158 | output of Compose Final Report JSON |
| STEP-0159 | output of Compose Final Report JSON<br>output of Compose Final Report HTML |
| STEP-0160 | output of Compose Final Report JSON |
| STEP-0161 | output of Compose Final Report JSON |
| STEP-0162 | output of Compose Final Report JSON |

## 5.5 Stages and activities

35 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0132 | 1 | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | flow root | Power Automate — 02 - GOV - Register HTTP Flow Truth | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0133 | 2 | Scope Main | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Final Report JSON (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0134 | 3 | Validate Input | Scope Main | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of Scope Main | None declared beyond entry into its container. | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'flowName'<br>trigger field 'workflowId' | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowName'])))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['environmentId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowId'])))",255]},{"lessOrEquals":["@le | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0135 | 4 | Compose Registry Key | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of Validate Input | None declared beyond entry into its container. | trigger field 'environmentId'<br>trigger field 'flowId' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Registry Record | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0136 | 5 | Find Registry Record | Validate Input | Microsoft SharePoint Online, called by the flow | Compose Registry Key reaches Succeeded | Compose Registry Key = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Upsert Registry Record | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0137 | 6 | Upsert Registry Record | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Find Registry Record reaches Succeeded | Find Registry Record = Succeeded | output of Find Registry Record | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Registry_Record')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Contract Key | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0138 | 7 | Update Registry Record | Upsert Registry Record | Microsoft SharePoint Online, called by the flow | Entry of Upsert Registry Record | None declared beyond entry into its container. | trigger field 'flowName'<br>trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'environmentName'<br>trigger field 'systemName'<br>trigger field 'businessProcess'<br>trigger field 'flowDescription'<br>trigger field 'technicalOwnerEmail'<br>trigger field 'businessOwnerEmail'<br>trigger field 'supportEmail'<br>trigger field 'httpMethod'<br>trigger field 'endpoint'<br>trigger field 'endpointFingerprint'<br>trigger field 'authenticationMode'<br>trigger field 'dataClassification'<br>trigger field 'criticality'<br>trigger field 'lifecycleStatus'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'isCompliant'<br>trigger field 'complianceIssues'<br>trigger field 'workflowId'<br>output of Find Registry Record<br>output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0139 | 8 | Create Registry Record | Upsert Registry Record · else | Microsoft SharePoint Online, called by the flow | Entry of Upsert Registry Record · else | None declared beyond entry into its container. | trigger field 'flowName'<br>trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'environmentName'<br>trigger field 'systemName'<br>trigger field 'businessProcess'<br>trigger field 'flowDescription'<br>trigger field 'technicalOwnerEmail'<br>trigger field 'businessOwnerEmail'<br>trigger field 'supportEmail'<br>trigger field 'httpMethod'<br>trigger field 'endpoint'<br>trigger field 'endpointFingerprint'<br>trigger field 'authenticationMode'<br>trigger field 'dataClassification'<br>trigger field 'criticality'<br>trigger field 'lifecycleStatus'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'isCompliant'<br>trigger field 'complianceIssues'<br>trigger field 'workflowId'<br>output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0140 | 9 | Compose Contract Key | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Upsert Registry Record reaches Succeeded | Upsert Registry Record = Succeeded | trigger field 'definitionFingerprint'<br>trigger field 'definitionVersion'<br>output of Compose Registry Key | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Contract | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0141 | 10 | Find Contract | Validate Input | Microsoft SharePoint Online, called by the flow | Compose Contract Key reaches Succeeded | Compose Contract Key = Succeeded | output of Compose Contract Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Find Current Contracts | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0142 | 11 | If New Contract | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Close Current Contracts reaches Succeeded | Close Current Contracts = Succeeded | output of Find Contract | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@length(coalesce(body('Find_Contract')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Apply Dependencies | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0143 | 12 | Create Contract | If New Contract | Microsoft SharePoint Online, called by the flow | Entry of If New Contract | None declared beyond entry into its container. | trigger field 'flowId'<br>trigger field 'environmentId'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint'<br>trigger field 'requestSchema'<br>trigger field 'responseContract'<br>trigger field 'dependencies'<br>trigger field 'endpoint'<br>trigger field 'technicalOwnerEmail'<br>output of Compose Contract Key<br>output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0144 | 13 | Contract Already Exists | If New Contract · else | Power Automate — 02 - GOV - Register HTTP Flow Truth | Set Existing Contract Current reaches Succeeded | Set Existing Contract Current = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0145 | 14 | Set Existing Contract Current | If New Contract · else | Microsoft SharePoint Online, called by the flow | Entry of If New Contract · else | None declared beyond entry into its container. | output of Find Contract | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Contract Already Exists | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0146 | 15 | Apply Dependencies | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | If New Contract reaches Succeeded | If New Contract = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0147 | 16 | Compose Dependency Key | Apply Dependencies | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of Apply Dependencies | None declared beyond entry into its container. | output of Compose Registry Key | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Find Dependency | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0148 | 17 | Find Dependency | Apply Dependencies | Microsoft SharePoint Online, called by the flow | Compose Dependency Key reaches Succeeded | Compose Dependency Key = Succeeded | output of Compose Dependency Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Upsert Dependency | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0149 | 18 | Upsert Dependency | Apply Dependencies | Power Automate — 02 - GOV - Register HTTP Flow Truth | Find Dependency reaches Succeeded | Find Dependency = Succeeded | output of Find Dependency | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(body('Find_Dependency')?['value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0150 | 19 | Update Dependency | Upsert Dependency | Microsoft SharePoint Online, called by the flow | Entry of Upsert Dependency | None declared beyond entry into its container. | output of Find Dependency<br>output of Compose Dependency Key<br>output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0151 | 20 | Create Dependency | Upsert Dependency · else | Microsoft SharePoint Online, called by the flow | Entry of Upsert Dependency · else | None declared beyond entry into its container. | output of Compose Dependency Key<br>output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0152 | 21 | Find Current Contracts | Validate Input | Microsoft SharePoint Online, called by the flow | Find Contract reaches Succeeded | Find Contract = Succeeded | output of Compose Registry Key | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Close Current Contracts | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0153 | 22 | Close Current Contracts | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | Find Current Contracts reaches Succeeded | Find Current Contracts = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | If New Contract | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0154 | 23 | Close Current Contract | Close Current Contracts | Microsoft SharePoint Online, called by the flow | Entry of Close Current Contracts | None declared beyond entry into its container. | — | Calls an external HTTP endpoint. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0155 | 24 | Terminate Invalid Input | Validate Input · else | Power Automate — 02 - GOV - Register HTTP Flow Truth | Respond Invalid Input reaches Succeeded | Respond Invalid Input = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0156 | 25 | Respond Invalid Input | Validate Input · else | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of Validate Input · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 400 returned to the caller. | Terminate Invalid Input | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0157 | 26 | Compose Final Report JSON | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Scope Main reaches Succeeded or Failed or TimedOut or Skipped | Scope Main = Succeeded\|Failed\|TimedOut\|Skipped | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'flowName'<br>trigger field 'definitionVersion'<br>trigger field 'definitionFingerprint' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Final Report HTML | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-059 |
| STEP-0158 | 27 | Compose Final Report HTML | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Compose Final Report JSON reaches Succeeded | Compose Final Report JSON = Succeeded | output of Compose Final Report JSON | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Final Report Email | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0159 | 28 | Send Final Report Email | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Microsoft Office 365 Outlook, called by the flow | Compose Final Report HTML reaches Succeeded | Compose Final Report HTML = Succeeded | output of Compose Final Report JSON<br>output of Compose Final Report HTML | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | If Registration Failed (runs when this does not succeed)<br>Create Send Final Report Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-059 |
| STEP-0160 | 29 | If Registration Failed | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | output of Compose Final Report JSON | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-059 |
| STEP-0161 | 30 | Terminate Registration Failed | If Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | Respond Registration Failed reaches Succeeded | Respond Registration Failed = Succeeded | output of Compose Final Report JSON | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Failed'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0162 | 31 | Respond Registration Failed | If Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of If Registration Failed | None declared beyond entry into its container. | output of Compose Final Report JSON | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 500 returned to the caller. | Terminate Registration Failed | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0163 | 32 | Terminate Registration Succeeded | If Registration Failed · else | Power Automate — 02 - GOV - Register HTTP Flow Truth | Respond Registration Succeeded reaches Succeeded | Respond Registration Succeeded = Succeeded | — | Ends the run immediately with a declared status. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | Run terminated with runStatus 'Succeeded'. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0164 | 33 | Respond Registration Succeeded | If Registration Failed · else | Power Automate — 02 - GOV - Register HTTP Flow Truth | Entry of If Registration Failed · else | None declared beyond entry into its container. | — | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 200 returned to the caller. | Terminate Registration Succeeded | — | — | — | — | — | Confirmed | No external validation required | SRC-059 |
| STEP-0165 | 34 | Create Send Final Report Email Receipt | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Microsoft SharePoint Online, called by the flow | Send Final Report Email reaches Succeeded or Failed or TimedOut | Send Final Report Email = Succeeded\|Failed\|TimedOut | — | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Final Report Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-059 |
| STEP-0166 | 35 | Compose Send Final Report Email Outcome | Scope 02 GOV Register HTTP Flow Truth COMPLETE UPDATED | Power Automate — 02 - GOV - Register HTTP Flow Truth | Create Send Final Report Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Final Report Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-059 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-008 | Validate Input | Power Automate — 02 - GOV - Register HTTP Flow Truth | `{"and":[{"greater":["@length(trim(string(triggerBody()?['environmentId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowId'])))",0]},{"greater":["@length(trim(string(triggerBody()?['flowName'])))",0]},{"lessOrEquals":["@length(trim(string(triggerBody()?['environmentId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowId'])))",255]},{"lessOrEquals":["@length(trim(string(triggerBody()?['flowName'])))",255]},{"equals":["@contains(trim(string(triggerBody()?['environmentId'])),'\\|')",false]},{"equals":["@contains(trim(string(triggerBody()?['flowId'])),'\\|')",false]},` | trigger field 'environmentId'<br>trigger field 'flowId'<br>trigger field 'flowName'<br>trigger field 'workflowId' | true<br>false | true → Compose Registry Key, Find Registry Record, Upsert Registry Record, Compose Contract Key, Find Contract, If New Contract, Apply Dependencies, Find Current Contracts, Close Current Contracts<br>false → Terminate Invalid Input, Respond Invalid Input | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-009 | Upsert Registry Record | Power Automate — 02 - GOV - Register HTTP Flow Truth | `{"and":[{"greater":["@length(coalesce(body('Find_Registry_Record')?['value'],json('[]')))",0]}]}` | output of Find Registry Record | true<br>false | true → Update Registry Record<br>false → Create Registry Record | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-010 | If New Contract | Power Automate — 02 - GOV - Register HTTP Flow Truth | `{"and":[{"equals":["@length(coalesce(body('Find_Contract')?['value'],json('[]')))",0]}]}` | output of Find Contract | true<br>false | true → Create Contract<br>false → Contract Already Exists, Set Existing Contract Current | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-011 | Upsert Dependency | Power Automate — 02 - GOV - Register HTTP Flow Truth | `{"and":[{"greater":["@length(coalesce(body('Find_Dependency')?['value'],json('[]')))",0]}]}` | output of Find Dependency | true<br>false | true → Update Dependency<br>false → Create Dependency | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-012 | If Registration Failed | Power Automate — 02 - GOV - Register HTTP Flow Truth | `{"and":[{"not":{"equals":["@outputs('Compose_Final_Report_JSON')?['status']","Succeeded"]}}]}` | output of Compose Final Report JSON | true<br>false | true → Terminate Registration Failed, Respond Registration Failed<br>false → Terminate Registration Succeeded, Respond Registration Succeeded | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 3 response action(s); status codes 200, 400, 500. |
| Successful end state | A Response action returns to the caller. 3 response action(s); status codes 200, 400, 500. |
| Alternative end states | 4 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-0165 Create Send Final Report Email Receipt |
| Notifications issued | NOTIF-145 Send Final Report Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-009 | Recovery after Scope Main | Scope Main reaches Failed or TimedOut or Skipped | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Final Report JSON. | Power Automate — 02 - GOV - Register HTTP Flow Truth | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-010 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by If Registration Failed. | Power Automate — 02 - GOV - Register HTTP Flow Truth | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-011 | Recovery after Send Final Report Email | Send Final Report Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Final Report Email Receipt. | Power Automate — 02 - GOV - Register HTTP Flow Truth | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-012 | Recovery after Create Send Final Report Email Receipt | Create Send Final Report Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Final Report Email Outcome. | Power Automate — 02 - GOV - Register HTTP Flow Truth | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0159 Send Final Report Email | Sends a message; delivery is the record. |
| STEP-0165 Create Send Final Report Email Receipt | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
