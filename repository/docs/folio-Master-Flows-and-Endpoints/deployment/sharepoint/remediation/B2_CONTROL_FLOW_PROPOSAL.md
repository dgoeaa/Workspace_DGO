# B2 — control flow for STATUS, SUPPORT and WRITEBACK

## 1. Document status and purpose

**Status: APPROVED WITH AMENDMENTS.**
**Purpose:** control-flow decision, implementation direction, and sign-off.
**Implementation status:** subject to the mandatory directives in §8 and the dependencies in §11.

This document provides the control-flow designs requested by [`ANALYSIS.md`](./ANALYSIS.md) under B2:

- one design for the `STATUS` endpoint,
- one design for the `SUPPORT` endpoint,
- one design for `WRITEBACK`, which requires the same type of control-flow decision even though
  it is not formally numbered under B2.

[`PORTAL_DATA_CONTRACT.md`](../PORTAL_DATA_CONTRACT.md) remains authoritative for all field
names, field types, response shapes, persistence targets, and permitted status transitions. This
document does not independently amend that contract. It defines the branching and execution logic
for the replacement flow bodies identified in [D10](../DECISIONS.md), including the conditions
that guard each branch, the validation order, the records read or written, the response returned
by each branch, and the required behaviour for retries, proof consumption, duplicate requests and
partial failures.

There is no tenant access from the session that drafted this, so nothing is applied directly
through this approval. As established in D10, the approved flow bodies must be delivered through
the standard package-and-apply mechanism used for the other visits. They must not be implemented
as undocumented manual edits in the Power Automate designer.

> **Approval basis.** This is the approved revised version. An earlier draft of this document was
> committed to this branch and is superseded in full; where the two differ, this version governs.
> Two of the amendments below correct defects in that draft rather than adding scope — see §10.

---

## 2. Shared standards for all three endpoints

Already settled, and not reopened by this sign-off. Stated once here rather than repeated in
every step below.

### 2.1 Rate limiting

The rate-limit gate runs before endpoint-specific processing. Read `Portal Rate Limits` on the
applicable key:

```
<ENDPOINT>_IP:<X-Forwarded-For>
```

A caller over the D8 window gets `429 Too Many Requests`, through the standard envelope, with the
retry information the house standard requires.

### 2.2 Telemetry

Telemetry runs within the capture scope and never sits on, blocks, or alters the request path.
One row per run to `Portal Flow Telemetry`. A telemetry failure must not change the business
result returned to the caller.

### 2.3 Standard response envelope

Every response uses the standard envelope, and the external HTTP status matches the status
represented inside it. A flow must not return HTTP `200` carrying an envelope that describes a
`404` or any other error.

### 2.4 Correlation and operational traceability — ~~required~~ **withdrawn**

Withdrawn with Directives B and D, which were the only things that needed it. No provisioned
column holds a correlation identifier, and adding one to carry a value nothing reads back would be
provisioning for its own sake. `Portal Flow Telemetry/RunId` already ties a run to its telemetry,
and `Portal Audit Events/Reference` ties an audit row to its correspondence — which is the
traceability anyone actually queries.

### 2.5 Sensitive-data handling

Audit and telemetry records must not contain email-verification proof values, request-body
content, support messages, or other sensitive free text unless the applicable data contract
explicitly requires the field. Where operational detail is needed, record bounded metadata only:
action name, body length, outcome, reference, correlation identifier, failure category.

---

## 3. STATUS

### 3.1 Control flow

**Step 1 — rate-limit gate.** Per §2.1, before STATUS-specific processing.

**Step 2 — read and normalise the reference.** Read `referenceId` from the body. `track.js`'s
`lookup()` already trims and uppercases before sending; the flow normalises defensively anyway:

1. trim leading and trailing whitespace,
2. convert to uppercase,
3. reject an empty or structurally invalid value with the applicable validation response.

The server must not rely exclusively on the client to normalise or validate.

