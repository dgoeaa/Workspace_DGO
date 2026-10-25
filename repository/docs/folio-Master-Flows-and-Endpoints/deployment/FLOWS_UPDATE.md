# Flows update: every package into its live flow, in one command

`npm run flows:update` puts each identification package into the flow it was built for, and proves it.
Use it instead of opening each flow in the designer, deleting the scope and pasting the file.

It covers every package that an identification status register lists: today the 23 packages of
[Phase 3](../packages/identification-phase3/README.md) and [Phase 4](../packages/identification-phase4/README.md), in 22 flows.
A later phase that writes `registers/identification-phase<N>-status.json` is included automatically.
The two governance packages still go through [ESTATE_APPLY.md](./ESTATE_APPLY.md).

## Run it

From the repository clone, with Node.js 18 or later:

```
npm run flows:update                  # check: reads every flow, writes nothing
npm run flows:update -- apply         # shows the plan, asks, then writes
```

1. **Check.** It prints a web address and a code. Open the address on any device, enter the code, and sign in
   with the account that owns the flows. Each package then gets one line: its status and, under it, the reason.
2. **Apply.** It checks again, shows what it will write, and asks `Write N flow(s)? [y/N]`. On `y` it saves a
   backup of those flows, then writes them one at a time and reads each one back.
3. **Check again** if you want a clean confirmation. Every written package now reads `UP_TO_DATE`.

