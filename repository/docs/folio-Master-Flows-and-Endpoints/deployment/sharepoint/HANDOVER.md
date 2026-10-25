# Handoff — portal flow remediation

> **This document carries no commands.** It is the SharePoint estate handover record. The steps for portal and endpoint
> commissioning and for governance tenant remediation both live in
> [`../../../deployment/RUNBOOK.md`](../../../deployment/RUNBOOK.md) — Part 3 and Part 5 of it respectively. **That one
> document is the only one in this repository that carries a step.** Until 2026-09-24 the two
> parts stood as separate runbooks, `PORTAL-TENANT-RUNBOOK.md` and
> `GOVERNANCE-TENANT-RUNBOOK.md`; they were consolidated, not changed.


Session closed 2026-08-20. Branch `claude/sharepoint-lists-gap-bqo7j7`, 24 commits.
This is the entry point. Everything below is measured or cited; nothing is estimated.

---

## 1. What this work is

Ninety-seven SharePoint columns were provisioned across thirteen lists to serve the NITDA
document portal. The flows serving that portal did not use them — they were writing to
`NITDA_Central_Registry`, `Global Tracking Queue` and `OTP_Transactions` on the **internal
operations** site, which anonymous public callers should never reach.

The work is moving eleven flows onto the provisioned estate, closing the boundary, and bringing
them onto the build standard the estate's own best flows already follow.

---

## 2. Where it stands

### Finished

| | Evidence |
|---|---|
| **97 columns exist**, verified 97/97 | [`evidence/2026-08-19-provisioning-run.json`](../../evidence/2026-08-19-provisioning-run.json) — 85 created, 12 already present, 0 failed |
| **Internal-operations coverage closed** — 20/20 contract keys, 16/16 physical flows | [`INTERNAL_OPS_COVERAGE.md`](./INTERNAL_OPS_COVERAGE.md) |
| **Nine decisions recorded**, D1–D9, none open | [`DECISIONS.md`](./DECISIONS.md) |
| **`Portal_Verify` fully remediated** in the live tenant | `VERIFY` reads 8/8 |
| **`Portal_Verify_Confirm` patched and verified**, not yet applied | `WIRED VERIFY_CONFIRM 7/7` measured on disk |
| **Every remediation is generated, not transcribed** | `npm test` fails if any artifact or worksheet drifts from the live measurement |

### The numbers, and why two of them disagree

| Measure | In the tenant | In this repository |
|---|---|---|
| Required operations | **8 / 49** | 0 / 49 |
| Endpoints fully wired | **1 / 6** | 0 / 6 |
| Boundary crossings | **17** | 17 |

**The tenant is ahead of the repository.** `Portal_Verify` was remediated by hand and confirmed
against the live tenant, but the operator's `git push` was refused — `kanihamza` has no write
access to `dgoeaa/ECM_DOCS_DEV` (HTTP 403). That export sits in an unpushed local commit,
`ba7c94a`. **Recovering it is the first task in section 5.**

Re-measure either side with:

```bash
npm run wiring          # operations, endpoints, boundary crossings
npm run flowstandard    # conformance to the house build standard
```

---

## 3. What was found

None of these were visible from the SharePoint gap list. Each surfaced because a flow was read
before it was touched.

### Live defects in the tenant

| | |
|---|---|
| **A wrong one-time code returns HTTP 200.** `Response` returns `@variables('varStatusCode')` as the real HTTP status, and `Scope_Finalize_Response_State` overwrites it after every branch has set its own. The 404 and 400 branches append to a string, not to the error array, so finalize sees no errors and answers 200. `document-portal/js/core.js:442` checks `if (!r.ok)` — the client is correct and has no way to know. **A failed verification reports as verified.** | D8 |
| **The one-time code is never compared.** `Condition_1` in `Portal_Verify_Confirm` tests expiry only. The single comparison of the presented code to the stored one is the `$filter`, which matches on the code alone with no email — so a code is accepted for whichever address minted it. | D9 |
| **CORS is a placeholder.** Every portal flow returns `Access-Control-Allow-Origin: https://your-host`. A browser refuses every response from the real portal origin. | — |
| **Seven third-party API keys** were committed in flow definitions — Google ×4, OpenRouter, OpenAI, Hugging Face. Redacted here. **Still live.** | — |

### Defects in this work, caught before shipping

Recorded because the pattern matters more than the instances: a specification that *looks*
complete is not the same as one that *works*.

