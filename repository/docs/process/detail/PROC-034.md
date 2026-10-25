# PROC-034 — IP_OTP_VERIFY

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-034 |
| Name | IP_OTP_VERIFY |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 59 action(s) under 1 trigger(s). |
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
| Sources | `SRC-087` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_OTP_VERIFY__4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61__full_definition.json |

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
| STEP-2987 | Initialize variable varStatusCode | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2988 | Initialize variable varData | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2989 | Initialize variable varErrors | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2990 | Initialize variable varRequestId | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2991 | Initialize variable varStartTicks | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2992 | Initialize variable varReceivedAtUtc | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2993 | Initialize variable varCompletedAtUtc | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2994 | Initialize variable varDurationMs | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2995 | Scope Global | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2996 | Switch | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2997 | Compose OTP Expiry | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-2998 | Create item OTP Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2999 | Append to string variable varResponse Generate OTP | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3000 | Set variable varStatusCode Generate OTP | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3001 | Send an email (V2) | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-3002 | Compose OTP Code | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3003 | Compose OTP Code Verify | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3004 | Compose OTP Identifier Verify | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3005 | Get items OTP Attempts | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3006 | Compose Attempts So Far | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3007 | Condition Attempt Cap | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3008 | Set variable varStatusCode Too Many Attempts | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3009 | Append to string variable varResponse Too Many Attempts | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3010 | Get items OTP Verify | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3011 | Compose Count Items Check | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3012 | Condition | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3013 | Set variable varStatusCode No Pending OTP Found | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3014 | Append to string variable varRsponse No Pending OTP Found | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3015 | Condition 1 | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3016 | Update item | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3017 | Set variable Verification Successful | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3018 | Append to string variable Verification Successful | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3019 | Set variable OTP  OTP Invalid or Expired | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3020 | Append to string variable  OTP Invalid or Expired | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3021 | Compose OTP Veriify Structure Update | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3022 | Get item OTP Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3023 | Update item Attempts | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3024 | Append to string variable Default | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3025 | Set variable Default | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3026 | Set variable varData | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3027 | Scope Flow Data Capture | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3028 | Compose Redacted Queries | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3029 | Compose Redacted Headers | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3030 | Compose Flow Run Record | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3031 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3032 | Compose Response Body | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3033 | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3034 | Set variable  varDurationMs | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3035 | Set variable varCompletedAtUtc | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3036 | Compose  Standard Response Revised | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3037 | Response | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3038 | Get Allowed Origins Otp | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3039 | Select Allowed Origins Otp | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3040 | Compose Request Origin Otp | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3041 | Compose Allowed Origin Otp | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3042 | Initialize variable varFailedCount | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3043 | Initialize variable varResponse | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3044 | Initialize variable varResults | Power Automate — IP_OTP_VERIFY | Automated |
| STEP-3045 | Initialize variable varRandomOTP | Power Automate — IP_OTP_VERIFY | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-2990 | trigger field 'requestId'<br>trigger field 'request_id' |
| STEP-2996 | trigger field 'action' |
| STEP-2998 | trigger field 'identifier'<br>variable 'varRandomOTP'<br>output of Compose OTP Expiry |
| STEP-2999 | output of Create item OTP Record |
| STEP-3001 | variable 'varRandomOTP'<br>output of Create item OTP Record |
| STEP-3002 | trigger field 'otp_code' |
| STEP-3003 | trigger field 'otp_code' |
| STEP-3004 | trigger field 'identifier'<br>trigger field 'userEmail'<br>trigger field 'id'<br>trigger field 'device' |
| STEP-3005 | output of Compose OTP Identifier Verify |
| STEP-3006 | output of Get items OTP Attempts |
| STEP-3007 | output of Compose Attempts So Far |
| STEP-3010 | output of Compose OTP Identifier Verify<br>output of Compose OTP Code |
| STEP-3011 | output of Get items OTP Verify |
| STEP-3012 | output of Compose Count Items Check |
| STEP-3015 | output of Get item OTP Record |
| STEP-3016 | output of Get item OTP Record |
| STEP-3021 | trigger field 'identifier'<br>trigger field 'userEmail'<br>trigger field 'id'<br>trigger field 'device'<br>trigger field 'otp_code'<br>variable 'varRequestId'<br>output of Compose OTP Identifier Verify<br>output of Compose OTP Code Verify<br>output of Get items OTP Verify<br>output of Compose Count Items Check |
| STEP-3022 | output of Get items OTP Verify |
| STEP-3023 | output of Get items OTP Attempts<br>output of Compose Attempts So Far |
| STEP-3026 | variable 'varResponse' |
| STEP-3030 | trigger field 'action'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries |
| STEP-3031 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |
| STEP-3032 | output of Compose  Standard Response Revised |
| STEP-3034 | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' |
| STEP-3036 | trigger field 'requestId'<br>trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'SelectedItems'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varFailedCount'<br>variable 'varResults'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-3037 | variable 'varStatusCode'<br>output of Compose Allowed Origin Otp<br>output of Compose  Standard Response Revised |
| STEP-3039 | output of Get Allowed Origins Otp |
| STEP-3041 | output of Select Allowed Origins Otp<br>output of Compose Request Origin Otp |

