# Decision record — portal estate, flows and boundary

Five decisions. Each states what is decided, why it is decided that way rather than the
obvious alternative, what it costs, and how it is verified. Nothing here waits on further
investigation; the evidence for each is in this repository and named.

**Total cost: five flow edits and one config key.** No new flow, no new trigger, no new
connection, no new endpoint URL, no import.

---

## D1 · C7 — the triage write-back extends `ECM_DOCS_INTAKE`

**Decided.** The status write-back is a second branch on the existing `ECM_DOCS_INTAKE` flow,
selected by a top-level `action`, invoked by the internal platform when it changes a portal
item's state. Not a new flow, and not a SharePoint trigger.

### Why not a SharePoint-triggered flow

Because there is nothing to trigger on. `ECM_DOCS_INTAKE` is a **live read feed**, not a copy:
it reads `Portal Registry` on demand and projects 22 columns. No flow anywhere in the estate
creates an internal row from portal data — the four flows that create in the internal estate
(`Deployed - Create Task`, `Deployed Bulk Task Assignment`, `Web - Email Task Created`,
`DGSO INCOMING AI PROCESSING`) never read `Portal Registry`.

So a portal submission has no internal row. A trigger-based design would first need a
persistence path built, which is a second decision and a second flow to serve the first.

### Why this shape

`ECM_DOCS_INTAKE` already is the sanctioned crossing, already tenant-authenticated, already
knows `Portal Registry`, and is already called by the internal platform. Adding a branch to it
costs one flow edit and one config key, and it keeps the number of crossings at **one** rather
than introducing a second.

```
trigger: HTTP POST, triggerAuthenticationType = Tenant   (unchanged)

Switch on @coalesce(triggerBody()?['action'], 'feed')
  case 'feed'      -> the existing Scope_Global_Intake_Feed, byte for byte   (default)
  case 'writeback' -> Patch Portal Registry by ReferenceId:
                        Status, StatusLabel, ActionRequired,
                        AcknowledgedAtUtc, ClosedAtUtc, UpdatedAtUtc = utcNow()
                      Create Portal Status Timeline row:
                        Title = SubmissionRef = ReferenceId, AtUtc, Status, Label,
                        Actor = the officer, Note
```

`coalesce(..., 'feed')` is what makes this backward compatible: today's callers send no
`action` and keep the behaviour they have.

### The boundary still holds, and the statement of it gets sharper

The load-bearing property was never "read-only" — it is **tenant-authenticated**. An anonymous
caller cannot invoke this flow at all, before and after. The write goes *into* the portal
estate from the internal side; nothing about the internal estate becomes reachable from the
portal. Restate the principle as: *one crossing, tenant-authenticated, which reads the portal
registry outward and writes portal status back — and touches no internal list in either
direction.*

### Client side

One contract key, same URL, different fixed action:

```js
PORTAL_STATUS_WRITEBACK: Object.freeze({
  method:'POST', action:"writeback", write:true,
  sourceKey:"SCAN_INTAKE", url:EndpointUrls.SCAN_INTAKE })
```

**Verified by:** `npm run wiring` — C7's two operations appear against `Portal Registry` and
`Portal Status Timeline`, and the boundary section stays clean.

**What it unblocks:** six of the seven governed status values. Today a citizen can only ever be
shown `received`.

---

## D2 · Two of the three unwired lists are reserved, one is wired

**Decided.**

| List | Decision | Reason |
|---|---|---|
| `Portal Outbox Receipts` | **Wire** — one create in `VERIFY`, one in `SUPPORT` | "Did the citizen actually get their code" is a real support question that nothing else answers. Two writes, both already on a mail path. |
| `Portal Audit Events` | **Reserve**, for the six public endpoints this decision covers | Power Automate's own run history already holds every decision point for 28 days, queryable per run. Duplicating it costs an append at every branch of six public endpoints. → `WRITEBACK` is not one of them and writes it — see [D13](#d13--writeback-is-fully-provisioned--the-portal-audit-events-row-is-no-longer-proposed). |
| `Portal Flow Telemetry` | **Wire** — one create in `Scope_Flow_Data_Capture` | *Revised 2026-08-19, see below.* |

### Correction — Flow Telemetry is a sink, not a duplicate

The original reason given here was that it duplicates Power Automate's run history. **That was
wrong**, and reading the legacy build standard is what showed it.

Twenty-three deployed flows already carry `Scope_Flow_Data_Capture`, which composes a versioned
`flow_run_record` — `capture_version` 2.0.0, with `capture_metadata`, `workflow_identity`,
`run_identity`, `trigger_record`, `request`, `design_definition`, `response_record`, `outcome`
and `timing` — validated against a draft-07 JSON Schema the flow carries alongside it. The
estate decided long ago that it wants this data. It is not a duplicate of anything.

What it lacks is a queryable home. `Send_Telemetry_Email` ships the record as four attachments,
which is how every definition in `docs/reference/foundational/flows/definitions/` came to
exist — those files *are* captured attachments, and their `<Flow>__<RunId>__full_definition.json`
naming is that convention. Email is not a place you can ask a question of.

`Portal Flow Telemetry` is that home, and its seven columns map onto the record the standard
already computes: `varRequestId` to `RunId`, `varReceivedAtUtc` to `StartedAtUtc`,
`varCompletedAtUtc` to `CompletedAtUtc`, `varDurationMs` to `DurationMs`, `varStatusCode` to
`Outcome`, `varErrors` to `ErrorMessage`. **Wiring it is one create action inside a scope
twenty-three flows already have.**

