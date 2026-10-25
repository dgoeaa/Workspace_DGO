# Internal platform — complete flow request/response reference

**Status: Specification, reverse-derived from the shipping client.** Every shape on this page
is traced to the exact line of `core/`, `config/` or `modules/` that constructs it or consumes
it — not to the harvested samples in `docs/reference/foundational/` (per
[`../README.md`](../../reference/README.md), that material is untrusted raw material; this document is the
contract). Where a shape could not be traced to a call site, it is marked **DECLARED, NOT
VERIFIED** rather than guessed.

Scope: the **internal operations platform** (repository root — `core/`, `modules/`,
`config/`). The public `document-portal/` has its own, much smaller contract, documented in
[`../../../document-portal/README.md`](../../../document-portal/README.md) and
[`IDENTITY.md`](./IDENTITY.md) §4 (`STATUS`, `SUBMISSION`, `SUPPORT`, `VERIFY`,
`VERIFY_CONFIRM`, `UPLOAD`) — it is not repeated here.

Every endpoint is called **directly** from the browser to a Power Automate manual-trigger URL
(`window.DGO_CONFIG.endpoints`, resolved through `config/endpoints.config.js`). There is no
proxy. The flow behind each URL is the only place authentication and authorization can be
enforced (see [`../../architecture/AUTH_RBAC_GUIDE.md`](../../architecture/AUTH_RBAC_GUIDE.md)).

---

## Part 0 — The envelope every request is built from

**This is the single most load-bearing fact in this document: there are two different wire
shapes, selected per call-site, and which one applies changes where a flow must read the
discriminator field.** Source: `core/data-client.js` (`DataClient.request`), line 24-28.

```js
const asserted = clientMayAssertIdentity() ? { userEmail: State.get().profile?.email || '' } : {};

// default — used by every endpoint EXCEPT the one documented exception below
const body = { action: contract.action, payload, ...asserted, requestId: id, timestamp: isoNow };

// only when the call site passes { flatPayload: true } as its third argument
const bodyFlat = { action: contract.action, ...payload, ...asserted, correlationId: id };
```

| | Default (nested) | `flatPayload: true` |
|---|---|---|
| Caller's fields live at | `body.payload.*` | top level, spread alongside `action` |
| `action` can be overridden by the caller? | No — `payload.action`, if present, is a field *inside* `body.payload`, never at the top | **Yes** — if the caller's object has an `action` key, it overwrites `contract.action` because the spread happens after |
| Request id field | `requestId` (uuid) + `timestamp` (ISO) | `correlationId` (uuid), no `timestamp` |
| Used by, in the current codebase | Every endpoint except the one below | **`SINGLE_ASSIGNMENT` only** (`modules/single-assignment.js:112`) |

**HTTP mechanics, identical for every JSON endpoint** (`core/data-client.js:24-28`):

```
POST <resolved endpoint URL>
Content-Type: application/json
X-Correlation-Id: <uuid>                      always present
Authorization: Bearer <proof>                  present ONLY when AuthConfig.enabled === true
                                                (core/auth.js#authHeaders — see the auth guide)

Body: see above
```

- **`userEmail`** is asserted in the body *only* while auth is inert (`AuthConfig.enabled ===
  false`, the shipped default). The moment auth is enforced this field is **dropped entirely**
  — a flow must never trust it, and under enforcement it will not even be present to trust.
- **Timeout / retry** per contract key, `config/fetch-policy.config.js`: default `{timeoutMs:
  15000, retry: 1}`; `FETCH_ALL` gets `{20000, retry:1}`; `FETCH_ACTIVITIES` `{15000, retry:1}`;
  `AI_CHAT` and `DYNAMIC_ACTIONS` `{15000 or 30000, retry:0}`; `OTP_GENERATE`/`OTP_VERIFY`
  `{20000, retry:0}`. A contract-level `timeoutMs` (`config/endpoints.config.js`) wins if set
  (e.g. `FETCH_ACTIVITIES`, `AI_EMAIL_ANALYSIS`, `AI_DOC_ANALYSIS`, `AI_CHAT`, `BULK_ASSIGNMENT`,
  `BULK_ASSIGNMENT_DIRECT`, `SUBSIDIARY_ACTIONS` all declare `timeoutMs:90000`).
- **On non-2xx**, the client throws `data?.status?.message || data?.message || 'HTTP <code>'`
  and, for a `write` contract, enqueues the payload in `PendingQueue` for retry.
- **Idempotency**: `core/idempotency.js#key()` computes
  `idem:<operation>:<ref>:<actor-email>:<5-min-bucket>:<sha256(payload)>`. `WriteManager.backend`
  attaches it as `payload.idempotencyKey` on every call it makes (not on calls made with a bare
  `invoke(...)` — see Part 4). A flow is expected to honour it as a dedup key (`docs/deployment/
  FLOW-BUILD-PLAN.md` cross-cutting obligation 4).
- **Client-side confirmation gate**: `confirmFlowExecution()` (`core/flow-confirmation.js`) can
  interpose a user-facing confirmation dialog before a `write` contract fires. This is UX, not
  wire shape, and is not repeated per-endpoint below.

### Response unwrap — `core/contracts.js`

Every flow is expected to answer the same envelope:

```json
{
  "ok": true,
  "status": { "http": 200, "message": "" },
  "data": { "...": "the actual payload" },
  "errors": [],
  "request": { "action": "<contract.action>", "requestId": "<uuid>" },
  "timing": { "receivedAtUtc": "...", "completedAtUtc": "...", "durationMs": 0 },
  "meta": { "runId": "...", "flowName": "...", "contractVersion": "..." }
}
```

`assertEnvelope(response, expectedAction)`:
1. Throws if `response.ok === false` or `Number(response.status?.http || 200) >= 400`, using
   `errors[].message`/`.code` joined, or `status.message`, as the error text.
2. If `response.request.action` is present and differs from `expectedAction`, this is
   **downgraded to a console warning**, not a throw — a flow that labels its action `lookups`
   when the client expected `fetchAll` still has its data processed by shape.
3. Returns `response.data ?? response` — **if a flow omits `data` entirely, the whole envelope
   is handed to the caller as if it were the payload.** This is exactly what was observed live
   on `AI_DOC_ANALYSIS` (see the appendix).

`unwrapActionResponse(key, response)` (`core/api.js`, used by `invokeData()`) additionally:
- For `AI_CHAT`, `AI_EMAIL_ANALYSIS`, `AI_DOC_ANALYSIS`: returns `data.result ?? data.analysis ?? data.message ?? data`.
- For `OTP_GENERATE`, `OTP_VERIFY`: returns `data.result ?? data`.
- Everything else: returns `data` unchanged.

---

## Part 1 — Endpoint contract registry

