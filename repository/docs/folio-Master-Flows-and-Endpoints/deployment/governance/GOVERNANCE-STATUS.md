# DGO Digital Operations — governance commissioning status

> **This document carries no commands.** The steps for the estate, end to end live in
> [`RUNBOOK.md`](../../../deployment/RUNBOOK.md), which is the only document that carries them.
> This document is status: what is done, blocked and outstanding — restates no step. If you are here to execute, go there.

> **GENERATED FILE — do not edit by hand.**
> Built by `scripts/build-end-to-end-walkthrough.mjs` from the artefacts that own each fact:
> `endpoint-register.json`, `endpoint-workflow-ids.json`, `governance-list-registry.json`,
> `governance-estate-position.json`, `http-flow-registry-spec.json`,
> `sharepoint-provisioning-spec.json` and the deployed flow definitions.
> Every GUID, count, key and site name below is read from those files. Edit them and re-run
> `npm run governance:walkthrough`.

## What this document is

The whole path, in order, from an unconfigured checkout to a commissioned estate. It replaces
nothing: [`RUNBOOK.md`](../../../deployment/RUNBOOK.md) remains the commissioning
authority for Phase A, and its **Part 5 — the governance estate** remains the detailed
reference for Phase B. This is the sequence that joins them, with each step's **actual verified
state**.

**How to read the status column.** `DONE` means a run printed the result quoted beside it, on the
date quoted. It does not mean a specification says so. Anything not observed is `OUTSTANDING`,
never assumed.

---

## State of play

| | |
|---|---|
| Authoritative governance site | `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE` |
| Site holding the duplicates | `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING` |
| Power Automate environment | `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` |
| Contract keys | **26** — 19 internal (`DGO_ENDPOINT_*`), 7 portal (`PF_ENDPOINT_*`) |
| Distinct workflows serving them | **22** |
| Governance lists kept | **10**, all on `DGO_ECM_GOVERNANCE` |
| Duplicate instances to retire | **17**, all on `NITDADGO-EAAACTIVITYTRACKING` |
| Columns across the kept lists | **98** |
| Open findings | 0 —  |

### Step status at a glance

| Step | What | Status |
|---|---|---|
| **A** | Configure both runtimes — clears the 2 commissioning blockers | ⬜ OUTSTANDING |
| **1** | Back up the governance lists | ➖ SUPERSEDED |
| **2** | Provision columns and seeds on the 10 kept lists | ✅ DONE |
| **2.7** | Remove the auto-disambiguated leftovers | ✅ DONE |
| **3a** | Survey the 17 duplicates | ✅ DONE |
| **3b** | Export them | ✅ DONE |
| **3c** | Rename them `ZZ_RETIRED_*` | ✅ DONE |
| **3d** | Delete them | ⛔ BLOCKED |
| **4** | Correct the 4 governance flows | ⬜ OUTSTANDING |
| **5** | Provision 7 HTTP flow registry lists | ⬜ OUTSTANDING |
| **6** | Adopt the `FlowId`/`WorkflowId` join | ⬜ OUTSTANDING |
| **7** | Measure the out-of-band provisioning (GOV-11) | ⬜ OUTSTANDING |

**The critical path right now:** identify the GOV-09 producer → Step 4 → Step 3d → Steps 5, 6.
Step 7 is not on it — it is read-only and blocks nothing — but it is the only thing that would
settle GOV-11, which reads UNMEASURED because this table stopped at 6 and the runbook's own
checklist did too.
Phase A is independent of all of it and can proceed in parallel.

---

# Phase A — configure both runtimes

**Status: ⬜ OUTSTANDING**
npm run commission reports both config files absent — 2 blockers stand.

This is the only thing standing between the estate and a working pilot. It touches no governance
list.

### A.0 Before you start — the one rule

A `sig=` value **is** the authentication. Possession alone authorises invoking the flow. There is
no second factor, no caller allow-list, no expiry.

- Never paste a signed trigger URL into a ticket, an email, a chat message, or any file except
  `config.local.js`.
- Deleting a file **revokes nothing.** Only regenerating the trigger in Power Automate does.
- Both `config.local.js` files are git-ignored. Nothing wired there can be committed.

### A.1 Prerequisites

| # | Requirement | How to confirm |
|---|---|---|
| 1 | Node ≥ 22 and npm | `node -v` |
| 2 | The repository at this branch | `git rev-parse --abbrev-ref HEAD` |
| 3 | Power Automate maker access in `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` | https://make.powerautomate.com → the environment selector shows it |