`Portal Audit Events` stays reserved, and now for a better reason than the one first given: the
`flow_run_record` already captures the trigger, the request, the response and the outcome, with
redaction applied — with more fidelity than a per-decision audit row, and without adding a write
to every branch of a public endpoint.

### Why reserve rather than delete

Deleting is irreversible, and the two lists cost 13 columns that are already provisioned and
already verified. Reserving is free and reversible. What is *not* acceptable is leaving them
undeclared: an unwired list in a release looks like a feature that works.

### Why not wire them

Beyond duplication, an append on a public endpoint is a write an anonymous caller can force.
Two extra writes per call on six unauthenticated endpoints is a throttling surface and a growth
surface with no retention policy behind it. Revisit only if a stated retention requirement
outlives Power Automate's 28 days — and then write them from the internal side, not the public
one.

**Verified by:** `npm run test:wiringspec` — every provisioned portal list is either wired or
declared reserved, with the reason.

---

## D3 · Fix one Switch label; declare the other sixteen dead

**Decided.** In `Universal Dynamic_Multi-Actions_Executor` — which is the `SUBSIDIARY_ACTIONS`
flow, not `DYNAMIC_GLOBAL_ACTIONS` — rename the case `list-activities` to `LIST-ACTIVITIES`.
Change nothing else in that Switch.

### What the evidence shows

The flow switches on `@triggerBody()?['action']`, which is case-sensitive. Exactly two contract
keys route here:

| Contract | Sends `action` | Flow case | Result |
|---|---|---|---|
| `SUBSIDIARY_ACTIONS` | `INIT` | `INIT` | matches — a bulk bootstrap of tasks, comments, emails, correspondences, users, categories, departments |
| `FETCH_ACTIVITIES` | `LIST-ACTIVITIES` | `list-activities` | **no match** — falls to `Scope_Default` |

The other sixteen cases — `REFRESH_EMAILS`, `acknowledge`, `track`, `listDocs`, `getdoc`,
`bulassign`, `CreateSupportRequest` and the rest — are sent by no contract in
`config/endpoints.config.js`. The eighteen `routeKeys` on `SUBSIDIARY_ACTIONS` describe intent;
the wire only ever carries `contract.action`, and `INIT` is a data loader with no branch on
`payload.operation` (the whole 252-action flow references `operation` twice).

Three of those sixteen are also misspelled against the routeKeys they were meant to serve:
`CREATE_TEST` for `CREATE_TASK`, `UlPDATE_TASK` for `UPDATE_TASK`, `bulassign` for `BULKASSIGN`.
Four hold zero actions.

### Why only the one rename

Normalising the whole Switch to case-insensitive would make sixteen dormant routes live in a
single edit — sixteen code paths that have never run against production data, four of them
empty, three misspelled. That is a large uncontrolled behaviour change sold as a tidy-up.

Renaming one label fixes the one route a contract actually calls. The sixteen are then dead
code with a documented status, to be deleted or given contracts deliberately, one at a time,
by someone who can say what each should do.

**Verified by:** call `FETCH_ACTIVITIES` and confirm it no longer returns the default scope's
response.

---

## D4 · Every remaining attribution ambiguity closes with one lookup

**Decided.** Read the twenty endpoint URLs out of the operator's `config/config.local.js`,
take the 32-hex string after `/workflows/` in each, and record them. Do not send the URLs — the
`sig` token in each is a bearer credential and the id is the only part needed.

That single list resolves, at once:

- `GET_DOCS` — six deployed candidates, none distinguishable by name
- `FETCH_ALL` — three numbered versions of the same flow
- `BULK_ASSIGNMENT` — the definition declares `c43388639d14452faef4ca3042a95b23`, the labelled URL register says `7e71fffe770a45ccb93bf216bb53786e`
- `BULK_ASSIGNMENT_DIRECT` — two candidates
- `AI_CHAT`, `AI_DOC_ANALYSIS`, `AI_EMAIL_ANALYSIS`, `FETCH_EMAIL_ATTACHMENTS`, `SCAN_INTAKE` — no id recorded anywhere

None of these blocks the gate: every candidate was exported and swept, so the estate footprint
is the union either way, and for the AI and attachment keys the union is empty because none
touches SharePoint. This closes ownership, not coverage.

**Verified by:** `npm run test:flowmap` — the register's ids stop being candidates.

---

## D5 · Sequence: five flow visits, each doing its own rate limiting

**Decided.** Rate limiting is not a seventh pass. Every endpoint is public and none has any
today, and the bucket read/update/create is three actions at the top of a flow that is already
being opened. Doing it in the same visit costs nothing extra and removes a whole phase.

| # | Visit | Does | Closes |
|---|---|---|---|
| 1 | `Portal_Verify`, `Portal_Verify_Confirm` | OTP estate split, attempt cap, expiry consume, rate limits, outbox receipt | An anonymous endpoint writing the internal operations site |
| 2 | `Portal_UBMISSION_ECM_DOCS` | Registry create, reference mint, timeline row, upload tickets, rate limits | C2 — and it lights up the intake feed, which is empty by construction until it does |
| 3 | `Portal_ECM_DOCS_STATUS` | Read registry and timeline instead of `Global Tracking Queue`, rate limits by source and by reference | C4 — citizens can read a status at all |
| 4 | `ECM_DOCS_INTAKE` | The `writeback` branch from D1 | C7 — the status can change |
| 5 | `Portal_UPLOAD_ECM_DOCS`, `Portal_ECM_DOCS_SUPPORT` | Ticket redemption and attachment record; support case and outbox receipt; rate limits | C3, C5 |

Visit 1 is first because it closes an exposure rather than completing a feature. Visits 2 and 3
are before 4 because a write-back has nothing to write to until the registry has rows and
nothing to show until a citizen can read them.

