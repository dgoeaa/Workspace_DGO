# PROC-004 — Administration

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-004 |
| Name | Administration |
| Alternative or legacy name | Route 'admin-suite' |
| Category | User-initiated · operational |
| Description | Platform administration for IT and user administrators: the suite, settings, health and users. |
| Description declared in the artifact itself | — |
| Business objective | Platform administration for IT and user administrators: the suite, settings, health and users. |
| Operational objective | Boundary role 'administration-console'. Owns administrative-action-catalogue, endpoint-estate-oversight, flow-request-shapes, live-endpoint-checks, commissioning-register, capsule-registry-administration, platform-control, evidence-export; must not own business-workflow-action, create-user, assign-one, approve, dispatch-execution, archive-execution. |
| Process owner | — |
| Criticality | Not evidenced. No supplied artifact grades a workspace by criticality. |
| Business area / group | SYSTEM |
| Related modules | modules/admin-suite.js |
| Related features | administrative-action-catalogue<br>endpoint-estate-oversight<br>flow-request-shapes<br>live-endpoint-checks<br>commissioning-register<br>capsule-registry-administration<br>platform-control<br>evidence-export |
| Evidence classification | Confirmed |
| Evidence note | Declared in the workspace configuration, implemented by a module of the same route name, and bounded by the module boundary charter. |
| Documentation status | Documented in part; named attributes outstanding |
| Validation status | No external validation required |
| Sources | `SRC-045` config/workflow-clarity.config.js<br>`SRC-011` modules/admin-suite.js<br>`SRC-009` config/module-boundaries.config.js |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | An operator holding a role with access to this route. |
| Participating roles | systemAdmin<br>userAdmin |
| Accountable owner | Not evidenced — recorded as an ownership gap. |
| Supporting systems | DGO Internal Platform |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | An operator opens the route from the sidebar, or another workspace hands them the record. |
| Trigger type | User-initiated · operational |
| Entry criteria | canAccess() admits the role to this route. |
| Required roles and permissions | systemAdmin<br>userAdmin |
| Required configuration | modules/admin-suite.js |
| Required system availability | DGO Internal Platform |
| Scheduling conditions | None: this process is not scheduled. |

## 5.4 Inputs

_No step-level inputs are evidenced for this process._

## 5.5 Stages and activities

_No steps are readable for this process from the supplied inputs. See the gap register._

## 5.6 Decisions and branches

_No decision point is evidenced in this process._

## 5.7 Business rules and controls

_No rule or control is bound to this process in the supplied inputs._

## 5.8 Outputs and completion

| Attribute | Value |
| --- | --- |
| Primary output | A view over records already held. |
| Completion criteria | Not evidenced. This workspace declares no governed write of its own, so it has no completion event beyond leaving it. |
| Successful end state | Not evidenced. This workspace declares no governed write of its own, so it has no completion event beyond leaving it. |
| Alternative end states | Not evidenced. |
| Failed end states | Not evidenced. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | NOTIF-007 Every override on this device was cleared. Each connection now uses the installed address.<br>NOTIF-008 Downloaded. Every signature is replaced by ***, so it is safe to send to support.<br>NOTIF-009 Alignment report downloaded.<br>NOTIF-010 Copied. The signature is redacted, so replace the *** before running it.<br>NOTIF-011 Shown below — this browser refused clipboard access, so copy it by hand. The signature is redacted.<br>NOTIF-012 Five tables downloaded. None carries an endpoint URL or a signature.<br>NOTIF-013 Commissioning record downloaded.<br>NOTIF-014 The commissioning record was reset. Every answer, status and piece of evidence is gone.<br>NOTIF-015 Access directory downloaded.<br>NOTIF-016 Reloaded from the server.<br>NOTIF-017 Device state downloaded. Endpoint overrides are redacted.<br>NOTIF-018 Audit trail downloaded.<br>NOTIF-019 Evidence bundle downloaded. Signatures are redacted throughout.<br>NOTIF-020 Residual risk recorded. The release gate does not clear while it is open.<br>NOTIF-021 Hypercare saved.<br>NOTIF-022 Disconnected. The token was never written to disk and is now gone from this tab. |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

_No monitoring control, metric, service-level expectation or audit event is evidenced for this process._

## Relationships

### Subprocesses

| ID | Name | Category | Activation |
| --- | --- | --- | --- |
| SUBPROC-001 | Administration | Sub-view of a primary workspace | — |
| SUBPROC-002 | System Health | Sub-view of a primary workspace | — |
| SUBPROC-003 | User Administration | Sub-view of a primary workspace | — |
| SUBPROC-026 | Operator HUD | Sub-view of a primary workspace | — |
| SUBPROC-027 | Endpoint Console | Sub-view of a primary workspace | — |

## Operational status

_No run record for this process is held among the supplied inputs. Nothing is claimed about whether it executes._
