# Operational parameters — repository audit

> **Consolidation note, 5 September 2026.** This document audits a 679-file snapshot of
> `main` (`63d79ee`), reached through `dgoeaa/ecm_repo_clean`. It is kept because its standing
> credential finding is carried by no other branch. Its measurements are not measurements of the
> tree it now sits in: the consolidated tree tracks 1,110 files and runs 70 Node stages green.
> Read the exposure finding as standing and every count, file total and suite result as a
> reading of `main` at `63d79ee`. Its "55 signed trigger URLs" is one of those: the
> consolidated tree counts 43 across the same 28 files, because the counters were matching
> greedily and indexing one credential under several strings (README §1). The exposure did
> not shrink; the count was wrong. Branch of record: `claude/operational-parameters-audit-nieb71` (`e03fbc5`).

**Audit date:** 2 September 2026
**Repository:** `dgoeaa/ecm_repo_clean`
**Audited tree:** `ECM_DOCS_DEV-main/` (679 files), recovered from blob `5e3cb94` in commit `2fe06a4`
**Result:** 1 of 21 fields answerable from the repository; 1 further field answerable only pending tenant confirmation; 19 fields blank.

Every value below is either quoted from a file with its path and line, or recorded as absent
after an exhaustive search. Nothing here is inferred, and no value is supplied by the auditor.

---

## Standing finding — credential exposure, verified 4 September 2026

This audit was commissioned to fill in a go-live parameters form. While tracing where the
platform's endpoints live, a live exposure was found that outranks every parameter in it.

**All 55 signed Power Automate trigger URLs are public right now.** `ECM_DOCS_DEV` was made
private on 3 September; `dgoeaa/Sytem_Production_Governance` is public and carries the same 55,
byte-for-byte — the sorted, deduplicated signature sets of both repositories hash identically
(`sha256 5a97cee5af9581c4`). `dgoeaa/DGO_OPS` is public and carries three more, in a
deployed-site directory committed 30 July 2026, pointing at the same production environment
`defaultca6a4b3f912349bcbcb927085ebbf1`.

A SAS-signed URL is a bearer credential: possession alone authorizes invoking the flow. The 55
resolve to **39 distinct flows**. Making a repository private revokes nothing, and neither does
deleting a file or rewriting history — only rotation does.

`COMMISSIONING_WALKTHROUGH.md` §0.3 carries the full table and the two actions. Nothing in the
parameters below should be scheduled ahead of them.

---

## 0 · Repository state — read this first

The repository at `HEAD` (`45b002d`) contains **one file of two bytes**.
`ECM_DOCS_DEV-main-Repo_Export.zip` is a bare CRLF, not an archive:

```
$ file ECM_DOCS_DEV-main-Repo_Export.zip
ECM_DOCS_DEV-main-Repo_Export.zip: ASCII text, with CRLF line terminators
```

Commit `45b002d` ("Rename ECM_DOCS_DEV-main (5).zip to ECM_DOCS_DEV-main-Repo_Export.zip")
did not rename the archive. Its diffstat records the payload being deleted and a one-line
text file added in its place:

```
ECM_DOCS_DEV-main (5).zip         | Bin 6756295 -> 0 bytes
ECM_DOCS_DEV-main-Repo_Export.zip |   1 +
```

The 6,756,295-byte archive survives only as blob `5e3cb94d0302fee8a78fa4c136877650a0537baa`
in the parent commit `2fe06a4`, and is recoverable with:

```bash
git cat-file -p 5e3cb94d0302fee8a78fa4c136877650a0537baa > ECM_DOCS_DEV-main-Repo_Export.zip
```

That recovered tree is what this audit searched. **The corruption is not repaired by this
document** — repairing it is a separate decision, not an audit finding.

---

## 1 · Fields answerable from the repository

### serviceMailbox — `portal@nitda.gov.ng`

The only publicly visible service mailbox recorded anywhere in the tree.