Source: `config/endpoints.config.js#EndpointContracts`. `sourceKey` is the *physical* flow;
several contract keys share one flow and are discriminated by `action`/`operation` inside the
body, never by URL.

| Contract key | HTTP | Fixed `action` | Physical flow (`sourceKey`) | `write` | Declared `timeoutMs` |
|---|---|---|---|---|---|
| `FETCH_ACTIVITIES` | POST | `LIST-ACTIVITIES` | `SUBSIDIARY_ACTIONS` | – (read) | 90000 |
| `FETCH_ALL` | POST | `fetchAll` | `FETCH_ALL` | – (read) | 90000 |
| `REFERENCE_DATA` | POST | `lookups` | `REFERENCE_DATA` | – (read) | default (15000) |
| `GET_DOCS` | POST | `getDocs` | `GET_DOCS` | – (read) | default |
| `FETCH_EMAIL_ATTACHMENTS` | POST | `fetchEmailAttachments` | `FETCH_EMAIL_ATTACHMENTS` | – (read) | default |
| `SINGLE_ASSIGNMENT` | POST | `singleassignment` | `SINGLE_ASSIGNMENT` | ✓ | default |
| `BULK_ASSIGNMENT` | POST | `bulkassignment` | `BULK_ASSIGNMENT` | ✓ | 90000 |
| `BULK_ASSIGNMENT_DIRECT` | POST | `bulkassignment` | `BULK_ASSIGNMENT_DIRECT` | ✓ | 90000 |
| `DYNAMIC_ACTIONS` | POST | `dynamicGlobalAction` | `DYNAMIC_GLOBAL_ACTIONS` | ✓ | default |
| `EMAIL` | POST | `dispatchEmail` | `DYNAMIC_GLOBAL_ACTIONS` (same flow as above) | ✓ | default |
| `DISPATCH_OUTBOUND`\* | POST | `dispatchOutbound` | `DYNAMIC_GLOBAL_ACTIONS` | ✓ | default |
| `ARCHIVE_REFERENCE`\* | POST | `archiveReference` | `DYNAMIC_GLOBAL_ACTIONS` | ✓ | default |
| `EMAIL_RELATED_TASK` | POST | `emailtotaskassignment` | `EMAIL_RELATED_TASK` | ✓ | default |
| `AI_EMAIL_ANALYSIS` | POST | `aiAnalyseEmail` | `AI_EMAIL_ANALYSIS` | ✓ | 90000 |
| `AI_DOC_ANALYSIS` | POST | `aiAnalyseEventDocs` | `AI_DOC_ANALYSIS` | ✓ | 90000 |
| `AI_CHAT` | POST | `aiChat` | `AI_CHAT` | ✓ | 90000 |
| `OTP_GENERATE` | POST | `otpGenerate` | `OTP_GENERATE` | ✓ | default |
| `OTP_VERIFY` | POST | `otpVerify` | `OTP_VERIFY` | ✓ | default |
| `SUBSIDIARY_ACTIONS` | POST | `INIT` (fixed default — see Part 5) | `SUBSIDIARY_ACTIONS` | ✓ | 90000 |
| `SCAN_INTAKE` | **PUT** | n/a — not a JSON contract | `SCAN_INTAKE` | ✓ | n/a (`fetch` default) |

