# PROC-033 — IP_OTP_GENERATE

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-033 |
| Name | IP_OTP_GENERATE |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 40 action(s) under 1 trigger(s). |
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
| Sources | `SRC-086` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_OTP_GENERATE__e5632336-641f-4b9b-bd93-99185b5eb975__full_definition.json |

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
| STEP-2947 | Initialize variable varStatusCode | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2948 | Initialize variable varData | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2949 | Initialize variable varErrors | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2950 | Initialize variable varRequestId | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2951 | Initialize variable varStartTicks | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2952 | Initialize variable varReceivedAtUtc | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2953 | Initialize variable varCompletedAtUtc | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2954 | Initialize variable varDurationMs | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2955 | Scope Global | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2956 | Switch | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2957 | Compose OTP Expiry | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2958 | Create item OTP Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2959 | Append to string variable varResponse Generate OTP | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2960 | Set variable varStatusCode Generate OTP | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2961 | Send an email (V2) | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-2962 | Create Send an email (V2) Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2963 | Compose Send an email (V2) Outcome | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2964 | Append to string variable Default | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2965 | Set variable Default | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2966 | Set variable varData | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2967 | Scope Flow Data Capture | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2968 | Compose Redacted Queries | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2969 | Compose Redacted Headers | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2970 | Compose Flow Run Record | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2971 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2972 | Compose Response Body | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2973 | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2974 | Set variable  varDurationMs | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2975 | Set variable varCompletedAtUtc | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2976 | Compose  Standard Response Revised | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2977 | Response | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2978 | Get Allowed Origins Otp | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2979 | Select Allowed Origins Otp | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2980 | Compose Request Origin Otp | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2981 | Compose Allowed Origin Otp | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2982 | Compose Value Set variable varData | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2983 | Initialize variable varFailedCount | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2984 | Initialize variable varResponse | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2985 | Initialize variable varResults | Power Automate — IP_OTP_GENERATE | Automated |
| STEP-2986 | Initialize variable varRandomOTP | Power Automate — IP_OTP_GENERATE | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow e5632336-641f-4b9b-bd93-99185b5eb975 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-2950 | trigger field 'requestId'<br>trigger field 'request_id' |
| STEP-2956 | trigger field 'action' |
| STEP-2958 | trigger field 'identifier'<br>variable 'varRandomOTP'<br>output of Compose OTP Expiry |
| STEP-2959 | output of Create item OTP Record |
| STEP-2961 | variable 'varRandomOTP'<br>output of Create item OTP Record |
| STEP-2962 | output of Create item OTP Record |
| STEP-2966 | output of Compose Value Set variable varData |
| STEP-2970 | trigger field 'action'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries |
| STEP-2971 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |
| STEP-2972 | output of Compose  Standard Response Revised |
| STEP-2974 | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' |
| STEP-2976 | trigger field 'requestId'<br>trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'SelectedItems'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varFailedCount'<br>variable 'varResults'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-2977 | variable 'varStatusCode'<br>output of Compose Allowed Origin Otp<br>output of Compose  Standard Response Revised |
| STEP-2979 | output of Get Allowed Origins Otp |
| STEP-2981 | output of Select Allowed Origins Otp<br>output of Compose Request Origin Otp |
| STEP-2982 | variable 'varResponse' |

## 5.5 Stages and activities

