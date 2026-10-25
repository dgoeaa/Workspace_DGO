# Open items

Every item still open at session close, with who owns it and what closes it.
Nothing here is a vague follow-up: each row names the action and the evidence that it is done.

> ## How to read this file — it is not the register
>
> **[`../../../deployment/PRODUCTION_READINESS_REGISTER.json`](../../../deployment/PRODUCTION_READINESS_REGISTER.json) is the
> authority on what is open.** This file is where the findings were first written down and
> worked; the register is where their status now lives, and [`PLAN.md`](../../../deployment/PLAN.md) is
> generated from it. Read that for the current position. Read this one for how a finding was
> arrived at. Until 2026-09-24 three documents were generated from the register —
> `ACTION_PLAN.md`, `EXECUTION_RUNBOOK.md` and `IMPLEMENTATION_WALKTHROUGH.md` — which is why
> some records still cite them by name; `PLAN.md` replaced all three.
>
> **The tables below are held to the register by `npm run test:closure`.** On 2026-09-14 ten of
> them were not: items 3, 4, 7, 8, 17, 18, 22, 34, 38 and 39 were presented here as outstanding
> after the register had closed them, and item 37 was struck here as withdrawn while the register
> carried the decision it left behind as open. Each of those rows now states the register id and
> its status. The gate fails the build if any of them drifts again.
>
> **The dated sections between here and *Blocking* are a record of the session that wrote them,
> and are left as written.** Their tables describe what was true on their own date — the
> 2026-08-31 entry saying no `ALLOWED_ORIGIN` row had been added is a correct statement about
> 2026-08-31 and is not a claim about today. The gate does not hold them to the register for that
> reason. Nothing in a dated section should be read as current state; the register is current
> state.

---

## 2026-08-31 — the last two paste targets exported, and what that export revealed

`5e13db77-…` and `21d4bfd3-…` were exported from the tenant. Both resolve to exactly the flow the
2026-08-27 run records name — `CG_Verification_Confirmation_Endpoint` and `CG_Writeback_Endpoint` —
and neither id appears anywhere else in `deployed/`, so both are flows this repository had never
captured rather than renames of ones it had. **Item 35 closes.** All seven packages now name a
target id confirmed present, and the repository can finally check those two flows rather than only
name them.

**What that immediately bought.** `npm run wiring` moves from **7/59 operations, 0 endpoints
wired** to **24/59, 3 of 7 wired** — VERIFY_CONFIRM 7/7, WRITEBACK 10/10, UPLOAD 7/7. Nothing was
fixed to achieve that; the operations were always in place and the repository simply could not see
them. The remaining four read PARTIAL **0/x** for one reason only: `not exported`.

**New — item 36, and it is not small.** See the row in *Blocking* below.

**Adopted.** `Flow Configuration` is now `adopted: true` with role `Platform configuration` in the
list index. It was marked unadopted while the field specification provisioned a column on it and a
deployed endpoint read it, which is a contradiction the index should not carry. Adopted totals
33 → 34.

**Verified, not assumed.** The seven `NITDA_Portal_*` names the sweep cannot resolve are
byte-identical to what the map held before this export. They belong to the superseded v1.0
artifacts and were not caused by anything in this session.

---

## 2026-08-31 — the first provisioning run against the tenant since 19 August, and its verification

`scripts/provision-sharepoint-fields.browser.js` was run in an operator browser session against
`nitdanigeria.sharepoint.com`. Record: [`evidence/2026-08-31-provisioning-run.json`](../../evidence/2026-08-31-provisioning-run.json).

    Created: 2   Already present: 97   Failed: 0
    Estate complete: 99/99 columns present.
    Indexing 5 filtered column(s)
    Indexes set: 3   Already indexed: 2   Failed: 0

**Provisioned.** `Portal Flow Telemetry.RunRecordJson` and `Flow Configuration.ConfigValue` — the
two columns declared after the 2026-08-19 run. Both now exist in the tenant. Neither is flipped
out of `PENDING` in the specification: `capturedState` records what the 2026-08-14 capture found,
and rewriting it would destroy the only record of what the estate started from. Each field
instead carries `provisionedBy`, pointing at the run whose ledger is the evidence.

**Indexed.** `Portal Rate Limits.Title`, `Portal Verification Proofs.Title` and
`Portal Support Cases.Title` were set. All five declared targets have a recorded outcome.

**Corrected — items 31 and 33.** Both assert that `Global Tracking Queue.RefIDD` and
`DGO DIGITAL OPS.RefIDD` "was not indexed", and item 31 draws a production consequence from it:
"the filter fails rather than slows and a known reference answers 404". The provisioner reads each
field's `Indexed` property before acting and reported **both as already indexed**. No file in this
repository was ever a source for the claim — `sharepoint-list-index.json` records lists, not
fields, and carries no `Indexed` property for any column; `index-targets.json` states the
requirement, not a measurement. The assertion is withdrawn. The requirement stands and is met.
Whether they were always indexed or were indexed by someone between the 2026-08-18 capture and
this run is **not established**, and nothing depends on which it is.

**Not closed by this run, and why.**

**Verified.** A second pass was run in the same session with `DRY_RUN` left true:

    Indexes: 0 to set, 5 already indexed, 0 unreadable.
    DRY RUN: 0 to create, 99 already present, 0 unreachable.

It wrote nothing, which makes it a stricter verification than an apply-mode second run rather than
a weaker one: verification is a read, this pass read every column and every index target against
the live tenant, and a pass that *cannot* write cannot mask an incomplete estate by quietly
finishing the job while reporting on it. 99/99 no longer rests on the apply pass's own arithmetic,
and the three `Title` indexes set minutes earlier are confirmed against the tenant rather than
merely reported as set.

**Closed — item 34.** The agency decided to keep `Flow Configuration` as the list the allowed
origins are read from. Recorded as [**D15**](./DECISIONS.md), with what was known when it was
taken, why a rebuild of fourteen packages was not worth provenance for a value that is public by
nature, and the one thing it explicitly does not license: no secret goes in that list.