**Step 3 — determine the authentication path.** The accepted request shape contains exactly one
of `email` or `verification`. `core.js`'s `status()` constructs one shape or the other.

The flow **rejects the request** if neither is present, or if both are present. This closes an
ambiguous-authentication path rather than resolving it by precedence.

### 3.2 Verification-proof path

If `verification` is present:

1. Look up the supplied proof in `Portal Verification Proofs`.
2. Confirm the proof exists, has not expired, has not already been consumed, and is valid for the
   relevant verification purpose where the proof record distinguishes purposes.
3. If the proof is missing, expired, invalid, or already consumed: return the standard
   `verification_required` response. **Do not** return the ownership-denial `404`, and **do not**
   silently fall back to an email-based lookup.
4. If the proof is valid: read `Email` from the proof row and use it as the authenticated identity
   for this request. Consume the proof at the contractually defined point, using an atomic
   operation or equivalent concurrency protection if STATUS proofs are single-use.

**Reasoning.** An invalid proof does not establish that the reference-and-email pairing is
invalid. It establishes only that the proof cannot be accepted. A legitimate submitter may present
an expired or previously used proof; returning the ownership-denial `404` would tell them their own
reference does not exist. Once a caller selects the proof path, however, an invalid proof must not
degrade to weaker email-based behaviour — that is Directive E.

### 3.3 Email path

If `email` is present: trim it, normalise it consistently with the way `SUBMISSION` stores
`SenderEmail`, and use the normalised value for the ownership comparison. The final comparison is
case-insensitive.

### 3.4 Registry lookup and ownership check

After resolving the email through the applicable path:

1. Look up `Portal Registry` by the normalised `ReferenceId`.
2. No matching row → the standard `404` denial.
3. Compare the resolved email with the row's `SenderEmail`.
4. Values do not match → **the same** standard `404` denial.

The unknown-reference and wrong-email responses must be indistinguishable to the caller. Same HTTP
status, same headers (except unavoidable request-specific tracing values), same envelope, same
error code, same error message, same body shape, same material response behaviour. No field may
reveal whether the reference exists, whether the email is incorrect, or whether the caller has
identified another citizen's reference.

This implements the protection associated with item 11 in [`OPEN_ITEMS.md`](../OPEN_ITEMS.md),
identified as `INT-006`.

### 3.5 Successful response

1. Project only the STATUS response fields allowed by `PORTAL_DATA_CONTRACT.md`. No internal,
   administrative, audit, or non-allow-listed field is returned.
2. Read `Portal Status Timeline` rows where `SubmissionRef eq referenceId`.
3. Order by `AtUtc` per the contract, with a deterministic secondary ordering value applied where
   two rows may carry the same `AtUtc`.
4. Return `200 OK` through the standard envelope.

### 3.6 STATUS verification policy

**Verification remains off by default for STATUS.** This matches the practical behaviour of
current deployments and avoids an additional email round-trip for routine status checks.

This is an explicit risk-based policy decision, not a permanent conclusion that STATUS data never
requires stronger verification. It must be reviewed if any of the following occurs:

- a security incident involving STATUS,
- evidence of reference enumeration,
- evidence that reference-and-email lookup is being abused,
- a regulatory or policy requirement for stronger authentication,
- a material increase in the sensitivity of STATUS response fields,
- a change to the STATUS allow-list that exposes more detailed information,
- a formal risk assessment recommending mandatory verification.

If mandatory verification is later enabled, the client and flow follow the approved verification
handshake rather than introducing an undocumented behaviour change. The client half already exists
and is dormant; enabling it is a flow-side configuration event.

---

## 4. SUPPORT

### 4.1 Control flow

**Step 1 — rate-limit gate.** Per §2.1.

**Step 2 — validate required fields.** `name`, `email`, `topic` and `message` must be present and
non-empty after trimming. Enforce also the maximum lengths, accepted formats and content
constraints defined in `PORTAL_DATA_CONTRACT.md` or the house build standard. A missing or invalid
field returns the applicable `4xx` validation response, identifying the invalid field or category
in the standard safe error format without echoing sensitive free text unnecessarily.

