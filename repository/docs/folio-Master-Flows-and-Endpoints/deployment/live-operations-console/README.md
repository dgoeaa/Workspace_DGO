# The live-operations console is not here

**Status: a record. Read these files; do not edit them.** The console this directory documents was
never committed to this repository and cannot be rebuilt from it. Its fourteen operations are all
still outstanding work, and every one of them is tracked somewhere a command can see —
[`coverage.json`](./coverage.json) says where.

If you came here looking for something to run, there is nothing here to run.

---

## What happened

`SHA256_MANIFEST.json` in this directory declares **six** files. Four are present and every one still
matches its recorded digest. Two are not:

| File | |
|---|---|
| `ACTIVATION_AND_VALIDATION.md` | present, digest matches |
| `EMBEDDED_DATA_MODEL.json` | present, digest matches |
| `EXPLICIT_EXECUTION_SPECIFICATION.md` | present, digest matches |
| `IMPLEMENTATION_PARAMETER_REGISTER.md` | present, digest matches |
| `README.md` | **lost.** The file you are reading is a new one written on 2026-09-16, under the same name and in the same place. It is not the delivered file and its bytes will never match the manifest's digest |
| `index.html` | **lost — and `index.html` was the console** |

`ACTIVATION_AND_VALIDATION.md` opens *"Extract the ZIP completely. Open `index.html`."* There is no
ZIP in this repository and no `index.html` anywhere in the tree.

## Why it is not being rebuilt

The console carried its own operational model inside itself — `ACTIVATION_AND_VALIDATION.md` says
so: *"The console can also run when only `index.html` is copied because the operational model is
embedded."* `EMBEDDED_DATA_MODEL.json` and `IMPLEMENTATION_PARAMETER_REGISTER.md` describe what it
held and what it rendered. Neither of them is the renderer.

So rebuilding would mean writing a **new** console to the specification of an old one, and
reproducing a dashboard whose figures — *"Actions 14; Closed 0; Critical open 10; Missing parameters
18; RN accepted 0/38"* — were true on its own date and are not a claim anyone should make today.

And it would be a fifth view of a workstream three instruments already describe. Losing the view
lost no obligation. The decision, taken 2026-09-16: **superseded, not rebuilt.**

## Where the fourteen operations went

All of them are the notification remediation workstream. `coverage.json` maps each one to the
register entry that counts it and the runbook section that carries its steps:

| | Where it is now |
|---|---|
| `OP-001` … `OP-004` | `ITEM-67`, `ITEM-70`, `ITEM-71` · runbook **§1 Baseline and connections** |
| `OP-005` … `OP-007` | `ITEM-50`, `ITEM-66` · runbook **§2 Release 0 containment — do this first** |
| `OP-008` … `OP-011` | `ITEM-25`, `ITEM-48`, `ITEM-51`, `ITEM-70` · runbook **§3 Event carriers and the scheduled processor** |
| `OP-012` … `OP-014` | `ITEM-66`, `ITEM-68`, `ITEM-71` · runbook **§4 Cutover, rollback and hypercare** |

The items are in
[`../../../deployment/PRODUCTION_READINESS_REGISTER.json`](../../../deployment/PRODUCTION_READINESS_REGISTER.json); `coverage.json` has
the exact mapping. Until 2026-10-02 these pointed at the notification pending-work register (`P-…`)
and the 2026-09-09 notification assessment (`F-…`), both since folded into the readiness register.
The steps are in **Part 4 of [`../../../deployment/RUNBOOK.md`](../../../deployment/RUNBOOK.md)**.

**Carried elsewhere is not closed.** Every one of the fourteen is still work somebody has to do in
the tenant. It is counted once, as a `P-` or `F-` item — which is why
[`../../../deployment/OUTSTANDING_SOURCES.json`](../../../deployment/OUTSTANDING_SOURCES.json) leaves the specification uncounted.
Counting the fourteen again beside the P-items would report the same tenant work twice.

## What holds this true

`npm run test:node` runs `tests/live-operations-coverage.test.mjs`, which fails if an operation in
the specification is in no mapping, if the mapping cites a register entry or a runbook section that
does not exist, if one of the four surviving files stops matching its digest, or if this page stops
saying what happened. It also fails if `index.html` ever reappears — at which point this page is
wrong and the console should be gated instead of superseded.