\* `DISPATCH_OUTBOUND` and `ARCHIVE_REFERENCE` are registered contracts, reachable, and were
answered `200` in the live tenant probe (see the earlier session's transcript analysis) — but
**no module in the current codebase invokes them.** `core/security-actions.js` and
`core/api.js` each define an identical `ObsidianActionAliases` map that would call them via
`invokeObsidianAction('DISPATCH_OUTBOUND', …)` / `('ARCHIVE_REFERENCE', …)`, and grep across
`core/`, `modules/`, `shared/` finds **zero callers** of either alias. `modules/dispatch.js`
sends its own `operation:'dispatch'` shape through `WriteManager.backend` instead (Part 4.3),
and `modules/archive.js` → `core/archive.js#ArchiveService.archiveReference` performs the
entire archive **locally, with no network call at all** (Part 9). Treat these two rows as
*provisioned and flow-reachable, but dead code on the client side today.*

---

## Part 2 — The five read endpoints

All five share the request shape below and differ only in what they return and how the
response is consumed.

### 2.1 Request (identical shape for all five)

```json
POST <url>
{
  "action": "<fetchAll|getDocs|lookups|LIST-ACTIVITIES|fetchEmailAttachments>",
  "payload": { "...caller fields, see per-endpoint below..." },
  "userEmail": "<caller's local profile email — dev posture only>",
  "requestId": "<uuid>",
  "timestamp": "<ISO 8601>"
}
```

| Key | `payload` fields sent | Call site |
|---|---|---|
| `FETCH_ALL` | `{ force, requestedAt }` | `core/data-loader.js#loadRuntimeData` → `FetchManager.fetch('FETCH_ALL', {force, requestedAt}, {force, cacheNamespace:'FETCH_ALL'})` |
| `GET_DOCS` | caller-supplied, typically `{}` | direct `invoke('GET_DOCS', …)` call sites |
| `REFERENCE_DATA` | `{}` (lookups) | used for `users`/`categories`/`departments` refresh |
| `FETCH_ACTIVITIES` | `{ force, requestedAt }` | fallback path in `loadRuntimeData` when `FETCH_ALL` fails, and standalone refresh |
| `FETCH_EMAIL_ATTACHMENTS` | `{ id, referenceId }` | `modules/activities.js:132` — `invoke('FETCH_EMAIL_ATTACHMENTS', {id:activity.id, referenceId:activity.referenceId||''})` |

The live-tenant probe (§ this session, prior turn) confirms the actual `requestOtp`-style
probe body Power Automate accepts is a **flat** top-level shape (`{action, userEmail, …}`).
That is the probe tool's own simplified request, built directly with `fetch()` in
`scripts/lib/endpoint-check-page.mjs` — it does **not** exercise `core/data-client.js` and is
not evidence of the app's own wire shape. The app's shape is the nested one above.

### 2.2 Response — expected top-level `data` keys, and accepted field aliases

`core/data-loader.js#parseFetchAll` reads `data` (post-`assertEnvelope`) for these collections,
by alias — **any of the listed aliases is accepted**, and a collection's *absence* is treated
as "unchanged" while its *presence as an empty array* is treated as authoritative:

| Target state key | Accepted response aliases | Row shape read by (`core/domain.js`) |
|---|---|---|
| `activities` | `docs`, `activities`, `Activities`, `correspondence`, `items`, `records` | `normalizeDocument` |
| `tracking` | `tasks`, `tracking`, `Tracking`, `Tasks` | `normalizeTask` |
| `comments` | `taskComments`, `comments`, `Comments` | `normalizeComment` |
| `users` | `users`, `Users` | `normalizeUser` — **sets `runtime.directory.served`, see the auth guide** |
| `categories` | `categories`, `Categories` | `normalizeCategory` |
| `departments` | `departments`, `Departments` | `normalizeDepartment` |
| `emails` | `emails`, `Emails` | `normalizeEmail` |
| `approvals` | `approvals`, `Approvals` | identity (no normaliser) |

`GET_DOCS` reads only `docs`. `REFERENCE_DATA` reads `users`, `categories`, `departments`
(confirmed live: probe returned `usersCount`, `categoriesCount`, `departmentsCount` alongside
the arrays). `FETCH_ACTIVITIES`, used standalone, reads
`collection(data,'activities','docs','items','records','value')`.

**Row-level field aliases** — every field below is read from *either* name, so a flow may
return SharePoint internal names, camelCase, or Microsoft Graph shape without a client change
(`core/domain.js`):

```
normalizeDocument:  id|ID · title|Title · created|Created · description|Description ·
                     status|Status.Value|Status · assignmentStatus|AssignmentStatus.Value|AssignmentStatus ·
                     assignedTo|AssignedTo|Assigned · category|Category ·
                     referenceId|RefIDD|Reference_ID · RoutedToDSU · CC_x0027_dTo (→ emails[]) ·
                     AttachmentLink

normalizeTask:       id|ID · title|Title · referenceId|RefIDD|Reference_ID ·
                     assignedTo|AssignedTo|Assigned · AssignedToDSU|DSULookUp · CoAssigneeDSU ·
                     _x0033_rdAssigned (third assignee) · RoutedToDSU · Classification ·
                     priority|Priority (normalised) · Progress · status|Status|Progress ·
                     StartDate|startDate · DueDate|due|dueDate · AcknowledgementDue|ack ·
                     AuthorTitle · EditorEmail

normalizeUser:       id|UserId|email|Email · fullName|FullName|name|displayName|Title ·
                     email|Email|mail|userPrincipalName · directorate|Directorate|department|Department ·
                     role|Role (→ 'viewer' if absent) · persona|Persona (NOT re-derived from role) ·
                     status|Status (→ 'active' if absent) · accessScope|AccessScope
                     (JSON array, CSV string, or already-array — all three accepted) ·
                     pilotCohort|PilotCohort · disabledReason|DisabledReason

normalizeCategory:   id|ID · Title|Category|Subcategory · Category · Subcategory ·
                     'Category Code' · 'SubCategory Code' · DSU_KEY ·
                     'Default Primary Responsible' · 'Default Supporting Department/Unit' ·
                     INFORMDSU1/2/3 (→ inform[]) · Priority · Timeline

normalizeDepartment: id|ID · Title · DSU_KEY · DSU_Email · DSU_HeadEmail ·
                     DSU_HeadPersonalEmail · DSU_HeadTitle

normalizeEmail:      id|internetMessageId · subject · fromAddress|from.emailAddress.address ·
                     fromName|from.emailAddress.name · receivedDateTime ·
                     bodyPreview · bodyContent|body.content (truncated to 4000 chars) ·
                     toRecipients/ccRecipients/bccRecipients (array or ; / , delimited string) ·
                     hasAttachments · importance · conversationId · internetMessageId · webLink
```

`FETCH_EMAIL_ATTACHMENTS` response: consumed as `Array.isArray(res) ? res :
(res?.value || res?.attachments || res?.data || [])` (`modules/activities.js:133`) — **DECLARED,
NOT further normalised**; row shape beyond that is passed through as-is to
`ActivityParity.getAttachmentPreviewModel`.

---

## Part 3 — Assignment endpoints

### 3.1 `SINGLE_ASSIGNMENT` — flat wire shape (the one exception in Part 0)

Built by `core/assignment-payload.js#buildSingleAssignmentPayload`, sent
`invoke('SINGLE_ASSIGNMENT', outbound, {flatPayload:true})` (`modules/single-assignment.js:112`).
Full, verified shape — **note the payload contains a full duplicate of the task fields twice**,
once in SharePoint/Power-Apps-style PascalCase at the top and once in a smaller nested
`payload.task` object; this is legacy-contract residue kept for compatibility, not a defect
introduced by this reference:

```json
POST <url>
{
  "action": "singleassignment",
  "operation": "create",
  "mode": "single",
  "source": "DGO_FAST_Track_WEB_OPS",
  "method": "POST",
  "device": { "id": "standalone-html", "platform": "<navigator.platform>", "ua": "<navigator.userAgent>" },
  "AssignmentType": "newassignment | reassignment",
  "NewActivityTask": {
    "StartDate": "YYYY-MM-DD", "ActivityID": 0, "Title": "", "Description": "",
    "Status": "New", "Category": "", "CategoryCode": "", "SubCategory": "", "SubCategoryCode": "",
    "PrimaryDSU": "", "AssignedTo": "", "AssignedToTitle": "", "AssignedDSU": "",
    "supportingAssignedTo": "", "SupportAssignedTo": "", "SupportAssignedToTitle": "",
    "SupportDSU": "", "SupportDSUKey": "",
    "AckDue": "", "AcknowledgementDueBy": "", "AcknolwedgementDueBy": "",
    "TaskDue": "", "TaskDueDate": "", "Timeline": "No dependencies",
    "CopyTo": "email1;email2", "Priority": "Urgent|High|Normal|Low",
    "PreReferenceID": "<YYYYMMDD>-<activityId>-<categoryCode>-<subcategoryCode>-",
    "Categorization": "<category>-<subcategory>", "AttachmentLink": "",
    "Comments": "", "ActionRequired": "", "CreatedBy": "<actor email>"
  },
  "Selected": { "ID": 0, "RefIDD": "<source activity id>", "Title": "" },
  "payload": {
    "task": { "...a smaller subset of the NewActivityTask fields, same names..." },
    "selection": { "single": { "ID": 0, "RefIDD": "", "Title": "" }, "items": [] },
    "assignment": { "type": "newassignment | reassignment" }
  },
  "userEmail": "<dev posture only>",
  "correlationId": "<uuid>"
}
```

`AckDue`/`AcknowledgementDueBy`/`AcknolwedgementDueBy` (the third spelling is a preserved typo
from the source contract) and `TaskDue`/`TaskDueDate` are each sent **twice under different
key names** — a flow must read whichever it expects; the client does not know or control which
one a given flow implementation prefers.

**Response**: no `expect` contract is declared in the probe table; the live tenant returned
`502` for this endpoint in the prior session's probe ("the flow was reached and failed inside
itself") — **DECLARED, NOT VERIFIED working** as of that run.

### 3.2 `BULK_ASSIGNMENT` / `BULK_ASSIGNMENT_DIRECT` — nested wire shape

Built by `core/assignment-payload.js#buildBulkAssignmentPayload`, sent via plain
`invoke('BULK_ASSIGNMENT', payload)` (`modules/bulk-assignment.js`, no `flatPayload`):

```json
POST <url>
{
  "action": "bulkassignment",
  "payload": {
    "schema": "dgo-bulk-assignment-payload/v2",
    "source": "bulk-assignment",
    "ids": ["<activity id>", "..."],
    "category": "", "categoryCode": "", "subcategory": "", "subcategoryCode": "",
    "assignedTo": "", "assignedToDsu": "",
    "supportingAssignee": "", "supportingDsu": "",
    "ccRecipients": ["email1", "email2"],
    "priority": "urgent|high|normal|low",
    "startDate": "", "ack": "", "due": "",
    "instruction": "", "otpVerified": true,
    "cascadeSnapshot": null,
    "requestedBy": "<actor email>", "requestedAt": "<ISO>"
  },
  "userEmail": "<dev posture only>",
  "requestId": "<uuid>", "timestamp": "<ISO>"
}
```

`BULK_ASSIGNMENT_DIRECT` is the identical contract shape against a separate URL/flow
(`config/endpoints.config.js` — same `action:"bulkassignment"`).

**OTP step-up gate** (`OTP_THRESHOLD = 25` records, `modules/bulk-assignment.js`): before
building the payload above, if `ids.length > 25` the UI calls
`ActionRuntime.run('bulk-assignment','request-otp',{purpose:'bulk-assignment', refs:ids.slice(0,5), operation:'BULK_ASSIGNMENT'})`
then, once the officer enters the code,
`ActionRuntime.run('bulk-assignment','verify-otp',{requestId, otp, operation:'BULK_ASSIGNMENT', refs})`.
These route through `core/otp-service.js` → `OTP_GENERATE`/`OTP_VERIFY` — **see Part 8.2 for the
exact resulting wire shape, which differs from the sign-in OTP shape in Part 8.1.**

**Response**: `expect` in the probe table is `['selectedCount','assignedTo','assignedToTitle',
'assignmentType','category','categoryCode','subCategory','subCategoryCode','priority','ackDue',
'taskDue','copyTo','tasksCreated','docsUpdated','notificationsSent','failed','summaryText']`
(top-level or under `data`) — this is the probe's declared expectation, confirmed present in
the live 400-refusal response's `dataKeys`. Client code does not further destructure this
response beyond the generic write-success toast.

---

## Part 4 — `DYNAMIC_ACTIONS`: one flow, at least four different discriminator conventions

This is the platform's central write flow — 40 of 61 governed actions route through it
(`docs/deployment/RUNBOOK.md`). **It does not have one consistent operation field.**
Four distinct calling conventions coexist in the current codebase, verified by call site.
A flow implementer must handle all four; a probe that sends only one convention (as
`scripts/lib/endpoint-probes.mjs`'s `{operation:'noop'}` does) cannot exercise the others.

### 4.1 Convention A — generic CRUD sync, discriminator in `payload.action`

Direct `invoke('DYNAMIC_ACTIONS', {...})` calls, no `flatPayload`, fired *after* a local
`State.patch` as a best-effort background sync (all `.catch(() => toast('Saved locally;
synchronization queued', 'error'))`):

| Call site | `payload.action` | Full `payload` shape |
|---|---|---|
| `modules/correspondence.js` (`createRecord`) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Tracker', data:<correspondence record> }` |
| `modules/correspondence.js` (`updateRecord`) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Tracker', data:<updated record> }` |
| `modules/correspondence.js` (`quickStatus`) | `delete_record` (on Archive) or `update_status` | `{ action:'delete_record'\|'update_status', data:{id, status} }` |
| `modules/correspondence.js` (`forceSync`, via `requestSync`) | `full_sync` | `{ action:'full_sync', module:'DGCEO_Tracker', source:'correspondence' }` |
| `modules/projects.js` (create/update) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Projects', data:<project> }` |
| `modules/briefs.js` (create) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Briefs', data:<brief> }` |
| `modules/briefs.js` (transition) | `transition_status` | `{ action:'transition_status', module:'DGCEO_Briefs', ref:<id>, status:<to> }` |
| `modules/meetings.js` (create) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Meetings', data:<meeting> }` |
| `modules/meetings.js` (transition) | `transition_status` | `{ action:'transition_status', module:'DGCEO_Meetings', ref:<id>, status:<to> }` |
| `modules/meetings.js` (actions→tasks) | `upsert_record` (per task) | `{ action:'upsert_record', module:'DGCEO_Tasks', data:<task> }` |
| `modules/scan-intake.js` (post-deposit sync) | `upsert_record` | `{ action:'upsert_record', module:'DGCEO_Tracker', data:<created correspondence> }` |
| `modules/lookup.js` → `core/document-flags.js#flagPayload` | `flagDocument` \| `unflagDocument` | see 4.1.1 below — **also carries `operation:'update'` simultaneously** |

Wire shape (nested, per Part 0):
```json
{ "action": "dynamicGlobalAction",
  "payload": { "action": "upsert_record", "module": "DGCEO_Tracker", "data": { "...record fields..." } },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

#### 4.1.1 `flagDocument` / `unflagDocument` — both fields present, different values

`core/document-flags.js#flagPayload()`, reached through `WriteManager.backend({module:'lookup',
action:'flag-document', endpoint:'DYNAMIC_ACTIONS', payload})`. Because `WriteManager.backend`
does `{operation: action, ref, idempotencyKey, ...payload}` and `payload` already carries its
own `operation` key, **the payload's `operation:'update'` silently overwrites the `'flag-document'`
that `WriteManager` set** — the final body carries both `action` and `operation`, disagreeing:

```json
{ "action": "dynamicGlobalAction",
  "payload": {
    "operation": "update",
    "ref": "<referenceId or id>",
    "idempotencyKey": "idem:flag-document:<ref>:<actor>:<bucket>:<sha256>",
    "action": "flagDocument",
    "mode": "single",
    "flag": "<flag code>",
    "flagLabel": "<human label>",
    "docId": "<record id>",
    "referenceId": "<referenceId>",
    "userEmail": "<actor email>",
    "source": "DGO_FAST_Track_WEB_OPS"
  },
  "userEmail": "<dev-posture client assertion — a THIRD, separate userEmail field>",
  "requestId": "<uuid>", "timestamp": "<ISO>" }
