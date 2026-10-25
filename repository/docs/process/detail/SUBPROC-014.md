# SUBPROC-014 — SLA risk

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-014 |
| Name | SLA risk |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-025` modules/fasttrack.js |

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
| STEP-0031 | Resolve the escalation | fasttrack workspace | Manual — operator-initiated |
| STEP-0032 | Notify the owner | fasttrack workspace | Manual — operator-initiated |
| STEP-0033 | Escalate the record | fasttrack workspace | Manual — operator-initiated |
| STEP-0034 | fasttrack | fasttrack workspace | Manual — operator-initiated |

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
| STEP-0031 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0032 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0033 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0034 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

4 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0031 | 1 | Resolve the escalation | modules/fasttrack.js | fasttrack workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls State.patch. | Ownership: fasttrack.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:escalation-resolved | Confirmed | No external validation required | SRC-025 SRC-044 |
| STEP-0032 | 2 | Notify the owner | modules/fasttrack.js | fasttrack workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls StaffNoticeService.send. | Ownership: fasttrack.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:fasttrack-notify-owner | Inferred | No external validation required | SRC-025 SRC-044 |
| STEP-0033 | 3 | Escalate the record | modules/fasttrack.js | fasttrack workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls State.patch+StaffNoticeService.send. | Ownership: fasttrack.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:escalation-raised | Inferred | No external validation required | SRC-025 SRC-044 |
| STEP-0034 | 4 | fasttrack | modules/fasttrack.js | fasttrack workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Performs the governed write declared for this action. | — | Not evidenced for this action. | An updated record in application state. | — | — | — | — | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | — | Inferred | No external validation required | SRC-025 SRC-009 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-035 | Confirmation control | Operator confirmation — Resolve escalation | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-073 Escalation resolved |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-030 | Audit event | Audit event audit:escalation-resolved | The governance table binds action 'resolve-escalation' to the audit vocabulary 'audit:escalation-resolved'. | — | — | Confirmed |
| MON-031 | Audit event | Audit event audit:fasttrack-notify-owner | The governance table binds action 'notify-owner' to the audit vocabulary 'audit:fasttrack-notify-owner'. | — | — | Confirmed |
| MON-032 | Audit event | Audit event audit:escalation-raised | The governance table binds action 'escalate-priority' to the audit vocabulary 'audit:escalation-raised'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0031 Resolve the escalation | audit:escalation-resolved |
| STEP-0032 Notify the owner | audit:fasttrack-notify-owner |
| STEP-0033 Escalate the record | audit:escalation-raised |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-069 | Notify the owner | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-070 | Escalate the record | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-088 | Resolve the escalation | Reusable governed write | An operator activates the control bound to this action. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