**Verified by:** `npm run wiring` after each visit. The number moves from `0/59` and the
boundary count from `17`. The target is `59/59` and `0`. *(Both figures were restated after D11
put WRITEBACK in scope, and after two internal sign-in flows were removed from the portal
endpoints. The visit sequence below is unchanged: WRITEBACK is a flow none of these five visits
touches.)*

---

## D7 · Build-standard conformance rides along with each visit

**Decided.** Each visit brings its flows onto the house standard in the same sitting as its
wiring work, rather than waiting for a sixth pass. Standard work first, wiring second.

### Why along rather than after

The flow is already open. Adding a catch scope to a flow whose actions you have just rewritten
costs a fraction of coming back to it, and the ordering is not optional in the other direction:
the standard variables and `Scope_Global` have to exist before an action can reference them, and
moving actions into a scope after the fact is where things get dropped.

A sixth pass would also mean touching nine flows twice, and every touch of a live flow is a
chance to break one.

### What it costs, per visit

Measured, not estimated — `node scripts/verify-flow-standard.mjs` reads it out of the deployed
definitions:

| Visit | Flows | Conformance before | Standard items |
|---|---|---|---|
| 1 | `Portal_Verify`, `Portal_Verify_Confirm` | 78%, **100%** | 2 |
| 2 | the two submission flows | 44%, 44% | 12 |
| 3 | `Portal_ECM_DOCS_STATUS`, `Portal_Status_Enquiry` | 44%, **0%** | 16 |
| 4 | `ECM_DOCS_INTAKE` | 33% | 6 |
| 5 | the three upload flows, support | 33–44% | 26 |

Visit 1 costs two items, both on `Portal_Verify`, and nothing at all on
`Portal_Verify_Confirm` — which already meets every rule. That is another reason it goes
first. `Portal_Status_Enquiry` at 0% is the outlier: it has none of the ten.

**These figures were wrong when this decision was first written, and wrong in the direction
that costs work.** The conformance script matched catch scopes against a fixed list of names
lifted from the flows that already conformed. `Portal_Verify_Confirm` names its catch
`Scope_Flow_Processing_Catch` and configures it correctly on Failed, Skipped and TimedOut; it
was scored as having none, and the worksheet generated from that score told the operator to
add a second catch scope to a flow that already had a working one. The check now tests the
shape — any Scope whose `runAfter` includes Failed — and the numbers above are what the
estate actually looks like: catch coverage is 39/57 across the estate and 10/11 on the
portal, not 19/57 and 1/11.

The table is no longer transcribed. `scripts/build-remediation-standard.mjs` regenerates every
artifact's `standardConformance` block and every worksheet's Step S from the live measurement,
and `npm test` fails if either has drifted from it.

### What each flow gets

Only what it is missing. Every artifact carries a `standardConformance` block naming that flow's
gaps with the remedy for each, and the remedies use **the estate's own expressions** — the
redaction composes are copied verbatim from `Compose_Redacted_Headers` and
`Compose_Redacted_Queries`, and `Compose_Flow_Run_Record` is copied from a conforming flow
rather than rewritten. A second dialect of the run record would be worse than none.

**Verified by:** `node scripts/verify-flow-standard.mjs --portal` after each visit. The portal
median starts at 33%.

---

## D6 · Existing `NITDA_Central_Registry` submissions stay where they are

**Decided.** No migration, no copy, no rewrite. The records already filed remain in place and
are handled as a separate records-management exercise once provisioning is concluded.

Every decision above is forward-facing and moves no existing row. Nothing in the five flow
visits reads, writes, moves or deletes anything already in the library.

### Why this is safer than it looks

Reading the deployed flows to check what deferring would cost turned up that **there is no
citizen-facing lookup over those records to preserve.** Three findings, each checkable in
`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`:

**The minted reference is never stored.** `Portal_UBMISSION_ECM_DOCS` composes a reference and
returns it, then calls `Update_file_properties_1` — which patches `id` and nothing else. No
`ReferenceId`, no sender, no subject. The reference the citizen is given exists only in the
response body they received at the time.

**`Portal_ECM_DOCS_STATUS` does not look anything up.** It carries no `$filter` at all — not by
reference, not by email. Its only list read is `Get_items_Tasks`, an unfiltered top-N of
`Global Tracking Queue`, and its response is a status-code envelope rather than a submission.
It is a copy of the submission flow's shape, including a `Create_file` action of its own.

**The reference format cannot be unique anyway.** It is
`concat('NITDA-', yyyy, '-', last 3 digits of ticks(utcNow()))` — a thousand possible values per
year, drawn effectively at random. By the birthday bound a collision is more likely than not
after about thirty-seven submissions in a year.

So the position after this decision is the position before it: the files are intact and safe,
and no citizen holding a legacy reference can check its status. **That is today's behaviour,
not a regression introduced by the cutover.** If the agency wants those submissions answerable
to their submitters, that is the migration project, and it is now a clean piece of work with no
deadline pressure on it.

### The one forward-facing requirement this creates

When `SUBMISSION` is rewired at visit 2, the reference **must** be minted from
`Portal Sequence Counters` — which carries `Prefix`, `Year`, `CurrentSequence`, `LastReferenceId`,
`LockToken` and `ModifiedByFlowRun` for exactly this — and **not** carried over from the `ticks()`
expression. Carrying it over would import a thousand-value collision-certain namespace into the
new estate on day one.

Mint it zero-padded to a width the legacy form never used — `NITDA-2026-00001` rather than
`NITDA-2026-001`. That costs nothing, and it means a legacy reference and a new one can never be
mistaken for each other by a person reading them, which matters precisely because both
generations of reference will be in circulation while the migration waits.