### A.2 Generate the values template

```bash
npm install
npm run values:template
```

Writes `~/dgo-values.txt` with one line per contract key — **26 lines**, each ending
`=`, waiting for a URL.

### A.3 Harvest the 22 trigger URLs

22 flows serve the 26 keys, so this is
**22 visits, not 26**.

**You are pasting a signature, not a URL.** `values:template` emits every line already complete —
host, routing segment, workflow id, all of it — ending:

```
...&sv=1.0&sig=
```

For each flow in Power Automate: open it → expand **When an HTTP request is received** → from the
**HTTP POST URL**, copy **only the part after `sig=`** — 43 characters, the last parameter, to
the end of the line — and paste it after the `=` that is already there.

**Do not replace the whole line.** Pasting a complete URL after `&sig=` produces a value with two
`sig=` parameters in it. The line will look filled in and the endpoint will not authenticate.

### A.3a There are two values templates in this repository. Use the one above.

| | `npm run values:template` | `docs/folio-Master-Flows-and-Endpoints/deployment/rotation/values.template.txt` |
|---|---|---|
| Key names | `DGO_ENDPOINT_*` / `PF_ENDPOINT_*` | bare — `FETCH_ACTIVITIES=` |
| Line content | URL pre-filled, signature blank | **empty** — the whole URL is required |
| What you paste | 43 characters | a complete trigger URL, 26 times |

`setup` accepts **both** key forms — `scripts/setup.mjs` tries the prefixed name and then the
bare one — and no bare name is ambiguous, because the 19 runtime and
7 portal short names do not overlap. So the rotation worksheet is usable. It is
simply the harder and more error-prone of the two: a whole URL pasted 26 times is
26 chances to truncate a host or drop a workflow id, and the pre-filled template makes
those two mistakes impossible.

**If you are holding a copy of the rotation worksheet, check its header before trusting it.** It
states how many keys the disclosure affected, and that count is generated from the rotation
register. A copy taken before the rotation was addressed reads `12 / 9 / 4`; the current file
reads `0 keys need a NEW url`, `26 keys are unaffected`,
`0 keys have no workflow id recorded`. If yours says anything else it is stale — regenerate it, or use
`npm run values:template` and ignore it.

### A.4 Check before writing anything

```bash
npm run check:values -- ~/dgo-values.txt
```

Prints **no URL, no host, no signature** — only shapes — so its output is safe to show anyone.

**Expected:** `✅ 26 value(s), all with a complete 43-character signature.`

**43 is exact, not approximate.** A signature is base64url of an HMAC-SHA256: 32 bytes, 43
characters unpadded. Any other number is a defect in the paste, not a variation.

| What it says | What it means |
|---|---|
| `the URL is complete but its signature is blank` | That key is not filled in yet |
| `sig is N characters, not 43`, N smaller | Truncated on copy |
| `sig is N characters, not 43`, N larger | Something extra pasted after it |
| `no sig= parameter` | The line was overwritten with a truncated URL — regenerate that key |
| `NOT A URL` | A smart quote, a space around the `=`, or a wrapped line |

### A.5 Write both config files

```bash
npm run setup -- --values ~/dgo-values.txt --force
```

`--force` is required: `setup` will not overwrite an existing `config.local.js` without it.

Writes `config/config.local.js` (19 internal keys) and
`document-portal/config.local.js` (7 portal keys).

### A.6 Confirm

```bash
npm run check:config
npm run check:config:portal
npm run commission
```

**Expected from `commission`:** the two blockers are gone. The governance findings remain as
warnings — they do not block a pilot, because the endpoint path reaches Power Automate directly
and touches no governance list.

### A.7 Afterwards

Shred `~/dgo-values.txt`. It holds 26 live credentials in plain text.

---

# Phase B — the governance estate

## Step 1 — Back up

**Status: ➖ SUPERSEDED**
Step 3 export (2026-09-09) downloaded all 17 duplicate lists including their items; the 10 keepers were not separately backed up before Step 2, which was additive only.

Step 2 is additive — it creates columns and seed rows and modifies nothing — so the 10
kept lists were never at risk from it. The lists that were at risk are the 17
duplicates, and those were exported in full at Step 3b.

**If you want a backup of the keepers anyway**, use `MODE = 'export'` logic against the keeper
GUIDs in the appendix. It is not a precondition for anything below.

