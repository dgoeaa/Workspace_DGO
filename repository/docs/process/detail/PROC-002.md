# PROC-002 — Inbox

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-002 |
| Name | Inbox |
| Alternative or legacy name | Route 'correspondence' |
| Category | User-initiated · operational |
| Description | Every incoming record in one list, from the public portal, email, counter / scan and internal origination: register a document, open a record to triage and assign it, or assign several at once. |
| Description declared in the artifact itself | — |
| Business objective | Every incoming record in one list, from the public portal, email, counter / scan and internal origination: register a document, open a record to triage and assign it, or assign several at once. |
| Operational objective | Boundary role 'intake-master'. Owns create-correspondence, triage, classify, hold, reject, duplicate, send-to-routing; must not own registry-custody, task-execution, archive-execution. |
| Process owner | The correspondence module, per the per-action governance table. |
| Criticality | Not evidenced. No supplied artifact grades a workspace by criticality. |
| Business area / group | OPERATIONS |
| Related modules | modules/correspondence.js |
| Related features | create-correspondence<br>triage<br>classify<br>hold<br>reject<br>duplicate<br>send-to-routing |
| Evidence classification | Confirmed |
| Evidence note | Declared in the workspace configuration, implemented by a module of the same route name, and bounded by the module boundary charter. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | No external validation required |
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-019` modules/correspondence.js<br>`SRC-009` config/module-boundaries.config.js |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | An operator holding a role with access to this route. |
| Participating roles | systemAdmin<br>director<br>operator |
| Accountable owner | The correspondence module, per the per-action governance table. |
| Supporting systems | DGO Internal Platform<br>Microsoft Power Automate |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

### Responsible actor per step

| Step | Name | Responsible | Kind |
| --- | --- | --- | --- |
| STEP-0022 | Log the correspondence | correspondence workspace | Manual — operator-initiated |
| STEP-0023 | Update the record | correspondence workspace | Manual — operator-initiated |
| STEP-0024 | Turn the email into a correspondence record | correspondence workspace | Manual — operator-initiated |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | An operator opens the route from the sidebar, or another workspace hands them the record. |
| Trigger type | User-initiated · operational |
| Entry criteria | canAccess() admits the role to this route. |
| Required roles and permissions | systemAdmin<br>director<br>operator |
| Required configuration | modules/correspondence.js |
| Required system availability | DGO Internal Platform<br>Microsoft Power Automate |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

| Step | Required inputs |
| --- | --- |
| STEP-0022 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0023 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0024 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

3 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0022 | 1 | Log the correspondence | modules/correspondence.js | correspondence workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Entities.create. | Ownership: correspondence; allowed invokers scan-intake.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:correspondence-created | Confirmed | No external validation required | SRC-019 SRC-044 |
| STEP-0023 | 2 | Update the record | modules/correspondence.js | correspondence workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Entities.transitionStatus. | Ownership: correspondence.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:triage-completed | Confirmed | No external validation required | SRC-019 SRC-044 |
| STEP-0024 | 3 | Turn the email into a correspondence record | modules/correspondence.js | correspondence workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls Entities.create. | Ownership: correspondence.<br>Backend: DYNAMIC_ACTIONS.optional. | A backend call on DYNAMIC_ACTIONS is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | DYNAMIC_ACTIONS | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:email-converted | Confirmed | No external validation required | SRC-019 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-025 | Confirmation control | Operator confirmation — Confirm new record | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-026 | Confirmation control | Operator confirmation — Confirm record update | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-027 | Confirmation control | Operator confirmation — Refresh records from the server | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-028 | Confirmation control | Operator confirmation — Register this e-mail | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | An updated record and an audit entry. |
| Completion criteria | The operator completes one of its governed writes: create-correspondence, portal-status-writeback, triage, convert-email. |
| Successful end state | The operator completes one of its governed writes: create-correspondence, portal-status-writeback, triage, convert-email. |
| Alternative end states | Not evidenced. |
| Failed end states | Not evidenced. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | NOTIF-047 AI values placed in the form — submit to save<br>NOTIF-048 Sent to the Registry for registration<br>NOTIF-049 Opening Bulk Assignment for this record<br>NOTIF-050 Task assigned from correspondence<br>NOTIF-051 Opening source document<br>NOTIF-052 No source document is attached to this record<br>NOTIF-053 No data available to export<br>NOTIF-054 Records refreshed from the server<br>NOTIF-055 The server could not be reached — the refresh is waiting to run |
| Downstream handoffs | Workspace registry<br>Workspace bulk-assignment |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-021 | Audit event | Audit event audit:correspondence-created | The governance table binds action 'create-correspondence' to the audit vocabulary 'audit:correspondence-created'. | — | — | Confirmed |
| MON-022 | Audit event | Audit event audit:triage-completed | The governance table binds action 'triage' to the audit vocabulary 'audit:triage-completed'. | — | — | Confirmed |
| MON-023 | Audit event | Audit event audit:email-converted | The governance table binds action 'convert-email' to the audit vocabulary 'audit:email-converted'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0022 Log the correspondence | audit:correspondence-created |
| STEP-0023 Update the record | audit:triage-completed |
| STEP-0024 Turn the email into a correspondence record | audit:email-converted |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-005 | Registry Scan Intake | Sub-view of a primary workspace | — |
| SUBPROC-006 | Activities | Sub-view of a primary workspace | — |
| SUBPROC-007 | Assignment Desk | Sub-view of a primary workspace | — |
| SUBPROC-008 | Bulk Assignment | Sub-view of a primary workspace | — |
| SUBPROC-009 | Registry | Sub-view of a primary workspace | — |
| SUBPROC-010 | Lookup & Direct Action | Sub-view of a primary workspace | — |
| SUBPROC-028 | Log the correspondence | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-038 | Set the portal submission\ | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-039 | Update the record | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-085 | Turn the email into a correspondence record | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-001 | log the correspondence — raised from scan-intake | Channel-specific variant | The same governed action, raised from scan-intake instead of from its owner correspondence. | An operator working in scan-intake takes the action. |

### Dependencies

| ID | Supporting | Kind | Type | Direction | Mandatory | Impact if unavailable |
| --- | --- | --- | --- | --- | --- | --- |
| DEP-009 | Workspace registry | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |
| DEP-010 | Workspace bulk-assignment | Process | Process handoff | Downstream - this workspace sends the operator and the selected record on | Optional: the handoff is taken only on the path that navigates. | The operator cannot complete the onward step from here; the record stays in its current state. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
