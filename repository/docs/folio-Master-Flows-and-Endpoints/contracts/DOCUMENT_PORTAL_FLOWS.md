# Document Portal — complete flow reference

> **Sources (2026-10-21).** The per-flow sections below were derived from the early portal flow designs, retired on
> 2026-10-21 because the branch keeps only the latest version of every package. The request shapes, traced to the
> client, still hold. For what each flow does today, read its package in the identification release:
> [`packages/identification-phase3/`](../packages/identification-phase3/README.md).

**Status: Specification, re-derived from the real flow definitions.** Every request shape is
the literal body the shipping client constructs, traced to its exact function and line in
`document-portal/js/core.js`, `submit.js`, `track.js`, and `support.js` — not a paraphrase.
**Every flow-side behaviour below — validation rules, rate limits, SharePoint lists touched,
every response code and body — is read directly from the six real, complete flow definitions
shipped in this repository at
[`docs/folio-Master-Flows-and-Endpoints/packages/`](../packages/)
(`01-portal-submission` … `06-portal-status`), not inferred, not harvested from an unrelated
corpus, and not guessed from a live probe against a different estate.**

**This corrects the record.** The previous edition of this document described five of these
six flows as "not harvested" and documented `SUBMISSION` against a field-mismatched, unrelated
harvested definition from `docs/reference/foundational/`, concluding the client's request shape
matched no known flow. That conclusion no longer holds: the real `SUBMISSION` template reads
`localId`, `channel`, `correspondenceType`, `subject`, `category`, `sender.{name,organisation,
organisationType}`, `senderEmail`, `senderPhone`, `eventDate`, `description`, `attachments[]`,
`submittedAt`, `verification` — the client's request, field for field. The previous edition's
`UPLOAD` section (§2) described a real flow that had no ticket validation, no size check and no
checksum check at all; the current `02-portal-upload` template supersedes it entirely with all
three, plus expiry and single-use enforcement. Every "live-observed" response quoted in the
prior edition was captured against a *different*, previously-exposed flow estate (the harvested
corpus under `docs/reference/foundational/`) and is not evidence about the templates documented
here. Where this document quotes a response shape below with no such caveat, it is read straight
from the template's own `Response` action — this is what the flow will actually answer when
deployed unmodified.

**A template is not a deployment.** What is documented below is the *shipped template* — the
JSON one flow's `Code view` compiles from `docs/folio-Master-Flows-and-Endpoints/packages/*.flow.json`
or the `definition` key of `*.flow.json`. A flow built or edited from a different source, or hand-edited
after import, may not match this document; §8 gives a checklist for confirming a live flow still
matches its template. This document does not describe any specific tenant's live flows and makes
no claim about what any already-deployed flow currently does.

Scope: the six contract keys in `document-portal/config.example.js` — `SUBMISSION`, `UPLOAD`,
`SUPPORT`, `VERIFY`, `VERIFY_CONFIRM`, `STATUS`. The internal operations platform's flows are
out of scope; see `docs/folio-Master-Flows-and-Endpoints/contracts/INTERNAL_PLATFORM_FLOWS.md`.

---

## 0. Endpoint registry

| Contract key | HTTP method | Client function | Source file | Queued for offline retry |
|---|---|---|---|---|
| `SUBMISSION` | POST | `PF.intake.submit(record, opts)` | `js/core.js:331` | Yes — `PF.outbox` |
| `UPLOAD` | PUT | `PF.intake.upload(ticket, file)` | `js/core.js:370` | No |
| `SUPPORT` | POST | `PF.intake.support(payload)` | `js/core.js:387` | Yes — `PF.outbox` |
| `VERIFY` | POST | `PF.intake.verifyRequest(email)` | `js/core.js:417` | No |
| `VERIFY_CONFIRM` | POST | `PF.intake.verifyConfirm(email, code)` | `js/core.js:434` | No |
| `STATUS` | POST | `PF.intake.status(referenceId, email, opts)` | `js/core.js:481` | No |

Every URL is read from `window.PF_CONFIG.endpoints` (`document-portal/config.local.js`, built
from `config.example.js`) via `endpointUrl(name)` (`js/core.js:314`), which returns an empty
string when a key is absent or unset. **No request is ever wrapped in an envelope, an `action`
field, or an `operation` field** — every portal request body is exactly the flat JSON object
shown in this document, nothing more. This is a deliberate, structural difference from the
internal platform's `{action, payload, requestId, timestamp}` convention, not an omission — and
it is exactly what every flow's `triggerBody()?['<field>']` reads against.

**No URL configured for a given key:**
| Key | Behaviour when unset |
|---|---|
| `SUBMISSION` | `PF.backendConfigured()` (`js/core.js:318`) returns `false`; the whole portal enters demo mode — `PF.intake.submit` resolves `{delivered:false, reason:'not-configured'}` without any network call |
| `UPLOAD` | `PF.intake.upload` resolves `{ok:false, stored:false, reason:'not-configured'}` |
| `SUPPORT` | `PF.intake.support` resolves `{delivered:false, reason:'not-configured'}` |
| `VERIFY` | `PF.intake.verifyRequest` resolves `{ok:false, reason:'not-configured'}`; `PF.intake.verificationAvailable()` (`js/core.js:531`) returns `false` |
| `VERIFY_CONFIRM` | `PF.intake.verifyConfirm` resolves `{ok:false, reason:'not-configured'}`; `PF.intake.verificationAvailable()` returns `false` |
| `STATUS` | `PF.intake.status` resolves `{resolution:'unavailable', reason:'not-configured'}` |

