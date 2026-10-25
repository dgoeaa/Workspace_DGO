# SUBPROC-019 — Archive Evidence

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | SUBPROC-019 |
| Name | Archive Evidence |
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
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-013` modules/archive.js |

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
| STEP-0011 | Archive the reference | archive workspace | Manual — operator-initiated |

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
| STEP-0011 | The record the operator has selected, and any values captured by the form attached to the control. |

## 5.5 Stages and activities

1 step(s).

| Step | Seq | Name | Container | Responsible | Trigger | Preconditions | Inputs | Action performed | Rules | System response | Output | Resulting status | Next step | Alternative next | Dependencies | Controls | Exceptions | Audit event | Evidence | Validation | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STEP-0011 | 1 | Archive the reference | modules/archive.js | archive workspace | An operator activates the control that raises this action. | The action is owned by this workspace.<br>The operator reaches the route, which canAccess() gates on their role. | The record the operator has selected, and any values captured by the form attached to the control. | Calls ArchiveService.archiveReference. | Ownership: archive.<br>Backend: ARCHIVE_REFERENCE.optional. | A backend call on ARCHIVE_REFERENCE is attempted; the local record stands when it fails and synchronisation is queued. | An updated record in application state. | — | — | — | ARCHIVE_REFERENCE | Governed through executeOwnedAction(), which refuses an action a module does not own and is not an allowed invoker of. | — | audit:archived | Confirmed | No external validation required | SRC-013 SRC-044 |

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

### Rules

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Owner | Evidence | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RULE-001 | Retention and archival rule | Retention — Official correspondence | Records classified 'Official correspondence' are retained for 7 year(s). | A record is archived and its retention is calculated. | retentionClass = 'Official correspondence' | retentionUntil is set to the archive date plus 7 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |
| RULE-002 | Retention and archival rule | Retention — Financial | Records classified 'Financial' are retained for 7 year(s). | A record is archived and its retention is calculated. | retentionClass = 'Financial' | retentionUntil is set to the archive date plus 7 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |
| RULE-003 | Retention and archival rule | Retention — Legal | Records classified 'Legal' are retained for 10 year(s). | A record is archived and its retention is calculated. | retentionClass = 'Legal' | retentionUntil is set to the archive date plus 10 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |
| RULE-004 | Retention and archival rule | Retention — Executive directive | Records classified 'Executive directive' are retained for 10 year(s). | A record is archived and its retention is calculated. | retentionClass = 'Executive directive' | retentionUntil is set to the archive date plus 10 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |
| RULE-005 | Retention and archival rule | Retention — Routine administrative | Records classified 'Routine administrative' are retained for 5 year(s). | A record is archived and its retention is calculated. | retentionClass = 'Routine administrative' | retentionUntil is set to the archive date plus 5 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |
| RULE-006 | Retention and archival rule | Retention — General | Records classified 'General' are retained for 3 year(s). | A record is archived and its retention is calculated. | retentionClass = 'General' | retentionUntil is set to the archive date plus 3 year(s). | The record carries a retention date and a security class. | A record whose class is not in this table falls to the default of 7 year(s). | — | Confirmed | Requires confirmation by the registry owner |

### Controls

| ID | Type | Name | Description | Trigger | Condition | Expected behaviour | Outcome | Exception | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CTRL-017 | Confirmation control | Operator confirmation — Close this reference for good | The operator is shown what is about to happen and must confirm before the write is attempted. | The operator activates the control this dialog guards. | Confirmation is given. | The governed write proceeds. | Declining returns to the workspace with nothing written. | Not evidenced beyond the decline path. | Confirmed |

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
| Notifications issued | NOTIF-024 References reloaded from the server<br>NOTIF-025 The server could not be reached — nothing was reloaded |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

| ID | Kind | Name | Description | Threshold | Escalation threshold | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| MON-011 | Audit event | Audit event audit:archived | The governance table binds action 'archive-reference' to the audit vocabulary 'audit:archived'. | — | — | Confirmed |

### Audit events written by this process

| Step | Audit event |
| --- | --- |
| STEP-0011 Archive the reference | audit:archived |

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-049 | Archive the reference | Reusable governed write | An operator activates the control bound to this action. |
| SUBPROC-076 | Archive the file | Reusable governed write | An operator activates the control bound to this action. |

### Variants

| ID | Name | Kind | Differs from the primary path | Activation |
| --- | --- | --- | --- | --- |
| VAR-004 | archive the file — raised from registry | Channel-specific variant | The same governed action, raised from registry instead of from its owner archive. | An operator working in registry takes the action. |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
