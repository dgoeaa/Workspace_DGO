# SharePoint column provisioning — runbook

> **Done — 2026-08-19.** All 85 columns were created and the estate is **97/97**. Run record:
> [`evidence/2026-08-19-provisioning-run.json`](../../evidence/2026-08-19-provisioning-run.json).
> The rest of this page stands as the runbook for a re-run, a new environment, or a fresh
> tenant.

> **Handing over to pilot operation?** Start at [`HANDOVER.md`](./HANDOVER.md) — it holds
> the close-out state, today's measured numbers, and what the next operator picks up.

**What this closes:** the 85 SharePoint columns the provisioning gate lists as missing —
84 across the twelve document-portal lists, plus `DGO_AccessScopes.AccessScopeId` on the
governance site. After one run the estate is 97/97 and the gate can be signed off.

**How long it takes:** about two minutes, once. It took four.

---

## Why the earlier attempts could not have worked

Three artifacts were built to do this job: `scripts/setup-sharepoint-portal.ps1`, the
`07-portal-provisioning` Power Automate flow, and the specification both read,
`docs/folio-Master-Flows-and-Endpoints/packages/sharepoint-lists.json` (specVersion 1.0).

All three address the lists by the names in that specification:

| specVersion 1.0 says | The tenant actually has |
| --- | --- |
| 7 lists | 13 lists (12 portal + 1 governance) |
| named `NITDA_Portal_Submissions`, `NITDA_Portal_Attachments`, … | named `Portal Registry`, `Portal Attachments`, … |
| all on `/sites/NEDMS` | split across `/sites/NEDMS`, `/sites/Global_Digital_Documents_Centre` and `/sites/DGO_ECM_GOVERNANCE` |
| 70 fields | 97 columns |

Every lookup — `getbytitle('NITDA_Portal_Submissions')` in the flow, `Get-PnPList -Identity
"NITDA_Portal_Submissions"` in the script — resolves against a name no list carries. The
name misses, the "list does not exist" branch fires, and the run's next move is to create a
*fourteenth* list rather than to add a column to a real one. No amount of debugging the flow
could change that, because the flow was never pointed at the twelve lists that need columns.

Two further things made the flow the wrong shape for this job regardless of the names:

- Its `Compose_Site_Url` holds a single site, and every `Send an HTTP request to SharePoint`
  action is bound to that one `dataset`. The estate spans three site collections, so one run
  physically cannot reach all of it.
- A nested `Foreach` issuing a `GET` and a conditional `POST` per column is 200-plus
  connector calls where a 404 on the existence probe is an action failure, so each of them
  needs its run-after configured or the whole run fails. That is a large amount of fragile
  machinery to create columns, which is a one-time act, not a workflow.

Provisioning is a one-time act. It belongs in a script that runs once and prints what it did,
not in a flow that has to be maintained, imported, connection-mapped and re-run.

---

## The specification

[`portal-field-spec.json`](./portal-field-spec.json) (specVersion 2.0.0) is the single source
of truth, and both runners below read it. It was generated from the tenant capture, so it
carries what is actually there:

- 13 lists, addressed by **list GUID**, not by title. A renamed or re-titled list still
  resolves, and a typo can never produce a duplicate list.
- Each list's real site URL, so the run spans all three site collections.
- All 97 columns with type, required, indexed and unique exactly as the gate states them.
- `capturedState` per column — what the 2026-08-14 capture found. It is documentation, not
  control flow. Both runners re-read the live list and create only what is genuinely absent,
  so a column added since the capture is skipped rather than duplicated.

Lists are never created. All thirteen already exist.

---

## Path A — from the browser (no installs, nothing to configure)

Use this if you want it done now. It uses the SharePoint session you are already signed into,
so there is no module to install, no app registration, no admin consent, and nothing to
approve.

Provisioning these columns is **§2 of Part 3 of [`RUNBOOK.md`](../../../deployment/RUNBOOK.md)**, which is the
only document that carries the step. The three sites share one origin, so one run reaches all of them. What follows
describes what it creates.
4. Read the table. When it looks right, change `const DRY_RUN = true;` at the top of the file
   to `false`, paste again, and it applies.

You need **Manage Lists** on each site — Site Owner is enough. Tenant admin is not required.

It prints a per-column ledger and leaves it on `window.spLedger`, so
`copy(JSON.stringify(spLedger, null, 2))` gives you the run evidence for the gate.

> If devtools paste is blocked, Edge and Chrome ask you to type `allow pasting` into the
> console once, then accept the paste.

## Path B — from PowerShell (the repeatable path)

Use this when the run needs to be scripted, repeated, or logged to a file.

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser      # first time only

