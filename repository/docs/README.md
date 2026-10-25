# `docs/` — index

Everything this repository writes down, other than the four markdown files at its
root ([`README.md`](../README.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md),
[`PLATFORM.md`](./PLATFORM.md), `LICENSE`).

Four kinds of document live here, and they are not interchangeable.

| | Kind | Read it as | Where |
|---|---|---|---|
| **Specification** | What the system must do | Binding. Change the code to match, or change this and say why | `architecture/`, `folio-Master-Flows-and-Endpoints/contracts/` |
| **Procedure** | What you must do | Binding while you are doing it | `deployment/`, `cutover/` |
| **Record** | What was true on a date | Historical. Never edit to make it agree with the present | `audits/`, `forensic/`, `handoff/` |
| **Harvest** | Raw material, kept for evidence | Untrusted. Prefer the contract over the sample | `reference/foundational/` |

## Handbook

- [`handbook/`](./handbook/README.md): **start here if you are new.** The consolidated, readable view of
  Folio: the go-live walkthrough, architecture, components, data model, processes, service contracts, and the
  developer, administrator and user guides, with troubleshooting. Written from the code, configuration and
  registers on 2026-10-10. It links to the specifications, procedures and records below rather than copying
  them, and where it and a register disagree, the register wins.

## Specifications

- [`architecture/PLATFORM_INDEPENDENCE.md`](./architecture/PLATFORM_INDEPENDENCE.md) — **read this before changing anything shared.** The seven platforms are complementary and independently deployable; they meet in the tenant and nowhere else. What is shared by conformance, what is deliberately not shared, and the `git mv` extraction test that says whether the property still holds
- [`architecture/TARGET_ARCHITECTURE.md`](./architecture/TARGET_ARCHITECTURE.md) — where the platform is going
- [`architecture/AUTHENTICATION_CONTRACT.md`](./architecture/AUTHENTICATION_CONTRACT.md) — the activation spec, and the seven server-side obligations that belong to the Power Automate flows. This is the open half of **G-04**
- [`architecture/AUTH_RBAC_GUIDE.md`](./architecture/AUTH_RBAC_GUIDE.md) — the consolidated auth/RBAC guide for both apps: what's configured where, the role/permission/route matrix, identity resolution in both postures, the document-portal's separate (role-free) verification model, and the combined enablement runbook
- [`architecture/ADMIN_MONITORING_MANAGEMENT_SPEC.md`](./architecture/ADMIN_MONITORING_MANAGEMENT_SPEC.md) — **the DGO Control Console.** Requirements and specification for a *standalone* administrative, monitoring and management application — a platform of the system in its own right, able to administer any one of the estate's platforms or all of them together: the internal runtime, the document portal, the flow and data estate, and the release toolchain. Sixteen components with their features, functions and **126 executable actions**; a target model with four deployment topologies; 14 dashboards; 48 metrics given as formulas; 43 alert rules with escalation chains; a telemetry data model; and eight backend obligations. States the boundary with the in-runtime Admin Suite rather than competing with it, and measures the present rather than describing it — monitoring that is device-local, 54 monitoring records carrying no threshold or alerting, and 16 of 39 notification obligations provisioned
- [`reference/README.md`](./reference/README.md) — how `folio-Master-Flows-and-Endpoints/contracts/` (contract of record) relates to `foundational/` (raw harvest). Read this before citing a file from either
- [`folio-Master-Flows-and-Endpoints/contracts/INTERNAL_PLATFORM_FLOWS.md`](./folio-Master-Flows-and-Endpoints/contracts/INTERNAL_PLATFORM_FLOWS.md) — every internal-platform endpoint's request/response wire shape, traced to the exact client call site, including every operation variant `DYNAMIC_ACTIONS` and `SUBSIDIARY_ACTIONS` carry and where the two disagree on which field is the discriminator
- [`folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.md`](./folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.md) — the sole reference for all six `document-portal/` flows: trigger schema, exact request payload, every response variant, and every branch the client code takes on each — including which returned fields (`SUPPORT`'s `caseRef`, `SUBMISSION`'s `verification` retry path) the shipping UI never actually reads. **The `.md` is the authoritative one, and the only one.** Two companion forms carry the same material from an earlier generation and both say so on their face: [`DOCUMENT_PORTAL_FLOWS.json`](./folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.json) (machine-readable, `authority: "superseded"`) and [`DOCUMENT_PORTAL_FLOWS.html`](./folio-Master-Flows-and-Endpoints/contracts/DOCUMENT_PORTAL_FLOWS.html) (browsable, printable, banner reads *Superseded, 2026-08-15*). They were generated 2026-08-09 against live-probe evidence for a different flow estate and were not regenerated when the `.md` was rewritten against the six real flow definitions. Read them as a record of what was believed then — **the `.json`'s own note says it "should not be relied on"** — and note that the note cites `docs/folio-Master-Flows-and-Endpoints/packages/codeview/`, a path that does not exist: those six definitions are in [`folio-Master-Flows-and-Endpoints/packages/`](./folio-Master-Flows-and-Endpoints/packages/) directly
- [`folio-Master-Flows-and-Endpoints/provisioning/`](./folio-Master-Flows-and-Endpoints/provisioning/README.md) — the provisioned state: what every flow and endpoint on both platforms is **actually configured with**, read out of the packages and printed as they carry it. Connections, trigger method and authentication posture, full request schema, every response status code, header and body, every variable and its initial value, error-handling edges, and the configured inputs of all 4,187 actions, verbatim. Start at [`ENDPOINT_REGISTER.md`](./folio-Master-Flows-and-Endpoints/provisioning/ENDPOINT_REGISTER.md) for the endpoints. Generated — `npm run provisioning` — and held to the packages by `tests/provisioning-reference.test.mjs`