## 5.5 Stages and activities

59 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-2987 | 1 | Initialize variable varStatusCode | flow root | Power Automate — IP_OTP_VERIFY | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRandomOTP | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2988 | 2 | Initialize variable varData | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varResponse reaches Succeeded | Initialize variable varResponse = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2989 | 3 | Initialize variable varErrors | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varData reaches Succeeded | Initialize variable varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2990 | 4 | Initialize variable varRequestId | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varErrors reaches Succeeded | Initialize variable varErrors = Succeeded | trigger field 'requestId'<br>trigger field 'request_id' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2991 | 5 | Initialize variable varStartTicks | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varRequestId reaches Succeeded | Initialize variable varRequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varReceivedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2992 | 6 | Initialize variable varReceivedAtUtc | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varStartTicks reaches Succeeded | Initialize variable varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2993 | 7 | Initialize variable varCompletedAtUtc | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varReceivedAtUtc reaches Succeeded | Initialize variable varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2994 | 8 | Initialize variable varDurationMs | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varCompletedAtUtc reaches Succeeded | Initialize variable varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Global | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2995 | 9 | Scope Global | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varDurationMs reaches Succeeded | Initialize variable varDurationMs = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2996 | 10 | Switch | Scope Global | Power Automate — IP_OTP_VERIFY | Entry of Scope Global | None declared beyond entry into its container. | trigger field 'action' | Evaluates an expression and runs the matching case. | Discriminator: @triggerBody()?['action'] | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Set variable varData (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2997 | 11 | Compose OTP Expiry | Switch · case Case Generate | Power Automate — IP_OTP_VERIFY | Entry of Switch · case Case Generate | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create item OTP Record | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-2998 | 12 | Create item OTP Record | Switch · case Case Generate | Microsoft SharePoint Online, called by the flow | Compose OTP Expiry reaches Succeeded | Compose OTP Expiry = Succeeded | trigger field 'identifier'<br>variable 'varRandomOTP'<br>output of Compose OTP Expiry | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Send an email (V2) | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-087 |
| STEP-2999 | 13 | Append to string variable varResponse Generate OTP | Switch · case Case Generate | Power Automate — IP_OTP_VERIFY | Send an email (V2) reaches Succeeded | Send an email (V2) = Succeeded | output of Create item OTP Record | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode Generate OTP | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3000 | 14 | Set variable varStatusCode Generate OTP | Switch · case Case Generate | Power Automate — IP_OTP_VERIFY | Append to string variable varResponse Generate OTP reaches Succeeded | Append to string variable varResponse Generate OTP = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3001 | 15 | Send an email (V2) | Switch · case Case Generate | Microsoft Office 365 Outlook, called by the flow | Create item OTP Record reaches Succeeded | Create item OTP Record = Succeeded | variable 'varRandomOTP'<br>output of Create item OTP Record | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Append to string variable varResponse Generate OTP | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-087 |
| STEP-3002 | 16 | Compose OTP Code | Switch · case Case Verify | Power Automate — IP_OTP_VERIFY | Entry of Switch · case Case Verify | None declared beyond entry into its container. | trigger field 'otp_code' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose OTP Code Verify | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3003 | 17 | Compose OTP Code Verify | Switch · case Case Verify | Power Automate — IP_OTP_VERIFY | Compose OTP Code reaches Succeeded | Compose OTP Code = Succeeded | trigger field 'otp_code' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose OTP Identifier Verify | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3004 | 18 | Compose OTP Identifier Verify | Switch · case Case Verify | Power Automate — IP_OTP_VERIFY | Compose OTP Code Verify reaches Succeeded | Compose OTP Code Verify = Succeeded | trigger field 'identifier'<br>trigger field 'userEmail'<br>trigger field 'id'<br>trigger field 'device' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get items OTP Attempts | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3005 | 19 | Get items OTP Attempts | Switch · case Case Verify | Microsoft SharePoint Online, called by the flow | Compose OTP Identifier Verify reaches Succeeded | Compose OTP Identifier Verify = Succeeded | output of Compose OTP Identifier Verify | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Attempts So Far | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3006 | 20 | Compose Attempts So Far | Switch · case Case Verify | Power Automate — IP_OTP_VERIFY | Get items OTP Attempts reaches Succeeded | Get items OTP Attempts = Succeeded | output of Get items OTP Attempts | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition Attempt Cap | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3007 | 21 | Condition Attempt Cap | Switch · case Case Verify | Power Automate — IP_OTP_VERIFY | Compose Attempts So Far reaches Succeeded | Compose Attempts So Far = Succeeded | output of Compose Attempts So Far | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greaterOrEquals":["@outputs('Compose_Attempts_So_Far')",5]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3008 | 22 | Set variable varStatusCode Too Many Attempts | Condition Attempt Cap | Power Automate — IP_OTP_VERIFY | Entry of Condition Attempt Cap | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to string variable varResponse Too Many Attempts | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3009 | 23 | Append to string variable varResponse Too Many Attempts | Condition Attempt Cap | Power Automate — IP_OTP_VERIFY | Set variable varStatusCode Too Many Attempts reaches Succeeded | Set variable varStatusCode Too Many Attempts = Succeeded | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3010 | 24 | Get items OTP Verify | Condition Attempt Cap · else | Microsoft SharePoint Online, called by the flow | Update item Attempts reaches Succeeded | Update item Attempts = Succeeded | output of Compose OTP Identifier Verify<br>output of Compose OTP Code | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Count Items Check | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3011 | 25 | Compose Count Items Check | Condition Attempt Cap · else | Power Automate — IP_OTP_VERIFY | Get items OTP Verify reaches Succeeded | Get items OTP Verify = Succeeded | output of Get items OTP Verify | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3012 | 26 | Condition | Condition Attempt Cap · else | Power Automate — IP_OTP_VERIFY | Compose Count Items Check reaches Succeeded | Compose Count Items Check = Succeeded | output of Compose Count Items Check | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"less":["@outputs('Compose_Count_Items_Check')",1]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3013 | 27 | Set variable varStatusCode No Pending OTP Found | Condition | Power Automate — IP_OTP_VERIFY | Append to string variable varRsponse No Pending OTP Found reaches Succeeded | Append to string variable varRsponse No Pending OTP Found = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3014 | 28 | Append to string variable varRsponse No Pending OTP Found | Condition | Power Automate — IP_OTP_VERIFY | Entry of Condition | None declared beyond entry into its container. | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | Set variable varStatusCode No Pending OTP Found | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3015 | 29 | Condition 1 | Condition · else | Power Automate — IP_OTP_VERIFY | Get item OTP Record reaches Succeeded | Get item OTP Record = Succeeded | output of Get item OTP Record | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@outputs('Get_item_OTP_Record')?['body/Expires_At']","@utcNow()"]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose OTP Veriify Structure Update | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3016 | 30 | Update item | Condition 1 | Microsoft SharePoint Online, called by the flow | Entry of Condition 1 | None declared beyond entry into its container. | output of Get item OTP Record | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Set variable Verification Successful | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-087 |
| STEP-3017 | 31 | Set variable Verification Successful | Condition 1 | Power Automate — IP_OTP_VERIFY | Update item reaches Succeeded | Update item = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to string variable Verification Successful | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3018 | 32 | Append to string variable Verification Successful | Condition 1 | Power Automate — IP_OTP_VERIFY | Set variable Verification Successful reaches Succeeded | Set variable Verification Successful = Succeeded | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3019 | 33 | Set variable OTP  OTP Invalid or Expired | Condition 1 · else | Power Automate — IP_OTP_VERIFY | Entry of Condition 1 · else | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to string variable  OTP Invalid or Expired | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3020 | 34 | Append to string variable  OTP Invalid or Expired | Condition 1 · else | Power Automate — IP_OTP_VERIFY | Set variable OTP  OTP Invalid or Expired reaches Succeeded | Set variable OTP  OTP Invalid or Expired = Succeeded | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3021 | 35 | Compose OTP Veriify Structure Update | Condition · else | Power Automate — IP_OTP_VERIFY | Condition 1 reaches Succeeded | Condition 1 = Succeeded | trigger field 'identifier'<br>trigger field 'userEmail'<br>trigger field 'id'<br>trigger field 'device'<br>trigger field 'otp_code'<br>variable 'varRequestId'<br>output of Compose OTP Identifier Verify<br>output of Compose OTP Code Verify<br>output of Get items OTP Verify<br>output of Compose Count Items Check | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3022 | 36 | Get item OTP Record | Condition · else | Microsoft SharePoint Online, called by the flow | Entry of Condition · else | None declared beyond entry into its container. | output of Get items OTP Verify | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Condition 1 | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3023 | 37 | Update item Attempts | Condition Attempt Cap · else | Microsoft SharePoint Online, called by the flow | Entry of Condition Attempt Cap · else | None declared beyond entry into its container. | output of Get items OTP Attempts<br>output of Compose Attempts So Far | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get items OTP Verify | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-087 |
| STEP-3024 | 38 | Append to string variable Default | Switch · default | Power Automate — IP_OTP_VERIFY | Set variable Default reaches Succeeded | Set variable Default = Succeeded | — | Appends text to a run-scoped string. | Writes 'varResponse'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varResponse'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3025 | 39 | Set variable Default | Switch · default | Power Automate — IP_OTP_VERIFY | Entry of Switch · default | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to string variable Default | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3026 | 40 | Set variable varData | Scope Global | Power Automate — IP_OTP_VERIFY | Switch reaches Succeeded or Skipped or TimedOut or Failed | Switch = Succeeded\|Skipped\|TimedOut\|Failed | variable 'varResponse' | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | Scope Finalize Response State (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-087 |
| STEP-3027 | 41 | Scope Flow Data Capture | Scope Global | Power Automate — IP_OTP_VERIFY | Scope Finalize Response State reaches Succeeded or Skipped or Failed or TimedOut | Scope Finalize Response State = Succeeded\|Skipped\|Failed\|TimedOut | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-087 |
| STEP-3028 | 42 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — IP_OTP_VERIFY | Compose Response Body reaches Succeeded | Compose Response Body = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3029 | 43 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — IP_OTP_VERIFY | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3030 | 44 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — IP_OTP_VERIFY | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | trigger field 'action'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3031 | 45 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-087 |
| STEP-3032 | 46 | Compose Response Body | Scope Flow Data Capture | Power Automate — IP_OTP_VERIFY | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | output of Compose  Standard Response Revised | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Queries | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3033 | 47 | Scope Finalize Response State | Scope Global | Power Automate — IP_OTP_VERIFY | Set variable varData reaches Succeeded or TimedOut or Skipped or Failed | Set variable varData = Succeeded\|TimedOut\|Skipped\|Failed | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-087 |
| STEP-3034 | 48 | Set variable  varDurationMs | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Set variable varCompletedAtUtc reaches Succeeded | Set variable varCompletedAtUtc = Succeeded | variable 'varStartTicks'<br>variable 'varCompletedAtUtc' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Get Allowed Origins Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3035 | 49 | Set variable varCompletedAtUtc | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Entry of Scope Finalize Response State | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set variable  varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3036 | 50 | Compose  Standard Response Revised | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Compose Allowed Origin Otp reaches Succeeded | Compose Allowed Origin Otp = Succeeded | trigger field 'requestId'<br>trigger field 'trackingId'<br>trigger field 'trackingID'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'SelectedItems'<br>trigger field 'userEmail'<br>trigger field 'NewActivityTask'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varFailedCount'<br>variable 'varResults'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3037 | 51 | Response | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Compose  Standard Response Revised reaches Succeeded | Compose  Standard Response Revised = Succeeded | variable 'varStatusCode'<br>output of Compose Allowed Origin Otp<br>output of Compose  Standard Response Revised | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @coalesce(variables('varStatusCode'), 500) returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3038 | 52 | Get Allowed Origins Otp | Scope Finalize Response State | Microsoft SharePoint Online, called by the flow | Set variable  varDurationMs reaches Succeeded | Set variable  varDurationMs = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Allowed Origins Otp | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3039 | 53 | Select Allowed Origins Otp | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Get Allowed Origins Otp reaches Succeeded | Get Allowed Origins Otp = Succeeded | output of Get Allowed Origins Otp | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3040 | 54 | Compose Request Origin Otp | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Select Allowed Origins Otp reaches Succeeded | Select Allowed Origins Otp = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin Otp | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3041 | 55 | Compose Allowed Origin Otp | Scope Finalize Response State | Power Automate — IP_OTP_VERIFY | Compose Request Origin Otp reaches Succeeded | Compose Request Origin Otp = Succeeded | output of Select Allowed Origins Otp<br>output of Compose Request Origin Otp | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose  Standard Response Revised | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3042 | 56 | Initialize variable varFailedCount | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varRandomOTP reaches Succeeded | Initialize variable varRandomOTP = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varResults | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3043 | 57 | Initialize variable varResponse | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varResults reaches Succeeded | Initialize variable varResults = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varData | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3044 | 58 | Initialize variable varResults | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varFailedCount reaches Succeeded | Initialize variable varFailedCount = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varResponse | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |
| STEP-3045 | 59 | Initialize variable varRandomOTP | flow root | Power Automate — IP_OTP_VERIFY | Initialize variable varStatusCode reaches Succeeded | Initialize variable varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varFailedCount | — | — | — | — | — | Confirmed | No external validation required | SRC-087 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-233 | Switch | Power Automate — IP_OTP_VERIFY | `@triggerBody()?['action']` | trigger field 'action' | generate<br>verify | "generate" → Compose OTP Expiry, Create item OTP Record, Append to string variable varResponse Generate OTP, Set variable varStatusCode Generate OTP, Send an email (V2)<br>"verify" → Compose OTP Code, Compose OTP Code Verify, Compose OTP Identifier Verify, Get items OTP Attempts, Compose Attempts So Far, Condition Attempt Cap | Default branch runs: Append to string variable Default, Set variable Default. | Not declared on the decision itself. | Confirmed |
| DEC-234 | Condition Attempt Cap | Power Automate — IP_OTP_VERIFY | `{"and":[{"greaterOrEquals":["@outputs('Compose_Attempts_So_Far')",5]}]}` | output of Compose Attempts So Far | true<br>false | true → Set variable varStatusCode Too Many Attempts, Append to string variable varResponse Too Many Attempts<br>false → Get items OTP Verify, Compose Count Items Check, Condition, Update item Attempts | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-235 | Condition | Power Automate — IP_OTP_VERIFY | `{"and":[{"less":["@outputs('Compose_Count_Items_Check')",1]}]}` | output of Compose Count Items Check | true<br>false | true → Set variable varStatusCode No Pending OTP Found, Append to string variable varRsponse No Pending OTP Found<br>false → Condition 1, Compose OTP Veriify Structure Update, Get item OTP Record | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-236 | Condition 1 | Power Automate — IP_OTP_VERIFY | `{"and":[{"greater":["@outputs('Get_item_OTP_Record')?['body/Expires_At']","@utcNow()"]}]}` | output of Get item OTP Record | true<br>false | true → Update item, Set variable Verification Successful, Append to string variable Verification Successful<br>false → Set variable OTP  OTP Invalid or Expired, Append to string variable  OTP Invalid or Expired | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @coalesce(variables('varStatusCode'), 500). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @coalesce(variables('varStatusCode'), 500). |
| Alternative end states | 3 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-2998 Create item OTP Record<br>STEP-3016 Update item<br>STEP-3023 Update item Attempts<br>STEP-3031 Create Flow Telemetry |
| Notifications issued | NOTIF-201 Send an email (V2) |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-411 | Recovery after Switch | Switch reaches Skipped or TimedOut or Failed | Replaces the value held in a run-scoped variable. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Set variable varData. | Power Automate — IP_OTP_VERIFY | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-412 | Recovery after Scope Finalize Response State | Scope Finalize Response State reaches Skipped or Failed or TimedOut | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — IP_OTP_VERIFY | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-413 | Recovery after Set variable varData | Set variable varData reaches TimedOut or Skipped or Failed | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Response State. | Power Automate — IP_OTP_VERIFY | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-2998 Create item OTP Record | Writes a list item; the write itself is the audit record. |
| STEP-3001 Send an email (V2) | Sends a message; delivery is the record. |
| STEP-3016 Update item | Writes a list item; the write itself is the audit record. |
| STEP-3023 Update item Attempts | Writes a list item; the write itself is the audit record. |
| STEP-3031 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
