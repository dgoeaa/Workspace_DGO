# Execution engagement brief — DGO Digital Operations

> **GENERATED FILE — do not edit by hand.** Built by `scripts/build-execution-agent-brief.mjs`.
> Every identifier is read from the artefact that owns it; `npm run governance:agentbrief -- --check`
> fails if this document drifts from them.

> **This document carries no commands.** The steps for the estate, end to end live in
> [`RUNBOOK.md`](../../../deployment/RUNBOOK.md), which is the only document that carries them.
> This document is scope, access, sequencing and escalation for an external agent — points into the governance runbook by section, restates no step. If you are here to execute, go there.
>
> That one runbook is also the command-line commissioning path. This brief sequences and scopes
> execution against it; it replaces it in neither role.

**Audience.** An independent agent engaged to execute the outstanding tenant-side work.
**Prior knowledge assumed.** None beyond SharePoint Online, Power Automate and a terminal.
**Consultation required.** None. Every decision branch in this document is pre-decided. Where a
decision is not the agent's to make, §9 says so and gives the exact escalation.

---

## 0. Inputs the engaging party must supply

**This brief is complete on decisions and incomplete on inputs.** Seven things cannot be derived
from any artefact. Fill every row before handing this to an agent; an unfilled row is a
consultation the brief promised would not be needed.

| # | Input | Why it cannot be derived | Value |
|---|---|---|---|
| 0.1 | Repository clone URL | Not recorded in the repository | `________` |
| 0.2 | Account for the agent to use, and how it signs in | The brief cannot provision access | `________` |
| 0.3 | **An authenticated browser session on `nitdanigeria.sharepoint.com`** | See §0.A — this determines whether the engagement is executable at all | `________` |
| 0.4 | Escalation recipient — name and channel | §9 stops work; someone must receive it | `________` |
| 0.5 | Evidence storage location for exports and `BEFORE-` packages | Backups held somewhere unagreed are not backups | `________` |
| 0.6 | Written authorisation to delete SharePoint lists, and to modify and disable Power Automate flows | WP-3 and WP-4 are destructive and irreversible | `________` |
| 0.7 | Change window, or written confirmation that none is required | 17 list deletions and 4 flow updates are production changes | `________` |

### 0.A The capability that decides everything: browser console access

**Six of the eight work packages require pasting JavaScript into the developer console of a
browser already signed in to SharePoint.** That is how this estate's tooling is built, because
PowerShell was unavailable to the operator it was written for.

| Work package | Terminal alone | Browser console required |
|---|---|---|
| WP-0 baseline | partly — `npm`/`git` | **yes**, for column verification |
| WP-1 configure runtimes | partly — `npm` | **yes**, to read trigger URLs from Power Automate |
| WP-2 identify producer | no | **yes** — Power Automate run history is a web UI |
| WP-3 correct flows | no | **yes** — export/import is a web UI |
| WP-4 delete duplicates | no | **yes** |
| WP-5 registry lists | no | **yes** |
| WP-6 adopt the join | no | **yes** |
| WP-7 remaining items | partly | **mostly** |

**An agent with a terminal but no authenticated browser can execute the `npm` and `git` portions
of WP-0 and WP-1 and nothing else.** It cannot complete a single work package end to end.

Before engaging, confirm one of:

1. **The agent drives a real browser** with an interactive Microsoft sign-in — then this brief is
   executable as written; or
2. **A human operator pairs with the agent**, pasting scripts and returning console output — then
   this brief is executable as written, and the human is performing §0.3; or
3. **Neither.** Then the tooling must first be re-targeted to run without a browser session. That
   requires an access token, which requires an Azure AD app registration with `Sites.Manage.All`
   — **a tenant-administrator action, not an agent action.** It is not in this brief's scope and
   nothing here should be attempted until it exists.

**Do not begin under option 3.** A partially executed destructive engagement is worse than an
unstarted one.

### 0.B Working under option 2 — the pairing protocol

**This engagement is running under option 2: a human operator performs §0.3.** The agent's only
view of the tenant is what that operator relays, so the relay is part of the control surface, not
a convenience.

**Per script, the loop is fixed:**

| | Agent | Operator |
|---|---|---|
| 1 | States the **exact file path**, the **mode** to set, and the **site** to be signed in to | Confirms the site in the address bar before pasting |
| 2 | — | Pastes the file, presses Enter, waits for the run to finish |
| 3 | — | Copies **the single line between the RELAY markers** and returns it |
| 4 | Parses that line and confirms `script`, `mode` and `site` match what it asked for | — |

