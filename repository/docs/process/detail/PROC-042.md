# PROC-042 — CG_Support_Endpoint

> Generated from `docs/reference/process-inventory.json`. Do not edit.
> Back to the [master inventory](../07-MASTER-PROCESS-INVENTORY.md) · [process detail index](../09-PROCESS-DETAIL.md).

## 5.1 Identity and purpose

| Attribute | Value |
| --- | --- |
| Identifier | PROC-042 |
| Name | CG_Support_Endpoint |
| Alternative or legacy name | — |
| Category | Automated · system-initiated (HTTP request) — Correspondence Gateway |
| Description | Observed only through run records: no export or paste package of this name is present among the supplied inputs. |
| Description declared in the artifact itself | — |
| Business objective | Not evidenced. |
| Operational objective | — |
| Process owner | Not evidenced. |
| Criticality | Not evidenced. |
| Business area / group | Correspondence Gateway |
| Related modules | — |
| Related features | — |
| Evidence classification | Partially evidenced |
| Evidence note | Existence and execution outcome are CONFIRMED from run records. The action graph is not among the supplied inputs, so no step of this process is documented. |
| Documentation status | Existence documented only |
| Validation status | Requires confirmation against the live tenant |
| Sources | `SRC-097` docs/folio-Master-Flows-and-Endpoints/evidence/2026-08-27-endpoint-runs/CG_Support_Endpoint__08584137894738044630941744668CU10__flow_run_record.json<br>`SRC-098` docs/folio-Master-Flows-and-Endpoints/evidence/2026-08-27-endpoint-runs/CG_Support_Endpoint__08584137921492659877481988601CU02__flow_run_record.json |

## 5.2 Participants and responsibilities

| Attribute | Value |
| --- | --- |
| Initiating actor | The declared trigger; no human actor is named by the definition. |
| Participating roles | Not evidenced. |
| Accountable owner | Not evidenced. |
| Supporting systems | Microsoft Power Automate |
| Approval authority | Not evidenced for this process. |
| Escalation authority | Not evidenced for this process. |
| Segregation of duties | Not evidenced. No supplied artifact declares a separation requirement. |

## 5.3 Initiation and preconditions

| Attribute | Value |
| --- | --- |
| Starting event | An HTTP request reaches the endpoint. |
| Trigger type | Automated · system-initiated (HTTP request) — Correspondence Gateway |
| Entry criteria | The trigger fires. |
| Required roles and permissions | Not evidenced. |
| Required configuration | — |
| Required system availability | Microsoft Power Automate |
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
| Primary output | An HTTP response to the caller. |
| Completion criteria | A response is returned to the caller; the latest observed was HTTP 400. |
| Successful end state | A response is returned to the caller; the latest observed was HTTP 400. |
| Alternative end states | Not evidenced. |
| Failed end states | Not evidenced. |
| Cancellation outcome | Not evidenced. |
| Residual obligations | Not evidenced. |
| Records created or updated | — |
| Notifications issued | — |
| Downstream handoffs | — |

## 5.9 Exceptions, failures and recovery

_No exception path is evidenced in this process. Where the process is a request-triggered workflow, that absence is itself recorded in the gap register._

## 5.10 Monitoring, audit and performance

_No monitoring control, metric, service-level expectation or audit event is evidenced for this process._

## Relationships

_No subprocess, variant or dependency is recorded against this process._

## Operational status

| Attribute | Value |
| --- | --- |
| Runs observed | 2 |
| Latest outcome | Succeeded |
| Latest status returned | 400 |
| Delivery confirmed | true |
| What the records establish | 2 run record(s) captured 2026-08-27. Records execution outcome only: not availability, not latency, and not business-transaction success. |
| What they do not | Of 2 captured run(s): 0 returned HTTP 200; 0 did not complete (status 0); the remainder returned 400. A returned status records that the endpoint answered. It does not record that a business transaction completed, and nothing in these records establishes that one did. |