```

A flow must decide which of `payload.action` or `payload.operation` it treats as authoritative
for this call; the client sends both, and they carry different vocabularies (`flagDocument` vs
`update`).

### 4.2 Convention B — `WriteManager.backend`, discriminator in `payload.operation` only

`core/write-manager.js#backend({module, action, endpoint='DYNAMIC_ACTIONS', payload, ref})` →
`DataClient.request(endpoint, {operation: action, ref, idempotencyKey, ...payload})`. When the
caller's `payload` does **not** itself carry an `operation` key (unlike 4.1.1 above), the
`action` parameter passed by the calling module *is* the operation the flow sees:

| Call site | `action` param (→ `payload.operation`) | Extra `payload` fields |
|---|---|---|
| `modules/dispatch.js` (send) | `dispatch` | `{ taskId, title, channel, recipient }` |
| `modules/dispatch.js` (retry) | `dispatch` | same shape, re-sent |
| `modules/orchestrator.js` (set reminder) | `create` (from `dynamicActionContract('setReminder').operation`) | `{ dueAt }` — via `config/dynamic-actions.config.js#DynamicActions.setReminder`, `required:['dueAt']` |
| `modules/user-admin.js` (`persistUserMutation`) | `user-admin:create-user` \| `user-admin:update-user` \| `user-admin:disable-user` \| `user-admin:assign-role` | `{ module:'user-admin', user:{ id, fullName, email, directorate, department, unit, jobTitle, phone, role, persona, status, accessScope[], pilotCohort, disabledReason, createdAt, createdBy, updatedAt, updatedBy } }` |

