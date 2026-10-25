# The flow build standard

The legacy flows carry a deliberate standard. It was never written down, so nothing could be
held to it — and the portal flows were built almost entirely outside it.

This is that standard, read out of the 57 deployed definitions rather than invented. Every rule
is something a substantial part of the estate already does. Machine-readable:
[`flow-standard.json`](./flow-standard.json). Measure it: `node scripts/verify-flow-standard.mjs`.

---

## Where the estate stands

**13 of 57 flows conform fully. Median 33%.**

| Rule | All flows | Portal flows |
|---|---|---|
| Standard variable set (`varStatusCode`, `varData`, `varErrors`) | 26/57 | 7/11 |
| Timing variables (`varReceivedAtUtc`, `varCompletedAtUtc`, `varDurationMs`) | 21/57 | **2/11** |
| `Scope_Global` wraps the work | 21/57 | **2/11** |
| A catch scope on `runAfter` Failed | 17/57 | **1/11** |
| The standard response envelope | 36/57 | 9/11 |
| A `Response` action returns it | 39/57 | 10/11 |
| `Scope_Flow_Data_Capture` | 23/57 | **3/11** |
| A versioned `flow_run_record` | 22/57 | **3/11** |
| Headers redacted before capture | 19/57 | **1/11** |
| Query string redacted before capture | 19/57 | **1/11** |

The pattern in that table is the finding. **The portal flows adopted the outer convention and
skipped the inner one** — 9 of 11 answer with the standard envelope, but 2 of 11 wrap their work
in `Scope_Global`, 1 of 11 has a failure path, and 1 of 11 redacts anything before capture. They
look conformant from the client's side and are not conformant anywhere else.

---

## The skeleton

```
Initialize_variable_varStatusCode        varRequestId    varReceivedAtUtc
Initialize_variable_varData              varErrors       varStartTicks
Initialize_variable_varResponse          varDurationMs   varCompletedAtUtc

Scope_Global
    Scope_<Purpose>                      the work
    Scope_Finalize_Response_State        compute timing and status
    Scope_<Purpose>_Catch                runAfter: Failed, TimedOut
    Compose__Standard_Response_Revised   the envelope
    Response

Scope_Flow_Data_Capture                  runAfter: the above, any outcome
    Get_Flow_Definition
    Compose_Redacted_Headers
    Compose_Redacted_Queries
    Compose_Flow_Run_Record
    Compose_Flow_Run_Record_Schema
    Compose_Telemetry_Attachments
    Send_Telemetry_Email
```

**The portal flows build this skeleton with two recorded differences.** The work sits in
`Scope_<Purpose>_Flow`, with `Scope_Global_<Purpose>`, `Scope_Catch_<Purpose>` (runAfter
Failed, TimedOut, Skipped) and `Scope_Finalize_Response_<Purpose>` inside it — the same shape
under a purpose-qualified name, which `scripts/verify-designer-paste.mjs` accepts as
`scope.global`. And `Scope_Flow_Data_Capture` ends in `Create_Flow_Telemetry`, a row in
`Portal Flow Telemetry`, instead of `Get_Flow_Definition` and `Send_Telemetry_Email`
([D2](./DECISIONS.md)). Neither difference is a defect.

`Scope_Global` exists so there is one place to attach a catch. Without it the failure path is
repeated on every branch, which is why the flows missing it are also the flows missing a catch.

## The response envelope

```json
{ "ok": true,
  "status":  { "http": 200, "code": "OK", "message": "Success" },
  "request": { "requestId": "", "trackingId": "", "action": "", "operation": "",
               "mode": "", "requestedBy": "", "source": "" },
  "timing":  { "receivedAtUtc": "", "completedAtUtc": "", "durationMs": 0 },
  "data":    {},
  "errors":  [],
  "meta":    { "ts": "" } }
```

`core/contracts.js` unwraps exactly this. A flow answering a different shape has to be
special-cased in the client, which is how one-off shapes accumulate.

A collection may sit at the top level beside `data` — `Fetch_Tasks` returns `tasks`, and
`core/data-loader.js#parseFetchAll` reads collections by alias. **Adding one is within the
standard. Replacing the envelope is not.**

## Redaction, which this estate got right first

`Compose_Redacted_Headers` blanks `Authorization`, `Cookie`, `x-api-key` and
`Ocp-Apim-Subscription-Key`. `Compose_Redacted_Queries` blanks `sig` **and `code`**.

Blanking `code` is the one that deserves notice: a one-time password in a captured query string
is a credential for as long as it is unconsumed, and it would otherwise be written into
telemetry on every verification call. `scripts/redact-signed-urls.ps1` did not cover `code`
until this standard was written down; it does now.

Without this, the observability harness becomes the leak.

## The telemetry record, and where it goes

`Compose_Flow_Run_Record` builds a versioned record — `capture_version` 2.0.0, with
`capture_metadata`, `workflow_identity`, `run_identity`, `trigger_record`, `request`,
`design_definition`, `response_record`, `outcome`, `timing` — and carries a draft-07 JSON Schema
for it in the same scope.

`Send_Telemetry_Email` ships four attachments:

```
<Flow>__<RunId>__flow_run_record.json
<Flow>__<RunId>__trigger_input_schema.json
<Flow>__<RunId>__full_definition.json
<Flow>__<RunId>__varResponse.json
```

**That is where the corpus in `docs/reference/foundational/flows/definitions/` came from.** Those
files are captured attachments; their names are this convention. The two definitions recovered
from deleted git history were attachments too.

Email is not a place you can ask a question of, which is what `Portal Flow Telemetry` was
provisioned to fix — see [`DECISIONS.md` § D2](./DECISIONS.md), where the original reasoning was
corrected once this standard was read.

---

## How this is held

`node scripts/verify-flow-standard.mjs` measures conformance. It does **not** enforce it, and is
deliberately not in `npm test`: a standard applied retroactively as a gate turns every legacy
flow red on the day it is written, and a suite that is expected to be red teaches people to
ignore it.

The number is the instrument. Each remediation visit should move it, and a new flow that ignores
the standard shows up as the number failing to move rather than as a discovery someone makes a
year later.

Every remediation artifact now carries a `buildStandard` block naming where its actions belong
in the skeleton, so an operator adding a rate-limit triad knows it goes inside
`Scope_<Purpose>`, and the telemetry create goes in `Scope_Flow_Data_Capture` rather than on the
request path.