---

## Step 2 — Provision the 10 kept lists

**Status: ✅ DONE**
Three consecutive runs 2026-09-09 — dry 0 created/97 present/0 failed; apply 1 created (EndpointRedacted)/97 present/0 failed; verify 0 created/98 present/10 seeds present/0 failed.

Third-run idempotence is the check that matters: an apply reporting work on a second pass did not
do what it claimed on the first.

**Artefact:** `scripts/provision-governance-lists.browser.js`
**Site:** `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`
**Permission:** Manage Lists on `DGO_ECM_GOVERNANCE` (Site Owner is enough; tenant admin is not needed)

Re-run it any time; it is idempotent and reports `present` for everything.

### 2.7 — the auto-disambiguated leftovers

**Status: ✅ DONE**
cleanup-disambiguated-columns 2026-09-09 — dry listed exactly 3; live reported 3 deleted, 0 kept, 0 failed. Both original Version columns untouched and still populated.

`createfieldasxml` with `Options: 24` takes the internal name from the SchemaXml's `Name`
attribute, and does **not** fail when that name is taken — it appends a digit and creates the
column beside the existing one.

**Artefact:** `scripts/cleanup-disambiguated-columns.browser.js` — dry-run by default.

---

## Step 3 — Retire the 17 duplicates

**Artefact:** `scripts/retire-duplicate-governance-lists.browser.js`
**Site: `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING`** — the **duplicate** site, not the authoritative one. The script refuses to
run if pasted on the authoritative site.

It is **MODE-driven, not `DRY_RUN`-driven**: one boolean is not enough protection when the
mistake is unrecoverable. `delete` cannot touch a list `rename` has not renamed, so the
reversible step cannot be skipped.

| Phase | Status | Evidence |
|---|---|---|
| **3a** `survey` | ✅ DONE | 2026-09-09 — 17 surveyed, nothing changed. 13 empty, 4 populated (RoleCatalogue 6, AuditLog 5, UserDirectory 1, PilotCohorts 1). |
| **3b** `export` | ✅ DONE | 2026-09-09 — 17 exported, 13 items in total, 0 failed. |
| **3c** `rename` | ✅ DONE | 2026-09-09 — 17 renamed to ZZ_RETIRED_*, 0 skipped, 0 failed. |
| **3d** `delete` | ⛔ BLOCKED | Gated on GOV-09. The producer of the 2026-08-31T01:58Z writes is unidentified; deleting a list something still writes to breaks that producer silently. |

### 3d is blocked, and this is why

The survey found four duplicates carrying items, all last written at **2026-08-31T01:58:48–49Z**
— within one second of each other, and **thirteen days after** the 2026-08-18 capture this estate
reasons from. The counts match the specification's seed set exactly: 6 role seeds, 1 bootstrap
user, 1 pilot cohort. **A provisioning run, pointed at the wrong site.** Recorded as **GOV-09**.

**What was searched, and what it found.** Every exported definition naming a governance list was
walked. **None creates a list. None posts an item to one.** The producer is therefore not in the
exported corpus — consistent with **GOV-06**, where only 13 of 73 exported definitions match a
register workflow by name. It is **unidentified, not absent**.

**The next probe is the tenant, not this repository:**

1. Power Automate → environment `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` → run history around **2026-08-31 01:58 UTC**.
2. Or the SharePoint audit log for those four lists at that timestamp.

Nothing readable from a list says what wrote to it.

### Before 3d — one read-only check

**Artefact:** `scripts/compare-duplicate-governance-lists.browser.js` (read-only, both sites).

Answers one question: **does any row exist only in a duplicate?** If one does it is the sole copy
and must be reconciled first. It matches rows on each list's own seed key, never Title — two of
these lists legitimately repeat titles.

### Do not run `restore`

The rename has already defused **GOV-10** (below): every deployed reference to these lists is by
title, so `ZZ_RETIRED_` makes those calls 404 instead of silently hitting a duplicate. Restoring
the titles re-arms it.

---

## Step 4 — Correct the governance flows

**Status: ⬜ OUTSTANDING**
The corrected definitions exist and are asserted by tests/governance-flow-corrections.test.mjs. The deployed flows are unchanged.

This is now the **critical path**: Step 3d, GOV-09 and GOV-10 all wait on it.

### 4.1 The 4 flows, with their import targets