| Where | What |
|---|---|
| `document-portal/js/data.js:11` | `email: 'portal@nitda.gov.ng'` — the `PF.ORG` organisation record |
| `document-portal/js/data.js:133` | `label: 'Helpdesk email'` · *"Quote your tracking ID in the subject line. Replies within one working day."* |
| `document-portal/index.html:42,164` | Rendered in the no-JavaScript fallback and the page footer |
| `document-portal/submit.html:42,166` | Same, submission page |
| `document-portal/track.html:42,93` | Same, tracking page |
| `document-portal/support.html:42,173` | Same, helpdesk page |
| `document-portal/404.html:52,70` | *"If you followed a link from an official notification, write to portal@nitda.gov.ng"* |
| `document-portal/js/track.js:411` | Attachment overflow route |
| `document-portal/js/support.js:202` | Attachment overflow route |

**Caveat that belongs on the form:** the repository records this address but records no
approval of it. There is no sign-off, no owner and no decision reference attached to it
anywhere in the tree.

Four other mailboxes exist and are *not* the visible service mailbox:

- `dgs@nitda.gov.ng` — internal support routing (`config/support-routing.config.js:15`)
- `dgsregistry@nitda.gov.ng` — bootstrap administrator and correspondence reply-to
  (`core/current-user.js:7`, `config/correspondence-email-templates.config.js:15`)
- `dpo@nitda.gov.ng` — data protection officer (`document-portal/js/data.js:136`)
- `registry@nitda.gov.ng` — general-administration routing destination

### environmentId — `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` ⚠ tenant confirmation required

The identifier is present, in 20 files, **all of them inside the harvest corpus**.
`docs/README.md:14` classifies that corpus explicitly:

> | **Harvest** | Raw material, kept for evidence | Untrusted. Prefer the contract over the sample | `reference/foundational/` |

Corroborating tenant metadata captured alongside it
(`docs/reference/foundational/flows/response-samples/Web - OTP Generate__…__Compose_HTTP_Response.txt`):

- Subscription `05351e39-40e4-475c-849f-f207911ef8ff`
- Resource group `CA6A4B3F912349BCBCB927085EBBF1A1-DEFAULTCA6A4B3F912349BCBCB927085EBBF1A1-ENV`
- Location `westeurope`
- `"environmentName": "Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1"`

A second, independent artefact corroborates the same environment — `docs/reference/operations-manifest.json`,
a static extraction of the legacy SPA, records the endpoint host
`defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com`.

This is the environment historical flows *ran in*. It is not a recorded approved target, and
the repository's own trust classification forbids citing it as authoritative. **Confirm
against tenant evidence before entering it on the form.**

---

## 2 · Fields absent from the repository

### releaseId — not present

No remediation package exists in the tree. `find` over the whole corpus returns no artefact
of that kind; the only remediation document is
`docs/reference/flow-contracts/REMEDIATION_PLAN.md`, which is prose organised by finding
severity and carries no version, release or package identifier.

Version identifiers that do exist, none of which is a remediation release:

| Value | Where | What it actually is |
|---|---|---|
| `11.6.0-enterprise-domains` | `config/app.config.js` | Runtime `AppConfig.version` |
| `dgo-r11-3-bespoke-runtime` | `config/app.config.js` | Runtime `AppConfig.id` |
| `dgo-r11-ui-contracts` / `0.1.0` | `package.json` | npm package name and version |
| `11.1.3-viewport-containment` | `docs/reference/foundational/lineage/R11_1_*/runtime-package-manifest.json` | Superseded lineage bundle |

### recurrenceTimeZone — not present

There is no `timeZone` key anywhere in the corpus. All seven deliverable flows in
`docs/deployment/power-automate-flows/` are `Request` triggered (`Http` for 01–06, `Button`
for 07) and **carry no recurrence at all**.

The single recurrence in the entire corpus belongs to a harvested tenant flow — " DGSO
INCOMING AI PROCESSING" in
`docs/reference/foundational/flows/run-records/dgso_incoming_ai_processing_provisioning_report_2026-08-04_1/definition_raw.json`
— and it carries no time zone:

```json
"recurrence": { "frequency": "Minute", "interval": 1 }
```

Nearest related string, which is display text and not a flow setting:
`document-portal/js/data.js:14` — `hours: 'Monday – Friday, 08:00 – 17:00 WAT'`.

