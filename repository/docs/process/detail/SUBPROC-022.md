# SUBPROC-022 — Briefs & Submissions

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-022 |
| Name | Briefs & Submissions |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-015` modules/briefs.js |

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
| STEP-0013 | Create the brief | briefs workspace | Manual — operator-initiated |
| STEP-0014 | Submit the brief | briefs workspace | Manual — operator-initiated |
| STEP-0015 | Record the decision on the brief | briefs workspace | Manual — operator-initiated |

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
| STEP-0013 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0014 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0015 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

3 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0013 | 1 | Create the brief | modules/briefs.js | briefs workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Briefs.create. | Ownership: briefs.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:brief-created | Confirmed | No external validation required | SRC-015 SRC-044 |
| STEP-0014 | 2 | Submit the brief | modules/briefs.js | briefs workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Briefs.transition. | Ownership: briefs.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:brief-submitted | Confirmed | No external validation required | SRC-015 SRC-044 |
| STEP-0015 | 3 | Record the decision on the brief | modules/briefs.js | briefs workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Briefs.transition. | Ownership: briefs.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:brief-decided | Confirmed | No external validation required | SRC-015 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-020 | Confirmation control | Operator confirmation — Save this brief as a draft | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-031 Briefs reloaded from the server<br>NOTIF-032 The server could not be reached — nothing was reloaded<br>NOTIF-033 Brief saved as a draft on the server |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-012 | Audit event | Audit event audit:brief-created | The governance table binds action 'create-brief' to the audit vocabulary 'audit:brief-created'. | — | — | Confirmed |
| MON-013 | Audit event | Audit event audit:brief-submitted | The governance table binds action 'submit-brief' to the audit vocabulary 'audit:brief-submitted'. | — | — | Confirmed |
| MON-014 | Audit event | Audit event audit:brief-decided | The governance table binds action 'decide-brief' to the audit vocabulary 'audit:brief-decided'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0013 Create the brief | audit:brief-created |
| STEP-0014 Submit the brief | audit:brief-submitted |
| STEP-0015 Record the decision on the brief | audit:brief-decided |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-029 | Create the brief | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-030 | Submit the brief | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-031 | Record the decision on the brief | Reusable governed write | An operator activates the control bound to this action. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
