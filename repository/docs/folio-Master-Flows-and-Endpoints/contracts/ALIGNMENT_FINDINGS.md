# Flow alignment — the findings, one entry each

> **This is not the plan.** [`../../deployment/PLAN.md`](../../deployment/PLAN.md) is, and it is
> the only one. This file was named `REMEDIATION_PLAN.md` until 2026-09-24; the name said plan
> and the content is the finding-by-finding reading of one probe run, so it is named for what
> it is. Nothing in it changed.
>
> **It rests on a dated probe.** Every entry is a reading of
> [`ALIGNMENT_REPORT.json`](./ALIGNMENT_REPORT.json), which scored two transcripts captured on
> 2026-08-08 and reads nothing now. Its twenty internal-platform rows still stand against
> `INTERNAL_PLATFORM_FLOWS.md`; its six portal rows were scored against a contract since
> rewritten. Re-probing supersedes this file — it is not hand-edited to match a later run.

**Status: a reading of one probe run.** One dedicated entry per finding in
[`ALIGNMENT_REPORT.json`](./ALIGNMENT_REPORT.json) that is not a clean `ALIGNED`: what to
change, who owns the change, and how to prove it's fixed. Ordered by severity, not by
endpoint name.

Every entry names an **owner**:

| Owner | Means |
|---|---|
| **flow** | Fix belongs to the Power Automate flow estate — this repository cannot fix it, only detect it |
| **decision** | Two valid designs exist (wire the client to the flow, or retire the flow); a person must choose before either repo changes |
| **verification-gap** | The client and flow may already agree — the *probe* didn't test enough to tell. Fix the probe, then re-read this row |
| **documentation** | No code defect; a doc or a config entry is stale relative to what's actually wired |

---

## Critical — fix before any pilot go-live

### 1. `FETCH_ALL` — trigger signature rejected (401)
**Owner: flow.**
1. In Power Automate, regenerate the manual-trigger signature for the `FETCH_ALL` flow.
2. Redeploy the corrected URL into `config/config.local.js` (or wherever `npm run package`
   sources `window.DGO_CONFIG.endpoints.FETCH_ALL` from for this tenant).
3. Confirm the flow still satisfies Wave 0.3 of `docs/deployment/RUNBOOK.md` — it must
   return a `users` collection (even empty) for `runtime.directory.served` to ever become true.

**Verify:** `npm run verify:endpoints -- --only FETCH_ALL` returns `200` with `docs`/`tasks`/
`users` present. Then, in a real browser session against the corrected URL, confirm
`#/diagnostics` shows `runtime.directory.served: true` — that is the signal the bootstrap-admin
fail-open (`docs/architecture/AUTH_RBAC_GUIDE.md` §4.1/§9) has actually closed, not merely that
the signature works.

### 2. `STATUS` (portal) — anti-oracle contract not implemented
**Owner: flow.**
1. Make the flow answer a byte-identical `404` for: unknown reference, wrong email, and an
   expired or replayed proof. No response field may distinguish these cases.