Wire shape:
```json
{ "action": "dynamicGlobalAction",
  "payload": { "operation": "dispatch", "ref": "<referenceId>",
               "idempotencyKey": "idem:dispatch:<ref>:<actor>:<bucket>:<hash>",
               "taskId": "", "title": "", "channel": "Internal Memo|Email|Courier|Portal Upload",
               "recipient": "" },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

### 4.3 Convention C — Canvas Activities lifecycle sequences (`activity-archive` / `activity-siwes` / `activity-nysc`)

Declared in `config/dynamic-actions.config.js#DynamicActions` (generated from
`ActivityParityConfig.lifecycle`). Each is a **three-step ordered sequence**, executed through
`ActivityParity.planLifecycleAction` + `commitLifecycleAction` + `WriteManager.backend()`. Step
2 and 3 must be refused by the flow if attempted without the record id step 1 returns — this is
stated as a hard requirement in the config, not merely a client convention:

| Step | `operation` sent | `required` fields |
|---|---|---|
| 1 | `activity-{archive\|siwes\|nysc}:create-queue-record` | `operation, ref, activityId, queueRecord` |
| 2 | `activity-{...}:set-reference-id` | `operation, ref, activityId, queueRecordId, Reference_ID` |
| 3 | `activity-{...}:update-activity` | `operation, ref, activityId, patch` |

The parent `activity-{archive|siwes|nysc}` operation itself (`mode:'sequence'`, `required:
['operation','ref','activityId']`) gates the whole sequence with a UI confirmation before step 1
fires (`confirm:true`); the three step operations are never invoked standalone (`confirm:false`).
**Note**, per `config/action-routing.config.js`: this is *lifecycle routing to the DGOFASTTRACK
queue*, explicitly **not** the immutable archive execution described in Part 9 — the two must
not be conflated even though one is named `activity-archive`.

### 4.4 Convention D — declared-only operations (config exists, exact live payload not traced)

The remainder of `config/action-ownership.config.js`'s ~40 `DYNAMIC_ACTIONS`-backed operations
route through `core/governed-actions.js#governedTransition` → `core/entity-store.js#transitionStatus`
(a **purely client-side, in-memory state machine** — see `core/lifecycle.js` for the full
`LifecycleTransitions` graph) and/or `State.patch` first, with a network echo whose exact
per-operation field list this document did not individually trace to a module call site for
every entry. What is verified: they all resolve to `backend: 'DYNAMIC_ACTIONS.optional'` or
`'DYNAMIC_ACTIONS'` in `config/action-ownership.config.js`, all carry `operation: <the action
id>` as the discriminator (Convention B shape), and all are optional in the sense that a failed
network echo never blocks the local state transition:

`triage`, `start-work`, `complete-action`, `approve`, `reject`, `executive-approve`,
`executive-return`, `executive-escalate`, `append-minute`, `add-comment`, `remind-assignee`,
`register-file`, `route-file`, `receive-file`, `close-file`, `update-operation`,
`close-dispatch`, `resolve-escalation`, `convert-email`, `create-correspondence` (also reachable
via scan-intake as an allowed invoker), `create-brief`, `submit-brief`, `decide-brief`,
`request-meeting`, `decide-meeting`, `meeting-actions-to-tasks`, `create-project`,
`update-project`, `create-user`, `update-user`, `disable-user`, `assign-role`, `create-approval`.

`core/lifecycle.js#validateGate` additionally requires, client-side, before certain transitions
are even attempted: `action_complete` needs `meta.response||meta.summary||meta.taskId`;
`returned` needs `meta.reason`; `approved_with_edit` needs `meta.editDiff`; `no_dispatch` needs
`meta.reason`; `closed` requires `Entities.canClose(ref).ok` (no open tasks/approvals/dispatches
under the reference).

---

## Part 5 — `SUBSIDIARY_ACTIONS`: 18 declared routes, 2 verified in code

`config/endpoints.config.js` declares `routeKeys: ["INIT", "REFRESH_EMAILS",
"LOAD_EMAIL_DETAILS", "AI_ANALYSE_EMAIL", "CREATE_TASK", "UPDATE_TASK", "LOAD_EVENT_INFO",
"AI_CHAT", "TRACK", "ACKNOWLEDGE", "GET_ALL", "GET_BOOTSTRAP", "LISTDOCS", "GETDOC",
"BULKASSIGN", "CREATESUPPORTREQUEST", "GETREFERENCES", "LIST-ACTIVITIES"] — but a
repository-wide search for each literal string finds only **two** actually constructed and sent
by current module code: `ACKNOWLEDGE` and `CREATESUPPORTREQUEST`. `LIST-ACTIVITIES` is
real but reached through the separate `FETCH_ACTIVITIES` contract key (Part 2), whose `action`
is hardcoded to that string — not through a module building a `SUBSIDIARY_ACTIONS` call with a
runtime-selected route key. The other 15 keys (`INIT`, `REFRESH_EMAILS`, `LOAD_EMAIL_DETAILS`,
`AI_ANALYSE_EMAIL`, `CREATE_TASK`, `UPDATE_TASK`, `LOAD_EVENT_INFO`, `AI_CHAT` as a
`SUBSIDIARY_ACTIONS` route, `TRACK`, `GET_ALL`, `GET_BOOTSTRAP`, `LISTDOCS`, `GETDOC`,
`BULKASSIGN`, `GETREFERENCES`) appear **only** as documentation inside the `routeKeys` array —
no call site constructs any of them. Treat them as *reserved / not currently wired.*

**Important shape note**: `SUBSIDIARY_ACTIONS`'s contract `action` is fixed to `"INIT"`
(`config/endpoints.config.js`). Neither verified call below overrides it (`flatPayload` is not
used for this endpoint) — so **the top-level `action` field is always the literal string
`"INIT"` regardless of which route is being invoked.** The real routing discriminator for both
verified calls is `payload.operation`. A flow reading only the top-level `action` to route
`SUBSIDIARY_ACTIONS` traffic cannot distinguish `ACKNOWLEDGE` from `CREATESUPPORTREQUEST` —
it must read inside `payload`.

### 5.1 `ACKNOWLEDGE` — verified in full

`core/acknowledgement-service.js#submitAcknowledgement` →
`DataClient.request('SUBSIDIARY_ACTIONS', payload, {retry:0, skipConfirmation:true})` — **called
directly on `DataClient`, bypassing `WriteManager`**, so the wire body is exactly:

