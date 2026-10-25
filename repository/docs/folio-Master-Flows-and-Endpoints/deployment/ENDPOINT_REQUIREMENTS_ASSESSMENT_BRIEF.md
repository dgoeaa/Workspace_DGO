# Endpoint requirements: independent assessment brief

**Prepared for** NITDA DGO, to hand to an external assessor.
**Question being commissioned** *What endpoints does this system actually require?* — not whether
the ones that exist are well built.
**Relationship to the other brief** `INDEPENDENT_REVIEW_BRIEF.md` (retired; not in this tree)
commissions a quality review of the estate as built. This one commissions a requirements
determination. They are different questions and should not be given to the same engagement
without saying which takes precedence; if only one is funded, this one comes first, because a
quality review of endpoints nobody has established are needed grades the wrong thing.
**Status of this document** Written by the same AI agent that produced much of the material it
tells you to exclude. Section 8 says what to do about that.

---

> **This document carries no commands.** It commissions a determination; it does not execute
> one. The steps for endpoint and portal commissioning live in
> `EXECUTION_RUNBOOK.md` (retired 2026-09-24; now [`RUNBOOK.md`](../../deployment/RUNBOOK.md)), which is the only document that carries them.
> If you are here to execute, go there.

---

## 1. The question, stated so it can be answered

Three questions get called "the endpoint question" and they have different answers:

| | Question | Who can answer it |
|---|---|---|
| A | Which endpoints **exist** in the Power Platform environment? | A tenant administrator, in an hour |
| B | Which endpoints do the two applications **call**? | Anyone, from two config files |
| **C** | **Which endpoints does the service actually require, and what must each guarantee?** | **This assessment** |

A and B are already answered and the answers are in this repository. **C is not answered
anywhere**, and no document in this estate should be read as answering it. The assessor is
engaged to answer C.

The deliverable is a position on C that a delivery team can build to and an audit can be held
against: for each endpoint the service requires — its purpose, its caller, its authentication
obligation, its request and response contract, and its failure behaviour. Plus, explicitly, the
endpoints that exist and are **not** required.

---

## 2. Why the documentation must be excluded from the evidence, and what to use instead

This is the most important instruction in this brief.

**Do not determine requirements from the documentation in this repository.** Measured on
2026-09-09 across 654 tracked documents: **an average of 17 separate documents describe each
endpoint** (`SUBMISSION` appears substantively in 50; `STATUS` in 45; `VERIFY` in 30). No
precedence order is declared between them. They were written at different times by different
processes, and 46 of them contain a marker calling themselves superseded, retired or historic.

An assessor who works from that corpus will spend the engagement reconciling documents rather
than assessing the service, and will produce a position that is a weighted average of past
opinions — which is the opposite of independent. The corpus is the builder's account, and this
engagement exists because the builder's account is not the thing you want.

**Work from primary artefacts only.** There are exactly three, and they answer different halves
of the question:

| Evidence | What it establishes | Where |
|---|---|---|
| **Demand** — what the two applications actually call | The endpoints the shipped software depends on today. 19 contract keys internal, 7 portal. Read the code, not a description of it. | [`config/endpoints.config.js`](../../../config/endpoints.config.js) · [`document-portal/config.example.js`](../../../document-portal/config.example.js) |
| **Supply** — what the environment actually holds | 60 flow definitions captured 2026-08-19/24/31, verbatim. Read what each trigger accepts and returns. | [`docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`](../contracts/deployed/) |
| **Need** — what the service is for | The business process: correspondence submitted by the public, registered, routed, acted on, answered. Establish this from NITDA staff and from the live service, **not from this repository**. | interviews; the running portal and internal platform |

Where a derived document is genuinely useful as an *index* into the primary artefacts — not as a
source of truth — [`docs/folio-Master-Flows-and-Endpoints/provisioning/`](../provisioning/README.md) prints
every configured value verbatim from the 60 definitions and is machine-checked against them. Use
it to navigate. Do not cite it for a requirement.

---

## 3. What is already established, and how far it can be trusted

Figures the assessor may take as read, each with its limit stated. They are inputs, not findings.

| Established | Figure | The limit on it |
|---|---|---|
| Endpoint contracts the internal application declares | 19 | Read from shipped code; reliable |
| Endpoint slots the public portal declares | 7 | Read from shipped code; reliable |
| Distinct physical flows those resolve to | 16 internal + 7 portal | Several contract keys share one flow |
| Flow definitions captured from the environment | 60 | **Not proven to be all of them** — see below |
| …claimed by a contract key or portal endpoint | 37 | Attribution comes from registers in this repo, which are themselves builder-authored |
| …**claimed by nothing** | **23** | Existence is evidenced; necessity is not. A prime target for question C |
| Captured flows whose export carries **no** `triggerAuthenticationType` | 16 | The value was not captured. Posture unknown either way — not "open", not "closed" |
| Captured flows recording `Tenant` | 5 | |
| Captured flows recording `All` | 39 | |
| Workflows with a signed trigger URL published in this repository | 25 | Dated 2026-08-03. A signed URL is a bearer credential |
| Workflows the working configuration actually wires | 8 | So 17 published credentials address flows nothing currently calls |

**The 60 are not a tenant inventory.** They were captured by
[`scripts/export-power-automate-flows.ps1`](../../../scripts/export-power-automate-flows.ps1), which
uses the maker cmdlet `Get-Flow`. That script states its own limit: *"Get-Flow returns only flows
you own or co-own. A flow owned solely by a colleague is invisible to this script."* Flows owned
by others are absent and nothing here would know. **The assessor should obtain an administrative
inventory (`Get-AdminFlow`) as the first act of the engagement**; if the count differs from 60,
that difference is a finding in itself and everything downstream must be re-based on it.