**Verified by:** `npm run wiring` — `SUBMISSION` must show all three `Portal Sequence Counters`
operations, not just a registry create.

---

## What is deliberately not decided here

**How the retained submissions are eventually answered.** D6 settles that they stay and that
nothing touches them; it does not settle whether they are later backfilled into
`Portal Registry`, answered through a separate legacy lookup, or left as an internal record
only. That is a records-management decision for the agency, and it is not on the critical path
for anything above.

---

## D8 · How a rate limit actually refuses

**Decided.** D5 said every visit does its own rate limiting and named three actions — read the
bucket, update it, create it. Three actions that count requests and refuse none is not a rate
limit, and the artifacts said nothing about a threshold, a window, or what happens when the
threshold is crossed. This settles all three.

### The counter

`Portal Rate Limits` carries `Title`, `WindowStartUtc`, `UpdatedAtUtc` and `RequestCount` — a
fixed-window counter and nothing more, which is what to build.

| | |
|---|---|
| Bucket key (`Title`) | `<ENDPOINT>_IP:<X-Forwarded-For>`, e.g. `VERIFY_IP:41.203.x.x` |
| Window | **60 minutes**, fixed, from `WindowStartUtc` |
| Limit, `VERIFY` | **5 per hour per source** — it mails a code to any address supplied, so it is the mail-relay risk |
| Limit, `VERIFY_CONFIRM` | **10 per hour per source** — guessing is already capped at 5 attempts per code; this caps guessing across codes |
| Over the limit | HTTP **429**, through the standard envelope |

A source with no `X-Forwarded-For` buckets as `unknown`. That shares one bucket between all
such callers, which is the safe direction: it throttles harder, never softer.

### Rollover, without duplicate buckets

A row whose window has expired is **updated** — `WindowStartUtc` reset to now, `RequestCount`
back to 1 — not left alone while a second row with the same `Title` is created. Two rows for
one bucket and a `$top 1` read is a limit that forgets, because which row comes back is not
defined. So: **create only when no row exists at all.**

### Where the refusal happens, and why not a Condition

The obvious shape — wrap the existing `Switch` in a Condition and put the work in the "No"
branch — means dragging a Switch holding dozens of actions into a branch in the designer. That
is the single riskiest edit available in this whole remediation, on a live flow, for a gate.

Both flows switch on `@triggerBody()?['action']` with cases `generate` and `verify`. So instead:

1. A Compose, `Compose_Switch_Key`, returns `'rate-limited'` when the bucket is over its limit
   and the caller's own `action` otherwise.
2. The `Switch` expression is repointed to `@outputs('Compose_Switch_Key')` — one field.
3. A new case, `Case_Rate_Limited`, sets `varStatusCode` to 429 and appends the message.

Nothing is dragged, nothing is restructured, and the refusal returns through the same response
envelope and the same telemetry scope as every other outcome — which an early `Terminate` would
have skipped, losing the run record for exactly the requests worth recording.


### The 429 cannot be returned until the finalize scope stops overwriting it

Setting `varStatusCode` to 429 in a case achieves nothing on its own.
`Scope_Finalize_Response_State/Set_variable_varStatusCode` runs afterwards and overwrites it
unconditionally with `if(errors, 400, 200)`, and the `Response` action returns
`@variables('varStatusCode')` as the actual HTTP status. So the gate would refuse the request,
count it, and answer **200 OK**.

This is not only about the gate. Both verification flows already set real codes on real
branches — 404 for "no pending code", 400 for "invalid or expired", 400 for an unknown action
— and every one of them is being overwritten the same way. Those branches append to
`varResponse`, a string, not to `varErrors`, so the finalize expression sees no errors and
answers 200.

**A wrong one-time code therefore returns HTTP 200 today.** `document-portal/js/core.js:442`
reads `if (!r.ok) return { ok: false, reason: 'verification-failed' }`, so the portal has no way
to know the verification failed, and reports it as verified. The client is written correctly;
the flow is lying to it. The same file at line 425 already handles `r.status === 429`, so the
rate limit needs no client change at all once the status survives.

It takes two actions rather than one, because Logic Apps refuses a `Set variable` whose value
reads the variable it is setting — `WorkflowRunActionInputsInvalidProperty`, *"Self reference is
not supported"*. So the branch's own code is captured into a Compose first.

Inside `Scope_Finalize_Response_State`, as its **first** action, add `Compose_Branch_Status`:

```
@coalesce(variables('varStatusCode'), 0)
```

Then `Set_variable_varStatusCode` runs after it, reading the Compose rather than itself:

```
@if(greaterOrEquals(coalesce(outputs('Compose_Branch_Status'), 0), 400), outputs('Compose_Branch_Status'), if(or(greater(variables('varFailedCount'), 0), greater(length(coalesce(variables('varErrors'), json('[]'))), 0)), 400, 200))
```

An explicitly set failure code wins; everything else behaves exactly as it does now. This is
part of visit 1 rather than a separate pass, because without it the visit's own rate limit
cannot return its own status code.

### Noted, not fixed here

The `Response` action sends `Access-Control-Allow-Origin: https://your-host` — a literal
placeholder. A browser will refuse every response from the real portal origin. It is not in
visit 1's scope and it is not a silent failure, but it must be set before the portal is
pointed at these endpoints.

### What this does not claim

A fixed window lets a caller spend its whole allowance at the end of one window and again at
the start of the next — twice the limit across two adjacent minutes. A sliding window would not,
and needs per-request rows rather than a counter. For a public endpoint whose risk is a script
running unattended, the fixed window is the right trade and the burst is acceptable. Say so
rather than describing this as a general-purpose limiter.