| Item | State after the run | What still closes it |
|---|---|---|
| **23** | Index requirement **met and verified** — 5 already indexed | One assignment and one flag write against a known reference returning 200 |
| **30** | Column exists | The specification still marks it `PENDING`, so the generator still strips the write; rebuild, then one live run carrying a run record |
| **8** | Column exists, and D15 ratifies the list it sits on | No `ALLOWED_ORIGIN` row has been added, so no browser can read a response yet |
| **31**, **33** | Requirement met and verified | Live-traffic checks, unchanged |

---

## 2026-08-31 — closures, and two numbers that were wrong

**Closed.** Item **1** (the wiring baseline, re-derived — 59 is right, and 7/59 is a measurement
floor set by six unexported flows, not 52 missing operations). The **repository half of item 22**
(all fifteen packages blank the two gateway headers that carry the trigger URL, now enforced by
`npm run designerpaste` check 9b). **F-020** in `docs/STATUS_REPORT.md` (the RBAC route table was
decorative for five of six roles, not the two the finding recorded). The stale **process
inventory** — closed by fixing the staleness check itself, which compared a date stamp and so
failed every day after the one it was written on, crying wolf daily where a real drift would have
looked identical.

**Narrowed.** Item **35** from all seven paste targets unknown to **two**, resolved out of the
export set already in this repository rather than out of the tenant. Item **4** to operator-only.

**Corrected, not closed.** Item **9** said 17 of 57 flows have no stated purpose; the generated
catalogue says **27 of 58**. Item **1**'s "8/59 finish line" was arithmetic that never held.
Item **25** said the lists behind the fifteen 501s have no column evidence and asked for a tenant
capture; the capture was possible from here, and it shows **6 of the 15 fully evidenced, 3 blocked
on exactly three named columns, and 3 that have no SharePoint target at all** and can never be
unblocked by a column capture.

**A latent trap, removed.** `internal-field-evidence.json` recorded `RoutedToDSU` against the
Global Tracking Queue. The estate writes that column only to DGO DIGITAL OPS; on the queue it is
a projection key, not a column. That file is the gate deciding whether a package may write
`item/<Column>`, and the designer refuses a flow at save time for a column the list does not
have — so this licensed an unpasteable package. No package wrote it, so nothing had failed yet.
`npm run test:listcolumns` now fails if any column recorded as `deployed` is not attested by an
exported action against that same list.

**No longer true.** `test:smoke` does run in this container — see the accepted-items table.

**Three over-claims found and corrected, and the class now guarded.** `EXECUTION_GUIDE`
Appendix B's first three standing constraints are about *speech* — do not claim the code compare
is constant-time, do not claim codes are hashed, do not claim the upload digest is verified —
and nothing enforced them. Written as a test, they immediately found: an instruction to
"constant-time compare" in `FLOW-BUILD-PLAN.md` that item 19's seven-document sweep missed;
`LOCAL-DEV.md` stating the dev server verifies declared size and SHA-256 against arriving bytes,
which it does not (it caps the body and computes no digest); and `DOCUMENT_PORTAL_FLOWS.md`
crediting the upload design's step 7 with checking the checksum. All three corrected.
`npm run test:claims` guards them, and each rule is mutation-tested against the sentence it
exists to reject.

**Two inline-code actions in the design files do not work, and one is item 18's precedent.**
`Verify_Upload_Checksum` (`02-portal-upload`) and `Hash_And_Compare_Code`
(`05-portal-verify-confirm`) both interpolate the value they compute and forget to interpolate
the value they compare it against — `var declared = "first(outputs(…))"` with no `@{…}` — so
`match` is always false and every correct input would be refused. Both are also typed
`"Javascript"`, which is not a Power Automate action type. Nothing deployed runs either; no
inline-code action of any spelling appears in the 58 exports, established by enumerating every
action type rather than grepping one string. Recorded in `DOCUMENT_PORTAL_FLOWS.md` §2.3 and
§5.2 so nobody ports them, and item 18 no longer describes them as a working precedent.

Everything else below stands. Nothing that needs the tenant was closed from here, and nothing was
marked done on the strength of an artifact existing rather than being applied.

**Closed this session:** visit 4's placements, and the specification question behind visits 3
and 5 — see [D10](./DECISIONS.md). Both were the author's to close and are closed.

**Closed 2026-08-21:** items 14, 15 and 16 — the three client-only findings in
[`PORTAL_CLIENT_FINDINGS.md`](./PORTAL_CLIENT_FINDINGS.md) that no remediation visit touches.
All three were self-contained `document-portal/js/` fixes with no design decision pending, so
they were closed directly rather than left for a visit. `tests/hardening.test.mjs` and
`tests/packaging.test.mjs` pass unchanged.

