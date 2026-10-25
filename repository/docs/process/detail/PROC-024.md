# PROC-024 — CG_Upload_Endpoint

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-024 |
| Name | CG_Upload_Endpoint |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 57 action(s) under 1 trigger(s). |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. No supplied artifact states what this workflow is for in business terms; its name and its actions are all the export carries. |
| Operational objective | Reads from and writes to Microsoft SharePoint Online. |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Flow estate |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Every action, run-after condition, branch and connector call is CONFIRMED from the tenant export and catalogued step by step. What the workflow is FOR, who owns it and how critical it is are NOT evidenced: no supplied artifact states them. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-077` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/CG_Upload_Endpoint__df82e331-b800-4a8d-996e-d2b2ca846c77__full_definition.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate<br>Microsoft SharePoint Online |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-1204 | Initialize variable varStatusCode | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1205 | Initialize variable varData | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1206 | Initialize variable varErrors | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1207 | Initialize variable varRequestId | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1208 | Initialize variable varStartTicks | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1209 | Initialize variable varReceivedAtUtc | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1210 | Initialize variable varCompletedAtUtc | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1211 | Initialize variable varDurationMs | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1212 | Scope Upload Flow | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1213 | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1214 | Compose Upload Ticket | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1215 | Compose Upload SourceIp | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1216 | Compose Upload Content Length | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1217 | Compose Bucket Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1218 | Get Rate Limit Upload | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1219 | Condition Rate Limit Upload Exists | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1220 | Update Rate Limit Upload | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1221 | Create Rate Limit Upload | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1222 | Compose Rate Limited Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1223 | Condition Upload Gate | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1224 | Set variable varStatusCode Upload 429 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1225 | Set variable varData Upload RateLimited | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1226 | Condition Upload Ticket Present | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1227 | Set variable varStatusCode Upload 401 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1228 | Set variable varData Upload NoTicket | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1229 | Get Upload Ticket | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1230 | Condition Upload Ticket Valid | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1231 | Condition Upload Size Matches | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1232 | Create Attachment File | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1233 | Create Attachment Record | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1234 | Redeem Upload Ticket | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1235 | Set variable varStatusCode Upload 200 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1236 | Set variable varData Upload Stored | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1237 | Redeem Upload Ticket Refused | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1238 | Set variable varStatusCode Upload 422 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1239 | Set variable varData Upload SizeMismatch | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1240 | Set variable varStatusCode Upload 403 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1241 | Set variable varData Upload TicketRefused | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1242 | Scope Catch Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1243 | Set variable varStatusCode Upload 500 | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1244 | Append to array variable varErrors Upload Catch | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1245 | Set variable varData Upload Catch | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1246 | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1247 | Set variable varCompletedAtUtc Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1248 | Set variable varDurationMs Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1249 | Compose  Standard Response Revised | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1250 | Compose Response Body | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1251 | Get Allowed Origins Upload | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1252 | Select Allowed Origins Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1253 | Compose Request Origin Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1254 | Compose Allowed Origin Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1255 | Response Upload | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1256 | Scope Flow Data Capture | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1257 | Compose Redacted Queries | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1258 | Compose Redacted Headers | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1259 | Compose Flow Run Record | Power Automate — CG_Upload_Endpoint | Automated |
| STEP-1260 | Create Flow Telemetry | Microsoft SharePoint Online, called by the flow | Integration |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow df82e331-b800-4a8d-996e-d2b2ca846c77 |
| Required system availability | Microsoft Power Automate<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-1207 | trigger field 'requestId'<br>trigger field 'request_id' |
| STEP-1217 | output of Compose Upload SourceIp |
| STEP-1218 | output of Compose Bucket Upload |
| STEP-1219 | output of Get Rate Limit Upload |
| STEP-1220 | output of Get Rate Limit Upload |
| STEP-1221 | output of Compose Bucket Upload |
| STEP-1222 | output of Get Rate Limit Upload |
| STEP-1223 | output of Compose Rate Limited Upload |
| STEP-1226 | output of Compose Upload Ticket |
| STEP-1229 | output of Compose Upload Ticket |
| STEP-1230 | output of Get Upload Ticket |
| STEP-1231 | output of Get Upload Ticket<br>output of Compose Upload Content Length |
| STEP-1232 | output of Get Upload Ticket |
| STEP-1233 | output of Get Upload Ticket<br>output of Create Attachment File |
| STEP-1234 | output of Get Upload Ticket |
| STEP-1237 | output of Get Upload Ticket |
| STEP-1249 | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' |
| STEP-1250 | variable 'varData' |
| STEP-1252 | output of Get Allowed Origins Upload |
| STEP-1254 | output of Select Allowed Origins Upload<br>output of Compose Request Origin Upload |
| STEP-1255 | variable 'varStatusCode'<br>output of Compose Allowed Origin Upload<br>output of Compose Response Body |
| STEP-1259 | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose Upload Ticket<br>output of Compose Upload Content Length |
| STEP-1260 | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record |

## 5.5 Stages and activities

57 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-1204 | 1 | Initialize variable varStatusCode | flow root | Power Automate — CG_Upload_Endpoint | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varData | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1205 | 2 | Initialize variable varData | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varStatusCode reaches Succeeded | Initialize variable varStatusCode = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varErrors | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1206 | 3 | Initialize variable varErrors | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varData reaches Succeeded | Initialize variable varData = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varRequestId | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1207 | 4 | Initialize variable varRequestId | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varErrors reaches Succeeded | Initialize variable varErrors = Succeeded | trigger field 'requestId'<br>trigger field 'request_id' | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varStartTicks | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1208 | 5 | Initialize variable varStartTicks | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varRequestId reaches Succeeded | Initialize variable varRequestId = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varReceivedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1209 | 6 | Initialize variable varReceivedAtUtc | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varStartTicks reaches Succeeded | Initialize variable varStartTicks = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varCompletedAtUtc | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1210 | 7 | Initialize variable varCompletedAtUtc | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varReceivedAtUtc reaches Succeeded | Initialize variable varReceivedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable varDurationMs | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1211 | 8 | Initialize variable varDurationMs | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varCompletedAtUtc reaches Succeeded | Initialize variable varCompletedAtUtc = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Scope Upload Flow | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1212 | 9 | Scope Upload Flow | flow root | Power Automate — CG_Upload_Endpoint | Initialize variable varDurationMs reaches Succeeded | Initialize variable varDurationMs = Succeeded | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1213 | 10 | Scope Global Upload | Scope Upload Flow | Power Automate — CG_Upload_Endpoint | Entry of Scope Upload Flow | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Catch Upload (runs when this does not succeed)<br>Scope Finalize Response Upload (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1214 | 11 | Compose Upload Ticket | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Entry of Scope Global Upload | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Upload SourceIp | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1215 | 12 | Compose Upload SourceIp | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Compose Upload Ticket reaches Succeeded | Compose Upload Ticket = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Upload Content Length | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1216 | 13 | Compose Upload Content Length | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Compose Upload SourceIp reaches Succeeded | Compose Upload SourceIp = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Bucket Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1217 | 14 | Compose Bucket Upload | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Compose Upload Content Length reaches Succeeded | Compose Upload Content Length = Succeeded | output of Compose Upload SourceIp | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Rate Limit Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1218 | 15 | Get Rate Limit Upload | Scope Global Upload | Microsoft SharePoint Online, called by the flow | Compose Bucket Upload reaches Succeeded | Compose Bucket Upload = Succeeded | output of Compose Bucket Upload | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Condition Rate Limit Upload Exists | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1219 | 16 | Condition Rate Limit Upload Exists | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Get Rate Limit Upload reaches Succeeded | Get Rate Limit Upload = Succeeded | output of Get Rate Limit Upload | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(outputs('Get_Rate_Limit_Upload')?['body/value'],json('[]')))",0]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Rate Limited Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1220 | 17 | Update Rate Limit Upload | Condition Rate Limit Upload Exists | Microsoft SharePoint Online, called by the flow | Entry of Condition Rate Limit Upload Exists | None declared beyond entry into its container. | output of Get Rate Limit Upload | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |
| STEP-1221 | 18 | Create Rate Limit Upload | Condition Rate Limit Upload Exists · else | Microsoft SharePoint Online, called by the flow | Entry of Condition Rate Limit Upload Exists · else | None declared beyond entry into its container. | output of Compose Bucket Upload | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |
| STEP-1222 | 19 | Compose Rate Limited Upload | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Condition Rate Limit Upload Exists reaches Succeeded | Condition Rate Limit Upload Exists = Succeeded | output of Get Rate Limit Upload | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition Upload Gate | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1223 | 20 | Condition Upload Gate | Scope Global Upload | Power Automate — CG_Upload_Endpoint | Compose Rate Limited Upload reaches Succeeded | Compose Rate Limited Upload = Succeeded | output of Compose Rate Limited Upload | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Rate_Limited_Upload')",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1224 | 21 | Set variable varStatusCode Upload 429 | Condition Upload Gate | Power Automate — CG_Upload_Endpoint | Entry of Condition Upload Gate | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData Upload RateLimited | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1225 | 22 | Set variable varData Upload RateLimited | Condition Upload Gate | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 429 reaches Succeeded | Set variable varStatusCode Upload 429 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1226 | 23 | Condition Upload Ticket Present | Condition Upload Gate · else | Power Automate — CG_Upload_Endpoint | Entry of Condition Upload Gate · else | None declared beyond entry into its container. | output of Compose Upload Ticket | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@empty(outputs('Compose_Upload_Ticket'))",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1227 | 24 | Set variable varStatusCode Upload 401 | Condition Upload Ticket Present | Power Automate — CG_Upload_Endpoint | Entry of Condition Upload Ticket Present | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData Upload NoTicket | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1228 | 25 | Set variable varData Upload NoTicket | Condition Upload Ticket Present | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 401 reaches Succeeded | Set variable varStatusCode Upload 401 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1229 | 26 | Get Upload Ticket | Condition Upload Ticket Present · else | Microsoft SharePoint Online, called by the flow | Entry of Condition Upload Ticket Present · else | None declared beyond entry into its container. | output of Compose Upload Ticket | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Condition Upload Ticket Valid | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1230 | 27 | Condition Upload Ticket Valid | Condition Upload Ticket Present · else | Power Automate — CG_Upload_Endpoint | Get Upload Ticket reaches Succeeded | Get Upload Ticket = Succeeded | output of Get Upload Ticket | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"greater":["@length(coalesce(outputs('Get_Upload_Ticket')?['body/value'],json('[]')))",0]},{"greater":["@ticks(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z'))","@ticks(utcNow())"]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1231 | 28 | Condition Upload Size Matches | Condition Upload Ticket Valid | Power Automate — CG_Upload_Endpoint | Entry of Condition Upload Ticket Valid | None declared beyond entry into its container. | output of Get Upload Ticket<br>output of Compose Upload Content Length | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@int(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredSizeBytes'],0))","@outputs('Compose_Upload_Content_Length')"]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1232 | 29 | Create Attachment File | Condition Upload Size Matches | Microsoft SharePoint Online, called by the flow | Entry of Condition Upload Size Matches | None declared beyond entry into its container. | output of Get Upload Ticket | Writes a file into a document library. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Create Attachment Record | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1233 | 30 | Create Attachment Record | Condition Upload Size Matches | Microsoft SharePoint Online, called by the flow | Create Attachment File reaches Succeeded | Create Attachment File = Succeeded | output of Get Upload Ticket<br>output of Create Attachment File | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Redeem Upload Ticket | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |
| STEP-1234 | 31 | Redeem Upload Ticket | Condition Upload Size Matches | Microsoft SharePoint Online, called by the flow | Create Attachment Record reaches Succeeded | Create Attachment Record = Succeeded | output of Get Upload Ticket | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Set variable varStatusCode Upload 200 | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |
| STEP-1235 | 32 | Set variable varStatusCode Upload 200 | Condition Upload Size Matches | Power Automate — CG_Upload_Endpoint | Redeem Upload Ticket reaches Succeeded | Redeem Upload Ticket = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData Upload Stored | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1236 | 33 | Set variable varData Upload Stored | Condition Upload Size Matches | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 200 reaches Succeeded | Set variable varStatusCode Upload 200 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1237 | 34 | Redeem Upload Ticket Refused | Condition Upload Size Matches · else | Microsoft SharePoint Online, called by the flow | Entry of Condition Upload Size Matches · else | None declared beyond entry into its container. | output of Get Upload Ticket | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Set variable varStatusCode Upload 422 | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |
| STEP-1238 | 35 | Set variable varStatusCode Upload 422 | Condition Upload Size Matches · else | Power Automate — CG_Upload_Endpoint | Redeem Upload Ticket Refused reaches Succeeded | Redeem Upload Ticket Refused = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData Upload SizeMismatch | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1239 | 36 | Set variable varData Upload SizeMismatch | Condition Upload Size Matches · else | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 422 reaches Succeeded | Set variable varStatusCode Upload 422 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1240 | 37 | Set variable varStatusCode Upload 403 | Condition Upload Ticket Valid · else | Power Automate — CG_Upload_Endpoint | Entry of Condition Upload Ticket Valid · else | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Set variable varData Upload TicketRefused | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1241 | 38 | Set variable varData Upload TicketRefused | Condition Upload Ticket Valid · else | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 403 reaches Succeeded | Set variable varStatusCode Upload 403 = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1242 | 39 | Scope Catch Upload | Scope Upload Flow | Power Automate — CG_Upload_Endpoint | Scope Global Upload reaches Failed or TimedOut or Skipped | Scope Global Upload = Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Finalize Response Upload (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-077 |
| STEP-1243 | 40 | Set variable varStatusCode Upload 500 | Scope Catch Upload | Power Automate — CG_Upload_Endpoint | Entry of Scope Catch Upload | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varStatusCode'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varStatusCode'. | Run-scoped outcome variable 'varStatusCode' set. | Append to array variable varErrors Upload Catch | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1244 | 41 | Append to array variable varErrors Upload Catch | Scope Catch Upload | Power Automate — CG_Upload_Endpoint | Set variable varStatusCode Upload 500 reaches Succeeded | Set variable varStatusCode Upload 500 = Succeeded | — | Appends an element to a run-scoped array. | Writes 'varErrors'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varErrors'. | — | Set variable varData Upload Catch | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1245 | 42 | Set variable varData Upload Catch | Scope Catch Upload | Power Automate — CG_Upload_Endpoint | Append to array variable varErrors Upload Catch reaches Succeeded | Append to array variable varErrors Upload Catch = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varData'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varData'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1246 | 43 | Scope Finalize Response Upload | Scope Upload Flow | Power Automate — CG_Upload_Endpoint | Scope Global Upload reaches Succeeded or Failed or TimedOut or Skipped; Scope Catch Upload reaches Succeeded or Skipped | Scope Global Upload = Succeeded\|Failed\|TimedOut\|Skipped<br>Scope Catch Upload = Succeeded\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Scope Flow Data Capture (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-077 |
| STEP-1247 | 44 | Set variable varCompletedAtUtc Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Entry of Scope Finalize Response Upload | None declared beyond entry into its container. | — | Replaces the value held in a run-scoped variable. | Writes 'varCompletedAtUtc'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varCompletedAtUtc'. | — | Set variable varDurationMs Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1248 | 45 | Set variable varDurationMs Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Set variable varCompletedAtUtc Upload reaches Succeeded | Set variable varCompletedAtUtc Upload = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varDurationMs'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varDurationMs'. | — | Compose  Standard Response Revised | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1249 | 46 | Compose  Standard Response Revised | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Set variable varDurationMs Upload reaches Succeeded | Set variable varDurationMs Upload = Succeeded | trigger field 'payload'<br>trigger field 'trackingId'<br>trigger field 'action'<br>trigger field 'operation'<br>trigger field 'source'<br>variable 'varStatusCode'<br>variable 'varRequestId'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>variable 'varData'<br>variable 'varErrors' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Response Body | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1250 | 47 | Compose Response Body | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Compose  Standard Response Revised reaches Succeeded | Compose  Standard Response Revised = Succeeded | variable 'varData' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Allowed Origins Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1251 | 48 | Get Allowed Origins Upload | Scope Finalize Response Upload | Microsoft SharePoint Online, called by the flow | Compose Response Body reaches Succeeded | Compose Response Body = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Allowed Origins Upload (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1252 | 49 | Select Allowed Origins Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Get Allowed Origins Upload reaches Succeeded or Failed or TimedOut or Skipped | Get Allowed Origins Upload = Succeeded\|Failed\|TimedOut\|Skipped | output of Get Allowed Origins Upload | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Request Origin Upload | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-077 |
| STEP-1253 | 50 | Compose Request Origin Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Select Allowed Origins Upload reaches Succeeded | Select Allowed Origins Upload = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Allowed Origin Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1254 | 51 | Compose Allowed Origin Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Compose Request Origin Upload reaches Succeeded | Compose Request Origin Upload = Succeeded | output of Select Allowed Origins Upload<br>output of Compose Request Origin Upload | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response Upload | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1255 | 52 | Response Upload | Scope Finalize Response Upload | Power Automate — CG_Upload_Endpoint | Compose Allowed Origin Upload reaches Succeeded | Compose Allowed Origin Upload = Succeeded | variable 'varStatusCode'<br>output of Compose Allowed Origin Upload<br>output of Compose Response Body | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP @variables('varStatusCode') returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1256 | 53 | Scope Flow Data Capture | Scope Upload Flow | Power Automate — CG_Upload_Endpoint | Scope Finalize Response Upload reaches Succeeded or Failed or TimedOut or Skipped | Scope Finalize Response Upload = Succeeded\|Failed\|TimedOut\|Skipped | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-077 |
| STEP-1257 | 54 | Compose Redacted Queries | Scope Flow Data Capture | Power Automate — CG_Upload_Endpoint | Entry of Scope Flow Data Capture | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Redacted Headers | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1258 | 55 | Compose Redacted Headers | Scope Flow Data Capture | Power Automate — CG_Upload_Endpoint | Compose Redacted Queries reaches Succeeded | Compose Redacted Queries = Succeeded | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Flow Run Record | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1259 | 56 | Compose Flow Run Record | Scope Flow Data Capture | Power Automate — CG_Upload_Endpoint | Compose Redacted Headers reaches Succeeded | Compose Redacted Headers = Succeeded | variable 'varStatusCode'<br>variable 'varErrors'<br>variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varDurationMs'<br>output of Compose Redacted Headers<br>output of Compose Redacted Queries<br>output of Compose Upload Ticket<br>output of Compose Upload Content Length | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Create Flow Telemetry | — | — | — | — | — | Confirmed | No external validation required | SRC-077 |
| STEP-1260 | 57 | Create Flow Telemetry | Scope Flow Data Capture | Microsoft SharePoint Online, called by the flow | Compose Flow Run Record reaches Succeeded | Compose Flow Run Record = Succeeded | variable 'varReceivedAtUtc'<br>variable 'varCompletedAtUtc'<br>variable 'varStatusCode'<br>variable 'varDurationMs'<br>variable 'varErrors'<br>output of Compose Flow Run Record | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-077 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-101 | Condition Rate Limit Upload Exists | Power Automate — CG_Upload_Endpoint | `{"and":[{"greater":["@length(coalesce(outputs('Get_Rate_Limit_Upload')?['body/value'],json('[]')))",0]}]}` | output of Get Rate Limit Upload | true<br>false | true → Update Rate Limit Upload<br>false → Create Rate Limit Upload | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-102 | Condition Upload Gate | Power Automate — CG_Upload_Endpoint | `{"and":[{"equals":["@outputs('Compose_Rate_Limited_Upload')",true]}]}` | output of Compose Rate Limited Upload | true<br>false | true → Set variable varStatusCode Upload 429, Set variable varData Upload RateLimited<br>false → Condition Upload Ticket Present | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-103 | Condition Upload Ticket Present | Power Automate — CG_Upload_Endpoint | `{"and":[{"equals":["@empty(outputs('Compose_Upload_Ticket'))",true]}]}` | output of Compose Upload Ticket | true<br>false | true → Set variable varStatusCode Upload 401, Set variable varData Upload NoTicket<br>false → Get Upload Ticket, Condition Upload Ticket Valid | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-104 | Condition Upload Ticket Valid | Power Automate — CG_Upload_Endpoint | `{"and":[{"greater":["@length(coalesce(outputs('Get_Upload_Ticket')?['body/value'],json('[]')))",0]},{"greater":["@ticks(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['ExpiresAtUtc'],'1900-01-01T00:00:00Z'))","@ticks(utcNow())"]}]}` | output of Get Upload Ticket | true<br>false | true → Condition Upload Size Matches<br>false → Set variable varStatusCode Upload 403, Set variable varData Upload TicketRefused | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-105 | Condition Upload Size Matches | Power Automate — CG_Upload_Endpoint | `{"and":[{"equals":["@int(coalesce(first(outputs('Get_Upload_Ticket')?['body/value'])?['DeclaredSizeBytes'],0))","@outputs('Compose_Upload_Content_Length')"]}]}` | output of Get Upload Ticket<br>output of Compose Upload Content Length | true<br>false | true → Create Attachment File, Create Attachment Record, Redeem Upload Ticket, Set variable varStatusCode Upload 200, Set variable varData Upload Stored<br>false → Redeem Upload Ticket Refused, Set variable varStatusCode Upload 422, Set variable varData Upload SizeMismatch | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

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
| Records created or updated | STEP-1220 Update Rate Limit Upload<br>STEP-1221 Create Rate Limit Upload<br>STEP-1232 Create Attachment File<br>STEP-1233 Create Attachment Record<br>STEP-1234 Redeem Upload Ticket<br>STEP-1237 Redeem Upload Ticket Refused<br>STEP-1260 Create Flow Telemetry |
| Notifications issued | — |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-131 | Recovery after Scope Global Upload | Scope Global Upload reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Catch Upload. | Power Automate — CG_Upload_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-132 | Recovery after Scope Global Upload, Scope Catch Upload | Scope Global Upload reaches Failed or TimedOut or Skipped; Scope Catch Upload reaches Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Finalize Response Upload. | Power Automate — CG_Upload_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-133 | Recovery after Get Allowed Origins Upload | Get Allowed Origins Upload reaches Failed or TimedOut or Skipped | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Allowed Origins Upload. | Power Automate — CG_Upload_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-134 | Recovery after Scope Finalize Response Upload | Scope Finalize Response Upload reaches Failed or TimedOut or Skipped | Groups the steps beneath it so one run-after condition governs the whole group. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Scope Flow Data Capture. | Power Automate — CG_Upload_Endpoint | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-1220 Update Rate Limit Upload | Writes a list item; the write itself is the audit record. |
| STEP-1221 Create Rate Limit Upload | Writes a list item; the write itself is the audit record. |
| STEP-1233 Create Attachment Record | Writes a list item; the write itself is the audit record. |
| STEP-1234 Redeem Upload Ticket | Writes a list item; the write itself is the audit record. |
| STEP-1237 Redeem Upload Ticket Refused | Writes a list item; the write itself is the audit record. |
| STEP-1260 Create Flow Telemetry | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