---

## D9 · The one-time code must actually be compared

**Decided.** `Portal_Verify_Confirm` gains an explicit code comparison, and visit 1 does not
ship without it.

### What is deployed today

`Condition_1` tests one thing:

```
Expires_At > utcNow()
```

That is the whole of it. The only place the presented code is ever compared to the stored code
is the SharePoint `$filter` on `Get_items_OTP_Verify`:

```
OTP_Code eq '<presented>' and Is_Verified eq 0
```

Two consequences follow, and both are live:

1. The filter matches on the **code alone**, with no email. A code is therefore accepted for
   whichever address minted it, not for the address presenting it. Two citizens verifying at the
   same time can be crossed over.
2. Because `Condition_1` only checks expiry, the "verified" branch is reached whenever the
   filter returned any row at all.

### Why the fix as first written would have made it worse

Visit 1 replaces that filter with `Email eq '<identifier>' and Consumed eq 0` — correct on its
own terms: it binds the challenge to the address. But it also removes the only comparison of the
code that existed anywhere in the flow. Applied alone, the flow would fetch the newest unconsumed
challenge for the address, check that it had not expired, and verify. **Any code value would have
passed.**

That is an authentication bypass introduced by a change whose stated purpose was to close one.
It is recorded here rather than quietly corrected, because the lesson generalises: moving a
check from one place to another is only safe if you can say where it landed.

### The shape visit 1 ships

`Condition_1` keeps testing expiry, so its else branch remains the expired path and
`Consume_Expired_Challenge` belongs there. Inside its "yes" branch a new condition does the
comparison the flow has never had:

```
Condition_Code_Matches
  trim(string(coalesce(triggerBody()?['otp_code'],'')))
    equals
  string(coalesce(outputs('Get_item_OTP_Record')?['body/OTP_Code'],''))
```

| Branch | What runs |
|---|---|
| matches | `Update_item` (consume), the success variables, `Create_Verification_Proof` |
| does not match | `Increment_Attempts`, then `Consume_Challenge_Attempts_Exceeded` once `Attempts` reaches 5, and the invalid-code variables |
| expired (`Condition_1` else) | `Consume_Expired_Challenge`, and the invalid-code variables |

The three actions that today sit directly under `Condition_1` — `Update_item`,
`Set_variable_Verification_Successful`, `Append_to_string_variable_Verification_Successful` —
move into the "matches" branch. Moving three actions into a nested condition is the kind of edit
that is slow and risky in the designer and is a few lines of JSON against the definition, which
is the second reason the approach changed.

### Not a hashing decision

SC-003 stands: codes are stored in plaintext because Workflow Definition Language has no bitwise
operators and the estate carries no external dependency in which to compute a digest. The
protection is the lifecycle — short expiry, single use, attempt cap — and this comparison is what
makes the "single use" and "attempt cap" halves mean anything.

---

## D10 · Two of the six endpoints are clones of the submission flow

**Decided.** Visits 3 and 5 are not "add the missing actions". `Portal_ECM_DOCS_STATUS` and
`Portal_ECM_DOCS_SUPPORT` do not do their own job at all, and the remediation has to say so
before it says where to put anything.

### What they actually contain

Both carry the identical thirteen-action skeleton `Portal_UBMISSION_ECM_DOCS` has — the same
Initialize block, the same `Set_variable`, the same `Scope_Global_Submission`, the same `Switch`.
Inside `Scope_Global_Submission` sits `Scope_Process_Submission`, and inside that:

```
Compose_Submission_FileName
Compose_Submission_FileContentBase64
Condition_Submission_Missing_Required_Fields
  else: Compose_Submission_ReferenceId -> Create_file_1 -> Update_file_properties_1 -> ...
```

That is a document submission: name a file, decode base64 content, create the file, set its
properties. It is the correct body for `SUBMISSION`. It is the body of the **status** endpoint
and the **support** endpoint too.

`Portal_ECM_DOCS_STATUS` adds a `Switch` with `Case_load` and `Case_submit` bolted on after the
submission scope has already run.

### This explains an earlier finding rather than contradicting it

The wiring check reported that `Portal_ECM_DOCS_STATUS` carries no `$filter` and never looks up
by reference or by email. The reason is now plain: **it was cloned from the submission flow and
the body was never rewritten.** Nothing was removed; the lookup was never there.

`Portal_Status_Enquiry`, the other flow attributed to STATUS, is a stub — three
`Initialize variable` actions and nothing else. It scores 0% on the build standard because it
has none of it, and it has none of it because it has no body.

### What this changes

| | |
|---|---|
| Visits 1, 2, 4 | Insertions into a flow whose body does the right job. Patchable as specified. |
| **Visits 3 and 5** | The host scope does the wrong job. Placement is not the blocker — the body is. |

An action placed inside `Scope_Process_Submission` on the status flow would run **after** that
flow had already created a file in the document library. Adding a registry read there would not
make it a status endpoint; it would make it a submission endpoint that also reads the registry.

### The decision

**Visits 3 and 5 replace their bodies rather than extend them.** For each of the four flows the
work is: keep the trigger, keep the Initialize block, keep the response envelope and the
telemetry scope; **replace `Scope_Process_Submission` entirely** with the body the endpoint
actually needs, which the artifacts already specify as their action lists.

This is a larger change than visits 1, 2 and 4 and it is the right one, because the alternative
is four endpoints that each perform a document submission as a side effect of being called.

It is also *safer through the patcher than through the designer*, for the same reason D9's
three-action move was: replacing a scope is a JSON operation with a validator behind it, and a
long sequence of designer deletions with no validator behind it.

