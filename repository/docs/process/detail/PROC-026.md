# PROC-026 — Folio_Failure_Watch

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-026 |
| Name | Folio_Failure_Watch |
| Alternative or legacy name | — |
| Category | Automated · Scheduled |
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
| Sources | `SRC-079` docs/folio-Master-Flows-and-Endpoints/contracts/deployed/Folio_Failure_Watch__c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6__full_definition.json |

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
| STEP-1362 | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1363 | Compose Watch Start | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1364 | Get Watch Config | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1365 | Select Watch Config | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1366 | Compose Watch Config Xml | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1367 | Compose Watch Config | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1368 | Get New Failures | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1369 | Get Open Failures | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1370 | Select New Failures | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1371 | Select Open Failures | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1372 | Filter New Reported | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1373 | Filter Open Reported | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1374 | Filter Open Citizen | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1375 | Filter Open Codes | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1376 | Filter Open Staff | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1377 | Filter Open Ops | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1378 | Filter Open Outward | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1379 | Filter Open Unclassified | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1380 | Compose Watch Outcome | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1381 | Condition Watch Report | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1382 | Select Watch Rows | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1383 | Compose Watch Totals | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1384 | Compose Watch Html | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1385 | Send Failure Watch Email | Microsoft Office 365 Outlook, called by the flow | Integration |
| STEP-1386 | Create Send Failure Watch Email Receipt | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1387 | Compose Send Failure Watch Email Outcome | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1388 | Condition Watch Cursor Row | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1389 | Update Watch Cursor Row | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1390 | Condition Watch Cursor Read | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1391 | Create Watch Cursor Row | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1392 | Condition Watch Health Row | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1393 | Update Watch Health Row | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1394 | Condition Watch Health Read | Power Automate — Folio_Failure_Watch | Automated |
| STEP-1395 | Create Watch Health Row | Microsoft SharePoint Online, called by the flow | Integration |
| STEP-1396 | Compose Watch Run Outcome | Power Automate — Folio_Failure_Watch | Automated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | Recurrence: Recurrence |
| Trigger type | Recurrence (Recurrence) |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | workflow c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6 |
| Required system availability | Microsoft Power Automate<br>Microsoft Office 365 Outlook<br>Microsoft SharePoint Online |
| Scheduling conditions | Recurrence: Recurrence |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-1366 | output of Select Watch Config |
| STEP-1367 | output of Compose Watch Config Xml<br>output of Compose Watch Start |
| STEP-1368 | output of Compose Watch Config<br>output of Compose Watch Start |
| STEP-1372 | output of Select New Failures<br>output of Compose Watch Config |
| STEP-1373 | output of Select Open Failures<br>output of Compose Watch Config |
| STEP-1374 | output of Select Open Failures |
| STEP-1375 | output of Select Open Failures |
| STEP-1376 | output of Select Open Failures |
| STEP-1377 | output of Select Open Failures |
| STEP-1378 | output of Select Open Failures |
| STEP-1379 | output of Select Open Failures |
| STEP-1380 | output of Compose Watch Config<br>output of Filter Open Reported<br>output of Filter New Reported<br>output of Select New Failures<br>output of Select Open Failures<br>output of Filter Open Citizen<br>output of Filter Open Codes<br>output of Filter Open Staff<br>output of Filter Open Ops<br>output of Filter Open Outward<br>output of Filter Open Unclassified |
| STEP-1381 | output of Compose Watch Config<br>output of Compose Watch Outcome |
| STEP-1382 | output of Compose Watch Outcome |
| STEP-1383 | output of Compose Watch Outcome |
| STEP-1384 | output of Compose Watch Outcome<br>output of Select Watch Rows<br>output of Compose Watch Totals |
| STEP-1385 | output of Compose Watch Config<br>output of Compose Watch Outcome<br>output of Compose Watch Html |
| STEP-1386 | output of Compose Watch Config |
| STEP-1388 | output of Compose Watch Outcome<br>output of Compose Watch Config Xml |
| STEP-1389 | output of Compose Watch Config Xml<br>output of Compose Watch Start |
| STEP-1390 | output of Compose Watch Outcome<br>output of Compose Watch Config Xml |
| STEP-1391 | output of Compose Watch Start |
| STEP-1392 | output of Compose Watch Outcome<br>output of Compose Watch Config Xml |
| STEP-1393 | output of Compose Watch Config Xml<br>output of Compose Watch Start<br>output of Compose Watch Outcome |
| STEP-1394 | output of Compose Watch Outcome<br>output of Compose Watch Config Xml |
| STEP-1395 | output of Compose Watch Start<br>output of Compose Watch Outcome |

