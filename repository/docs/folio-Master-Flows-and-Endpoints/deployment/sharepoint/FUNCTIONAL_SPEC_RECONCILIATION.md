# The functional specification, against what the flows actually do

`NITDA_Document_Portal_Functional_Documentation` v3.0 (review date 20 August 2026, prepared from
34 embedded source artifacts, document id `PLAT-001-DOC-001`) specifies the portal from the
client side: seven integration contracts, a role matrix, a status and transition catalogue, a
business-rules catalogue and a gaps register.

This page reconciles its seven integration contracts against the flow-side work in this
repository. It exists because the two are halves of one thing and were produced separately —
and because the specification's own `GAP-002` is exactly what this repository now answers.

> **GAP-002 · Critical · Open** — *"Server-side flow implementations and tests. Client contract
> cannot prove server validation, authorization, rate limits, audit or recovery."*

The flow definitions, `npm run wiring`, the build standard and D8's rate limits are that
evidence. GAP-002 is closable against this repository; the rest of this page is what it takes.

---

## The seven contracts

| | Contract | Specified control | State |
|---|---|---|---|
| INT-001 | SUBMISSION | validate all fields, rate-limit, public category, **mint reference** | visit 2 |
| INT-002 | UPLOAD | single-use ticket, **size and SHA-256 match** | visit 5 — see below |
| INT-003 | SUPPORT | validate and rate-limit, **never registry** | visit 5 |
| INT-004 | VERIFY | rate-limit per address **and** source, **honest `sent:false`** | visit 1 — see below |
| INT-005 | VERIFY_CONFIRM | **constant-time compare**, expire, single-use | visit 1 — see below |
| INT-006 | STATUS | one denial, allow-listed public projection, **byte-identical 404** | visit 3 — see below |
| INT-007 | **WRITEBACK** | citizen respond / note / withdraw; appends timeline; only withdrawal changes status | **nothing** |

---

## INT-007 · WRITEBACK does not exist on this side at all

The specification lists seven deploy-time endpoint keys. `document-portal/config.example.js` in
this repository declares **six**:

```
STATUS  SUBMISSION  SUPPORT  UPLOAD  VERIFY  VERIFY_CONFIRM
```

There is no `WRITEBACK`. It is absent from `portal-wiring.json`, so it contributes none of the 49
required operations; no deployed flow serves it; no remediation visit covers it; and it appears
in no decision D1–D10.

What the specification says it does:

> Verified users may respond, add a note or withdraw. Writes append to the timeline; only
> withdrawal may change status. Unavailable writes are queued where supported.

Two things follow.

**This is the citizen half of a circle whose staff half is visit 4.** `PORTAL_CIRCLES.md`'s C7 is
the *staff* write-back — `ECM_DOCS_INTAKE` patching a registry row so a status can advance.
INT-007 is the *citizen* write-back, appending to the same `Portal Status Timeline`. They are
different directions through one list, and only one of them is specified here.

**It is a plausible owner for `Portal Audit Events`.** That list is provisioned, and
`npm run wiring` reports it as the one portal list with no reader or writer in the design. A
citizen-initiated write that may withdraw a submission is exactly the kind of act that needs an
audit row. This is a hypothesis, not a finding — it is recorded so the question is asked rather
than the list quietly left unused.

**Consequence for the target number — now settled.** The sponsor decided WRITEBACK is in scope,
recorded as [D11](./DECISIONS.md). The target is **59 operations across seven endpoints**, and
`Portal Audit Events` — previously the one provisioned portal list with no writer — now has one.
The five remediation visits are unchanged: WRITEBACK is a flow none of them touches, so it is a
sixth piece of work rather than a change to the existing five.

---

## Four specified controls the remediation does not implement

Each of these confirms a finding already recorded in
[`PORTAL_CLIENT_FINDINGS.md`](./PORTAL_CLIENT_FINDINGS.md) — and upgrades it. What was observed
there as *behaviour a citizen sees* is here a **specified control that is not met**.

### INT-006 · "Byte-identical 404"

The specification requires a uniform denial: the same response whether a reference does not exist
or exists and is not yours. The live probe found STATUS answering **200** with an empty record,
which the client renders as "successfully found".

Visit 3 gives STATUS a `$filter`. **No artifact says what it returns when the filter matches
nothing.** Until it does, the filter makes the query correct and leaves the denial failing open.

### INT-004 · "Honest `sent:false`"

The specification requires the response to state truthfully whether the mail went. The live
response omits `sent` entirely, and the client's strict `=== true` test turns absence into
failure — a citizen is told the code could not be sent after it was.

Visit 1 rebuilds VERIFY's estate, rate limit and telemetry. **Nothing in it makes the response
carry `sent`.**

### INT-005 · "Constant-time compare"

D9 adds the code comparison the flow has never had. It uses Workflow Definition Language's
`equals()`, which is **not constant-time** and cannot be made so — WDL has no bitwise operators,
which is the same limitation SC-003 records for hashing.

This is stated rather than quietly ignored: the specified control is not achievable in the
platform the flow runs on. The compensating controls are the ones SC-003 already names — short
expiry, single use, and the attempt cap D9 makes real. **The claim "constant-time" should not be
made anywhere.**

### INT-002 · "Size and SHA-256 match"

Visits 2 and 5 create and redeem the single-use upload ticket. **Neither verifies the digest
against the bytes.** The client computes SHA-256; nothing on the flow side compares it.

---

## What each side is authoritative for

