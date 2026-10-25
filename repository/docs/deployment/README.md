# `deployment/` — index

Three documents describe this estate, and only three. They replaced thirty-six on
2026-09-24, several of which described the same thing in different words and a few of
which described something that had since changed.

- **[`RUNBOOK.md`](./RUNBOOK.md)** — **how to do it.** The only document in this
  repository that carries a commissioning step. Five parts: the cutover in front of you,
  then the install route and estate reference, portal commissioning, notifications, and
  the governance estate. Built by `scripts/build-runbook.mjs` from
  `scripts/runbook-parts/`; `npm run test:runbook` fails on drift.
- **[`PLAN.md`](./PLAN.md)** — **what is left to do.** One entry per open item, with its
  status, who can close it, the steps, and the condition that closes it. Generated from
  [`PRODUCTION_READINESS_REGISTER.json`](./PRODUCTION_READINESS_REGISTER.json);
  `npm run test:plan` fails on drift.
- **[`../PLATFORM.md`](../PLATFORM.md)** — **what the estate IS.** Surfaces, how a request
  travels, identity, the wired contract keys, what it stores. Carries no commands.
  `npm run test:platform` fails on drift.

Beside them, in this directory:

- **[`LOCAL-DEV.md`](./LOCAL-DEV.md)** — `npm run dev` starts one Node process that serves
  the internal platform, the document portal and a stand-in for every endpoint they call.
  It authenticates nobody, binds loopback only and refuses to start under
  `NODE_ENV=production`. Development tooling, not a commissioning step.
- **[`NOTIFICATION_MATRIX.md`](../folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md)** — every notification obligation
  the two platforms carry, measured against what the flow estate actually sends. A record
  of the gap, not a step.
- **[`FLOW_PACKAGE_PROVENANCE.md`](../folio-Master-Flows-and-Endpoints/deployment/FLOW_PACKAGE_PROVENANCE.md)** — where each flow
  package in `folio-Master-Flows-and-Endpoints/surfaces/internal/designer-paste/` came from and what it was built against.

Three registers, read by the generators rather than by people:

| File | What it holds | Held true by |
|---|---|---|
| [`PRODUCTION_READINESS_REGISTER.json`](./PRODUCTION_READINESS_REGISTER.json) | Every item, open and closed, with owner and resolution criteria | `npm run test:readiness` |
| [`closure-disposition.json`](./closure-disposition.json) | The same open items grouped by the authority that can close them — none is closable from this repository | `npm run test:disposition` |
| [`OUTSTANDING_SOURCES.json`](./OUTSTANDING_SOURCES.json) | Every place outstanding work is recorded, declared. The readiness register is one of five | `npm run test:outstanding` |
| [`outstanding-rollup.json`](./outstanding-rollup.json) | Those five sources totalled — **the only number that covers the whole estate.** `PLAN.md`'s count is the register's alone | `npm run test:outstanding` |

## The subdirectories

| | What is in it |
|---|---|
| [`governance/`](../folio-Master-Flows-and-Endpoints/deployment/governance/) | The governance tenant workstream: an engagement brief, the status of each finding, and the record of repository-side work already completed. None of the three carries a step — Part 5 of the runbook does |
| [`internal/`](../folio-Master-Flows-and-Endpoints/deployment/internal/) | The internal platform's flow packages, console-apply snippets and tenant evidence |
| [`folio-Master-Flows-and-Endpoints/packages/`](../folio-Master-Flows-and-Endpoints/packages/) | The deployed flow definitions, the trigger-URL harvester, and the OTP fresh-flow cutover record |
| [`sharepoint/`](../folio-Master-Flows-and-Endpoints/deployment/sharepoint/) | The SharePoint estate: column provisioning, the remediation workstream and its worksheets, decisions and open items |
| [`live-operations-console/`](../folio-Master-Flows-and-Endpoints/deployment/live-operations-console/) | What live operation looks like for `document-portal/` on the current baseline — which endpoints are wired and what each does and does not enforce |
| [`notification-instrument/`](../folio-Master-Flows-and-Endpoints/deployment/notification-instrument/), [`rotation/`](../folio-Master-Flows-and-Endpoints/deployment/rotation/), [`verification/`](../folio-Master-Flows-and-Endpoints/deployment/verification/) | Generated instruments and worksheets: notification probes, the credential-rotation worksheet, and endpoint verification transcripts |

## The scripts that replace a tedious part

| Script | Replaces | Time saved |
|---|---|---|
| `scripts/setup-sharepoint.ps1` | Part B — 33 columns clicked one at a time | ~1 hour |
| `scripts/provision-sharepoint-fields.ps1` | The 85 columns missing across the 12 portal lists and `DGO_AccessScopes`, clicked one at a time | ~3 hours |
| `scripts/provision-sharepoint-fields.browser.js` | The same 85 columns, with nothing to install — paste into a SharePoint devtools console | ~3 hours |
| `scripts/export-power-automate-flows.ps1` | Exporting the flow definitions the coverage gate wants, one flow at a time through the portal — no app registration, no admin role | ~1 hour |
| ~~`scripts/setup-sharepoint-portal.ps1`~~ | **Superseded.** Targets 7 `NITDA_Portal_*` list names that exist in no NITDA site — see [`sharepoint/README.md`](../folio-Master-Flows-and-Endpoints/deployment/sharepoint/README.md) | — |

Column provisioning is documented end to end in
**[`sharepoint/README.md`](../folio-Master-Flows-and-Endpoints/deployment/sharepoint/README.md)** — why the earlier attempts could not
have worked, and how to produce the sign-off evidence for the provisioning gate.

## There are no secrets to set

There is no Worker any more, so there is no secret store: the flow trigger URLs go straight
into the endpoint configuration each platform loads — written into a working tree by
`npm run setup`, and into a deliverable package by `npm run package`. Because that file is
delivered to every visitor's browser, treat every URL in it as a public bearer credential
and rotate it on a schedule. **Rotation is the only revocation there is.**