### targetEnvironment — not present

No Power Platform environment display name is recorded anywhere. Both build documents use a
literal placeholder the reader is instructed to substitute:

- `docs/deployment/FLOW-BUILD-WALKTHROUGH.md:167` —
  `https://make.powerautomate.com/environments/ENVIRONMENTID/flows/WORKFLOWID/details`
- `docs/deployment/FLOW-BUILD-WALKTHROUGH.md:170` — *"Take `ENVIRONMENTID` from the URL of
  any flow you already opened."*
- `docs/deployment/MINIMAL-PILOT.md:95,98` — same placeholder, same instruction

### authoritativeCommit — not determinable

No commit corresponds to a tenant baseline, because nothing in this repository has ever been
deployed. The repository states this in three independent places:

- `docs/deployment/COMMISSIONING.md:15` — *"nothing is wired to a flow, nothing is deployed,
  no credential has been rotated, and no enforcement exists on the server side."*
- `docs/audits/OPERATIONAL_READINESS_AUDIT.md` §6 — *"No endpoint in this environment is
  reachable. Every probe failed at the network, and the verifier correctly reported that it
  had verified the network rather than the configuration."*
- `docs/forensic/dd2e909/diagrams/03-build-deploy.mmd:3` — *"Everything tracked is served
  verbatim; nothing is deployed by automation."*

Four commits are recorded in documentation. Each is an **analysis baseline** — the commit an
audit was run against — and none is a deployment record:

| Commit | Recorded as | Where |
|---|---|---|
| `dd2e909ed0e337f7fe36a5f65201abca9ec7f28e` | Forensic analysis SHA, tree clean, 282 tracked files | `docs/forensic/dd2e909/00-provenance.md:47` and five sibling files |
| `c2d78ba2ea2380e6c2a0355c9322bf8e8c669e3e` | Repository-hygiene scope commit, 294 tracked files | `docs/audits/repository-hygiene/00-provenance.md:3` |
| `61604a3` | Forensic root platform audit, 2 August 2026, branch `claude/quirky-babbage-1nomt5` | `docs/audits/FORENSIC_ROOT_PLATFORM_AUDIT.md:3` |
| `0d7826e` | Prose checked against it, 9 August 2026 | `docs/deployment/DOCUMENT_PORTAL_LIVE_OPERATIONS.md:12` |

Container-repository commits, for completeness: `2fe06a4` (carries the archive) and
`45b002d` (`HEAD`, which destroyed it).

---

## 3 · Agency-decision fields — all eleven blank

The formal sign-off instrument exists and is **entirely unsigned**.
`docs/reference/business_requirements_functional_requirements_hybrid.txt` §16:

```
| Role                  | Name | Decision | Date | Signature |
| --------------------- | ---- | -------- | ---- | --------- |
| Business Owner        |      |          |      |           |
| Product Owner         |      |          |      |           |
| Technical Lead        |      |          |      |           |
| Architecture Reviewer |      |          |      |           |
| Security Reviewer     |      |          |      |           |
| Delivery Lead         |      |          |      |           |
```

Six roles, twenty-four cells, every one empty.

| Field | Status | Search result |
|---|---|---|
| `administratorTarget` | Blank | No flow addresses any mailbox but the caller's own — see §4 |
| `intakeTarget` | Blank | Routing table exists but is explicitly unapproved — see §4 |
| `recurrenceFrequency` | Blank | Only unapproved observation: `Minute` (harvested flow) |
| `recurrenceInterval` | Blank | Only unapproved observation: `1` (harvested flow) |
| `retryMaxAttempts` | Blank | Three conflicting unapproved defaults — see §4 |
| `retryDelayMinutes` | Blank | Nothing in the corpus is expressed in minutes — see §4 |
| `permanentFailureThreshold` | Blank | No alert exists at any threshold — see §4 |
| `claimExpiryMinutes` | Blank | No claim or lease concept exists in the tree at all |
| `processorConcurrency` | Blank | Two unapproved observations — see §4 |
| `businessOwner` | Blank | Sign-off table row empty |
| `technicalOwner` | Blank | Sign-off table row empty |
| `securityPrivacyOwner` | Blank | Sign-off table row empty |
| `deploymentWindow` | Blank | Zero matches for "deployment window", "maintenance window", "change window", "release window", "cutover window", "go-live date" |
| `rollbackWindow` | Blank | Zero matches for "rollback window", "decision window", "rollback period" |
| `hypercarePeriod` | Blank | Zero matches for "hypercare" or "hyper-care" anywhere in the corpus |