When `FOLIO_MS_SESSION` is set (the platform suite's `./folio` sets it), the sign-in is kept in that file and
shared with the Administration Centre and the Mailer, so later runs need no code.

**Behind a proxy** (a cloud session, a corporate network): Node's built-in `fetch` ignores `HTTPS_PROXY` unless told,
and every flow then reads as "not visible to this account". Run with `NODE_USE_ENV_PROXY=1` (Node 22.21 or later), and
allow `api.flow.microsoft.com` and `login.microsoftonline.com` in the network policy. This is how release 1 was
written on 2026-10-07 ([evidence](../evidence/2026-10-07-flows-apply.json)).

| Option | What it does |
|---|---|
| `--only A,B` | Only these packages. Any part of a package's id, key, flow name, flow id or scope matches, for example `--only SINGLE_ASSIGNMENT,4dbe6dde` |
| `--yes` | Apply without asking |
| `--out DIR` | Where backups and reports go (default `./flows-update-output`, which git ignores) |
| `restore <backup.json>` | Puts back every flow in a backup that `apply` wrote, and reads each one back. With `--only`, just the flows named (any part of the flow id or name) |
| `record <report.json>` | Files a report that `check` or `apply` wrote as evidence in [`evidence/`](../evidence/), and records in the paste ledger what each flow read runs. No sign-in. See [After a run](#after-a-run-recording-it-in-the-repository) |

`check` and `apply` save their report in `--out` on every run, as `flows-check-<time>.json` or `flows-apply-<time>.json`.

## Statuses

| Status | Meaning | Your action |
|---|---|---|
| `UP_TO_DATE` | The flow already carries the package | None |
| `WILL_UPDATE` | The flow differs. The line under it says where, and which connection would change | `apply` |
| `APPLIED` | Written and read back: the stored scope hashes to the package's | Run the flow's test from the package README |
| `HELD` | The package needs something done first. The line says what | Do it, then `apply --only <its full id>` |
| `BLOCKED` | It cannot be written. The line says why | Follow the reason |
| `FAILED` | The service refused the write, or the read-back did not match and the flow was restored | Read the reason. The run stopped there |
| `CHANGED` | Someone saved the flow after the check. Nothing was written over it | Run again |
| `NOT_RUN` | The run stopped at an earlier failure | Run again once that is fixed |

`check` exits 0 only when every package it checked is `UP_TO_DATE`. `apply` exits 1 if anything `FAILED`.

## What it changes, and what it leaves

It replaces the package's own top-level scope in place and keeps that scope's place in the flow. The trigger and
every other step stay as they are, so trigger URLs do not change. It uses the same installer as every other route
(`scripts/lib/flow-install.mjs`).

Each connection reference the package uses is set to the package's connection. For Office 365 that is the registry
mailbox, `c0b9e7a5` (dgsregistry@nitda.gov.ng, ITEM-77). The check line names every such change before it is made,
and counts any steps outside the scope that use the same reference.

## What it refuses

- **A scope the flow does not have yet.** Two Phase 4 scopes are added rather than replaced:
  `Scope_AI_Caller_Gate` and `Scope_Library_Identity`. Placement is never guessed. Paste each one once in the
  designer, where its README says. From then on this command keeps it current.
- **A package that needs something first.** These are `HELD`, and are written only when named by their full id with
  `--only` (the HELD line prints it):
  - `AI_DOC_ANALYSIS`: the Flow Configuration row `OPENROUTER_API_KEY` (ITEM-75; the owner set it on 6 October 2026).
  - `Scope_References` in DGSO INCOMING AI PROCESSING: the rows `GEMINI_API_KEY` (ITEM-72).
- **A variable the flow does not declare.** The flow would not save.
- **A problem the package would add.** For example, a step that runs after one that does not exist. A problem the
  live flow already has does not count against the package.
- **A flow this account cannot see.** Share the flow with the account, or sign in as its owner.

## Why the result can be trusted

- **Nothing is written without a backup.** The backup is saved, readable only by you, before the first write. It
  holds whole flow definitions, so keep it out of git.
- **Every write is read back.** After each write the flow is read again, and two things are checked:
  - every step, its place and every variable value across the whole flow match what was sent;
  - the package's scope and connections match exactly.

  If either check fails, the flow is restored from the backup, the restore is read back, and the run stops.
- **One flow at a time, stopping at the first failure.** A refused write changes nothing. The flows after it are
  `NOT_RUN`.
- **No writing over someone's edit.** Each flow is read again just before it is written. If it was saved since the
  check, it is `CHANGED` and left alone.
- **The proof can be recomputed.** Each package line in the report carries two SHA-256 hashes: the package's
  (`packageHash`) and the live scope's (`liveHash`). Before hashing, key order, designer metadata, empty `runAfter`
  and the `inputs.authentication` that the service adds to each connector step are set aside. Equal hashes mean the
  flow carries the package. Anyone can recompute `packageHash` from the package file in the commit the report names.
- **In the paste ledger's terms too.** Each line also carries `fingerprint` (the package's, as its status register
  gives it) and `liveFingerprint` (what the flow runs), computed by `scripts/lib/package-fingerprint.mjs`, the same
  function the Folio Estate Console uses on a tenant export. The fingerprint sets aside descriptions and connection
  names, so a flow can match its package by fingerprint while its hash still differs. `emptySetVariables` names any
  Set variable step in the flow with no value, which is what a designer paste leaves (ITEM-78); `apply` writes the
  values back.
- **The report holds no flow definition, no URL and no token**, so it is safe to hand over and to commit.

## First run

No write has yet reached the tenant from outside the designer (ITEM-2). The first `apply` is that test, so make it one
flow, `IP_OTP_VERIFY` (first in RUNBOOK.md Phase 2's order): `npm run flows:update -- apply --only OTP_VERIFY__IP_OTP_VERIFY__4dbe6dde`.

- **If the service refuses the write format:** the first flow is `FAILED` with the service's own message, nothing is
  changed, and the run stops.
- **If it accepts:** its report, and a fresh export of that flow, are the evidence ITEM-2 asks for.

## After a run: recording it in the repository

A report filed in [`evidence/`](../evidence/) must be cited by the readiness register in the same commit:
`npm run test:readiness` fails otherwise. So recording is done in the clone that commits it, after the run, by
whoever maintains the register:

```
npm run flows:update -- record <path to flows-check-….json or flows-apply-….json>
npm run flows:regenerate
```

1. `record` writes `evidence/<date>-flows-<check|apply>.json` and updates `registers/identification-paste-ledger.json`.
   - A flow that runs its package records the package's fingerprint.
   - A flow that runs something else records what it runs, or `null` if the ledger held no paste of it.
   - A flow or scope that could not be read is left as it was.

   It refuses a file that is not a report, a report on another environment, and a report it has already filed.
2. `flows:regenerate` rebuilds what the ledger feeds: the Phase 3 and 4 status registers and READMEs, the agent brief
   and the Folio Estate Console.
3. Revise `docs/deployment/PRODUCTION_READINESS_REGISTER.json` to cite the evidence file, then run `npm run test:node`,
   commit and push.

Runtime: [`scripts/lib/flow-bulk-update.mjs`](../../../scripts/lib/flow-bulk-update.mjs). Command:
[`scripts/flows-update.mjs`](../../../scripts/flows-update.mjs). Tests: [`tests/flows-update.test.mjs`](../../../tests/flows-update.test.mjs),
against a simulated tenant, with an end-to-end run of the command against a local stand-in for Microsoft sign-in and
the Flow service.