**Copy the RELAY line, not the table.** Every script that writes ends with:

```
───────── RELAY: COPY THE SINGLE LINE BELOW ─────────
{"script":"…","mode":"…","site":"…","utc":"…","rows":N,"tally":{…},"ledger":[…]}
───────── END RELAY ─────────
```

That line is one line of JSON. It survives copy and paste, it parses, and it carries its own
provenance.

**Three relay failures are known, and the protocol exists because of them:**

1. `console.table` renders as a grid on screen and copies as one unbroken string with its header
   repeated and no delimiters. Counting rows out of it means guessing where each ends.
2. A whole-console paste normally includes the pasted **script** as well as its output, and the
   script's source contains every verdict string the ledger can produce. Searching such a paste
   for a verdict finds the source, not the result.
3. Nothing else in the output identifies which script, mode or site produced it, so two runs
   pasted in sequence are indistinguishable.

**Agent obligations under option 2:**

- **Never infer a count from a pasted table.** If the RELAY line is absent, ask for it. Do not
  proceed on a reading taken from the table.
- **Reject a relay whose `script`, `mode` or `site` is not what was requested.** Ask for the run
  to be repeated. A mismatch means a different script, a different mode, or the wrong site.
- **Treat a missing RELAY line after a destructive mode as unknown state**, not as success. Ask
  the operator to re-run the same script in its read-only or survey mode and relay that.

**Operator obligations under option 2:**

- Confirm the address bar before every paste. Several scripts act on one site and refuse another.
- Change **only** the named setting — `DRY_RUN`, or `MODE` and `I_HAVE_THE_EXPORT`. Change
  nothing else in any file.
- Return the RELAY line verbatim, including both markers.
- If the console shows an error, return the error text too. An error is information, not a
  failure to hide.

---

## 1. Scope

### 1.1 In scope

1 open items of authority `TENANT_EXECUTION`, and the outstanding steps of
`scripts/runbook-parts/40-governance-estate.md`. These require access to the tenant; the
repository cannot perform them.

### 1.2 Explicitly out of scope

0 open items of authority `AGENCY_DECISION`. **Do not execute, work around, or
form a recommendation on these.** Each requires a documented risk acceptance by the agency.

| Item | Title | Accountable |
|---|---|---|


Record their state and hand them back per §9. Attempting one is a breach of this brief.

### 1.3 Documents that are retired and must not be used

`PLAN.md`, `PLAN.md` and `PLAN.md` are
retired. They briefed an earlier engagement whose work has been completed. They are kept as
historical record of how the estate was measured. **Do not take instruction from them.** Every
count in them is a reading of an earlier commit.

### 1.4 Authoritative documents for this engagement

| Purpose | Document |
|---|---|
| Endpoint commissioning | `docs/deployment/RUNBOOK.md` |
| Governance tenant work | `scripts/runbook-parts/40-governance-estate.md` |
| Sequence and current state | `docs/folio-Master-Flows-and-Endpoints/deployment/governance/GOVERNANCE-STATUS.md` |
| Findings, with repository/tenant status split | `docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json` |
| Open items and their authority | `docs/deployment/closure-disposition.json` |

Where any two disagree on a command, `RUNBOOK.md` governs for Phase A and
`40-governance-estate.md` governs for Phase B.

---

## 2. Access required

| # | Access | Verify by | Needed for |
|---|---|---|---|
| 1 | Node ≥ 22, npm, git | `node -v && npm -v && git --version` | all |
| 2 | Read access to the repository, branch `claude/system-remediation-gaps-ahpmsy` | `git rev-parse --abbrev-ref HEAD` | all |
| 3 | Site Owner (Manage Lists) on `DGO_ECM_GOVERNANCE` | open the site; Site contents loads | WP-3, WP-5 |
| 4 | Site Owner (Manage Lists) on `NITDADGO-EAAACTIVITYTRACKING` | open the site; Site contents loads | WP-4 |
| 5 | Power Automate maker in `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` | the environment selector shows it; a flow opens for editing | WP-1, WP-2, WP-6 |
| 6 | Permission to read Power Automate **run history** in that environment | open any flow → **Run history** | WP-2 |

**If any is absent, stop and report it under §9.** Do not proceed with a partial subset: several
work packages verify each other, and a partial run produces a report that cannot be trusted.

---

## 3. Non-negotiable safety invariants

These hold for the entire engagement.

