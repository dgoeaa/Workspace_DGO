# Prerequisites for the B2 action lists — closed

**Status: all six resolved, 2026-08-21.** Four were fixed in the repository. Two were dropped as
not worth their cost. Nothing here is outstanding.

This started as a blocker list. It is kept because the findings explain why the artifacts changed,
and one of them is a live operational risk that has no fix in this repository.

---

## 1. Artifacts read fields the portal does not send · **FIXED**

`npm run triggers` (`scripts/verify-artifact-triggers.mjs`) measures this. It was **10
unreconciled**; it is now **0**.

| Artifact | Was | Now |
|---|---|---|
| `03-status-registry-read` | `reference`, `proof` | `referenceId`, `verification` |
| `02-submission-registry-write` | `proof`, `senderName`, `senderOrganisation`, `senderOrganisationType` | `verification`, `sender.name`, `sender.organisation`, `sender.organisationType` |
| `01-otp-estate-split` | `identifier`, `otp_code` | `email`, `code` |
| `05-upload-and-support` | `identifier`, `ticket` | `email`, `X-Upload-Ticket` read as a **header** |

**Direction taken: the artifacts conform to the contract.** The contract is authoritative by its
own precedence rule and `document-portal/js/` already matches it, so the artifacts were the side
that was wrong.

**Why it mattered.** A field name that disagrees does not fail loudly.
`triggerBody()?['reference']` against a body carrying `referenceId` evaluates to null, the filter
becomes `Title eq ''`, and STATUS answers *"no match"* for every reference ever submitted — while
scoring 100% on the build standard and passing every test here.

Two contract fields still have no reader, both benign: `channel` is a constant the flow writes
directly, and `submittedAt` is stamped server-side with `utcNow()` in preference to a
client-supplied time.

> **A correction to an earlier count.** This was first reported as 18 unreconciled reads. Nine of
> those were in `standardConformance` — the build-standard remediation, which names the trigger
> fields the *existing* flow carries so the redaction composes can blank them. Those are not the
> endpoint's own reads and were never a contract question. The measurement now scans operative
> sections only.

---

## 2. Idempotency has no column to live in · **DROPPED, not fixed**

No provisioned column on any list these endpoints write holds a correlation, idempotency or
operation identifier. Idempotency needs persisted state to compare a replay against, so
Directives B and D could not be satisfied without new columns, a contract amendment and a
provisioning pass.

**Both directives were withdrawn** rather than paid for. See `B2_CONTROL_FLOW_PROPOSAL.md` §8.

The exposures accepted in exchange:

| | Exposure | Why it is acceptable |
|---|---|---|
| SUPPORT | A retry after an uncertain result can create a duplicate case | The helpdesk merges two cases in seconds. The citizen is not harmed and nothing is lost. |
| WRITEBACK | In principle a duplicate timeline row | In practice nearly closed already: the proof is single-use, so a retry that reaches proof consumption fails there. A retry can only duplicate if the first attempt never got that far — in which case it wrote nothing. |

---

## 3. The concurrency mechanism · **NAMED and specified**

§11.2 required a mechanism be named rather than assumed. It is:

**`Send an HTTP request to SharePoint` with an `If-Match` ETag header.** SharePoint answers
`412 Precondition Failed` when the row changed since it was read — the atomic compare-and-set the
proof consumption needs. **38 uses of `operationId: HttpRequest` across the deployed estate**, same
connector already in every portal flow, no schema change.

Applied to **proof consumption only**. That is the one race worth closing: the proof is the only
authentication WRITEBACK has, so a double-spend is an auth bypass rather than a housekeeping
problem. `caseRef` uniqueness was dropped — 32⁶ is 1.07 billion and the regenerate loop covers the
rest.

The exact replacement action is in `06-writeback-citizen-actions.json` under
`actions[Consume_Verification_Proof].concurrency`, carried alongside the `PatchItem` form rather
than instead of it — `tests/remediation.test.mjs` counts wiring coverage from
`inputs.parameters.table` plus `operation`, neither of which an `HttpRequest` action has, so
replacing it outright would silently drop `update Portal Verification Proofs` from the register.

---

## 4. Unindexed hot paths · **OPERATOR TASK — the one live risk here**

This has no fix in this repository. It is provisioning.

| List | Indexed | Queried by | Frequency |
|---|---|---|---|
| `Portal Rate Limits` | **none** | `Title eq '<ENDPOINT>_IP:<ip>'` | **every request to every endpoint** |
| `Portal Verification Proofs` | **none** | `Title eq '<proof>'` | every proof presentation |
| `Portal Support Cases` | **none** | `Title eq '<caseRef>'` | every SUPPORT call |
| `Portal Status Timeline` | `SubmissionRef` | `SubmissionRef eq …` | ✅ correct |
| `Portal Registry` | `ReferenceId` (also `enforceUnique`), `SenderEmail`, `Status` | reference + owner | ✅ correct |

SharePoint's list view threshold makes an unindexed equality filter **fail** — not slow — once a
list passes 5,000 items. `Portal Rate Limits` grows by one row per source per endpoint and is read
on every single request. It is the first list that will cross it, and when it does, **every
endpoint stops at once.**

`Portal Registry` shows the estate already knows the pattern. The other three were provisioned
without it.

**What closes it:** index `Title` on `Portal Rate Limits`, `Portal Verification Proofs` and
`Portal Support Cases`. Three column settings, done once, in the same visit as anything else. Cheap
now; an outage later.

---

## 5. `03-status-registry-read` carried both corrected defects · **FIXED**

Independently of the draft the amendments corrected, the artifact itself had:

- **Directive A** — `Consume_Verification_Proof` ran before `Get_Submission_By_Reference`, so a
  mistyped reference burned a valid single-use proof.
- **Directive E** — the registry lookup filtered on the **client-supplied** email regardless of
  whether a proof was presented. The flow consumed a proof and then authenticated with the very
  field the proof was meant to replace.

Both are corrected in the rewritten artifact, and `06-writeback-citizen-actions.json` was built
with the right ordering from the start. The registry lookup also moved from `Title` to
`ReferenceId` — the indexed, `enforceUnique` column the contract names as the persistence target.

---

## 6. STATUS response projection drift · **FIXED**

| | |
|---|---|
| Projected, contract forbids | `attachmentCount` — the allow-list is closed and "attachments" is on the never-list |
| Contract allows, artifact omitted | `category`, `subject` — `track.js` renders both |
| Contract allows, artifact omitted | `timeline[].note` — `track.js` renders it under each entry |

---

## Where this leaves the work

Everything specifiable from this repository is specified. What remains needs the tenant:

1. **Index the three `Title` columns** (§4). Cheapest item on the list, largest failure mode.
2. **Apply the visits** — C1 is ready now; C2–C5 have their action lists; C6 is
   `06-writeback-citizen-actions.json`.
3. **Provision the `WRITEBACK` endpoint key** and publish its URL. The client is already built and
   stays dormant until a URL is set.
4. **Set the real CORS origin** — until then no browser can read any response.
5. **Rotate the seven API keys and the six trigger tokens.**

## How to re-measure

```bash
npm run triggers        # 0 unreconciled
npm run datacontract    # persistence targets vs provisioned columns
npm run wiring          # operations, endpoints, boundary crossings
```