| # | Flow | Flow GUID | Corrected definition | Actions |
|---|---|---|---|---|
| 02 | 02 - GOV - Register HTTP Flow Truth | `651ae389-eeed-4bf0-9799-67bd964ebe71` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/02-register-http-flow-truth.corrected.json` | 1 |
| 03 | 03 - GOV - Record HTTP Flow Execution | `0545e19a-c34a-45db-bd11-27b87a34973e` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/03-record-http-flow-execution.corrected.json` | 1 |
| 05 | 05 - GOV - Retire HTTP Flow | `493b4ab7-8f63-4fab-8121-746c2cac7f98` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/05-retire-http-flow.corrected.json` | 8 |
| 07 | 07 - GOV - Consumer HTTP Self-Registration Template | `c6a011c5-7b11-4241-82ae-a45b88ebf276` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/07-consumer-self-registration.corrected.json` | 1 |

**Environment:** `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`

### 4.2 What the corrections do

- **GOV-04** — every path now reaches a `Response` before any `Terminate`. Power Automate's
  `Terminate` ends the whole run, so anything downstream of it is unreachable: all four flows
  could end without answering their caller.
- **GOV-05** — the retirement cascade is gated by `If_Safe_To_Retire`. Both active counts are
  taken **before** any write; retirement is blocked with **409** when either is non-zero, and
  proceeds only when both are zero or `force` is true. `Retire_Registry` was lifted out of
  `If_Registry_Found`, where it would otherwise have escaped the guard — **a defect the test
  found, not the design.**

### 4.3 Applying a corrected definition

Power Automate's **Peek code** is read-only, so a definition cannot be pasted back through it.
The route is export → edit → import:

1. Power Automate → the flow → **⋯** → **Export** → **Package (.zip)**. **Keep this file — it is
   your rollback.**
2. Unzip. The definition is at
   `Microsoft.Flow/flows/<flow GUID>/definition.json`.
3. Replace its `definition` object with the corrected file's `definition` object.
4. Re-zip **the contents**, not the containing folder.
5. Power Automate → **Import** → upload → **Update** the existing flow (**not** Create as new).

### 4.4 Validate all four paths on flow 05

| Path | Send | Expect |
|---|---|---|
| Malformed | body missing `flowId` | **400**, no writes |
| Not found | a `flowId` with no registry row | **404**, no writes |
| Blocked | a flow with active consumers or dependencies | **409**, **nothing retired** |
| Guarded | a flow with none | **200**, retired |
| Forced | active consumers **and** `force: true` | **200**, retired, forced retirement recorded with both counts |

The **409 blocked** path is the one that matters. Verify afterwards that the consumers and
dependencies are **still active** — the original defect retired them, which erased the evidence
that any were active.

### 4.5 Also in Step 4 — GOV-10

**`Repair the DGO governance lists`**, button-triggered. Every action carries
`dataset = https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING` — the site being retired — and addresses every list by
`getbytitle(...)`, never by GUID. It creates and indexes columns, and **deletes any column its
`Filter_Strays` step does not recognise.**

Its SchemaXml payload carries `FlowUrl` and `ScopeId` — the two names GOV-03 and GOV-08 removed
— and does **not** carry `EndpointRedacted` or `EndpointFingerprint`.

**Point it at the authoritative site, or restore the retired list titles, and it deletes
`EndpointRedacted` and `EndpointFingerprint` as strays and recreates `FlowUrl` and `ScopeId`.**
One button press undoes both findings, and reports success doing it.

Corrections required: repoint `dataset` to `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`, address lists by GUID, and regenerate its
`varLists` payload from `docs/reference/sharepoint-provisioning-spec.json`. **Until then, do not
run it.**

---

## Step 5 — Provision the HTTP flow registry lists

**Status: ⬜ OUTSTANDING**
None of the registry lists exists in the tenant; the 2026-08-18 capture and tests/governance-estate.test.mjs agree.

**Artefact:** `scripts/provision-flow-registry-lists.browser.js` — dry-run by default.
**Site:** `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`

### 5.1 What it creates

