# SUBPROC-016 — DGCEO Correspondence & Decision Hub

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-016 |
| Name | DGCEO Correspondence & Decision Hub |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-024` modules/executive.js |

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
| STEP-0026 | Add the minute | executive workspace | Manual — operator-initiated |
| STEP-0027 | Route the task | single-assignment workspace | Manual — operator-initiated |
| STEP-0028 | Record the executive approval | executive workspace | Manual — operator-initiated |
| STEP-0029 | Return the item to the sender | executive workspace | Manual — operator-initiated |
| STEP-0030 | Delegate the item | executive workspace | Manual — operator-initiated |

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
| STEP-0026 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0027 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0028 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0029 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0030 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

5 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0026 | 1 | Add the minute | modules/executive.js | executive workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls State.patch. | Ownership: executive.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:executive-minute | Confirmed | No external validation required | SRC-024 SRC-044 |
| STEP-0027 | 2 | Route the task | modules/executive.js | single-assignment workspace | An operator activates the control that raises this action. | executive is a declared allowed invoker; ownership of the action rests with single-assignment.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls createTask. | Ownership: single-assignment; allowed invokers executive.<br>Backend: SINGLE_ASSIGNMENT. | Not evidenced for this action. | An updated record in application state. | — | — | — | SINGLE_ASSIGNMENT | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:task-routed | Confirmed | No external validation required | SRC-024 SRC-044 |
| STEP-0028 | 3 | Record the executive approval | modules/executive.js | executive workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls governedTransition. | Ownership: executive.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:executive-approved | Inferred | No external validation required | SRC-024 SRC-044 |
| STEP-0029 | 4 | Return the item to the sender | modules/executive.js | executive workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls governedTransition. | Ownership: executive.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:executive-returned | Inferred | No external validation required | SRC-024 SRC-044 |
| STEP-0030 | 5 | Delegate the item | modules/executive.js | executive workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls governedTransition+StaffNoticeService.send. | Ownership: executive.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:executive-escalated | Inferred | No external validation required | SRC-024 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-033 | Confirmation control | Operator confirmation — Append quick minute | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-034 | Confirmation control | Operator confirmation — Open in the Assignment Desk | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-069 Choose who the item is delegated to first<br>NOTIF-070 Enter a quick minute first<br>NOTIF-071 Select an assignee<br>NOTIF-072 Your role cannot open the Assignment Desk |
| Downstream handoffs | Workspace single-assignment |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-025 | Audit event | Audit event audit:executive-minute | The governance table binds action 'append-minute' to the audit vocabulary 'audit:executive-minute'. | — | — | Confirmed |
| MON-026 | Audit event | Audit event audit:task-routed | The governance table binds action 'route-task' to the audit vocabulary 'audit:task-routed'. | — | — | Confirmed |
| MON-027 | Audit event | Audit event audit:executive-approved | The governance table binds action 'executive-approve' to the audit vocabulary 'audit:executive-approved'. | — | — | Confirmed |
| MON-028 | Audit event | Audit event audit:executive-returned | The governance table binds action 'executive-return' to the audit vocabulary 'audit:executive-returned'. | — | — | Confirmed |
| MON-029 | Audit event | Audit event audit:executive-escalated | The governance table binds action 'executive-escalate' to the audit vocabulary 'audit:executive-escalated'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0026 Add the minute | audit:executive-minute |
| STEP-0027 Route the task | audit:task-routed |
| STEP-0028 Record the executive approval | audit:executive-approved |
| STEP-0029 Return the item to the sender | audit:executive-returned |
| STEP-0030 Delegate the item | audit:executive-escalated |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-047 | Record the executive approval | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-063 | Return the item to the sender | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-064 | Delegate the item | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-065 | Add the minute | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-009 | Executive decision hub — as DGCEO | Role-specific variant | The same workspace, with a different set of decision panels shown. The rendered root carries class role-DGCEO, and the stylesheet hides the panels the other roles own. | role(profile.email) resolves to 'DGCEO'. It is derived from substrings of the email address, not from the role model. |
| VAR-010 | Executive decision hub — as Officer | Role-specific variant | The same workspace, with a different set of decision panels shown. The rendered root carries class role-Officer, and the stylesheet hides the panels the other roles own. | role(profile.email) resolves to 'Officer'. It is derived from substrings of the email address, not from the role model. |
| VAR-011 | Executive decision hub — as EA | Role-specific variant | The same workspace, with a different set of decision panels shown. The rendered root carries class role-EA, and the stylesheet hides the panels the other roles own. | role(profile.email) resolves to 'EA'. It is derived from substrings of the email address, not from the role model. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-011 | Workspace single-assignment | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