## 5.5 Stages and activities

35 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-1362 | 1 | Scope Failure Watch | flow root | Power Automate — Folio_Failure_Watch | Flow trigger fires | None declared beyond entry into its container. | — | Groups the steps beneath it so one run-after condition governs the whole group. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1363 | 2 | Compose Watch Start | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Entry of Scope Failure Watch | None declared beyond entry into its container. | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get Watch Config | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1364 | 3 | Get Watch Config | Scope Failure Watch | Microsoft SharePoint Online, called by the flow | Compose Watch Start reaches Succeeded | Compose Watch Start = Succeeded | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select Watch Config (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1365 | 4 | Select Watch Config | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Get Watch Config reaches Succeeded or Failed or TimedOut | Get Watch Config = Succeeded\|Failed\|TimedOut | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Watch Config Xml | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1366 | 5 | Compose Watch Config Xml | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Select Watch Config reaches Succeeded | Select Watch Config = Succeeded | output of Select Watch Config | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Watch Config | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1367 | 6 | Compose Watch Config | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Compose Watch Config Xml reaches Succeeded | Compose Watch Config Xml = Succeeded | output of Compose Watch Config Xml<br>output of Compose Watch Start | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Get New Failures | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1368 | 7 | Get New Failures | Scope Failure Watch | Microsoft SharePoint Online, called by the flow | Compose Watch Config reaches Succeeded | Compose Watch Config = Succeeded | output of Compose Watch Config<br>output of Compose Watch Start | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Get Open Failures (runs when this does not succeed) | Microsoft SharePoint Online | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1369 | 8 | Get Open Failures | Scope Failure Watch | Microsoft SharePoint Online, called by the flow | Get New Failures reaches Succeeded or Failed or TimedOut | Get New Failures = Succeeded\|Failed\|TimedOut | — | Reads a filtered set of list items from the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Select New Failures (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1370 | 9 | Select New Failures | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Get Open Failures reaches Succeeded or Failed or TimedOut | Get Open Failures = Succeeded\|Failed\|TimedOut | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Select Open Failures | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1371 | 10 | Select Open Failures | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Select New Failures reaches Succeeded | Select New Failures = Succeeded | — | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter New Reported | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1372 | 11 | Filter New Reported | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Select Open Failures reaches Succeeded | Select Open Failures = Succeeded | output of Select New Failures<br>output of Compose Watch Config | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Reported | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1373 | 12 | Filter Open Reported | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter New Reported reaches Succeeded | Filter New Reported = Succeeded | output of Select Open Failures<br>output of Compose Watch Config | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Citizen | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1374 | 13 | Filter Open Citizen | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Reported reaches Succeeded | Filter Open Reported = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Codes | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1375 | 14 | Filter Open Codes | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Citizen reaches Succeeded | Filter Open Citizen = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Staff | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1376 | 15 | Filter Open Staff | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Codes reaches Succeeded | Filter Open Codes = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Ops | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1377 | 16 | Filter Open Ops | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Staff reaches Succeeded | Filter Open Staff = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Outward | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1378 | 17 | Filter Open Outward | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Ops reaches Succeeded | Filter Open Ops = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Filter Open Unclassified | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1379 | 18 | Filter Open Unclassified | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Outward reaches Succeeded | Filter Open Outward = Succeeded | output of Select Open Failures | Filters a collection by a condition. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Watch Outcome | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1380 | 19 | Compose Watch Outcome | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Filter Open Unclassified reaches Succeeded | Filter Open Unclassified = Succeeded | output of Compose Watch Config<br>output of Filter Open Reported<br>output of Filter New Reported<br>output of Select New Failures<br>output of Select Open Failures<br>output of Filter Open Citizen<br>output of Filter Open Codes<br>output of Filter Open Staff<br>output of Filter Open Ops<br>output of Filter Open Outward<br>output of Filter Open Unclassified | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Condition Watch Report | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1381 | 20 | Condition Watch Report | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Compose Watch Outcome reaches Succeeded | Compose Watch Outcome = Succeeded | output of Compose Watch Config<br>output of Compose Watch Outcome | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Watch_Config')?['enabled']",true]},{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"or":[{"greater":["@length(outputs('Compose_Watch_Outcome')?['listed'])",0]},{"equals":["@outputs('Compose_Watch_Outcome')?['burst']",true]}]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Condition Watch Cursor Row (runs when this does not succeed) | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1382 | 21 | Select Watch Rows | Condition Watch Report | Power Automate — Folio_Failure_Watch | Entry of Condition Watch Report | None declared beyond entry into its container. | output of Compose Watch Outcome | Projects each element of a collection into a new shape. | — | The value is held in the run and made available to later steps. | Control passes to the next step. | — | Compose Watch Totals | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1383 | 22 | Compose Watch Totals | Condition Watch Report | Power Automate — Folio_Failure_Watch | Select Watch Rows reaches Succeeded | Select Watch Rows = Succeeded | output of Compose Watch Outcome | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Compose Watch Html | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1384 | 23 | Compose Watch Html | Condition Watch Report | Power Automate — Folio_Failure_Watch | Compose Watch Totals reaches Succeeded | Compose Watch Totals = Succeeded | output of Compose Watch Outcome<br>output of Select Watch Rows<br>output of Compose Watch Totals | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | Send Failure Watch Email | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1385 | 24 | Send Failure Watch Email | Condition Watch Report | Microsoft Office 365 Outlook, called by the flow | Compose Watch Html reaches Succeeded | Compose Watch Html = Succeeded | output of Compose Watch Config<br>output of Compose Watch Outcome<br>output of Compose Watch Html | Sends an outbound message. | — | Microsoft Office 365 Outlook returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Create Send Failure Watch Email Receipt (runs when this does not succeed) | Microsoft Office 365 Outlook | — | — | Sends a message; delivery is the record. | Confirmed | No external validation required | SRC-079 |
| STEP-1386 | 25 | Create Send Failure Watch Email Receipt | Condition Watch Report | Microsoft SharePoint Online, called by the flow | Send Failure Watch Email reaches Succeeded or Failed or TimedOut | Send Failure Watch Email = Succeeded\|Failed\|TimedOut | output of Compose Watch Config | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | Compose Send Failure Watch Email Outcome (runs when this does not succeed) | Microsoft SharePoint Online | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-079 |
| STEP-1387 | 26 | Compose Send Failure Watch Email Outcome | Condition Watch Report | Power Automate — Folio_Failure_Watch | Create Send Failure Watch Email Receipt reaches Succeeded or Failed or Skipped or TimedOut | Create Send Failure Watch Email Receipt = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1388 | 27 | Condition Watch Cursor Row | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Condition Watch Report reaches Succeeded or Failed or Skipped or TimedOut | Condition Watch Report = Succeeded\|Failed\|Skipped\|TimedOut | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"equals":["@not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_WATCH_CURSOR\"]/id)'))))",false]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Condition Watch Health Row (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1389 | 28 | Update Watch Cursor Row | Condition Watch Cursor Row | Microsoft SharePoint Online, called by the flow | Entry of Condition Watch Cursor Row | None declared beyond entry into its container. | output of Compose Watch Config Xml<br>output of Compose Watch Start | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-079 |
| STEP-1390 | 29 | Condition Watch Cursor Read | Condition Watch Cursor Row · else | Power Automate — Folio_Failure_Watch | Entry of Condition Watch Cursor Row · else | None declared beyond entry into its container. | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"equals":["@not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_WATCH_CURSOR\"]/id)'))))",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1391 | 30 | Create Watch Cursor Row | Condition Watch Cursor Read | Microsoft SharePoint Online, called by the flow | Entry of Condition Watch Cursor Read | None declared beyond entry into its container. | output of Compose Watch Start | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-079 |
| STEP-1392 | 31 | Condition Watch Health Row | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Condition Watch Cursor Row reaches Succeeded or Failed or Skipped or TimedOut | Condition Watch Cursor Row = Succeeded\|Failed\|Skipped\|TimedOut | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readOpen']",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_HEALTH\"]/id)'))))",false]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | Compose Watch Run Outcome (runs when this does not succeed) | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |
| STEP-1393 | 32 | Update Watch Health Row | Condition Watch Health Row | Microsoft SharePoint Online, called by the flow | Entry of Condition Watch Health Row | None declared beyond entry into its container. | output of Compose Watch Config Xml<br>output of Compose Watch Start<br>output of Compose Watch Outcome | Updates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-079 |
| STEP-1394 | 33 | Condition Watch Health Read | Condition Watch Health Row · else | Power Automate — Folio_Failure_Watch | Entry of Condition Watch Health Row · else | None declared beyond entry into its container. | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | Evaluates a condition and runs one of two branches. | Condition: {"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readOpen']",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_HEALTH\"]/id)'))))",true]}]} | The value is held in the run and made available to later steps. | Control passes to the next step. | — | — | — | — | — | — | — | Confirmed | No external validation required | SRC-079 |
| STEP-1395 | 34 | Create Watch Health Row | Condition Watch Health Read | Microsoft SharePoint Online, called by the flow | Entry of Condition Watch Health Read | None declared beyond entry into its container. | output of Compose Watch Start<br>output of Compose Watch Outcome | Creates a list item in the system of record. | — | Microsoft SharePoint Online returns its result to the run; a non-success reply fails this step. | The connector response body. | — | — | — | Microsoft SharePoint Online | — | — | Writes a list item; the write itself is the audit record. | Confirmed | No external validation required | SRC-079 |
| STEP-1396 | 35 | Compose Watch Run Outcome | Scope Failure Watch | Power Automate — Folio_Failure_Watch | Condition Watch Health Row reaches Succeeded or Failed or Skipped or TimedOut | Condition Watch Health Row = Succeeded\|Failed\|Skipped\|TimedOut | — | Evaluates an expression and holds the result for later steps. | — | The value is held in the run and made available to later steps. | A composed value addressable by later steps. | — | — | — | — | — | This step is itself a recovery path: it runs only when its predecessor did not succeed. | — | Confirmed | No external validation required | SRC-079 |