| List | Columns | Unique key | Purpose |
|---|---|---|---|
| `DGO_HTTPFlowRegistry` | 36 | `RegistryKey` | Current authoritative HTTP flow truth |
| `DGO_HTTPFlowContractVersions` | 13 | `ContractKey` | Immutable contracts |
| `DGO_HTTPFlowExecutionLedger` | 15 | `ExecutionKey` | Execution ledger |
| `DGO_HTTPFlowDependencies` | 9 | `DependencyKey` | Flow dependencies |
| `DGO_HTTPFlowRegistryExceptions` | 12 | `ExceptionKey` | Governance exceptions |
| `DGO_HTTPFlowRegistryConfiguration` | 6 | `ConfigKey` | Registry configuration |
| `DGO_HTTPFlowConsumerRegistry` | 11 | `ConsumerKey` | Consumer registry |

**Nothing is deferred.** The scope is every list the corrected flows read or write, plus the
configuration list they read their parameters from.
A provisioner that creates more than the flows need is how a deferral quietly becomes a
deployment; one that creates fewer is how a runbook ends up telling an operator to exercise a
flow against a list that does not exist.

### 5.2 Why this one is different from Step 2

Step 2's lists already existed, so every address in that provisioner is a GUID captured from the
tenant. **None of these exist**, and a list that does not exist has no GUID — so creation is
unavoidably by title. That is exactly the operation that produced **GOV-02**.

So the title is used **once**, to ask whether the list is already there:

1. `GET` the list by title. If it exists, take its GUID and create nothing.
2. Only on **404**, `POST` to create it — then read back the GUID SharePoint assigned.
3. Every column and index after that addresses the **GUID**.

Run it twice and the second run creates nothing.

### 5.3 Afterwards — record the GUIDs

The script prints the GUID of each list it created or found. **Those must be recorded in
`docs/reference/governance-list-registry.json`**, or the repository goes on describing these
lists as unprovisioned while the tenant has them.

---

## Step 6 — Adopt the join

**Status: ⬜ OUTSTANDING**
GOV-06 stands: zero exported definitions carry an id the register knows.

**GOV-06:** the exported definitions are identified by a 36-character Power Automate flow GUID;
the register by a 32-hex Logic Apps workflow id. Different identifier spaces for the same
objects, and **zero** exported definitions carry an id the register knows. Joining on normalised
display name — the only shared field — matches 13.

### 6.1 What to record per flow

`DGO_HTTPFlowRegistry` carries these, and registering through flow **02** writes them together.

| Field | Value | Where to read it |
|---|---|---|
| `FlowId` | the 36-character flow GUID | Power Automate → the flow → its URL, or the exported package's folder name |
| `WorkflowId` | the 32-hex Logic Apps workflow id | the trigger URL, between `/workflows/` and `/triggers/` |
| `EnvironmentId` | `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` | fixed for this estate |
| `RegistryKey` | computed by flow 02 | **do not supply it** |

Recording both ids against one row is what makes the two corpora joinable — once the column and
the flow field exist to record them in.

---

# Appendix A — the 10 lists to keep

All on `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`.

| List | GUID |
|---|---|
| `DGO_UserDirectory` | `3d591f5b-3f2f-409c-983a-a77b5c174834` |
| `DGO_RoleCatalogue` | `f675598b-271d-4200-8d75-2597aad4057f` |
| `DGO_UserRoleHistory` | `9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c` |
| `DGO_AuditLog` | `be0c7af1-b21d-4efe-8c30-53fc55598d95` |
| `DGO_PendingWrites` | `ad1df270-21c7-4b78-99e7-fb18efd02cd2` |
| `DGO_DepartmentDirectory` | `eed0ba42-ece1-40e2-bf66-79827de02766` |
| `DGO_AccessScopes` | `f2ffd2fa-901e-4f28-8f28-957da0fe05e4` |
| `DGO_PilotCohorts` | `ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2` |
| `DGO_EndpointRegistry` | `08c6e1c4-f2b1-4810-933d-69b4327fb6af` |
| `DGO_AccessEvents` | `a40d5f57-859c-426c-826c-bfee090137ad` |

# Appendix B — the 17 duplicates to retire

All on `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING`. Currently renamed `ZZ_RETIRED_*`; **not** deleted.