40 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-2947 | 1 | Initialize variable varStatusCode | flow root | Power Automate — IP_OTP_GENERATE | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRandomOTP | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2948 | 2 | Initialize variable varData | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varResponse reaches Succeeded | Initialize variable varResponse = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2949 | 3 | Initialize variable varErrors | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varData reaches Succeeded | Initialize variable varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2950 | 4 | Initialize variable varRequestId | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varErrors reaches Succeeded | Initialize variable varErrors = Succeeded | trigger field 'requestId'<br>trigger field 'request_id' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2951 | 5 | Initialize variable varStartTicks | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varRequestId reaches Succeeded | Initialize variable varRequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varReceivedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2952 | 6 | Initialize variable varReceivedAtUtc | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varStartTicks reaches Succeeded | Initialize variable varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2953 | 7 | Initialize variable varCompletedAtUtc | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varReceivedAtUtc reaches Succeeded | Initialize variable varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2954 | 8 | Initialize variable varDurationMs | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varCompletedAtUtc reaches Succeeded | Initialize variable varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Global | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2955 | 9 | Scope Global | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varDurationMs reaches Succeeded | Initialize variable varDurationMs = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2956 | 10 | Switch | Scope Global | Power Automate — IP_OTP_GENERATE | Entry of Scope Global | None declared beyond entry into its container. | trigger field 'action' | Evaluates an expression and runs the matching case. | Discriminator: @triggerBody()?['action'] | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Value Set variable varData (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2957 | 11 | Compose OTP Expiry | Switch · case Case Generate | Power Automate — IP_OTP_GENERATE | Entry of Switch · case Case Generate | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create item OTP Record | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2958 | 12 | Create item OTP Record | Switch · case Case Generate | Microsoft SharePoint Online, called by the flow | Compose OTP Expiry reaches Succeeded | Compose OTP Expiry = Succeeded | trigger field 'identifier'<br>variable 'varRandomOTP'<br>output of Compose OTP Expiry | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Send an email (V2) | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-086 |
| STEP-2959 | 13 | Append to string variable varResponse Generate OTP | Switch · case Case Generate | Power Automate — IP_OTP_GENERATE | Send an email (V2) reaches Succeeded | Send an email (V2) = Succeeded | output of Create item OTP Record | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode Generate OTP | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2960 | 14 | Set variable varStatusCode Generate OTP | Switch · case Case Generate | Power Automate — IP_OTP_GENERATE | Append to string variable varResponse Generate OTP reaches Succeeded | Append to string variable varResponse Generate OTP = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2961 | 15 | Send an email (V2) | Switch · case Case Generate | Microsoft Office 365 Outlook, called by the flow | Create item OTP Record reaches Succeeded | Create item OTP Record = Succeeded | variable 'varRandomOTP'<br>output of Create item OTP Record | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Append to string variable varResponse Generate OTP | Create Send an email (V2) Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-086 |
| STEP-2962 | 16 | Create Send an email (V2) Receipt | Switch · case Case Generate | Microsoft SharePoint Online, called by the flow | Send an email (V2) reaches Succeeded or Failed or TimedOut | Send an email (V2) = Succeeded\|Failed\|TimedOut | output of Create item OTP Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send an email (V2) Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-086 |
| STEP-2963 | 17 | Compose Send an email (V2) Outcome | Switch · case Case Generate | Power Automate — IP_OTP_GENERATE | Create Send an email (V2) Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send an email (V2) Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-086 |
| STEP-2964 | 18 | Append to string variable Default | Switch · default | Power Automate — IP_OTP_GENERATE | Set variable Default reaches Succeeded | Set variable Default = Succeeded | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2965 | 19 | Set variable Default | Switch · default | Power Automate — IP_OTP_GENERATE | Entry of Switch · default | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to string variable Default | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2966 | 20 | Set variable varData | Scope Global | Power Automate — IP_OTP_GENERATE | Compose Value Set variable varData reaches Succeeded | Compose Value Set variable varData = Succeeded | output of Compose Value Set variable varData | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | Scope Finalize Response State (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2967 | 21 | Scope Flow Data Capture | Scope Global | Power Automate — IP_OTP_GENERATE | Scope Finalize Response State reaches Succeeded or Skipped or Failed or TimedOut | Scope Finalize Response State = Succeeded\|Skipped\|Failed\|TimedOut | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-086 |
| STEP-2968 | 22 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — IP_OTP_GENERATE | Compose Response Body reaches Succeeded | Compose Response Body = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2969 | 23 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — IP_OTP_GENERATE | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2970 | 24 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — IP_OTP_GENERATE | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | trigger field 'action'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2971 | 25 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-086 |
| STEP-2972 | 26 | Compose Response Body | Scope Flow Data Capture | Power Automate — IP_OTP_GENERATE | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | output of Compose  Standard Response Revised | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Queries | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2973 | 27 | Scope Finalize Response State | Scope Global | Power Automate — IP_OTP_GENERATE | Set variable varData reaches Succeeded or TimedOut or Skipped or Failed | Set variable varData = Succeeded\|TimedOut\|Skipped\|Failed | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-086 |
| STEP-2974 | 28 | Set variable  varDurationMs | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Set variable varCompletedAtUtc reaches Succeeded | Set variable varCompletedAtUtc = Succeeded | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Get Allowed Origins Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2975 | 29 | Set variable varCompletedAtUtc | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Entry of Scope Finalize Response State | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set variable  varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2976 | 30 | Compose  Standard Response Revised | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Compose Allowed Origin Otp reaches Succeeded | Compose Allowed Origin Otp = Succeeded | trigger field 'requestId'<br>trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'SelectedItems'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varFailedCount'<br>variable 'varResults'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2977 | 31 | Response | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Compose  Standard Response Revised reaches Succeeded | Compose  Standard Response Revised = Succeeded | variable 'varStatusCode'<br>output of Compose Allowed Origin Otp<br>output of Compose  Standard Response Revised | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @coalesce(variables('varStatusCode'), 500) returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2978 | 32 | Get Allowed Origins Otp | Scope Finalize Response State | Microsoft SharePoint Online, called by the flow | Set variable  varDurationMs reaches Succeeded | Set variable  varDurationMs = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Allowed Origins Otp | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2979 | 33 | Select Allowed Origins Otp | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Get Allowed Origins Otp reaches Succeeded | Get Allowed Origins Otp = Succeeded | output of Get Allowed Origins Otp | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2980 | 34 | Compose Request Origin Otp | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Select Allowed Origins Otp reaches Succeeded | Select Allowed Origins Otp = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2981 | 35 | Compose Allowed Origin Otp | Scope Finalize Response State | Power Automate — IP_OTP_GENERATE | Compose Request Origin Otp reaches Succeeded | Compose Request Origin Otp = Succeeded | output of Select Allowed Origins Otp<br>output of Compose Request Origin Otp | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose  Standard Response Revised | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2982 | 36 | Compose Value Set variable varData | Scope Global | Power Automate — IP_OTP_GENERATE | Switch reaches Succeeded or Skipped or TimedOut or Failed | Switch = Succeeded\|Skipped\|TimedOut\|Failed | variable 'varResponse' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Set variable varData | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-086 |
| STEP-2983 | 37 | Initialize variable varFailedCount | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varRandomOTP reaches Succeeded | Initialize variable varRandomOTP = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varResults | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2984 | 38 | Initialize variable varResponse | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varResults reaches Succeeded | Initialize variable varResults = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varData | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2985 | 39 | Initialize variable varResults | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varFailedCount reaches Succeeded | Initialize variable varFailedCount = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varResponse | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |
| STEP-2986 | 40 | Initialize variable varRandomOTP | flow root | Power Automate — IP_OTP_GENERATE | Initialize variable varStatusCode reaches Succeeded | Initialize variable varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varFailedCount | — | — | — | — | — | Confirmed | No external validation required | SRC-086 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-232 | Switch | Power Automate — IP_OTP_GENERATE | `@triggerBody()?['action']` | trigger field 'action' | generate | "generate" → Compose OTP Expiry, Create item OTP Record, Append to string variable varResponse Generate OTP, Set variable varStatusCode Generate OTP, Send an email (V2), Create Send an email (V2) Receipt, Compose Send an email (V2) Outcome | Default branch runs: Append to string variable Default, Set variable Default. | Not declared on the decision itself. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @coalesce(variables('varStatusCode'), 500). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @coalesce(variables('varStatusCode'), 500). |
| Alternative end states | 5 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-2958 Create item OTP Record<br>STEP-2962 Create Send an email (V2) Receipt<br>STEP-2971 Create Flow Telemetry |
| Notifications issued | NOTIF-200 Send an email (V2) |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-406 | Recovery after Send an email (V2) | Send an email (V2) reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send an email (V2) Receipt. | Power Automate — IP_OTP_GENERATE | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-407 | Recovery after Create Send an email (V2) Receipt | Create Send an email (V2) Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send an email (V2) Outcome. | Power Automate — IP_OTP_GENERATE | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-408 | Recovery after Scope Finalize Response State | Scope Finalize Response State reaches Skipped or Failed or TimedOut | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — IP_OTP_GENERATE | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-409 | Recovery after Set variable varData | Set variable varData reaches TimedOut or Skipped or Failed | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Response State. | Power Automate — IP_OTP_GENERATE | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-410 | Recovery after Switch | Switch reaches Skipped or TimedOut or Failed | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Value Set variable varData. | Power Automate — IP_OTP_GENERATE | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-2958 Create item OTP Record | Writes a list item; the write itself is the audit record. |
| STEP-2961 Send an email (V2) | Sends a message; delivery is the record. |
| STEP-2962 Create Send an email (V2) Receipt | Writes a list item; the write itself is the audit record. |
| STEP-2971 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
