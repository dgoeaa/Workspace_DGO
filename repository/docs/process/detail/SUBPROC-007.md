# SUBPROC-007 — Assignment Desk

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-007 |
| Name | Assignment Desk |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-039` modules/single-assignment.js |

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
| STEP-0048 | Assign that record | single-assignment workspace | Manual — operator-initiated |
| STEP-0049 | Tell the new assignee of the reassignment | single-assignment workspace | Manual — operator-initiated |

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
| STEP-0048 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0049 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

2 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0048 | 1 | Assign that record | modules/single-assignment.js | single-assignment workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Entities.create(task). | Ownership: single-assignment.<br>Backend: SINGLE_ASSIGNMENT. | Not evidenced for this action. | An updated record in application state. | — | — | — | SINGLE_ASSIGNMENT | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:assigned | Confirmed | No external validation required | SRC-039 SRC-044 |
| STEP-0049 | 2 | Tell the new assignee of the reassignment | modules/single-assignment.js | single-assignment workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls StaffNoticeService.send. | Ownership: single-assignment.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:reassignment-notified | Confirmed | No external validation required | SRC-039 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Rules

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Owner | Evidence | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RULE-008 | Routing rule | Support routing — Reassignment Request | Support requests of category 'Reassignment Request' are routed to single-assignment. | A support request is raised. | category = 'reassignment' | Route to single-assignment at severity medium. | The request appears in the receiving workspace. | Not evidenced for a category the table does not carry. | — | Confirmed | — |

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-054 | Confirmation control | Operator confirmation — Confirm assignment | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-115 Records reloaded from the server<br>NOTIF-116 The server could not be reached — nothing was reloaded<br>NOTIF-117 Assignment draft saved<br>NOTIF-118 Assignment draft cleared<br>NOTIF-119 Assigned to — enter a valid email address. This is where the assignment notice goes.<br>NOTIF-120 Supporting assignee — enter a valid email address, or leave it blank. This is where the copy of the assignment goes.<br>NOTIF-121 Saved on this device — it will be sent to the server when the connection returns |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-046 | Audit event | Audit event audit:assigned | The governance table binds action 'assign-one' to the audit vocabulary 'audit:assigned'. | — | — | Confirmed |
| MON-047 | Audit event | Audit event audit:reassignment-notified | The governance table binds action 'reassign' to the audit vocabulary 'audit:reassignment-notified'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0048 Assign that record | audit:assigned |
| STEP-0049 Tell the new assignee of the reassignment | audit:reassignment-notified |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-040 | Assign that record | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-066 | Route the task | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-071 | Tell the new assignee of the reassignment | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-084 | Raise a task from that email | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-003 | route the task — raised from executive | Channel-specific variant | The same governed action, raised from executive instead of from its owner single-assignment. | An operator working in executive takes the action. |
| VAR-007 | raise a task from that email — raised from lookup | Channel-specific variant | The same governed action, raised from lookup instead of from its owner single-assignment. | An operator working in lookup takes the action. |
| VAR-008 | raise a task from that email — raised from correspondence | Channel-specific variant | The same governed action, raised from correspondence instead of from its owner single-assignment. | An operator working in correspondence takes the action. |
| VAR-013 | Support request — Reassignment Request | Conditional variant selected by the reported category | A support request of category 'Reassignment Request' is routed to the single-assignment workspace at severity medium, rather than into a single support queue. | The requester selects category 'reassignment'. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-019 | Endpoint alias SINGLE_ASSIGNMENT | Integration | Runtime integration call | Outbound - the workspace calls the endpoint | Not determinable from the call site alone; the governance table states per action whether the backend is required or optional. | The call fails. Whether the operator write survives depends on whether the action declares the backend required or optional. |
| DEP-027 | Endpoint SINGLE_ASSIGNMENT | Integration | Direct HTTP call to a Power Automate flow | Outbound | Declared in the endpoint registry as a named alias. Whether a given call is mandatory is stated per action in the governance table, not here. | Every call routed through this alias fails. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