**Device offline (`navigator.onLine === false`) at call time:**
| Key | Behaviour |
|---|---|
| `SUBMISSION` | Queued in `PF.outbox` (unless the caller passed `{queue:false}`); resolves `{delivered:false, reason:'offline'}` without a network attempt |
| `SUPPORT` | Queued in `PF.outbox`; resolves `{delivered:false, reason:'offline'}` |
| `STATUS` | Resolves `{resolution:'unavailable', reason:'offline'}` — **never queued** |
| `UPLOAD`, `VERIFY`, `VERIFY_CONFIRM` | No offline short-circuit in code — these three proceed to `fetch()` regardless of `navigator.onLine`, which fails at the network layer and is caught identically to any other unreachable-host failure (see each endpoint's "unreachable" row below) |

**Every request carries** `headers: { 'Content-Type': 'application/json' }` (except `UPLOAD`,
which is documented separately) **and no other header** — no correlation id, no bearer token,
no idempotency key. The portal has no authenticated-call posture; see
`docs/architecture/AUTH_RBAC_GUIDE.md` §6.

**Response parsing is uniform and permissive** — `readJson(r)` (`js/core.js:320`):
```js
function readJson(r) {
  return r.text().then(function (t) {
    var data = {};
    try { data = t ? JSON.parse(t) : {}; } catch (e) {}
    return data;
  });
}
```
A non-JSON or empty body is silently treated as `{}`, never thrown. Every field this document
lists as read from a response is therefore read with `data.<field>`-style optional access —
an absent field resolves to `undefined`/falsy, never an exception.

### 0.1 What every template shares

All six flows follow one shape: a `Scope_<Name>_Main` doing the real work, and a sibling
`Scope_<Name>_Catch` that runs only if the main scope itself ends `Failed`/`TimedOut` — i.e. an
*unhandled* exception (a connector throwing, a null-reference on a malformed SharePoint row),
never a validated-but-refused request, which always gets its own explicit `Response` action
inside the main scope. The catch scope's one action is always `HTTP 500` with a flow-specific
`reason` string ending `-processing-failed`.

**Source IP.** Every flow computes it once, first action, identically:
```
@trim(first(split(coalesce(triggerOutputs()?['headers']?['X-Forwarded-For'],
                            triggerOutputs()?['headers']?['X-Azure-ClientIP'], 'unknown'), ',')))
```
`X-Forwarded-For` first (first hop only, in case of a chain), `X-Azure-ClientIP` as fallback,
the literal string `unknown` if neither header is present. This is what every rate-limit bucket
below is keyed on.

**Rate limiting.** One SharePoint list, `NITDA_Portal_RateLimits`, shared by every flow and
every bucket kind, one row per bucket: `Title` (the bucket key, e.g. `SUBMISSION_IP:41.x.x.x`),
`WindowStartUtc`, `RequestCount`, `UpdatedAtUtc`. Every check is the same four-step pattern:
look the bucket up by `Title`, decide if the window has expired (elapsed time past the
threshold below), compute the effective count (`0` if the window expired, else the stored
count), and refuse with `429` if incrementing that count would exceed the limit — otherwise
create-or-patch the bucket row and proceed. **Windows are fixed, not sliding**: a bucket resets
entirely once the window elapses, rather than decaying continuously.

| Flow | Bucket(s) | Window | Limit |
|---|---|---|---|
| `SUBMISSION` | `SUBMISSION_IP:<ip>` | 1 hour | 20 |
| `UPLOAD` | `UPLOAD_IP:<ip>` | 1 hour | 100 |
| `SUPPORT` | `SUPPORT:<ip>` | 10 minutes | 5 |
| `VERIFY` | `VERIFY_IP:<ip>` **and** `VERIFY_EMAIL:<email>` | 10 minutes | 10 (IP), 3 (email) — **both** must pass |
| `VERIFY_CONFIRM` | `VERIFY_CONFIRM_IP:<ip>` | 10 minutes | 15 |
| `STATUS` | `STATUS_IP:<ip>` **and** `STATUS_REF:<referenceId>` | 10 minutes | 30 (IP), 10 (reference) — **both** must pass |

A rate-limit refusal is always `429`; every flow's `429` body carries `reason` or `error` equal
to `"too-many-requests"` except `STATUS`, whose `429` carries `{"resolution":"unavailable",
"reason":"rate-limited"}` — the only flow that answers a refusal in its own domain vocabulary
rather than a bare `reason` string.

**CORS.** Every response on every branch of every flow carries the same three headers:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: <POST|PUT>, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Correlation-ID[, X-Upload-Ticket]
```
**`Access-Control-Allow-Origin: *` is wildcarded on every template, on every response,
including the write endpoints.** This is a deliberate simplification for a public-by-design
channel — nothing in the portal's contract asks a caller to prove which origin it is — but it
means any web page anywhere, not only the deployed portal, can call these flows directly from a
visitor's browser and read the response. Nothing downstream of the flow enforces origin; if a
narrower origin allow-list is wanted, it must be added to these headers before deployment, since
this is the one property none of the six templates leaves configurable.

**SharePoint site.** Every list operation targets one site,
`https://nitdanigeria.sharepoint.com/sites/NEDMS`, via the `shared_sharepointonline` connection.
`UPLOAD` additionally writes binary content into the document library rooted at
`/NITDA_Central_Registry`.

**Lists this estate depends on**, none of which are among the ten `DGO_*` lists
`docs/reference/sharepoint-provisioning-spec.json` provisions for the internal platform — these
six are portal-only and must be provisioned separately:

| List | Written by | Read by | Purpose |
|---|---|---|---|
| `NITDA_Portal_Submissions` | `SUBMISSION` | `STATUS` | One row per correspondence record; `Title` and `ReferenceID` both hold the minted reference after the create-then-patch sequence in §1.2 |
| `NITDA_Portal_SubmissionEvents` | `SUBMISSION` (one row per submission) | `STATUS` (whole timeline) | Append-only timeline; `SubmissionRef` correlates to `NITDA_Portal_Submissions.Title` |
| `NITDA_Portal_Attachments` | `SUBMISSION` (issues), `UPLOAD` (redeems) | `UPLOAD` | One row per upload ticket — `Title` is the ticket GUID, `Redeemed`/`ExpiresAtUtc`/`DeclaredSizeBytes`/`DeclaredSha256` gate `UPLOAD` |
| `NITDA_Portal_SupportCases` | `SUPPORT` | — | One row per helpdesk case |
| `NITDA_Portal_VerificationChallenges` | `VERIFY` (issues), `VERIFY_CONFIRM` (consumes) | `VERIFY_CONFIRM` | One row per mailed OTP; `CodeHash`, `Attempts`, `Consumed`, `ExpiresAtUtc` |
| `NITDA_Portal_VerificationProofs` | `VERIFY_CONFIRM` (issues), `SUBMISSION`/`STATUS` (consume) | `SUBMISSION`, `STATUS` | One row per proof token; `Email`, `Consumed`, `ExpiresAtUtc` |
| `NITDA_Portal_RateLimits` | all six | all six | One row per bucket, shared across every flow (§0.1) |

None of these seven lists appears in `docs/reference/sharepoint-provisioning-spec.json`; provision
them separately before importing any of these six templates, or every `OpenApiConnection` action
above fails at the connector, not at a validation step this document describes.

---

## 1. `SUBMISSION`

### 1.1 Request — as sent by the client

Built in `document-portal/js/submit.js`, function `dispatchToWorkflow` (line 369), invoked
through `PF.intake.submit(record, opts)`. The literal request body:

```json
{
  "localId": "<PF.uid() — client-generated local record id>",
  "channel": "Portal",
  "correspondenceType": "Incoming",
  "subject": "<value of the wizard's Subject field, step 3>",
  "category": "<PF.correspondenceType(service).category>",
  "sender": {
    "name": "<Full name, step 2>",
    "organisation": "<Organisation, step 2>",
    "organisationType": "<Organisation type, step 2>"
  },
  "senderEmail": "<Email, step 2>",
  "senderPhone": "<Phone, step 2 — may be an empty string>",
  "eventDate": "<Event date, if the correspondence type carries one — otherwise an empty string>",
  "description": "<Purpose/description, step 3>",
  "attachments": [
    {
      "name": "<declared file name>",
      "size": "<declared file size in bytes, integer>",
      "sha256": "<SHA-256 hex digest computed client-side via crypto.subtle — an empty string if digestOf() could not compute one>"
    }
  ],
  "submittedAt": "<ISO 8601 timestamp, set once at record creation>"
}
```

`attachments` contains one entry per file the wizard has bytes for (`files.filter(f => f.file)`
in `submit.js`); a file restored from a draft with no bytes (`f.restored === true`) is excluded
from this array entirely and reported separately (§1.4).

**`verification` field — present only when a proof is held.** `PF.intake.submit` accepts a
second `opts` argument and, when `opts.verification` is truthy, merges it in. **As currently
wired, `submit.js` never supplies this second argument** — `dispatchToWorkflow` calls
`PF.intake.submit({...})` with one argument only. The `verification` field is therefore never
present on any request `SUBMISSION` receives from the shipping UI today (§1.5 covers what the
flow does when it is present, since the flow reads it unconditionally regardless of whether the
client ever sends it).

### 1.2 The real flow — validation, rate limiting, and what it writes

Source: `01-portal-submission.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `POST`, with a declared JSON Schema matching §1.1's body
exactly (all fields optional/nullable, `additionalProperties: true`).

**Validation — a single compound condition (`Condition_Validate_Request`), all of:**

| Rule | Exact check |
|---|---|
| Subject | length `> 5` |
| Description | length `> 19` |
| Sender name | length `> 1` |
| Sender email | contains exactly one `@`, not at position `0`, at least 3 characters before the end, a `.` somewhere after it, and no space |
| Category | must be exactly one of `General Correspondence`, `Application`, `Proposal`, `Report`, `Compliance Filing`, `Policy Submission`, `Event Invitation` — the seven distinct values `PF.CORRESPONDENCE_TYPES`' eight public types map onto (`letter` and `other` both map to `General Correspondence`) |
| Attachment count | `1`–`5` |
| Every declared attachment | must independently pass `Filter_Valid_Attachments`: non-empty `name`, `1`–`10485760` bytes (10 MB), and `sha256` either empty or exactly 64 lowercase-hex characters. **The count of attachments passing the filter must equal the count declared** — one malformed attachment fails the whole request, it is not silently dropped |

Any failure → `HTTP 400 {"error":"invalid-request"}`. This is stricter than the client's own
pre-submission checks in places (e.g. the flow enforces the 1–5 attachment count and the 10 MB
per-file ceiling independently of whatever the wizard already validated), which is the point of
validating server-side rather than trusting the caller.

**Verification posture — present, and hard-wired off.** `Condition_Require_Verification_Posture`
gates the entire proof-checking branch on the literal expression `@false == true` — **always
false, in every request, as shipped.** The branch it guards (`Condition_Has_Verification_Token`
→ look up `verification` in `NITDA_Portal_VerificationProofs` by token, require it unconsumed,
unexpired, and its `Email` to match the sender's email case-insensitively, then consume it and
set `varVerifiedSubmission = true`) is real, complete code, but **unreachable in the shipped
template.** A missing or invalid proof, when this branch *is* reached, answers
`403 {"error":"verification_required"}` — the same body whether the token was absent, unknown,
expired, or valid-but-for-a-different-email. To require verification, this literal `false` must
be changed to `true` in the flow's Code view before deployment; there is no configuration flag,
per `document-portal/README.md`'s statement that this is "a flow-side configuration event." As
shipped, every submission proceeds as unverified (`varVerifiedSubmission = false`) regardless of
whether a `verification` token is present in the request.

**Rate limiting.** `SUBMISSION_IP:<source ip>`, 1 hour, 20 requests — see §0.1. Applied
identically on both the verified and unverified code paths (the condition is duplicated, not
shared, between the two branches of `Condition_Require_Verification_Posture` — see §8 for why
that duplication matters when auditing a modified copy).

**Reference minting.** Two SharePoint writes, in order:
1. `Create_Submission_Record` — `PostItem` into `NITDA_Portal_Submissions` with `Title:
   "PENDING"` and every validated field, **before a reference exists.**
2. `Set_Submission_Reference` — `PatchItem` on the row just created, setting both `Title` and
   `ReferenceID` to `concat('NITDA-', <current year>, '-', <the SharePoint list item's own
   integer ID>)`.

**This means the "sequence" is the SharePoint list's own auto-incrementing item ID, not a
separate per-year counter.** It satisfies "unpadded, monotonic, never restarting within a year"
literally — the ID never repeats or resets — but it is a whole-list-lifetime counter with the
current year stamped onto it, not a counter that itself resets each January. `NITDA-2026-450`
followed by `NITDA-2027-451` is the expected behaviour at a year boundary, not a defect; a reader
expecting the trailing number to restart at 1 each year will be surprised. `STATUS` (§6) later
looks the record up by filtering `Title eq '<referenceId>'` — the field this two-step sequence
writes into.

**Timeline.** `Create_Initial_Timeline_Event` posts one row to `NITDA_Portal_SubmissionEvents`:
`{status: "received", label: "Submission received and tracking ID issued.", note: "", actor:
"Portal"}`, correlated by `SubmissionRef` to the reference just minted.

**Attachments — `Foreach_Attachment`, once per declared attachment, in order:**
1. **`Normalize_Attachment_Filename`** (a `Javascript` action) — takes the *base64-decoded,
   UTF-8* original name, strips any path prefix, removes control/zero-width/bidi-override
   characters, trims leading/trailing whitespace and dots, splits the extension (keeping it only
   if it is 1–12 alphanumeric characters), folds the body to lowercase and folds a wide set of
   Latin diacritics onto their base letter (é→e, ñ→n, ß→ss, æ→ae, œ→oe, …), collapses everything
   that isn't `[a-z0-9]` to a single underscore, trims underscores from both ends, reformats a
   trailing `_YYYY_MM_DD` run into `_YYYY-MM-DD`, truncates the body to 120 characters, defaults
   to `document` if nothing survives, and appends `_file` if the result collides with a reserved
   Windows device name (`con`, `prn`, `aux`, `nul`, `com1`–`9`, `lpt1`–`9`). This is the Universal
   Filename Policy `document-portal/README.md` says the flow applies — implemented here, not
   merely referenced. **The original declared name is preserved separately** (`originalName` in
   the action's own output) even though only the normalized `StoredName` is written onward.
2. **`Compose_Attachment_Ticket_Id`** — a fresh `guid()`, unrelated to the file's content or
   name.
3. **`Create_Upload_Ticket`** — `PostItem` into `NITDA_Portal_Attachments`: `Title` = the ticket
   GUID, `SubmissionRef` = the reference just minted, `DeclaredName` = what the client sent,
   `StoredName` = the normalized name from step 1, `DeclaredSizeBytes` / `DeclaredSha256` = what
   the client declared, `Redeemed: false`, `ExpiresAtUtc: +2 hours`, `Status: "Pending"`.
4. The ticket and the *normalized* name (not the original) are appended to the response's
   `uploads[]` array.

### 1.3 Response — every branch, as the template answers it

| Condition | HTTP | Body |
|---|---|---|
| Valid, accepted | `200` | `{"referenceId": "NITDA-<year>-<n>", "uploads": [{"ticket": "<guid>", "name": "<normalized filename>"}, …]}` — `uploads` is `[]` if no attachments were declared (impossible under validation, since count must be `1`–`5`, but structurally always an array) |
| Verification required (only reachable if the posture flag is manually flipped to `true`) | `403` | `{"error": "verification_required"}` — identical body whether the token was absent, unknown, expired, or valid for a different email |
| Rate-limited | `429` | `{"error": "too-many-requests"}` |
| Failed validation | `400` | `{"error": "invalid-request"}` |
| Unhandled exception (`Scope_Submission_Catch`) | `500` | `{"error": "submission-processing-failed"}` |

### 1.4 Response handling — every branch the client executes

`PF.intake.submit`'s `.then()` (`js/core.js:343-359`), in the order checked:

| Condition | Client-side outcome | Returned value |
|---|---|---|
| `r.status === 403` and `data.error === 'verification_required'` | Not queued. Handed back to the caller (the wizard) to resolve. | `{ delivered: false, status: 403, reason: 'verification-required' }` |
| `!r.ok` (any other non-2xx) | Queued in `PF.outbox` (unless `opts.queue === false`); an `integration` log entry is written | `{ delivered: false, status: r.status, reason: data.reason || 'rejected' }` |
| `r.ok` (2xx) | An `integration` log entry is written naming `data.referenceId` | `{ delivered: true, referenceId: data.referenceId, uploads: data.uploads || [] }` |
| `fetch()` throws (network failure) | Queued in `PF.outbox`; an `integration` log entry is written | `{ delivered: false, reason: 'unreachable' }` |
| No `SUBMISSION` URL configured | No network call is attempted | `{ delivered: false, reason: 'not-configured' }` |
| Device offline | Queued in `PF.outbox` (unless `opts.queue === false`) | `{ delivered: false, reason: 'offline' }` |

**Fields actually read from a 2xx body:** `data.referenceId`, `data.uploads` (defaulted to `[]`
if absent) — which is exactly what §1.3's `200` body carries, field for field. No other response
field is read by any client code.

**`res.referenceId` present:** `submit.js`'s `dispatchToWorkflow` overwrites the local record's
id with it (`PF.store.update(rec.id, {referenceId: res.referenceId}, ...)`) — this is what makes
a later `STATUS` lookup possible; a local id has no meaning to the registry.

**Attachments excluded from `attachments[]` for lacking bytes** (`missing` in
`dispatchToWorkflow`): logged via `PF.store.log('integration', ..., '<n> attachment(s) could not
be sent — bytes were not available after a draft restore')`. Not reported to the flow in any way
— the flow never learns these were declared and dropped, and never sees them in the array it
validates (§1.2), so they play no part in the flow's own count check.

**When `res.delivered === true`:** `uploadAll(res.uploads || [], withBytes, res.referenceId ||
rec.id)` (`submit.js:426`) redeems each returned upload ticket sequentially against `UPLOAD`
(§2). Since the real `SUBMISSION` template always returns one ticket per accepted attachment
(§1.2/§1.3), this loop now has exactly as many iterations as attachments were declared — unlike
the previously-exposed estate this document formerly described, where an empty `uploads[]` was
the observed norm and this loop silently ran zero times.

**UI outcome states**, keyed by the *portal's own* delivery classification (`submit.js:518`,
`OUTCOME` object) — not a flow field, but included here because it is the terminal state every
`SUBMISSION` call resolves to from the citizen's perspective:

| Delivery state | Trigger | Citizen-visible title | Citizen-visible note |
|---|---|---|---|
| `delivered` | `res.delivered === true` | "Submission received" | "`<type>` has been delivered to the registry. A confirmation is on its way to `<email>`." |
| `queued` | any `reason` other than `not-configured`, including `verification-required`, `rejected`, `unreachable`, `offline` | "Saved — not yet delivered" | "We could not reach the registry. Your submission is saved and will be sent automatically — do not submit it again. If no confirmation reaches `<email>` within one working day, contact the helpdesk quoting this tracking ID and the time above." |
| `held` | `PF.backendConfigured() === false` (demo mode) | "Saved on this device only" | "This portal is not connected to the registry, so your submission has not been sent. It is saved in this browser only. Contact the helpdesk quoting the date and time above, or use the walk-in registry." |

**`verification-required` is classified as `queued`, not surfaced as a distinct state to the
citizen**, and — critically — **nothing in `submit.js` re-runs the `VERIFY`/`VERIFY_CONFIRM`
round-trip on this response.** `track.js`'s `lookup()` function has an explicit branch for
`res.resolution === 'verification-required'` that calls `requireVerification()`; no equivalent
branch exists in `submit.js` for `SUBMISSION`'s `403 verification_required`. **This is only
reachable at all if a deployer manually flips `Condition_Require_Verification_Posture`'s literal
`false` to `true`** (§1.2) — but if that is done without also changing `submit.js`, a citizen
would be shown the generic "Saved — not yet delivered / will be sent automatically" message,
which is false: it will never be sent automatically, because nothing ever supplies the proof it
is waiting for. Flipping the posture flag is not, by itself, a complete activation — the client
gap described here must close alongside it.

### 1.5 Response variants — complete enumeration

| Variant | HTTP | Body shape | `resolution`/outcome reaching the citizen |
|---|---|---|---|
| Accepted | 200 | `{referenceId, uploads: [...]}` | `delivered`, followed by one `UPLOAD` call per attachment |
| Verification required (posture flag manually enabled) | 403, `{"error":"verification_required"}` | — | `queued` (see caveat above — the wizard never retries with a proof) |
| Rate-limited | 429, `{"error":"too-many-requests"}` | — | `queued`, reason `rejected` |
| Failed validation | 400, `{"error":"invalid-request"}` | — | `queued`, reason `rejected` |
| Processing failure | 500, `{"error":"submission-processing-failed"}` | — | `queued`, reason `rejected` |
| Unreachable | — | — | `queued`, reason `unreachable` |
| Not configured | — | — | `held` (demo mode) |
| Offline | — | — | `queued`, reason `offline` |

---

## 2. `UPLOAD`

### 2.1 Request — as sent by the client

`PF.intake.upload(ticket, file)` (`js/core.js:370`), called once per declared attachment from
`submit.js`'s `uploadAll` (line 426), **sequentially, not in parallel**:

```
PUT <UPLOAD endpoint URL>
Content-Type: application/octet-stream
X-Upload-Ticket: <ticket string, exactly as returned in SUBMISSION's response uploads[].ticket>

Body: <raw bytes of the file, unencoded>
```

There is no JSON body and no other identifying field — the ticket alone is the correlation
between this call and the `SUBMISSION` that produced it.

### 2.2 The real flow — ticket redemption, size and checksum enforcement

Source: `02-portal-upload.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `PUT`, no declared body schema — the trigger accepts the
raw bytes with no JSON Schema validation, exactly as the client sends them.

**This flow validates every property `document-portal/README.md`'s contract table demands of
it, in this order:**

1. **Ticket header present** — `X-Upload-Ticket` (case-insensitive), trimmed, non-empty. Missing
   → `403 {"stored":false,"reason":"missing-upload-ticket"}`.
2. **Rate limit** — `UPLOAD_IP:<source ip>`, 1 hour, 100 requests (§0.1). Exceeded →
   `429 {"stored":false,"reason":"too-many-requests"}`.
3. **Ticket exists** — `Get_Upload_Ticket` looks the header value up by `Title` in
   `NITDA_Portal_Attachments`. Not found → `404 {"stored":false,"reason":"ticket-not-found"}`.
4. **Ticket not already redeemed** — `Redeemed === true` → `409
   {"stored":false,"reason":"ticket-already-redeemed"}`. **Single-use is enforced here**, by a
   real lookup against issued tickets — not, as a previous edition of this document found, by
   nothing.
5. **Ticket not expired** — past its `ExpiresAtUtc` (set to `+2 hours` at issue, §1.2) → the
   ticket is marked `Status: "Expired"` and the flow answers `410
   {"stored":false,"reason":"ticket-expired"}`.
6. **Declared size matches** — the byte length actually received (`Content-Length` header if
   present, else the raw trigger body's own length) must equal `DeclaredSizeBytes` from the
   ticket. Mismatch → `413 {"stored":false,"reason":"size-mismatch"}`.
7. **Checksum, if one was declared** — `DeclaredSha256` non-empty triggers `Verify_Upload_Checksum`,
   a `Javascript` action that SHA-256-hashes the raw received bytes and compares the hex digest
   to the declared one. The comparison is not constant-time. Mismatch → `422
   {"stored":false,"reason":"checksum-mismatch"}`. **If no checksum was declared** (the client's
   `sha256` was an empty string — `PF.digestOf()` could not compute one), this step is skipped
   entirely and the file is stored unchecked; nothing downstream is told the integrity check
   never ran.
8. **Store** — `Create_Stored_File` writes the raw bytes (chunked transfer) to
   `/NITDA_Central_Registry/Portal/<SubmissionRef>/<StoredName>` — the *normalized* filename
   `SUBMISSION` computed and stored on the ticket, in a folder named after the submission's own
   reference. **This supersedes the previously-exposed implementation entirely**: there is no
   forced `.bin` extension, no timestamp-and-ticket filename, and the stored file lives inside a
   folder scoped to the correspondence record it belongs to — the association a prior edition of
   this document found completely absent is now structural.
9. **Redeem** — `Redeem_Upload_Ticket` patches the ticket row: `Redeemed: true`,
   `RedeemedAtUtc`, `AttachmentLink` (the created file's `Path`, else `Id`, else `Name` —
   whichever the connector returns first), `Status: "Stored"`.
10. **Respond** — `200 {"stored":true,"attachmentLink":"<path>","reason":""}`.

### 2.3 What changed from the previously-documented implementation

Measured against `document-portal/README.md`'s contract — *"Redeem the ticket once and only
once; check the bytes against the size and SHA-256 the submission declared; refuse anything
oversize or unmatched"* — the template documented here satisfies two of the three clauses: single-use is a
real lookup-and-flag against issued tickets (§2.2 step 4) and size is checked exactly (step 6).

> **The checksum clause is not satisfied, and this paragraph used to say it was.** It credited
> step 7 with checking the digest whenever one was declared, then named an *undeclared* checksum
> as "the one gap that remains". The real gap is larger and sits in step 7 itself. Read 2026-08-31
> out of `02-portal-upload.flow.json`: `Verify_Upload_Checksum` ends
> `var declared = "first(outputs('Get_Upload_Ticket')?['body/value']?['DeclaredSha256'])"` — a
> bare string literal with no `@{…}`, while the line directly above it interpolates correctly as
> `base64ToBytes("@{base64(triggerBody())}")`. So `declared` is the literal WDL text rather than
> the ticket's digest, and `match` is **always false**. The step does not check the checksum; it
> fails it, for every upload, including correct ones.
>
> This is the same defect, character for character in shape, as `Hash_And_Compare_Code` in
> `05-portal-verify-confirm.flow.json` — see §5.2. Both actions interpolate the value they
> compute and forget to interpolate the value they compare it against. Twice is a pattern, not a
> slip: **check that line specifically in any inline-code action before trusting it.**
>
> Both actions are also typed `"Javascript"`, which is not a Power Automate action type — the
> action is `JavaScriptCode` — so neither would import as written. Nothing deployed runs either
> of them; no inline-code action of any spelling appears in the 58 exported definitions. The
> shipped `Portal_UPLOAD_ECM_DOCS` package checks the size and does not compute a digest, which
> is open item 18 and is stated honestly there.

The undeclared-checksum path is worth naming separately: an empty `sha256` from a browser where
`crypto.subtle` was unavailable skips the integrity check rather than refusing the upload — a
deliberate accept-without-proof fallback. It would matter if step 7 worked.

### 2.4 Response handling — every branch the client executes

`PF.intake.upload`'s `.then()` (`js/core.js:377-381`):

```js
return { ok: r.ok, stored: !!data.stored, status: r.status,
         reason: data.reason || data.error || '', link: data.attachmentLink || '' };
```

Because the real flow never answers a `200` with `stored:false` — every path that reaches a
`Response` action either fully succeeds (`200 stored:true`) or refuses with a distinct non-2xx
status (§2.5) — the `ok:true`/`stored:false` gap a previous edition of this document flagged in
`uploadAll`'s handling **cannot occur against this template.** `uploadAll` (`submit.js:426-451`)
reads only `r.ok`, and `r.ok` and `data.stored` now always agree.

| Condition | Citizen-visible outcome |
|---|---|
| `failed.length === 0` | Logged: `'<n> attachment(s) delivered to the registry'`. No toast. |
| `failed.length > 0` | Logged: `'<n> attachment(s) not yet delivered: <names>'`. Toast (`warn`, 9000ms): `"Some attachments are still uploading — <names> did not complete. Your reference is recorded and the registry will follow up — do not resubmit."` |

A declared attachment whose ticket or file object is missing entirely (`!t \|\| !f \|\| !f.file`)
is pushed to `failed` without any network call being attempted for it.

### 2.5 Response variants — complete enumeration, exact to the real flow

| Variant | HTTP | Body | Client result |
|---|---|---|---|
| Ticket header absent or empty | 403 | `{"stored":false,"reason":"missing-upload-ticket"}` | Failure |
| Rate-limited | 429 | `{"stored":false,"reason":"too-many-requests"}` | Failure |
| Ticket unknown | 404 | `{"stored":false,"reason":"ticket-not-found"}` | Failure |
| Ticket already redeemed | 409 | `{"stored":false,"reason":"ticket-already-redeemed"}` | Failure |
| Ticket expired | 410 | `{"stored":false,"reason":"ticket-expired"}` | Failure |
| Received bytes don't match declared size | 413 | `{"stored":false,"reason":"size-mismatch"}` | Failure |
| Received bytes don't match declared SHA-256 | 422 | `{"stored":false,"reason":"checksum-mismatch"}` | Failure |
| Accepted | 200 | `{"stored":true,"attachmentLink":"<path>","reason":""}` | Success |
| Unhandled exception | 500 | `{"stored":false,"reason":"upload-processing-failed"}` | Failure |
| Unreachable | — | — | Failure, `reason:'unreachable'` |
| Not configured | — | — | Failure, `reason:'not-configured'` |

---

## 3. `SUPPORT`

### 3.1 Request — as sent by the client

Built in `document-portal/js/support.js`, function `send` (line 206), passed to
`PF.intake.support(payload)` which posts it verbatim (`js/core.js:387-406`):

```json
{
  "name": "<Name field, the case form>",
  "email": "<Email field, the case form>",
  "topic": "<the topic's human-readable LABEL — e.g. the display text of the chosen PF.SUPPORT_TOPICS entry, not its key>",
  "aboutReference": "<the tracking-ID field, uppercased — an empty string if left blank>",
  "message": "<Message field, the case form>"
}
```

This is the complete, exact, real request body — `name`, `email`, `topic`, `aboutReference`,
`message`. `topic` carries the topic's label string, not its internal key.

### 3.2 The real flow

Source: `03-portal-support.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `POST`, JSON Schema matching §3.1 exactly.

**Validation (`Condition_Validate_Request`), all of:** name length `> 1`; email in the same
format check `SUBMISSION` uses (§1.2); topic length `> 0`; message length `20`–`3999`
(`greater(...,19)` and `less(...,4000)`). Failure → `400 {"delivered":false,"reason":
"invalid-request"}`.

**Rate limit.** `SUPPORT:<source ip>`, 10 minutes, 5 requests (§0.1). Exceeded →
`429 {"delivered":false,"reason":"too-many-requests"}`.

**Case reference.** `Compose_Case_Ref`: `concat('NITDA-S-', toUpper(substring(replace(guid(),
'-', ''), 0, 6)))` — six uppercase hex characters from a fresh GUID. **This is the identical
shape** `support.js`'s own `sref()` function generates client-side (`'NITDA-S-' + six random
uppercase-alphabet characters`) — the two references look alike by construction, even though (per
§3.3) neither is ever compared with the other.

**Storage.** One row in `NITDA_Portal_SupportCases`: `Title` = the case ref, `Name`, `Email`,
`Topic`, `AboutReference`, `Message`, `Status: "open"`, `SubmittedAtUtc`, `SourceIp`.

### 3.3 Response — real, and not consumed by the current UI

```
HTTP 200
{ "caseRef": "NITDA-S-<6 hex chars>" }
```

**The current call site never consumes this.** `support.js`'s `send()` function calls
`PF.intake.support({...})` with **no `.then()`, no assignment, and no use of the returned promise
at all.** The case reference the citizen is shown (`ticket.ref`, generated locally by `sref()`)
is created **before** `PF.intake.support` is even called, and is never reconciled with the flow's
own `caseRef` — even though, per §3.2, the two are shaped identically and would very likely be
different values for the same case.

### 3.4 Response handling — every branch the client executes

`PF.intake.support`'s `.then()` (`js/core.js:397-401`), for completeness — reachable only by code
that awaits the returned promise, which no current call site does:

| Condition | Client-side outcome | Returned value |
|---|---|---|
| `!r.ok` | Queued in `PF.outbox` | `{ delivered: false, status: r.status }` |
| `r.ok` (2xx) | — | `{ delivered: true, caseRef: data.caseRef }` |
| `fetch()` throws | Queued in `PF.outbox` | `{ delivered: false, reason: 'unreachable' }` |
| No `SUPPORT` URL configured | No network call attempted | `{ delivered: false, reason: 'not-configured' }` |
| Device offline | Queued in `PF.outbox` | `{ delivered: false, reason: 'offline' }` |

Since nothing reads this return value today, **every one of these outcomes is presently
indistinguishable to the citizen** — `support.js` shows the same "Case `<local ref>` opened"
toast and receipt regardless of whether the request was delivered, rejected, rate-limited, or
failed outright. `PF.outbox.flush()` (`js/core.js:277-290`) will still retry a queued `support`
entry up to 5 times on a later page load with connectivity, independent of whether the UI ever
reports this.

### 3.5 Response variants — complete enumeration

| Variant | HTTP | Body | Effect on the citizen-visible outcome |
|---|---|---|---|
| Accepted | 200, `{"caseRef": "NITDA-S-…"}` | None — not read by the calling code |
| Failed validation | 400, `{"delivered":false,"reason":"invalid-request"}` | None — not read; queued for retry |
| Rate-limited | 429, `{"delivered":false,"reason":"too-many-requests"}` | None — not read; queued for retry |
| Processing failure | 500, `{"delivered":false,"reason":"support-processing-failed"}` | None — not read; queued for retry |
| Unreachable | — | None — not read; queued for retry |
| Not configured | — | None — no network call is made at all |

---

## 4. `VERIFY`

### 4.1 Request — as sent by the client

`PF.intake.verifyRequest(email)` (`js/core.js:417`), called from `track.js`'s
`requireVerification` (line 174) when a `STATUS` lookup has come back `verification-required`:

```json
{ "email": "<the address the citizen entered in the tracking form>" }
```

No other field.

### 4.2 The real flow — a dedicated portal flow, not the shared internal-platform OTP pair

Source: `04-portal-verify-request.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `POST`, schema `{email}` — **this is a flow built
specifically for the portal's own field name.** It is not, as a previous edition of this document
concluded from harvested evidence, the internal platform's shared `OTP_GENERATE` flow under a
different name; that flow's harvested schema reads `userEmail`/`identifier`, which this template
does not.

**Validation.** Same email-shape check as `SUBMISSION` (§1.2). Failure →
`400 {"sent":false,"reason":"invalid-email"}`.

**Rate limiting — two independent buckets, both must pass:** `VERIFY_IP:<source ip>` (10
requests / 10 minutes) and `VERIFY_EMAIL:<email>` (3 requests / 10 minutes) — see §0.1. Either
refusal → `429 {"sent":false,"reason":"too-many-requests"}`.

**Superseding prior challenges.** Before issuing a new code, `Foreach_Supersede_Prior_Challenge`
marks every existing unconsumed challenge for the same email `Consumed: true` — **only the most
recently requested code can ever be valid**; requesting a new one silently invalidates any code
already mailed and not yet used.

**The code.** `Compose_Otp_Code`: `string(rand(100000, 999999))` — six decimal digits.
`Compose_Expires_At`: `+5 minutes`.

**Hashing.** `Hash_Otp_Code`, a `Javascript` action, computes
`sha256Hex(pepper + '|' + email + '|' + code)` where `pepper` is the literal 64-character hex
string `7e2e091c121354daeac06bbe4f45fbb6d4d6fbd628f70127e9fbafa512414a9d`, hardcoded in the
action's own source. **This value is identical, and public, in every copy of this template** —
it is not a secret injected at deployment; it ships as plain text inside
`04-portal-verify-request.flow.json` (retired 2026-10-21) and its
sibling `05-portal-verify-confirm.definition.json` (§5.2 uses the same constant to verify). Only the resulting hash is stored, never the plaintext code.

> **This hashing protects nothing, and an earlier edition of this section said it did.** The
> sentence removed here claimed the hash "still serves its purpose against a SharePoint reader
> who can see `CodeHash` but not the code itself — the hash is not reversible without the code."
> That is false for this input. The code is **six decimal digits**, the pepper is public in this
> repository, and the email is in the `Email` column of the same row the reader is already
> looking at. So every input to the digest except the code is known, and the code has 10⁶
> candidates: a reader holding `CodeHash` recovers the code by hashing a million strings, which
> is a fraction of a second's work and far inside the five-minute validity window. A digest is
> only one-way over a keyspace too large to enumerate, and this one is not. Whoever can read
> `CodeHash` can read the code.
>
> The protection against that reader is not the hash. It is list permissions, plus the
> lifecycle — five-minute expiry, single use, and the attempt cap. This is the same conclusion
> SC-003 reaches for the shipped packages by a different route, and it is why storing the
> plaintext code there costs nothing this design was buying.

**Storage.** `Create_Verification_Challenge` posts one row to
`NITDA_Portal_VerificationChallenges`: `Title`/`Email`, `CodeHash`, `ExpiresAtUtc`, `Attempts: 0`,
`Consumed: false`, `SourceIp`.

**Delivery.** `Send_Verification_Email`, via the `shared_office365` connection
(`SendEmailV2`), to the submitted address, subject *"Your NITDA Intelligent Portal verification
code"*, an inline-styled HTML body showing the six digits and stating the 5-minute expiry.

**Send failure is not a hard failure.** If `Scope_Send_Verification_Email` itself fails, times
out, or is skipped, `Response_Verify_Send_Failed` still answers `200 {"sent":false,"expiresAt":
null}` — a `200`, not a `4xx`/`5xx` — deliberately reporting the honest outcome ("not sent") in
the body rather than as a transport error. **The verification-challenge row is still created and
still holds a real, mailed-nowhere code** even when the send itself failed — nothing rolls that
back.

### 4.3 Response — every branch, as the template answers it

| Condition | HTTP | Body |
|---|---|---|
| Sent | 200 | `{"sent": true, "expiresAt": "<ISO 8601, +5 min>"}` |
| Mail send failed | 200 | `{"sent": false, "expiresAt": null}` |
| Invalid email | 400 | `{"sent": false, "reason": "invalid-email"}` |
| Rate-limited (either bucket) | 429 | `{"sent": false, "reason": "too-many-requests"}` |
| Unhandled exception | 500 | `{"sent": false, "reason": "verify-processing-failed"}` |

### 4.4 Response handling — every branch the client executes

`PF.intake.verifyRequest`'s `.then()` (`js/core.js:423-430`):

| Condition | Returned value |
|---|---|
| `r.status === 429` | `{ ok: false, reason: 'too-many-requests' }` |
| `!r.ok` (any other non-2xx) | `{ ok: false, reason: data.error \|\| 'refused' }` |
| `r.ok` (2xx) | `{ ok: true, sent: data.sent === true, expiresAt: data.expiresAt }` |
| `fetch()` throws | `{ ok: false, reason: 'unreachable' }` |
| No `VERIFY` URL configured | `{ ok: false, reason: 'not-configured' }` — no network call attempted |

`track.js`'s caller (`js/track.js:177-188`) branches on `!r.ok || !r.sent`:
```js
PF.intake.verifyRequest(email).then(function (r) {
  if (!r.ok || !r.sent) {
    /* toast: 'Could not send the code' — with a distinct message when r.reason === 'too-many-requests' */
    return;
  }
  /* proceeds to render the six-digit code entry field */
});
```
Against the real flow, `sent: data.sent === true` correctly distinguishes a genuine send
(`sent:true`) from a soft mail failure (`sent:false`, still `200 ok:true`) — the citizen sees
"Could not send the code" in the latter case even though the HTTP call itself succeeded, which is
the correct behaviour for that state, not a client bug.

### 4.5 Response variants — complete enumeration

| Variant | HTTP | Body | Client result |
|---|---|---|---|
| Sent | 200, `{"sent":true,"expiresAt":"…"}` | Proceeds to code-entry step |
| Mail send failed | 200, `{"sent":false,"expiresAt":null}` | "Could not send the code" toast |
| Invalid email | 400, `{"sent":false,"reason":"invalid-email"}` | "The code could not be sent to that address just now." |
| Rate-limited | 429, `{"sent":false,"reason":"too-many-requests"}` | "Too many requests from this connection. Wait a minute and try again." |
| Processing failure | 500, `{"sent":false,"reason":"verify-processing-failed"}` | "The code could not be sent to that address just now." |
| Unreachable | — | Same generic toast, via `reason:'unreachable'` |
| Not configured | — | `PF.intake.verificationAvailable()` returns `false` before this is ever called; `track.js` shows "this site is not configured to send that code" and never attempts the call |

---

## 5. `VERIFY_CONFIRM`

### 5.1 Request — as sent by the client

`PF.intake.verifyConfirm(email, code)` (`js/core.js:434`), called from `track.js`'s
`confirmCode` click handler (line 193), only after `VERIFY` has reported `sent: true`:

```json
{
  "email": "<the same address VERIFY was called with>",
  "code": "<the six digits the citizen entered — validated client-side against /^\\d{6}$/ before this call is made>"
}
```

### 5.2 The real flow — challenge lookup, attempt cap, and proof minting

Source: `05-portal-verify-confirm.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `POST`, schema `{email, code}` — again a dedicated
portal flow, not a repurposed internal-platform one; the field names match the client exactly.

**Validation.** Email in the same shape check as §1.2/§4.2, and `code` exactly 6 digits (length
`6`, every character `0`–`9`). Failure → `400 {"verified":false,"reason":"invalid-request"}`.

**Rate limit.** `VERIFY_CONFIRM_IP:<source ip>`, 10 minutes, 15 requests (§0.1). Exceeded →
`429 {"verified":false,"reason":"too-many-requests"}`.

**Challenge lookup.** `Get_Latest_Challenge`: the most recent unconsumed
`NITDA_Portal_VerificationChallenges` row for the email (`$orderby=CreatedAtUtc desc, $top=1`).
None found → `401 {"verified":false,"reason":"no-pending-code"}`.

**Expiry.** Past `ExpiresAtUtc` → the challenge is consumed (so a second attempt against the same
expired challenge also reports expiry, not "no pending code") and the flow answers
`401 {"verified":false,"reason":"code-expired"}`.

**Attempt cap.** `Attempts >= 5` → the challenge is consumed and the flow answers
`429 {"verified":false,"reason":"too-many-attempts"}` — **this locks the challenge out
permanently on the fifth wrong guess**, independent of the IP rate limit above; a citizen who
mistypes the code five times must request a fresh one via `VERIFY` rather than keep guessing
against the same challenge.

**Comparison.** `Hash_And_Compare_Code`, a `Javascript` action, recomputes
`sha256Hex(pepper|email|code)` with the identical pepper constant §4.2 uses and compares it to
the stored `CodeHash` with its own `constantTimeEquals()`.

> **This action does not work, in three separate ways. Do not port it.** Read 2026-08-31 out of
> `05-portal-verify-confirm.flow.json`. It is a superseded design and nothing deployed runs it —
> the shipped `Portal_VERIFY_CONFIRM_ECM_DOCS` package stores the plaintext code and compares
> with `equals()`, per SC-003 — but it is the only worked example of the inline-code route in
> this repository, and OPEN_ITEMS item 18 leans on that route for the upload digest. It is not
> the precedent it looks like.
>
> 1. **The comparison is always false.** The action's last lines read
>    `var stored = "first(outputs('Get_Latest_Challenge')?['body/value']?['CodeHash'])"` — a bare
>    string literal. The two lines above it interpolate correctly, as `"@{base64(outputs('Compose_Email'))}"`,
>    and this one has no `@{…}`. So `stored` is the literal WDL text rather than the hash, it can
>    never equal a 64-character digest, and **every correct code would be refused.**
> 2. **The action type does not exist.** It is written `"type": "Javascript"`. The Power Automate
>    action is `JavaScriptCode`. The definition would not import as written.
> 3. **The hashing buys nothing** — see the note in §4.2. Six digits and a public pepper.
>
> None of this makes the inline-code route unachievable; it means the route has never been made
> to work here. No action of either spelling appears in any of the 58 exported definitions —
> checked by enumerating every action type in the deployed estate, not by grepping one string.

**Match:**
- The challenge is consumed.
- `Compose_Proof_Token`: `concat(replace(guid(),'-',''), replace(guid(),'-',''))` — two GUIDs
  with their hyphens stripped and concatenated, a 64-hex-character opaque token.
- `Create_Verification_Proof` posts one row to `NITDA_Portal_VerificationProofs`: `Title` = the
  token, `Email`, `Purpose: "portal-verification"`, `ExpiresAtUtc: +15 minutes`, `Consumed:
  false`.
- `200 {"verification": "<the token>", "expiresAt": "<+15 min>"}`.

**No match:** the challenge's `Attempts` is incremented (but the challenge itself is *not*
consumed — the citizen may try again, up to the cap above) and the flow answers
`401 {"verified":false,"reason":"invalid-code"}`.

### 5.3 Response — every branch, as the template answers it

| Condition | HTTP | Body |
|---|---|---|
| Verified | 200 | `{"verification": "<64-hex proof token>", "expiresAt": "<ISO 8601, +15 min>"}` |
| Wrong code | 401 | `{"verified": false, "reason": "invalid-code"}` |
| No pending code for this email | 401 | `{"verified": false, "reason": "no-pending-code"}` |
| Code expired | 401 | `{"verified": false, "reason": "code-expired"}` |
| Too many wrong attempts on this challenge | 429 | `{"verified": false, "reason": "too-many-attempts"}` |
| Rate-limited (by IP) | 429 | `{"verified": false, "reason": "too-many-requests"}` |
| Invalid request shape | 400 | `{"verified": false, "reason": "invalid-request"}` |
| Unhandled exception | 500 | `{"verified": false, "reason": "verify-confirm-processing-failed"}` |

### 5.4 Response handling — every branch the client executes

`PF.intake.verifyConfirm`'s `.then()` (`js/core.js:440-444`):

| Condition | Returned value |
|---|---|
| `!r.ok` (any non-2xx) | `{ ok: false, reason: 'verification-failed' }` — **the client collapses every one of §5.3's non-2xx `reason` values (`invalid-code`, `no-pending-code`, `code-expired`, `too-many-attempts`, `too-many-requests`, `invalid-request`, `verify-confirm-processing-failed`) into this one string; `r.status` and `data.reason` are both discarded** |
| `r.ok` (2xx) | `{ ok: true, verification: data.verification, expiresAt: data.expiresAt }` |
| `fetch()` throws | `{ ok: false, reason: 'unreachable' }` |
| No `VERIFY_CONFIRM` URL configured | `{ ok: false, reason: 'not-configured' }` — no network call attempted |

`track.js`'s caller (`js/track.js:198-206`) branches on `!v.ok || !v.verification`:
```js
PF.intake.verifyConfirm(email, code).then(function (v) {
  if (!v.ok || !v.verification) {
    /* toast: 'That code was not accepted — Check the digits, or send a new code.' */
    return;
  }
  proof = v.verification;   // held in a page-scoped variable, never persisted
  lookup();                  // immediately retries STATUS with the proof
});
```
Every one of the six distinct real refusal reasons (wrong code, no pending code, expired,
too many attempts, rate-limited, malformed request) therefore presents identically to the
citizen — a wrong-code toast, whether or not the digits themselves were ever actually wrong.

**On success**, `proof` is held in a variable local to the `track.js` page module (`var proof =
null;`, line 143) — **never written to any storage** — and is consumed exactly once by the
immediately-following `lookup()` call, then set back to `null` (`js/track.js:114`, inside the
`STATUS` success branch: `proof = null; // single use — the flow burns it, so the page must
too`). A page reload discards it; there is no path for a stale proof to be replayed from this
client. This client-side discipline matches the flow's own single-use enforcement in `STATUS`
(§6.2): the proof is consumed server-side on first successful use regardless of what the client
does with its copy, so the two are independent, reinforcing guarantees rather than one relying on
the other.

### 5.5 Response variants — complete enumeration

| Variant | HTTP | Body | Client result |
|---|---|---|---|
| Verified | 200, `{"verification":"…","expiresAt":"…"}` | `proof` set; `STATUS` retried immediately with it |
| Wrong code | 401, `{"verified":false,"reason":"invalid-code"}` | "That code was not accepted" toast |
| No pending code | 401, `{"verified":false,"reason":"no-pending-code"}` | Same toast |
| Expired | 401, `{"verified":false,"reason":"code-expired"}` | Same toast |
| Too many attempts on this challenge | 429, `{"verified":false,"reason":"too-many-attempts"}` | Same toast |
| Rate-limited by IP | 429, `{"verified":false,"reason":"too-many-requests"}` | Same toast |
| Malformed request | 400, `{"verified":false,"reason":"invalid-request"}` | Same toast |
| Processing failure | 500, `{"verified":false,"reason":"verify-confirm-processing-failed"}` | Same toast |
| Unreachable | — | Same toast, via `!v.ok` |
| Not configured | — | Unreachable in practice — `verificationAvailable()` gates entry to this step; see §4.5 |

---

## 6. `STATUS`

### 6.1 Request — as sent by the client

`PF.intake.status(referenceId, email, opts)` (`js/core.js:481`), called from `track.js`'s
`lookup()` (line 105). **Exactly one of two mutually exclusive bodies is sent, never both**:

Unverified (no proof held — the common case, and the only one possible before `VERIFY_CONFIRM`
has ever succeeded once in the current page session):
```json
{ "referenceId": "<the tracking ID field, trimmed and upper-cased>", "email": "<the email field, trimmed>" }
```

Verified (a proof from a prior `VERIFY_CONFIRM` call is held):
```json
{ "referenceId": "<the tracking ID field, trimmed and upper-cased>", "verification": "<the proof>" }
```
The `email` field is structurally absent from the request body in this case — not blanked, not
present-and-empty, entirely omitted from the JSON object, per `js/core.js:496-498`'s conditional
object construction.

### 6.2 The real flow — a working uniform-denial implementation

Source: `06-portal-status.flow.json`, an early design retired on 2026-10-21 (`registers/flow-retirement.json`); the current flow is its identification release package.
Trigger: `Request`, kind `Http`, method `POST`, schema `{referenceId, email, verification}` —
again a dedicated portal flow.

**Validation.** `referenceId` length `> 5` and starts with `NITDA-`; and *either* a
`verification` token is present *or* `email` has length `> 4`. Failure →
`400 {"error":"invalid-request"}`.

**Rate limiting — two independent buckets, both must pass:** `STATUS_IP:<source ip>` (30
requests / 10 minutes) and `STATUS_REF:<referenceId>` (10 requests / 10 minutes) — see §0.1. A
refusal from either answers in `STATUS`'s own vocabulary,
`429 {"resolution":"unavailable","reason":"rate-limited"}` — the one flow of the six whose
rate-limit body is not a bare `reason` string.

**Two independent gates decide how the address is resolved — and only one is reachable by
default:**

1. **`Condition_Has_Verification`** — real, not gated by any dead flag: **if the client supplied
   a non-empty `verification` token, the flow always tries to resolve it**, regardless of any
   posture setting:
   - `Get_Verification_Proof` looks the token up, requiring `Consumed = false`. Not found →
     `404 {}` (**empty body**, not `null`, not an error object — an empty JSON object).
   - Found but expired → the proof is consumed (so a retry against the same expired proof still
     reports the same denial) and the flow answers `404 {}`.
   - Found and current → the proof is consumed and its `Email` becomes the resolved address for
     the lookup below. **The email never reaches this flow from the request body in this path —
     it is read from the proof the server itself minted**, exactly as
     `document-portal/README.md`'s contract demands.

2. **No `verification` token supplied** — falls to `Condition_Require_Verification_Posture`,
   gated on the same hardcoded `@false == true` expression `SUBMISSION` uses (§1.2). **Always
   false as shipped**, so the flow never demands a proof on its own initiative — the `403
   {"error":"verification_required"}` branch this condition guards is real, complete code but
   unreachable in the shipped template, identically to `SUBMISSION`'s equivalent gate. The
   `email` field from the request body is used directly as the resolved address.

**Either path converges on the same lookup:** `Get_Submission_By_Reference` filters
`NITDA_Portal_Submissions` by `Title eq '<referenceId>'`. Not found → `404 {}`. Found, but its
`SenderEmail` (case-insensitively) does not equal the resolved address → `404 {}` — **the same
empty-body 404 as every other denial reason above.** Found and matching → `Get_Timeline_Events`
reads every `NITDA_Portal_SubmissionEvents` row for that reference (`$orderby=AtUtc asc`), and
the flow responds `200 {"record": {...}}`.

**Every denial variant — unknown reference, wrong email, expired proof, unknown proof — answers
the identical `404 {}`.** This is the uniform, byte-identical denial `document-portal/README.md`
specifies, and unlike the estate this document previously described, it is real: four genuinely
different failure conditions collapse to one indistinguishable response, deliberately.

### 6.3 The record shape

```json
{
  "referenceId": "<string>",
  "status": "<string>",
  "statusLabel": "<string>",
  "category": "<string>",
  "subject": "<string>",
  "receivedAt": "<ISO 8601 — SubmittedAtUtc>",
  "acknowledgedAt": "<ISO 8601 or null — AcknowledgedAtUtc>",
  "updatedAt": "<ISO 8601 — UpdatedAtUtc>",
  "closedAt": "<ISO 8601 or null — ClosedAtUtc>",
  "actionRequired": true,
  "timeline": [ { "at": "<ISO 8601>", "status": "<string>", "label": "<string>", "note": "<string>" } ]
}
```
This is exactly the allow-listed projection `track.js`'s `fromRegistry` consumes (§6.4) — no
description, no attachments, no assigned officer, no handling unit, matching
`document-portal/README.md`'s stated ceiling on what this endpoint may disclose. Fields the
template does not itself populate on write (`AcknowledgedAtUtc`, `ClosedAtUtc` are never set by
`SUBMISSION` or any other flow in this set) will read as `null` here until something else in the
estate — the internal platform's own workflow, out of scope for this document — writes them.

### 6.4 Response handling — every branch the client executes

`PF.intake.status`'s `.then()` (`js/core.js:502-521`), in the order checked:

| Condition | `resolution` | Notes |
|---|---|---|
| `r.ok` (2xx) | `found` | `{ resolution: 'found', record: data.record \|\| null }` |
| `r.status === 403` and `data.error === 'verification_required'` | `verification-required` | Only reachable if the posture flag (§6.2) is manually enabled |
| `r.status === 404` or `r.status === 400` | `denied` | Both treated as the same uniform, authoritative non-match — and against the real flow, `404` **is** the actual status a genuine denial answers (§6.2), unlike the previously-exposed estate this document once found answering `200` for an unknown reference |
| `r.status === 429` | `unavailable`, `reason: 'rate-limited'` | |
| Any other status | `unavailable`, `reason: 'registry-error'`, `status: r.status` | |
| `fetch()` throws | `unavailable`, `reason: 'unreachable'` | |
| No `STATUS` URL configured | `unavailable`, `reason: 'not-configured'` | No network call attempted |
| Device offline | `unavailable`, `reason: 'offline'` | No network call attempted |

`track.js`'s `lookup()` then dispatches on `res.resolution`:

| `resolution` | `track.js` behaviour |
|---|---|
| `found` | Address removed from the URL if a proof was used (`keepUrl(id, proof ? null : email)`); `proof` reset to `null`; renders `fromRegistry(res.record, id)` sourced `'registry'` |
| `verification-required` | Calls `requireVerification(id, email)` — begins the `VERIFY` round-trip (§4) |
| `denied` | Calls `denied(id)` — "No request matches that tracking ID and email" |
| any other (`unavailable`) | Falls back to this device's own local store (`PF.store.get(id)`), if present and its stored email matches; otherwise calls `unavailable(id, res.reason)` |

Against the real flow, a genuine match reaches `found` with a fully populated `record` (§6.3);
an unknown reference or mismatched email reaches `denied` cleanly via the real `404`. Neither of
the ambiguous states a previous edition of this document found — `found` with `record: null`, or
`denied` never actually reachable — occurs against this template.

### 6.5 Response variants — complete enumeration

| Variant | HTTP | Body | `resolution` | Citizen sees |
|---|---|---|---|---|
| Genuine match | 200, `{"record": {...}}` | `found` | The full record, sourced `'registry'` |
| Unknown reference, wrong email, expired proof, or unknown proof (all four, identically) | 404, `{}` | `denied` | "No request matches that tracking ID and email" |
| Verification demanded (posture flag manually enabled) | 403, `{"error":"verification_required"}` | `verification-required` | The email-verification step (§4) |
| Malformed request | 400, `{"error":"invalid-request"}` | `denied` | Same denial message as a genuine non-match — the client does not distinguish 400 from 404 |
| Rate-limited (either bucket) | 429, `{"resolution":"unavailable","reason":"rate-limited"}` | `unavailable`, `reason:'rate-limited'` | "Too many lookups from this connection... wait a minute" |
| Processing failure | 500, `{"resolution":"unavailable","reason":"status-processing-failed"}` | `unavailable`, `reason:'registry-error'` | "The registry could not be reached just now" (falls back to device data if available and matching) |
| Unreachable | — | — | `unavailable`, `reason:'unreachable'` | Same as above |
| Not configured | — | — | `unavailable`, `reason:'not-configured'` | Same as above |
| Offline | — | — | `unavailable`, `reason:'offline'` | "This device is offline, so the registry could not be reached" |

---

## 7. Cross-cutting behaviour

**Demo mode.** `PF.backendConfigured()` (`js/core.js:318`) is `!!endpointUrl('SUBMISSION')` —
`SUBMISSION` alone gates whether the entire portal is considered "live." A deployment with
`SUBMISSION` unset runs entirely against `localStorage`-seeded demonstration data regardless of
whether the other five endpoints are configured.

**Retry.** `PF.outbox` (`js/core.js:267-291`) queues only `submission` and `support` kind
entries, capped at the 50 most recent (`all.slice(-50)`), each retried up to 5 attempts
(`item.tries >= 5` before being dropped) whenever `PF.outbox.flush()` runs with
`navigator.onLine === true`. `UPLOAD`, `VERIFY`, `VERIFY_CONFIRM`, and `STATUS` calls are never
queued for retry by this mechanism under any failure condition. **This matters more now than it
did against the previously-documented estate**: a queued `SUBMISSION` retried by the outbox
generates a *second* `Create_Submission_Record` call — and therefore a second, distinct reference
— if the first attempt actually reached the flow and only the client believed it hadn't (e.g. the
response was lost after the flow had already committed). Nothing in either the client or the flow
deduplicates on `localId`, which every retry does carry (§1.1) but which the flow never reads.

**Draft autosave.** Entirely client-local (`PF.store.draft`, `localStorage`) — no flow is
involved in saving or restoring an in-progress submission. Attachments are explicitly excluded
from the saved draft (`DRAFT_NOTE` in `submit.js`: "Attachments are never stored in the draft —
re-attach them before you submit") — only `{name, size}` metadata survives a draft save; the
`File` object itself does not.

**Reference minting.** The tracking ID a citizen is shown immediately after submitting
(`PF.uid()`, `submit.js:458`) is a **client-generated local id**, minted before the registry has
been contacted at all, and is later overwritten in the local store by the registry's own
`referenceId` once `SUBMISSION` reports one (§1.4) — which, against the real flow, it always does
on success (§1.3). The help-case reference (`sref()`, `support.js:8`) is likewise entirely
client-generated and, per §3.3, is never reconciled with the flow's own `caseRef`, even though the
two now share an identical format (§3.2).

**Filename policy.** No client-side filename normalisation exists anywhere in `submit.js` or
`core.js`. The real `SUBMISSION` flow applies it (§1.2), in full — folding, sanitisation,
reserved-name handling and all — exactly where `document-portal/README.md` says it lives.

---

## 8. Confirming a deployed flow still matches its template

Everything above describes the shipped template files. A flow imported, then hand-edited, or
built independently to the same contract, can diverge from any of it. Three checks, in
increasing order of effort, catch the most consequential drifts without needing tenant access
from inside this repository:

1. **Structural, offline** — re-export the deployed flow's Code view and diff it against the
   matching file in `docs/folio-Master-Flows-and-Endpoints/packages/codeview/`. Catches every drift.
2. **Read-only, live** — `npm run verify:endpoints` against the deployed URLs (no tenant write):
   confirms each endpoint answers, and for a shape-checked probe, whether the response's declared
   keys are present. Cannot see internal logic — a flow that answers the right shape via the
   wrong path (e.g. `STATUS` genuinely denying every request rather than correctly discriminating
   matches) still passes.
3. **Behavioural, live, and destructive to a test record** — the checks `MINIMAL-PILOT.md` §7
   describes: submit twice and confirm the two references are different and consecutive; look the
   record up with a deliberately wrong email and confirm the denial is byte-identical to an
   unknown reference; exhaust the `VERIFY_CONFIRM` attempt cap on a real challenge and confirm the
   429 lockout actually engages. These are the only checks that can distinguish "the flow was
   built correctly" from "the flow answers correctly by coincidence for the one case tried" —
   the exact distinction O-13 in `docs/audits/OPERATIONAL_READINESS_AUDIT.md` found matters.

**Two things specific to these six templates are worth confirming explicitly before declaring a
deployment complete, because both are silent if left as shipped:**

- **`Condition_Require_Verification_Posture` in `SUBMISSION` and `STATUS`** (§1.2, §6.2) is
  hardcoded `false`. If email verification is meant to be enforced, both must be manually
  switched to `true` in Code view — there is no single flag, and switching only one leaves the
  submission and read-back halves of the guarantee inconsistent with each other.
- **The OTP pepper** (§4.2) is the same public constant in every copy of these two files. It is
  sufficient to stop a SharePoint reader from seeing a code in plaintext, but confers no secrecy
  against anyone who has read the template — which, once this repository is read by anyone, is
  everyone. If that matters for a given deployment, regenerate it to a value that is not
  committed anywhere before going live, in both `04-portal-verify-request` and
  `05-portal-verify-confirm` (they must match, since one hashes and the other verifies against
  the same computation).