2. Once `VERIFY`/`VERIFY_CONFIRM` are fixed (#4 below), resolve the caller's address from the
   proof rather than the request body on a verified lookup.

**Verify:** re-probe with `__DGO_PROBE__`-style unknown reference → expect `404`. Separately,
submit one real test correspondence through `SUBMISSION`, then probe `STATUS` with its real
`{referenceId, email}` pair → expect `200` with `record`.

### 3. `OTP_GENERATE` / `VERIFY` — response contract not implemented
**Owner: flow.** Same physical flow, two contract names (`OTP_GENERATE` on the platform,
`VERIFY` on the portal).
1. Implement `docs/folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md` §1: look the address up in
   `DGO_UserDirectory`, treat an absent/inactive account identically to a valid one (timing
   included), store the code hashed with an expiry, and answer `{ "sent": true, "expiresAt":
   "<ISO>" }`.
2. Either document the `confidence`/`results` fields the live response already carries but
   `INTERNAL_PLATFORM_FLOWS.md` Part 0 does not, or drop them if they're an artifact of a
   template this flow wasn't meant to keep.

**Verify:** re-probe (or add `expect:['sent']` to this key in
`scripts/lib/endpoint-probes.mjs` first, so future runs check it automatically) and confirm
`sent` is present.

### 4. `OTP_VERIFY` / `VERIFY_CONFIRM` — no proof is ever minted
**Owner: flow.** Same physical flow, two contract names.
1. Implement `IDENTITY.md` §2: single-use + attempt cap, resolve
   `claims.roles` from `DGO_UserDirectory` (never from the request), mint `token` as an HMAC
   over `email | role | expiry` with a flow-held secret.
2. Return `{ "ok": true, "token": "<proof>", "expiresAt": <epoch ms>, "claims": {
   "preferred_username", "name", "roles": [...] } }`. The client already accepts `token`,
   `verification`, or `proof` as the field name — pick one and use it consistently.

**Verify:** re-probe with a real generated-and-entered code (not the canary `000000`) and
confirm `token`/`claims.roles` are present. Then, in a disposable test config, set
`AuthConfig.enabled: true` and run `npm run test:auth` — the enforced-posture assertions should
now have real data to enforce against instead of failing for lack of a token.

**Note:** #3 and #4 are the same root cause on both apps. Fixing the two OTP flows once closes
four rows in the alignment report (`OTP_GENERATE`, `OTP_VERIFY`, `VERIFY`, `VERIFY_CONFIRM`),
not four separate fixes.

### 5. `UPLOAD` (portal) — ticket accepted without validation (unauthenticated write)
**Owner: flow.** The flow's real definition is now known directly (not harvested, not probed —
supplied 2026-08-09; see `DOCUMENT_PORTAL_FLOWS.md` §2.2–§2.3). Its only gate is
`Condition_Upload_Ticket_Missing`, which checks `empty(trim(string(coalesce(triggerOutputs()?
['headers']?['x-upload-ticket'], triggerOutputs()?['headers']?['X-Upload-Ticket'], ''))))`. That
is a non-empty-string check, not a validity check — the ticket is never compared against
anything `SUBMISSION` (#6) issued. Any caller who sends any non-empty value in
`X-Upload-Ticket` gets a file written into the agency's live SharePoint registry
(`https://nitdanigeria.sharepoint.com/sites/NEDMS`, `/NITDA_Central_Registry`), with no size
limit, no integrity check, and no link recorded back to a correspondence record. This is an
unauthenticated write path into a production government document registry.
1. Have `SUBMISSION` persist each minted ticket — id, expiry, one-time-use flag, and (once #6 is
   fixed) the declared file name/size/SHA-256 — somewhere `UPLOAD` can read it back, e.g. a
   `DGO_UploadTickets` list keyed by ticket value.
2. In `UPLOAD`, replace `Condition_Upload_Ticket_Missing`'s empty-string check with a lookup
   against that store: reject with `403` a ticket that is absent, expired, or already redeemed
   (reusing the existing `{"stored":false,"reason":"missing-upload-ticket"}` shape, or a new
   `"reason":"invalid-upload-ticket"` if the distinction matters), and mark the ticket redeemed
   in the same operation that writes the file, so it cannot be replayed.
3. Once `SUBMISSION` carries a declared size/SHA-256, verify the uploaded bytes against them
   before returning `stored:true`; reject with `422` (or the existing 500
   `upload-processing-failed` shape) on mismatch.
4. Write the ticket's parent `referenceId` and the resulting `attachmentLink` back onto that
   correspondence record — today that association exists only in the flow's own response body,
   which the client may or may not persist.

**Verify:** send a syntactically-valid but never-issued value in `X-Upload-Ticket` and confirm
`403`, not `200`. Then confirm a ticket issued by a real `SUBMISSION` (#6) call succeeds exactly
once, and that a second `UPLOAD` call reusing the same ticket is rejected.

---

## High

### 6. `SUBMISSION` (portal) — still the deprecated `trackingId` contract
**Owner: flow.**
1. Rebuild to the ticket-based contract in `document-portal/README.md`: return `{ referenceId,
   uploads: [{ ticket, name }] }`, minting one short-lived, single-use upload ticket per
   declared attachment.
2. Keep minting `referenceId` in the `NITDA-YYYY-<sequence>` shape — that part is already
   correct and must not regress.

**Verify:** re-probe with a payload that declares at least one attachment and confirm `uploads`
is present and non-empty. Then exercise `UPLOAD` (#5) with a real ticket from that response.

### 7. `SINGLE_ASSIGNMENT` — 502, cause not yet isolated
**Owner: flow, with a verification-gap caveat that must be resolved first.**
1. Pull the Power Automate run history for the failed probe request to find the internal
   exception.
2. **Before concluding this is a flow defect**, re-probe with the *full* documented payload
   (`INTERNAL_PLATFORM_FLOWS.md` Part 3.1 — the `NewActivityTask`/`Selected`/nested `payload`
   shape), not the probe table's minimal `{operation:'create'}` body. If the flow only fails
   against the minimal body, the defect is in the flow's null-handling of an optional-looking
   field, not in the contract itself, and the fix is smaller than "rebuild the flow."
3. Fix whichever the re-probe isolates.

**Verify:** re-probe with the full documented payload; expect `200`/`400`, not `502`.

---

## Medium

### 8. `AI_DOC_ANALYSIS` — no envelope, and possibly ignores its input
**Owner: flow.**
1. Wrap the response in the standard envelope (`{ok, status, data, errors, request, timing,
   meta}`), with the analysis under `data`.
2. Confirm the flow's Compose/AI step actually reads `referenceId`/`subject`/`remarks` from the
   trigger body rather than returning a fixed sample response regardless of input.

**Verify:** re-probe twice with two different `subject`/`remarks` values and confirm the
response differs. Confirm `responseKeys` now includes the envelope keys.

### 9. `BULK_ASSIGNMENT_DIRECT` — thinner error body than its "identical" sibling
**Owner: decision.**
1. Either bring this flow's `400` response up to `BULK_ASSIGNMENT`'s 17-field diagnostic body
   (if the two are meant to be identical, as documented), **or**
2. Update `INTERNAL_PLATFORM_FLOWS.md` and `config/endpoints.config.js`'s comments to state the
   two contracts are deliberately different, and say how.

**Verify:** re-probe both, diff `dataKeys`. Either they match, or the documentation now says
why they don't.

### 10. `SUPPORT` (portal) — no case reference returned
**Owner: flow.** Return `{ caseRef }` in the response (a `CASE-`-prefixed reference, per
`document-portal/README.md`).

**Verify:** re-probe, confirm `caseRef` present.

### 11. `AI_CHAT` — 502
**Owner: flow.** Pull the run history for the failure against a trivial `message`; the
assistant feature is unusable until this returns `200` with `reply` or `message`.

**Verify:** re-probe, confirm `200` with a populated `reply`/`message`.

---

## Low — decisions, not defects

### 12. `DISPATCH_OUTBOUND` — flow works, nothing calls it
**Owner: decision.** Either:
- Wire `modules/dispatch.js` to send `operation:'dispatchOutbound'` (retiring its current ad hoc
  `operation:'dispatch'`) so the registered contract is the one actually used, **or**
- Retire the `DISPATCH_OUTBOUND` entry from `ObsidianActionAliases` (`core/api.js`,
  `core/security-actions.js`) and `config/endpoints.config.js`, and document `dispatch` as the
  real, sole contract for this action.

**Verify:** after the decision, grep for callers of whichever name is kept and update
`INTERNAL_PLATFORM_FLOWS.md` Part 9 to match.

### 13. `ARCHIVE_REFERENCE` — flow works, archiving never leaves the browser
**Owner: decision.** Either:
- Make archiving a real governed write — have `modules/archive.js` actually call this operation
  after `core/archive.js#ArchiveService.archiveReference` succeeds locally, so the immutable
  bundle is durable somewhere other than one browser's memory, **or**
- Confirm archiving is deliberately client-local for this release and remove/mark the
  `ARCHIVE_REFERENCE` flow contract as unused.

**Verify:** perform a real archive action in a test session and confirm (via network inspector)
whether a request now fires.

---

## Not probed — build, don't diagnose

### 14. `SCAN_INTAKE`
**Owner: flow.** Build per `docs/deployment/RUNBOOK.md` Wave 4.2 and
`INTERNAL_PLATFORM_FLOWS.md` Part 10 — PUT raw bytes, metadata in `X-DGO-*` headers, apply the
Universal Filename Policy, return `{referenceId, attachmentLink, stored, depositedBy, sha256,
bytes}`.

**Verify:** `npm run verify:endpoints -- --only SCAN_INTAKE` once a URL is configured.

---

## Verification gaps — fix the probe, not the flow

These rows are not proven misaligned; the transcript simply didn't test enough to say. Each is
cheap to close in `scripts/lib/endpoint-probes.mjs`.

| Row | What the probe is missing | Add |
|---|---|---|
| `FETCH_ACTIVITIES` | No `expect` list | `expect: ['activities']` (or whichever alias is authoritative) |
| `SUBSIDIARY_ACTIONS` | Only exercises the unused `GET_BOOTSTRAP` route | Dedicated probe entries for `ACKNOWLEDGE` and `CREATESUPPORTREQUEST` — the two routes real modules send |
| `DYNAMIC_ACTIONS` | Only exercises a synthetic `noop` operation | At least one probe per real discriminator convention (Part 4 of `INTERNAL_PLATFORM_FLOWS.md`): one `payload.action` CRUD-sync sample, one `payload.operation` sample, one activity-lifecycle step |
| `EMAIL` | No `expect` list | `expect: ['requestId']` or whatever the flow actually returns |
| `AI_EMAIL_ANALYSIS` | No known call site to model the probe on | **Owner: documentation** — grep the codebase for a real caller; if none exists, mark the contract orphaned rather than "declared, not verified" |

---

## No action needed

`GET_DOCS`, `REFERENCE_DATA`, `FETCH_EMAIL_ATTACHMENTS`, `BULK_ASSIGNMENT`,
`EMAIL_RELATED_TASK` — keep these as the regression baseline; a future re-probe that changes
any of their verdicts is itself a finding.

`REFERENCE_DATA` is aligned but slow (39.0s against a 15s default client policy) — not a
contract defect, but worth a performance look on the flow side, or a `timeoutMs` override in
`config/fetch-policy.config.js` as a stopgap so the client doesn't abandon a request the flow
would have answered.

---

## Tracking checklist

| # | Endpoint | Owner | Priority | Closes when |
|---|---|---|---|---|
| 1 | `FETCH_ALL` | flow | Critical | `runtime.directory.served` observed `true` |
| 2 | `STATUS` | flow | Critical | unknown-ref probe returns `404` |
| 3 | `OTP_GENERATE` / `VERIFY` | flow | Critical | `sent` present |
| 4 | `OTP_VERIFY` / `VERIFY_CONFIRM` | flow | Critical | `token`/`claims.roles` present |
| 5 | `UPLOAD` | flow | Critical | never-issued ticket rejected `403`; real ticket redeemable exactly once |
| 6 | `SUBMISSION` | flow | High | `uploads` present and redeemable |
| 7 | `SINGLE_ASSIGNMENT` | flow | High | full-payload probe returns non-5xx |
| 8 | `AI_DOC_ANALYSIS` | flow | Medium | envelope present, output varies with input |
| 9 | `BULK_ASSIGNMENT_DIRECT` | decision | Medium | contracts match or the split is documented |
| 10 | `SUPPORT` | flow | Medium | `caseRef` present |
| 11 | `AI_CHAT` | flow | Medium | `200` with `reply` |
| 12 | `DISPATCH_OUTBOUND` | decision | Low | callers and contract agree |
| 13 | `ARCHIVE_REFERENCE` | decision | Low | callers and contract agree |
| 14 | `SCAN_INTAKE` | flow | — | flow built and probed |
| — | 5 verification-gap rows | verification-gap | — | probe table extended, re-run |
