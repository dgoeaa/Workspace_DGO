# The remediation analysis — how the approach changed, and the sequence it produced

> ## RETIRED AS A PLAN — kept as the record of the analysis
>
> **This is not the plan.** It was, until the twenty-hour designer path it sets out was
> abandoned for the definition-package route in `EXECUTION.md` (retired 2026-10-05: [flow-retirement.json](../../../registers/flow-retirement.json)); `DECISIONS.md`
> §695 records the decision and says this document stays "as the record of the analysis that
> led here". [`../../../../deployment/PLAN.md`](../../../../deployment/PLAN.md) is the only plan in this repository, and it was
> named `PLAN.md` here too until 2026-09-24, which is what this rename fixes.
>
> Read it for **why** the approach changed and what the five tracks found. Do not sequence work
> from it.

> **This document carries no commands.** It is the SharePoint remediation analysis. The steps for portal and endpoint
> commissioning and for governance tenant remediation both live in
> [`../../../../deployment/RUNBOOK.md`](../../../../deployment/RUNBOOK.md) — Part 3 and Part 5 of it respectively. **That one
> document is the only one in this repository that carries a step.** Until 2026-09-24 the two
> parts stood as separate runbooks, `PORTAL-TENANT-RUNBOOK.md` and
> `GOVERNANCE-TENANT-RUNBOOK.md`; they were consolidated, not changed.


Revised 2026-08-20 after D10 and D11. Supersedes the version written earlier that day, which
assumed six endpoints, 49 operations and five visits. None of those three numbers still holds.

---

## What changed, and why the plan had to

| | Then | Now |
|---|---|---|
| Endpoints | 6 | **7** — D11 put citizen write-back in scope |
| Required operations | 49 | **59** |
| Remediation visits | 5 | **5, plus a sixth piece of work** |
| Visits 3 and 5 | "add the missing actions" | **replace the flow body** — D10 found them cloned from the submission flow |
| The specification | scattered across four documents | **one contract**, `PORTAL_DATA_CONTRACT.md`, checked against the provisioned estate |

The last row is the one that reorders everything else. The data contract now says what every
endpoint must send, read and persist, down to the column. **Flows conform to it.** A flow that
does not is wrong, and the contract is not adjusted to match it — which means flow work can now
be specified before it is scheduled, instead of discovered while it is being done.

---

## The rule this plan follows

> **Specification, then decision, then flow, then client, then proof.**

Every failure this work has hit came from taking those out of order: rate limits with no
threshold, redaction composes nothing consumed, a code comparison that was never specified, a
denial path that fails open. Each was a flow built before its specification was settled.

---

## Track A — specification · **essentially complete**

| | State |
|---|---|
| `PORTAL_DATA_CONTRACT.md` — 11 contracts, 119 persistence targets | ✅ all resolve to provisioned columns |
| Every provisioned portal column has a writer | ✅ 96 of 96 |
| `LISTS.md`, `FLOW_STRUCTURES.md`, `FLOW_CATALOGUE.md` | ✅ generated, drift-checked |
| Decisions D1–D11 | ✅ none open |
| **17 of 57 flows have no stated purpose** | ⬜ one sentence each, from someone who knows the estate |

Nothing downstream is blocked by that last row. It is documentation debt, not a dependency.

---

## Track B — both decisions are made

### B1 · Which portal build ships — decided