```json
{ "action": "INIT",
  "payload": {
    "operation": "ACKNOWLEDGE",
    "mode": "single",
    "taskId": "", "referenceId": "",
    "acknowledgedTime": "<ISO>", "source": "acknowledgment|orchestrator|...",
    "actor": { "name": "", "email": "", "persona": "", "department": "", "phone": "", "capturedFrom": "form|deeplink|state-profile" },
    "actorName": "", "actorEmail": "", "actorPersona": "", "actorDepartment": "", "actorPhone": "", "actorCapturedFrom": "",
    "assignedTo": "", "assignedToAcknowledgementStatus": "Assigned|Acknowledged",
    "taskTitle": "", "category": "", "priority": "", "dueDate": "",
    "route": "acknowledgment",
    "matchedParam": "", "deepLinkSource": "", "returnTo": "", "batchId": "", "trackingId": "",
    "userAgent": "<navigator.userAgent>",
    "notification": { "to": "<assignedTo>", "cc": "dgsregistry@nitda.gov.ng", "subject": "Task Acknowledged: <title> (<taskId>)", "body": "<HTML email>", "format": "html" },
    "__confirmedByUI": true,
    "idempotencyKey": "idem:ACKNOWLEDGE:<referenceId or taskId>:<actor>:<bucket>:<hash>"
  },
  "userEmail": "<dev posture only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

Client-side gate before this is ever sent: `canActorAcknowledge()` requires
`assignedTo === actorEmail` (case-insensitive) — an actor may only acknowledge their own task.
This is enforced **only in the browser**; nothing stops a crafted request bypassing it, so the
flow must re-check `assignedTo` server-side rather than trust the claim.

On failure, the payload is queued via `core/offline-action-queue.js#enqueueAck`
(`PendingQueue.enqueue({key:'SUBSIDIARY_ACTIONS', operation:'ACKNOWLEDGE', payload, ...})`) and
retried later with the identical body.

**Response**: not destructured beyond `ok`/truthiness; recorded into `ReceiptLedger` as
evidence regardless of shape.

### 5.2 `CREATESUPPORTREQUEST` — verified in full

`core/support-service.js#submit` → `WriteManager.backend({module:'assistant',
action:'support-request', endpoint:'SUBSIDIARY_ACTIONS', payload})`. Because the payload
already carries its own `operation` key, it overwrites `WriteManager`'s `operation:'support-request'`
the same way §4.1.1 does:

```json
{ "action": "INIT",
  "payload": {
    "operation": "CREATESUPPORTREQUEST",
    "ref": "<ref or taskId, may be empty>",
    "idempotencyKey": "idem:support-request:<ref>:<actor>:<bucket>:<hash>",
    "category": "clarification | <caller-supplied>",
    "message": "<free text>",
    "context": {
      "route": "<current #/hash route>", "selectedId": "",
      "profile": { "...current State.profile..." },
      "lastAction": "", "lastError": "",
      "pendingStats": { "count": 0, "ack": 0 },
      "receipts": [ "...up to 5 most recent receipt records..." ],
      "userAgent": "<navigator.userAgent>", "online": true,
      "at": "<ISO>", "ref": "<echoed>", "taskId": "<echoed>"
    }
  },
  "userEmail": "<dev posture only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

**Response**: recorded into `ReceiptLedger` unexamined; no destructuring of a `caseRef` or
similar field found in `core/support-service.js`.

---

## Part 6 — `EMAIL` and `EMAIL_RELATED_TASK`

### 6.1 `EMAIL` — outward correspondence dispatch

`core/correspondence-email-service.js#sendDraft` → `WriteManager.backend({module:
'correspondence-email', action:'send-correspondence-email', endpoint:'EMAIL', payload})`.
Payload already carries `operation`, so (§4.1.1 pattern) it wins over `WriteManager`'s:

```json
{ "action": "dispatchEmail",
  "payload": {
    "operation": "sendCorrespondenceEmail",
    "mode": "single",
    "referenceId": "", "correspondenceEmailId": "",
    "__confirmedByUI": true,
    "ref": "<referenceId>", "idempotencyKey": "idem:send-correspondence-email:...",
    "email": {
      "to": "", "cc": "", "bcc": "",
      "subject": "<rendered subject line>",
      "html": "<full rendered HTML, branded template>",
      "text": "<plaintext derivation>",
      "classification": "Official|Confidential|Restricted|Secret",
      "templateId": "official-correspondence|...",
      "attachments": ["<split attachmentSummary string>"]
    }
  },
  "userEmail": "<dev posture only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

On failure the draft is marked `status:'queued'` locally and re-enqueued in `PendingQueue` with
`key:'EMAIL'`, `operation:'sendCorrespondenceEmail'`, same payload.

**Response**: `res.requestId` (if present) is stored on the sent record as `row.requestId`;
nothing else is read.

### 6.2 `EMAIL_RELATED_TASK` — create a task from an email

Payload builder: `core/assignment-payload.js#buildEmailTaskPayload`:

```json
{ "action": "emailtotaskassignment",
  "payload": {
    "schema": "dgo-email-task-payload/v2", "source": "email-to-task",
    "referenceId": "", "title": "", "assignedTo": "",
    "category": "", "categoryCode": "", "subcategory": "", "subcategoryCode": "",
    "assignedToDsu": "", "supportingAssignee": "", "supportingDsu": "",
    "priority": "urgent|high|normal|low",
    "startDate": "", "ack": "", "due": "", "instruction": "",
    "ccRecipients": ["..."],
    "sourceEmailId": "",
    "email": { "id": "", "subject": "", "fromAddress": "", "receivedDateTime": "", "webLink": "" },
    "createdBy": "<actor email>", "createdAt": "<ISO>"
  },
  "userEmail": "<dev posture only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

Live-tenant probe (prior session): `400 refused` against a minimal `{operation:
'emailtotaskassignment.probe'}`-shaped body, `dataKeys` echoing
`selectedCount, assignedTo, assignedToTitle, assignmentType, category, categoryCode, subCategory,
subCategoryCode, priority, ackDue, taskDue, copyTo, tasksCreated, docsUpdated,
notificationsSent` — same response shape family as `BULK_ASSIGNMENT`'s declared `expect` list,
suggesting both share a response-composition template on the flow side even though their
request payloads differ.

---

## Part 7 — AI endpoints

All three share the read-only, best-effort posture: a failure must land the caller "in exactly
the state they were in before they asked" (`modules/correspondence.js` comment) — never a
blocking error.

### 7.1 `AI_DOC_ANALYSIS`

Two distinct call shapes exist:

**a) Correspondence classification** (`modules/correspondence.js#runAiTriage`):
```json
{ "action": "aiAnalyseEventDocs",
  "payload": { "operation": "classify", "referenceId": "", "subject": "", "remarks": "" },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```
Called via `invokeData(...)` with an **overridden** local policy of `{timeoutMs:8000, retry:0}`
— deliberately far below the contract's declared `90000`, because this call is advisory and a
slow answer is worse than a fast "unavailable."

**b) Event/meeting document analysis** — **DECLARED, NOT VERIFIED**: the contract's default
`action` (`aiAnalyseEventDocs`) and its name imply a second caller (likely `modules/meetings.js`
or the executive briefing surfaces) that analyses event documents rather than classifying
correspondence; no call site for this second use was traced in this pass.