1. **A `sig=` value is the authentication.** Possession alone authorises invoking the flow. Never
   paste a signed trigger URL into a ticket, email, chat message, screenshot, or any file except
   `config.local.js` and the values file described in WP-1.
2. **Deleting a file revokes nothing.** Only regenerating the trigger in Power Automate does.
3. **Never delete a SharePoint list or column that has not first been proven empty or backed up**,
   by the procedure in the work package concerned.
4. **Never address a governance list by title where a GUID is given.** The duplicates share titles
   with the lists being kept. Every GUID needed is in §10.
5. **Every provided script is dry-run or survey by default.** Read its output before changing the
   mode. If a dry run's report does not match what this brief says to expect, stop and report.
6. **Do not run the flow named in WP-3.5** until that work package is complete.
7. **Record every console output.** §8 defines the report.

---

## 4. Verified current state

Each line is an observation from an executed run, with its date. Anything not listed here is
outstanding.

| Verified | On | Evidence |
|---|---|---|
| Governance columns and seeds provisioned on the 10 authoritative lists | 2026-09-09 | Three consecutive runs: dry 0 created/97 present/0 failed; apply 1 created/97 present/0 failed; verify 0 created/98 present/10 seeds present/0 failed |
| Three auto-disambiguated leftover columns removed | 2026-09-09 | Dry run listed exactly 3; live run 3 deleted, 0 kept, 0 failed |
| 17 duplicate lists surveyed | 2026-09-09 | 13 empty, 4 populated (RoleCatalogue 6, AuditLog 5, UserDirectory 1, PilotCohorts 1) |
| 17 duplicate lists exported | 2026-09-09 | 17 exported, 13 items total, 0 failed |
| 17 duplicate lists renamed `ZZ_RETIRED_*` | 2026-09-09 | 17 renamed, 0 skipped, 0 failed |

**Independently re-verify before starting** (§WP-0). Do not take the table above on trust.

### 4.1 Open findings

| ID | Title | Blocks commissioning? |
|---|---|---|


---

## 5. Work packages, in dependency order

```
WP-0  baseline
 ├── WP-1  configure both runtimes          (independent — may run in parallel)
 └── WP-2  investigate: the GOV-09 producer (2.1–2.4), the GOV-11 provisioning (2.5)
      └── WP-3  correct the flows
           └── WP-4  delete the duplicates
                └── WP-5  provision registry lists
                     └── WP-6  adopt the join
```

WP-1 depends on nothing and unblocks the pilot on its own. WP-4 must not begin before WP-3
completes. Every other order is fixed as drawn.

---

## WP-0 — Establish the baseline

**Purpose.** Confirm the repository and the tenant are in the state §4 describes, before changing
anything.

```bash
git clone <repository URL> dgo
cd dgo
git checkout claude/system-remediation-gaps-ahpmsy
git rev-parse HEAD          # record this commit in the report
npm install
npm run test:node           # must exit 0
npm run commission          # record the full output
```

**Expected from `commission`:** 2 blockers (both configuration), 0 governance warnings, 3 passes.