## 5.6 Decisions and branches

| ID | Name | Owner | Condition | Evaluates | Outcomes | Branches | Default | Exception behaviour | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEC-106 | Condition Watch Report | Power Automate — Folio_Failure_Watch | `{"and":[{"equals":["@outputs('Compose_Watch_Config')?['enabled']",true]},{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"or":[{"greater":["@length(outputs('Compose_Watch_Outcome')?['listed'])",0]},{"equals":["@outputs('Compose_Watch_Outcome')?['burst']",true]}]}]}` | output of Compose Watch Config<br>output of Compose Watch Outcome | true<br>false | true → Select Watch Rows, Compose Watch Totals, Compose Watch Html, Send Failure Watch Email, Create Send Failure Watch Email Receipt, Compose Send Failure Watch Email Outcome<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-107 | Condition Watch Cursor Row | Power Automate — Folio_Failure_Watch | `{"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"equals":["@not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_WATCH_CURSOR\"]/id)'))))",false]}]}` | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | true<br>false | true → Update Watch Cursor Row<br>false → Condition Watch Cursor Read | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-108 | Condition Watch Cursor Read | Power Automate — Folio_Failure_Watch | `{"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readNew']",true]},{"equals":["@not(equals(string(coalesce(actions('Condition_Watch_Report')?['status'],'')),'Failed'))",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_WATCH_CURSOR\"]/id)'))))",true]}]}` | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | true<br>false | true → Create Watch Cursor Row<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-109 | Condition Watch Health Row | Power Automate — Folio_Failure_Watch | `{"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readOpen']",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_HEALTH\"]/id)'))))",false]}]}` | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | true<br>false | true → Update Watch Health Row<br>false → Condition Watch Health Read | The false branch is declared and carries actions. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |
| DEC-110 | Condition Watch Health Read | Power Automate — Folio_Failure_Watch | `{"and":[{"equals":["@outputs('Compose_Watch_Outcome')?['readOpen']",true]},{"equals":["@empty(trim(string(xpath(outputs('Compose_Watch_Config_Xml'),'string(/r/i[k=\"NOTIFY_FAILURE_HEALTH\"]/id)'))))",true]}]}` | output of Compose Watch Outcome<br>output of Compose Watch Config Xml | true<br>false | true → Create Watch Health Row<br>false → no action; the branch is empty | No false branch is declared: when the condition does not hold, the run continues past the decision. | Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows. | Confirmed |

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | Writes to the system of record. |
| Completion criteria | The last action completes. The export declares no response to a caller. |
| Successful end state | The last action completes. The export declares no response to a caller. |
| Alternative end states | 8 recovery path(s); see 5.9. |
| Failed end states | The recovery paths listed in 5.9. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | STEP-1386 Create Send Failure Watch Email Receipt<br>STEP-1389 Update Watch Cursor Row<br>STEP-1391 Create Watch Cursor Row<br>STEP-1393 Update Watch Health Row<br>STEP-1395 Create Watch Health Row |
| Notifications issued | NOTIF-192 Send Failure Watch Email |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