### What has to be settled before visits 3 and 5 can be written

The artifacts list the actions those endpoints need. They do not yet say what the replacement
scope's **control flow** is — which conditions guard which branch, and what each returns. That
is one design sitting per endpoint, and it is the last open specification question in this work.

---

## D11 · Citizen write-back is in scope

**Decided by the sponsor.** INT-007 WRITEBACK is part of the pilot. The target is no longer
49 operations across six endpoints.

### What changed

| | Before | After |
|---|---|---|
| Endpoints | 6 | **7** |
| Required operations | 49 | **59** |
| Provisioned portal lists with no writer | 1 — `Portal Audit Events` | **0** |

`Portal Audit Events` was the one provisioned list nothing in the design touched. WRITEBACK
writes it, which is what it was provisioned for: a citizen-initiated act that can withdraw a
submission is precisely what needs an audit row. **Every provisioned portal list now has a
writer.**

### What it does

A verified citizen may **respond**, **add a note**, or **withdraw**. Every action appends a row
to `Portal Status Timeline` with actor `Submitter`. **Only a withdrawal changes
`Portal Registry/Status`.** A proof from VERIFY_CONFIRM is the only authentication — there is no
account and no session — so the proof is read, matched and consumed on every call.

The full field-level contract is in
[`PORTAL_DATA_CONTRACT.md`](./PORTAL_DATA_CONTRACT.md) under `WRITEBACK`.

### It is the citizen half of visit 4's circle

C7 is `ECM_DOCS_INTAKE` patching a registry row so a status can advance — the **staff**
write-back. WRITEBACK is the **citizen** write-back, appending to the same timeline through the
same list, in the other direction. They were specified apart and belong together: a status
conversation with only one side is not a conversation.

### What it costs

Three things, and the flow is the smallest of them.

1. **A flow.** Ten operations — rate-limit trio, proof read and consume, registry read and
   conditional update, timeline row, audit row, telemetry row. Comparable to visit 4.
2. **A seventh endpoint key.** Neither build's configuration declares `WRITEBACK`. It has to be
   added, provisioned, and its URL published to the portal.
3. **A client.** `document-portal/` implements neither the call nor the key. The closure package
   build does — `submitWb` and `writeback`. **Which build is deployed therefore stops being a
   documentation question and becomes a delivery one:** if `document-portal/` is what ships, the
   write-back UI has to be built into it before the flow has a caller.

### What this decision does not settle

