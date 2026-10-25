# Remediation — no visit left

Every artifact that was here was a set of actions to paste into a live flow. **None remains.**

**Visit 4 retired 2026-10-08.** `04-intake-writeback.json` and `WORKSHEET-04.md` targeted `ECM_DOCS_INTAKE` (df7ddff1)
for the status write-back (readiness ITEM-6). That flow is absent from the tenant: the owner found no flow of that name,
and the Flow API answers 404 (`evidence/2026-10-08-closure-operations.json`, `item86_ecmDocsIntake`). Where the write-back
runs instead is ITEM-6's open decision.

### Retired 2026-10-05

Visits 0, 1, 2, 3 and 5, the writeback specification (06), the patched `Portal_Verify_Confirm`
definition and the execution guide were written for flows that are now retired: `Universal
Dynamic_Multi-Actions_Executor`, `Portal_Verify`, `Portal_Verify_Confirm`, `Portal_UBMISSION_ECM_DOCS`,
`Portal_ECM_DOCS_STATUS`, `Portal_Status_Enquiry`, the three upload flows and
`Portal_ECM_DOCS_SUPPORT`. Each endpoint now runs on one adopted flow
([`FLOW_ADOPTION.md`](../../../reference/FLOW_ADOPTION.md)). The files are recorded, with their hashes
and the last commit that holds them, in
[`registers/flow-retirement.json`](../../../registers/flow-retirement.json).

## How to execute one

1. Open the flow in Power Automate, **Edit**, then **⋯ → Peek code** to confirm the action
   names in the artifact's `path` fields still match.
2. Apply the changes. `actions` keyed by name are **substitutions** — replace that action's
   parameters. `newActionsRequired` are **additions**, each with the branch it belongs on in
   its `why`.
3. Add anything under `composeFirst` at the top of the scope; the rate-limit and reference
   actions depend on those Compose outputs.
4. Save, then re-export the flow into `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`:
   ```
   ./scripts/export-power-automate-flows.ps1 -EnvironmentName Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1 -WorkflowId <internal name>
   ./scripts/redact-signed-urls.ps1
   ```
5. Confirm the move:
   ```
   node scripts/flow-list-sweep.mjs --write
   npm run wiring
   ```

`npm run wiring` reports the operations wired and the boundary crossings left. The target is every
operation wired and no crossing left, at which point `npm run test:wiring` passes.

---

## What this does not do

**It moves no existing record.** D6 — the submissions already filed in `NITDA_Central_Registry`
stay exactly where they are.

**It does not touch the internal estate.** Every write lands on one of the twelve portal
lists — checked, not asserted.

**It does not change what a citizen already holds.** Legacy references were never persisted and
no deployed flow looks them up, so nothing that works today stops working. New references are
minted from `Portal Sequence Counters` at a width the legacy form never used, so the two
generations stay distinguishable while the migration waits.