**Response, live-tenant confirmed (prior session probe)**: the flow answered `200` with a body
that is **not the platform envelope at all** — no `ok`/`status`/`data` wrapper, just a flat
object (`current_date, event_name, inviting_organization, event_date, event_time, location,
invitee_role, ai_summary, strategic_value, justification, accept_url, decline_url,
delegate_url`). Per Part 0's `assertEnvelope` behaviour, this does not throw (no `ok:false`, no
`status.http>=400`) — `assertEnvelope` returns the whole flat object as `data` (since `.data` is
absent), and `unwrapActionResponse` then tries `data.result ?? data.analysis ?? data.message ??
data`, falling through to the flat object itself. **Functionally tolerated, but a genuine
contract deviation** from every other endpoint's enveloped response.

### 7.2 `AI_EMAIL_ANALYSIS`

**DECLARED, NOT VERIFIED against a specific call site** in this pass — `config/source-routing.config.js`
lists it under `LegacyEndpointMap`, and `config/action-ownership.config.js` has no entry for it
(it is not a governed action; likely invoked ad hoc from an email-detail surface). Contract:
`action:"aiAnalyseEmail"`, `write:true`, `timeoutMs:90000`. Live-tenant probe returned `400`
("the flow is live and validating its input") against the probe's minimal `{action:'aiAnalyseEmail',
userEmail}` body.

### 7.3 `AI_CHAT`

`modules/assistant.js`:
```json
{ "action": "aiChat",
  "payload": { "messages": ["...conversation turns..."], "scoped": true, "context": "<QueryStore.dashboard() snapshot, or null>" },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```
Called via `invokeData('AI_CHAT', ...)`, so the response is unwrapped as `data.result ??
data.analysis ?? data.message ?? data`, then the UI reads `res?.reply || res?.message ||
(typeof res==='string' ? res : 'No reply was returned by the AI flow.')` — **so the flow may
answer with a top-level `reply` or `message` string, or a bare string, and all three are
accepted.**

Live-tenant probe: **`502` — "the flow was reached and failed inside itself"** against
`{action:'aiChat', message:'__DGO_PROBE__'}`. **DECLARED, NOT currently returning a usable
response** as of that run.

---

## Part 8 — `OTP_GENERATE` / `OTP_VERIFY` — two distinct calling shapes on the same two flows

Both flows are shared between the platform's own sign-in (Wave 3 enforcement, see the auth
guide) and `bulk-assignment`'s in-session step-up confirmation. **The two callers build
different request bodies against the identical contract keys**, and a flow must be built to
handle both.

### 8.1 Sign-in shape — `core/otp-identity.js`

```json
// requestCode(email) → invokeObsidianAction('REQUEST_OTP', {email})  [core/api.js alias table]
{ "action": "otpGenerate",
  "payload": { "operation": "requestOtp", "email": "officer@nitda.gov.ng" },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }

// submitCode(email, code) → invokeObsidianAction('VERIFY_OTP', {email, code})
{ "action": "otpVerify",
  "payload": { "operation": "verifyOtp", "email": "officer@nitda.gov.ng", "code": "123456" },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

**Response contract** (per `docs/folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md`, and read by
`core/otp-identity.js`):
```json
// OTP_GENERATE →
{ "sent": true, "expiresAt": "2026-08-05T09:12:00Z" }
// (or nested under .data — the client reads res?.sent/res?.expiresAt off whatever
//  invokeObsidianAction hands back, which is res?.data || res?.result || res)

// OTP_VERIFY →
{ "ok": true,
  "token": "<opaque signed proof — also accepted as res.verification or res.proof>",
  "expiresAt": 1786000000000,
  "claims": { "preferred_username": "officer@nitda.gov.ng", "name": "A. Officer", "roles": ["director"] } }
```
`core/otp-identity.js#submitCode` looks for `res?.token || res?.verification || res?.proof` —
**any one of those three field names is accepted** as the proof. If none is present, or
`res.ok===false`/`res.verified===false`, the client throws `res?.reason || 'That code was not
accepted.'`. The live-tenant probe (prior session) confirmed **neither `sent` nor
`token`/`verification`/`claims.roles` is currently returned** by the live flows — both answer
`200` but with none of these fields present, meaning Wave 3 enforcement is not yet functional
even though the flows are reachable.

### 8.2 Step-up shape — `core/otp-service.js`, reached from `bulk-assignment`

```json
// requestOtp({actor, purpose:'bulk-assignment', refs, operation:'BULK_ASSIGNMENT', payload, ttlSeconds:300})
{ "action": "otpGenerate",
  "payload": {
    "operation": "BULK_ASSIGNMENT",
    "actor": { "...State.profile..." },
    "purpose": "bulk-assignment",
    "refs": ["<up to 5 activity ids>"],
    "payloadDigest": "<sha256 hex of the sorted-key JSON of the caller's payload>",
    "ttlSeconds": 300,
    "requestedAt": "<ISO>",
    "__confirmedByUI": true
  },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

**Field collision, precisely**: `OtpService.requestOtp`'s own `operation` parameter (here, the
literal string `'BULK_ASSIGNMENT'`, identifying *which feature* asked for the code — not which
OTP step) is spread into the alias-built request *after* `operation:'requestOtp'` is set, so it
**overwrites** it. The flow must therefore use the fixed top-level `action`
(`otpGenerate`/`otpVerify`) to know which OTP step this is — `payload.operation` in this calling
shape carries the *caller identity* (`'BULK_ASSIGNMENT'`), not the step, which is the opposite
convention from §8.1 where `payload.operation` **is** the step (`requestOtp`/`verifyOtp`).

```json
// verifyOtp({requestId, otp, actor, operation:'BULK_ASSIGNMENT', refs, payload})
{ "action": "otpVerify",
  "payload": {
    "operation": "BULK_ASSIGNMENT",
    "requestId": "<from the requestOtp response, or a client-generated uuid if the endpoint was unreachable>",
    "otp": "<entered code>",
    "actor": { "...State.profile..." },
    "refs": ["..."],
    "payloadDigest": "<sha256 hex>",
    "verifiedAt": "<ISO>"
  },
  "userEmail": "<dev only>", "requestId": "<uuid>", "timestamp": "<ISO>" }
```

**Client fallback when `OTP_GENERATE` is unreachable**: `modules/bulk-assignment.js` catches the
failure and generates a **client-side random 6-digit code**, shown directly to the officer in a
toast (`'OTP endpoint unavailable — offline code: ' + code`), and verifies it by string equality
in the browser — `backend:false` mode. This is explicitly not a security control in that mode;
it exists so the UI flow does not dead-end when the endpoint is unconfigured.

**Response, `verifyOtp`**: `core/otp-service.js` requires either `res.verified` or `res.ok`
truthy; anything else throws `OTP_VERIFICATION_FAILED`. No `token`/`claims` is read in this
path — step-up confirmation does not mint or use an identity proof, only a boolean pass/fail.

---

## Part 9 — `ARCHIVE_REFERENCE` and dispatch: declared contract vs. what actually runs

Restating precisely, because it is easy to assume the registered contract is what fires:

- **`ARCHIVE_REFERENCE`** (`operation:'archiveReference'` via the `ObsidianActionAliases` table)
  has **zero callers**. `modules/archive.js#archiveReference` calls
  `core/archive.js#ArchiveService.archiveReference(ref, actor, meta)`, which is **entirely
  client-side**: it reads `Entities.canClose(ref)` (in-memory), builds a bundle
  (`core/export-bundle.js#createArchiveHash`), and calls `Entities.archive()` — a `Map` mutation.
  **No `fetch`, `invoke`, or `DataClient` call exists anywhere in this path.** Archiving a
  reference in the current build produces no network request at all; the "immutable archive" is
  immutable only within that browser's in-memory `Entities` store for the session.
- **`DISPATCH_OUTBOUND`** (`operation:'dispatchOutbound'`) likewise has zero callers.
  `modules/dispatch.js` instead sends `operation:'dispatch'` through `WriteManager.backend`
  (Part 4.2) — a differently-named operation on the *same* `DYNAMIC_ACTIONS` flow, not the
  registered `DISPATCH_OUTBOUND` contract key at all (even though `DISPATCH_OUTBOUND` resolves
  to the identical URL, per Part 1's `sourceKey`).

A flow estate built strictly from the `ObsidianActionAliases` table would implement
`archiveReference`/`dispatchOutbound` operations that the shipping client never sends, while
the operations the client *does* send (`dispatch`, and archive's total absence of a call) would
have no handler under those names unless the flow also recognises `dispatch` as a synonym.

---

## Part 10 — `SCAN_INTAKE` — the one non-JSON contract

`core/scan-intake-service.js#depositScan`. Not reached through `DataClient`/`EndpointContracts`
at all — no `EndpointContracts.SCAN_INTAKE` entry exists by design, only a bare URL in
`EndpointUrls.SCAN_INTAKE`.

```
PUT <url>
Content-Type: application/octet-stream
X-DGO-Filename: <URI-encoded, Universal-Filename-Policy-normalised name>
X-DGO-Sha256: <hex SHA-256 of the raw bytes>
X-DGO-Size: <byte count as a string>
Authorization: Bearer <proof>          (enforced posture only — see core/auth.js#authHeaders)

Body: <raw file bytes, no encoding, no JSON wrapper>
```

Client-side pre-flight (never crosses the network if it fails): file must have a non-empty
name, non-zero size, size ≤ 25 MB (`SCAN_LIMITS.maxFileBytes`); MIME type is checked against an
allow-list (`application/pdf`, `image/png`, `image/jpeg`, `image/tiff`, `application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) but this check is
**advisory only** — both extension and declared `Content-Type` are caller-supplied and not
trustworthy signals.

**Response** (JSON, despite the raw-bytes request):
```json
{ "referenceId": "", "attachmentLink": "", "stored": true,
  "depositedBy": "", "depositedAt": "<ISO>",
  "sha256": "<echoed or server-computed>", "bytes": 0,
  "reason": "<present only on failure>" }
```
`stored:false` with a `200`/`ok` HTTP status is a distinct, meaningful state: *"the endpoint
accepted and verified the bytes but could not file them"* — the client does not collapse this
into a generic failure. HTTP `401` → `reason:'unauthenticated'`; `403` → `reason:'forbidden'`;
anything else non-2xx → `data.error || 'refused'`.

---

## Appendix — cross-reference to the live-tenant probe

The prior session in this conversation analysed two live probe transcripts
(`docs/folio-Master-Flows-and-Endpoints/contracts/transcripts/INTERNAL_PLATFORM-transcript_probe-mskv094z.json`,
`docs/folio-Master-Flows-and-Endpoints/contracts/transcripts/DOCUMENTS_PORTAL_transcript_endpoint-check-portal-probe-mskul63e.json`, both on `main`). Where
this document says "live-tenant confirmed" or "DECLARED, NOT VERIFIED," it is citing that
transcript. Summary of what it settled, mapped onto the parts above:

| Finding | Part | Effect |
|---|---|---|
| `FETCH_ALL` → `401` (signature) | Part 2 | Boot falls back to `FETCH_ACTIVITIES`; `users` never arrives; `runtime.directory.served` stays false — the bootstrap-`systemAdmin` fail-open the auth guide documents is live, not theoretical, as of that probe |
| `OTP_GENERATE`/`OTP_VERIFY` → `200` but missing `sent`/`token`/`claims` | Part 8.1 | Wave 3 enforcement is not functional yet even though both flows are reachable |
| `SINGLE_ASSIGNMENT` → `502` | Part 3.1 | Flow reached, fails internally |
| `AI_CHAT` → `502` | Part 7.3 | Flow reached, fails internally |
| `AI_DOC_ANALYSIS` → `200`, no envelope | Part 7.1 | Tolerated by client fallback unwrap, but a real contract deviation |
| `DISPATCH_OUTBOUND`/`ARCHIVE_REFERENCE` → `200` via `DYNAMIC_ACTIONS` | Part 1, Part 9 | Reachable, but nothing in the client calls them under those operation names |