| | |
|---|---|
| **The fix would have made the auth bypass worse.** Visit 1 replaces the code filter with an email filter — correct on its own terms, and it deletes the only code check in the flow. Applied alone, any code value would have verified. | D9 |
| **Rate limits refused nothing.** Three actions that read, updated and created a counter, with no threshold, no window and no refusal path. | D8 |
| **Redaction remedies were inert.** Two Compose actions added, nothing consuming their output — the check passed on the actions existing. | `8d28eb8` |
| **Catch scopes were mis-measured.** Matched by name against a fixed list. Reported 1/11 on the portal; the answer is 10/11, and the worksheet told the operator to add a second catch to a flow that already had a working one. | `427e861` |
| **Six crossings could never clear.** `Web - OTP Generate` and `Web - OTP Verify` were attributed to portal endpoints. They are internal sign-in. The target of zero was unreachable by construction. | `19a502b` |
| **Four PowerShell 5.1 defects.** BOM-less UTF-8 read as cp1252; `&` escaped as `\u0026` defeating a redaction anchor; `-Encoding UTF8` writing a BOM that `JSON.parse` rejects — twice. The fourth was caught by the repo's own guard before shipping. | `tests/powershell-51-compat.test.mjs` |

---

## 4. How flows are changed now

Hand-editing was abandoned after eleven of 123 edits took two hours. Full reasoning in
[`remediation/ANALYSIS.md`](./remediation/ANALYSIS.md).

**The designer is not the route. The definition is.**

| Step | Tool |
|---|---|
| 1. Read the deployed definition | `scripts/export-power-automate-flows.ps1`, or export a package and use `scripts/patch-flow-package.mjs --identify` |
| 2. Apply the artifact | `node scripts/patch-flow-package.mjs --in pkg.zip --out patched.zip --artifact <id> --flow <name>` |
| 3. **Verify before the tenant is touched** | `node scripts/verify-portal-wiring.mjs <dir>` |
| 4. Write it back | `scripts/update-flow-definition.ps1 -Apply` |

Step 3 is the point of the whole change: the number moves on disk first.

Two things that are **not** available, and why:

- **Legacy package import cannot update these flows.** It offers only "save as a new flow",
  which mints a new trigger URL and breaks the portal's config. The package route is a **read**
  path only.
- `scripts/update-flow-definition.ps1` makes the same `PATCH` call the designer makes on Save.
  Maker access only — no app registration, no admin role. Dry run by default; the current
  definition is saved to a `.before.json` every time.

**`update-flow-definition.ps1` has not yet been run against the tenant.** Its dry run is the
next task.

---

## 5. What the next operator does, in order

> The full register, with an owner and a closing condition for every open item, is in
> [`OPEN_ITEMS.md`](./OPEN_ITEMS.md). This section is the short form.


| # | Task | Where | Time |
|---|---|---|---|
| **1** | **Recover commit `ba7c94a`** — the `Portal_Verify` export. Either fix the 403 (an owner grants `kanihamza` Write on `dgoeaa/ECM_DOCS_DEV`) or send the file `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/Portal_Verify__86897b2f-…json` by another route. Until this lands the repository under-reports by 8 operations. | git | 10 min |
| **2** | **Dry-run the definition writer** on `Portal_Verify_Confirm`. It prints what it would send and writes a `.before.json`. Nothing is sent without `-Apply`. | PowerShell | 5 min |
| **3** | **Apply it**, re-export, sweep. Target **15/49, 2/6, crossings 12**. | PowerShell | 10 min |
| **4** | **Visits 2–5** — export each flow, patch, verify, apply. Nine flows. | both | ~90 min |
| **5** | **Rotate the seven API keys.** Check each provider console for misuse, mint replacements, move the values into Power Automate environment variables, revoke last. **Redaction is not rotation.** | provider consoles | 30 min |
| **6** | **Set the real CORS origin** on every portal flow's `Response`. | designer or patcher | 10 min |
| **7** | **End-to-end pass** — submit, verify, track, upload, support. | browser | 45 min |

### Task 2, verbatim

The patched definition is **in the repository**, at
`remediation/patched/` (retired 2026-10-05: [flow-retirement.json](../../registers/flow-retirement.json)) — delivered by `git pull` rather than as a chat
attachment, because that is the transport that has worked reliably on the operator's machine.

```powershell
cd C:\ECM_DOCS_DEV
git pull origin claude/sharepoint-lists-gap-bqo7j7
.\scripts\update-flow-definition.ps1 -EnvironmentName Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 -FlowId 3b69aa71-ffed-4956-9d20-2aa3021a8da0 -DefinitionPath .\docs\deployment\sharepoint\remediation\patched\Portal_Verify_Confirm.definition.json
```

Add `-Apply` only after the dry run reads back correctly.

### Before visits 2–5 can be patched

**Visit 4 is placed and ready.** Its three actions carry `place` fields and `ECM_DOCS_INTAKE`
has a clean shape.

**Visit 2 needs placements** — 13 actions. The two submission flows have bodies that do the
right job, so this is straightforward insertion; visit 1 is the worked example.

**Visits 3 and 5 are blocked on design, not on placement.** Per [D10](./DECISIONS.md),
`Portal_ECM_DOCS_STATUS` and `Portal_ECM_DOCS_SUPPORT` are clones of the submission flow —
both carry `Scope_Process_Submission`, which composes a filename, decodes base64 content and
creates a file. Neither performs its own function. `Portal_Status_Enquiry` is a stub with three
Initialize actions and no body at all. Those endpoints **replace** their bodies rather than
extend them, and the replacement's control flow is the last open specification question here.