Which build ships. That is open item 20, and it now blocks WRITEBACK rather than merely
confusing the record. → Resolved by [D12](#d12--the-closure-package-is-discarded--document-portal-is-the-platform).

### Counted honestly in the meantime

`portal-wiring.json` 1.5.0 carries WRITEBACK with its ten operations and no deployed flow
candidate. So `npm run wiring` reads **0/59 across seven endpoints**, not 0/49 across six.
The ten operations are unwired *by construction* rather than by oversight, and the wiring
specification says so in the endpoint's own `notDeployed` note — because a scope decision that
does not move the denominator is a scope decision nobody has to honour.

---

## D12 · The closure package is discarded — `document-portal/` is the platform

**Decided directly, 2026-08-21.** Open item 20 — which of the two builds ships — is resolved.
`document-portal/`, the build in this repository, is the platform. The closure package
(`Document_Portal_Closure_decoded`) is discarded: it is no longer a candidate to ship, and it is
no longer a reference for what the portal should do.

### What this changes

Every place D11 and `FUNCTIONAL_SPEC_RECONCILIATION.md` weighed the closure package against
`document-portal/` — as an alternative deployment target, as the source for the six live
workflow ids, as the only existing implementation of `submitWb`/`writeback` — is now settled in
`document-portal/`'s favour by construction, not by comparison. Nothing about that reasoning was
wrong; the choice it was reasoning toward is no longer open.

**The description of what the closure package *was* needs a correction, independent of
discarding it.** `FUNCTIONAL_SPEC_RECONCILIATION.md` read it as a single-page portal build —
one `index.html` plus one `support.js`. That undersold it: the package is a fuller snapshot of a
platform version, assembled for a specific prior purpose, and capable of regenerating that
version's full package — not merely an alternate front-end for the same six endpoints. The
mischaracterisation did not change what got decided here, but a discarded artifact should not
stay on record as smaller than it was.

### What it costs

D11 already named this cost precisely: **a client**. The closure package was the only place
`submitWb`/`writeback` existed. With it discarded, that UI does not exist anywhere and has to be
built into `document-portal/` from a clean start, against the `WRITEBACK` contract in
`PORTAL_DATA_CONTRACT.md`, before the WRITEBACK flow (C6) has a caller to serve.

### What this decision does not settle

The design of the write-back UI itself — the screens, not the wiring. That is new work, not a
reconciliation of something that already existed in one build and not the other.

### Recorded, not deleted

The comparison in `FUNCTIONAL_SPEC_RECONCILIATION.md` and the "two builds" framing in
`remediation/ANALYSIS.md` (named `PLAN.md` until 2026-09-24) stays in place as the record of the analysis that led here, with a note
pointing to this decision. `portal-data-contract.json` and `portal-wiring.json` are updated —
they are the estate's current state, not its history, and a discarded build has no claim on
either.

---

## D13 · WRITEBACK is fully provisioned — the `Portal Audit Events` row is no longer proposed

**Decided directly, 2026-08-21.** `PORTAL_DATA_CONTRACT.md`'s WRITEBACK section carried the
audit-row write as `PROPOSED` while its own child fields (`audit.flow`, `audit.atUtc`,
`audit.reference`, `audit.sourceIp`, `audit.detail`) were already marked **required** — an
internal contradiction between a hedged parent and a settled set of children. This decision
removes the hedge: **every WRITEBACK call writes one row to `Portal Audit Events`, required, not
proposed**, exactly as its children already specified.

### This does not overrule D2 — it narrows what D2 covers

[D2](#d2--two-of-the-three-unwired-lists-are-reserved-one-is-wired) reserved `Portal Audit
Events` specifically because "an append on a public endpoint is a write an anonymous caller can
force" — a throttling and unbounded-growth surface on the **six unauthenticated public
endpoints** (`SUBMISSION`, `UPLOAD`, `SUPPORT`, `VERIFY`, `VERIFY_CONFIRM`, `STATUS`). That
reasoning does not transfer to `WRITEBACK`. Every `WRITEBACK` call requires a `verification`
proof already consumed by `VERIFY_CONFIRM` (D4's proof pattern) — an anonymous caller with no
proof cannot reach the write path at all, so there is no anonymous caller left to force the
append D2 was protecting against. D2's reservation stands, unchanged, for the six it was written
about. `WRITEBACK` was never one of them; it is the exception the record now states rather than
leaves implicit.

This is also not new ground: [D11](#d11--citizen-write-back-is-in-scope) already said "WRITEBACK
writes it, which is what it was provisioned for" and `portal-wiring.json`'s ten required
operations for `WRITEBACK` already counted the `Portal Audit Events` create — the wiring
denominator does not move. What was missing was the words connecting D11's conclusion back to
D2's still-standing reasoning, and the contract's own hedge that never caught up to either.

### What changed

- `portal-data-contract.json` / `PORTAL_DATA_CONTRACT.md` — the WRITEBACK audit row's `PROPOSED`
  note is replaced; it is now **required**, on the same footing as its children.
- Open item 10 (`Portal Audit Events` has no reader or writer) is closed — see `OPEN_ITEMS.md`.

**Verified by:** `npm run test:datacontract` — the contract still resolves against
`portal-field-spec.json`'s provisioned columns; `npm run wiring` — the WRITEBACK operation count
is unchanged at ten, since the specification already counted this write.

---

## D14 · The replacement control flow for STATUS, SUPPORT and WRITEBACK is approved

**Approved with amendments, 2026-08-21.** D10 ended by naming what it could not settle: *"The
artifacts list the actions those endpoints need. They do not yet say what the replacement scope's
control flow is — which conditions guard which branch, and what each returns. That is one design
sitting per endpoint, and it is the last open specification question in this work."*

That sitting has happened, and its output is
[`remediation/B2_CONTROL_FLOW_PROPOSAL.md`](./remediation/B2_CONTROL_FLOW_PROPOSAL.md) — the
implementation basis, carrying ten sign-off items, eight mandatory directives and a required test
list. It is not reproduced here; this entry records that the question is closed and where the
answer lives.

WRITEBACK was taken in the same sitting. It was never formally numbered into B2 — D11 put it in
scope after B2 was written — but it needed the same kind of decision, and settling it separately
would have produced two documents disagreeing about proof handling and the denial response.

### What it settles beyond the branching itself

Three properties now hold across all three endpoints rather than being decided per flow:

| | |
|---|---|
| **The denial is uniform** | An unknown reference and a wrong-email pairing return materially identical `404` responses on STATUS *and* WRITEBACK. This is INT-006, open item 11 — now specified, still unimplemented. |
| **A proof is never spent on a correctable mistake** | WRITEBACK validates ownership, action and body *before* consuming the proof. The draft consumed it immediately after reading it, which would have destroyed a citizen's single-use proof over a mistyped reference or a too-short response. |
| **Sequential correctness is not sufficient** | Single-use proofs, unique case references, idempotency records and status transitions all need concurrency protection. A read-check-write that works only when requests arrive one at a time is explicitly rejected. |

### What it deliberately does not settle

**Whether `respond` should move `Portal Registry/Status`.** The device-only client path moves
local status to `review`; the contract permits a status change only on `withdraw`. The approved
flow follows the contract. Changing that is a contract amendment first, flow second — not a
choice to be made while writing an action list.

### What it costs

The directives require work the five per-visit artifacts do not currently carry: idempotency on
SUPPORT and WRITEBACK, atomic proof consumption, and multi-write partial-failure recovery. Two
dependencies are recorded rather than assumed away — a client fix for SUPPORT's retry
classification, and a **named** platform mechanism for each atomic operation, in the same spirit
as SC-003 and INT-005: if a property is unachievable on this platform it is recorded with its
compensating controls, never claimed and left unimplemented.

**Verified by:** the approved document's §9 test list, once the action lists are written and the
flows are packaged. Nothing is applied by this decision.

---

## D15 · `Flow Configuration` is kept as the list the allowed origins are read from

**Taken:** 2026-08-31, by the agency, on the record set out in
[`evidence/2026-08-30-flow-configuration-list.json`](../../evidence/2026-08-30-flow-configuration-list.json)
and [`evidence/2026-08-31-provisioning-run.json`](../../evidence/2026-08-31-provisioning-run.json).

Open item 34 asked whether the estate should keep reading its allowed CORS origins from
`Flow Configuration` on `NITDADGO-EAAACTIVITYTRACKING`, or move the control to a list it can
account for. It is kept.

### What was known when the decision was taken

Read from the tenant on 2026-08-30, not inferred:

| | |
|---|---|
| Created | **2025-10-30** — ten months before the estate capture, and long before this work |
| Description | none |
| Contents | **one item**, unchanged in over nine months |
| Referenced by | **none** of the 58 exported flows *(corrected below)* |

So the list looked dormant and unowned. Nothing breaks by using it, and nobody would miss it —
but equally nobody can vouch for where it came from or who may still edit it.

> **Correction, same day, after this decision was taken.** The "referenced by none" row was true
> of the 58 exports held on 2026-08-30 and is **not true** of the 60 held now. `CG_Writeback_Endpoint`
> — exported from the tenant later on 2026-08-31, and previously absent from this repository —
> reads this list by GUID for its allowed origins. The list is **not dormant**: a deployed portal
> endpoint reads it in production. That strengthens the decision below rather than weakening it.
> It also raised something the decision did not consider, recorded as **open item 36** and
> declared in `portal-wiring.json`: the same read crosses the portal trust boundary, which this
> estate's own wiring principle forbids without exception. D15 settles the list's *provenance*.
> It does not settle whether a portal flow may read the internal operations estate at all, and
> nothing here should be read as settling it.

### Why keep it

Fourteen packages already read this list for their origins. Moving the control to
`DGO_EndpointRegistry` or a new `DGO_PlatformConfig` is a **rebuild of all fourteen**, not an
edit — and it would buy provenance for a list holding a value that is public by nature. An
allowed origin is a scheme and a host that every response already announces in its
`Access-Control-Allow-Origin` header. It is configuration, not a secret.

The 2026-08-31 provisioning run had also already created `ConfigValue` on this list, because the
column is declared in the specification. That is what forced the decision now rather than later:
the estate had begun acting as though the answer were "keep it" without anyone having said so.
This decision ratifies that state deliberately; it does not discover it after the fact.

### What this decision does **not** settle

**Who owns the list.** It is still unowned, and this decision does not assign an owner. What it
settles is that the estate reads its origins from here, and that the absence of provenance is
accepted for this value and no other. A secret must never be put in this list — its permissions
have never been reviewed and its one existing row was written by someone nobody has identified.

**Whether the origins are correct.** No `ALLOWED_ORIGIN` row exists yet. Until one does, every
response carries an empty `Access-Control-Allow-Origin` header, which a browser rejects — the
fail-closed behaviour recorded in open item 8. Adding the rows is the remaining work, and it is
what closes item 8, not this decision.

**Verified by:** `ConfigValue` is present on the list — ledgered in the 2026-08-31 run record and
re-read by that run's verify pass. Item 8's own criterion, a browser reading a response, is
unchanged and still open.

---

## D16 · The WRITEBACK read of `Flow Configuration` is an accepted crossing of the portal boundary

**Taken:** 2026-08-31, by the agency, on
[`portal-wiring.json`](./portal-wiring.json) `declaredCrossings[0]` and the deployed definition
`CG_Writeback_Endpoint__21d4bfd3-f595-46fa-81bb-c29dabc12e7a__full_definition.json`.

### What is being accepted

This specification's principle is stated without qualification:

> No portal flow may read or write the internal operations estate or any `DGO_*` governance list.

The deployed `CG_Writeback_Endpoint`, invoked by **anonymous callers**, reads `Flow Configuration`
on `NITDADGO-EAAACTIVITYTRACKING` — the internal operations site — for its allowed CORS origins.
All seven portal designer-paste packages read the same list for the same value, so this is
accepted for **all seven portal endpoints**, not only the one already deployed.

The principle is not amended. It stands as written, and this is the one named exception to it,
recorded so that it is visible rather than tacit.

### Why it is accepted

| | |
|---|---|
| **The value is public by nature** | An allowed origin is a scheme and a host that every response already announces in its own `Access-Control-Allow-Origin` header. Reading it discloses nothing a caller cannot already see. |
| **Nothing reaches the caller** | The read populates a response header. No portal response returns list content from it, and the read is chained on all statuses so it fails closed. |
| **It is already live** | The deployed endpoint does this in production today. Declining to apply the packages would not undo it — it would only leave six endpoints on older behaviour while the seventh kept crossing. |
| **Removing it costs a rebuild** | Fourteen packages read this list by GUID. Moving the control means regenerating all fourteen, re-exporting `CG_Writeback_Endpoint`, and re-verifying — for a value that is public. |

### What is NOT accepted, and what would reverse this

The risk that makes the principle absolute is **not the value, it is the connection**. The flow's
SharePoint connection is authorised against the internal operations site as a whole, not against
one list. Any flaw that lets a caller influence *what* the flow reads through that connection
reaches further than this one row.

So this decision is bounded, deliberately and narrowly:

- **One list, one operation, one column.** `Flow Configuration`, `read`, the `ALLOWED_ORIGIN_*`
  rows. Any other list, any write, or any read whose target a caller can influence is **not**
  covered here and reopens the question.
- **No secret is ever placed in that list.** Carried forward from D15. Its permissions have never
  been reviewed and its one pre-existing row was written by someone nobody has identified.
- **A second crossing is a new decision.** `tests/portal-wiring.test.mjs` measures the deployed
  definitions and fails on any crossing not declared, so a second one cannot arrive quietly.

**Reverses this decision:** evidence that the read target can be influenced by a caller, or a
decision to scope the portal flows' connection to the portal estate — at which point moving the
origins to a portal-estate list becomes the cheaper option rather than the more expensive one.

### What this decision does not settle

**Whether the portal flows' SharePoint connection should be scoped more narrowly than the site.**
That is the general form of this problem and it is not addressed here. This decision accepts one
read; it does not endorse the connection's breadth, and narrowing it would remain an improvement
whether or not this crossing exists.

**Verified by:** `npm run wiring` reports the crossing and `npm run test:wiringspec` requires it to
be declared with what it contradicts. `declaredCrossings[0].state` is `ACCEPTED`, citing this
decision. A crossing that is not declared fails the build.
