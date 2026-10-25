# PROC-031 — IP_FETCH_ALL_BOOTSTRAP

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-031 |
| Name | IP_FETCH_ALL_BOOTSTRAP |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 62 action(s) under 1 trigger(s). |
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
| Sources | `SRC-084` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/IP_FETCH_ALL_BOOTSTRAP__b79e6707-df4d-4ae7-8a65-738aa45e9a73__full_definition.json |

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
| STEP-2830 | Initialize variable varStatusCode | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2831 | Initialize variable varData | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2832 | Initialize variable varErrors | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2833 | Initialize variable varRequestId | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2834 | Initialize variable varStartTicks | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2835 | Initialize variable varReceivedAtUtc | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2836 | Initialize variable varCompletedAtUtc | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2837 | Initialize variable varDurationMs | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2838 | Scope | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2839 | Scope Global FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2840 | Scope FetchAll Data Processing | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2841 | Compose FetchAll Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2842 | Get FetchAll Directory User | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2843 | Compose FetchAll Role | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2844 | Get FetchAll Role Permissions | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2845 | Compose FetchAll Permitted | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2846 | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2847 | Get All Docs | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2848 | Get All Tasks | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2849 | Get All Users | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2850 | Get All Categories | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2851 | Get All Departments | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2852 | Get All Comments | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2853 | Select Docs | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2854 | Select Tasks | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2855 | Select Users | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2856 | Select Categories | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2857 | Select Departments | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2858 | Select Comments | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2859 | Set variable varStatusCode FetchAll 200 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2860 | Set variable varData FetchAll Success | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2861 | Condition FetchAll Known Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2862 | Set variable varStatusCode FetchAll 403 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2863 | Append to array variable varErrors FetchAll Denied 403 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2864 | Set variable varData FetchAll Denied 403 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2865 | Set variable varStatusCode FetchAll 401 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2866 | Append to array variable varErrors FetchAll Denied 401 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2867 | Set variable varData FetchAll Denied 401 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2868 | Scope Catch FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2869 | Set variable varStatusCode FetchAll 500 | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2870 | Append to array variable varErrors FetchAll Catch | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2871 | Set variable varData FetchAll Catch | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2872 | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2873 | Set variable varCompletedAtUtc FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2874 | Set variable varDurationMs FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2875 | Compose  Standard Response Revised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2876 | Compose Response Body | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2877 | Get Allowed Origins FetchAll | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2878 | Select Allowed Origins FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2879 | Compose Request Origin FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2880 | Compose Allowed Origin FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2881 | Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2882 | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2883 | Compose Redacted Queries | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2884 | Compose Redacted Headers | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2885 | Get Flow Definition | Microsoft Power Automate Management, called by the flow | Integration |
| STEP-2886 | Compose Flow Run Record | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2887 | Compose Flow Run Record Schema | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2888 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2889 | Get item Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-2890 | Compose Telemetry Attachments | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Automated |
| STEP-2891 | Send Telemetry Email | Microsoft Office 365 Outlook, called by the flow | Integration |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow b79e6707-df4d-4ae7-8a65-738aa45e9a73 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft Power Automate Management<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-2833 | trigger field 'requestId'<br>trigger field 'request_id' |
| STEP-2841 | trigger field 'payload'<br>trigger field 'userEmail' |
| STEP-2842 | output of Compose FetchAll Caller |
| STEP-2843 | output of Get FetchAll Directory User |
| STEP-2844 | output of Compose FetchAll Role |
| STEP-2846 | output of Compose FetchAll Permitted<br>output of Get FetchAll Directory User<br>output of Get FetchAll Role Permissions |
| STEP-2853 | output of Get All Docs |
| STEP-2854 | output of Get All Tasks |
| STEP-2855 | output of Get All Users |
| STEP-2856 | output of Get All Categories |
| STEP-2857 | output of Get All Departments |
| STEP-2858 | output of Get All Comments |
| STEP-2860 | output of Select Docs<br>output of Select Tasks<br>output of Select Users<br>output of Select Categories<br>output of Select Departments<br>output of Select Comments |
| STEP-2861 | output of Get FetchAll Directory User |
| STEP-2874 | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' |
| STEP-2875 | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-2876 | output of Compose  Standard Response Revised |
| STEP-2878 | output of Get Allowed Origins FetchAll |
| STEP-2880 | output of Select Allowed Origins FetchAll<br>output of Compose Request Origin FetchAll |
| STEP-2881 | variable 'varStatusCode'<br>output of Compose Allowed Origin FetchAll<br>output of Compose Response Body |
| STEP-2886 | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose FetchAll Caller<br>output of Get Flow Definition |
| STEP-2888 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |
| STEP-2889 | output of Create Flow Telemetry |
| STEP-2890 | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry |
| STEP-2891 | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments |

## 5.5 Stages and activities

62 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-2830 | 1 | Initialize variable varStatusCode | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varData | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2831 | 2 | Initialize variable varData | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varStatusCode reaches Succeeded | Initialize variable varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2832 | 3 | Initialize variable varErrors | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varData reaches Succeeded | Initialize variable varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2833 | 4 | Initialize variable varRequestId | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varErrors reaches Succeeded | Initialize variable varErrors = Succeeded | trigger field 'requestId'<br>trigger field 'request_id' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2834 | 5 | Initialize variable varStartTicks | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varRequestId reaches Succeeded | Initialize variable varRequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varReceivedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2835 | 6 | Initialize variable varReceivedAtUtc | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varStartTicks reaches Succeeded | Initialize variable varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2836 | 7 | Initialize variable varCompletedAtUtc | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varReceivedAtUtc reaches Succeeded | Initialize variable varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2837 | 8 | Initialize variable varDurationMs | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varCompletedAtUtc reaches Succeeded | Initialize variable varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2838 | 9 | Scope | flow root | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Initialize variable varDurationMs reaches Succeeded | Initialize variable varDurationMs = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2839 | 10 | Scope Global FetchAll | Scope | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Scope Flow Data Capture | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2840 | 11 | Scope FetchAll Data Processing | Scope Global FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope Global FetchAll | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch FetchAll (runs when this does not succeed)<br>Scope Finalize Response FetchAll (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2841 | 12 | Compose FetchAll Caller | Scope FetchAll Data Processing | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope FetchAll Data Processing | None declared beyond entry into its container. | trigger field 'payload'<br>trigger field 'userEmail' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get FetchAll Directory User | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2842 | 13 | Get FetchAll Directory User | Scope FetchAll Data Processing | Microsoft SharePoint Online, called by the flow | Compose FetchAll Caller reaches Succeeded | Compose FetchAll Caller = Succeeded | output of Compose FetchAll Caller | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose FetchAll Role | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2843 | 14 | Compose FetchAll Role | Scope FetchAll Data Processing | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get FetchAll Directory User reaches Succeeded | Get FetchAll Directory User = Succeeded | output of Get FetchAll Directory User | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get FetchAll Role Permissions | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2844 | 15 | Get FetchAll Role Permissions | Scope FetchAll Data Processing | Microsoft SharePoint Online, called by the flow | Compose FetchAll Role reaches Succeeded | Compose FetchAll Role = Succeeded | output of Compose FetchAll Role | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose FetchAll Permitted | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2845 | 16 | Compose FetchAll Permitted | Scope FetchAll Data Processing | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get FetchAll Role Permissions reaches Succeeded | Get FetchAll Role Permissions = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition FetchAll Authorised | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2846 | 17 | Condition FetchAll Authorised | Scope FetchAll Data Processing | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose FetchAll Permitted reaches Succeeded | Compose FetchAll Permitted = Succeeded | output of Compose FetchAll Permitted<br>output of Get FetchAll Directory User<br>output of Get FetchAll Role Permissions | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_FetchAll_Permitted')","@and(greater(length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]'))),0),or(contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['AllowedRoutesJson'],'')),'\"*\"'),contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['PermissionsJ | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2847 | 18 | Get All Docs | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Entry of Condition FetchAll Authorised | None declared beyond entry into its container. | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get All Tasks | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2848 | 19 | Get All Tasks | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Get All Docs reaches Succeeded | Get All Docs = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get All Users | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2849 | 20 | Get All Users | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Get All Tasks reaches Succeeded | Get All Tasks = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get All Categories | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2850 | 21 | Get All Categories | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Get All Users reaches Succeeded | Get All Users = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get All Departments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2851 | 22 | Get All Departments | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Get All Categories reaches Succeeded | Get All Categories = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get All Comments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2852 | 23 | Get All Comments | Condition FetchAll Authorised | Microsoft SharePoint Online, called by the flow | Get All Departments reaches Succeeded | Get All Departments = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Select Docs | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2853 | 24 | Select Docs | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get All Comments reaches Succeeded | Get All Comments = Succeeded | output of Get All Docs | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Tasks | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2854 | 25 | Select Tasks | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Docs reaches Succeeded | Select Docs = Succeeded | output of Get All Tasks | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Users | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2855 | 26 | Select Users | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Tasks reaches Succeeded | Select Tasks = Succeeded | output of Get All Users | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Categories | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2856 | 27 | Select Categories | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Users reaches Succeeded | Select Users = Succeeded | output of Get All Categories | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Departments | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2857 | 28 | Select Departments | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Categories reaches Succeeded | Select Categories = Succeeded | output of Get All Departments | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Comments | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2858 | 29 | Select Comments | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Departments reaches Succeeded | Select Departments = Succeeded | output of Get All Comments | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Set variable varStatusCode FetchAll 200 | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2859 | 30 | Set variable varStatusCode FetchAll 200 | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Comments reaches Succeeded | Select Comments = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData FetchAll Success | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2860 | 31 | Set variable varData FetchAll Success | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varStatusCode FetchAll 200 reaches Succeeded | Set variable varStatusCode FetchAll 200 = Succeeded | output of Select Docs<br>output of Select Tasks<br>output of Select Users<br>output of Select Categories<br>output of Select Departments<br>output of Select Comments | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2861 | 32 | Condition FetchAll Known Caller | Condition FetchAll Authorised · else | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Condition FetchAll Authorised · else | None declared beyond entry into its container. | output of Get FetchAll Directory User | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2862 | 33 | Set variable varStatusCode FetchAll 403 | Condition FetchAll Known Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Condition FetchAll Known Caller | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to array variable varErrors FetchAll Denied 403 | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2863 | 34 | Append to array variable varErrors FetchAll Denied 403 | Condition FetchAll Known Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varStatusCode FetchAll 403 reaches Succeeded | Set variable varStatusCode FetchAll 403 = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | Set variable varData FetchAll Denied 403 | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2864 | 35 | Set variable varData FetchAll Denied 403 | Condition FetchAll Known Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Append to array variable varErrors FetchAll Denied 403 reaches Succeeded | Append to array variable varErrors FetchAll Denied 403 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2865 | 36 | Set variable varStatusCode FetchAll 401 | Condition FetchAll Known Caller · else | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Condition FetchAll Known Caller · else | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to array variable varErrors FetchAll Denied 401 | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2866 | 37 | Append to array variable varErrors FetchAll Denied 401 | Condition FetchAll Known Caller · else | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varStatusCode FetchAll 401 reaches Succeeded | Set variable varStatusCode FetchAll 401 = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | Set variable varData FetchAll Denied 401 | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2867 | 38 | Set variable varData FetchAll Denied 401 | Condition FetchAll Known Caller · else | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Append to array variable varErrors FetchAll Denied 401 reaches Succeeded | Append to array variable varErrors FetchAll Denied 401 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2868 | 39 | Scope Catch FetchAll | Scope Global FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Scope FetchAll Data Processing reaches Failed or TimedOut or Skipped | Scope FetchAll Data Processing = Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize Response FetchAll (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-084 |
| STEP-2869 | 40 | Set variable varStatusCode FetchAll 500 | Scope Catch FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope Catch FetchAll | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to array variable varErrors FetchAll Catch | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2870 | 41 | Append to array variable varErrors FetchAll Catch | Scope Catch FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varStatusCode FetchAll 500 reaches Succeeded | Set variable varStatusCode FetchAll 500 = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | Set variable varData FetchAll Catch | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2871 | 42 | Set variable varData FetchAll Catch | Scope Catch FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Append to array variable varErrors FetchAll Catch reaches Succeeded | Append to array variable varErrors FetchAll Catch = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2872 | 43 | Scope Finalize Response FetchAll | Scope Global FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Scope FetchAll Data Processing reaches Succeeded or Failed or TimedOut or Skipped; Scope Catch FetchAll reaches Succeeded or Skipped | Scope FetchAll Data Processing = Succeeded\|Failed\|TimedOut\|Skipped<br>Scope Catch FetchAll = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-084 |
| STEP-2873 | 44 | Set variable varCompletedAtUtc FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope Finalize Response FetchAll | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set variable varDurationMs FetchAll | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2874 | 45 | Set variable varDurationMs FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varCompletedAtUtc FetchAll reaches Succeeded | Set variable varCompletedAtUtc FetchAll = Succeeded | variable 'varCompletedAtUtc'<br>variable 'varStartTicks' | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Compose  Standard Response Revised | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2875 | 46 | Compose  Standard Response Revised | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Set variable varDurationMs FetchAll reaches Succeeded | Set variable varDurationMs FetchAll = Succeeded | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Response Body | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2876 | 47 | Compose Response Body | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose  Standard Response Revised reaches Succeeded | Compose  Standard Response Revised = Succeeded | output of Compose  Standard Response Revised | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Allowed Origins FetchAll | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2877 | 48 | Get Allowed Origins FetchAll | Scope Finalize Response FetchAll | Microsoft SharePoint Online, called by the flow | Compose Response Body reaches Succeeded | Compose Response Body = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Allowed Origins FetchAll (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2878 | 49 | Select Allowed Origins FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get Allowed Origins FetchAll reaches Succeeded or Failed or TimedOut or Skipped | Get Allowed Origins FetchAll = Succeeded\|Failed\|TimedOut\|Skipped | output of Get Allowed Origins FetchAll | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin FetchAll | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-084 |
| STEP-2879 | 50 | Compose Request Origin FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Select Allowed Origins FetchAll reaches Succeeded | Select Allowed Origins FetchAll = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin FetchAll | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2880 | 51 | Compose Allowed Origin FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose Request Origin FetchAll reaches Succeeded | Compose Request Origin FetchAll = Succeeded | output of Select Allowed Origins FetchAll<br>output of Compose Request Origin FetchAll | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response FetchAll | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2881 | 52 | Response FetchAll | Scope Finalize Response FetchAll | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose Allowed Origin FetchAll reaches Succeeded | Compose Allowed Origin FetchAll = Succeeded | variable 'varStatusCode'<br>output of Compose Allowed Origin FetchAll<br>output of Compose Response Body | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCode') returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2882 | 53 | Scope Flow Data Capture | Scope | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Scope Global FetchAll reaches Succeeded | Scope Global FetchAll = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2883 | 54 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2884 | 55 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Flow Definition | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2885 | 56 | Get Flow Definition | Scope Flow Data Capture | Microsoft Power Automate Management, called by the flow | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | — | Reads a workflow definition through the management connector. | — | Microsoft Power Automate Management returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Flow Run Record (runs when this does not succeed) | Microsoft Power Automate Management | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2886 | 57 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get Flow Definition reaches Succeeded or Failed or Skipped or TimedOut | Get Flow Definition = Succeeded\|Failed\|Skipped\|TimedOut | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose FetchAll Caller<br>output of Get Flow Definition | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record Schema | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-084 |
| STEP-2887 | 58 | Compose Flow Run Record Schema | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2888 | 59 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record Schema reaches Succeeded | Compose Flow Run Record Schema = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get item Flow Telemetry | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-084 |
| STEP-2889 | 60 | Get item Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Create Flow Telemetry reaches Succeeded | Create Flow Telemetry = Succeeded | output of Create Flow Telemetry | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Compose Telemetry Attachments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2890 | 61 | Compose Telemetry Attachments | Scope Flow Data Capture | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Get item Flow Telemetry reaches Succeeded | Get item Flow Telemetry = Succeeded | output of Compose Flow Run Record<br>output of Compose Flow Run Record Schema<br>output of Get Flow Definition<br>output of Get item Flow Telemetry | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Telemetry Email | — | — | — | — | — | Confirmed | No external validation required | SRC-084 |
| STEP-2891 | 62 | Send Telemetry Email | Scope Flow Data Capture | Microsoft Office 365 Outlook, called by the flow | Compose Telemetry Attachments reaches Succeeded | Compose Telemetry Attachments = Succeeded | variable 'varStatusCode'<br>variable 'varDurationMs'<br>output of Compose Telemetry Attachments | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-084 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-229 | Condition FetchAll Authorised | Power Automate — IP_FETCH_ALL_BOOTSTRAP | `{"and":[{"equals":["@outputs('Compose_FetchAll_Permitted')","@and(greater(length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]'))),0),or(contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['AllowedRoutesJson'],'')),'\"*\"'),contains(string(coalesce(first(outputs('Get_FetchAll_Role_Permissions')?['body/value'])?['PermissionsJson'],'')),'user:view')))"]}]}` | output of Compose FetchAll Permitted<br>output of Get FetchAll Directory User<br>output of Get FetchAll Role Permissions | true<br>false | true → Get All Docs, Get All Tasks, Get All Users, Get All Categories, Get All Departments, Get All Comments, Select Docs, Select Tasks, Select Users, Select Categories, Select Departments, Select Comments, Set variable varStatusCode FetchAll 200, Set variable varData FetchAll Success<br>false → Condition FetchAll Known Caller | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-230 | Condition FetchAll Known Caller | Power Automate — IP_FETCH_ALL_BOOTSTRAP | `{"and":[{"greater":["@length(coalesce(outputs('Get_FetchAll_Directory_User')?['body/value'],json('[]')))",0]}]}` | output of Get FetchAll Directory User | true<br>false | true → Set variable varStatusCode FetchAll 403, Append to array variable varErrors FetchAll Denied 403, Set variable varData FetchAll Denied 403<br>false → Set variable varStatusCode FetchAll 401, Append to array variable varErrors FetchAll Denied 401, Set variable varData FetchAll Denied 401 | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes @variables('varStatusCode'). |
| Alternative end states | 4 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-2888 Create Flow Telemetry |
| Notifications issued | NOTIF-198 Send Telemetry Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-396 | Recovery after Scope FetchAll Data Processing | Scope FetchAll Data Processing reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch FetchAll. | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-397 | Recovery after Scope FetchAll Data Processing, Scope Catch FetchAll | Scope FetchAll Data Processing reaches Failed or TimedOut or Skipped; Scope Catch FetchAll reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Response FetchAll. | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-398 | Recovery after Get Allowed Origins FetchAll | Get Allowed Origins FetchAll reaches Failed or TimedOut or Skipped | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Allowed Origins FetchAll. | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-399 | Recovery after Get Flow Definition | Get Flow Definition reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Flow Run Record. | Power Automate — IP_FETCH_ALL_BOOTSTRAP | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-2888 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |
| STEP-2891 Send Telemetry Email | Sends a message; delivery is the record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