**[D12](../DECISIONS.md#d12--the-closure-package-is-discarded--document-portal-is-the-platform),
2026-08-21: `document-portal/`.** The closure package — the other candidate, single-page,
six keys, the only one of the two with write-back implemented — is discarded, both as a
deployment target and as a reference for what the portal should do.

D11's dependency still holds, just with the fork closed: `document-portal/` is what ships, so
the write-back UI has to be built into it before WRITEBACK has any caller at all. That UI does
not exist in any build any more — the closure package was the only place `submitWb`/`writeback`
lived — so this is new work, not a port.

### B2 · The bodies for the status and support endpoints — decided

**Approved with amendments, 2026-08-21:**
[`B2_CONTROL_FLOW_PROPOSAL.md`](./B2_CONTROL_FLOW_PROPOSAL.md).

D10 established that `Portal_ECM_DOCS_STATUS` and `Portal_ECM_DOCS_SUPPORT` are clones of the
submission flow — both run `Scope_Process_Submission`, which creates a file in the document
library. They do not perform their own function at all, and `Portal_Status_Enquiry` is a stub
with three variables and no body. The data contract said what they must accept, return and
persist; what was open was the **control flow** of the replacement body.

That is now settled for STATUS, SUPPORT **and** WRITEBACK — the third was the same kind of open
question and was taken in the same sitting. Ten sign-off items, eight mandatory implementation
directives, and a required test list are in that document; it is the implementation basis, and
the draft it replaced is superseded in full.

**B2 no longer blocks C4 and C5** — but the directives add work before packaging that the
per-visit artifacts do not yet carry: idempotency, atomic proof consumption, and partial-failure
recovery, each needing a named platform mechanism rather than an assumed one (§11.2). One item is
client work, not flow work: SUPPORT's retry classification (§11.1).

---

## Track C — flows, in dependency order

Each step is: patch from the artifact → `verify-portal-wiring.mjs` on disk → apply →
re-export → confirm the number moved.

| # | Work | Ready? | Moves the number to |
|---|---|---|---|
| **C0** | Recover commit `ba7c94a` — the `Portal_Verify` export | blocked on a 403 | 8/59 in the repo |
| **C1** | Apply `Portal_Verify_Confirm` — patched, verified 7/7 on disk | **ready now** | 15/59, 2/7 |
| **C2** | Visit 2 — the two submission flows | needs placements (13 actions) | 27/59 |
| **C3** | Visit 4 — `ECM_DOCS_INTAKE` write-back | **placements done** | 27/59 + the bridge |
| **C4** | Visit 3 — status | control flow approved; needs the action list | 35/59 |
| **C5** | Visit 5 — upload and support | control flow approved; needs the action list | 49/59 |
| **C6** | WRITEBACK — new flow, ten operations | control flow approved; client built; needs the action list | **59/59** |

C1 and C3 can proceed today. C2 needs an hour of placement work and no decision. **C4, C5 and C6
no longer wait on a decision** — B1 and B2 are both closed. What they wait on now is capacity:
writing the per-flow action lists that implement
[`B2_CONTROL_FLOW_PROPOSAL.md`](./B2_CONTROL_FLOW_PROPOSAL.md), including the directives its
artifacts do not yet carry (idempotency, atomic proof consumption, partial-failure recovery).

**C6 is not only a flow.** It needs the endpoint key provisioned and its URL published, and a
client that calls it. The client half is now built —
`PF.intake.writeback()` plus track.js's respond/note/withdraw actions — so what remains is the
flow, the key, and a live URL in it.

---

## Track D — what the wiring count does not cover

`59/59` means the estate is correct. It does not mean a citizen is served correctly.
[`PORTAL_CLIENT_FINDINGS.md`](../PORTAL_CLIENT_FINDINGS.md) reconciles seven live-probe findings
against the remediation: **four are answered** — the three client-only rows this table used to
carry (`stored:false`, the invented support reference, the un-retried `verification_required`)
were closed 2026-08-21 as self-contained `document-portal/js/` fixes, independent of B1.

| | Owner |
|---|---|
| Unknown reference answered 200 and rendered as "found" — **the denial fails open** | flow, in C4 |
| A submission reports delivered while its attachments are never sent | contract dispute — client shape vs trigger schema |
| VERIFY answers 200 without `sent` | flow |

The remaining three are flow-side or a contract dispute between the client and a trigger schema;
none is a portal-JavaScript change, so none is blocked on which build B1 selects.

---

## Track E — security, independent of everything above

| | Why it cannot wait for the flows |
|---|---|
| **Rotate the seven third-party API keys** | Redacted in the repository, live in the tenant. Redaction is not rotation. |
| **Set the real CORS origin** | Every endpoint returns `Access-Control-Allow-Origin: https://your-host`. A browser refuses every response from the real origin — the portal cannot work at all until this is set. |
| **Decide on the six `sig` trigger tokens** | Circulated in the closure package. They are bearer credentials, and today no endpoint validates, rate-limits or authorises. |

The third is the one to weigh carefully: those URLs are shipped to every browser by design, so
they are not secret. What makes them dangerous is that **nothing behind them checks anything**,
which is what D8's rate limits and INT-006's denial are for. Either rotate them, or close the
gap they are standing in for.

---

## The order I would take it in

~~B1 — decide the build.~~ **Done — [D12](../DECISIONS.md#d12--the-closure-package-is-discarded--document-portal-is-the-platform), 2026-08-21: `document-portal/`.**
~~B2 — the two design sittings.~~ **Done — [`B2_CONTROL_FLOW_PROPOSAL.md`](./B2_CONTROL_FLOW_PROPOSAL.md), approved with amendments, 2026-08-21.**
~~The write-back UI for `document-portal/`.~~ **Done — `PF.intake.writeback()` and track.js's respond/note/withdraw.**

1. **C1 — apply `Portal_Verify_Confirm`.** Ready now, proves the write path end to end on a real
   flow, and the dry run sends nothing.
2. **E — the CORS origin.** Ten minutes, and until it is set the portal cannot read any response.
3. **C0** in parallel, whenever the access is granted.
4. **The action lists for C4, C5 and C6**, implementing the approved control flow — including the
   directives the existing artifacts do not carry, each with its platform mechanism named rather
   than assumed (§11.2). **This is the largest remaining piece of specification work.**
5. **The SUPPORT client fix** (§11.1) — retry classification, queue amplification, silent case
   loss. Client work in `document-portal/js/`, schedule it with C5 rather than after it.
6. **C2, C3**, then **C4, C5**, then **C6**.
7. **Key rotation**, then the end-to-end pass — checked against citizen-visible outcomes, not
   against the wiring count.

Steps 1 to 3 remain a single working day. Nothing in this list is now waiting on a decision;
every remaining item is capacity or tenant access.

---

## What "done" means now

| | |
|---|---|
| `npm run wiring` | **59/59, 7/7 endpoints, 0 crossings** |
| `npm run flowstandard` | portal median 100% |
| `npm run datacontract --strict` | 0 errors, 0 gaps, 0 unwritten columns *(already true)* |
| `PORTAL_CLIENT_FINDINGS.md` | 7 of 7 answered *(4 as of 2026-08-21)* |
| End-to-end | a citizen submits with an attachment, verifies, tracks, responds, and withdraws — each visible in the estate |

The last row is the only one that is actually the finish line. The others are how you know you
are near it.