| Live title after rename | GUID | Superseded by |
|---|---|---|
| `ZZ_RETIRED_DGO_UserDirectory` | `b9b522c6-1219-4fb1-ad01-b54b40416bba` | `3d591f5b-3f2f-409c-983a-a77b5c174834` |
| `ZZ_RETIRED_DGO_RoleCatalogue` | `55c0daae-8b46-4db7-8c03-be54e3fc536f` | `f675598b-271d-4200-8d75-2597aad4057f` |
| `ZZ_RETIRED_DGO_UserRoleHistory` | `4fdb8379-9f48-466e-a503-a59912be5015` | `9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c` |
| `ZZ_RETIRED_DGO_AuditLog` | `74153ee5-e6dd-4347-b1fe-a51d7fd47521` | `be0c7af1-b21d-4efe-8c30-53fc55598d95` |
| `ZZ_RETIRED_DGO_AuditLog_2` | `7ac06ab8-9754-4578-be86-87c809c8deea` | `be0c7af1-b21d-4efe-8c30-53fc55598d95` |
| `ZZ_RETIRED_DGO_PendingWrites` | `66e19c2a-877b-4537-8247-2351d6374cf9` | `ad1df270-21c7-4b78-99e7-fb18efd02cd2` |
| `ZZ_RETIRED_DGO_PendingWrites_2` | `673b687d-5e07-4cd2-89c0-411d10238752` | `ad1df270-21c7-4b78-99e7-fb18efd02cd2` |
| `ZZ_RETIRED_DGO_DepartmentDirectory` | `db2f8e1a-69e4-4c8a-a2ee-4f2a29d85f4b` | `eed0ba42-ece1-40e2-bf66-79827de02766` |
| `ZZ_RETIRED_DGO_DepartmentDirectory_2` | `ed850c51-79e6-4f7e-a725-f8ca9f42ff01` | `eed0ba42-ece1-40e2-bf66-79827de02766` |
| `ZZ_RETIRED_DGO_AccessScopes` | `3bd611eb-0391-47ee-9dfa-e4520a18787b` | `f2ffd2fa-901e-4f28-8f28-957da0fe05e4` |
| `ZZ_RETIRED_DGO_AccessScopes_2` | `cccc57f9-1091-4e9c-9826-e46918b057f0` | `f2ffd2fa-901e-4f28-8f28-957da0fe05e4` |
| `ZZ_RETIRED_DGO_PilotCohorts_2` | `146c6162-7bea-4ecb-9b1d-254c1e979e12` | `ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2` |
| `ZZ_RETIRED_DGO_PilotCohorts` | `22925b7d-9ea7-497f-9c01-70a32bcb6f2f` | `ecc4ac65-1804-4f67-ad3e-eacb1a3a4dc2` |
| `ZZ_RETIRED_DGO_EndpointRegistry_2` | `89ac07db-f7d0-43b4-b508-2479580fae18` | `08c6e1c4-f2b1-4810-933d-69b4327fb6af` |
| `ZZ_RETIRED_DGO_EndpointRegistry` | `dbc0abbd-51c5-4002-8786-3ebc866a8c35` | `08c6e1c4-f2b1-4810-933d-69b4327fb6af` |
| `ZZ_RETIRED_DGO_AccessEvents` | `4411f921-2a76-4dea-823d-03f1daf1df6d` | `a40d5f57-859c-426c-826c-bfee090137ad` |
| `ZZ_RETIRED_DGO_AccessEvents_2` | `c107a54f-3f38-4f71-8a47-38c75f047186` | `a40d5f57-859c-426c-826c-bfee090137ad` |

# Appendix C — executable artefacts

Every one is a browser-console script. **No PowerShell, no PnP, no install.**

| Script | Phase | Writes? |
|---|---|---|
| `harvest-trigger-urls.browser.js` | A.3 | no |
| `provision-governance-lists.browser.js` | 2 | yes — dry-run default |
| `verify-governance-columns.browser.js` | 2 verify | no |
| `dump-governance-columns.browser.js` | 2 diagnose | no |
| `inspect-governance-strays.browser.js` | 2.7 | no |
| `cleanup-disambiguated-columns.browser.js` | 2.7 | yes — dry-run default |
| `remediate-governance-strays.browser.js` | 2.7 migrate | yes — dry-run default |
| `compare-duplicate-governance-lists.browser.js` | before 3d | no |
| `retire-duplicate-governance-lists.browser.js` | 3 | yes — MODE-driven |
| `provision-flow-registry-lists.browser.js` | 5 | yes — dry-run default |

# Appendix D — open findings

| ID | Title | Blocks commissioning? |
|---|---|---|


None blocks the endpoint commissioning path: it reaches Power Automate directly and touches no
governance list. What they block is enrolment, the role catalogue and the audit trail landing
where anything reads them — which an operator otherwise discovers as silence, after going live.
