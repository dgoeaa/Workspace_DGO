# PROC-035 — IP_Reference_Data_Endpoint

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-035 |
| Name | IP_Reference_Data_Endpoint |
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
| Sources | `SRC-088` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_Reference_Data_Endpoint__9a4dea8e-15f2-42b6-904d-3655056fa3c2__full_definition.json |

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
| STEP-3046 | Initialize Lookups ReceivedAt | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3047 | Initialize Lookups StartTicks | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3048 | Initialize Lookups CompletedAt | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3049 | Initialize Lookups Duration | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3050 | Initialize Lookups Status | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3051 | Initialize Lookups RequestId | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3052 | Initialize Lookups Data | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3053 | Initialize Lookups Errors | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3054 | Scope Global | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3055 | Scope Lookups Fetch | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3056 | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3057 | Compose Lookups Caller | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3058 | Get Lookups Directory User | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3059 | Compose Lookups Role | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3060 | Get Lookups Role Permissions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3061 | Compose Lookups Permissions Array | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3062 | Compose Lookups Routes Array | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3063 | Compose Lookups Permitted | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3064 | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3065 | Get Lookup Users | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3066 | Get Lookup Categories | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3067 | Get Lookup Departments | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3068 | Select Lookup Users | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3069 | Select Lookup Categories | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3070 | Select Lookup Departments | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3071 | Set Lookups Success Data | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3072 | Set Lookups Success Status | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3073 | Set Lookups Denied Data | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3074 | Set Lookups Denied Status | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3075 | Append Lookups Denied Error | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3076 | Compose temp fix permtted | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3077 | Compose temp fix caller | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3078 | Compose actual expressions Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3079 | Scope Catch Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3080 | Set Lookups Catch Status | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3081 | Set Lookups Catch Data | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3082 | Append Lookups Catch Error | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3083 | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3084 | Set Lookups CompletedAt | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3085 | Set Lookups DurationMs | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3086 | Get Allowed Origins Lookups | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3087 | Select Allowed Origins Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3088 | Compose Request Origin Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3089 | Compose Allowed Origin Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3090 | Compose Lookups Standard Response | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3091 | Compose Lookups Telemetry | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3092 | Create Lookups Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3093 | Response Lookups | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3094 | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3095 | Compose Redacted Queries | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3096 | Compose Redacted Headers | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3097 | Get Flow Definition | Microsoft Power Automate Management, called by the flow | Integration |
| STEP-3098 | Compose Flow Run Record | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3099 | Compose Flow Run Record Schema | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3100 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3101 | Get item Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-3102 | Compose Telemetry Attachments | Power Automate — IP_Reference_Data_Endpoint | Automated |
| STEP-3103 | Send Telemetry Email | Microsoft Office 365 Outlook, called by the flow | Integration |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 9a4dea8e-15f2-42b6-904d-3655056fa3c2 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft Power Automate Management<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-3051 | trigger field 'payload'<br>trigger field 'requestId' |
| STEP-3057 | trigger field 'payload'<br>trigger field 'userEmail' |
| STEP-3058 | output of Compose Lookups Caller |
| STEP-3059 | output of Get Lookups Directory User |
| STEP-3060 | output of Compose Lookups Role |
| STEP-3061 | output of Get Lookups Role Permissions |
| STEP-3062 | output of Get Lookups Role Permissions |
| STEP-3063 | output of Get Lookups Directory User<br>output of Get Lookups Role Permissions<br>output of Compose Lookups Routes Array<br>output of Compose Lookups Permissions Array |
| STEP-3064 | output of Compose temp fix caller<br>output of Compose temp fix permtted |
| STEP-3068 | output of Get Lookup Users |
| STEP-3069 | output of Get Lookup Categories |
| STEP-3070 | output of Get Lookup Departments |
| STEP-3071 | output of Select Lookup Users<br>output of Select Lookup Categories<br>output of Select Lookup Departments |
| STEP-3073 | output of Compose Lookups Caller<br>output of Get Lookups Directory User |
| STEP-3074 | output of Compose Lookups Caller<br>output of Get Lookups Directory User |
| STEP-3075 | output of Compose Lookups Caller<br>output of Get Lookups Directory User |
| STEP-3078 | output of Compose Lookups Caller<br>output of Compose Lookups Permitted |
| STEP-3085 | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' |
| STEP-3087 | output of Get Allowed Origins Lookups |
| STEP-3089 | output of Compose Request Origin Lookups<br>output of Select Allowed Origins Lookups |
| STEP-3090 | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varData'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varErrors' |
| STEP-3091 | variable 'varRequestId'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Lookups Caller |
| STEP-3092 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Lookups Telemetry |
| STEP-3093 | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Allowed Origin Lookups<br>output of Compose Lookups Standard Response |
| STEP-3098 | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose Lookups Caller<br>output of Get Flow Definition |
| STEP-3100 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |
| STEP-3101 | output of Create Flow Telemetry |
| STEP-3102 | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry |
| STEP-3103 | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments |

## 5.5 Stages and activities

58 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-3046 | 1 | Initialize Lookups ReceivedAt | flow root | Power Automate — IP_Reference_Data_Endpoint | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups StartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3047 | 2 | Initialize Lookups StartTicks | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups ReceivedAt reaches Succeeded | Initialize Lookups ReceivedAt = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups CompletedAt | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3048 | 3 | Initialize Lookups CompletedAt | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups StartTicks reaches Succeeded | Initialize Lookups StartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups Duration | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3049 | 4 | Initialize Lookups Duration | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups CompletedAt reaches Succeeded | Initialize Lookups CompletedAt = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups Status | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3050 | 5 | Initialize Lookups Status | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups Duration reaches Succeeded | Initialize Lookups Duration = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups RequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3051 | 6 | Initialize Lookups RequestId | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups Status reaches Succeeded | Initialize Lookups Status = Succeeded | trigger field 'payload'<br>trigger field 'requestId' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups Data | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3052 | 7 | Initialize Lookups Data | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups RequestId reaches Succeeded | Initialize Lookups RequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize Lookups Errors | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3053 | 8 | Initialize Lookups Errors | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups Data reaches Succeeded | Initialize Lookups Data = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Global | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3054 | 9 | Scope Global | flow root | Power Automate — IP_Reference_Data_Endpoint | Initialize Lookups Errors reaches Succeeded | Initialize Lookups Errors = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3055 | 10 | Scope Lookups Fetch | Scope Global | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Global | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3056 | 11 | Scope Global Lookups | Scope Lookups Fetch | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Lookups Fetch | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch Lookups (runs when this does not succeed)<br>Scope Finalize Lookups (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3057 | 12 | Compose Lookups Caller | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Global Lookups | None declared beyond entry into its container. | trigger field 'payload'<br>trigger field 'userEmail' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Lookups Directory User | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3058 | 13 | Get Lookups Directory User | Scope Global Lookups | Microsoft SharePoint Online, called by the flow | Compose Lookups Caller reaches Succeeded | Compose Lookups Caller = Succeeded | output of Compose Lookups Caller | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Lookups Role | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3059 | 14 | Compose Lookups Role | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Get Lookups Directory User reaches Succeeded | Get Lookups Directory User = Succeeded | output of Get Lookups Directory User | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Lookups Role Permissions | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3060 | 15 | Get Lookups Role Permissions | Scope Global Lookups | Microsoft SharePoint Online, called by the flow | Compose Lookups Role reaches Succeeded | Compose Lookups Role = Succeeded | output of Compose Lookups Role | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Lookups Permissions Array | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3061 | 16 | Compose Lookups Permissions Array | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Get Lookups Role Permissions reaches Succeeded | Get Lookups Role Permissions = Succeeded | output of Get Lookups Role Permissions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Lookups Routes Array | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3062 | 17 | Compose Lookups Routes Array | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Lookups Permissions Array reaches Succeeded | Compose Lookups Permissions Array = Succeeded | output of Get Lookups Role Permissions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Lookups Permitted | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3063 | 18 | Compose Lookups Permitted | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Lookups Routes Array reaches Succeeded | Compose Lookups Routes Array = Succeeded | output of Get Lookups Directory User<br>output of Get Lookups Role Permissions<br>output of Compose Lookups Routes Array<br>output of Compose Lookups Permissions Array | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose actual expressions Condition Lookups Authorised | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3064 | 19 | Condition Lookups Authorised | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose temp fix caller reaches Succeeded | Compose temp fix caller = Succeeded | output of Compose temp fix caller<br>output of Compose temp fix permtted | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_temp_fix_caller')",true]},{"equals":["@outputs('Compose_temp_fix_permtted')",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3065 | 20 | Get Lookup Users | Condition Lookups Authorised | Microsoft SharePoint Online, called by the flow | Entry of Condition Lookups Authorised | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Lookup Users | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3066 | 21 | Get Lookup Categories | Condition Lookups Authorised | Microsoft SharePoint Online, called by the flow | Entry of Condition Lookups Authorised | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Lookup Users | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3067 | 22 | Get Lookup Departments | Condition Lookups Authorised | Microsoft SharePoint Online, called by the flow | Entry of Condition Lookups Authorised | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Lookup Users | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3068 | 23 | Select Lookup Users | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Get Lookup Users reaches Succeeded; Get Lookup Categories reaches Succeeded; Get Lookup Departments reaches Succeeded | Get Lookup Users = Succeeded<br>Get Lookup Categories = Succeeded<br>Get Lookup Departments = Succeeded | output of Get Lookup Users | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Lookup Categories | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3069 | 24 | Select Lookup Categories | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Select Lookup Users reaches Succeeded | Select Lookup Users = Succeeded | output of Get Lookup Categories | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Lookup Departments | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3070 | 25 | Select Lookup Departments | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Select Lookup Categories reaches Succeeded | Select Lookup Categories = Succeeded | output of Get Lookup Departments | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Set Lookups Success Data | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3071 | 26 | Set Lookups Success Data | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Select Lookup Departments reaches Succeeded | Select Lookup Departments = Succeeded | output of Select Lookup Users<br>output of Select Lookup Categories<br>output of Select Lookup Departments | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Set Lookups Success Status | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3072 | 27 | Set Lookups Success Status | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | Set Lookups Success Data reaches Succeeded | Set Lookups Success Data = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3073 | 28 | Set Lookups Denied Data | Condition Lookups Authorised · else | Power Automate — IP_Reference_Data_Endpoint | Entry of Condition Lookups Authorised · else | None declared beyond entry into its container. | output of Compose Lookups Caller<br>output of Get Lookups Directory User | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Set Lookups Denied Status | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3074 | 29 | Set Lookups Denied Status | Condition Lookups Authorised · else | Power Automate — IP_Reference_Data_Endpoint | Set Lookups Denied Data reaches Succeeded | Set Lookups Denied Data = Succeeded | output of Compose Lookups Caller<br>output of Get Lookups Directory User | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append Lookups Denied Error | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3075 | 30 | Append Lookups Denied Error | Condition Lookups Authorised · else | Power Automate — IP_Reference_Data_Endpoint | Set Lookups Denied Status reaches Succeeded | Set Lookups Denied Status = Succeeded | output of Compose Lookups Caller<br>output of Get Lookups Directory User | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3076 | 31 | Compose temp fix permtted | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose actual expressions Condition Lookups Authorised reaches Succeeded | Compose actual expressions Condition Lookups Authorised = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose temp fix caller | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3077 | 32 | Compose temp fix caller | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose temp fix permtted reaches Succeeded | Compose temp fix permtted = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition Lookups Authorised | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3078 | 33 | Compose actual expressions Condition Lookups Authorised | Scope Global Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Lookups Permitted reaches Succeeded | Compose Lookups Permitted = Succeeded | output of Compose Lookups Caller<br>output of Compose Lookups Permitted | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose temp fix permtted | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3079 | 34 | Scope Catch Lookups | Scope Lookups Fetch | Power Automate — IP_Reference_Data_Endpoint | Scope Global Lookups reaches Failed or TimedOut | Scope Global Lookups = Failed\|TimedOut | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize Lookups (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3080 | 35 | Set Lookups Catch Status | Scope Catch Lookups | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Catch Lookups | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set Lookups Catch Data | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3081 | 36 | Set Lookups Catch Data | Scope Catch Lookups | Power Automate — IP_Reference_Data_Endpoint | Set Lookups Catch Status reaches Succeeded | Set Lookups Catch Status = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Append Lookups Catch Error | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3082 | 37 | Append Lookups Catch Error | Scope Catch Lookups | Power Automate — IP_Reference_Data_Endpoint | Set Lookups Catch Data reaches Succeeded | Set Lookups Catch Data = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3083 | 38 | Scope Finalize Lookups | Scope Lookups Fetch | Power Automate — IP_Reference_Data_Endpoint | Scope Global Lookups reaches Succeeded or Failed or TimedOut; Scope Catch Lookups reaches Succeeded or Skipped | Scope Global Lookups = Succeeded\|Failed\|TimedOut<br>Scope Catch Lookups = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3084 | 39 | Set Lookups CompletedAt | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Finalize Lookups | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set Lookups DurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3085 | 40 | Set Lookups DurationMs | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Set Lookups CompletedAt reaches Succeeded | Set Lookups CompletedAt = Succeeded | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Get Allowed Origins Lookups | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3086 | 41 | Get Allowed Origins Lookups | Scope Finalize Lookups | Microsoft SharePoint Online, called by the flow | Set Lookups DurationMs reaches Succeeded | Set Lookups DurationMs = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Allowed Origins Lookups (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3087 | 42 | Select Allowed Origins Lookups | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Get Allowed Origins Lookups reaches Succeeded or Failed or TimedOut | Get Allowed Origins Lookups = Succeeded\|Failed\|TimedOut | output of Get Allowed Origins Lookups | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin Lookups | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3088 | 43 | Compose Request Origin Lookups | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Select Allowed Origins Lookups reaches Succeeded | Select Allowed Origins Lookups = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin Lookups | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3089 | 44 | Compose Allowed Origin Lookups | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Request Origin Lookups reaches Succeeded | Compose Request Origin Lookups = Succeeded | output of Compose Request Origin Lookups<br>output of Select Allowed Origins Lookups | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Lookups Standard Response | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3090 | 45 | Compose Lookups Standard Response | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Allowed Origin Lookups reaches Succeeded | Compose Allowed Origin Lookups = Succeeded | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varData'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Lookups Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3091 | 46 | Compose Lookups Telemetry | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Compose Lookups Standard Response reaches Succeeded | Compose Lookups Standard Response = Succeeded | variable 'varRequestId'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Lookups Caller | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Lookups Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3092 | 47 | Create Lookups Telemetry | Scope Finalize Lookups | Microsoft SharePoint Online, called by the flow | Compose Lookups Telemetry reaches Succeeded | Compose Lookups Telemetry = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Lookups Telemetry | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Response Lookups (runs when this does not succeed) | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-088 |
| STEP-3093 | 48 | Response Lookups | Scope Finalize Lookups | Power Automate — IP_Reference_Data_Endpoint | Create Lookups Telemetry reaches Succeeded or Failed or TimedOut or Skipped | Create Lookups Telemetry = Succeeded\|Failed\|TimedOut\|Skipped | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Allowed Origin Lookups<br>output of Compose Lookups Standard Response | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCode') returned to the caller. | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3094 | 49 | Scope Flow Data Capture | Scope Global | Power Automate — IP_Reference_Data_Endpoint | Scope Lookups Fetch reaches Succeeded or TimedOut or Skipped or Failed | Scope Lookups Fetch = Succeeded\|TimedOut\|Skipped\|Failed | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3095 | 50 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3096 | 51 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Flow Definition | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3097 | 52 | Get Flow Definition | Scope Flow Data Capture | Microsoft Power Automate Management, called by the flow | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | — | Reads a workflow definition through the management connector. | — | Microsoft Power Automate Management returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Flow Run Record (runs when this does not succeed) | Microsoft Power Automate Management | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3098 | 53 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Get Flow Definition reaches Succeeded or Failed or Skipped or TimedOut | Get Flow Definition = Succeeded\|Failed\|Skipped\|TimedOut | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose Lookups Caller<br>output of Get Flow Definition | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record Schema | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-088 |
| STEP-3099 | 54 | Compose Flow Run Record Schema | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3100 | 55 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record Schema reaches Succeeded | Compose Flow Run Record Schema = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get item Flow Telemetry | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-088 |
| STEP-3101 | 56 | Get item Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Create Flow Telemetry reaches Succeeded | Create Flow Telemetry = Succeeded | output of Create Flow Telemetry | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Telemetry Attachments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3102 | 57 | Compose Telemetry Attachments | Scope Flow Data Capture | Power Automate — IP_Reference_Data_Endpoint | Get item Flow Telemetry reaches Succeeded | Get item Flow Telemetry = Succeeded | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Telemetry Email | — | — | — | — | — | Confirmed | No external validation required | SRC-088 |
| STEP-3103 | 58 | Send Telemetry Email | Scope Flow Data Capture | Microsoft Office 365 Outlook, called by the flow | Compose Telemetry Attachments reaches Succeeded | Compose Telemetry Attachments = Succeeded | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-088 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-237 | Condition Lookups Authorised | Power Automate — IP_Reference_Data_Endpoint | `{"and":[{"equals":["@outputs('Compose_temp_fix_caller')",true]},{"equals":["@outputs('Compose_temp_fix_permtted')",true]}]}` | output of Compose temp fix caller<br>output of Compose temp fix permtted | true<br>false | true → Get Lookup Users, Get Lookup Categories, Get Lookup Departments, Select Lookup Users, Select Lookup Categories, Select Lookup Departments, Set Lookups Success Data, Set Lookups Success Status<br>false → Set Lookups Denied Data, Set Lookups Denied Status, Append Lookups Denied Error | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Alternative end states | 6 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-3092 Create Lookups Telemetry<br>STEP-3100 Create Flow Telemetry |
| Notifications issued | NOTIF-202 Send Telemetry Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-414 | Recovery after Scope Global Lookups | Scope Global Lookups reaches Failed or TimedOut | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch Lookups. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-415 | Recovery after Scope Global Lookups, Scope Catch Lookups | Scope Global Lookups reaches Failed or TimedOut; Scope Catch Lookups reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Lookups. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-416 | Recovery after Get Allowed Origins Lookups | Get Allowed Origins Lookups reaches Failed or TimedOut | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Allowed Origins Lookups. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-417 | Recovery after Create Lookups Telemetry | Create Lookups Telemetry reaches Failed or TimedOut or Skipped | Returns the HTTP response to the caller and ends the request. | The caller receives HTTP @variables('varStatusCode'). | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Response Lookups. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-418 | Recovery after Scope Lookups Fetch | Scope Lookups Fetch reaches TimedOut or Skipped or Failed | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-419 | Recovery after Get Flow Definition | Get Flow Definition reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Flow Run Record. | Power Automate — IP_Reference_Data_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-3092 Create Lookups Telemetry | Writes a list item; the write itself is the audit record. |
| STEP-3100 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |
| STEP-3103 Send Telemetry Email | Sends a message; delivery is the record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