**Also closed 2026-08-21:** item 20 — B1 — see
[D12](./DECISIONS.md#d12--the-closure-package-is-discarded--document-portal-is-the-platform).
The closure package is discarded; `document-portal/` is the platform. `portal-data-contract.json`
and `portal-wiring.json` are updated and `PORTAL_DATA_CONTRACT.md` regenerated to match.

**Also closed 2026-08-21:** item 10 — see
[D13](./DECISIONS.md#d13--writeback-is-fully-provisioned--the-portal-audit-events-row-is-no-longer-proposed).
`WRITEBACK` is fully provisioned; the `Portal Audit Events` write is required, not `PROPOSED`,
and D2's reservation of that list is narrowed to the six public endpoints it was actually about.

---

## Blocking — nothing else moves until these do

| # | Item | Owner | What closes it |
|---|---|---|---|
| ~~**35**~~ | ~~**Two paste targets are unconfirmed.**~~ | operator | ✅ **Closed 2026-08-31.** Both ids were exported from the tenant and resolve to exactly the flow the 2026-08-27 run records name — `5e13db77-…` is `CG_Verification_Confirmation_Endpoint`, `21d4bfd3-…` is `CG_Writeback_Endpoint`. Neither id appears anywhere else in `deployed/`, so **both are flows never previously captured, not renames**. All seven packages now name a target id confirmed present. `npm run wiring` moved 7/59 → **24/59**, 0 → **3 of 7** endpoints wired, by evidence arriving rather than anything being fixed. |
| ~~**36**~~ | ~~**A public portal endpoint reads the internal operations estate.**~~ | agency + author | ✅ **Closed 2026-08-31 — accepted, recorded as [D16](./DECISIONS.md).** The deployed `CG_Writeback_Endpoint`, invoked by anonymous callers, reads `Flow Configuration` on the internal operations site for its allowed CORS origins, against this estate's own principle. Accepted for **all seven** portal endpoints, since all seven packages read the same list for the same value. **The principle is not amended** — it stands as written, and this is its one named exception. Accepted because the value is public by nature (an allowed origin is a scheme and host every response already announces), nothing from the read reaches the caller, the read fails closed, and the deployed endpoint already does it in production — so declining would have left six endpoints on older behaviour while the seventh kept crossing. **Bounded to one list, one operation, one column:** any other list, any write, or any read whose target a caller can influence is not covered and reopens it; no secret ever goes in that list. **Not settled:** whether the portal flows' SharePoint connection should be scoped to the portal estate rather than the whole site — that is the general form of this problem and D16 does not endorse the connection's breadth. The two guards that let this hide are closed: the test measures the deployed definitions, not just the specification, and an accepted crossing must cite a decision record that exists and state what would reverse it. |
| ~~**1**~~ | ~~**The wiring count is not what this item predicted.**~~ | author | ✅ **Closed 2026-08-31.** Re-derived from `portal-wiring.json` as the item asked. **59 is right and internally consistent** — the per-endpoint `requiredOperations` arrays sum to exactly the 59 in `totals`, so the 8/59 finish line written here was simply wrong arithmetic, not a regression. **No operation can be shown genuinely absent.** `npm run wiring` reads 7/59 because six of the seven candidate flows have no export to read: only `CG_Upload_Endpoint` is in `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`, which is why UPLOAD is the sole endpoint reported fully wired, at 7/7. The 7/59 is a **measurement floor set by missing evidence, not a wiring state** — and it cannot rise until the live flows are exported, which is item 35's two lookups plus a re-export of the five now-identified targets. |
| ~~**37**~~ | ~~**The sanctioned crossing does not perform its read in the flow's live export.** ⚠️ **The measurement was withdrawn 2026-09-03; the decision it left behind is open as register `ITEM-37`, DECISION_REQUIRED.** Striking this row entirely read as "nothing outstanding", which is wrong: what was withdrawn is the *finding* that the crossing had been rebuilt away. What is open is whether the intake feed `portal-wiring.json` calls the single sanctioned crossing should be restored, and where — D1 and D6 both rest on a crossing that is not there, and only the agency can take that decision. **Withdrawn finding, as recorded on 2026-09-03:** `ECM_DOCS_INTAKE` is present at `df7ddff1-9275-4f23-acf6-e169525f4e2f` and performs its `Portal Registry` read; `npm run wiring` measures the crossing in place. The file `CG_Upload_Endpoint__df7ddff1-…__full_definition.json` carried **CG_Upload_Endpoint's definition stamped with ECM_DOCS_INTAKE's workflow id**, so every reader that grouped by workflow identity saw one workflow exported twice and concluded it had been rebuilt in place. A legacy export package taken from the tenant on 2026-09-03 gives CG_Upload_Endpoint's own resource id as `df82e331-b800-4a8d-996e-d2b2ca846c77`; the two definitions share 8 of 9 top-level actions, ECM_DOCS_INTAKE's shares none. Two flows, one bad id stamp. The corrupted file is removed, superseded by the fresh export. D1 and D6 stand.~~ | agency | ✅ **Closed 2026-10-07 (register ITEM-37 RESOLVED).** The owner's Final Closure Decisions: D1 and D6 stand as written; no change request. |
| ~~**38**~~ | **The OTP verify hardening exists on disk only — the live flow still carries all five defects.** `Web - OTP Verify` (`3e201620-f1e8-4c17-a90a-4d95b94a24c2`) has an **authentication bypass** (the code lookup ignored the caller's identity, so a code issued to one person verified anyone), an **OData injection** under it (a crafted code rewrites the filter and strips the identity binding back off), an ordering fault that would have made the binding fail at runtime on every call, **no attempt cap** against six digits, and an **open mail relay** on the agency's Office 365 connection (`Scope_VERIFY_Complete_No_Trigger` ran on every request). All five are closed in `otp-verify-patched-definition.json`, which is a **complete workflow definition, not a patch** — 65 actions before, 59 after, trigger byte-identical so the flow keeps its URL, id, owners, connections and run history. No evidence record in `evidence/` names it as applied. | operator | ✅ **Closed — register `ITEM-38` is RESOLVED.** The hardening is deployed — built by hand from the designer-paste kit as IP_OTP_VERIFY, and the operator's export proves it action by action. It is a NEW flow, so ITEM-43 carries the portal still calling the defective one. *Previously recorded here as what would close it:* Provision `Attempts` (item 39), then apply the complete definition to `3e201620-…`. Done when a fresh export compared with `npm run compare:export` reports zero differences, a code presented by a caller it was not issued to is refused, and five wrong guesses return 429. |
| ~~**39**~~ | **`OTP_Transactions.Attempts` is unprovisioned.** The attempt cap counts a guess *before* the code is checked, which needs a numeric `Attempts` column on `OTP_Transactions` (`9421d473-8906-43b7-a41f-a213046683c1`). Until 2026-09-02 that list was in **no** specification, so the column sat outside `portal-field-spec.json`, outside its provisioning ledger and outside `npm run test:sharepoint`, and was to be created by a bespoke one-off browser script. It is now declared in the specification, so the sanctioned provisioner creates it and the ledger accounts for it like every other column; the one-off script is deleted. | operator | ✅ **Closed — register `ITEM-39` is RESOLVED.** The provisioner created Attempts on 2026-09-03 and the specification names the run record in provisionedBy. *Previously recorded here as what would close it:* One run of `scripts/provision-sharepoint-fields.browser.js`, recorded in `evidence/`. **It must run BEFORE the flow is saved** — the designer validates every `item/<Column>` against the connector operation at save time and refuses the whole flow with `WorkflowOperationParametersExtraParameter`. |
| ~~**40**~~ | ~~**Thirteen of the fourteen triggers are unverified, and the fourteenth answers any verb.**~~ | operator | ✅ **Closed 2026-10-08.** All ten flows changed on 2026-10-07 (POST and a request schema) answered live calls as designed (register ITEM-40; `evidence/2026-10-08-closure-operations.json`, `item40_liveCalls`). |
| ~~**41**~~ | ~~**Content approval is still ON for `Global Tracking Queue` — 12,079 of 15,936 rows are invisible to readers.** Measured 2026-09-01 by a complete tally (the state totals equal the list's own `ItemCount`, so no page was dropped). Four of the seven internal flows write here, so rows they create land Pending and invisible the moment they are written. `DGO DIGITAL OPS` carried the same setting, 14,882 of 21,532 hidden, and was turned off on agency direction and confirmed by read-back. This list was deliberately not changed: it carries its own decision and the script will not make it by implication.~~ | agency | ✅ **Closed 2026-10-07 (register ITEM-41 RESOLVED).** Content approval turned off on Global Tracking Queue by SharePoint REST; read-back `EnableModeration: false` ([evidence](../../evidence/2026-10-07-item41-sharepoint.json)). |
| ~~**2**~~ | ~~**`update-flow-definition.ps1` has never run against the tenant.** The entire remaining approach depends on it.~~ | operator | ✅ **Closed 2026-10-07.** `npm run flows:update -- apply` wrote 17 identification packages into their live flows through the Flow API and read each back; an independent read afterwards gives release 1 for each ([evidence](../../evidence/2026-10-07-flows-apply.json), [live read](../../evidence/2026-10-07-live-fingerprints.json)). Register ITEM-2 RESOLVED. The dry run in `remediation/patched/README.md` (retired 2026-10-05: [flow-retirement.json](../../registers/flow-retirement.json)). It sends nothing. Done when it prints the flow name and action count without error. |

**What the wiring number means, now that item 1 has been re-derived.** `7/59` is not "52
operations are missing". It is "we can only see one flow". Six of the seven live flows have never
been exported into this repository, so the sweep has nothing to measure them against and counts
their operations as absent. Treat any figure below 59 as a statement about the evidence, not
about the estate, until every target flow is exported.

---

## Sequenced work

**Items 2–6 belong to the patch track,** which edits a deployed flow in place through `update-flow-definition.ps1`
and the `remediation/*.json` placement files. The paste track that replaced portal flow bodies wholesale from
fourteen `Portal_*_ECM_DOCS` packages was retired on 2026-10-06
([`registers/flow-retirement.json`](../../registers/flow-retirement.json)); the adopted portal flows are now changed by
the identification packages in [`packages/identification-phase3/`](../../packages/identification-phase3/README.md).
Nothing below is closed by a package existing — the flows still have to be changed in the tenant.

| # | Item | Owner | What closes it |
|---|---|---|---|
| ~~**3**~~ | Apply `Portal_Verify_Confirm`. Patched and verified at **7/7 on disk**; the file is in the repository. | operator | ✅ **Closed — register `ITEM-3` is RESOLVED.** Applied and evidenced by the reconciled wiring; the patch no longer exists only on disk. *Previously recorded here as what would close it:* `-Apply`, then re-export and sweep. Done at **15/49, 2/6, crossings 12**. |
| ~~**4**~~ | **Visit 2** — the two submission flows. Bodies do the right job; this is insertion. **The author half is not outstanding**: `02-submission-registry-write.json` carries 13 actions, names both submission flow ids in `appliesTo` (`270fb295` and `de9ef13b`), and passes `npm run test:remediation` — checked 2026-08-31. Note also that the paste track supersedes this artifact for SUBMISSION, since `Portal_SUBMISSION_ECM_DOCS.designer-paste.json` exists; apply whichever route the operator takes, not both. | operator | ✅ **Closed — register `ITEM-4` is RESOLVED.** The route was chosen and applied; the reconciled wiring reflects it. *Previously recorded here as what would close it:* Patched, verified, applied — or the package pasted on `de9ef13b` per §5.2. |
| ~~**5**~~ | ~~Visits 3 and 5 — blocked on design.~~ Control flow approved 2026-08-21, and the artifacts now implement it: trigger fields reconciled, proof consumption reordered per Directive A, ownership filter on the indexed `ReferenceId`, projection matched to the contract's closed allow-list. | operator | ✅ **Specification closed 2026-08-21.** What remains is applying them — patch, verify, apply, re-export, per `EXECUTION.md`. |
| ~~**6**~~ | ~~**Visit 4** — `ECM_DOCS_INTAKE` write-back.~~ | operator | ✅ **Closed 2026-10-08.** The write-back is a branch on `IP_SCAN_INTAKE` (ITEM-86: no `ECM_DOCS_INTAKE` flow exists). Proven live from Folio: NITDA-2026-00018 set to review, the Portal Registry row and Portal Status Timeline row 19 written, and the portal's Track read returns it. Circle C7 closes (register ITEM-6; `evidence/2026-10-08-closure-operations.json`, `item6_writebackLive`). |

---

## Citizen-visible behaviour — three findings no visit answers, three closed client-side

From the live-tenant probe of 2026-08-08, reconciled in
[`PORTAL_CLIENT_FINDINGS.md`](./PORTAL_CLIENT_FINDINGS.md). **Four of seven are answered.**
Items 14–16 were client-only and are closed. The three below are flow-side or contract-side —
no visit touches them, and none has an artifact yet.

| # | Item | Owner | What closes it |
|---|---|---|---|
| ~~**11**~~ | ~~**An unknown reference is answered 200 and rendered as "found".**~~ | operator | ✅ **Closed 2026-10-08.** An unknown reference and a wrong-e-mail pairing each answer the same 404 `not_found`, and `track.js` renders it as one denial (register ITEM-11; `item11_statusDenial`). |
| ~~**12**~~ | ~~**A submission reports delivered while its attachments are never sent.**~~ | operator | ✅ **Closed 2026-10-08.** Portal Attachments row 1 holds NITDA-2026-00015's attachment, Status Stored (register ITEM-12; `item12_attachmentRow`). |
| ~~**13**~~ | ~~VERIFY answers 200 without `sent`~~, so a citizen was told "Could not send the code" after a code was sent. | operator | ✅ **Specified 2026-08-21.** `Portal_VERIFY_ECM_DOCS.designer-paste.json` sets `sent` from `actions('Send_Otp_Email')?['status']`, so it is true when and only when the mail action succeeded. Closes on paste. |
| ~~**14**~~ | ~~`stored: false` is recorded as a successful upload~~ — `uploadAll()` reads only `r.ok`. | client — `submit.js` | ✅ **Closed 2026-08-21.** Checks `r.stored` alongside `r.ok`. |
| ~~**15**~~ | ~~The support case reference shown to the citizen is generated locally~~ and never reconciled with the flow's `caseRef`; `send()` had no `.then()`. | client — `support.js` | ✅ **Closed 2026-08-21.** Awaits the response and adopts `caseRef` when delivered. |
| ~~**16**~~ | ~~`verification_required` is queued like any other failure~~ and never retried, though `track.js` does exactly that retry for STATUS. | client — `submit.js` | ✅ **Closed 2026-08-21.** `dispatchToWorkflow()` branches on the reason and runs the same verify round-trip `track.js` carries. |

**`npm run wiring` reading 59/59 is not the finish line.** It is the point at which the estate is
correct. These six are why the end-to-end pass is a separate step and is checked against
citizen-visible outcomes rather than against the wiring count.

---

## Against the functional specification

`NITDA_Document_Portal_Functional_Documentation` v3.0 specifies **seven** integration contracts.
Reconciled in [`FUNCTIONAL_SPEC_RECONCILIATION.md`](./FUNCTIONAL_SPEC_RECONCILIATION.md).

| # | Item | Owner | What closes it |
|---|---|---|---|
| ~~**17**~~ | **WRITEBACK is in scope — D11 decided.** Two of its three parts are **done**: the client is built (`PF.intake.writeback()` plus track.js's respond/note/withdraw, browser-verified), and the flow is specified in `06-writeback-citizen-actions.json` (retired 2026-10-05: [flow-retirement.json](../../registers/flow-retirement.json)) covering all ten operations. | operator | ✅ **Closed — register `ITEM-17` is RESOLVED.** WRITEBACK had a client and a specification but no wired flow; the reconciliation wired it. *Previously recorded here as what would close it:* Build the flow from that artifact, provision the seventh endpoint key, and publish its URL. `config.example.js` already declares the empty slot and the UI stays dormant until it is set. Done at **59/59**. |
| ~~**18**~~ | ✅ **ACCEPTED 2026-09-03 — the tenant cannot run an inline-code action, so the digest cannot be computed in a flow at all.** Workflow Definition Language has no hash function and no bitwise operators; the operator confirmed the plan does not provide the only alternative. This is a platform constraint, not an unwritten action. What is in place instead: the client computes a real SHA-256 and it is stored as `DeclaredSha256`, so the digest is **recorded, not enforced** — it supports an out-of-band comparison later and is not an intake control, and no document may describe it as one. The size half of INT-002 is met and answers `422`. Evidence: [`evidence/2026-09-03-inline-code-unavailable.json`](../../evidence/2026-09-03-inline-code-unavailable.json). *Original finding:* **INT-002 requires the upload to verify size and SHA-256 against the bytes.** **Size is specified** — `Portal_UPLOAD_ECM_DOCS.designer-paste.json` compares `DeclaredSizeBytes` to `Content-Length` and answers `422` on a mismatch. **The digest is not.** Still unclosed and still not unachievable — but **the precedent this row rests on is weaker than it reads.** Re-checked 2026-08-31: no inline-code action appears in any of the 58 exported definitions under *either* spelling, established by enumerating every action type in the deployed estate rather than by grepping one string (`JavaScriptCode`, the string this row named, would not have matched the one worked example even if it were deployed — that example is typed `Javascript`). And that worked example, `Hash_And_Compare_Code` in `05-portal-verify-confirm.flow.json`, **is broken three ways**: its action type is `Javascript`, which Power Automate does not have; its comparison target is an uninterpolated string literal, so every correct code would be refused; and its hashing protects nothing, because six digits against a repository-public pepper is a 10⁶ search a reader of `CodeHash` finishes in under a second. So "the estate's own design specifies exactly that" is true only in the sense that someone once wrote it down. Recorded in [`DOCUMENT_PORTAL_FLOWS.md`](../../contracts/DOCUMENT_PORTAL_FLOWS.md) §4.2 and §5.2 so nobody ports it. | author | ✅ **Closed — register `ITEM-18` is ACCEPTED.** Accepted, not closed by work. The requirement stands and cannot be met on this tenant. *Previously recorded here as what would close it:* Add the inline-code checksum action — written from scratch, not ported — proven against a real upload, and confirm the licensing allows it. Until then no document may claim the digest is verified. |
| ~~**19**~~ | ~~INT-005 requires a constant-time compare.~~ WDL has no bitwise operators, so `equals()` cannot be made constant-time — the same limitation SC-003 records for hashing. | — | ✅ **Closed 2026-08-21.** Seven instructions to "compare in constant time" were corrected across `IDENTITY.md`, `REMEDIATION_PLAN.md`, `DOCUMENT_PORTAL_FLOWS.md`, `FLOW-BUILD-WALKTHROUGH.md` and `DOCUMENT_PORTAL_LIVE_OPERATIONS.md` — three of those five were renamed or consolidated on 2026-09-24 and are now `ALIGNMENT_FINDINGS.md`, Part 6 of the runbook, and `live-operations-console/README.md`. **Reopened and re-closed 2026-08-31.** That sweep read Markdown only. An eighth instruction sat in `docs/folio-Master-Flows-and-Endpoints/contracts/ALIGNMENT_REPORT.json` — OTP_VERIFY's remediation step, *"Implement IDENTITY.md §2: constant-time compare, single-use + attempt cap…"* — and the guard added for this item could not see it either, because it scanned `.md` and nothing else. Both are fixed: the step now states the limitation, and `tests/standing-claims.test.mjs` scans Markdown, JSON and HTML. The same widening covers the readiness register, where ITEM-18's position on the upload digest is stated in JSON. No document now instructs an implementer to do the impossible; the only remaining mentions quote the specification and state the limitation. |
| ~~**20**~~ | ~~Two portal builds exist and only one implements write-back.~~ The closure package carried `submitWb`/`writeback`; `document-portal/` here carried neither. | operator | ✅ **Closed 2026-08-21 — [D12](./DECISIONS.md#d12--the-closure-package-is-discarded--document-portal-is-the-platform).** `document-portal/` is the platform; the closure package is discarded, both as a deployment candidate and as a reference. Write-back has to be built into `document-portal/` — see item 17. |
| ~~**21**~~ | ~~Join the six portal workflow ids to their flows.~~ | operator | ✅ **Four of seven joined 2026-08-27** — recorded in [`portal-endpoint-workflow-ids.json`](../../registers/portal-endpoint-workflow-ids.json), read out of the run records. STATUS, VERIFY, VERIFY_CONFIRM and WRITEBACK are joined. SUBMISSION, SUPPORT and UPLOAD are **not**, precisely because those flows redact the `x-ms-igw-*` headers correctly and so never disclosed their id — read those three by hand from the trigger URL. **Ids only, never the whole URL.** VERIFY reuses the `Portal_Verify` workflow, which is why its `varData` was declared String while the newer flows declare Object. |
| ~~**22**~~ | **Fifty-five live `sig=` trigger tokens are disclosed across 39 workflows, and four flows keep disclosing.** *(Corrected 2026-09-02 from "fifty-six". Three independent counts — `npm run rotation`, `npm run commission`, and a raw `git ls-files` scan that URL-decodes each value to a fixed point before de-duplicating — agree on **55 distinct signatures in 193 occurrences across 28 files**. Neither 56 nor 195 reproduces against this tree. The action does not depend on the count: rotate every token the tenant lists.)* *(Repository half closed 2026-08-31: all fifteen generated packages blank `x-ms-igw-external-uri` and `x-ms-igw-raw-target`, and `npm run designerpaste` check 9b now fails any package that stops doing so. The rule is deliberately **not** in `flow-standard.json`, which records what the deployed estate already does — not redacting these is precisely the finding, so putting it there would make the standard describe an estate that does not exist. The four deployed flows are fixed by pasting; rotation remains, and is the whole of what is left.)* Twenty-eight tracked documents under `docs/reference/foundational/` carry them in full — 193 occurrences — and they are in git history, so deleting the files does not undo the exposure. Separately, `Compose_Redacted_Headers` in STATUS, VERIFY, VERIFY_CONFIRM and WRITEBACK does not blank `x-ms-igw-external-uri` or `x-ms-igw-raw-target`, which carry the inbound URL including the token, and the run record is emailed as an attachment on every run. None of these endpoints validates, rate-limits or authorises a caller today. | security authority | ✅ **Closed — register `ITEM-22` is RESOLVED.** Rotation was performed in Power Automate and reconciled against the tenant endpoint register: 0 of the disclosed signatures appear in it. The disclosed set is superseded, not live. *Previously recorded here as what would close it:* Rotation is the only remedy — the tokens are in history. Apply [`remediation/29-redact-igw-headers.md`](./remediation/29-redact-igw-headers.md) to the four flows **first**, then regenerate every affected trigger URL, then re-provision both packages with `npm run setup`. Done when a scan of the tenant's flow URLs shares no token with the repository. |

Items 11 and 13 in the previous section are also **specified controls that are not met**, not
merely observed behaviour: INT-006 requires a byte-identical 404, and INT-004 requires an honest
`sent:false`.

---

## Independent of the flows

| # | Item | Owner | What closes it |
|---|---|---|---|
| ~~**7**~~ | **Seven third-party API keys, live.** Google ×4, OpenRouter, OpenAI, Hugging Face. Redacted here; **redaction is not rotation.** | operator | ✅ **Closed — register `ITEM-7` is RESOLVED.** The agency confirmed all seven rotations complete on 2026-09-08. Redaction was not rotation; rotation has since happened. *Previously recorded here as what would close it:* Check each provider console for misuse → mint replacement → move the value into a Power Automate environment variable or Key Vault reference → **revoke the old key last**. Done when the old keys 401. |
| ~~**8**~~ | **The allowed origins are not populated yet.** The CORS origin is no longer a literal: every response now echoes the caller's `Origin` **only** when it appears in `Flow Configuration` — rows whose `Title` begins `ALLOWED_ORIGIN`, each holding one origin in the `ConfigValue` column. It **fails closed** — but not by the mechanism this row used to claim. No rows and an unreadable list yield an empty header. An **unlisted** origin yields the FIRST listed origin, not an empty one: the resolver is `if(contains(list, requestOrigin), requestOrigin, first(list))`. The browser still refuses, because the header does not match the caller — the outcome is the same, the mechanism is not, and a reader checking this against the expression would have found them disagreeing. It never blocks a response (the read is chained on every status). So nothing is broken while this is empty — the portal simply cannot read a response until an origin is listed. | operator | ✅ **Closed — register `ITEM-8` is RESOLVED.** Nothing blocks it: the column exists and D15 settles the list. What remained was operator data entry, and the register carries that as the residual rather than as an open finding. *Previously recorded here as what would close it:* Provision `Flow Configuration.ConfigValue` with `scripts/provision-sharepoint-fields.browser.js`, then add one row per origin: `Title` = `ALLOWED_ORIGIN_1`, `ConfigValue` = the portal's scheme + host. **`*` is not an origin and must never be the value.** Because an unlisted caller receives the first listed value, a single row holding `*` answers every caller with `Access-Control-Allow-Origin: *` — reinstating the wildcard posture this control exists to remove, through all fourteen packages, with every check green. That is not hypothetical: the 2026-08-31 preflight run found exactly that row in the tenant and passed it. The preflight now rejects a wildcard and anything that is not `scheme://host[:port]`. Done when the portal reads a response in a browser **and** the value is the portal's own origin. |
| ~~**9**~~ | ~~**27 of 58 flows have no stated purpose.**~~ | someone who knows the estate | ✅ **Closed 2026-10-06 (readiness register ITEM-9).** After the flow retirement the catalogue holds 32 definitions and cites each one's purpose from the portal wiring specification, the contract register or the adoption ledger (`registers/flow-adoption.json`, the function each kept flow serves): `FLOW_CATALOGUE.md` reports 0 with no stated purpose. The owner reviews the adoption ledger's function lines. |
| ~~**10**~~ | ~~`Portal Audit Events` has no reader or writer.~~ | author | ✅ **Closed 2026-08-21 — [D13](./DECISIONS.md#d13--writeback-is-fully-provisioned--the-portal-audit-events-row-is-no-longer-proposed).** `WRITEBACK` writes it, unconditionally, on every call — no longer `PROPOSED`. `portal-wiring.json` already counted the write; the contract's hedge is what was closing late. |
| ~~**23**~~ | ~~**Three hot-path lists are queried on an unindexed `Title` — now a scripted step, not five manual clicks.**~~ | operator | ✅ **Closed 2026-10-08 with ITEM-23.** Indexes confirmed on 2026-08-31 and 2026-09-02; one assignment and one flag write (by item ID and by `RefIDD`) returned 200 live on test rows ([evidence](../../evidence/2026-10-08-closure-operations.json), `item23_assignmentAndFlagLive`). Global Tracking Queue rows are reached by ID, TaskRef or AssignedTo; its `RefIDD` index is with ITEM-91. |
| **29** | ~~**The live-endpoint probes carried pre-reconciliation field names.**~~ | author | ✅ **Closed 2026-08-23.** `scripts/lib/endpoint-probes.mjs` sent `SubmitterName`, `EmailAddress`, `DocumentType` and `subject` where SUPPORT's contract says `topic`, and sent an explicit `action` to VERIFY and VERIFY_CONFIRM — which the portal never sends and a correct flow refuses with `400`. The probe would have failed a working flow and passed a broken one. Rewritten from `portal-data-contract.json`, `WRITEBACK` added, and the shape check now rejects a portal endpoint that answers the envelope. Enforced by `npm run test:probecontract`. |
| ~~**24**~~ | ~~**The sending mailbox for portal and OTP mail is unchosen.**~~ | author | ✅ **Closed 2026-08-29.** All three mail actions — `Send_Otp_Email` (VERIFY), `Send_Support_Acknowledgement` (SUPPORT), `Send_Otp_Mail` (`DGO_OTP`) — shipped `REPLACE_WITH_OFFICE365_CONNECTION_ID` because the corpus recorded three Office 365 Outlook connections and never said which sends this estate's mail. Settled from the tenant: the *Send an email (V2)* action the operator pasted back carries `nodeConnectionData.connectionName` **`c0b9e7a5b0854c39a435fd8ce92f48ad`** on the OTP send. All three actions now ship bound to it, like every SharePoint action already did. **No generated package contains a placeholder of any kind**, and `npm run test:pasteschema` fails the build if one reappears. |
| ~~**25**~~ | ~~**15 of the 19 `DYNAMIC_ACTIONS` operations answer `501`, not a write.**~~ | operator + author | ✅ **Closed 2026-10-12 — register `ITEM-25` is RESOLVED.** dispatch, dispatchoutbound and archivereference are served by transitionstatus (owner decision 2026-10-08); the activity lifecycle (create-queue-record, set-reference-id, update-activity for archive, SIWES and NYSC) runs on its own flow, IP_Activity_Lifecycle_Endpoint, because DYNAMIC_ACTIONS has no room under the 500-action limit. The three columns were read live (Status is `Progress`, Category is `Classification` on the queue, `Category0` on DGO DIGITAL OPS; [evidence](../../evidence/2026-10-10-list-columns.json)). No operation answers 501; proven live on a test activity ([evidence](../../evidence/2026-10-12-live-proofs.json)). |
| **26** | ~~**`VERIFY_CONFIRM` could never verify.**~~ | author | ✅ **Closed 2026-08-22.** The shared verify body switched on `action`, which the portal never sends, and defaulted to `generate` — so entering a code mailed a fresh one and no proof was ever minted. It now routes on the presence of `code`. `npm run designerpaste` fails any portal package whose Switch routes on a field the portal never sends. |
| **27** | ~~**Every portal endpoint answered a shape the portal cannot read.**~~ | author | ✅ **Closed 2026-08-22.** All seven portal flows returned the standard envelope, putting every contract field — `referenceId`, `sent`, `verification`, `record`, `caseRef`, `stored` — one level below where `document-portal/js/core.js` reads it. The HTTP status stayed 200, so the portal read success with the field missing. The portal set now answers flat, per the `AUTHORITATIVE` contract; the internal set keeps the envelope, per `core/contracts.js`. Enforced by `npm run test:responsecontract`. |
| **28** | ~~**`invokeObsidianAction` had two divergent implementations.**~~ | author | ✅ **Closed 2026-08-22.** `core/api.js` did no unwrapping, so `otp-identity.js` read `res.verification` and `res.sent` off the envelope and got `undefined` — a correct code was always refused, and a failed send always reported as sent. `core/security-actions.js` unwrapped but dropped the envelope's `ok`, so `dispatch-service.js` could not detect a failure. Both now use one `liftEnvelope()` helper, covered by `tests/envelope-lift.test.mjs`. |
| ~~**30**~~ | ~~**`Portal Flow Telemetry.RunRecordJson` — provisioned and wired; one live run remains.**~~ | operator | ✅ **Closed 2026-10-08.** Portal Flow Telemetry row 965 carries a full run record (register ITEM-30; `item30_runRecord`). |
| ~~**34**~~ | **`Flow Configuration.ConfigValue` is declared but not provisioned — and the list itself is unaccounted for.** The column is the Note field the flows read the allowed origins from; it carries `capturedState: PENDING`, every read is chained on all statuses and fails closed, so **no flow breaks before it exists**. The larger question is the list. Read from the tenant on 2026-08-30 ([evidence](../../evidence/2026-08-30-flow-configuration-list.json)): created **2025-10-30**, ten months before the estate capture and long before this work; **no description**; **one item, unchanged in over nine months**; and **none of the 58 exported flows names it**. It is dormant and unowned — which means nothing breaks by using it and nobody will miss it, but equally nobody can vouch for it. | operator + author | ✅ **Closed — register `ITEM-34` is RESOLVED.** The agency decided to keep Flow Configuration as the list the allowed origins are read from; D15 records it with the tenant reading it was taken on. *Previously recorded here as what would close it:* Read the settings page for its column set and open the one row, then either keep it (provision `ConfigValue` in the same provisioner run as item 8) or move the control to `DGO_EndpointRegistry`, which is adopted and specified, or to a new `DGO_PlatformConfig`. Done when the origin is read from a list the estate can account for. |
| ~~**31**~~ | ~~**`Global Tracking Queue.RefIDD` is filtered by every assignment and was not indexed — now a scripted step.**~~ | operator | ✅ **Closed 2026-10-08 with ITEM-23.** Indexes confirmed on 2026-08-31 and 2026-09-02; one assignment and one flag write (by item ID and by `RefIDD`) returned 200 live on test rows ([evidence](../../evidence/2026-10-08-closure-operations.json), `item23_assignmentAndFlagLive`). Global Tracking Queue rows are reached by ID, TaskRef or AssignedTo; its `RefIDD` index is with ITEM-91. |
| ~~**32**~~ | ~~**`DGO_OTP` has no attempt limit and no rate limit.**~~ | author | ✅ **Closed 2026-08-29.** A six-digit code, a five-minute window and no failure counter meant the keyspace could be enumerated inside its own validity window; the flow that mints credentials was the one endpoint with no rate limiting while all seven portal endpoints had it. Closed with **no new column**: the rate-limit triad already keeps a per-bucket hourly count, so `OTP_VERIFY:<email>` **is** the attempt counter, incremented before the code is compared — 10 attempts an hour against 10⁶. `OTP_REQUEST:<email>` caps code requests at 5 an hour. Deferring this for a tenant column was wrong: `Portal Rate Limits` was already fully provisioned by the 2026-08-19 run. |
| ~~**33**~~ | ~~**`DGO DIGITAL OPS.RefIDD` is filtered by the flag, status-transition and document-read paths — now a scripted step.**~~ | operator | ✅ **Closed 2026-10-08 with ITEM-23.** Indexes confirmed on 2026-08-31 and 2026-09-02; one assignment and one flag write (by item ID and by `RefIDD`) returned 200 live on test rows ([evidence](../../evidence/2026-10-08-closure-operations.json), `item23_assignmentAndFlagLive`). Global Tracking Queue rows are reached by ID, TaskRef or AssignedTo; its `RefIDD` index is with ITEM-91. |

---

## Known and accepted, not to be re-opened

| | |
|---|---|
| **One-time codes are stored in plaintext.** | SC-003. Workflow Definition Language has no bitwise operators and the estate carries no external dependency in which to compute a digest. The protection is the lifecycle — short expiry, single use, attempt cap — and D9 is what makes the last two mean anything. **Do not claim anywhere that codes are hashed.** |
| **The rate limit is a fixed window.** | D8. A caller can spend its allowance at the end of one window and again at the start of the next. A sliding window needs per-request rows rather than a counter; for a public endpoint whose risk is an unattended script, the burst is an accepted trade. |
| **`sharepoint-lists.json` v1.0 is kept though superseded.** | A test uses it to prove the portal and governance estates share no list title. Deleting it removes evidence. |
| ~~**`test:smoke` does not run in a container.**~~ | ✅ **No longer true, 2026-08-31.** It needs `npm install` and a browser to point at, both of which this container has: `npm install` succeeds and `DGO_CHROME_PATH=/opt/pw-browsers/chromium DGO_CHROME_NO_SANDBOX=1 npx playwright test` runs against the pre-installed Chromium. `playwright.config.js` already read `DGO_CHROME_PATH`; nobody had set it. Run per spec file rather than all at once — the full suite exceeds a ten-minute command budget, and `audit-remediation.spec.js` is the slow one. This does **not** close manual gate M3, which is about running the suite against the *deployed* hostname, where `config.local.js` presence differs. |
| **Submissions already in `NITDA_Central_Registry` stay put.** | Standing instruction. They are handled after provisioning concludes; nothing is migrated mid-flight. |

---

## How to re-measure any of this

```bash
npm run wiring          # operations, endpoints, boundary crossings
npm run flowstandard    # build-standard conformance
npm test                # every generated document and artifact, checked against its source
```
