# PROC-036 — IP_Retrieve_Email_Attachment_Endpoint

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-036 |
| Name | IP_Retrieve_Email_Attachment_Endpoint |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 37 action(s) under 1 trigger(s). |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. No supplied artifact states what this workflow is for in business terms; its name and its actions are all the export carries. |
| Operational objective | Reads from and writes to Microsoft Office 365 Outlook. |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Flow estate |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Every action, run-after condition, branch and connector call is CONFIRMED from the tenant export and catalogued step by step. What the workflow is FOR, who owns it and how critical it is are NOT evidenced: no supplied artifact states them. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-089` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_Retrieve_Email_Attachment_Endpoint__5bc87cf3-7a99-4259-b6a2-315fbc794d9b__full_definition.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate<br>Microsoft Office 365 Outlook |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-3104 | Scope Email Attachment Endpoint REBUILT | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3105 | Scope Try Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3106 | Compose EmailMessageId | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3107 | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3108 | Get email V2 | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-3109 | Apply to each Attachment | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3110 | Get Attachment V2 | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-3111 | Condition Attachment Content Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3112 | Append Attachment | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3113 | Append Invalid Attachment Error | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3114 | Set Success Data | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3115 | Set Success Status | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3116 | Set Success Outcome | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3117 | Set Invalid Data | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3118 | Append Invalid Request Error | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3119 | Set Invalid Status | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3120 | Set Invalid Outcome | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3121 | Scope Catch Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3122 | Set Catch Status | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3123 | Set Catch Outcome | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3124 | Set Catch Data | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3125 | Append Catch Error | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3126 | Scope Finalize Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3127 | Set CompletedAtUtc | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3128 | Set DurationMs | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3129 | Compose Standard Response | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3130 | Response Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3131 | Initialize varReceivedAtUtc | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3132 | Initialize varStartTicks | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3133 | Initialize varCompletedAtUtc | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3134 | Initialize varDurationMs | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3135 | Initialize varStatusCode | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3136 | Initialize varOutcomeCode | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3137 | Initialize varErrors | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3138 | Initialize varAttachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3139 | Initialize varData | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |
| STEP-3140 | Initialize varRequestId | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 5bc87cf3-7a99-4259-b6a2-315fbc794d9b |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-3106 | trigger field 'emailId' |
| STEP-3107 | output of Compose EmailMessageId |
| STEP-3108 | output of Compose EmailMessageId |
| STEP-3110 | output of Get email V2 |
| STEP-3111 | output of Get Attachment V2 |
| STEP-3112 | output of Get Attachment V2 |
| STEP-3114 | variable 'varAttachments'<br>output of Compose EmailMessageId |
| STEP-3124 | trigger field 'emailId'<br>variable 'varAttachments' |
| STEP-3128 | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' |
| STEP-3129 | trigger field 'emailId'<br>variable 'varStatusCode'<br>variable 'varOutcomeCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-3130 | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Standard Response |

## 5.5 Stages and activities

37 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-3104 | 1 | Scope Email Attachment Endpoint REBUILT | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varRequestId reaches Succeeded | Initialize varRequestId = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3105 | 2 | Scope Try Email Attachments | Scope Email Attachment Endpoint REBUILT | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Scope Email Attachment Endpoint REBUILT | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch Email Attachments (runs when this does not succeed)<br>Scope Finalize Email Attachments (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3106 | 3 | Compose EmailMessageId | Scope Try Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Scope Try Email Attachments | None declared beyond entry into its container. | trigger field 'emailId' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition EmailId Valid | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3107 | 4 | Condition EmailId Valid | Scope Try Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Compose EmailMessageId reaches Succeeded | Compose EmailMessageId = Succeeded | output of Compose EmailMessageId | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@not(empty(outputs('Compose_EmailMessageId')))",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3108 | 5 | Get email V2 | Condition EmailId Valid | Microsoft Office 365 Outlook, called by the flow | Entry of Condition EmailId Valid | None declared beyond entry into its container. | output of Compose EmailMessageId | Reads one mailbox message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Apply to each Attachment | — | Microsoft Office 365 Outlook | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3109 | 6 | Apply to each Attachment | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Get email V2 reaches Succeeded | Get email V2 = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Set Success Data | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3110 | 7 | Get Attachment V2 | Apply to each Attachment | Microsoft Office 365 Outlook, called by the flow | Entry of Apply to each Attachment | None declared beyond entry into its container. | output of Get email V2 | Reads an attachment from a mailbox message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Condition Attachment Content Valid | — | Microsoft Office 365 Outlook | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3111 | 8 | Condition Attachment Content Valid | Apply to each Attachment | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Get Attachment V2 reaches Succeeded | Get Attachment V2 = Succeeded | output of Get Attachment V2 | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@not(empty(outputs('Get_Attachment_V2')?['body/name']))",true]},{"equals":["@not(empty(outputs('Get_Attachment_V2')?['body/contentBytes']))",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3112 | 9 | Append Attachment | Condition Attachment Content Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Condition Attachment Content Valid | None declared beyond entry into its container. | output of Get Attachment V2 | Appends an element to a run-scoped array. | Writes 'varAttachments'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varAttachments'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3113 | 10 | Append Invalid Attachment Error | Condition Attachment Content Valid · else | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Condition Attachment Content Valid · else | None declared beyond entry into its container. | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3114 | 11 | Set Success Data | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Apply to each Attachment reaches Succeeded | Apply to each Attachment = Succeeded | variable 'varAttachments'<br>output of Compose EmailMessageId | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Set Success Status | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3115 | 12 | Set Success Status | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Success Data reaches Succeeded | Set Success Data = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set Success Outcome | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3116 | 13 | Set Success Outcome | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Success Status reaches Succeeded | Set Success Status = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varOutcomeCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varOutcomeCode'. | Run-scoped outcome variable 'varOutcomeCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3117 | 14 | Set Invalid Data | Condition EmailId Valid · else | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Condition EmailId Valid · else | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Append Invalid Request Error | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3118 | 15 | Append Invalid Request Error | Condition EmailId Valid · else | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Invalid Data reaches Succeeded | Set Invalid Data = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | Set Invalid Status | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3119 | 16 | Set Invalid Status | Condition EmailId Valid · else | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Append Invalid Request Error reaches Succeeded | Append Invalid Request Error = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set Invalid Outcome | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3120 | 17 | Set Invalid Outcome | Condition EmailId Valid · else | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Invalid Status reaches Succeeded | Set Invalid Status = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varOutcomeCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varOutcomeCode'. | Run-scoped outcome variable 'varOutcomeCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3121 | 18 | Scope Catch Email Attachments | Scope Email Attachment Endpoint REBUILT | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Scope Try Email Attachments reaches Failed or TimedOut | Scope Try Email Attachments = Failed\|TimedOut | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize Email Attachments (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-089 |
| STEP-3122 | 19 | Set Catch Status | Scope Catch Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Scope Catch Email Attachments | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set Catch Outcome | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3123 | 20 | Set Catch Outcome | Scope Catch Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Catch Status reaches Succeeded | Set Catch Status = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varOutcomeCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varOutcomeCode'. | Run-scoped outcome variable 'varOutcomeCode' set. | Set Catch Data | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3124 | 21 | Set Catch Data | Scope Catch Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Catch Outcome reaches Succeeded | Set Catch Outcome = Succeeded | trigger field 'emailId'<br>variable 'varAttachments' | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Append Catch Error | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3125 | 22 | Append Catch Error | Scope Catch Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set Catch Data reaches Succeeded | Set Catch Data = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3126 | 23 | Scope Finalize Email Attachments | Scope Email Attachment Endpoint REBUILT | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Scope Try Email Attachments reaches Succeeded or Failed or TimedOut; Scope Catch Email Attachments reaches Succeeded or Skipped | Scope Try Email Attachments = Succeeded\|Failed\|TimedOut<br>Scope Catch Email Attachments = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-089 |
| STEP-3127 | 24 | Set CompletedAtUtc | Scope Finalize Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Entry of Scope Finalize Email Attachments | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set DurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3128 | 25 | Set DurationMs | Scope Finalize Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set CompletedAtUtc reaches Succeeded | Set CompletedAtUtc = Succeeded | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Compose Standard Response | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3129 | 26 | Compose Standard Response | Scope Finalize Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Set DurationMs reaches Succeeded | Set DurationMs = Succeeded | trigger field 'emailId'<br>variable 'varStatusCode'<br>variable 'varOutcomeCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response Email Attachments | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3130 | 27 | Response Email Attachments | Scope Finalize Email Attachments | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Compose Standard Response reaches Succeeded | Compose Standard Response = Succeeded | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Standard Response | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCode') returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3131 | 28 | Initialize varReceivedAtUtc | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3132 | 29 | Initialize varStartTicks | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varReceivedAtUtc reaches Succeeded | Initialize varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3133 | 30 | Initialize varCompletedAtUtc | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varStartTicks reaches Succeeded | Initialize varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3134 | 31 | Initialize varDurationMs | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varCompletedAtUtc reaches Succeeded | Initialize varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varStatusCode | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3135 | 32 | Initialize varStatusCode | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varDurationMs reaches Succeeded | Initialize varDurationMs = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varOutcomeCode | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3136 | 33 | Initialize varOutcomeCode | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varStatusCode reaches Succeeded | Initialize varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3137 | 34 | Initialize varErrors | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varOutcomeCode reaches Succeeded | Initialize varOutcomeCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varAttachments | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3138 | 35 | Initialize varAttachments | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varErrors reaches Succeeded | Initialize varErrors = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varData | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3139 | 36 | Initialize varData | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varAttachments reaches Succeeded | Initialize varAttachments = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |
| STEP-3140 | 37 | Initialize varRequestId | flow root | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Initialize varData reaches Succeeded | Initialize varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Email Attachment Endpoint REBUILT | — | — | — | — | — | Confirmed | No external validation required | SRC-089 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-238 | Condition EmailId Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | `{"and":[{"equals":["@not(empty(outputs('Compose_EmailMessageId')))",true]}]}` | output of Compose EmailMessageId | true<br>false | true → Get email V2, Apply to each Attachment, Set Success Data, Set Success Status, Set Success Outcome<br>false → Set Invalid Data, Append Invalid Request Error, Set Invalid Status, Set Invalid Outcome | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-239 | Condition Attachment Content Valid | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | `{"and":[{"equals":["@not(empty(outputs('Get_Attachment_V2')?['body/name']))",true]},{"equals":["@not(empty(outputs('Get_Attachment_V2')?['body/contentBytes']))",true]}]}` | output of Get Attachment V2 | true<br>false | true → Append Attachment<br>false → Append Invalid Attachment Error | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Alternative end states | 2 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | — |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-420 | Recovery after Scope Try Email Attachments | Scope Try Email Attachments reaches Failed or TimedOut | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch Email Attachments. | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-421 | Recovery after Scope Try Email Attachments, Scope Catch Email Attachments | Scope Try Email Attachments reaches Failed or TimedOut; Scope Catch Email Attachments reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Email Attachments. | Power Automate — IP_Retrieve_Email_Attachment_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

_No monitoring control, metric, service-level expectation or audit event is evidenced for this process._

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