./scripts/provision-sharepoint-fields.ps1 -ClientId <guid> -WhatIf      # dry run, all sites
./scripts/provision-sharepoint-fields.ps1 -ClientId <guid>              # create the 85 columns
./scripts/provision-sharepoint-fields.ps1 -ClientId <guid> -VerifyOnly  # 97/97 sign-off evidence
```

`-ClientId` is an Entra application (client) ID. PnP.PowerShell 2.x removed the built-in
multi-tenant app it used to sign in with, so interactive sign-in now needs a registration in
your own tenant — that is the one dependency Path A does not have, and the reason Path A
exists. `-SiteUrl` restricts a run to one site; omit it to do all three in one pass.

Every run writes `sharepoint-field-ledger.csv` at the repository root: one row per column,
with `created`, `present`, `would create` or the failure message.

---

## Confirming it worked

Either runner, re-run, must report **97/97 present and 0 created**. That is the gate evidence:
`-VerifyOnly` on Path B, or a second paste on Path A, which by construction creates nothing
the second time.

### What the 2026-08-19 run reported

| Pass | Started (UTC) | Created | Already present | Failed |
| --- | --- | --- | --- | --- |
| Apply | 04:02:44 | **85** | 12 | **0** |
| Verify | 04:06:57 | **0** | **97** | **0** |

The verify pass creating nothing is the proof, and it is a stronger one than the apply pass:
it says every column the specification names was already there when the run looked.

The ledger reconciles against the specification column for column — 97 rows for 97 columns,
no row in one and not the other, no disagreement on site or type, and **every column matched
what the 2026-08-14 capture predicted**: the twelve marked `LIVE` came back `present`, the 85
marked `MISSING` came back `created`, with no exceptions. That last point matters beyond this
run — it means the capture the whole gate is built on was right about the estate.

`tests/sharepoint-field-spec.test.mjs` re-reads the run record on every `npm test` and fails if
any of that stops holding, so the evidence is checked rather than merely filed.

### Gate status

| Gate item | Was | Now |
| --- | --- | --- |
| Document portal | `REMEDIATE BEFORE TRAFFIC` | **CLOSED** — 96/96 across the twelve portal lists |
| Internal governance | `REMEDIATE IF GOVERNANCE IN RELEASE` | **CLOSED** — `AccessScopeId` created, 1/1 |
| Internal operations | `BLOCK FULL-SCOPE ABSOLUTE SIGN-OFF` | **CLOSED** — 20/20 contract keys, 16/16 flows, from deployed definitions |

> The flow export that closed the third item also showed that the flows serving portal traffic
> today do not read or write the twelve lists these 96 columns were added to — and that the
> bridge which does read them, `ECM_DOCS_INTAKE`, projects 22 of the columns this run created.
> The estate is the target, and the flows in between are wired to a previous generation.
>
> **[`FLOW_STANDARD.md`](./FLOW_STANDARD.md)** is the build standard the legacy flows already
> follow, written down and measured — `npm run flowstandard`. 13 of 57 flows conform fully; the
> portal flows adopted the response envelope and skipped the structure, the error handling, the
> redaction and the telemetry.
> **[`DECISIONS.md`](./DECISIONS.md)** settles the five open questions — five flow edits and one
> config key, no new flow and no new trigger. Read it first.
> **[`PORTAL_CIRCLES.md`](./PORTAL_CIRCLES.md)** is the estate end to end — seven loops, who
> starts each, what closes it, and the one that does not.
> **[`PORTAL_WIRING.md`](./PORTAL_WIRING.md)** is the per-operation specification beneath it:
> which flow must read and write which list, the trust boundary the portal must keep, and a
> live gap register. `npm run wiring` reports it; today it reads 0 of 41 operations and 25
> boundary crossings.
> **[`remediation/`](./remediation/)** holds all five visits as action-by-action artifacts,
> validated against the field specification by `npm run test:remediation` before any of them is
> pasted. Start with visit 1, the OTP estate split — the one change that closes an exposure
> rather than completing a feature.

**Internal operations** (`7 of ~20 flow definitions available`) is a coverage gap
in the flow sweep, not a provisioning gap — no column is missing for it. It is now costed and
runnable: **9 flow exports**, because several contract keys share one physical flow, five flows
already had definitions here that were never counted, and two more were recovered from deleted
git history — one of which closes four contract keys on its own. The site captures the
sweep resolves against are in the repository too, so no fresh tenant capture is needed.

See **[`INTERNAL_OPS_COVERAGE.md`](./INTERNAL_OPS_COVERAGE.md)** — which flows remain, their
workflow ids, how to export one, and how to fold it in.

---

## Superseded by this runbook

| Artifact | Status |
| --- | --- |
| `docs/folio-Master-Flows-and-Endpoints/packages/sharepoint-lists.json` (specVersion 1.0) | Superseded by `portal-field-spec.json`. Retained: it is what the six portal flows' field references were originally written against. |
| `scripts/setup-sharepoint-portal.ps1` | Superseded. Targets seven list names that do not exist in the tenant. |
| `07-portal-provisioning` flow | Superseded. Same wrong names, and single-site by construction. |

Do not run the superseded artifacts against the tenant: on a name miss their next action is to
create a new list, which would add duplicates alongside the twelve real ones.
