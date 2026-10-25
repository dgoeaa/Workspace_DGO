# Governance remediation — what was done in the repository

Companion to **Part 5 of this runbook**, which carries everything that
still needs a tenant. This page carries only what is already done and verified here.

The distinction is the point. Every finding below has two halves: a repository half, which is
specification, tooling and guards, and a tenant half, which is execution. **The repository half
is complete for all six findings.**

> **Tenant execution has since started, and this page does not track it.** When this was written
> no tenant half had been executed. On 2026-09-09 Step 2 provisioned all ten lists on
> `DGO_ECM_GOVERNANCE` and was verified idempotent, Step 2.7 deleted the three disambiguated
> columns, and Steps 3a–3c surveyed, exported and renamed the seventeen duplicates. `GOV-08` is
> closed in the tenant as well as here.
>
> This page carries the repository half and is left as written. For where the tenant stands, read
> [`GOVERNANCE-STATUS.md`](./GOVERNANCE-STATUS.md) or the `tenantStatus` of each finding in
> [`governance-estate-position.json`](../../reference/governance-estate-position.json) — both
> derived from the same record, so neither can drift from it. The sentence that used to sit here,
> *"No tenant half has been executed"*, was hardcoded prose in a document whose numbers are
> otherwise all generated, and it went on asserting that for five days after it stopped being
> true.

---

## Finding by finding

| Finding | Repository half | Tenant half |
|---|---|---|
| **GOV-01** provisioning and consumption named different sites | **Done.** The specification targets `DGO_ECM_GOVERNANCE` for all ten lists, by GUID. Nothing diverges. | **Outstanding.** Runbook Step 2. |
| **GOV-02** ten lists exist 2–3× | **Root cause done.** Every governance address is a list GUID, so provisioning can no longer mint a copy. The 17 duplicates are enumerated with the instance each supersedes. | **Outstanding.** Runbook Step 3. |
| **GOV-03** `DGO_EndpointRegistry.FlowUrl` would hold a credential | Recorded, with the correct design already in the estate to copy (`EndpointRedacted` + `EndpointFingerprint`). | **Outstanding.** No signed URL has been written; keep it that way. |
| **GOV-04** no HTTP governance flow answers its caller | **Done.** Corrected definitions add 15 reachable responses across the four flows. | **Outstanding.** Runbook Step 4. |
| **GOV-05** the retirement cascades unguarded | **Done.** The cascade is gated; blocked retirements answer 409 and write nothing. | **Outstanding.** Runbook Step 5.4 validates all four paths — after Step 5 provisions the consumer registry, without which the blocked path cannot answer 409. |
| **GOV-06** the two corpora share no identifier | **Measured and guarded.** The name-based map is generated and its limits stated. | **Blocked, not merely outstanding.** Runbook Step 6.2: `WorkflowId` is in neither the registry specification nor flow 02, so there is nothing to register into. Both are repository changes. |

---

## GOV-01 — one authoritative site, addressed by GUID

`docs/reference/sharepoint-provisioning-spec.json` targeted `NITDADGO-EAAACTIVITYTRACKING`
while the internal flows addressed `DGO_UserDirectory`, `DGO_RoleCatalogue` and `DGO_AuditLog`
by GUID on `DGO_ECM_GOVERNANCE`. Seeding through the specified path would have populated lists
nothing reads, and the symptom would have been silence rather than an error.

`DGO_ECM_GOVERNANCE` is now the single authoritative site. That was the cheaper correction and
the evidenced one: the flows already address it, and the role catalogue is seeded there, so
repointing the specification is one-sided where repointing the flows would not have been.

`NITDADGO-EAAACTIVITYTRACKING` is **not** wrong in general. It legitimately hosts the
correspondence and tracking lists. Only the ten governance rows moved.

## GOV-02 — the mechanism, not just the symptom

Repointing the site alone would have left the cause in place: the next run would have
duplicated the lists onto the authoritative site instead. `getByTitle('DGO_AuditLog')` against a
site where that title exists mints `DGO_AuditLog_2` rather than failing.

Every governance address is now `lists(guid'…')`. A wrong GUID is a 404 — a failure you can
see. The portal estate reached this conclusion first; the governance path simply had not
inherited it.

