# SUBPROC-010 — Lookup & Direct Action

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-010 |
| Name | Lookup & Direct Action |
| Alternative or legacy name | — |
| Category | Sub-view of a primary workspace |
| Description | — |
| Description declared in the artifact itself | — |
| Business objective | — |
| Operational objective | — |
| Process owner | — |
| Criticality | — |
| Business area / group | — |
| Related modules | — |
| Related features | — |
| Evidence classification | Confirmed |
| Evidence note | Declared a redirected route with its destination and the reason in the workspace configuration. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | No external validation required |
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-028` modules/lookup.js |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced — recorded as an ownership gap. |
| Supporting systems | — |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-0035 | Mark the document | activities workspace | Manual — operator-initiated |
| STEP-0036 | Update the task | orchestrator workspace | Manual — operator-initiated |
| STEP-0037 | Raise a task from that email | single-assignment workspace | Manual — operator-initiated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | — |
| Trigger type | Sub-view of a primary workspace |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | — |
| Required system availability | — |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0035 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0036 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0037 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

3 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0035 | 1 | Mark the document | modules/lookup.js | activities workspace | An operator activates the control that raises this action. | lookup is a declared allowed invoker; ownership of the action rests with activities.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls State.patch. | Ownership: activities; allowed invokers lookup.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:document-flagged | Confirmed | No external validation required | SRC-028 SRC-044 |
| STEP-0036 | 2 | Update the task | modules/lookup.js | orchestrator workspace | An operator activates the control that raises this action. | lookup is a declared allowed invoker; ownership of the action rests with orchestrator.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls updateTaskState. | Ownership: orchestrator; allowed invokers lookup.<br>Backend: DYNAMIC_ACTIONS.update-task. | Not evidenced for this action. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:task-updated | Confirmed | No external validation required | SRC-028 SRC-044 |
| STEP-0037 | 3 | Raise a task from that email | modules/lookup.js | single-assignment workspace | An operator activates the control that raises this action. | lookup is a declared allowed invoker; ownership of the action rests with single-assignment.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls createTask. | Ownership: single-assignment; allowed invokers lookup, correspondence.<br>Backend: EMAIL_RELATED_TASK. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL_RELATED_TASK | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:email-task-created | Confirmed | No external validation required | SRC-028 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Rules

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Owner | Evidence | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RULE-012 | Routing rule | Support routing — Wrong Task or Reference | Support requests of category 'Wrong Task or Reference' are routed to lookup. | A support request is raised. | category = 'wrong-task' | Route to lookup at severity high. | The request appears in the receiving workspace. | Not evidenced for a category the table does not carry. | — | Confirmed | — |

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-036 | Confirmation control | Operator confirmation — Ask the server for this record | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-037 | Confirmation control | Operator confirmation — Update this task | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-038 | Confirmation control | Operator confirmation — Raise a task from this email | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | — |
| Completion criteria | — |
| Successful end state | — |
| Alternative end states | Not evidenced. |
| Failed end states | Not evidenced. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | NOTIF-075 Records reloaded from the server<br>NOTIF-076 The server could not be reached — nothing was reloaded<br>NOTIF-077 Enter a number, reference or title first<br>NOTIF-078 The server has been asked for this record — it joins the results when it comes back<br>NOTIF-079 The server could not be reached, so only the records already on this device were searched<br>NOTIF-080 The mark is saved here — it goes to the server when the connection is back<br>NOTIF-081 The task is saved here — it goes to the server when the connection is back |
| Downstream handoffs | Workspace single-assignment |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-033 | Audit event | Audit event audit:document-flagged | The governance table binds action 'flag-document' to the audit vocabulary 'audit:document-flagged'. | — | — | Confirmed |
| MON-034 | Audit event | Audit event audit:task-updated | The governance table binds action 'update-task' to the audit vocabulary 'audit:task-updated'. | — | — | Confirmed |
| MON-035 | Audit event | Audit event audit:email-task-created | The governance table binds action 'create-task-from-email' to the audit vocabulary 'audit:email-task-created'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0035 Mark the document | audit:document-flagged |
| STEP-0036 Update the task | audit:task-updated |
| STEP-0037 Raise a task from that email | audit:email-task-created |

## Relationships

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-017 | Support request — Wrong Task or Reference | Conditional variant selected by the reported category | A support request of category 'Wrong Task or Reference' is routed to the lookup workspace at severity high, rather than into a single support queue. | The requester selects category 'wrong-task'. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-012 | Workspace single-assignment | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