### 4.2 Retry classification for validation failures

Permanent validation errors must not be treated as indefinitely retryable failures. Client and
endpoint behaviour must distinguish:

**Permanent client errors** — missing required fields, empty required values, invalid email
structure, values exceeding permitted length, structurally invalid request bodies. These require
user correction and must not enter an automatic retry loop.

**Transient failures** — network interruption, rate limiting, temporary platform unavailability,
selected `5xx` failures, and anything else the house standard explicitly classifies as retryable.
These may be queued and retried under the approved retry and backoff policy.

The existing behaviour of retrying every `4xx` or `5xx` response must not be treated as harmless.
It must be corrected or formally constrained so that permanent validation errors are not retried.
See §11.1 for the specific client defect this requires fixing.

### 4.3 Handle `aboutReference`

If present, store as supplied, subject to trimming, maximum-length enforcement and safe-storage
validation. **Do not validate `aboutReference` against `Portal Registry`.** The contract describes
it as *"a tracking id, unverified"*. It remains an unverified hint for the helpdesk rather than an
authenticated claim that the sender owns, or is entitled to information about, the referenced
submission. The existence or non-existence of the supplied reference must not change the SUPPORT
response in any way that permits reference enumeration.

### 4.4 Generate `caseRef`

Format:

```
CASE-XXXXXX
```

