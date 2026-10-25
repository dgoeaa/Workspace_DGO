# SUBPROC-011 — Acknowledgment Queue

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-011 |
| Name | Acknowledgment Queue |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-008` modules/acknowledgment.js |

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
| STEP-0001 | Record the acknowledgment | acknowledgment workspace | Manual — operator-initiated |
| STEP-0002 | Send the reminder | acknowledgment workspace | Manual — operator-initiated |

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
| STEP-0001 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0002 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

2 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0001 | 1 | Record the acknowledgment | modules/acknowledgment.js | acknowledgment workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls AcknowledgementService.submit. | Ownership: acknowledgment; allowed invokers orchestrator.<br>Backend: SUBSIDIARY_ACTIONS. | Not evidenced for this action. | An updated record in application state. | — | — | — | SUBSIDIARY_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:acknowledged | Confirmed | No external validation required | SRC-008 SRC-044 |
| STEP-0002 | 2 | Send the reminder | modules/acknowledgment.js | acknowledgment workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls StaffNoticeService.send. | Ownership: acknowledgment.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:ack-reminder | Confirmed | No external validation required | SRC-008 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Rules

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Owner | Evidence | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RULE-013 | Routing rule | Support routing — Already Acknowledged | Support requests of category 'Already Acknowledged' are routed to acknowledgment. | A support request is raised. | category = 'already-acknowledged' | Route to acknowledgment at severity normal. | The request appears in the receiving workspace. | Not evidenced for a category the table does not carry. | — | Confirmed | — |

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-014 | Confirmation control | Operator confirmation — Confirm receipt of this task | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-015 | Confirmation control | Operator confirmation — Remind the assignee to acknowledge | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-058 | Completion and audit control | Acknowledgement receipt | Receipt of an assignment is confirmed and recorded before work starts. | An assignee acknowledges an assignment. | The payload carries every required field, including an idempotency key. | A receipt is written to the ledger with actor, time, source and the idempotency key. | A duplicate acknowledgement inside the dedupe window is recognised as the same receipt, not a second one. | A failed send is retried under the declared retry policy and queued when it cannot be delivered. | Confirmed |

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
| Notifications issued | NOTIF-001 This task has no attachments |
| Downstream handoffs | Workspace response-tracking<br>Workspace orchestrator<br>Workspace single-assignment |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-001 | Audit event | Audit event audit:acknowledged | The governance table binds action 'acknowledge' to the audit vocabulary 'audit:acknowledged'. | — | — | Confirmed |
| MON-002 | Audit event | Audit event audit:ack-reminder | The governance table binds action 'remind-assignee' to the audit vocabulary 'audit:ack-reminder'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0001 Record the acknowledgment | audit:acknowledged |
| STEP-0002 Send the reminder | audit:ack-reminder |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-042 | Record the acknowledgment | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-043 | Send the acknowledgments still waiting | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-068 | Send the reminder | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-002 | record the acknowledgment — raised from orchestrator | Channel-specific variant | The same governed action, raised from orchestrator instead of from its owner acknowledgment. | An operator working in orchestrator takes the action. |
| VAR-018 | Support request — Already Acknowledged | Conditional variant selected by the reported category | A support request of category 'Already Acknowledged' is routed to the acknowledgment workspace at severity normal, rather than into a single support queue. | The requester selects category 'already-acknowledged'. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-001 | Workspace response-tracking | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-002 | Workspace orchestrator | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-003 | Workspace single-assignment | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
