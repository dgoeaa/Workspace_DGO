# PROC-032 — IP_Get_Docs_Endpoint

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-032 |
| Name | IP_Get_Docs_Endpoint |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 55 action(s) under 1 trigger(s). |
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
| Sources | `SRC-085` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_Get_Docs_Endpoint__28f6e62a-fea8-437c-a61a-47aec706c4e2__full_definition.json |

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
| STEP-2892 | Initialize GetDocs ReceivedAt | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2893 | Initialize GetDocs StartTicks | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2894 | Initialize GetDocs CompletedAt | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2895 | Initialize GetDocs DurationMs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2896 | Initialize GetDocs StatusCode | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2897 | Initialize GetDocs RequestId | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2898 | Initialize GetDocs Data | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2899 | Initialize GetDocs Errors | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2900 | Scope Global | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2901 | Scope GetDocs Data Processing | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2902 | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2903 | Compose GetDocs Caller | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2904 | Compose GetDocs Reference | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2905 | Get GetDocs Directory User | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2906 | Compose GetDocs Role | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2907 | Get GetDocs Role Permissions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2908 | Compose GetDocs Permissions Array | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2909 | Compose GetDocs Routes Array | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2910 | Compose GetDocs Permitted | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2911 | Condition GetDocs Authorised | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2912 | Get Docs Filtered | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2913 | Select GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2914 | Set GetDocs Success Data | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2915 | Set GetDocs Success Status | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2916 | Set GetDocs Denied Data | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2917 | Set GetDocs Denied Status | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2918 | Append GetDocs Denied Error | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2919 | Compose temp fix permtted | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2920 | Compose temp fix caller | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2921 | Compose actual condition expressions | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2922 | Scope Catch GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2923 | Set GetDocs Catch Status | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2924 | Set GetDocs Catch Data | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2925 | Append GetDocs Catch Error | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2926 | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2927 | Set GetDocs CompletedAt | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2928 | Set GetDocs DurationMs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2929 | Get Allowed Origins GetDocs | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2930 | Select Allowed Origins GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2931 | Compose Request Origin GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2932 | Compose Allowed Origin GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2933 | Compose GetDocs Standard Response | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2934 | Compose GetDocs Telemetry | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2935 | Create GetDocs Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2936 | Response GetDocs | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2937 | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2938 | Compose Redacted Queries | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2939 | Compose Redacted Headers | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2940 | Get Flow Definition | Microsoft Power Automate Management, called by the flow | Integration |
| STEP-2941 | Compose Flow Run Record | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2942 | Compose Flow Run Record Schema | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2943 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2944 | Get item Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2945 | Compose Telemetry Attachments | Power Automate — IP_Get_Docs_Endpoint | Automated |
| STEP-2946 | Send Telemetry Email | Microsoft Office 365 Outlook, called by the flow | Integration |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow 28f6e62a-fea8-437c-a61a-47aec706c4e2 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft Power Automate Management<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-2897 | trigger field 'payload'<br>trigger field 'requestId' |
| STEP-2903 | trigger field 'payload'<br>trigger field 'userEmail' |
| STEP-2904 | trigger field 'payload'<br>trigger field 'reference' |
| STEP-2905 | output of Compose GetDocs Caller |
| STEP-2906 | output of Get GetDocs Directory User |
| STEP-2907 | output of Compose GetDocs Role |
| STEP-2908 | output of Get GetDocs Role Permissions |
| STEP-2909 | output of Get GetDocs Role Permissions |
| STEP-2910 | output of Get GetDocs Directory User<br>output of Get GetDocs Role Permissions<br>output of Compose GetDocs Routes Array<br>output of Compose GetDocs Permissions Array |
| STEP-2911 | output of Compose temp fix caller<br>output of Compose temp fix permtted |
| STEP-2912 | output of Compose GetDocs Reference |
| STEP-2913 | output of Get Docs Filtered |
| STEP-2914 | output of Compose GetDocs Reference<br>output of Select GetDocs |
| STEP-2916 | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User |
| STEP-2917 | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User |
| STEP-2918 | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User |
| STEP-2921 | output of Compose GetDocs Permitted<br>output of Compose GetDocs Caller |
| STEP-2928 | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' |
| STEP-2930 | output of Get Allowed Origins GetDocs |
| STEP-2932 | output of Compose Request Origin GetDocs<br>output of Select Allowed Origins GetDocs |
| STEP-2933 | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varData'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose GetDocs Reference |
| STEP-2934 | variable 'varRequestId'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose GetDocs Caller<br>output of Compose GetDocs Reference |
| STEP-2935 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose GetDocs Telemetry |
| STEP-2936 | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Allowed Origin GetDocs<br>output of Compose GetDocs Standard Response |
| STEP-2941 | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose GetDocs Caller<br>output of Get Flow Definition |
| STEP-2943 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |
| STEP-2944 | output of Create Flow Telemetry |
| STEP-2945 | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry |
| STEP-2946 | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments |

## 5.5 Stages and activities

55 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-2892 | 1 | Initialize GetDocs ReceivedAt | flow root | Power Automate — IP_Get_Docs_Endpoint | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs StartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2893 | 2 | Initialize GetDocs StartTicks | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs ReceivedAt reaches Succeeded | Initialize GetDocs ReceivedAt = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs CompletedAt | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2894 | 3 | Initialize GetDocs CompletedAt | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs StartTicks reaches Succeeded | Initialize GetDocs StartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs DurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2895 | 4 | Initialize GetDocs DurationMs | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs CompletedAt reaches Succeeded | Initialize GetDocs CompletedAt = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs StatusCode | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2896 | 5 | Initialize GetDocs StatusCode | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs DurationMs reaches Succeeded | Initialize GetDocs DurationMs = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs RequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2897 | 6 | Initialize GetDocs RequestId | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs StatusCode reaches Succeeded | Initialize GetDocs StatusCode = Succeeded | trigger field 'payload'<br>trigger field 'requestId' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs Data | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2898 | 7 | Initialize GetDocs Data | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs RequestId reaches Succeeded | Initialize GetDocs RequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize GetDocs Errors | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2899 | 8 | Initialize GetDocs Errors | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs Data reaches Succeeded | Initialize GetDocs Data = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Global | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2900 | 9 | Scope Global | flow root | Power Automate — IP_Get_Docs_Endpoint | Initialize GetDocs Errors reaches Succeeded | Initialize GetDocs Errors = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2901 | 10 | Scope GetDocs Data Processing | Scope Global | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope Global | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2902 | 11 | Scope Global GetDocs | Scope GetDocs Data Processing | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope GetDocs Data Processing | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch GetDocs (runs when this does not succeed)<br>Scope Finalize GetDocs (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2903 | 12 | Compose GetDocs Caller | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope Global GetDocs | None declared beyond entry into its container. | trigger field 'payload'<br>trigger field 'userEmail' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose GetDocs Reference | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2904 | 13 | Compose GetDocs Reference | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose GetDocs Caller reaches Succeeded | Compose GetDocs Caller = Succeeded | trigger field 'payload'<br>trigger field 'reference' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get GetDocs Directory User | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2905 | 14 | Get GetDocs Directory User | Scope Global GetDocs | Microsoft SharePoint Online, called by the flow | Compose GetDocs Reference reaches Succeeded | Compose GetDocs Reference = Succeeded | output of Compose GetDocs Caller | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose GetDocs Role | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2906 | 15 | Compose GetDocs Role | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Get GetDocs Directory User reaches Succeeded | Get GetDocs Directory User = Succeeded | output of Get GetDocs Directory User | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get GetDocs Role Permissions | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2907 | 16 | Get GetDocs Role Permissions | Scope Global GetDocs | Microsoft SharePoint Online, called by the flow | Compose GetDocs Role reaches Succeeded | Compose GetDocs Role = Succeeded | output of Compose GetDocs Role | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose GetDocs Permissions Array | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2908 | 17 | Compose GetDocs Permissions Array | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Get GetDocs Role Permissions reaches Succeeded | Get GetDocs Role Permissions = Succeeded | output of Get GetDocs Role Permissions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose GetDocs Routes Array | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2909 | 18 | Compose GetDocs Routes Array | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose GetDocs Permissions Array reaches Succeeded | Compose GetDocs Permissions Array = Succeeded | output of Get GetDocs Role Permissions | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose GetDocs Permitted | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2910 | 19 | Compose GetDocs Permitted | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose GetDocs Routes Array reaches Succeeded | Compose GetDocs Routes Array = Succeeded | output of Get GetDocs Directory User<br>output of Get GetDocs Role Permissions<br>output of Compose GetDocs Routes Array<br>output of Compose GetDocs Permissions Array | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose actual condition expressions | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2911 | 20 | Condition GetDocs Authorised | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose temp fix caller reaches Succeeded | Compose temp fix caller = Succeeded | output of Compose temp fix caller<br>output of Compose temp fix permtted | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_temp_fix_caller')",true]},{"equals":["@outputs('Compose_temp_fix_permtted')",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2912 | 21 | Get Docs Filtered | Condition GetDocs Authorised | Microsoft SharePoint Online, called by the flow | Entry of Condition GetDocs Authorised | None declared beyond entry into its container. | output of Compose GetDocs Reference | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select GetDocs | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2913 | 22 | Select GetDocs | Condition GetDocs Authorised | Power Automate — IP_Get_Docs_Endpoint | Get Docs Filtered reaches Succeeded | Get Docs Filtered = Succeeded | output of Get Docs Filtered | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Set GetDocs Success Data | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2914 | 23 | Set GetDocs Success Data | Condition GetDocs Authorised | Power Automate — IP_Get_Docs_Endpoint | Select GetDocs reaches Succeeded | Select GetDocs = Succeeded | output of Compose GetDocs Reference<br>output of Select GetDocs | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Set GetDocs Success Status | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2915 | 24 | Set GetDocs Success Status | Condition GetDocs Authorised | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs Success Data reaches Succeeded | Set GetDocs Success Data = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2916 | 25 | Set GetDocs Denied Data | Condition GetDocs Authorised · else | Power Automate — IP_Get_Docs_Endpoint | Entry of Condition GetDocs Authorised · else | None declared beyond entry into its container. | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Set GetDocs Denied Status | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2917 | 26 | Set GetDocs Denied Status | Condition GetDocs Authorised · else | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs Denied Data reaches Succeeded | Set GetDocs Denied Data = Succeeded | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append GetDocs Denied Error | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2918 | 27 | Append GetDocs Denied Error | Condition GetDocs Authorised · else | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs Denied Status reaches Succeeded | Set GetDocs Denied Status = Succeeded | output of Compose GetDocs Caller<br>output of Get GetDocs Directory User | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2919 | 28 | Compose temp fix permtted | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose actual condition expressions reaches Succeeded | Compose actual condition expressions = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose temp fix caller | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2920 | 29 | Compose temp fix caller | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose temp fix permtted reaches Succeeded | Compose temp fix permtted = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition GetDocs Authorised | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2921 | 30 | Compose actual condition expressions | Scope Global GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose GetDocs Permitted reaches Succeeded | Compose GetDocs Permitted = Succeeded | output of Compose GetDocs Permitted<br>output of Compose GetDocs Caller | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose temp fix permtted | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2922 | 31 | Scope Catch GetDocs | Scope GetDocs Data Processing | Power Automate — IP_Get_Docs_Endpoint | Scope Global GetDocs reaches Failed or TimedOut | Scope Global GetDocs = Failed\|TimedOut | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize GetDocs (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2923 | 32 | Set GetDocs Catch Status | Scope Catch GetDocs | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope Catch GetDocs | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set GetDocs Catch Data | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2924 | 33 | Set GetDocs Catch Data | Scope Catch GetDocs | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs Catch Status reaches Succeeded | Set GetDocs Catch Status = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | Append GetDocs Catch Error | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2925 | 34 | Append GetDocs Catch Error | Scope Catch GetDocs | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs Catch Data reaches Succeeded | Set GetDocs Catch Data = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2926 | 35 | Scope Finalize GetDocs | Scope GetDocs Data Processing | Power Automate — IP_Get_Docs_Endpoint | Scope Global GetDocs reaches Succeeded or Failed or TimedOut; Scope Catch GetDocs reaches Succeeded or Skipped | Scope Global GetDocs = Succeeded\|Failed\|TimedOut<br>Scope Catch GetDocs = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2927 | 36 | Set GetDocs CompletedAt | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope Finalize GetDocs | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set GetDocs DurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2928 | 37 | Set GetDocs DurationMs | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Set GetDocs CompletedAt reaches Succeeded | Set GetDocs CompletedAt = Succeeded | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Get Allowed Origins GetDocs | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2929 | 38 | Get Allowed Origins GetDocs | Scope Finalize GetDocs | Microsoft SharePoint Online, called by the flow | Set GetDocs DurationMs reaches Succeeded | Set GetDocs DurationMs = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Allowed Origins GetDocs (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2930 | 39 | Select Allowed Origins GetDocs | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Get Allowed Origins GetDocs reaches Succeeded or Failed or TimedOut | Get Allowed Origins GetDocs = Succeeded\|Failed\|TimedOut | output of Get Allowed Origins GetDocs | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin GetDocs | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2931 | 40 | Compose Request Origin GetDocs | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Select Allowed Origins GetDocs reaches Succeeded | Select Allowed Origins GetDocs = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin GetDocs | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2932 | 41 | Compose Allowed Origin GetDocs | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose Request Origin GetDocs reaches Succeeded | Compose Request Origin GetDocs = Succeeded | output of Compose Request Origin GetDocs<br>output of Select Allowed Origins GetDocs | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose GetDocs Standard Response | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2933 | 42 | Compose GetDocs Standard Response | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose Allowed Origin GetDocs reaches Succeeded | Compose Allowed Origin GetDocs = Succeeded | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varData'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose GetDocs Reference | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose GetDocs Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2934 | 43 | Compose GetDocs Telemetry | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Compose GetDocs Standard Response reaches Succeeded | Compose GetDocs Standard Response = Succeeded | variable 'varRequestId'<br>variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose GetDocs Caller<br>output of Compose GetDocs Reference | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create GetDocs Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2935 | 44 | Create GetDocs Telemetry | Scope Finalize GetDocs | Microsoft SharePoint Online, called by the flow | Compose GetDocs Telemetry reaches Succeeded | Compose GetDocs Telemetry = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose GetDocs Telemetry | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Response GetDocs (runs when this does not succeed) | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-085 |
| STEP-2936 | 45 | Response GetDocs | Scope Finalize GetDocs | Power Automate — IP_Get_Docs_Endpoint | Create GetDocs Telemetry reaches Succeeded or Failed or TimedOut or Skipped | Create GetDocs Telemetry = Succeeded\|Failed\|TimedOut\|Skipped | variable 'varStatusCode'<br>variable 'varRequestId'<br>output of Compose Allowed Origin GetDocs<br>output of Compose GetDocs Standard Response | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCode') returned to the caller. | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2937 | 46 | Scope Flow Data Capture | Scope Global | Power Automate — IP_Get_Docs_Endpoint | Scope GetDocs Data Processing reaches Succeeded or TimedOut or Skipped or Failed | Scope GetDocs Data Processing = Succeeded\|TimedOut\|Skipped\|Failed | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2938 | 47 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2939 | 48 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Flow Definition | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2940 | 49 | Get Flow Definition | Scope Flow Data Capture | Microsoft Power Automate Management, called by the flow | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | — | Reads a workflow definition through the management connector. | — | Microsoft Power Automate Management returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Flow Run Record (runs when this does not succeed) | Microsoft Power Automate Management | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2941 | 50 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Get Flow Definition reaches Succeeded or Failed or Skipped or TimedOut | Get Flow Definition = Succeeded\|Failed\|Skipped\|TimedOut | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose GetDocs Caller<br>output of Get Flow Definition | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record Schema | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-085 |
| STEP-2942 | 51 | Compose Flow Run Record Schema | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2943 | 52 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record Schema reaches Succeeded | Compose Flow Run Record Schema = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get item Flow Telemetry | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-085 |
| STEP-2944 | 53 | Get item Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Create Flow Telemetry reaches Succeeded | Create Flow Telemetry = Succeeded | output of Create Flow Telemetry | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Telemetry Attachments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2945 | 54 | Compose Telemetry Attachments | Scope Flow Data Capture | Power Automate — IP_Get_Docs_Endpoint | Get item Flow Telemetry reaches Succeeded | Get item Flow Telemetry = Succeeded | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Telemetry Email | — | — | — | — | — | Confirmed | No external validation required | SRC-085 |
| STEP-2946 | 55 | Send Telemetry Email | Scope Flow Data Capture | Microsoft Office 365 Outlook, called by the flow | Compose Telemetry Attachments reaches Succeeded | Compose Telemetry Attachments = Succeeded | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-085 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-231 | Condition GetDocs Authorised | Power Automate — IP_Get_Docs_Endpoint | `{"and":[{"equals":["@outputs('Compose_temp_fix_caller')",true]},{"equals":["@outputs('Compose_temp_fix_permtted')",true]}]}` | output of Compose temp fix caller<br>output of Compose temp fix permtted | true<br>false | true → Get Docs Filtered, Select GetDocs, Set GetDocs Success Data, Set GetDocs Success Status<br>false → Set GetDocs Denied Data, Set GetDocs Denied Status, Append GetDocs Denied Error | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

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
| Records created or updated | STEP-2935 Create GetDocs Telemetry<br>STEP-2943 Create Flow Telemetry |
| Notifications issued | NOTIF-199 Send Telemetry Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-400 | Recovery after Scope Global GetDocs | Scope Global GetDocs reaches Failed or TimedOut | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch GetDocs. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-401 | Recovery after Scope Global GetDocs, Scope Catch GetDocs | Scope Global GetDocs reaches Failed or TimedOut; Scope Catch GetDocs reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize GetDocs. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-402 | Recovery after Get Allowed Origins GetDocs | Get Allowed Origins GetDocs reaches Failed or TimedOut | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Allowed Origins GetDocs. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-403 | Recovery after Create GetDocs Telemetry | Create GetDocs Telemetry reaches Failed or TimedOut or Skipped | Returns the HTTP response to the caller and ends the request. | The caller receives HTTP @variables('varStatusCode'). | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Response GetDocs. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-404 | Recovery after Scope GetDocs Data Processing | Scope GetDocs Data Processing reaches TimedOut or Skipped or Failed | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-405 | Recovery after Get Flow Definition | Get Flow Definition reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Flow Run Record. | Power Automate — IP_Get_Docs_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-2935 Create GetDocs Telemetry | Writes a list item; the write itself is the audit record. |
| STEP-2943 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |
| STEP-2946 Send Telemetry Email | Sends a message; delivery is the record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