---

## 4. Questions the assessment must answer

Ordered so that an engagement cut short still delivers the most valuable part first.

1. **The required set.** Which endpoints does the service require? State each with purpose,
   caller, and why the service cannot meet its obligations without it. An endpoint that survives
   only because it exists today does not belong on this list.
2. **The surplus.** Which existing flows are not required? Address the 23 unattributed ones by
   name, and say for each whether it is live work nobody wrote down, a superseded copy, or an
   experiment. Recommend a disposition.
3. **The gaps.** Which requirements have no endpoint? A requirement met today by manual work, or
   not met at all, will not appear in any config file or export.
4. **Consolidation.** Where several endpoints serve one requirement — the `Fetch_All_Data`
   variants, the two submission flows, `DYNAMIC_ACTIONS` multiplexing 4 contract keys and
   `SUBSIDIARY_ACTIONS` multiplexing 18 over single triggers — state whether that is the right
   shape, and what the target shape is.
5. **Authentication obligation per endpoint.** For each required endpoint, what posture *must* it
   hold, given its caller? Both applications call flows directly from the browser with no proxy,
   so the flow is the only place authentication can be enforced. Resolve the 16 flows with no
   recorded posture. Note that the public portal's endpoints are, by design, invocable by an
   anonymous stranger.
6. **Contract per endpoint.** What must each accept and return — including its error and status
   behaviour? Where the deployed contract and the requirement differ, say which is wrong.
7. **Credential position.** Whether the 25 published signed URLs must be regenerated, and in what
   order relative to any endpoint the assessment recommends retiring.

---

## 5. What the assessor must be given

Access to primary artefacts, not summaries of them. Anything less makes the assessment a review
of this document, which is worth nothing.

- **Read access to the Power Platform environment** `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`
  with a role that can run `Get-AdminFlow` — sufficient to see flows owned by anyone.
- **Read access to the SharePoint sites** the flows address, to see what the data actually looks
  like against what the contracts claim.
- **The two repositories**, including this one — noting it is currently private.
- **Interview time with NITDA staff who operate the service** — registry, directorates, helpdesk.
  Question C cannot be answered from artefacts alone; the need side lives with the people doing
  the work.
- **The live endpoints, exercisable** in a non-production environment.

### Blocking prerequisite

Section 3 of `INDEPENDENT_REVIEW_BRIEF.md` (retired; not in this tree) sets out a credential
rotation that must complete before any outside party is given repository access, because signed
trigger URLs are present in git history and a signed URL is a bearer credential. **That
prerequisite applies to this engagement unchanged.** It is not satisfied by making the repository
private, and it is not satisfied by deleting files — only regenerating each trigger in Power
Automate revokes it.

---

## 6. Independence

The conditions in section 1 of the companion brief apply and are not restated. Two additions
specific to a requirements determination:

- **The assessor must not be the party that will build to the answer.** A requirements position
  written by the prospective implementer selects for what is convenient to implement.
- **The assessor must be free to conclude that a required endpoint does not exist, or that an
  existing one is not required.** If the engagement is scoped so that the answer must validate the
  current set, it is not an assessment. The 23 unattributed flows are the specific place this
  will be tested.

---

## 7. Acceptance criteria for the assessment

The assessment is complete when, and only when:

1. Every endpoint on the required list carries a purpose, a caller, an authentication obligation
   and a contract — each traceable to primary evidence or to a named interview, never to a
   document in this repository.
2. Every one of the flows in the administrative inventory is dispositioned: required, surplus, or
   undetermined-with-a-reason. None is silently omitted.
3. The gaps list exists and is non-empty or explicitly argued to be empty.
4. Every figure quoted from this brief has been independently re-derived, or is marked as taken on
   trust. **Nothing in section 3 should survive into the assessment unchecked.**
5. The position is stated plainly enough to be disagreed with. A requirements document that cannot
   be wrong has not said anything.

---

## 8. Provenance, and how to weigh this document

This brief and much of the material it points at were written by an AI agent working in this
repository. Section 7 of the companion brief documents that agent's self-verification failing
repeatedly, in a consistent direction: **checks that reported success without establishing it.**

Applied here, the specific risks are:

- **The figures in section 3 are the agent's own counts.** They were derived mechanically and
  re-checked, but by the same party. Re-derive them.
- **The framing in section 2 — "exclude the documentation" — is the agent recommending that its
  own output be excluded from the evidence.** That is the correct instruction, and the assessor
  should satisfy themselves it is, rather than adopt it because this document says so. The
  measurement it rests on (17 documents per endpoint) is reproducible: count the tracked documents
  naming each endpoint key three or more times.
- **The attribution of 37 of 60 flows to contract keys comes from registers in this repository**,
  which are builder-authored. An assessor treating "unattributed" as "unnecessary" would be
  inheriting exactly the judgement this engagement exists to make independently.

The correct posture toward this document is the one it asks for toward the rest of the estate:
use it to find the primary artefacts, then form the position from those.

---

## 9. Sequencing

1. Rotate credentials (blocking — companion brief section 3).
2. Obtain the administrative flow inventory. Re-base the counts.
3. Establish the need side from staff interviews and the live service, **before** reading any
   flow definition, so the required set is not anchored to what happens to exist.
4. Map demand and supply onto that need. Produce the required list, the surplus list, the gaps.
5. Answer the contract and authentication questions per required endpoint.
6. Report — including where this brief was wrong.