The six-character suffix uses the same unambiguous alphabet as the client-side `sref()` in
`support.js` — `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — which excludes characters confusable when
spoken or read (`0`/`O`, `1`/`I`).

Before accepting a generated reference: check `Portal Support Cases/Title` for a collision,
regenerate on a hit, and repeat until unique. **The final create must be protected by an
enforceable uniqueness mechanism or equivalent concurrency control where the platform supports
one.** A check-then-create sequence is not sufficient on its own if two concurrent requests can
pass the check with the same value (Directive G).

**Why not sequence-based.** The support case reference does not need the monotonic
`Portal Sequence Counters` approach used for `SUBMISSION`. D6's sequencing rationale does not
transfer: a support case carries no requirement for legally or operationally gap-free numbering,
and a random collision-checked reference avoids sequence-lock contention.

### 4.5 Idempotency and duplicate-case prevention

SUPPORT must include idempotency protection. A case may be created successfully even when the
caller fails to receive the response because of a timeout or network interruption; without
protection, a retry creates a duplicate case.

The implementation must:

1. accept or derive an approved idempotency or request identifier,
2. store it with the created support case or in the applicable request-control store,
3. detect a replay of the same logical request,
4. return the previously created `caseRef` rather than creating another case,
5. define the idempotency retention period,
6. ensure the identifier does not contain sensitive request content.

The support message itself must not be used as an exposed idempotency key.

### 4.6 Create the support case

Create a row carrying the contractually defined fields — `Name`, `Email`, `Topic`,
`AboutReference`, `Message`, `SubmittedAtUtc`, `Status = open`, `SourceIp` — plus the applicable
correlation or idempotency identifier.

**The support case becomes authoritative once the row has been created successfully.** The
response must not report failure merely because a subsequent courtesy notification fails.

### 4.7 Send the acknowledgement email

After the case exists, attempt the acknowledgement send. Whether it succeeds or fails, write one
row to `Portal Outbox Receipts` recording `sent` or `failed`, with the permitted correlation
information needed to associate the receipt with the support case and the flow run.

**A failed acknowledgement must not fail the SUPPORT request after the case has been created.**

**Reasoning.** The case is real once the row exists, and the outbox receipt records the send
outcome honestly. Failing the request over an unavailable mail relay would prompt the citizen to
resubmit a case that already exists, creating duplicates and making the reported API outcome
inconsistent with the true persistence outcome.

### 4.8 Successful response

```json
{ "caseRef": "CASE-XXXXXX" }
```

through the standard envelope with `200 OK`. A replay of the same idempotent request returns the
existing case reference per §4.5.

---

## 5. WRITEBACK

### 5.1 Control flow

**Step 1 — rate-limit gate.** Per §2.1.

**Step 2 — read the proof without consuming it.** Look up the supplied proof in
`Portal Verification Proofs`. At this stage the flow determines only whether the proof appears
*eligible for use*. **It must not consume the proof before completing correctable request
validation** (Directive A).

The proof must exist, be unexpired, be unconsumed, match the applicable WRITEBACK verification
purpose where purposes are recorded, and resolve to an email address. Missing, expired, invalid or
already consumed → the applicable standard `401` or `403`.

Unlike STATUS, WRITEBACK has no unverified route. A valid proof is always required.

### 5.2 Read and normalise the request

Read and normalise `referenceId`; read `action`; read `body`. Reject missing or structurally
invalid values with the applicable standard validation response. Treat the body per the
action-specific rules in §5.5.

### 5.3 Confirm reference ownership

Using the email resolved from the proof: look up `Portal Registry` by the normalised
`referenceId`, and compare the proof email with the row's `SenderEmail`, case-insensitively.

Return the same byte-identical `404` denial if the reference does not exist **or** the resolved
email does not own it. As with STATUS, no response field or behaviour may reveal which condition
occurred.

**The proof must not be consumed because ownership validation failed.**

### 5.4 Validate `action`

Permitted values are `respond`, `note`, `withdraw`, and nothing else. Any other value is rejected
explicitly; the flow never returns a successful response for an unrecognised action. This follows
the estate rule represented in `config/dynamic-actions.config.js`: an unrecognised discriminator
must fail clearly rather than pass silently.

### 5.5 Validate the body

Normalise the body by applying the contractually approved whitespace handling *before* measuring
length. Minimums:

| Action | Minimum body |
|---|---|
| `respond` | 10 characters |
| `note` | 5 characters |
| `withdraw` | optional |

The server enforces these independently of the client. The implementation action list must define:

- whether leading and trailing whitespace is removed before validation,
- how empty or whitespace-only input is handled,
- that the limit is measured in user-perceived characters, or another explicitly documented
  character-count rule,
- the maximum permitted body length,
- how line breaks are handled,
- how Unicode input is counted consistently.

**A correctable action or body-validation failure must not consume the proof.**

### 5.6 Consume the proof atomically

Only after proof eligibility, reference ownership, a recognised action, body validation and
required request-shape validation have all passed may the flow attempt to consume the proof.

Consumption must be atomic or use an equivalent concurrency-control mechanism, preventing two
simultaneous WRITEBACK requests from successfully using the same proof. A sequence of

1. read `Consumed = false`,
2. unrestricted update setting `Consumed = true`

**is not sufficient** if concurrent requests can both pass the first step.

If the atomic consume indicates another request consumed the proof first, the current request
stops and returns the applicable invalid-or-consumed-proof response.

### 5.7 Idempotency and operation identity

WRITEBACK must use an operation or idempotency identifier to prevent duplicate business effects
when a request is retried after an uncertain result. The identifier associates proof consumption,
timeline creation, registry update where applicable, audit creation, and telemetry or recovery
records.

A replay of the same completed operation must not append a second identical timeline row, apply a
second withdrawal transition, create duplicate audit events that appear to represent separate
citizen actions, or return an outcome inconsistent with the first completed request.

The implementation action list must define the exact replay response and the retention period.

### 5.8 Append the timeline row

One row to `Portal Status Timeline`: `SubmissionRef = referenceId`, `Actor = Submitter`,
`Note = body`, plus `Label` and `Status` per the action, and the approved operation or correlation
identifier.

| Action | `Label` | `Status` on this row |
|---|---|---|
| `respond` | `Requester responded to the request for information.` | unchanged |
| `note` | `Note added by the requester.` | unchanged |
| `withdraw` | `Withdrawn at the request of the submitter.` | `withdrawn` |

These labels must match the device-only fallback path exactly, so the citizen-visible wording is
consistent regardless of where the record originated.

### 5.9 Update registry status for withdrawal

If `action === withdraw`, update `Portal Registry/Status = withdrawn`.

Do not change `Portal Registry/Status` for `respond` or `note`. A response or note appears in the
timeline but introduces no registry status transition under the current contract — see §6.

### 5.10 Write the audit event

One row to `Portal Audit Events`, mandatory under [D13](../DECISIONS.md), carrying the applicable
contract fields — `Flow`, `AtUtc`, `Reference = referenceId`, `SourceIp`, `Detail` — plus the
applicable operation or correlation identifier.

`Detail` is formatted:

```
action=<action>, bodyLength=<n>
```

for example `action=respond, bodyLength=42`.

**The audit event must never contain the body itself.** It records the selected action, the
normalised body length, and the operational identifiers the contract permits.

### 5.11 Multi-write consistency and partial-failure handling

WRITEBACK performs several related operations: consume the proof, append the timeline row, update
registry status for a withdrawal, append the audit event. The implementation must define the exact
ordering, retry behaviour and recovery behaviour across all of them.

The flow must not leave an unexplained state in which, for example:

- a withdrawal appears in the timeline but the registry remains active,
- the registry is marked withdrawn but no citizen-visible timeline entry exists,
- the proof is consumed but no business action is recorded,
- a business action exists without the mandatory audit event,
- a retry creates duplicate timeline entries.

Where the platform cannot provide a single transaction across all targets, the implementation must
use an explicit recoverable-operation design: a stable operation identifier, idempotent writes, a
recorded operation state, a defined write order, retry-safe actions, duplicate detection, recovery
handling for incomplete operations, telemetry for unresolved failures, and a documented terminal
state for both successful and failed operations.

The concrete action list must describe how each partial-failure scenario resolves before the flow
is packaged and applied. See §11.2 — this is an open platform-mechanism dependency, not a solved
problem.

### 5.12 Successful response

After the operation reaches its successful terminal state:

```json
{ "ok": true }
```

through the standard envelope with `200 OK`.

**The flow must not return success while mandatory business writes remain in an unknown or
unrecoverable state.**

---

## 6. Deliberate difference between device-only and server-side behaviour

The device-only `doRespond()` path moves the local status to `review` when a citizen submits a
response. This approved control flow does **not** introduce the same server-side transition.

Under the current `PORTAL_DATA_CONTRACT.md`:

- `respond` leaves registry status unchanged,
- `note` leaves registry status unchanged,
- `withdraw` changes registry status to `withdrawn`.

This is deliberate. If `respond` should move the registry record into a review queue, that is a
contract change, not an implementation-level control-flow decision. The required order would be:

1. propose the new status transition,
2. amend `PORTAL_DATA_CONTRACT.md`,
3. approve the contract change,
4. update the WRITEBACK control flow,
5. update the associated client, timeline, operational and test expectations,
6. package and apply the revised implementation.

**The WRITEBACK flow must not introduce a registry status transition the current contract does not
authorise.**

---

## 7. Sign-off

Approved with amendments and mandatory implementation directives.

| # | Item | Endpoint | Decision |
|---|---|---|---|
| 1 | Invalid/expired/consumed proof → `verification_required`, not the ownership `404`; no silent fallback to the email path | STATUS | **Accept** |
| 2 | Verification off by default, recorded as an explicit risk-based decision with defined review triggers (§3.6) | STATUS | **Amend** |
| 3 | Unknown reference and wrong-email pairing return materially identical `404` responses | STATUS, WRITEBACK | **Accept** |
| 4 | `aboutReference` stored as an unverified hint, not validated against `Portal Registry` | SUPPORT | **Accept** |
| 5 | `caseRef` = `CASE-` + 6 chars from the `sref()` alphabet, collision-checked and concurrency-protected | SUPPORT | **Accept** |
| 6 | A failed acknowledgement email does not fail the call once the case row exists | SUPPORT | **Accept** |
| 7 | Any action outside `respond`/`note`/`withdraw` is rejected explicitly | WRITEBACK | **Accept** |
| 8 | Server-side body minimums matching the client, with normalisation rules documented (§5.5) | WRITEBACK | **Accept with implementation clarification** |
| 9 | Timeline `Label` text matches the device-only path verbatim per action | WRITEBACK | **Accept** |
| 10 | `respond` does not change `Portal Registry/Status`; changing that is a contract amendment first | WRITEBACK | **Accept** |

---

## 8. Mandatory implementation directives

> **Scope reduction, 2026-08-21.** Three directives were withdrawn after the prerequisites work
> showed what they actually cost. They required persisted state no provisioned column holds, which
> meant new columns, a contract amendment and a provisioning pass — to protect against failure
> modes that are either negligible or cheaply recoverable. The reduction is recorded here rather
> than in a separate document, so the directive list is the whole truth about what is required.
>
> | Withdrawn | Why | What replaces it |
> |---|---|---|
> | **B** — recoverable-operation design | Distributed-transaction machinery for a flow that appends two rows and patches one. Every moving part is itself a thing that can be wrong. | Ordered writes, audit last, telemetry records the failure. Specified per flow under `partialFailure`. |
> | **D** — SUPPORT idempotency | Needs a persisted key. The harm it prevents is a duplicate support case a helpdesk officer merges in seconds. | Nothing. Recorded as accepted exposure. |
> | **G** — `enforceUnique` on `caseRef` | 32⁶ is 1.07 billion. A collision is not a real risk, and the check-then-regenerate loop already handles the one-in-a-billion case. | The existing collision check. |
>
> **Directive G survives for single-use proofs**, which is the one race worth closing: the proof is
> the only authentication WRITEBACK has, and a double-spend is an auth bypass rather than a tidy-up
> problem. See §11.2's named mechanism.

These form part of the approval. They are not optional recommendations.

**Directive A — validate before consuming a WRITEBACK proof.** WRITEBACK validates proof
eligibility, reference ownership, action, body and request structure *before* consuming the proof.
A correctable validation failure must not destroy a citizen's valid single-use proof. Consumption
must be atomic or protected by an equivalent concurrency-control mechanism.

~~**Directive B — define WRITEBACK partial-failure recovery.**~~ **Withdrawn.** Replaced by
ordered writes with the audit row last, and a failure recorded in telemetry rather than returned
as `ok:true`. Specified in `06-writeback-citizen-actions.json` under `partialFailure`.

**Directive C — correct SUPPORT retry behaviour.** Permanent `4xx` validation failures must not be
retried. Client and flow behaviour must distinguish permanent validation errors requiring citizen
correction from transient errors safe to retry. Rate-limited requests and eligible transient
failures follow the approved retry and backoff standard.

~~**Directive D — add SUPPORT idempotency protection.**~~ **Withdrawn.** No provisioned column
holds a replay key, and the harm is a duplicate case the helpdesk merges. Accepted exposure.

**Directive E — do not downgrade an invalid STATUS proof.** If STATUS receives a verification
proof, an invalid proof must not silently fall back to email-based lookup. The request follows the
proof-path outcome and returns the applicable `verification_required` response.

**Directive F — enforce server-side normalisation and validation.** Client validation is not a
substitute for endpoint validation. STATUS, SUPPORT and WRITEBACK normalise and validate their
accepted inputs server-side per the contract and the approved rules above.

**Directive G — protect against concurrency, on single-use proofs.** Narrowed. Proof consumption
is a read-check-write on the only authentication WRITEBACK has, so a double-spend is an auth
bypass and it is closed with an `If-Match` ETag (§11.2). Case references and status transitions
are no longer in scope: a `caseRef` collision is one in 1.07 billion and the regenerate loop
handles it, and a status transition races only against itself.

**Directive H — add negative and recovery-path tests.** Per §9.

---

## 9. Required test coverage

The implementation and verification plan must include at least the following.

**STATUS** — unknown reference; wrong email; identical denial behaviour; missing proof; expired
proof; consumed proof; valid proof; proof-path failure without email fallback; both `email` and
`verification` supplied; neither supplied; timeline ordering; allow-listed response projection.

**SUPPORT** — missing required fields; whitespace-only required fields; invalid email; oversized
content; unverified `aboutReference`; case-reference collision; concurrent case-reference
generation; acknowledgement success; acknowledgement failure; client timeout after case creation;
idempotent replay; permanent validation failure not retried.

**WRITEBACK** — missing proof; expired proof; consumed proof; concurrent proof use; unknown
reference; wrong owner; identical ownership denial; unknown action; short `respond` body; short
`note` body; empty optional withdrawal reason; valid response; valid note; valid withdrawal; proof
not consumed after a correctable validation failure; duplicate-request replay; timeline write
failure; registry update failure; audit write failure; recovery from incomplete operations; no
duplicate timeline row after retry; no body text in the audit event; no registry status change
after `respond`.

---

## 10. What the amendments corrected

Recorded so the action-list authors understand which parts of the superseded draft must not be
carried forward, and why.

**Directive A corrects a real ordering defect.** The superseded draft consumed the WRITEBACK proof
immediately after reading it, *before* the ownership check and before action and body validation.
Under that ordering, a citizen who mistyped a reference, submitted a too-short response, or sent an
unrecognised action would have had their valid single-use proof destroyed by the failed attempt —
forcing a fresh email round-trip to correct a client-side mistake. The approved ordering validates
everything correctable first and consumes the proof last.

**Directive C corrects an assumption, and the defect is larger than the draft assumed.** The draft
treated SUPPORT's `4xx` → queue-and-retry behaviour as benign existing behaviour. It is not — see
§11.1 for the specific defect, which includes queue amplification and silent case loss.

**Directives B, D and G add requirements the draft omitted entirely.** Idempotency, atomic proof
consumption, and multi-write partial-failure recovery were not addressed in the superseded draft.
They are not optional refinements: without them the flows are correct only when requests arrive
sequentially and no write ever fails midway.

---

## 11. Implementation dependencies

Recorded per §12.8 rather than silently omitted. Each must be resolved, with its mechanism named,
before the flows are packaged and applied.

### 11.1 SUPPORT retry classification is a client change, and the defect is specific

Directive C cannot be satisfied flow-side alone. The current client behaviour in
`document-portal/js/core.js`:

- `PF.intake.support()` queues to the outbox on **any** `!r.ok` — a `400` validation failure is
  queued identically to a `503`.
- `PF.outbox.flush()` retries a queued support item by calling `PF.intake.support()` again — which,
  on a further failure, **queues another copy** with `tries` reset to `0`. `submit()` avoids this by
  passing `{ queue: false }` on the flush path; `support()` accepts no such option, so the guard
  does not exist for it.
- `flush()` drops an item once `tries >= 5`, so a permanently invalid case is eventually discarded
  **silently** — the citizen is never told the case did not reach the helpdesk.

So the present behaviour is not merely "retries a permanent error": it amplifies queue entries and
then loses the case without notice. Fixing this requires, at minimum, a `queue` option on
`support()` matching `submit()`'s, a classification of which statuses are retryable, and a
user-visible outcome when an item is discarded. This is client work in `document-portal/js/`, and
it must be scheduled with the flow work rather than after it.

### 11.2 Atomic proof consumption and idempotency need a named platform mechanism

Directives A, D and G require atomicity and concurrency protection that Workflow Definition
Language and the SharePoint connector do not provide natively in the way a database transaction
would. The estate has already recorded one instance of this class of limitation — `SC-003` and
`INT-005`, where WDL's lack of bitwise operators made a constant-time comparison unachievable and
the honest response was to record the compensating controls rather than claim the property.

The same discipline applies here. Before packaging, the action lists must name the concrete
mechanism used for each of:

- single-use proof consumption under concurrent WRITEBACK requests (§5.6),
- `caseRef` uniqueness under concurrent SUPPORT requests (§4.4),
- idempotency record read-and-write (§4.5, §5.7),
- registry status transition on withdrawal (§5.9).

Candidate mechanisms include SharePoint ETag-conditional updates, a claim-then-verify pattern of
the kind `Portal Sequence Counters/LockToken` already uses for reference minting, or an explicit
operation-state row. **Whichever is chosen must be stated, not assumed.** If a required property
proves unachievable on this platform, it is recorded as a limitation with its compensating
controls — never claimed and left unimplemented.

### 11.3 Contract alignment check

Before packaging, verify that no behaviour specified here conflicts with
`PORTAL_DATA_CONTRACT.md`. Two additions in this document describe fields and behaviours the
contract does not currently enumerate — the correlation/operation identifier (§2.4) and the
idempotency identifier (§4.5, §5.7). If either is to be persisted to a provisioned column, the
contract must be amended first and the column must exist in `portal-field-spec.json`;
`npm run test:datacontract` fails otherwise. If both remain in-flight-only values that are never
persisted, no contract amendment is required — but which of the two is intended must be decided
before the action lists are written.

---

## 12. Repository and document control

1. This revised approved version **supersedes the earlier draft in full**.
2. The approval is recorded as **approved with amendments**, not unconditional approval.
3. The mandatory directives (§8) are incorporated above, not held separately.
4. The relationship with `PORTAL_DATA_CONTRACT.md` is preserved: the contract remains
   authoritative, and this document does not amend it.
5. Follow-up items requiring a separate contract amendment are identified — the `respond`
   status transition (§6) and, conditionally, the identifiers in §11.3.
6. Action-list authors use the numbering and section references in **this** version.
7. The earlier version cannot be mistaken for the approved implementation basis: it was replaced
   in place, so the file at this path is the approved text, and the superseding is recorded in §1
   and §10.
8. Unresolved platform-specific mechanisms are recorded as implementation dependencies in §11
   rather than silently omitted.

---

## 13. Next steps

1. ~~Update the repository proposal to match the approved revised version.~~ **Done — this
   document.**
2. ~~Record the sign-off as approved with amendments.~~ **Done — §7.**
3. Write the detailed Power Automate action lists for STATUS, SUPPORT and WRITEBACK.
   **Started; stopped at six prerequisites, four blocking** —
   [`ACTION_LIST_PREREQUISITES.md`](./ACTION_LIST_PREREQUISITES.md). The control flow above
   stands unchanged; what is not yet true is the foundation it would be expressed against. In
   particular §11.3's open question is now answered by evidence: the identifiers **must** be
   persisted, because no provisioned column holds them and idempotency cannot be done in flight.
4. Incorporate idempotency, concurrency and partial-failure handling into those action lists,
   naming the mechanism per §11.2. **Mechanism named:** `Send an HTTP request to SharePoint` with
   an `If-Match` ETag, 38 precedents in the deployed estate, no schema change required.
5. Specify the client change for SUPPORT retry classification per §11.1.
6. Verify no proposed flow behaviour conflicts with `PORTAL_DATA_CONTRACT.md` per §11.3.
7. Raise a separate contract-change proposal if `respond` is intended to move registry status to
   `review`.
8. Prepare the C4 and C5 work for STATUS and SUPPORT.
9. Prepare the WRITEBACK flow build.
10. Complete the negative-path, concurrency, replay and recovery tests per §9.
11. Package and apply through the established deployment mechanism.
12. Retain evidence that the package reflects this approved control flow and not the superseded
    draft.

Implementation must not proceed from the earlier draft where it differs from this approved version.
Any departure from the approved control flow — including any change to proof consumption, ownership
denial, status transitions, idempotency, retry handling or partial-failure recovery — must be
raised explicitly for review rather than introduced during implementation.