---

## 4 · Unapproved in-repository defaults

**These are not approved values and must not be entered on the form.** They are recorded so
the approving authority can see what the code currently does, and decide against it knowingly.

### Retry and failure handling

| Observation | Where | Scope |
|---|---|---|
| `item.tries >= 5` → drop, silently | `document-portal/js/core.js:286` | Browser offline outbox |
| `"maxAttempts": 5`, `"capacity": 50` | `docs/reference/flow-contracts/DOCUMENT_PORTAL_FLOWS.json` → `commonMechanics.outboxRetry` | Contract of record for the same outbox |
| `maxAttempts: 3, initialDelayMs: 1200, factor: 2` | `config/acknowledgement-flow.config.js:8` | Acknowledgement queue |
| `type: Exponential, count: 4, minimum_interval: PT20S, maximum_interval: PT5M` | `docs/reference/foundational/flows/details/Download PowerAutomate_SP_Audit_AI_Machine_Build_Spec.md:52` | SharePoint audit flow, unrelated subsystem |
| `retry: 1` (reads) · `retry: 0` (AI_CHAT, DYNAMIC_ACTIONS, OTP_GENERATE, OTP_VERIFY) | `config/fetch-policy.config.js:5-12` | Client fetch policy, per endpoint |

Four different retry families (5, 3, 4, and 1/0 per endpoint) govern four unrelated
subsystems. **No delay anywhere in the corpus is expressed in minutes.**

### Permanent failure

No permanent-failure alert exists at any threshold. The portal outbox reaches five attempts
and calls `PF.outbox.drop(item)` with no notification to anyone. The
`DGO_PendingWrites` SharePoint list carries the columns that would support one —
`RetryCount`, `LastRetryAt`, `ErrorMessage`, `Status`, `ResolvedAt`
(`docs/reference/sharepoint-provisioning-spec.json`) — but no threshold value and no alert
action are defined against them.

### Concurrency

| Observation | Where |
|---|---|
| `"concurrency": "sequential, one ticket at a time"` | `docs/reference/flow-contracts/DOCUMENT_PORTAL_FLOWS.json`, UPLOAD call site |
| `concurrency_control: On`, `degree_of_parallelism: 1` | `Download PowerAutomate_SP_Audit_AI_Machine_Build_Spec.md:476-477` |

### Notification targets

**No flow in the delivered set sends mail to any address other than the caller's own.** In
all seven flows the recipient resolves to the request body:

```
emailMessage/To  →  @outputs('Compose_Email')
Compose_Email    →  @toLower(trim(coalesce(triggerBody()?['email'], '')))
```

Verified in `04-portal-verify-request.flow.json`, `05-portal-verify-confirm.flow.json`,
`03-portal-support.flow.json` and `06-portal-status.flow.json`. There is no administrator
recipient, no queue recipient and no escalation recipient to recover — so neither
`administratorTarget` nor `intakeTarget` has a repository answer even in unapproved form.

### Intake routing

A routing table exists (`config/correspondence-categories.config.js`,
`config/assignment-cascade.config.js` → `dgs@`, `policy@`, `operations@`, `finance@`, `ict@`,
`registry@`), and the repository twice records that it carries no approval:

- `docs/deployment/MINIMAL-PILOT.md` §8 — *"Confirm the routing table below. It decides which
  desk each kind of correspondence lands on, and nobody has approved it yet."*
- `scripts/commission-check.mjs:408` — a `manual('governance', …)` finding: *"docs/deployment/
  MINIMAL-PILOT.md §8 decides which desk each kind of correspondence lands on. It has not been
  approved by anyone."*

`docs/audits/OPERATIONAL_READINESS_AUDIT.md` §6 lists approving it among the eight things the
audit could not do: *"A governance decision, not a technical one."*

