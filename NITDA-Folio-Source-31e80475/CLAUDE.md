# Working in this repository

## One branch only

All work happens on **`claude/system-remediation-gaps-ahpmsy`**: every session, every person, every agent.

- Commit and push directly to `claude/system-remediation-gaps-ahpmsy`.
- Do not create another branch.
- Do not open a pull request.
- If your session was started on a different branch, switch before doing any work:
  `git fetch origin claude/system-remediation-gaps-ahpmsy && git checkout -B claude/system-remediation-gaps-ahpmsy origin/claude/system-remediation-gaps-ahpmsy`.
  Push to `claude/system-remediation-gaps-ahpmsy` only.

Several sessions push to this branch at the same time, so:

1. **Before starting**, pull: `git pull --rebase origin claude/system-remediation-gaps-ahpmsy`.
2. **Before pushing**, pull again the same way, re-run the checks your change touches, then
   `git push origin claude/system-remediation-gaps-ahpmsy`. If the push is rejected because the branch moved, pull with `--rebase` and push again.
3. **Never force-push**, and never rewrite history that is already on the remote.
4. **Generated files** (registers, `docs/process/`, `docs/visual/platform-data.js`, `docs/PLATFORM.md`, the connector and estate registers) are not edited by hand. If a pull conflicts in one, take either side and re-run its generator. The failing check names the command.

Every branch and pull request that existed before 2026-10-01 is already merged into this branch
(see [`docs/audits/remaining-refs-merge-2026-10-01.md`](docs/audits/remaining-refs-merge-2026-10-01.md)).
No other branch holds work that is not here.

## Closed items stay closed

The register of record is `docs/deployment/PRODUCTION_READINESS_REGISTER.json`; `npm run outstanding`
totals every declared source. Every session follows these rules:

1. **A closed item is not reopened, re-proven or re-asked for.** RESOLVED, ACCEPTED and
   DISCHARGED_UNTRACKABLE are closed. "Unverifiable here" means the evidence is held outside git
   (for example, git-ignored `config.local.js` files); it does not mean the item is open. Do not ask
   the owner to re-run a live check, re-download a file or re-supply values to close or re-close it.
2. **Reopening needs new evidence, committed.** A closed item changes status only in a register
   revision that cites a committed file or command output, dated after the closure, that contradicts
   it. Memory, inference, or "I could not find it" is not evidence.
3. **Search before saying a record is missing.** Before saying a record, file or value is absent,
   check `git ls-files`, `git log --all -- <path>`, `docs/governance/evidence-register.yaml` and the
   register's own `evidence` entries. If it exists, use it. If it really is absent, name the exact
   searches that came back empty.
4. **The owner holds these records.** The owner has the deployed `config.local.js` files, the endpoint
   values vault and tenant access. Ask for one only when an OPEN item names it as the evidence still
   needed, and ask once.
5. **Work only on open items.** Take the list from `npm run outstanding`, not from earlier chat,
   artifacts or another session's summary.

## Flow and endpoint records live in one folder

Every register, document, capture and piece of evidence about a flow or an endpoint lives in
[`docs/folio-Master-Flows-and-Endpoints/`](docs/folio-Master-Flows-and-Endpoints/README.md) (owner direction, 2026-10-03).
Platform code stays with its platform. Do not add such a record anywhere else: `npm run test:masterflows`
fails on one outside the folder, and its exceptions are listed in `tests/master-flows-folder.test.mjs` with their reasons.

## Flow packages are released, then pasted once

The owner pastes identification packages by hand, so every rebuild that changes a flow costs a paste (owner rule, 2026-10-06):

1. **Packages are frozen at a release.** `docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json`
   holds each package's fingerprint; `npm run test:idrelease` fails when a package differs from it.
2. **A new release only for a defect found in the tenant, or an owner decision that Flow Configuration cannot meet.**
   Prefer a Flow Configuration row to a package change. Changes wait and are released together:
   `npm run idrelease -- --reason "…"`. Say in the reply which packages a release changes and why.
3. **What the tenant runs is evidence, not memory.** `registers/identification-paste-ledger.json` records, by
   fingerprint, what each flow runs (an owner report, or a tenant export checked in the Folio Estate Console). "Paste"
   and "re-paste" are computed from it; never write them by hand.

## Config files are rebuilt when an address changes

The three deployed config files (Workspace `config/config.local.js`, Portal `CG/config.local.js`, the Mailer's seven
addresses) carry signed trigger URLs. `registers/config-build-ledger.json` records what the last delivered build holds,
as digests only (owner rule, 2026-10-08). It works both ways:

1. **Suggested.** After any change that can move an address (a trigger renamed or its key regenerated, a flow created,
   recreated or deleted, a contract key moved to another flow), run `npm run config:drift`. `flows:update apply` runs it
   itself. When it reports `REBUILD SUGGESTED`, tell the owner which variants changed and offer the rebuild.
2. **On request.** When the owner asks, run `npm run config:rebuild`. It writes the private files and zips outside the
   repository and updates the ledger. Commit the ledger, hand the files over privately, and delete them once deployed.

## Checks

- `npm run test:node`: the full gate. `test:governanceagentbrief` stamps the branch name, so it only
  passes when run on this branch.
- `npx playwright test`: the browser suite. In a cloud session, set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`.
- `npm run test:links`: the link check.
