# Closing gate item 3 — internal operations flow coverage

> **CLOSED — 2026-08-19.** 57 flow definitions were exported from the live tenant and swept.
> Coverage is **20/20 contract keys, 16/16 physical flows**, derived from deployed definitions
> rather than from captures or inference. Evidence:
> [`../../contracts/deployed/`](../../contracts/deployed/) and
> [`../../../reference/flow-list-map.json`](../../registers/flow-list-map.json).
>
> The export also answered a question this gate did not ask. Read
> **What the deployed flows actually touch**, at the foot of this page, before treating the
> portal as ready for traffic.

**The gate says:** *Internal operations — coverage is partial: 7 of about 20 flow definitions
available. BLOCK FULL-SCOPE ABSOLUTE SIGN-OFF.*

**What that actually costs:** **9 flow exports.** Not 20, not 13. Three things shrink the
number, and all three are now checked rather than asserted.

---

## Why it is 11, not 15

The gate counts **contract keys**. The platform declares 20 of them, but a key is not a flow —
several keys ride on one flow and are discriminated by the `action` in the request body, never
by URL:

| Physical flow | Contract keys it serves |
| --- | --- |
| `DYNAMIC_GLOBAL_ACTIONS` | `DYNAMIC_ACTIONS`, `EMAIL`, `DISPATCH_OUTBOUND`, `ARCHIVE_REFERENCE` |
| `SUBSIDIARY_ACTIONS` | `SUBSIDIARY_ACTIONS`, `FETCH_ACTIVITIES` |

So 20 keys are served by **16 flows**, and one export of `DYNAMIC_GLOBAL_ACTIONS` closes four
keys at once. That arithmetic lives in
[`../../../reference/internal-flow-register.json`](../../registers/internal-flow-register.json),
and `tests/flow-list-map.test.mjs` fails if it stops matching
`config/endpoints.config.js#EndpointContracts` — including the `sourceKey` each contract
declares, so the register cannot quietly disagree with the code about which flow serves what.

Of those 16, **5 already have a definition in this repository** and were never counted:

| Physical flow | Definition |
| --- | --- |
| `REFERENCE_DATA` | `Fetch_References_and_Lookups_Data - POST__…CU49__full_definition.json` |
| `OTP_GENERATE` | `Web - OTP Generate__…CU174__full_definition.json` |
| `OTP_VERIFY` | `Web - OTP Verify__…CU170__full_definition.json` |
| `BULK_ASSIGNMENT` | `run-records/deployed_bulk_task_assignment_create_task__…CU64/definition.json` |
| `EMAIL_RELATED_TASK` | `run-records/web_email_task_created__…CU254/definition.json` |

And **two more were recovered from deleted git history** — see below — bringing it to 7.

16 − 7 = **9 flows left to export.**

### The two recovered from history