---

## 5 · Method

Search was performed over the recovered tree at
`ECM_DOCS_DEV-main/` — 679 files across 13 top-level directories, plus the nested
`docs/reference/foundational/lineage/Obsidian_Pro_Active_v7.zip`, which was extracted and
searched separately and contributed no operational parameter (its `DEFAULT_ATTEMPTS = 5` is an
OTP entry-attempt cap in a superseded lineage bundle, not a delivery retry).

Each field was searched by parameter name first, then by concept, then by the shape a value
would take — JSON keys, YAML keys, prose phrasings and, for the mailbox and commit fields, by
regular expression over the whole corpus. A field is recorded as blank only where all three
passes returned nothing.

### Why only one field is answerable

Eighteen of the twenty-one fields **name a source that is not this repository.** The form's own
`Source:` lines settle it before any search runs:

| Source declared on the form | Fields | Answerable from the repository |
|---|---|---|
| Source: repository | 1 — `serviceMailbox` | **1 of 1** |
| Source: remediation package | 1 — `releaseId` | 0 — no such package exists in the tree |
| Source: repository remediation record | 1 — `recurrenceTimeZone` | 0 — no such record exists in the tree |
| Source: tenant evidence required | 3 | 0 — by the form's own definition |
| Source: agency decision required | 15 | 0 — by the form's own definition |

Three fields were pointed at the repository. It answers one of them outright. For the fifteen
agency-decision fields an empty result is the correct finding, not a shortfall in searching:
the decisions have not been taken, and the sign-off instrument that would record them is blank.

### Coverage

| | |
|---|---|
| Files searched | 679 |
| Bytes searched | 27,541,592 |
| Binary Office files unpacked and searched as text | 2 — `DGO_R11_6_R5_Full_Flow_Extraction_Matrix 2.xlsx` (908k chars), `Flow_Details_Pack_Styled.docx` (715k chars) |
| Nested archives extracted and searched | 2 — the repository export itself, and `lineage/Obsidian_Pro_Active_v7.zip` |
| File types included | All. No extension filter was applied on the final pass — `.html`, `.xlsx`, `.docx`, `.ps1`, `.mmd`, `.woff2` and extensionless files included |

Concept sweep over the full corpus plus the extracted Office text, counting every matching line:

| Concept | Hits | What the hits were |
|---|---|---|
| hypercare / hyper-care | 0 | — |
| deployment / maintenance / change / release / cutover window | 0 | — |
| rollback window · rollback period · decision window | 0 | — |
| claim expiry · lease expiry | 0 | — |
| permanent failure · dead-letter | 0 | — |
| retry delay · delay minutes | 0 | — |
| `"timeZone"` · timezone · time zone | 0 | — |
| release id · releaseId | 0 | — |
| intake target · intake mailbox/queue | 0 | — |
| administrator target · admin mailbox/queue | 3 | All three are `user-admin must queue…` in a lineage test assertion — coincidental substring, not a mailbox |
| business owner · technical owner · technical lead | 2 | The two empty sign-off rows, and nothing else corpus-wide |
| security / privacy authority | 10 | The empty `Security Reviewer` row, plus `dpo@nitda.gov.ng` as a portal contact and one instruction to *notify* a DPO. No person is named |
| processor concurrency | 1 | `degree_of_parallelism: 1` in the unrelated SharePoint audit spec |
| `WAT` / West Africa Time | 14 | Portal opening-hours display text (`08:00 – 17:00 WAT`) and one document-generation timestamp. No flow time-zone setting |
| approved by · signed by · signed off | 19 | None records an approval of an operational parameter. The nearest is `commission-check.mjs:410` — *"It has not been approved by anyone."* |

Five root documents and fifty-one further files not opened during the first pass —
`PLATFORM_DOCUMENTATION.md`, `README.md`, `docs/STATUS_REPORT.md`, `docs/README.md`,
`CONTRIBUTING.md`, the `lists-and-data` HTML exports, the legacy SPAs, the canvas exports, the
verification transcripts and both root-level probe transcripts — were swept for all eleven
governance concepts and returned **zero hits between them**.