| ID | Name | Triggering condition | System response | User-visible response | Retry / rollback | Recovery procedure | Responsible | Escalation | Resolution criteria | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EXC-139 | Recovery after Get Watch Config | Get Watch Config reaches Failed or TimedOut | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select Watch Config. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-140 | Recovery after Get New Failures | Get New Failures reaches Failed or TimedOut | Reads a filtered set of list items from the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Get Open Failures. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-141 | Recovery after Get Open Failures | Get Open Failures reaches Failed or TimedOut | Projects each element of a collection into a new shape. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Select New Failures. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-142 | Recovery after Send Failure Watch Email | Send Failure Watch Email reaches Failed or TimedOut | Creates a list item in the system of record. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Create Send Failure Watch Email Receipt. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-143 | Recovery after Create Send Failure Watch Email Receipt | Create Send Failure Watch Email Receipt reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Send Failure Watch Email Outcome. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-144 | Recovery after Condition Watch Report | Condition Watch Report reaches Failed or Skipped or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Condition Watch Cursor Row. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-145 | Recovery after Condition Watch Cursor Row | Condition Watch Cursor Row reaches Failed or Skipped or TimedOut | Evaluates a condition and runs one of two branches. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Condition Watch Health Row. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |
| EXC-146 | Recovery after Condition Watch Health Row | Condition Watch Health Row reaches Failed or Skipped or TimedOut | Evaluates an expression and holds the result for later steps. | Not directly visible to a caller; this step is internal to the recovery path. | No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written. | Handled inside the run by Compose Watch Run Outcome. | Power Automate — Folio_Failure_Watch | Not declared in the definition. | The recovery step completes and the run continues past it. | Confirmed |

## 5.10 Monitoring, audit and performance

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-1385 Send Failure Watch Email | Sends a message; delivery is the record. |
| STEP-1386 Create Send Failure Watch Email Receipt | Writes a list item; the write itself is the audit record. |
| STEP-1389 Update Watch Cursor Row | Writes a list item; the write itself is the audit record. |
| STEP-1391 Create Watch Cursor Row | Writes a list item; the write itself is the audit record. |
| STEP-1393 Update Watch Health Row | Writes a list item; the write itself is the audit record. |
| STEP-1395 Create Watch Health Row | Writes a list item; the write itself is the audit record. |

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