---

## 6. Reference

| Document | What it holds |
|---|---|
| **[`PORTAL_DATA_CONTRACT.md`](./PORTAL_DATA_CONTRACT.md)** | **The specification flows conform to.** Every field the portal sends, every field it reads back, and the provisioned column each one lands in. 11 contracts, 119 persistence targets, all resolving. Generated and checked. |
| [`FUNCTIONAL_SPEC_RECONCILIATION.md`](./FUNCTIONAL_SPEC_RECONCILIATION.md) | The v3.0 functional specification's seven integration contracts against what the flows do. One endpoint — WRITEBACK — exists on neither side of this repository. |
| [`PORTAL_CLIENT_FINDINGS.md`](./PORTAL_CLIENT_FINDINGS.md) | What a citizen actually sees when each flow answers the way it answers. Seven live-probe findings; four are answered — three client-side, one by the remediation. |
| [`../../../reference/FLOW_CATALOGUE.md`](../../FLOW_CATALOGUE.md) | Every one of the 57 exported flows: purpose where one is recorded, trigger, request parameters, lists touched, connectors, response codes, conformance and full structure. Generated. |
| [`LISTS.md`](./LISTS.md) | Every list in both estates — GUID, URL, every column, and which flow touches it. Generated. |
| [`FLOW_STRUCTURES.md`](./FLOW_STRUCTURES.md) | Every portal flow: deployed structure today, and every change its remediation applies. Generated. |
| [`DECISIONS.md`](./DECISIONS.md) | D1–D9, with the reasoning and what each does not claim. |
| [`remediation/ANALYSIS.md`](./remediation/ANALYSIS.md) | Why the approach changed, and the sequence to the end. |
| `remediation/EXECUTION.md` (retired 2026-10-05: [flow-retirement.json](../../registers/flow-retirement.json)) | The hand-editing fallback, still valid. |
| [`PORTAL_CIRCLES.md`](./PORTAL_CIRCLES.md) | The seven end-to-end circles a citizen's submission travels. |
| [`FLOW_STANDARD.md`](./FLOW_STANDARD.md) | The ten weighted rules, derived from the flows that already conform. |

### Commands

```bash
npm test                # 36 scripts; test:smoke needs `npm install` for Playwright
npm run wiring          # operations, endpoints, boundary crossings
npm run flowstandard    # build-standard conformance
npm run flowmap         # which flow touches which list
npm run estatedocs      # regenerate LISTS.md and FLOW_STRUCTURES.md
npm run remediation     # regenerate artifacts and worksheets from the live measurement
```

---

## 7. State these to pilot users

- **Only `received` reaches a citizen.** The triage write-back circle (C7) does not exist
  anywhere in the estate. A submission's public status cannot advance until visit 4 ships.
- **Status lookup does not filter.** `Portal_ECM_DOCS_STATUS` carries no `$filter` and never
  looks up by reference or email. Visit 3 fixes it.
- **References collide.** The format uses the last three digits of ticks — 1000 values a year —
  and the reference is never persisted. Both are addressed in visit 2.
- **Verification is not trustworthy until D9 ships.** A wrong code returns 200 and the code is
  not compared. Do not rely on portal verification for anything that matters until visit 1 is
  applied in full.
- **Submissions already in `NITDA_Central_Registry` stay put** until provisioning concludes, per
  the standing instruction. Nothing is migrated mid-flight.
- **The internal identity layer is provisioned but inert** — one-time-code proof, no directory,
  no tenant sign-in. The enforcement boundary sits at the flow endpoint; no shipped component
  stands in front of it.

---

## 8. Repository hygiene, this session

29 files removed, 813 KB, each for a stated reason:

- `folio-Master-Flows-and-Endpoints/packages/codeview/` (7) — byte-identical to the `definition` key of the sibling
  `.flow.json`. Proven, not assumed.
- `folio-Master-Flows-and-Endpoints/packages/paste/` (6) — clipboard payloads for the hand-paste route the patcher
  retired.
- `scripts/setup-sharepoint-portal.ps1` — superseded by `provision-sharepoint-fields.ps1`, which
  did the 97/97 run.
- 15 duplicate definitions under `docs/reference/` — **same filename and same bytes** as a copy
  under `foundational/`. Same-name was required as well as same-bytes: two different flows can
  share a trigger schema, and dropping one of those would lose which flow has it.

`sharepoint-lists.json` v1.0 was **kept** despite being superseded — a test uses it to prove the
portal and governance estates share no list title. Deleting it would remove evidence.

`docs/folio-Master-Flows-and-Endpoints/packages/README.md` was replaced: it documented the hand-paste
route end to end and referenced the deleted files throughout.
