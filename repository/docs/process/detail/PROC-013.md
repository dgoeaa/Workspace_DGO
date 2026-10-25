# PROC-013 — AI_Document_Processing

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-013 |
| Name | AI_Document_Processing |
| Alternative or legacy name | — |
| Category | Automated · System-initiated (HTTP request) |
| Description | Power Automate workflow carrying 21 action(s) under 1 trigger(s). |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. No supplied artifact states what this workflow is for in business terms; its name and its actions are all the export carries. |
| Operational objective | Reads from and writes to /providers/Microsoft.PowerApps/apis/shared_adobepdftools, Microsoft SharePoint Online. |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Flow estate |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Every action, run-after condition, branch and connector call is CONFIRMED from the tenant export and catalogued step by step. What the workflow is FOR, who owns it and how critical it is are NOT evidenced: no supplied artifact states them. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-066` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/AI_Document_Processing__fefa43c6-fb9d-4337-8b65-7fd19fa09b6d__full_definition.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate<br>/providers/Microsoft.PowerApps/apis/shared_adobepdftools<br>Microsoft SharePoint Online |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-0390 | Get item | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0391 | Get attachments | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0392 | For each | Power Automate — AI_Document_Processing | Automated |
| STEP-0393 | Get attachment content | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-0394 | Set variable | Power Automate — AI_Document_Processing | Automated |
| STEP-0395 | Set variable 2 | Power Automate — AI_Document_Processing | Automated |
| STEP-0396 | Initialize variable | Power Automate — AI_Document_Processing | Automated |
| STEP-0397 | Extract PDF Structure, Tables and Images from a PDF | /providers/Microsoft.PowerApps/apis/shared_adobepdftools, called by the flow | Integration |
| STEP-0398 | Parse JSON Extract PDF Structure | Power Automate — AI_Document_Processing | Automated |
| STEP-0399 | Select ParseJSON PDF Elements | Power Automate — AI_Document_Processing | Automated |
| STEP-0400 | Join Select ParseJSON PDF Elements Text | Power Automate — AI_Document_Processing | Automated |
| STEP-0401 | Compose Extracted Text | Power Automate — AI_Document_Processing | Automated |
| STEP-0402 | Compose Prompt | Power Automate — AI_Document_Processing | Automated |
| STEP-0403 | HTTP | Power Automate — AI_Document_Processing | Automated |
| STEP-0404 | Compose HTTP AI Response | Power Automate — AI_Document_Processing | Automated |
| STEP-0405 | Initialize variable 2 | Power Automate — AI_Document_Processing | Automated |
| STEP-0406 | Compose Model ID | Power Automate — AI_Document_Processing | Automated |
| STEP-0407 | Compose HTML Response Template | Power Automate — AI_Document_Processing | Automated |
| STEP-0408 | Compose Attachment Content | Power Automate — AI_Document_Processing | Automated |
| STEP-0409 | Initialize variable 1 | Power Automate — AI_Document_Processing | Automated |
| STEP-0410 | Response AI Document Processing | Power Automate — AI_Document_Processing | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | manual: Request |
| Trigger type | manual (Request) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow fefa43c6-fb9d-4337-8b65-7fd19fa09b6d |
| Required system availability | Microsoft Power Automate<br>/providers/Microsoft.PowerApps/apis/shared_adobepdftools<br>Microsoft SharePoint Online |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0390 | variable 'AaitemId' |
| STEP-0391 | output of Get item |
| STEP-0393 | output of Get item |
| STEP-0394 | output of Get attachment content |
| STEP-0397 | variable 'varAttachmentName'<br>variable 'varAttachmentContent' |
| STEP-0398 | output of Extract PDF Structure, Tables and Images from a PDF |
| STEP-0399 | output of Parse JSON Extract PDF Structure |
| STEP-0400 | output of Select ParseJSON PDF Elements |
| STEP-0401 | output of Join Select ParseJSON PDF Elements Text |
| STEP-0402 | output of Join Select ParseJSON PDF Elements Text |
| STEP-0403 | output of Compose Model ID<br>output of Compose Prompt |
| STEP-0404 | output of HTTP |
| STEP-0406 | trigger field 'text_1' |
| STEP-0407 | output of HTTP |
| STEP-0408 | variable 'varAttachmentContent' |
| STEP-0410 | output of Compose HTTP AI Response |

## 5.5 Stages and activities

21 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0390 | 1 | Get item | flow root | Microsoft SharePoint Online, called by the flow | Initialize variable 2 reaches Succeeded | Initialize variable 2 = Succeeded | variable 'AaitemId' | Reads one list item by identifier from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Get attachments | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0391 | 2 | Get attachments | flow root | Microsoft SharePoint Online, called by the flow | Get item reaches Succeeded | Get item = Succeeded | output of Get item | Calls the connector operation 'GetItemAttachments'. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | For each | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0392 | 3 | For each | flow root | Power Automate — AI_Document_Processing | Get attachments reaches Succeeded | Get attachments = Succeeded | — | Repeats the steps beneath it once per element of a collection. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Attachment Content | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0393 | 4 | Get attachment content | For each | Microsoft SharePoint Online, called by the flow | Entry of For each | None declared beyond entry into its container. | output of Get item | Calls the connector operation 'GetAttachmentContent'. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Set variable | — | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0394 | 5 | Set variable | For each | Power Automate — AI_Document_Processing | Get attachment content reaches Succeeded | Get attachment content = Succeeded | output of Get attachment content | Replaces the value held in a run-scoped variable. | Writes 'varAttachmentContent'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varAttachmentContent'. | — | Set variable 2 | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0395 | 6 | Set variable 2 | For each | Power Automate — AI_Document_Processing | Set variable reaches Succeeded | Set variable = Succeeded | — | Replaces the value held in a run-scoped variable. | Writes 'varAttachmentName'. | The value is held in the run and made available to later steps. | Run-scoped variable 'varAttachmentName'. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0396 | 7 | Initialize variable | flow root | Power Automate — AI_Document_Processing | Initialize variable 1 reaches Succeeded | Initialize variable 1 = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable 2 | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0397 | 8 | Extract PDF Structure, Tables and Images from a PDF | flow root | /providers/Microsoft.PowerApps/apis/shared_adobepdftools, called by the flow | Compose Attachment Content reaches Succeeded | Compose Attachment Content = Succeeded | variable 'varAttachmentName'<br>variable 'varAttachmentContent' | Calls the connector operation 'ExtractJSONAndImagesAndTablesFromPDF'. | — | /providers/Microsoft.PowerApps/apis/shared_adobepdftools returns its result to the run; a non-success reply fails this step. | The connector response body. | — | Parse JSON Extract PDF Structure | — | /providers/Microsoft.PowerApps/apis/shared_adobepdftools | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0398 | 9 | Parse JSON Extract PDF Structure | flow root | Power Automate — AI_Document_Processing | Extract PDF Structure, Tables and Images from a PDF reaches Succeeded | Extract PDF Structure, Tables and Images from a PDF = Succeeded | output of Extract PDF Structure, Tables and Images from a PDF | Parses a JSON payload against a declared schema, failing the run when it does not match. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select ParseJSON PDF Elements | — | — | Schema validation: a payload that does not match the declared schema fails the run here. | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0399 | 10 | Select ParseJSON PDF Elements | flow root | Power Automate — AI_Document_Processing | Parse JSON Extract PDF Structure reaches Succeeded | Parse JSON Extract PDF Structure = Succeeded | output of Parse JSON Extract PDF Structure | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Join Select ParseJSON PDF Elements Text | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0400 | 11 | Join Select ParseJSON PDF Elements Text | flow root | Power Automate — AI_Document_Processing | Select ParseJSON PDF Elements reaches Succeeded | Select ParseJSON PDF Elements = Succeeded | output of Select ParseJSON PDF Elements | Concatenates a collection into a single delimited string. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Extracted Text | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0401 | 12 | Compose Extracted Text | flow root | Power Automate — AI_Document_Processing | Join Select ParseJSON PDF Elements Text reaches Succeeded | Join Select ParseJSON PDF Elements Text = Succeeded | output of Join Select ParseJSON PDF Elements Text | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Prompt | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0402 | 13 | Compose Prompt | flow root | Power Automate — AI_Document_Processing | Compose Extracted Text reaches Succeeded | Compose Extracted Text = Succeeded | output of Join Select ParseJSON PDF Elements Text | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Model ID | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0403 | 14 | HTTP | flow root | Power Automate — AI_Document_Processing | Compose Model ID reaches Succeeded | Compose Model ID = Succeeded | output of Compose Model ID<br>output of Compose Prompt | Calls an external HTTP endpoint directly, without a connector. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose HTTP AI Response | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0404 | 15 | Compose HTTP AI Response | flow root | Power Automate — AI_Document_Processing | HTTP reaches Succeeded | HTTP = Succeeded | output of HTTP | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose HTML Response Template | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0405 | 16 | Initialize variable 2 | flow root | Power Automate — AI_Document_Processing | Initialize variable reaches Succeeded | Initialize variable = Succeeded | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Get item | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0406 | 17 | Compose Model ID | flow root | Power Automate — AI_Document_Processing | Compose Prompt reaches Succeeded | Compose Prompt = Succeeded | trigger field 'text_1' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | HTTP | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0407 | 18 | Compose HTML Response Template | flow root | Power Automate — AI_Document_Processing | Compose HTTP AI Response reaches Succeeded | Compose HTTP AI Response = Succeeded | output of HTTP | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Response AI Document Processing | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0408 | 19 | Compose Attachment Content | flow root | Power Automate — AI_Document_Processing | For each reaches Succeeded | For each = Succeeded | variable 'varAttachmentContent' | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Extract PDF Structure, Tables and Images from a PDF | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0409 | 20 | Initialize variable 1 | flow root | Power Automate — AI_Document_Processing | Flow trigger fires | None declared beyond entry into its container. | — | Declares a run-scoped variable and sets its first value. | — | The value is held in the run and made available to later steps. | Run-scoped variable 'unnamed'. | — | Initialize variable | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |
| STEP-0410 | 21 | Response AI Document Processing | flow root | Power Automate — AI_Document_Processing | Compose HTML Response Template reaches Succeeded | Compose HTML Response Template = Succeeded | output of Compose HTTP AI Response | Returns the HTTP response to the caller and ends the request. | — | The value is held in the run and made available to later steps. | HTTP response body and headers. | HTTP 200 returned to the caller. | — | — | — | — | — | — | Confirmed | No external validation required | SRC-066 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An HTTP response to the caller. |
| Completion criteria | A Response action returns to the caller. 1 response action(s); status codes 200. |
| Successful end state | A Response action returns to the caller. 1 response action(s); status codes 200. |
| Alternative end states | Not evidenced. |
| Failed end states | Not evidenced. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | — |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

_No monitoring control, metric, service-level expectation or audit event is evidenced for this process._

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
