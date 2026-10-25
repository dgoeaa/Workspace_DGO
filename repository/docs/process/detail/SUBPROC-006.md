# SUBPROC-006 — Activities

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-006 |
| Name | Activities |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-010` modules/activities.js |

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
| STEP-0003 | Save the work state | activities workspace | Manual — operator-initiated |
| STEP-0004 | Mark the document | activities workspace | Manual — operator-initiated |
| STEP-0005 | Archive the activity | activities workspace | Manual — operator-initiated |
| STEP-0006 | Route the activity to SIWES | activities workspace | Manual — operator-initiated |
| STEP-0007 | Route the activity to NYSC | activities workspace | Manual — operator-initiated |

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
| STEP-0003 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0004 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0005 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0006 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0007 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

5 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0003 | 1 | Save the work state | modules/activities.js | activities workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls updateTaskState. | Ownership: activities.<br>Backend: DYNAMIC_ACTIONS.update-task. | Not evidenced for this action. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:operation-updated | Confirmed | No external validation required | SRC-010 SRC-044 |
| STEP-0004 | 2 | Mark the document | modules/activities.js | activities workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls State.patch. | Ownership: activities; allowed invokers lookup.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:document-flagged | Confirmed | No external validation required | SRC-010 SRC-044 |
| STEP-0005 | 3 | Archive the activity | modules/activities.js | activities workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend. | Ownership: activities.<br>Backend: DYNAMIC_ACTIONS. | Not evidenced for this action. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:activity-archived | Inferred | No external validation required | SRC-010 SRC-044 |
| STEP-0006 | 4 | Route the activity to SIWES | modules/activities.js | activities workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend. | Ownership: activities.<br>Backend: DYNAMIC_ACTIONS. | Not evidenced for this action. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:activity-siwes-routed | Inferred | No external validation required | SRC-010 SRC-044 |
| STEP-0007 | 5 | Route the activity to NYSC | modules/activities.js | activities workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls ActivityParity.planLifecycleAction+ActivityParity.commitLifecycleAction+WriteManager.backend. | Ownership: activities.<br>Backend: DYNAMIC_ACTIONS. | Not evidenced for this action. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:activity-nysc-routed | Inferred | No external validation required | SRC-010 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-016 | Confirmation control | Operator confirmation — Update operational state | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-002 Completed work must be 100% progressed<br>NOTIF-003 A blocked reason is required<br>NOTIF-004 Work state saved on the server<br>NOTIF-005 Flag recorded; synchronization queued<br>NOTIF-006 Attachments could not be refreshed |
| Downstream handoffs | Workspace comments<br>Workspace approvals<br>Workspace registry |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-003 | Audit event | Audit event audit:operation-updated | The governance table binds action 'update-operation' to the audit vocabulary 'audit:operation-updated'. | — | — | Confirmed |
| MON-004 | Audit event | Audit event audit:document-flagged | The governance table binds action 'flag-document' to the audit vocabulary 'audit:document-flagged'. | — | — | Confirmed |
| MON-005 | Audit event | Audit event audit:activity-archived | The governance table binds action 'activity-archive' to the audit vocabulary 'audit:activity-archived'. | — | — | Confirmed |
| MON-006 | Audit event | Audit event audit:activity-siwes-routed | The governance table binds action 'activity-siwes' to the audit vocabulary 'audit:activity-siwes-routed'. | — | — | Confirmed |
| MON-007 | Audit event | Audit event audit:activity-nysc-routed | The governance table binds action 'activity-nysc' to the audit vocabulary 'audit:activity-nysc-routed'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0003 Save the work state | audit:operation-updated |
| STEP-0004 Mark the document | audit:document-flagged |
| STEP-0005 Archive the activity | audit:activity-archived |
| STEP-0006 Route the activity to SIWES | audit:activity-siwes-routed |
| STEP-0007 Route the activity to NYSC | audit:activity-nysc-routed |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-077 | Save the work state | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-082 | Mark the document | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-089 | Archive the activity | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-090 | Route the activity to SIWES | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-091 | Route the activity to NYSC | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-005 | mark the document — raised from lookup | Channel-specific variant | The same governed action, raised from lookup instead of from its owner activities. | An operator working in lookup takes the action. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-004 | Endpoint alias FETCH_EMAIL_ATTACHMENTS | Integration | Runtime integration call | Outbound - the workspace calls the endpoint | Not determinable from the call site alone; the governance table states per action whether the backend is required or optional. | The call fails. Whether the operator write survives depends on whether the action declares the backend required or optional. |
| DEP-005 | Workspace comments | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-006 | Workspace approvals | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-007 | Workspace registry | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-026 | Endpoint FETCH_EMAIL_ATTACHMENTS | Integration | Direct HTTP call to a Power Automate flow | Outbound | Declared in the endpoint registry as a named alias. Whether a given call is mandatory is stated per action in the governance table, not here. | Every call routed through this alias fails. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