## Procedures

Three documents describe this estate, and only three. They replaced thirty-six on 2026-09-24,
several of which described the same thing in different words and a few of which described
something that had since changed.

- [`PLATFORM.md`](./PLATFORM.md) — **what the estate IS.** The surfaces, how a request travels,
  identity, the wired contract keys, what it stores, and how the documentation is held true.
  Carries no commands. Generated from the registers; `npm run test:platform` fails on drift.
- [`deployment/PLAN.md`](./deployment/PLAN.md) — **what is left to do.** One entry per open item
  with its status, who acts, the steps, and the condition that closes it. Generated from the
  production readiness register; `npm run test:plan` fails on drift.
- [`deployment/RUNBOOK.md`](./deployment/RUNBOOK.md) — **how to do it.** Five parts: the cutover
  in front of you, then the install route and estate reference, portal commissioning,
  notifications, and the governance estate. `npm run test:runbook` fails on drift.

Beside them, two that are neither specification nor plan:

- [`deployment/LOCAL-DEV.md`](./deployment/LOCAL-DEV.md) — `npm run dev`: a local server standing
  in for the flow estate, so both apps can be exercised without a tenant. Development tooling,
  not a commissioning step.
- [`cutover/`](./cutover/) — migration sequencing and
  [`ARCHIVE_DISPOSITION.md`](./cutover/ARCHIVE_DISPOSITION.md).


## Records

- [`audits/OPERATIONAL_READINESS_AUDIT.md`](governance/RETIRED_RECORDS.md) — **the current audit.** Both platforms, every branch, and what stands between here and live operationalization
- [`90-records/`](./90-records/PROJECT_CLOSURE.md) — the closure instruments: [`PROJECT_CLOSURE.md`](./90-records/PROJECT_CLOSURE.md) (what was built, what is open, what was deliberately not done), [`HANDOVER_CERTIFICATE.md`](./90-records/HANDOVER_CERTIFICATE.md) and [`ACCEPTANCE_SIGNOFF.md`](./90-records/ACCEPTANCE_SIGNOFF.md). **All three are unsigned forms, not records of events that happened** — every field a fact this repository does not hold is left blank rather than guessed. Once signed they become records and are never edited
- [`proposals/`](governance/RETIRED_RECORDS.md) — two proposals, not yet decided: [`DOCUMENTATION_SET.md`](governance/RETIRED_RECORDS.md) (what the documentation should be) and [`SYSTEM_FILE_TREE.md`](governance/RETIRED_RECORDS.md) (where it should live)
- [`STATUS_REPORT.md`](./STATUS_REPORT.md) — position and finding register, written at a date
- [`audits/INDEX.md`](governance/RETIRED_RECORDS.md) — the audit documents, their supersession chain, and the two findings that remain open
- [`handoff/INDEX.md`](governance/RETIRED_RECORDS.md) — the mobile shell workstream R-1 → R-4, its ten briefs, reviews and adjudications. Written against a `main` lineage whose commits are **not in this history**; the five files it produced were ported in on 2026-09-08 and the ratchet it measured against runs as `npm run test:css`
- [`forensic/dd2e909/`](./forensic/) — a forensic snapshot of one commit. **Deliberately not rewritten** by later reorganisations; correcting its paths would falsify it
- [`visual/`](./visual/README.md) — generated architecture and status console, drift-tested by `npm run test:visual`. Where it and a written document disagree, it is right
- [`folio-Master-Flows-and-Endpoints/contracts/ALIGNMENT_REPORT.json`](./folio-Master-Flows-and-Endpoints/contracts/ALIGNMENT_REPORT.json) — machine-readable verdict, per endpoint, on whether the 2026-08-08 live-tenant probe transcripts agree with `INTERNAL_PLATFORM_FLOWS.md`. A record of that probe run, not a contract — re-probing supersedes it, it does not get hand-edited to match a later run
- [`folio-Master-Flows-and-Endpoints/contracts/flow-alignment-console.html`](./folio-Master-Flows-and-Endpoints/contracts/flow-alignment-console.html) — the same data, browsable: filter by app/verdict, search, and compare the documented contract against the probed response side by side. Self-contained, no build step. **A report dated 2026-08-09, not a live check** — it scores against two probe transcripts captured 2026-08-08 and reads nothing now. Its 20 internal-platform rows still stand, against `INTERNAL_PLATFORM_FLOWS.md`; its 6 portal rows were scored against a contract since rewritten, and the page says which is which

## Harvest

- [`reference/foundational/`](./reference/foundational/) — the estate as harvested: flow definitions, trigger schemas, list and canvas exports, one response sample per flow as a shape exemplar. The multi-megabyte run records were removed; [`reference/foundational/flows/run-records/README.md`](./reference/foundational/flows/run-records/README.md) records what went and why
- [`policies/universal-filename-policy/`](./policies/universal-filename-policy/) — the policy deliverables. The policy itself is enforced by `tests/filename-policy.test.mjs`

## Two constraints on anything you add here

1. **Paths are length-limited.** `tests/package-portability.test.mjs` enforces the shortened, Windows-safe paths. If a path is too long, shorten it — do not restore the long form.
2. **No new signed URLs.** `tests/check-secrets.mjs` holds the count of files carrying live Power Automate SAS signatures at the baseline in `tests/secrets-baseline.txt`, which may only shrink. Adding one fails the build.