`scripts/provision-governance-lists.browser.js` replaces the title-based flow path outright. It
runs from a devtools console against the session the operator is already signed into, needs no
PowerShell module and no app registration, is dry-run by default, and creates no list.

## GOV-04 — reachable responses, not merely present ones

The deployed flow 05 **has** a `Response` action. It is called `Reply`, it parses, and it never
runs: it sits six hops downstream of a scope whose every branch ends in a `Terminate`. A check
for the presence of a Response would have called that flow correct.

So every response added here sits **before** its `Terminate`, in the same branch, inheriting
that Terminate's `runAfter`, with the Terminate rewired to run after the response. Status codes
derive from each Terminate's own declared `runStatus`, so the HTTP result and the run result
cannot disagree. `Reply` is deleted — unreachable code that looks like a reply is worse than
none, because it re-teaches the mistake.

## GOV-05 — the guard, and what the test found

The gate takes both active counts before any write, and proceeds only when both are zero or
`force` is true. The blocked branch answers 409 with both counts and a remedy, then terminates
Failed. A forced retirement records the counts at the moment it happened, so a forced cascade
is not indistinguishable from a safe one afterwards.

**The test found a defect in the first version of the guard.** `Retire_Registry` is nested
inside `If_Registry_Found`, not a direct child of `Scope_Main`, so moving only the top-level
cascade actions left the single most consequential write outside the gate — a blocked
retirement would still have retired the registry row. It is lifted under the guard, and
`tests/governance-flow-corrections.test.mjs` asserts that no write of any kind precedes the
gate.

## What was deliberately not done

**The deployed definitions under `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/` were not modified.**
That directory is the record of what IS in the tenant. Overwriting it would have destroyed the
evidence that these corrections are outstanding, and made the repository claim a state the
tenant does not have. The corrected definitions live separately, and the two diverge until an
operator applies them.

---

## Files

**Created**

| Path | What it is |
|---|---|
| `docs/reference/governance-list-registry.json` | The authoritative instance per list, and the 17 to retire |
| `docs/folio-Master-Flows-and-Endpoints/registers/flow-definition-map.json` | The name-based join, with its limits stated |
| `docs/deployment/RUNBOOK.md` | Every tenant action, generated |
| `docs/folio-Master-Flows-and-Endpoints/deployment/governance/WHAT-WAS-DONE.md` | This page |
| `docs/folio-Master-Flows-and-Endpoints/surfaces/governance/*.corrected.json` | Four corrected flow definitions |
| `scripts/build-governance-list-registry.mjs` | Derives the registry from the tenant capture |
| `scripts/repoint-governance-provisioning.mjs` | Applies GOV-01 to the specification |
| `scripts/build-governance-browser-provisioner.mjs` | Bakes the spec into the browser provisioner |
| `scripts/provision-governance-lists.browser.js` | The provisioner itself |
| `scripts/patch-governance-flows.mjs` | Produces the corrected flow definitions |
| `scripts/build-governance-runbook.mjs` | Generates the runbook |
| `scripts/reconcile-flow-definitions.mjs` | Maintains the definition map |
| `tests/governance-flow-corrections.test.mjs` | 14 assertions on the corrections |
| `tests/governance-estate.test.mjs` | 12 assertions on the estate position |

**Modified**

| Path | Change |
|---|---|
| `docs/reference/sharepoint-provisioning-spec.json` | Repointed: 10 lists, 97 fields, 10 seeds, 4 action URIs, all GUID-addressed |
| `docs/folio-Master-Flows-and-Endpoints/reference/governance-estate-position.json` | Six findings, each with a repository status and a tenant status |
| `package.json` | Six generators and six guards wired into `test:node` |

---

## Guards

Each of these fails if the artefact it covers drifts from its source, **and** if the tenant is
repaired while the record still says otherwise. A record that lags a repair is as wrong as one
that lags a regression.

```
npm run test:governanceregistry      # the registry matches the tenant capture
npm run test:governancerepoint       # the spec is repointed, by GUID
npm run test:governanceprovisioner   # the browser provisioner matches the spec
npm run test:governanceflows         # the corrections are current, and hold — 14 assertions
npm run test:governancerunbook       # the runbook matches the registry and the position
npm run test:governanceestate        # the recorded position matches the live evidence
npm run test:definitionmap           # the definition map matches the corpora
```

All seven are in `npm run test:node`.
