# SUBPROC-017 — Correspondence Email Desk

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-017 |
| Name | Correspondence Email Desk |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-018` modules/correspondence-email.js |

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
| STEP-0018 | Save the letter draft | correspondence-email workspace | Manual — operator-initiated |
| STEP-0019 | Send the letter | correspondence-email workspace | Manual — operator-initiated |
| STEP-0020 | Duplicate the letter draft | correspondence-email workspace | Manual — operator-initiated |
| STEP-0021 | Archive the letter | correspondence-email workspace | Manual — operator-initiated |

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
| STEP-0018 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0019 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0020 | The record the operator has selected, and any values captured by the form attached to the control. |
| STEP-0021 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

4 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0018 | 1 | Save the letter draft | modules/correspondence-email.js | correspondence-email workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls CorrespondenceEmailService.saveDraft. | Ownership: correspondence-email.<br>Backend: none. | Not evidenced for this action. | An updated record in application state. | — | — | — | none | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:correspondence-email-draft-created | Confirmed | No external validation required | SRC-018 SRC-044 |
| STEP-0019 | 2 | Send the letter | modules/correspondence-email.js | correspondence-email workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls CorrespondenceEmailService.sendDraft. | Ownership: correspondence-email.<br>Backend: EMAIL. | Not evidenced for this action. | An updated record in application state. | — | — | — | EMAIL | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:correspondence-email-sent | Confirmed | No external validation required | SRC-018 SRC-044 |
| STEP-0020 | 3 | Duplicate the letter draft | modules/correspondence-email.js | correspondence-email workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls CorrespondenceEmailService.duplicate. | Ownership: correspondence-email.<br>Backend: none. | Not evidenced for this action. | An updated record in application state. | — | — | — | none | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:correspondence-email-duplicated | Confirmed | No external validation required | SRC-018 SRC-044 |
| STEP-0021 | 4 | Archive the letter | modules/correspondence-email.js | correspondence-email workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls CorrespondenceEmailService.archive. | Ownership: correspondence-email.<br>Backend: none. | Not evidenced for this action. | An updated record in application state. | — | — | — | none | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:correspondence-email-archived | Confirmed | No external validation required | SRC-018 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-023 | Confirmation control | Operator confirmation — Send this letter now | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |
| CTRL-024 | Confirmation control | Operator confirmation — Archive this email | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-040 Reloaded from the server<br>NOTIF-041 The server could not be reached — nothing was reloaded<br>NOTIF-042 Draft saved — it is in Drafts / Outbox and has not been sent<br>NOTIF-043 Letter sent — a copy is in the sent register<br>NOTIF-044 It could not be sent just now — it stays in the outbox and goes out when the connection is back<br>NOTIF-045 Draft duplicated<br>NOTIF-046 Archived — it is out of the outbox and was not sent |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-017 | Audit event | Audit event audit:correspondence-email-draft-created | The governance table binds action 'create-correspondence-email-draft' to the audit vocabulary 'audit:correspondence-email-draft-created'. | — | — | Confirmed |
| MON-018 | Audit event | Audit event audit:correspondence-email-sent | The governance table binds action 'send-correspondence-email' to the audit vocabulary 'audit:correspondence-email-sent'. | — | — | Confirmed |
| MON-019 | Audit event | Audit event audit:correspondence-email-duplicated | The governance table binds action 'duplicate-correspondence-email' to the audit vocabulary 'audit:correspondence-email-duplicated'. | — | — | Confirmed |
| MON-020 | Audit event | Audit event audit:correspondence-email-archived | The governance table binds action 'archive-correspondence-email' to the audit vocabulary 'audit:correspondence-email-archived'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0018 Save the letter draft | audit:correspondence-email-draft-created |
| STEP-0019 Send the letter | audit:correspondence-email-sent |
| STEP-0020 Duplicate the letter draft | audit:correspondence-email-duplicated |
| STEP-0021 Archive the letter | audit:correspondence-email-archived |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-052 | Save the letter draft | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-053 | Send the letter | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-054 | Duplicate the letter draft | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-055 | Archive the letter | Reusable governed write | An operator activates the control bound to this action. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