Then run the read-only column verification: **§2.6 of
[Part 5 of `RUNBOOK.md`](../../../deployment/RUNBOOK.md#part-5--governance-tenant-runbook--actions-outside-the-repository)**, which is the only document that
carries the step.

It checks **every column the specification declares** — 98 across the
10 lists — against the tenant, and it is generated from that
specification, so it cannot assert a name the specification has withdrawn.

**Expected final line:** `WP-0 PASSES: every specified column exists under its specified name.`

A verdict of `OLD NAME PRESENT` is **not** a failure. It reports a superseded internal name still
on a list, which on some lists holds live data. Record it and continue. Only `MISSING`,
`RESERVED NAME` or `UNREADABLE` stop the engagement.

| Result | Action |
|---|---|
| `npm run test:node` exits non-zero | **Stop.** Report under §9. The repository is not in a known state. |
| `commission` reports other than the above | Record verbatim and continue; a changed count is information, not a blocker |
| Any `MISSING`, `RESERVED NAME` or `UNREADABLE` | **Stop.** Report under §9. §4 is wrong and every later package depends on it |
| `OLD NAME PRESENT` | Record it and continue — a superseded name still on a list is information, not a fault |

---

## WP-1 — Configure both runtimes

**Closes:** `CFG-1`, `CFG-2`. **Blocks:** the pilot. **Depends on:** WP-0 only.

### 1.1 Generate the template

```bash
npm run values:template ~/dgo-values.txt
```

Writes 26 lines. Each is **already complete** — host, routing segment, workflow id —
ending `&sv=1.0&sig=`.

### 1.2 Fill it

22 flows serve the 26 keys: **22 visits, not 26**.

Per flow: Power Automate → open the flow → expand **When an HTTP request is received** → from the
**HTTP POST URL** copy **only the characters after `sig=`** — 43 characters, the last parameter,
to end of line — and paste after the `=` already present.

**Do not replace the line.** A whole URL pasted after `&sig=` yields two `sig=` parameters; the
line looks filled and does not authenticate.

> A second template exists at `docs/folio-Master-Flows-and-Endpoints/deployment/rotation/values.template.txt` with bare key names
> and empty values. It is usable — `setup` accepts both key forms — but requires 26
> complete URLs instead of 26 signatures. **Use `values:template`.** If a copy of the
> rotation worksheet is in circulation, check its header: the current file states `0 keys need a
> NEW url`. Any other count means the copy predates the rotation and must not be used.

### 1.3 Verify, then write

```bash
npm run check:values -- ~/dgo-values.txt
```

Prints no URL, host or signature — only shapes. **Expected:**
`✅ 26 value(s), all with a complete 43-character signature.`

**43 is exact.** A signature is base64url of an HMAC-SHA256: 32 bytes, 43 characters unpadded.

| Message | Cause | Action |
|---|---|---|
| `signature is blank` | not filled | fill that key |
| `sig is N characters`, N < 43 | truncated on copy | recopy that key |
| `sig is N characters`, N > 43 | extra text pasted | recopy that key |
| `no sig= parameter` | line overwritten | regenerate template, redo that key |
| `NOT A URL` | smart quote, space around `=`, or wrapped line | retype that line |

Only when it reports 26 of 26:

```bash
npm run setup -- --values ~/dgo-values.txt --force
npm run check:config
npm run check:config:portal
npm run commission
```

`--force` is required; `setup` will not overwrite an existing config without it.

**Pass:** `commission` no longer reports the two configuration blockers.
**Then:** delete `~/dgo-values.txt`. It holds 26 live credentials.

---

## WP-2 — Investigate: the GOV-09 producer, and the GOV-11 provisioning

**Blocks:** WP-4 (2.1–2.4 only; 2.5 blocks nothing).
**This is an investigation, not a change. Make no modification in this package** — the one
exception is 2.3's instruction to disable an identified producer, which is named there explicitly.

Two questions are answered here because both are answered by reading the same two sites with the
same browser session, and neither can be answered from the repository. They are otherwise
unrelated: **2.1–2.4** ask who wrote to the duplicate site on 2026-08-31; **2.5** asks what a pair
of out-of-band scripts put on the tenant on 2026-09-10.

### 2.1 The fact to explain

Four duplicate lists on `NITDADGO-EAAACTIVITYTRACKING` were written at **2026-08-31T01:58:48–49Z**, within one
second of each other. The list capture the estate reasons from is dated **2026-08-18**. The row
counts match the specification's seed set exactly: 6 role seeds, 1 bootstrap user, 1 pilot cohort.

**Already established, do not repeat:** every exported flow definition naming a governance list
was searched. None creates a list; none posts an item to one. The producer is not in the exported
corpus. This is consistent with GOV-06 — only 13 of 73 exported definitions match a register
workflow by name — so the corpus is known to be partial. The producer is **unidentified, not
absent**.

### 2.2 Procedure

1. Power Automate → environment `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` → **Solutions** and **My flows** → for every flow,
   **Run history** → filter to **2026-08-31**.
2. Identify every run whose start time falls between **01:58:00Z** and **01:59:30Z**.
3. For each, open the run and record: flow display name, flow GUID, trigger type, the user or
   service principal shown as the initiator, and whether its actions target
   `NITDADGO-EAAACTIVITYTRACKING`.
4. If Power Automate run history does not retain that date, use SharePoint: Site settings → Site
   collection audit log reports → **Content modifications**, scoped to
   `NITDADGO-EAAACTIVITYTRACKING`, for 2026-08-31.

### 2.3 Decision rules — all outcomes pre-decided

| Finding | Action |
|---|---|
| Exactly one flow ran in that window and writes to the duplicate site | Record it as the producer. Disable it (**Turn off**, do not delete). Proceed to WP-3 |
| More than one candidate | Record all. Disable all that write to the duplicate site. Proceed to WP-3 |
| A candidate is a **scheduled** flow | Record it and disable it. Note in the report that it will have run again since |
| A candidate is **button-triggered** | Record it, and record the initiator. Do not disable — a button flow runs only when invoked. Note the initiator in the report |
| Run history does not retain 2026-08-31, and the audit log is unavailable or empty | Record that the producer **cannot be identified from available evidence**. Proceed to WP-3. WP-4 remains blocked; see 2.4 |
| The producer is outside Power Automate (a script, a person, a third-party tool) | Record what the evidence shows. Disable or revoke as the evidence indicates. Proceed to WP-3 |

**Do not delete any flow in this package.** Disabling is reversible; deletion is not, and a
disabled flow remains available for inspection.

### 2.4 If the producer cannot be identified

WP-4's deletion stays blocked. This is a deliberate outcome, not a failure. The renamed state is
stable and safe: every deployed reference to these lists is by title, so `ZZ_RETIRED_` makes those
calls fail visibly rather than silently hitting a duplicate.

**Substitute control:** re-run the survey (WP-4.1) at **7 and 14 days** after WP-3 completes. If
no `ZZ_RETIRED_*` list has gained an item in 14 days, and WP-3 is complete, the deletion may
proceed under WP-4.4. Record both survey dates and outcomes.

### 2.5 Measure the out-of-band flow-truth provisioning — GOV-11

**Blocks nothing. Changes nothing. Do not skip it** — it is the only measurement of tenant state
this estate did not author.

**The fact to explain.** Two browser scripts were reported executed on **2026-09-10**, creating
two lists and a document library — `NITDA Flow Truth Registry`, `NITDA Flow Truth History`,
`NITDA Flow Truth Artefacts` — with 90 columns between them. They are held verbatim at
`docs/folio-Master-Flows-and-Endpoints/reference/out-of-band/`. None of the three is in any specification this estate holds, and
none is in the 2026-08-18 capture. Three properties of those scripts make the outcome
unpredictable from reading them:

- Neither pins a site. Both take whichever site the console happened to be open on, and neither
  records which. **Both candidate sites must therefore be asked.**
- Both call `createfieldasxml` with `Options: 0`. Without bit 8, `AddFieldInternalNameHint`,
  SharePoint may derive each internal name from the display name — so `RegistryKey` may be on the
  tenant as `Registry_x0020_Key`: correct in every view, invisible to every flow.
- The idempotence guard compares live `InternalName` against the SchemaXml `Name`, which is only
  sound when bit 8 is set. If it is not, every re-run re-created every column and SharePoint
  disambiguated by appending a digit.

**Procedure.** Run **§7 of [Part 5 of `RUNBOOK.md`](../../../deployment/RUNBOOK.md#part-5--governance-tenant-runbook--actions-outside-the-repository)**,
which is the only document that carries the step. It reads only, and it asks both candidate sites.
Copy the single relay line and report it verbatim. The verdicts and what to do about each are:

| Verdict | Meaning | Action |
|---|---|---|
| `absent` on every resource, both sites | The provisioning did not reach either candidate site | Record it. Nothing further |
| `PRESENT` on a resource | It exists — record the site, GUID, template and item count | Record. **Do not delete it** |
| `asked-name` | The column carries the internal name the script asked for | Record |
| `DERIVED NAME` | The column is there under a different internal name | Record the name found. This is the `Options: 0` outcome |
| `DUPLICATED` | More than one column answers to the same base name | Record. The script ran more than once |
| `REQUIRED CLEARED` | Created `Required`, not `Required` now | Record |
| `UNIQUENESS NOT ENFORCED` | The key column does not enforce uniqueness | Record |

**Do NOT re-run either out-of-band script.** A re-run is the duplication case, not a repair.

**Do NOT delete, rename or repair anything this reports.** Whether these three resources are
adopted into `http-flow-registry-spec.json` or retired in favour of the seven specified registry
lists is an **agency decision**, and §7's out-of-scope rule applies to it in full. Report and
stop.

---

## WP-3 — Correct the governance flows

**Closes:** GOV-04, GOV-05, GOV-10. **Blocks:** WP-4. **Depends on:** WP-2.

### 3.1 Targets

| # | Flow | Flow GUID | Corrected definition |
|---|---|---|---|
| 02 | 02 - GOV - Register HTTP Flow Truth | `651ae389-eeed-4bf0-9799-67bd964ebe71` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/02-register-http-flow-truth.corrected.json` |
| 03 | 03 - GOV - Record HTTP Flow Execution | `0545e19a-c34a-45db-bd11-27b87a34973e` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/03-record-http-flow-execution.corrected.json` |
| 05 | 05 - GOV - Retire HTTP Flow | `493b4ab7-8f63-4fab-8121-746c2cac7f98` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/05-retire-http-flow.corrected.json` |
| 07 | 07 - GOV - Consumer HTTP Self-Registration Template | `c6a011c5-7b11-4241-82ae-a45b88ebf276` | `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/07-consumer-self-registration.corrected.json` |

Environment: `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`

### 3.2 What the corrections change

- **GOV-04** — every path reaches a `Response` before any `Terminate`. `Terminate` ends the whole
  run, so anything downstream of it is unreachable; all four flows could end without answering.
- **GOV-05** — the retirement cascade is gated by `If_Safe_To_Retire`. Both active counts are
  taken before any write; retirement is blocked with **409** when either is non-zero and proceeds
  only when both are zero or `force` is true. `Retire_Registry` sits under the gate.

### 3.3 Procedure, per flow

**This procedure has not been executed against this tenant.** It follows Power Automate's
documented export/import behaviour. Treat flow **02** as a rehearsal: complete it end to
end, verify it, and only then proceed to the others. If it does not behave as described, stop and
report under §9.

1. Power Automate → the flow → **⋯** → **Export** → **Package (.zip)**. **Retain this file. It is
   the only rollback.** Name it `BEFORE-<flow GUID>.zip`.
2. Unzip. The definition is at `Microsoft.Flow/flows/<flow GUID>/definition.json`.
3. In that file, replace the value of the `definition` key with the `definition` object from the
   corrected file. Change nothing else.
4. Re-zip **the contents** of the unzipped folder, not the folder itself.
5. Power Automate → **Import** → upload → choose **Update** the existing flow. **Not** Create as
   new.
6. Open the flow and confirm it saves without validation error.

**Rollback:** Import the `BEFORE-` package, choosing Update.

### 3.4 Validate flow 05 — all five paths

Send each request to the flow's trigger URL. Record status and body for each.

| Path | Request | Required result |
|---|---|---|
| Malformed | body omitting `flowId` | **400**, no list writes |
| Not found | `flowId` with no registry row | **404**, no list writes |
| Blocked | a flow with active consumers or dependencies | **409**, **nothing retired** |
| Guarded | a flow with neither | **200**, retired |
| Forced | active consumers **and** `force: true` | **200**, retired, forced retirement recorded with both counts |

**After the Blocked case, confirm the consumers and dependencies are still active.** The original
defect retired them, which erased the evidence that any were active. If they are not still active,
the correction did not apply — roll back and report.

**Pass condition for WP-3.4: all five rows match.** Any deviation — stop, roll back that flow,
report.

### 3.5 GOV-10 — the repair flow

**Flow:** Repair the DGO_* governance lists (retired 2026-10-05: turn it off) · `bc095fa2-28a4-4312-9076-87caac5ca116` · button-triggered.

Verified from its definition: every action carries
`dataset = https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING` — the site being retired — and addresses
every list by `getbytitle(...)`. It creates and indexes columns, and **deletes any column its
`Filter_Strays` step does not recognise**. Its SchemaXml payload carries `FlowUrl` and `ScopeId`
and does not carry `EndpointRedacted` or `EndpointFingerprint`.

**Consequence:** run against the authoritative site, it deletes `EndpointRedacted` and
`EndpointFingerprint` as strays and recreates `FlowUrl` and `ScopeId`, undoing GOV-03 and GOV-08,
and reports success.

**Required action, in this order:**

1. **Turn the flow off now**, before any other WP-3 work.
2. Correct it: repoint `dataset` to `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`; replace every
   `getbytitle('<title>')` with `lists(guid'<GUID>')` using §10; regenerate its `varLists` payload
   from `docs/reference/sharepoint-provisioning-spec.json` so the column set it enforces matches
   the corrected specification.
3. Do **not** turn it back on until WP-5 completes.

**If correcting it is not possible within this engagement:** leave it off, and record that under
§9. Off is a safe state. On and uncorrected is not.

---

## WP-4 — Delete the duplicate lists

**Closes:** GOV-02. **Depends on:** WP-2 and WP-3 both complete.

**Precondition, mandatory:** WP-3 is complete, and either WP-2 identified and disabled the
producer, or WP-2.4's 14-day substitute control has been satisfied and recorded.

**Site: `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING`** — the duplicate site. The script refuses to run
on the authoritative site.

**Script:** `scripts/retire-duplicate-governance-lists.browser.js`. MODE-driven. `delete` cannot
act on a list `rename` has not renamed.

### 4.1 Re-survey

Paste with `MODE = 'survey'`.

**Expected:** 17 rows, every `liveTitle` beginning `ZZ_RETIRED_`.

| Result | Action |
|---|---|
| All 17 renamed, item counts unchanged from §4 | Continue |
| Any item count **higher** than §4 | **Stop.** Something is still writing. Return to WP-2 |
| Any list missing | Record; it was deleted by another party. Continue |

### 4.2 Confirm nothing unique would be lost

Run **§3.2b of [Part 5 of `RUNBOOK.md`](../../../deployment/RUNBOOK.md#part-5--governance-tenant-runbook--actions-outside-the-repository)**, which is the
only document that carries the step. It reads only, on both sites.

| Verdict | Action |
|---|---|
| No row exists only in a duplicate | Continue to 4.3 |
| `ROWS EXIST ONLY HERE` | **Stop.** Those rows are the only copy. Report under §9 with the row keys |

### 4.3 Re-export

Paste with `MODE = 'export'`. **Expected:** 17 exported, 0 failed.
Retain all 17 JSON files. The earlier export is superseded by this one.

### 4.4 Delete

Set `MODE = 'delete'` **and** `I_HAVE_THE_EXPORT = true`. Paste.

**Expected:** 17 deleted, 0 kept, 0 failed.

| Result | Action |
|---|---|
| `REFUSED — NOT RENAMED` | That list was restored. Re-run `rename`, then delete |
| `DELETE FAILED` | Record the message. Do not retry more than once |
| Any count other than 17 deleted | Record and report; do not force |

### 4.5 Confirm

Re-paste with `MODE = 'survey'`. **Expected:** every row `ALREADY GONE`.

---

## WP-5 — Provision the HTTP flow registry lists

**Depends on:** WP-4. **Site:** `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`

**Script:** `scripts/provision-flow-registry-lists.browser.js`, dry-run by default.

### 5.1 What it creates

| List | Columns | Unique key |
|---|---|---|
| `DGO_HTTPFlowRegistry` | 36 | `RegistryKey` |
| `DGO_HTTPFlowContractVersions` | 13 | `ContractKey` |
| `DGO_HTTPFlowExecutionLedger` | 15 | `ExecutionKey` |
| `DGO_HTTPFlowDependencies` | 9 | `DependencyKey` |
| `DGO_HTTPFlowRegistryExceptions` | 12 | `ExceptionKey` |
| `DGO_HTTPFlowRegistryConfiguration` | 6 | `ConfigKey` |
| `DGO_HTTPFlowConsumerRegistry` | 11 | `ConsumerKey` |

**Nothing is deferred.** The scope is every list the corrected flows read or write, plus the
configuration list they read their parameters from. **Do not add to it** — a provisioner that
creates more than the flows need is how a deferral quietly becomes a deployment.

### 5.2 Procedure

1. Paste as-is. **Expected:** 7 lists and 102 columns all `WOULD CREATE`.
2. Set `DRY_RUN = false`. Paste. **Expected:** 7 lists created, 102 columns created,
   42 indexed, 0 failed.
3. Paste again unmodified. **Expected:** every row `present`, 0 created. **This third run is the
   pass condition.** An apply reporting work on a second pass did not do what it claimed.
4. **Record all 7 list GUIDs the script prints.** They are required by §8.

| Result | Action |
|---|---|
| A list already exists | Expected if re-running. The script uses it and creates nothing |
| `RESERVED NAME` on any column | **Stop.** Report the column name under §9 |
| Third run creates anything | **Stop.** Report under §9 |

---

## WP-6 — Adopt the FlowId / WorkflowId join

**Closes:** GOV-06. **Depends on:** WP-5.

The exported definitions are identified by a 36-character Power Automate flow GUID; the register
by a 32-hex Logic Apps workflow id. Zero exported definitions carry an id the register knows.

For each HTTP-triggered flow in `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1`, record one row in
`DGO_HTTPFlowRegistry`:

| Field | Value | Source |
|---|---|---|
| `FlowId` | the 36-character flow GUID | the flow's URL in Power Automate |
| `WorkflowId` | the 32-hex Logic Apps workflow id | the trigger URL, between `/workflows/` and `/triggers/` |
| `EnvironmentId` | `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` | fixed |
| `RegistryKey` | — | **do not supply**; flow 02 computes it |

**Do not paste a trigger URL into the list.** Read the workflow id from it and record only that.
Recording both ids against one row is what makes the two corpora joinable.

---

## WP-7 — Remaining tenant-execution items

The 1 items of authority `TENANT_EXECUTION`. `CFG-1` and `CFG-2` are closed by
WP-1. Each remaining item names its closing condition in
`docs/deployment/closure-disposition.json` and its steps in `docs/deployment/PLAN.md`.

| Item | Title |
|---|---|
| ITEM-93 | The e-mail template revision of 2026-10-21 is in the tenant's flows and the hosts |

**Rule:** execute an item only when its closing condition is met by evidence you have produced.
Record the evidence. An item performed but not observed is `APPLIED_UNVERIFIED`, not closed.

---

## 8. Reporting

Produce one report. For each work package:

1. **Package and outcome** — one of `COMPLETE`, `PARTIAL`, `BLOCKED`, `NOT ATTEMPTED`.
2. **Commands run**, verbatim, in order.
3. **Console output**, verbatim, with **every `sig=` value replaced by `sig=<redacted>`**.
4. **Deviations** — anything not matching the Expected line in this brief, quoted exactly.
5. **Artefacts produced** — file names of exports and `BEFORE-` packages, held at the location
   given in §0.5.

Additionally record:

- The commit hash from WP-0.
- All 7 list GUIDs from WP-5.
- The producer determination from WP-2, including "cannot be identified from available evidence"
  where that is the outcome.
- The WP-2.5 relay line, verbatim — including the case where nothing was found, which is a
  result and not an absence of one.
- The state of each of the 0 out-of-scope items, unchanged.

**Redaction is mandatory, not advisory.** A report containing a live signature is a credential
disclosure.

---

## 9. Escalation

Stop and escalate — do not work around — on any of:

| Condition | Why |
|---|---|
| Any access in §2 is unavailable | Partial execution produces an untrustworthy report |
| WP-0 `npm run test:node` exits non-zero | The repository is not in a known state |
| WP-0 column verification reports MISSING, RESERVED NAME or UNREADABLE | §4 is wrong; later packages depend on it |
| WP-3.3 rehearsal does not behave as described | The procedure is unexecuted against this tenant |
| WP-3.4 any path deviates | The correction did not apply as intended |
| WP-4.1 any item count increased | A producer is still active |
| WP-4.2 reports rows only in a duplicate | Deletion would destroy the only copy |
| WP-5 third run creates anything | The apply did not do what it reported |
| Any operation returns 403 | Permission, not procedure. §2 access is insufficient |
| Anything requires a decision on the 0 out-of-scope items | Not the agent's to make |

**Escalate to the recipient named in §0.4.** Content: the condition, the exact output, the package
and step, and what was done immediately before. Do not attempt a remedy not written in this brief.

**If §0.4 is unfilled, do not start the engagement.** An escalation with no recipient is a stop
with no resumption.

---

## 10. Reference — list GUIDs

### 10.1 Authoritative — never delete, never rename

Site: `https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE`

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

### 10.2 Duplicates — currently renamed, deletion gated by WP-4

Site: `https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING`

| Current title | GUID | Superseded by |
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

### 10.3 Scripts

All are browser-console scripts. No PowerShell, no installation.

| Script | Package | Writes |
|---|---|---|
| `verify-governance-columns.browser.js` | WP-0 | no |
| `compare-duplicate-governance-lists.browser.js` | WP-4.2 | no |
| `retire-duplicate-governance-lists.browser.js` | WP-4 | yes — MODE-driven |
| `provision-flow-registry-lists.browser.js` | WP-5 | yes — dry-run default |
| `provision-governance-lists.browser.js` | re-verification | yes — dry-run default |
| `dump-governance-columns.browser.js` | diagnosis | no |
| `inspect-governance-strays.browser.js` | diagnosis | no |

---

## 11. Known limits of this brief

Stated so they are not discovered as surprises.

1. **The WP-3.3 export/import procedure has not been executed against this tenant.** It follows
   documented behaviour. WP-3.3 requires the first flow be treated as a rehearsal.
2. **The GOV-09 producer is unidentified.** WP-2 gives the procedure and pre-decides every
   outcome, including the outcome where it cannot be found.
3. **The 2026-08-18 list capture is older than the tenant.** WP-0 and WP-4.1 re-verify against the
   live tenant before anything is deleted.
4. **0 open items are not executable by any agent.** They require a documented
   agency risk acceptance.
5. **This brief does not authorise schema changes beyond those specified.** Any additional column,
   list or flow change is out of scope, whatever its apparent merit.