| | Authoritative for |
|---|---|
| The functional specification | What the portal must do, seen by a citizen — screens, rules, states, transitions, roles, and the seven contracts |
| This repository | What the flows and the SharePoint estate actually do — definitions, provisioned columns, wiring, boundary, build standard |

Neither supersedes the other. Where they disagree, the disagreement is a defect in one of them,
and the four above are defects on this side.

> **Superseded by [D12](./DECISIONS.md#d12--the-closure-package-is-discarded--document-portal-is-the-platform), 2026-08-21.**
> The closure package is discarded — not deployed, and no longer a reference for what the portal
> should do. `document-portal/` is the platform. The comparison below is kept as the record of
> the analysis that led to that decision, not as a live choice between two builds.
>
> One correction to the record itself, independent of discarding it: describing the package as
> "a single-page build" undersold what it was. It is a fuller snapshot of a platform version,
> assembled for a specific prior purpose, and capable of regenerating that version's full
> package — not merely an alternate front-end reachable through the same six endpoints. That
> correction does not change anything decided here; it only means the paragraph below described
> the artifact more narrowly than it deserved.

**The two builds, as they stood.** The closure package `Document_Portal_Closure_decoded` was
supplied and read directly. Read as a portal client, it presented as a single-page build —
`index.html` (169 KB) plus `support.js` (69 KB), with the design system under `_ds/`.
`document-portal/` here is a multi-file build — a 13 KB `index.html` shell plus `js/*.js`
(172 KB) against separate page files. Comparable in scale, different in packaging. Three things
were certain rather than cautioned:

| | |
|---|---|
| **Both declare the same six endpoint keys** | `SUBMISSION` `UPLOAD` `SUPPORT` `VERIFY` `VERIFY_CONFIRM` `STATUS`. Neither has a `WRITEBACK` key. The specification's seventh contract is configured in **neither** build. |
| **The closure build implements write-back; this one does not** | `submitWb` and `writeback` appear in the closure `index.html` and nowhere in `document-portal/`. So INT-007 is **built client-side and never provisioned** — it reads a `WRITEBACK` key that no configuration file defines. |
| **The specification's central caveat is wrong for this package** | It records "all deployment endpoint values are blank" and downgrades its own confidence to medium on that basis. The package's `config.local.js` is live-provisioned, and its `FLOW_CATALOGUE.json` declares `posture: "live"`, `availableFlowCount: 6`, `unwiredFlowCount: 0`, built `2026-08-17T06:12:52Z`. Either the document was prepared from a sanitised copy, or the caveat was carried over from an earlier baseline. |

### The six portal workflow ids, now known

`FLOW_CATALOGUE.json` in that package carries a 32-hex workflow id per endpoint. This is the
information the execution guide asked for as task 13, and it arrived this way instead.

| Endpoint | Workflow id | Transport | Action |
|---|---|---|---|
| SUBMISSION | `328ab35dc3c74c15adb8fb0ce6b56d28` | json | CREATE |
| UPLOAD | `a29984c63f6444748565733205b62eb4` | bytes | raw PUT |
| SUPPORT | `8f948e0a298b493b8c56fae2b37397bf` | json | CREATESUPPORTREQUEST |
| VERIFY | `ee627334d2e34ba7ac1b899bdb3ff2d0` | json | otpGenerate |
| VERIFY_CONFIRM | `cc655f80d5be4b8ba022e233f812fdbf` | json | otpVerify |
| STATUS | `737169fb0114462e9ea24ee2402da0ef` | json | TRACK |

**None of the six appears in any of the 57 exported definitions, or in the flow register.**

That is not evidence that they are different flows. The exporter records a flow's `internal_name`
— the dashed GUID — and leaves `full_resource_id` null, so an export carries no 32-hex trigger id
to match against. Absence here means the two identifier schemes have never been joined, not that
the flows differ.

**It does mean the endpoint-to-flow attribution is still unproven.** Three endpoints have more
than one candidate flow — SUBMISSION has two, UPLOAD has three, STATUS has two — and
`portal-wiring.json` reads all of them because nothing settled which is live. These ids settle it,
once joined.

**How to join them, in about ten minutes.** In the Power Automate designer, open each `Portal_*`
flow, expand its HTTP request trigger, and read the `workflows/<32-hex>/triggers/manual` segment
of the URL. The flow whose segment is `328ab35d…` is the live SUBMISSION endpoint; the other
candidate is not. Record the pairs in `internal-flow-register.json`. **Send the ids only — never
the whole URL**, for the reason below.

---

## The package carries live credentials

`config.local.js` in the supplied package contains all six trigger URLs **complete with their
`sig=` tokens**. A signed Power Automate trigger URL is a bearer credential: anyone holding it can
invoke that endpoint directly, and these are the public portal's own endpoints — submission,
upload, support, OTP generate, OTP verify and status.

That file has **not** been committed to this repository and must not be. The workflow ids above
are safe to record and are recorded; the `sig` tokens are not, and appear nowhere in this
repository.

The portal necessarily ships these URLs to every browser that loads it, so they are not secret in
deployment — which is precisely why the package's own header says each flow "must validate input,
rate-limit callers, authorise records server-side, and return only the allow-listed projection".
**Today none of the six does any of that**, which is what D8's rate limits, D9's comparison and
INT-006's denial exist to fix. Until they do, the signed URLs are the only thing standing between
an anonymous caller and the registry, and they are printed in the page source.

Treat the uploaded archive as sensitive: do not attach it to tickets, and if it has been shared
onward, the six trigger URLs should be regenerated.