`git rev-list --all --objects` turns up 25 distinct flow definitions across the repository's
whole history, two of which were deleted from the tree and never swept. Both were captured in
the tenant's own `flow_run_record` wrapper — a definition buried under `design_definition.
definition` inside a full run trace — which is why nothing that reads a flow export had ever
recognised them:

| Recovered | Workflow | Why it matters |
| --- | --- | --- |
| `Dynamic_Multi-Actions` | `bc83d98acf474a088832d78f50085388` | **Closes four contract keys at once.** Its own `workflow_identity` matches the id already recorded for `DYNAMIC_GLOBAL_ACTIONS`, so the attribution is now confirmed by the flow rather than inferred from a labelled URL. 252 actions, 30 SharePoint actions, 7 lists. |
| `Copy of - Fetch_All_Data_&_References_Matrix-POST` | `4a250f97181b4a28abc1d0fb0f7d4c4d` | The only fetch-all-shaped definition available. It is a **copy**, so the deployed `FETCH_ALL` should still be exported to confirm the footprint — but it is the flow that surfaced the two lists below. |

They are filed under
`../../contracts/recovered/` (retired 2026-10-05: [flow-retirement.json](../../registers/flow-retirement.json)) as
definition plus workflow identity only. The run traces they came from carry signed trigger
URLs and, in one case, a 23 MB response payload; none of that is kept, and neither recovered
file contains a `sig` token.

### The gate's own worry, confirmed

The Coverage sheet warned: *"A list touched ONLY by one of the unswept flows would not
appear."* It does not appear, and now it has:

| List | Site | Touched by |
| --- | --- | --- |
| `DGCEO_AttentionItems` | NITDADGO-EAAACTIVITYTRACKING | the recovered fetch-all copy |
| `DGCEO_Events_Log` | NITDADGO-EAAACTIVITYTRACKING | the recovered fetch-all copy |

Neither is in the 33-list adopted set. Two definitions recovered from history moved the
distinct-lists count from 7 to 11, of which these two were previously unknown to the platform's
own inventory. That is the concrete reason the remaining nine exports are worth doing rather
than waived: this is what an unswept flow hides.

Because the flow is a *copy*, this does not by itself prove the deployed `FETCH_ALL` reads
those lists — it proves the class of finding is real, and that the adopted set was incomplete.

### What the definitions say about themselves

Every `flow_run_record` states its own workflow id in `workflow_identity.full_resource_id`.
Reading it — which nothing did before — turned four attributions from readings into facts and
opened one new conflict:

| Flow | Effect |
| --- | --- |
| `Fetch_References_and_Lookups_Data` | **Confirms** `REFERENCE_DATA` = `ff455c68e9ac493e858fb984bcfd01fb` |
| `Dynamic_Multi-Actions` | **Confirms** `DYNAMIC_GLOBAL_ACTIONS` = `bc83d98acf474a088832d78f50085388` |
| `Web - Email Task Created` | **Settles** `EMAIL_RELATED_TASK` = `a942d230337c4ddfa9a386e92bbd048b` — the two corpora disagreed; the flow itself decides |
| `Web - OTP Generate` / `Verify` | **Supplies** `314aaf27593147089b38322e5ca25936` and `43879c5165de439680055ab4258b3f27`, which no labelled register held |
| `Deployed Bulk Task Assignment` | **Conflicts**: declares `c43388639d14452faef4ca3042a95b23`, while the labelled register gives `7e71fffe770a45ccb93bf216bb53786e` for "BULK ASSIGN". Both recorded, neither picked; `config.local.js` settles it |

`tests/flow-list-map.test.mjs` now fails if the register ever contradicts a workflow id that
the definition it names declares for itself.

---

## What the sweep already establishes

`node scripts/flow-list-sweep.mjs` reads every Power Automate definition in the tree — 24
distinct exports, recognised by shape rather than by filename, with byte-identical copies
counted once — and derives the list footprint from the action graph. Against the definitions
available today, internal operations touches **seven lists, all of them already in the adopted
set**, none of them new:

| Site | List | Touched by |
| --- | --- | --- |
| NITDADGO-EAAACTIVITYTRACKING | `Global Tracking Queue` | Fetch_Tasks, bulk assignment, create task, email→task |
| NITDADGO-EAAACTIVITYTRACKING | `DGO DIGITAL OPS` | bulk assignment, create task |
| NITDADGO-EAAACTIVITYTRACKING | `DEV_OPS_Global_Tracking_Queue` | email→task |
| NITDADGO-EAAACTIVITYTRACKING | `Organizaitonal_Departments_Information` | references/lookups, create task, email→task |
| NITDADGO-EAAACTIVITYTRACKING | `Organizational_Categories_Matrix` | references/lookups |
| NITDADGO-EAAACTIVITYTRACKING | `OTP_Transactions` | OTP generate, OTP verify |
| NITDADGO-EAAACTIVITYTRACKING | `AI TEXT DATA LOG` | dgso_incoming_ai_processing |

Every one resolved **by GUID** against
[`../../../reference/sharepoint-list-index.json`](../../../reference/sharepoint-list-index.json) —
all 326 lists across the five captured sites. That index is what removes the gate's stated
dependency: *"Any list they name will resolve against the site captures already in this
workbook — no new capture is needed, only the flow definitions."* The captures are now in the
repository, so the sweep needs nothing but the definition.

The map itself is [`../../../reference/flow-list-map.json`](../../registers/flow-list-map.json),
regenerated with `--write` and held current by `npm run test:flowmap`.

---

## The 9 exports

Workflow ids come from the corpus's own labelled URL registers. Ids only — a `sig` token is a
bearer credential and is never recorded, the same policy `scripts/flow-inventory.mjs` follows.

| # | Physical flow | Workflow id | Closes |
| --- | --- | --- | --- |
| 1 | `SUBSIDIARY_ACTIONS` | `85c556f10b8244ba9d839a2ebe240b91` | 2 keys |
| 2 | `GET_DOCS` | `818ec4053f1e4f0b87845114241d8b74` | 1 |
| 3 | `SINGLE_ASSIGNMENT` | `f71397ff3ca145059dc8f78c04923e9f` | 1 |
| 4 | `FETCH_EMAIL_ATTACHMENTS` | not recorded | 1 |
| 5 | `BULK_ASSIGNMENT_DIRECT` | not recorded | 1 |
| 6 | `AI_DOC_ANALYSIS` | not recorded | 1 |
| 7 | `AI_EMAIL_ANALYSIS` | not recorded | 1 |
| 8 | `AI_CHAT` | not recorded | 1 |
| 9 | `SCAN_INTAKE` | not recorded | 1 |

Worth exporting alongside them, though neither is counted above: the deployed **`FETCH_ALL`**
(to confirm the recovered copy's footprint, including the two DGCEO lists) and the **six
document-portal flows** (see the last section).

The environment is `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`, recorded in every recovered
definition's `workflow_identity.tags`.

For the six with no recorded id, the operator's `config/config.local.js` holds the live URL
for each key, and the 32-hex string after `/workflows/` in it *is* the id. That file is
git-ignored and never leaves the operator's machine, which is why the mapping is not stored
here.

### Exporting them all at once (recommended)

[`scripts/export-power-automate-flows.ps1`](../../../../scripts/export-power-automate-flows.ps1)
does the whole set in one command.

```powershell
Install-Module Microsoft.PowerApps.PowerShell -Scope CurrentUser -AllowClobber   # first time
./scripts/export-power-automate-flows.ps1 -ListOnly    # sign in, see what you can reach
./scripts/export-power-automate-flows.ps1              # export what coverage still wants
```

**No Entra app registration and no admin role.** `Add-PowerAppsAccount` signs in through the
first-party client id published inside the module, so there is nothing to register, no client
secret and no admin consent. The export uses the maker cmdlet `Get-Flow`, never the
`Get-AdminFlow` family, so no tenant-admin or Power Platform admin role is involved.
`Install-Module -Scope CurrentUser` installs into your own profile and needs no local
administrator either.

What it needs instead is **ownership**: `Get-Flow` returns the flows you own or co-own. That is
the honest trade for not being an admin, and it is the one thing that can leave a gap. The
script names every target it could not reach rather than reporting a clean run, so if a flow
belongs to a colleague you will see exactly which one — fix it by having them add you as a
co-owner (the flow → **Share**), by having them run the script, or by exporting that one by
hand below.

It reads its target list from `flow-list-map.json`, so it asks only for flows coverage still
wants and stops asking once they are in. Signed trigger tokens are redacted on write — a flow
definition can call other flows by signed URL, and those are bearer credentials.

> The PowerApps cmdlets are built for Windows PowerShell 5.1. If PowerShell 7 errors on import,
> run the same commands under `powershell.exe` rather than `pwsh`.

### Exporting one flow by hand

1. Power Automate → **My flows** → open the flow → **Edit**.
2. **⋯ (more)** → **Peek code** on the trigger gives one action; for the whole flow use
   **Export → Get flow definition** in the newer designer, or **Save As → Export Package
   (.zip)** and take `Microsoft.Flow/flows/<guid>/definition.json` out of the zip.
3. Save it as `docs/folio-Master-Flows-and-Endpoints/contracts/<FlowName>__full_definition.json`.

The sweep accepts all four export shapes — a bare Code-view definition, an API response with
the workflow under `properties.definition`, this repository's own `.flow.json` wrapper, and the
tenant capture harness's `flow_run_record` (definition under `design_definition.definition`) —
so whichever route is easiest is fine.

### Folding an export in

```bash
node scripts/flow-list-sweep.mjs "docs/folio-Master-Flows-and-Endpoints/contracts/<TheExport>.json"
```

That prints the flow's list footprint immediately, resolved to site and title. Then attribute
it in `docs/folio-Master-Flows-and-Endpoints/registers/internal-flow-register.json` (add the path to that flow's `definitions`)
and re-run:

```bash
node scripts/flow-list-sweep.mjs --write
npm run test:flowmap
```

Coverage moves by one flow. It currently reads **7/16 physical flows, 10/20 contract keys**.
When it reads 16/16, gate item 3 is closed and the sweep is the evidence.

If a newly exported flow names a list the index does not hold, the sweep says which and why —
an unknown **GUID** means that site was never captured, an unknown **name** means no list in
the estate carries that title. It never guesses.

---

## What the deployed flows actually touch

The six `01-06` definitions in this repository address seven lists by the names
`NITDA_Portal_Submissions`, `NITDA_Portal_RateLimits`, `NITDA_Portal_Attachments`,
`NITDA_Portal_SubmissionEvents`, `NITDA_Portal_SupportCases`,
`NITDA_Portal_VerificationChallenges` and `NITDA_Portal_VerificationProofs`. No list in the
estate carries any of those names. The export settles what that means, and the answer is not
the one either earlier reading predicted.

**The deployed flows do not share the defect.** `NITDA_Portal_*` appears in **none** of the 57
exported definitions. The `01-06` files are stale design artifacts, superseded by
[`../../contracts/deployed/`](../../contracts/deployed/).

**But the deployed portal flows do not use the twelve provisioned lists either.** Of 57
deployed flows, **four** reference the provisioned estate at all, and **three of those four are
provisioners**:

| Flow | What it does with the estate |
| --- | --- |
| `ECM_DOCS_INTAKE` | reads `Portal Registry` — the only operational consumer, and read-only |
| `Global_Gap_Remediation_Provisioning` | provisions all twelve lists plus `DGO_AccessScopes` |
| `Portal_Datta_Architecture_Provisioning` | provisions the same twelve |
| `Repair the DGO_* governance lists` | provisions `DGO_AccessScopes` |

The flows serving the public portal — `Portal_UBMISSION_ECM_DOCS`, `SUBMISSION_ECM_DOCS_PORTAL`,
`Portal_UPLOAD_ECM_DOCS`, `UPLOAD_ECM_DOCS_PORTAL`, `Portal_Upload_HTTP`,
`Portal_ECM_DOCS_STATUS`, `Portal_ECM_DOCS_SUPPORT`, `Portal_Verify`, `Portal_Verify_Confirm` —
write to a different estate entirely:

| Site | List | Used by |
| --- | --- | --- |
| NEDMS | `NITDA_Central_Registry` (document library) | submission, upload, status, support |
| NITDADGO-EAAACTIVITYTRACKING | `Global Tracking Queue` | submission, upload, status, support |
| NITDADGO-EAAACTIVITYTRACKING | `OTP_Transactions` | verify, verify-confirm |

Not one of them touches `Portal Registry`, `Portal Attachments`, `Portal Status Timeline`,
`Portal Upload Tickets`, `Portal Rate Limits`, `Portal OTP Codes`, `Portal Verification Proofs`,
`Portal Support Cases`, `Portal Audit Events`, `Portal Flow Telemetry` or
`Portal Outbox Receipts`.

### What that does and does not change

The 96 columns are correctly provisioned. The specification, the run and the 97/97 verification
all hold, and [`README.md`](./README.md) stands as written.

What does not hold is the inference that provisioning them readies the portal for traffic. The
gate reads `REMEDIATE BEFORE TRAFFIC` on the Document portal row; on the evidence of the
deployed definitions, the flows serving portal traffic today never read or write those columns.
Three readings are open, and the repository cannot choose between them:

1. The twelve lists are the **target** estate and the deployed flows are the previous
   generation, due to be replaced once the `01-06` design is built and deployed.
2. The twelve lists are **superseded**, and the provisioning was of a design since abandoned in
   favour of `NITDA_Central_Registry` plus `Global Tracking Queue`.
3. **Both** estates are live for different paths — `ECM_DOCS_INTAKE` does read `Portal
   Registry`, so something is expected to populate it.

Which one holds is an agency decision, not a reading available from the tree. What the sweep
establishes is that the decision has to be made: the design in this repository, the estate that
was provisioned, and the flows that are deployed are three different things, and no two of them
currently agree.

### Seven flows carry a live third-party API key

The export was blocked by GitHub's push protection, which is how this was found. It flagged
three; a scan for every credential class found **seven flows** holding a key pasted directly
into an HTTP action:

| Credential | Flows |
| --- | --- |
| Google API key (`AIza…`) | `DGSO INCOMING AI PROCESSING`, `Digital Hub Email AI Assist`, `Web - Email AI Assist`, `Web - Email To Task Processing` |
| OpenRouter API key (`sk-or-…`) | `Instant OpenRouter AI Chat` |
| OpenAI API key (`sk-…`) | `Web - Preprocess user message` |
| Hugging Face token (`hf_…`) | `Persistent GPT AI Chat in App` |

They are redacted in the copies committed here. **Redaction is not rotation.** Every one of
those keys is still live at its provider and still embedded in the deployed flow, where anyone
who can open the flow in the designer can read it. Rotate each at the provider, then hold the
new value in a Power Automate environment variable or an Azure Key Vault reference rather than
in the action, so the next export cannot carry it.

`scripts/redact-signed-urls.ps1` now removes all of these classes, not only signed trigger
URLs, and `tests/flow-list-map.test.mjs` fails if a committed definition carries any of eight
credential shapes — or if the redaction script stops covering one the test scans for.

### Two flows embed another flow's signed trigger URL

`01-Fetch_Docs_POST` and `02-Fetch_Docs_POST` each call another flow by signed URL. Those tokens
were redacted before the definitions entered this repository, but they are live in the tenant:
rotating the called flow's trigger breaks both callers silently, because the URL is baked into
their definitions rather than resolved from configuration. Worth recording against Gap G-03
before any rotation.

### Lists the adopted set did not know about

The sweep resolves 16 distinct lists across every definition read. Four are outside the 33-list
adopted set:

| Site | List | Found via |
| --- | --- | --- |
| NEDMS | `NITDA_Task_Force` | deployed export |
| NITDADGO-EAAACTIVITYTRACKING | `DGCEO_AttentionItems` | fetch-all |
| NITDADGO-EAAACTIVITYTRACKING | `DGCEO_Events_Log` | fetch-all |
| NITDADGO-EAAACTIVITYTRACKING | `Fast_Track__Digital_Support` | deployed export |

This is exactly what the Coverage sheet warned of — "a list touched ONLY by one of the unswept
flows would not appear" — and it is why the exports were worth taking rather than waiving.
