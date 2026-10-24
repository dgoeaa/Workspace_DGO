# Notification tenant runbook — the steps for notification remediation

> **This document carries the steps for notification remediation, and it is the only one that
> does.** Every other document in this repository may name a step and say that it lives here; none
> restates it. There is no precedence rule to apply, because there is nothing to have a conflict
> with.
>
> The other two step-carrying runbooks are
> **Part 3 of this runbook** and
> **Part 5 of this runbook**.

## What this closes, and why it is not stale

Three open items in `closure-disposition.json` are `SPECIFIED_NOT_APPLIED` — specified, and not
applied to the tenant:

| Item | What is wrong today |
|---|---|
| **ITEM-48** | The portal promises citizens four emails the estate does not send |
| **ITEM-50** | Verification codes, correspondence, reports and assignment notices go to a fixed mailbox |
| **ITEM-51** | Officers are never told of assignments, approvals, escalations, delegations or reminders |

**ITEM-50 is the one to read twice.** A verification code sent to a fixed mailbox rather than to the
person who asked for it is a delivered credential in the wrong hands, and the portal reports it as
sent either way.

Every one of the 19 `RN-` identifiers below is present in the live 39-identifier matrix in
`config/notification-matrix.config.js`. This work is current.

## Where these steps came from

They were delivered as four separate files under
`notification-instrument/tenant-execution/runbooks/`, imported wholesale on 2026-09-05 from a
retiring repository and kept in the shape they arrived in. That shape is why no commissioning
document ever referenced them and why, measured on 2026-09-10, they were reachable from nothing:
four runbooks carrying roughly forty live steps, outside every path anyone reads.

The four originals stay where they are, marked superseded by this consolidation, as the record of
what was delivered. **They are not the instruction.** This is.

## The position in the sequence

Notification remediation runs **after** the portal runbook's §4 (both surfaces configured) and is
independent of the governance runbook. Release 0 containment — §2 below — is the part that stops
the ITEM-50 misdelivery and should not wait on the rest.

---

## §1 · Baseline and connections

1. Export the current enabled-flow inventory from the target environment.
2. Record each flow ID, owner, trigger type, solution, connection references and enabled state.
3. Map every configured client endpoint to exactly one active workflow ID using a unique non-destructive correlation ID.
4. Record duplicate, orphaned and unknown active flows. Do not disable them yet.
5. Inspect the Office 365 Outlook connection.
6. Confirm the authenticated account equals the approved service mailbox.
7. Confirm send-as or send-on-behalf permissions through controlled internal and external messages.
8. Test a rejecting mailbox and record the message trace or non-delivery reference.
9. Complete `connection-verification.json` and `tenant-inventory.json`.
10. Run the tenant evidence validator.

---

## §2 · Release 0 containment — do this first

1. Correct citizen verification `To` to the validated requesting address.
2. Correct officer OTP `To` to the authenticated requesting officer.
3. Remove all fixed personal-recipient dependencies from required notifications.
4. Remove the empty-recipient and empty-subject mail action.
5. Preserve the deployed single-assignment notification until its replacement passes RN-009 acceptance.
6. Preserve upload and writeback run visibility until structured telemetry passes RN-025 acceptance.
7. Identify one authoritative generate and one authoritative confirm flow for each verification domain.
8. Keep superseded flows disabled but rollback-ready until endpoint routing is proven.
9. Execute recipient, invalid-recipient, connector-failure and duplicate-event tests.

---

## §3 · Event carriers and the scheduled processor

### Immediate carriers
Implement RN-001, RN-008, RN-009, RN-010, RN-011, RN-021, RN-024, RN-037 and RN-038 first.

### Lifecycle carriers
Implement RN-002, RN-003, RN-004, RN-005, RN-017, RN-018, RN-019, RN-020 and RN-036.

### Scheduled processor
Use `deployment/notification-processor/processor-spec.json`. Do not build until recurrence, retry and claim decisions are approved.

The processor must claim an eligible row, re-read authoritative state, validate recipient and mandatory tokens, check idempotency, send through the approved Outlook connection, record the attempt, schedule retry or permanent failure, alert the administrator when required, and write an audit event.

---

## §4 · Cutover, rollback and hypercare

### Cutover
1. Freeze related configuration changes.
2. Export and hash old flow definitions.
3. Deploy in dependency order.
4. Bind approved connections and environment variables.
5. Execute smoke and recipient tests after each flow.
6. Reconcile in-flight queue rows and delivery receipts.
7. Route endpoints only after the new flow passes.
8. Disable superseded flows without deleting them.

### Rollback
1. Restore the prior endpoint routing or enabled flow.
2. Disable the failed replacement.
3. Reconcile events processed during the cutover window.
4. Cancel or supersede duplicate queue rows.
5. Confirm no duplicate mail was delivered.
6. Record duration, operator and evidence.

### Hypercare
Establish named business and technical owners, message-trace access, daily failure review, emergency recipient correction, rollback authority, and an agreed exit criterion.

---

## What is NOT in this runbook

The scheduled processor in §3 says *"do not build until recurrence, retry and claim decisions are
approved."* Those approvals are an agency decision, not an executor's. Until they exist, §3's
processor half is specified and not buildable — §1, §2 and the carrier half of §3 are not blocked
by it.
